import { BUTTON_SHAPES, type ButtonShape } from '../../lib/button-shape';
import { h } from './ui';

export function shapePicker(current: ButtonShape, change: (shape: ButtonShape) => void) {
  const picker = h('div', { class: 'shape-picker', role: 'group', 'aria-label': 'Button shape' });
  picker.append(...BUTTON_SHAPES.map((shape) => h('button', {
    type: 'button', class: `shape-option shape-${shape.value}`, 'aria-label': `${shape.label} button shape`, 'aria-pressed': String(shape.value === current),
    onclick: () => { picker.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shape === shape.value))); change(shape.value); }, 'data-shape': shape.value,
  }, h('span', { class: 'shape-sample', 'aria-hidden': 'true' }), shape.label)));
  return picker;
}
