import { platform } from '../../lib/platforms';
import { safeImg, withScheme, NAME_ALIGN } from '../../lib/types';
import { separateName, hasSeparateName } from '../../lib/layout';
import { imageFrameStyle } from '../../lib/image-frame';
import { moveSocial, socialKey } from '../../lib/social-order';
import { sortable } from './reorder';
import { socialGlyph } from './social-glyph';
import { state, changed, onChange, uid } from './state';
import { pickImage } from './upload';
import { adjustImage } from './image-editor';
import { linkSheet, socialSheet, mediaSheet, postSheet } from './sheets';
import { h, group, navRow, actionRow, inputRow, textareaRow, switchRow, segmented, sheet, svg, toast } from './ui';

export function editPageBlock(id: string) {
  const { cfg } = state;
  const block = cfg.blocks.find((b) => b.id === id);
  if (!block) return;
  if (block.type === 'link') { const link = cfg.links.find((l) => l.id === block.linkId); if (link) linkSheet(link); return; }
  if (block.type === 'youtube' || block.type === 'image') return mediaSheet(block);
  if (block.type === 'post') return postSheet(block);
  if (block.type === 'name') return editPageBlock(cfg.blocks.find((b) => b.type === 'profile')!.id); // the name is edited with the profile
  const titles = { profile: 'Profile', bio: 'Bio', social: 'Social Icons', highlights: 'Highlights' };
  const body = h('div');
  const build = () => h('div', {},
    block.type === 'profile' ? profileGroup() :
    block.type === 'bio' ? group({}, textareaRow(cfg.profile.bio, (v) => { cfg.profile.bio = v; changed(); }, 'A few words about you')) :
    block.type === 'social' ? socialGroup() : highlightsGroup(),
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
  state.cfg.blocks.push(block); changed(true);
  if (type === 'post') postSheet(block, true); else mediaSheet(block, true);
}
export function addItemMenu() {
  const close = sheet('Add Item', () => [
    group({ footer: 'Arrange and resize items directly on your page.' },
      navRow({ lead: svg('link'), title: 'Link', subtitle: 'A button or a photo tile', onClick: () => {
        close();
        const link = { id: uid(), title: '', url: '' };
        state.cfg.links.push(link); state.cfg.blocks.push({ id: `link:${link.id}`, type: 'link', linkId: link.id }); changed(true); linkSheet(link, true);
      } }),
      navRow({ lead: svg('post'), title: 'Post Preview', subtitle: 'Cover, title and excerpt', onClick: () => { close(); addMediaItem('post'); } }),
      navRow({ lead: svg('play'), title: 'YouTube Video', subtitle: 'Automatic cover and video player', onClick: () => { close(); addMediaItem('youtube'); } }),
      navRow({ lead: svg('photo'), title: 'Image', subtitle: 'A photo, artwork, or announcement', onClick: () => { close(); addMediaItem('image'); } })),
  ]);
}
