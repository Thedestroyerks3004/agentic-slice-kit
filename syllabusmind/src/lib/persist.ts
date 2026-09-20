/**
 * Per-student saved state, kept in the browser and keyed by roll number. It survives a refresh and a
 * return visit on the same browser. Nothing leaves the device. Loading is defensive: a corrupt, outdated
 * or hand-edited entry is repaired or ignored, never trusted.
 */
import type { LogEntry, NodeBelief, Question } from '../engine/types';
import { newBelief } from '../engine/mastery';
import { DBMS_GRAPH } from './dbmsGraph';

export interface SavedDeep {
  nodeId: string;
  queue: Question[];
  idx: number;
  source: 'live' | 'backup';
}
export interface SavedSession {
  v: 1;
  student: { name: string; roll: string };
  beliefs: Record<string, NodeBelief>;
  log: LogEntry[];
  diagnosticDone: boolean;
  diagQs: Record<string, Question[]>; // the diagnostic pair for a topic, so both questions come from one call after a reload
  deep: SavedDeep | null; // a deep-dive in progress, so its freshly generated questions are not lost
  savedAt: string;
}
export interface SessionSummary {
  name: string;
  roll: string;
  answered: number;
  total: number;
  diagnosticDone: boolean;
  savedAt: string;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const PREFIX = 'sm.session.';
const LAST = 'sm.lastRoll';
const NODE_IDS = new Set(DBMS_GRAPH.nodes.map((n) => n.id));
const MAX_LOG = 2000;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);

function cleanBelief(x: unknown): NodeBelief {
  if (!isObj(x)) return newBelief();
  const b = newBelief();
  const alpha = num(x.alpha, b.alpha);
  const beta = num(x.beta, b.beta);
  if (alpha < 1 || beta < 1) return b; // the prior is 1, 1; anything below is corrupt
  return {
    alpha, beta,
    answers: Math.max(0, Math.floor(num(x.answers, 0))),
    correct: Math.max(0, Math.floor(num(x.correct, 0))),
    confidentWrong: Math.max(0, Math.floor(num(x.confidentWrong, 0))),
    verified: x.verified === true,
    reopened: x.reopened === true ? true : undefined,
    reopenCount: Math.max(0, Math.floor(num(x.reopenCount, 0))),
  };
}

const isQuestion = (q: unknown): q is Question =>
  isObj(q) && typeof q.id === 'string' && typeof q.nodeId === 'string' && NODE_IDS.has(q.nodeId) && typeof q.text === 'string' &&
  Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => typeof o === 'string') &&
  typeof q.correctIndex === 'number' && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4 &&
  (q.kind === 'diagnostic' || q.kind === 'probe' || q.kind === 'contrast');

const isLogEntry = (e: unknown): e is LogEntry =>
  isObj(e) && typeof e.id === 'string' && typeof e.nodeId === 'string' && NODE_IDS.has(e.nodeId) && (e.type === 'answer' || e.type === 'reopen' || e.type === 'verify');

/** Turn whatever was stored into a safe session, or null when it cannot be trusted. */
export function sanitize(raw: unknown): SavedSession | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.student)) return null;
  const roll = typeof raw.student.roll === 'string' ? raw.student.roll.trim() : '';
  if (!roll) return null;
  const rawBeliefs = isObj(raw.beliefs) ? raw.beliefs : {};
  const beliefs = Object.fromEntries(DBMS_GRAPH.nodes.map((n) => [n.id, cleanBelief(rawBeliefs[n.id])]));
  const log = (Array.isArray(raw.log) ? raw.log : []).filter(isLogEntry).slice(-MAX_LOG);
  const diagQs: Record<string, Question[]> = {};
  if (isObj(raw.diagQs)) for (const [k, v] of Object.entries(raw.diagQs)) if (NODE_IDS.has(k) && Array.isArray(v) && v.length && v.every(isQuestion)) diagQs[k] = v;
  let deep: SavedDeep | null = null;
  if (isObj(raw.deep) && typeof raw.deep.nodeId === 'string' && NODE_IDS.has(raw.deep.nodeId) && Array.isArray(raw.deep.queue) && raw.deep.queue.length && raw.deep.queue.every(isQuestion)) {
    const idx = Math.floor(num(raw.deep.idx, 0));
    deep = { nodeId: raw.deep.nodeId, queue: raw.deep.queue, idx: Math.min(Math.max(idx, 0), raw.deep.queue.length), source: raw.deep.source === 'backup' ? 'backup' : 'live' };
  }
  return {
    v: 1,
    student: { name: typeof raw.student.name === 'string' && raw.student.name.trim() ? raw.student.name.trim() : roll, roll },
    beliefs, log,
    diagnosticDone: raw.diagnosticDone === true,
    diagQs, deep,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date(0).toISOString(),
  };
}

export function createPersistence(kv: KV | null) {
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback; // storage blocked, full or corrupt: the app keeps working in memory
    }
  };
  const key = (roll: string) => PREFIX + roll.trim().toLowerCase();
  return {
    save(s: { student: { name: string; roll: string } | null; beliefs: Record<string, NodeBelief>; log: LogEntry[]; diagnosticDone: boolean; diagQs: Record<string, Question[]>; deep: SavedDeep | null }) {
      if (!kv || !s.student) return;
      const data: SavedSession = { v: 1, student: s.student, beliefs: s.beliefs, log: s.log.slice(-MAX_LOG), diagnosticDone: s.diagnosticDone, diagQs: s.diagQs, deep: s.deep, savedAt: new Date().toISOString() };
      safe(() => {
        kv.setItem(key(s.student!.roll), JSON.stringify(data));
        kv.setItem(LAST, s.student!.roll);
      }, undefined);
    },
    load(roll: string): SavedSession | null {
      if (!kv || !roll.trim()) return null;
      return safe(() => {
        const raw = kv.getItem(key(roll));
        return raw ? sanitize(JSON.parse(raw)) : null;
      }, null);
    },
    clear(roll: string) {
      if (kv) safe(() => kv.removeItem(key(roll)), undefined);
    },
    last(): string | null {
      return kv ? safe(() => kv.getItem(LAST), null) : null;
    },
    forgetLast() {
      if (kv) safe(() => kv.removeItem(LAST), undefined);
    },
    summary(roll: string): SessionSummary | null {
      const s = this.load(roll);
      if (!s) return null;
      return {
        name: s.student.name, roll: s.student.roll, total: DBMS_GRAPH.nodes.length, diagnosticDone: s.diagnosticDone, savedAt: s.savedAt,
        answered: Object.values(s.beliefs).filter((b) => b.answers > 0).length,
      };
    },
  };
}

const browserKV = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const persistence = createPersistence(browserKV());
