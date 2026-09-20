import { useEffect, useState } from 'react';
import type { Confidence, Question } from '../engine/types';
import type { AnswerResult } from '../store/useApp';
import { Segmented } from './ui';

const CONFS: { id: Confidence; label: string; hint: string }[] = [
  { id: 'low', label: 'Guessing', hint: 'I am not sure at all' },
  { id: 'medium', label: 'Fairly sure', hint: 'I think this is right' },
  { id: 'high', label: 'Certain', hint: 'I am sure' },
];
const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * One question. Nothing about how it was made is shown (level, source, fallback); the student sees the topic and
 * a single caption such as "Question 1 of 2". The options are real controls with a letter badge, a hover state
 * and a clear selected state. Confidence starts on "Fairly sure", so only picking an answer gates Submit.
 */
export default function QuestionCard({
  q, topic, caption, onSubmit, onNext, nextLabel = 'Next question',
}: {
  q: Question;
  topic: string;
  caption?: string;
  onSubmit: (choice: number, conf: Confidence) => AnswerResult;
  onNext: () => void;
  nextLabel?: string;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [conf, setConf] = useState<Confidence>('medium');
  const [result, setResult] = useState<AnswerResult | null>(null);
  useEffect(() => {
    setChoice(null);
    setConf('medium');
    setResult(null);
  }, [q.id]);

  const submit = () => {
    if (choice !== null && !result) setResult(onSubmit(choice, conf));
  };

  // Keyboard: A-D or 1-4 pick an answer, Enter submits, then moves on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (!result) {
        const i = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : '1234'.indexOf(k);
        if (i >= 0 && i < q.options.length) setChoice(i);
        else if (k === 'enter' && choice !== null && (e.target as HTMLElement)?.tagName !== 'BUTTON') submit();
      } else if (k === 'enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, choice, q.id, conf]);

  return (
    <div className="card p-6 sm:p-8">
      <div className="text-sm font-medium text-muted">
        {topic}
        {caption && <span> · {caption}</span>}
      </div>
      <h2 className="mt-2 text-xl font-semibold leading-snug">{q.text}</h2>

      <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Answer options">
        {q.options.map((o, i) => {
          const picked = choice === i;
          const done = !!result;
          const right = done && i === result!.correctIndex;
          const wrong = done && picked && !result!.correct;
          const row = right
            ? '!border-[var(--ok-border)] !bg-[var(--ok-bg)] !text-ink !shadow-none'
            : wrong
              ? '!border-[var(--bad-border)] !bg-[var(--bad-bg)] !text-ink !shadow-none'
              : done
                ? 'opacity-60'
                : '';
          const badge = right
            ? 'border-solid bg-solid text-white'
            : wrong
              ? 'border-weak bg-weak text-white'
              : picked
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface-alt text-muted group-hover:border-accent group-hover:text-accent';
          return (
            <button
              key={i}
              role="radio"
              aria-checked={picked}
              disabled={done}
              onClick={() => setChoice(i)}
              className={`choice group flex w-full items-center gap-4 rounded-[var(--radius-sm)] px-4 py-3.5 text-left text-base ${row}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors ${badge}`} aria-hidden>
                {right ? '✓' : wrong ? '✕' : LETTERS[i]}
              </span>
              <span className="flex-1 text-ink">{o}</span>
              {right && <span className="text-sm font-semibold text-[var(--ok-text)]">Correct answer</span>}
              {wrong && <span className="text-sm font-semibold text-[var(--bad-text)]">Your answer</span>}
            </button>
          );
        })}
      </div>

      {!result ? (
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label mb-2">How sure are you?</div>
            <Segmented options={CONFS} value={conf} onChange={setConf} label="How sure are you?" />
          </div>
          <button className="btn btn-primary !px-6 !py-3 !text-base" disabled={choice === null} onClick={submit}>
            Submit answer
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-base font-semibold ${result.correct ? 'text-[var(--ok-text)]' : 'text-[var(--bad-text)]'}`}>{result.correct ? 'Correct' : 'Not quite'}</span>
          <button className="btn btn-primary !px-6 !py-3 !text-base" onClick={onNext} autoFocus>{nextLabel}</button>
        </div>
      )}
    </div>
  );
}
