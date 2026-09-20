import type { ConceptGraph, NodeBelief } from '../engine/types';
import { deriveState } from '../engine/mastery';
import { diagnosticOrder, parentsOf, unlocks } from '../engine/graph';

export interface Recommendation {
  nodeId: string;
  action: 'check' | 'deeper';
  headline: string;
  reason: string;
  unlocks: number;
}

const needsWork = (b: NodeBelief) => {
  const s = deriveState(b);
  return s === 'weak' || s === 'shaky';
};
const checked = (b: NodeBelief) => b.answers >= 2;
const plural = (n: number) => `${n} ${n === 1 ? 'topic' : 'topics'}`;

/**
 * Where to go next, decided by plain rules (no model). Before the quick check: the next unchecked topic,
 * foundations first. After it: the weakest topic whose own prerequisites are fine, so a student fixes the
 * cause before the symptom.
 */
export function recommendNext(g: ConceptGraph, beliefs: Record<string, NodeBelief>): Recommendation | null {
  const order = diagnosticOrder(g);
  const unchecked = order.filter((id) => !checked(beliefs[id]));
  if (unchecked.length) {
    const id = unchecked[0];
    const n = unlocks(g, id).length;
    const started = order.some((i) => checked(beliefs[i]));
    return {
      nodeId: id,
      action: 'check',
      headline: started ? 'Check next' : 'Start here',
      reason: n ? `It unlocks ${plural(n)}, so much of the rest builds on it.` : 'A quick two-question check.',
      unlocks: n,
    };
  }
  const needy = order.filter((id) => needsWork(beliefs[id]));
  if (!needy.length) return null;
  const foundations = needy.filter((id) => !parentsOf(g, id).some((p) => needsWork(beliefs[p])));
  const pool = foundations.length ? foundations : needy;
  const score = (id: string) => (deriveState(beliefs[id]) === 'weak' ? 2 : 1) * 100 + unlocks(g, id).length;
  const id = pool.reduce((best, cur) => (score(cur) > score(best) ? cur : best), pool[0]);
  const n = unlocks(g, id).length;
  const weak = deriveState(beliefs[id]) === 'weak';
  return {
    nodeId: id,
    action: 'deeper',
    headline: 'Work on this next',
    reason: `${weak ? 'This one needs work' : 'This one is developing'}${n ? `, and ${plural(n)} build on it` : ''}.${foundations.length ? '' : ' Its prerequisites need work too.'}`,
    unlocks: n,
  };
}
