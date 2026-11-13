/** Edit sheets for a single link and a single social icon. */
import { PLATFORMS, platform } from '../../lib/platforms';
import { safeImg, safeUrl, withScheme, type Link, type Social, type PageBlock } from '../../lib/types';
import { youtubeVideo, youtubeCover, postUrl, postSource, videoRatio } from '../../lib/media';
import { state, changed } from './state';
import { pickImage } from './upload';
import { videoDetails } from '../../lib/video-details';
import { adjustImage } from './image-editor';
import { imageFrameStyle } from '../../lib/image-frame';
import { buttonShape, buttonStyle, usesButton } from '../../lib/button-shape';
import { shapePicker, stylePicker } from './shape-picker';
import { tileStylePicker } from './tile-style-picker';
import { h, group, navRow, inputRow, textareaRow, switchRow, dangerRow, sheet, svg, toast, segmented } from './ui';

const toLocal = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

/** Pastes an online image instead of uploading one. Uploaded images (data URLs) are not shown in the field. */
function imageUrlRow(current: string | null | undefined, set: (url: string | null) => void, redraw: () => void) {
  const row = inputRow('Image link', current?.startsWith('data:') ? '' : current ?? '', (v) => set(withScheme(v) || null), { type: 'url', placeholder: 'Paste an image address' });
  const input = row.querySelector('input')!;
  input.addEventListener('change', () => {
    if (input.value.trim() && !safeImg(withScheme(input.value))) { toast('Use the address of an image on a website (https)'); return; }
    redraw(); changed(true);
  });
  return row;
}

export function linkSheet(link: Link, isNew = false) {
  const links = state.cfg.links;
  const body = h('div');
  const adjustLinkImage = () => adjustImage({
    src: link.image!, frame: link.imageFrame, title: 'Adjust Link Image',
    aspect: state.cfg.look.template === 'gallery' ? 3.1 : state.cfg.links.filter((l) => l.image && !l.hidden).length === 1 ? 16 / 9 : 4 / 5,
    onChange: (frame) => { link.imageFrame = frame; changed(); },
    onFinish: () => { draw(); changed(true); },
  });
  const draw = () => body.replaceChildren(
    group({},
      inputRow('Title', link.title, (v) => { link.title = v; changed(); }, { placeholder: 'My website' }),
      inputRow('URL', link.url, (v) => { link.url = withScheme(v); changed(); }, { type: 'url', placeholder: 'yourwebsite.com' })),

    usesButton(link, state.cfg.look.template) ? group({ header: 'Button design', footer: 'Choose a shape and fill for this button. Other buttons keep their own design.' },
      h('div', { class: 'row stacked' }, shapePicker(buttonShape(link, state.cfg.look.template), (value) => { link.buttonShape = value; changed(); })),
      h('div', { class: 'row stacked' }, stylePicker(buttonStyle(link), (value) => { link.buttonStyle = value; changed(); })),
      navRow({ title: 'Use Template Design', onClick: () => { link.buttonShape = undefined; link.buttonStyle = undefined; changed(); draw(); } })) : document.createDocumentFragment(),

    group({ footer: 'With an image, the link shows as a photo tile. Upload one, or paste the address of an image that is online (for example a logo): it loads from that website.' },
      navRow({
        lead: link.image ? h('img', { src: link.image, alt: '' }) : svg('photo', 18),
        title: link.image ? 'Change Image' : 'Upload Image',
        onClick: async () => {
          try { const url = await pickImage(900); if (url) { link.image = url; link.imageFrame = undefined; changed(); draw(); adjustLinkImage(); } } catch (e: any) { toast(e.message); }
        },
      }),
      imageUrlRow(link.image, (url) => { link.image = url; link.imageFrame = undefined; changed(); }, draw),
      link.image ? navRow({ lead: svg('photo', 18), title: 'Adjust Image', onClick: adjustLinkImage }) : null,
      link.image ? dangerRow('Remove Image', () => { link.image = null; link.imageFrame = undefined; changed(); draw(); }) : null),

    link.image && !usesButton(link, state.cfg.look.template) ? group({ header: 'Image style' },
      h('div', { class: 'row stacked' }, tileStylePicker(link, state.cfg.look.template, (change, redraw) => { change(); changed(); if (redraw) draw(); }))) : document.createDocumentFragment(),

    group({ footer: 'Featured gives this link a bold button. Its position stays where you put it.' },
      switchRow('Featured', !!link.featured, (v) => { links.forEach((l) => (l.featured = false)); link.featured = v; changed(); }),
      switchRow('Show on page', !link.hidden, (v) => { link.hidden = !v; changed(); })),

    group({ footer: 'Show the link only between these dates.' },
      switchRow('Schedule', !!(link.publishAt || link.expireAt), (v) => {
        if (v) link.publishAt = new Date().toISOString();
        else { delete link.publishAt; delete link.expireAt; }
        changed(); draw();
      }),
      ...(link.publishAt || link.expireAt ? [
        inputRow('Starts', toLocal(link.publishAt), (v) => { link.publishAt = fromLocal(v); changed(); }, { type: 'datetime-local' }),
        inputRow('Ends', toLocal(link.expireAt), (v) => { link.expireAt = fromLocal(v); changed(); }, { type: 'datetime-local' }),
      ] : [])),

    group({}, dangerRow('Delete Link', () => {
      if (!confirm('Delete this link?')) return;
      links.splice(links.indexOf(link), 1);
      state.cfg.blocks = state.cfg.blocks.filter((b) => b.linkId !== link.id);
      close();
    })));

  draw();
  const close = sheet(isNew ? 'New Link' : 'Edit Link', () => [body], {
    onClose: () => {
      // A new link the user never filled in is dropped.
      if (isNew && links.includes(link) && !link.title.trim() && (!link.url || link.url === 'https://')) {
        links.splice(links.indexOf(link), 1);
        state.cfg.blocks = state.cfg.blocks.filter((b) => b.linkId !== link.id);
      }
      changed(true);
    },
  });
}

export function socialSheet(item: Social, isNew = false) {
  const list = state.cfg.social;
  const hint = h('p', { class: 'group-f' }, 'Choose the platform and paste the link visitors should open.');
  const select = h('select', { onchange: (e: any) => {
    const prev = platform(item.platform);
    item.platform = e.target.value;
    // Swap the URL prefix if the user has not typed past it yet.
    if (!item.url || item.url === prev?.prefix) { item.url = platform(item.platform)!.prefix; url.value = item.url; }
    url.placeholder = platform(item.platform)?.prefix ?? 'https://';
    hint.textContent = `Paste the link visitors should open for ${platform(item.platform)?.label ?? item.platform}.`;
    changed();
  } }, PLATFORMS.map((p) => h('option', { value: p.key, selected: p.key === item.platform }, p.label)));
  const urlRow = inputRow('URL', item.url, (v) => { item.url = withScheme(v); changed(); }, { type: 'url' });
  const url = urlRow.querySelector('input')!;

  const close = sheet(isNew ? 'New Social Icon' : 'Edit Social Icon', () => [
    group({}, h('label', { class: 'row field' }, h('span', { class: 'lbl' }, 'Platform'), select), urlRow), hint,
    group({}, dangerRow('Delete', () => { list.splice(list.indexOf(item), 1); close(); })),
  ], {
    onClose: () => {
      if (isNew && list.includes(item) && item.url === platform(item.platform)?.prefix) list.splice(list.indexOf(item), 1);
      changed(true);
    },
  });
}

/** Shared cover editing. An empty YouTube cover uses its automatic thumbnail. */
function coverControls(block: PageBlock, update: () => void, redraw: () => void, video = false) {
  const image = video ? youtubeCover(block.url ?? '', block.image) : safeImg(block.image);
  const adjustCover = () => adjustImage({
    src: video ? youtubeCover(block.url ?? '', block.image) : safeImg(block.image), frame: block.imageFrame,
    title: video ? 'Adjust Video Cover' : 'Adjust Image',
    aspect: video ? block.videoAspect === 'wide' ? 21 / 9 : block.videoAspect === 'square' ? 1 : 16 / 9 : block.type === 'post' ? 16 / 10 : undefined,
    onChange: (frame) => { block.imageFrame = frame; changed(); update(); },
    onFinish: () => { redraw(); changed(true); },
  });
  return group({ header: video ? 'Video cover' : block.type === 'image' ? 'Image' : 'Cover image', footer: video ? 'The YouTube cover is automatic. You can use your own image instead.' : block.type === 'image' ? 'Upload an image or paste its image URL.' : 'Upload a cover or paste its image URL. You can leave this empty for a text card.' },
    navRow({
      lead: image ? h('img', { src: image, alt: '' }) : svg('photo', 18),
      title: video ? 'Choose Custom Cover' : block.image ? 'Change Cover Image' : 'Choose Cover Image',
      onClick: async () => {
        try { const url = await pickImage(1400); if (url) { block.image = url; block.imageFrame = undefined; changed(); redraw(); adjustCover(); } } catch (e: any) { toast(e.message); }
      },
    }),
    navRow({ lead: svg('photo', 18), title: video ? 'Adjust Video Cover' : 'Adjust Image', onClick: adjustCover }),
    inputRow('Image URL', block.image ?? '', (v) => { block.image = withScheme(v); block.imageFrame = undefined; changed(); update(); }, { placeholder: video ? 'Automatic from YouTube' : 'https://…' }),
    block.image ? dangerRow(video ? 'Use YouTube Cover' : 'Remove Cover Image', () => { block.image = null; block.imageFrame = undefined; changed(); redraw(); }) : null);
}

/** The video cover is visible while editing, before the item is added to the page. */
export function mediaSheet(block: PageBlock, isNew = false) {
  const isVideo = block.type === 'youtube';
  let deleted = false;
  let alive = true;
  let metadataTimer: ReturnType<typeof setTimeout>;
  let metadataRequest: AbortController | undefined;
  let lastAutoTitle = '';
  const body = h('div');
  const feedback = h('p', { class: 'media-feedback', role: 'status' });
  const preview = h('div', { class: 'composer-preview' });
  let urlInput: HTMLInputElement;
  let titleInput: HTMLInputElement;

  function updatePreview() {
    const parsed = youtubeVideo(block.url ?? '');
    if (isVideo) {
      const cover = parsed ? youtubeCover(block.url ?? '', block.image) : '';
      preview.replaceChildren(
        cover ? h('div', { class: 'composer-cover', style: `aspect-ratio:${videoRatio(block.videoAspect)}` }, h('img', { src: cover, alt: 'YouTube video cover', style: imageFrameStyle(block.imageFrame) }), h('span', { class: 'composer-play', 'aria-hidden': 'true' }, svg('play', 24))) :
          h('div', { class: 'composer-empty' }, svg('play', 28), h('span', {}, 'Your video cover will appear here')),
        h('div', { class: 'composer-copy' }, h('small', {}, 'YOUTUBE VIDEO'), h('b', {}, block.title || 'Watch my latest video'), h('span', {}, 'Cover image + tap to play')));
      feedback.classList.toggle('invalid', !!block.url && !parsed);
      feedback.textContent = !block.url ? 'Paste a YouTube, Shorts, or youtu.be link to see its cover.' :
        parsed ? 'Cover ready. Visitors tap the play button to watch on your page.' : 'Use a link to a specific YouTube video.';
      urlInput?.setAttribute('aria-invalid', String(!!block.url && !parsed));
    }
  }

  function scheduleDetails() {
    clearTimeout(metadataTimer);
    metadataRequest?.abort();
    const parsed = youtubeVideo(block.url ?? '');
    if (!parsed) return;
    const requestedUrl = block.url;
    metadataTimer = setTimeout(async () => {
      const request = new AbortController();
      metadataRequest = request;
      try {
        const details = await videoDetails(requestedUrl ?? '', (input, init) => fetch(input, { ...init, signal: request.signal }));
        if (!details) throw new Error('Title unavailable');
        if (!alive || block.url !== requestedUrl || details.id !== parsed.id) return;
        if (!block.title || block.title === lastAutoTitle) {
          block.title = details.title;
          lastAutoTitle = details.title;
          titleInput.value = details.title;
          changed();
          updatePreview();
        }
      } catch {
        if (alive && block.url === requestedUrl && !request.signal.aborted) feedback.textContent = 'Cover ready. You can enter a title above.';
      }
    }, 350);
  }

  function draw() {
    const urlRow = inputRow(isVideo ? 'Video URL' : 'Link to', block.url ?? '', (v) => {
      block.url = withScheme(v); changed();
      if (isVideo) { updatePreview(); scheduleDetails(); }
    }, { type: 'url', placeholder: isVideo ? 'youtube.com/watch?v=…' : 'yourwebsite.com (optional)' });
    urlInput = urlRow.querySelector('input')!;
    const titleRow = inputRow(isVideo ? 'Title' : 'Caption', block.title ?? '', (v) => { block.title = v; changed(); updatePreview(); }, { max: 200, placeholder: isVideo ? 'Fetched from YouTube, or write your own' : 'A few words (optional)' });
    titleInput = titleRow.querySelector('input')!;
    body.replaceChildren(
      group({ footer: isVideo ? 'Paste a video link. Its cover appears automatically and its title is fetched when available.' : 'A separate image you can place anywhere on your page.' }, urlRow, titleRow),
      isVideo ? h('div', {}, preview, feedback) : document.createDocumentFragment(),
      isVideo ? group({ header: 'Preview shape', footer: 'Horizontal is the default. Wide makes a shorter banner; the video plays in its original ratio.' },
        h('div', { class: 'row stacked' }, segmented([{ value: 'landscape', label: '16:9' }, { value: 'wide', label: 'Wide' }, { value: 'square', label: 'Square' }], block.videoAspect ?? 'landscape', (value) => { block.videoAspect = value; changed(); updatePreview(); }))) : document.createDocumentFragment(),
      coverControls(block, updatePreview, draw, isVideo),
      group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
      group({}, dangerRow(isVideo ? 'Delete Video' : 'Delete Image', () => {
        if (!isNew && !confirm(isVideo ? 'Delete this video?' : 'Delete this image?')) return;
        deleted = true;
        state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id);
        close();
      })));
    updatePreview();
  }
  draw();
  const close = sheet(isNew ? (isVideo ? 'New YouTube Video' : 'New Image') : (isVideo ? 'Edit Video' : 'Edit Image'), () => [body], {
    canClose: () => {
      if (deleted) return true;
      if (isVideo && block.url && !youtubeVideo(block.url)) { toast('Enter a valid YouTube video URL, or clear the field.'); urlInput.focus(); return false; }
      if (block.image && !safeImg(block.image)) { toast('Use an HTTPS image URL or choose an image.'); return false; }
      if (!isVideo && block.url && !safeUrl(block.url)) { toast('That doesn’t look like a link. Try something like yourwebsite.com.'); urlInput.focus(); return false; }
      return true;
    },
    onClose: () => {
      alive = false;
      clearTimeout(metadataTimer);
      metadataRequest?.abort();
      if (isNew && !(isVideo ? youtubeVideo(block.url ?? '') : safeImg(block.image))) state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id);
      changed(true);
    },
  });
}

/** A selected post gets a cover, source, title and excerpt, without requiring an account connection. */
export function postSheet(block: PageBlock, isNew = false) {
  const body = h('div');
  const preview = h('div', { class: 'composer-preview post-composer' });
  let deleted = false;
  let urlInput: HTMLInputElement;
  function updatePreview() {
    const cover = safeImg(block.image);
    preview.replaceChildren(
      cover ? h('div', { class: 'composer-cover' }, h('img', { src: cover, alt: 'Post cover', style: imageFrameStyle(block.imageFrame) })) : document.createDocumentFragment(),
      h('div', { class: 'composer-copy' },
        h('small', {}, postSource(block.url ?? '')),
        h('b', {}, block.title || 'Read my latest post'),
        block.description ? h('p', {}, block.description) : null,
        h('span', { class: 'composer-link' }, 'Read post', svg('arrow', 14))));
    urlInput?.setAttribute('aria-invalid', String(!!block.url && !postUrl(block.url)));
  }
  function draw() {
    const urlRow = inputRow('Post URL', block.url ?? '', (v) => { block.url = withScheme(v); changed(); updatePreview(); }, { type: 'url', placeholder: 'Paste a link to a post or article' });
    urlInput = urlRow.querySelector('input')!;
    body.replaceChildren(
      group({ footer: 'Add a post link, then choose its title, excerpt and cover. The card opens the original post.' },
        urlRow,
        inputRow('Title', block.title ?? '', (v) => { block.title = v; changed(); updatePreview(); }, { max: 160, placeholder: 'My latest post' }),
        textareaRow(block.description ?? '', (v) => { block.description = v; changed(); updatePreview(); }, 'A short excerpt (optional)', 300)),
      preview,
      coverControls(block, updatePreview, draw),
      group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
      group({}, dangerRow('Delete Post Preview', () => {
        if (!isNew && !confirm('Delete this post preview?')) return;
        deleted = true;
        state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id);
        close();
      })));
    updatePreview();
  }
  draw();
  const close = sheet(isNew ? 'New Post Preview' : 'Edit Post Preview', () => [body], {
    canClose: () => {
      if (deleted) return true;
      if (block.url && !postUrl(block.url)) { toast('That doesn’t look like a post link. Paste the link to the post.'); urlInput.focus(); return false; }
      if (block.image && !safeImg(block.image)) { toast('Use an HTTPS cover image URL or choose an image.'); return false; }
      return true;
    },
    onClose: () => {
      if (isNew && !postUrl(block.url ?? '')) state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id);
      changed(true);
    },
  });
}
