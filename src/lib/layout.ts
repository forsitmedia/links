import type { Config, PageBlock, Template, TemplateLayout } from './types';
import { usesButton } from './button-shape';
import type { ImageFrame } from './image-frame';
import type { ButtonShape, ButtonStyle } from './button-shape';
import { socialKey } from './social-order';

/** `start` (column 1–12) pins the item's left edge; without it, `align` places the item. */
export type BlockDesign = { span: number; align: 'auto' | 'left' | 'center' | 'right'; start?: number };
export const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;
export function normalizeBlockDesign(value: any): BlockDesign | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const span = Math.round(bounded(value.span, 2, 12) ?? 12);
  const start = bounded(value.start, 1, 13 - span);
  return { span, align: ['left', 'center', 'right'].includes(value.align) ? value.align : 'auto', ...(start ? { start: Math.round(start) } : {}) };
}
export function designStyle(value?: BlockDesign): string {
  const d = normalizeBlockDesign(value);
  if (!d) return '';
  const start = d.start ? d.start : d.align === 'left' ? 1 : d.align === 'center' ? Math.floor((12 - d.span) / 2) + 1 : d.align === 'right' ? 13 - d.span : null;
  return `grid-column:${start ? start + ' / ' : ''}span ${d.span}`;
}
/** Narrow items get a size tier so the page can scale their text down: 's' is about a third of the page, 'm' about half. */
export const sizeTier = (span: number) => span <= 5 ? 's' : span <= 8 ? 'm' : '';
export function moveBlock(cfg: Config, id: string, target: string, after = false): boolean {
  if (id === target) return false;
  const from = cfg.blocks.findIndex((b) => b.id === id);
  if (from < 0 || !cfg.blocks.some((b) => b.id === target)) return false;
  const [block] = cfg.blocks.splice(from, 1);
  const to = cfg.blocks.findIndex((b) => b.id === target) + (after ? 1 : 0);
  cfg.blocks.splice(to, 0, block);
  return from !== to;
}
/** Moves the name and username out of the profile into their own block (placed right below it), or back. */
export function separateName(cfg: Config, separate: boolean) {
  const at = cfg.blocks.findIndex((b) => b.type === 'name');
  if (separate && at < 0) cfg.blocks.splice(cfg.blocks.findIndex((b) => b.type === 'profile') + 1, 0, { id: 'name', type: 'name' });
  if (!separate && at >= 0) cfg.blocks.splice(at, 1);
}
export const hasSeparateName = (cfg: Config) => cfg.blocks.some((b) => b.type === 'name');
export type BlockRect = { id: string; left: number; top: number; width: number; height: number };
export function dropTarget(rects: BlockRect[], x: number, y: number, excluded: string, pageWidth: number) {
  const candidates = rects.filter((r) => r.id !== excluded);
  if (!candidates.length) return null;
  const distance = (r: BlockRect) => Math.hypot(Math.max(r.left - x, 0, x - r.left - r.width), Math.max(r.top - y, 0, y - r.top - r.height));
  const target = candidates.reduce((best, r) => distance(r) < distance(best) ? r : best);
  const inRow = y >= target.top && y <= target.top + target.height;
  const after = inRow && target.width < pageWidth * .7 ? x > target.left + target.width / 2 : y > target.top + target.height / 2;
  return { id: target.id, after };
}

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
type Framed = { source: string | null | undefined; frame?: ImageFrame };
type LayoutSnapshot = {
  blocks: { id: string; design?: BlockDesign; image: Framed; videoAspect?: PageBlock['videoAspect']; buttonShape?: ButtonShape; buttonStyle?: ButtonStyle; textScale?: number; offset?: number; inset?: number; pad?: number; lineHeight?: number; wordSpacing?: number; weight?: PageBlock['weight']; textColor?: string; height?: number; dx?: number; dy?: number; rotate?: number; float?: PageBlock['float'] }[];
  socialOrder: string[];
  profile: { photo: Framed; cover: Framed; photoSize?: number; coverHeight?: number };
  spacing?: number;
  margin?: number;
};
function blockImage(cfg: Config, b: PageBlock) {
  const item = b.type === 'link' ? cfg.links.find((l) => l.id === b.linkId) : b;
  return { item, source: item?.image || (b.type === 'youtube' ? b.url : null) };
}
function snapshot(cfg: Config): LayoutSnapshot {
  return clone({ blocks: cfg.blocks.map((b) => ({ id: b.id, design: b.design, videoAspect: b.videoAspect, textScale: b.textScale, offset: b.offset, inset: b.inset, pad: b.pad, lineHeight: b.lineHeight, wordSpacing: b.wordSpacing, weight: b.weight, textColor: b.textColor, height: b.height, dx: b.dx, dy: b.dy, rotate: b.rotate, float: b.float, buttonShape: b.type === 'link' ? cfg.links.find((l) => l.id === b.linkId)?.buttonShape : undefined, buttonStyle: b.type === 'link' ? cfg.links.find((l) => l.id === b.linkId)?.buttonStyle : undefined, image: { source: blockImage(cfg, b).source, frame: blockImage(cfg, b).item?.imageFrame } })),
    socialOrder: cfg.social.map(socialKey),
    profile: { photo: { source: cfg.profile.photo, frame: cfg.profile.photoFrame }, cover: { source: cfg.profile.cover, frame: cfg.profile.coverFrame }, photoSize: cfg.profile.photoSize, coverHeight: cfg.profile.coverHeight }, spacing: cfg.look.spacing, margin: cfg.look.margin });
}
function restore(cfg: Config, value: LayoutSnapshot) {
  const ids = new Map(cfg.blocks.map((b) => [b.id, b]));
  const restored: PageBlock[] = [];
  for (const item of value.blocks) {
    const b = ids.get(item.id);
    if (!b) continue;
    b.design = clone(item.design); b.textScale = item.textScale; b.offset = item.offset; b.inset = item.inset; b.pad = item.pad; b.lineHeight = item.lineHeight; b.wordSpacing = item.wordSpacing; b.weight = item.weight; b.textColor = item.textColor; b.height = item.height; b.dx = item.dx; b.dy = item.dy; b.rotate = item.rotate; b.float = clone(item.float);
    if (b.type === 'youtube') b.videoAspect = item.videoAspect;
    if (b.type === 'link') { const link = cfg.links.find((l) => l.id === b.linkId); if (link) { link.buttonShape = item.buttonShape; link.buttonStyle = item.buttonStyle; } }
    const image = blockImage(cfg, b);
    if (image.item && image.source === item.image.source) image.item.imageFrame = clone(item.image.frame);
    restored.push(b); ids.delete(b.id);
  }
  cfg.blocks = [...restored, ...ids.values()];
  const social = new Map(cfg.social.map((s, i) => [socialKey(s, i), s]));
  cfg.social = [...value.socialOrder.flatMap((id) => { const s = social.get(id); social.delete(id); return s ? [s] : []; }), ...social.values()];
  cfg.profile.photoSize = value.profile.photoSize;
  cfg.profile.coverHeight = value.profile.coverHeight;
  if (cfg.profile.photo === value.profile.photo.source) cfg.profile.photoFrame = clone(value.profile.photo.frame);
  if (cfg.profile.cover === value.profile.cover.source) cfg.profile.coverFrame = clone(value.profile.cover.frame);
  cfg.look.spacing = value.spacing;
  cfg.look.margin = value.margin;
}

/** Groups one canvas gesture so Escape can put the layout back as it was. Undo and redo cover every edit and live in the editor state. */
export class LayoutHistory {
  private before: LayoutSnapshot | null = null;
  constructor(private config: () => Config) {}
  begin() { if (!this.before) this.before = snapshot(this.config()); }
  end() { this.before = null; }
  cancel() { if (this.before) restore(this.config(), this.before); this.before = null; }
}

/** Shows a group's pieces as separate items (in the group's place), or puts them back together where the first piece is. */
export function separateGroup(cfg: Config, type: 'social' | 'highlights', separate: boolean) {
  const at = cfg.blocks.findIndex((b) => b.type === type);
  if (at < 0) return;
  const whole = cfg.blocks[at];
  cfg.blocks = cfg.blocks.filter((b) => b.type !== type);
  if (separate) {
    const keys = type === 'social' ? cfg.social.map(socialKey) : cfg.highlights.map((_, i) => String(i));
    cfg.blocks.splice(at, 0, ...keys.map((key): PageBlock => ({ id: `${type}:${key}`, type, part: key, ...(whole.hidden ? { hidden: true } : {}),
      design: { span: Math.max(type === 'social' ? 2 : 4, Math.floor(12 / Math.max(1, keys.length))), align: 'auto' as const } })));
  } else cfg.blocks.splice(at, 0, { id: type, type, ...(whole.hidden ? { hidden: true } : {}) });
}
export const isSeparated = (cfg: Config, type: 'social' | 'highlights') => cfg.blocks.some((b) => b.type === type && b.part);

/** What a template's arrangement is made of: where items sit and how big they are, not what they say or how they look. */
const PLACEMENT = ['design', 'offset', 'inset', 'height', 'dx', 'dy', 'float', 'textScale', 'font', 'weight', 'lineHeight', 'wordSpacing', 'pad', 'rotate', 'textColor', 'z'] as const;

/** The current arrangement, to keep for the template being left. */
export function saveLayout(cfg: Config): TemplateLayout {
  const items: TemplateLayout['items'] = {};
  for (const b of cfg.blocks) if (b.type !== 'space') items[b.id] = clone(Object.fromEntries(PLACEMENT.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])));
  return { v: 2, order: cfg.blocks.map((b) => b.id), items, spaces: clone(cfg.blocks.filter((b) => b.type === 'space')),
    profile: { photoSize: cfg.profile.photoSize, coverHeight: cfg.profile.coverHeight }, spacing: cfg.look.spacing, margin: cfg.look.margin };
}

/** Puts a template's kept arrangement back. Items added since then keep a clean placement at the end, deleted ones stay deleted. */
export function restoreLayout(cfg: Config, saved: TemplateLayout) {
  const byId = new Map(cfg.blocks.filter((b) => b.type !== 'space').map((b) => [b.id, b]));
  const spaces = new Map(saved.spaces.map((b) => [b.id, clone(b)]));
  const blocks: PageBlock[] = [];
  for (const id of saved.order) {
    const b = byId.get(id) ?? spaces.get(id); if (!b) continue;
    // Layouts kept before typography was kept (no v) only set placement: the item's fonts and spacing stay as they are.
    if (b.type !== 'space') { for (const k of saved.v === 2 ? PLACEMENT : PLACEMENT.slice(0, 8)) delete b[k]; Object.assign(b, clone(saved.items[id] ?? {})); }
    blocks.push(b); byId.delete(id);
  }
  cfg.blocks = [...blocks, ...byId.values()];
  cfg.profile.photoSize = saved.profile.photoSize; cfg.profile.coverHeight = saved.profile.coverHeight;
  cfg.look.spacing = saved.spacing; cfg.look.margin = saved.margin;
}

/** A neat arrangement any design can show well (a design used for the first time, or Tidy up). `freed` are items that were
 * placed freely: notes and badges among them move under the main button instead of landing anywhere.
 *   1. the header: photo, name, bio — always first and full width
 *   2. social icons, one centered row
 *   3. the main button (the first link without a picture)
 *   4. freed notes and badges (text), centered
 *   5. everything else in its order (side-by-side pairs stay side by side)
 * The design decides the typography: per-item fonts, weight, text size, spacing, padding and tilt are cleared
 * (each design keeps its own, see saveLayout). Pictures, colors, card styles and content stay. */
export function arrangeLayout(cfg: Config, freed: Set<string>, template: Template = cfg.look.template) {
  const take = (keep: (b: PageBlock) => boolean) => { const out = cfg.blocks.filter(keep); cfg.blocks = cfg.blocks.filter((b) => !out.includes(b)); return out; };
  const header = (['profile', 'name', 'bio'] as const).flatMap((t) => take((b) => b.type === t));
  const social = take((b) => b.type === 'social');
  const isButton = (b: PageBlock) => { const l = b.type === 'link' && !b.hidden ? cfg.links.find((x) => x.id === b.linkId) : undefined; return !!l && usesButton(l, template); };
  const main = cfg.blocks.find(isButton);
  const button = main ? take((b) => b === main) : [];
  const notes = take((b) => freed.has(b.id) && b.type === 'text'); // small notes and badges; videos, pictures and shapes keep their place
  cfg.blocks = [...header, ...social, ...button, ...notes, ...cfg.blocks];
  for (const b of cfg.blocks) {
    for (const k of PLACEMENT) if (k !== 'design' && !(k === 'rotate' && b.type === 'shape')) delete b[k];
    if (b.design?.start) { const { start, ...rest } = b.design; b.design = rest; }
  }
  for (const b of [...header, ...social, ...button]) { b.design = undefined; b.vertical = undefined; }
  for (const b of notes) b.design = { span: Math.min(normalizeBlockDesign(b.design)?.span ?? 12, 12), align: 'center' };
  cfg.profile.photoSize = undefined; cfg.profile.coverHeight = undefined;
}
