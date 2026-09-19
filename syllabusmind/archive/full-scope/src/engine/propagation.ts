import type { ConceptEdge, NodeBelief } from './types';
import { baseMastery, SOLID_ABOVE, WEAK_BELOW } from './mastery';

export const DAMPENING = 0.3;
export const NUDGE_MAX = 0.08;

/** What a model (or the local fallback) says about one neighbor. */
export interface NeighborJudgment {
  nodeId: string;
  weight: number; // [0,1]
  reason: string;
}

export interface Neighbor {
  nodeId: string;
  edge: ConceptEdge;
}

export const neighborsOf = (nodeId: string, edges: ConceptEdge[]): Neighbor[] =>
  edges
    .filter((e) => e.from === nodeId || e.to === nodeId)
    .map((e) => ({ nodeId: e.from === nodeId ? e.to : e.from, edge: e }));

const band = (m: number) => (m < WEAK_BELOW ? 0 : m <= SOLID_ABOVE ? 1 : 2);

/**
 * Deterministic clip. A propagated nudge is bounded, and for a node with >=2 direct answers it may
 * never carry the effective mastery out of the band its own evidence put it in.
 * Verified and Weak-from-Unknown are impossible by construction (deriveState ignores nudge).
 */
export function applyNudge(
  belief: NodeBelief,
  rawDelta: number,
  modelWeight: number,
): { belief: NodeBelief; applied: number } {
  const w = Math.min(1, Math.max(0, Number.isFinite(modelWeight) ? modelWeight : 0));
  let next = belief.nudge + rawDelta * w * DAMPENING;
  next = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, next));
  if (belief.answers >= 2) {
    const base = baseMastery(belief);
    while (Math.abs(next) > 1e-9 && band(base + next) !== band(base)) next *= 0.5;
    if (Math.abs(next) <= 1e-9) next = 0;
  }
  return { belief: { ...belief, nudge: next }, applied: next - belief.nudge };
}
