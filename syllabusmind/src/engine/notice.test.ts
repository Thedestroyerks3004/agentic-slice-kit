import { describe, expect, it } from 'vitest';
import { noticeView } from '../lib/notice';

describe('notices shown to a student', () => {
  it('shows nothing when there is no notice', () => {
    expect(noticeView(null)).toBeNull();
    expect(noticeView('')).toBeNull();
  });
  it('reports a fallback as a warning, in plain words, without internal detail', () => {
    const v = noticeView('Live question generation failed (the model took too long to answer). Some topics use the pre-written backup questions.')!;
    expect(v.variant).toBe('warning');
    expect(v.title).toBe('Using backup questions for this topic');
    expect(v.body).toContain('too slow');
    expect(v.body).toContain('answers still count');
    expect(v.body).not.toMatch(/model|API|key|OpenRouter|429|402/i);
  });
  it('translates each failure reason and never leaks a status code', () => {
    for (const raw of ['OpenRouter 429 (rate limited)', 'OpenRouter 402 (out of credit)', 'OpenAI 401 (key rejected)', 'some odd error']) {
      const v = noticeView(`Live question generation failed (${raw}). Some topics use the pre-written backup questions.`)!;
      expect(v.variant).toBe('warning');
      expect(v.body).not.toMatch(/\b(401|402|429|OpenAI|OpenRouter)\b/);
    }
  });
  it('explains a missing key without mentioning keys or environment files to the learner', () => {
    const v = noticeView('No API key found, so questions come from the pre-written backup set. Put a key in .env.local for freshly generated questions.')!;
    expect(v.variant).toBe('warning');
    expect(v.title).toBe('Using backup questions for this topic');
    expect(v.body).not.toMatch(/\.env|api key|key/i);
  });
  it('welcomes a returning student in green and leaves other notices as info', () => {
    expect(noticeView('Welcome back, Arjun. Your progress was restored.')!.variant).toBe('success');
    expect(noticeView('Something else happened.')).toEqual({ variant: 'info', title: 'Something else happened.' });
  });
});
