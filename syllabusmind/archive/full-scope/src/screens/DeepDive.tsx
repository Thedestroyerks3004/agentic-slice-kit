import { useRef } from 'react';
import { useApp } from '../store/useApp';
import QuestionCard from '../components/QuestionCard';
import ScoreGraph from '../components/ScoreGraph';
import { Banner, Legend, PageHeader, StateChip, type Route } from '../components/ui';
import { baseMastery, deriveState, newBelief } from '../engine/mastery';
import { rollup, subgraphFor } from '../engine/graph';

export default function DeepDive({ go }: { go: (r: Route) => void }) {
  const { snap, deep, pulses, answer, advanceDeep, endDeepDive, focusId, setReportScope } = useApp();
  const startMastery = useRef(deep && snap ? baseMastery(rollup(snap.graph, snap.beliefs)[deep.nodeId] ?? newBelief()) : 0);
  if (!snap || !deep) return null;
  const g = snap.graph;
  const node = g.nodes.find((n) => n.id === deep.nodeId)!;
  const beliefs = rollup(g, snap.beliefs);
  const q = deep.queue[deep.idx];
  const finished = !q;
  const b = beliefs[node.id] ?? newBelief();
  const label = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id;
  const scoped = subgraphFor(g, focusId ?? node.id);

  const back = () => {
    endDeepDive();
    go('graph');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <PageHeader
        title={`Deep-dive: ${node.label}`}
        sub="Every question here is about this topic and its sub-topics only. Answers roll up into the topic's colour."
        right={<button className="btn" onClick={back}>Exit to graph</button>}
      />
      <Banner />
      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        <span>{finished ? 'Complete' : `Question ${deep.idx + 1} of ${deep.queue.length}`}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
          <div className="h-full bg-accent transition-all" style={{ width: `${(deep.idx / deep.queue.length) * 100}%` }} />
        </div>
        {deep.repeats > 0 && <span className="chip">Includes {deep.repeats} repeated</span>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          {!finished ? (
            <QuestionCard
              q={q}
              topic={label(q.nodeId)}
              onSubmit={(c, conf) => answer(q, c, conf, 'deepdive')}
              onNext={advanceDeep}
              nextLabel={deep.idx + 1 === deep.queue.length ? 'Finish' : 'Next question'}
            />
          ) : (
            <div className="card p-6">
              <h2 className="text-2xl font-bold">Deep-dive complete</h2>
              <div className="mt-3 flex items-center gap-3">
                <StateChip state={deriveState(b)} />
                <span className="text-muted">
                  Mastery {Math.round(startMastery.current * 100)}% → {Math.round(baseMastery(b) * 100)}%
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">The branch on the right shows each sub-topic's new state. Open one to see the evidence behind it.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={back}>Back to this branch</button>
                <button className="btn" onClick={() => { setReportScope(node.id); endDeepDive(); go('report'); }}>Report for {node.label}</button>
              </div>
            </div>
          )}
        </div>
        <section className="card flex h-[560px] flex-col p-3">
          <div className="min-h-0 flex-1">
            <ScoreGraph graph={scoped} beliefs={beliefs} pulses={pulses} selectedId={q?.nodeId ?? node.id} />
          </div>
          <Legend compact />
        </section>
      </div>
    </div>
  );
}
