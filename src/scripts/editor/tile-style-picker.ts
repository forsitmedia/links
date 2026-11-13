/** Photo tile style: text position, shade and text color. Shown only for links that have an image. */
import { TILE_SHADE, TILE_SHAPES, TILE_TEXT, type TileStyle } from '../../lib/tile-style';
import type { Link, Template } from '../../lib/types';
import { h, segmented, swatches } from './ui';

/** What the template shows when the creator has not chosen. */
const templateText = (template: Template): NonNullable<TileStyle['text']> => (template === 'gallery' ? 'center' : 'bottom');

/** `update` applies a change and saves it; `redraw` is false for live color picking, so an open picker stays open.
 * `liveColor: false` applies a custom color when its picker closes, for places that always redraw. */
export function tileStylePicker(link: Link, template: Template, update: (change: () => void, redraw: boolean) => void, liveColor = true): HTMLElement {
  const style = link.tile ?? {};
  const text = style.text ?? templateText(template);
  const set = (patch: Partial<TileStyle>, redraw = true) => update(() => { link.tile = { ...link.tile, ...patch }; }, redraw);
  const row = (label: string, control: Node) => h('div', { class: 'tile-style-row' }, h('span', {}, label), control);
  return h('div', { class: 'tile-style' },
    row('Shape', segmented(TILE_SHAPES.map((o) => ({ ...o })), style.shape ?? ('' as TileStyle['shape'] & string), (v) => set({ shape: v }))),
    // "Side" puts the text beside the picture; which side is a second, smaller choice.
    row('Text', segmented([...TILE_TEXT.filter((o) => o.value !== 'left' && o.value !== 'right').map((o) => ({ ...o })).slice(0, 3), { value: 'side' as const, label: 'Side' }, { value: 'none' as const, label: 'Hidden' }],
      text === 'left' || text === 'right' ? 'side' : text, (v) => set({ text: v === 'side' ? 'right' : v }))),
    (text === 'left' || text === 'right') && row('Text side', segmented([{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], text, (v) => set({ text: v }))),
    !['below', 'none', 'left', 'right'].includes(text) && row('Shade', segmented(TILE_SHADE.map((o) => ({ ...o })), style.shade ?? ('' as TileStyle['shade'] & string), (v) => set({ shade: v }))),
    text !== 'none' && row('Text color', swatches(['', '#ffffff', '#111111'], style.color ?? '', (v) => set({ color: v || undefined }, false), liveColor)),
    link.tile && h('button', { type: 'button', class: 'btn-text tile-style-reset', onclick: () => update(() => { link.tile = undefined; }, true) }, 'Use template style'));
}
