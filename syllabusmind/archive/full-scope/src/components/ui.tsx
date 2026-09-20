import { useEffect, useState, type ReactNode } from 'react';
import type { BeliefState, ConceptGraph, LogEntry } from '../engine/types';
import { STATE_META, STATE_ORDER, StateIcon } from '../lib/states';
import { DEFAULT_MODELS, getKey, getModels, modelPropagation, setKey, setModelPropagation, setModels, usage, type Task } from '../lib/llm';
import { useApp } from '../store/useApp';
import { evidenceFor } from '../lib/evidence';

export type Route = 'intake' | 'review' | 'diagnostic' | 'graph' | 'deepdive' | 'report';

const STEPS: { id: Route; label: string }[] = [
  { id: 'intake', label: 'Intake' },
  { id: 'review', label: 'Review' },
  { id: 'diagnostic', label: 'Diagnostic' },
  { id: 'graph', label: 'Score graph' },
  { id: 'report', label: 'Report' },
];

export function NavBar({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { snap, draft, signOut, focusId, setReportScope } = useApp();
  const [settings, setSettings] = useState(false);
  const enabled = (r: Route) => (r === 'intake' ? true : r === 'review' ? !!draft : !!snap);
  const active = route === 'deepdive' ? 'graph' : route;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3">
        <button onClick={() => go(snap ? 'graph' : 'intake')} className="flex items-center gap-2" aria-label="SkillMind home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
          <span className="font-display text-lg font-bold">SkillMind</span>
        </button>
        <nav aria-label="Progress" className="hidden flex-1 items-center gap-1 md:flex">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              disabled={!enabled(s.id)}
              onClick={() => { if (s.id === 'report') setReportScope(focusId); go(s.id); }}
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
          {snap && <span className="chip hidden sm:inline-flex">{snap.session.name || snap.session.rollNumber} · {snap.session.rollNumber}</span>}
          <button className="btn" onClick={() => setSettings(true)}>Settings</button>
          {snap && (
            <button className="btn" onClick={() => { signOut(); go('intake'); }}>
              Switch student
            </button>
          )}
        </div>
      </div>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </header>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [key, setK] = useState(getKey());
  const [models, setM] = useState(getModels());
  const [prop, setProp] = useState(modelPropagation());
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
          Without a key the app runs on the curated demo bank and local fallbacks. The key is kept in this browser only and sent only to its provider (sk-or-… keys go to OpenRouter, sk-… keys to OpenAI). A key in .env.local takes priority over this field.
        </p>
        <label className="label mt-4 block">API key</label>
        <input className="input mt-1" type="password" placeholder="sk-…" value={key} onChange={(e) => setK(e.target.value)} />
        <div className="label mt-4">Model per task</div>
        <div className="mt-1 grid gap-2">
          {(Object.keys(DEFAULT_MODELS) as Task[]).map((t) => (
            <div key={t} className="grid grid-cols-[100px_1fr] items-center gap-2 text-sm">
              <span className="text-muted">{t}</span>
              <input className="input" value={models[t]} onChange={(e) => setM({ ...models, [t]: e.target.value })} />
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={prop} onChange={(e) => setProp(e.target.checked)} />
          <span>Let a model judge propagation to neighbouring topics (one call per answer). Off by default: the local edge-weight rule is free and instant.</span>
        </label>
        <div className="label mt-4">Token usage this session</div>
        <div className="mt-1 text-sm text-muted">
          {rows.length ? rows.map(([t, u]) => <div key={t}>{t}: {u.calls} calls, {u.tokens} tokens, {u.fallbacks} fallbacks</div>) : 'No model calls yet.'}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { setKey(key); setModels(models); setModelPropagation(prop); onClose(); }}>Save</button>
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

export function Banner() {
  const { banner, dismissBanner } = useApp();
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(dismissBanner, 9000);
    return () => clearTimeout(t);
  }, [banner, dismissBanner]);
  if (!banner) return null;
  const color = banner.kind === 'reopen' ? 'border-danger text-danger' : banner.kind === 'verify' ? 'border-verified text-verified' : 'border-accent text-accent';
  return (
    <div role="status" className={`banner-in mb-4 flex items-center justify-between rounded-[var(--radius-sm)] border-2 bg-surface px-4 py-3 font-semibold ${color}`}>
      <span>{banner.text}</span>
      <button className="text-sm text-muted" onClick={dismissBanner}>Dismiss</button>
    </div>
  );
}

export function EvidenceList({ log, nodeId, graph }: { log: LogEntry[]; nodeId: string; graph: ConceptGraph }) {
  const items = evidenceFor(log, nodeId, graph);
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  if (!items.length) return <p className="text-sm text-muted">No evidence yet for this topic.</p>;
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
              {e.misconceptionId && <div className="mt-1 text-xs font-semibold text-weak">Likely misconception: {e.misconceptionId.replace(/^m_/, '').replace(/_/g, ' ')}</div>}
              <div className="mt-1 text-xs text-muted">Answered: {e.chosen}. Mastery {(e.masteryBefore * 100).toFixed(0)}% → {(e.masteryAfter * 100).toFixed(0)}%</div>
            </>
          )}
          {e.type === 'propagation' && (
            <>
              <div className="font-semibold text-accent">Propagated from {label(e.sourceNodeId)}</div>
              <div className="mt-1">{e.reason}</div>
              <div className="mt-1 text-xs text-muted">
                edge {e.edgeWeight.toFixed(2)} × judgment {e.modelWeight.toFixed(2)} × source change {(e.rawDelta * 100).toFixed(0)}% → applied {(e.appliedDelta * 100).toFixed(1)}% (nudge only, never direct evidence)
              </div>
            </>
          )}
          {e.type === 'reopen' && <div className="font-semibold text-danger">REOPENED: {e.reason}</div>}
          {e.type === 'verify' && <div className="font-semibold text-verified">VERIFIED: {e.reason}</div>}
        </li>
      ))}
    </ol>
  );
}
