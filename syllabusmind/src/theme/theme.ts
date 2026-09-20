/**
 * Single source of truth for the look of the app. Every value becomes a CSS custom property on
 * :root (see applyTheme). Components only ever read var(--token), so re-tinting means editing here.
 */
export const theme = {
  // surfaces + text
  bg: '#f7f6f2',
  surface: '#ffffff',
  surfaceAlt: '#f0eee8',
  border: '#e2dfd6',
  text: '#23221f',
  textMuted: '#6b685f',
  accent: '#3b5bdb',
  accentSoft: '#e7ecff',
  accentText: '#ffffff',
  accentStrong: '#2f4bc4', // primary hover
  disabled: '#c9c6bd', // disabled primary: grey, so an enabled one never reads as disabled
  track: '#e3e0d6', // empty part of every progress bar
  // alerts: one language, four variants (info uses accentSoft)
  warnBg: '#fff5e0',
  warnBorder: '#efc36b',
  warnText: '#7a4a00',
  okBg: '#e8f6ee',
  okBorder: '#8fd0a8',
  okText: '#1d6b3f',
  badBg: '#fdeeee',
  badBorder: '#eba1a1',
  badText: '#a12626',
  // belief states (colour + a shape is always shown with it)
  stateUnknown: '#9a9a94',
  stateUnknownFill: '#e6e4dd', // a flat pale grey: unchecked topics recede so assessed ones stand forward
  stateUnknownMark: '#a7a498',
  stateTentative: '#8fa8c8',
  stateWeak: '#d64545',
  stateShaky: '#e0a020',
  stateSolid: '#2f9e5b',
  stateVerified: '#c99a06',
  danger: '#e03131',
  brand: '#a78bfa', // the purple in the SkillMind wordmark, used nowhere else
  // graph
  edge: '#b9b5a8',
  edgePulse: '#3b5bdb',
  // shape
  radius: '12px',
  radiusSm: '8px',
  space: '16px',
  shadow: '0 1px 2px rgba(35,34,31,.06), 0 4px 16px rgba(35,34,31,.06)',
  // type
  fontDisplay: "'Fraunces', Georgia, serif",
  fontBody: "'Inter', system-ui, sans-serif",
} as const;

export type ThemeToken = keyof typeof theme;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function applyTheme(overrides: Partial<Record<ThemeToken, string>> = {}) {
  const root = document.documentElement;
  Object.entries({ ...theme, ...overrides }).forEach(([k, v]) => root.style.setProperty(`--${kebab(k)}`, v));
}

/** Read a resolved token (used by the canvas graph renderer). */
export const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || '#000';
