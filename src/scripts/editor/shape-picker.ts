import { BUTTON_SHAPES, BUTTON_STYLES, type ButtonShape, type ButtonStyle } from '../../lib/button-shape';
import type { CardStyle } from '../../lib/types';
import { h } from './ui';

export function shapePicker(current: ButtonShape, change: (shape: ButtonShape) => void) {
  const picker = h('div', { class: 'shape-picker', role: 'group', 'aria-label': 'Button shape' });
  picker.append(...BUTTON_SHAPES.map((shape) => h('button', {
    type: 'button', class: `shape-option shape-${shape.value}`, 'aria-label': `${shape.label} button shape`, 'aria-pressed': String(shape.value === current),
    onclick: () => { picker.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shape === shape.value))); change(shape.value); }, 'data-shape': shape.value,
  }, h('span', { class: 'shape-sample', 'aria-hidden': 'true' }), shape.label)));
  return picker;
}

const CARD_OPTIONS = [{ value: 'glass', label: 'Glass' }, { value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }, { value: 'none', label: 'None' }] as const;
/** Card background for videos, posts, images, credentials, bio, highlights and text. */
export function cardPicker(current: CardStyle, change: (style: CardStyle) => void) {
  const picker = h('div', { class: 'shape-picker card-picker', role: 'group', 'aria-label': 'Card style' });
  picker.append(...CARD_OPTIONS.map((o) => h('button', {
    type: 'button', class: `shape-option fill-${o.value === 'solid' ? 'card-solid' : o.value}`, 'aria-label': `${o.label} card`, 'aria-pressed': String(o.value === current), 'data-fill': o.value,
    onclick: () => { picker.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fill === o.value))); change(o.value); },
  }, h('span', { class: 'shape-sample', 'aria-hidden': 'true' }), o.label)));
  return picker;
}

export function stylePicker(current: ButtonStyle, change: (style: ButtonStyle) => void) {
  const picker = h('div', { class: 'shape-picker', role: 'group', 'aria-label': 'Button style' });
  picker.append(...BUTTON_STYLES.map((style) => h('button', {
    type: 'button', class: `shape-option fill-${style.value}`, 'aria-label': `${style.label} button style`, 'aria-pressed': String(style.value === current), 'data-fill': style.value,
    onclick: () => { picker.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fill === style.value))); change(style.value); },
  }, h('span', { class: 'shape-sample', 'aria-hidden': 'true' }), style.label)));
  return picker;
}
