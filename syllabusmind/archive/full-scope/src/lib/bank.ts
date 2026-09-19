/**
 * Pure prompt + validation logic for graph extraction and question banks.
 * No browser APIs here, so both the app (runtime uploads) and scripts/build-syllabi.ts (bundled
 * syllabi) share one source of truth. The model only proposes; everything is validated here.
 */
import type { ConceptEdge, ConceptGraph, ConceptNode, Question, QuestionKind } from '../engine/types';
import { sanitizeEdges } from '../engine/graph';

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/* ------------------------------------------------------------------ graph */

/** Drop practicals, suggested activities, evaluation methods and reference lists: they are not concepts to quiz on. */
export function cleanSyllabus(t: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of t.replace(/\r/g, '').split('\n')) {
    if (/^\s*(UNIT|MODULE)\b/i.test(line)) skipping = false;
    else if (/^\s*(PRACTICALS?|LIST OF (EXPERIMENTS|PRACTICALS)|SUGGESTED (ACTIVITIES|EVALUATION)|TEXT ?BOOKS?|REFERENCES?|COURSE OUTCOMES?|CO-PO)\b/i.test(line)) skipping = true;
    if (!skipping) out.push(line.replace(/[ \t]+/g, ' ').trim());
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 14000);
}

export const GRAPH_PROMPT = (text: string) => `You are a curriculum analyst. Read the syllabus below (it may be messy: OCR noise, page headers, exam schemes, book lists, lab lists) and turn it into a concept graph a student can be diagnosed on.
Rules:
- Ignore administrative text (credits, marks, references, outcome tables, page numbers). Keep only teachable concepts.
- Split the content into 10-18 atomic topics. Each topic is one concept a student could be quizzed on, named in 2-5 words. Never use a whole unit as one topic and never make one topic per tiny bullet. Merge near-duplicates.
- "unit" is the syllabus unit or module the topic belongs to; keep the unit names short (2-5 words).
- "description" is one short sentence saying what the topic covers.
- Add a prerequisite edge from A to B only when a student genuinely needs A to understand B. Prefer a real dependency structure with branches and joins over a single straight chain, and include cross-unit edges where they exist. The graph must be acyclic and every topic must connect to at least one other topic. weight (0.1-1) is how strongly B depends on A.
Return JSON {"title":string,"nodes":[{"id":string,"label":string,"unit":string,"description":string}],"edges":[{"from":prerequisiteId,"to":dependentId,"weight":number}]}.

SYLLABUS:
${cleanSyllabus(text)}`;

export function validateGraph(x: unknown): ConceptGraph | null {
  if (!isObj(x) || !Array.isArray(x.nodes) || !Array.isArray(x.edges)) return null;
  const nodes: ConceptNode[] = [];
  const ids = new Set<string>();
  for (const n of x.nodes) {
    if (!isObj(n) || typeof n.label !== 'string') return null;
    const id = typeof n.id === 'string' && n.id ? slug(n.id) : slug(n.label);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    nodes.push({ id, label: n.label.trim(), unit: typeof n.unit === 'string' && n.unit.trim() ? n.unit.trim() : 'General', description: typeof n.description === 'string' ? n.description : undefined });
  }
  if (nodes.length < 3) return null;
  const edges: ConceptEdge[] = [];
  for (const e of x.edges) {
    if (!isObj(e) || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    const w = typeof e.weight === 'number' ? Math.min(1, Math.max(0.1, e.weight)) : 0.6;
    edges.push({ from: slug(e.from), to: slug(e.to), weight: Math.round(w * 10) / 10 });
  }
  const g: ConceptGraph = { id: `g-${Date.now().toString(36)}`, title: typeof x.title === 'string' ? x.title : 'Syllabus', source: 'llm', nodes: nodes.slice(0, 24), edges };
  g.edges = sanitizeEdges(g);
  return repairGraph(g);
}

/** Models sometimes leave a topic with no links. Attach it to the previous topic in its unit so nothing floats alone. */
export function repairGraph(g: ConceptGraph): ConceptGraph {
  const top = g.nodes.filter((n) => !n.parentId);
  const edges = [...g.edges];
  top.forEach((n, i) => {
    if (edges.some((e) => e.from === n.id || e.to === n.id)) return;
    const prev = top.slice(0, i).reverse().find((m) => m.unit === n.unit) ?? top[i - 1];
    if (prev) edges.push({ from: prev.id, to: n.id, weight: 0.5 });
    else if (top[i + 1]) edges.push({ from: n.id, to: top[i + 1].id, weight: 0.5 });
  });
  return { ...g, edges: sanitizeEdges({ ...g, edges }) };
}

/* ------------------------------------------------------------------ questions */

/** Models like to put the right answer first. Shuffle in code, carrying misconception tags along. */
export function shuffleOptions(options: string[], correctIndex: number, mis: (string | null)[]) {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((o) => options[o]), correctIndex: order.indexOf(correctIndex), misconceptions: order.map((o) => mis[o]) };
}

export function parseQuestion(nodeId: string, q: unknown, i: number, force?: QuestionKind): Question | null {
  if (!isObj(q) || typeof q.text !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) return null;
  if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) return null;
  const opts = q.options.map((o) => String(o).trim());
  if (new Set(opts).size !== 4) return null;
  const kind: QuestionKind = force ?? (q.kind === 'probe' || q.kind === 'contrast' ? q.kind : 'diagnostic');
  const raw = Array.isArray(q.misconceptionIds) ? q.misconceptionIds : [];
  const mis = [0, 1, 2, 3].map((k) => (k === q.correctIndex ? null : typeof raw[k] === 'string' && raw[k] ? slug(raw[k] as string).replace(/-/g, '_') : null));
  const s = shuffleOptions(opts, q.correctIndex, mis);
  const role = q.role === 'control' || q.role === 'discriminating' ? q.role : undefined;
  return {
    id: `${nodeId}-q${i}`, nodeId, kind, text: q.text.trim(), ...s,
    level: q.level === 1 || q.level === 2 || q.level === 3 ? q.level : undefined,
    role: kind === 'contrast' ? role : undefined,
    pairId: kind === 'contrast' && typeof q.pairId === 'string' ? `${nodeId}-${q.pairId}` : undefined,
  };
}

export type TopicInput = { id: string; label: string; unit: string; description?: string };

/**
 * The prompt asks for a fixed shape, but models mislabel kinds and levels. When a topic has exactly the five
 * questions asked for, the shape is enforced by position so the level ladder and the contrast pair are reliable.
 */
const SHAPE: [QuestionKind, 1 | 2 | 3, Question['role']][] = [
  ['diagnostic', 1, undefined],
  ['diagnostic', 2, undefined],
  ['probe', 3, undefined],
  ['contrast', 3, 'discriminating'],
  ['contrast', 2, 'control'],
];
export function normalizeBank(nodeId: string, qs: Question[]): Question[] {
  if (qs.length !== SHAPE.length) return qs.map((q) => ({ ...q, level: q.level ?? 2 }));
  return qs.map((q, i) => ({ ...q, kind: SHAPE[i][0], level: SHAPE[i][1], role: SHAPE[i][2], pairId: SHAPE[i][2] ? `${nodeId}-p1` : undefined }));
}
/** Sub-topic questions come as a pair: an application question, then a tricky transfer one. */
export const normalizeSubQuestions = (qs: Question[]): Question[] => qs.map((q, i) => ({ ...q, kind: 'probe', level: i === 0 ? 2 : 3 }));

const QUESTION_SHAPE = `{"kind":"diagnostic"|"probe"|"contrast","level":1|2|3,"role":"discriminating"|"control"|null,"pairId":string|null,"text":string,"options":[4 distinct strings],"correctIndex":0-3,"misconceptionIds":[4 entries: a snake_case "m_..." id for each WRONG option, null for the correct one]}`;

export const BANK_PROMPT = (topics: TopicInput[]) => `Write a question bank for a diagnostic quiz. For EACH topic below write exactly 5 multiple-choice questions, each with 4 options and exactly one correct option:
1. level 1, kind "diagnostic": recall of a definition or fact.
2. level 2, kind "diagnostic": apply the idea to a small concrete scenario.
3. level 3, kind "probe": a tricky transfer question that needs a chain of ideas.
4. level 3, kind "contrast", role "discriminating", pairId "p1": a student holding one specific misconception answers it WRONG.
5. level 2, kind "contrast", role "control", pairId "p1": a fresh scenario on the same idea where that same misconception would happen to give the RIGHT answer, so passing it alone proves nothing.
Every WRONG option must be a plausible distractor that reveals ONE specific wrong belief; give it a snake_case misconceptionId starting with "m_". The correct option has misconceptionId null. Keep each question under 45 words and each option under 18 words. Vary the position of the correct option.
Return JSON {"topics":[{"id":string,"questions":[${QUESTION_SHAPE}]}]}. Use the topic ids exactly as given. Do not deliberate at length: think briefly, then output the JSON directly.

TOPICS:
${topics.map((t) => `- id "${t.id}": ${t.label} (unit: ${t.unit})${t.description ? `: ${t.description}` : ''}`).join('\n')}`;

/** Returns questions per topic id. Topics with fewer than 3 valid questions are omitted. */
export const validateBank = (expected: string[]) => (x: unknown): Record<string, Question[]> | null => {
  if (!isObj(x) || !Array.isArray(x.topics)) return null;
  const out: Record<string, Question[]> = {};
  const byPosition = x.topics.length === expected.length;
  x.topics.forEach((t, pos) => {
    if (!isObj(t) || !Array.isArray(t.questions)) return;
    // The model sometimes returns "1", "2" instead of our ids; when the counts match, trust the order.
    const id = typeof t.id === 'string' && expected.includes(t.id) ? t.id : byPosition ? expected[pos] : undefined;
    if (!id || out[id]) return;
    const qs = t.questions.map((q, i) => parseQuestion(id, q, i)).filter((q): q is Question => !!q);
    if (qs.length >= 3) out[id] = normalizeBank(id, qs);
  });
  return Object.keys(out).length ? out : null;
};

/* ------------------------------------------------------------------ sub-topics */

export const SUB_PROMPT = (topics: TopicInput[]) => `For EACH topic below, break it into exactly 3 distinct sub-concepts a student must understand, ordered foundational to advanced. Each sub-concept is a real teachable idea in 2-5 words (never "Introduction" or "Overview") with a one-sentence description, and gets exactly 2 multiple-choice questions (4 options, one correct): the first level 2 (apply to a small scenario), the second level 3 (tricky transfer). Every WRONG option reveals ONE wrong belief: give it a snake_case misconceptionId starting with "m_"; the correct option gets null. Keep questions under 40 words and options under 15 words. Vary the position of the correct option.
Return JSON {"topics":[{"id":string,"subtopics":[{"label":string,"description":string,"questions":[{"level":2|3,"text":string,"options":[4 strings],"correctIndex":0-3,"misconceptionIds":[4 entries]}]}]}]}. Use the topic ids exactly as given.

TOPICS:
${topics.map((t) => `- id "${t.id}": ${t.label} (unit: ${t.unit})${t.description ? `: ${t.description}` : ''}`).join('\n')}`;

export type SubResult = { nodes: ConceptNode[]; questions: Question[] };

export const validateSubs = (parents: TopicInput[]) => (x: unknown): Record<string, SubResult> | null => {
  if (!isObj(x) || !Array.isArray(x.topics)) return null;
  const out: Record<string, SubResult> = {};
  const byPosition = x.topics.length === parents.length;
  for (const [pos, t] of x.topics.entries()) {
    const parent = (isObj(t) && typeof t.id === 'string' ? parents.find((p) => p.id === t.id) : undefined) ?? (byPosition ? parents[pos] : undefined);
    if (!parent || !isObj(t) || !Array.isArray(t.subtopics) || out[parent.id]) continue;
    const nodes: ConceptNode[] = [];
    const questions: Question[] = [];
    for (const s of t.subtopics.slice(0, 3)) {
      if (!isObj(s) || typeof s.label !== 'string') continue;
      const id = `${parent.id}.${slug(s.label)}`;
      if (nodes.some((n) => n.id === id)) continue;
      const qs = (Array.isArray(s.questions) ? s.questions : []).map((q, i) => parseQuestion(id, q, i, 'probe')).filter((q): q is Question => !!q);
      if (qs.length < 1) continue;
      nodes.push({ id, label: s.label.trim(), unit: parent.unit, description: typeof s.description === 'string' ? s.description : undefined, parentId: parent.id });
      questions.push(...normalizeSubQuestions(qs));
    }
    if (nodes.length >= 2) out[parent.id] = { nodes, questions };
  }
  return Object.keys(out).length ? out : null;
};

/* ------------------------------------------------------------------ cross-check (second model, batched) */

export const CROSSCHECK_PROMPT = (qs: Question[]) => `Answer each multiple-choice question independently. Return JSON {"answers":[{"id":string,"answerIndex":0-3}]}.

${qs.map((q) => `[${q.id}] ${q.text}\n${q.options.map((o, i) => `${i}. ${o}`).join('\n')}`).join('\n\n')}`;

export const validateCrosscheck = (x: unknown): Record<string, number> | null => {
  if (!isObj(x) || !Array.isArray(x.answers)) return null;
  const out: Record<string, number> = {};
  for (const a of x.answers) if (isObj(a) && typeof a.id === 'string' && typeof a.answerIndex === 'number') out[a.id] = a.answerIndex;
  return Object.keys(out).length ? out : null;
};

/** Keep only questions the second model agreed with (or did not answer). */
export const applyCrosscheck = (qs: Question[], answers: Record<string, number>) =>
  qs.filter((q) => answers[q.id] === undefined || answers[q.id] === q.correctIndex);

export const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/* ------------------------------------------------------------------ focused prerequisite pass */

/** A small, focused second call gives a far better dependency structure than asking for it inside the big extraction. */
export const EDGES_PROMPT = (topics: TopicInput[]) => `Below are the topics of one course, in syllabus order. List the prerequisite edges between them: an edge from A to B means a student must understand A before B makes sense.
Rules:
- Use the ids exactly as given. The graph must be acyclic.
- Every topic must appear in at least one edge.
- Aim for about 1.5 edges per topic (15 topics means roughly 20-24 edges). Include dependencies that skip ahead and cross unit boundaries, not only consecutive topics, and let a topic depend on two earlier topics when it truly needs both.
- Do not link topics that are merely related. weight (0.1-1) is how strongly B depends on A: 0.8-1 for a hard prerequisite, 0.3-0.5 for a loose one.
Return JSON {"edges":[{"from":id,"to":id,"weight":number}]}.

TOPICS:
${topics.map((t) => `- id "${t.id}": ${t.label} (unit: ${t.unit})${t.description ? `: ${t.description}` : ''}`).join('\n')}`;

export const validateEdges = (g: ConceptGraph) => (x: unknown): ConceptEdge[] | null => {
  if (!isObj(x) || !Array.isArray(x.edges)) return null;
  const ids = new Set(g.nodes.filter((n) => !n.parentId).map((n) => n.id));
  const edges: ConceptEdge[] = [];
  for (const e of x.edges) {
    if (!isObj(e) || typeof e.from !== 'string' || typeof e.to !== 'string' || !ids.has(e.from) || !ids.has(e.to)) continue;
    const w = typeof e.weight === 'number' ? Math.min(1, Math.max(0.1, e.weight)) : 0.6;
    edges.push({ from: e.from, to: e.to, weight: Math.round(w * 10) / 10 });
  }
  const clean = repairGraph({ ...g, edges: sanitizeEdges({ ...g, edges }) }).edges;
  return clean.length >= Math.ceil(ids.size * 0.8) ? clean : null;
};

/* ------------------------------------------------------------------ tolerant JSON */

/** Parse a model reply that should be JSON but may have prose around it, trailing commas, comments or unquoted keys. */
export function tolerantParse(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in reply');
  try {
    return JSON.parse(m[0]);
  } catch {
    const fixed = m[0]
      .replace(/^\s*\{\s*\{/, '{')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^'\n]*)'/g, ': "$1"');
    return JSON.parse(fixed);
  }
}
