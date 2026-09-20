import { useMemo, useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import ScoreGraph from '../components/ScoreGraph';
import { Alert, AgentStatus, EvidenceList, PageHeader, ProgressBar, Segmented, StateChip, StoreNotice, type Route } from '../components/ui';
import { deriveState, isDanger, mastery, newBelief } from '../engine/mastery';
import { neighborhood, unlocks } from '../engine/graph';
import { summarizeEvidence } from '../lib/evidence';
import { STATE_META, StateIcon } from '../lib/states';
import { TRIGGER_HINT, UNITS } from '../lib/dbmsGraph';
import { recommendNext } from '../lib/recommend';
import type { BeliefState } from '../engine/types';

const RANK: Record<BeliefState, number> = { weak: 0, shaky: 1, unknown: 2, tentative: 2, solid: 3, verified: 4 };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function GraphHome({ go }: { go: (r: Route) => void }) {
  const { beliefs, log, diagnosticDone, startDeepDive, setCheckOnly, busy, notice, deep, endDeepDive } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('list');
  const [unit, setUnit] = useState<string | null>(null);
  const [toggled, setToggled] = useState<Record<string, boolean>>({}); // a unit the student opened or closed by hand

  const bOf = (id: string) => beliefs[id] ?? newBelief();
  const stateOf = (id: string) => deriveState(bOf(id));
  const total = GRAPH.nodes.length;
  const checked = GRAPH.nodes.filter((n) => bOf(n.id).answers >= 2).length;
  const started = Object.values(beliefs).some((x) => x.answers > 0);
  const strong = GRAPH.nodes.filter((n) => ['solid', 'verified'].includes(stateOf(n.id))).length;
  const weak = GRAPH.nodes.filter((n) => stateOf(n.id) === 'weak').length;
  const shaky = GRAPH.nodes.filter((n) => stateOf(n.id) === 'shaky').length;
  const rec = useMemo(() => recommendNext(GRAPH, beliefs), [beliefs]);
  const visibleIds = unit ? GRAPH.nodes.filter((n) => n.unit === unit).map((n) => n.id) : undefined;

  const node = GRAPH.nodes.find((n) => n.id === sel);
  const b = node ? bOf(node.id) : newBelief();
  const near = node ? neighborhood(GRAPH, node.id) : null;
  const recUnit = rec ? GRAPH.nodes.find((n) => n.id === rec.nodeId)?.unit : undefined;
  // Clusters start collapsed. The unit holding the recommended topic (or the selected one, or a filtered unit) opens itself.
  const isOpen = (u: string) => toggled[u] ?? (u === recUnit || u === node?.unit || u === unit);
  const unitName = (u: string) => UNITS.find((x) => x.id === u)?.name ?? '';

  const rows = useMemo(() => {
    const list = GRAPH.nodes.filter((n) => !unit || n.unit === unit);
    if (!started) return list;
    return [...list].sort((a, c) => RANK[deriveState(bOf(a.id))] - RANK[deriveState(bOf(c.id))] || unlocks(GRAPH, c.id).length - unlocks(GRAPH, a.id).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beliefs, unit, started]);

  const check = (id: string) => {
    setCheckOnly(id);
    go('diagnostic');
  };
  const deeper = async (id: string) => {
    if (await startDeepDive(id)) go('deepdive');
  };
  const act = (id: string, action: 'check' | 'deeper') => (action === 'check' ? check(id) : deeper(id));

  const Chips = ({ title, ids }: { title: string; ids: string[] }) =>
    ids.length ? (
      <div className="mt-4">
        <div className="label mb-2">{title}</div>
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <button key={id} className="chip !py-1 !text-sm hover:bg-accent-soft" onClick={() => setSel(id)}>
              <StateIcon state={stateOf(id)} size={13} /> {GRAPH.nodes.find((n) => n.id === id)?.label}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  const weakPrereqs = near ? near.prereqs.filter((p) => ['weak', 'shaky'].includes(stateOf(p.id))) : [];

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <PageHeader
        title={GRAPH.title}
        sub={diagnosticDone ? 'Your map. Pick a topic to see why it is rated the way it is.' : `Quick check · 2 questions per topic · about 10 minutes`}
        right={
          diagnosticDone ? (
            <button className="btn btn-primary" onClick={() => go('report')}>See what to work on</button>
          ) : (
            <div className="flex gap-2">
              {started && <button className="btn" onClick={() => go('report')}>See results so far</button>}
              <button className="btn btn-primary" onClick={() => { setCheckOnly(null); go('diagnostic'); }}>{started ? 'Continue quick check' : 'Start quick check'}</button>
            </div>
          )
        }
      />

      <StoreNotice />
      {!diagnosticDone && !started && (
        <Alert variant="info" dismissKey="intro" className="mb-4">
          Every topic starts grey. Take the quick check ({total * 2} questions) and the map colours in as you answer.
        </Alert>
      )}
      {deep && deep.idx < deep.queue.length && (
        <Alert variant="info" title={<>Deep-dive in progress on {GRAPH.nodes.find((n) => n.id === deep.nodeId)?.label}</>} className="mb-4">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>Question {deep.idx + 1} of {deep.queue.length}. Your answers so far are saved.</span>
            <span className="flex gap-2">
              <button className="btn" onClick={endDeepDive}>Discard</button>
              <button className="btn btn-primary" onClick={() => go('deepdive')}>Resume</button>
            </span>
          </span>
        </Alert>
      )}

      {/* Progress summary */}
      <section className="card mb-3 flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3" aria-label="Progress">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-baseline justify-between text-base">
            <span><b>{checked}</b> of {total} topics checked</span>
            {!started && <span className="text-sm text-muted">nothing rated yet</span>}
          </div>
          <div className="mt-2">
            <ProgressBar value={checked} max={total} label="Topics checked" />
          </div>
        </div>
        {started && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-base">
            {strong > 0 && <span className="inline-flex items-center gap-2"><StateIcon state="solid" size={16} /><b>{strong}</b> strong</span>}
            {weak > 0 && <span className="inline-flex items-center gap-2"><StateIcon state="weak" size={16} /><b>{weak}</b> need work</span>}
            {shaky > 0 && <span className="inline-flex items-center gap-2"><StateIcon state="shaky" size={16} /><b>{shaky}</b> developing</span>}
          </div>
        )}
      </section>

      {/* View and filters */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" label="View" value={view} onChange={setView} options={[{ id: 'map', label: 'Map' }, { id: 'list', label: 'List' }]} />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by unit">
          {[{ id: null as string | null, name: 'All units' }, ...UNITS.map((u) => ({ id: u.id as string | null, name: `${u.id} · ${u.name}` }))].map((u) => (
            <button
              key={u.id ?? 'all'}
              aria-pressed={unit === u.id}
              onClick={() => setUnit(u.id)}
              className="choice rounded-full px-3 py-1.5 text-sm"
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
        <section className="card flex h-[max(520px,calc(100vh_-_322px))] flex-col p-3">
          {view === 'map' ? (
            <>
              <div className="min-h-0 flex-1">
                <ScoreGraph graph={GRAPH} beliefs={beliefs} selectedId={sel} focusIds={visibleIds} summary={checked === total} onSelect={setSel} recommendedId={rec?.nodeId ?? null} recommendedText={rec ? (rec.headline === 'Start here' ? 'Start here' : rec.action === 'check' ? 'Check next' : 'Work on this') : undefined} />
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-auto" aria-label="Topics by unit">
              {UNITS.filter((u) => rows.some((n) => n.unit === u.id)).map((u) => {
                const inUnit = rows.filter((n) => n.unit === u.id);
                const open = isOpen(u.id);
                const done = inUnit.filter((n) => bOf(n.id).answers >= 2).length;
                const needWork = inUnit.filter((n) => stateOf(n.id) === 'weak').length;
                const worst = inUnit.reduce<BeliefState>((w, n) => (RANK[stateOf(n.id)] < RANK[w] ? stateOf(n.id) : w), 'verified');
                return (
                  <section key={u.id} className="rounded-[var(--radius-sm)] border border-border">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setToggled((t) => ({ ...t, [u.id]: !open }))}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-alt"
                    >
                      <span aria-hidden className={`inline-block text-muted transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold">Unit {u.id} · {u.name}</span>
                        <span className="block text-xs text-muted">
                          {plural(inUnit.length, 'topic')} · {done} checked{needWork ? ` · ${needWork} need work` : ''}
                        </span>
                      </span>
                      {done > 0 && <StateIcon state={worst} size={16} />}
                    </button>
                    {open && (
                      <ul className="divide-y divide-border border-t border-border" aria-label={`${u.name} topics`}>
                        {inUnit.map((n) => {
                          const bb = bOf(n.id);
                          const st = deriveState(bb);
                          return (
                            <li key={n.id}>
                              <button onClick={() => setSel(n.id)} aria-current={sel === n.id} className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-alt ${sel === n.id ? 'bg-accent-soft' : ''}`}>
                                <StateIcon state={st} size={18} danger={isDanger(bb)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-base font-medium">
                                    {n.label}
                                    {rec?.nodeId === n.id && <span className="chip ml-2 !py-0 align-middle !text-accent">{rec.action === 'check' ? 'Check next' : 'Work on this'}</span>}
                                  </span>
                                  <span className="block text-xs text-muted">{STATE_META[st].label}</span>
                                  {n.description && <span className="mt-0.5 block truncate text-xs text-muted">{n.description}</span>}
                                </span>
                                <span className="text-sm text-muted">{bb.answers > 0 ? `${Math.round(mastery(bb) * 100)}% · ${bb.correct}/${bb.answers}` : '–'}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <aside className="card h-[max(520px,calc(100vh_-_322px))] overflow-auto p-5" aria-live="polite">
          {!node ? (
            <div>
              {rec ? (
                <div className="rounded-[var(--radius)] border border-accent bg-accent-soft p-4">
                  <div className="label !text-accent">{rec.headline}</div>
                  <div className="mt-1 font-display text-xl font-bold">{GRAPH.nodes.find((n) => n.id === rec.nodeId)?.label}</div>
                  <p className="mt-1 text-sm text-ink">{rec.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn" disabled={!!busy} onClick={() => act(rec.nodeId, rec.action)}>
                      {busy ?? (rec.action === 'check' ? 'Check this topic · 2 questions' : 'Go deeper · about 8 questions')}
                    </button>
                    <button className="btn" onClick={() => setSel(rec.nodeId)}>View topic</button>
                  </div>
                  {busy && <AgentStatus className="mt-2" />}
                </div>
              ) : (
                <div className="rounded-[var(--radius)] border border-border bg-surface-alt p-4">
                  <div className="font-display text-xl font-bold">Nothing urgent</div>
                  <p className="mt-1 text-sm text-muted">Every checked topic looks strong. Pick any topic and go deeper to test it on fresh questions.</p>
                </div>
              )}
              <p className="mt-5 text-sm text-muted">Select a topic on the {view === 'map' ? 'map' : 'list'} to see its state, what it builds on and what it unlocks.</p>
              <details className="mt-5 text-xs text-muted">
                <summary className="cursor-pointer">Demo notes</summary>
                <p className="mt-2">{TRIGGER_HINT}</p>
              </details>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-bold">{node.label}</h2>
                  <p className="text-sm text-muted">Unit {node.unit} · {unitName(node.unit)}</p>
                </div>
                <StateChip state={deriveState(b)} />
              </div>
              {node.description && (
                <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-alt p-3">
                  <div className="label">About this topic</div>
                  <p className="mt-1 text-sm">{node.description}</p>
                </div>
              )}

              {b.answers === 0 ? (
                <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-4 text-sm">
                  <div className="font-semibold">Not checked yet</div>
                  <p className="mt-1 text-muted">Answer 2 questions to see your evidence and score for this topic here.</p>
                </div>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{Math.round(mastery(b) * 100)}%</div><div className="text-xs text-muted">mastery</div></div>
                    <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{b.answers}</div><div className="text-xs text-muted">answered</div></div>
                    <div className="rounded-[var(--radius-sm)] bg-surface-alt p-2"><div className="text-xl font-semibold">{b.correct}</div><div className="text-xs text-muted">right</div></div>
                  </div>
                  {isDanger(b) && <p className="mt-3 rounded-[var(--radius-sm)] border border-danger p-2 text-sm text-danger">Confident mistake: you were sure and wrong here, so this is a topic you may believe you know.</p>}
                  <p className="mt-3 text-sm text-muted">{summarizeEvidence(log, node.id)}</p>
                  {['weak', 'shaky'].includes(deriveState(b)) && (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-surface-alt p-3 text-sm">
                      {weakPrereqs.length
                        ? <><b>Likely cause:</b> {weakPrereqs.map((p) => p.label).join(' and ')} {weakPrereqs.length === 1 ? 'also needs' : 'also need'} work. Fix {weakPrereqs.length === 1 ? 'it' : 'them'} first.</>
                        : near && near.prereqs.length ? <><b>Likely cause:</b> its prerequisites look fine, so the gap is in this topic itself.</> : <><b>This is a foundation topic</b>, so it is worth fixing first.</>}
                    </p>
                  )}
                </>
              )}

              <button className="btn mt-4 w-full" disabled={!!busy} onClick={() => act(node.id, b.answers === 0 ? 'check' : 'deeper')}>
                {busy ?? (b.answers === 0 ? 'Check this topic · 2 questions' : 'Go deeper · about 8 questions')}
              </button>
              {busy && <AgentStatus className="mt-2" />}

              <Chips title="Prerequisites" ids={near?.prereqs.map((n) => n.id) ?? []} />
              <Chips title="Unlocks" ids={near?.dependents.map((n) => n.id) ?? []} />
              {near && !near.prereqs.length && <p className="mt-4 text-sm text-muted">Nothing comes before this topic: it is where the course starts.</p>}
              {near && !near.dependents.length && <p className="mt-2 text-sm text-muted">No other topic builds on this one.</p>}

              {b.answers > 0 && (
                <>
                  <div className="label mb-2 mt-5">Evidence trail</div>
                  <EvidenceList log={log} nodeId={node.id} />
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
