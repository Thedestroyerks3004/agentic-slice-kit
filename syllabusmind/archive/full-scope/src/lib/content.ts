import type { ConceptEdge, ConceptGraph, ConceptNode, Question, QuestionKind } from '../engine/types';
import type { Neighbor, NeighborJudgment } from '../engine/propagation';
import { DEMO_GRAPH, DEMO_QUESTIONS, DEMO_TEXT } from './demoData';
import { DEMO_SUBTOPICS, DEMO_SUB_QUESTIONS } from './demoSub';
import { generateJSON, hasModel, modelPropagation } from './llm';
import {
  BANK_PROMPT, CROSSCHECK_PROMPT, GRAPH_PROMPT, applyCrosscheck, chunk, isObj, parseQuestion, slug, validateBank, validateCrosscheck, validateGraph,
} from './bank';

/* ------------------------------------------------------------------ graph extraction */

/** No-model fallback: read units and bullets straight from the text. */
export function heuristicGraph(text: string): ConceptGraph {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const nodes: ConceptNode[] = [];
  const edges: ConceptEdge[] = [];
  let unit = 'General';
  const title = lines[0]?.slice(0, 80) || 'Syllabus';
  let prev: ConceptNode | null = null;
  let prevUnitLast: ConceptNode | null = null;
  const used = new Set<string>();

  for (const raw of lines.slice(1)) {
    const isUnit = /^(unit|module|chapter|section|part)\b/i.test(raw) || (/:$/.test(raw) && raw.length < 80);
    if (isUnit) {
      if (prev) prevUnitLast = prev;
      unit = raw.replace(/:$/, '').replace(/^(unit|module|chapter|section|part)\s*[\w.-]*\s*[:.-]?\s*/i, '') || raw;
      prev = null;
      continue;
    }
    const label = raw.replace(/^[-*•\d.)\s]+/, '').trim();
    if (label.length < 3 || label.length > 80 || nodes.length >= 24) continue;
    let id = slug(label) || `n${nodes.length}`;
    while (used.has(id)) id += '-2';
    used.add(id);
    const node: ConceptNode = { id, label, unit };
    nodes.push(node);
    if (prev) edges.push({ from: prev.id, to: id, weight: 0.7 });
    else if (prevUnitLast) edges.push({ from: prevUnitLast.id, to: id, weight: 0.4 });
    prev = node;
  }
  return { id: `g-${Date.now().toString(36)}`, title, source: 'heuristic', nodes, edges };
}

export async function extractGraph(text: string): Promise<{ graph: ConceptGraph; live: boolean; error?: string }> {
  if (text.trim() === DEMO_TEXT) return { graph: structuredClone(DEMO_GRAPH), live: false };
  const { value, live, error } = await generateJSON<ConceptGraph>({
    task: 'extract',
    prompt: GRAPH_PROMPT(text),
    validate: validateGraph,
    fallback: () => heuristicGraph(text),
    maxTokens: 12000,
  });
  return { graph: value, live, error };
}

/* ------------------------------------------------------------------ question banks */

const selfCheck = (node: ConceptNode): Question[] => {
  const opts = ['I can explain it and apply it to a new problem', 'I know the terms but would struggle to apply them', 'I only vaguely recognise it', 'I have not studied it yet'];
  const mk = (kind: QuestionKind, text: string, i: number, level: 1 | 2 | 3): Question => ({ id: `${node.id}-self-${i}`, nodeId: node.id, kind, text, options: opts, correctIndex: 0, selfCheck: true, level });
  return [
    mk('diagnostic', `Self-check: how well can you explain "${node.label}" in your own words?`, 0, 1),
    mk('diagnostic', `Self-check: could you solve a fresh exam problem on "${node.label}" without notes?`, 1, 2),
    mk('probe', `Self-check: can you name the ideas "${node.label}" depends on and say why?`, 2, 3),
    mk('contrast', `Self-check: could you say when "${node.label}" does NOT apply and why?`, 3, 3),
  ];
};

/**
 * One pass for the whole syllabus: 5 questions per topic (levels 1-3 plus a contrast pair), a few
 * topics per call, all calls in parallel, then one batched cross-check by a second model per call.
 */
export async function generateBank(
  graph: ConceptGraph,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pools: Record<string, Question[]>; covered: number; error?: string }> {
  const topics = graph.nodes.filter((n) => !n.parentId);
  const batches = chunk(topics, 5);
  let done = 0;
  let firstError: string | undefined;
  onProgress?.(0, batches.length);
  const results = await Promise.all(
    batches.map(async (batch) => {
      const ids = batch.map((t) => t.id);
      const r = await generateJSON<Record<string, Question[]>>({
        task: 'question',
        prompt: BANK_PROMPT(batch),
        validate: validateBank(ids),
        fallback: () => ({}),
        maxTokens: 9000,
      });
      if (r.error && !r.live) firstError ??= r.error;
      let pools = r.value;
      if (r.live) {
        const all = Object.values(pools).flat();
        const cc = await generateJSON<Record<string, number>>({ task: 'crosscheck', prompt: CROSSCHECK_PROMPT(all), validate: validateCrosscheck, fallback: () => ({}), maxTokens: 1500 });
        if (cc.live) {
          const answers = cc.value;
          pools = Object.fromEntries(Object.entries(pools).map(([id, qs]) => {
            const kept = applyCrosscheck(qs, answers);
            return [id, kept.length >= 3 ? kept : qs]; // never strip a topic below 3 questions
          }));
        }
      }
      onProgress?.(++done, batches.length);
      return pools;
    }),
  );
  const pools: Record<string, Question[]> = Object.assign({}, ...results);
  return { pools, covered: Object.keys(pools).length, error: firstError };
}

/** Single-topic pool: curated for the demo, else generated on demand (a fallback when a bank is missing). */
export async function buildQuestionPool(graph: ConceptGraph, node: ConceptNode): Promise<{ questions: Question[]; live: boolean }> {
  if (graph.source === 'demo') return { questions: [...DEMO_QUESTIONS, ...DEMO_SUB_QUESTIONS].filter((q) => q.nodeId === node.id), live: false };
  if (!node.parentId) {
    const { value, live } = await generateJSON<Question[]>({
      task: 'question',
      prompt: BANK_PROMPT([node]),
      validate: (x) => validateBank([node.id])(x)?.[node.id] ?? null,
      fallback: () => selfCheck(node),
      maxTokens: 3000,
    });
    return { questions: value, live };
  }
  const { value, live } = await generateJSON<Question[]>({
    task: 'question',
    prompt: `Write 3 multiple-choice questions on the sub-concept "${node.label}"${node.description ? ` (${node.description})` : ''}, each with exactly 4 options and exactly one correct option. Every WRONG option must reveal ONE specific wrong belief: give it a snake_case misconceptionId starting with "m_"; the correct option gets null. Question 1 has kind "diagnostic" and level 1 or 2. Questions 2 and 3 have kind "probe" (level 2 and level 3, the level 3 being a tricky transfer scenario). Return JSON {"questions":[{"kind":"diagnostic"|"probe","level":1|2|3,"text":string,"options":[4 strings],"correctIndex":0-3,"misconceptionIds":[4 entries]}]}. Put the correct option in a varied position.`,
    validate: (x) => {
      if (!isObj(x) || !Array.isArray(x.questions)) return null;
      const qs = x.questions.map((q, i) => parseQuestion(node.id, q, i)).filter((q): q is Question => !!q);
      return qs.length >= 2 ? qs : null;
    },
    fallback: () => selfCheck(node).slice(0, 3),
  });
  return { questions: value, live };
}

/* ------------------------------------------------------------------ drill-down into sub-topics */

/** Break one topic into exactly 3 sub-topics. Demo topics use a curated split. */
export async function proposeSubtopics(graph: ConceptGraph, node: ConceptNode): Promise<{ subs: ConceptNode[]; live: boolean; error?: string }> {
  if (graph.source === 'demo') return { subs: DEMO_SUBTOPICS(node), live: false };
  const { value, live, error } = await generateJSON<ConceptNode[]>({
    task: 'question',
    prompt: `Break the concept "${node.label}" (unit: ${node.unit}${node.description ? `; ${node.description}` : ''}) into exactly 3 distinct sub-concepts a student must understand, ordered from foundational to advanced. Each is a real, teachable idea in 2-5 words, not a vague heading like "Introduction" or "Overview".
Return JSON {"subtopics":[{"label":string,"description":"one short sentence"}]}.`,
    validate: (x) => {
      if (!isObj(x) || !Array.isArray(x.subtopics)) return null;
      const subs = x.subtopics.filter((s): s is Record<string, unknown> => isObj(s) && typeof s.label === 'string').slice(0, 3);
      if (subs.length < 2) return null;
      return subs.map((s) => ({ id: `${node.id}.${slug(s.label as string)}`, label: s.label as string, unit: node.unit, description: typeof s.description === 'string' ? s.description : undefined, parentId: node.id }));
    },
    fallback: () => [
      ['core', 'Core definitions'],
      ['apply', 'Worked application'],
      ['mistakes', 'Common mistakes'],
    ].map(([k, l]) => ({ id: `${node.id}.${k}`, label: `${node.label}: ${l}`, unit: node.unit, parentId: node.id })),
  });
  return { subs: value, live, error };
}

/* ------------------------------------------------------------------ propagation judgment */

/**
 * Which neighbours move and how strongly. By default this is the local edge-weight rule (free, instant).
 * With "model propagation" switched on in Settings, a model judges it (one call per answer).
 */
export async function judgePropagation(
  graph: ConceptGraph,
  sourceId: string,
  delta: number,
  neighbors: Neighbor[],
): Promise<NeighborJudgment[]> {
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const fallback = (): NeighborJudgment[] =>
    neighbors.map(({ nodeId, edge }) => {
      const dependent = edge.from === sourceId; // neighbour depends on the answered node
      return {
        nodeId,
        weight: dependent ? edge.weight : edge.weight * 0.6,
        reason: `propagated from ${label(sourceId)}: ${dependent ? 'depends on it' : 'is a prerequisite of it'} (edge weight ${edge.weight.toFixed(2)})`,
      };
    });
  if (!neighbors.length) return [];
  if (!hasModel() || !modelPropagation()) return fallback();
  const { value } = await generateJSON<NeighborJudgment[]>({
    task: 'propagate',
    prompt: `A student's mastery of "${label(sourceId)}" changed by ${delta.toFixed(2)}. Neighbours (edge from prerequisite to dependent): ${neighbors
      .map((n) => `${n.nodeId}="${label(n.nodeId)}" (${n.edge.from === sourceId ? 'dependent' : 'prerequisite'}, weight ${n.edge.weight})`)
      .join('; ')}. Return JSON {"neighbors":[{"nodeId":string,"weight":0..1,"reason":"short plain-language reason"}]}. Omit neighbours that should not move.`,
    validate: (x) => {
      if (!isObj(x) || !Array.isArray(x.neighbors)) return null;
      const allowed = new Set(neighbors.map((n) => n.nodeId));
      return x.neighbors
        .filter((n): n is Record<string, unknown> => isObj(n) && typeof n.nodeId === 'string' && allowed.has(n.nodeId) && typeof n.weight === 'number')
        .map((n) => ({ nodeId: n.nodeId as string, weight: Math.min(1, Math.max(0, n.weight as number)), reason: typeof n.reason === 'string' ? n.reason.slice(0, 160) : 'model judgment' }));
    },
    fallback,
    maxTokens: 500,
  });
  return value;
}
