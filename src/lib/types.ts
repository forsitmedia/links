import defaults from '../../yourlinki.config.json';
import { normalizeImageFrame, type ImageFrame } from './image-frame';
import { bounded, normalizeBlockDesign, type BlockDesign } from './layout';
import { normalizeButtonShape, normalizeButtonStyle, type ButtonShape, type ButtonStyle } from './button-shape';
import { normalizeSocials, socialKey } from './social-order';
import { normalizeTileStyle, type TileStyle } from './tile-style';
import { SHAPES, SHAPE_COLORS, SHAPE_MOTIONS, type ShapeMotion } from './shapes';
import { REVEAL_EFFECTS, type RevealEffect } from './reveal';

export type Link = {
  id: string;
  title: string;
  url: string;
  image?: string | null;
  imageFrame?: ImageFrame;
  featured?: boolean;
  buttonShape?: ButtonShape;
  buttonStyle?: ButtonStyle;
  tile?: TileStyle;
  hidden?: boolean;
  publishAt?: string;
  expireAt?: string;
};
export type Social = { id?: string; platform: string; url: string };
/** One link inside a Link Menu (a button that opens down into a list of links). */
export type MenuItem = { id: string; title: string; url: string };
export const CREDENTIAL_KINDS = [
  { value: 'degree', label: 'Degree', icon: 'cap' },
  { value: 'certificate', label: 'Certificate', icon: 'seal' },
  { value: 'award', label: 'Award', icon: 'trophy' },
  { value: 'work', label: 'Work', icon: 'briefcase' },
] as const;
/** One degree, certificate, award or role in a Credentials item. */
export type Credential = { kind: typeof CREDENTIAL_KINDS[number]['value']; title: string; org: string; year: string; logo?: string | null; logoFrame?: ImageFrame; url?: string };
/** Background of a card item (video, post, image, credentials, bio, highlights, text). */
export const CARD_STYLES = ['glass', 'solid', 'outline', 'none'] as const;
export type CardStyle = typeof CARD_STYLES[number];
export const CARD_TYPES: PageBlock['type'][] = ['youtube', 'post', 'image', 'credentials', 'bio', 'highlights', 'text', 'voice', 'file'];
export const CREDENTIAL_LAYOUTS = ['list', 'cards', 'timeline'] as const;
export type Highlight = { value: string; label: string };
export const TEMPLATE_IDS = ['photo', 'classic', 'studio', 'cover', 'gallery', 'bold', 'minimal'] as const;
export type Template = typeof TEMPLATE_IDS[number];
export type PageBlock = {
  id: string;
  /** Scroll effect; omitted follows the page, 'none' keeps this item still. */
  reveal?: RevealEffect;
  revealDelay?: number;
  design?: BlockDesign;
  type: 'profile' | 'name' | 'bio' | 'highlights' | 'social' | 'link' | 'youtube' | 'image' | 'post' | 'text' | 'credentials' | 'shape' | 'space' | 'voice' | 'file' | 'menu';
  /** Shape items: which drawing, its colors, outline, rotation and motion. */
  deco?: { shape: string; color: string; outline?: boolean; rotate?: number; motion?: ShapeMotion; from?: string; to?: string };
  /** Social icons: glyph color ('brand' or #hex) and the circle behind each icon. */
  iconColor?: string;
  iconStyle?: CardStyle;
  /** Credentials items: the entries and how they are laid out. */
  entries?: Credential[];
  variant?: typeof CREDENTIAL_LAYOUTS[number];
  /** One piece of a group shown on its own: a social icon's key, or a highlight's position. */
  part?: string;
  /** Text items: how the words look, and where they line up. */
  textStyle?: TextStyle;
  textAlign?: NameAlign | 'justify';
  /** Text in a box stretched taller than it: at the top, middle (default) or bottom. */
  vAlign?: 'top' | 'bottom';
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
  /** Text size of this item, 0.5 to 8 (1 = as designed): big numbers and statements can go far past the template's size. */
  textScale?: number;
  /** Extra space above this item in px; negative pulls it closer to the item above. */
  offset?: number;
  /** Extra space on both sides of this item, in px. */
  inset?: number;
  /** Space between the lines of this item's text, as a multiple of the text size (1 = lines touch). */
  lineHeight?: number;
  /** Extra space between words, as a share of the text size (0 = normal, negative = closer). */
  wordSpacing?: number;
  /** How heavy this item's text is (300 light to 700 bold); missing = as the template designs it. */
  weight?: 300 | 400 | 500 | 600 | 700;
  /** Link Menu: the button's links, and whether it is already open when the page loads. */
  items?: MenuItem[];
  open?: boolean;
  /** PDF: the file (embedded as a data URL, or a link) with its original name and size in bytes. */
  file?: string;
  fileName?: string;
  fileSize?: number;
  /** Voice message: the recording (a data URL, so the page stays one file), its length in seconds and its waveform (0–1 bars). */
  audio?: string;
  duration?: number;
  peaks?: number[];
  /** Layer: higher sits in front of lower (missing = the usual order: text above pictures, free items above the column). */
  z?: number;
  /** Items grouped together (same id) are selected, moved, copied and deleted as one. */
  group?: string;
  /** Text color of this item; missing = as the design draws it. */
  textColor?: string;
  /** Buttons: space between the text and the button's edge, in px (0 hugs the text). */
  pad?: number;
  /** Height chosen by stretching the item from its top or bottom edge, in px. */
  height?: number;
  cardStyle?: CardStyle;
  /** Free position: how far the item was moved by hand from its place, in px. Other items don't move. */
  dx?: number;
  dy?: number;
  /** Placed freely: lifted out of the layout and pinned at x (% of page width), y (px from the top of the items), width (% of page width). */
  /** a: the item it sits on (its anchor); x and w are then shares of the anchor's width, y px from its top (or a share of its
   * height when s is set: placed on it, like a sticker). p: its width in px when placed, so it never shrinks much below that. */
  float?: { x: number; y: number; w: number; a?: string; s?: 1; p?: number };
  /** Turn of the whole item in degrees (−180 to 180). */
  rotate?: number;
  /** Social icons stacked in a column instead of a row. */
  vertical?: boolean;
};
export type Look = {
  reveal?: RevealEffect;
  revealDuration?: number;
  revealRepeat?: boolean;
  spacing?: number;
  /** Space between the page edges and its items, in px. */
  margin?: number;
  template: Template;
  /** 'auto' follows each visitor's phone setting. */
  mode: 'dark' | 'light' | 'auto';
  background: 'photo' | 'color';
  color: string;
  accent: string; // '' = automatic (white on dark, black on light)
  font: FontId;
  /** Music visitors can turn on with the ♪ button: generated in their browser (no recording, no copyright). */
  music?: MusicStyle;
  /** Shows the 🪩 button: visitors can switch the page into disco mode (lights, swaying items, music if set). */
  disco?: boolean;
  /** Where the music and disco buttons sit: 'top' (next to Share), 'left' (top left) or 'bottom' (floating). */
  tools?: 'top' | 'left' | 'bottom';
};
/** One template's arrangement: item order, each item's placement, its empty spaces, and the page spacing. */
export type TemplateLayout = {
  /** 2: also keeps typography (fonts, weight, spacing, tilt), so each design can have its own. */
  v?: 2;
  order: string[];
  items: Record<string, Pick<PageBlock, 'design' | 'offset' | 'inset' | 'height' | 'dx' | 'dy' | 'float' | 'textScale' | 'font' | 'weight' | 'lineHeight' | 'wordSpacing' | 'pad' | 'rotate' | 'textColor' | 'z'>>;
  spaces: PageBlock[];
  profile: { photoSize?: number; coverHeight?: number };
  spacing?: number;
  margin?: number;
};
export const MUSIC_STYLES = ['lounge', 'lofi', 'ambient', 'rock', 'bossa', 'synthwave'] as const;
export type MusicStyle = typeof MUSIC_STYLES[number];
export type Config = {
  onboarded: boolean;
  profile: { name: string; handle: string; bio: string; photo: string | null; cover: string | null; photoFrame?: ImageFrame; coverFrame?: ImageFrame; showCover?: boolean; photoSize?: number; coverHeight?: number; nameAlign?: NameAlign };
  highlights: Highlight[];
  links: Link[];
  social: Social[];
  blocks: PageBlock[];
  look: Look;
  /** Address of the creator's own stats worker (see stats/). Empty: the page sends nothing anywhere. */
  stats?: string;
  /** Each template keeps its own arrangement (positions, spacing, sizes), so switching back restores it (see lib/layout.ts). */
  layouts?: Partial<Record<Template, TemplateLayout>>;
};

export const TEXT_STYLES = ['title', 'subtitle', 'body', 'small'] as const;
export type TextStyle = typeof TEXT_STYLES[number];
export const FONT_IDS = ['system', 'rounded', 'serif', 'mono', 'display', 'inter', 'poppins', 'montserrat', 'grotesk', 'syne', 'playfair', 'dmserif', 'lora', 'bebas', 'archivo', 'caveat', 'pacifico'] as const;
export type FontId = typeof FONT_IDS[number];
export const NAME_ALIGN = ['left', 'center', 'right'] as const;
export type NameAlign = typeof NAME_ALIGN[number];

const DEFAULT_LOOK: Look = { template: 'photo', mode: 'dark', background: 'photo', color: '#1c1c1e', accent: '', font: 'system' };
const list = <T>(v: unknown, ok: (x: any) => boolean): T[] => (Array.isArray(v) ? v.filter(ok) : []);

/** Fills in anything missing so the rest of the code can trust the shape. */
export function normalize(raw: any = {}): Config {
  const c = { ...(defaults as any), ...raw };
  const links = list<Link>(c.links, (l) => l && typeof l.id === 'string' && typeof l.url === 'string')
    .map((l) => ({ ...l, ...('buttonShape' in l ? { buttonShape: normalizeButtonShape(l.buttonShape) } : {}), ...(normalizeButtonStyle(l.buttonStyle) ? { buttonStyle: normalizeButtonStyle(l.buttonStyle) } : {}), ...(l.imageFrame ? { imageFrame: normalizeImageFrame(l.imageFrame) } : {}), tile: normalizeTileStyle(l.tile) }));
  const look = { ...DEFAULT_LOOK, ...c.look };
  if (!TEMPLATE_IDS.includes(look.template)) look.template = 'photo';
  if (!['dark', 'light', 'auto'].includes(look.mode)) look.mode = 'dark';
  if ('spacing' in look) look.spacing = bounded(look.spacing, 8, 36);
  if ('margin' in look) look.margin = bounded(look.margin, 0, 60);
  if (!MUSIC_STYLES.includes(look.music)) delete look.music;
  if (look.disco !== true) delete look.disco;
  if (!['left', 'bottom'].includes(look.tools)) delete look.tools;
  if (!REVEAL_EFFECTS.includes(look.reveal)) delete look.reveal;
  if (look.revealDuration !== undefined) look.revealDuration = bounded(look.revealDuration, 250, 1500);
  if (look.revealRepeat !== true) delete look.revealRepeat;
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
    blocks: normalizeBlocks(c.blocks, links, {
      social: normalizeSocials(c.social).map(socialKey),
      highlights: list<Highlight>(c.highlights, (h) => h && typeof h.value === 'string').slice(0, 3).map((_, i) => String(i)) }),
    look,
    ...(c.layouts && typeof c.layouts === 'object' ? { layouts: Object.fromEntries(Object.entries(c.layouts).filter(([k, v]: [string, any]) =>
      TEMPLATE_IDS.includes(k as Template) && v && Array.isArray(v.order) && v.items && typeof v.items === 'object' && Array.isArray(v.spaces))) } : {}),
    ...(typeof c.stats === 'string' && /^https:\/\/[^\s"'<>]+$/.test(c.stats) ? { stats: c.stats.replace(/\/+$/, '') } : {}),
  };
}

/** Old pages keep their existing arrangement; saved block order is never sorted by style. */
function normalizeBlocks(raw: unknown, links: Link[], pieces: { social: string[]; highlights: string[] }): PageBlock[] {
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
  const parts = new Set<string>(); // 'social:<key>' or 'highlights:<n>': pieces of a group placed on their own
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
    const textScale = bounded(b.textScale, .5, 8), offset = bounded(b.offset, -80, 120), inset = bounded(b.inset, 0, 80), height = bounded(b.height, 24, 900), dx = bounded(b.dx, -600, 600), dy = bounded(b.dy, -1200, 1200), rotate = bounded(b.rotate, -180, 180), pad = bounded(b.pad, 0, 40), lineHeight = bounded(b.lineHeight, .6, 2.5), wordSpacing = bounded(b.wordSpacing, -.3, 1.5);
    const icons = b.type === 'social' ? { ...(b.iconColor === 'brand' || /^#[0-9a-f]{6}$/i.test(b.iconColor) ? { iconColor: b.iconColor } : {}), ...(CARD_STYLES.includes(b.iconStyle) ? { iconStyle: b.iconStyle } : {}) } : {};
    const layout = { ...icons, ...(REVEAL_EFFECTS.includes(b.reveal) ? { reveal: b.reveal as RevealEffect } : {}),
      ...(bounded(b.revealDelay, 0, 1000) !== undefined ? { revealDelay: Math.round(bounded(b.revealDelay, 0, 1000)!) } : {}),
      ...(design ? { design } : {}), ...(FONT_IDS.includes(b.font) ? { font: b.font as FontId } : {}),
      ...(textScale && textScale !== 1 ? { textScale: Math.round(textScale * 100) / 100 } : {}), ...(offset ? { offset: Math.round(offset) } : {}), ...(inset ? { inset: Math.round(inset) } : {}), ...(height ? { height: Math.round(height) } : {}), ...(dx ? { dx: Math.round(dx) } : {}), ...(rotate ? { rotate: Math.round(rotate * 10) / 10 } : {}), ...(pad !== undefined ? { pad: Math.round(pad) } : {}), ...(lineHeight ? { lineHeight: Math.round(lineHeight * 100) / 100 } : {}), ...(wordSpacing ? { wordSpacing: Math.round(wordSpacing * 100) / 100 } : {}), ...([300, 400, 500, 600, 700].includes(b.weight) ? { weight: b.weight } : {}), ...(/^#[0-9a-f]{6}$/i.test(b.textColor) ? { textColor: b.textColor } : {}), ...(bounded(b.z, -50, 50) !== undefined ? { z: Math.round(bounded(b.z, -50, 50)!) } : {}), ...(typeof b.group === 'string' && /^[\w-]{1,24}$/.test(b.group) ? { group: b.group } : {}),
      ...(b.float && typeof b.float === 'object' && [b.float.x, b.float.y, b.float.w].every((v) => typeof v === 'number' && Number.isFinite(v))
        ? { float: typeof b.float.a === 'string' && /^[\w:~#.-]{1,80}$/.test(b.float.a)
          ? { x: bounded(b.float.x, -1000, 1000)!, y: bounded(b.float.y, -2000, 8000)!, w: bounded(b.float.w, 1, 2000)!, a: b.float.a,
            ...(b.float.s === 1 ? { s: 1 as const } : {}), ...(bounded(b.float.p, 10, 1200) ? { p: Math.round(bounded(b.float.p, 10, 1200)!) } : {}) }
          : { x: bounded(b.float.x, -60, 160)!, y: bounded(b.float.y, -400, 8000)!, w: bounded(b.float.w, 4, 100)! } } : {}), ...(dy ? { dy: Math.round(dy) } : {}),
      ...(CARD_STYLES.includes(b.cardStyle) && CARD_TYPES.includes(b.type) ? { cardStyle: b.cardStyle as CardStyle } : {}) };
    if ((b.type === 'social' || b.type === 'highlights') && typeof b.part === 'string' && b.part) {
      const key = `${b.type}:${b.part}`;
      if (singles.has(b.type) || parts.has(key)) continue;
      parts.add(key);
      add({ id, type: b.type, part: b.part, hidden: !!b.hidden, ...layout, ...(b.vertical === true ? { vertical: true } : {}) });
    } else if (b.type === 'credentials') {
      const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
      const entries: Credential[] = (Array.isArray(b.entries) ? b.entries : []).filter((e: any) => e && typeof e === 'object').slice(0, 12).map((e: any) => ({
        kind: CREDENTIAL_KINDS.some((k) => k.value === e.kind) ? e.kind : 'degree', title: str(e.title, 120), org: str(e.org, 120), year: str(e.year, 30),
        ...(safeImg(e.logo) ? { logo: e.logo, ...(e.logoFrame ? { logoFrame: normalizeImageFrame(e.logoFrame) } : {}) } : {}), ...(typeof e.url === 'string' && e.url ? { url: e.url.slice(0, 500) } : {}) }));
      add({ id, type: 'credentials', ...layout, title: str(b.title, 60), entries, hidden: !!b.hidden, ...(CREDENTIAL_LAYOUTS.includes(b.variant) ? { variant: b.variant } : {}) });
    } else if (b.type === 'file') {
      add({ id, type: 'file', ...layout, hidden: !!b.hidden, title: typeof b.title === 'string' ? b.title.slice(0, 120) : '',
        ...(safeFile(b.file) ? { file: b.file } : {}), ...(typeof b.fileName === 'string' ? { fileName: b.fileName.slice(0, 120) } : {}), ...(bounded(b.fileSize, 0, 1e9) ? { fileSize: Math.round(b.fileSize) } : {}) });
    } else if (b.type === 'menu') {
      const items: MenuItem[] = (Array.isArray(b.items) ? b.items : []).filter((e: any) => e && typeof e === 'object').slice(0, 30).map((e: any, i: number) => ({
        id: typeof e.id === 'string' && /^[\w-]{1,24}$/.test(e.id) ? e.id : `m${i}`, title: typeof e.title === 'string' ? e.title.slice(0, 120) : '', url: typeof e.url === 'string' ? e.url.slice(0, 1000) : '' }));
      add({ id, type: 'menu', ...layout, hidden: !!b.hidden, title: typeof b.title === 'string' ? b.title.slice(0, 120) : '', items, ...(b.open === true ? { open: true } : {}) });
    } else if (b.type === 'voice') {
      const peaks = Array.isArray(b.peaks) ? b.peaks.slice(0, 64).map((v: unknown) => Math.round((bounded(v, 0, 1) ?? 0) * 100) / 100) : undefined;
      add({ id, type: 'voice', ...layout, hidden: !!b.hidden, title: typeof b.title === 'string' ? b.title.slice(0, 80) : '',
        ...(safeAudio(b.audio) ? { audio: b.audio } : {}), ...(bounded(b.duration, 0, 600) ? { duration: Math.round(b.duration * 10) / 10 } : {}), ...(peaks?.length ? { peaks } : {}) });
    } else if (b.type === 'space') { // an empty placeholder (left where a freely moved item used to be)
      add({ id, type: 'space', ...layout, height: layout.height ?? 40 });
    } else if (b.type === 'shape') {
      const d = b.deco && typeof b.deco === 'object' ? b.deco : {};
      const rotate = bounded(d.rotate, 0, 359);
      add({ id, type: 'shape', ...layout, hidden: !!b.hidden, deco: {
        shape: SHAPES.some((s) => s.id === d.shape) ? d.shape : SHAPES[0].id, color: SHAPE_COLORS.some((c) => c.id === d.color) ? d.color : 'sunset',
        ...(d.outline === true ? { outline: true } : {}), ...(rotate ? { rotate: Math.round(rotate) } : {}), ...(SHAPE_MOTIONS.includes(d.motion) && d.motion !== 'none' ? { motion: d.motion } : {}),
        ...(/^#[0-9a-f]{6}$/i.test(d.from) ? { from: d.from } : {}), ...(/^#[0-9a-f]{6}$/i.test(d.to) ? { to: d.to } : {}) } });
    } else if (b.type === 'text') {
      add({ id, type: 'text', ...layout, title: typeof b.title === 'string' ? b.title : '', hidden: !!b.hidden,
        ...(TEXT_STYLES.includes(b.textStyle) ? { textStyle: b.textStyle } : {}), ...([...NAME_ALIGN, 'justify'].includes(b.textAlign) ? { textAlign: b.textAlign } : {}), ...(['top', 'bottom'].includes(b.vAlign) ? { vAlign: b.vAlign } : {}) });
    } else if (fixed.includes(b.type) || b.type === 'name') {
      if ([...parts].some((k) => k.startsWith(b.type + ':'))) continue; // already shown piece by piece // the name is optional: it exists only when moved apart from the profile
      if (singles.has(b.type)) continue;
      singles.add(b.type);
      add({ id, type: b.type, hidden: !!b.hidden, ...layout, ...(b.type === 'social' && b.vertical === true ? { vertical: true } : {}) });
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
  // A group shown piece by piece stays complete: pieces that no longer exist go, new ones are added after the others.
  for (const type of ['social', 'highlights'] as const) {
    if (![...parts].some((k) => k.startsWith(type + ':'))) continue;
    const valid = new Set(pieces[type]);
    for (let i = result.length - 1; i >= 0; i--) if (result[i].type === type && result[i].part && !valid.has(result[i].part!)) result.splice(i, 1);
    for (const key of pieces[type]) if (!parts.has(`${type}:${key}`)) { parts.add(`${type}:${key}`); add({ id: `${type}:${key}`, type, part: key }); }
    singles.add(type);
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
/** PDFs are embedded in the page (data URL) or linked over https. */
export const safeFile = (u?: string | null) => (u && /^(https:\/\/[^\s"'<>]+|data:application\/pdf;base64,[A-Za-z0-9+/=]+)$/.test(u) ? u : '');
/** Recordings are embedded in the page as data URLs (or linked over https). */
export const safeAudio = (u?: string | null) => (u && /^(https:\/\/|data:audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;[\w=.+-]+)*;base64,)/.test(u) ? u : '');
export const safeImg = (u?: string | null) => (u && /^(https:\/\/|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/.test(u) ? u : '');
