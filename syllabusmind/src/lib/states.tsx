import type { BeliefState } from '../engine/types';

export const STATE_META: Record<BeliefState, { label: string; token: string; desc: string }> = {
  unknown: { label: 'Not checked', token: 'state-unknown', desc: 'Not answered yet' },
  tentative: { label: 'Partly checked', token: 'state-tentative', desc: 'Only one answer so far' },
  weak: { label: 'Needs work', token: 'state-weak', desc: 'Mostly wrong so far' },
  shaky: { label: 'Developing', token: 'state-shaky', desc: 'Some right, some wrong' },
  solid: { label: 'Strong', token: 'state-solid', desc: 'Mostly right' },
  verified: { label: 'Verified', token: 'state-verified', desc: 'Passed a fresh check' },
};
/** The five states shown in legends. "Partly checked" is transient and shares the grey of "Not checked". */
export const STATE_ORDER: BeliefState[] = ['unknown', 'weak', 'shaky', 'solid', 'verified'];

/**
 * Shape means what kind of topic it is (circle: a topic; hexagon: several lines of learning meet here).
 * State is colour plus a glyph inside, so it never depends on colour alone.
 */
export type NodeShape = 'circle' | 'hex';

function bodyPath(ctx: CanvasRenderingContext2D, shape: NodeShape, x: number, y: number, r: number) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    return;
  }
  const R = r * 1.12;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](x + Math.cos(a) * R, y + Math.sin(a) * R);
  }
  ctx.closePath();
}

function glyph(ctx: CanvasRenderingContext2D, state: BeliefState, x: number, y: number, r: number) {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(1.6, r * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const k = r * 0.36;
  ctx.beginPath();
  if (state === 'weak') {
    ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
    ctx.stroke();
  } else if (state === 'shaky') {
    ctx.moveTo(x - k, y); ctx.lineTo(x + k, y);
    ctx.stroke();
  } else if (state === 'solid') {
    ctx.moveTo(x - k * 1.05, y + k * 0.05); ctx.lineTo(x - k * 0.25, y + k * 0.8); ctx.lineTo(x + k * 1.1, y - k * 0.75);
    ctx.stroke();
  } else if (state === 'verified') {
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? k * 1.5 : k * 0.65;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Draw a topic node: body by type, flat fill by state, glyph inside. Unchecked topics are a pale grey with no outline. */
export function drawNodeBody(
  ctx: CanvasRenderingContext2D, shape: NodeShape, state: BeliefState, x: number, y: number, r: number, color: string,
  unchecked: { fill: string; mark: string },
) {
  ctx.save();
  bodyPath(ctx, shape, x, y, r);
  if (state === 'unknown') {
    ctx.fillStyle = unchecked.fill;
    ctx.fill();
    ctx.fillStyle = unchecked.mark;
    ctx.font = `700 ${r * 0.95}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + r * 0.05);
  } else {
    ctx.fillStyle = color;
    ctx.fill();
    if (state === 'tentative') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.16, 0, 2 * Math.PI);
      ctx.fill();
    } else glyph(ctx, state, x, y, r);
  }
  ctx.restore();
}

/** SVG twin of the canvas node, for legends, panels and lists. */
export function StateIcon({ state, size = 16, shape = 'circle' }: { state: BeliefState; size?: number; shape?: NodeShape; danger?: boolean }) {
  const c = `var(--${STATE_META[state].token})`;
  const fill = state === 'unknown' ? 'var(--state-unknown-fill)' : c;
  const body =
    shape === 'circle' ? <circle cx="10" cy="10" r="8.6" fill={fill} /> : <polygon points="10,1 18.4,5.5 18.4,14.5 10,19 1.6,14.5 1.6,5.5" fill={fill} />;
  const w = { stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
      {body}
      {state === 'unknown' && <text x="10" y="14.2" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--state-unknown-mark)" fontFamily="Inter, sans-serif">?</text>}
      {state === 'tentative' && <circle cx="10" cy="10" r="1.9" fill="#fff" />}
      {state === 'weak' && <path d="M6.6 6.6 L13.4 13.4 M13.4 6.6 L6.6 13.4" {...w} />}
      {state === 'shaky' && <path d="M6.2 10 H13.8" {...w} />}
      {state === 'solid' && <path d="M5.8 10.4 L8.7 13.2 L14.2 7" {...w} />}
      {state === 'verified' && <polygon points="10,4.6 11.7,8.3 15.6,8.7 12.7,11.3 13.5,15.2 10,13.2 6.5,15.2 7.3,11.3 4.4,8.7 8.3,8.3" fill="#fff" />}
    </svg>
  );
}
