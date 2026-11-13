/** Decorative shapes: abstract drawings people place around the page. All are drawn on a 100×100 grid. */

/** `line` shapes are always drawn as strokes; the others can be filled or drawn as an outline. */
export const SHAPES: { id: string; label: string; line?: boolean; svg: string }[] = [
  { id: 'blob', label: 'Blob', svg: '<path d="M50 6c13 0 24 6 31 16s11 22 7 35-12 24-24 29-26 6-37-1S8 67 7 53s3-27 12-36S37 6 50 6z"/>' },
  { id: 'sparkle', label: 'Sparkle', svg: '<path d="M50 4c3 25 21 43 46 46-25 3-43 21-46 46-3-25-21-43-46-46 25-3 43-21 46-46z"/>' },
  { id: 'burst', label: 'Burst', svg: '<path d="M50 3l8 20 19-11-5 21 22 2-17 14 17 14-22 2 5 21-19-11-8 20-8-20-19 11 5-21-22-2 17-14L5 35l22-2-5-21 19 11z"/>' },
  { id: 'flower', label: 'Flower', svg: '<circle cx="50" cy="24" r="20"/><circle cx="76" cy="50" r="20"/><circle cx="50" cy="76" r="20"/><circle cx="24" cy="50" r="20"/><circle cx="50" cy="50" r="16"/>' },
  { id: 'asterisk', label: 'Asterisk', svg: '<rect x="42" y="4" width="16" height="92" rx="8"/><rect x="42" y="4" width="16" height="92" rx="8" transform="rotate(60 50 50)"/><rect x="42" y="4" width="16" height="92" rx="8" transform="rotate(120 50 50)"/>' },
  { id: 'arch', label: 'Arch', svg: '<path d="M10 94V50a40 40 0 0 1 80 0v44H66V50a16 16 0 0 0-32 0v44z"/>' },
  { id: 'moons', label: 'Halves', svg: '<path d="M8 46a42 42 0 0 1 84 0z"/><path d="M8 54h84a42 42 0 0 1-84 0z"/>' },
  { id: 'dots', label: 'Dots', svg: '<circle cx="18" cy="18" r="10"/><circle cx="50" cy="18" r="10"/><circle cx="82" cy="18" r="10"/><circle cx="18" cy="50" r="10"/><circle cx="50" cy="50" r="10"/><circle cx="82" cy="50" r="10"/><circle cx="18" cy="82" r="10"/><circle cx="50" cy="82" r="10"/><circle cx="82" cy="82" r="10"/>' },
  { id: 'sun', label: 'Sun', svg: '<circle cx="50" cy="50" r="22"/><g><rect x="46" y="2" width="8" height="18" rx="4"/><rect x="46" y="80" width="8" height="18" rx="4"/><rect x="2" y="46" width="18" height="8" rx="4"/><rect x="80" y="46" width="18" height="8" rx="4"/><rect x="46" y="2" width="8" height="18" rx="4" transform="rotate(45 50 50)"/><rect x="46" y="80" width="8" height="18" rx="4" transform="rotate(45 50 50)"/><rect x="2" y="46" width="18" height="8" rx="4" transform="rotate(45 50 50)"/><rect x="80" y="46" width="18" height="8" rx="4" transform="rotate(45 50 50)"/></g>' },
  { id: 'heart', label: 'Heart', svg: '<path d="M50 90S8 64 8 34A21 21 0 0 1 50 24a21 21 0 0 1 42 10c0 30-42 56-42 56z"/>' },
  { id: 'ring', label: 'Ring', line: true, svg: '<circle cx="50" cy="50" r="38"/>' },
  { id: 'squiggle', label: 'Squiggle', line: true, svg: '<path d="M6 60c8-20 16-20 22 0s14 20 22 0 14-20 22 0 14 20 22 0"/>' },
  { id: 'zigzag', label: 'Zigzag', line: true, svg: '<path d="M6 64l15-28 15 28 14-28 15 28 14-28 15 28"/>' },
  { id: 'spiral', label: 'Spiral', line: true, svg: '<path d="M52 50a4 4 0 1 1-6-4c6-4 14 1 14 8 0 9-9 15-18 14-12-1-19-13-17-24 3-15 19-24 33-20 18 4 28 23 23 40"/>' },
  { id: 'arrow', label: 'Arrow', line: true, svg: '<path d="M12 22c10 40 38 58 70 56"/><path d="M68 64l15 14-17 10"/>' },
  { id: 'orbit', label: 'Orbit', line: true, svg: '<ellipse cx="50" cy="50" rx="44" ry="18" transform="rotate(-25 50 50)"/><ellipse cx="50" cy="50" rx="44" ry="18" transform="rotate(35 50 50)"/>' },
];

/** Colors: gradients that look good on dark and light pages, or the page's own text color. */
export const SHAPE_COLORS: { id: string; label: string; stops: [string, string] | null }[] = [
  { id: 'text', label: 'Page', stops: null },
  { id: 'sunset', label: 'Sunset', stops: ['#ff9a5a', '#ff3d7f'] },
  { id: 'ocean', label: 'Ocean', stops: ['#4facfe', '#2b5cff'] },
  { id: 'mint', label: 'Mint', stops: ['#a8ff78', '#2bd9a8'] },
  { id: 'violet', label: 'Violet', stops: ['#c3a6ff', '#7b4dff'] },
  { id: 'gold', label: 'Gold', stops: ['#ffe27a', '#ff9f1c'] },
  { id: 'candy', label: 'Candy', stops: ['#ffb3f1', '#8fd3ff'] },
  { id: 'chrome', label: 'Chrome', stops: ['#ffffff', '#8a93a6'] },
  { id: 'aurora', label: 'Aurora', stops: ['#00e0ff', '#8f3bff'] },
  { id: 'fire', label: 'Fire', stops: ['#ffd23f', '#ff2e2e'] },
  { id: 'berry', label: 'Berry', stops: ['#ff6fd8', '#7f2fff'] },
  { id: 'forest', label: 'Forest', stops: ['#c6f36b', '#0f9b6c'] },
  { id: 'peach', label: 'Peach', stops: ['#ffe0c2', '#ff8a8a'] },
  { id: 'lagoon', label: 'Lagoon', stops: ['#7cf7d4', '#1f8fff'] },
  { id: 'night', label: 'Night', stops: ['#5b6cff', '#141a3d'] },
  { id: 'lava', label: 'Lava', stops: ['#ff8a00', '#b3006b'] },
  { id: 'white', label: 'White', stops: ['#ffffff', '#ffffff'] },
  { id: 'black', label: 'Black', stops: ['#111111', '#111111'] },
  { id: 'red', label: 'Red', stops: ['#ff3b30', '#ff3b30'] },
  { id: 'orange', label: 'Orange', stops: ['#ff9500', '#ff9500'] },
  { id: 'yellow', label: 'Yellow', stops: ['#ffd60a', '#ffd60a'] },
  { id: 'green', label: 'Green', stops: ['#34c759', '#34c759'] },
  { id: 'teal', label: 'Teal', stops: ['#30d5c8', '#30d5c8'] },
  { id: 'blue', label: 'Blue', stops: ['#0a84ff', '#0a84ff'] },
  { id: 'indigo', label: 'Indigo', stops: ['#5e5ce6', '#5e5ce6'] },
  { id: 'purple', label: 'Purple', stops: ['#bf5af2', '#bf5af2'] },
  { id: 'pink', label: 'Pink', stops: ['#ff2d92', '#ff2d92'] },
  { id: 'brown', label: 'Brown', stops: ['#a2845e', '#a2845e'] },
  { id: 'custom', label: 'Custom', stops: null },
];
const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const SHAPE_MOTIONS = ['none', 'spin', 'float', 'pulse'] as const;
export type ShapeMotion = typeof SHAPE_MOTIONS[number];

/** The shape as inline SVG. `uid` keeps each gradient's id unique on the page. */
export function shapeSvg(o: { shape?: string; color?: string; outline?: boolean; rotate?: number; from?: string; to?: string }, uid: string): string {
  const shape = SHAPES.find((s) => s.id === o.shape) ?? SHAPES[0];
  const preset = SHAPE_COLORS.find((c) => c.id === o.color) ?? SHAPE_COLORS[1];
  // Custom: the person's own two colors (one color when both are the same).
  const color = preset.id === 'custom' ? { stops: [hex(o.from) ? o.from! : '#ff3d7f', hex(o.to) ? o.to! : hex(o.from) ? o.from! : '#7b4dff'] as [string, string] } : preset;
  const id = 'g' + uid.replace(/[^a-z0-9]/gi, '');
  const paint = color.stops ? `url(#${id})` : 'currentColor';
  const line = shape.line || o.outline;
  const look = line ? `fill="none" stroke="${paint}" stroke-width="${shape.line ? 8 : 5}" stroke-linecap="round" stroke-linejoin="round"` : `fill="${paint}"`;
  const gradient = color.stops ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="${color.stops[0]}"/><stop offset="1" stop-color="${color.stops[1]}"/></linearGradient></defs>` : '';
  const turn = Math.round(Number(o.rotate) || 0) % 360;
  return `<svg viewBox="-4 -4 108 108" aria-hidden="true" focusable="false">${gradient}<g ${look}${turn ? ` transform="rotate(${turn} 50 50)"` : ''}>${shape.svg}</g></svg>`;
}
