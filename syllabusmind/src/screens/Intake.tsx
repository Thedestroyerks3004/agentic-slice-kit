import { useMemo, useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import { persistence } from '../lib/persist';
import { PageHeader, type Route } from '../components/ui';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.getTime() < 1e11 ? 'earlier' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export default function Intake({ go }: { go: (r: Route) => void }) {
  const { start, resume, signOut, student, beliefs } = useApp();
  const [name, setName] = useState('');
  const [roll, setRoll] = useState(persistence.last() ?? '');
  const saved = useMemo(() => (roll.trim() ? persistence.summary(roll) : null), [roll]);
  const units = [...new Set(GRAPH.nodes.map((n) => n.unit))];

  // A student is already loaded (restored after a refresh, or just signed in): offer to continue.
  if (student) {
    const answered = Object.values(beliefs).filter((b) => b.answers > 0).length;
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <PageHeader title={`Welcome back, ${student.name}`} sub="Your progress is saved on this browser, so you can pick up exactly where you stopped." />
        <div className="card space-y-4 p-6">
          <p className="text-sm text-muted">
            Roll number {student.roll}. {answered} of {GRAPH.nodes.length} topics answered so far.
          </p>
          <div className="flex flex-wrap justify-between gap-3">
            <button className="btn" onClick={() => signOut()}>Not you? Switch student</button>
            <button className="btn btn-primary" onClick={() => go('graph')}>Continue</button>
          </div>
        </div>
      </div>
    );
  }

  const fresh = () => {
    if (saved && !window.confirm(`This erases the saved progress for ${roll.trim()} (${saved.answered} topics answered). Start fresh?`)) return;
    start(name, roll);
    go('graph');
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        title="Find out where you are weak in DBMS"
        sub="A map of the course, a short diagnostic, and a plain answer to which topics need work and why."
      />
      <div className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={saved?.name ?? 'Arjun'} />
          </div>
          <div>
            <label className="label" htmlFor="roll">Roll number</label>
            <input id="roll" className="input mt-1" value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="21IT042" />
            <p className="mt-1 text-xs text-muted">Your progress is saved under this number on this browser.</p>
          </div>
        </div>

        {saved ? (
          <div className="rounded-[var(--radius-sm)] border border-accent bg-accent-soft p-4 text-sm" role="status">
            <div className="font-semibold text-accent">Saved progress found for {saved.roll} ({saved.name})</div>
            <p className="mt-1 text-muted">
              {saved.answered} of {saved.total} topics answered, diagnostic {saved.diagnosticDone ? 'complete' : 'not finished'}. Last active {when(saved.savedAt)}.
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-sm)] bg-surface-alt p-4 text-sm">
            <div className="font-semibold">{GRAPH.title}</div>
            <p className="mt-1 text-muted">
              {GRAPH.nodes.length} topics across {units.length} units. You will answer two questions per topic, then pick any topic to go deeper. Every question is generated fresh, so a second pass gives you different ones.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {saved ? (
            <>
              <button className="btn" onClick={fresh}>Start fresh</button>
              <button className="btn btn-primary" onClick={() => { if (resume(roll)) go('graph'); }}>Continue where I left off</button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={!roll.trim()} onClick={fresh}>Start</button>
          )}
        </div>
      </div>
      <ol className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="How it works">
        {[
          ['Map', 'See the whole course as a graph of topics and how they depend on each other.'],
          ['Check', 'Answer two fresh questions per topic. Each wrong answer is traced to a specific misconception.'],
          ['Fix', 'Get the weakest root cause first, and go deeper where a topic only looked solid.'],
        ].map(([t, d], i) => (
          <li key={t} className="card rise p-4 text-sm" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-center gap-2 font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-xs text-accent">{i + 1}</span>
              {t}
            </div>
            <p className="mt-2 text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
