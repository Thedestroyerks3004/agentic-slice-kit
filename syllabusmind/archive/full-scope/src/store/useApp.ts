import { create } from 'zustand';
import type {
  AnswerEntry, Confidence, ConceptEdge, ConceptGraph, ConceptNode, LogEntry, NodeBelief, Question, StudentSession,
} from '../engine/types';
import { baseMastery, deriveState, isSettled, newBelief, updateBelief } from '../engine/mastery';
import { applyNudge, neighborsOf, type NeighborJudgment } from '../engine/propagation';
import { ancestorsOf, childrenOf, diagnosticOrder, hashText, rollup, rootOf, sanitizeEdges } from '../engine/graph';
import { buildQuestionPool, extractGraph, generateBank, judgePropagation, proposeSubtopics } from '../lib/content';
import { bundleById } from '../lib/bundles';
import { hasModel } from '../lib/llm';

export interface Snapshot {
  session: StudentSession;
  graph: ConceptGraph;
  beliefs: Record<string, NodeBelief>;
  log: LogEntry[];
  pools: Record<string, Question[]>;
  asked: string[]; // question ids already answered
  diagnosticDone: boolean;
}
export interface Banner {
  kind: 'reopen' | 'verify' | 'info';
  text: string;
  at: number;
}
export interface Pulse {
  from: string;
  to: string;
  start: number;
  dur: number;
}
export interface DeepDive {
  nodeId: string;
  queue: Question[];
  idx: number;
  repeats: number;
}
export interface AnswerResult {
  correct: boolean;
  correctIndex: number;
  reopened: boolean;
  verified: boolean;
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () => Math.random().toString(36).slice(2, 10);
const key = (roll: string, hash: string) => `sm.snap.${roll}.${hash}`;

function load(roll: string, hash?: string): Snapshot | null {
  try {
    const h = hash ?? localStorage.getItem(`sm.last.${roll}`);
    if (!h) return null;
    const raw = localStorage.getItem(key(roll, h));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
function persist(s: Snapshot) {
  try {
    localStorage.setItem(key(s.session.rollNumber, s.session.syllabusHash), JSON.stringify(s));
    localStorage.setItem(`sm.last.${s.session.rollNumber}`, s.session.syllabusHash);
    localStorage.setItem('sm.lastRoll', s.session.rollNumber);
  } catch {
    /* storage full or blocked: session still works in memory */
  }
}

interface Draft {
  name: string;
  roll: string;
  hash: string;
  graph: ConceptGraph;
  live: boolean;
  bank?: Question[]; // pre-generated questions when the syllabus came from data/
}

interface AppState {
  snap: Snapshot | null;
  draft: Draft | null;
  banner: Banner | null;
  pulses: Record<string, Pulse>;
  deep: DeepDive | null;
  busy: string | null;
  notice: string | null;
  focusId: string | null; // topic the graph has drilled into (null = whole syllabus)
  reportScope: string | null; // topic the report is limited to (null = whole syllabus)

  setFocus: (id: string | null) => void;
  setReportScope: (id: string | null) => void;
  expand: (nodeId: string) => Promise<boolean>;
  intake: (a: { name: string; roll: string; text: string; bundleId?: string }) => Promise<'loaded' | 'review' | 'error'>;
  resumeLast: () => boolean;
  editDraft: (fn: (g: ConceptGraph) => ConceptGraph) => void;
  freeze: () => Promise<void>;
  ensurePool: (nodeId: string) => Promise<Question[]>;
  nextDiagnosticQuestion: () => Promise<Question | null>;
  answer: (q: Question, chosen: number, conf: Confidence, phase: 'diagnostic' | 'deepdive') => AnswerResult;
  markDiagnosticDone: () => void;
  startDeepDive: (nodeId: string) => Promise<boolean>;
  advanceDeep: () => void;
  endDeepDive: () => void;
  dismissBanner: () => void;
  signOut: () => void;
}

export const useApp = create<AppState>((set, get) => {
  const commit = (fn: (s: Snapshot) => Snapshot) => {
    const cur = get().snap;
    if (!cur) return;
    const next = fn(cur);
    next.session = { ...next.session, lastActiveAt: new Date().toISOString() };
    persist(next);
    set({ snap: next });
  };

  const applyPropagation = (sourceId: string, delta: number, js: NeighborJudgment[]) => {
    const snap = get().snap;
    if (!snap) return;
    const edges = snap.graph.edges;
    const nbs = neighborsOf(sourceId, edges);
    js.forEach((j, i) => {
      const run = () => {
        const nb = nbs.find((n) => n.nodeId === j.nodeId);
        const cur = get().snap;
        if (!nb || !cur) return;
        const belief = cur.beliefs[j.nodeId] ?? newBelief();
        const { belief: nb2, applied } = applyNudge(belief, delta, j.weight);
        const dependent = nb.edge.from === sourceId;
        const now = performance.now();
        set((s) => ({
          pulses: {
            ...s.pulses,
            [`${nb.edge.from}>${nb.edge.to}`]: { from: sourceId, to: j.nodeId, start: now, dur: reduced() ? 0 : 900 },
          },
        }));
        window.setTimeout(() => {
          set((s) => {
            const p = { ...s.pulses };
            delete p[`${nb.edge.from}>${nb.edge.to}`];
            return { pulses: p };
          });
        }, 1400);
        commit((s) => ({
          ...s,
          beliefs: { ...s.beliefs, [j.nodeId]: nb2 },
          log: [
            ...s.log,
            {
              type: 'propagation',
              id: uid(),
              at: new Date().toISOString(),
              sourceNodeId: sourceId,
              targetNodeId: j.nodeId,
              edgeWeight: nb.edge.weight,
              modelWeight: j.weight,
              rawDelta: delta,
              appliedDelta: applied,
              reason: j.reason || (dependent ? 'depends on it' : 'prerequisite of it'),
            },
          ],
        }));
      };
      if (reduced()) run();
      else window.setTimeout(run, 500 + i * 300);
    });
  };

  return {
    snap: null,
    draft: null,
    banner: null,
    pulses: {},
    deep: null,
    busy: null,
    notice: null,
    focusId: null,
    reportScope: null,

    setFocus: (id) => set({ focusId: id }),
    setReportScope: (id) => set({ reportScope: id }),

    /** Split a topic into sub-topics (model, or curated for the demo). Returns true if it has children afterwards. */
    expand: async (nodeId) => {
      const snap = get().snap!;
      if (childrenOf(snap.graph, nodeId).length) return true;
      const node = snap.graph.nodes.find((n) => n.id === nodeId)!;
      if (ancestorsOf(snap.graph, nodeId).length >= 2) return false; // keep the tree shallow
      if ((snap.graph.source === 'demo' || snap.graph.source === 'bundle') && node.parentId) return false;
      set({ busy: `Breaking ${node.label} into sub-topics…` });
      const { subs, live, error } = await proposeSubtopics(snap.graph, node);
      set({ busy: null });
      if (!subs.length) return false;
      if (!live && snap.graph.source !== 'demo') {
        set({ notice: hasModel() ? `Model call failed (${error}). Using generic sub-topics and self-check questions.` : 'No OpenAI key: using generic sub-topics. Add a key to .env.local for real ones.' });
      }
      commit((s) => ({
        ...s,
        graph: { ...s.graph, nodes: [...s.graph.nodes, ...subs] },
        beliefs: { ...s.beliefs, ...Object.fromEntries(subs.map((n) => [n.id, newBelief()])) },
      }));
      return true;
    },

    intake: async ({ name, roll, text, bundleId }) => {
      const r = roll.trim();
      const bundle = bundleId ? bundleById(bundleId) : undefined;
      const trimmed = bundle ? '' : text.trim();
      const hash = bundle ? hashText(`bundle:${bundle.id}:${bundle.version}:${bundle.generatedAt}`) : trimmed ? hashText(trimmed) : undefined;
      const existing = load(r, hash);
      if (existing) {
        set({ snap: existing, draft: null, notice: `Welcome back ${existing.session.name}. Loaded your saved graph.` });
        return 'loaded';
      }
      if (bundle) {
        set({ draft: { name: name.trim(), roll: r, hash: hash!, graph: structuredClone(bundle.graph), live: true, bank: bundle.questions }, snap: null, focusId: null, notice: null });
        return 'review';
      }
      if (!trimmed) {
        set({ notice: 'No saved graph for this roll number yet. Add your syllabus to build one.' });
        return 'error';
      }
      set({ busy: 'Extracting concept graph…', notice: null });
      try {
        const { graph, live, error } = await extractGraph(trimmed);
        set({
          draft: { name: name.trim(), roll: r, hash: hash!, graph, live },
          busy: null,
          snap: null,
          focusId: null,
          notice: live || graph.source === 'demo' ? null : hasModel() ? `The model call failed (${error}), so topics came from your headings and bullets. Check the key and model names in Settings.` : 'No OpenAI key found, so topics came from your headings and bullets. Put your key in .env.local and restart.',
        });
        return 'review';
      } catch {
        set({ busy: null, notice: 'Graph extraction failed. Try again or paste plain text.' });
        return 'error';
      }
    },

    resumeLast: () => {
      try {
        const roll = localStorage.getItem('sm.lastRoll');
        const s = roll ? load(roll) : null;
        if (s) {
          set({ snap: s });
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    },

    editDraft: (fn) => set((s) => (s.draft ? { draft: { ...s.draft, graph: fn(s.draft.graph) } } : s)),

    freeze: async () => {
      const d = get().draft;
      if (!d) return;
      const graph: ConceptGraph = { ...d.graph, edges: sanitizeEdges(d.graph) };
      let pools: Record<string, Question[]> = {};
      if (d.bank) {
        for (const q of d.bank) (pools[q.nodeId] ??= []).push(q);
      } else if (graph.source !== 'demo' && hasModel()) {
        // Generate the whole bank in one pass (a few parallel batched calls) instead of one call per topic later.
        set({ busy: 'Preparing the question bank…' });
        const r = await generateBank(graph, (done, total) => set({ busy: `Preparing the question bank (${done}/${total})…` }));
        pools = r.pools;
        const topics = graph.nodes.filter((n) => !n.parentId).length;
        set({ busy: null, notice: r.covered < topics ? `Questions were generated for ${r.covered} of ${topics} topics${r.error ? ` (${r.error})` : ''}. The rest use self-checks until a retry works.` : null });
      }
      const ids = new Set(graph.nodes.map((n) => n.id));
      pools = Object.fromEntries(Object.entries(pools).filter(([k]) => ids.has(k)));
      const snap: Snapshot = {
        session: { rollNumber: d.roll, name: d.name, syllabusHash: d.hash, graphId: graph.id, lastActiveAt: new Date().toISOString() },
        graph,
        beliefs: Object.fromEntries(graph.nodes.map((n) => [n.id, newBelief()])),
        log: [],
        pools,
        asked: [],
        diagnosticDone: false,
      };
      persist(snap);
      set({ snap, draft: null, focusId: null });
    },

    ensurePool: async (nodeId) => {
      const snap = get().snap!;
      if (snap.pools[nodeId]) return snap.pools[nodeId];
      const node = snap.graph.nodes.find((n) => n.id === nodeId)!;
      set({ busy: `Preparing questions for ${node.label}…` });
      const { questions, live } = await buildQuestionPool(snap.graph, node);
      set({ busy: null });
      if (!live && snap.graph.source !== 'demo' && !get().notice) {
        set({ notice: 'Model unavailable: using self-check questions. Add an OpenAI key in .env.local or Settings for real questions.' });
      }
      commit((s) => ({ ...s, pools: { ...s.pools, [nodeId]: questions } }));
      return questions;
    },

    /**
     * Adaptive diagnostic. Each topic starts at level 2; a correct answer steps up to level 3, a wrong one
     * steps down to level 1. A topic is settled after two answers, or one decisive (confident) answer.
     */
    nextDiagnosticQuestion: async () => {
      const level = (q: Question) => q.level ?? 2;
      for (const id of diagnosticOrder(get().snap!.graph)) {
        const cur = get().snap!;
        if (isSettled(cur.beliefs[id] ?? newBelief())) continue;
        const pool = await get().ensurePool(id);
        const asked = new Set(get().snap!.asked);
        const cand = pool.filter((q) => q.kind !== 'contrast' && !asked.has(q.id));
        if (!cand.length) continue;
        const last = [...cur.log].reverse().find((e): e is AnswerEntry => e.type === 'answer' && e.nodeId === id);
        const target = !last ? 2 : last.correct ? 3 : 1;
        return cand.slice().sort((x, y) => Math.abs(level(x) - target) - Math.abs(level(y) - target))[0];
      }
      return null;
    },

    answer: (q, chosen, conf, phase) => {
      const snap = get().snap!;
      const before = snap.beliefs[q.nodeId] ?? newBelief();
      const prevState = deriveState(before);
      const prevBase = baseMastery(before);
      const correct = chosen === q.correctIndex;
      let after = updateBelief(before, correct, conf, q.level ?? 2);
      const log: LogEntry[] = [];
      const now = new Date().toISOString();
      let reopened = false;
      let verified = false;
      const label = snap.graph.nodes.find((n) => n.id === q.nodeId)?.label ?? q.nodeId;

      // Deterministic backward transition: a plain comparison against the stored answer key.
      // A control question is ordinary evidence: passing it alone proves nothing, failing it is not a reopen.
      if (q.kind === 'contrast' && q.role !== 'control' && phase === 'deepdive') {
        if (!correct && (prevBase >= 0.6 || prevState === 'solid' || prevState === 'verified')) {
          after = { ...after, verified: false, reopened: true, beta: after.beta + 1.5 };
          reopened = true;
          const controlIds = new Set((snap.pools[q.nodeId] ?? []).filter((p) => p.pairId === q.pairId && p.role === 'control').map((p) => p.id));
          const guessed = !!q.pairId && snap.log.some((e) => e.type === 'answer' && e.correct && controlIds.has(e.questionId));
          const why = q.misconceptions?.[chosen] ? ` (holds ${q.misconceptions[chosen]})` : '';
          log.push({ type: 'reopen', id: uid(), at: now, nodeId: q.nodeId, questionId: q.id, reason: `contrast pair failed while ${label} looked ${prevState}${why}${guessed ? '; control passed but discriminating failed, the signature of a guess' : ''}; down-weighted` });
        } else if (correct && baseMastery(after) > 0.7 && after.answers >= 2) {
          after = { ...after, verified: true, reopened: false };
          verified = true;
          log.push({ type: 'verify', id: uid(), at: now, nodeId: q.nodeId, reason: 'passed the contrast question on a fresh scenario' });
        }
      }

      const entry: AnswerEntry = {
        type: 'answer', id: uid(), at: now, nodeId: q.nodeId, questionId: q.id, questionText: q.text,
        chosen: q.options[chosen], correct, confidence: conf, masteryBefore: prevBase, masteryAfter: baseMastery(after), kind: q.kind, phase,
        misconceptionId: !correct ? q.misconceptions?.[chosen] ?? undefined : undefined,
      };
      commit((s) => ({
        ...s,
        beliefs: { ...s.beliefs, [q.nodeId]: after },
        asked: s.asked.includes(q.id) ? s.asked : [...s.asked, q.id],
        log: [...s.log, entry, ...log],
      }));

      if (reopened) set({ banner: { kind: 'reopen', at: Date.now(), text: `REOPENED: contrast pair failed → ${label} down-weighted` } });
      else if (verified) set({ banner: { kind: 'verify', at: Date.now(), text: `VERIFIED: ${label} passed the contrast check` } });

      // Propagate from the top-level topic this question belongs to, using its pooled (rolled-up) change.
      const g = snap.graph;
      const root = rootOf(g, q.nodeId);
      const delta = baseMastery(rollup(g, { ...snap.beliefs, [q.nodeId]: after })[root]) - baseMastery(rollup(g, snap.beliefs)[root]);
      if (Math.abs(delta) > 0.001) {
        const nbs = neighborsOf(root, g.edges);
        judgePropagation(g, root, delta, nbs).then((js) => applyPropagation(root, delta, js));
      }
      return { correct, correctIndex: q.correctIndex, reopened, verified };
    },

    markDiagnosticDone: () => commit((s) => ({ ...s, diagnosticDone: true })),

    /**
     * Deep-dive on ONE topic. The graph drills into it (splitting it into sub-topics if needed) and every
     * question comes from that topic's own subtree. Neighbouring topics are never quizzed.
     */
    startDeepDive: async (nodeId) => {
      await get().expand(nodeId);
      const g0 = get().snap!.graph;
      const kids = childrenOf(g0, nodeId);
      const scope = kids.length ? kids.map((k) => k.id) : [nodeId];
      for (const id of [nodeId, ...scope]) await get().ensurePool(id);
      const s = get().snap!;
      const asked = new Set(s.asked);
      const own = s.pools[nodeId] ?? [];
      const notContrast = (q: Question) => q.kind !== 'contrast';
      const fresh = scope.flatMap((id) => (s.pools[id] ?? []).filter((q) => notContrast(q) && !asked.has(q.id)));
      if (kids.length) fresh.push(...own.filter((q) => q.kind === 'probe' && !asked.has(q.id)));
      let queue = fresh.slice(0, 8);
      let repeats = 0;
      if (queue.length < 5) {
        const again = scope.flatMap((id) => (s.pools[id] ?? []).filter((q) => notContrast(q) && asked.has(q.id))).slice(0, 5 - queue.length);
        repeats = again.length;
        queue = [...queue, ...again];
      }
      // The topic's own contrast pair goes last: control first, discriminating at the very end.
      const contrasts = own.filter((q) => q.kind === 'contrast').sort((a, b) => (a.role === 'control' ? -1 : 0) - (b.role === 'control' ? -1 : 0));
      const pick = contrasts.filter((q) => !asked.has(q.id));
      const finals = pick.length ? pick : contrasts.slice(-1);
      repeats += finals.filter((q) => asked.has(q.id)).length;
      queue = [...queue, ...finals].slice(0, 10);
      if (!queue.length) {
        set({ notice: 'No questions available for this topic.' });
        return false;
      }
      const node = s.graph.nodes.find((n) => n.id === nodeId)!;
      set({ deep: { nodeId, queue, idx: 0, repeats }, banner: null, focusId: kids.length ? nodeId : node.parentId ?? nodeId });
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
        const last = [...(s.snap?.log ?? [])].reverse().find((e): e is AnswerEntry => e.type === 'answer' && e.questionId === cur.id);
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
    signOut: () => set({ snap: null, draft: null, deep: null, banner: null, pulses: {}, notice: null, focusId: null, reportScope: null }),
  };
});

/* ---- draft editing helpers (pure) ---- */
export const draftOps = {
  rename: (g: ConceptGraph, id: string, label: string): ConceptGraph => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, label } : n)) }),
  removeNode: (g: ConceptGraph, id: string): ConceptGraph => ({ ...g, nodes: g.nodes.filter((n) => n.id !== id && n.parentId !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) }),
  addNode: (g: ConceptGraph, label: string, unit: string): ConceptGraph => {
    const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uid().slice(0, 3)}`;
    const node: ConceptNode = { id, label, unit };
    return { ...g, nodes: [...g.nodes, node] };
  },
  setWeight: (g: ConceptGraph, e: ConceptEdge, w: number): ConceptGraph => ({ ...g, edges: g.edges.map((x) => (x.from === e.from && x.to === e.to ? { ...x, weight: w } : x)) }),
  removeEdge: (g: ConceptGraph, e: ConceptEdge): ConceptGraph => ({ ...g, edges: g.edges.filter((x) => !(x.from === e.from && x.to === e.to)) }),
  addEdge: (g: ConceptGraph, from: string, to: string): ConceptGraph =>
    from === to || g.edges.some((x) => x.from === from && x.to === to) || g.edges.some((x) => x.from === to && x.to === from)
      ? g
      : { ...g, edges: [...g.edges, { from, to, weight: 0.6 }] },
};
