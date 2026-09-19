import { useState } from 'react';
import { draftOps, useApp } from '../store/useApp';
import ScoreGraph from '../components/ScoreGraph';
import { Legend, PageHeader, type Route } from '../components/ui';
import { topGraph } from '../engine/graph';

export default function Review({ go }: { go: (r: Route) => void }) {
  const { draft, editDraft, freeze, busy } = useApp();
  const [newLabel, setNewLabel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  if (!draft) return null;
  const g = draft.graph;
  const top = topGraph(g);
  const label = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <PageHeader
        title="Review your concept graph"
        sub="A wrong prerequisite edge would skew every later update, so check the topics and links before freezing. Arrows point from prerequisite to dependent."
        right={
          <button className="btn btn-primary" disabled={top.nodes.length < 2 || !!busy} onClick={async () => { await freeze(); go('diagnostic'); }}>
            {busy ?? 'Approve and freeze graph'}
          </button>
        }
      />
      <p className="mb-4 text-sm text-muted">
        Source: {g.source === 'demo' ? 'curated demo graph' : g.source === 'bundle' ? 'built from your syllabus file, questions pre-generated' : g.source === 'llm' ? 'model extraction' : 'headings and bullets (no model key)'} · {top.nodes.length} topics · {g.edges.length} links
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">Topics</h2>
            <ul className="max-h-72 space-y-2 overflow-auto pr-1">
              {top.nodes.map((n) => (
                <li key={n.id} className="flex items-center gap-2">
                  <input className="input" value={n.label} aria-label={`Rename ${n.label}`} onChange={(e) => editDraft((x) => draftOps.rename(x, n.id, e.target.value))} />
                  <span className="hidden w-40 truncate text-xs text-muted sm:block">{n.unit}</span>
                  <button className="btn" onClick={() => editDraft((x) => draftOps.removeNode(x, n.id))} aria-label={`Delete ${n.label}`}>✕</button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input className="input" placeholder="Add a topic" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              <button className="btn" disabled={!newLabel.trim()} onClick={() => { editDraft((x) => draftOps.addNode(x, newLabel.trim(), 'General')); setNewLabel(''); }}>Add</button>
            </div>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">Prerequisite links</h2>
            <ul className="max-h-72 space-y-2 overflow-auto pr-1">
              {g.edges.map((e) => (
                <li key={`${e.from}>${e.to}`} className="grid grid-cols-[1fr_110px_auto] items-center gap-2 text-sm">
                  <span>{label(e.from)} <span className="text-muted">→</span> {label(e.to)}</span>
                  <input type="range" min={0.1} max={1} step={0.1} value={e.weight} aria-label="Link strength" onChange={(ev) => editDraft((x) => draftOps.setWeight(x, e, +ev.target.value))} />
                  <span className="flex items-center gap-2">
                    <span className="w-8 text-right text-xs text-muted">{e.weight.toFixed(1)}</span>
                    <button className="btn !px-2 !py-1" onClick={() => editDraft((x) => draftOps.removeEdge(x, e))} aria-label="Delete link">✕</button>
                  </span>
                </li>
              ))}
              {!g.edges.length && <li className="text-sm text-muted">No links yet. Add some below.</li>}
            </ul>
            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
              <select className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Prerequisite">
                <option value="">Prerequisite…</option>
                {top.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Dependent">
                <option value="">Dependent…</option>
                {top.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <button className="btn" disabled={!from || !to} onClick={() => { editDraft((x) => draftOps.addEdge(x, from, to)); setFrom(''); setTo(''); }}>Link</button>
            </div>
          </section>
        </div>
        <section className="card flex h-[640px] flex-col p-3">
          <div className="min-h-0 flex-1">
            <ScoreGraph graph={top} />
          </div>
          <Legend compact />
        </section>
      </div>
    </div>
  );
}
