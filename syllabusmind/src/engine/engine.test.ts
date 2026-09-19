import { describe, expect, it } from 'vitest';
import { deriveState, isDanger, mastery, newBelief, shouldReopen, updateBelief } from './mastery';
import { childrenOf, dependentCount, depths, diagnosticOrder, layoutRadial, neighborhood, parentsOf } from './graph';
import { DBMS_GRAPH, TRIGGER_NODES } from '../lib/dbmsGraph';

describe('mastery', () => {
  it('walks unknown, tentative, then weak or solid by direct evidence', () => {
    let b = newBelief();
    expect(deriveState(b)).toBe('unknown');
    b = updateBelief(b, false, 'medium');
    expect(deriveState(b)).toBe('tentative');
    b = updateBelief(b, false, 'medium');
    expect(deriveState(b)).toBe('weak');
    const s = updateBelief(updateBelief(newBelief(), true, 'medium'), true, 'medium');
    expect(deriveState(s)).toBe('solid');
    expect(deriveState({ ...s, verified: true })).toBe('verified');
  });
  it('counts correct answers and flags a confident wrong answer as danger', () => {
    const b = updateBelief(updateBelief(newBelief(), true, 'low'), false, 'high');
    expect(b.correct).toBe(1);
    expect(b.answers).toBe(2);
    expect(isDanger(b)).toBe(true);
  });
  it('weights harder questions more than recall', () => {
    expect(updateBelief(newBelief(), true, 'medium', 3).alpha).toBeGreaterThan(updateBelief(newBelief(), true, 'medium', 1).alpha);
  });
});

describe('the backward loop check', () => {
  const solid = updateBelief(updateBelief(newBelief(), true, 'medium'), true, 'medium');
  it('reopens a solid node that fails the contrast question, and never on a pass', () => {
    expect(shouldReopen(false, solid)).toBe(true);
    expect(shouldReopen(true, solid)).toBe(false);
  });
  it('does not reopen a node that was already weak', () => {
    const weak = updateBelief(updateBelief(newBelief(), false, 'medium'), false, 'medium');
    expect(shouldReopen(false, weak)).toBe(false);
  });
  it('caps a reopened node at shaky until it passes a contrast check again', () => {
    expect(deriveState({ ...solid, reopened: true })).toBe('shaky');
    expect(deriveState({ ...solid, reopened: true, verified: true })).toBe('shaky');
    expect(deriveState({ ...solid, verified: true })).toBe('verified');
  });
  it('is reachable with the rehearsed recipe: two correct medium answers, then a miss', () => {
    expect(mastery(solid)).toBeGreaterThan(0.6);
  });
});

describe('the fixed DBMS graph', () => {
  const g = DBMS_GRAPH;
  const ids = new Set(g.nodes.map((n) => n.id));
  it('has 14 topics and only edges between known topics', () => {
    expect(g.nodes).toHaveLength(14);
    expect(ids.size).toBe(14);
    for (const e of g.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });
  it('makes relational_model the hub with five children and db_fundamentals the only root', () => {
    expect(childrenOf(g, 'relational_model').sort()).toEqual(['er_model', 'relational_algebra_calculus', 'sql_fundamentals', 'storage_indexing', 'transactions_acid']);
    const d = depths(g);
    expect(g.nodes.filter((n) => d[n.id] === 0).map((n) => n.id)).toEqual(['db_fundamentals']);
    expect(dependentCount(g, 'relational_model')).toBe(5);
  });
  it('gives query_optimization and distributed_nosql two parents, and distributed_nosql no children', () => {
    expect(parentsOf(g, 'query_optimization').sort()).toEqual(['relational_algebra_calculus', 'storage_indexing']);
    expect(parentsOf(g, 'distributed_nosql').sort()).toEqual(['storage_indexing', 'transactions_acid']);
    expect(childrenOf(g, 'distributed_nosql')).toEqual([]);
  });
  it('is acyclic: every depth is finite and parents are shallower than children', () => {
    const d = depths(g);
    for (const e of g.edges) expect(d[e.to]).toBeGreaterThan(d[e.from]);
  });
  it('walks the diagnostic from the root outward', () => {
    const order = diagnosticOrder(g);
    const d = depths(g);
    expect(order[0]).toBe('db_fundamentals');
    for (let i = 1; i < order.length; i++) expect(d[order[i]]).toBeGreaterThanOrEqual(d[order[i - 1]]);
  });
  it('scopes generation context to one hop', () => {
    const n = neighborhood(g, 'concurrency_control');
    expect(n.prereqs.map((x) => x.id)).toEqual(['transactions_acid']);
    expect(n.dependents.map((x) => x.id)).toEqual(['deadlock_recovery']);
  });
  it('has trigger topics that exist', () => {
    for (const t of TRIGGER_NODES) expect(ids.has(t)).toBe(true);
  });
});

describe('radial layout', () => {
  const pos = layoutRadial(DBMS_GRAPH, 150);
  const d = depths(DBMS_GRAPH);
  const r = (id: string) => Math.hypot(pos[id].x, pos[id].y);
  it('anchors the root at the centre and puts each depth on its own ring', () => {
    expect(r('db_fundamentals')).toBeCloseTo(0);
    for (const n of DBMS_GRAPH.nodes) expect(r(n.id)).toBeCloseTo(d[n.id] * 150, 3);
  });
  it('fans the five children of relational_model around the ring instead of stacking them', () => {
    const angles = childrenOf(DBMS_GRAPH, 'relational_model').map((id) => Math.atan2(pos[id].y, pos[id].x));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeGreaterThan(Math.PI); // wider than a half circle
  });
  it('never places two topics on top of each other', () => {
    const ns = DBMS_GRAPH.nodes.map((n) => pos[n.id]);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y)).toBeGreaterThan(60);
  });
});
