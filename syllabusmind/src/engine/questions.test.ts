import { describe, expect, it } from 'vitest';
import { finalizeDeep, parseQuestion } from '../lib/questions';
import { REHEARSED, backupDeep, backupDiagnostic } from '../lib/backup';
import { tolerantParse } from '../lib/json';
import { DBMS_GRAPH, TRIGGER_NODES } from '../lib/dbmsGraph';

const raw = (t: string) => ({ text: t, options: ['a', 'b', 'c', 'd'], correctIndex: 0, misconceptionIds: [null, 'm_x', 'm_y', 'm_z'], beliefs: [null, 'Believes x', 'Believes y', 'Believes z'], level: 2 });

describe('question parsing', () => {
  it('keeps the answer key and misconception tags aligned after shuffling', () => {
    for (let k = 0; k < 30; k++) {
      const q = parseQuestion('n', raw('Q?'), 'id')!;
      expect(q.options[q.correctIndex]).toBe('a');
      expect(q.misconceptions![q.correctIndex]).toBeNull();
      const wrong = q.options.indexOf('b');
      expect(q.misconceptions![wrong]).toBe('m_x');
      expect(q.beliefs![wrong]).toBe('Believes x');
    }
  });
  it('rejects malformed questions', () => {
    expect(parseQuestion('n', { text: 'x', options: ['a', 'a', 'b', 'c'], correctIndex: 0 }, 'i')).toBeNull();
    expect(parseQuestion('n', { text: 'x', options: ['a', 'b'], correctIndex: 0 }, 'i')).toBeNull();
    expect(parseQuestion('n', { text: 'x', options: ['a', 'b', 'c', 'd'], correctIndex: 4 }, 'i')).toBeNull();
    expect(parseQuestion('n', { text: 'x', options: ['a', 'b', 'c', ''], correctIndex: 0 }, 'i')).toBeNull();
  });
});

describe('backup and rehearsed sets', () => {
  for (const n of DBMS_GRAPH.nodes) {
    it(`${n.id} has a 2-question diagnostic and a 6+ question deep set ending on a contrast`, () => {
      const d = backupDiagnostic(n.id);
      expect(d).toHaveLength(2);
      expect(d.map((q) => q.level)).toEqual([1, 2]);
      const deep = backupDeep(n.id);
      expect(deep.length).toBeGreaterThanOrEqual(6);
      expect(deep.length).toBeLessThanOrEqual(10);
      expect(deep[deep.length - 1].kind).toBe('contrast');
      for (const q of [...d, ...deep]) {
        expect(q.options).toHaveLength(4);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(4);
        expect(new Set(q.options).size).toBe(4);
      }
    });
  }
  it('does not always put the right answer first', () => {
    const idx = new Set(DBMS_GRAPH.nodes.flatMap((n) => backupDeep(n.id).map((q) => q.correctIndex)));
    expect(idx.size).toBeGreaterThan(2);
  });
});

describe('the rehearsed trigger', () => {
  it('has a control and a discriminating question for each trigger topic, sharing a pair id', () => {
    for (const t of TRIGGER_NODES) {
      const p = REHEARSED[t];
      expect(p.control.role).toBe('control');
      expect(p.discriminating.role).toBe('discriminating');
      expect(p.control.pairId).toBe(p.discriminating.pairId);
      expect(p.discriminating.beliefs?.filter(Boolean).length).toBe(3);
    }
  });
  it('always ends a trigger topic on the pre-written pair, even when the live set had its own contrast', () => {
    const live = [
      ...Array.from({ length: 6 }, (_, i) => ({ ...parseQuestion('concurrency_control', raw(`L${i}`), `l${i}`)!, kind: 'probe' as const })),
      { ...parseQuestion('concurrency_control', raw('live control'), 'lc')!, kind: 'contrast' as const, role: 'control' as const },
      { ...parseQuestion('concurrency_control', raw('live disc'), 'ld')!, kind: 'contrast' as const, role: 'discriminating' as const },
    ];
    const out = finalizeDeep('concurrency_control', live);
    expect(out.slice(-2).map((q) => q.id)).toEqual(['rehearsed-cc-control', 'rehearsed-cc-disc']);
    expect(out.length).toBe(8);
  });
  it('keeps a live contrast pair for a topic that is not a trigger', () => {
    const live = [
      ...Array.from({ length: 6 }, (_, i) => ({ ...parseQuestion('normalization', raw(`L${i}`), `l${i}`)!, kind: 'probe' as const })),
      { ...parseQuestion('normalization', raw('c'), 'lc')!, kind: 'contrast' as const, role: 'control' as const },
      { ...parseQuestion('normalization', raw('d'), 'ld')!, kind: 'contrast' as const, role: 'discriminating' as const },
    ];
    expect(finalizeDeep('normalization', live).slice(-2).map((q) => q.id)).toEqual(['lc', 'ld']);
  });
});

describe('tolerant JSON', () => {
  it('repairs a doubled brace, trailing commas, unquoted keys and surrounding prose', () => {
    expect(tolerantParse('{\n{\n  "topics": [ {"id":"1"}, ],\n}')).toEqual({ topics: [{ id: '1' }] });
    expect(tolerantParse('Here you go: {"a":1,}')).toEqual({ a: 1 });
    expect(tolerantParse('{ level: 2, "text": "x" }')).toEqual({ level: 2, text: 'x' });
  });
  it('still throws when there is no JSON', () => {
    expect(() => tolerantParse('I cannot do that')).toThrow();
  });
});
