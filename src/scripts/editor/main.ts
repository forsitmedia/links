/** Editor shell, visual layout canvas and publishing. */
import { renderPage } from '../../lib/render';
import { state, onChange, isDirty, changed, undo, redo, canUndo, canRedo } from './state';
import { pageTab } from './page-tab';
import { editPageBlock, editSocialIcon, addItemMenu } from './block-editor';
import { settingsTab } from './settings-tab';
import { openPublish } from './publish';
import { welcome } from './welcome';
import { VisualCanvas } from './canvas';
import { h, segmented, svg } from './ui';

type Tab = 'page' | 'settings';
const TITLES: Record<Tab, string> = { page: 'Your Page', settings: 'Settings' };
let tab: Tab = 'page';
const saveBtn = h('button', { class: 'btn-text bold', type: 'button', onclick: openPublish }, 'Publish') as HTMLButtonElement;
const canvasSave = h('button', { class: 'btn-text bold', type: 'button', 'aria-label': 'Publish page design', onclick: openPublish }, 'Publish') as HTMLButtonElement;
const title = h('h1', { class: 'large-title' }), content = h('div', { class: 'content' });
const frame = h('iframe', { title: 'Page preview', allow: 'autoplay; fullscreen; picture-in-picture' }) as HTMLIFrameElement;
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
const mode = segmented([{ value: 'edit', label: 'Edit layout' }, { value: 'view', label: 'Preview' }], 'edit', (value) => setMode(value === 'edit'));
mode.classList.add('canvas-mode');
function setMode(edit: boolean) {
  stage.classList.toggle('is-preview', !edit);
  canvas.setMode(edit);
  [...mode.querySelectorAll('button')].forEach((b, i) => b.classList.toggle('on', edit ? i === 0 : i === 1));
}
function openCanvas() { setMode(true); stage.classList.add('open'); document.body.classList.add('canvas-open'); }
function closeCanvas() { stage.classList.remove('open'); document.body.classList.remove('canvas-open'); }
const surface = h('div', { class: 'preview-surface' }, frame);
const deviceArea = h('div', { class: 'device-area' }, surface);
const stage = h('div', { class: 'stage' },
  h('div', { class: 'stage-head' }, h('span', { class: 'canvas-heading' }, 'Live canvas'), mode, canvasSave,
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
    h('div', { class: 'navbar' }, h('a', { class: 'btn-text', href: '../', target: '_blank' }, 'View Page'), saveBtn),
    title,
    segmented([{ value: 'page', label: 'Page' }, { value: 'settings', label: 'Settings' }], tab, (v) => { tab = v; draw(); }),
    content),
  stage,
  h('button', { class: 'preview-fab', type: 'button', onclick: openCanvas }, svg('eye', 18), 'Design your page')));

async function draw() {
  title.textContent = TITLES[tab];
  const y = scrollY;
  content.replaceChildren(tab === 'page' ? pageTab() : settingsTab());
  scrollTo(0, y);
}
let previewTimer: ReturnType<typeof setTimeout>;
function updatePreview() {
  if (canvas.busy) return;
  const y = frame.contentWindow?.scrollY ?? 0;
  frame.onload = () => { frame.contentWindow?.scrollTo(0, y); if (frame.contentDocument) canvas.mount(frame.contentDocument); };
  frame.srcdoc = renderPage(state.cfg, { preview: true });
}
/** Publish stays available (a download may never have been uploaded); a dot shows unpublished changes. */
function markChanges() { [saveBtn, canvasSave].forEach((b) => b.classList.toggle('has-changes', isDirty())); }
onChange((rerender) => {
  markChanges();
  clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 120);
  if (rerender) draw();
});
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key === 's') { e.preventDefault(); openPublish(); return; }
  // Text fields keep their own undo; open sheets edit objects an undo would replace.
  const typing = (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]');
  if (typing || document.querySelector('.sheet-back')) return;
  const key = e.key.toLowerCase();
  if (key === 'z' || key === 'y') { e.preventDefault(); key === 'y' || e.shiftKey ? redo() : undo(); }
});
markChanges();
draw(); updatePreview();
if (!state.cfg.onboarded) welcome();
