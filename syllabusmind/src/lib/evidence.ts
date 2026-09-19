import type { AnswerEntry, LogEntry } from '../engine/types';

export const evidenceFor = (log: LogEntry[], nodeId: string): LogEntry[] => log.filter((e) => e.nodeId === nodeId).slice().reverse();

export const answersFor = (log: LogEntry[], nodeId: string) => log.filter((e): e is AnswerEntry => e.type === 'answer' && e.nodeId === nodeId);

/** A short label for the tooltip: "1 of 2 correct". */
export function scoreLine(log: LogEntry[], nodeId: string): string {
  const a = answersFor(log, nodeId);
  return a.length ? `${a.filter((x) => x.correct).length} of ${a.length} correct` : 'not answered yet';
}

/** One traceable sentence: "2 of 3 answers wrong, 1 at high confidence, likely belief: ...". */
export function summarizeEvidence(log: LogEntry[], nodeId: string): string {
  const a = answersFor(log, nodeId);
  if (!a.length) return 'No answers yet.';
  const wrong = a.filter((x) => !x.correct);
  if (!wrong.length) return `${a.length} of ${a.length} answers correct.`;
  const conf = wrong.filter((x) => x.confidence === 'high').length;
  const parts = [`${wrong.length} of ${a.length} answers wrong`];
  if (conf) parts.push(`${conf} at high confidence`);
  const beliefs = [...new Set(wrong.map((x) => x.belief).filter(Boolean) as string[])];
  if (beliefs.length) parts.push(`likely belief: ${beliefs.slice(0, 2).join('; ')}`);
  else parts.push(`e.g. "${wrong[wrong.length - 1].questionText.slice(0, 90)}"`);
  return parts.join(', ');
}
