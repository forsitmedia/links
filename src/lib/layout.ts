import type { Config, PageBlock } from './types';
import type { ImageFrame } from './image-frame';
import type { ButtonShape } from './button-shape';
import { socialKey } from './social-order';

export type BlockDesign = { span: number; align: 'auto' | 'left' | 'center' | 'right' };
export const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;
export function normalizeBlockDesign(value: any): BlockDesign | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return { span: Math.round(bounded(value.span, 4, 12) ?? 12), align: ['left', 'center', 'right'].includes(value.align) ? value.align : 'auto' };
}
export function designStyle(value?: BlockDesign): string {
  const d = normalizeBlockDesign(value);
  if (!d) return '';
  const start = d.align === 'left' ? 1 : d.align === 'center' ? Math.floor((12 - d.span) / 2) + 1 : d.align === 'right' ? 13 - d.span : null;
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
  blocks: { id: string; design?: BlockDesign; image: Framed; videoAspect?: PageBlock['videoAspect']; buttonShape?: ButtonShape }[];
  socialOrder: string[];
  profile: { photo: Framed; cover: Framed; photoSize?: number; coverHeight?: number };
  spacing?: number;
};
function blockImage(cfg: Config, b: PageBlock) {
  const item = b.type === 'link' ? cfg.links.find((l) => l.id === b.linkId) : b;
  return { item, source: item?.image || (b.type === 'youtube' ? b.url : null) };
}
function snapshot(cfg: Config): LayoutSnapshot {
  return clone({ blocks: cfg.blocks.map((b) => ({ id: b.id, design: b.design, videoAspect: b.videoAspect, buttonShape: b.type === 'link' ? cfg.links.find((l) => l.id === b.linkId)?.buttonShape : undefined, image: { source: blockImage(cfg, b).source, frame: blockImage(cfg, b).item?.imageFrame } })),
    socialOrder: cfg.social.map(socialKey),
    profile: { photo: { source: cfg.profile.photo, frame: cfg.profile.photoFrame }, cover: { source: cfg.profile.cover, frame: cfg.profile.coverFrame }, photoSize: cfg.profile.photoSize, coverHeight: cfg.profile.coverHeight }, spacing: cfg.look.spacing });
}
function restore(cfg: Config, value: LayoutSnapshot) {
  const ids = new Map(cfg.blocks.map((b) => [b.id, b]));
  const restored: PageBlock[] = [];
  for (const item of value.blocks) {
    const b = ids.get(item.id);
    if (!b) continue;
    b.design = clone(item.design);
    if (b.type === 'youtube') b.videoAspect = item.videoAspect;
    if (b.type === 'link') { const link = cfg.links.find((l) => l.id === b.linkId); if (link) link.buttonShape = item.buttonShape; }
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
}

/** Groups one canvas gesture so Escape can put the layout back as it was. Undo and redo cover every edit and live in the editor state. */
export class LayoutHistory {
  private before: LayoutSnapshot | null = null;
  constructor(private config: () => Config) {}
  begin() { if (!this.before) this.before = snapshot(this.config()); }
  end() { this.before = null; }
  cancel() { if (this.before) restore(this.config(), this.before); this.before = null; }
}
