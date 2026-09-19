import type { BeliefState, Confidence, NodeBelief } from './types';

export const CONF_WEIGHT: Record<Confidence, number> = { low: 0.5, medium: 1, high: 1.5 };
/** Harder questions carry more evidence; recall carries a little less. */
export const LEVEL_WEIGHT: Record<1 | 2 | 3, number> = { 1: 0.8, 2: 1, 3: 1.3 };
/** Evidence mass at which one answer is decisive enough to classify a topic without a second question. */
export const DECISIVE_MASS = 1.5;
export const WEAK_BELOW = 0.4;
export const SOLID_ABOVE = 0.7;

export const newBelief = (): NodeBelief => ({
  alpha: 1,
  beta: 1,
  answers: 0,
  confidentWrong: 0,
  nudge: 0,
  verified: false,
});

/** Total weight of direct evidence so far (the Beta prior contributes none). */
export const evidenceMass = (b: NodeBelief) => b.alpha + b.beta - 2;

/** A topic is settled once it has two answers, or one answer that was decisive (high confidence, real level). */
export const isSettled = (b: NodeBelief) => b.answers >= 2 || evidenceMass(b) >= DECISIVE_MASS;

/** Posterior mean of the Beta belief from direct evidence only. */
export const baseMastery = (b: NodeBelief) => b.alpha / (b.alpha + b.beta);

/** What the UI shows: direct evidence plus the bounded propagated nudge. */
export const effectiveMastery = (b: NodeBelief) =>
  Math.min(1, Math.max(0, baseMastery(b) + b.nudge));

/** Direct Beta update. Confidence scales the evidence weight; high-confidence wrong is flagged. */
export function updateBelief(b: NodeBelief, correct: boolean, confidence: Confidence, level: 1 | 2 | 3 = 2): NodeBelief {
  const w = CONF_WEIGHT[confidence] * LEVEL_WEIGHT[level];
  return {
    ...b,
    alpha: b.alpha + (correct ? w : 0),
    beta: b.beta + (correct ? 0 : w),
    answers: b.answers + 1,
    confidentWrong: b.confidentWrong + (!correct && confidence === 'high' ? 1 : 0),
  };
}

/**
 * State is derived from DIRECT evidence only (band of baseMastery, answer count, verified flag).
 * A propagated nudge can lift Unknown to Tentative and nothing more.
 */
export function deriveState(b: NodeBelief): BeliefState {
  const m = baseMastery(b);
  if (b.verified && !b.reopened && b.answers >= 2 && m > SOLID_ABOVE) return 'verified';
  if (b.answers === 0) return b.nudge !== 0 ? 'tentative' : 'unknown';
  if (!isSettled(b)) return 'tentative';
  if (m < WEAK_BELOW) return 'weak';
  if (m <= SOLID_ABOVE) return 'shaky';
  return b.reopened ? 'shaky' : 'solid';
}

/** Danger overlay: a confident wrong answer that direct evidence has not yet recovered from. */
export const isDanger = (b: NodeBelief) => b.confidentWrong > 0 && baseMastery(b) <= SOLID_ABOVE;
