import { describe, expect, it } from 'vitest';
import type { Question } from '../engine/types';
import { wrongAnswerNote } from './feedback';

const q: Question = {
  id: 'q1', nodeId: 'concurrency_control', kind: 'probe', text: 'Is a blocked transaction a deadlock?',
  options: ['Always', 'Only if the waits form a cycle', 'Never', 'Only under 2PL'], correctIndex: 1,
  beliefs: ['Believes any blocked transaction is a deadlock', null, null, null],
  explanation: 'Waiting is ordinary blocking. It is a deadlock only when the waits form a cycle.',
};

describe('wrongAnswerNote', () => {
  it('is null for a right answer, so nothing extra is shown', () => {
    expect(wrongAnswerNote(q, 1)).toBeNull();
  });
  it('gives the correct answer, the explanation and the belief for a wrong one', () => {
    expect(wrongAnswerNote(q, 0)).toEqual({ correctAnswer: 'Only if the waits form a cycle', explanation: q.explanation, belief: 'Believes any blocked transaction is a deadlock' });
  });
  it('omits the explanation rather than inventing one when the question has none', () => {
    const n = wrongAnswerNote({ ...q, explanation: undefined, beliefs: undefined }, 2)!;
    expect(n.correctAnswer).toBe('Only if the waits form a cycle');
    expect(n.explanation).toBeUndefined();
    expect(n.belief).toBeUndefined();
  });
});
