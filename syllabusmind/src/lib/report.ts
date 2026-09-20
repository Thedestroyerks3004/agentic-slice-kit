import type { AnswerEntry, BeliefState, ConceptGraph, LogEntry, NodeBelief } from '../engine/types';
import { deriveState, isDanger, mastery } from '../engine/mastery';
import { dependentCount } from '../engine/graph';

export interface ReportRow {
  id: string;
  label: string;
  state: BeliefState;
  mastery: number;
  answers: number;
  builtOnBy: number; // topics that build directly on this one
  danger: boolean;
}

export interface Report {
  needs: ReportRow[]; // weak, confident mistakes first
  developing: ReportRow[];
  strong: ReportRow[]; // solid and verified
  partial: ReportRow[]; // one answer so far
  unassessed: ReportRow[];
  total: number;
  assessed: number; // topics with at least one answer
  coverage: number; // assessed / total, 0..1
  dangers: number;
  weakest: ReportRow | null;
}

/**
 * The results, grouped so the page can read from red to green. Within a group the order says what to do first:
 * confident mistakes, then the topics the most other topics build on, then the lowest score.
 */
export function buildReport(g: ConceptGraph, beliefs: Record<string, NodeBelief>): Report {
  const rows: ReportRow[] = g.nodes.map((n) => {
    const b = beliefs[n.id];
    return { id: n.id, label: n.label, state: deriveState(b), mastery: mastery(b), answers: b.answers, builtOnBy: dependentCount(g, n.id), danger: isDanger(b) };
  });
  const byNeed = (a: ReportRow, b: ReportRow) => Number(b.danger) - Number(a.danger) || b.builtOnBy - a.builtOnBy || a.mastery - b.mastery;
  const needs = rows.filter((r) => r.state === 'weak').sort(byNeed);
  const developing = rows.filter((r) => r.state === 'shaky').sort(byNeed);
  const strong = rows.filter((r) => r.state === 'solid' || r.state === 'verified').sort((a, b) => b.mastery - a.mastery);
  const partial = rows.filter((r) => r.state === 'tentative');
  const unassessed = rows.filter((r) => r.state === 'unknown');
  const assessed = rows.filter((r) => r.answers > 0).length;
  return {
    needs, developing, strong, partial, unassessed,
    total: rows.length, assessed,
    coverage: rows.length ? assessed / rows.length : 0,
    dangers: rows.filter((r) => r.danger).length,
    weakest: needs[0] ?? developing[0] ?? null,
  };
}

export interface MissDetail {
  question: string;
  answer: string; // what the student picked
  correct?: string; // the right answer (older saved sessions may not have it)
  confidence: AnswerEntry['confidence'];
  sure: string;
  belief?: string; // the wrong belief that option was written to reveal
  explanation?: string;
}

export interface EvidenceDetail {
  headline: string;
  misses: MissDetail[]; // the most recent wrong answers, oldest first, at most three
}

const SURE: Record<AnswerEntry['confidence'], string> = { high: 'You were certain', medium: 'You were fairly sure', low: 'You were guessing' };

/** The proof behind a topic's result: how many were wrong, and the actual questions and answers that went wrong. */
export function evidenceDetail(log: LogEntry[], nodeId: string): EvidenceDetail | null {
  const a = log.filter((e): e is AnswerEntry => e.type === 'answer' && e.nodeId === nodeId);
  if (!a.length) return null;
  const wrong = a.filter((x) => !x.correct);
  const confident = wrong.filter((x) => x.confidence === 'high').length;
  if (!wrong.length) return { headline: `${a.length} of ${a.length} ${a.length === 1 ? 'answer' : 'answers'} correct`, misses: [] };
  return {
    headline: `${wrong.length} of ${a.length} ${a.length === 1 ? 'answer' : 'answers'} wrong${confident ? ` · ${confident} with high confidence` : ''}`,
    misses: wrong.slice(-3).map((m) => ({
      question: m.questionText, answer: m.chosen, correct: m.correctAnswer, confidence: m.confidence, sure: SURE[m.confidence], belief: m.belief, explanation: m.explanation,
    })),
  };
}
