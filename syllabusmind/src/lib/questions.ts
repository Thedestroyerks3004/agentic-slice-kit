/**
 * Live question generation. One schema-validated model call per topic, scoped to that topic and its
 * one-hop neighbours. Nothing is cached for reuse, so repeating a topic gives different questions.
 * A malformed reply gets one retry, then the pre-written backup set for that topic.
 */
import type { ConceptGraph, ConceptNode, Question } from '../engine/types';
import { neighborhood } from '../engine/graph';
import { generateJSON } from './llm';
import { REHEARSED, backupDeep, backupDiagnostic } from './backup';
import { TRIGGER_NODES } from './dbmsGraph';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);

/** Models like to put the right answer first. Shuffle in code, carrying misconception tags along. */
export function shuffleOptions<T>(options: string[], correctIndex: number, ...tags: (T | null)[][]) {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((o) => options[o]), correctIndex: order.indexOf(correctIndex), tags: tags.map((t) => order.map((o) => t[o])) };
}

export function parseQuestion(nodeId: string, q: unknown, id: string): Question | null {
  if (!isObj(q) || typeof q.text !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) return null;
  if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) return null;
  const opts = q.options.map((o) => String(o).trim());
  if (opts.some((o) => !o) || new Set(opts).size !== 4) return null;
  const ids = Array.isArray(q.misconceptionIds) ? q.misconceptionIds : [];
  const bel = Array.isArray(q.beliefs) ? q.beliefs : [];
  const mis = [0, 1, 2, 3].map((k) => (k === q.correctIndex ? null : typeof ids[k] === 'string' && ids[k] ? snake(ids[k] as string) : null));
  const beliefs = [0, 1, 2, 3].map((k) => (k === q.correctIndex ? null : typeof bel[k] === 'string' && bel[k] ? (bel[k] as string).slice(0, 140) : null));
  const s = shuffleOptions<string>(opts, q.correctIndex, mis, beliefs);
  return {
    id, nodeId, kind: 'probe', text: q.text.trim(), options: s.options, correctIndex: s.correctIndex,
    misconceptions: s.tags[0], beliefs: s.tags[1],
    explanation: typeof q.explanation === 'string' && q.explanation.trim() ? q.explanation.trim().slice(0, 320) : undefined,
    level: q.level === 1 || q.level === 2 || q.level === 3 ? q.level : undefined,
    source: 'live',
  };
}

const parseAll = (nodeId: string, x: unknown, nonce: string): Question[] | null => {
  if (!isObj(x) || !Array.isArray(x.questions)) return null;
  const out = x.questions.map((q, i) => parseQuestion(nodeId, q, `${nodeId}-${nonce}-${i}`)).filter((q): q is Question => !!q);
  return out.length ? out : null;
};

/* ------------------------------------------------------------------ prompts */

function context(graph: ConceptGraph, node: ConceptNode) {
  const { prereqs, dependents } = neighborhood(graph, node.id);
  const names = (l: ConceptNode[]) => (l.length ? l.map((n) => n.label).join(', ') : 'none');
  return `Course: Database Management Systems (university level).
Topic: "${node.label}"${node.description ? ` (${node.description})` : ''}.
Prerequisite topics: ${names(prereqs)}. Topics that build on it: ${names(dependents)}.
Questions must be about "${node.label}" itself; use the neighbouring topics only for context.`;
}

const OPTION_RULES = `Every question has exactly 4 distinct options and exactly one correct option. Every WRONG option must be a plausible distractor that reveals ONE specific wrong belief a student might hold: give it a snake_case "m_..." id in misconceptionIds and a short plain-words statement of that belief in beliefs (for example "Believes any blocked transaction is a deadlock"). The correct option has null in both arrays. Also give each question an "explanation": one or two plain sentences saying why the correct option is right and where the most tempting wrong option goes wrong. Keep each question under 45 words and each option under 18 words. Vary the position of the correct option. Do not deliberate at length: output the JSON directly.`;

const SHAPE = `{"level":1|2|3,"text":string,"options":[4 strings],"correctIndex":0-3,"misconceptionIds":[4 entries],"beliefs":[4 entries],"explanation":string}`;

const diagnosticPrompt = (graph: ConceptGraph, node: ConceptNode) => `${context(graph, node)}
Write exactly 2 multiple-choice questions for a quick diagnostic: first a level 1 question (recall of a definition or fact), then a level 2 question (apply the idea to a small concrete scenario).
${OPTION_RULES}
Return JSON {"questions":[${SHAPE}, ${SHAPE}]}.`;

const deepPrompt = (graph: ConceptGraph, node: ConceptNode) => `${context(graph, node)}
Write exactly 8 NEW multiple-choice questions to probe this topic in depth, in this order:
1-2: level 1 (recall). 3-5: level 2 (apply to a concrete scenario). 6: level 3 (a tricky transfer question needing a chain of ideas).
7: a CONTROL question (level 2) on one specific misconception: a fresh scenario where that misconception would happen to give the RIGHT answer, so passing it alone proves nothing.
8: a DISCRIMINATING question (level 3) on the same misconception: a student holding it answers WRONG.
${OPTION_RULES}
Return JSON {"questions":[8 objects shaped ${SHAPE}]}.`;

/* ------------------------------------------------------------------ shaping */

const nonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function shapeDiagnostic(qs: Question[]): Question[] | null {
  if (qs.length < 2) return null;
  return qs.slice(0, 2).map((q, i) => ({ ...q, kind: 'diagnostic' as const, level: (i === 0 ? 1 : 2) as 1 | 2 }));
}

/** Enforce the ladder by position: the model mislabels levels, but the shape is fixed in code. */
function shapeDeep(nodeId: string, qs: Question[]): Question[] | null {
  if (qs.length < 6) return null;
  const use = qs.slice(0, 8);
  const body = use.slice(0, use.length - 2);
  const tail = use.slice(-2);
  const ladder: (1 | 2 | 3)[] = [1, 1, 2, 2, 2, 3];
  const pair = `${nodeId}-pair`;
  return [
    ...body.map((q, i) => ({ ...q, kind: ladder[i] === 1 ? ('diagnostic' as const) : ('probe' as const), level: ladder[i] ?? 2 })),
    { ...tail[0], kind: 'contrast' as const, level: 2 as const, role: 'control' as const, pairId: pair },
    { ...tail[1], kind: 'contrast' as const, level: 3 as const, role: 'discriminating' as const, pairId: pair },
  ];
}

/** The rehearsed trigger topics always end on their pre-written contrast pair, never a live one. */
export function finalizeDeep(nodeId: string, qs: Question[]): Question[] {
  const body = qs.filter((q) => q.kind !== 'contrast');
  const trig = (TRIGGER_NODES as readonly string[]).includes(nodeId) ? REHEARSED[nodeId] : undefined;
  const tail = trig ? [trig.control, trig.discriminating] : qs.filter((q) => q.kind === 'contrast').sort((a, b) => (a.role === 'control' ? -1 : 0) - (b.role === 'control' ? -1 : 0));
  return [...body.slice(0, 8), ...tail];
}

/* ------------------------------------------------------------------ public API */

export interface GenResult {
  questions: Question[];
  source: 'live' | 'backup';
  error?: string;
}

/** Two questions for the root diagnostic. */
export async function generateDiagnostic(graph: ConceptGraph, node: ConceptNode): Promise<GenResult> {
  const n = nonce();
  const r = await generateJSON<Question[]>({
    task: 'question',
    prompt: diagnosticPrompt(graph, node),
    validate: (x) => {
      const qs = parseAll(node.id, x, n);
      return qs ? shapeDiagnostic(qs) : null;
    },
    fallback: () => backupDiagnostic(node.id),
    maxTokens: 6000,
    timeoutMs: 45000,
  });
  return { questions: r.value, source: r.live ? 'live' : 'backup', error: r.error };
}

/** Six to ten fresh questions for "go deeper", ending on the contrast question(s). */
export async function generateDeep(graph: ConceptGraph, node: ConceptNode): Promise<GenResult> {
  const n = nonce();
  const r = await generateJSON<Question[]>({
    task: 'question',
    prompt: deepPrompt(graph, node),
    validate: (x) => {
      const qs = parseAll(node.id, x, n);
      return qs ? shapeDeep(node.id, qs) : null;
    },
    fallback: () => backupDeep(node.id),
    maxTokens: 9000,
    timeoutMs: 75000,
  });
  return { questions: finalizeDeep(node.id, r.value), source: r.live ? 'live' : 'backup', error: r.error };
}
