import { useEffect, useState } from 'react';
import type { Confidence, Question } from '../engine/types';
import type { AnswerResult } from '../store/useApp';

const CONFS: { id: Confidence; label: string }[] = [
  { id: 'low', label: 'Guessing' },
  { id: 'medium', label: 'Fairly sure' },
  { id: 'high', label: 'Certain' },
];

export default function QuestionCard({
  q, topic, onSubmit, onNext, nextLabel = 'Next question',
}: {
  q: Question;
  topic: string;
  onSubmit: (choice: number, conf: Confidence) => AnswerResult;
  onNext: () => void;
  nextLabel?: string;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [conf, setConf] = useState<Confidence | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  useEffect(() => {
    setChoice(null);
    setConf(null);
    setResult(null);
  }, [q.id]);

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="chip">{topic}</span>
        <span className="chip">{q.kind === 'contrast' ? 'Contrast check' : q.kind}</span>
        {q.level && <span className="chip">{['', 'L1 recall', 'L2 concept', 'L3 transfer'][q.level]}</span>}
        {q.source === 'backup' && <span className="chip">Backup set</span>}
      </div>
      <h2 className="text-xl font-semibold leading-snug">{q.text}</h2>
      <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answer options">
        {q.options.map((o, i) => {
          const done = !!result;
          const isRight = done && i === result!.correctIndex;
          const isWrongPick = done && i === choice && !result!.correct;
          return (
            <button
              key={i}
              role="radio"
              aria-checked={choice === i}
              disabled={done}
              onClick={() => setChoice(i)}
              className={`rounded-[var(--radius-sm)] border px-4 py-3 text-left text-[15px] transition ${
                isRight ? 'border-solid bg-solid/10' : isWrongPick ? 'border-weak bg-weak/10' : choice === i ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-alt'
              }`}
            >
              <span className="mr-2 font-semibold text-muted">{String.fromCharCode(65 + i)}.</span> {o}
              {isRight && <span className="ml-2 text-sm font-semibold text-solid">✓ correct</span>}
              {isWrongPick && <span className="ml-2 text-sm font-semibold text-weak">✗ your answer</span>}
            </button>
          );
        })}
      </div>

      {!result ? (
        <>
          <div className="label mt-5">How sure are you?</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {CONFS.map((c) => (
              <button key={c.id} className={`btn ${conf === c.id ? 'btn-primary' : ''}`} onClick={() => setConf(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <button className="btn btn-primary" disabled={choice === null || conf === null} onClick={() => setResult(onSubmit(choice!, conf!))}>
              Submit answer
            </button>
          </div>
        </>
      ) : (
        <div className="mt-5 flex items-center justify-between">
          <span className={`font-semibold ${result.correct ? 'text-solid' : 'text-weak'}`}>{result.correct ? 'Correct' : 'Not quite'}</span>
          <button className="btn btn-primary" onClick={onNext} autoFocus>{nextLabel}</button>
        </div>
      )}
    </div>
  );
}
