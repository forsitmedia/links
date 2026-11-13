/** Canva-style guides for the layout editor: purple lines when an item lines up with the page or another item,
 * and the distances around it, marked "=" when the two sides match (symmetry). Everything is in preview coordinates. */

type Box = { left: number; top: number; right: number; bottom: number };
const box = (r: DOMRect | Box): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
const cx = (b: Box) => (b.left + b.right) / 2;
const cy = (b: Box) => (b.top + b.bottom) / 2;
/** How close (px) an edge must come to a guide to snap onto it. */
const SNAP = 6;
/** Two distances within this many px count as equal. */
const EQUAL = 1.5;

export class Guides {
  private layer: HTMLElement;
  constructor(private doc: Document) {
    this.layer = doc.createElement('div');
    this.layer.className = 'canvas-guides';
    doc.body.append(this.layer);
  }
  remove() { this.layer.remove(); }
  clear() { this.layer.replaceChildren(); }

  /** Moves a proposed position onto the nearest guides (page center, page edges, other items' edges and centers). */
  snap(rect: Box, others: Box[], page: Box): { x: number; y: number; xs: number[]; ys: number[] } {
    const xs = [cx(page), page.left, page.right, ...others.flatMap((o) => [o.left, cx(o), o.right])];
    const ys = others.flatMap((o) => [o.top, cy(o), o.bottom]);
    const best = (mine: number[], lines: number[]) => {
      let shift = 0, found: number[] = [], distance = SNAP + 1;
      for (const m of mine) for (const l of lines) {
        const d = Math.abs(l - m);
        if (d < distance - .01) { distance = d; shift = l - m; found = [l]; }
        else if (Math.abs(d - distance) < .01 && !found.includes(l)) found.push(l);
      }
      return distance <= SNAP ? { shift, found } : { shift: 0, found: [] };
    };
    const x = best([rect.left, cx(rect), rect.right], xs), y = best([rect.top, cy(rect), rect.bottom], ys);
    return { x: x.shift, y: y.shift, xs: x.found, ys: y.found };
  }

  /** Draws alignment lines and the distances around `rect`. */
  show(rect: Box, others: Box[], page: Box, aligned: { xs?: number[]; ys?: number[] } = {}) {
    this.clear();
    const win = this.doc.defaultView!, sx = win.scrollX, sy = win.scrollY;
    const line = (x1: number, y1: number, x2: number, y2: number, kind = '') => {
      const el = this.doc.createElement('div');
      el.className = `guide-line ${x1 === x2 ? 'v' : 'h'} ${kind}`;
      el.style.left = `${Math.min(x1, x2) + sx}px`; el.style.top = `${Math.min(y1, y2) + sy}px`;
      if (x1 === x2) el.style.height = `${Math.abs(y2 - y1)}px`; else el.style.width = `${Math.abs(x2 - x1)}px`;
      this.layer.append(el);
    };
    const label = (x: number, y: number, value: number, equal: boolean) => {
      const el = this.doc.createElement('div');
      el.className = 'guide-label' + (equal ? ' equal' : '');
      el.textContent = (equal ? '= ' : '') + Math.round(value);
      el.style.left = `${x + sx}px`; el.style.top = `${y + sy}px`;
      this.layer.append(el);
    };
    const r = box(rect);
    // Alignment lines: from the selection to whatever it lines up with.
    const centered = Math.abs(cx(r) - cx(page)) <= EQUAL;
    if (centered) line(cx(page), Math.min(r.top - 40, page.top), cx(page), Math.max(r.bottom + 40, Math.min(page.bottom, r.bottom + 400)), 'center');
    for (const x of aligned.xs ?? []) {
      if (centered && Math.abs(x - cx(page)) <= EQUAL) continue;
      const hits = others.filter((o) => [o.left, cx(o), o.right].some((v) => Math.abs(v - x) <= EQUAL));
      const top = Math.min(r.top, ...hits.map((o) => o.top)), bottom = Math.max(r.bottom, ...hits.map((o) => o.bottom));
      line(x, top, x, bottom);
    }
    for (const y of aligned.ys ?? []) {
      const hits = others.filter((o) => [o.top, cy(o), o.bottom].some((v) => Math.abs(v - y) <= EQUAL));
      const left = Math.min(r.left, ...hits.map((o) => o.left)), right = Math.max(r.right, ...hits.map((o) => o.right));
      line(left, y, right, y);
    }
    // Distances: to the nearest item above and below (that shares some width), and to the page edges.
    const overlapsX = (o: Box) => o.right > r.left + 2 && o.left < r.right - 2;
    const above = others.filter((o) => overlapsX(o) && o.bottom <= r.top + 1).sort((a, b) => b.bottom - a.bottom)[0];
    const below = others.filter((o) => overlapsX(o) && o.top >= r.bottom - 1).sort((a, b) => a.top - b.top)[0];
    const up = above ? r.top - above.bottom : null, down = below ? below.top - r.bottom : null;
    const sameY = up !== null && down !== null && Math.abs(up - down) <= EQUAL;
    if (above && up! > 0) {
      const x = (Math.max(r.left, above.left) + Math.min(r.right, above.right)) / 2;
      line(x, above.bottom, x, r.top, 'measure'); label(x, (above.bottom + r.top) / 2, up!, sameY);
    }
    if (below && down! > 0) {
      const x = (Math.max(r.left, below.left) + Math.min(r.right, below.right)) / 2;
      line(x, r.bottom, x, below.top, 'measure'); label(x, (r.bottom + below.top) / 2, down!, sameY);
    }
    const left = r.left - page.left, right = page.right - r.right, sameX = Math.abs(left - right) <= EQUAL;
    if (left > 0) { line(page.left, cy(r), r.left, cy(r), 'measure'); label(page.left + left / 2, cy(r), left, sameX); }
    if (right > 0) { line(r.right, cy(r), page.right, cy(r), 'measure'); label(r.right + right / 2, cy(r), right, sameX); }
  }
}

export const guideCss = `
.canvas-guides { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 99; pointer-events: none; }
.guide-line { position: absolute; pointer-events: none; }
.guide-line.v { width: 0; border-left: 1px solid #b44dff; }
.guide-line.h { height: 0; border-top: 1px solid #b44dff; }
.guide-line.center { border-left: 1px dashed #b44dff; }
.guide-line.measure.v { border-left: 1px dashed #b44dffcc; }
.guide-line.measure.h { border-top: 1px dashed #b44dffcc; }
.guide-label { position: absolute; transform: translate(-50%, -50%); padding: 1px 5px; border-radius: 5px; background: #b44dff; color: #fff; font: 600 10px/1.5 system-ui, sans-serif; white-space: nowrap; box-shadow: 0 1px 3px #0003; }
.guide-label.equal { background: #7c3aed; box-shadow: 0 0 0 2px #fff, 0 1px 4px #0004; }
`;
