/** Editor state: the config being edited, change notifications, the browser draft and publishing. */
import { normalize, type Config } from '../../lib/types';
import { CONFIG_ID, renderPage } from '../../lib/render';

const DRAFT_KEY = 'draft';

/** The page published next to the editor (`../index.html`), or null before the first publish. */
async function loadPublished(): Promise<Config | null> {
  try {
    const res = await fetch('../index.html', { cache: 'no-cache' });
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

const published = await loadPublished();
const draft = await draftStore<string>('readonly', (s) => s.get(DRAFT_KEY)).then((d) => { try { return d ? normalize(JSON.parse(d)) : null; } catch { return null; } });

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
export const pageFile = () => renderPage(state.cfg);

/** After the page file is downloaded: treat this version as published and drop the draft. */
export function markPublished() {
  state.saved = JSON.stringify(state.cfg);
  state.hasPublished = true;
  persistDraft();
  changed();
}

/** Throws away the browser draft and goes back to the published page. */
export async function discardDraft() {
  const page = await loadPublished();
  state.cfg = page ?? normalize({});
  state.saved = JSON.stringify(state.cfg);
  state.hasPublished = !!page;
  persistDraft();
  changed(true);
}

export const uid = () => Math.random().toString(36).slice(2, 8);
