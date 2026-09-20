import { describe, expect, it } from 'vitest';
import { edgeTone } from './edgeTone';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import { deriveState, newBelief, updateBelief } from './mastery';
import { STATE_META } from '../lib/states';

describe('what a link says about the topics it joins', () => {
  it('is a risk chain when both ends need work', () => {
    expect(edgeTone('weak', 'weak')).toBe('risk');
  });
  it('is a concern when only one end needs work, whatever the other end is', () => {
    expect(edgeTone('weak', 'solid')).toBe('concern');
    expect(edgeTone('shaky', 'weak')).toBe('concern');
    expect(edgeTone('unknown', 'weak')).toBe('concern');
  });
  it('is good when both ends are strong, including verified', () => {
    expect(edgeTone('solid', 'solid')).toBe('good');
    expect(edgeTone('verified', 'solid')).toBe('good');
  });
  it('is a watch when both are assessed and at least one is still developing', () => {
    expect(edgeTone('shaky', 'solid')).toBe('watch');
    expect(edgeTone('shaky', 'shaky')).toBe('watch');
  });
  it('stays idle until enough is known, so unchecked parts of the map stay quiet', () => {
    expect(edgeTone('unknown', 'unknown')).toBe('idle');
    expect(edgeTone('solid', 'unknown')).toBe('idle');
    expect(edgeTone('tentative', 'shaky')).toBe('idle');
  });
  it('is symmetric', () => {
    for (const a of ['unknown', 'weak', 'shaky', 'solid', 'verified'] as const)
      for (const b of ['unknown', 'weak', 'shaky', 'solid', 'verified'] as const) expect(edgeTone(a, b)).toBe(edgeTone(b, a));
  });
});

describe('an unchecked topic recedes', () => {
  it('has no evidence, so it is drawn as flat grey and gets no ring, badge or tint', () => {
    const b = newBelief();
    expect(deriveState(b)).toBe('unknown');
    expect(b.answers).toBe(0);
    expect(STATE_META.unknown.label).toBe('Not checked');
  });
  it('the moment it has data it is an assessed state that carries colour', () => {
    const b = updateBelief(updateBelief(newBelief(), false, 'medium'), false, 'medium');
    expect(deriveState(b)).not.toBe('unknown');
  });
});

describe('the map can show a trouble cluster', () => {
  it('the real graph has adjacent topics that can both need work', () => {
    const e = DBMS_GRAPH.edges.find((x) => x.from === 'transactions_acid' && x.to === 'concurrency_control');
    expect(e).toBeTruthy();
    expect(edgeTone('weak', 'weak')).toBe('risk');
  });
});
