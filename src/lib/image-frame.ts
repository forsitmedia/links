export type ImageFrame = { x: number; y: number; zoom: number; fit: 'cover' | 'contain' };

const clamp = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

export function normalizeImageFrame(value: any = {}): ImageFrame {
  const fit = value?.fit === 'contain' ? 'contain' : 'cover';
  return { x: clamp(value?.x, 50, 0, 100), y: clamp(value?.y, 50, 0, 100),
    zoom: clamp(value?.zoom, 1, fit === 'cover' ? 1 : .5, 4), fit };
}

/** The editor and the page use the same non-destructive framing. */
export function imageFrameStyle(value?: ImageFrame): string {
  const f = normalizeImageFrame(value);
  return `object-fit:${f.fit};object-position:${f.x}% ${f.y}%;transform:scale(${f.zoom});transform-origin:${f.x}% ${f.y}%`;
}

/** Convert a drag in screen pixels to a position in the fitted image. */
export function panImageFrame(frame: ImageFrame, dx: number, dy: number, width: number, height: number, naturalWidth: number, naturalHeight: number): ImageFrame {
  if (!width || !height || !naturalWidth || !naturalHeight) return normalizeImageFrame(frame);
  const scale = frame.fit === 'cover' ? Math.max(width / naturalWidth, height / naturalHeight) : Math.min(width / naturalWidth, height / naturalHeight);
  const spaceX = width - naturalWidth * scale * frame.zoom;
  const spaceY = height - naturalHeight * scale * frame.zoom;
  return normalizeImageFrame({ ...frame,
    x: frame.x + (Math.abs(spaceX) < 1 ? 0 : dx / spaceX * 100),
    y: frame.y + (Math.abs(spaceY) < 1 ? 0 : dy / spaceY * 100) });
}
