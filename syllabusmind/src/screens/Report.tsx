import { useEffect, useMemo, useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import { Alert, AgentStatus, Donut, EvidenceList, PageHeader, type Route } from '../components/ui';
import { buildReport, evidenceDetail, type ReportRow } from '../lib/report';
import { buildFacts, factsSignature, fallbackInsights, generateInsights, insightCache, type Insights } from '../lib/insights';
import { hasModel, modelPaused } from '../lib/llm';

const tint = (token: string, pct = 10) => `color-mix(in srgb, var(--${token}) ${pct}%, var(--surface))`;
/** Every ring on this page, the coverage one included, has the same size and stroke. Only the colour differs. */
const RING = { size: 48, stroke: 6 } as const;

interface Section {
  key: 'needs' | 'developing' | 'strong';
  title: string;
  token: string;
  hint: string;
  empty: string;
}
/** Red to green, top to bottom, mirroring the map. */
const SECTIONS: Section[] = [
  { key: 'needs', title: 'Needs work', token: 'state-weak', hint: 'Start here. Confident mistakes first, then the topics most others build on.', empty: 'No topic is flagged as needing work so far. Keep going to confirm the rest.' },
  { key: 'developing', title: 'Developing', token: 'state-shaky', hint: 'Partly there. A little more practice should tip these.', empty: 'Topics you are getting the hang of will appear here.' },
  { key: 'strong', title: 'Strong', token: 'state-solid', hint: 'No need to spend time here.', empty: 'Strong topics will appear here as you answer more.' },
];

/** The payoff page: what to work on, how sure we are, and the answers that prove it. */
export default function Report({ go }: { go: (r: Route) => void }) {
  const { beliefs, log, student, startDeepDive, setCheckOnly, busy } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const report = useMemo(() => buildReport(GRAPH, beliefs), [beliefs]);
  const { assessed, total, coverage, weakest } = report;
  const facts = useMemo(() => buildFacts(GRAPH, beliefs, log), [beliefs, log]);
  const sig = useMemo(() => factsSignature(facts), [facts]);
  const [ins, setIns] = useState<Insights>(() => insightCache.get(sig) ?? fallbackInsights(facts));
  const [refining, setRefining] = useState(false);
  useEffect(() => {
    const cached = insightCache.get(sig);
    if (cached) return setIns(cached);
    setIns(fallbackInsights(facts));
    if (!facts.topics.length) return;
    let alive = true;
    setRefining(hasModel() && !modelPaused());
    generateInsights(facts).then((r) => {
      insightCache.set(sig, r);
      if (alive) {
        setIns(r);
        setRefining(false);
      }
    });
    return () => {
      alive = false;
      setRefining(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const pct = Math.round(coverage * 100);

  const deeper = async (id: string) => {
    if (await startDeepDive(id)) go('deepdive');
  };
  const finishCheck = () => {
    setCheckOnly(null);
    go('diagnostic');
  };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ student, beliefs, log }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `syllabusmind-${student?.roll ?? 'session'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tiles = [
    { n: report.needs.length, label: 'need work', token: 'state-weak', live: true },
    { n: report.developing.length, label: 'developing', token: 'state-shaky', live: true },
    { n: report.strong.length, label: 'strong', token: 'state-solid', live: true },
    { n: report.dangers, label: report.dangers === 1 ? 'confident mistake' : 'confident mistakes', token: 'danger', live: report.dangers > 0 },
  ];

  const Row = ({ r, token }: { r: ReportRow; token: string }) => {
    const detail = evidenceDetail(log, r.id);
    const color = `var(--${token})`;
    const ti = ins.topics[r.id];
    return (
      <li className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Donut value={r.mastery} {...RING} color={color} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{r.label}</span>
              {r.danger && <span className="chip !border-[var(--bad-border)] !bg-[var(--bad-bg)] !font-semibold !text-[var(--bad-text)]">! Confident mistake</span>}
            </div>
            <div className="text-sm text-muted">
              {r.builtOnBy > 0 ? `${r.builtOnBy} ${r.builtOnBy === 1 ? 'topic builds' : 'topics build'} on it · ` : ''}
              {r.answers} answered
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setOpen(open === r.id ? '' : r.id)} aria-expanded={open === r.id || (open === null && weakest?.id === r.id)}>{open === r.id || (open === null && weakest?.id === r.id) ? 'Hide evidence' : 'Evidence'}</button>
            <button className="btn btn-primary" disabled={!!busy} onClick={() => deeper(r.id)}>Go deeper</button>
          </div>
        </div>

        {detail && (
          <div className="mt-3 sm:pl-16">
            <p className="text-sm font-medium">{detail.headline}</p>
            {detail.misses.length > 0 && (
              <blockquote className="mt-3 rounded-r-[var(--radius-sm)] border-l-4 px-4 py-3" style={{ borderColor: color, background: tint(token, 7) }}>
                <div className="label mb-1">{detail.misses.length === 1 ? 'The question you missed' : 'The questions you missed'}</div>
                {ti?.thread && <p className="mb-2 text-sm font-semibold">{ti.thread}</p>}
                <ul className="space-y-3">
                  {detail.misses.map((m, i) => (
                    <li key={i}>
                      <p className="font-display text-base italic leading-snug text-ink">“{m.question}”</p>
                      <p className="mt-1 text-sm text-muted">You answered “{m.answer}” · {m.sure}</p>
                      {ti?.why[i] ? <p className="mt-0.5 text-sm"><b>Why this is wrong:</b> {ti.why[i]}</p> : !refining && <p className="mt-0.5 text-sm text-muted"><b>Why this is wrong:</b> Explanation unavailable</p>}
                    </li>
                  ))}
                </ul>
              </blockquote>
            )}
            {r.danger && ti?.confident && (
              <p className="mt-2 rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-3 py-2 text-sm text-[var(--bad-text)]"><b>Confident mistake:</b> {ti.confident}</p>
            )}
          </div>
        )}
        {(open === r.id || (open === null && weakest?.id === r.id)) && (
          <div className="mt-3 space-y-2 sm:pl-16">
            {ti?.trend && <p className="text-sm"><b>Confidence pattern:</b> {ti.trend}</p>}
            {ti?.explainer && <p className="text-sm"><b>The idea, briefly:</b> {ti.explainer}</p>}
            <EvidenceList log={log} nodeId={r.id} />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader
        title="What to work on"
        sub={
          weakest ? (
            <>
              Weakest so far: <b className="text-ink">{weakest.label}</b>
            </>
          ) : assessed ? (
            'Nothing is flagged yet. Keep going to confirm the rest.'
          ) : (
            'Answer some questions and this page shows what to work on and why.'
          )
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost" onClick={() => go('graph')}>← Back to map</button>
            <button className="btn" onClick={exportJson}>Export JSON</button>
          </div>
        }
      />

      {/* The agent's one-line read of the whole result */}
      <section className="mb-3 rounded-[var(--radius-sm)] border border-border bg-surface px-4 py-3" style={{ borderLeft: '4px solid var(--accent)' }} aria-label="Takeaway">
        <div className="label mb-0.5">{ins.source === 'agent' ? 'Agent’s read' : 'Summary'}</div>
        <p className="text-base font-medium leading-snug">{ins.takeaway}</p>
        {refining && <AgentStatus className="mt-1.5" fallback="Refining this read…" />}
      </section>

      {ins.scoreNote && <p className="mb-3 px-1 text-sm text-muted">{ins.scoreNote}</p>}

      {/* At a glance: a KPI strip, one row of four */}
      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Summary">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-[var(--radius-sm)] border px-4 py-2.5"
            style={{
              background: t.live ? tint(t.token, 11) : 'var(--surface)',
              borderColor: t.live ? `color-mix(in srgb, var(--${t.token}) 30%, var(--border))` : 'var(--border)',
              borderLeft: `4px solid ${t.live ? `var(--${t.token})` : 'var(--border)'}`,
            }}
          >
            <div className="text-3xl font-semibold leading-none">{t.n}</div>
            <div className="mt-1 text-xs font-medium text-muted">{t.label}</div>
          </div>
        ))}
      </section>

      {/* How much to trust it */}
      {coverage < 1 && (
        <Alert
          variant="info"
          className="mb-5"
          icon={<Donut value={coverage} {...RING} label={`${pct}%`} />}
          title={`${assessed === 0 ? 'No' : `Only ${assessed} of ${total}`} topics assessed${assessed ? ` (${pct}%)` : ''}`}
        >
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {assessed < 3
                ? 'The list below is a first impression, not a verdict. Finish the quick check to trust it.'
                : 'Finish the quick check to complete the picture.'}
            </span>
            <button className="btn btn-primary" onClick={finishCheck}>Finish the quick check</button>
          </span>
        </Alert>
      )}

      {/* Red to green */}
      <div className="space-y-3">
        {SECTIONS.map((s) => {
          const rows = report[s.key];
          if (!rows.length)
            return (
              <div key={s.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--radius-sm)] border border-dashed border-border px-4 py-2.5 text-sm" style={{ borderLeft: `4px solid var(--${s.token})` }}>
                <span className="font-semibold">{s.title}</span>{' '}
                <span className="text-xs font-normal text-muted">{s.empty}</span>
              </div>
            );
          return (
            <section key={s.key} className="card overflow-hidden" style={{ borderLeft: `4px solid var(--${s.token})` }}>
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-3">
                <h2 className="text-xl font-semibold">
                  {s.title} <span className="text-base font-normal text-muted">· {rows.length}</span>
                </h2>
                <p className="text-sm text-muted">{s.key === 'needs' && ins.topics[rows[0].id]?.start ? ins.topics[rows[0].id].start : s.hint}</p>
              </header>
              <ul className="divide-y divide-border">{rows.map((r) => <Row key={r.id} r={r} token={s.token} />)}</ul>
            </section>
          );
        })}

        {report.partial.length > 0 && (
          <section className="card overflow-hidden" style={{ borderLeft: '4px solid var(--state-tentative)' }}>
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
              <h2 className="text-xl font-semibold">Partly checked <span className="text-base font-normal text-muted">· {report.partial.length}</span></h2>
              <p className="text-sm text-muted">One answer so far, too early to say.</p>
            </header>
            <ul className="divide-y divide-border">{report.partial.map((r) => <Row key={r.id} r={r} token="state-tentative" />)}</ul>
          </section>
        )}

        {report.unassessed.length > 0 && (
          <details className="rounded-[var(--radius-sm)] border border-border bg-surface px-4 py-2.5 text-sm" style={{ borderLeft: '4px solid var(--state-unknown)' }}>
            <summary className="cursor-pointer">
              <span className="font-semibold">Not assessed yet</span> <span className="text-xs text-muted">Show which topics</span>
            </summary>
            <p className="mt-2 text-muted">{report.unassessed.map((r) => r.label).join(', ')}.</p>
          </details>
        )}
      </div>
    </div>
  );
}
