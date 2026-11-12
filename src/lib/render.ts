import { lookVars, FONTS } from './look';
import { imageFrameStyle } from './image-frame';
import { normalizeButtonShape } from './button-shape';
import { tileAttributes, tileTextStyle } from './tile-style';
import { socialKey } from './social-order';
import { bounded, designStyle, normalizeBlockDesign, sizeTier } from './layout';
import { icon } from './icons';
import { platform } from './platforms';
import { youtubeVideo, youtubeCover, postUrl, postSource, videoRatio } from './media';
import { isVisible, safeUrl, safeImg, type Config, type Link, type PageBlock } from './types';
import css from './page.css?inline';

type Opts = { now?: number; preview?: boolean };
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** One renderer for the public page and the editor's live preview.
 * The public page is a single static file: it embeds its own config, so the editor can reopen it,
 * and leaves scheduled links in place for SCHEDULE_SCRIPT to show or hide at visit time. */
export function renderPage(cfg: Config, { now = Date.now(), preview = false }: Opts = {}): string {
  const photo = safeImg(cfg.profile.photo);
  const backgroundImage = cfg.profile.showCover !== false && safeImg(cfg.profile.cover) || photo;
  const photoBg = cfg.look.background === 'photo' && backgroundImage;
  const expired = (l: Link) => !!l.expireAt && now >= Date.parse(l.expireAt);
  const shown = (l: Link) => (preview ? isVisible(l, now) : !l.hidden && !expired(l));
  const attrs = (l: Link) => preview ? `href="${esc(safeUrl(l.url) || '#')}"`
    : `href="${esc(safeUrl(l.url) || '#')}" rel="noopener"${l.publishAt ? ` data-show-from="${esc(l.publishAt)}"` : ''}${l.expireAt ? ` data-show-until="${esc(l.expireAt)}"` : ''}`;
  const blocks: string[] = [];
  let run: { link: Link; block: PageBlock }[] = [];
  const flush = () => { if (run.length) blocks.push(linkList(run, attrs, cfg.look.template === 'gallery')); run = []; };
  for (const block of cfg.blocks) {
    if (block.hidden) continue;
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
    if (block.type === 'highlights') blocks.push(highlights(cfg, data));
    if (block.type === 'social') blocks.push(social(cfg, data));
    if (block.type === 'youtube') blocks.push(video(block, data));
    if (block.type === 'image') blocks.push(imageBlock(block, data));
    if (block.type === 'post') blocks.push(postCard(block, data));
  }
  flush();
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${cfg.look.mode === 'dark' ? '#000000' : '#f2f2f7'}">
<title>${esc(cfg.profile.name)}</title>
<meta name="description" content="${esc(cfg.profile.bio)}">
<meta property="og:title" content="${esc(cfg.profile.name)}"><meta property="og:description" content="${esc(cfg.profile.bio)}">
${photo.startsWith('https:') ? `<meta property="og:image" content="${esc(photo)}">` : ''}
<link rel="icon" href="favicon.ico" sizes="32x32"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>${css}</style>
</head><body class="template-${cfg.look.template}" style="${esc(lookVars(cfg.look))}">
<div class="backdrop">${photoBg ? `<img src="${esc(backgroundImage)}" alt="">` : ''}</div>
<main class="page">
<button class="share glass" aria-label="Share">${icon('share', 18)}</button>
<div class="stack">${blocks.join('\n')}</div>
</main>
${MEDIA_SCRIPT}
${preview ? PREVIEW_SCRIPT
  : `${SCHEDULE_SCRIPT}${SHARE_SCRIPT}${cfg.stats ? statsScript(cfg.stats) : ''}\n<script type="application/json" id="${CONFIG_ID}">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>`}
</body></html>`;
}

function blockAttributes(block: PageBlock, cfg?: Config): string {
  const design = normalizeBlockDesign(block.design);
  const styles = [designStyle(design)];
  let extra = '';
  if (block.font && FONTS[block.font]) { styles.push(`--block-font:${FONTS[block.font]}`); extra += ' data-font'; }
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

function bio(cfg: Config, data: string): string {
  return cfg.look.template === 'minimal'
    ? `<section class="bio glass" ${data}><h2>About me</h2><p>${esc(cfg.profile.bio)}</p></section>`
    : `<p class="bio glass" ${data}>${esc(cfg.profile.bio)}</p>`;
}

function highlights(cfg: Config, data: string): string {
  const items = cfg.highlights.filter((h) => h.value || h.label);
  return items.length ? `<div class="stats" ${data}>${items.map((h) => `<div><b>${esc(h.value)}</b><span>${esc(h.label)}</span></div>`).join('')}</div>` : '';
}

function social(cfg: Config, data: string): string {
  const items = cfg.social.map((s, i) => ({ ...s, id: socialKey(s, i) })).filter((s) => safeUrl(s.url));
  if (!items.length) return '';
  const color = cfg.look.mode === 'dark' ? 'ffffff' : '111111';
  return `<nav class="social" aria-label="Social profiles" ${data}>${items.map((s) => {
    const p = platform(s.platform);
    const glyph = p?.slug ? `<img src="https://cdn.simpleicons.org/${p.slug}/${color}" alt="">` : icon(p?.icon ?? 'link', 22);
    return `<a class="glass" data-social-id="${esc(s.id)}" href="${esc(safeUrl(s.url))}" aria-label="${esc(p?.label ?? s.platform)}" rel="noopener">${glyph}</a>`;
  }).join('')}</nav>`;
}

/** Consecutive image links share a grid; every item keeps its chosen position. */
function linkList(items: { link: Link; block: PageBlock }[], attrs: (l: Link) => string, photoBands = false): string {
  const runs: { style: string; items: typeof items }[] = [];
  for (const item of items) {
    const style = photoBands && safeImg(item.link.image) ? 'tiles' : item.link.featured ? 'featured' : safeImg(item.link.image) ? 'tiles' : 'rows';
    const last = runs.at(-1);
    if (last && last.style === style) last.items.push(item);
    else runs.push({ style, items: [item] });
  }
  return runs.map((run) => `<div class="${run.style === 'tiles' ? 'tiles' : 'rows'}">${run.items.map(({ link: l, block }) => {
    const data = blockAttributes(block);
    const shape = normalizeButtonShape(l.buttonShape);
    const shapeAttr = shape ? ` data-button-shape="${shape}"` : '';
    if (run.style === 'featured') return `<a class="primary" ${attrs(l)} ${data}${shapeAttr}>${esc(l.title)}</a>`;
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
  const url = location.href;
  try {
    if (navigator.share) return await navigator.share({ title: document.title, url });
    await navigator.clipboard.writeText(url);
    const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: 'Link copied' });
    document.body.append(t); setTimeout(() => t.remove(), 1800);
  } catch {}
});
</script>`;

/** Only when the creator connected their own stats worker: one anonymous ping per visit and per tap, no cookies.
 * Links stay direct. The creator's own browser (it opened the editor) is skipped. `?src=story` on the link labels the source. */
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
    const id = social ? 'social:' + social : el.dataset.youtube ? 'play:' + (block ? block.dataset.blockId : '') : block && block.dataset.blockId;
    if (id) send(id);
  }, true);
})();
</script>`;
