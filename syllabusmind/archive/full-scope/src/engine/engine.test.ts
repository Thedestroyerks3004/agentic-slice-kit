import { describe, expect, it } from 'vitest';
import { baseMastery, deriveState, effectiveMastery, isDanger, newBelief, updateBelief } from './mastery';
import { applyNudge, neighborsOf, NUDGE_MAX } from './propagation';
import { ancestorsOf, depths, diagnosticOrder, rollup, subgraphFor, subtreeIds, topGraph } from './graph';
import type { ConceptGraph } from './types';

const g: ConceptGraph = {
  id: 't',
  title: 't',
  source: 'demo',
  nodes: ['a', 'b', 'c'].map((id) => ({ id, label: id, unit: 'u' })),
  edges: [
    { from: 'a', to: 'b', weight: 0.8 },
    { from: 'b', to: 'c', weight: 0.6 },
  ],
};

describe('mastery', () => {
  it('walks unknown -> tentative -> weak/solid by direct evidence', () => {
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
  it('flags confident-wrong as danger', () => {
    expect(isDanger(updateBelief(newBelief(), false, 'high'))).toBe(true);
  });
});

describe('propagation guardrails', () => {
  it('never makes Unknown Weak, only Tentative', () => {
    const { belief } = applyNudge(newBelief(), -0.5, 1);
    expect(deriveState(belief)).toBe('tentative');
    expect(Math.abs(belief.nudge)).toBeLessThanOrEqual(NUDGE_MAX);
  });
  it('never verifies', () => {
    const b = updateBelief(updateBelief(newBelief(), true, 'high'), true, 'high');
    const { belief } = applyNudge(b, 0.9, 1);
    expect(deriveState(belief)).toBe('solid');
  });
  it('keeps a node inside its own evidence band', () => {
    let b = updateBelief(updateBelief(newBelief(), true, 'medium'), false, 'medium');
    for (let i = 0; i < 20; i++) b = applyNudge(b, -0.9, 1).belief;
    expect(deriveState(b)).toBe('shaky');
    expect(effectiveMastery(b)).toBeGreaterThanOrEqual(0.4);
    expect(baseMastery(b)).toBeCloseTo(0.5);
  });
  it('clamps invalid model weights', () => {
    expect(applyNudge(newBelief(), 0.5, NaN).applied).toBe(0);
    expect(applyNudge(newBelief(), 0.5, 99).applied).toBeLessThanOrEqual(NUDGE_MAX);
  });
});

describe('reopen', () => {
  it('caps a reopened node at shaky until it is re-verified', () => {
    const s = updateBelief(updateBelief(newBelief(), true, 'medium'), true, 'medium');
    expect(deriveState(s)).toBe('solid');
    expect(deriveState({ ...s, reopened: true })).toBe('shaky');
    expect(deriveState({ ...s, reopened: true, verified: true })).toBe('shaky');
    expect(deriveState({ ...s, reopened: false, verified: true })).toBe('verified');
  });
});

describe('graph', () => {
  it('finds neighbours, depths and diagnostic order', () => {
    expect(neighborsOf('b', g.edges).map((n) => n.nodeId).sort()).toEqual(['a', 'c']);
    expect(depths(g)).toEqual({ a: 0, b: 1, c: 2 });
    expect(diagnosticOrder(g)).toEqual(['a', 'b', 'c']);
  });
});

describe('drill-down', () => {
  const h: ConceptGraph = {
    ...g,
    nodes: [...g.nodes, { id: 'a.x', label: 'x', unit: 'u', parentId: 'a' }, { id: 'a.y', label: 'y', unit: 'u', parentId: 'a' }],
  };
  it('keeps sub-topics out of the top-level map and diagnostic', () => {
    expect(topGraph(h).nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(diagnosticOrder(h)).toEqual(['a', 'b', 'c']);
  });
  it('builds a branching subtree and finds ancestors', () => {
    const s = subgraphFor(h, 'a');
    expect(s.nodes.map((n) => n.id)).toEqual(['a', 'a.x', 'a.y']);
    expect(s.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>a.x', 'a>a.y']);
    expect(subtreeIds(h, 'a')).toEqual(['a', 'a.x', 'a.y']);
    expect(ancestorsOf(h, 'a.x')).toEqual(['a']);
  });
  it('rolls child evidence up into the parent', () => {
    const b = { 'a.x': updateBelief(updateBelief(newBelief(), false, 'medium'), false, 'medium') };
    const r = rollup(h, b);
    expect(r.a.answers).toBe(2);
    expect(deriveState(r.a)).toBe('weak');
    expect(deriveState(r.b)).toBe('unknown');
  });
});
