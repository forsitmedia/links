import type { Config, PageBlock, Template } from '../../lib/types';
import { safeImg } from '../../lib/types';
import { LayoutHistory, arrangeLayout, bounded, normalizeBlockDesign, designStyle, dropTarget, moveBlock, separateName, separateGroup, sizeTier, type BlockRect } from '../../lib/layout';
import { TEXT_STYLE_OPTIONS } from './block-editor';
import { NAME_ALIGN, FONT_IDS, type FontId } from '../../lib/types';
import { FONTS, FONT_LABELS } from '../../lib/look';
import { imageFrameStyle, normalizeImageFrame } from '../../lib/image-frame';
import { youtubeCover, videoRatio } from '../../lib/media';
import { icon } from '../../lib/icons';
import { platform } from '../../lib/platforms';
import { moveSocial, socialKey } from '../../lib/social-order';
import { buttonShape, buttonStyle, usesButton } from '../../lib/button-shape';
import { adjustImage } from './image-editor';
import { shapePicker, stylePicker, cardPicker } from './shape-picker';
import { CARD_TYPES } from '../../lib/types';
import { tileStylePicker } from './tile-style-picker';
import { TILE_PRESETS } from '../../lib/tile-style';
import { socialGlyph } from './social-glyph';
import { guardTouchScroll, pressToDrag } from './reorder';
import { h, segmented, swatches, toast } from './ui';
import css from './canvas.css?inline';
import { plain } from '../../lib/render';
import { Guides, guideCss } from './guides';

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
  private guides: Guides | null = null;
  private freeDragging = false;
  private toolTap = 0;
  private clip = '';
  /** Several items selected (box, Shift+click or a group): their ids. Empty for a single selection. */
  private multi: string[] = [];
  private typing: HTMLElement | null = null;
  private typedBefore = false;
  private pointer: { x: number; y: number } | null = null;
  /** Free move: dragging an item places it anywhere (other items stay put) instead of changing the order. Shift does the same for one drag. */
  private freeMode = (() => { try { return localStorage.getItem('yourlinki-free-move') === '1'; } catch { return false; } })();
  constructor(private o: Options) { this.history = new LayoutHistory(o.config); }

  mount(doc: Document) {
    this.dispose?.();
    this.doc = doc;
    const win = doc.defaultView!;
    const style = doc.createElement('style'); style.textContent = css + guideCss; doc.head.append(style);
    this.guides = new Guides(doc);
    const ui = doc.createElement('div'); ui.className = 'canvas-ui';
    ui.innerHTML = `<button type="button" class="canvas-drag" aria-label="Drag selected item" title="Drag to reorder">${icon('grip', 17)}</button><button type="button" class="canvas-edit" aria-label="Edit selected item">Edit</button><button type="button" class="canvas-resize" aria-label="Resize selected item from its right side" title="Drag to change the width, double-click to reset"></button>`
      + ['left', 'top', 'bottom'].map((side) => `<button type="button" class="canvas-side" data-side="${side}" aria-label="Stretch selected item from its ${side} side" title="${side === 'left' ? 'Drag to change the width' : 'Drag to change the height'}, double-click to reset"></button>`).join('')
      + `<button type="button" class="canvas-rotate" aria-label="Turn selected item" title="Drag to turn, Shift for 15° steps, double-click to straighten">↻</button><span class="canvas-angle" hidden></span>`
      + ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => `<button type="button" class="canvas-side canvas-corner" data-side="${corner}" aria-label="Resize selected item from its ${corner.replace('-', ' ')} corner" title="Drag to scale everything together (size and text), double-click to reset"></button>`).join('');
    doc.body.append(ui); this.ui = ui;
    ui.querySelector('.canvas-drag')!.addEventListener('pointerdown', (e) => this.drag(e as PointerEvent));
    ui.querySelector('.canvas-resize')!.addEventListener('pointerdown', (e) => this.resize(e as PointerEvent));
    ui.querySelector('.canvas-resize')!.addEventListener('dblclick', () => this.resetSize());
    ui.querySelector('.canvas-rotate')!.addEventListener('pointerdown', (e) => this.turn(e as PointerEvent));
    ui.querySelector('.canvas-rotate')!.addEventListener('dblclick', () => this.action(() => { const b = this.block(); if (b) b.rotate = undefined; }));
    ui.querySelectorAll<HTMLElement>('.canvas-side').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => this.stretch(e as PointerEvent, handle.dataset.side!));
      handle.addEventListener('dblclick', () => {
        const side = handle.dataset.side!;
        if (side.includes('left') || side.includes('right')) this.resetSize();
        if (side.includes('top') || side.includes('bottom')) this.action(() => { const b = this.block(); if (b) { b.height = undefined; if (side.includes('-')) b.textScale = undefined; } });
      });
    });
    ui.querySelector('.canvas-edit')!.addEventListener('click', () => this.editSelection());
    const socialStarts = [...doc.querySelectorAll<HTMLElement>('.social:not([data-part]) [data-social-id]')].map((el) => {
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
      if (this.typing && this.typing.contains(target)) return; // placing the cursor or selecting words
      if (!target?.closest || target.closest('.canvas-ui, .social:not([data-part]) [data-social-id]')) return;
      const block = target.closest<HTMLElement>('[data-block-id]');
      if (!block) { if (e.pointerType === 'mouse') this.boxSelect(e); return; }
      const id = block.dataset.blockId!;
      if (e.shiftKey) return; // Shift+click adds to the selection (see click)
      if (this.multi.includes(id) || this.groupOf(id).length > 1) {
        pressToDrag(e, () => {
          if (!this.multi.includes(id)) this.selectMany(this.groupOf(id), id);
          if (this.freeMode || e.shiftKey) this.dragMany(e, block); else this.dragManyInOrder(e, block);
        });
        return;
      }
      pressToDrag(e, () => {
        if (this.selection?.id !== id || this.selection.socialId) this.select({ id });
        this.drag(e, block);
      });
    };
    const menu = (e: MouseEvent) => { if (this.enabled && (e.target as HTMLElement).closest?.('[data-block-id]')) e.preventDefault(); }; // long-press menus
    const click = (e: MouseEvent) => {
      if (!this.enabled) return;
      const target = e.target as HTMLElement;
      if (!target?.closest || target.closest('.canvas-ui')) return;
      if (this.typing && this.typing.contains(target)) return;
      // Music and disco buttons: a tap plays them as on the page, a double-click opens their settings instead.
      // The tap waits a moment to see whether a second one follows; it then goes through as a scripted (untrusted) click.
      const tool = target.closest<HTMLButtonElement>('.page-tools button');
      if (tool) {
        if (!e.isTrusted) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (this.toolTap) { clearTimeout(this.toolTap); this.toolTap = 0; dispatchEvent(new Event('yourlinki-open-music')); return; }
        this.toolTap = window.setTimeout(() => { this.toolTap = 0; tool.click(); }, 260);
        return;
      }
      e.preventDefault(); e.stopImmediatePropagation();
      if (this.busy || this.suppressClick) { this.suppressClick = false; return; }
      const block = target.closest<HTMLElement>('[data-block-id]');
      if (!block) { this.select(null); return; }
      const part = target.closest<HTMLElement>('[data-profile-part]')?.dataset.profilePart as Selection['part'];
      const socialId = block.hasAttribute('data-part') ? undefined : target.closest<HTMLElement>('[data-social-id]')?.dataset.socialId;
      const id = block.dataset.blockId!, current = this.selection;
      if (e.shiftKey && !part && !socialId) { // Shift+click: add or remove (with its group)
        const now = this.multi.length ? this.multi : current ? this.groupOf(current.id) : [];
        const these = this.groupOf(id), next = now.includes(id) ? now.filter((x) => !these.includes(x)) : [...now, ...these.filter((x) => !now.includes(x))];
        if (next.length > 1) this.selectMany(next, next[next.length - 1]); else this.select(next.length ? { id: next[0] } : null);
        return;
      }
      if (this.groupOf(id).length > 1 && !this.multi.includes(id)) { this.selectMany(this.groupOf(id), id); return; }
      if (this.multi.length > 1 && this.multi.includes(id)) { this.selectMany(this.multi, id); return; }
      // A second tap on what is already selected (or a double-click) opens its editor.
      if (current && current.id === id && current.part === part && current.socialId === socialId) { this.editSelection(e); return; }
      this.select({ id, ...(part ? { part } : {}), ...(socialId ? { socialId } : {}) });
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.o.save(); return; }
      // Undo works in the page too, with or without a selection.
      if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); e.key.toLowerCase() === 'y' || e.shiftKey ? this.redo() : this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { if (this.paste()) e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); this.group(!e.shiftKey); return; }
      if ((e.ctrlKey || e.metaKey) && ['[', ']', '{', '}'].includes(e.key)) { e.preventDefault(); const up = e.key === ']' || e.key === '}'; this.layer(e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward'); return; }
      if (!this.enabled || !this.selection) return;
      if (e.key === 'Escape') { e.preventDefault(); if (this.busy) this.stopGesture?.(); else this.select(null); }
      if (this.busy) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !this.doc?.getSelection()?.toString()) { if (this.copySelection()) e.preventDefault(); return; }
      if (this.selection?.socialId && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); this.nudgeSocial(e.key === 'ArrowLeft' ? -1 : 1); }
    };
    doc.addEventListener('pointerdown', press);
    doc.addEventListener('pointermove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; });
    doc.documentElement.addEventListener('pointerleave', () => { this.pointer = null; });
    doc.addEventListener('contextmenu', menu);
    doc.addEventListener('click', click, true);

    doc.addEventListener('keydown', key);
    let positionFrame = 0;
    const update = () => {
      if (!this.enabled || positionFrame) return;
      positionFrame = win.requestAnimationFrame(() => { positionFrame = 0; if (this.enabled) this.position(); });
    };
    win.addEventListener('scroll', update, { passive: true }); win.addEventListener('resize', update);
    const observer = new ResizeObserver(update); observer.observe(doc.querySelector('.stack')!);
    this.dispose = () => {
      win.cancelAnimationFrame(positionFrame);
      this.stopGesture?.(); socialStarts.forEach((remove) => remove()); observer.disconnect(); doc.removeEventListener('pointerdown', press); doc.removeEventListener('contextmenu', menu); doc.removeEventListener('click', click, true); doc.removeEventListener('keydown', key);
      win.removeEventListener('scroll', update); win.removeEventListener('resize', update); ui.remove(); style.remove(); this.guides?.remove(); this.guides = null;
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
  private editSelection(e?: MouseEvent) {
    if (this.selection?.socialId) this.o.editSocial(this.selection.socialId);
    else if (this.block()?.type === 'text') this.typeInPlace(e);
    else if (this.selection) this.o.edit(this.selection.id);
  }
  /** Text items are typed right on the page: the cursor goes where you clicked; clicking outside or Escape finishes.
   * What is typed goes back to the text's marks (bold, italic, underline, crossed out, links, lists), so formatting stays. */
  private typeInPlace(e?: MouseEvent) {
    const b = this.block(), el = this.element(); if (!b || !el || this.typing) return;
    const doc = this.doc!, target = el.querySelector<HTMLElement>('.fit') ?? el, before = b.title ?? '', id = b.id;
    let done = false;
    this.typing = target;
    target.contentEditable = 'true'; target.spellcheck = true;
    el.classList.add('canvas-typing'); if (this.ui) this.ui.style.visibility = 'hidden';
    target.focus({ preventScroll: true });
    const sel = doc.getSelection()!, at = e && (doc as any).caretRangeFromPoint?.(e.clientX, e.clientY);
    if (at) { sel.removeAllRanges(); sel.addRange(at); } else { const r = doc.createRange(); r.selectNodeContents(target); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    const keys = (k: KeyboardEvent) => {
      if (k.key === 'Escape') { k.preventDefault(); finish(); }
      if (k.key === 'Enter') { k.preventDefault(); doc.execCommand('insertText', false, '\n'); } // a new line inside the text, not a new block
      k.stopPropagation(); // typing never deletes, copies or undoes items
    };
    const finish = () => {
      if (done) return; done = true;
      target.removeEventListener('keydown', keys); target.removeEventListener('blur', finish);
      target.contentEditable = 'false'; el.classList.remove('canvas-typing'); this.typing = null;
      if (this.ui) this.ui.style.visibility = '';
      const text = markdown(target).replace(/\n+$/, '');
      // The page's data may have been refreshed meanwhile: write to the item as it is now.
      if (text.trim() && text !== before) this.action(() => { const item = this.o.config().blocks.find((x) => x.id === id); if (item) item.title = text; });
      else this.o.commit(true); // nothing typed (or all deleted): the text stays as it was
    };
    target.addEventListener('keydown', keys); target.addEventListener('blur', finish);
    if (!this.typedBefore) { this.typedBefore = true; toast('Type on the page. Click outside or press Esc when done.'); }
  }
  /** Delete key: removes the selected item. The profile, bio, highlights and social row are hidden instead (Show on page brings them back). */
  /** Copy (Cmd/Ctrl+C): keeps the selected item, as it is now, to paste as many times as wanted. */
  copySelection() {
    if (this.enabled && !this.busy && this.multi.length > 1) {
      const cfg = this.o.config(), blocks = cfg.blocks.filter((b) => this.multi.includes(b.id) && !['profile', 'name', 'bio', 'highlights', 'social', 'space'].includes(b.type));
      this.clip = JSON.stringify({ blocks, links: cfg.links.filter((l) => blocks.some((b) => b.linkId === l.id)) });
      try { localStorage.setItem('yourlinki-clip', this.clip); } catch {}
      toast(`${blocks.length} items copied. Press ⌘V / Ctrl+V to paste.`); return true;
    }
    const b = this.block(); if (!this.enabled || this.busy || !b || this.selection?.socialId || this.selection?.part) return false;
    if (['profile', 'name', 'bio', 'highlights', 'social'].includes(b.type)) { toast('This item is one of a kind, so it can\'t be copied.'); return true; }
    const cfg = this.o.config(), link = b.type === 'link' ? cfg.links.find((l) => l.id === b.linkId) : undefined;
    this.clip = JSON.stringify({ block: b, link });
    try { localStorage.setItem('yourlinki-clip', this.clip); } catch {}
    toast('Copied. Press ⌘V / Ctrl+V to paste.');
    return true;
  }
  /** Paste (Cmd/Ctrl+V): a copy goes right after the selected item (or at the end) and gets selected. */
  paste() {
    if (!this.enabled || this.busy) return false;
    let clip = this.clip; if (!clip) { try { clip = localStorage.getItem('yourlinki-clip') ?? ''; } catch {} }
    if (!clip) return false;
    const parsed = JSON.parse(clip);
    if (parsed.blocks) return this.pasteMany(parsed.blocks, parsed.links ?? []);
    const { block, link } = parsed as { block: PageBlock; link?: Config['links'][number] };
    const key = Math.random().toString(36).slice(2, 8);
    const copy: PageBlock = { ...structuredClone(block), id: `${block.type}:${key}` };
    // Where you are working: the pointer if it is over the page, else the middle of what is on screen.
    const win = this.doc!.defaultView!, stack = this.doc!.querySelector<HTMLElement>('.stack')!, box = stack.getBoundingClientRect();
    const p = this.pointer && this.pointer.y >= 0 && this.pointer.y <= win.innerHeight ? this.pointer : { x: win.innerWidth / 2, y: win.innerHeight / 2 };
    if (copy.float) { // a free item lands right there, centered on the point
      const original = this.doc!.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(block.id)}"]`);
      const w = original?.offsetWidth ?? box.width * .4, ht = original?.offsetHeight ?? 60;
      copy.float = { x: Math.round((p.x - box.left - w / 2) / box.width * 10000) / 100, y: Math.round(p.y - box.top - ht / 2), w: Math.round(w / box.width * 10000) / 100 };
    }
    // An item in the column goes after the last item above that point.
    const above = this.elements().filter((el) => !el.hasAttribute('data-float') && el.getClientRects().length && el.getBoundingClientRect().top + el.offsetHeight / 2 <= p.y).pop()?.dataset.blockId;
    this.action(() => {
      const cfg = this.o.config();
      if (link) { const l = { ...structuredClone(link), id: key }; cfg.links.push(l); copy.linkId = l.id; copy.id = `link:${key}`; }
      const at = above ? cfg.blocks.findIndex((x) => x.id === above) + 1 : copy.float ? cfg.blocks.length : cfg.blocks.findIndex((x) => x.type === 'profile') + 1; // never above the photo
      cfg.blocks.splice(at, 0, copy);
    });
    this.select({ id: copy.id });
    return true;
  }
  /** Pastes a copied selection where you are working: free items keep their arrangement around the pointer, the others go in the column together. */
  private pasteMany(blocks: PageBlock[], links: Config['links']) {
    const win = this.doc!.defaultView!, box = this.doc!.querySelector<HTMLElement>('.stack')!.getBoundingClientRect();
    const p = this.pointer && this.pointer.y >= 0 && this.pointer.y <= win.innerHeight ? this.pointer : { x: win.innerWidth / 2, y: win.innerHeight / 2 };
    const groups = new Map<string, string>(), key = () => Math.random().toString(36).slice(2, 8);
    const copies = blocks.map((b) => {
      const c: PageBlock = { ...structuredClone(b), id: `${b.type}:${key()}` };
      if (c.group) { if (!groups.has(c.group)) groups.set(c.group, key() + key()); c.group = groups.get(c.group); }
      return { c, from: b };
    });
    // Free items: the copy keeps their arrangement, its top-left item landing at the pointer.
    const free = copies.filter(({ from }) => from.float).map(({ c, from }) => ({ c, el: this.doc!.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(from.id)}"]`) }));
    const left = Math.min(...free.map(({ el }) => el?.getBoundingClientRect().left ?? box.left)), top = Math.min(...free.map(({ el }) => el?.getBoundingClientRect().top ?? box.top));
    for (const { c, el } of free) {
      const r = el?.getBoundingClientRect() ?? new DOMRect(left, top, box.width * .4, 60);
      c.float = { x: Math.round((p.x + r.left - left - box.left) / box.width * 10000) / 100, y: Math.round(p.y + r.top - top - box.top), w: Math.round(r.width / box.width * 10000) / 100 };
    }
    const above = this.elements().filter((el) => !el.hasAttribute('data-float') && el.getClientRects().length && el.getBoundingClientRect().top + el.offsetHeight / 2 <= p.y).pop()?.dataset.blockId;
    this.action(() => {
      const cfg = this.o.config();
      for (const { c, from } of copies) {
        const l = links.find((x) => x.id === from.linkId);
        if (l) { const id = key(); cfg.links.push({ ...structuredClone(l), id }); c.linkId = id; c.id = `link:${id}`; }
      }
      const at = above ? cfg.blocks.findIndex((x) => x.id === above) + 1 : cfg.blocks.findIndex((x) => x.type === 'profile') + 1;
      cfg.blocks.splice(at, 0, ...copies.map(({ c }) => c));
    });
    this.selectMany(copies.map(({ c }) => c.id));
    return true;
  }
  deleteSelection() {
    if (this.multi.length > 1 && !this.busy) {
      const ids = this.multi, cfg = this.o.config(), keep = ['profile', 'name', 'bio', 'highlights', 'social'];
      this.action(() => {
        for (const b of cfg.blocks) if (ids.includes(b.id) && keep.includes(b.type)) b.hidden = true;
        const gone = cfg.blocks.filter((b) => ids.includes(b.id) && !keep.includes(b.type));
        cfg.links = cfg.links.filter((l) => !gone.some((b) => b.linkId === l.id));
        cfg.blocks = cfg.blocks.filter((b) => !gone.includes(b));
      });
      this.select(null); toast(`${ids.length} items deleted · Undo with ↶`); return;
    }
    const b = this.block(); if (!b || this.busy) return;
    const cfg = this.o.config();
    let message = 'Deleted';
    this.action(() => {
      if (this.selection?.socialId) {
        const id = this.selection.socialId;
        cfg.social = cfg.social.filter((s, i) => socialKey(s, i) !== id);
        message = 'Icon deleted';
      } else if (b.type === 'name') {
        separateName(cfg, false);
        message = 'Name moved back to the photo';
      } else if (['profile', 'bio', 'highlights'].includes(b.type) || (b.type === 'social' && !b.part)) {
        b.hidden = true;
        message = 'Hidden. Turn on Show on page to bring it back';
      } else if (b.type === 'social' && b.part) {
        cfg.social = cfg.social.filter((s, i) => socialKey(s, i) !== b.part);
        message = 'Icon deleted';
      } else {
        if (b.type === 'link') cfg.links = cfg.links.filter((l) => l.id !== b.linkId);
        cfg.blocks = cfg.blocks.filter((x) => x.id !== b.id);
      }
    });
    this.select(null);
    toast(`${message} · Undo with ↶`);
  }
  /** The item new things are added after: the selection, or the item nearest the middle of the view. */
  anchor(): string | null {
    if (this.selection) return this.selection.id;
    if (!this.doc) return null;
    const middle = this.doc.defaultView!.innerHeight / 2;
    let best: string | null = null, distance = Infinity;
    for (const el of this.elements()) {
      const r = el.getBoundingClientRect(); if (!r.height) continue;
      const d = r.top <= middle && r.bottom >= middle ? 0 : Math.min(Math.abs(r.top - middle), Math.abs(r.bottom - middle));
      if (d < distance || (d === distance && r.bottom > 0)) { distance = d; best = el.dataset.blockId!; }
    }
    return best;
  }
  private block() { return this.o.config().blocks.find((b) => b.id === this.selection?.id); }
  private select(selection: Selection | null) { this.selection = selection; this.multi = []; this.position(); this.inspector(); }
  /** Several items at once: they are outlined together and move, copy, delete and group as one. */
  private selectMany(ids: string[], main = ids[0]) { this.selection = { id: main }; this.multi = [...new Set(ids)]; this.position(); this.inspector(); }
  /** The item and every item grouped with it. */
  private groupOf(id: string) {
    const blocks = this.o.config().blocks, g = blocks.find((b) => b.id === id)?.group;
    return g ? blocks.filter((b) => b.group === g).map((b) => b.id) : [id];
  }
  /** Drag on an empty part of the page: a box selects every item it touches (whole groups). */
  private boxSelect(event: PointerEvent) {
    const doc = this.doc!, win = doc.defaultView!, x0 = event.clientX, y0 = event.clientY;
    let box: HTMLElement | null = null, hit: string[] = [];
    const move = (e: PointerEvent) => {
      if (!box) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; box = doc.createElement('div'); box.className = 'canvas-marquee'; doc.body.append(box); }
      const l = Math.min(x0, e.clientX), t = Math.min(y0, e.clientY), r = Math.max(x0, e.clientX), b = Math.max(y0, e.clientY);
      box.style.cssText = `left:${l + win.scrollX}px;top:${t + win.scrollY}px;width:${r - l}px;height:${b - t}px`;
      hit = [...new Set(this.elements().filter((el) => { const q = el.getBoundingClientRect(); return q.width && q.right > l && q.left < r && q.bottom > t && q.top < b; })
        .flatMap((el) => this.groupOf(el.dataset.blockId!)))];
      this.markMany(hit);
    };
    const up = () => {
      doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', up, true);
      if (!box) return; // a plain click on empty space: the click handler deselects
      box.remove(); this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 0);
      if (hit.length > 1) this.selectMany(hit); else this.select(hit.length ? { id: hit[0] } : null);
    };
    doc.addEventListener('pointermove', move, true); doc.addEventListener('pointerup', up, true);
  }
  private markMany(ids: string[]) {
    this.doc?.querySelectorAll('.canvas-multi').forEach((el) => el.classList.remove('canvas-multi'));
    for (const el of this.elements()) if (ids.includes(el.dataset.blockId!)) el.classList.add('canvas-multi');
  }
  /** Moves every selected item together, keeping their spacing (they become freely placed, like a free move). */
  private dragMany(event: PointerEvent, handle: HTMLElement) {
    const ids = [...this.multi], x = event.clientX, y = event.clientY;
    let moved = false, width = 1, items: { b: PageBlock; el: HTMLElement; x: number; y: number }[] = [];
    this.freeDragging = true;
    this.gesture(event, (e) => {
      if (!moved) {
        if (Math.hypot(e.clientX - x, e.clientY - y) < 3) return;
        moved = true;
        width = this.doc!.querySelector<HTMLElement>('.stack')!.clientWidth;
        const cfg = this.o.config();
        items = ids.flatMap((id) => {
          const b = cfg.blocks.find((x) => x.id === id), el = this.doc!.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
          if (!b || !el || b.type === 'space') return [];
          if (!b.float) this.lift(b, el); else this.unanchor(b, el);
          return [{ b, el, x: 0, y: 0 }];
        });
        for (const it of items) { it.x = it.b.float!.x / 100 * width; it.y = it.b.float!.y; }
      }
      const mx = e.clientX - x, my = e.clientY - y;
      for (const it of items) { it.b.float = { ...it.b.float!, x: Math.round((it.x + mx) / width * 10000) / 100, y: Math.round(it.y + my) }; this.applyFloat(it.b, it.el); }
      this.position();
    }, () => { this.freeDragging = false; }, handle);
  }
  /** With Free move off, a group (or selection) drags as one into the column: a blue line shows where it goes, and it
   * lands there in its own order (side-by-side members stay side by side). Freely placed members rejoin the column. */
  private dragManyInOrder(event: PointerEvent, handle: HTMLElement) {
    const ids = [...this.multi], doc = this.doc!, win = doc.defaultView!;
    const els = ids.map((id) => doc.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const rs = els.map((el) => el.getBoundingClientRect());
    const box = { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
    // The ghost: copies of every member, in their arrangement.
    const ghost = doc.createElement('div'); ghost.className = 'canvas-ghost';
    ghost.style.cssText = `width:${box.right - box.left}px;height:${box.bottom - box.top}px;max-height:none;overflow:visible`;
    els.forEach((el, i) => {
      const c = el.cloneNode(true) as HTMLElement; c.removeAttribute('data-block-id'); c.removeAttribute('data-float'); c.removeAttribute('data-free'); c.removeAttribute('data-offset');
      c.style.cssText += `;position:absolute;left:${rs[i].left - box.left}px;top:${rs[i].top - box.top}px;width:${rs[i].width}px;margin:0;translate:none`;
      ghost.append(c);
    });
    const marker = doc.createElement('div'); marker.className = 'canvas-drop';
    const grabX = event.clientX - box.left, grabY = event.clientY - box.top;
    let destination: ReturnType<typeof dropTarget> = null, x = event.clientX, y = event.clientY, moved = false;
    const update = () => {
      ghost.style.left = `${x - grabX}px`; ghost.style.top = `${y - grabY}px`;
      const rects: BlockRect[] = this.elements().filter((el) => !ids.includes(el.dataset.blockId!)).map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.blockId!, left: r.left, top: r.top, width: r.width, height: r.height }; });
      destination = dropTarget(rects, x, y, '', win.innerWidth);
      const r = rects.find((r) => r.id === destination?.id);
      marker.hidden = !r;
      if (r && destination) { marker.style.left = `${r.left + win.scrollX}px`; marker.style.top = `${r.top + (destination.after ? r.height : 0) + win.scrollY}px`; marker.style.width = `${r.width}px`; marker.style.height = '4px'; }
    };
    this.gesture(event, (e) => { moved ||= Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) >= 6; x = e.clientX; y = e.clientY; if (moved) update(); }, (cancel) => {
      ghost.remove(); marker.remove(); els.forEach((el) => el.classList.remove('canvas-source'));
      if (cancel || !moved || !destination) return;
      const cfg = this.o.config(), to = destination;
      const members = cfg.blocks.filter((b) => ids.includes(b.id));
      cfg.blocks = cfg.blocks.filter((b) => !ids.includes(b.id) && !ids.some((id) => b.id.startsWith(`space:${id}~`)));
      for (const b of members) { b.float = undefined; b.dx = undefined; b.dy = undefined; b.offset = undefined; }
      const at = cfg.blocks.findIndex((b) => b.id === to.id);
      cfg.blocks.splice(at < 0 ? cfg.blocks.length : at + (to.after ? 1 : 0), 0, ...members);
    }, handle);
    if (this.busy) { doc.body.append(ghost, marker); els.forEach((el) => el.classList.add('canvas-source')); update(); }
  }
  /** Layers: forward or backward one step past the item it overlaps most, or all the way to the front or back. */
  layer(to: 'front' | 'forward' | 'backward' | 'back') {
    const cfg = this.o.config(), ids = this.multi.length > 1 ? this.multi : this.selection && !this.selection.part && !this.selection.socialId ? this.groupOf(this.selection.id) : [];
    if (!ids.length || !this.doc) return false;
    const z = (el: HTMLElement) => Number(this.doc!.defaultView!.getComputedStyle(el).zIndex) || 0;
    const els = this.elements(), mine = els.filter((el) => ids.includes(el.dataset.blockId!)), others = els.filter((el) => !ids.includes(el.dataset.blockId!));
    const top = Math.max(0, ...others.map(z)), bottom = Math.min(0, ...others.map(z)), now = Math.max(...mine.map(z));
    const next = to === 'front' ? top + 1 : to === 'back' ? bottom - 1 : to === 'forward' ? Math.min(50, now + 1) : Math.max(-50, now - 1);
    this.action(() => { for (const b of cfg.blocks) if (ids.includes(b.id)) b.z = next; });
    if (this.multi.length > 1) this.selectMany(this.multi, this.selection?.id);
    toast({ front: 'Brought to front', back: 'Sent to back', forward: 'Brought forward', backward: 'Sent backward' }[to]);
    return true;
  }
  private layerBar() {
    const icon = (stack: string) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${stack}</svg>`;
    const back = '<rect x="5" y="5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>', front = '<rect x="3" y="3" width="9" height="9" rx="2" fill="currentColor"/>';
    const button = (label: string, key: string, svg: string, to: 'front' | 'forward' | 'backward' | 'back') => {
      const el = h('button', { type: 'button', class: 'align-btn', title: `${label} (${key})`, 'aria-label': label, onclick: () => this.layer(to) }); el.innerHTML = svg; return el;
    };
    return h('div', { class: 'canvas-weight' }, h('p', {}, 'Layer'), h('div', { class: 'align-bar' },
      button('To back', '⇧⌘[', icon(`<rect x="3" y="3" width="9" height="9" rx="2" fill="currentColor" opacity=".35"/>${back.replace('fill="none"', 'fill="var(--card)"')}`), 'back'),
      button('Backward', '⌘[', icon(`<rect x="3" y="3" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>${back}`), 'backward'),
      button('Forward', '⌘]', icon(`${back}${front.replace('fill="currentColor"', 'fill="none" stroke="currentColor" stroke-width="1.3"')}`), 'forward'),
      button('To front', '⇧⌘]', icon(`${back}${front}`), 'front')));
  }
  /** Group (Cmd+G) the selected items, or ungroup (Cmd+Shift+G) them. */
  group(on: boolean) {
    const ids = this.multi.length > 1 ? this.multi : this.selection ? this.groupOf(this.selection.id) : [];
    if (ids.length < 2) { if (on) toast('Select two or more items first: drag a box around them, or Shift+click.'); return false; }
    const id = Math.random().toString(36).slice(2, 10);
    this.action(() => { for (const b of this.o.config().blocks) if (ids.includes(b.id)) b.group = on ? id : undefined; });
    this.selectMany(ids, this.selection?.id);
    toast(on ? 'Grouped: they now select and move together' : 'Ungrouped');
    return true;
  }
  private position() {
    if (!this.doc || !this.ui) return;
    this.doc.querySelectorAll('.canvas-selected,.canvas-part-selected').forEach((el) => el.classList.remove('canvas-selected', 'canvas-part-selected'));
    const target = this.target();
    this.markMany(this.enabled ? this.multi : []);
    this.ui.hidden = !this.enabled || !target || this.multi.length > 1; // several items: no resize handles, drag any of them
    this.ui.classList.toggle('is-social', !!this.selection?.socialId);
    if (!this.enabled || !target) return;
    target.classList.add(this.selection?.part || this.selection?.socialId ? 'canvas-part-selected' : 'canvas-selected');
    const noResize = !!this.selection?.socialId || this.selection?.part === 'name';
    this.ui.querySelector<HTMLElement>('.canvas-resize')!.hidden = noResize;
    this.ui.querySelectorAll<HTMLElement>('.canvas-side').forEach((handle) => { handle.hidden = noResize || !!this.selection?.part; }); // photo and cover use the right handle
    this.ui.querySelector<HTMLElement>('.canvas-rotate')!.hidden = noResize || !!this.selection?.part;
    const rect = target.getBoundingClientRect(), win = this.doc.defaultView!;
    const left = Math.max(5, rect.left);
    this.ui.style.left = `${left + win.scrollX}px`; this.ui.style.top = `${rect.top + win.scrollY}px`;
    this.ui.style.width = `${Math.min(rect.right, win.innerWidth - 5) - left}px`; this.ui.style.height = `${rect.height}px`;
    // The guides appear only while something is being moved or resized.
    if (!this.freeDragging) { if (this.busy && this.guidesOn) this.showGuides(target); else this.guides?.clear(); }
  }
  /** Everything the selection can line up with: the other items (not the ones inside it or around it), and the page. */
  private surroundings(target: HTMLElement) {
    const others = this.elements().filter((el) => el !== target && !el.contains(target) && !target.contains(el) && el.getClientRects().length)
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const stack = this.doc!.querySelector<HTMLElement>('.stack')!.getBoundingClientRect();
    return { others, page: { left: stack.left, right: stack.right, top: stack.top, bottom: stack.bottom } };
  }
  private showGuides(target: HTMLElement | null) {
    if (!this.guides) return;
    if (!target || this.selection?.socialId || this.selection?.part) { this.guides.clear(); return; }
    const { others, page } = this.surroundings(target), r = target.getBoundingClientRect();
    const snap = this.guides.snap(r, others, page);
    // Only exact matches count as lined up when nothing is moving.
    this.guides.show(r, others, page, { xs: snap.x === 0 ? snap.xs : [], ys: snap.y === 0 ? snap.ys : [] });
  }
  /** Pins an item where it is now, outside the layout (other items close the gap). Works with rotation: offsets ignore it. */
  private lift(b: PageBlock, el: HTMLElement) {
    const stack = this.doc!.querySelector<HTMLElement>('.stack')!, width = stack.clientWidth;
    const left = el.offsetLeft + (b.dx ?? 0), top = el.offsetTop + (b.dy ?? 0) + (b.offset ?? 0);
    // Nothing else moves: an empty space takes the item's place (striped in the editor, invisible on the page).
    const cfg = this.o.config(), at = cfg.blocks.indexOf(b);
    // The space is tagged with the item's id, so putting the item back in the layout removes it again.
    const space: PageBlock = { id: `space:${b.id}~${Math.random().toString(36).slice(2, 8)}`, type: 'space', height: Math.max(24, Math.round(el.offsetHeight)), ...(b.design ? { design: { ...b.design } } : {}) };
    cfg.blocks.splice(at, 1, space); cfg.blocks.push(b); // a free item's place in the list doesn't matter
    const placeholder = this.doc!.createElement('div');
    placeholder.className = 'space'; placeholder.dataset.blockId = space.id; placeholder.setAttribute('data-height', '');
    placeholder.style.cssText = `${el.style.gridColumn ? `grid-column:${el.style.gridColumn};` : ''}--h:${space.height}px`;
    el.before(placeholder); // the item itself stays in the page while dragging (moving it would end the drag)
    b.float = { x: left / width * 100, y: top, w: el.offsetWidth / width * 100 };
    b.dx = undefined; b.dy = undefined; b.offset = undefined;
    this.applyFloat(b, el);
  }
  /** A freely placed item rejoins the column at the height it is now (or after `after`), and the empty space it left closes. */
  private dock(b: PageBlock, place?: () => void) {
    const centers = new Map(this.elements().map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.blockId!, r.top + r.height / 2]; }));
    const cfg = this.o.config(), mine = `space:${b.id}~`;
    if (place) place();
    else {
      const y = centers.get(b.id) ?? Infinity;
      cfg.blocks = cfg.blocks.filter((x) => x !== b);
      const at = cfg.blocks.findIndex((x) => !x.float && (centers.get(x.id) ?? -Infinity) > y);
      if (at < 0) cfg.blocks.push(b); else cfg.blocks.splice(at, 0, b);
    }
    const c = this.o.config(); c.blocks = c.blocks.filter((x) => !x.id.startsWith(mine));
    b.float = undefined; b.dx = undefined; b.dy = undefined;
  }
  /** Magnet: an item dropped on the side of another one sits beside it in the same row. It takes the room left
   * in that row, the neighbour's height, and drops the old spacing that would push it out of the row. */
  private besides(b: PageBlock, id: string) {
    const cfg = this.o.config(), other = cfg.blocks.find((x) => x.id === id); if (!other) return;
    const neighbour = this.doc?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
    let span = normalizeBlockDesign(other.design)?.span ?? 12;
    if (span > 9) span = 8; // a full-width neighbour makes room
    other.design = { span, align: 'auto' }; // both flow side by side, from the left
    b.design = { span: Math.max(2, 12 - span), align: 'auto' };
    b.offset = undefined; b.inset = undefined;
    if (neighbour && (b.height || b.type === 'shape' || b.type === 'image')) b.height = Math.round(Math.max(24, Math.min(900, neighbour.offsetHeight)));
  }
  /** Puts every freely moved item back in the layout at the height it was left, removes empty spaces and Space above. */
  private tidy() {
    if (!confirm('Tidy up this design?\n\nYour photo, name and bio go to the top, then social icons and your main button. Freely moved items rejoin the page, empty spaces close, and spacing, fonts and text sizes go back to this design\'s own. Your content, pictures and colors stay. You can undo this.')) return;
    this.action(() => this.cleanLayout());
  }

  /** A free item has its own width: the same share of the page as `span` columns. `keepRight` grows it to the left. */
  private floatSpan(b: PageBlock, el: HTMLElement, span: number, keepRight: boolean) {
    if (!b.float) return;
    this.unanchor(b, el);
    const stack = this.doc!.querySelector<HTMLElement>('.stack')!, cs = this.doc!.defaultView!.getComputedStyle(stack);
    const pad = parseFloat(cs.paddingLeft) || 0, gap = parseFloat(cs.columnGap) || 0, inner = stack.clientWidth - pad * 2;
    const w = Math.round(((inner + gap) * span / 12 - gap) / stack.clientWidth * 10000) / 100;
    b.float = { ...b.float, w, x: keepRight ? Math.round((b.float.x + b.float.w - w) * 100) / 100 : b.float.x };
    this.applyFloat(b, el);
  }
  /** A clean, organized arrangement for a template used for the first time: free items rejoin the column where they sit,
   * empty spaces close, and spacing, stretched heights and text sizes go back to the template's own. Widths stay. */
  cleanLayout(template?: Template) {
    const tops = new Map(this.elements().map((el) => [el.dataset.blockId!, el.getBoundingClientRect().top]));
    const cfg = this.o.config();
    const floating = cfg.blocks.filter((b) => b.float || b.dx || b.dy).sort((a, b) => (tops.get(a.id) ?? 0) - (tops.get(b.id) ?? 0));
    cfg.blocks = cfg.blocks.filter((b) => b.type !== 'space' && !floating.includes(b));
    for (const item of floating) {
      const top = tops.get(item.id) ?? Infinity, at = cfg.blocks.findIndex((b) => (tops.get(b.id) ?? -Infinity) > top);
      if (at < 0) cfg.blocks.push(item); else cfg.blocks.splice(at, 0, item);
    }
    arrangeLayout(cfg, new Set(floating.map((b) => b.id)), template);
    this.select(null);
  }
  /** Gives every free item without an anchor one, as the page looks now (used before the template changes). */
  anchorAll() {
    if (!this.doc) return;
    for (const b of this.o.config().blocks) {
      const el = b.float && !b.float.a ? this.doc.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(b.id)}"]`) : null;
      if (b && el) this.anchorFloat(b, el);
    }
  }
  /** While a free item is edited it uses page coordinates (share of the page width, px from the top). */
  private unanchor(b: PageBlock, el: HTMLElement) {
    if (!b.float?.a) return;
    const width = this.doc!.querySelector<HTMLElement>('.stack')!.clientWidth;
    b.float = { x: Math.round(el.offsetLeft / width * 10000) / 100, y: Math.round(el.offsetTop), w: Math.round(el.offsetWidth / width * 10000) / 100 };
    this.applyFloat(b, el);
  }
  /** After an edit, a free item remembers what it sits on (the item, or the photo or cover inside the profile) and its spot on it,
   * so it follows that item when the template, the screen or the content changes. */
  private anchorFloat(b: PageBlock, el: HTMLElement) {
    if (!b.float || b.float.a) return;
    const stack = this.doc!.querySelector<HTMLElement>('.stack')!, box = stack.getBoundingClientRect();
    const left = el.offsetLeft, top = el.offsetTop, width = el.offsetWidth, cx = left + width / 2, cy = top + el.offsetHeight / 2;
    const candidates: { key: string; r: { left: number; top: number; width: number; height: number } }[] = [];
    for (const item of this.elements()) {
      if (item === el || item.hasAttribute('data-float') || item.classList.contains('space') || !item.offsetHeight) continue;
      const parts = item.dataset.blockId === 'profile' ? [...item.querySelectorAll<HTMLElement>('[data-profile-part="photo"], [data-profile-part="cover"]')] : [];
      for (const target of [...parts, item]) {
        const r = target.getBoundingClientRect(); if (!r.width || !r.height) continue;
        candidates.push({ key: target === item ? item.dataset.blockId! : `${item.dataset.blockId}#${target.dataset.profilePart}`, r: { left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height } });
      }
    }
    if (!candidates.length) return;
    // What it sits on (the smallest item under its center), else the nearest item above it, else the first one.
    const under = candidates.filter(({ r }) => cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height).sort((p, q) => p.r.width * p.r.height - q.r.width * q.r.height)[0];
    const above = candidates.filter(({ r }) => r.top <= top).sort((p, q) => q.r.top - p.r.top)[0];
    const anchor = under ?? above ?? candidates.sort((p, q) => p.r.top - q.r.top)[0];
    const r = anchor.r, round = (v: number) => Math.round(v * 100) / 100;
    b.float = { x: round((left - r.left) / r.width * 100), w: round(width / r.width * 100), a: anchor.key, p: Math.round(width),
      ...(anchor === under ? { y: round((top - r.top) / r.height * 100), s: 1 as const } : { y: Math.round(top - r.top) }) };
  }
  private applyFloat(b: PageBlock, el: HTMLElement) {
    el.style.removeProperty('left'); el.style.removeProperty('top'); el.style.removeProperty('width');
    if (b.float?.a) el.setAttribute('data-anchor', b.float.a); else el.removeAttribute('data-anchor');
    el.toggleAttribute('data-sticker', !!b.float?.s); if (b.float?.p) el.dataset.p = String(b.float.p); else delete el.dataset.p;
    if (b.float) {
      el.style.setProperty('--fx', `${b.float.x}%`); el.style.setProperty('--fy', `${b.float.y}px`); el.style.setProperty('--fw', `${b.float.w}%`);
      el.setAttribute('data-float', '');
    } else el.removeAttribute('data-float');
    el.removeAttribute('data-free'); el.removeAttribute('data-offset');
    (this.doc!.defaultView as any).yourlinkiFloat?.();
  }
  /** Moves the item anywhere with the pointer, snapping to the page center, the page edges and other items. Alt turns snapping off.
   * The item is lifted out of the layout on the first move, so reordering other items later never moves it. */
  private freeDrag(event: PointerEvent, handle?: HTMLElement) {
    const b = this.block(), el = this.element(); if (!b || !el || this.busy || this.selection?.socialId) return;
    const x = event.clientX, y = event.clientY;
    let moved = false, start: DOMRect, base = { x: 0, y: 0 }, others: DOMRect[] = [], page = { left: 0, right: 0, top: 0, bottom: 0 }, width = 1;
    this.freeDragging = true;
    this.gesture(event, (e) => {
      if (!moved) {
        if (Math.hypot(e.clientX - x, e.clientY - y) < 3) return;
        moved = true;
        if (!b.float) this.lift(b, el); else this.unanchor(b, el);
        width = this.doc!.querySelector<HTMLElement>('.stack')!.clientWidth;
        base = { x: b.float!.x / 100 * width, y: b.float!.y };
        start = el.getBoundingClientRect();
        ({ others, page } = this.surroundings(el));
      }
      let mx = e.clientX - x, my = e.clientY - y;
      const proposed = { left: start.left + mx, right: start.right + mx, top: start.top + my, bottom: start.bottom + my };
      const snap = e.altKey || !this.guidesOn ? { x: 0, y: 0, xs: [], ys: [] } : this.guides!.snap(proposed, others, page);
      mx += snap.x; my += snap.y;
      b.float = { ...b.float!, x: Math.round((base.x + mx) / width * 10000) / 100, y: Math.round(base.y + my) };
      this.applyFloat(b, el);
      this.position();
      if (this.guidesOn) this.guides!.show({ left: start.left + mx, right: start.right + mx, top: start.top + my, bottom: start.bottom + my }, others, page, snap);
    }, () => { this.freeDragging = false; this.guides?.clear(); }, handle);
  }
  private title() {
    if (this.multi.length > 1) return `${this.multi.length} items`;
    const b = this.block(), cfg = this.o.config();
    if (!b) return 'Tap an item to select';
    if (this.selection?.socialId) { const item = cfg.social.find((s, i) => socialKey(s, i) === this.selection?.socialId); return `${platform(item?.platform ?? '')?.label ?? 'Social'} icon`; }
    if (this.selection?.part === 'cover') return 'Cover image';
    if (this.selection?.part === 'photo') return 'Photo or logo';
    if (this.selection?.part === 'name') return 'Name';
    if (b.type === 'link') return cfg.links.find((l) => l.id === b.linkId)?.title || 'Link';
    return (b.title && plain(b.title).split('\n')[0]) || ((b.part ? { social: 'Social icon', highlights: 'Highlight' } as Record<string, string> : {})[b.type] ?? { profile: 'Profile', name: 'Name', bio: 'Bio', highlights: 'Highlights', social: 'Social icons', youtube: 'YouTube video', image: 'Image', post: 'Post preview', text: 'Text', credentials: 'Credentials', shape: 'Shape', space: 'Empty space', voice: 'Voice message', file: 'PDF', menu: 'Link menu' }[b.type]);
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
    return this.element() ? this.columns(this.element()!).span : 12;
  }
  /** Width is set in one place only: changing it drops the old Side inset, so the item is exactly as wide as chosen. */
  private clearInset(b: PageBlock, el: HTMLElement) {
    if (!b.inset) return;
    b.inset = undefined; el.style.removeProperty('--inset'); el.removeAttribute('data-inset');
  }
  /** Columns an item takes now: first column (1–12) and how many. */
  private columns(o: HTMLElement) {
    const win = this.doc!.defaultView!, cs = win.getComputedStyle(o), stack = this.doc!.querySelector<HTMLElement>('.stack')!, st = win.getComputedStyle(stack);
    const pad = parseFloat(st.paddingLeft) || 0, gap = parseFloat(st.columnGap) || 0, column = (stack.clientWidth - pad * 2 + gap) / 12;
    // "span 4" alone is reported as the start ("span 4 / auto"); "1 / span 4" as start 1, end "span 4".
    const spanOf = (v: string) => Number(v.match(/span\s+(\d+)/)?.[1]) || 0;
    const span = spanOf(cs.gridColumnEnd) || spanOf(cs.gridColumnStart) || Math.max(1, Math.round((o.offsetWidth + gap) / column));
    const start = Number(cs.gridColumnStart) || Math.max(1, Math.min(13 - span, Math.round((o.offsetLeft - pad) / column) + 1));
    return { start, span, end: start + span - 1 };
  }
  /** Items side by side stay side by side: an item growing into its neighbour makes the neighbour narrower (never below
   * 2 columns; then the item stops growing). Returns where the item fits, or null when nothing shares its row. */
  private fitRow(b: PageBlock, el: HTMLElement, start: number, span: number) {
    const top = el.offsetTop, bottom = top + el.offsetHeight, own = this.columns(el);
    const row = this.elements().filter((o) => o !== el && !o.hasAttribute('data-float') && o.offsetHeight && o.offsetTop < bottom - 2 && o.offsetTop + o.offsetHeight > top + 2);
    if (!row.length) return null;
    if (start + span - 1 > 12) span = 13 - start;
    for (const o of row) {
      const ob = this.o.config().blocks.find((x) => x.id === o.dataset.blockId); if (!ob) continue;
      const c = this.columns(o);
      let next: { start: number; span: number } | null = null;
      if (c.start > own.start && c.start <= start + span - 1) { // on the right: it gives up its left columns
        let first = start + span;
        if (c.end - first + 1 < 2) { first = c.end - 1; span = first - start; }
        next = { start: first, span: c.end - first + 1 };
      } else if (c.start < own.start && c.end >= start) { // on the left: it gives up its right columns
        let last = start - 1;
        if (last - c.start + 1 < 2) { last = c.start + 1; const end = start + span - 1; start = last + 1; span = end - start + 1; }
        next = { start: c.start, span: last - c.start + 1 };
      }
      if (!next) continue;
      ob.design = { span: next.span, start: next.start, align: ob.design?.align ?? 'auto' };
      o.style.gridColumn = designStyle(ob.design).replace('grid-column:', ''); o.dataset.layoutSpan = String(next.span);
      const tier = sizeTier(next.span); if (tier) o.dataset.size = tier; else delete o.dataset.size;
    }
    return { start, span: Math.max(2, span) };
  }
  /** `keepRow`: items beside it make room instead of the item moving to its own row (the Full/Half/Third presets don't). */
  private applySpan(value: number, keepRow = true) {
    const b = this.block(), el = this.element(); if (!b || !el) return;
    this.clearInset(b, el);
    let span = Math.round(bounded(value, 2, 12) ?? 12), start = b.design?.start;
    const fit = keepRow && !b.float ? this.fitRow(b, el, start ?? this.columns(el).start, span) : null;
    if (fit) ({ start, span } = fit);
    b.design = { span, align: b.design?.align ?? 'auto', ...(start ? { start: Math.min(start, 13 - span) } : {}) };
    if (b.float) this.floatSpan(b, el, span, false);
    el.style.gridColumn = designStyle(b.design).replace('grid-column:', ''); el.dataset.layoutSpan = String(b.design.span);
    const tier = sizeTier(b.design.span); if (tier) el.dataset.size = tier; else delete el.dataset.size; // text scales live while resizing
    this.position();
  }
  private finish(redraw = true) {
    const b = this.block(), el = this.element();
    if (b?.float && !b.float.a && el) this.anchorFloat(b, el);
    this.history.end(); this.o.commit(redraw); this.updateHistoryButtons();
  }
  private action(fn: () => void) { this.history.begin(); fn(); this.finish(); this.inspector(); }
  undo() { if (this.busy) this.stopGesture?.(); this.o.undo(); }
  redo() { if (this.busy) this.stopGesture?.(); this.o.redo(); }
  /** Purple guides and snapping, on or off (remembered on this device). */
  guidesOn = (() => { try { return localStorage.getItem('yourlinki-guides') !== '0'; } catch { return true; } })();
  setGuides(on: boolean) { this.guidesOn = on; try { localStorage.setItem('yourlinki-guides', on ? '1' : '0'); } catch {} if (!on) this.guides?.clear(); }
  private updateHistoryButtons() {
    this.o.inspector.querySelector<HTMLButtonElement>('[data-undo]')?.toggleAttribute('disabled', !this.o.canUndo());
    this.o.inspector.querySelector<HTMLButtonElement>('[data-redo]')?.toggleAttribute('disabled', !this.o.canRedo());
  }
  /** A slider with its value beside it. Clicking the value lets you type an exact one (in the unit shown: `parse` turns it into
   * the slider's value, e.g. a width typed in % into columns); Enter or leaving the box applies it, Escape keeps the old one. */
  private range(label: string, value: number, min: number, max: number, step: number, set: (v: number) => void, format: (v: number) => string, parse: (typed: number) => number = (n) => n) {
    const output = h('output', { title: 'Click to type a value' }, format(value));
    output.addEventListener('click', (event) => {
      event.preventDefault(); // the value sits in the slider's label: don't move focus to the slider
      const field = h('input', { type: 'text', inputmode: 'decimal', class: 'canvas-range-edit', 'aria-label': `${label} value`, value: String(parseFloat(output.textContent ?? '') || 0) }) as HTMLInputElement;
      let closed = false;
      const close = (apply: boolean) => {
        if (closed) return; closed = true;
        const typed = parseFloat(field.value.replace(',', '.'));
        field.replaceWith(output);
        if (!apply || !Number.isFinite(typed)) return;
        const v = Math.min(max, Math.max(min, +(Math.round(parse(typed) / step) * step).toFixed(4)));
        this.history.begin(); set(v); (input as HTMLInputElement).value = String(v); output.textContent = format(v); this.position(); this.finish();
      };
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); close(true); } if (e.key === 'Escape') { e.preventDefault(); close(false); } });
      field.addEventListener('blur', () => close(true));
      field.addEventListener('click', (e) => e.preventDefault());
      output.replaceWith(field); field.focus(); field.select();
    });
    const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label, 'data-control': label, // range before value, or negative values clamp to 0
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
      h('button', { type: 'button', class: 'canvas-free' + (this.freeMode ? ' on' : ''), 'aria-pressed': String(this.freeMode), title: 'Free move: drag items anywhere, with guides. Off: dragging changes the order. Hold Shift for one free drag.',
        onclick: () => { this.freeMode = !this.freeMode; try { localStorage.setItem('yourlinki-free-move', this.freeMode ? '1' : '0'); } catch {} this.inspector(); } }, '✥ Free'), // purple when on
      h('button', { type: 'button', class: 'canvas-add', onclick: () => { this.pendingNew = new Set(this.o.config().blocks.map((b) => b.id)); this.o.add(); } }, '+ Add'));
    if (this.multi.length > 1) {
      const cfg = this.o.config(), g = cfg.blocks.find((x) => x.id === this.multi[0])?.group;
      const grouped = !!g && this.multi.every((id) => cfg.blocks.find((x) => x.id === id)?.group === g);
      this.o.inspector.replaceChildren(tools,
        h('p', { class: 'canvas-help' }, `${grouped ? 'Group' : 'Selection'} of ${this.multi.length} items. Drag any of them to move them together. Shift+click adds or removes an item; ⌘C / ⌘V copies them all.`),
        h('div', { class: 'canvas-actions' },
          h('button', { type: 'button', class: 'canvas-group-btn', onclick: () => this.group(!grouped) }, grouped ? 'Ungroup' : 'Group'),
          h('button', { type: 'button', class: 'canvas-delete', 'aria-label': 'Delete selected items', title: 'Delete (Delete key)', onclick: () => this.deleteSelection() }, '🗑')),
        this.layerBar());
      return;
    }
    const b = this.block(), el = this.element();
    if (!b || !el) {
      this.o.inspector.replaceChildren(tools, h('p', { class: 'canvas-help' }, 'Drag any item to move it (on a phone, press and hold first). Tap an item, then drag its corner to resize it; double-click the corner to reset.'),
        h('button', { type: 'button', class: 'canvas-tidy', onclick: () => this.tidy() }, '✨ Tidy up layout'),
        h('p', { class: 'canvas-help' }, 'Arranges this design neatly: photo, name and bio at the top, then social icons and your main button. Free items rejoin the page and spacing resets.'),
        this.range('Page spacing', this.o.config().look.spacing ?? 18, 8, 36, 1, (v) => { this.o.config().look.spacing = v; this.doc?.body.style.setProperty('--page-gap', `${v}px`); }, (v) => `${v}px`),
        this.range('Side margins', this.o.config().look.margin ?? (['studio', 'bold'].includes(this.o.config().look.template) ? 24 : 20), 0, 60, 1, (v) => {
          this.o.config().look.margin = v; this.doc?.body.style.setProperty('--page-margin', `${v}px`); this.doc?.body.setAttribute('data-margin', '');
        }, (v) => `${v}px`));
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
    if (b.type === 'space') {
      this.o.inspector.replaceChildren(tools,
        h('p', { class: 'canvas-help' }, 'Empty space keeps room where an item used to be. Visitors don\'t see it. Stretch it from the top or bottom dot, or remove it.'),
        h('button', { type: 'button', class: 'canvas-tidy', onclick: () => { this.action(() => { const cfg = this.o.config(); cfg.blocks = cfg.blocks.filter((x) => x.id !== b.id); }); this.select(null); } }, 'Remove this empty space'));
      return;
    }
    const image = this.image(), target = this.target();
    const crop = image?.img?.parentElement;
    const actions = h('div', { class: 'canvas-actions' },
      h('button', { type: 'button', onclick: () => this.o.edit(b.id) }, 'Edit content'),
      h('button', { type: 'button', class: 'canvas-delete', 'aria-label': 'Delete selected item', title: 'Delete (Delete key)', onclick: () => this.deleteSelection() }, '🗑'),
      image && h('button', { type: 'button', onclick: () => {
        this.history.begin();
        adjustImage({ src: image.src, frame: image.frame, title: 'Adjust Image',
          round: !!crop?.classList.contains('avatar'), aspect: crop && crop.clientHeight ? crop.clientWidth / crop.clientHeight : undefined,
          onChange: (frame) => { image.set(frame); this.o.commit(false); }, onFinish: () => this.finish() });
      }, title: 'Adjust image: zoom and position' }, 'Adjust'),
      h('button', { type: 'button', 'aria-label': 'Move selected item up', onclick: () => this.nudge(-1) }, '↑'),
      h('button', { type: 'button', 'aria-label': 'Move selected item down', onclick: () => this.nudge(1) }, '↓'));
    const resizeProfile = b.type === 'profile' && !!this.selection?.part && this.selection.part !== 'name';
    const sizeControl = resizeProfile
      ? target?.classList.contains('avatar')
        ? this.range('Logo size', this.o.config().profile.photoSize ?? target.clientWidth, 48, 180, 1, (v) => this.setProfileSize(v, true), (v) => `${v}px`)
        : this.range(this.selection?.part === 'photo' ? 'Photo height' : 'Cover height', this.o.config().profile.coverHeight ?? target?.clientHeight ?? 184, 100, 540, 1, (v) => this.setProfileSize(v, false), (v) => `${v}px`)
      : this.range('Item width', this.span(), 2, 12, 1, (v) => this.applySpan(v), (v) => `${Math.round(v / 12 * 100)}%`, (n) => n / 100 * 12);
    const width = h('div', { class: 'canvas-widths' }, [ { label: 'Full', span: 12 }, { label: 'Half', span: 6 }, { label: 'Third', span: 4 } ].map((o) => h('button', { type: 'button', class: this.span() === o.span ? 'on' : '', onclick: () => this.action(() => this.applySpan(o.span, false)) }, o.label)));
    const details = h('details', { class: 'canvas-details', open: this.detailsOpen, ontoggle: (e: Event) => { this.detailsOpen = (e.target as HTMLDetailsElement).open; } }, h('summary', {}, 'More design options'),
      segmented([{ value: 'auto', label: 'Flow' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], b.design?.align ?? 'auto', (align) => this.action(() => { b.design = { span: this.span(), align }; this.applySpan(b.design.span, false); })),
      image && this.range('Image zoom', normalizeImageFrame(image.frame).zoom, normalizeImageFrame(image.frame).fit === 'cover' ? 1 : .5, 4, .01, (zoom) => {
        const f = normalizeImageFrame({ ...image.frame, zoom }); image.set(f);
        const pictures = image.img?.closest('[data-profile-part]')?.querySelectorAll<HTMLImageElement>('img') ?? (image.img ? [image.img] : []);
        pictures.forEach((img) => { img.style.cssText = imageFrameStyle(f); });
      }, (v) => `${Math.round(v * 100)}%`, (n) => n / 100),
      b.type === 'youtube' && segmented([{ value: 'landscape', label: '16:9' }, { value: 'wide', label: 'Wide' }, { value: 'square', label: 'Square' }], b.videoAspect ?? 'landscape', (aspect) => this.action(() => {
        b.videoAspect = aspect; this.element()?.querySelector<HTMLElement>('.video-player')?.style.setProperty('--video-aspect', videoRatio(aspect));
      })),
      h('button', { type: 'button', class: 'canvas-reset', onclick: () => this.action(() => {
        b.design = undefined;
        b.textScale = undefined; b.offset = undefined; b.inset = undefined; b.height = undefined; b.vertical = undefined; b.cardStyle = undefined; b.dx = undefined; b.dy = undefined; b.float = undefined; b.iconColor = undefined; b.iconStyle = undefined; b.rotate = undefined; b.pad = undefined; b.lineHeight = undefined; b.wordSpacing = undefined; b.weight = undefined; b.textColor = undefined;
        if (b.type === 'link') { const link = this.o.config().links.find((l) => l.id === b.linkId); if (link) { link.buttonShape = undefined; link.buttonStyle = undefined; } }
        if (b.type === 'youtube') b.videoAspect = undefined;
        if (b.type === 'profile') { this.o.config().profile.photoSize = undefined; this.o.config().profile.coverHeight = undefined; }
        image?.set(undefined);
      }) }, 'Reset this layout'));
    const profileParts = b.type === 'profile' ? h('div', { class: 'canvas-parts' },
      h('button', { type: 'button', onclick: () => this.select({ id: b.id, part: 'photo' }) }, 'Photo / logo'),
      this.element()?.querySelector('[data-profile-part="name"]') && h('button', { type: 'button', onclick: () => this.select({ id: b.id, part: 'name' }) }, 'Name'),
      h('button', { type: 'button', onclick: () => this.element()?.querySelector('[data-profile-part=\"cover\"]') ? this.select({ id: b.id, part: 'cover' }) : this.o.edit(b.id) }, this.o.config().profile.cover ? 'Cover' : '+ Cover')) : null;
    const font = b.type !== 'shape' && (!this.selection?.part || this.selection.part === 'name') ? this.fontPicker(b) : null;
    const nameControls = b.type === 'name' || this.selection?.part === 'name' ? this.nameControls(b.type === 'name') : null;
    const link = b.type === 'link' ? this.o.config().links.find((l) => l.id === b.linkId) : undefined;
    const shape = link && usesButton(link, this.o.config().look.template) ? h('div', { class: 'canvas-shapes' }, h('p', {}, 'Button shape'),
      shapePicker(buttonShape(link, this.o.config().look.template), (value) => this.action(() => { link.buttonShape = value; el.dataset.buttonShape = value; })),
      h('p', { style: 'margin-top:10px' }, 'Button style'),
      stylePicker(buttonStyle(link), (value) => this.action(() => { link.buttonStyle = value; el.dataset.buttonStyle = value; })),
      // Padding: how close the button's edge sits to its text. Its height follows, so a stretched height is let go.
      this.range('Padding', b.pad ?? Math.round(parseFloat(getComputedStyle(el).paddingTop) || 14), 0, 40, 1, (v) => {
        b.pad = v; el.style.setProperty('--pad', `${v}px`); el.setAttribute('data-pad', '');
        if (b.height) { b.height = undefined; el.removeAttribute('data-height'); el.style.removeProperty('--h'); }
        (this.doc!.defaultView as any).yourlinkiFit?.(); (this.doc!.defaultView as any).yourlinkiFloat?.();
      }, (v) => `${v}px`)) : null;
    const textSize = font ? this.range('Text size', Math.round((b.textScale ?? 1) * 100), 50, 800, 5, (v) => {
      // A box with a set height grows and shrinks with its text, like a text box in Canva.
      if (b.height) { b.height = Math.round(Math.max(24, Math.min(900, b.height * (v / 100) / (b.textScale ?? 1)))); el.style.setProperty('--h', `${b.height}px`); }
      b.textScale = v === 100 ? undefined : v / 100;
      el.style.setProperty('--text-scale', String(v / 100)); el.toggleAttribute('data-text-scale', v !== 100);
      (this.doc!.defaultView as any).yourlinkiFit?.(); (this.doc!.defaultView as any).yourlinkiFloat?.();
    }, (v) => `${v}%`) : null;
    // Line spacing: how close the lines of a text sit (shown in % of the text size, like most design apps).
    const textEl = el.querySelector<HTMLElement>('h1, h2, p, figcaption, span') ?? el;
    const lineDefault = () => { const cs = getComputedStyle(textEl); const lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize); return lh && fs ? Math.round(lh / fs * 20) * 5 : 120; };
    const lineSpacing = font ? this.range('Line spacing', b.lineHeight ? Math.round(b.lineHeight * 100) : lineDefault(), 60, 250, 5, (v) => {
      b.lineHeight = v / 100; el.style.setProperty('--lh', String(v / 100)); el.setAttribute('data-lh', '');
      (this.doc!.defaultView as any).yourlinkiFit?.(); (this.doc!.defaultView as any).yourlinkiFloat?.();
    }, (v) => `${v}%`) : null;
    // Word spacing: extra room between words, in % of the text size (0 = as designed).
    const wordSpacing = font ? this.range('Word spacing', Math.round((b.wordSpacing ?? 0) * 100), -30, 150, 5, (v) => {
      b.wordSpacing = v ? v / 100 : undefined; el.style.setProperty('--ws', `${v / 100}em`); el.toggleAttribute('data-ws', !!v);
      (this.doc!.defaultView as any).yourlinkiFit?.(); (this.doc!.defaultView as any).yourlinkiFloat?.();
    }, (v) => `${v > 0 ? '+' : ''}${v}%`) : null;
    const offset = this.range('Space above', b.offset ?? 0, -80, 120, 1, (v) => {
      b.offset = v || undefined; el.style.setProperty('--offset', `${v}px`); el.toggleAttribute('data-offset', !!v);
    }, (v) => `${v > 0 ? '+' : ''}${v}px`);
    const tileStyle = link && safeImg(link.image) && !usesButton(link, this.o.config().look.template)
      ? h('div', { class: 'canvas-shapes' },
        h('p', {}, 'Tile size'),
        h('div', { class: 'canvas-widths tile-presets' }, TILE_PRESETS.map((p) => h('button', {
          type: 'button', class: link.tile?.shape === p.shape && this.span() === p.span ? 'on' : '',
          onclick: () => this.action(() => { link.tile = { ...link.tile, shape: p.shape }; this.applySpan(p.span, false); }),
        }, h('span', { class: `tile-preset-icon preset-${p.label.toLowerCase()}`, 'aria-hidden': 'true' }), p.label))),
        h('p', { style: 'margin-top:10px' }, 'Image style'), tileStylePicker(link, this.o.config().look.template, (change) => this.action(change), false)) : null;
    // Groups (social icons, highlights) can be taken apart so each piece is placed on its own, and put back together.
    const group = b.type === 'social' || b.type === 'highlights' ? b.type : null;
    const groupControls = group ? h('div', { class: 'canvas-shapes' },
      h('p', {}, group === 'social' ? 'Icons as separate items' : 'Numbers as separate items'),
      h('button', { type: 'button', class: 'canvas-reset', onclick: () => {
        const apart = !b.part;
        this.action(() => separateGroup(this.o.config(), group, apart));
        this.select({ id: this.o.config().blocks.find((x) => x.type === group)!.id });
      } }, b.part ? (group === 'social' ? 'Put the icons back in one row' : 'Put the numbers back together') : (group === 'social' ? 'Separate the icons' : 'Separate the numbers'))) : null;
    const textStyle = b.type === 'text' ? h('div', { class: 'canvas-shapes' }, h('p', {}, 'Text style'),
      segmented(TEXT_STYLE_OPTIONS, b.textStyle ?? 'body', (v) => this.action(() => { b.textStyle = v; })),
      this.alignBar(b)) : null;
    const card = CARD_TYPES.includes(b.type) ? h('div', { class: 'canvas-shapes' }, h('p', {}, 'Card style'),
      cardPicker(b.cardStyle ?? (b.type === 'highlights' || b.type === 'text' || (b.type === 'bio' && el.classList.contains('tagline')) ? 'none' : 'glass'),
        (value) => this.action(() => { b.cardStyle = value; el.dataset.card = value; }))) : null;
    const free = b.float || b.dx || b.dy ? h('div', { class: 'canvas-free-info' },
      h('span', {}, 'Placed freely: it stays exactly here, other items never push it.'),
      h('button', { type: 'button', onclick: () => this.action(() => this.dock(b)) }, 'Put back in layout')) : null;
    const rotation = this.selection?.part ? null : this.range('Rotation', b.rotate ?? 0, -180, 180, 1, (v) => {
      b.rotate = v || undefined; el.style.setProperty('--rot', `${v}deg`); el.toggleAttribute('data-rotate', !!v);
    }, (v) => `${v}°`);
    const textControls = h('div', { class: 'canvas-text-controls' }, ...(free ? [free] : []), ...(this.selection?.part === 'name' ? [] : [offset]), ...(textSize ? [textSize] : []), ...(lineSpacing ? [lineSpacing] : []), ...(wordSpacing ? [wordSpacing] : []), ...(rotation ? [rotation] : []));
    this.o.inspector.replaceChildren(tools, actions, textControls, ...(profileParts ? [profileParts] : []), ...(groupControls ? [groupControls] : []), ...(textStyle ? [textStyle] : []), ...(card ? [card] : []), ...(b.type === 'social' && !b.part ? [this.socialPicker()] : []), ...(b.type === 'social' ? [this.iconColors(b)] : []), ...(b.type === 'social' ? [h('div', { class: 'canvas-shapes' }, h('p', {}, 'Icons'),
        segmented([{ value: 'row', label: 'Row' }, { value: 'column', label: 'Column' }], b.vertical ? 'column' : 'row', (v) => this.action(() => {
          b.vertical = v === 'column' || undefined;
          el.toggleAttribute('data-vertical', !!b.vertical);
          if (b.vertical && this.span() > 4) this.applySpan(4, false); // a column only needs a narrow strip beside other items
          if (!b.vertical && this.span() <= 4) this.applySpan(12, false);
        })))] : []), ...(nameControls ? [nameControls] : []), ...(shape ? [shape] : []), ...(tileStyle ? [tileStyle] : []), ...(font ? [font] : []),
      ...(this.selection?.part === 'name' ? [] : [sizeControl, width, this.layerBar(), details]));
    if (focus) [...this.o.inspector.querySelectorAll<HTMLInputElement>('input[data-control]')].find((input) => input.dataset.control === focus)?.focus({ preventScroll: true });
  }
  /** Social icons: their color (page, brand or any color) and the circle behind them. */
  private iconColors(b: PageBlock) {
    const color = b.iconColor ?? '';
    return h('div', { class: 'canvas-shapes' }, h('p', {}, 'Icon color'),
      segmented([{ value: 'page', label: 'Page' }, { value: 'brand', label: 'Brand' }, { value: 'custom', label: 'Custom' }], color === '' ? 'page' : color === 'brand' ? 'brand' : 'custom',
        (v) => this.action(() => { b.iconColor = v === 'page' ? undefined : v === 'brand' ? 'brand' : (/^#/.test(color) ? color : '#ff2d92'); })),
      /^#/.test(color) ? swatches(['#ffffff', '#111111', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#30d5c8', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff2d92', '#a2845e'], color,
        (v) => this.action(() => { b.iconColor = v || undefined; }), false) : null,
      h('p', { style: 'margin-top:10px' }, 'Circles'),
      segmented([{ value: 'glass', label: 'Glass' }, { value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }, { value: 'none', label: 'None' }], b.iconStyle ?? 'glass',
        (v) => this.action(() => { b.iconStyle = v === 'glass' ? undefined : v; })));
  }
  /** "Page" follows the page font (Appearance); any other choice applies to this item only. */
  private fontPicker(b: PageBlock) {
    const options: { value: FontId | ''; label: string }[] = [{ value: '', label: 'Page' }, ...FONT_IDS.map((value) => ({ value, label: FONT_LABELS[value] }))];
    return h('div', { class: 'canvas-shapes' }, h('p', {}, 'Font'),
      h('div', { class: 'font-chips' }, options.map((o) => h('button', {
        type: 'button', class: 'font-chip' + ((b.font ?? '') === o.value ? ' on' : ''), 'aria-pressed': String((b.font ?? '') === o.value),
        style: o.value ? `font-family:${FONTS[o.value]}` : undefined, title: o.value ? `${o.label} font for this item` : 'Use the page font',
        onclick: () => this.action(() => { if (o.value) b.font = o.value; else delete b.font; }),
      }, h('b', {}, 'Aa'), h('span', {}, o.label)))),
      this.weightPicker(b),
      h('div', { class: 'canvas-weight' }, h('p', {}, 'Color'),
        swatches(['', '#ffffff', '#111111', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ff2d92'], b.textColor ?? '',
          (v) => this.action(() => { b.textColor = v || undefined; }), false)));
  }
  /** The alignment toolbar, as in a word processor: lines left, centered, right or justified; and the text at the top,
   * middle or bottom of its box (when the box is stretched taller than the text). */
  private alignBar(b: PageBlock) {
    const line = (widths: number[], x: (w: number) => number) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${widths.map((w, i) => `<rect x="${x(w)}" y="${3 + i * 4}" width="${w}" height="1.8" rx=".9" fill="currentColor"/>`).join('')}</svg>`;
    const box = (y: number) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="1.5" width="14" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="5" y="${y}" width="8" height="1.8" rx=".9" fill="currentColor"/><rect x="5" y="${y + 3.2}" width="6" height="1.8" rx=".9" fill="currentColor"/></svg>`;
    const button = (label: string, svg: string, on: boolean, act: () => void, disabled = false) => {
      const el = h('button', { type: 'button', class: 'align-btn' + (on ? ' on' : ''), title: label, 'aria-label': label, 'aria-pressed': String(on), disabled, onclick: () => this.action(act) });
      el.innerHTML = svg; return el;
    };
    const ha = b.textAlign ?? 'center', va = b.vAlign ?? 'middle', tall = !!b.height;
    return h('div', { class: 'align-bar' },
      button('Align left', line([12, 8, 11], () => 3), ha === 'left', () => { b.textAlign = 'left'; }),
      button('Center', line([12, 8, 11], (w) => (18 - w) / 2), ha === 'center', () => { b.textAlign = 'center'; }),
      button('Align right', line([12, 8, 11], (w) => 15 - w), ha === 'right', () => { b.textAlign = 'right'; }),
      button('Justify', line([12, 12, 12], () => 3), ha === 'justify', () => { b.textAlign = 'justify'; }),
      h('span', { class: 'align-sep' }),
      button(tall ? 'Text at the top' : 'Stretch the box taller first', box(4.5), tall && va === 'top', () => { b.vAlign = 'top'; }, !tall),
      button(tall ? 'Text in the middle' : 'Stretch the box taller first', box(7.4), tall && va === 'middle', () => { b.vAlign = undefined; }, !tall),
      button(tall ? 'Text at the bottom' : 'Stretch the box taller first', box(10.5), tall && va === 'bottom', () => { b.vAlign = 'bottom'; }, !tall));
  }
  /** Text weight for this item: lighter or heavier than the template draws it (bold words inside stay bolder). */
  private weightPicker(b: PageBlock) {
    const el = this.element(), text = el?.querySelector<HTMLElement>('h1, h2, p, span, figcaption') ?? el;
    const now = Number(text ? getComputedStyle(text).fontWeight : 400) || 400;
    const options = [{ value: '300', label: 'Light' }, { value: '400', label: 'Regular' }, { value: '500', label: 'Medium' }, { value: '600', label: 'Semi' }, { value: '700', label: 'Bold' }];
    const current = String(b.weight ?? [300, 400, 500, 600, 700].reduce((p, q) => Math.abs(q - now) < Math.abs(p - now) ? q : p));
    return h('div', { class: 'canvas-weight' }, h('p', {}, 'Weight'),
      segmented(options, current, (v) => this.action(() => { b.weight = Number(v) as PageBlock['weight']; })));
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
      finish(cancel);
      if (cancel) this.history.cancel();
      else {
        for (const id of this.multi.length > 1 ? this.multi : [this.selection?.id]) {
          const fb = this.o.config().blocks.find((b) => b.id === id), fel = id ? this.doc?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`) : null;
          if (fb?.float && !fb.float.a && fel) this.anchorFloat(fb, fel);
        }
        this.history.end();
      }
      this.o.commit(true); this.inspector(); this.position();
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
  /** The rotation handle: turns the item around its center. Snaps to straight angles (every 45°) when close; Shift turns in 15° steps. */
  private turn(event: PointerEvent) {
    const b = this.block(), el = this.element(); if (!b || !el || this.selection?.part) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const angle = (e: { clientX: number; clientY: number }) => Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const start = angle(event), base = b.rotate ?? 0;
    const label = this.ui!.querySelector<HTMLElement>('.canvas-angle')!;
    this.gesture(event, (e) => {
      let value = base + angle(e) - start;
      value = ((value + 540) % 360) - 180;
      if (e.shiftKey) value = Math.round(value / 15) * 15;
      else { const straight = Math.round(value / 45) * 45; if (Math.abs(value - straight) < 3) value = straight; }
      value = Math.round(value * 10) / 10;
      if (value === -180) value = 180;
      b.rotate = value || undefined;
      el.style.setProperty('--rot', `${value}deg`); el.toggleAttribute('data-rotate', !!value);
      label.hidden = false; label.textContent = `${Math.round(value)}°`;
      this.position();
    }, () => { label.hidden = true; });
  }
  /** Side handles: the left one changes the width keeping the right edge in place; top and bottom change the height.
   * Pulling the top edge keeps the bottom edge in place (the item grows upwards). */
  private stretch(event: PointerEvent, handle: string) {
    const across = handle.includes('left') ? 'left' : handle.includes('right') ? 'right' : null;
    const down = handle.includes('top') ? 'top' : handle.includes('bottom') ? 'bottom' : null;
    const b = this.block(), el = this.element(); if (!b || !el || this.selection?.part) return;
    const stack = this.doc!.querySelector<HTMLElement>('.stack')!, win = this.doc!.defaultView!;
    const x = event.clientX, y = event.clientY, rect = el.getBoundingClientRect();
    const pad = parseFloat(win.getComputedStyle(stack).paddingLeft) || 0, gap = parseFloat(win.getComputedStyle(stack).columnGap) || 0;
    const column = (stack.clientWidth - pad * 2 + gap) / 12;
    const span = this.span(), start = Math.max(1, Math.min(13 - span, Math.round((rect.left - stack.getBoundingClientRect().left - pad) / column) + 1)), end = start + span - 1;
    const height = rect.height, offset = b.offset ?? 0, scale0 = b.textScale ?? 1;
    const setHeight = (value: number) => {
      value = Math.round(Math.max(24, Math.min(900, value)));
      b.height = value; el.style.setProperty('--h', `${value}px`); el.setAttribute('data-height', '');
      if (down === 'top') { const moved = offset - (value - height); b.offset = moved || undefined; el.style.setProperty('--offset', `${moved}px`); el.toggleAttribute('data-offset', !!moved); }
    };
    // Corners scale the whole item like a picture: width, height and text size together.
    if (across && down) {
      this.gesture(event, (e) => {
        const grow = ((across === 'right' ? 1 : -1) * (e.clientX - x) / rect.width + (down === 'bottom' ? 1 : -1) * (e.clientY - y) / height) / 2;
        const wanted = Math.max(.2, 1 + grow);
        const columns = Math.max(2, Math.min(12, Math.round(span * wanted)));
        const factor = wanted; // the width moves in page columns, height and text follow the pointer smoothly
        if (across === 'right') this.applySpan(columns);
        else {
          const first = Math.max(1, end - columns + 1);
          this.clearInset(b, el);
          const fit = b.float ? null : this.fitRow(b, el, first, end - first + 1);
          b.design = fit ? { span: fit.span, align: b.design?.align ?? 'auto', start: fit.start } : { span: end - first + 1, align: b.design?.align ?? 'auto', start: first };
          el.style.gridColumn = designStyle(b.design).replace('grid-column:', ''); el.dataset.layoutSpan = String(b.design.span);
          if (b.float) this.floatSpan(b, el, b.design.span, true);
          const tier = sizeTier(b.design.span); if (tier) el.dataset.size = tier; else delete el.dataset.size;
        }
        setHeight(height * factor);
        if (b.type !== 'shape' && b.type !== 'image') {
          const ts = Math.round(Math.max(.5, Math.min(8, scale0 * factor)) * 100) / 100;
          b.textScale = ts === 1 ? undefined : ts; el.style.setProperty('--text-scale', String(ts)); el.toggleAttribute('data-text-scale', ts !== 1);
        }
        (this.doc!.defaultView as any).yourlinkiFit?.();
        this.position();
      }, () => {});
      return;
    }
    this.gesture(event, (e) => {
      if (across === 'right') {
        const value = span + (e.clientX - x) / column;
        this.applySpan(value > 11.2 ? 12 : value);
      }
      if (across === 'left') {
        const first = Math.max(1, Math.min(end - 1, Math.round(start + (e.clientX - x) / column)));
        this.clearInset(b, el);
        const fit = b.float ? null : this.fitRow(b, el, first, end - first + 1);
        b.design = fit ? { span: fit.span, align: b.design?.align ?? 'auto', start: fit.start } : { span: end - first + 1, align: b.design?.align ?? 'auto', start: first };
        el.style.gridColumn = designStyle(b.design).replace('grid-column:', ''); el.dataset.layoutSpan = String(b.design.span);
        if (b.float) this.floatSpan(b, el, b.design.span, true);
        const tier = sizeTier(b.design.span); if (tier) el.dataset.size = tier; else delete el.dataset.size;
      }
      if (down) {
        const dy = e.clientY - y;
        setHeight(down === 'bottom' ? height + dy : height - dy);
        (this.doc!.defaultView as any).yourlinkiFit?.(); // text shrinks to fit while the box gets smaller
      }
      this.position();
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
    if (this.freeMode || event.shiftKey) { this.freeDrag(event, handle); return; }
    const source = this.element(), selection = this.selection; if (!source || !selection || this.busy) return;
    const doc = this.doc!, win = doc.defaultView!, rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement; ghost.removeAttribute('data-block-id'); ghost.removeAttribute('data-free'); ghost.removeAttribute('data-offset'); ghost.style.translate = 'none'; ghost.classList.add('canvas-ghost'); ghost.style.width = `${Math.min(rect.width, win.innerWidth - 16)}px`;
    const marker = doc.createElement('div'); marker.className = 'canvas-drop';
    let destination: ReturnType<typeof dropTarget> = null, side = false, sameRow = false, x = event.clientX, y = event.clientY, animation = 0, last = 0, moved = false;
    // The ghost keeps the spot where the item was grabbed, so where it is let go is where it goes.
    const grabX = event.clientX - rect.left, grabY = event.clientY - rect.top, home = { top: rect.top + win.scrollY, bottom: rect.bottom + win.scrollY };
    const update = () => {
      ghost.style.left = `${Math.max(8, Math.min(win.innerWidth - ghost.offsetWidth - 8, x - grabX))}px`; ghost.style.top = `${y - grabY}px`;
      const rects: BlockRect[] = this.elements().map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.blockId!, left: r.left, top: r.top, width: r.width, height: r.height }; });
      destination = dropTarget(rects, x, y, selection.id, win.innerWidth);
      // Over empty space in its own row: it only slides sideways, the order stays.
      const over = rects.some((r) => r.id !== selection.id && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height);
      sameRow = !over && y + win.scrollY >= home.top && y + win.scrollY <= home.bottom;
      const r = sameRow ? undefined : rects.find((r) => r.id === destination?.id);
      marker.hidden = !r;
      if (r && destination) {
        const vertical = r.width < win.innerWidth * .7 && y >= r.top && y <= r.top + r.height;
        side = vertical;
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
      if (!cancel && moved && destination) {
        // An item placed freely before rejoins the layout where it is dropped, and its empty space closes.
        const b = this.o.config().blocks.find((x) => x.id === selection.id), to = destination;
        if (b && !sameRow) this.dock(b, () => moveBlock(this.o.config(), selection.id, to.id, to.after));
        if (b && side && !sameRow) this.besides(b, to.id);
        else if (b) {
          // Dropped on empty space: an item narrower than the page also goes sideways, to the columns where it was let go.
          const span = normalizeBlockDesign(b.design)?.span ?? 12;
          if (span < 12) {
            const stack = doc.querySelector<HTMLElement>('.stack')!, st = win.getComputedStyle(stack);
            const pad = parseFloat(st.paddingLeft) || 0, gap = parseFloat(st.columnGap) || 0, column = (stack.clientWidth - pad * 2 + gap) / 12;
            const left = x - grabX - stack.getBoundingClientRect().left - pad;
            const start = Math.max(1, Math.min(13 - span, Math.round(left / column) + 1));
            if (sameRow && b.float) this.dock(b);
            b.design = { span, align: 'auto', start };
          }
        }
      }
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

/** The marks a text item is stored with, from what was typed on the page (see rich() and richBlock() in lib/render). */
function markdown(node: Node): string {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) { out += n.textContent ?? ''; return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return; // (not instanceof: the page's elements belong to the preview frame)
    const el = n as HTMLElement, tag = el.tagName.toLowerCase(), inner = markdown(el);
    if (tag === 'br') out += '\n';
    else if (tag === 'strong' || tag === 'b') out += inner.trim() ? `**${inner}**` : inner;
    else if (tag === 'em' || tag === 'i') out += inner.trim() ? `*${inner}*` : inner;
    else if (tag === 'u') out += inner.trim() ? `__${inner}__` : inner;
    else if (tag === 's' || tag === 'del' || tag === 'strike') out += inner.trim() ? `~~${inner}~~` : inner;
    else if (tag === 'a') out += el.getAttribute('href') ? `[${inner}](${el.getAttribute('href')})` : inner;
    else if (tag === 'ul' || tag === 'ol') { if (out && !out.endsWith('\n')) out += '\n'; [...el.children].forEach((li, i) => { out += `${tag === 'ol' ? `${i + 1}.` : '-'} ${markdown(li).replace(/\n+$/, '')}\n`; }); }
    else if (tag === 'div' || tag === 'p' || el.classList.contains('text-para')) { if (out && !out.endsWith('\n')) out += '\n'; out += inner; if (!out.endsWith('\n')) out += '\n'; }
    else out += inner;
  });
  return out;
}
