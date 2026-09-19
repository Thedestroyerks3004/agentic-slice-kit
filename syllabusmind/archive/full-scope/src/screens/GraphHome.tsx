import { useEffect, useState } from 'react';
import { useApp } from '../store/useApp';
import ScoreGraph from '../components/ScoreGraph';
import { EvidenceList, Legend, PageHeader, StateChip, type Route } from '../components/ui';
import { baseMastery, deriveState, effectiveMastery, isDanger, newBelief } from '../engine/mastery';
import { neighborsOf } from '../engine/propagation';
import { ancestorsOf, childrenOf, rollup, subgraphFor, topGraph } from '../engine/graph';
import { summarizeEvidence } from '../lib/evidence';
import { DEMO_REOPEN_TRIGGER } from '../lib/demoData';

export default function GraphHome({ go }: { go: (r: Route) => void }) {
  const { snap, pulses, startDeepDive, busy, notice, focusId, setFocus, setReportScope } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [focusId]);
  if (!snap) return null;
  const g = snap.graph;
  const focus = focusId ? g.nodes.find((n) => n.id === focusId) : undefined;
  const shown = focus ? subgraphFor(g, focus.id) : topGraph(g);
  const beliefs = rollup(g, snap.beliefs);
  const label = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id;
  const node = g.nodes.find((n) => n.id === sel);
  const b = (sel && beliefs[sel]) || newBelief();
  const nbs = sel && !node?.parentId ? neighborsOf(sel, g.edges) : [];
  const crumbs = focus ? [...ancestorsOf(g, focus.id), focus.id] : [];

  const deeper = async () => {
    if (sel && (await startDeepDive(sel))) go('deepdive');
  };
  const openReport = () => {
    setReportScope(focus ? focus.id : null);
    go('report');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <PageHeader
        title={focus ? focus.label : g.title}
        sub={
          focus
            ? `Sub-topics of ${focus.label}. Questions and the report from here cover only this topic.`
            : 'Your score graph. Pick any topic to see its evidence and go deeper. Colour and shape together show what we believe.'
        }
        right={
          <div className="flex gap-2">
            {!focus && !snap.diagnosticDone && <button className="btn btn-primary" onClick={() => go('diagnostic')}>Continue diagnostic</button>}
            <button className="btn" onClick={openReport}>{focus ? `Report for ${focus.label}` : 'Open report'}</button>
          </div>
        }
      />
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button className={`rounded px-2 py-1 ${!focus ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:text-ink'}`} onClick={() => setFocus(null)}>All topics</button>
        {crumbs.map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            <span className="text-muted">›</span>
            <button className={`rounded px-2 py-1 ${i === crumbs.length - 1 ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:text-ink'}`} onClick={() => setFocus(id)}>{label(id)}</button>
          </span>
        ))}
      </nav>
      {notice && <p className="mb-3 text-sm text-accent">{notice}</p>}
      {!focus && !snap.diagnosticDone && (
        <p className="mb-4 rounded-[var(--radius-sm)] bg-accent-soft p-3 text-sm text-accent">
          The root diagnostic isn't finished, so many topics are still grey. Continue it to colour the whole map.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="card flex h-[640px] flex-col p-3">
          <div className="min-h-0 flex-1">
            <ScoreGraph graph={shown} beliefs={beliefs} pulses={focus ? {} : pulses} selectedId={sel} onSelect={setSel} />
          </div>
          <Legend />
        </section>
        <aside className="card h-[640px] overflow-auto p-5" aria-live="polite">
          {!node ? (
            <div className="text-muted">
              <h2 className="text-lg font-semibold text-ink">Select a topic</h2>
              <p className="mt-2 text-sm">
                Click a node to see its state and evidence. "Go deeper" splits it into sub-topics, opens that branch of the graph and quizzes only that topic.
              </p>
              {g.source === 'demo' && !focus && (
                <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-alt p-3 text-xs">
                  <b>Demo tip:</b> {DEMO_REOPEN_TRIGGER.hint}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold">{node.label}</h2>
                  <p className="text-sm text-muted">{node.parentId ? `Sub-topic of ${label(node.parentId)}` : node.unit}</p>
                </div>
                <StateChip state={deriveState(b)} />
              </div>
              {node.description && <p className="mt-2 text-sm">{node.description}</p>}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{Math.round(effectiveMastery(b) * 100)}%</div><div className="text-xs text-muted">mastery</div></div>
                <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{b.answers}</div><div className="text-xs text-muted">answers</div></div>
                <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{Math.round(baseMastery(b) * 100)}%</div><div className="text-xs text-muted">direct only</div></div>
              </div>
              {isDanger(b) && <p className="mt-3 rounded-[var(--radius-sm)] border border-danger p-2 text-sm text-danger">Danger: a confident wrong answer here. This is a topic you may believe you know.</p>}
              <p className="mt-3 text-sm text-muted">{summarizeEvidence(snap.log, node.id, g)}</p>
              <div className="mt-4 grid gap-2">
                <button className="btn btn-primary w-full" disabled={!!busy} onClick={deeper}>{busy ?? 'Go deeper on this topic'}</button>
                {childrenOf(g, node.id).length > 0 && focus?.id !== node.id && (
                  <button className="btn w-full" onClick={() => setFocus(node.id)}>View its sub-topics</button>
                )}
              </div>
              {!!nbs.length && (
                <div className="mt-5">
                  <div className="label mb-1">Connected topics</div>
                  <div className="flex flex-wrap gap-2">
                    {nbs.map((n) => (
                      <button key={n.nodeId} className="chip hover:bg-accent-soft" onClick={() => { setFocus(null); setSel(n.nodeId); }}>
                        {n.edge.from === node.id ? '→' : '←'} {label(n.nodeId)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="label mb-2 mt-5">Evidence trail</div>
              <EvidenceList log={snap.log} nodeId={node.id} graph={g} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
