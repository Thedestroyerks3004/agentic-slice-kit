import type { BeliefState } from '../engine/types';

export const STATE_META: Record<BeliefState, { label: string; token: string; desc: string }> = {
  unknown: { label: 'Unknown', token: 'state-unknown', desc: 'No answers yet' },
  tentative: { label: 'Tentative', token: 'state-tentative', desc: 'Not enough evidence yet' },
  weak: { label: 'Weak', token: 'state-weak', desc: 'Mastery under 40% after 2+ answers' },
  shaky: { label: 'Shaky', token: 'state-shaky', desc: 'Mastery 40-70%' },
  solid: { label: 'Solid', token: 'state-solid', desc: 'Mastery over 70% after 2+ answers' },
  verified: { label: 'Verified', token: 'state-verified', desc: 'Passed the contrast check' },
};
export const STATE_ORDER: BeliefState[] = ['unknown', 'tentative', 'weak', 'shaky', 'solid', 'verified'];

/** Canvas symbol: colour AND shape together, so state never depends on colour alone. */
export function drawSymbol(ctx: CanvasRenderingContext2D, state: BeliefState, x: number, y: number, r: number, color: string, bg: string) {
  ctx.save();
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (state) {
    case 'unknown':
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.stroke();
      break;
    case 'tentative':
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.setLineDash([r * 0.5, r * 0.4]);
      ctx.stroke();
      break;
    case 'weak':
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.1, y + r * 0.85);
      ctx.lineTo(x - r * 1.1, y + r * 0.85);
      ctx.closePath();
      ctx.fill();
      break;
    case 'shaky':
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.2, y);
      ctx.lineTo(x, y + r * 1.2);
      ctx.lineTo(x - r * 1.2, y);
      ctx.closePath();
      ctx.fill();
      break;
    case 'solid':
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      break;
    case 'verified': {
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r * 1.35 : r * 0.6;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** SVG twin of the canvas symbols for legends, panels and lists. */
export function StateIcon({ state, size = 16, danger = false }: { state: BeliefState; size?: number; danger?: boolean }) {
  const c = `var(--${STATE_META[state].token})`;
  const common = { fill: c, stroke: c, strokeWidth: 1.5 };
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={danger ? { filter: 'drop-shadow(0 0 3px var(--danger))' } : undefined}>
      {state === 'unknown' && <circle cx="10" cy="10" r="6.5" fill="none" stroke={c} strokeWidth="2" />}
      {state === 'tentative' && <circle cx="10" cy="10" r="6.5" fill="none" stroke={c} strokeWidth="2" strokeDasharray="3 2.5" />}
      {state === 'weak' && <polygon points="10,2.5 18,17 2,17" {...common} />}
      {state === 'shaky' && <polygon points="10,1.5 18.5,10 10,18.5 1.5,10" {...common} />}
      {state === 'solid' && <circle cx="10" cy="10" r="7" {...common} />}
      {state === 'verified' && <polygon points="10,1 12.6,7.2 19,7.7 14.1,11.9 15.7,18.3 10,14.8 4.3,18.3 5.9,11.9 1,7.7 7.4,7.2" {...common} />}
    </svg>
  );
}
