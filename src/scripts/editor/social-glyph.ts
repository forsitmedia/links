import { platform } from '../../lib/platforms';
import { h, svg } from './ui';

/** A monochrome glyph stays readable in both the light and dark editor. */
export function socialGlyph(key: string) {
  const p = platform(key);
  return p?.slug ? h('span', { class: 'social-glyph', 'aria-hidden': 'true', style: `mask-image:url("https://cdn.simpleicons.org/${p.slug}");-webkit-mask-image:url("https://cdn.simpleicons.org/${p.slug}")` }) : svg(p?.icon ?? 'link', 20);
}
