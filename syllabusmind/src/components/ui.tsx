import { useEffect, useState, type ReactNode } from 'react';
import type { BeliefState, LogEntry } from '../engine/types';
import { STATE_META, STATE_ORDER, StateIcon } from '../lib/states';
import { getKey, getModels, getSimulateOffline, isOpenRouter, setKey, setModels, setSimulateOffline, usage } from '../lib/llm';
import { GRAPH, useApp } from '../store/useApp';
import { evidenceFor } from '../lib/evidence';
import { noticeView, type AlertVariant } from '../lib/notice';

export type Route = 'intake' | 'graph' | 'diagnostic' | 'deepdive' | 'report';

const STEPS: { id: Route; label: string }[] = [
  { id: 'intake', label: 'Intake' },
  { id: 'graph', label: 'Score graph' },
  { id: 'diagnostic', label: 'Quick check' },
  { id: 'report', label: 'Outcome' },
];

export function NavBar({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { student, signOut, diagnosticDone, setCheckOnly } = useApp();
  const inQuiz = route === 'diagnostic' || route === 'deepdive';
  const doneStep = (r: Route) => (r === 'intake' ? !!student : r === 'diagnostic' ? diagnosticDone : false);
  const [settings, setSettings] = useState(false);
  const enabled = (r: Route) => r === 'intake' || !!student;
  const active = route === 'deepdive' ? 'graph' : route;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3">
        <button onClick={() => go(student ? 'graph' : 'intake')} className="flex items-center gap-2" aria-label="SyllabusMind home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
          <span className="font-display text-xl font-bold">SyllabusMind</span>
        </button>
        <nav aria-label="Progress" className="hidden flex-1 items-center gap-1 md:flex">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              disabled={!enabled(s.id)}
              onClick={() => go(s.id)}
              aria-current={active === s.id ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-base font-medium transition ${
                active === s.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink disabled:opacity-40 disabled:hover:text-muted'
              }`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${doneStep(s.id) && active !== s.id ? 'bg-solid text-white' : active === s.id ? 'bg-accent text-white' : 'bg-surface-alt'}`}>{doneStep(s.id) && active !== s.id ? '✓' : i + 1}</span>
              {s.label}
            </button>
          ))}
        </nav>
        {inQuiz && (
          <button className="btn btn-ghost" onClick={() => { setCheckOnly(null); go('graph'); }} title="Your answers are saved. You can pick this up again from the map.">
            ← Exit to map
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {student && <span className="chip hidden sm:inline-flex">{student.name} · {student.roll}</span>}
          <button className="btn" onClick={() => setSettings(true)}>Settings</button>
          {student && (
            <button className="btn" title="Your progress stays saved on this browser" onClick={() => { signOut(); go('intake'); }}>Switch student</button>
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
  const [offline, setOffline] = useState(getSimulateOffline());
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
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={offline}
            onChange={(e) => {
              setOffline(e.target.checked);
              setSimulateOffline(e.target.checked); // applies immediately, no Save needed
            }}
          />
          Simulate offline (force the backup question set, for demoing the fallback path)
        </label>
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
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted ${compact ? 'pt-2' : 'px-2 pt-3'}`} aria-label="Legend">
      {STATE_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-2" title={STATE_META[s].desc}>
          <StateIcon state={s} size={15} /> {STATE_META[s].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-2" title="The student was sure and wrong">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-danger text-xs font-bold leading-none text-white">!</span> Confident mistake
      </span>
    </div>
  );
}

/* ---- shared component language: one alert, one segmented control, one progress bar ---- */

const ALERT: Record<AlertVariant, { box: string; icon: string; path: ReactNode }> = {
  info: { box: 'border-accent/30 bg-accent-soft text-accent', icon: 'text-accent', path: <><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10 9v5M10 6.2v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
  warning: { box: 'border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)]', icon: 'text-[var(--warn-text)]', path: <><path d="M10 2.6 18 16.4H2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 8v4M10 14.2v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
  success: { box: 'border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok-text)]', icon: 'text-[var(--ok-text)]', path: <><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M6.4 10.2 8.8 12.6 13.6 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> },
  danger: { box: 'border-[var(--bad-border)] bg-[var(--bad-bg)] text-[var(--bad-text)]', icon: 'text-[var(--bad-text)]', path: <><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
};

/**
 * The one alert. info (blue) is a tip, warning (amber) reports a fallback, success (green) confirms, danger (red)
 * marks a mistake. An icon, a title, optional detail and actions, and an optional dismiss. dismissKey remembers
 * the dismissal in this browser.
 */
export function Alert({ variant = 'info', title, children, onDismiss, dismissKey, className = '', icon }: {
  variant?: AlertVariant; title?: ReactNode; children?: ReactNode; onDismiss?: () => void; dismissKey?: string; className?: string; icon?: ReactNode;
}) {
  const key = dismissKey ? `sm.dismissed.${dismissKey}` : null;
  const [hidden, setHidden] = useState(() => {
    try {
      return key ? localStorage.getItem(key) === '1' : false;
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const v = ALERT[variant];
  const dismiss =
    onDismiss || key
      ? () => {
          if (key) {
            try {
              localStorage.setItem(key, '1');
            } catch {
              /* ignore */
            }
          }
          setHidden(true);
          onDismiss?.();
        }
      : null;
  return (
    <div role={variant === 'warning' || variant === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-sm ${v.box} ${className}`}>
      {icon ?? <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className={`mt-0.5 shrink-0 ${v.icon}`}>{v.path}</svg>}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? 'mt-0.5 text-ink' : 'text-ink'}>{children}</div>}
      </div>
      {dismiss && (
        <button className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-base leading-none opacity-70 hover:opacity-100" aria-label="Dismiss" onClick={dismiss}>✕</button>
      )}
    </div>
  );
}

/** Shows the store's current notice as an alert (amber for a fallback, green for a welcome back), and can dismiss it. */
export function StoreNotice({ className = 'mb-4' }: { className?: string }) {
  const { notice, clearNotice } = useApp();
  const v = noticeView(notice);
  if (!v) return null;
  return (
    <Alert variant={v.variant} title={v.title} onDismiss={clearNotice} className={className}>
      {v.body}
    </Alert>
  );
}

/** A ring that fills to a value, with an optional centre label. The one donut, used for scores and for coverage. */
export function Donut({ value, size = 44, color = 'var(--accent)', label, stroke }: { value: number; size?: number; color?: string; label?: ReactNode; stroke?: number }) {
  const w = stroke ?? Math.max(4, size / 8);
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v * 100)} percent`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={w} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} />
      </svg>
      <span className="relative text-xs font-semibold leading-none">{label ?? `${Math.round(v * 100)}%`}</span>
    </span>
  );
}

/** The one progress bar. Same height, track and accent fill on every screen. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

/** The one "pick one" control: a joined group with a single selected treatment (the same as an answer option). */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md' }: {
  options: { id: T; label: string; hint?: string }[]; value: T | null; onChange: (v: T) => void; label: string; size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-border" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          title={o.hint}
          onClick={() => onChange(o.id)}
          className={`choice !rounded-none !border-0 ${i > 0 ? '!border-l !border-l-[var(--border)]' : ''} ${size === 'sm' ? 'px-4 py-2 text-sm' : 'px-5 py-3 text-base'} font-medium`}
        >
          {o.label}
        </button>
      ))}
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

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
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

/** The visible moment for the backward loop, in the shared alert language. */
export function Banner() {
  const { banner, dismissBanner } = useApp();
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(dismissBanner, 12000);
    return () => clearTimeout(t);
  }, [banner, dismissBanner]);
  if (!banner) return null;
  return (
    <div className="banner-in mb-4">
      <Alert variant={banner.kind === 'reopen' ? 'danger' : 'success'} title={banner.text} onDismiss={dismissBanner} />
    </div>
  );
}

export function EvidenceList({ log, nodeId }: { log: LogEntry[]; nodeId: string }) {
  const items = evidenceFor(log, nodeId);
  if (!items.length) return <p className="text-sm text-muted">No evidence yet for {GRAPH.nodes.find((n) => n.id === nodeId)?.label ?? 'this topic'}.</p>;
  return (
    <ol className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className={`rounded-[var(--radius-sm)] border p-3 text-sm ${e.type === 'answer' && !e.correct && e.confidence !== 'low' ? 'border-[var(--bad-border)] bg-[var(--bad-bg)]' : 'border-border bg-surface-alt'}`} style={e.type === 'answer' && !e.correct && e.confidence !== 'low' ? { borderLeft: '4px solid var(--danger)' } : undefined}>
          {e.type === 'answer' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`font-semibold ${e.correct ? 'text-solid' : 'text-weak'}`}>{!e.correct && e.confidence !== 'low' && <span aria-hidden>⚑ </span>}{e.correct ? 'Correct' : !e.correct && e.confidence !== 'low' ? 'Confident mistake' : 'Incorrect'} · {e.confidence} confidence</span>
                <span className="text-xs text-muted">{e.phase === 'diagnostic' ? 'Quick check' : 'Go deeper'}</span>
              </div>
              <div className="mt-1">{e.questionText}</div>
              {!e.correct && e.confidence !== 'low' && <div className="mt-1 text-xs font-semibold text-[var(--bad-text)]">You were {e.confidence === 'high' ? 'certain' : 'fairly sure'} here. This is worth a closer look, not just review.</div>}
              {e.belief && <div className="mt-1 text-xs font-semibold text-weak">Likely belief: {e.belief}</div>}
              <div className="mt-1 text-xs text-muted">Answered: {e.chosen}.{!e.correct && e.correctAnswer ? ` Correct: ${e.correctAnswer}.` : ''} Mastery {(e.masteryBefore * 100).toFixed(0)}% → {(e.masteryAfter * 100).toFixed(0)}%</div>
            </>
          )}
          {e.type === 'reopen' && <div className="font-semibold text-danger">REOPENED: {e.reason}</div>}
          {e.type === 'verify' && <div className="font-semibold text-verified">VERIFIED: {e.reason}</div>}
        </li>
      ))}
    </ol>
  );
}
