import { lookVars, lookColors, themeColorMeta, FONTS, fontLink } from './look';
import { imageFrameStyle } from './image-frame';
import { normalizeButtonShape, normalizeButtonStyle } from './button-shape';
import { tileAttributes, tileTextStyle } from './tile-style';
import { socialKey } from './social-order';
import { bounded, designStyle, normalizeBlockDesign, sizeTier } from './layout';
import { icon } from './icons';
import { shapeSvg } from './shapes';
import { platform } from './platforms';
import { youtubeVideo, youtubeCover, postUrl, postSource, videoRatio } from './media';
import { MUSIC_SCRIPT } from './music';
import { REVEAL_EFFECTS, revealScript } from './reveal';
import { AUDIO_SCRIPT } from './audio';
import { isVisible, safeUrl, safeImg, safeAudio, safeFile, CREDENTIAL_KINDS, type Config, type Link, type PageBlock } from './types';
import css from './page.css?inline';

/** openMenus: Link Menus the editor's preview shows open (the one being edited). */
type Opts = { now?: number; preview?: boolean; openMenus?: string[] };
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Simple marks people can type or add with the editor's buttons: **bold**, *italic*, __underline__, ~~crossed out~~. */
/** `***both***` reads as italic around bold: bold never takes a third star. */
export const BOLD = /\*\*(?!\*)(.+?)(?<!\*)\*\*/gs;
export const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
export function rich(text: string): string {
  // Links ([words](address)) are set aside first, so marks never reach inside an address.
  const links: string[] = [];
  const marked = esc(text.replace(LINK, (_, label: string, url: string) => {
    const href = safeUrl(url);
    links.push(href ? `<a class="text-link" href="${esc(href)}" rel="noopener">${esc(label)}</a>` : esc(label));
    return `\u0002${links.length - 1}\u0002`;
  }))
    .replace(BOLD, '<strong>$1</strong>')
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/~~(.+?)~~/gs, '<s>$1</s>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>'); // the stars left after bold are italic
  return marked.replace(/\u0002(\d+)\u0002/g, (_, i) => links[Number(i)]);
}
/** Text items: like rich(), plus lists. Lines starting with "- " or "• " become bullets, "1. " numbers. */
export function richBlock(text: string): string {
  const out: string[] = [];
  let para: string[] = [], list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => { if (para.length) out.push(`<span class="text-para">${rich(para.join('\n'))}</span>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${rich(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-•]\s+(.*)$/), number = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const tag = bullet ? 'ul' : number ? 'ol' : null;
    if (tag) { flushPara(); if (list && list.tag !== tag) flushList(); list ??= { tag, items: [] }; list.items.push((bullet ?? number)![1]); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return out.join('');
}
/** The same text without the marks, for places that can't show them (search results, link previews). */
export const plain = (text: string) => text.replace(LINK, '$1').replace(/\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*/gs, (_, a, b, c, d) => a ?? b ?? c ?? d);

/** One renderer for the public page and the editor's live preview.
 * The public page is a single static file: it embeds its own config, so the editor can reopen it,
 * and leaves scheduled links in place for SCHEDULE_SCRIPT to show or hide at visit time. */
export function renderPage(cfg: Config, { now = Date.now(), preview = false, openMenus = [] }: Opts = {}): string {
  const photo = safeImg(cfg.profile.photo);
  const backgroundImage = cfg.profile.showCover !== false && safeImg(cfg.profile.cover) || photo;
  const photoBg = cfg.look.background === 'photo' && backgroundImage;
  const expired = (l: Link) => !!l.expireAt && now >= Date.parse(l.expireAt);
  const shown = (l: Link) => (preview ? isVisible(l, now) : !l.hidden && !expired(l));
  const attrs = (l: Link) => preview ? `href="${esc(safeUrl(l.url) || '#')}"`
    : `href="${esc(safeUrl(l.url) || '#')}" rel="noopener"${l.publishAt ? ` data-show-from="${esc(l.publishAt)}"` : ''}${l.expireAt ? ` data-show-until="${esc(l.expireAt)}"` : ''}`;
  const blocks: string[] = [];
  let run: { link: Link | null; block: PageBlock }[] = [];
  const flush = () => { if (run.length) blocks.push(linkList(run, attrs, cfg.look.template === 'gallery')); run = []; };
  for (const block of cfg.blocks) {
    if (block.hidden) continue;
    // Empty space keeps its place, also between links (so a row of tiles keeps its shape).
    if (block.type === 'space') {
      if (run.length) run.push({ link: null, block }); else blocks.push(spaceBlock(block));
      continue;
    }
    if (block.type === 'link') {
      const link = cfg.links.find((l) => l.id === block.linkId);
      if (link && shown(link)) run.push({ link, block });
      continue;
    }
    flush();
    const data = blockAttributes(block, cfg);
    if (block.type === 'name') blocks.push(`<section class="name-block" ${data}>${identity(cfg)}</section>`);
    if (block.type === 'profile') blocks.push(`<section class="profile-block${photo ? '' : ' no-photo'}${cfg.profile.showCover !== false && (cfg.look.template === 'cover' || safeImg(cfg.profile.cover)) ? ' has-cover' : ''}${cfg.profile.showCover !== false && safeImg(cfg.profile.cover) && ['photo', 'studio'].includes(cfg.look.template) ? ' has-independent-cover' : ''}" ${data}>${hero(cfg, photo)}</section>`);
    if (block.type === 'bio' && cfg.profile.bio) blocks.push(bio(cfg, data));
    if (block.type === 'highlights') blocks.push(highlights(cfg, data + (block.part ? ' data-part' : ''), block.part));
    if (block.type === 'social') blocks.push(social(cfg, data + (block.vertical ? ' data-vertical' : '') + (block.part ? ' data-part' : '') + (block.iconStyle ? ` data-icon-style="${esc(block.iconStyle)}"` : '') + (block.iconColor ? ' data-icon-color' : ''), block.part, block.iconColor));
    if (block.type === 'text' && block.title?.trim()) blocks.push(textBlock(block, data));
    if (block.type === 'credentials') blocks.push(credentials(block, data));
    if (block.type === 'shape') blocks.push(`<div class="deco"${block.deco?.motion ? ` data-motion="${esc(block.deco.motion)}"` : ''} ${data}>${shapeSvg(block.deco ?? {}, block.id)}</div>`);
    if (block.type === 'youtube') blocks.push(video(block, data));
    if (block.type === 'image') blocks.push(imageBlock(block, data));
    if (block.type === 'post') blocks.push(postCard(block, data));
    if (block.type === 'voice' && safeAudio(block.audio)) blocks.push(voiceBlock(block, data));
    if (block.type === 'file' && safeFile(block.file)) blocks.push(fileCard(block, data, preview));
    if (block.type === 'menu') blocks.push(linkMenu(block, data, block.open || openMenus.includes(block.id)));
  }
  flush();
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${themeColorMeta(cfg.look)}
<title>${esc(cfg.profile.name)}</title>
<meta name="description" content="${esc(plain(cfg.profile.bio))}">
<meta property="og:title" content="${esc(cfg.profile.name)}"><meta property="og:description" content="${esc(plain(cfg.profile.bio))}">
<meta property="og:type" content="website"><meta property="og:url" content="${PAGE_URL}">
${photo.startsWith('https:') ? `<meta property="og:image" content="${esc(photo)}">`
  : backgroundImage ? `<meta property="og:image" content="${PAGE_URL}${SHARE_IMAGE}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="favicon.ico" sizes="32x32"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="apple-touch-icon.png">
${fontLink([cfg.look.font, ...cfg.blocks.filter((b) => !b.hidden).map((b) => b.font)])}
<style>${css}${lookColors(cfg.look)}</style>
</head><body class="template-${cfg.look.template}${preview ? '' : ' intro'}"${typeof cfg.look.margin === 'number' ? ' data-margin' : ''} style="${esc(lookVars(cfg.look))}">
<div class="backdrop">${photoBg ? `<img src="${esc(backgroundImage)}" alt="">` : ''}</div>
<main class="page">
<button class="share glass" aria-label="Share">${icon('share', 18)}</button>
${cfg.look.music || cfg.look.disco ? `<div class="page-tools" data-pos="${esc(cfg.look.tools ?? 'top')}">${cfg.look.music ? `<button class="music glass" type="button" data-music="${esc(cfg.look.music)}" aria-pressed="false" aria-label="Play music" title="Music">${icon('music', 17)}</button>` : ''}${cfg.look.disco ? `<button class="disco-btn glass" type="button" aria-pressed="false" aria-label="Disco mode" title="Disco mode">${icon('disco', 18)}</button>` : ''}</div>` : ''}
${cfg.look.disco ? `<div class="disco-lights" aria-hidden="true"><i></i><i></i><i></i><span class="disco-ball"></span></div>` : ''}
<div class="stack">${blocks.join('\n')}</div>
</main>
${preview ? '' : INTRO_SCRIPT}
${revealScript(cfg.look.reveal, cfg.look.revealDuration, cfg.look.revealRepeat, preview)}
${MEDIA_SCRIPT}
${FIT_SCRIPT}
${FLOAT_SCRIPT}
${cfg.look.music || cfg.look.disco || cfg.blocks.some((b) => b.type === 'voice' && !b.hidden) ? AUDIO_SCRIPT : ''}
${cfg.blocks.some((b) => b.type === 'voice' && !b.hidden && safeAudio(b.audio)) ? VOICE_SCRIPT : ''}
${cfg.blocks.some((b) => b.type === 'file' && !b.hidden && safeFile(b.file)?.startsWith('data:')) ? FILE_SCRIPT : ''}
${cfg.blocks.some((b) => b.type === 'menu' && !b.hidden) ? MENU_SCRIPT : ''}
${cfg.look.music || cfg.look.disco ? MUSIC_SCRIPT : ''}
${cfg.look.disco ? DISCO_SCRIPT : ''}
${preview ? PREVIEW_SCRIPT
  : `${SCHEDULE_SCRIPT}${SHARE_SCRIPT}${cfg.stats ? statsScript(cfg.stats) : ''}\n<script type="application/json" id="${CONFIG_ID}">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>`}
</body></html>`;
}

function blockAttributes(block: PageBlock, cfg?: Config): string {
  const design = normalizeBlockDesign(block.design);
  const styles = [designStyle(design)];
  let extra = '';
  if (block.reveal && REVEAL_EFFECTS.includes(block.reveal)) extra += ` data-reveal="${block.reveal}"`;
  if (typeof block.revealDelay === 'number') extra += ` data-reveal-delay="${Math.round(bounded(block.revealDelay, 0, 1000) ?? 0)}"`;
  if (block.font && FONTS[block.font]) { styles.push(`--block-font:${FONTS[block.font]}`); extra += ' data-font'; }
  const scale = bounded(block.textScale, .5, 8), offset = bounded(block.offset, -80, 120);
  if (scale && scale !== 1) { styles.push(`--text-scale:${scale}`); extra += ' data-text-scale'; }
  if (offset) { styles.push(`--offset:${Math.round(offset)}px`); extra += ' data-offset'; }
  const inset = bounded(block.inset, 0, 80);
  if (inset) { styles.push(`--inset:${Math.round(inset)}px`); extra += ' data-inset'; }
  const pad = bounded(block.pad, 0, 40);
  if (pad !== undefined) { styles.push(`--pad:${Math.round(pad)}px`); extra += ' data-pad'; }
  const lh = bounded(block.lineHeight, .6, 2.5);
  if (lh) { styles.push(`--lh:${Math.round(lh * 100) / 100}`); extra += ' data-lh'; }
  const ws = bounded(block.wordSpacing, -.3, 1.5);
  if (ws) { styles.push(`--ws:${Math.round(ws * 100) / 100}em`); extra += ' data-ws'; }
  if (block.weight && [300, 400, 500, 600, 700].includes(block.weight)) { styles.push(`--wt:${block.weight}`); extra += ' data-weight'; }
  if (block.textColor && /^#[0-9a-f]{6}$/i.test(block.textColor)) { styles.push(`--tc:${block.textColor}`); extra += ' data-tc'; }
  if (typeof block.z === 'number') { styles.push(`--z:${Math.round(block.z)}`); extra += ' data-z'; }
  const height = bounded(block.height, 24, 900);
  if (height) { styles.push(`--h:${Math.round(height)}px`); extra += ' data-height'; }
  const dx = bounded(block.dx, -600, 600), dy = bounded(block.dy, -1200, 1200);
  if (dx || dy) { styles.push(`--dx:${Math.round(dx ?? 0)}px;--dy:${Math.round(dy ?? 0)}px`); extra += ' data-free'; }
  if (block.float) { styles.push(`--fx:${+block.float.x.toFixed(2)}%;--fy:${+block.float.y.toFixed(2)}px;--fw:${+block.float.w.toFixed(2)}%`); extra += ' data-float'; if (block.float.a) extra += ` data-anchor="${esc(block.float.a)}"${block.float.s ? ' data-sticker' : ''}${block.float.p ? ` data-p="${Math.round(block.float.p)}"` : ''}`; }
  const turn = bounded(block.rotate, -180, 180);
  if (turn) { styles.push(`--rot:${Math.round(turn * 10) / 10}deg`); extra += ' data-rotate'; }
  if (block.cardStyle) extra += ` data-card="${esc(block.cardStyle)}"`;
  if (block.type === 'profile' && cfg) {
    const size = bounded(cfg.profile.photoSize, 48, 180);
    const height = bounded(cfg.profile.coverHeight, 100, 540);
    if (size) { styles.push(`--avatar-size:${size}px`); extra += ' data-avatar-custom';
    }
    if (height) { styles.push(`--cover-height:${height}px`); extra += ' data-cover-custom'; }
  }
  const tier = design ? sizeTier(design.span) : '';
  return `data-block-id="${esc(block.id)}"${design ? ` data-layout-span="${design.span}"` : ''}${tier ? ` data-size="${tier}"` : ''}${styles.some(Boolean) ? ` style="${esc(styles.filter(Boolean).join(';'))}"` : ''}${extra}`;
}

function hero(cfg: Config, photo: string): string {
  const { name } = cfg.profile;
  const initial = esc((name.trim()[0] ?? '?').toUpperCase());
  const avatarLayout = !['photo', 'studio'].includes(cfg.look.template);
  const banner = cfg.profile.showCover !== false ? safeImg(cfg.profile.cover) : '';
  const avatar = `<div class="avatar glass" data-profile-part="photo">${photo ? `<img src="${esc(photo)}" alt="${esc(name)}" style="${esc(imageFrameStyle(cfg.profile.photoFrame))}">` : initial}</div>`;
  let picture = '';
  if (avatarLayout) {
    const showBanner = cfg.profile.showCover !== false && (cfg.look.template === 'cover' || banner);
    picture = (showBanner ? `<div class="profile-cover" data-profile-part="cover">${banner ? `<img src="${esc(banner)}" alt="" style="${esc(imageFrameStyle(cfg.profile.coverFrame))}">` : ''}</div>` : '') + avatar;
  } else {
    const image = banner || photo;
    const frame = esc(imageFrameStyle(banner ? cfg.profile.coverFrame : cfg.profile.photoFrame));
    picture = image ? `<div class="hero" data-profile-part="${banner ? 'cover' : 'photo'}"><div class="hero-image-frame"><img src="${esc(image)}" alt="${esc(name)}" style="${frame}"><div class="hero-soften" aria-hidden="true"><img src="${esc(image)}" alt="" style="${frame}"></div></div></div>` : avatar;
    if (banner) picture += avatar;
  }
  return cfg.blocks.some((b) => b.type === 'name') ? picture : picture + identity(cfg);
}

/** Name and username: inside the profile, or as their own block when moved apart. */
function identity(cfg: Config): string {
  const { name, handle, nameAlign } = cfg.profile;
  return `<header class="identity" data-profile-part="name"${nameAlign ? ` data-align="${nameAlign}"` : ''}><h1>${esc(name)}</h1>${handle ? `<p class="handle">@${esc(handle.replace(/^@/, ''))}</p>` : ''}</header>`;
}

/** A short bio reads as a subtitle under the name; only longer text gets its own card. */
export const isShortBio = (text: string) => text.trim().length <= 90 && !text.includes('\n');

function bio(cfg: Config, data: string): string {
  if (isShortBio(cfg.profile.bio)) return `<p class="bio tagline"${cfg.profile.nameAlign ? ` data-align="${esc(cfg.profile.nameAlign)}"` : ''} ${data}><span class="fit">${rich(cfg.profile.bio.trim())}</span></p>`;
  return cfg.look.template === 'minimal'
    ? `<section class="bio glass" ${data}><h2>About me</h2><p>${rich(cfg.profile.bio)}</p></section>`
    : `<p class="bio glass" ${data}><span class="fit">${rich(cfg.profile.bio)}</span></p>`;
}

/** A free text item: a title, subtitle, paragraph or small label. Line breaks are kept. */
function textBlock(block: PageBlock, data: string): string {
  const style = block.textStyle ?? 'body';
  const heading = style === 'title' ? ' role="heading" aria-level="2"' : style === 'subtitle' ? ' role="heading" aria-level="3"' : '';
  return `<div class="text-block text-${style}"${heading}${block.textAlign ? ` data-align="${block.textAlign}"` : ''}${block.vAlign ? ` data-valign="${block.vAlign}"` : ''} ${data}><div class="fit">${richBlock(block.title!.trim())}</div></div>`;
}

/** Degrees, certificates, awards and roles: a list, small cards, or a timeline. */
function credentials(block: PageBlock, data: string): string {
  const entries = (block.entries ?? []).filter((e) => e.title.trim() || e.org.trim());
  if (!entries.length) return '';
  const variant = block.variant ?? 'list';
  const items = entries.map((e) => {
    const kind = CREDENTIAL_KINDS.find((k) => k.value === e.kind) ?? CREDENTIAL_KINDS[0];
    // The icon stays underneath the logo: if a pasted logo address stops working, the icon shows instead of a broken image.
    const badge = `<span class="cred-badge cred-${kind.value}">${icon(kind.icon, variant === 'cards' ? 22 : 20)}${safeImg(e.logo) ? `<img src="${esc(safeImg(e.logo))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"${e.logoFrame ? ` style="${esc(imageFrameStyle(e.logoFrame))};padding:0"` : ''}>` : ''}</span>`;
    const url = safeUrl(e.url ?? '');
    const copy = `<span class="cred-copy"><b>${rich(e.title)}</b>${e.org ? `<span>${esc(e.org)}</span>` : ''}</span>`;
    const year = e.year ? `<time>${esc(e.year)}</time>` : '';
    const inner = variant === 'timeline' ? `${year}<span class="cred-dot" aria-hidden="true"></span>${badge}${copy}` : variant === 'cards' ? `${badge}${copy}${year}` : `${badge}${copy}${year}`;
    return url ? `<li><a class="cred" href="${esc(url)}" rel="noopener">${inner}</a></li>` : `<li><div class="cred">${inner}</div></li>`;
  }).join('');
  return `<section class="creds${variant === 'cards' ? '' : ' glass'}" data-variant="${variant}" ${data}>${block.title ? `<h2 class="creds-h">${esc(block.title)}</h2>` : ''}<ul>${items}</ul></section>`;
}

function highlights(cfg: Config, data: string, part?: string): string {
  const items = cfg.highlights.filter((h, i) => (h.value || h.label) && (part === undefined || String(i) === part));
  return items.length ? `<div class="stats" ${data}>${items.map((h) => `<div><b>${esc(h.value)}</b><span>${esc(h.label)}</span></div>`).join('')}</div>` : '';
}

function social(cfg: Config, data: string, part?: string, color?: string): string {
  const items = cfg.social.map((s, i) => ({ ...s, id: socialKey(s, i) })).filter((s) => safeUrl(s.url) && (part === undefined || s.id === part));
  if (!items.length) return '';
  return `<nav class="social" aria-label="Social profiles" ${data}>${items.map((s) => {
    const p = platform(s.platform);
    // Logos load black and turn white on dark pages, unless the person chose brand colors or a color of their own.
    const tint = color === 'brand' ? '' : color ? '/' + color.slice(1) : '/111111';
    const glyph = p?.slug ? `<img src="https://cdn.simpleicons.org/${p.slug}${tint}" alt="">` : icon(p?.icon ?? 'link', 22);
    return `<a class="glass" data-social-id="${esc(s.id)}" href="${esc(safeUrl(s.url))}" aria-label="${esc(p?.label ?? s.platform)}" rel="noopener"${color && color !== 'brand' ? ` style="color:${esc(color)}"` : ''}>${glyph}</a>`;
  }).join('')}</nav>`;
}

/** Consecutive image links share a grid; every item keeps its chosen position. */
/** A voice message: play button, waveform (fills as it plays) and its length. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function voiceBlock(block: PageBlock, data: string) {
  const peaks = block.peaks?.length ? block.peaks : Array.from({ length: 40 }, (_, i) => .35 + .3 * Math.abs(Math.sin(i * 1.7)));
  return `<div class="voice" ${data}><button class="voice-play" type="button" aria-label="Play voice message">${icon('play', 18)}${icon('pause', 18)}<svg class="voice-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="18" pathLength="100"/><circle class="done" cx="20" cy="20" r="18" pathLength="100"/></svg></button>`
    + `<div class="voice-body">${block.title?.trim() ? `<span class="voice-title">${esc(block.title)}</span>` : ''}`
    + `<div class="voice-wave" aria-hidden="true">${peaks.map((p) => `<i style="height:${Math.round(12 + p * 88)}%"></i>`).join('')}</div></div>`
    + `<span class="voice-time">${block.duration ? clock(block.duration) : ''}</span><audio preload="metadata" playsinline src="${esc(block.audio)}"></audio></div>`;
}
/** A PDF card: tapping it opens the PDF in the visitor's viewer. An uploaded PDF is read from the page's own config
 * (so it isn't stored twice); in the editor's preview, where there is no config, it rides on the card. */
const fileSizeLabel = (n?: number) => !n ? '' : n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} KB` : `${(n / 1e6).toFixed(1)} MB`;
function fileCard(block: PageBlock, data: string, preview: boolean) {
  const src = safeFile(block.file), embedded = src.startsWith('data:');
  const meta = ['PDF', fileSizeLabel(block.fileSize)].filter(Boolean).join(' · ');
  return `<a class="file-card" href="${embedded ? '#' : esc(src)}"${embedded ? ` data-file-id="${esc(block.id)}"${preview ? ` data-src="${esc(src)}"` : ''}` : ' target="_blank" rel="noopener"'} ${data}>`
    + `<span class="file-icon">${icon('doc', 22)}<b>PDF</b></span><span class="file-text"><span class="file-title">${esc(block.title?.trim() || block.fileName || 'Document')}</span><span class="file-meta">${esc(meta)}</span></span>`
    + `<span class="file-open">Open ${icon('arrow', 14)}</span></a>`;
}
/** A Link Menu: a button that opens down into its links (like a folder of links: Videos, Projects, Shop…).
 * Menus share a name, so opening one closes the others and the page stays short. */
function linkMenu(block: PageBlock, data: string, open: boolean) {
  const items = (block.items ?? []).filter((e) => e.title.trim() && safeUrl(e.url));
  const title = block.title?.trim() || 'More links';
  return `<details class="link-menu" name="yourlinki-menu"${open ? ' open' : ''} ${data}>`
    + `<summary class="row-link glass menu-toggle"><span>${esc(title)}</span><i class="menu-chevron">${icon('down', 18)}</i></summary>`
    + `<div class="menu-links">${items.length ? items.map((e, i) => { const thumb = youtubeCover(e.url, e.image); return `<a class="row-link glass${thumb ? ' has-thumb' : ''}" href="${esc(safeUrl(e.url))}" rel="noopener" data-stat="go:${esc(e.id)}" style="--n:${Math.min(i, 12)}">${thumb ? `<img class="menu-thumb" src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${esc(e.title)}</span>${icon('arrow', 16)}</a>`; }).join('')
      : '<p class="menu-empty">No links yet</p>'}</div></details>`;
}
const spaceBlock = (block: PageBlock) => `<div class="space" aria-hidden="true" ${blockAttributes(block)}></div>`;

function linkList(items: { link: Link | null; block: PageBlock }[], attrs: (l: Link) => string, photoBands = false): string {
  const runs: { style: string; items: typeof items }[] = [];
  for (const item of items) {
    if (!item.link) { (runs.at(-1)?.items ?? (runs[runs.push({ style: 'rows', items: [] }) - 1].items)).push(item); continue; }
    const style = photoBands && safeImg(item.link.image) ? 'tiles' : item.link.featured ? 'featured' : safeImg(item.link.image) ? 'tiles' : 'rows';
    const last = runs.at(-1);
    if (last && last.style === style) last.items.push(item);
    else runs.push({ style, items: [item] });
  }
  return runs.map((run) => `<div class="${run.style === 'tiles' ? 'tiles' : 'rows'}">${run.items.map(({ link: l, block }) => {
    if (!l) return spaceBlock(block);
    const data = blockAttributes(block);
    const shape = normalizeButtonShape(l.buttonShape);
    const fill = normalizeButtonStyle(l.buttonStyle);
    const shapeAttr = (shape ? ` data-button-shape="${shape}"` : '') + (fill ? ` data-button-style="${fill}"` : '');
    if (run.style === 'featured') return `<a class="primary" ${attrs(l)} ${data}${shapeAttr}><span>${esc(l.title)}</span></a>`;
    if (run.style === 'tiles') return `<a class="tile" ${attrs(l)} ${data}${tileAttributes(l.tile)} aria-label="${esc(l.title)}"><div class="tile-media"><img src="${esc(safeImg(l.image))}" alt="" loading="lazy" style="${esc(imageFrameStyle(l.imageFrame))}"></div><span${tileTextStyle(l.tile)}>${esc(l.title)}</span></a>`;
    return `<a class="row-link glass" ${attrs(l)} ${data}${shapeAttr}><span>${esc(l.title)}</span>${icon('arrow', 18)}</a>`;
  }).join('')}</div>`).join('');
}

function video(block: PageBlock, data: string): string {
  const parsed = youtubeVideo(block.url ?? '');
  if (!parsed) return '';
  const title = block.title || 'Watch my latest video';
  return `<figure class="media-card video-card glass" ${data}>
<div class="video-player" style="--video-aspect:${videoRatio(block.videoAspect)}"><button class="video-poster" type="button" data-youtube="${parsed.id}" data-start="${parsed.start}" data-title="${esc(title)}" aria-label="Play ${esc(title)}">
<img src="${esc(youtubeCover(block.url ?? '', block.image))}" alt="" loading="lazy" style="${esc(imageFrameStyle(block.imageFrame))}"><span class="play-button">${icon('play', 28)}</span><span class="video-label">Play video</span>
</button></div>
<figcaption class="video-copy"><span class="media-kicker">YouTube video</span><h2>${esc(title)}</h2>
<a class="watch-youtube" href="https://www.youtube.com/watch?v=${parsed.id}${parsed.start ? '&amp;t=' + parsed.start : ''}" target="_blank" rel="noopener">Watch on YouTube ${icon('arrow', 12)}</a></figcaption>
</figure>`;
}

function postCard(block: PageBlock, data: string): string {
  const url = postUrl(block.url ?? '');
  if (!url) return '';
  const cover = safeImg(block.image);
  const source = postSource(url);
  return `<a class="post-card glass" href="${esc(url)}" rel="noopener" ${data}>
${cover ? `<div class="post-cover"><img src="${esc(cover)}" alt="" loading="lazy" style="${esc(imageFrameStyle(block.imageFrame))}"></div>` : ''}
<div class="post-copy"><span class="media-kicker">${esc(source)}</span><h2>${esc(block.title || 'Read my latest post')}</h2>
${block.description ? `<p>${esc(block.description)}</p>` : ''}
<span class="post-open">Read post ${icon('arrow', 15)}</span></div></a>`;
}

function imageBlock(block: PageBlock, data: string): string {
  const image = safeImg(block.image);
  if (!image) return '';
  const picture = `<div class="standalone-frame"><img class="standalone-image" src="${esc(image)}" alt="${esc(block.title)}" loading="lazy" style="${esc(imageFrameStyle(block.imageFrame))}"></div>`;
  const url = safeUrl(block.url ?? '');
  return `<figure class="media-card image-card glass" ${data}>${url ? `<a href="${esc(url)}" rel="noopener">${picture}</a>` : picture}${block.title ? `<figcaption>${esc(block.title)}</figcaption>` : ''}</figure>`;
}

const MEDIA_SCRIPT = `<script>
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-youtube]');
  if (!button) return;
  const frame = document.createElement('iframe');
  frame.src = 'https://www.youtube-nocookie.com/embed/' + button.dataset.youtube + '?autoplay=1&playsinline=1&start=' + button.dataset.start;
  frame.title = button.dataset.title;
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  button.replaceWith(frame);
});
</script>`;

/** Text in an item that was stretched to a set height shrinks until it fits inside (never grows past its chosen size).
 * The layout editor calls window.yourlinkiFit() while stretching. */
const FIT_SCRIPT = `<script>
window.yourlinkiFit = () => document.querySelectorAll('.stack [data-height]').forEach((el) => {
  el.style.removeProperty('--fit');
  for (let s = 1; el.scrollHeight > el.clientHeight + 1 && s > .4; ) { s = Math.round((s - .05) * 100) / 100; el.style.setProperty('--fit', s); }
});
window.yourlinkiFit();
addEventListener('load', window.yourlinkiFit);
addEventListener('resize', window.yourlinkiFit);
</script>`;

/** Freely placed items sit outside the layout, so the page is made tall enough to show the lowest one. */
const FLOAT_SCRIPT = `<script>
window.yourlinkiFloat = () => {
  const measure = () => {
  const stack = document.querySelector('.stack'); if (!stack) return;
  stack.style.minHeight = '';
  // A free item placed on another item (its anchor) keeps its spot on it: x and width are shares of the anchor's width,
  // y is measured from the anchor's top. So it follows the anchor when a template, the screen or the content changes.
  const box = stack.getBoundingClientRect();
  stack.querySelectorAll('[data-float][data-anchor]').forEach((el) => {
    const [id, part] = el.dataset.anchor.split('#');
    let a = stack.querySelector('[data-block-id="' + CSS.escape(id) + '"]');
    if (a && part) a = a.querySelector('[data-profile-part="' + part + '"]');
    const s = getComputedStyle(el), num = (n) => parseFloat(s.getPropertyValue(n)) || 0;
    if (!a || !a.getClientRects().length) { el.style.left = el.style.top = el.style.width = ''; return; }
    const r = a.getBoundingClientRect(), fx = num('--fx'), fw = num('--fw');
    // Never much narrower than when it was placed; a wider item keeps its center on the same spot.
    // It may hang over the page's edge on purpose (the screen cuts it off there).
    const width = Math.max(fw / 100 * r.width, (Number(el.dataset.p) || 0) * .7);
    const center = r.left - box.left + (fx + fw / 2) / 100 * r.width;
    el.style.left = (center - width / 2) + 'px';
    el.style.top = (r.top - box.top + (el.hasAttribute('data-sticker') ? num('--fy') / 100 * r.height : num('--fy'))) + 'px';
    el.style.width = width + 'px';
  });
  let bottom = 0;
  stack.querySelectorAll('[data-float]').forEach((el) => { bottom = Math.max(bottom, el.offsetTop + el.offsetHeight); });
  if (bottom) stack.style.minHeight = bottom + 24 + 'px';
  };
  if (window.yourlinkiMeasure) window.yourlinkiMeasure(measure); else measure();
};
window.yourlinkiFloat();
addEventListener('load', window.yourlinkiFloat);
addEventListener('resize', window.yourlinkiFloat);
document.fonts && document.fonts.ready.then(window.yourlinkiFloat);
</script>`;

/** In the editor preview, links open in a new tab (the editor stays put); while editing the layout, a tap selects instead. */
const PREVIEW_SCRIPT = `<script>
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  event.preventDefault();
  const url = link.getAttribute('href');
  if (!document.documentElement.classList.contains('canvas-editing') && url && url !== '#') window.open(url, '_blank', 'noopener');
});
</script>`;

/** Items appear one after another when the page opens (the order of the page, top to bottom). */
const INTRO_SCRIPT = `<script>
document.querySelectorAll('.stack [data-block-id]').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 10)));
</script>`;

/** Link previews (WhatsApp, iMessage…) need full addresses. The page doesn't know its own address when it is made, so it
 * carries this marker and publishing fills it in (the worker, or the editor for a downloaded file). SHARE_IMAGE is
 * published next to the page: a 1200×630 picture made from the cover or photo, because previews can't read embedded images. */
export const PAGE_URL = '__YOURLINKI_PAGE__/';
export const SHARE_IMAGE = 'share.jpg';

/** Where the published page keeps its config for the editor. */
export const CONFIG_ID = 'yourlinki-config';

/** Scheduled links ship with the page and are removed outside their window, on the visitor's clock. */
const SCHEDULE_SCRIPT = `<script>
document.querySelectorAll('[data-show-from],[data-show-until]').forEach((el) => {
  const now = Date.now();
  if (now < Date.parse(el.dataset.showFrom || '') || now >= Date.parse(el.dataset.showUntil || '')) el.remove();
});
</script>`;

const SHARE_SCRIPT = `<script>
document.querySelector('.share').addEventListener('click', async () => {
  // The page's clean address (no ?src=… or #…), so the preview shows up wherever it is shared.
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  try {
    if (navigator.share) return await navigator.share({ title: document.title, text: document.title, url });
    await navigator.clipboard.writeText(url);
    const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: 'Link copied' });
    document.body.append(t); setTimeout(() => t.remove(), 1800);
  } catch {}
});
</script>`;

/** Only when the creator connected their own stats worker: one anonymous ping per visit and per tap, no cookies.
 * Links stay direct. The creator's own browser (it opened the editor) is skipped. `?src=story` on the link labels the source. */
/** Voice messages play and pause from their button; the waveform fills as it plays, and music (if on) turns down meanwhile. */
const VOICE_SCRIPT = `<script>
document.querySelectorAll('.voice').forEach((v) => {
  const audio = v.querySelector('audio'), button = v.querySelector('.voice-play'), bars = [...v.querySelectorAll('.voice-wave i')], time = v.querySelector('.voice-time');
  let blobUrl, pending = false;
  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const show = () => {
    const p = audio.duration && isFinite(audio.duration) ? audio.currentTime / audio.duration : 0;
    v.style.setProperty('--p', p.toFixed(3)); v.toggleAttribute('data-progress', p > 0); // the ring around the play button
    const seen = bars.filter((b) => b.offsetParent); // a narrow player shows only part of the waveform
    seen.forEach((b, i) => b.classList.toggle('on', i / seen.length < p));
    if (audio.duration && isFinite(audio.duration)) time.textContent = clock(audio.paused && !audio.currentTime ? audio.duration : audio.currentTime);
  };
  const state = (playing) => {
    v.classList.toggle('playing', playing); button.setAttribute('aria-label', playing ? 'Pause voice message' : 'Play voice message');
    window.yourlinkiMusicDuck && window.yourlinkiMusicDuck(!!document.querySelector('.voice.playing'));
  };
  const fallback = () => {
    audio.pause(); state(false); audio.controls = true; v.classList.add('audio-fallback');
    window.yourlinkiAudioNotice('Try the audio player below. If sound is still off, open this page in your browser.');
  };
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!audio.paused) { audio.pause(); return; }
    if (pending) return;
    let timeout;
    try {
      window.yourlinkiAudioSession();
      document.querySelectorAll('.voice audio').forEach((a) => a !== audio && a.pause());
      // A Blob URL avoids data-URL media loading failures in embedded browsers.
      if (!blobUrl && audio.getAttribute('src').startsWith('data:')) {
        const src = audio.getAttribute('src'), binary = atob(src.split(',')[1]);
        blobUrl = URL.createObjectURL(new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], { type: src.slice(5, src.indexOf(';')) }));
        audio.src = blobUrl; audio.load();
      }
      audio.muted = false; audio.volume = 1;
      const play = audio.play(); // keep this call inside the original tap, before any await
      pending = true; button.setAttribute('aria-busy', 'true');
      await Promise.race([play, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Audio did not start')), 6000); })]);
    } catch { fallback(); }
    finally { clearTimeout(timeout); pending = false; button.removeAttribute('aria-busy'); }
  });
  audio.addEventListener('playing', () => state(true)); audio.addEventListener('pause', () => state(false));
  audio.addEventListener('ended', () => { audio.currentTime = 0; state(false); show(); });
  audio.addEventListener('timeupdate', show); audio.addEventListener('loadedmetadata', show);
});
</script>`;

/** Disco mode: a class on the page turns on the lights and the dancing, with its own club track (the ♪ music pauses). */
const DISCO_SCRIPT = `<script>
(() => {
  const button = document.querySelector('.disco-btn'), track = window.yourlinkiPlayer && window.yourlinkiPlayer('disco');
  const show = () => {
    const on = !!(track && track.on);
    document.documentElement.classList.toggle('disco', on);
    button.setAttribute('aria-pressed', String(on)); button.classList.toggle('on', on);
  };
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    if (track && track.on) { track.stop(); show(); return; }
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    try { window.yourlinkiMusicStop && window.yourlinkiMusicStop(); if (!track) throw new Error('Audio unavailable'); await track.start(); }
    catch { window.yourlinkiAudioNotice && window.yourlinkiAudioNotice(); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); show(); }
  });
  window.addEventListener('yourlinki-audiochange', show);
  window.yourlinkiDiscoOff = () => { if (track) track.stop(); show(); };
})();
</script>`;

/** Link Menus: while the layout is being edited a tap selects the menu instead of opening it; free items placed on the
 * page move along when a menu opens or closes. */
const MENU_SCRIPT = `<script>
document.addEventListener('click', (e) => {
  const toggle = e.target.closest && e.target.closest('.link-menu > summary');
  if (toggle && document.documentElement.classList.contains('canvas-editing')) e.preventDefault();
}, true);
document.addEventListener('toggle', (e) => {
  if (!e.target.classList || !e.target.classList.contains('link-menu')) return;
  const again = () => window.yourlinkiFloat && window.yourlinkiFloat();
  again(); setTimeout(again, 200); setTimeout(again, 450);
}, true);
</script>`;

/** Opens an uploaded PDF: the file becomes a temporary address the browser's PDF viewer can show. */
const FILE_SCRIPT = `<script>
document.addEventListener('click', (e) => {
  const card = e.target.closest && e.target.closest('.file-card[data-file-id]');
  if (!card || document.documentElement.classList.contains('canvas-editing')) return;
  e.preventDefault();
  let src = card.dataset.src;
  if (!src) { try { const cfg = JSON.parse(document.getElementById('yourlinki-config').textContent); src = (cfg.blocks.find((b) => b.id === card.dataset.fileId) || {}).file; } catch {} }
  if (!src) return;
  const bin = atob(src.split(',')[1]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  if (!window.open(url, '_blank')) location.href = url;
});
</script>`;

const statsScript = (endpoint: string) => `<script>
(() => {
  try { if (localStorage.getItem('yourlinki-owner')) return; } catch {}
  const url = ${JSON.stringify(endpoint + '/hit').replace(/</g, '\\u003c')};
  const s = new URLSearchParams(location.search).get('src') || '';
  const r = document.referrer;
  const send = (l) => { try { navigator.sendBeacon(url, JSON.stringify({ l, r, s })); } catch {} };
  send();
  document.addEventListener('click', (event) => {
    const el = event.target.closest('a[href], [data-youtube]');
    if (!el) return;
    const social = el.dataset.socialId;
    const block = el.closest('[data-block-id]');
    const id = el.dataset.stat ? el.dataset.stat : social ? 'social:' + social : el.dataset.youtube ? 'play:' + (block ? block.dataset.blockId : '') : block && block.dataset.blockId;
    if (id) send(id);
  }, true);
})();
</script>`;
