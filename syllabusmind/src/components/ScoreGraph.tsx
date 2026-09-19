import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ConceptGraph, NodeBelief } from '../engine/types';
import { deriveState, isDanger, newBelief } from '../engine/mastery';
import { dependentCount, depths, layoutRadial } from '../engine/graph';
import { drawSymbol, STATE_META } from '../lib/states';
import { cssVar } from '../theme/theme';

interface Props {
  graph: ConceptGraph;
  beliefs: Record<string, NodeBelief>;
  selectedId?: string | null;
  focusIds?: string[]; // nodes to keep bright; the rest dim
  onSelect?: (id: string) => void;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Split a label onto at most two lines near its middle. */
function wrap(label: string): string[] {
  if (label.length <= 16) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [label] : [label.slice(0, best), label.slice(best + 1)];
}

export default function ScoreGraph({ graph, beliefs, selectedId, focusIds, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const hover = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const live = useRef({ beliefs, selectedId, focusIds });
  live.current = { beliefs, selectedId, focusIds };

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
      bg: cssVar('surface'), text: cssVar('text'), edge: cssVar('edge'), border: cssVar('border'), accent: cssVar('accent'), danger: cssVar('danger'),
      ...Object.fromEntries(Object.entries(STATE_META).map(([k, v]) => [k, cssVar(v.token)])),
    }) as Record<string, string>,
    [],
  );

  // Fixed radial layout: the root at the centre, one ring per prerequisite depth. Positions are pinned so
  // the map never rearranges itself when a node changes colour.
  const data = useMemo(() => {
    const pos = layoutRadial(graph, 125);
    const d = depths(graph);
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id, label: n.label, root: d[n.id] === 0,
        r: d[n.id] === 0 ? 27 : Math.min(25, 14 + dependentCount(graph, n.id) * 3.4),
        x: pos[n.id].x, y: pos[n.id].y, fx: pos[n.id].x, fy: pos[n.id].y,
      })),
      links: graph.edges.map((e) => ({ source: e.from, target: e.to, weight: e.weight })),
    };
  }, [graph]);

  useEffect(() => {
    const t = setTimeout(() => fg.current?.zoomToFit(250, 70), 250);
    return () => clearTimeout(t);
  }, [graph, size.w, size.h]);

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
        onNodeClick={(n: any) => onSelect?.(n.id)}
        onNodeHover={(n: any) => {
          hover.current = n ? n.id : null;
          if (wrapRef.current) wrapRef.current.style.cursor = n && onSelect ? 'pointer' : 'default';
        }}
        nodeLabel={(n: any) => {
          const b = live.current.beliefs[n.id] ?? newBelief();
          const st = STATE_META[deriveState(b)].label;
          const score = b.answers ? `${b.correct} of ${b.answers} correct` : 'not answered yet';
          return `<div style="padding:6px 10px;font:500 12px Inter,sans-serif;background:#23221f;color:#fff;border-radius:8px"><b>${n.label}</b><br/>${st} — ${score}</div>`;
        }}
        linkColor={() => colors.edge}
        linkWidth={(l: any) => 0.8 + l.weight * 2.8}
        linkCurvature={0.25}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={0.9}
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
          // soft glow on hover
          if (hover.current === node.id) {
            ctx.shadowColor = colors[state];
            ctx.shadowBlur = 22;
          }
          drawSymbol(ctx, state, node.x, node.y, r, colors[state], colors.bg);
          ctx.shadowBlur = 0;
          // label pill under the node
          const fs = 11.5 / scale;
          const lines = wrap(node.label);
          ctx.font = `${node.root ? 600 : 500} ${fs}px Inter, sans-serif`;
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
