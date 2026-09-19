import { useCallback, useEffect, useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import type { Question } from '../engine/types';
import QuestionCard from '../components/QuestionCard';
import ScoreGraph from '../components/ScoreGraph';
import { Legend, PageHeader, type Route } from '../components/ui';

export default function Diagnostic({ go }: { go: (r: Route) => void }) {
  const { beliefs, nextDiagnosticQuestion, answer, markDiagnosticDone, notice } = useApp();
  const [q, setQ] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const next = await nextDiagnosticQuestion();
    if (!next) {
      markDiagnosticDone();
      go('graph');
      return;
    }
    setQ(next);
    setLoading(false);
  }, [nextDiagnosticQuestion, markDiagnosticDone, go]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = GRAPH.nodes.length;
  const done = GRAPH.nodes.filter((n) => beliefs[n.id].answers >= 2).length;
  const node = q ? GRAPH.nodes.find((n) => n.id === q.nodeId) : null;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <PageHeader title="Root diagnostic" sub="Two questions per topic, starting at the foundations and moving outward. Watch the map fill in as you answer." />
      <div className="mb-5">
        <div className="mb-1 flex justify-between text-sm text-muted">
          <span>{node ? `Topic: ${node.label}` : 'Preparing…'}</span>
          <span>{done} of {total} topics done</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-alt" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
          <div className="h-full bg-accent transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      </div>
      {notice && <p className="mb-3 text-sm text-accent">{notice}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          {loading || !q || !node ? (
            <div className="card p-8 text-muted">Generating questions…</div>
          ) : (
            <QuestionCard q={q} topic={node.label} onSubmit={(c, conf) => answer(q, c, conf, 'diagnostic')} onNext={load} />
          )}
          <button className="mt-3 text-sm text-muted underline" onClick={() => go('graph')}>Back to the graph</button>
        </div>
        <section className="card flex h-[600px] flex-col p-3">
          <div className="min-h-0 flex-1">
            <ScoreGraph graph={GRAPH} beliefs={beliefs} selectedId={q?.nodeId} />
          </div>
          <Legend compact />
        </section>
      </div>
    </div>
  );
}
