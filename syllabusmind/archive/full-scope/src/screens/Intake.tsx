import { useState } from 'react';
import { useApp } from '../store/useApp';
import { DEMO_TEXT } from '../lib/demoData';
import { pdfToText } from '../lib/pdf';
import { hasModel } from '../lib/llm';
import { BUNDLES, topicCount } from '../lib/bundles';
import { PageHeader, type Route } from '../components/ui';

type Pick = { kind: 'bundle'; id: string } | { kind: 'demo' } | { kind: 'upload' } | null;

export default function Intake({ go }: { go: (r: Route) => void }) {
  const { intake, resumeLast, busy, notice } = useApp();
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [text, setText] = useState('');
  const [fileMsg, setFileMsg] = useState('');
  const [pick, setPick] = useState<Pick>(BUNDLES.length ? { kind: 'bundle', id: BUNDLES[0].id } : null);

  const onFile = async (f?: File) => {
    if (!f) return;
    setFileMsg('Reading file…');
    try {
      const t = f.type === 'application/pdf' || f.name.endsWith('.pdf') ? await pdfToText(f) : await f.text();
      setText(t);
      setPick({ kind: 'upload' });
      setFileMsg(`Loaded ${f.name} (${t.length.toLocaleString()} characters)`);
    } catch {
      setFileMsg('Could not read that file. Paste the syllabus text instead.');
    }
  };

  const submit = async () => {
    const r =
      pick?.kind === 'bundle' ? await intake({ name: name || roll, roll, text: '', bundleId: pick.id })
      : pick?.kind === 'demo' ? await intake({ name: name || roll, roll, text: DEMO_TEXT })
      : await intake({ name: name || roll, roll, text });
    if (r === 'loaded') go('graph');
    if (r === 'review') go('review');
  };

  const card = (active: boolean) =>
    `card text-left p-4 transition ${active ? '!border-accent ring-2 ring-accent/30' : 'hover:bg-surface-alt'}`;
  const hasText = pick?.kind === 'upload' && text.trim().length > 0;
  const ready = !!roll.trim() && (pick?.kind === 'bundle' || pick?.kind === 'demo' || hasText || pick === null);

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <PageHeader
        title="Find out what you actually don't know"
        sub="Pick a syllabus. We map its concepts, quiz you adaptively across them, and show which topics are weak, which are solid, and why."
      />
      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="mb-3 text-lg font-semibold">1. Who is this for</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Arjun" />
            </div>
            <div>
              <label className="label" htmlFor="roll">Roll number</label>
              <input id="roll" className="input mt-1" value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="21IT042" />
              <p className="mt-1 text-xs text-muted">Your saved progress is looked up by this.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">2. Choose a syllabus</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {BUNDLES.map((b) => {
              const active = pick?.kind === 'bundle' && pick.id === b.id;
              return (
                <button key={b.id} className={card(active)} onClick={() => setPick({ kind: 'bundle', id: b.id })} aria-pressed={active}>
                  <div className="font-display text-lg font-bold">{b.title}</div>
                  <div className="mt-1 text-sm text-muted">
                    {topicCount(b)} topics · {b.questions.length} questions ready · from {b.file}
                  </div>
                </button>
              );
            })}
            <button className={card(pick?.kind === 'demo')} onClick={() => setPick({ kind: 'demo' })} aria-pressed={pick?.kind === 'demo'}>
              <div className="font-display text-lg font-bold">Quick demo: Database Systems</div>
              <div className="mt-1 text-sm text-muted">8 topics with hand-written questions. Needs no key.</div>
            </button>
            <button className={card(pick?.kind === 'upload')} onClick={() => setPick({ kind: 'upload' })} aria-pressed={pick?.kind === 'upload'}>
              <div className="font-display text-lg font-bold">Upload a new syllabus</div>
              <div className="mt-1 text-sm text-muted">Paste text or upload a PDF. Topics and questions are generated for you.</div>
            </button>
          </div>
          {!BUNDLES.length && (
            <p className="mt-3 text-sm text-muted">No bundled syllabi yet. Put files in <code>data/</code> and run <code>npm run build:syllabi</code>.</p>
          )}
        </section>

        {pick?.kind === 'upload' && (
          <section className="card p-6">
            <label className="label" htmlFor="syl">Syllabus text</label>
            <textarea id="syl" className="input mt-1 h-44 font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste syllabus text, e.g.\nUNIT I  BASICS\nTopic A – Topic B – Topic C'} />
            <div className="mt-2 flex items-center gap-3 text-sm">
              <label className="btn cursor-pointer">
                Upload PDF or text
                <input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <span className="text-muted">{fileMsg}</span>
            </div>
            {!hasModel() && (
              <p className="mt-3 rounded-[var(--radius-sm)] bg-surface-alt p-3 text-sm text-muted">
                No API key found, so topics would be read from your headings and questions would be self-checks. Put a key in .env.local for a real graph and questions.
              </p>
            )}
          </section>
        )}

        {notice && <p className="text-sm text-accent">{notice}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="btn" onClick={() => resumeLast() && go('graph')}>Resume last session</button>
          <button className="btn btn-primary" disabled={!ready || !!busy} onClick={submit}>
            {busy ?? (pick === null ? 'Load saved graph' : 'Continue to graph review')}
          </button>
        </div>
      </div>
    </div>
  );
}
