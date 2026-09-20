import { describe, expect, it } from 'vitest';
import { createPersistence, sanitize, type KV } from '../lib/persist';
import { newBelief, updateBelief } from './mastery';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import { backupDeep } from '../lib/backup';
import type { LogEntry } from './types';

const memory = (): KV & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const beliefs = () => Object.fromEntries(DBMS_GRAPH.nodes.map((n) => [n.id, newBelief()]));
const answer = (nodeId: string): LogEntry => ({
  type: 'answer', id: 'a1', at: new Date().toISOString(), nodeId, questionId: 'q1', questionText: 'Q?', chosen: 'x', correct: true,
  confidence: 'medium', masteryBefore: 0.5, masteryAfter: 0.67, kind: 'diagnostic', phase: 'diagnostic',
});
const state = () => {
  const b = beliefs();
  b.relational_model = updateBelief(updateBelief(b.relational_model, true, 'medium'), false, 'high');
  return { student: { name: 'Arjun', roll: '21IT042' }, beliefs: b, log: [answer('relational_model')], diagnosticDone: false, diagQs: {}, deep: null };
};

describe('saving and loading a student', () => {
  it('round-trips beliefs, evidence log and progress flags', () => {
    const p = createPersistence(memory());
    p.save(state());
    const s = p.load('21IT042')!;
    expect(s.student).toEqual({ name: 'Arjun', roll: '21IT042' });
    expect(s.beliefs.relational_model.answers).toBe(2);
    expect(s.beliefs.relational_model.confidentWrong).toBe(1);
    expect(s.log).toHaveLength(1);
    expect(s.diagnosticDone).toBe(false);
  });
  it('keeps a half-finished deep-dive so its generated questions are not lost', () => {
    const p = createPersistence(memory());
    const queue = backupDeep('concurrency_control');
    p.save({ ...state(), deep: { nodeId: 'concurrency_control', queue, idx: 3, source: 'live' } });
    const d = p.load('21IT042')!.deep!;
    expect(d.nodeId).toBe('concurrency_control');
    expect(d.idx).toBe(3);
    expect(d.queue.map((q) => q.id)).toEqual(queue.map((q) => q.id));
  });
  it('treats roll numbers case-insensitively and separates students', () => {
    const p = createPersistence(memory());
    p.save(state());
    p.save({ ...state(), student: { name: 'Meera', roll: '21IT099' } });
    expect(p.load('21it042')?.student.name).toBe('Arjun');
    expect(p.load('21IT099')?.student.name).toBe('Meera');
  });
  it('remembers who was last active, and can forget it without deleting their progress', () => {
    const p = createPersistence(memory());
    p.save(state());
    expect(p.last()).toBe('21IT042');
    p.forgetLast();
    expect(p.last()).toBeNull();
    expect(p.load('21IT042')).not.toBeNull();
  });
  it('clears one student only', () => {
    const p = createPersistence(memory());
    p.save(state());
    p.save({ ...state(), student: { name: 'Meera', roll: '21IT099' } });
    p.clear('21IT042');
    expect(p.load('21IT042')).toBeNull();
    expect(p.load('21IT099')).not.toBeNull();
  });
  it('summarises progress for the returning-student card', () => {
    const p = createPersistence(memory());
    p.save(state());
    const s = p.summary('21IT042')!;
    expect(s).toMatchObject({ name: 'Arjun', roll: '21IT042', answered: 1, total: 14, diagnosticDone: false });
    expect(p.summary('nobody')).toBeNull();
  });
});

describe('defensive loading', () => {
  it('ignores corrupt JSON and unknown versions', () => {
    const kv = memory();
    const p = createPersistence(kv);
    kv.setItem('sm.session.bad', '{not json');
    expect(p.load('bad')).toBeNull();
    kv.setItem('sm.session.old', JSON.stringify({ v: 0, student: { name: 'x', roll: 'old' } }));
    expect(p.load('old')).toBeNull();
    expect(sanitize(null)).toBeNull();
    expect(sanitize({ v: 1, student: { name: 'x', roll: '  ' } })).toBeNull();
  });
  it('repairs beliefs: fills missing topics, resets impossible values, drops unknown topics', () => {
    const s = sanitize({
      v: 1, student: { name: 'A', roll: 'r' },
      beliefs: { normalization: { alpha: 0, beta: -3, answers: 'many' }, ghost_topic: { alpha: 5, beta: 5 }, er_model: { alpha: 3, beta: 1.5, answers: 2.7, correct: 2, confidentWrong: -1, verified: true } },
    })!;
    expect(Object.keys(s.beliefs)).toHaveLength(14);
    expect(s.beliefs.ghost_topic).toBeUndefined();
    expect(s.beliefs.normalization).toEqual(newBelief());
    expect(s.beliefs.db_fundamentals).toEqual(newBelief());
    expect(s.beliefs.er_model).toMatchObject({ alpha: 3, beta: 1.5, answers: 2, correct: 2, confidentWrong: 0, verified: true });
  });
  it('drops log entries and questions that do not belong to the graph or are malformed', () => {
    const good = backupDeep('normalization')[0];
    const s = sanitize({
      v: 1, student: { name: 'A', roll: 'r' },
      log: [answer('normalization'), answer('not_a_topic'), { type: 'bogus', id: 'z', nodeId: 'normalization' }, 'junk'],
      diagQs: { normalization: [good], ghost: [good], er_model: [{ id: 'x', nodeId: 'er_model', text: 't', options: ['a'], correctIndex: 0, kind: 'probe' }] },
      deep: { nodeId: 'normalization', queue: [good, { nonsense: true }], idx: 0 },
    })!;
    expect(s.log).toHaveLength(1);
    expect(Object.keys(s.diagQs)).toEqual(['normalization']);
    expect(s.deep).toBeNull();
  });
  it('clamps a deep-dive position that is out of range', () => {
    const queue = backupDeep('normalization');
    const s = sanitize({ v: 1, student: { name: 'A', roll: 'r' }, deep: { nodeId: 'normalization', queue, idx: 999 } })!;
    expect(s.deep!.idx).toBe(queue.length);
  });
  it('does not throw when storage is unavailable or throws', () => {
    const none = createPersistence(null);
    expect(() => none.save(state())).not.toThrow();
    expect(none.load('x')).toBeNull();
    const broken = createPersistence({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } });
    expect(() => broken.save(state())).not.toThrow();
    expect(broken.load('x')).toBeNull();
    expect(broken.last()).toBeNull();
    expect(() => broken.clear('x')).not.toThrow();
  });
  it('bounds the stored evidence log', () => {
    const log = Array.from({ length: 2500 }, (_, i) => ({ ...answer('normalization'), id: `a${i}` }));
    const p = createPersistence(memory());
    p.save({ ...state(), log });
    expect(p.load('21IT042')!.log).toHaveLength(2000);
  });
});
