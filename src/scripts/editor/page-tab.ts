/** One ordered content list, with layout presets and the existing appearance controls. */
import { platform } from '../../lib/platforms';
import { editPageBlock, addItemMenu, addMediaItem } from './block-editor';
import { FONTS, FONT_LABELS, modeFor } from '../../lib/look';
import { plain } from '../../lib/render';
import { TEMPLATES } from '../../lib/templates';
import { youtubeVideo, youtubeCover, postSource } from '../../lib/media';
import { isVisible, safeImg, MUSIC_STYLES, type Look, type PageBlock } from '../../lib/types';
import { MUSIC_LABELS } from '../../lib/music';
import { saveLayout, restoreLayout } from '../../lib/layout';
import { state, changed } from './state';
import { imageFrameStyle } from '../../lib/image-frame';
import { sortable } from './reorder';
import { h, group, actionRow, switchRow, segmented, swatches, svg, toast, hostname } from './ui';
import { pageAnimationGroup } from './animation-controls';

let reordering = false;

export function pageTab(): HTMLElement {
  const { cfg } = state;
  return h('div', {}, contentGroup(), templatesGroup(), appearanceGroup(), pageAnimationGroup());

  function move(from: number, to: number, focus = false) {
    if (to < 0 || to >= cfg.blocks.length || from === to) return;
    const [item] = cfg.blocks.splice(from, 1);
    cfg.blocks.splice(to, 0, item);
    changed(true);
    if (focus) {
      const row = [...document.querySelectorAll<HTMLElement>('.content-row')].find((r) => r.dataset.blockId === item.id);
      row?.querySelector<HTMLButtonElement>('.grip')?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
      toast(`Moved to position ${to + 1}`);
    }
  }

  function contentGroup() {
    const rows = cfg.blocks.map((block, i) => {
      const info = describe(block);
      const row = h('div', { class: 'row has-lead content-row', 'data-i': i, 'data-block-id': block.id },
        h('button', { class: 'block-edit', type: 'button', onclick: () => editPageBlock(block.id), 'aria-label': `Edit ${info.title}` },
          h('span', { class: 'lead' }, info.image ? h('img', { src: info.image, alt: '' }) : svg(info.icon, 18)),
          h('span', { class: 'txt' }, info.title, h('small', {}, info.subtitle)),
          h('span', { class: 'chev' }, svg('chevron', 14))),
        reordering && h('span', { class: 'move-buttons' },
          h('button', { type: 'button', disabled: i === 0, 'aria-label': `Move ${info.title} up`, onclick: () => move(i, i - 1, true) }, svg('up', 16)),
          h('button', { type: 'button', disabled: i === cfg.blocks.length - 1, 'aria-label': `Move ${info.title} down`, onclick: () => move(i, i + 1, true) }, svg('down', 16))),
        h('button', { class: 'grip', type: 'button', 'aria-label': `Reorder ${info.title}`, title: 'Drag, or use the up and down arrow keys', onkeydown: (event: KeyboardEvent) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          move(i, i + (event.key === 'ArrowUp' ? -1 : 1), true);
        } }, svg('grip', 20)));
      if (info.hidden) row.classList.add('content-hidden');
      if (['youtube', 'post'].includes(block.type)) row.classList.add('has-preview');
      return row;
    });
    const el = group({
      header: 'Page content',
      action: { label: reordering ? 'Done' : 'Reorder', onClick: () => { reordering = !reordering; changed(true); } },
      footer: 'Drag any row to arrange everything, even above your profile (on a phone, press and hold first). Reorder also gives you move buttons.',
    }, ...rows, actionRow('Add Item', addItemMenu));
    el.insertBefore(h('div', { class: 'add-media-shortcuts' },
      h('button', { type: 'button', onclick: () => addMediaItem('post') }, svg('post', 17), 'Post Preview'),
      h('button', { type: 'button', onclick: () => addMediaItem('youtube') }, svg('play', 17), 'YouTube Video')), el.querySelector('.group-f'));
    sortable(el.querySelector('.list')!, (from, to) => move(from, to));
    return el;
  }

  function describe(b: PageBlock): { title: string; subtitle: string; icon: string; image?: string; hidden?: boolean } {
    const hidden = b.hidden;
    const extra = (s: string) => hidden ? 'Hidden' : s;
    if (b.type === 'profile') return { title: 'Profile', subtitle: extra('Photo, name & username'), icon: 'person', image: safeImg(cfg.profile.photo), hidden };
    if (b.type === 'name') return { title: 'Name', subtitle: extra([cfg.profile.name, cfg.profile.handle && '@' + cfg.profile.handle].filter(Boolean).join(' · ')), icon: 'text', hidden };
    if (b.type === 'bio') return { title: 'Bio', subtitle: extra(cfg.profile.bio || 'Add a few words about you'), icon: 'text', hidden };
    if (b.type === 'space') return { title: 'Empty space', subtitle: 'Only you see it while editing · tap to remove', icon: 'minus', hidden };
    if (b.type === 'menu') return { title: b.title || 'Link menu', subtitle: extra((b.items ?? []).map((e) => e.title).filter(Boolean).join(' · ') || 'Tap to add links'), icon: 'menu', hidden };
    if (b.type === 'file') return { title: b.title || b.fileName || 'PDF', subtitle: extra(b.file ? (b.file.startsWith('data:') ? `PDF · ${b.fileName ?? 'uploaded'}` : `PDF · ${b.file.replace(/^https:\/\//, '')}`) : 'Tap to add a PDF'), icon: 'doc', hidden };
    if (b.type === 'voice') return { title: 'Voice message', subtitle: extra(b.audio ? `${b.title || 'Recording'}${b.duration ? ` · ${Math.floor(b.duration / 60)}:${String(Math.round(b.duration % 60)).padStart(2, '0')}` : ''}` : 'Tap to record'), icon: 'mic', hidden };
    if (b.type === 'shape') return { title: 'Shape', subtitle: extra(`${b.deco?.shape ?? 'blob'} · ${b.deco?.color ?? ''}`), icon: 'star', hidden };
    if (b.type === 'credentials') return { title: b.title || 'Credentials', subtitle: extra((b.entries ?? []).map((e) => e.title).filter(Boolean).join(' · ') || 'Add your degrees and awards'), icon: 'cap', hidden };
    if (b.type === 'text') return { title: plain(b.title ?? '').trim().split('\n')[0].replace(/^\s*([-•]|\d+[.)])\s+/, '') || 'Text', subtitle: extra({ title: 'Title', subtitle: 'Subtitle', body: 'Text', small: 'Label' }[b.textStyle ?? 'body']), icon: 'text', hidden };
    if (b.type === 'highlights' && b.part) { const x = cfg.highlights[Number(b.part)]; return { title: [x?.value, x?.label].filter(Boolean).join(' ') || 'Highlight', subtitle: extra('One highlight'), icon: 'star', hidden }; }
    if (b.type === 'social' && b.part) { const s = cfg.social.find((s, i) => (s.id || `social:${i}`) === b.part); return { title: `${platform(s?.platform ?? '')?.label ?? 'Social'} icon`, subtitle: extra(s?.url.replace(/^(https?:\/\/|mailto:)/, '') ?? ''), icon: 'globe', hidden }; }
    if (b.type === 'highlights') return { title: 'Highlights', subtitle: extra(cfg.highlights.map((x) => [x.value, x.label].filter(Boolean).join(' ')).join(' · ') || 'Add your numbers'), icon: 'star', hidden };
    if (b.type === 'social') return { title: 'Social Icons', subtitle: extra(cfg.social.map((s) => platform(s.platform)?.label ?? s.platform).join(' · ') || 'Add your social profiles'), icon: 'globe', hidden };
    if (b.type === 'link') {
      const l = cfg.links.find((l) => l.id === b.linkId)!;
      return { title: l.title || 'Untitled Link', subtitle: [l.hidden ? 'Hidden' : !isVisible(l) ? 'Scheduled' : l.featured ? 'Featured' : '', hostname(l.url)].filter(Boolean).join(' · '), icon: l.featured ? 'star' : 'link', image: safeImg(l.image), hidden: l.hidden };
    }
    if (b.type === 'youtube') {
      const parsed = youtubeVideo(b.url ?? '');
      return { title: b.title || 'YouTube Video', subtitle: extra(parsed ? 'YouTube · Cover + video player' : 'Add a YouTube video URL'), icon: 'play', image: parsed ? youtubeCover(b.url ?? '', b.image) : undefined, hidden };
    }
    if (b.type === 'post') return { title: b.title || 'Post Preview', subtitle: extra(b.url ? postSource(b.url) + ' · Post preview' : 'Add a post link and cover'), icon: 'post', image: safeImg(b.image), hidden };
    return { title: b.title || 'Image', subtitle: extra(b.image ? 'Image' : 'Choose an image'), icon: 'photo', image: safeImg(b.image), hidden };
  }

  function templatesGroup() {
    return h('section', { class: 'group templates-group' },
      h('div', { class: 'group-h' }, h('span', {}, 'Choose a template'), h('span', { class: 'template-count' }, `${TEMPLATES.length} designs`)),
      h('div', { class: 'template-grid' }, TEMPLATES.map((t) =>
        h('button', { type: 'button', class: `template-option${cfg.look.template === t.id ? ' selected' : ''}`, 'aria-pressed': String(cfg.look.template === t.id), 'aria-label': `${t.name} template`, onclick: () => {
          if (cfg.look.template === t.id) return;
          // Each template keeps its own arrangement: keep this one, then bring back the new template's (or start it clean).
          const first = !cfg.layouts;
          const layouts = cfg.layouts ??= {};
          // Arrangements kept before typography was kept too (no v) were made automatically, except Photo's, where pages
          // were built: drop the others (and don't keep the one on screen), so those designs get arranged neatly again.
          const legacy = Object.values(layouts).some((l) => l && !l.v);
          if (legacy) for (const k of Object.keys(layouts) as (keyof typeof layouts)[]) if (k !== 'photo') delete layouts[k];
          const current = saveLayout(cfg);
          if (!legacy || cfg.look.template === 'photo') layouts[cfg.look.template] = current;
          if (first && cfg.look.template !== 'photo') layouts.photo ??= current; // pages made before this were arranged in Photo
          const saved = layouts[t.id];
          if (!saved) dispatchEvent(new CustomEvent('yourlinki-clean-layout', { detail: t.id })); // measured while the old template is still shown
          const { music, disco, tools, reveal, revealDuration, revealRepeat } = cfg.look;
          cfg.look = { ...t.look, ...(music ? { music } : {}), ...(disco ? { disco } : {}), ...(tools ? { tools } : {}),
            ...(reveal ? { reveal } : {}), ...(revealDuration ? { revealDuration } : {}), ...(revealRepeat ? { revealRepeat } : {}) };
          if (saved) restoreLayout(cfg, saved);
          changed(true);
        } },
          h('span', { class: `template-mini layout-${t.id}`, 'aria-hidden': 'true' },
            t.id === 'cover' && h('span', { class: 'mini-banner' }, safeImg(cfg.profile.cover) ? h('img', { src: safeImg(cfg.profile.cover), alt: '' }) : null),
            h('span', { class: 'mini-photo' }, safeImg(cfg.profile.photo) ? h('img', { src: safeImg(cfg.profile.photo), alt: '', style: imageFrameStyle(cfg.profile.photoFrame) }) : svg('person', 20)),
            h('span', { class: 'mini-name' }), h('span', { class: 'mini-handle' }),
            [0, 1, 2].map((i) => h('span', { class: 'mini-link' + (i === 0 ? ' first' : '') },
              t.id === 'gallery' && safeImg(cfg.links.filter((l) => safeImg(l.image))[i]?.image || cfg.profile.photo) ? h('img', { src: safeImg(cfg.links.filter((l) => safeImg(l.image))[i]?.image || cfg.profile.photo), alt: '' }) : null)),
            h('span', { class: 'mini-social' }, h('i'), h('i'), h('i'))),
          h('span', { class: 'template-name' }, t.name, cfg.look.template === t.id && h('span', { class: 'template-check', 'aria-hidden': 'true' }, '✓')),
          h('span', { class: 'template-description' }, t.description)))),
      h('p', { class: 'group-f' }, 'Same content, a different feel. Each design keeps its own arrangement: switch back any time and yours is restored.'));
  }

  function appearanceGroup() {
    const look = cfg.look;
    const set = <K extends keyof Look>(k: K, v: Look[K], redraw = false) => { look[k] = v; changed(redraw); };
    const line = (label: string, control: Node) => h('div', { class: 'row stacked' }, h('span', { class: 'lbl' }, label), control);
    const fontControl = h('div', { class: 'font-chips page-fonts' }, (Object.keys(FONTS) as Look['font'][]).map((f) => h('button', {
      type: 'button', class: 'font-chip' + (look.font === f ? ' on' : ''), 'aria-pressed': String(look.font === f), style: `font-family:${FONTS[f]}`, title: `${FONT_LABELS[f]} font`,
      onclick: () => set('font', f, true),
    }, h('b', {}, 'Aa'), h('span', {}, FONT_LABELS[f]))));
    return group({ header: 'Make it yours', footer: look.mode === 'auto'
        ? 'Automatic shows the light or dark version to match each visitor\'s phone. Colors are adjusted so text always stays readable.'
        : 'Colors are adjusted so text always stays readable. Automatic follows each visitor\'s phone instead.' },
      line('Mode', segmented([{ value: 'auto', label: 'Automatic' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], look.mode, (v) => set('mode', v, true))),
      line('Background', segmented([{ value: 'photo', label: 'From Image' }, { value: 'color', label: 'Color' }], look.background, (v) => set('background', v, true))),
      look.background === 'color' && line('Background Color', swatches(['#1c1c1e', '#000000', '#f2f2f7', '#ffffff', '#f3efe7', '#0a84ff', '#ff375f', '#30d158', '#bf5af2'], look.color, (v) => {
        // A fixed mode follows the chosen color, so the page shows that color with readable text.
        if (look.mode !== 'auto') look.mode = modeFor(v);
        set('color', v, true); // redraw: the Mode control may have changed
      }, false)),
      line('Button Color', swatches(['', '#ffffff', '#000000', '#0a84ff', '#ff375f', '#ff9f0a', '#30d158', '#bf5af2'], look.accent, (v) => set('accent', v))),
      line('Font', fontControl),
      line('Music', h('select', { class: 'music-select', onchange: (e: Event) => set('music', ((e.target as HTMLSelectElement).value || undefined) as Look['music'], true) },
        [['', 'Off'], ...MUSIC_STYLES.map((m) => [m, MUSIC_LABELS[m]])].map(([value, label]) => h('option', { value, selected: (look.music ?? '') === value }, label)))),
      switchRow('Disco button 🪩', !!look.disco, (v) => set('disco', v || undefined, true)),
      look.music && h('p', { class: 'row-note' }, 'A ♪ button appears next to Share. Music starts only when a visitor taps it, and it is made live in their browser, so there is no copyright. Try it in Preview.'));
  }
}
