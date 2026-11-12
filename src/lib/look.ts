import type { Look } from './types';

export const FONTS: Record<Look['font'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", system-ui, sans-serif',
  serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  display: 'Impact, "Arial Narrow", "Franklin Gothic Medium", sans-serif',
};

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio, 1 to 21. */
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Black or white, whichever reads better on the given color. */
export function onColor(hex: string): string {
  if (!isHex(hex)) return '#000';
  return contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000' : '#fff';
}

/** The mode a background color reads best in: dark colors want white text. */
export const modeFor = (hex: string): 'dark' | 'light' => (isHex(hex) && onColor(hex) === '#fff' ? 'dark' : 'light');

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hex([h, s, l]: [number, number, number]): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [f(0), f(8), f(4)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** The same hue, made light or dark enough that `ok` holds. */
function shift(color: string, darker: boolean, from: number, maxSat: number, ok: (c: string) => boolean): string {
  const [h, s] = hsl(color);
  let out = color;
  for (let l = from; darker ? l >= 0 : l <= 1; l += darker ? -0.02 : 0.02) {
    out = hex([h, Math.min(s, maxSat), l]);
    if (ok(out)) break;
  }
  return out;
}

const TEXT = { dark: '#ffffff', light: '#111111' };

/** The background for a mode. A color that doesn't suit it becomes its light or dark version (same hue). */
export function backgroundFor(look: Look, dark: boolean): string {
  if (look.background !== 'color' || !isHex(look.color)) return dark ? '#111113' : '#f2f2f7';
  const text = dark ? TEXT.dark : TEXT.light;
  if (contrast(look.color, text) >= 4.5) return look.color;
  return shift(look.color, dark, dark ? 0.12 : 0.93, dark ? 0.6 : 0.55, (c) => contrast(c, text) >= 12);
}

/** Every color of the page in one mode, as CSS variables. */
function palette(look: Look, dark: boolean): Record<string, string> {
  const bg = backgroundFor(look, dark);
  // The accent fills buttons and, in some templates, colors big text: it must stand out from the background.
  let accent = isHex(look.accent) ? look.accent : dark ? '#ffffff' : '#111111';
  if (contrast(accent, bg) < 3) accent = shift(accent, !dark, dark ? 0.75 : 0.4, 0.85, (c) => contrast(c, bg) >= 6);
  return {
    'color-scheme': dark ? 'dark' : 'light',
    '--bg': bg,
    '--text': dark ? TEXT.dark : TEXT.light,
    '--muted': dark ? 'rgba(255,255,255,.66)' : 'rgba(0,0,0,.58)',
    '--glass': dark ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.55)',
    '--glass-hover': dark ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.75)',
    '--glass-border': dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.08)',
    '--overlay': dark ? 'rgba(0,0,0,.42)' : 'rgba(255,255,255,.5)',
    '--glyph': dark ? 'brightness(0) invert(1)' : 'none', // social logos are loaded black and turned white on dark pages
    '--accent': accent,
    '--on-accent': onColor(accent),
  };
}

const css = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');

/** The colors that don't depend on the mode, for the body's style attribute. */
export function lookVars(look: Look): string {
  return css({
    '--page-gap': `${typeof look.spacing === 'number' ? Math.max(8, Math.min(36, look.spacing)) : ['studio', 'bold'].includes(look.template) ? 20 : look.template === 'gallery' ? 14 : 18}px`,
    '--font': FONTS[look.font] ?? FONTS.system,
  });
}

/** The page colors as a style sheet. Automatic mode follows each visitor's phone setting. */
export function lookColors(look: Look): string {
  if (look.mode !== 'auto') return `body{${css(palette(look, look.mode === 'dark'))}}`;
  return `body{${css(palette(look, false))}}@media (prefers-color-scheme: dark){body{${css(palette(look, true))}}}`;
}

/** The browser bar color(s), matching the page background. */
export function themeColorMeta(look: Look): string {
  const tag = (dark: boolean, media = '') => `<meta name="theme-color" content="${backgroundFor(look, dark)}"${media}>`;
  return look.mode === 'auto' ? tag(false, ' media="(prefers-color-scheme: light)"') + tag(true, ' media="(prefers-color-scheme: dark)"') : tag(look.mode === 'dark');
}
