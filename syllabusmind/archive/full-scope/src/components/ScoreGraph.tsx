import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ConceptGraph, NodeBelief } from '../engine/types';
import { deriveState, isDanger, newBelief } from '../engine/mastery';
import { breakCycles, dependentCount, layoutLanes, layoutTree, type LaneLayout } from '../engine/graph';
import { drawSymbol, STATE_META } from '../lib/states';
import { cssVar } from '../theme/theme';
import type { Pulse } from '../store/useApp';

interface Props {
  graph: ConceptGraph;
  beliefs?: Record<string, NodeBelief>;
  pulses?: Record<string, Pulse>;
  selectedId?: string | null;
  focusIds?: string[]; // nodes to keep bright; others dim
  onSelect?: (id: string) => void;
  fit?: boolean;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const HUES = [215, 150, 28, 285, 190, 340, 62, 100];

/** Split a label onto at most two lines near its middle. */
function wrap(label: string): string[] {
  if (label.length <= 17) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [label] : [label.slice(0, best), label.slice(best + 1)];
}

export default function ScoreGraph({ graph, beliefs = {}, pulses = {}, selectedId, focusIds, onSelect, fit = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const live = useRef({ beliefs, pulses, selectedId, focusIds });
  live.current = { beliefs, pulses, selectedId, focusIds };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const colors = useMemo(
    () => ({
      bg: cssVar('surface'), text: cssVar('text'), muted: cssVar('text-muted'), edge: cssVar('edge'), border: cssVar('border'),
      pulse: cssVar('edge-pulse'), accent: cssVar('accent'), danger: cssVar('danger'),
      ...Object.fromEntries(Object.entries(STATE_META).map(([k, v]) => [k, cssVar(v.token)])),
    }) as Record<string, string>,
    [],
  );

  const sig = graph.id + graph.nodes.map((n) => n.id).join(',') + graph.edges.map((e) => `${e.from}>${e.to}`).join(',');
  const { data, lanes } = useMemo(() => {
    const clean = { ...graph, edges: breakCycles(graph.edges) };
    // A whole syllabus (several units, no sub-topics) reads best as one lane per unit; a branch reads as a tree.
    const multiUnit = !graph.nodes.some((n) => n.parentId) && new Set(graph.nodes.map((n) => n.unit)).size >= 2;
    const layout: LaneLayout = multiUnit ? layoutLanes(clean) : { pos: layoutTree(clean, 240, 96), lanes: [] };
    return {
      lanes: layout.lanes,
      data: {
        nodes: graph.nodes.map((n) => ({
          id: n.id, label: n.label, unit: n.unit, r: Math.min(16, 10 + dependentCount(graph, n.id) * 1.6),
          x: layout.pos[n.id].x, y: layout.pos[n.id].y, fx: layout.pos[n.id].x, fy: layout.pos[n.id].y,
        })),
        links: clean.edges.map((e) => ({ source: e.from, target: e.to, weight: e.weight, key: `${e.from}>${e.to}` })),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    if (!fit) return;
    // Leave room for the lane bands and unit labels, which extend past the nodes.
    const t = setTimeout(() => fg.current?.zoomToFit(250, lanes.length ? 120 : 50), 250);
    return () => clearTimeout(t);
  }, [sig, size.w, size.h, fit, lanes.length]);

  const dim = (id: string) => !!live.current.focusIds && !live.current.focusIds.includes(id);

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
        backgroundColor={colors.bg}
        onRenderFramePre={(ctx: CanvasRenderingContext2D, scale: number) => {
          lanes.forEach((l, i) => {
            const h = HUES[i % HUES.length];
            ctx.beginPath();
            (ctx as any).roundRect(l.x0, l.y0, l.x1 - l.x0, l.y1 - l.y0, 14);
            ctx.fillStyle = `hsla(${h}, 70%, 55%, 0.07)`;
            ctx.fill();
            ctx.lineWidth = 1 / scale;
            ctx.strokeStyle = `hsla(${h}, 45%, 45%, 0.28)`;
            ctx.stroke();
            ctx.font = `600 ${11.5 / scale}px Inter, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = `hsla(${h}, 45%, 32%, 0.95)`;
            ctx.fillText(l.unit.toUpperCase(), l.x0 + 12 / scale, l.y0 + 8 / scale);
          });
        }}
        onNodeClick={(n: any) => onSelect?.(n.id)}
        linkColor={(l: any) => (live.current.pulses[l.key] ? colors.pulse : colors.edge)}
        linkWidth={(l: any) => (0.7 + l.weight * 2.6) * (live.current.pulses[l.key] ? 1.6 : 1)}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={0.9}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(l: any, ctx: CanvasRenderingContext2D) => {
          const p = live.current.pulses[l.key];
          if (!p || p.dur === 0 || reduced()) return;
          const t = Math.min(1, (performance.now() - p.start) / p.dur);
          const a = l.source.id === p.from ? l.source : l.target;
          const b = a === l.source ? l.target : l.source;
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4.5, 0, 2 * Math.PI);
          ctx.fillStyle = colors.pulse;
          ctx.fill();
        }}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
          const b = live.current.beliefs[node.id] ?? newBelief();
          const state = deriveState(b);
          const r = node.r;
          ctx.globalAlpha = dim(node.id) ? 0.35 : 1;
          if (isDanger(b)) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 5 + (reduced() ? 0 : Math.sin(performance.now() / 260) * 2), 0, 2 * Math.PI);
            ctx.strokeStyle = colors.danger;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          if (live.current.selectedId === node.id) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 9, 0, 2 * Math.PI);
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
          drawSymbol(ctx, state, node.x, node.y, r, colors[state], colors.bg);
          // label pill under the node
          const fs = 11.5 / scale;
          const lines = wrap(node.label);
          ctx.font = `500 ${fs}px Inter, sans-serif`;
          const wMax = Math.max(...lines.map((s) => ctx.measureText(s).width));
          const padX = 5 / scale;
          const padY = 3 / scale;
          const lh = fs * 1.2;
          const x0 = node.x - wMax / 2 - padX;
          const y0 = node.y + r + 5 / scale;
          ctx.beginPath();
          (ctx as any).roundRect(x0, y0, wMax + padX * 2, lh * lines.length + padY * 2, 5 / scale);
          ctx.fillStyle = colors.bg;
          ctx.globalAlpha *= 0.92;
          ctx.fill();
          ctx.globalAlpha = dim(node.id) ? 0.35 : 1;
          ctx.lineWidth = 1 / scale;
          ctx.strokeStyle = colors.border;
          ctx.stroke();
          ctx.fillStyle = colors.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          lines.forEach((s, i) => ctx.fillText(s, node.x, y0 + padY + i * lh));
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 10, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
