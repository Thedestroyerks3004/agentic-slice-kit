import { describe, expect, it } from 'vitest';
import { certainty, evidenceLevel, newBelief, updateBelief } from './mastery';
import { HARD_EDGE, importance, isCheckpoint, isHardEdge } from './graph';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import type { NodeBelief } from './types';

const answers = (n: number, rightCount: number): NodeBelief => {
  let b = newBelief();
  for (let i = 0; i < n; i++) b = updateBelief(b, i < rightCount, 'medium');
  return b;
};

describe('ring thickness: how much to trust the score', () => {
  it('is zero with no evidence and grows with more answers', () => {
    expect(certainty(newBelief())).toBe(0);
    expect(certainty(answers(1, 1))).toBeLessThan(certainty(answers(2, 2)));
    expect(certainty(answers(2, 2))).toBeLessThan(certainty(answers(5, 5)));
  });
  it('is higher when the answers agree than when they are mixed, at the same count', () => {
    expect(certainty(answers(6, 6))).toBeGreaterThan(certainty(answers(6, 3)));
    expect(certainty(answers(6, 0))).toBeGreaterThan(certainty(answers(6, 3)));
  });
  it('stays within 0 to 1', () => {
    for (let n = 0; n < 40; n++) {
      const c = certainty(answers(n, n));
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
  it('is described in words for the tooltip: answered once is low, five consistent is high', () => {
    expect(evidenceLevel(newBelief())).toBe('none');
    expect(evidenceLevel(answers(1, 1))).toBe('low');
    expect(evidenceLevel(answers(5, 5))).toBe('high');
  });
});

describe('node size: importance in the syllabus', () => {
  const imp = (id: string) => importance(DBMS_GRAPH, id);
  it('makes hubs bigger than leaves', () => {
    expect(imp('relational_model')).toBeGreaterThan(imp('sql_fundamentals'));
    expect(imp('relational_model')).toBeGreaterThan(imp('normalization'));
    expect(imp('db_fundamentals')).toBeGreaterThan(imp('advanced_sql'));
  });
  it('counts what builds on a topic indirectly, not just its direct children', () => {
    expect(imp('transactions_acid')).toBeGreaterThan(imp('concurrency_control'));
  });
  it('is always at least 1', () => {
    for (const n of DBMS_GRAPH.nodes) expect(imp(n.id)).toBeGreaterThanOrEqual(1);
  });
});

describe('link style: hard prerequisite or helpful background', () => {
  const hard = DBMS_GRAPH.edges.filter(isHardEdge);
  const soft = DBMS_GRAPH.edges.filter((e) => !isHardEdge(e));
  it('splits the real graph into both kinds, so the two styles both appear', () => {
    expect(hard.length).toBeGreaterThan(0);
    expect(soft.length).toBeGreaterThan(0);
    expect(hard.length + soft.length).toBe(DBMS_GRAPH.edges.length);
  });
  it('treats the core chain as hard and the loose links as soft', () => {
    expect(isHardEdge({ from: 'a', to: 'b', weight: HARD_EDGE })).toBe(true);
    expect(isHardEdge({ from: 'a', to: 'b', weight: HARD_EDGE - 0.01 })).toBe(false);
    const find = (f: string, t: string) => DBMS_GRAPH.edges.find((e) => e.from === f && e.to === t)!;
    expect(isHardEdge(find('transactions_acid', 'concurrency_control'))).toBe(true);
    expect(isHardEdge(find('relational_model', 'storage_indexing'))).toBe(false);
  });
});

describe('node shape: what kind of topic it is', () => {
  it('marks exactly the topics where several lines of learning meet', () => {
    const cps = DBMS_GRAPH.nodes.filter((n) => isCheckpoint(DBMS_GRAPH, n.id)).map((n) => n.id).sort();
    expect(cps).toEqual(['distributed_nosql', 'query_optimization']);
  });
});
