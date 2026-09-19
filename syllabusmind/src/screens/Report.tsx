import { useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import { EvidenceList, PageHeader, StateChip, type Route } from '../components/ui';
import { deriveState, isDanger, mastery } from '../engine/mastery';
import { dependentCount } from '../engine/graph';
import { summarizeEvidence } from '../lib/evidence';

/** The actual deliverable: which topics are weak, which are fine, and why the system thinks so. */
export default function Report({ go }: { go: (r: Route) => void }) {
  const { beliefs, log, student, startDeepDive, busy } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const rows = GRAPH.nodes.map((n) => {
    const b = beliefs[n.id];
    return { n, b, state: deriveState(b), m: mastery(b), deps: dependentCount(GRAPH, n.id), danger: isDanger(b) };
  });
  const answered = rows.filter((r) => r.b.answers > 0).length;
  const needsWork = rows
    .filter((r) => r.state === 'weak' || r.state === 'shaky')
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'weak' ? -1 : 1) || b.deps - a.deps || a.m - b.m);
  const fine = rows.filter((r) => r.state === 'solid' || r.state === 'verified');
  const unsure = rows.filter((r) => r.state === 'tentative');
  const danger = rows.filter((r) => r.danger);
  const top = needsWork.slice(0, 3);

  const deeper = async (id: string) => {
    if (await startDeepDive(id)) go('deepdive');
  };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ student, beliefs, log }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `syllabusmind-${student?.roll ?? 'session'}.json`;
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
          {r.deps > 0 && <span className="text-xs text-muted">{r.deps} {r.deps === 1 ? 'topic builds' : 'topics build'} on it</span>}
        </div>
        <div className="flex gap-2">
          <button className="btn !py-1.5" onClick={() => setOpen(open === r.n.id ? null : r.n.id)}>{open === r.n.id ? 'Hide evidence' : 'Evidence'}</button>
          <button className="btn btn-primary !py-1.5" disabled={!!busy} onClick={() => deeper(r.n.id)}>Go deeper</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{summarizeEvidence(log, r.n.id)}</p>
      {open === r.n.id && <div className="mt-3"><EvidenceList log={log} nodeId={r.n.id} /></div>}
    </li>
  );

  const needs = needsWork.filter((r) => !r.danger);
  const solid = fine.filter((r) => !r.danger);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader
        title="What to work on"
        sub={`Built from ${answered} of ${rows.length} topics with answers. Every claim below links to the answers behind it.`}
        right={
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={exportJson}>Export JSON</button>
            <button className="btn" onClick={() => go('graph')}>Back to graph</button>
          </div>
        }
      />
      {answered < rows.length && (
        <p className="mb-4 rounded-[var(--radius-sm)] bg-accent-soft p-3 text-sm text-accent">
          {rows.length - answered} {rows.length - answered === 1 ? 'topic has' : 'topics have'} no answers yet, so {rows.length - answered === 1 ? 'it is' : 'they are'} not judged here.{' '}
          <button className="underline" onClick={() => go('diagnostic')}>Run the diagnostic</button>
        </p>
      )}

      <section className="card p-6">
        <h2 className="text-xl font-semibold">Your weakest topics</h2>
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
        <h2 className="mb-1 text-xl font-semibold">Needs work</h2>
        <p className="mb-3 text-sm text-muted">Weak first, then shaky. Topics that more other topics build on come first. Danger topics are listed above.</p>
        <ul className="space-y-3">
          {needs.map((r) => <Row key={r.n.id} r={r} />)}
          {!needs.length && <li className="text-sm text-muted">None yet.</li>}
        </ul>
      </section>

      <section className="card mt-5 p-6">
        <h2 className="mb-1 text-xl font-semibold">Solid: no need to spend time here</h2>
        <ul className="mt-3 space-y-3">
          {solid.map((r) => <Row key={r.n.id} r={r} />)}
          {!solid.length && <li className="text-sm text-muted">Nothing is solid yet.</li>}
        </ul>
      </section>

      {!!unsure.length && (
        <section className="card mt-5 p-6">
          <h2 className="mb-1 text-xl font-semibold">Not enough evidence yet</h2>
          <ul className="mt-3 space-y-3">{unsure.map((r) => <Row key={r.n.id} r={r} />)}</ul>
        </section>
      )}
    </div>
  );
}
