import defaults from '../../yourlinki.config.json';
import { normalizeImageFrame, type ImageFrame } from './image-frame';
import { bounded, normalizeBlockDesign, type BlockDesign } from './layout';
import { normalizeButtonShape, type ButtonShape } from './button-shape';
import { normalizeSocials } from './social-order';
import { normalizeTileStyle, type TileStyle } from './tile-style';

export type Link = {
  id: string;
  title: string;
  url: string;
  image?: string | null;
  imageFrame?: ImageFrame;
  featured?: boolean;
  buttonShape?: ButtonShape;
  tile?: TileStyle;
  hidden?: boolean;
  publishAt?: string;
  expireAt?: string;
};
export type Social = { id?: string; platform: string; url: string };
export type Highlight = { value: string; label: string };
export const TEMPLATE_IDS = ['photo', 'classic', 'studio', 'cover', 'gallery', 'bold', 'minimal'] as const;
export type Template = typeof TEMPLATE_IDS[number];
export type PageBlock = {
  id: string;
  design?: BlockDesign;
  type: 'profile' | 'name' | 'bio' | 'highlights' | 'social' | 'link' | 'youtube' | 'image' | 'post';
  linkId?: string;
  title?: string;
  description?: string;
  url?: string;
  image?: string | null;
  imageFrame?: ImageFrame;
  hidden?: boolean;
  videoAspect?: 'landscape' | 'wide' | 'square';
  /** Overrides the page font for this item only. */
  font?: FontId;
};
export type Look = {
  spacing?: number;
  template: Template;
  mode: 'dark' | 'light';
  background: 'photo' | 'color';
  color: string;
  accent: string; // '' = automatic (white on dark, black on light)
  font: FontId;
};
export type Config = {
  onboarded: boolean;
  profile: { name: string; handle: string; bio: string; photo: string | null; cover: string | null; photoFrame?: ImageFrame; coverFrame?: ImageFrame; showCover?: boolean; photoSize?: number; coverHeight?: number; nameAlign?: NameAlign };
  highlights: Highlight[];
  links: Link[];
  social: Social[];
  blocks: PageBlock[];
  look: Look;
};

export const FONT_IDS = ['system', 'rounded', 'serif', 'mono', 'display'] as const;
export type FontId = typeof FONT_IDS[number];
export const NAME_ALIGN = ['left', 'center', 'right'] as const;
export type NameAlign = typeof NAME_ALIGN[number];

const DEFAULT_LOOK: Look = { template: 'photo', mode: 'dark', background: 'photo', color: '#1c1c1e', accent: '', font: 'system' };
const list = <T>(v: unknown, ok: (x: any) => boolean): T[] => (Array.isArray(v) ? v.filter(ok) : []);

/** Fills in anything missing so the rest of the code can trust the shape. */
export function normalize(raw: any = {}): Config {
  const c = { ...(defaults as any), ...raw };
  const links = list<Link>(c.links, (l) => l && typeof l.id === 'string' && typeof l.url === 'string')
    .map((l) => ({ ...l, ...('buttonShape' in l ? { buttonShape: normalizeButtonShape(l.buttonShape) } : {}), ...(l.imageFrame ? { imageFrame: normalizeImageFrame(l.imageFrame) } : {}), tile: normalizeTileStyle(l.tile) }));
  const look = { ...DEFAULT_LOOK, ...c.look };
  if (!TEMPLATE_IDS.includes(look.template)) look.template = 'photo';
  if ('spacing' in look) look.spacing = bounded(look.spacing, 8, 36);
  return {
    onboarded: !!c.onboarded,
    profile: { name: '', handle: '', bio: '', photo: null, cover: null, ...c.profile,
      photoFrame: c.profile?.photoFrame ? normalizeImageFrame(c.profile.photoFrame) : undefined,
      coverFrame: c.profile?.coverFrame ? normalizeImageFrame(c.profile.coverFrame) : undefined,
      showCover: typeof c.profile?.showCover === 'boolean' ? c.profile.showCover : undefined,
      photoSize: bounded(c.profile?.photoSize, 48, 180), coverHeight: bounded(c.profile?.coverHeight, 100, 540),
      nameAlign: NAME_ALIGN.includes(c.profile?.nameAlign) ? c.profile.nameAlign : undefined },
    highlights: list<Highlight>(c.highlights, (h) => h && typeof h.value === 'string').slice(0, 3),
    links,
    social: normalizeSocials(c.social),
    blocks: normalizeBlocks(c.blocks, links),
    look,
  };
}

/** Old pages keep their existing arrangement; saved block order is never sorted by style. */
function normalizeBlocks(raw: unknown, links: Link[]): PageBlock[] {
  const fixed = ['profile', 'highlights', 'bio', 'social'] as const;
  const linkBlock = (l: Link): PageBlock => ({ id: `link:${l.id}`, type: 'link', linkId: l.id });
  if (!Array.isArray(raw)) {
    const featured = links.find((l) => l.featured);
    return [
      { id: 'profile', type: 'profile' },
      ...(featured ? [linkBlock(featured)] : []),
      ...fixed.slice(1).map((type) => ({ id: type, type })),
      ...links.filter((l) => l !== featured).map(linkBlock),
    ];
  }
  const result: PageBlock[] = [];
  const ids = new Set<string>();
  const singles = new Set<string>();
  const linked = new Set<string>();
  const add = (block: PageBlock) => {
    let id = block.id;
    while (ids.has(id)) id += '-copy';
    ids.add(id);
    result.push({ ...block, id });
  };
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const id = typeof b.id === 'string' && b.id ? b.id : `item:${result.length}`;
    const design = normalizeBlockDesign(b.design);
    const layout = { ...(design ? { design } : {}), ...(FONT_IDS.includes(b.font) ? { font: b.font as FontId } : {}) };
    if (fixed.includes(b.type) || b.type === 'name') { // the name is optional: it exists only when moved apart from the profile
      if (singles.has(b.type)) continue;
      singles.add(b.type);
      add({ id, type: b.type, hidden: !!b.hidden, ...layout });
    } else if (b.type === 'link' && links.some((l) => l.id === b.linkId) && !linked.has(b.linkId)) {
      linked.add(b.linkId);
      add({ id, type: 'link', linkId: b.linkId, ...layout });
    } else if (b.type === 'youtube' || b.type === 'image' || b.type === 'post') {
      add({ id, type: b.type, ...layout, title: typeof b.title === 'string' ? b.title : '',
        url: typeof b.url === 'string' ? b.url : '', image: typeof b.image === 'string' ? b.image : null, hidden: !!b.hidden,
        ...(b.type === 'post' ? { description: typeof b.description === 'string' ? b.description : '' } : {}),
        ...(b.type === 'youtube' && ['landscape', 'wide', 'square'].includes(b.videoAspect) ? { videoAspect: b.videoAspect } : {}),
        ...(b.imageFrame ? { imageFrame: normalizeImageFrame(b.imageFrame) } : {}) });
    }
  }
  for (const type of fixed) if (!singles.has(type)) add({ id: type, type });
  for (const l of links) if (!linked.has(l.id)) add(linkBlock(l));
  return result;
}

/** A link is visible when it is shown and inside its schedule window. */
export function isVisible(link: Link, now = Date.now()): boolean {
  if (link.hidden) return false;
  if (link.publishAt && now < Date.parse(link.publishAt)) return false;
  if (link.expireAt && now >= Date.parse(link.expireAt)) return false;
  return true;
}

/** Completes what people type: `forsitmedia.com` becomes https://forsitmedia.com, `me@site.com` a mailto: link. */
export function withScheme(value: string): string {
  const v = (value ?? '').trim();
  if (!v || /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(v)) return v; // already has a scheme (a port number is not one)
  if (v.startsWith('//')) return 'https:' + v;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return 'mailto:' + v;
  if (/^\+?[\d\s().-]{7,}$/.test(v)) return 'tel:' + v.replace(/[^\d+]/g, '');
  if (/^[^\s/]+\.[^\s/]{2,}/.test(v)) return 'https://' + v;
  return v;
}

export const safeUrl = (u: string) => { const v = withScheme(u); return /^(https?:|mailto:|tel:)/i.test(v) ? v : ''; };
/** Images are https URLs or embedded in the page itself (uploads become data URLs). */
export const safeImg = (u?: string | null) => (u && /^(https:\/\/|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/.test(u) ? u : '');
