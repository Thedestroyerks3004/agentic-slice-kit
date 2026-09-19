import type { ConceptEdge, ConceptGraph, NodeBelief } from './types';
import { newBelief } from './mastery';

/** Prerequisite depth: 0 = foundational. Cycle-safe (back edges are ignored). */
export function depths(g: ConceptGraph): Record<string, number> {
  const d: Record<string, number> = {};
  const incoming = (id: string) => g.edges.filter((e) => e.to === id).map((e) => e.from);
  const visit = (id: string, stack: Set<string>): number => {
    if (id in d) return d[id];
    if (stack.has(id)) return 0;
    stack.add(id);
    const ps = incoming(id);
    d[id] = ps.length ? 1 + Math.max(...ps.map((p) => visit(p, stack))) : 0;
    stack.delete(id);
    return d[id];
  };
  g.nodes.forEach((n) => visit(n.id, new Set()));
  return d;
}

export const dependentCount = (g: ConceptGraph, id: string) =>
  g.edges.filter((e) => e.from === id).length;

/** Nodes ordered foundational-first, siblings grouped by unit. */
export function diagnosticOrder(full: ConceptGraph): string[] {
  const g = topGraph(full);
  const d = depths(g);
  const unitIdx = new Map<string, number>();
  g.nodes.forEach((n) => unitIdx.has(n.unit) || unitIdx.set(n.unit, unitIdx.size));
  return [...g.nodes]
    .sort((a, b) => d[a.id] - d[b.id] || unitIdx.get(a.unit)! - unitIdx.get(b.unit)!)
    .map((n) => n.id);
}

export function sanitizeEdges(g: ConceptGraph): ConceptEdge[] {
  const ids = new Set(g.nodes.map((n) => n.id));
  const seen = new Set<string>();
  const ok = g.edges.filter((e) => {
    const k = `${e.from}>${e.to}`;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return breakCycles(ok);
}

/** Stable, non-crypto content hash used to key saved sessions. */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Drop edges that would close a cycle (keeps the first-seen direction) so DAG layout is safe. */
export function breakCycles(edges: ConceptEdge[]): ConceptEdge[] {
  const kept: ConceptEdge[] = [];
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === to) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      kept.forEach((e) => e.from === cur && stack.push(e.to));
    }
    return false;
  };
  for (const e of edges) if (!reaches(e.to, e.from)) kept.push(e);
  return kept;
}

/**
 * Deterministic left-to-right tree layout: x by prerequisite depth, y ordered within each layer by
 * unit grouping then by the average position of parents (a few sweeps reduce edge crossings).
 */
export function layoutTree(g: ConceptGraph, dx = 210, dy = 90): Record<string, { x: number; y: number }> {
  const d = depths(g);
  const unitIdx = new Map<string, number>();
  g.nodes.forEach((n) => unitIdx.has(n.unit) || unitIdx.set(n.unit, unitIdx.size));
  const layers: string[][] = [];
  g.nodes.forEach((n) => (layers[d[n.id]] ??= []).push(n.id));
  const unitOf = (id: string) => unitIdx.get(g.nodes.find((n) => n.id === id)!.unit)!;
  const pos: Record<string, number> = {};
  layers.forEach((l) => {
    l.sort((a, b) => unitOf(a) - unitOf(b));
    l.forEach((id, i) => (pos[id] = i));
  });
  for (let sweep = 0; sweep < 4; sweep++) {
    layers.forEach((l, li) => {
      if (li === 0) return;
      const score = (id: string) => {
        const ps = g.edges.filter((e) => e.to === id && d[e.from] < li).map((e) => pos[e.from]);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : pos[id];
      };
      l.sort((a, b) => score(a) - score(b) || unitOf(a) - unitOf(b));
      l.forEach((id, i) => (pos[id] = i));
    });
  }
  const out: Record<string, { x: number; y: number }> = {};
  layers.forEach((l, li) =>
    l.forEach((id, i) => {
      out[id] = { x: li * dx, y: (i - (l.length - 1) / 2) * dy };
    }),
  );
  return out;
}

/* ---- drill-down hierarchy: sub-topics hang off a parent via parentId, never via prerequisite edges ---- */

export const childrenOf = (g: ConceptGraph, id: string) => g.nodes.filter((n) => n.parentId === id);

export function subtreeIds(g: ConceptGraph, id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) childrenOf(g, out[i]).forEach((c) => out.push(c.id));
  return out;
}

/** Ancestors from the top-level topic down to the direct parent (excludes the node itself). */
export function ancestorsOf(g: ConceptGraph, id: string): string[] {
  const out: string[] = [];
  let cur = g.nodes.find((n) => n.id === id);
  while (cur?.parentId) {
    out.unshift(cur.parentId);
    cur = g.nodes.find((n) => n.id === cur!.parentId);
  }
  return out;
}

export const rootOf = (g: ConceptGraph, id: string) => ancestorsOf(g, id)[0] ?? id;

/** The syllabus-level map: top-level topics and their prerequisite edges only. */
export const topGraph = (g: ConceptGraph): ConceptGraph => ({ ...g, nodes: g.nodes.filter((n) => !n.parentId) });

/** A topic and everything beneath it, drawn as a branching tree (parent to child). */
export function subgraphFor(g: ConceptGraph, id: string): ConceptGraph {
  const ids = new Set(subtreeIds(g, id));
  const nodes = g.nodes.filter((n) => ids.has(n.id));
  return {
    ...g,
    nodes,
    edges: nodes.filter((n) => n.parentId && ids.has(n.parentId)).map((n) => ({ from: n.parentId!, to: n.id, weight: 0.8 })),
  };
}

/** A parent's displayed belief pools its own evidence with that of everything beneath it. */
export function rollup(g: ConceptGraph, beliefs: Record<string, NodeBelief>): Record<string, NodeBelief> {
  const out: Record<string, NodeBelief> = {};
  for (const n of g.nodes) {
    const own = beliefs[n.id] ?? newBelief();
    const acc = { ...own };
    for (const id of subtreeIds(g, n.id).slice(1)) {
      const b = beliefs[id] ?? newBelief();
      acc.alpha += b.alpha - 1;
      acc.beta += b.beta - 1;
      acc.answers += b.answers;
      acc.confidentWrong += b.confidentWrong;
    }
    out[n.id] = acc;
  }
  return out;
}

/**
 * Swimlane layout for a whole syllabus: one horizontal lane per unit, x by prerequisite depth, nodes of
 * the same unit and depth stacked inside their lane. Reads like a roadmap and keeps units together.
 */
export interface LaneLayout {
  pos: Record<string, { x: number; y: number }>;
  lanes: { unit: string; x0: number; x1: number; y0: number; y1: number }[];
}
export function layoutLanes(g: ConceptGraph, dx = 190, rowH = 78, lanePad = 34): LaneLayout {
  const d = depths(g);
  const units: string[] = [];
  g.nodes.forEach((n) => units.includes(n.unit) || units.push(n.unit));
  const pos: LaneLayout['pos'] = {};
  const lanes: LaneLayout['lanes'] = [];
  let y = 0;
  const maxDepth = Math.max(0, ...Object.values(d));
  for (const unit of units) {
    const members = g.nodes.filter((n) => n.unit === unit).sort((a, b) => d[a.id] - d[b.id]);
    const rowsAt: Record<number, number> = {};
    let maxRows = 1;
    for (const n of members) {
      const col = d[n.id];
      const row = (rowsAt[col] = (rowsAt[col] ?? -1) + 1);
      maxRows = Math.max(maxRows, row + 1);
      pos[n.id] = { x: col * dx, y: y + lanePad + row * rowH };
    }
    const h = lanePad * 2 + (maxRows - 1) * rowH;
    lanes.push({ unit, x0: -dx * 0.55, x1: maxDepth * dx + dx * 0.55, y0: y - 6, y1: y + h + 6 });
    y += h + 26;
  }
  return { pos, lanes };
}
