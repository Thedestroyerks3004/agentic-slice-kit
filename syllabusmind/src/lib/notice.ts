/**
 * Turns a raw store notice into what a student should see. Internal wording (model failures, keys, fallbacks)
 * is translated, so the alert says what changed for them and not how the system works.
 */
export type AlertVariant = 'info' | 'warning' | 'success' | 'danger';

export interface NoticeView {
  variant: AlertVariant;
  title: string;
  body?: string;
}

const REASONS: [RegExp, string][] = [
  [/took too long/i, 'the question service was too slow'],
  [/rate limited|429/i, 'the question service is busy'],
  [/out of credit|402/i, 'the question service is unavailable'],
  [/key rejected|401|403/i, 'the question service refused the request'],
];
const plainReason = (raw: string) => REASONS.find(([re]) => re.test(raw))?.[1] ?? 'the question service did not respond';

export function noticeView(text: string | null): NoticeView | null {
  if (!text) return null;
  if (/^Welcome back/i.test(text)) return { variant: 'success', title: text };
  if (/backup/i.test(text)) {
    const m = text.match(/failed \(([^)]*)\)/i);
    return {
      variant: 'warning',
      title: 'Using backup questions for this topic',
      body: m ? `Fresh questions could not be made because ${plainReason(m[1])}. Your answers still count.` : 'These questions are pre-written for the course. Your answers still count.',
    };
  }
  if (/no questions available/i.test(text)) return { variant: 'warning', title: 'No questions available for this topic' };
  return { variant: 'info', title: text };
}
