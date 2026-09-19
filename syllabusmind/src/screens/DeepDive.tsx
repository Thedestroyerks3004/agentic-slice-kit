import { useRef } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import QuestionCard from '../components/QuestionCard';
import ScoreGraph from '../components/ScoreGraph';
import { Banner, Legend, PageHeader, StateChip, type Route } from '../components/ui';
import { deriveState, mastery, newBelief } from '../engine/mastery';
import { neighborhood } from '../engine/graph';

export default function DeepDive({ go }: { go: (r: Route) => void }) {
  const { deep, beliefs, answer, advanceDeep, endDeepDive, notice } = useApp();
  const startMastery = useRef(deep ? mastery(beliefs[deep.nodeId] ?? newBelief()) : 0);
  if (!deep) return null;
  const node = GRAPH.nodes.find((n) => n.id === deep.nodeId)!;
  const near = neighborhood(GRAPH, node.id);
  const focus = [node.id, ...near.prereqs.map((n) => n.id), ...near.dependents.map((n) => n.id)];
  const q = deep.queue[deep.idx];
  const finished = !q;
  const b = beliefs[node.id] ?? newBelief();

  const back = () => {
    endDeepDive();
    go('graph');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <PageHeader
        title={`Go deeper: ${node.label}`}
        sub="A fresh set of questions on this topic. They get harder after a right answer and easier after a wrong one, and end on a contrast check."
        right={<button className="btn" onClick={back}>Exit to graph</button>}
      />
      <Banner />
      {notice && <p className="mb-3 text-sm text-accent">{notice}</p>}
      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        <span>{finished ? 'Complete' : `Question ${deep.idx + 1} of ${deep.queue.length}`}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
          <div className="h-full bg-accent transition-all" style={{ width: `${(deep.idx / deep.queue.length) * 100}%` }} />
        </div>
        <span className="chip">{deep.source === 'live' ? 'Freshly generated' : 'Backup set'}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          {!finished ? (
            <QuestionCard
              q={q}
              topic={node.label}
              onSubmit={(c, conf) => answer(q, c, conf, 'deepdive')}
              onNext={advanceDeep}
              nextLabel={deep.idx + 1 === deep.queue.length ? 'Finish' : 'Next question'}
            />
          ) : (
            <div className="card p-6">
              <h2 className="text-2xl font-bold">Deep-dive complete</h2>
              <div className="mt-3 flex items-center gap-3">
                <StateChip state={deriveState(b)} />
                <span className="text-muted">Mastery {Math.round(startMastery.current * 100)}% → {Math.round(mastery(b) * 100)}%</span>
              </div>
              <p className="mt-3 text-sm text-muted">Open the score graph to see the new colour, or run this topic again to get a different set of questions.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={back}>Back to score graph</button>
                <button className="btn" onClick={() => { endDeepDive(); go('report'); }}>Open outcome</button>
              </div>
            </div>
          )}
        </div>
        <section className="card flex h-[600px] flex-col p-3">
          <div className="min-h-0 flex-1">
            <ScoreGraph graph={GRAPH} beliefs={beliefs} selectedId={node.id} focusIds={focus} />
          </div>
          <Legend compact />
        </section>
      </div>
    </div>
  );
}
