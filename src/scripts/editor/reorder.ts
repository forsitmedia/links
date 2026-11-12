/** Drag gestures shared by the content list and the visual canvas. */

let lockScroll = false;
const guarded = new WeakSet<Document>();

/** A touch drag must cancel touchmove to stop the page scrolling, and that listener has to exist before the touch starts. */
export function guardTouchScroll(doc: Document) {
  if (guarded.has(doc)) return;
  guarded.add(doc);
  doc.addEventListener('touchmove', (e) => { if (lockScroll && e.cancelable) e.preventDefault(); }, { passive: false });
  doc.addEventListener('dragstart', (e) => { if ((e.target as Element).closest?.('[data-i], [data-block-id]')) e.preventDefault(); }); // no native link/image dragging
}

/** Turns a press into a drag: after moving 6px with a mouse, or after holding still for 350ms on a touch
 * screen (moving sooner scrolls as usual). A press that never becomes a drag stays a normal click. */
export function pressToDrag(e: PointerEvent, begin: () => void) {
  const doc = (e.target as Node).ownerDocument!, win = doc.defaultView!;
  const touch = e.pointerType !== 'mouse';
  let timer = 0;
  const stop = () => {
    win.clearTimeout(timer);
    doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', stop, true);
    doc.removeEventListener('pointercancel', stop, true);
  };
  const start = () => {
    stop();
    lockScroll = true;
    const release = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      lockScroll = false;
      doc.removeEventListener('pointerup', release, true);
      doc.removeEventListener('pointercancel', release, true);
    };
    doc.addEventListener('pointerup', release, true);
    doc.addEventListener('pointercancel', release, true);
    begin();
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const distance = Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY);
    if (touch) { if (distance > 8) stop(); } else if (distance >= 6) start();
  };
  if (touch) timer = win.setTimeout(() => { navigator.vibrate?.(10); start(); }, 350);
  doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', stop, true);
  doc.addEventListener('pointercancel', stop, true);
}

/** Pointer sorting with unequal row heights, touch support and edge scrolling.
 * Rows drag from anywhere (see pressToDrag); the grip starts a drag immediately. */
export function sortable(list: HTMLElement, onMove: (from: number, to: number) => void) {
  guardTouchScroll(list.ownerDocument);
  list.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>('.row[data-i]');
    if (!row || row.parentElement !== list || target.closest('.move-buttons')) return;
    const grip = target.closest<HTMLElement>('.grip');
    if (grip) { e.preventDefault(); grip.focus({ preventScroll: true }); drag(e, row); }
    else pressToDrag(e, () => drag(e, row));
  });

  function drag(e: PointerEvent, row: HTMLElement) {
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > .row[data-i]')];
    const from = rows.indexOf(row);
    if (from < 0) return;
    const rects = rows.map((r) => r.getBoundingClientRect());
    const height = rects[from].height;
    const startY = e.clientY;
    const startScroll = window.scrollY;
    let pointerY = startY;
    let to = from;
    let animation = 0;
    let lastTime = 0;
    let active = true;
    row.setPointerCapture(e.pointerId);
    row.classList.add('dragging');

    const update = () => {
      const dy = pointerY - startY + window.scrollY - startScroll;
      row.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + height / 2 + dy;
      to = Math.max(0, rows.filter((_, i) => center > rects[i].top + rects[i].height / 2).length - (dy > 0 ? 1 : 0));
      to = Math.min(rows.length - 1, to);
      rows.forEach((r, i) => {
        if (r === row) return;
        const shift = from < to && i > from && i <= to ? -height : from > to && i < from && i >= to ? height : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const tick = (time: number) => {
      if (!active) return;
      const factor = Math.min(2, (time - (lastTime || time)) / 16.7);
      lastTime = time;
      const delta = pointerY < 90 ? -Math.min(16, (90 - pointerY) / 4) :
        pointerY > innerHeight - 90 ? Math.min(16, (pointerY - innerHeight + 90) / 4) : 0;
      if (delta) { window.scrollBy(0, delta * factor); update(); }
      animation = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => { pointerY = ev.clientY; update(); };
    // The release must not also open the row's editor.
    const swallowClick = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
    const finish = (commit: boolean) => {
      if (!active) return;
      active = false;
      cancelAnimationFrame(animation);
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', end);
      row.removeEventListener('pointercancel', cancel);
      row.removeEventListener('lostpointercapture', cancel);
      rows.forEach((r) => (r.style.transform = ''));
      row.classList.remove('dragging');
      if (row.hasPointerCapture(e.pointerId)) row.releasePointerCapture(e.pointerId);
      window.addEventListener('click', swallowClick, true);
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
      if (commit && to !== from) onMove(from, to);
    };
    const end = () => finish(true);
    const cancel = () => finish(false);
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', cancel);
    row.addEventListener('lostpointercapture', cancel);
    update();
    animation = requestAnimationFrame(tick);
  }
}
