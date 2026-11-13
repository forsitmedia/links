import type { PageBlock } from '../../lib/types';
/** Editor state: the config being edited, change notifications, the browser draft and publishing. */
import { normalize, type Config } from '../../lib/types';
import { CONFIG_ID, renderPage } from '../../lib/render';
import { discoverPage, editorPageUrl, publishedPageUrl, rememberedPage, rememberPage, requestedPage } from './page-url';

const DRAFT_KEY = 'draft';

/** Read the actual public page, including when the publisher uses a different repository. */
async function loadPublished(page: string): Promise<Config | null> {
  try {
    const url = new URL('index.html', page);
    url.searchParams.set('yourlinki-read', String(Date.now()));
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const json = doc.getElementById(CONFIG_ID)?.textContent;
    return json ? normalize(JSON.parse(json)) : null;
  } catch { return null; }
}

/** Drafts live in IndexedDB: embedded images easily outgrow localStorage. */
function draftStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('yourlinki', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('drafts');
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const tx = open.result.transaction('drafts', mode);
        const req = run(tx.objectStore('drafts'));
        tx.oncomplete = () => { open.result.close(); resolve(req.result); };
        tx.onerror = tx.onabort = () => { open.result.close(); resolve(undefined); };
      };
    } catch { resolve(undefined); } // the editor still works without browser storage, it just can't keep a draft
  });
}

const initialPage = requestedPage() ?? rememberedPage()?.url ?? editorPageUrl();
const [initialPublished, draft] = await Promise.all([
  loadPublished(initialPage),
  draftStore<string>('readonly', (s) => s.get(DRAFT_KEY)).then((d) => { try { return d ? normalize(JSON.parse(d)) : null; } catch { return null; } }),
]);
let published = initialPublished;
const worker = draft?.stats ?? published?.stats ?? rememberedPage()?.worker;
if (worker) {
  if (published?.stats === worker) rememberPage(worker, initialPage);
  await discoverPage(worker);
  const page = publishedPageUrl(worker);
  if (page !== initialPage) published = await loadPublished(page);
}

// A draft started before the worker was connected still publishes and signs in through it.
if (draft && !draft.stats && published?.stats) draft.stats = published.stats;
// An older draft keeps its edits while picking up the page's newly added scroll settings.
if (draft && draft.look.reveal === undefined && published?.look.reveal !== undefined) {
  draft.look.reveal = published.look.reveal;
  draft.look.revealDuration = published.look.revealDuration;
  draft.look.revealRepeat = published.look.revealRepeat;
}

export const state = {
  cfg: draft ?? published ?? normalize({}),
  /** The config as last published (or downloaded for publishing). */
  saved: JSON.stringify(published ?? normalize({})),
  hasPublished: !!published,
};

let draftTimer: ReturnType<typeof setTimeout> | undefined;
function persistDraft() {
  clearTimeout(draftTimer);
  draftTimer = undefined;
  const snapshot = JSON.stringify(state.cfg);
  draftStore('readwrite', (s) => (snapshot === state.saved ? s.delete(DRAFT_KEY) : s.put(snapshot, DRAFT_KEY)));
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && draftTimer) persistDraft(); });

type Listener = (rerender: boolean) => void;
const listeners = new Set<Listener>();
export const onChange = (fn: Listener) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/** Call after every edit. Pass `true` when the editor itself must redraw (rows added, removed or moved). */
export const changed = (rerender = false) => {
  clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 400);
  clearTimeout(historyTimer); historyTimer = setTimeout(checkpoint, 500);
  listeners.forEach((fn) => fn(rerender));
};

/* Undo history for every kind of edit. A burst of changes (typing, a drag) becomes one step.
   Snapshots copy objects but share strings, so embedded images are not duplicated in memory. */
const copy = <T>(v: T): T => Array.isArray(v) ? v.map(copy) as T
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)])) as T : v;
const past: Config[] = [], future: Config[] = [];
let committed = copy(state.cfg), committedJson = JSON.stringify(state.cfg);
let historyTimer: ReturnType<typeof setTimeout> | undefined;
function checkpoint() {
  clearTimeout(historyTimer); historyTimer = undefined;
  const json = JSON.stringify(state.cfg);
  if (json === committedJson) return;
  past.push(committed); if (past.length > 50) past.shift();
  future.length = 0;
  committed = copy(state.cfg); committedJson = json;
}
function restore(from: Config[], to: Config[]) {
  checkpoint();
  const value = from.pop();
  if (!value) return;
  to.push(committed);
  Object.assign(state.cfg, copy(value)); // keep the same object: other modules hold a reference to state.cfg
  committed = value; committedJson = JSON.stringify(value);
  clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 400);
  listeners.forEach((fn) => fn(true));
}
export const undo = () => restore(past, future);
export const redo = () => restore(future, past);
export const canUndo = () => past.length > 0 || (!!historyTimer && JSON.stringify(state.cfg) !== committedJson);
export const canRedo = () => future.length > 0;

/** True when there are changes that are not on the published page yet (always, before the first publish). */
export const isDirty = () => !state.hasPublished || JSON.stringify(state.cfg) !== state.saved;

/** The complete public page, ready to upload as `index.html`. */
export const pageFile = (config = state.cfg) => renderPage(config);

/** Save the version actually uploaded; edits made while publishing remain a draft. */
export function markPublished(snapshot = JSON.stringify(state.cfg)) {
  state.saved = snapshot;
  state.hasPublished = true;
  persistDraft();
  changed();
}

/** Throws away the browser draft and goes back to the published page. */
export async function discardDraft() {
  const page = await loadPublished(publishedPageUrl(state.cfg.stats));
  state.cfg = page ?? normalize({});
  state.saved = JSON.stringify(state.cfg);
  state.hasPublished = !!page;
  persistDraft();
  changed(true);
}

export const uid = () => Math.random().toString(36).slice(2, 8);

/** Where new items go: right after the selected item, or after the one in view in the layout editor (set by the canvas). */
let anchor: () => string | null | undefined = () => null;
export const setAnchor = (fn: typeof anchor) => { anchor = fn; };
/** Where the Add menu puts new items: at the top (under the photo and name), after the selected item, or at the bottom. Remembered on this device. */
export type AddAt = 'top' | 'here' | 'bottom';
export const addAt = {
  get(): AddAt { try { const v = localStorage.getItem('yourlinki-add-at'); return v === 'here' || v === 'bottom' ? v : 'top'; } catch { return 'top'; } },
  set(v: AddAt) { try { localStorage.setItem('yourlinki-add-at', v); } catch {} },
};
export function placeBlock(block: PageBlock) {
  const blocks = state.cfg.blocks, where = addAt.get();
  let at = -1;
  if (where === 'here') at = blocks.findIndex((b) => b.id === anchor()) + 1;
  if (where === 'top') { const head = Math.max(blocks.findIndex((b) => b.type === 'profile'), blocks.findIndex((b) => b.type === 'name')); at = head + 1; }
  if (at <= 0 && where !== 'top') blocks.push(block); else blocks.splice(Math.max(0, at), 0, block);
}

/** Link Menus the preview shows open while their sheet is open, so the creator sees the links they add. */
export const openMenus = new Set<string>();
