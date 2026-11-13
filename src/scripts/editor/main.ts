/** Editor shell, visual layout canvas and publishing. */
import { renderPage } from '../../lib/render';
import { state, onChange, isDirty, changed, undo, redo, canUndo, canRedo, setAnchor, openMenus } from './state';
import { pageTab } from './page-tab';
import { editPageBlock, editSocialIcon, addItemMenu, musicSheet } from './block-editor';
import { settingsTab } from './settings-tab';
import { insightsTab } from './insights-tab';
import { openPublish, pageUrl } from './publish';
import { welcome } from './welcome';
import { VisualCanvas } from './canvas';
import { h, segmented, svg } from './ui';
import { ALL_FONTS_LINK } from '../../lib/look';

// The font pickers show each font in its own letters.
document.head.insertAdjacentHTML('beforeend', ALL_FONTS_LINK());

type Tab = 'page' | 'insights' | 'settings';
const TITLES: Record<Tab, string> = { page: 'Your Page', insights: 'Insights', settings: 'Settings' };
let tab: Tab = 'page';
const saveBtn = h('button', { class: 'btn-text bold', type: 'button', onclick: openPublish }, 'Publish') as HTMLButtonElement;
const viewPage = h('a', { class: 'btn-text', href: pageUrl(), target: '_blank', rel: 'noopener' }, 'View Page');
const canvasSave = h('button', { class: 'btn-text bold', type: 'button', 'aria-label': 'Publish page design', onclick: openPublish }, 'Publish') as HTMLButtonElement;
const title = h('h1', { class: 'large-title' }), content = h('div', { class: 'content' });
const newFrame = () => h('iframe', { title: 'Page preview', allow: 'autoplay; fullscreen; picture-in-picture' }) as HTMLIFrameElement;
let frame = newFrame();
const inspector = h('div', { class: 'canvas-inspector' });
const canvas = new VisualCanvas({
  config: () => state.cfg, inspector,
  edit: async (id) => { tab = 'page'; await draw(); editPageBlock(id); },
  editSocial: editSocialIcon,
  add: async () => { tab = 'page'; await draw(); addItemMenu(); },
  commit: (redraw = false) => changed(redraw),
  save: openPublish,
  undo, redo, canUndo, canRedo,
});
setAnchor(() => canvas.anchor());
const mode = segmented([{ value: 'edit', label: 'Edit layout' }, { value: 'view', label: 'Preview' }], 'edit', (value) => setMode(value === 'edit'));
mode.classList.add('canvas-mode');
function setMode(edit: boolean) {
  stage.classList.toggle('is-preview', !edit);
  canvas.setMode(edit);
  [...mode.querySelectorAll('button')].forEach((b, i) => b.classList.toggle('on', edit ? i === 0 : i === 1));
}
function openCanvas() { setMode(true); stage.classList.add('open'); document.body.classList.add('canvas-open'); }
function closeCanvas() { stage.classList.remove('open'); document.body.classList.remove('canvas-open'); }
// Undo / Redo and the guides switch, always in view above the page.
const undoBtn = h('button', { type: 'button', class: 'history-btn', title: 'Undo (Cmd/Ctrl+Z)', onclick: () => canvas.undo() }, '↶', h('span', {}, 'Undo')) as HTMLButtonElement;
const redoBtn = h('button', { type: 'button', class: 'history-btn', title: 'Redo (Cmd/Ctrl+Shift+Z)', onclick: () => canvas.redo() }, '↷', h('span', {}, 'Redo')) as HTMLButtonElement;
const guidesBtn = h('button', { type: 'button', class: 'history-btn guides-btn', title: 'Purple guides and snapping while you move or resize items',
  onclick: () => { canvas.setGuides(!canvas.guidesOn); refreshHistory(); } }, '⌗', h('span', {}, 'Guides')) as HTMLButtonElement;
const historyBar = h('div', { class: 'history-bar' }, undoBtn, redoBtn, guidesBtn);
function refreshHistory() {
  undoBtn.disabled = !canUndo(); redoBtn.disabled = !canRedo();
  guidesBtn.setAttribute('aria-pressed', String(canvas.guidesOn)); guidesBtn.classList.toggle('on', canvas.guidesOn);
}
onChange(() => setTimeout(refreshHistory));
setInterval(refreshHistory, 800); // typing is grouped into one step after a pause, so check now and then too
document.addEventListener('keydown', (e) => {
  // Only real text fields keep their own undo; sliders, buttons and checkboxes don't, so Cmd/Ctrl+Z still undoes the design.
  const typing = (e.target as HTMLElement)?.closest?.('textarea, [contenteditable], input:not([type="range"], [type="checkbox"], [type="radio"], [type="color"], [type="button"])');
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && !document.querySelector('.sheet')) { e.preventDefault(); canvas.deleteSelection(); refreshHistory(); return; }
  const key = e.key.toLowerCase();
  // Copy and paste items (text being typed or selected keeps the normal copy and paste).
  if (!typing && (e.metaKey || e.ctrlKey) && !document.querySelector('.sheet') && !getSelection()?.toString()) {
    if (key === 'c' && canvas.copySelection()) { e.preventDefault(); return; }
    if (key === 'v' && canvas.paste()) { e.preventDefault(); refreshHistory(); return; }
    if (key === 'g') { e.preventDefault(); canvas.group(!e.shiftKey); refreshHistory(); return; }
    if (['[', ']', '{', '}'].includes(e.key)) { const up = e.key === ']' || e.key === '}'; if (canvas.layer(e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward')) { e.preventDefault(); refreshHistory(); } return; }
  }
  if (typing || !(e.metaKey || e.ctrlKey) || (key !== 'z' && key !== 'y')) return;
  e.preventDefault(); key === 'y' || e.shiftKey ? canvas.redo() : canvas.undo(); refreshHistory();
});
addEventListener('yourlinki-clean-layout', (e) => canvas.cleanLayout((e as CustomEvent).detail));
addEventListener('yourlinki-open-music', () => musicSheet());
const surface = h('div', { class: 'preview-surface' }, frame);
const deviceArea = h('div', { class: 'device-area' }, surface);
const stage = h('div', { class: 'stage' },
  h('div', { class: 'stage-head' }, historyBar, mode, canvasSave,
    h('button', { class: 'stage-close btn-text', type: 'button', 'aria-label': 'Close design editor', onclick: closeCanvas }, 'Done')),
  h('div', { class: 'canvas-workspace' }, deviceArea, inspector));

// Fit the device visually; its page viewport stays 390 × 844 on desktop.
const fitDevice = () => {
  const scale = Math.min(1, deviceArea.clientWidth / 414, deviceArea.clientHeight / 868);
  surface.style.setProperty('--device-scale', String(Math.max(.1, scale)));
};
new ResizeObserver(fitDevice).observe(deviceArea);

document.getElementById('app')!.append(h('div', { class: 'app' },
  h('div', { class: 'editor' },
    h('div', { class: 'navbar' }, viewPage, saveBtn),
    title,
    segmented<Tab>([{ value: 'page', label: 'Page' }, { value: 'insights', label: 'Insights' }, { value: 'settings', label: 'Settings' }], tab, (v) => { tab = v; draw(); }),
    content),
  stage,
  h('button', { class: 'preview-fab', type: 'button', onclick: openCanvas }, svg('eye', 18), 'Design your page')));

let drawing = 0;
async function draw() {
  const run = ++drawing;
  title.textContent = TITLES[tab];
  const y = scrollY;
  if (tab === 'insights' && content.dataset.tab !== 'insights') content.replaceChildren(h('p', { class: 'loading' }, 'Loading…'));
  const view = tab === 'page' ? pageTab() : tab === 'insights' ? await insightsTab(draw) : settingsTab();
  if (run !== drawing) return; // a newer draw started while stats were loading
  if (content.dataset.tab !== tab) view.classList.add('tab-enter'); // only a tab switch animates, not a redraw
  content.replaceChildren(view);
  content.dataset.tab = tab;
  scrollTo(0, y);
}
let previewTimer: ReturnType<typeof setTimeout>;
/* The next version loads in a second frame behind the current one and replaces it once it is ready,
   so the preview never flashes blank or jumps while editing. */
let incoming: HTMLIFrameElement | null = null;
function updatePreview() {
  if (canvas.busy) return;
  incoming?.remove();
  const next = incoming = newFrame();
  next.className = 'incoming';
  next.onload = () => {
    if (incoming !== next) return;
    next.contentWindow?.scrollTo(0, frame.contentWindow?.scrollY ?? 0);
    if (next.contentDocument) canvas.mount(next.contentDocument);
    frame.remove();
    next.className = '';
    frame = next; incoming = null;
    next.contentWindow?.dispatchEvent(new Event('yourlinki-preview-ready'));
  };
  next.srcdoc = renderPage(state.cfg, { preview: true, openMenus: [...openMenus] });
  surface.append(next);
}
/** Publish stays available (a download may never have been uploaded); a dot shows unpublished changes. */
function markChanges() {
  viewPage.setAttribute('href', pageUrl());
  [saveBtn, canvasSave].forEach((b) => b.classList.toggle('has-changes', isDirty()));
}
onChange((rerender) => {
  markChanges();
  clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 120);
  if (rerender) draw();
});
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key === 's') { e.preventDefault(); openPublish(); } // undo and redo are handled once, above
});
markChanges();
draw(); updatePreview();
if (!state.cfg.onboarded) welcome();
