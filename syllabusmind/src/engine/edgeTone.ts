import type { BeliefState } from './types';

/**
 * What a link says about the two topics it joins, so the edges read as part of the map's story.
 * risk: both ends need work (a real chain of trouble). concern: one end needs work.
 * good: both ends are strong. watch: both assessed and at least one still developing.
 * idle: not enough is known yet.
 */
export type EdgeTone = 'risk' | 'concern' | 'good' | 'watch' | 'idle';

const needsWork = (s: BeliefState) => s === 'weak';
const strong = (s: BeliefState) => s === 'solid' || s === 'verified';
const assessed = (s: BeliefState) => s !== 'unknown' && s !== 'tentative';

export function edgeTone(a: BeliefState, b: BeliefState): EdgeTone {
  if (needsWork(a) && needsWork(b)) return 'risk';
  if (needsWork(a) || needsWork(b)) return 'concern';
  if (strong(a) && strong(b)) return 'good';
  if (assessed(a) && assessed(b)) return 'watch';
  return 'idle';
}
