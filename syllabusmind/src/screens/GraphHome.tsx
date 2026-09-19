import { useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import ScoreGraph from '../components/ScoreGraph';
import { EvidenceList, Legend, PageHeader, StateChip, type Route } from '../components/ui';
import { deriveState, isDanger, mastery, newBelief } from '../engine/mastery';
import { neighborhood } from '../engine/graph';
import { summarizeEvidence } from '../lib/evidence';
import { TRIGGER_HINT } from '../lib/dbmsGraph';

export default function GraphHome({ go }: { go: (r: Route) => void }) {
  const { beliefs, log, diagnosticDone, startDeepDive, busy, notice } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const node = GRAPH.nodes.find((n) => n.id === sel);
  const b = (sel && beliefs[sel]) || newBelief();
  const near = sel ? neighborhood(GRAPH, sel) : null;
  const started = Object.values(beliefs).some((x) => x.answers > 0);

  const deeper = async () => {
    if (sel && (await startDeepDive(sel))) go('deepdive');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <PageHeader
        title={GRAPH.title}
        sub="Your score graph. Colour and shape together show what we believe about each topic. Pick a topic to see its evidence and go deeper."
        right={
          <div className="flex gap-2">
            {!diagnosticDone && <button className="btn btn-primary" onClick={() => go('diagnostic')}>{started ? 'Continue diagnostic' : 'Start root diagnostic'}</button>}
            <button className="btn" onClick={() => go('report')}>Open outcome</button>
          </div>
        }
      />
      {notice && <p className="mb-3 text-sm text-accent">{notice}</p>}
      {!diagnosticDone && (
        <p className="mb-4 rounded-[var(--radius-sm)] bg-accent-soft p-3 text-sm text-accent">
          Every topic starts grey. The root diagnostic asks two questions per topic and colours the map as you go.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="card flex h-[660px] flex-col p-3">
          <div className="min-h-0 flex-1">
            <ScoreGraph graph={GRAPH} beliefs={beliefs} selectedId={sel} onSelect={setSel} />
          </div>
          <Legend />
        </section>
        <aside className="card h-[660px] overflow-auto p-5" aria-live="polite">
          {!node ? (
            <div className="text-muted">
              <h2 className="text-lg font-semibold text-ink">Select a topic</h2>
              <p className="mt-2 text-sm">Click a node to see its state and the evidence behind it. "Go deeper" generates a fresh set of questions on that topic.</p>
              <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-alt p-3 text-xs"><b>Demo tip:</b> {TRIGGER_HINT}</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold">{node.label}</h2>
                  <p className="text-sm text-muted">Unit {node.unit}</p>
                </div>
                <StateChip state={deriveState(b)} />
              </div>
              {node.description && <p className="mt-2 text-sm">{node.description}</p>}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{Math.round(mastery(b) * 100)}%</div><div className="text-xs text-muted">mastery</div></div>
                <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{b.answers}</div><div className="text-xs text-muted">answers</div></div>
                <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{b.correct}</div><div className="text-xs text-muted">correct</div></div>
              </div>
              {isDanger(b) && <p className="mt-3 rounded-[var(--radius-sm)] border border-danger p-2 text-sm text-danger">Danger: a confident wrong answer here. This is a topic you may believe you know.</p>}
              <p className="mt-3 text-sm text-muted">{summarizeEvidence(log, node.id)}</p>
              <button className="btn btn-primary mt-4 w-full" disabled={!!busy} onClick={deeper}>{busy ?? 'Go deeper on this topic'}</button>
              {near && (near.prereqs.length > 0 || near.dependents.length > 0) && (
                <div className="mt-5">
                  <div className="label mb-1">Connected topics</div>
                  <div className="flex flex-wrap gap-2">
                    {near.prereqs.map((n) => <button key={n.id} className="chip hover:bg-accent-soft" onClick={() => setSel(n.id)}>← {n.label}</button>)}
                    {near.dependents.map((n) => <button key={n.id} className="chip hover:bg-accent-soft" onClick={() => setSel(n.id)}>→ {n.label}</button>)}
                  </div>
                </div>
              )}
              <div className="label mb-2 mt-5">Evidence trail</div>
              <EvidenceList log={log} nodeId={node.id} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
