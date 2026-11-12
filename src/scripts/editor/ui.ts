/** Small iOS-style UI kit: grouped lists, rows, switches, segmented controls, sheets. */
import { icon } from '../../lib/icons';

type Kid = Node | string | null | undefined | false | Kid[];

export function h(tag: string, props: Record<string, any> = {}, ...kids: Kid[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (['value', 'checked', 'disabled'].includes(k)) (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...(kids.flat(Infinity as 1) as (Node | string | null | undefined | false)[]).filter((k): k is Node | string => !!k));
  return el;
}

export function svg(name: string, size = 20): Node {
  const t = document.createElement('template');
  t.innerHTML = icon(name, size);
  return t.content.firstChild!;
}

export function group(o: { header?: string; action?: { label: string; onClick: () => void }; footer?: string }, ...rows: Kid[]) {
  return h('section', { class: 'group' },
    (o.header || o.action) && h('div', { class: 'group-h' }, h('span', {}, o.header ?? ''), o.action && h('button', { onclick: o.action.onClick }, o.action.label)),
    h('div', { class: 'list' }, ...rows),
    o.footer && h('p', { class: 'group-f' }, o.footer));
}

/** A tappable row with an optional leading icon, subtitle, trailing value and chevron. */
export function navRow(o: { lead?: Node; title: string; subtitle?: string; value?: string; onClick?: () => void; trail?: Node; chevron?: boolean }) {
  return h(o.onClick ? 'button' : 'div', { class: 'row' + (o.lead ? ' has-lead' : ''), onclick: o.onClick, type: o.onClick ? 'button' : undefined },
    o.lead && h('span', { class: 'lead' }, o.lead),
    h('span', { class: 'txt' }, o.title, o.subtitle && h('small', {}, o.subtitle)),
    o.value && h('span', { class: 'val' }, o.value),
    o.trail,
    o.chevron !== false && o.onClick && h('span', { class: 'chev' }, svg('chevron', 16)));
}

export const actionRow = (label: string, onClick: () => void) =>
  h('button', { class: 'row action', type: 'button', onclick: onClick }, svg('plus', 18), label);

export const dangerRow = (label: string, onClick: () => void) =>
  h('button', { class: 'row danger', type: 'button', onclick: onClick }, label);

export function inputRow(label: string, value: string, onInput: (v: string) => void, o: { placeholder?: string; type?: string; max?: number; prefix?: string } = {}) {
  return h('label', { class: 'row field' }, h('span', { class: 'lbl' }, label), o.prefix && h('span', { class: 'prefix' }, o.prefix),
    h('input', { type: o.type ?? 'text', value, placeholder: o.placeholder ?? '', maxlength: o.max, autocapitalize: o.type === 'url' ? 'off' : undefined, oninput: (e: any) => onInput(e.target.value) }));
}

export function textareaRow(value: string, onInput: (v: string) => void, placeholder: string, max = 160) {
  const count = h('span', { class: 'count' }, `${value.length}/${max}`);
  return h('label', { class: 'row field area' },
    h('textarea', { rows: 3, maxlength: max, placeholder, oninput: (e: any) => { onInput(e.target.value); count.textContent = `${e.target.value.length}/${max}`; } }, value), count);
}

export function switchRow(label: string, checked: boolean, onChange: (v: boolean) => void) {
  return h('label', { class: 'row' }, h('span', { class: 'txt' }, label),
    h('input', { type: 'checkbox', class: 'switch', checked, onchange: (e: any) => onChange(e.target.checked) }));
}

export function segmented<T extends string>(options: { value: T; label: string; style?: string }[], current: T, onChange: (v: T) => void) {
  const el = h('div', { class: 'seg', role: 'tablist' });
  for (const o of options) {
    el.append(h('button', { type: 'button', class: o.value === current ? 'on' : '', style: o.style, onclick: () => {
      el.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      el.children[options.indexOf(o)].classList.add('on');
      onChange(o.value);
    } }, o.label));
  }
  return el;
}

/** Round color swatches plus a custom picker. `''` is shown as the automatic option.
 * With `live: false` the custom color applies when the picker closes (for controls that redraw on change). */
export function swatches(colors: string[], current: string, onChange: (v: string) => void, live = true) {
  const el = h('div', { class: 'swatches' });
  const select = (v: string) => { el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', (s as HTMLElement).dataset.v === v)); onChange(v); };
  for (const c of colors) {
    el.append(h('button', { type: 'button', class: 'swatch' + (c === '' ? ' auto' : '') + (c === current ? ' on' : ''), 'data-v': c, title: c || 'Automatic', style: c ? `background:${c}` : undefined, onclick: () => select(c) }));
  }
  const custom = !colors.includes(current);
  el.append(h('label', { class: 'swatch custom' + (custom ? ' on' : ''), 'data-v': custom ? current : '#custom', title: 'Custom color' },
    h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(current) ? current : '#888888', [live ? 'oninput' : 'onchange']: (e: any) => {
      const lbl = e.target.parentElement as HTMLElement;
      lbl.dataset.v = e.target.value;
      select(e.target.value);
    } })));
  return el;
}

/** Bottom sheet (centered dialog on wide screens) with an iOS navigation bar. */
export function sheet(title: string, build: (close: () => void) => Kid[], o: { done?: string; cancel?: string; onDone?: () => void; onClose?: () => void; canClose?: () => boolean } = {}) {
  const back = h('div', { class: 'sheet-back' });
  let closing = false;
  const previous = document.activeElement as HTMLElement | null;
  const close = () => {
    if (closing || o.canClose?.() === false) return;
    closing = true;
    back.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      back.remove();
      const top = [...document.querySelectorAll('.sheet-back:not(.closing)')].at(-1);
      if (!top || (previous && top.contains(previous))) previous?.focus({ preventScroll: true });
    }, 200);
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if ([...document.querySelectorAll('.sheet-back:not(.closing)')].at(-1) !== back) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const items = [...back.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href]')];
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(h('div', { class: 'sheet', role: 'dialog', 'aria-label': title, 'aria-modal': 'true' },
    h('div', { class: 'sheet-nav' }, o.cancel ? h('button', { class: 'btn-text sheet-cancel', type: 'button', onclick: close }, o.cancel) : h('span'), h('b', {}, title), h('button', { class: 'btn-text bold', type: 'button', onclick: () => { o.onDone?.(); close(); } }, o.done ?? 'Done')),
    ...build(close)));
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  (back.querySelector<HTMLElement>('input, textarea, select') ?? back.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
  return close;
}

export function toast(msg: string) {
  document.querySelectorAll('.toast').forEach((el) => el.remove());
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2000);
}

export const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
