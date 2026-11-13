import { platform } from '../../lib/platforms';
import { MUSIC_STYLES, safeImg, withScheme, NAME_ALIGN, CREDENTIAL_KINDS, type Credential, type MenuItem, type PageBlock, type TextStyle } from '../../lib/types';
import { separateName, hasSeparateName } from '../../lib/layout';
import { imageFrameStyle } from '../../lib/image-frame';
import { moveSocial, socialKey } from '../../lib/social-order';
import { sortable } from './reorder';
import { socialGlyph } from './social-glyph';
import { state, changed, onChange, uid, placeBlock, addAt, openMenus, type AddAt } from './state';
import { pickImage } from './upload';
import { adjustImage } from './image-editor';
import { BOLD, LINK } from '../../lib/render';
import { MUSIC_LABELS, MUSIC_NOTES } from '../../lib/music';
import { SHAPES, SHAPE_COLORS, shapeSvg } from '../../lib/shapes';
import { linkSheet, socialSheet, mediaSheet, postSheet } from './sheets';
import { h, group, navRow, actionRow, inputRow, textareaRow, switchRow, segmented, sheet, svg, toast, dangerRow } from './ui';
import { itemAnimationGroup } from './animation-controls';
import { audioDetails } from '../../lib/audio-file';

export function editPageBlock(id: string) {
  const { cfg } = state;
  const block = cfg.blocks.find((b) => b.id === id);
  if (!block) return;
  if (block.type === 'link') { const link = cfg.links.find((l) => l.id === block.linkId); if (link) linkSheet(link); return; }
  if (block.type === 'youtube' || block.type === 'image') return mediaSheet(block);
  if (block.type === 'post') return postSheet(block);
  if (block.type === 'text') return textSheet(block);
  if (block.type === 'credentials') return credentialsSheet(block);
  if (block.type === 'shape') return shapeSheet(block);
  if (block.type === 'voice') return voiceSheet(block);
  if (block.type === 'file') return fileSheet(block);
  if (block.type === 'menu') return menuSheet(block);
  if (block.type === 'space') { if (confirm('Remove this empty space?')) { cfg.blocks = cfg.blocks.filter((b) => b.id !== id); changed(true); } return; }
  if (block.type === 'name') return editPageBlock(cfg.blocks.find((b) => b.type === 'profile')!.id); // the name is edited with the profile
  const titles: Record<string, string> = { profile: 'Profile', bio: 'Bio', social: 'Social Icons', highlights: 'Highlights' };
  const body = h('div');
  const build = () => h('div', {},
    block.type === 'profile' ? profileGroup() :
    block.type === 'bio' ? group({}, ...withFormatBar(textareaRow(cfg.profile.bio, (v) => { cfg.profile.bio = v; changed(); }, 'A few words about you'))) :
    block.type === 'social' ? socialGroup() : highlightsGroup(),
    itemAnimationGroup(block),
    group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })));
  body.append(build());
  const unsubscribe = onChange((redraw) => { if (redraw) body.replaceChildren(build()); });
  sheet(titles[block.type], () => [body], { onClose: () => { unsubscribe(); changed(true); } });
}

function sizeRow(label: string, value: number, min: number, max: number, set: (v: number) => void) {
  const output = h('output', {}, `${value}px`);
  return h('label', { class: 'row image-range' },
    h('span', { class: 'image-range-label' }, label, output),
    h('input', { type: 'range', min, max, step: 1, value, 'aria-label': label, oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value); output.textContent = `${v}px`; set(v); changed();
    } }));
}

function profileGroup() {
  const { cfg } = state, p = cfg.profile;
  const avatar = !['photo', 'studio'].includes(cfg.look.template) || (!!p.cover && p.showCover !== false);
  const adjustPhoto = () => adjustImage({
    src: p.photo!, frame: p.photoFrame, title: 'Adjust Photo or Logo',
    aspect: avatar ? cfg.look.template === 'bold' ? 3 / 4 : 1 : cfg.look.template === 'studio' ? 4 / 3 : 3 / 4,
    round: avatar,
    onChange: (frame) => { p.photoFrame = frame; changed(); }, onFinish: () => changed(true),
  });
  const adjustCover = () => adjustImage({
    src: p.cover!, frame: p.coverFrame, title: 'Adjust Cover Image',
    aspect: ['photo', 'studio'].includes(cfg.look.template) ? 4 / 3 : 2.5,
    onChange: (frame) => { p.coverFrame = frame; changed(); }, onFinish: () => changed(true),
  });
  const photoSize = p.photoSize ?? (cfg.look.template === 'minimal' ? 80 : cfg.look.template === 'gallery' ? 64 : cfg.look.template === 'bold' ? 112 : 100);
  const coverUrl = inputRow('Image URL', p.cover ?? '', (v) => { p.cover = withScheme(v) || null; p.coverFrame = undefined; p.showCover = true; changed(); }, { placeholder: 'Or paste a cover image URL' });
  coverUrl.addEventListener('change', () => changed(true));
  return h('div', {},
    group({ header: 'Profile photo or logo', footer: 'Your logo stays separate from the cover image.' },
      h('div', { class: 'row photo-row' },
        p.photo ? h('div', { class: 'photo' }, h('img', { src: p.photo, alt: '', style: imageFrameStyle(p.photoFrame) })) : h('div', { class: 'photo empty' }, svg('photo', 26)),
        h('div', { class: 'photo-actions' },
          h('button', { class: 'btn-text', type: 'button', onclick: async () => {
            try { const url = await pickImage(1400); if (url) { p.photo = url; p.photoFrame = undefined; changed(true); adjustPhoto(); } } catch (e: any) { toast(e.message); }
          } }, p.photo ? 'Change Photo or Logo' : 'Add Photo or Logo'),
          p.photo && h('button', { class: 'btn-text', type: 'button', onclick: adjustPhoto }, 'Adjust Photo or Logo'),
          p.photo && h('button', { class: 'btn-text red', type: 'button', onclick: () => { p.photo = null; p.photoFrame = undefined; changed(true); } }, 'Remove'))),
      avatar && sizeRow('Logo size', photoSize, 48, 180, (v) => { p.photoSize = v; }),
      inputRow('Name', p.name, (v) => { p.name = v; changed(); }, { max: 40, placeholder: 'Your name' }),
      inputRow('Username', p.handle, (v) => { p.handle = v.replace(/^@/, ''); changed(); }, { max: 30, prefix: '@', placeholder: 'username' }),
      h('div', { class: 'row stacked' }, h('span', { class: 'lbl' }, 'Name position'),
        segmented(NAME_ALIGN.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })), p.nameAlign ?? (cfg.look.template === 'studio' ? 'left' : 'center'), (value) => { p.nameAlign = value; changed(); })),
      switchRow('Move name separately', hasSeparateName(cfg), (v) => { separateName(cfg, v); changed(true); })),
    group({ header: 'Cover image', footer: 'Choose a different image to sit behind your logo. Each image has its own crop and zoom.' },
      navRow({
        lead: safeImg(p.cover) ? h('img', { src: safeImg(p.cover), alt: '' }) : svg('photo', 20),
        title: p.cover ? 'Change Cover Image' : 'Add Cover Image',
        subtitle: 'A separate banner or hero image',
        onClick: async () => {
          try { const url = await pickImage(1600); if (url) { p.cover = url; p.showCover = true; p.coverFrame = undefined; changed(true); adjustCover(); } } catch (e: any) { toast(e.message); }
        },
      }),
      coverUrl,
      p.cover && navRow({ title: 'Adjust Cover Image', lead: svg('photo', 18), onClick: adjustCover }),
      (p.cover || cfg.look.template === 'cover') && switchRow('Show cover', p.showCover !== false, (v) => { p.showCover = v; changed(); }),
      p.cover && sizeRow('Cover height', p.coverHeight ?? (['photo', 'studio'].includes(cfg.look.template) ? 340 : 184), 100, 540, (v) => { p.coverHeight = v; }),
      p.cover && h('button', { class: 'row danger', type: 'button', onclick: () => { p.cover = null; p.coverFrame = undefined; changed(true); } }, 'Remove Cover Image')));
}

function socialGroup() {
  const list = state.cfg.social;
  const move = (from: number, to: number) => {
    if (!list[from] || !list[to] || from === to) return;
    const id = socialKey(list[from], from);
    moveSocial(list, id, socialKey(list[to], to), to > from); changed(true);
    [...document.querySelectorAll<HTMLElement>('[data-social-row]')].find((row) => row.dataset.socialRow === id)?.querySelector<HTMLButtonElement>('.grip')?.focus({ preventScroll: true });
  };
  const el = group({ footer: 'Drag the handles or use the arrows to change the icon order. Tap an icon to change its platform or link.' },
    ...list.map((s, i) => {
      const p = platform(s.platform);
      const name = p?.label ?? s.platform;
      return h('div', { class: 'row social-editor-row', 'data-i': i, 'data-social-row': socialKey(s, i) },
        h('button', { class: 'social-edit', type: 'button', 'aria-label': `Edit ${name} icon`, onclick: () => socialSheet(s) },
          h('span', { class: 'lead' }, socialGlyph(s.platform)),
          h('span', { class: 'txt' }, name, h('small', {}, s.url.replace(/^(https?:\/\/|mailto:)/, '')))),
        h('span', { class: 'social-move' },
          h('button', { type: 'button', disabled: i === 0, 'aria-label': `Move ${name} icon left`, onclick: () => move(i, i - 1) }, '←'),
          h('button', { type: 'button', disabled: i === list.length - 1, 'aria-label': `Move ${name} icon right`, onclick: () => move(i, i + 1) }, '→')),
        h('button', { class: 'grip', type: 'button', 'aria-label': `Reorder ${name} icon`, title: 'Drag to reorder, or use the arrow keys', onkeydown: (e: KeyboardEvent) => {
          if (!['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) return;
          e.preventDefault(); move(i, i + (['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : 1));
        } }, svg('grip', 20)));
    }),
    actionRow('Add Social Icon', () => {
      const item = { id: `social:${uid()}`, platform: 'instagram', url: platform('instagram')!.prefix };
      state.cfg.social.push(item);
      socialSheet(item, true);
    }));
  sortable(el.querySelector('.list')!, move);
  return el;
}

export function editSocialIcon(id: string) {
  const item = state.cfg.social.find((s, i) => socialKey(s, i) === id);
  if (item) socialSheet(item);
}

function highlightsGroup() {
  const hl = state.cfg.highlights;
  return group({ footer: 'Up to three numbers, like followers or projects. Optional.' },
    ...hl.map((x, i) => h('div', { class: 'row pair' },
      h('input', { value: x.value, placeholder: '24K', 'aria-label': 'Value', maxlength: 8, oninput: (e: any) => { x.value = e.target.value; changed(); } }),
      h('input', { value: x.label, placeholder: 'Followers', 'aria-label': 'Label', maxlength: 16, oninput: (e: any) => { x.label = e.target.value; changed(); } }),
      h('button', { class: 'minus', type: 'button', 'aria-label': 'Remove highlight', onclick: () => { hl.splice(i, 1); changed(true); } }, svg('minus', 14)))),
    hl.length < 3 && actionRow('Add Highlight', () => { hl.push({ value: '', label: '' }); changed(true); }));
}

export function addMediaItem(type: 'youtube' | 'image' | 'post') {
  const block = { id: `${type}:${uid()}`, type, title: '', url: '', image: null, ...(type === 'post' ? { description: '' } : {}) };
  placeBlock(block); changed(true);
  if (type === 'post') postSheet(block, true); else mediaSheet(block, true);
}
/** How each mark is written (the same rules as rich() in render.ts). A single * never counts as half of a **. */
const MARKS: Record<string, RegExp> = {
  '**': BOLD,
  '*': /\*(.+?)\*/gs, // read after bold is set aside, like the page does
  '__': /__(.+?)__/gs,
  '~~': /~~(.+?)~~/gs,
};
/** The marked span of this kind that holds the selection (or the cursor), if any. */
function markAround(value: string, mark: string, a: number, b: number) {
  const text = mark === '*' ? value.replace(BOLD, (m) => '\u0001\u0001' + m.slice(2, -2) + '\u0001\u0001') : value; // same length, bold stars hidden
  for (const m of text.matchAll(MARKS[mark])) {
    const start = m.index!, end = start + m[0].length;
    if (a >= start && b <= end) return { start, end, inner: value.slice(start + mark.length, end - mark.length) };
  }
  return null;
}

/** B / I / U / S buttons over a text box. Each works like a switch: on plain words it adds the style,
 * inside styled words (selected with or without the marks) it takes the style away. */
export function formatBar(area: HTMLElement, lists = false) {
  const box = area.querySelector('textarea')!;
  const toggle = (mark: string) => {
    const { selectionStart: a, selectionEnd: b, value } = box;
    const found = markAround(value, mark, a, b);
    if (found) {
      box.value = value.slice(0, found.start) + found.inner + value.slice(found.end);
      box.setSelectionRange(found.start, found.start + found.inner.length);
    } else {
      const picked = (mark === '*' ? value.slice(a, b) : value.slice(a, b).replace(MARKS[mark], '$1')) || 'text'; // no styles inside the same style
      box.value = value.slice(0, a) + mark + picked + mark + value.slice(b);
      box.setSelectionRange(a + mark.length, a + mark.length + picked.length);
    }
    box.focus();
    box.dispatchEvent(new Event('input', { bubbles: true }));
    refresh();
  };
  /** Bullets or numbers on every line the selection touches; tapping again takes them away. */
  const list = (numbered: boolean) => {
    const { selectionStart: a, selectionEnd: b, value } = box;
    const from = value.lastIndexOf('\n', a - 1) + 1, to = value.indexOf('\n', b) < 0 ? value.length : value.indexOf('\n', b);
    const lines = value.slice(from, to).split('\n');
    const marker = numbered ? /^\s*\d+[.)]\s+/ : /^\s*[-•]\s+/;
    const on = lines.every((l) => marker.test(l));
    const next = lines.map((l, i) => { const bare = l.replace(/^\s*(\d+[.)]|[-•])\s+/, ''); return on ? bare : (numbered ? `${i + 1}. ` : '- ') + bare; }).join('\n');
    box.value = value.slice(0, from) + next + value.slice(to);
    box.setSelectionRange(from, from + next.length);
    box.focus(); box.dispatchEvent(new Event('input', { bubbles: true })); refresh();
  };
  /** Turns the selected words into a link, or removes the link the cursor is in. */
  const link = () => {
    const { selectionStart: a, selectionEnd: b, value } = box;
    for (const m of value.matchAll(LINK)) {
      const start = m.index!, end = start + m[0].length;
      if (a >= start && b <= end) {
        box.value = value.slice(0, start) + m[1] + value.slice(end); box.setSelectionRange(start, start + m[1].length);
        box.focus(); box.dispatchEvent(new Event('input', { bubbles: true })); refresh(); return;
      }
    }
    const words = value.slice(a, b).trim() || 'link';
    const address = prompt(`Link "${words}" to which address?`, 'https://');
    if (!address || address === 'https://') { box.focus(); return; }
    const piece = `[${words}](${withScheme(address.trim())})`;
    box.value = value.slice(0, a) + piece + value.slice(b);
    box.setSelectionRange(a + 1, a + 1 + words.length);
    box.focus(); box.dispatchEvent(new Event('input', { bubbles: true })); refresh();
  };
  const buttons = new Map<string, HTMLElement>();
  const button = (mark: string, label: string, title: string, style: string) => {
    const el = h('button', { type: 'button', class: 'format-button', title, 'aria-label': title, 'aria-pressed': 'false', style,
      onmousedown: (e: Event) => e.preventDefault(), onclick: () => toggle(mark) }, label);
    buttons.set(mark, el);
    return el;
  };
  /** A button lights up while the cursor is inside text with its style. */
  const refresh = () => {
    buttons.forEach((el, mark) => el.setAttribute('aria-pressed', String(!!markAround(box.value, mark, box.selectionStart, box.selectionEnd))));
    const inLink = [...box.value.matchAll(LINK)].some((m) => box.selectionStart >= m.index! && box.selectionEnd <= m.index! + m[0].length);
    linkButton.setAttribute('aria-pressed', String(inLink));
  };
  const extra = (label: string, title: string, run: () => void) => h('button', { type: 'button', class: 'format-button', title, 'aria-label': title, onmousedown: (e: Event) => e.preventDefault(), onclick: run }, label);
  const linkButton = extra('🔗', 'Link the selected words (tap again inside a link to remove it)', link);
  ['select', 'keyup', 'click', 'input', 'focus'].forEach((type) => box.addEventListener(type, refresh));
  return h('div', { class: 'format-bar' },
    button('**', 'B', 'Bold', 'font-weight:700'), button('*', 'I', 'Italic', 'font-style:italic;font-family:Georgia,serif'),
    button('__', 'U', 'Underline', 'text-decoration:underline'), button('~~', 'S', 'Crossed out', 'text-decoration:line-through'),
    ...(lists ? [h('span', { class: 'format-gap' }), extra('•', 'Bullet list', () => list(false)), extra('1.', 'Numbered list', () => list(true)), linkButton] : [linkButton]));
}

export const TEXT_STYLE_OPTIONS: { value: TextStyle; label: string }[] = [
  { value: 'title', label: 'Title' }, { value: 'subtitle', label: 'Subtitle' }, { value: 'body', label: 'Text' }, { value: 'small', label: 'Label' }];

/** A free text item. Any number of them can be added and placed anywhere. */
export function textSheet(block: PageBlock, isNew = false) {
  const cfg = state.cfg;
  let deleted = false;
  const body = h('div');
  const draw = () => body.replaceChildren(
    group({ footer: 'Select words for bold, italic, underline, crossed out or a link. • and 1. turn lines into a list. Size, font and spacing are in Edit layout.' },
      ...withFormatBar(textareaRow(block.title ?? '', (v) => { block.title = v; changed(); }, 'Write anything: a heading, a note, a list, a quote…', 1200), true)),
    group({ header: 'Style' }, h('div', { class: 'row stacked' }, segmented(TEXT_STYLE_OPTIONS, block.textStyle ?? 'body', (v) => { block.textStyle = v; changed(); }))),
    group({ header: 'Alignment' }, h('div', { class: 'row stacked' }, segmented(NAME_ALIGN.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })), block.textAlign ?? 'center', (v) => { block.textAlign = v; changed(); }))),
    itemAnimationGroup(block),
    group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
    group({}, dangerRow('Delete Text', () => {
      if (!isNew && !confirm('Delete this text?')) return;
      deleted = true;
      cfg.blocks = cfg.blocks.filter((b) => b.id !== block.id);
      close();
    })));
  draw();
  const close = sheet(isNew ? 'New Text' : 'Edit Text', () => [body], { onClose: () => {
    if (!deleted && isNew && !block.title?.trim()) state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id);
    changed(true);
  } });
  setTimeout(() => body.querySelector('textarea')?.focus(), 50);
}
const withFormatBar = (area: HTMLElement, lists = false) => [h('div', { class: 'row stacked' }, formatBar(area, lists)), area];

/** Degrees, certificates, awards and roles, shown as a list, cards or a timeline. */
export function credentialsSheet(block: PageBlock, isNew = false) {
  const cfg = state.cfg;
  let deleted = false;
  block.entries ??= [];
  const entries = block.entries;
  const body = h('div');
  const entryGroup = (e: Credential, i: number) => {
  // Always built, shown as soon as there is a logo (also while pasting its address, without redrawing the field being typed in).
  const adjust = navRow({
    lead: svg('photo', 18), title: 'Adjust Logo', subtitle: e.logoFrame ? 'Zoom and position set' : 'Zoom in, move it, or fill the square',
    onClick: () => adjustImage({ src: safeImg(e.logo), title: 'Adjust Logo', aspect: 1, frame: e.logoFrame ?? { x: 50, y: 50, zoom: 1, fit: 'contain' },
      onChange: (frame) => { e.logoFrame = frame; changed(); }, onFinish: () => { changed(true); draw(); } }),
  }) as HTMLElement;
  adjust.hidden = !safeImg(e.logo);
  return group({ header: `${CREDENTIAL_KINDS.find((k) => k.value === e.kind)?.label ?? 'Entry'} ${i + 1}` },
    h('div', { class: 'row stacked' }, segmented(CREDENTIAL_KINDS.map((k) => ({ value: k.value, label: k.label })), e.kind, (v) => { e.kind = v; changed(); draw(); })),
    inputRow('Title', e.title, (v) => { e.title = v; changed(); }, { max: 120, placeholder: e.kind === 'degree' ? 'MSc Marketing' : e.kind === 'certificate' ? 'Google Ads Certified' : e.kind === 'award' ? 'Best Campaign 2025' : 'Creative Director' }),
    inputRow(e.kind === 'work' ? 'Company' : e.kind === 'degree' ? 'School' : 'From', e.org, (v) => { e.org = v; changed(); }, { max: 120, placeholder: e.kind === 'degree' ? 'University of Lisbon' : e.kind === 'work' ? 'Forsitmedia' : 'Google' }),
    inputRow('Year', e.year, (v) => { e.year = v; changed(); }, { max: 30, placeholder: e.kind === 'work' ? '2022 – now' : '2024' }),
    inputRow('Link', e.url ?? '', (v) => { e.url = withScheme(v) || undefined; changed(); }, { type: 'url', placeholder: 'Optional: verify or read more' }),
    inputRow('Logo URL', e.logo?.startsWith('data:') ? '' : e.logo ?? '', (v) => { e.logo = withScheme(v) || null; e.logoFrame = undefined; adjust.hidden = !safeImg(e.logo); changed(); }, { type: 'url', placeholder: 'Paste an image address' }),
    navRow({
      lead: svg('globe', 18), title: 'Search for the logo', subtitle: 'Opens image search: right-click a logo, Copy Image Address, paste it above',
      onClick: () => window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${e.org || e.title} logo`)}`, '_blank', 'noopener'),
    }),
    navRow({
      lead: safeImg(e.logo) ? h('img', { src: safeImg(e.logo), alt: '' }) : svg('photo', 18),
      title: e.logo ? 'Upload a Different Logo' : 'Upload Logo', subtitle: 'Or choose a file from your computer',
      onClick: async () => { try { const url = await pickImage(240); if (url) { e.logo = url; e.logoFrame = undefined; changed(true); draw(); } } catch (err: any) { toast(err.message); } },
    }),
    adjust,
    h('div', { class: 'row cred-entry-actions' },
      h('button', { type: 'button', class: 'btn-text', disabled: i === 0, onclick: () => { entries.splice(i - 1, 0, entries.splice(i, 1)[0]); changed(true); draw(); } }, 'Move up'),
      e.logo && h('button', { type: 'button', class: 'btn-text', onclick: () => { e.logo = null; e.logoFrame = undefined; changed(true); draw(); } }, 'Remove logo'),
      h('button', { type: 'button', class: 'btn-text red', onclick: () => { entries.splice(i, 1); changed(true); draw(); } }, 'Remove')));
  };
  const draw = () => body.replaceChildren(
    group({ footer: 'A short heading, like Education, Certifications or Awards. Leave empty for none.' },
      inputRow('Heading', block.title ?? '', (v) => { block.title = v; changed(); }, { max: 60, placeholder: 'Education' })),
    group({ header: 'Layout' }, h('div', { class: 'row stacked' }, segmented([{ value: 'list', label: 'List' }, { value: 'cards', label: 'Cards' }, { value: 'timeline', label: 'Timeline' }], block.variant ?? 'list', (v) => { block.variant = v; changed(); }))),
    ...entries.map(entryGroup),
    entries.length < 12 ? group({}, actionRow('Add Entry', () => { entries.push({ kind: entries.at(-1)?.kind ?? 'degree', title: '', org: '', year: '' }); changed(true); draw(); })) : document.createDocumentFragment(),
    group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
    group({}, dangerRow('Delete Credentials', () => {
      if (!isNew && !confirm('Delete these credentials?')) return;
      deleted = true;
      cfg.blocks = cfg.blocks.filter((b) => b.id !== block.id);
      close();
    })));
  draw();
  const close = sheet(isNew ? 'New Credentials' : 'Edit Credentials', () => [body], { onClose: () => {
    if (!deleted && isNew && !entries.some((e) => e.title.trim() || e.org.trim())) state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id);
    changed(true);
  } });
}
export function addCredentials() {
  const block: PageBlock = { id: `credentials:${uid()}`, type: 'credentials', title: 'Education', variant: 'list', entries: [{ kind: 'degree', title: '', org: '', year: '' }] };
  placeBlock(block); changed(true);
  credentialsSheet(block, true);
}

/** A decorative drawing: pick the shape, its colors, outline, rotation and motion. */
export function shapeSheet(block: PageBlock, isNew = false) {
  const cfg = state.cfg;
  let deleted = false;
  block.deco ??= { shape: 'blob', color: 'sunset' };
  const deco = block.deco;
  const body = h('div');
  const picture = (html: string) => { const el = h('span', { class: 'shape-thumb' }); el.innerHTML = html; return el; };
  const draw = () => body.replaceChildren(
    group({ header: 'Shape' }, h('div', { class: 'row stacked' }, h('div', { class: 'shape-grid' }, SHAPES.map((s) => h('button', {
      type: 'button', class: 'shape-cell' + (deco.shape === s.id ? ' on' : ''), 'aria-label': s.label, 'aria-pressed': String(deco.shape === s.id), title: s.label,
      onclick: () => { deco.shape = s.id; changed(); draw(); },
    }, picture(shapeSvg({ ...deco, shape: s.id, rotate: 0 }, `pick-${s.id}`))))))),
    group({ header: 'Color' }, h('div', { class: 'row stacked' }, h('div', { class: 'shape-colors' }, SHAPE_COLORS.map((c) => h('button', {
      type: 'button', class: 'shape-color' + (deco.color === c.id ? ' on' : ''), 'aria-label': `${c.label} color`, 'aria-pressed': String(deco.color === c.id), title: c.label,
      style: c.stops ? `background:linear-gradient(135deg,${c.stops[0]},${c.stops[1]})` : c.id === 'custom' ? 'background:conic-gradient(#ff3b30,#ffd60a,#34c759,#0a84ff,#bf5af2,#ff3b30)' : 'background:currentColor',
      onclick: () => { deco.color = c.id; changed(); draw(); },
    }))))),
    deco.color === 'custom' ? group({ footer: 'Pick the same color twice for a plain color.' },
      h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'From'), h('input', { type: 'color', value: deco.from ?? '#ff3d7f', oninput: (e: any) => { deco.from = e.target.value; changed(); } })),
      h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'To'), h('input', { type: 'color', value: deco.to ?? deco.from ?? '#7b4dff', oninput: (e: any) => { deco.to = e.target.value; changed(); } }))) : document.createDocumentFragment(),
    !SHAPES.find((s) => s.id === deco.shape)?.line ? group({}, switchRow('Outline only', !!deco.outline, (v) => { deco.outline = v || undefined; changed(); draw(); })) : document.createDocumentFragment(),
    group({ header: 'Rotation' }, h('label', { class: 'row image-range' },
      h('span', { class: 'image-range-label' }, 'Turn', h('output', {}, `${deco.rotate ?? 0}°`)),
      h('input', { type: 'range', min: 0, max: 359, step: 1, value: deco.rotate ?? 0, 'aria-label': 'Rotation', oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value); deco.rotate = v || undefined;
        (e.target as HTMLElement).parentElement!.querySelector('output')!.textContent = `${v}°`; changed();
      } }))),
    group({ header: 'Motion', footer: 'A slow, gentle movement. Visitors who turned off motion on their phone see it still.' }, h('div', { class: 'row stacked' },
      segmented([{ value: 'none', label: 'Still' }, { value: 'spin', label: 'Spin' }, { value: 'float', label: 'Float' }, { value: 'pulse', label: 'Pulse' }], deco.motion ?? 'none', (v) => { deco.motion = v === 'none' ? undefined : v; changed(); }))),
    group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
    group({}, dangerRow('Delete Shape', () => {
      if (!isNew && !confirm('Delete this shape?')) return;
      deleted = true;
      cfg.blocks = cfg.blocks.filter((b) => b.id !== block.id);
      close();
    })));
  draw();
  const close = sheet(isNew ? 'New Shape' : 'Edit Shape', () => [body], { onClose: () => changed(true) });
}
export function addShape() {
  const block: PageBlock = { id: `shape:${uid()}`, type: 'shape', deco: { shape: 'sparkle', color: 'sunset' }, design: { span: 4, align: 'auto' } };
  placeBlock(block); changed(true);
  shapeSheet(block, true);
}

export function addFile() {
  const block: PageBlock = { id: `file:${uid()}`, type: 'file', title: '' };
  placeBlock(block); changed(true);
  fileSheet(block, true);
}

/** A PDF people can open: uploaded into the page (kept small, since every visit loads it) or linked from elsewhere. */
const PDF_SOFT = 5_000_000, PDF_MAX = 12_000_000;
export function fileSheet(block: PageBlock, isNew = false) {
  const cfg = state.cfg;
  let deleted = false;
  const body = h('div');
  const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
  const upload = () => {
    const input = h('input', { type: 'file', accept: 'application/pdf,.pdf' }) as HTMLInputElement;
    input.onchange = () => {
      const f = input.files?.[0]; if (!f) return;
      if (f.size > PDF_MAX) { toast(`That PDF is ${mb(f.size)}. Upload one under ${mb(PDF_MAX)}, or paste a link to it instead.`); return; }
      const r = new FileReader();
      r.onload = () => {
        block.file = String(r.result).replace(/^data:[^;,]*/, 'data:application/pdf'); block.fileName = f.name.slice(0, 120); block.fileSize = f.size;
        if (!block.title) block.title = f.name.replace(/\.pdf$/i, '').slice(0, 120);
        changed(true); draw();
        if (f.size > PDF_SOFT) toast(`Added. At ${mb(f.size)} it makes your page slower to open; a link keeps it light.`);
      };
      r.readAsDataURL(f);
    };
    input.click();
  };
  const draw = () => body.replaceChildren(
    group({ header: 'The PDF', footer: block.file?.startsWith('data:')
        ? `${block.fileName ?? 'Uploaded'} · ${mb(block.fileSize ?? 0)}. It is stored inside your page; smaller files keep it fast.`
        : 'Upload a PDF (best under 5 MB), or paste a link to one (Google Drive, Dropbox, your website) for any size.' },
      navRow({ lead: svg('doc', 18), title: block.file?.startsWith('data:') ? 'Upload a Different PDF' : 'Upload PDF', subtitle: 'From your computer', onClick: upload }),
      inputRow('Or link', block.file && !block.file.startsWith('data:') ? block.file : '', (v) => {
        const url = withScheme(v);
        if (url) { block.file = url; block.fileName = undefined; block.fileSize = undefined; } else if (!block.file?.startsWith('data:')) block.file = undefined;
        changed();
      }, { type: 'url', placeholder: 'https://…/menu.pdf' })),
    group({ header: 'Title' }, inputRow('Title', block.title ?? '', (v) => { block.title = v; changed(); }, { placeholder: 'My CV, Menu, Price list…', max: 120 })),
    group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
    group({}, dangerRow('Delete PDF', () => {
      if (!isNew && !confirm('Delete this PDF?')) return;
      deleted = true; cfg.blocks = cfg.blocks.filter((b) => b.id !== block.id); close();
    })));
  draw();
  const close = sheet(isNew ? 'New PDF' : 'PDF', () => [body], { onClose: () => {
    if (!deleted && !block.file) state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id); // nothing added: no empty card
    changed(true);
  } });
}

export function addMenu() {
  const block: PageBlock = { id: `menu:${uid()}`, type: 'menu', title: '', items: [{ id: uid(), title: '', url: '' }] };
  placeBlock(block); changed(true);
  menuSheet(block, true);
}

/** A Link Menu: one button that opens down into a list of links, to sort links by topic (Videos, Projects, Shop…). */
export function menuSheet(block: PageBlock, isNew = false) {
  const cfg = state.cfg;
  let deleted = false;
  block.items ??= [];
  const items = block.items;
  const body = h('div');
  openMenus.add(block.id); changed(); // the preview shows it open while it is being edited
  const itemGroup = (e: MenuItem, i: number) => group({ header: `Link ${i + 1}` },
    inputRow('Title', e.title, (v) => { e.title = v; changed(); }, { max: 120, placeholder: i === 0 ? 'My latest project' : 'Title' }),
    inputRow('URL', e.url, (v) => { e.url = withScheme(v); changed(); }, { type: 'url', placeholder: 'yourwebsite.com' }),
    h('div', { class: 'row cred-entry-actions' },
      h('button', { type: 'button', class: 'btn-text', disabled: i === 0, onclick: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); changed(); draw(); } }, 'Move up'),
      h('button', { type: 'button', class: 'btn-text', disabled: i === items.length - 1, onclick: () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); changed(); draw(); } }, 'Move down'),
      h('button', { type: 'button', class: 'btn-text red', onclick: () => { items.splice(i, 1); changed(); draw(); } }, 'Remove')));
  const draw = () => body.replaceChildren(
    group({ footer: 'The button people tap. It opens down into the links below, like a folder: Videos, Projects, Shop…' },
      inputRow('Button', block.title ?? '', (v) => { block.title = v; changed(); }, { max: 120, placeholder: 'My videos' })),
    ...items.map(itemGroup),
    items.length < 30 ? group({}, actionRow('Add Link', () => { items.push({ id: uid(), title: '', url: '' }); changed(); draw(); })) : document.createDocumentFragment(),
    group({ footer: 'Opening a menu closes the others, so the page stays short.' },
      switchRow('Open when the page loads', !!block.open, (v) => { block.open = v || undefined; changed(); }),
      switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
    group({}, dangerRow('Delete Menu', () => {
      if (!isNew && !confirm('Delete this menu and its links?')) return;
      deleted = true; cfg.blocks = cfg.blocks.filter((b) => b.id !== block.id); close();
    })));
  draw();
  const close = sheet(isNew ? 'New Link Menu' : 'Link Menu', () => [body], { onClose: () => {
    openMenus.delete(block.id);
    block.items = items.filter((e) => e.title.trim() || e.url.trim());
    if (!deleted && isNew && !block.title?.trim() && !block.items.length) state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id);
    changed(true);
  } });
}

export function addVoice() {
  const block: PageBlock = { id: `voice:${uid()}`, type: 'voice', title: 'A message from me' };
  placeBlock(block); changed(true);
  voiceSheet(block, true);
}

/** Records (or takes an audio file), then keeps it in the page as a data URL with its length and waveform. */
const VOICE_LIMIT = 120; // seconds

export function voiceSheet(block: PageBlock, isNew = false) {
  const cfg = state.cfg;
  let deleted = false, recorder: MediaRecorder | null = null, stream: MediaStream | null = null, timer = 0, started = 0;
  const body = h('div');
  const save = async (blob: Blob) => {
    if (blob.size > 4_000_000) { toast('That recording is too long. Keep it under 2 minutes.'); return; }
    try {
      const d = await audioDetails(blob);
      block.audio = d.url; block.duration = d.duration ? Math.round(d.duration * 10) / 10 : undefined; block.peaks = d.peaks.length ? d.peaks : undefined;
      changed(true); draw();
    } catch (e) { toast(e instanceof Error && e.message.includes('2 minutes') ? e.message : 'This audio could not be read. Try an MP3, M4A or WAV file.'); }
  };
  const stopRecording = () => { recorder?.state === 'recording' && recorder.stop(); };
  const record = async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast('Allow the microphone to record (check the browser\'s site settings).'); return; }
    const type = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); stream = null;
      const blob = new Blob(chunks, { type: recorder?.mimeType || type || 'audio/webm' }); recorder = null;
      save(blob);
    };
    recorder.start(); started = Date.now(); draw();
    timer = window.setInterval(() => {
      const s = (Date.now() - started) / 1000;
      const out = body.querySelector('.voice-rec-time'); if (out) out.textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')} / 2:00`;
      if (s >= VOICE_LIMIT) stopRecording();
    }, 250);
  };
  const upload = () => {
    const input = h('input', { type: 'file', accept: 'audio/*' }) as HTMLInputElement;
    input.onchange = () => { const f = input.files?.[0]; if (f) save(f); };
    input.click();
  };
  const draw = () => body.replaceChildren(
    group({ header: 'Your voice', footer: 'Say hi, tell people what they will find here, or share some news. Up to 2 minutes. Visitors tap play to listen.' },
      recorder
        ? h('div', { class: 'row voice-rec' }, h('span', { class: 'voice-rec-dot' }), h('span', { class: 'voice-rec-time' }, '0:00 / 2:00'),
            h('button', { type: 'button', class: 'voice-rec-btn stop', onclick: stopRecording }, 'Stop'))
        : h('div', { class: 'row voice-rec' }, h('button', { type: 'button', class: 'voice-rec-btn', onclick: record }, svg('mic', 18), block.audio ? 'Record again' : 'Record'),
            h('button', { type: 'button', class: 'btn-text', onclick: upload }, 'Upload audio')),
      block.audio && !recorder ? h('div', { class: 'row stacked' }, h('audio', { controls: true, src: block.audio, class: 'voice-preview' })) : null),
    group({ header: 'Label' }, inputRow('Label', block.title ?? '', (v) => { block.title = v; changed(); }, { placeholder: 'A message from me', max: 80 })),
    group({}, switchRow('Show on page', !block.hidden, (v) => { block.hidden = !v; changed(); })),
    group({}, dangerRow('Delete Voice Message', () => {
      if (!isNew && !confirm('Delete this voice message?')) return;
      deleted = true; stopRecording();
      cfg.blocks = cfg.blocks.filter((b) => b.id !== block.id);
      close();
    })));
  draw();
  const close = sheet(isNew ? 'New Voice Message' : 'Voice Message', () => [body], { onClose: () => {
    stopRecording();
    if (!deleted && !block.audio) state.cfg.blocks = state.cfg.blocks.filter((b) => b.id !== block.id); // nothing recorded: no empty item
    changed(true);
  } });
}

/** Music and disco for the whole page: they appear as small buttons next to Share. "Listen" plays the music in the preview. */
export function musicSheet() {
  const look = state.cfg.look;
  const body = h('div');
  const pageButton = (cls: string) => document.querySelector<HTMLIFrameElement>('.preview-surface iframe, iframe')?.contentDocument?.querySelector<HTMLButtonElement>(cls);
  const playing = () => pageButton('.music')?.getAttribute('aria-pressed') === 'true';
  const toggle = () => { pageButton('.music')?.click(); setTimeout(draw, 50); };
  /** Choosing a style plays it straight away: the preview is redrawn with the new music first. */
  const playChosen = () => setTimeout(() => { if (!playing()) toggle(); }, 450);
  const draw = () => body.replaceChildren(
    group({ header: 'Background music', footer: 'Visitors see a ♪ button next to Share and the music starts only when they tap it. It is made live in their browser, so there is nothing to license and no copyright.' },
      ...([['', 'Off', 'No music button'], ...MUSIC_STYLES.map((m) => [m, MUSIC_LABELS[m], MUSIC_NOTES[m]])] as [string, string, string][]).map(([value, title, subtitle]) =>
        navRow({ title, subtitle, chevron: false, trail: (look.music ?? '') === value ? svg('check', 18) : undefined, onClick: () => {
          if (playing()) pageButton('.music')?.click();
          look.music = (value || undefined) as typeof look.music; changed(true); draw();
          if (value) playChosen();
        } })),
      look.music ? actionRow(playing() ? '❚❚ Pause' : '▶ Resume', toggle) : null),
    look.music || look.disco ? group({ header: 'Buttons', footer: 'Where the ♪ and 🪩 buttons sit. Floating keeps them at the bottom of the screen while visitors scroll.' },
      h('div', { class: 'row stacked' }, segmented([{ value: 'top', label: 'Top right' }, { value: 'left', label: 'Top left' }, { value: 'bottom', label: 'Floating' }], look.tools ?? 'top',
        (v) => { look.tools = v === 'top' ? undefined : v as 'left' | 'bottom'; changed(true); }))) : document.createDocumentFragment(),
    group({ header: 'Disco mode', footer: 'A 🪩 button: lights sweep across the page, items dance and a disco club track plays. Everything still works; tap again to stop.' },
      switchRow('Disco button', !!look.disco, (v) => { look.disco = v || undefined; changed(true); setTimeout(draw, 250); }),
      look.disco ? actionRow('Try it', () => { const b = pageButton('.disco-btn'); if (b) b.click(); else setTimeout(() => pageButton('.disco-btn')?.click(), 400); }) : null));
  draw();
  sheet('Music & Disco', () => [body], { onClose: () => { if (playing()) pageButton('.music')?.click(); if (pageButton('html.disco .disco-btn')) pageButton('.disco-btn')?.click(); changed(true); } });
}

/** An empty space chosen by the creator: room between items, invisible to visitors, stretched like any item. */
export function addSpace() {
  placeBlock({ id: `space:${uid()}`, type: 'space', height: 48 }); changed(true);
  toast('Empty space added. Stretch it from its top or bottom dot.');
}

export function addTextItem() {
  const block: PageBlock = { id: `text:${uid()}`, type: 'text', title: '', textStyle: 'body' };
  placeBlock(block); changed(true);
  textSheet(block, true);
}

export function addItemMenu() {
  const close = sheet('Add Item', () => [
    group({ header: 'Where', footer: 'Top: under your photo and name. Here: after the selected item (or the one in view). Bottom: at the end of the page.' },
      h('div', { class: 'row stacked' }, segmented<AddAt>([{ value: 'top', label: 'Top' }, { value: 'here', label: 'Here' }, { value: 'bottom', label: 'Bottom' }], addAt.get(), (v) => addAt.set(v)))),
    group({ footer: 'Arrange and resize items directly on your page.' },
      navRow({ lead: svg('link'), title: 'Link', subtitle: 'A button or a photo tile', onClick: () => {
        close();
        const link = { id: uid(), title: '', url: '' };
        state.cfg.links.push(link); placeBlock({ id: `link:${link.id}`, type: 'link', linkId: link.id }); changed(true); linkSheet(link, true);
      } }),
      navRow({ lead: svg('menu'), title: 'Link Menu', subtitle: 'A button that opens into a list of links: Videos, Projects…', onClick: () => { close(); addMenu(); } }),
      navRow({ lead: svg('text'), title: 'Text', subtitle: 'A heading, a note, or a label', onClick: () => { close(); addTextItem(); } }),
      navRow({ lead: svg('doc'), title: 'PDF', subtitle: 'A menu, CV, price list or guide people can open', onClick: () => { close(); addFile(); } }),
      navRow({ lead: svg('mic'), title: 'Voice Message', subtitle: 'Record a welcome in your own voice', onClick: () => { close(); addVoice(); } }),
      navRow({ lead: svg('music'), title: 'Music & Disco', subtitle: state.cfg.look.music ? `${MUSIC_LABELS[state.cfg.look.music]} · a ♪ button visitors tap` : 'Background music and a disco mode button', onClick: () => { close(); musicSheet(); } }),
      navRow({ lead: svg('minus'), title: 'Empty Space', subtitle: 'Room between items; stretch it from its top or bottom dot', onClick: () => { close(); addSpace(); } }),
      navRow({ lead: svg('star'), title: 'Shape', subtitle: 'Abstract drawings and doodles', onClick: () => { close(); addShape(); } }),
      navRow({ lead: svg('cap'), title: 'Credentials', subtitle: 'Degrees, certificates, awards, work', onClick: () => { close(); addCredentials(); } }),
      navRow({ lead: svg('post'), title: 'Post Preview', subtitle: 'Cover, title and excerpt', onClick: () => { close(); addMediaItem('post'); } }),
      navRow({ lead: svg('play'), title: 'YouTube Video', subtitle: 'Automatic cover and video player', onClick: () => { close(); addMediaItem('youtube'); } }),
      navRow({ lead: svg('photo'), title: 'Image', subtitle: 'A photo, artwork, or announcement', onClick: () => { close(); addMediaItem('image'); } })),
  ]);
}
