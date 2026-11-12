import { normalizeImageFrame, imageFrameStyle, panImageFrame, type ImageFrame } from '../../lib/image-frame';
import { safeImg } from '../../lib/types';
import { h, group, segmented, sheet, toast } from './ui';

type Options = {
  src: string;
  frame?: ImageFrame;
  title?: string;
  aspect?: number;
  round?: boolean;
  onChange: (frame: ImageFrame | undefined) => void;
  onFinish?: () => void;
};

/** Reversible framing controls shared by profile photos, logos, covers and content images. */
export function adjustImage(o: Options) {
  if (!safeImg(o.src)) { toast('Choose an image first.'); return; }
  const original = o.frame ? { ...o.frame } : undefined;
  let frame = normalizeImageFrame(o.frame);
  let applied = false;
  let closed = false;
  let drag: { id: number; x: number; y: number; frame: ImageFrame } | null = null;
  const status = h('p', { class: 'image-editor-hint', role: 'status' }, 'Drag the image to position it, or use the sliders below.');
  const picture = h('img', { src: o.src, alt: 'Image framing preview', draggable: 'false', onload: () => {
    if (!o.aspect) stage.style.aspectRatio = String(Math.max(.5, Math.min(2, picture.naturalWidth / picture.naturalHeight)));
    update(false);
  }, onerror: () => { status.textContent = 'This image could not be loaded. Cancel and choose another image.'; } }) as HTMLImageElement;
  const stage = h('div', { class: 'image-crop' + (o.round ? ' is-round' : ''), style: `aspect-ratio:${o.aspect ?? 1}`, tabindex: '0', role: 'group', 'aria-label': 'Image position. Drag or use arrow keys.' }, picture);

  function range(label: string, key: 'zoom' | 'x' | 'y', min: number, max: number, step: number) {
    const output = h('output');
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label, oninput: (e: Event) => {
      frame[key] = Number((e.target as HTMLInputElement).value);
      update();
    } }) as HTMLInputElement;
    return { input, output, row: h('label', { class: 'row image-range' }, h('span', { class: 'image-range-label' }, label, output), input) };
  }
  const zoom = range('Zoom', 'zoom', frame.fit === 'cover' ? 1 : .5, 4, .01);
  const horizontal = range('Horizontal position', 'x', 0, 100, 1);
  const vertical = range('Vertical position', 'y', 0, 100, 1);

  function update(emit = true) {
    if (closed) return;
    frame = normalizeImageFrame(frame);
    picture.style.cssText = imageFrameStyle(frame);
    zoom.input.min = frame.fit === 'cover' ? '1' : '.5';
    zoom.input.value = String(frame.zoom);
    horizontal.input.value = String(frame.x);
    vertical.input.value = String(frame.y);
    zoom.output.textContent = `${Math.round(frame.zoom * 100)}%`;
    horizontal.output.textContent = `${Math.round(frame.x)}%`;
    vertical.output.textContent = `${Math.round(frame.y)}%`;
    zoom.input.setAttribute('aria-valuetext', `${Math.round(frame.zoom * 100)} percent`);
    if (emit) o.onChange({ ...frame });
  }

  stage.addEventListener('pointerdown', (event) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0) || !picture.naturalWidth) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, frame: { ...frame } };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    frame = panImageFrame(drag.frame, event.clientX - drag.x, event.clientY - drag.y, stage.clientWidth, stage.clientHeight, picture.naturalWidth, picture.naturalHeight);
    update();
  });
  function endDrag(event: PointerEvent, cancel = false) {
    if (!drag || drag.id !== event.pointerId) return;
    if (cancel) { frame = drag.frame; update(); }
    drag = null;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }
  stage.addEventListener('pointerup', (event) => endDrag(event));
  stage.addEventListener('pointercancel', (event) => endDrag(event, true));
  stage.addEventListener('lostpointercapture', (event) => endDrag(event));
  stage.addEventListener('keydown', (event) => {
    const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!keys[event.key]) return;
    event.preventDefault();
    const [x, y] = keys[event.key];
    const step = event.shiftKey ? 20 : 5;
    frame = panImageFrame(frame, x * step, y * step, stage.clientWidth, stage.clientHeight, picture.naturalWidth, picture.naturalHeight);
    update();
  });

  const fit = () => segmented([{ value: 'cover', label: 'Fill frame' }, { value: 'contain', label: 'Whole image' }], frame.fit, (value) => {
    frame.fit = value;
    frame.zoom = 1;
    update();
  });
  const fitRow = h('div', { class: 'row stacked' }, h('span', { class: 'lbl' }, 'Fit'), fit());
  const reset = () => {
    frame = normalizeImageFrame();
    fitRow.replaceChildren(h('span', { class: 'lbl' }, 'Fit'), fit());
    update();
  };
  update(false);
  sheet(o.title ?? 'Adjust Image', () => [
    h('div', { class: 'image-editor-stage' }, stage),
    status,
    group({ footer: 'Choose Whole image to keep every part of a logo visible. You can readjust this later.' }, fitRow, zoom.row, horizontal.row, vertical.row),
    h('button', { class: 'image-reset btn-text', type: 'button', onclick: reset }, 'Reset Adjustments'),
  ], {
    done: 'Apply', cancel: 'Cancel', onDone: () => { applied = true; o.onChange({ ...frame }); },
    onClose: () => {
      closed = true;
      if (!applied) o.onChange(original);
      o.onFinish?.();
    },
  });
}
