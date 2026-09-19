import { describe, expect, it } from 'vitest';
import { deriveState, isSettled, newBelief, updateBelief } from './mastery';
import { layoutLanes } from './graph';
import { cleanSyllabus, normalizeBank, parseQuestion, repairGraph, validateBank, validateEdges } from '../lib/bank';
import type { ConceptGraph, Question } from './types';

const raw = (i: number) => ({ text: `Q${i}?`, options: ['a', 'b', 'c', 'd'], correctIndex: 0, misconceptionIds: [null, 'm_x', 'm_y', 'm_z'], kind: 'probe', level: 3 });

describe('adaptive settling', () => {
  it('one confident answer settles a topic, a hesitant one does not', () => {
    const sure = updateBelief(newBelief(), true, 'high', 2);
    expect(isSettled(sure)).toBe(true);
    expect(deriveState(sure)).toBe('solid');
    const unsure = updateBelief(newBelief(), true, 'medium', 2);
    expect(isSettled(unsure)).toBe(false);
    expect(deriveState(unsure)).toBe('tentative');
    expect(isSettled(updateBelief(unsure, true, 'medium', 3))).toBe(true);
  });
  it('a confident wrong answer settles as weak and flags danger territory', () => {
    const b = updateBelief(newBelief(), false, 'high', 2);
    expect(deriveState(b)).toBe('weak');
    expect(b.confidentWrong).toBe(1);
  });
  it('hard questions count for more than recall', () => {
    const l1 = updateBelief(newBelief(), true, 'medium', 1);
    const l3 = updateBelief(newBelief(), true, 'medium', 3);
    expect(l3.alpha).toBeGreaterThan(l1.alpha);
  });
});

describe('question bank validation', () => {
  it('enforces the level ladder and contrast pair by position', () => {
    const qs = [0, 1, 2, 3, 4].map((i) => parseQuestion('t', raw(i), i)!) as Question[];
    const n = normalizeBank('t', qs);
    expect(n.map((q) => [q.kind, q.level])).toEqual([['diagnostic', 1], ['diagnostic', 2], ['probe', 3], ['contrast', 3], ['contrast', 2]]);
    expect(n[3].role).toBe('discriminating');
    expect(n[4].role).toBe('control');
    expect(n[3].pairId).toBe(n[4].pairId);
  });
  it('shuffles options but keeps the answer key and misconception tags aligned', () => {
    for (let k = 0; k < 20; k++) {
      const q = parseQuestion('t', raw(0), 0)!;
      expect(q.options[q.correctIndex]).toBe('a');
      expect(q.misconceptions![q.correctIndex]).toBeNull();
      const wrong = q.options.findIndex((o) => o === 'b');
      expect(q.misconceptions![wrong]).toBe('m_x');
    }
  });
  it('rejects malformed questions', () => {
    expect(parseQuestion('t', { text: 'x', options: ['a', 'a', 'b', 'c'], correctIndex: 0 }, 0)).toBeNull();
    expect(parseQuestion('t', { text: 'x', options: ['a', 'b'], correctIndex: 0 }, 0)).toBeNull();
    expect(parseQuestion('t', { text: 'x', options: ['a', 'b', 'c', 'd'], correctIndex: 9 }, 0)).toBeNull();
  });
  it('drops topics with too few valid questions', () => {
    const v = validateBank(['a', 'b'])({ topics: [{ id: 'a', questions: [raw(0), raw(1), raw(2), raw(3), raw(4)] }, { id: 'b', questions: [raw(0)] }] });
    expect(Object.keys(v!)).toEqual(['a']);
  });
});

describe('graph repair and layout', () => {
  const g: ConceptGraph = {
    id: 'g', title: 'g', source: 'llm',
    nodes: [
      { id: 'a', label: 'A', unit: 'U1' }, { id: 'b', label: 'B', unit: 'U1' }, { id: 'c', label: 'C', unit: 'U2' }, { id: 'd', label: 'D', unit: 'U2' },
    ],
    edges: [{ from: 'a', to: 'b', weight: 0.8 }],
  };
  it('attaches unlinked topics so nothing floats alone', () => {
    const r = repairGraph(g);
    for (const n of g.nodes) expect(r.edges.some((e) => e.from === n.id || e.to === n.id)).toBe(true);
  });
  it('rejects an edge list that is far too sparse, and unknown ids', () => {
    expect(validateEdges(g)({ edges: [{ from: 'a', to: 'zzz', weight: 1 }] })).toBeNull();
  });
  it('puts each unit in its own lane, top to bottom, with no overlapping nodes', () => {
    const { pos, lanes } = layoutLanes(repairGraph(g));
    expect(lanes.map((l) => l.unit)).toEqual(['U1', 'U2']);
    expect(lanes[0].y1).toBeLessThan(lanes[1].y0);
    const keys = new Set(Object.values(pos).map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(4);
  });
});

describe('syllabus cleaning', () => {
  it('removes practicals, activities and references but keeps units', () => {
    const t = 'UNIT I BASICS 9L\nTopic A – Topic B\nPRACTICALS:\n1. Do a lab\nSuggested Activities:\n● activity\nUNIT II MORE\nTopic C\nTEXT BOOKS:\n1. Some Book';
    const c = cleanSyllabus(t);
    expect(c).toContain('Topic A');
    expect(c).toContain('Topic C');
    expect(c).not.toContain('lab');
    expect(c).not.toContain('activity');
    expect(c).not.toContain('Some Book');
  });
});

import { tolerantParse } from '../lib/bank';
describe('tolerant JSON', () => {
  it('repairs a doubled brace, trailing commas, unquoted keys and surrounding prose', () => {
    expect(tolerantParse('{\n{\n  "topics": [ {"id":"1"}, ],\n}')).toEqual({ topics: [{ id: '1' }] });
    expect(tolerantParse('Here you go: {"a":1,}')).toEqual({ a: 1 });
    expect(tolerantParse('{ level: 2, "text": "x" }')).toEqual({ level: 2, text: 'x' });
  });
  it('still throws when there is no JSON at all', () => {
    expect(() => tolerantParse('I cannot do that')).toThrow();
  });
});
