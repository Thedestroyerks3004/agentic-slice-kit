import type { ConceptGraph, ConceptNode } from './types';

/** Prerequisite depth: 0 = root. Longest path from a root; cycle-safe. */
export function depths(g: ConceptGraph): Record<string, number> {
  const d: Record<string, number> = {};
  const parents = (id: string) => g.edges.filter((e) => e.to === id).map((e) => e.from);
  const visit = (id: string, stack: Set<string>): number => {
    if (id in d) return d[id];
    if (stack.has(id)) return 0;
    stack.add(id);
    const ps = parents(id);
    d[id] = ps.length ? 1 + Math.max(...ps.map((p) => visit(p, stack))) : 0;
    stack.delete(id);
    return d[id];
  };
  g.nodes.forEach((n) => visit(n.id, new Set()));
  return d;
}

export const childrenOf = (g: ConceptGraph, id: string) => g.edges.filter((e) => e.from === id).map((e) => e.to);
export const parentsOf = (g: ConceptGraph, id: string) => g.edges.filter((e) => e.to === id).map((e) => e.from);
export const dependentCount = (g: ConceptGraph, id: string) => childrenOf(g, id).length;

/** One hop each way: the context handed to the question generator, never the whole graph. */
export function neighborhood(g: ConceptGraph, id: string): { prereqs: ConceptNode[]; dependents: ConceptNode[] } {
  const by = (ids: string[]) => ids.map((i) => g.nodes.find((n) => n.id === i)).filter((n): n is ConceptNode => !!n);
  return { prereqs: by(parentsOf(g, id)), dependents: by(childrenOf(g, id)) };
}

/** Root first, then outward by prerequisite depth (ties keep the graph's own order). */
export function diagnosticOrder(g: ConceptGraph): string[] {
  const d = depths(g);
  return g.nodes
    .map((n, i) => ({ id: n.id, i }))
    .sort((a, b) => d[a.id] - d[b.id] || a.i - b.i)
    .map((x) => x.id);
}

/**
 * Radial tree layout. The root sits at the centre and each prerequisite depth is a ring. A node hangs off
 * its first-listed parent and gets an angular wedge proportional to the leaves beneath it, so a hub with
 * many children visibly fans out instead of collapsing into a line. Extra parents only add edges.
 */
export function layoutRadial(g: ConceptGraph, ring = 150): Record<string, { x: number; y: number }> {
  const d = depths(g);
  const primary: Record<string, string> = {};
  for (const e of g.edges) if (!(e.to in primary)) primary[e.to] = e.from;
  const kids = (id: string) => g.nodes.filter((n) => primary[n.id] === id).map((n) => n.id);
  const leaves = (id: string): number => {
    const k = kids(id);
    return k.length ? k.reduce((s, c) => s + leaves(c), 0) : 1;
  };
  const pos: Record<string, { x: number; y: number }> = {};
  const place = (id: string, a0: number, a1: number) => {
    const mid = (a0 + a1) / 2;
    const r = d[id] * ring;
    pos[id] = { x: Math.cos(mid) * r, y: Math.sin(mid) * r };
    const k = kids(id);
    const total = k.reduce((s, c) => s + leaves(c), 0) || 1;
    let a = a0;
    for (const c of k) {
      const span = ((a1 - a0) * leaves(c)) / total;
      place(c, a, a + span);
      a += span;
    }
  };
  const roots = g.nodes.filter((n) => !(n.id in primary)).map((n) => n.id);
  // Start the sweep so a lone child of the root lands at the top of the ring.
  roots.forEach((r) => place(r, -1.5 * Math.PI, 0.5 * Math.PI));
  return pos;
}
