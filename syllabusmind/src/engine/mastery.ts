import type { BeliefState, Confidence, NodeBelief } from './types';

export const CONF_WEIGHT: Record<Confidence, number> = { low: 0.5, medium: 1, high: 1.5 };
/** Harder questions carry more evidence; recall carries a little less. */
export const LEVEL_WEIGHT: Record<1 | 2 | 3, number> = { 1: 0.8, 2: 1, 3: 1.3 };
export const WEAK_BELOW = 0.4;
export const SOLID_ABOVE = 0.7;
/** A node at or above this mastery when it fails a contrast check is "reopened". */
export const REOPEN_FROM = 0.6;
/**
 * Revision limit: at most this many reopens per topic per session. This is a separate counter from
 * llm.ts's `timeouts` (a network-spend limit for the circuit breaker) — the two must never share state,
 * since one bounds retrying a flaky call and the other bounds how much a single result can be revised.
 */
export const MAX_REOPENS = 1;

export const newBelief = (): NodeBelief => ({
  alpha: 1,
  beta: 1,
  answers: 0,
  correct: 0,
  confidentWrong: 0,
  verified: false,
  reopenCount: 0,
});

/** Posterior mean of the Beta belief. */
export const mastery = (b: NodeBelief) => b.alpha / (b.alpha + b.beta);

/** Direct Beta update. Confidence and question level scale the evidence; a confident wrong answer is flagged. */
export function updateBelief(b: NodeBelief, correct: boolean, confidence: Confidence, level: 1 | 2 | 3 = 2): NodeBelief {
  const w = CONF_WEIGHT[confidence] * LEVEL_WEIGHT[level];
  return {
    ...b,
    alpha: b.alpha + (correct ? w : 0),
    beta: b.beta + (correct ? 0 : w),
    answers: b.answers + 1,
    correct: b.correct + (correct ? 1 : 0),
    confidentWrong: b.confidentWrong + (!correct && confidence === 'high' ? 1 : 0),
  };
}

/** State comes from direct evidence only: answer count, the mastery band, and the verified/reopened flags. */
export function deriveState(b: NodeBelief): BeliefState {
  const m = mastery(b);
  if (b.verified && !b.reopened && b.answers >= 2 && m > SOLID_ABOVE) return 'verified';
  if (b.answers === 0) return 'unknown';
  if (b.answers === 1) return 'tentative';
  if (m < WEAK_BELOW) return 'weak';
  if (m <= SOLID_ABOVE) return 'shaky';
  return b.reopened ? 'shaky' : 'solid';
}

/** Danger overlay: a confident wrong answer that later evidence has not recovered from. */
export const isDanger = (b: NodeBelief) => b.confidentWrong > 0 && mastery(b) <= SOLID_ABOVE;

/**
 * The one backward transition, a plain comparison against the stored answer key (never a model call).
 * A wrong answer to a discriminating contrast question on a node that looked solid reopens it.
 */
export const shouldReopen = (correct: boolean, before: NodeBelief) =>
  !correct && (mastery(before) >= REOPEN_FROM || deriveState(before) === 'solid' || deriveState(before) === 'verified');

const SD_PRIOR = Math.sqrt(1 / 12); // spread of the uniform Beta(1,1) prior

/**
 * How far the evidence has narrowed the score, 0 (nothing known) to 1 (very sure). It rises with the amount of
 * evidence and is higher when the answers agree, so five consistent answers outrank five mixed ones.
 */
export function certainty(b: NodeBelief): number {
  const n = b.alpha + b.beta;
  const sd = Math.sqrt((b.alpha * b.beta) / (n * n * (n + 1)));
  return Math.max(0, Math.min(1, 1 - sd / SD_PRIOR));
}

export type EvidenceLevel = 'none' | 'low' | 'medium' | 'high';
export const evidenceLevel = (b: NodeBelief): EvidenceLevel => {
  if (b.answers === 0) return 'none';
  const c = certainty(b);
  return c < 0.25 ? 'low' : c < 0.5 ? 'medium' : 'high';
};
