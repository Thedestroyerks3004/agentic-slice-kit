import { useState } from 'react';
import { useApp } from '../store/useApp';
import { EvidenceList, PageHeader, StateChip, type Route } from '../components/ui';
import { deriveState, effectiveMastery, isDanger } from '../engine/mastery';
import { dependentCount, rollup, subtreeIds, topGraph } from '../engine/graph';
import { summarizeEvidence } from '../lib/evidence';

export default function Report({ go }: { go: (r: Route) => void }) {
  const { snap, startDeepDive, busy, reportScope, setReportScope, setFocus } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  if (!snap) return null;
  const g = snap.graph;
  const scope = reportScope ? g.nodes.find((n) => n.id === reportScope) : undefined;
  const ids = scope ? subtreeIds(g, scope.id) : topGraph(g).nodes.map((n) => n.id);
  const beliefs = rollup(g, snap.beliefs);
  const rows = ids.map((id) => {
    const n = g.nodes.find((x) => x.id === id)!;
    const b = beliefs[id];
    return { n, b, state: deriveState(b), m: effectiveMastery(b), deps: dependentCount(g, id), danger: isDanger(b), isRoot: id === scope?.id };
  });
  const answered = rows.filter((r) => r.b.answers > 0).length;
  const many = rows.length > 1;
  const candidates = rows.filter((r) => !(scope && many && r.isRoot));
  const weak = candidates.filter((r) => r.state === 'weak' || r.state === 'shaky').sort((a, b) => b.deps - a.deps || a.m - b.m);
  const strong = candidates.filter((r) => r.state === 'solid' || r.state === 'verified');
  const danger = candidates.filter((r) => r.danger);
  const top = weak.slice(0, 3);
  const weakOnly = weak.filter((r) => !r.danger);
  const strongOnly = strong.filter((r) => !r.danger);
  const root = scope ? rows.find((r) => r.isRoot) : undefined;

  const deeper = async (id: string) => {
    if (await startDeepDive(id)) go('deepdive');
  };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `syllabusmind-${snap.session.rollNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li className="rounded-[var(--radius-sm)] border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{r.n.label}</span>
          <StateChip state={r.state} />
          <span className="text-sm text-muted">{Math.round(r.m * 100)}%</span>
          {r.deps > 0 && <span className="text-xs text-muted">{r.deps} {r.deps === 1 ? 'topic depends' : 'topics depend'} on it</span>}
        </div>
        <div className="flex gap-2">
          <button className="btn !py-1.5" onClick={() => setOpen(open === r.n.id ? null : r.n.id)}>{open === r.n.id ? 'Hide evidence' : 'Evidence'}</button>
          <button className="btn btn-primary !py-1.5" disabled={!!busy} onClick={() => deeper(r.n.id)}>Go deeper</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{summarizeEvidence(snap.log, r.n.id, g)}</p>
      {open === r.n.id && <div className="mt-3"><EvidenceList log={snap.log} nodeId={r.n.id} graph={g} /></div>}
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader
        title={scope ? `What to work on: ${scope.label}` : 'What to work on'}
        sub={
          scope
            ? `Only ${scope.label} and its sub-topics. ${answered} of ${rows.length} have answers.`
            : `Built from ${answered} of ${rows.length} topics with answers. Every claim below links to the answers behind it.`
        }
        right={
          <div className="flex flex-wrap gap-2">
            {scope && <button className="btn" onClick={() => setReportScope(null)}>Whole syllabus report</button>}
            <button className="btn" onClick={exportJson}>Export JSON</button>
            <button className="btn" onClick={() => { if (scope) setFocus(scope.id); go('graph'); }}>Back to graph</button>
          </div>
        }
      />
      {answered < rows.length && (
        <p className="mb-4 rounded-[var(--radius-sm)] bg-accent-soft p-3 text-sm text-accent">
          {rows.length - answered} {rows.length - answered === 1 ? 'topic has' : 'topics have'} no answers yet, so {rows.length - answered === 1 ? 'it is' : 'they are'} not judged here.{' '}
          {!scope && <button className="underline" onClick={() => go('diagnostic')}>Finish the diagnostic</button>}
        </p>
      )}

      {root && (
        <section className="card p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">{root.n.label} overall</h2>
            <StateChip state={root.state} />
            <span className="text-muted">{Math.round(root.m * 100)}%</span>
          </div>
          <p className="mt-2 text-sm text-muted">{summarizeEvidence(snap.log, root.n.id, g)}</p>
        </section>
      )}

      <section className={`card p-6 ${root ? 'mt-5' : ''}`}>
        <h2 className="text-xl font-semibold">{scope ? 'Weakest sub-topics' : 'Your weakest topics'}</h2>
        {top.length ? (
          <p className="mt-2 text-lg">
            {top.map((t, i) => (<span key={t.n.id}>{i > 0 && (i === top.length - 1 ? ' and ' : ', ')}<b>{t.n.label}</b></span>))}.
          </p>
        ) : (
          <p className="mt-2 text-muted">No weak or shaky topics so far. Keep going to confirm the rest.</p>
        )}
      </section>

      {!!danger.length && (
        <section className="card mt-5 border-danger p-6">
          <h2 className="text-xl font-semibold text-danger">Danger: confident but wrong</h2>
          <p className="mb-3 text-sm text-muted">These are the topics you may walk away still believing you know.</p>
          <ul className="space-y-3">{danger.map((r) => <Row key={r.n.id} r={r} />)}</ul>
        </section>
      )}

      <section className="card mt-5 p-6">
        <h2 className="mb-1 text-xl font-semibold">Weak and shaky</h2>
        <p className="mb-3 text-sm text-muted">{scope ? 'Weakest first.' : 'Ranked by how many other topics depend on them.'} Danger topics are listed above.</p>
        <ul className="space-y-3">
          {weakOnly.map((r) => <Row key={r.n.id} r={r} />)}
          {!weakOnly.length && <li className="text-sm text-muted">None yet.</li>}
        </ul>
      </section>

      <section className="card mt-5 p-6">
        <h2 className="mb-1 text-xl font-semibold">Solid: no need to spend time here</h2>
        <ul className="mt-3 space-y-3">
          {strongOnly.map((r) => <Row key={r.n.id} r={r} />)}
          {!strongOnly.length && <li className="text-sm text-muted">Nothing is solid yet.</li>}
        </ul>
      </section>
    </div>
  );
}
