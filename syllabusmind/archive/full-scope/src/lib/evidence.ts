import type { AnswerEntry, ConceptGraph, LogEntry } from '../engine/types';
import { subtreeIds } from '../engine/graph';

const idsFor = (nodeId: string, graph?: ConceptGraph) => new Set(graph ? subtreeIds(graph, nodeId) : [nodeId]);

/** Everything that explains a node's colour, including evidence gathered on its sub-topics. */
export const evidenceFor = (log: LogEntry[], nodeId: string, graph?: ConceptGraph): LogEntry[] => {
  const ids = idsFor(nodeId, graph);
  return log.filter((e) => (e.type === 'propagation' ? e.targetNodeId === nodeId : ids.has(e.nodeId))).slice().reverse();
};

export const answersFor = (log: LogEntry[], nodeId: string, graph?: ConceptGraph) => {
  const ids = idsFor(nodeId, graph);
  return log.filter((e): e is AnswerEntry => e.type === 'answer' && ids.has(e.nodeId));
};

const human = (m: string) => m.replace(/^m_/, '').replace(/_/g, ' ');

/** One traceable sentence: "2 of 3 answers wrong, 1 at high confidence, likely belief: ...". */
export function summarizeEvidence(log: LogEntry[], nodeId: string, graph?: ConceptGraph): string {
  const a = answersFor(log, nodeId, graph);
  if (!a.length) return 'No direct answers yet.';
  const wrong = a.filter((x) => !x.correct);
  const conf = wrong.filter((x) => x.confidence === 'high').length;
  const parts = [`${wrong.length} of ${a.length} answers wrong`];
  if (conf) parts.push(`${conf} at high confidence`);
  const mis = [...new Set(wrong.map((x) => x.misconceptionId).filter(Boolean) as string[])];
  if (mis.length) parts.push(`likely belief: ${mis.slice(0, 2).map(human).join('; ')}`);
  else if (wrong.length) parts.push(`e.g. "${wrong[wrong.length - 1].questionText.slice(0, 90)}"`);
  return parts.join(', ');
}
