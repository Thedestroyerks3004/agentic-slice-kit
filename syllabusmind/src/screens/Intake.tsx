import { useState } from 'react';
import { GRAPH, useApp } from '../store/useApp';
import { PageHeader, type Route } from '../components/ui';

export default function Intake({ go }: { go: (r: Route) => void }) {
  const { start, student } = useApp();
  const [name, setName] = useState(student?.name ?? '');
  const [roll, setRoll] = useState(student?.roll ?? '');
  const units = [...new Set(GRAPH.nodes.map((n) => n.unit))];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        title="Find out where you are weak in DBMS"
        sub="A map of the course, a short diagnostic, and a plain answer to which topics need work and why."
      />
      <div className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Arjun" />
          </div>
          <div>
            <label className="label" htmlFor="roll">Roll number</label>
            <input id="roll" className="input mt-1" value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="21IT042" />
          </div>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-surface-alt p-4 text-sm">
          <div className="font-semibold">{GRAPH.title}</div>
          <p className="mt-1 text-muted">
            {GRAPH.nodes.length} topics across {units.length} units. You will answer two questions per topic, then pick any topic to go deeper. Every question is generated fresh, so a second pass gives you different ones.
          </p>
        </div>
        <div className="flex justify-end">
          <button className="btn btn-primary" disabled={!roll.trim()} onClick={() => { start(name, roll); go('graph'); }}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
