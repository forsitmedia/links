/** The publisher's page can live in a different repository from this editor. */
export const editorPageUrl = () => new URL('../', location.href).href;
const KEY = 'yourlinki-page:' + editorPageUrl();
type Destination = { worker: string; url: string };

export function validPageUrl(value: unknown): string | null {
  try {
    if (typeof value !== 'string') return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.search = ''; url.hash = '';
    url.pathname = url.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
    return url.href;
  } catch { return null; }
}

let destination: Destination | null = null;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  const url = validPageUrl(saved?.url);
  if (url && typeof saved?.worker === 'string') destination = { worker: saved.worker, url };
} catch {}

export const rememberedPage = () => destination;
export const requestedPage = () => validPageUrl(new URLSearchParams(location.search).get('page'));
export const publishedPageUrl = (worker?: string) => worker && destination?.worker === worker ? destination.url : editorPageUrl();

export function rememberPage(worker: string, value: unknown): boolean {
  const url = validPageUrl(value);
  if (!worker || !url) return false;
  destination = { worker, url };
  try { localStorage.setItem(KEY, JSON.stringify(destination)); } catch {}
  return true;
}

/** Public metadata contains the page address, never the publisher's password or GitHub key. */
export async function discoverPage(worker: string) {
  try {
    const res = await fetch(worker + '/', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (res.ok) rememberPage(worker, (await res.json()).url);
  } catch {} // older or temporarily unavailable workers still use the remembered address
}
