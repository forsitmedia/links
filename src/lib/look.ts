import type { Look } from './types';

export const FONTS: Record<Look['font'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", system-ui, sans-serif',
  serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  display: 'Impact, "Arial Narrow", "Franklin Gothic Medium", sans-serif',
};

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Black or white, whichever reads better on the given color. */
export function onColor(hex: string): string {
  if (!isHex(hex)) return '#000';
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000' : '#fff';
}

/** Turns the few appearance choices into CSS variables for the page. */
export function lookVars(look: Look): string {
  const dark = look.mode === 'dark';
  const bg = look.background === 'color' && isHex(look.color) ? look.color : dark ? '#111113' : '#f2f2f7';
  const accent = isHex(look.accent) ? look.accent : dark ? '#ffffff' : '#111111';
  const vars: Record<string, string> = {
    '--page-gap': `${typeof look.spacing === 'number' ? Math.max(8, Math.min(36, look.spacing)) : ['studio', 'bold'].includes(look.template) ? 20 : look.template === 'gallery' ? 14 : 18}px`,
    '--font': FONTS[look.font] ?? FONTS.system,
    '--bg': bg,
    '--text': dark ? '#ffffff' : '#111111',
    '--muted': dark ? 'rgba(255,255,255,.62)' : 'rgba(0,0,0,.5)',
    '--glass': dark ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.55)',
    '--glass-hover': dark ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.75)',
    '--glass-border': dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.06)',
    '--overlay': dark ? 'rgba(0,0,0,.42)' : 'rgba(255,255,255,.5)',
    '--accent': accent,
    '--on-accent': onColor(accent),
  };
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
}
