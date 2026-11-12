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
