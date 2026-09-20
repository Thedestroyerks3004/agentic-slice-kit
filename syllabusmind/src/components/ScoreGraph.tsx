import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ConceptGraph, NodeBelief } from '../engine/types';
import { certainty, deriveState, evidenceLevel, isDanger, mastery, newBelief } from '../engine/mastery';
import { importance, isCheckpoint, isHardEdge, layoutRadial, neighborhood } from '../engine/graph';
import { edgeTone, type EdgeTone } from '../engine/edgeTone';
import { drawNodeBody, STATE_META, STATE_ORDER, StateIcon, type NodeShape } from '../lib/states';
import { UNITS } from '../lib/dbmsGraph';
import { cssVar } from '../theme/theme';

interface Props {
  graph: ConceptGraph;
  beliefs: Record<string, NodeBelief>;
  selectedId?: string | null;
  focusIds?: string[]; // topics to keep at full strength; the rest fade
  recommendedId?: string | null; // marked on the map itself, so the suggestion is not only in a side panel
  recommendedText?: string;
  /** 'mini' is the slim quiz sidebar: no legend, donut or zoom, and only the tested topic is named. */
  variant?: 'full' | 'mini';
  testingId?: string | null; // the topic being asked about right now
  onSelect?: (id: string) => void;
}

const RING = 150; // distance between levels
const NAME_PX = 12.5; // label text in screen pixels, so it never drops below 12px
const BADGE_PX = 12;
const WASH = 210; // reach of the temperature tint behind each assessed topic
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Thin: little evidence. Thick: a lot, and consistent. Independent of the fill colour. */
const ringWidth = (b: NodeBelief) => 2 + 7 * certainty(b);

function rgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function shade(hex: string, f: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

/** Split a name onto at most two lines near its middle. */
function wrap(label: string): string[] {
  if (label.length <= 17) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [label] : [label.slice(0, best), label.slice(best + 1)];
}

interface GNode { id: string; label: string; unit: string; root: boolean; shape: NodeShape; r: number; x: number; y: number }
interface Placed { dx: number; dy: number; w: number; h: number } // screen px; the label's top-left relative to the node centre
type Rect = { x: number; y: number; w: number; h: number };

const DIRS: [number, number][] = [[0, 1], [1, 0], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Collision-avoiding label placement, in screen pixels at the current zoom. Each label takes the spot (below,
 * beside, above, diagonal) that overlaps the fewest nodes and already-placed labels, preferring the side that
 * points away from the centre. Score badges and the recommendation tag are obstacles too.
 */
function placeLabels(nodes: GNode[], scale: number, size: (n: GNode) => { w: number; h: number }, hasBadge: (n: GNode) => boolean, tagId: string | null): Record<string, Placed> {
  const S = nodes.map((n) => ({ n, x: n.x * scale, y: n.y * scale, R: (n.r + 17) * scale }));
  const gap = 4;
  const placed: Rect[] = S.filter((s) => hasBadge(s.n)).map((s) => ({ x: s.x + s.n.r * 0.72 * scale, y: s.y + s.n.r * 0.82 * scale, w: 38, h: 17 }));
  const out: Record<string, Placed> = {};
  // The recommendation tag picks its own clear spot first (above, either side, or below), then labels avoid it.
  const tagged = S.find((s) => s.n.id === tagId);
  if (tagged) {
    const tw = 96;
    const th = 24;
    const g = (tagged.n.r + 22) * scale;
    const cands = [
      { x: tagged.x - tw / 2, y: tagged.y - g - th },
      { x: tagged.x + g, y: tagged.y - th / 2 },
      { x: tagged.x - g - tw, y: tagged.y - th / 2 },
      { x: tagged.x - tw / 2, y: tagged.y + g },
    ];
    let bestTag = { cost: Infinity, x: 0, y: 0 };
    cands.forEach((c, i) => {
      const rect = { x: c.x, y: c.y, w: tw, h: th };
      let cost = i * 2;
      for (const o of S) if (o.n.id !== tagged.n.id) cost += overlap(rect, { x: o.x - o.R, y: o.y - o.R, w: o.R * 2, h: o.R * 2 }) * 0.8;
      for (const p of placed) cost += overlap(rect, p);
      if (cost < bestTag.cost) bestTag = { cost, x: c.x, y: c.y };
    });
    placed.push({ x: bestTag.x, y: bestTag.y, w: tw, h: th });
    out.__tag = { dx: bestTag.x - tagged.x, dy: bestTag.y - tagged.y, w: tw, h: th };
  }
  for (const s of [...S].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))) {
    const { w, h } = size(s.n);
    const len = Math.hypot(s.x, s.y) || 1;
    const outward: [number, number] = s.n.root ? [0, 1] : [s.x / len, s.y / len];
    let best = { cost: Infinity, x: 0, y: 0 };
    DIRS.forEach(([dx, dy], i) => {
      const diag = Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5 && Math.abs(dx) < 0.99;
      const x = diag ? (dx > 0 ? s.x + s.R * 0.72 + gap : s.x - s.R * 0.72 - gap - w) : Math.abs(dx) > 0.5 ? (dx > 0 ? s.x + s.R + gap : s.x - s.R - gap - w) : s.x - w / 2;
      const y = diag ? (dy > 0 ? s.y + s.R * 0.72 + gap : s.y - s.R * 0.72 - gap - h) : Math.abs(dy) > 0.5 ? (dy > 0 ? s.y + s.R + gap : s.y - s.R - gap - h) : s.y - h / 2;
      const rect = { x, y, w, h };
      let cost = i * 1.5 + (1 - (dx * outward[0] + dy * outward[1])) * 26;
      for (const o of S) cost += overlap(rect, { x: o.x - o.R, y: o.y - o.R, w: o.R * 2, h: o.R * 2 }) * 0.6;
      for (const p of placed) cost += overlap(rect, p) * 0.9;
      if (cost < best.cost) best = { cost, x, y };
    });
    placed.push({ x: best.x, y: best.y, w, h });
    out[s.n.id] = { dx: best.x - s.x, dy: best.y - s.y, w, h };
  }
  return out;
}

export default function ScoreGraph({ graph, beliefs, selectedId, focusIds, recommendedId, recommendedText, variant = 'full', testingId, onSelect }: Props) {
  const mini = variant === 'mini';
  const wrapRef = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const hover = useRef<string | null>(null);
  const measurer = useRef<CanvasRenderingContext2D | null>(null);
  const cache = useRef<{ key: string; map: Record<string, Placed> } | null>(null);
  const hops = useRef<{ from: string | null; map: Record<string, number> }>({ from: null, map: {} });
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [legendOpen, setLegendOpen] = useState<boolean | null>(null);
  const [howTo, setHowTo] = useState(false);
  const live = useRef({ beliefs, selectedId, focusIds, recommendedId, recommendedText, testingId });
  live.current = { beliefs, selectedId, focusIds, recommendedId, recommendedText, testingId };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Two roles only: neutral for structure, the red / amber / green scale for how the student is doing.
  const colors = useMemo(
    () => ({
      bg: cssVar('surface'), text: cssVar('text'), muted: cssVar('text-muted'), border: cssVar('border'), accent: cssVar('accent'), danger: cssVar('danger'), edge: cssVar('edge'),
      unkFill: cssVar('state-unknown-fill'), unkMark: cssVar('state-unknown-mark'),
      ...Object.fromEntries(Object.entries(STATE_META).map(([k, v]) => [k, cssVar(v.token)])),
    }) as Record<string, string>,
    [],
  );

  // On a wide canvas the rings become ellipses, so the map uses the width instead of leaving it empty.
  const stretch = Math.round(Math.min(1.5, Math.max(1, size.w / size.h / 1.25)) * 10) / 10;
  const data = useMemo(() => {
    const pos = layoutRadial(graph, RING);
    const imp = Object.fromEntries(graph.nodes.map((n) => [n.id, importance(graph, n.id)]));
    const lo = Math.min(...Object.values(imp));
    const hi = Math.max(...Object.values(imp));
    const roots = new Set(graph.nodes.filter((n) => !graph.edges.some((e) => e.to === n.id)).map((n) => n.id));
    const nodes: GNode[] = graph.nodes.map((n) => ({
      id: n.id, label: n.label, unit: n.unit, root: roots.has(n.id),
      shape: isCheckpoint(graph, n.id) ? 'hex' : 'circle',
      r: (14 + 32 * Math.sqrt((imp[n.id] - lo) / (hi - lo || 1))) * (mini ? 1.5 : 1), // size = how much of the course builds on it, so hubs look like hubs
      x: pos[n.id].x * stretch, y: pos[n.id].y,
    }));
    cache.current = null;
    return {
      nodes: nodes.map((n) => ({ ...n, fx: n.x, fy: n.y })),
      links: graph.edges.map((e) => ({ source: e.from, target: e.to, weight: e.weight, hard: isHardEdge(e) })),
      plain: nodes,
    };
  }, [graph, stretch, mini]);

  /** Fit the whole map, labels included, into the container, with more room below where labels hang. */
  const fit = useCallback(
    (ms = 300) => {
      const g = fg.current;
      if (!g || size.w < 50 || size.h < 50) return;
      const xs = data.plain.map((n) => n.x);
      const ys = data.plain.map((n) => n.y);
      const rr = 50;
      const minX = Math.min(...xs) - rr, maxX = Math.max(...xs) + rr, minY = Math.min(...ys) - rr, maxY = Math.max(...ys) + rr;
      const padX = mini ? 34 : 120, padTop = mini ? 58 : 84, padBottom = mini ? 34 : 76;
      const k = Math.min(2, Math.max(0.15, Math.min((size.w - padX * 2) / (maxX - minX), (size.h - padTop - padBottom) / (maxY - minY))));
      g.zoom(k, ms);
      g.centerAt((minX + maxX) / 2, (minY + maxY) / 2 + (padBottom - padTop) / (2 * k), ms);
    },
    [data, size.w, size.h, mini],
  );
  useEffect(() => {
    const t = setTimeout(() => fit(0), 60);
    const t2 = setTimeout(() => fit(200), 350);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [fit]);
  const zoomBy = (f: number) => fg.current?.zoom(Math.min(4, Math.max(0.15, fg.current.zoom() * f)), 200);

  const active = () => hover.current ?? live.current.selectedId ?? live.current.testingId ?? null;
  const endId = (x: any) => (typeof x === 'object' ? x.id : x);
  const stateOfId = (id: string) => deriveState(live.current.beliefs[id] ?? newBelief());
  /** Steps from the active topic along any link, so anything two or more hops away can be dimmed. */
  const hopsFrom = (id: string | null) => {
    if (!id) return {} as Record<string, number>;
    if (hops.current.from === id) return hops.current.map;
    const map: Record<string, number> = { [id]: 0 };
    const q = [id];
    while (q.length) {
      const cur = q.shift()!;
      for (const e of graph.edges) {
        const nx = e.from === cur ? e.to : e.to === cur ? e.from : null;
        if (nx && !(nx in map)) {
          map[nx] = map[cur] + 1;
          q.push(nx);
        }
      }
    }
    hops.current = { from: id, map };
    return map;
  };

  const sizeOf = (n: GNode) => {
    const ctx = (measurer.current ??= document.createElement('canvas').getContext('2d')!);
    const lines = wrap(n.label);
    ctx.font = `600 ${NAME_PX}px Inter, sans-serif`;
    return { w: Math.max(...lines.map((s) => ctx.measureText(s).width)) + 14, h: lines.length * 15 + 9 };
  };
  const placement = (scale: number) => {
    const has = (n: GNode) => (live.current.beliefs[n.id]?.answers ?? 0) > 0;
    const tag = live.current.testingId ?? live.current.recommendedId ?? null;
    const key = `${Math.round(scale * 40)}|${data.plain.map((n) => (has(n) ? 1 : 0)).join('')}|${tag}`;
    if (cache.current?.key !== key) cache.current = { key, map: placeLabels(data.plain, scale, sizeOf, has, tag) };
    return cache.current.map;
  };

  const toneColor = (t: EdgeTone) => (t === 'risk' ? rgba(colors.weak, 0.95) : t === 'concern' ? rgba(colors.weak, 0.55) : t === 'good' ? rgba(colors.solid, 0.7) : t === 'watch' ? rgba(colors.shaky, 0.7) : rgba(colors.edge, 0.55));
  const linkTone = (l: any) => edgeTone(stateOfId(endId(l.source)), stateOfId(endId(l.target)));

  const checked = graph.nodes.filter((n) => (beliefs[n.id]?.answers ?? 0) >= 2).length;
  const total = graph.nodes.length;
  const circ = 2 * Math.PI * 14;
  const showLegend = legendOpen ?? size.w >= 760;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-[var(--radius)] bg-surface">
      <ForceGraph2D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        cooldownTicks={0}
        autoPauseRedraw={false}
        enableNodeDrag={false}
        minZoom={0.15}
        maxZoom={4}
        backgroundColor={colors.bg}
        onRenderFramePre={(ctx: CanvasRenderingContext2D) => {
          // Map temperature: a soft red wash where topics need work, green where they are strong, amber between,
          // so the trouble is visible from a distance. Weighted by how sure the evidence is; unchecked topics add none.
          for (const n of data.plain) {
            const b = live.current.beliefs[n.id];
            if (!b || b.answers === 0) continue;
            const st = deriveState(b);
            const tint = st === 'weak' ? [colors.weak, 0.3] : st === 'solid' || st === 'verified' ? [colors.solid, 0.22] : st === 'shaky' ? [colors.shaky, 0.15] : null;
            if (!tint) continue;
            const k = 0.55 + 0.45 * certainty(b);
            const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, WASH);
            g.addColorStop(0, rgba(tint[0] as string, (tint[1] as number) * k));
            g.addColorStop(1, rgba(tint[0] as string, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(n.x, n.y, WASH, 0, 2 * Math.PI);
            ctx.fill();
          }
        }}
        onNodeClick={(n: any) => onSelect?.(n.id)}
        onNodeHover={(n: any) => {
          hover.current = n ? n.id : null;
          if (wrapRef.current) wrapRef.current.style.cursor = n && onSelect ? 'pointer' : 'grab';
        }}
        nodeLabel={(n: any) => {
          const b = live.current.beliefs[n.id] ?? newBelief();
          const near = neighborhood(graph, n.id);
          const unit = UNITS.find((u) => u.id === n.unit);
          const st = STATE_META[deriveState(b)].label;
          const ev = evidenceLevel(b);
          const score = b.answers ? `${b.correct} of ${b.answers} right · ${Math.round(mastery(b) * 100)}%` : 'not checked yet';
          const list = (l: { label: string }[]) => l.map((x) => esc(x.label)).join(', ');
          return `<div style="max-width:270px;padding:9px 12px;font:500 13px/1.45 Inter,sans-serif;background:#23221f;color:#fff;border-radius:10px">
            <div style="font-size:14px;font-weight:600">${esc(n.label)}${n.shape === 'hex' ? ' <span style="opacity:.7;font-weight:500">· brings topics together</span>' : ''}</div>
            <div style="opacity:.75">Unit ${n.unit}${unit ? ` · ${esc(unit.name)}` : ''}</div>
            <div style="margin-top:4px"><b>${st}</b> · ${score}</div>
            ${b.answers ? `<div style="opacity:.85">Evidence: ${b.answers} ${b.answers === 1 ? 'answer' : 'answers'} · ${ev} confidence in this score</div>` : ''}
            ${isDanger(b) ? '<div style="color:#ffb3b3">Confident mistake: sure, but wrong</div>' : ''}
            ${near.prereqs.length ? `<div style="opacity:.8;margin-top:4px">Prerequisites: ${list(near.prereqs)}</div>` : ''}
            ${near.dependents.length ? `<div style="opacity:.8">Unlocks: ${list(near.dependents)}</div>` : ''}
          </div>`;
        }}
        // A link takes on what it joins: a red chain where both ends need work, green where both are strong.
        linkColor={(l: any) => {
          const a = active();
          const tone = linkTone(l);
          if (!a) return toneColor(tone);
          if (endId(l.source) !== a && endId(l.target) !== a) return rgba(colors.edge, 0.14);
          return tone === 'idle' ? rgba(colors.accent, 0.9) : toneColor(tone);
        }}
        // Solid = a hard prerequisite (learn it first). Dashed = helpful background.
        linkLineDash={(l: any) => (l.hard ? null : [7, 6])}
        linkWidth={(l: any) => {
          const a = active();
          const hot = !!a && (endId(l.source) === a || endId(l.target) === a);
          const tone = linkTone(l);
          const boost = tone === 'risk' ? 1.9 : tone === 'concern' ? 1.3 : 1;
          return (l.hard ? 1.6 + l.weight * 2.6 : 1.1 + l.weight * 1.4) * boost * (hot ? 1.4 : 1);
        }}
        linkCurvature={0.2}
        linkDirectionalArrowLength={(l: any) => (l.hard ? 7 : 0)}
        linkDirectionalArrowRelPos={0.9}
        linkDirectionalArrowColor={(l: any) => toneColor(linkTone(l))}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
          const b = live.current.beliefs[node.id] ?? newBelief();
          const state = deriveState(b);
          const r = node.r;
          const a = active();
          const h = hopsFrom(a)[node.id] ?? 9;
          const focusFade = !!live.current.focusIds && !live.current.focusIds.includes(node.id) ? 0.5 : 1;
          // the active topic and what it connects to stay strong; everything two hops away fades
          const alpha = Math.min(focusFade, !a || h <= 1 ? 1 : mini ? 0.62 : 0.4);
          ctx.globalAlpha = alpha;
          const col = colors[state];
          const t = performance.now();

          // ring: a solid band whose thickness is how much evidence backs the score
          let outer = r;
          if (b.answers > 0) {
            const w = ringWidth(b);
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 3.5 + w / 2, 0, 2 * Math.PI);
            ctx.strokeStyle = shade(col, -0.3);
            ctx.stroke();
            outer = r + 3.5 + w;
          }

          // a confident mistake demands attention: a pulsing red outline and an expanding halo
          if (isDanger(b)) {
            ctx.save();
            if (reduced()) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, outer + 7, 0, 2 * Math.PI);
              ctx.strokeStyle = colors.danger;
              ctx.lineWidth = 3;
              ctx.stroke();
            } else {
              const ph = (t % 1500) / 1500;
              ctx.beginPath();
              ctx.arc(node.x, node.y, outer + 6 + ph * 22, 0, 2 * Math.PI);
              ctx.strokeStyle = rgba(colors.danger, 0.65 * (1 - ph));
              ctx.lineWidth = 3;
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(node.x, node.y, outer + 6 + Math.sin(t / 260) * 1.6, 0, 2 * Math.PI);
              ctx.strokeStyle = colors.danger;
              ctx.lineWidth = 2.5;
              ctx.stroke();
            }
            ctx.restore();
          }

          // "testing now": two rings that expand outward, a steady ring, and a tag
          const testing = live.current.testingId === node.id;
          if (testing) {
            ctx.save();
            ctx.lineWidth = 3;
            if (reduced()) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, outer + 10, 0, 2 * Math.PI);
              ctx.strokeStyle = colors.accent;
              ctx.stroke();
            } else {
              for (const off of [0, 0.5]) {
                const ph = ((t / 1600 + off) % 1);
                ctx.beginPath();
                ctx.arc(node.x, node.y, outer + 8 + ph * 34, 0, 2 * Math.PI);
                ctx.strokeStyle = rgba(colors.accent, 0.8 * (1 - ph));
                ctx.stroke();
              }
              ctx.beginPath();
              ctx.arc(node.x, node.y, outer + 8, 0, 2 * Math.PI);
              ctx.strokeStyle = colors.accent;
              ctx.lineWidth = 3.5;
              ctx.stroke();
            }
            ctx.restore();
          }

          // the recommended topic is marked on the map itself
          const recommended = !testing && live.current.recommendedId === node.id;
          if (recommended) {
            ctx.save();
            ctx.setLineDash([9, 7]);
            ctx.lineDashOffset = reduced() ? 0 : -t / 60;
            ctx.beginPath();
            ctx.arc(node.x, node.y, outer + 10, 0, 2 * Math.PI);
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
          }

          // focus: a glow and an outline on the selected topic
          if (live.current.selectedId === node.id) {
            ctx.save();
            ctx.shadowColor = colors.accent;
            ctx.shadowBlur = 26;
            ctx.beginPath();
            ctx.arc(node.x, node.y, outer + (recommended ? 16 : 7), 0, 2 * Math.PI);
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
          } else if (hover.current === node.id) {
            ctx.save();
            ctx.shadowColor = col;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(node.x, node.y, outer + 5, 0, 2 * Math.PI);
            ctx.strokeStyle = rgba(colors.accent, 0.55);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }

          drawNodeBody(ctx, node.shape, state, node.x, node.y, r, col, { fill: colors.unkFill, mark: colors.unkMark });

          // "!" flag: a confident mistake (sure, and wrong)
          if (isDanger(b)) {
            const bx = node.x + r * 0.8;
            const by = node.y - r * 0.8;
            const br = 8 / scale;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, 2 * Math.PI);
            ctx.fillStyle = colors.danger;
            ctx.fill();
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `700 ${11 / scale}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', bx, by + 0.5 / scale);
          }

          // score badge: right / answered
          if (b.answers > 0) {
            const txt = `${b.correct}/${b.answers}`;
            ctx.font = `700 ${BADGE_PX / scale}px Inter, sans-serif`;
            const tw = ctx.measureText(txt).width;
            const bw = tw + 9 / scale;
            const bh = 16 / scale;
            const bx = node.x + r * 0.72 + bw / 2;
            const by = node.y + r * 0.82 + bh / 2;
            ctx.beginPath();
            (ctx as any).roundRect(bx - bw / 2, by - bh / 2, bw, bh, 8 / scale);
            ctx.fillStyle = '#2b2a27';
            ctx.fill();
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(txt, bx, by + 0.5 / scale);
          }

          // name, outside the node where the placement solver put it. Unchecked topics get a quieter label.
          const pl = placement(scale)[node.id];
          if (pl && !mini) {
            const quiet = b.answers === 0;
            const x0 = node.x + pl.dx / scale;
            const y0 = node.y + pl.dy / scale;
            ctx.beginPath();
            (ctx as any).roundRect(x0, y0, pl.w / scale, pl.h / scale, 6 / scale);
            ctx.fillStyle = colors.bg;
            ctx.globalAlpha = alpha * 0.96;
            ctx.fill();
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1 / scale;
            ctx.strokeStyle = quiet ? rgba(colors.border, 0.6) : colors.border;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = quiet ? colors.muted : colors.text;
            ctx.font = `600 ${NAME_PX / scale}px Inter, sans-serif`;
            wrap(node.label).forEach((s, i) => ctx.fillText(s, x0 + pl.w / scale / 2, y0 + 4.5 / scale + (i * 15) / scale));
          }

          // a tag on the tested or recommended topic
          if (testing || recommended) {
            const text = testing ? 'Testing now' : live.current.recommendedText ?? 'Start here';
            const tp = placement(scale).__tag;
            ctx.font = `700 ${12 / scale}px Inter, sans-serif`;
            const tw = ctx.measureText(text).width + 18 / scale;
            const th = 22 / scale;
            const cx = node.x + (tp ? tp.dx + tp.w / 2 : 0) / scale;
            const cy = node.y + (tp ? tp.dy + tp.h / 2 : -outer * 1.5) / scale;
            ctx.beginPath();
            (ctx as any).roundRect(cx - tw / 2, cy - th / 2, tw, th, 11 / scale);
            ctx.fillStyle = colors.accent;
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, cx, cy + 0.5 / scale);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 14, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />

      {!mini && (
        <>
      {/* Overall completeness, top left */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface/95 px-3 py-2 shadow-sm">
        <svg width="38" height="38" viewBox="0 0 36 36" role="img" aria-label={`${checked} of ${total} topics checked`}>
          <circle cx="18" cy="18" r="14" fill="none" stroke="var(--surface-alt)" strokeWidth="5" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="var(--accent)" strokeWidth="5" strokeDasharray={`${(checked / total) * circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 18 18)" />
        </svg>
        <div className="leading-tight">
          <div className="text-base font-semibold">{checked}/{total}</div>
          <div className="text-xs text-muted">topics checked</div>
        </div>
      </div>

      {/* Compact legend, pinned top right */}
      <div className="absolute right-3 top-3 z-10 w-[196px] rounded-[var(--radius-sm)] border border-border bg-surface/95 px-3 py-2 text-xs shadow-sm">
        <div className="flex items-center justify-between">
          <button className="label flex items-center gap-1" aria-expanded={showLegend} onClick={() => setLegendOpen(!showLegend)}>
            Legend <span aria-hidden>{showLegend ? '▾' : '▸'}</span>
          </button>
          {showLegend && (
            <button className="grid h-5 w-5 place-items-center rounded-full border border-border text-xs font-semibold text-muted hover:text-ink" aria-label="How to read the map" aria-pressed={howTo} onClick={() => setHowTo(!howTo)}>?</button>
          )}
        </div>
        {showLegend && (
          <>
            <ul className="mt-2 space-y-1.5 text-ink">
              {STATE_ORDER.map((s) => (
                <li key={s} className="flex items-center gap-2" title={STATE_META[s].desc}><StateIcon state={s} size={16} />{STATE_META[s].label}</li>
              ))}
              <li className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-danger text-xs font-bold leading-none text-white">!</span>Confident mistake</li>
            </ul>
            {howTo && (
              <ul className="mt-2 space-y-1.5 border-t border-border pt-2 text-muted">
                <li><b className="text-ink">Fill</b>: how you are doing. Flat grey is not checked yet.</li>
                <li><b className="text-ink">Ring</b>: thicker means more evidence behind the score.</li>
                <li><b className="text-ink">Size</b>: how much builds on it.</li>
                <li><b className="text-ink">Badge</b>: right / answered.</li>
                <li className="flex items-center gap-2"><StateIcon state="unknown" size={15} shape="hex" />brings topics together</li>
                <li><b className="text-ink">Tint</b>: red where trouble clusters, green where you are strong.</li>
                <li><b className="text-ink">Links</b>: red when both ends need work, green when both are strong.</li>
                <li className="flex items-center gap-2"><svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke="var(--edge)" strokeWidth="2.5" /></svg>learn first</li>
                <li className="flex items-center gap-2"><svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke="var(--edge)" strokeWidth="2" strokeDasharray="5 4" /></svg>helpful background</li>
              </ul>
            )}
          </>
        )}
      </div>

      {/* Zoom and fit */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface shadow-sm" role="group" aria-label="Map zoom">
        <button className="grid h-9 w-9 place-items-center text-xl font-semibold hover:bg-surface-alt" onClick={() => zoomBy(1.35)} aria-label="Zoom in" title="Zoom in">+</button>
        <button className="grid h-9 w-9 place-items-center border-t border-border text-xl font-semibold hover:bg-surface-alt" onClick={() => zoomBy(1 / 1.35)} aria-label="Zoom out" title="Zoom out">−</button>
        <button className="grid h-9 w-9 place-items-center border-t border-border text-xs font-semibold hover:bg-surface-alt" onClick={() => fit(250)} aria-label="Fit map to screen" title="Fit map to screen">Fit</button>
      </div>
        </>
      )}
    </div>
  );
}
