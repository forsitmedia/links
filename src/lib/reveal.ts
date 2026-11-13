export const REVEAL_EFFECTS = ['none', 'fade', 'rise', 'left', 'right', 'zoom', 'blur'] as const;
export type RevealEffect = typeof REVEAL_EFFECTS[number];
export const REVEAL_LABELS: Record<RevealEffect, string> = {
  none: 'Off', fade: 'Fade in', rise: 'Rise up', left: 'Slide from left', right: 'Slide from right', zoom: 'Zoom in', blur: 'Blur in',
};

/** Animates individual CSS properties so an item's position and rotation stay intact. */
export function revealScript(effect: RevealEffect = 'none', duration = 750, repeat = false, preview = false) {
  return `<script>
(() => {
  if (!window.IntersectionObserver || !Element.prototype.animate) return;
  const defaults = ${JSON.stringify({ effect, duration, repeat })}, root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), items = [...document.querySelectorAll('.stack [data-block-id]:not(.space)')];
  const frames = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    rise: [{ opacity: 0, translate: '0 20px' }, { opacity: 1, translate: '0 0' }],
    left: [{ opacity: 0, translate: '-20px 0' }, { opacity: 1, translate: '0 0' }],
    right: [{ opacity: 0, translate: '20px 0' }, { opacity: 1, translate: '0 0' }],
    zoom: [{ opacity: 0, scale: '.92' }, { opacity: 1, scale: '1' }],
    blur: [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0)' }],
  };
  let observer, warmObserver, editing, revision = 0, ready = ${!preview}, animations = new Map(), prepared = new Map();
  function layer(el, on) {
    const item = prepared.get(el); if (!item) return;
    const value = on ? item.hint : item.willChange;
    if (value) el.style.willChange = value; else el.style.removeProperty('will-change');
  }
  // Anchored items must be measured in their saved position, rather than halfway through an entrance.
  window.yourlinkiMeasure = (measure) => {
    const active = (document.getAnimations ? document.getAnimations() : [...animations.values()])
      .filter((a) => a.effect && a.effect.target && a.effect.target.closest('.stack') && a.playState !== 'finished' && a.playState !== 'idle');
    const saved = active.map((animation) => ({ animation, time: animation.currentTime, state: animation.playState, fill: animation.effect.getTiming().fill }));
    try {
      saved.forEach(({ animation }) => { animation.pause(); animation.effect.updateTiming({ fill: 'none' }); animation.currentTime = -1; });
      return measure();
    } finally {
      saved.forEach(({ animation, time, state, fill }) => {
        animation.currentTime = time;
        animation.effect.updateTiming({ fill });
        if (state === 'running') animation.play();
      });
    }
  };
  function reset() {
    const run = ++revision;
    if (observer) observer.disconnect();
    if (warmObserver) warmObserver.disconnect();
    animations.forEach((animation) => animation.cancel()); animations.clear();
    prepared.forEach((_, el) => layer(el, false)); prepared.clear();
    items.forEach((el) => el.classList.remove('reveal-pending', 'scroll-reveal'));
    editing = root.classList.contains('canvas-editing');
    if (!ready || editing || reduced.matches) return;
    try {
      // Read the base appearance once. Scrolling only starts prepared compositor animations.
      const candidates = items.filter((el) => frames[el.dataset.reveal || defaults.effect]);
      candidates.forEach((el) => el.classList.add('scroll-reveal'));
      candidates.forEach((el) => {
        const effect = el.dataset.reveal || defaults.effect, opacity = Number(getComputedStyle(el).opacity);
        prepared.set(el, {
          frames: frames[effect].map((frame) => ({ ...frame, opacity: frame.opacity * opacity })),
          delay: Number(el.dataset.revealDelay) || 0, past: el.getBoundingClientRect().bottom < 0,
          hint: 'opacity' + (effect === 'zoom' ? ', scale' : effect === 'blur' ? ', filter' : effect !== 'fade' ? ', translate' : ''),
          willChange: el.style.willChange,
        });
      });
      warmObserver = new IntersectionObserver((entries) => {
        if (run !== revision) return;
        entries.forEach(({ target: el, isIntersecting }) => {
          if (isIntersecting && el.classList.contains('reveal-pending')) layer(el, true);
          else if (!isIntersecting && !animations.has(el)) layer(el, false);
        });
      }, { rootMargin: '160px 0px' });
      observer = new IntersectionObserver((entries) => {
        if (run !== revision) return;
        entries.forEach((entry) => {
          const el = entry.target;
          if (!entry.isIntersecting) {
            if (defaults.repeat) {
              const old = animations.get(el); if (old) old.cancel(); animations.delete(el);
              layer(el, false); el.classList.add('reveal-pending');
            }
            return;
          }
          if (!el.classList.contains('reveal-pending')) return;
          const item = prepared.get(el); if (!item) return;
          layer(el, true);
          el.classList.remove('reveal-pending');
          const animation = el.animate(item.frames, {
            duration: defaults.duration, delay: item.delay,
            easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards',
          });
          animations.set(el, animation);
          animation.onfinish = () => { if (animations.get(el) === animation) { animations.delete(el); layer(el, false); } };
          if (!defaults.repeat) { observer.unobserve(el); warmObserver.unobserve(el); }
        });
      }, { threshold: 0, rootMargin: '0px 0px 64px 0px' });
      prepared.forEach((item, el) => {
        // Items already scrolled past stay visible, including browser-restored scroll positions.
        if (!defaults.repeat && item.past) return;
        el.classList.add('reveal-pending'); observer.observe(el); warmObserver.observe(el);
      });
    } catch { items.forEach((el) => { el.classList.remove('reveal-pending'); layer(el, false); }); }
  }
  reset();
  window.addEventListener('yourlinki-preview-ready', () => { if (!ready) { ready = true; reset(); } });
  reduced.addEventListener && reduced.addEventListener('change', reset);
  new MutationObserver(() => { if (editing !== root.classList.contains('canvas-editing')) reset(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
})();
</script>`;
}
