import { create } from 'zustand';
import type { AnswerEntry, Confidence, LogEntry, NodeBelief, Question } from '../engine/types';
import { MAX_REOPENS, deriveState, mastery, newBelief, shouldReopen, updateBelief } from '../engine/mastery';
import { diagnosticOrder } from '../engine/graph';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import { generateDeep, generateDiagnostic } from '../lib/questions';
import { hasModel } from '../lib/llm';
import { persistence } from '../lib/persist';

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
  checkOnly: string | null; // when set, the quick check covers just this topic
  diagQs: Record<string, Question[]>; // this session's diagnostic pair per topic (kept only so both questions come from one call)
  deep: DeepDive | null;
  banner: Banner | null;
  busy: string | null;
  notice: string | null;

  start: (name: string, roll: string) => void; // fresh: replaces any saved progress for this roll number
  resume: (roll: string) => boolean; // load this roll number's saved progress
  signOut: () => void; // leave without deleting saved progress
  nextDiagnosticQuestion: () => Promise<Question | null>;
  markDiagnosticDone: () => void;
  setCheckOnly: (id: string | null) => void;
  answer: (q: Question, chosen: number, conf: Confidence, phase: 'diagnostic' | 'deepdive') => AnswerResult;
  startDeepDive: (nodeId: string) => Promise<boolean>;
  advanceDeep: () => void;
  endDeepDive: () => void;
  dismissBanner: () => void;
  clearNotice: () => void;
}

const inflight = new Map<string, Promise<Question[]>>();

/** Diagnostic pair for a topic, generated on demand and prefetched a little ahead of the student. */
function diagFor(nodeId: string): Promise<Question[]> {
  const have = useApp.getState().diagQs[nodeId];
  if (have) return Promise.resolve(have);
  let p = inflight.get(nodeId);
  if (!p) {
    const node = GRAPH.nodes.find((n) => n.id === nodeId)!;
    const owner = useApp.getState().student?.roll;
    p = generateDiagnostic(GRAPH, node).then((r) => {
      // A slow reply must not land in a different student's state after a switch.
      if (useApp.getState().student?.roll !== owner) {
        inflight.delete(nodeId);
        return r.questions;
      }
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

/** On page load, pick up the student who was here last, so a refresh does not throw their progress away. */
const restored = (() => {
  const roll = persistence.last();
  return roll ? persistence.load(roll) : null;
})();

export const useApp = create<AppState>((set, get) => ({
  student: restored?.student ?? null,
  beliefs: restored?.beliefs ?? freshBeliefs(),
  log: restored?.log ?? [],
  diagnosticDone: restored?.diagnosticDone ?? false,
  checkOnly: null,
  diagQs: restored?.diagQs ?? {},
  deep: restored?.deep ?? null,
  banner: null,
  busy: null,
  notice: null,

  start: (name, roll) => {
    inflight.clear();
    persistence.clear(roll);
    set({ student: { name: name.trim() || roll.trim(), roll: roll.trim() }, beliefs: freshBeliefs(), log: [], diagnosticDone: false, diagQs: {}, deep: null, banner: null, busy: null, notice: null });
  },
  resume: (roll) => {
    const s = persistence.load(roll);
    if (!s) return false;
    inflight.clear();
    set({ student: s.student, beliefs: s.beliefs, log: s.log, diagnosticDone: s.diagnosticDone, diagQs: s.diagQs, deep: s.deep, banner: null, busy: null, notice: `Welcome back, ${s.student.name}. Your progress was restored.` });
    return true;
  },
  signOut: () => {
    inflight.clear();
    persistence.forgetLast();
    set({ student: null, beliefs: freshBeliefs(), log: [], diagnosticDone: false, diagQs: {}, deep: null, banner: null, busy: null, notice: null });
  },

  /** Walk the tree outward from the root, two questions per topic, generating a little ahead of the student. */
  nextDiagnosticQuestion: async () => {
    const only = get().checkOnly;
    const order = only ? [only] : diagnosticOrder(GRAPH);
    const pending = (id: string) => get().beliefs[id].answers < 2;
    const idx = order.findIndex(pending);
    if (idx < 0) return null;
    order.slice(idx + 1).filter(pending).slice(0, 2).forEach((id) => void diagFor(id));
    const id = order[idx];
    const qs = await diagFor(id);
    return qs[get().beliefs[id].answers] ?? null;
  },
  markDiagnosticDone: () => set({ diagnosticDone: true }),
  setCheckOnly: (id) => set({ checkOnly: id }),

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
        const priorReopens = before.reopenCount ?? 0;
        const capped = priorReopens >= MAX_REOPENS;
        const control = get().deep?.queue.find((x) => x.pairId && x.pairId === q.pairId && x.role === 'control');
        const guessed = !!control && get().log.some((e) => e.type === 'answer' && e.correct && e.questionId === control.id);
        const held = q.beliefs?.[chosen] ?? q.misconceptions?.[chosen];
        if (!capped) {
          // The revision limit (reopenCount, capped at MAX_REOPENS) is a separate counter from
          // llm.ts's `timeouts` (a network-spend limit): one bounds how much a result can be revised,
          // the other bounds retrying a flaky call. They never share state.
          after = { ...after, verified: false, reopened: true, beta: after.beta + 1.5, reopenCount: priorReopens + 1 };
          reopened = true;
        }
        extra.push({
          type: 'reopen', id: uid(), at: now, nodeId: q.nodeId, questionId: q.id,
          reason: `contrast pair failed while ${label} looked ${prevState}${held ? ` (${held})` : ''}${guessed ? '; the control was passed but the discriminating question failed, the signature of a guess' : ''}${capped ? '; reopen limit already reached this session, logged without reopening again' : '; down-weighted'}`,
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
      correctAnswer: q.options[q.correctIndex],
      explanation: q.explanation,
      source: q.source,
    };
    set((s) => ({ beliefs: { ...s.beliefs, [q.nodeId]: after }, log: [...s.log, entry, ...extra] }));

    if (reopened) set({ banner: { kind: 'reopen', at: Date.now(), text: `REOPENED: contrast pair failed → ${label} down-weighted` } });
    else if (verified) set({ banner: { kind: 'verify', at: Date.now(), text: `VERIFIED: ${label} passed the contrast check` } });
    return { correct, correctIndex: q.correctIndex, reopened, verified };
  },

  /** "Go deeper": a fresh set every click (never reused), scoped to this topic and its neighbours as context. */
  startDeepDive: async (nodeId) => {
    const node = GRAPH.nodes.find((n) => n.id === nodeId)!;
    const owner = get().student?.roll;
    set({ busy: `Generating new questions on ${node.label}…`, banner: null });
    const r = await generateDeep(GRAPH, node);
    if (get().student?.roll !== owner) return false;
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
  clearNotice: () => set({ notice: null }),
}));

/** Persist after every change to the student's own state (not banners, notices or busy flags). */
useApp.subscribe((s, prev) => {
  if (!s.student) return;
  if (s.student !== prev.student || s.beliefs !== prev.beliefs || s.log !== prev.log || s.diagnosticDone !== prev.diagnosticDone || s.diagQs !== prev.diagQs || s.deep !== prev.deep) {
    persistence.save(s);
  }
});
