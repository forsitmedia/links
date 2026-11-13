import { REVEAL_EFFECTS, REVEAL_LABELS, type RevealEffect } from '../../lib/reveal';
import type { PageBlock } from '../../lib/types';
import { changed, state } from './state';
import { group, h, switchRow } from './ui';

function choice(label: string, value: string, options: { value: string; label: string }[], set: (value: string) => void) {
  return h('label', { class: 'row stacked' }, h('span', { class: 'lbl' }, label),
    h('select', { class: 'effect-select', 'aria-label': label, onchange: (e: Event) => { set((e.target as HTMLSelectElement).value); changed(); } },
      options.map((o) => h('option', { value: o.value, selected: value === o.value }, o.label))));
}
const effects = REVEAL_EFFECTS.map((value) => ({ value, label: REVEAL_LABELS[value] }));

export function pageAnimationGroup() {
  const look = state.cfg.look;
  return group({ header: 'Scroll animations', footer: 'Items appear as visitors scroll. Each text item can use its own effect. Try them in Preview. Reduced motion settings are respected.' },
    choice('Page animation', look.reveal ?? 'none', effects, (v) => { look.reveal = v as RevealEffect; }),
    choice('Animation speed', String(look.revealDuration ?? 750), [
      { value: '450', label: 'Quick' }, { value: '750', label: 'Natural' }, { value: '1100', label: 'Slow' },
    ], (v) => { look.revealDuration = Number(v); }),
    switchRow('Replay when scrolling back', !!look.revealRepeat, (v) => { look.revealRepeat = v; changed(); }));
}

export function itemAnimationGroup(block: PageBlock) {
  return group({ header: 'Scroll animation', footer: 'Page default follows the Scroll animations setting. Off keeps this item still.' },
    choice('Animation', block.reveal ?? '', [{ value: '', label: 'Page default' }, ...effects], (v) => {
      if (v) block.reveal = v as RevealEffect; else delete block.reveal;
    }),
    choice('Animation delay', String(block.revealDelay ?? 0), [0, 100, 200, 300, 500].map((ms) => ({ value: String(ms), label: ms ? `${ms / 1000} seconds` : 'None' })),
      (v) => { block.revealDelay = Number(v); }));
}
