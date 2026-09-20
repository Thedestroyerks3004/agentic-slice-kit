import { describe, expect, it } from 'vitest';
import { buildReport, evidenceDetail } from '../lib/report';
import { newBelief, updateBelief } from './mastery';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import type { AnswerEntry, LogEntry, NodeBelief } from './types';

const fresh = (): Record<string, NodeBelief> => Object.fromEntries(DBMS_GRAPH.nodes.map((n) => [n.id, newBelief()]));
const right = (b: NodeBelief) => updateBelief(updateBelief(b, true, 'medium'), true, 'medium');
const wrong = (b: NodeBelief, conf: 'low' | 'medium' | 'high' = 'medium') => updateBelief(updateBelief(b, false, conf), false, conf);
const mixed = (b: NodeBelief) => updateBelief(updateBelief(b, true, 'medium'), false, 'medium');
const entry = (nodeId: string, correct: boolean, over: Partial<AnswerEntry> = {}): AnswerEntry => ({
  type: 'answer', id: `${nodeId}-${Math.random()}`, at: '', nodeId, questionId: 'q', questionText: `Question on ${nodeId}?`, chosen: 'an option', correct,
  confidence: 'medium', masteryBefore: 0.5, masteryAfter: 0.5, kind: 'diagnostic', phase: 'diagnostic', ...over,
});

describe('grouping the results from red to green', () => {
  it('starts with everything unassessed and no weakest topic', () => {
    const r = buildReport(DBMS_GRAPH, fresh());
    expect(r.unassessed).toHaveLength(14);
    expect(r.needs).toHaveLength(0);
    expect(r.assessed).toBe(0);
    expect(r.coverage).toBe(0);
    expect(r.weakest).toBeNull();
  });
  it('sorts topics into needs work, developing and strong', () => {
    const b = fresh();
    b.concurrency_control = wrong(b.concurrency_control);
    b.sql_fundamentals = mixed(b.sql_fundamentals);
    b.db_fundamentals = right(b.db_fundamentals);
    const r = buildReport(DBMS_GRAPH, b);
    expect(r.needs.map((x) => x.id)).toEqual(['concurrency_control']);
    expect(r.developing.map((x) => x.id)).toEqual(['sql_fundamentals']);
    expect(r.strong.map((x) => x.id)).toEqual(['db_fundamentals']);
    expect(r.unassessed).toHaveLength(11);
    expect(r.weakest?.id).toBe('concurrency_control');
  });
  it('reports coverage as the share of topics with any answer, so a small sample is visible', () => {
    const b = fresh();
    b.concurrency_control = wrong(b.concurrency_control);
    const r = buildReport(DBMS_GRAPH, b);
    expect(r.assessed).toBe(1);
    expect(r.total).toBe(14);
    expect(Math.round(r.coverage * 100)).toBe(7);
  });
  it('counts a topic with one answer as partly checked, not unassessed', () => {
    const b = fresh();
    b.er_model = updateBelief(b.er_model, true, 'medium');
    const r = buildReport(DBMS_GRAPH, b);
    expect(r.partial.map((x) => x.id)).toEqual(['er_model']);
    expect(r.assessed).toBe(1);
    expect(r.unassessed).toHaveLength(13);
  });
  it('puts confident mistakes first, then the topics more others build on', () => {
    const b = fresh();
    b.transactions_acid = wrong(b.transactions_acid, 'medium'); // builds directly on 2
    b.normalization = wrong(b.normalization, 'high'); // builds on none, but a confident mistake
    b.relational_algebra_calculus = wrong(b.relational_algebra_calculus, 'medium'); // builds on 1
    const r = buildReport(DBMS_GRAPH, b);
    expect(r.needs.map((x) => x.id)).toEqual(['normalization', 'transactions_acid', 'relational_algebra_calculus']);
    expect(r.dangers).toBe(1);
  });
  it('falls back to the weakest developing topic when nothing needs work', () => {
    const b = fresh();
    b.sql_fundamentals = mixed(b.sql_fundamentals);
    expect(buildReport(DBMS_GRAPH, b).weakest?.id).toBe('sql_fundamentals');
  });
});

describe('the evidence behind a result', () => {
  it('has none for an unanswered topic', () => {
    expect(evidenceDetail([], 'er_model')).toBeNull();
  });
  it('lists the actual questions and answers that went wrong, with the right answer and how sure the student was', () => {
    const log: LogEntry[] = [
      entry('concurrency_control', false, { questionText: 'A deadlock requires, among others, the condition:', chosen: 'Preemption', correctAnswer: 'Circular wait', confidence: 'high', belief: 'Believes a blocked transaction is deadlocked' }),
      entry('concurrency_control', false, { questionText: 'Two-phase locking guarantees:', chosen: 'No aborts', confidence: 'medium' }),
    ];
    const d = evidenceDetail(log, 'concurrency_control')!;
    expect(d.headline).toBe('2 of 2 answers wrong · 1 with high confidence');
    expect(d.misses).toHaveLength(2);
    expect(d.misses[0]).toMatchObject({ question: 'A deadlock requires, among others, the condition:', answer: 'Preemption', correct: 'Circular wait', sure: 'You were certain', belief: 'Believes a blocked transaction is deadlocked' });
    expect(d.misses[1]).toMatchObject({ answer: 'No aborts', sure: 'You were fairly sure' });
    expect(d.misses[1].correct).toBeUndefined();
  });
  it('keeps only the three most recent misses', () => {
    const log = Array.from({ length: 5 }, (_, i) => entry('er_model', false, { questionText: `Q${i}` }));
    expect(evidenceDetail(log, 'er_model')!.misses.map((m) => m.question)).toEqual(['Q2', 'Q3', 'Q4']);
  });
  it('reads simply when everything was right, with no misses', () => {
    const d = evidenceDetail([entry('er_model', true), entry('er_model', true)], 'er_model')!;
    expect(d.headline).toBe('2 of 2 answers correct');
    expect(d.misses).toEqual([]);
  });
  it('is singular for one answer, and ignores other topics', () => {
    const log = [entry('er_model', false), entry('normalization', false)];
    expect(evidenceDetail(log, 'er_model')!.headline).toBe('1 of 1 answer wrong');
  });
});
