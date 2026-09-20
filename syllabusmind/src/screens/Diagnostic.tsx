import { useCallback, useEffect, useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import type { Question } from '../engine/types';
import QuestionCard from '../components/QuestionCard';
import ScoreGraph from '../components/ScoreGraph';
import { AgentStatus, PageHeader, ProgressBar, StoreNotice, type Route } from '../components/ui';

const useShowMap = () => {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem('sm.quizMap') !== '0';
    } catch {
      return true;
    }
  });
  const set = (v: boolean) => {
    setShow(v);
    try {
      localStorage.setItem('sm.quizMap', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return [show, set] as const;
};

export default function Diagnostic({ go }: { go: (r: Route) => void }) {
  const { beliefs, diagQs, nextDiagnosticQuestion, answer, markDiagnosticDone, checkOnly, setCheckOnly } = useApp();
  const [q, setQ] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useShowMap();

  const load = useCallback(async () => {
    setLoading(true);
    const next = await nextDiagnosticQuestion();
    if (!next) {
      if (!checkOnly) markDiagnosticDone();
      setCheckOnly(null);
      go('graph');
      return;
    }
    setQ(next);
    setLoading(false);
  }, [nextDiagnosticQuestion, markDiagnosticDone, checkOnly, setCheckOnly, go]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const single = checkOnly ? GRAPH.nodes.find((n) => n.id === checkOnly) : null;
  const scope = single ? [single] : GRAPH.nodes;
  const totalQs = scope.length * 2;
  const doneQs = scope.reduce((s, n) => s + Math.min(2, beliefs[n.id]?.answers ?? 0), 0);
  const topicsDone = GRAPH.nodes.filter((n) => beliefs[n.id].answers >= 2).length;
  const node = q ? GRAPH.nodes.find((n) => n.id === q.nodeId) : null;
  // Which of the topic's two questions this is, by the question itself (not by how many are answered, which changes on submit).
  const inTopic = q ? Math.max(1, (diagQs[q.nodeId]?.findIndex((x) => x.id === q.id) ?? 0) + 1) : 1;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <PageHeader
        title={single ? `Check: ${single.label}` : 'Quick check'}
        sub={single ? 'Two questions on this topic. Your answers colour it on the map.' : 'Two questions per topic, starting at the foundations.'}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>
              {showMap ? 'Hide map' : 'View map'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setCheckOnly(null); go('graph'); }} title="Your answers are saved. You can pick this up again from the map.">
              ← Exit to map
            </button>
          </div>
        }
      />
      <StoreNotice />
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{doneQs} of {totalQs} questions</span>
          {!single && <span className="text-muted">{topicsDone} of {GRAPH.nodes.length} topics checked</span>}
        </div>
        <ProgressBar value={doneQs} max={totalQs} label="Quick check progress" />
      </div>

      <div className={`grid gap-5 ${showMap ? 'lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]' : ''}`}>
        <div className={showMap ? '' : 'mx-auto w-full max-w-3xl'}>
          {loading || !q || !node ? (
            <div className="card p-8">
              <AgentStatus fallback="Preparing your questions…" />
            </div>
          ) : (
            <QuestionCard q={q} topic={node.label} caption={`Question ${inTopic} of 2`} onSubmit={(c, conf) => answer(q, c, conf, 'diagnostic')} onNext={load} />
          )}
        </div>
        {showMap && (
          <aside className="card hidden h-[520px] p-2 lg:block" aria-label="Map">
            <ScoreGraph graph={GRAPH} beliefs={beliefs} variant="mini" testingId={q?.nodeId ?? null} />
          </aside>
        )}
      </div>
    </div>
  );
}
