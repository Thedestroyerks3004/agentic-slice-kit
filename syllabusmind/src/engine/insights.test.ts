import { describe, expect, it } from 'vitest';
import { buildFacts, contradictsCorrect, factsSignature, fallbackInsights, INSIGHT_PROMPT, mergeInsights, validateInsights, type Facts } from '../lib/insights';
import { newBelief, updateBelief } from './mastery';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import type { AnswerEntry, LogEntry, NodeBelief } from './types';

const fresh = (): Record<string, NodeBelief> => Object.fromEntries(DBMS_GRAPH.nodes.map((n) => [n.id, newBelief()]));
const miss = (nodeId: string, over: Partial<AnswerEntry> = {}): AnswerEntry => ({
  type: 'answer', id: `${nodeId}-${Math.random()}`, at: '', nodeId, questionId: 'q', questionText: `Question on ${nodeId}?`, chosen: 'Timestamps', correct: false,
  confidence: 'medium', masteryBefore: 0.5, masteryAfter: 0.3, kind: 'diagnostic', phase: 'diagnostic', correctAnswer: 'Circular wait', ...over,
});
const wrongTwice = (b: NodeBelief, conf: 'medium' | 'high' = 'medium') => updateBelief(updateBelief(b, false, conf), false, conf);

/** The Concurrency Control case from the brief: two misses, one confident, both on the same belief. */
function scenario() {
  const b = fresh();
  b.concurrency_control = updateBelief(updateBelief(b.concurrency_control, false, 'high'), false, 'medium');
  const belief = 'Believes timestamp ordering is how deadlocks are detected';
  const log: LogEntry[] = [
    miss('concurrency_control', { questionText: 'A deadlock requires, among others, the condition:', chosen: 'Timestamps', confidence: 'high', belief, explanation: 'Deadlock needs a circular wait among the transactions.' }),
    miss('concurrency_control', { questionText: 'Which condition marks a deadlock?', chosen: 'Timestamp ordering', confidence: 'medium', belief }),
  ];
  return { b, log, belief };
}

describe('facts', () => {
  it('include only topics that need work or are developing and that actually have a miss', () => {
    const { b, log } = scenario();
    b.sql_fundamentals = updateBelief(updateBelief(b.sql_fundamentals, true, 'medium'), true, 'medium'); // strong: excluded
    const f = buildFacts(DBMS_GRAPH, b, log);
    expect(f.topics.map((t) => t.id)).toEqual(['concurrency_control']);
    expect(f.assessed).toBe(2);
    expect(f.total).toBe(14);
    expect(f.topics[0]).toMatchObject({ state: 'weak', danger: true, unlocks: 1, prerequisites: ['Transactions & ACID'] });
    expect(f.topics[0].misses).toHaveLength(2);
  });
  it('are empty when nothing was missed, so there is nothing for the model to explain', () => {
    const b = fresh();
    b.db_fundamentals = updateBelief(updateBelief(b.db_fundamentals, true, 'medium'), true, 'medium');
    expect(buildFacts(DBMS_GRAPH, b, []).topics).toEqual([]);
  });
  it('have a signature that changes only when the answers change', () => {
    const { b, log } = scenario();
    const a = factsSignature(buildFacts(DBMS_GRAPH, b, log));
    expect(factsSignature(buildFacts(DBMS_GRAPH, b, log))).toBe(a);
    expect(factsSignature(buildFacts(DBMS_GRAPH, b, [...log, miss('concurrency_control', { chosen: 'Something else' })]))).not.toBe(a);
  });
});

describe('the deterministic insights, built only from the facts', () => {
  const { b, log, belief } = scenario();
  const f = buildFacts(DBMS_GRAPH, b, log);
  const ins = fallbackInsights(f);
  const t = ins.topics.concurrency_control;

  it('never template a why line: without the model there is none, so the page says unavailable', () => {
    expect(t.why).toEqual(['', '']);
  });
  it('find the shared thread only when the misses share a belief', () => {
    expect(t.thread).toBe('Both misses point to the same gap: you believe timestamp ordering is how deadlocks are detected.');
    const different = fallbackInsights({ ...f, topics: [{ ...f.topics[0], misses: [f.topics[0].misses[0], { ...f.topics[0].misses[1], belief: 'Believes something unrelated' }] }] });
    expect(different.topics.concurrency_control.thread).toBeNull();
    const single = fallbackInsights({ ...f, topics: [{ ...f.topics[0], misses: [f.topics[0].misses[0]] }] });
    expect(single.topics.concurrency_control.thread).toBeNull();
  });
  it('use the question explanation for the idea, or fall back to what the topic covers', () => {
    expect(t.explainer).toBe('Deadlock needs a circular wait among the transactions.');
    const noExplanation = fallbackInsights({ ...f, topics: [{ ...f.topics[0], misses: f.topics[0].misses.map((m) => ({ ...m, explanation: undefined })) }] });
    expect(noExplanation.topics.concurrency_control.explainer).toContain('This topic covers:');
  });
  it('comment on a confident mistake specifically, using how sure the student was, and only for such topics', () => {
    expect(t.confident).toContain('certain on 1 and fairly sure on 1');
    expect(t.confident).toContain('mental model that needs correcting');
    const calm = fallbackInsights({ ...f, topics: [{ ...f.topics[0], danger: false }] });
    expect(calm.topics.concurrency_control.confident).toBeNull();
  });
  it('explain the ordering for this result: what the topic blocks, the confident mistake and the shared idea', () => {
    expect(t.start).toBe('Start here — Concurrency Control blocks 1 other topic, and you were sure on a wrong answer; both misses were on the same idea.');
  });
  it('give a start line only to the first topic, and only if it needs work', () => {
    const two: Facts = { ...f, topics: [f.topics[0], { ...f.topics[0], id: 'normalization', label: 'Normalization' }] };
    const i2 = fallbackInsights(two);
    expect(i2.topics.concurrency_control.start).not.toBeNull();
    expect(i2.topics.normalization.start).toBeNull();
    const shaky = fallbackInsights({ ...f, topics: [{ ...f.topics[0], state: 'shaky' }] });
    expect(shaky.topics.concurrency_control.start).toBeNull();
  });
  it('write one takeaway that says how many topics it rests on and cautions when few', () => {
    expect(ins.takeaway).toBe('Based on 1 topic, Concurrency Control needs the most work: you believe timestamp ordering is how deadlocks are detected. Worth confirming with a few more questions before trusting this.');
    expect(ins.source).toBe('auto');
  });
  it('drop the caution once enough topics are assessed, and cover the no-data and nothing-flagged cases', () => {
    expect(fallbackInsights({ ...f, assessed: 8 }).takeaway).not.toContain('Worth confirming');
    expect(fallbackInsights({ assessed: 0, total: 14, topics: [] }).takeaway).toContain('Answer a few questions');
    expect(fallbackInsights({ assessed: 5, total: 14, topics: [] }).takeaway).toContain('nothing is flagged');
  });
});

describe('the model call', () => {
  const { b, log } = scenario();
  const f = buildFacts(DBMS_GRAPH, b, log);
  const fb = fallbackInsights(f);
  const good = {
    takeaway: 'Based on 1 topic, your gap is in the conditions for deadlock, not lock syntax.',
    topics: [{ id: 'concurrency_control', why: ['Timestamps belong to timestamp ordering, a protocol that prevents deadlock, not a condition for it. You are mixing up a prevention technique with the definition.', 'Timestamp ordering orders transactions; it is not what makes a deadlock, which needs a circular wait.'], thread: 'Both misses are about deadlock conditions.', explainer: 'A deadlock needs a cycle of waits.', confident: 'You were sure, and wrong.', start: 'Start here because it blocks another topic.' }],
  };
  it('puts only the facts in the prompt, and tells the model not to invent any', () => {
    const p = INSIGHT_PROMPT(f);
    expect(p).toContain('Use ONLY these facts');
    expect(p).toContain('A deadlock requires, among others, the condition:');
    expect(p).toContain('Circular wait');
    expect(p).not.toContain('mastery');
    expect(p).toContain('what the option the student chose');
    expect(p).toContain('Never just say the option is wrong');
  });
  it('accepts a well-formed reply and merges it over the deterministic text', () => {
    const parsed = validateInsights(f)(good)!;
    const m = mergeInsights(fb, parsed);
    expect(m.source).toBe('agent');
    expect(m.takeaway).toBe(good.takeaway);
    expect(m.topics.concurrency_control.why[0]).toBe(good.topics[0].why[0]);
    expect(m.topics.concurrency_control.thread).toBe('Both misses are about deadlock conditions.');
  });
  it('rejects a reply with no takeaway or no topics', () => {
    expect(validateInsights(f)(null)).toBeNull();
    expect(validateInsights(f)({ takeaway: '', topics: [] })).toBeNull();
    expect(validateInsights(f)({ takeaway: 'x' })).toBeNull();
  });
  it('ignores topics that are not in the facts, so the model cannot add findings', () => {
    const parsed = validateInsights(f)({ ...good, topics: [...good.topics, { id: 'made_up', explainer: 'invented' }] })!;
    expect(Object.keys(parsed.topics)).toEqual(['concurrency_control']);
  });
  it('keeps the deterministic line wherever the model left a hole or wrote something unusable', () => {
    const parsed = validateInsights(f)({ takeaway: 'ok', topics: [{ id: 'concurrency_control', why: ['Timestamps belong to timestamp ordering, a protocol that prevents deadlock, not a condition for it.'], explainer: '   ', thread: null }] })!;
    const m = mergeInsights(fb, parsed);
    expect(m.topics.concurrency_control.why[0]).toContain('Timestamps belong');
    expect(m.topics.concurrency_control.why[1]).toBe('');
    expect(m.topics.concurrency_control.explainer).toBe(fb.topics.concurrency_control.explainer);
  });
  it('does not let the model add a thread, a confident note or a start line the data does not support', () => {
    const single = { ...f, topics: [{ ...f.topics[0], misses: [f.topics[0].misses[0]], danger: false }, { ...f.topics[0], id: 'normalization', label: 'Normalization', danger: false }] };
    const parsed = validateInsights(single)({
      takeaway: 'ok',
      topics: [
        { id: 'concurrency_control', why: ['a'], thread: 'invented shared gap', explainer: 'e', confident: 'invented confident note', start: 'go' },
        { id: 'normalization', why: ['a', 'b'], thread: 'x', explainer: 'e', confident: 'y', start: 'invented start' },
      ],
    })!;
    expect(parsed.topics.concurrency_control.thread).toBeNull();
    expect(parsed.topics.concurrency_control.confident).toBeNull();
    expect(parsed.topics.concurrency_control.start).toBe('go');
    expect(parsed.topics.normalization.start).toBeNull();
  });
});

describe('confidence and correctness together', () => {
  const { b, log } = scenario();
  const f = buildFacts(DBMS_GRAPH, b, log);
  it('reads two same-confidence misses as a pattern, with the score drop', () => {
    const same = { ...f.topics[0], misses: f.topics[0].misses.map((m) => ({ ...m, confidence: 'medium' as const })) };
    const t = fallbackInsights({ ...f, topics: [same] }).topics.concurrency_control.trend!;
    expect(t).toContain('stayed the same across both misses (fairly sure)');
    expect(t).toContain('dropped from 50% to 30%');
  });
  it('reads varied confidence as a one-off, and stays silent for one miss or all guesses', () => {
    expect(fallbackInsights(f).topics.concurrency_control.trend).toContain('one-off');
    const one = { ...f.topics[0], misses: [f.topics[0].misses[0]] };
    expect(fallbackInsights({ ...f, topics: [one] }).topics.concurrency_control.trend).toBeNull();
    const guess = { ...f.topics[0], misses: f.topics[0].misses.map((m) => ({ ...m, confidence: 'low' as const })) };
    expect(fallbackInsights({ ...f, topics: [guess] }).topics.concurrency_control.trend).toBeNull();
  });
  it('explains the score movement once, only when a confident miss exists', () => {
    expect(fallbackInsights(f).scoreNote).toContain('confident wrong answer lowers it more');
    const guess = { ...f.topics[0], misses: f.topics[0].misses.map((m) => ({ ...m, confidence: 'low' as const })) };
    expect(fallbackInsights({ ...f, topics: [guess] }).scoreNote).toBeNull();
  });
});

describe('a why line must be a real explanation', () => {
  const f = buildFacts(DBMS_GRAPH, scenario().b, scenario().log);
  it('drops a model reply that only restates the wrong option', () => {
    const p = validateInsights(f)({ takeaway: 'ok', topics: [{ id: 'concurrency_control', why: ['"Timestamps" is not the right answer here.', 'Timestamp ordering orders transactions by start time; a deadlock instead needs a circular wait, so you are mixing up a protocol with a condition.'] }] })!;
    expect(p.topics.concurrency_control.why).toEqual(['', expect.stringContaining('circular wait')]);
  });
});

describe('the correct-answer contradiction guard', () => {
  it('passes when an explicit "correct answer is" claim matches, or when nothing is explicitly claimed', () => {
    expect(contradictsCorrect('The correct answer is "Circular wait", not Timestamps.', 'Circular wait')).toBe(false);
    expect(contradictsCorrect('Timestamps belong to timestamp ordering, not a condition for deadlock.', 'Circular wait')).toBe(false);
    expect(contradictsCorrect('Anything at all', undefined)).toBe(false);
  });
  it('flags an explicit claim that names a different correct answer than the one we gave the model', () => {
    expect(contradictsCorrect('The correct option is "Two-phase locking".', 'Circular wait')).toBe(true);
  });
  it('is wired into validateInsights: a contradicting why line is dropped like an unreal one', () => {
    const f = buildFacts(DBMS_GRAPH, scenario().b, scenario().log);
    const parsed = validateInsights(f)({
      takeaway: 'ok',
      topics: [{
        id: 'concurrency_control',
        why: [
          'The correct option is "Two-phase locking", not Timestamps, which instead orders transactions by start time rather than marking a deadlock.',
          'Timestamp ordering orders transactions by start time; a deadlock instead needs a circular wait, so you are mixing up a protocol with a condition.',
        ],
      }],
    })!;
    expect(parsed.topics.concurrency_control.why).toEqual(['', expect.stringContaining('circular wait')]);
  });
});
