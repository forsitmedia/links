import type { Config, PageBlock } from '../../lib/types';
import { safeImg } from '../../lib/types';
import { LayoutHistory, bounded, designStyle, dropTarget, moveBlock, separateName, sizeTier, type BlockRect } from '../../lib/layout';
import { NAME_ALIGN, FONT_IDS, type FontId } from '../../lib/types';
import { FONTS } from '../../lib/look';
import { imageFrameStyle, normalizeImageFrame } from '../../lib/image-frame';
import { youtubeCover, videoRatio } from '../../lib/media';
import { icon } from '../../lib/icons';
import { platform } from '../../lib/platforms';
import { moveSocial, socialKey } from '../../lib/social-order';
import { buttonShape, usesButton } from '../../lib/button-shape';
import { adjustImage } from './image-editor';
import { shapePicker } from './shape-picker';
import { tileStylePicker } from './tile-style-picker';
import { socialGlyph } from './social-glyph';
import { guardTouchScroll, pressToDrag } from './reorder';
import { h, segmented } from './ui';
import css from './canvas.css?inline';

type Selection = { id: string; part?: 'photo' | 'cover' | 'name'; socialId?: string };
type Options = { config: () => Config; inspector: HTMLElement; edit: (id: string) => void; editSocial: (id: string) => void; add: () => void; commit: (redraw?: boolean) => void; save: () => void;
  undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean };

export class VisualCanvas {
  enabled = true;
  busy = false;
  private selection: Selection | null = null;
  private doc: Document | null = null;
  private ui: HTMLElement | null = null;
  private dispose: (() => void) | null = null;
  private stopGesture: (() => void) | null = null;
  private history: LayoutHistory;
  private pendingNew: Set<string> | null = null;
  private suppressClick = false;
  private detailsOpen = false;
  constructor(private o: Options) { this.history = new LayoutHistory(o.config); }

  mount(doc: Document) {
    this.dispose?.();
    this.doc = doc;
    const win = doc.defaultView!;
    const style = doc.createElement('style'); style.textContent = css; doc.head.append(style);
    const ui = doc.createElement('div'); ui.className = 'canvas-ui';
    ui.innerHTML = `<button type="button" class="canvas-drag" aria-label="Drag selected item" title="Drag to reorder">${icon('grip', 17)}</button><button type="button" class="canvas-edit" aria-label="Edit selected item">Edit</button><button type="button" class="canvas-resize" aria-label="Resize selected item" title="Drag to resize, double-click to reset">${icon('arrow', 13)}</button>`;
    doc.body.append(ui); this.ui = ui;
    ui.querySelector('.canvas-drag')!.addEventListener('pointerdown', (e) => this.drag(e as PointerEvent));
    ui.querySelector('.canvas-resize')!.addEventListener('pointerdown', (e) => this.resize(e as PointerEvent));
    ui.querySelector('.canvas-resize')!.addEventListener('dblclick', () => this.resetSize());
    ui.querySelector('.canvas-edit')!.addEventListener('click', () => this.editSelection());
    const socialStarts = [...doc.querySelectorAll<HTMLElement>('[data-social-id]')].map((el) => {
      const start = (e: PointerEvent) => {
        if (!this.enabled || this.busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
        this.select({ id: el.closest<HTMLElement>('[data-block-id]')!.dataset.blockId!, socialId: el.dataset.socialId });
        this.dragSocial(e);
      };
      el.addEventListener('pointerdown', start);
      return () => el.removeEventListener('pointerdown', start);
    });
    // Any item drags from anywhere, not only from its handle; a plain click still selects it.
    guardTouchScroll(doc);
    const press = (e: PointerEvent) => {
      if (!this.enabled || this.busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const target = e.target as HTMLElement;
      if (!target?.closest || target.closest('.canvas-ui, [data-social-id]')) return;
      const block = target.closest<HTMLElement>('[data-block-id]');
      if (!block) return;
      pressToDrag(e, () => {
        const id = block.dataset.blockId!;
        if (this.selection?.id !== id || this.selection.socialId) this.select({ id });
        this.drag(e, block);
      });
    };
    const menu = (e: MouseEvent) => { if (this.enabled && (e.target as HTMLElement).closest?.('[data-block-id]')) e.preventDefault(); }; // long-press menus
    const click = (e: MouseEvent) => {
      if (!this.enabled) return;
      const target = e.target as HTMLElement;
      if (!target?.closest || target.closest('.canvas-ui')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (this.busy || this.suppressClick) { this.suppressClick = false; return; }
      const block = target.closest<HTMLElement>('[data-block-id]');
      if (!block) { this.select(null); return; }
      const part = target.closest<HTMLElement>('[data-profile-part]')?.dataset.profilePart as Selection['part'];
      const socialId = target.closest<HTMLElement>('[data-social-id]')?.dataset.socialId;
      this.select({ id: block.dataset.blockId!, ...(part ? { part } : {}), ...(socialId ? { socialId } : {}) });
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.o.save(); return; }
      if (!this.enabled || !this.selection) return;
      if (e.key === 'Escape') { e.preventDefault(); if (this.busy) this.stopGesture?.(); else this.select(null); }
      if (this.busy) return;
      if (this.selection?.socialId && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); this.nudgeSocial(e.key === 'ArrowLeft' ? -1 : 1); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); e.shiftKey ? this.redo() : this.undo();
      }
    };
    doc.addEventListener('pointerdown', press);
    doc.addEventListener('contextmenu', menu);
    doc.addEventListener('click', click, true);
    doc.addEventListener('keydown', key);
    const update = () => this.position();
    win.addEventListener('scroll', update, { passive: true }); win.addEventListener('resize', update);
    const observer = new ResizeObserver(update); observer.observe(doc.querySelector('.stack')!);
    this.dispose = () => {
      this.stopGesture?.(); socialStarts.forEach((remove) => remove()); observer.disconnect(); doc.removeEventListener('pointerdown', press); doc.removeEventListener('contextmenu', menu); doc.removeEventListener('click', click, true); doc.removeEventListener('keydown', key);
      win.removeEventListener('scroll', update); win.removeEventListener('resize', update); ui.remove(); style.remove();
    };
    if (this.pendingNew) {
      const added = this.elements().find((el) => !this.pendingNew!.has(el.dataset.blockId!));
      if (added) { this.selection = { id: added.dataset.blockId! }; this.pendingNew = null; added.scrollIntoView({ block: 'center' }); }
    }
    this.setMode(this.enabled);
  }

  setMode(enabled: boolean) {
    if (this.busy) this.stopGesture?.();
    this.enabled = enabled;
    this.doc?.documentElement.classList.toggle('canvas-editing', enabled);
    this.position(); this.inspector();
  }
  private elements() { return this.doc ? [...this.doc.querySelectorAll<HTMLElement>('[data-block-id]')] : []; }
  private element() { return this.elements().find((el) => el.dataset.blockId === this.selection?.id) ?? null; }
  private target() {
    const el = this.element();
    if (this.selection?.socialId) return this.socialElements().find((icon) => icon.dataset.socialId === this.selection?.socialId) ?? el;
    return this.selection?.part ? el?.querySelector<HTMLElement>(`[data-profile-part="${this.selection.part}"]`) ?? el : el;
  }
  private socialElements() { return [...(this.element()?.querySelectorAll<HTMLElement>('[data-social-id]') ?? [])]; }
  private editSelection() {
    if (this.selection?.socialId) this.o.editSocial(this.selection.socialId);
    else if (this.selection) this.o.edit(this.selection.id);
  }
  private block() { return this.o.config().blocks.find((b) => b.id === this.selection?.id); }
  private select(selection: Selection | null) { this.selection = selection; this.position(); this.inspector(); }
  private position() {
    if (!this.doc || !this.ui) return;
    this.doc.querySelectorAll('.canvas-selected,.canvas-part-selected').forEach((el) => el.classList.remove('canvas-selected', 'canvas-part-selected'));
    const target = this.target();
    this.ui.hidden = !this.enabled || !target;
    this.ui.classList.toggle('is-social', !!this.selection?.socialId);
    if (!this.enabled || !target) return;
    target.classList.add(this.selection?.part || this.selection?.socialId ? 'canvas-part-selected' : 'canvas-selected');
    this.ui.querySelector<HTMLElement>('.canvas-resize')!.hidden = !!this.selection?.socialId || this.selection?.part === 'name';
    const rect = target.getBoundingClientRect(), win = this.doc.defaultView!;
    const left = Math.max(5, rect.left);
    this.ui.style.left = `${left + win.scrollX}px`; this.ui.style.top = `${rect.top + win.scrollY}px`;
    this.ui.style.width = `${Math.min(rect.right, win.innerWidth - 5) - left}px`; this.ui.style.height = `${rect.height}px`;
  }
  private title() {
    const b = this.block(), cfg = this.o.config();
    if (!b) return 'Tap an item to select';
    if (this.selection?.socialId) { const item = cfg.social.find((s, i) => socialKey(s, i) === this.selection?.socialId); return `${platform(item?.platform ?? '')?.label ?? 'Social'} icon`; }
    if (this.selection?.part === 'cover') return 'Cover image';
    if (this.selection?.part === 'photo') return 'Photo or logo';
    if (this.selection?.part === 'name') return 'Name';
    if (b.type === 'link') return cfg.links.find((l) => l.id === b.linkId)?.title || 'Link';
    return b.title || ({ profile: 'Profile', name: 'Name', bio: 'Bio', highlights: 'Highlights', social: 'Social icons', youtube: 'YouTube video', image: 'Image', post: 'Post preview' }[b.type]);
  }
  private image() {
    const cfg = this.o.config(), b = this.block();
    if (!b) return null;
    if (b.type === 'profile') {
      if (this.selection?.part === 'name') return null;
      const part = this.selection?.part ?? 'photo', p = cfg.profile;
      const src = part === 'cover' ? safeImg(p.cover) : safeImg(p.photo);
      if (!src) return null;
      return { src, frame: part === 'cover' ? p.coverFrame : p.photoFrame,
        set: (value: ReturnType<typeof normalizeImageFrame> | undefined) => { if (part === 'cover') p.coverFrame = value; else p.photoFrame = value; },
        img: this.element()?.querySelector<HTMLImageElement>(`[data-profile-part="${part}"] img`) ?? null };
    }
    const item = b.type === 'link' ? cfg.links.find((l) => l.id === b.linkId) : b;
    if (!item) return null;
    const src = b.type === 'youtube' ? youtubeCover(b.url ?? '', b.image) : safeImg(item.image);
    return src ? { src, frame: item.imageFrame, set: (value: ReturnType<typeof normalizeImageFrame> | undefined) => { item.imageFrame = value; }, img: this.element()?.querySelector<HTMLImageElement>('img') ?? null } : null;
  }
  private span() {
    const b = this.block(); if (b?.design) return b.design.span;
    const value = this.doc?.defaultView?.getComputedStyle(this.element()!).gridColumnEnd.match(/span\s+(\d+)/);
    return value ? Number(value[1]) : 12;
  }
  private applySpan(value: number) {
    const b = this.block(), el = this.element(); if (!b || !el) return;
    b.design = { span: Math.round(bounded(value, 4, 12) ?? 12), align: b.design?.align ?? 'auto' };
    el.style.gridColumn = designStyle(b.design).replace('grid-column:', ''); el.dataset.layoutSpan = String(b.design.span);
    const tier = sizeTier(b.design.span); if (tier) el.dataset.size = tier; else delete el.dataset.size; // text scales live while resizing
    this.position();
  }
  private finish(redraw = true) { this.history.end(); this.o.commit(redraw); this.updateHistoryButtons(); }
  private action(fn: () => void) { this.history.begin(); fn(); this.finish(); this.inspector(); }
  private undo() { if (this.busy) this.stopGesture?.(); this.o.undo(); }
  private redo() { if (this.busy) this.stopGesture?.(); this.o.redo(); }
  private updateHistoryButtons() {
    this.o.inspector.querySelector<HTMLButtonElement>('[data-undo]')?.toggleAttribute('disabled', !this.o.canUndo());
    this.o.inspector.querySelector<HTMLButtonElement>('[data-redo]')?.toggleAttribute('disabled', !this.o.canRedo());
  }
  private range(label: string, value: number, min: number, max: number, step: number, set: (v: number) => void, format: (v: number) => string) {
    const output = h('output', {}, format(value));
    const input = h('input', { type: 'range', value, min, max, step, 'aria-label': label, 'data-control': label,
      oninput: (event: Event) => { this.history.begin(); const v = Number((event.target as HTMLInputElement).value); set(v); output.textContent = format(v); this.position(); },
      onchange: () => this.finish(),
      onpointercancel: () => { this.history.cancel(); this.o.commit(true); },
    });
    return h('label', { class: 'canvas-range' }, h('span', {}, label, output), input);
  }
  private inspector() {
    this.o.inspector.hidden = !this.enabled;
    if (!this.enabled) return;
    const active = document.activeElement as HTMLInputElement | null, focus = this.o.inspector.contains(active) ? active?.dataset.control : undefined;
    const tools = h('div', { class: 'canvas-tools' },
      h('span', { class: 'canvas-selection-name' }, this.enabled ? this.title() : 'Preview'),
      h('button', { type: 'button', 'data-undo': '', disabled: !this.o.canUndo(), 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', onclick: () => this.undo() }, '↶'),
      h('button', { type: 'button', 'data-redo': '', disabled: !this.o.canRedo(), 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', onclick: () => this.redo() }, '↷'),
      h('button', { type: 'button', class: 'canvas-add', onclick: () => { this.pendingNew = new Set(this.o.config().blocks.map((b) => b.id)); this.o.add(); } }, '+ Add'));
    const b = this.block(), el = this.element();
    if (!b || !el) {
      this.o.inspector.replaceChildren(tools, h('p', { class: 'canvas-help' }, 'Drag any item to move it (on a phone, press and hold first). Tap an item, then drag its corner to resize it; double-click the corner to reset.'),
        this.range('Page spacing', this.o.config().look.spacing ?? 18, 8, 36, 1, (v) => { this.o.config().look.spacing = v; this.doc?.body.style.setProperty('--page-gap', `${v}px`); }, (v) => `${v}px`));
      return;
    }
    if (b.type === 'social' && this.selection?.socialId) {
      const position = this.socialElements().findIndex((item) => item.dataset.socialId === this.selection?.socialId);
      this.o.inspector.replaceChildren(tools,
        h('p', { class: 'canvas-help' }, 'Drag this icon to swap positions, or use the arrows. Edit icon changes its platform or link.'),
        h('div', { class: 'canvas-actions' },
          h('button', { type: 'button', onclick: () => this.editSelection() }, 'Edit icon'),
          h('button', { type: 'button', disabled: position <= 0, 'aria-label': 'Move icon left', onclick: () => this.nudgeSocial(-1) }, '←'),
          h('button', { type: 'button', disabled: position >= this.socialElements().length - 1, 'aria-label': 'Move icon right', onclick: () => this.nudgeSocial(1) }, '→')),
        this.socialPicker(),
        h('button', { type: 'button', class: 'canvas-reset', onclick: () => this.select({ id: b.id }) }, 'Move or resize the whole icon row'));
      return;
    }
    const image = this.image(), target = this.target();
    const crop = image?.img?.parentElement;
    const actions = h('div', { class: 'canvas-actions' },
      h('button', { type: 'button', onclick: () => this.o.edit(b.id) }, 'Edit content'),
      image && h('button', { type: 'button', onclick: () => {
        this.history.begin();
        adjustImage({ src: image.src, frame: image.frame, title: 'Adjust Image',
          round: !!crop?.classList.contains('avatar'), aspect: crop && crop.clientHeight ? crop.clientWidth / crop.clientHeight : undefined,
          onChange: (frame) => { image.set(frame); this.o.commit(false); }, onFinish: () => this.finish() });
      } }, 'Adjust image'),
      h('button', { type: 'button', 'aria-label': 'Move selected item up', onclick: () => this.nudge(-1) }, '↑'),
      h('button', { type: 'button', 'aria-label': 'Move selected item down', onclick: () => this.nudge(1) }, '↓'));
    const resizeProfile = b.type === 'profile' && !!this.selection?.part && this.selection.part !== 'name';
    const sizeControl = resizeProfile
      ? target?.classList.contains('avatar')
        ? this.range('Logo size', this.o.config().profile.photoSize ?? target.clientWidth, 48, 180, 1, (v) => this.setProfileSize(v, true), (v) => `${v}px`)
        : this.range(this.selection?.part === 'photo' ? 'Photo height' : 'Cover height', this.o.config().profile.coverHeight ?? target?.clientHeight ?? 184, 100, 540, 1, (v) => this.setProfileSize(v, false), (v) => `${v}px`)
      : this.range('Item width', this.span(), 4, 12, 1, (v) => this.applySpan(v), (v) => `${Math.round(v / 12 * 100)}%`);
    const width = h('div', { class: 'canvas-widths' }, [ { label: 'Full', span: 12 }, { label: 'Half', span: 6 }, { label: 'Third', span: 4 } ].map((o) => h('button', { type: 'button', class: this.span() === o.span ? 'on' : '', onclick: () => this.action(() => this.applySpan(o.span)) }, o.label)));
    const details = h('details', { class: 'canvas-details', open: this.detailsOpen, ontoggle: (e: Event) => { this.detailsOpen = (e.target as HTMLDetailsElement).open; } }, h('summary', {}, 'More design options'),
      segmented([{ value: 'auto', label: 'Flow' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], b.design?.align ?? 'auto', (align) => this.action(() => { b.design = { span: this.span(), align }; this.applySpan(b.design.span); })),
      image && this.range('Image zoom', normalizeImageFrame(image.frame).zoom, normalizeImageFrame(image.frame).fit === 'cover' ? 1 : .5, 4, .01, (zoom) => {
        const f = normalizeImageFrame({ ...image.frame, zoom }); image.set(f);
        const pictures = image.img?.closest('[data-profile-part]')?.querySelectorAll<HTMLImageElement>('img') ?? (image.img ? [image.img] : []);
        pictures.forEach((img) => { img.style.cssText = imageFrameStyle(f); });
      }, (v) => `${Math.round(v * 100)}%`),
      b.type === 'youtube' && segmented([{ value: 'landscape', label: '16:9' }, { value: 'wide', label: 'Wide' }, { value: 'square', label: 'Square' }], b.videoAspect ?? 'landscape', (aspect) => this.action(() => {
        b.videoAspect = aspect; this.element()?.querySelector<HTMLElement>('.video-player')?.style.setProperty('--video-aspect', videoRatio(aspect));
      })),
      h('button', { type: 'button', class: 'canvas-reset', onclick: () => this.action(() => {
        b.design = undefined;
        if (b.type === 'link') { const link = this.o.config().links.find((l) => l.id === b.linkId); if (link) link.buttonShape = undefined; }
        if (b.type === 'youtube') b.videoAspect = undefined;
        if (b.type === 'profile') { this.o.config().profile.photoSize = undefined; this.o.config().profile.coverHeight = undefined; }
        image?.set(undefined);
      }) }, 'Reset this layout'));
    const profileParts = b.type === 'profile' ? h('div', { class: 'canvas-parts' },
      h('button', { type: 'button', onclick: () => this.select({ id: b.id, part: 'photo' }) }, 'Photo / logo'),
      this.element()?.querySelector('[data-profile-part="name"]') && h('button', { type: 'button', onclick: () => this.select({ id: b.id, part: 'name' }) }, 'Name'),
      h('button', { type: 'button', onclick: () => this.element()?.querySelector('[data-profile-part=\"cover\"]') ? this.select({ id: b.id, part: 'cover' }) : this.o.edit(b.id) }, this.o.config().profile.cover ? 'Cover' : '+ Cover')) : null;
    const font = !this.selection?.part || this.selection.part === 'name' ? this.fontPicker(b) : null;
    const nameControls = b.type === 'name' || this.selection?.part === 'name' ? this.nameControls(b.type === 'name') : null;
    const link = b.type === 'link' ? this.o.config().links.find((l) => l.id === b.linkId) : undefined;
    const shape = link && usesButton(link, this.o.config().look.template) ? h('div', { class: 'canvas-shapes' }, h('p', {}, 'Button shape'),
      shapePicker(buttonShape(link, this.o.config().look.template), (value) => this.action(() => { link.buttonShape = value; el.dataset.buttonShape = value; }))) : null;
    const tileStyle = link && safeImg(link.image) && !usesButton(link, this.o.config().look.template)
      ? h('div', { class: 'canvas-shapes' }, h('p', {}, 'Image style'), tileStylePicker(link, this.o.config().look.template, (change) => this.action(change), false)) : null;
    this.o.inspector.replaceChildren(tools, actions, ...(profileParts ? [profileParts] : []), ...(b.type === 'social' ? [this.socialPicker()] : []), ...(nameControls ? [nameControls] : []), ...(shape ? [shape] : []), ...(tileStyle ? [tileStyle] : []), ...(font ? [font] : []),
      ...(this.selection?.part === 'name' ? [] : [sizeControl, width, details]));
    if (focus) [...this.o.inspector.querySelectorAll<HTMLInputElement>('input[data-control]')].find((input) => input.dataset.control === focus)?.focus({ preventScroll: true });
  }
  /** "Page" follows the page font (Appearance); any other choice applies to this item only. */
  private fontPicker(b: PageBlock) {
    const options: { value: FontId | ''; label: string }[] = [{ value: '', label: 'Page' }, ...FONT_IDS.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))];
    return h('div', { class: 'canvas-shapes' }, h('p', {}, 'Font'),
      h('div', { class: 'font-chips' }, options.map((o) => h('button', {
        type: 'button', class: 'font-chip' + ((b.font ?? '') === o.value ? ' on' : ''), 'aria-pressed': String((b.font ?? '') === o.value),
        style: o.value ? `font-family:${FONTS[o.value]}` : undefined, title: o.value ? `${o.label} font for this item` : 'Use the page font',
        onclick: () => this.action(() => { if (o.value) b.font = o.value; else delete b.font; }),
      }, h('b', {}, 'Aa'), h('span', {}, o.label)))));
  }
  /** Name alignment, and moving the name apart from the photo (or back). */
  private nameControls(separate: boolean) {
    const cfg = this.o.config(), p = cfg.profile;
    return h('div', { class: 'canvas-shapes' }, h('p', {}, 'Name position'),
      segmented(NAME_ALIGN.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })), p.nameAlign ?? (cfg.look.template === 'studio' ? 'left' : 'center'), (value) => this.action(() => { p.nameAlign = value; })),
      h('button', { type: 'button', class: 'canvas-reset', onclick: () => {
        this.action(() => separateName(cfg, !separate));
        this.select(separate ? { id: cfg.blocks.find((x) => x.type === 'profile')!.id, part: 'name' } : { id: 'name' });
      } }, separate ? 'Put name back with the photo' : 'Move name separately'));
  }
  private socialPicker() {
    return h('div', { class: 'canvas-social-picker', role: 'group', 'aria-label': 'Choose a social icon' }, this.socialElements().map((el) => {
      const id = el.dataset.socialId!, label = el.getAttribute('aria-label') ?? 'Social';
      const button = h('button', { type: 'button', 'aria-label': `Select ${label} icon`, 'aria-pressed': String(this.selection?.socialId === id), onclick: () => this.select({ id: this.selection!.id, socialId: id }) });
      const item = this.o.config().social.find((s, i) => socialKey(s, i) === id);
      button.append(socialGlyph(item?.platform ?? ''));
      button.append(h('span', {}, label)); return button;
    }));
  }
  private nudgeSocial(direction: number) {
    const icons = this.socialElements(), index = icons.findIndex((el) => el.dataset.socialId === this.selection?.socialId);
    const target = icons[index + direction]?.dataset.socialId;
    if (target && this.selection?.socialId) this.action(() => moveSocial(this.o.config().social, this.selection!.socialId!, target, direction > 0));
  }
  private setProfileSize(value: number, avatar: boolean) {
    const el = this.element(); if (!el) return;
    if (avatar) { this.o.config().profile.photoSize = bounded(value, 48, 180); el.setAttribute('data-avatar-custom', ''); el.style.setProperty('--avatar-size', `${this.o.config().profile.photoSize}px`); }
    else { this.o.config().profile.coverHeight = bounded(value, 100, 540); el.setAttribute('data-cover-custom', ''); el.style.setProperty('--cover-height', `${this.o.config().profile.coverHeight}px`); }
    this.position();
  }
  private nudge(direction: number) {
    const ids = this.elements().map((el) => el.dataset.blockId!);
    const i = ids.indexOf(this.selection!.id), target = ids[i + direction];
    if (target) this.action(() => moveBlock(this.o.config(), this.selection!.id, target, direction > 0));
  }
  private gesture(event: PointerEvent, move: (e: PointerEvent) => void, finish: (cancel: boolean) => void, handle = event.currentTarget as HTMLElement) {
    if (this.busy || !this.enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation(); this.busy = true; this.history.begin();
    const doc = this.doc!, win = doc.defaultView!;
    handle.setPointerCapture(event.pointerId);
    const onMove = (e: PointerEvent) => { if (e.pointerId === event.pointerId) move(e); };
    // Some browsers (Safari) stop sending moves to the preview once the pointer leaves it. The editor page still
    // receives them, so convert those into preview coordinates (the preview is scaled to fit).
    const frame = win.frameElement as HTMLElement | null;
    const onOuterMove = (e: PointerEvent) => {
      if (!frame || e.pointerType !== event.pointerType) return;
      const r = frame.getBoundingClientRect(), scale = r.width / (frame.offsetWidth || r.width);
      move({ clientX: (e.clientX - r.left) / scale, clientY: (e.clientY - r.top) / scale, pointerId: event.pointerId } as PointerEvent);
    };
    let ended = false;
    const end = (cancel: boolean) => {
      if (ended) return; ended = true;
      doc.removeEventListener('pointermove', onMove, true); doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', cancelled, true); handle.removeEventListener('lostpointercapture', cancelled);
      document.removeEventListener('pointerup', up, true); document.removeEventListener('pointermove', onOuterMove, true); win.removeEventListener('blur', cancelled);
      this.stopGesture = null; if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      this.busy = false; this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 0);
      finish(cancel); if (cancel) this.history.cancel(); else this.history.end(); this.o.commit(true); this.inspector(); this.position();
    };
    const up = (e: PointerEvent) => { if (e.pointerId === event.pointerId) end(false); }, cancelled = () => end(true);
    doc.addEventListener('pointermove', onMove, true); doc.addEventListener('pointerup', up, true); doc.addEventListener('pointercancel', cancelled, true); handle.addEventListener('lostpointercapture', cancelled);
    document.addEventListener('pointerup', up, true); document.addEventListener('pointermove', onOuterMove, true); win.addEventListener('blur', cancelled);
    this.stopGesture = cancelled;
  }
  private resize(event: PointerEvent) {
    const b = this.block(), target = this.target(), el = this.element(); if (!b || !target || !el) return;
    const x = event.clientX, y = event.clientY, span = this.span(), width = this.doc!.querySelector<HTMLElement>('.stack')!.clientWidth;
    const rect = target.getBoundingClientRect(), avatar = target.classList.contains('avatar'), part = b.type === 'profile' && this.selection?.part;
    this.gesture(event, (e) => {
      if (part) this.setProfileSize(avatar ? rect.width + (e.clientX - x + e.clientY - y) / 2 : rect.height + e.clientY - y, avatar);
      else { const value = span + (e.clientX - x) / width * 12; this.applySpan(value > 11.2 ? 12 : value); } // full width is easy to hit again
    }, () => {});
  }
  /** Double-clicking the resize handle returns the selection to its template size. */
  private resetSize() {
    const b = this.block(); if (!b) return;
    this.action(() => {
      if (b.type === 'profile' && this.selection?.part) {
        const p = this.o.config().profile;
        if (this.target()?.classList.contains('avatar')) p.photoSize = undefined; else p.coverHeight = undefined;
      } else if (b.design) b.design = b.design.align === 'auto' ? undefined : { ...b.design, span: 12 };
    });
  }
  /** `handle` is needed when the drag starts after its pointerdown event has finished (see pressToDrag). */
  private drag(event: PointerEvent, handle?: HTMLElement) {
    if (this.selection?.socialId) { this.dragSocial(event); return; }
    const source = this.element(), selection = this.selection; if (!source || !selection || this.busy) return;
    const doc = this.doc!, win = doc.defaultView!, rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement; ghost.removeAttribute('data-block-id'); ghost.classList.add('canvas-ghost'); ghost.style.width = `${Math.min(rect.width, win.innerWidth - 16)}px`;
    const marker = doc.createElement('div'); marker.className = 'canvas-drop';
    let destination: ReturnType<typeof dropTarget> = null, x = event.clientX, y = event.clientY, animation = 0, last = 0, moved = false;
    const update = () => {
      ghost.style.left = `${Math.max(8, Math.min(win.innerWidth - ghost.offsetWidth - 8, x - 16))}px`; ghost.style.top = `${y - 16}px`;
      const rects: BlockRect[] = this.elements().map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.blockId!, left: r.left, top: r.top, width: r.width, height: r.height }; });
      destination = dropTarget(rects, x, y, selection.id, win.innerWidth);
      const r = rects.find((r) => r.id === destination?.id);
      marker.hidden = !r;
      if (r && destination) {
        const vertical = r.width < win.innerWidth * .7 && y >= r.top && y <= r.top + r.height;
        marker.style.left = `${(vertical ? r.left + (destination.after ? r.width : 0) : r.left) + win.scrollX}px`;
        marker.style.top = `${(vertical ? r.top : r.top + (destination.after ? r.height : 0)) + win.scrollY}px`;
        marker.style.width = vertical ? '4px' : `${r.width}px`; marker.style.height = vertical ? `${r.height}px` : '4px';
      }
    };
    const tick = (time: number) => {
      if (!this.busy) return;
      const factor = Math.min(2, (time - (last || time)) / 16.7); last = time;
      const delta = !moved ? 0 : y < 75 ? -Math.min(15, (75 - y) / 4) : y > win.innerHeight - 75 ? Math.min(15, (y - win.innerHeight + 75) / 4) : 0;
      if (delta) { win.scrollBy(0, delta * factor); update(); }
      animation = requestAnimationFrame(tick);
    };
    this.gesture(event, (e) => { moved ||= Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) >= 6; x = e.clientX; y = e.clientY; if (moved) update(); }, (cancel) => {
      cancelAnimationFrame(animation); ghost.remove(); marker.remove(); source.classList.remove('canvas-source'); if (this.ui) this.ui.style.opacity = '';
      if (!cancel && moved && destination) moveBlock(this.o.config(), selection.id, destination.id, destination.after);
    }, handle);
    if (this.busy) { doc.body.append(ghost, marker); source.classList.add('canvas-source'); if (this.ui) this.ui.style.opacity = '0'; update(); animation = requestAnimationFrame(tick); }
  }
  private dragSocial(event: PointerEvent) {
    const source = this.target(), id = this.selection?.socialId;
    if (!source || !id || this.busy) return;
    const doc = this.doc!, win = doc.defaultView!, rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-social-id'); ghost.classList.add('canvas-social-ghost');
    ghost.style.width = `${rect.width}px`; ghost.style.height = `${rect.height}px`;
    const marker = doc.createElement('div'); marker.className = 'canvas-drop';
    const startX = event.clientX, startY = event.clientY;
    let moved = false, destination: ReturnType<typeof dropTarget> = null;
    this.gesture(event, (e) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      if (!moved) { moved = true; doc.body.append(ghost, marker); source.classList.add('canvas-source'); if (this.ui) this.ui.style.opacity = '0'; }
      ghost.style.left = `${e.clientX - rect.width / 2}px`; ghost.style.top = `${e.clientY - rect.height / 2}px`;
      const rects = this.socialElements().map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.socialId!, left: r.left, top: r.top, width: r.width, height: r.height }; });
      destination = dropTarget(rects, e.clientX, e.clientY, id, win.innerWidth);
      const target = rects.find((r) => r.id === destination?.id); marker.hidden = !target;
      if (target && destination) {
        marker.style.left = `${target.left + (destination.after ? target.width : 0) + win.scrollX}px`;
        marker.style.top = `${target.top + win.scrollY}px`; marker.style.width = '3px'; marker.style.height = `${target.height}px`;
      }
    }, (cancel) => {
      ghost.remove(); marker.remove(); source.classList.remove('canvas-source'); if (this.ui) this.ui.style.opacity = '';
      if (!cancel && moved && destination) moveSocial(this.o.config().social, id, destination.id, destination.after);
    });
  }
}
