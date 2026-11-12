/** Per-link style for photo tiles: where the text sits, how much shade sits behind it, and its color.
 * Every field is optional; a missing one keeps the template's look. */
export const TILE_TEXT = [
  { value: 'center', label: 'On image' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'below', label: 'Below' },
  { value: 'none', label: 'Hidden' },
] as const;
export const TILE_SHADE = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft' },
  { value: 'strong', label: 'Strong' },
] as const;

export type TileStyle = {
  text?: typeof TILE_TEXT[number]['value'];
  shade?: typeof TILE_SHADE[number]['value'];
  color?: string;
};

export function normalizeTileStyle(value: any): TileStyle | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const style: TileStyle = {
    ...(TILE_TEXT.some((o) => o.value === value.text) ? { text: value.text } : {}),
    ...(TILE_SHADE.some((o) => o.value === value.shade) ? { shade: value.shade } : {}),
    ...(/^#[0-9a-f]{6}$/i.test(value.color) ? { color: value.color } : {}),
  };
  return Object.keys(style).length ? style : undefined;
}

/** Tile attributes: data-text / data-shade select the CSS. (The tile's style attribute belongs to its layout.) */
export function tileAttributes(value?: TileStyle): string {
  const s = normalizeTileStyle(value);
  return (s?.text ? ` data-text="${s.text}"` : '') + (s?.shade ? ` data-shade="${s.shade}"` : '');
}

/** The text color goes on the label itself. */
export const tileTextStyle = (value?: TileStyle) => { const c = normalizeTileStyle(value)?.color; return c ? ` style="color:${c}"` : ''; };
