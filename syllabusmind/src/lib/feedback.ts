import type { Question } from '../engine/types';

export interface WrongAnswerNote {
  correctAnswer: string;
  /** The question's own author-written explanation, if it has one. Never invented here. */
  explanation?: string;
  /** The specific wrong belief the chosen option reveals, if the question tagged one. */
  belief?: string;
}

/** What to show the moment a student answers wrong: the right answer, and why. Null when the answer was right. */
export function wrongAnswerNote(q: Question, chosen: number): WrongAnswerNote | null {
  if (chosen === q.correctIndex) return null;
  return {
    correctAnswer: q.options[q.correctIndex],
    explanation: q.explanation?.trim() || undefined,
    belief: q.beliefs?.[chosen]?.trim() || undefined,
  };
}
