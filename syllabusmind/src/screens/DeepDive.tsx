import { useRef, useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import QuestionCard from '../components/QuestionCard';
import ScoreGraph from '../components/ScoreGraph';
import { Banner, PageHeader, ProgressBar, StateChip, StoreNotice, type Route } from '../components/ui';
import { deriveState, mastery, newBelief } from '../engine/mastery';

export default function DeepDive({ go }: { go: (r: Route) => void }) {
  const { deep, beliefs, answer, advanceDeep, endDeepDive } = useApp();
  const startMastery = useRef(deep ? mastery(beliefs[deep.nodeId] ?? newBelief()) : 0);
  const [showMap, setShowMap] = useState(() => {
    try {
      return localStorage.getItem('sm.quizMap') !== '0';
    } catch {
      return true;
    }
  });
  if (!deep) return null;
  const node = GRAPH.nodes.find((n) => n.id === deep.nodeId)!;
  const q = deep.queue[deep.idx];
  const finished = !q;
  const b = beliefs[node.id] ?? newBelief();
  const toggleMap = () => {
    const v = !showMap;
    setShowMap(v);
    try {
      localStorage.setItem('sm.quizMap', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const back = () => {
    endDeepDive();
    go('graph');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <PageHeader
        title={`Go deeper: ${node.label}`}
        sub="A fresh set of questions on this topic. They get harder after a right answer and easier after a wrong one."
        right={
          <button className="btn" aria-pressed={showMap} onClick={toggleMap}>
            {showMap ? 'Hide map' : 'View map'}
          </button>
        }
      />
      <Banner />
      <StoreNotice />
      <div className="mb-5">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">{finished ? 'All questions answered' : `Question ${deep.idx + 1} of ${deep.queue.length}`}</span>
        </div>
        <ProgressBar value={Math.min(deep.idx, deep.queue.length)} max={deep.queue.length} label="Deep-dive progress" />
      </div>

      <div className={`grid gap-5 ${showMap ? 'lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]' : ''}`}>
        <div className={showMap ? '' : 'mx-auto w-full max-w-3xl'}>
          {!finished ? (
            <QuestionCard
              q={q}
              topic={node.label}
              caption={`Question ${deep.idx + 1} of ${deep.queue.length}`}
              onSubmit={(c, conf) => answer(q, c, conf, 'deepdive')}
              onNext={advanceDeep}
              nextLabel={deep.idx + 1 === deep.queue.length ? 'Finish' : 'Next question'}
            />
          ) : (
            <div className="card p-6 sm:p-8">
              <h2 className="text-xl font-semibold">Deep-dive complete</h2>
              <div className="mt-3 flex items-center gap-3">
                <StateChip state={deriveState(b)} />
                <span className="text-muted">Mastery {Math.round(startMastery.current * 100)}% → {Math.round(mastery(b) * 100)}%</span>
              </div>
              <p className="mt-3 text-sm text-muted">Open the map to see the new colour, or run this topic again to get a different set of questions.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="btn btn-primary" onClick={back}>Back to the map</button>
                <button className="btn" onClick={() => { endDeepDive(); go('report'); }}>See what to work on</button>
              </div>
            </div>
          )}
        </div>
        {showMap && (
          <aside className="card hidden h-[520px] p-2 lg:block" aria-label="Map">
            <ScoreGraph graph={GRAPH} beliefs={beliefs} variant="mini" testingId={finished ? null : node.id} />
          </aside>
        )}
      </div>
    </div>
  );
}
