import { create } from 'zustand';
import type { AnswerEntry, Confidence, LogEntry, NodeBelief, Question } from '../engine/types';
import { deriveState, mastery, newBelief, shouldReopen, updateBelief } from '../engine/mastery';
import { diagnosticOrder } from '../engine/graph';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import { generateDeep, generateDiagnostic } from '../lib/questions';
import { hasModel } from '../lib/llm';

export const GRAPH = DBMS_GRAPH;

export interface Student {
  name: string;
  roll: string;
}
export interface Banner {
  kind: 'reopen' | 'verify';
  text: string;
  at: number;
}
export interface DeepDive {
  nodeId: string;
  queue: Question[];
  idx: number;
  source: 'live' | 'backup';
}
export interface AnswerResult {
  correct: boolean;
  correctIndex: number;
  reopened: boolean;
  verified: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const freshBeliefs = (): Record<string, NodeBelief> => Object.fromEntries(GRAPH.nodes.map((n) => [n.id, newBelief()]));
const labelOf = (id: string) => GRAPH.nodes.find((n) => n.id === id)?.label ?? id;

interface AppState {
  student: Student | null;
  beliefs: Record<string, NodeBelief>;
  log: LogEntry[];
  diagnosticDone: boolean;
  diagQs: Record<string, Question[]>; // this session's diagnostic pair per topic (kept only so both questions come from one call)
  deep: DeepDive | null;
  banner: Banner | null;
  busy: string | null;
  notice: string | null;

  start: (name: string, roll: string) => void;
  reset: () => void;
  nextDiagnosticQuestion: () => Promise<Question | null>;
  markDiagnosticDone: () => void;
  answer: (q: Question, chosen: number, conf: Confidence, phase: 'diagnostic' | 'deepdive') => AnswerResult;
  startDeepDive: (nodeId: string) => Promise<boolean>;
  advanceDeep: () => void;
  endDeepDive: () => void;
  dismissBanner: () => void;
}

const inflight = new Map<string, Promise<Question[]>>();

/** Diagnostic pair for a topic, generated on demand and prefetched a little ahead of the student. */
function diagFor(nodeId: string): Promise<Question[]> {
  const have = useApp.getState().diagQs[nodeId];
  if (have) return Promise.resolve(have);
  let p = inflight.get(nodeId);
  if (!p) {
    const node = GRAPH.nodes.find((n) => n.id === nodeId)!;
    p = generateDiagnostic(GRAPH, node).then((r) => {
      useApp.setState((s) => ({
        diagQs: { ...s.diagQs, [nodeId]: r.questions },
        notice: r.source === 'backup' && !s.notice ? backupNotice(r.error) : s.notice,
      }));
      inflight.delete(nodeId);
      return r.questions;
    });
    inflight.set(nodeId, p);
  }
  return p;
}

const backupNotice = (error?: string) =>
  hasModel()
    ? `Live question generation failed (${error ?? 'unknown error'}). Some topics use the pre-written backup questions.`
    : 'No API key found, so questions come from the pre-written backup set. Put a key in .env.local for freshly generated questions.';

export const useApp = create<AppState>((set, get) => ({
  student: null,
  beliefs: freshBeliefs(),
  log: [],
  diagnosticDone: false,
  diagQs: {},
  deep: null,
  banner: null,
  busy: null,
  notice: null,

  start: (name, roll) => {
    inflight.clear();
    set({ student: { name: name.trim() || roll.trim(), roll: roll.trim() }, beliefs: freshBeliefs(), log: [], diagnosticDone: false, diagQs: {}, deep: null, banner: null, busy: null, notice: null });
  },
  reset: () => {
    inflight.clear();
    set({ student: null, beliefs: freshBeliefs(), log: [], diagnosticDone: false, diagQs: {}, deep: null, banner: null, busy: null, notice: null });
  },

  /** Walk the tree outward from the root, two questions per topic, generating a little ahead of the student. */
  nextDiagnosticQuestion: async () => {
    const order = diagnosticOrder(GRAPH);
    const pending = (id: string) => get().beliefs[id].answers < 2;
    const idx = order.findIndex(pending);
    if (idx < 0) return null;
    order.slice(idx + 1).filter(pending).slice(0, 2).forEach((id) => void diagFor(id));
    const id = order[idx];
    const qs = await diagFor(id);
    return qs[get().beliefs[id].answers] ?? null;
  },
  markDiagnosticDone: () => set({ diagnosticDone: true }),

  answer: (q, chosen, conf, phase) => {
    const before = get().beliefs[q.nodeId] ?? newBelief();
    const prevState = deriveState(before);
    const prevM = mastery(before);
    const correct = chosen === q.correctIndex;
    let after = updateBelief(before, correct, conf, q.level ?? 2);
    const extra: LogEntry[] = [];
    const now = new Date().toISOString();
    let reopened = false;
    let verified = false;
    const label = labelOf(q.nodeId);

    // Deterministic backward transition: a plain comparison against the stored answer key.
    // A control question is ordinary evidence: passing it alone proves nothing, and failing it never reopens.
    if (q.kind === 'contrast' && q.role !== 'control' && phase === 'deepdive') {
      if (shouldReopen(correct, before)) {
        after = { ...after, verified: false, reopened: true, beta: after.beta + 1.5 };
        reopened = true;
        const control = get().deep?.queue.find((x) => x.pairId && x.pairId === q.pairId && x.role === 'control');
        const guessed = !!control && get().log.some((e) => e.type === 'answer' && e.correct && e.questionId === control.id);
        const held = q.beliefs?.[chosen] ?? q.misconceptions?.[chosen];
        extra.push({
          type: 'reopen', id: uid(), at: now, nodeId: q.nodeId, questionId: q.id,
          reason: `contrast pair failed while ${label} looked ${prevState}${held ? ` (${held})` : ''}${guessed ? '; the control was passed but the discriminating question failed, the signature of a guess' : ''}; down-weighted`,
        });
      } else if (correct && mastery(after) > 0.7 && after.answers >= 2) {
        after = { ...after, verified: true, reopened: false };
        verified = true;
        extra.push({ type: 'verify', id: uid(), at: now, nodeId: q.nodeId, reason: 'passed the contrast question on a fresh scenario' });
      }
    }

    const entry: AnswerEntry = {
      type: 'answer', id: uid(), at: now, nodeId: q.nodeId, questionId: q.id, questionText: q.text,
      chosen: q.options[chosen], correct, confidence: conf, masteryBefore: prevM, masteryAfter: mastery(after), kind: q.kind, phase,
      misconceptionId: !correct ? q.misconceptions?.[chosen] ?? undefined : undefined,
      belief: !correct ? q.beliefs?.[chosen] ?? undefined : undefined,
    };
    set((s) => ({ beliefs: { ...s.beliefs, [q.nodeId]: after }, log: [...s.log, entry, ...extra] }));

    if (reopened) set({ banner: { kind: 'reopen', at: Date.now(), text: `REOPENED: contrast pair failed → ${label} down-weighted` } });
    else if (verified) set({ banner: { kind: 'verify', at: Date.now(), text: `VERIFIED: ${label} passed the contrast check` } });
    return { correct, correctIndex: q.correctIndex, reopened, verified };
  },

  /** "Go deeper": a fresh set every click (never reused), scoped to this topic and its neighbours as context. */
  startDeepDive: async (nodeId) => {
    const node = GRAPH.nodes.find((n) => n.id === nodeId)!;
    set({ busy: `Generating new questions on ${node.label}…`, banner: null });
    const r = await generateDeep(GRAPH, node);
    set({ busy: null });
    if (!r.questions.length) {
      set({ notice: 'No questions available for this topic.' });
      return false;
    }
    if (r.source === 'backup') set({ notice: backupNotice(r.error) });
    set({ deep: { nodeId, queue: r.questions, idx: 0, source: r.source } });
    return true;
  },

  /** Dynamic difficulty: after a right answer prefer a harder next question, after a wrong one an easier one. */
  advanceDeep: () =>
    set((s) => {
      const d = s.deep;
      if (!d) return s;
      const lvl = (q: Question) => q.level ?? 2;
      const cur = d.queue[d.idx];
      const next = d.idx + 1;
      let tail = d.queue.findIndex((q, i) => i >= next && q.kind === 'contrast');
      if (tail < 0) tail = d.queue.length;
      const last = [...s.log].reverse().find((e): e is AnswerEntry => e.type === 'answer' && e.questionId === cur.id);
      if (last && cur.kind !== 'contrast' && tail - next > 1) {
        const target = Math.min(3, Math.max(1, lvl(cur) + (last.correct ? 1 : -1)));
        let best = next;
        for (let i = next; i < tail; i++) if (Math.abs(lvl(d.queue[i]) - target) < Math.abs(lvl(d.queue[best]) - target)) best = i;
        if (best !== next) {
          const queue = d.queue.slice();
          [queue[next], queue[best]] = [queue[best], queue[next]];
          return { deep: { ...d, queue, idx: next } };
        }
      }
      return { deep: { ...d, idx: next } };
    }),
  endDeepDive: () => set({ deep: null }),
  dismissBanner: () => set({ banner: null }),
}));
