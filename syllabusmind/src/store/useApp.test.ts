import { describe, expect, it } from 'vitest';
import { useApp, GRAPH } from './useApp';
import { MAX_REOPENS } from '../engine/mastery';
import type { NodeBelief, Question } from '../engine/types';

const NODE = 'concurrency_control';

/** A topic that already looks solid/verified, so a failed discriminating question qualifies to reopen it. */
const solidBelief = (reopenCount = 0): NodeBelief => ({ alpha: 5, beta: 1, answers: 2, correct: 2, confidentWrong: 0, verified: true, reopenCount });

const discQuestion = (id: string): Question => ({
  id, nodeId: NODE, kind: 'contrast', role: 'discriminating', pairId: 'p', text: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 0,
  beliefs: [null, 'Believes something wrong', null, null],
});

const reset = () => useApp.setState({ student: { name: 'T', roll: 'r1' }, beliefs: { ...useApp.getState().beliefs, [NODE]: solidBelief() }, log: [], banner: null });

describe('the reopen cap, separate from the network timeout counter', () => {
  it('reopens on the first qualifying failure and counts it', () => {
    reset();
    const r = useApp.getState().answer(discQuestion('q1'), 1, 'high', 'deepdive');
    expect(r.reopened).toBe(true);
    expect(useApp.getState().beliefs[NODE].reopenCount).toBe(1);
    expect(useApp.getState().beliefs[NODE].reopened).toBe(true);
  });

  it('stops reopening once the cap is hit, but still logs the finding', () => {
    reset();
    useApp.setState((s) => ({ beliefs: { ...s.beliefs, [NODE]: solidBelief(MAX_REOPENS) } }));
    const before = useApp.getState().beliefs[NODE];
    const r = useApp.getState().answer(discQuestion('q2'), 1, 'high', 'deepdive');
    expect(r.reopened).toBe(false); // capped: not reported as a reopen
    expect(useApp.getState().beliefs[NODE].reopenCount).toBe(MAX_REOPENS); // unchanged, never exceeds the cap
    expect(useApp.getState().beliefs[NODE].reopened).toBe(before.reopened); // belief's reopened flag untouched
    const entry = useApp.getState().log.find((e) => e.type === 'reopen');
    expect(entry?.reason).toContain('reopen limit already reached');
  });

  it('is a field on NodeBelief entirely separate from llm.ts\'s network-spend counter', async () => {
    const llm = await import('../lib/llm');
    expect((llm as Record<string, unknown>).timeouts).toBeUndefined(); // not exported: module-private, no shared state with reopenCount
  });
});
