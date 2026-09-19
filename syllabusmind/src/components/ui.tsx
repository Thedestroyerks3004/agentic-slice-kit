import { useEffect, useState, type ReactNode } from 'react';
import type { BeliefState, LogEntry } from '../engine/types';
import { STATE_META, STATE_ORDER, StateIcon } from '../lib/states';
import { getKey, getModels, isOpenRouter, setKey, setModels, usage } from '../lib/llm';
import { GRAPH, useApp } from '../store/useApp';
import { evidenceFor } from '../lib/evidence';

export type Route = 'intake' | 'graph' | 'diagnostic' | 'deepdive' | 'report';

const STEPS: { id: Route; label: string }[] = [
  { id: 'intake', label: 'Intake' },
  { id: 'graph', label: 'Score graph' },
  { id: 'diagnostic', label: 'Diagnostic' },
  { id: 'report', label: 'Outcome' },
];

export function NavBar({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { student, reset } = useApp();
  const [settings, setSettings] = useState(false);
  const enabled = (r: Route) => r === 'intake' || !!student;
  const active = route === 'deepdive' ? 'graph' : route;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3">
        <button onClick={() => go(student ? 'graph' : 'intake')} className="flex items-center gap-2" aria-label="SyllabusMind home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
          <span className="font-display text-lg font-bold">SyllabusMind</span>
        </button>
        <nav aria-label="Progress" className="hidden flex-1 items-center gap-1 md:flex">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              disabled={!enabled(s.id)}
              onClick={() => go(s.id)}
              aria-current={active === s.id ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active === s.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink disabled:opacity-40 disabled:hover:text-muted'
              }`}
            >
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${active === s.id ? 'bg-accent text-white' : 'bg-surface-alt'}`}>{i + 1}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {student && <span className="chip hidden sm:inline-flex">{student.name} · {student.roll}</span>}
          <button className="btn" onClick={() => setSettings(true)}>Settings</button>
          {student && (
            <button className="btn" onClick={() => { reset(); go('intake'); }}>Start over</button>
          )}
        </div>
      </div>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </header>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [key, setK] = useState(getKey());
  const [model, setM] = useState(getModels().question);
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    window.addEventListener('sm-usage', f);
    return () => window.removeEventListener('sm-usage', f);
  }, []);
  const rows = Object.entries(usage);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose} role="dialog" aria-modal>
      <div className="card max-h-[90vh] w-full max-w-xl overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">Model settings</h2>
        <p className="mt-1 text-sm text-muted">
          Questions are generated live by one model. Without a working key the app falls back to the pre-written backup set. A key in .env.local takes priority over this field. sk-or-… keys go to OpenRouter, sk-… keys to OpenAI.
        </p>
        <label className="label mt-4 block" htmlFor="key">API key</label>
        <input id="key" className="input mt-1" type="password" placeholder="sk-…" value={key} onChange={(e) => setK(e.target.value)} />
        <label className="label mt-4 block" htmlFor="model">Model ({isOpenRouter() ? 'OpenRouter' : 'OpenAI'})</label>
        <input id="model" className="input mt-1" value={model} onChange={(e) => setM(e.target.value)} />
        <div className="label mt-4">Token usage this session</div>
        <div className="mt-1 text-sm text-muted">
          {rows.length ? rows.map(([t, u]) => <div key={t}>{t}: {u.calls} calls, {u.tokens} tokens, {u.fallbacks} fell back to the backup set</div>) : 'No model calls yet.'}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { setKey(key); setModels({ question: model }); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function Legend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted ${compact ? '' : 'p-1'}`}>
      {STATE_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5" title={STATE_META[s].desc}>
          <StateIcon state={s} size={14} /> {STATE_META[s].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5" title="Confident wrong answer">
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-danger" /> Danger
      </span>
    </div>
  );
}

export function StateChip({ state }: { state: BeliefState }) {
  return (
    <span className="chip">
      <StateIcon state={state} size={13} /> {STATE_META[state].label}
    </span>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** The visible moment for the backward loop. */
export function Banner() {
  const { banner, dismissBanner } = useApp();
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(dismissBanner, 12000);
    return () => clearTimeout(t);
  }, [banner, dismissBanner]);
  if (!banner) return null;
  const color = banner.kind === 'reopen' ? 'border-danger text-danger' : 'border-verified text-verified';
  return (
    <div role="status" className={`banner-in mb-4 flex items-center justify-between rounded-[var(--radius-sm)] border-2 bg-surface px-4 py-3 font-semibold ${color}`}>
      <span>{banner.text}</span>
      <button className="text-sm text-muted" onClick={dismissBanner}>Dismiss</button>
    </div>
  );
}

export function EvidenceList({ log, nodeId }: { log: LogEntry[]; nodeId: string }) {
  const items = evidenceFor(log, nodeId);
  if (!items.length) return <p className="text-sm text-muted">No evidence yet for {GRAPH.nodes.find((n) => n.id === nodeId)?.label ?? 'this topic'}.</p>;
  return (
    <ol className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-alt p-3 text-sm">
          {e.type === 'answer' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`font-semibold ${e.correct ? 'text-solid' : 'text-weak'}`}>{e.correct ? 'Correct' : 'Incorrect'} · {e.confidence} confidence</span>
                <span className="text-xs text-muted">{e.phase} · {e.kind}</span>
              </div>
              <div className="mt-1">{e.questionText}</div>
              {e.belief && <div className="mt-1 text-xs font-semibold text-weak">Likely belief: {e.belief}</div>}
              <div className="mt-1 text-xs text-muted">Answered: {e.chosen}. Mastery {(e.masteryBefore * 100).toFixed(0)}% → {(e.masteryAfter * 100).toFixed(0)}%</div>
            </>
          )}
          {e.type === 'reopen' && <div className="font-semibold text-danger">REOPENED: {e.reason}</div>}
          {e.type === 'verify' && <div className="font-semibold text-verified">VERIFIED: {e.reason}</div>}
        </li>
      ))}
    </ol>
  );
}
