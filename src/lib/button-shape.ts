import type { Link, Template } from './types';

export const BUTTON_SHAPES = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' },
  { value: 'square', label: 'Square' },
] as const;
export type ButtonShape = typeof BUTTON_SHAPES[number]['value'];
export const normalizeButtonShape = (value: unknown): ButtonShape | undefined => BUTTON_SHAPES.find((s) => s.value === value)?.value;
export const usesButton = (link: Link, template: Template) => !link.image || (!!link.featured && template !== 'gallery');
export function buttonShape(link: Link, template: Template): ButtonShape {
  return normalizeButtonShape(link.buttonShape) ?? (['studio', 'cover', 'gallery'].includes(template) ? 'square' : template === 'classic' || template === 'bold' || (link.featured && template === 'photo') ? 'pill' : 'rounded');
}

/** Fill of one button: solid (accent color), see-through glass, or an outline only. */
export const BUTTON_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'glass', label: 'Glass' },
  { value: 'outline', label: 'Outline' },
] as const;
export type ButtonStyle = typeof BUTTON_STYLES[number]['value'];
export const normalizeButtonStyle = (value: unknown): ButtonStyle | undefined => BUTTON_STYLES.find((s) => s.value === value)?.value;
/** What the button looks like without a choice: the featured button is solid, the others glass. */
export const buttonStyle = (link: Link): ButtonStyle => normalizeButtonStyle(link.buttonStyle) ?? (link.featured ? 'solid' : 'glass');
