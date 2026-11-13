/** Publishing. Signed in to the creator's worker: one press puts the page online (the worker commits it to GitHub).
 * Without a worker: download index.html and upload it to the GitHub copy by hand. */
import { pageFile, markPublished, state, changed } from './state';
import { CONFIG_ID, PAGE_URL } from '../../lib/render';
import { safeImg } from '../../lib/types';
import { normalizeImageFrame } from '../../lib/image-frame';
import { api, signedIn, signInForm } from './account';
import { h, group, inputRow, navRow, sheet, svg, toast } from './ui';
import { editorPageUrl, publishedPageUrl, rememberPage } from './page-url';
import { prepareVoiceAudio } from '../../lib/audio-file';

/** On `<owner>.github.io/<repo>/editor/`, the GitHub repository this editor was published from. */
export function githubRepo(): { owner: string; repo: string } | null {
  const host = location.hostname.toLowerCase();
  if (!host.endsWith('.github.io')) return null;
  const owner = host.slice(0, -'.github.io'.length);
  const parts = location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('editor');
  return { owner, repo: at > 0 ? parts[at - 1] : host };
}

/** The connected publisher's page, or the folder holding the editor for a manual upload. */
export const pageUrl = () => publishedPageUrl(state.cfg.stats);
const shortUrl = (url = pageUrl()) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

const step = (n: number, title: string, text: string, action?: Node) =>
  h('div', { class: 'publish-step' }, h('span', { class: 'publish-num' }, String(n)),
    h('div', {}, h('b', {}, title), h('p', {}, text), action));

export function openPublish() {
  sheet('Publish', (close) => {
    const body = h('div', { class: 'publish' });
    if (signedIn()) publishNow(body);
    else body.replaceChildren(
      h('p', { class: 'publish-intro' }, 'Sign in once on this device, and Publish puts your page online by itself.'),
      signInForm(() => publishNow(body)),
      group({}, navRow({ title: 'Download the File Instead', onClick: () => { close(); setTimeout(openDownload, 300); } })));
    return [body];
  });
}

/** The picture link previews show (WhatsApp, iMessage…): the cover or photo, framed as on the page, as a 1200×630 JPEG.
 * Only for embedded images; a photo with a web address is used as it is. */
async function shareImage(config = state.cfg): Promise<string | null> {
  const p = config.profile, cover = p.showCover !== false ? safeImg(p.cover) : '';
  const src = cover || safeImg(p.photo);
  if (!src.startsWith('data:')) return null;
  try {
    const img = new Image(); img.src = src; await img.decode();
    const f = normalizeImageFrame(cover ? p.coverFrame : p.photoFrame), W = 1200, H = 630;
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = canvas.getContext('2d')!;
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight) * f.zoom, w = img.naturalWidth * scale, ht = img.naturalHeight * scale;
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    g.drawImage(img, (W - w) * f.x / 100, (H - ht) * f.y / 100, w, ht);
    return canvas.toDataURL('image/jpeg', .85).split(',')[1];
  } catch { return null; }
}

async function publishNow(body: HTMLElement) {
  body.replaceChildren(h('div', { class: 'publish-status' }, h('span', { class: 'spinner' }), h('p', {}, 'Publishing…')));
  try { if (await prepareVoiceAudio(state.cfg)) changed(); }
  catch { return failed(body, 'This voice recording could not be prepared for phones. Try publishing from the browser where you recorded it, or replace it with an MP3 or WAV file.'); }
  const snapshot = JSON.stringify(state.cfg), config = JSON.parse(snapshot) as typeof state.cfg;
  const html = pageFile(config), endpoint = config.stats ?? '';
  let res: Response, data: any = {};
  try {
    // The worker fills in the page's address and publishes the preview picture next to the page.
    res = await api('/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html, image: await shareImage(config) }) }, endpoint);
    data = await res.json().catch(() => ({}));
    if (res.status === 400) { // a worker from before link previews: send the page alone, without the address placeholders
      const plainHtml = html.replace(/<meta[^>]*__YOURLINKI_PAGE__[^>]*>/g, '').replace(/<meta property="og:image:(width|height)"[^>]*>|<meta name="twitter:card"[^>]*>/g, '');
      res = await api('/publish', { method: 'POST', headers: { 'content-type': 'text/html' }, body: plainHtml }, endpoint);
      data = await res.json().catch(() => ({}));
    }
  } catch {
    return failed(body, 'Could not reach your yourlinki worker. Check your internet connection.');
  }
  if (res.status === 401) return body.replaceChildren(signInForm(() => publishNow(body), { header: 'Sign in again', footer: 'The saved password no longer works.' }));
  if (res.status === 409 && data.error === 'github') return body.replaceChildren(connectGithub(body, data.repo, !!data.expired));
  if (!res.ok) return failed(body, data.error || 'Publishing failed. Try again in a minute.');

  rememberPage(endpoint, data.url);
  changed(true);
  const url = publishedPageUrl(endpoint);
  const mb = new Blob([html]).size / 1_000_000;
  const links = () => group({ header: 'Your link', footer: mb > 5 ? `Your page is ${mb.toFixed(1)} MB. Use fewer or smaller images so it loads quickly.` : 'Put this link in your Instagram bio.' },
      navRow({ title: shortUrl(url), chevron: false, trail: h('span', { class: 'val' }, 'Copy'), onClick: async () => { await navigator.clipboard.writeText(url); toast('Link copied'); } }),
      navRow({ title: 'Open My Page', onClick: () => open(url, '_blank') }));

  const check = async () => {
    body.replaceChildren(h('div', { class: 'publish-status', role: 'status' }, h('span', { class: 'spinner' }),
      h('b', {}, 'Updating your page…'), h('p', {}, 'Your changes are saved. Waiting for your page to go live, usually about a minute.')));
    const until = Date.now() + 120_000;
    do {
      let ready = false;
      try {
        if (typeof data.version === 'string') {
          const status = await api('/publish?version=' + encodeURIComponent(data.version), { signal: AbortSignal.timeout(15_000) }, endpoint);
          if (status.status === 401) break;
          ready = status.ok && (await status.json()).ready === true;
        } else {
          // Older workers can still be checked by reading the actual public page.
          const live = new URL(url); live.searchParams.set('yourlinki-check', String(Date.now()));
          const res = await fetch(live, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
          const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
          const json = doc.getElementById(CONFIG_ID)?.textContent;
          ready = res.ok && !!json && JSON.stringify(JSON.parse(json)) === snapshot;
        }
      } catch {} // transient errors keep the saved draft and allow another status check
      if (ready) {
        markPublished(snapshot);
        body.replaceChildren(h('div', { class: 'publish-status done', role: 'status' }, svg('check', 34),
          h('b', {}, 'Published'), h('p', {}, 'Your changes are live. Your link stays the same.')), links());
        return;
      }
      if (!body.isConnected) return;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } while (Date.now() < until);
    body.replaceChildren(h('div', { class: 'publish-status', role: 'status' }, h('b', {}, 'Update sent'),
      h('p', {}, 'Your changes are saved, but your page is still updating. Check again in a moment.')),
      group({}, navRow({ title: 'Check Again', onClick: check })), links());
  };
  await check();
}

function failed(body: HTMLElement, message: string) {
  body.replaceChildren(
    h('div', { class: 'publish-status' }, h('b', {}, 'Not published'), h('p', {}, message)),
    group({}, navRow({ title: 'Try Again', chevron: false, onClick: () => publishNow(body) }),
      navRow({ title: 'Download the File Instead', onClick: openDownload })));
}

/** One time: a GitHub key that can only change this one repository, so the worker can publish. */
function connectGithub(body: HTMLElement, repo: string, expired: boolean): HTMLElement {
  const [owner, name] = (repo || '/').split('/');
  // The name gets a timestamp: GitHub refuses a second key with the same name.
  const keyUrl = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
    name: `yourlinki ${name} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`.slice(0, 40), description: `Lets the yourlinki editor publish ${repo}`, target_name: owner, expires_in: 'none', contents: 'write' });
  let token = '';
  const connect = async () => {
    const res = await api('/github', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return toast(data?.error || 'Could not connect. Try again.');
    toast('GitHub connected');
    publishNow(body);
  };
  return h('div', {},
    h('p', { class: 'publish-intro' }, expired
      ? `GitHub no longer accepts the saved key for ${repo}. Make a new one (1 minute).`
      : `One time only: give yourlinki a key that can update ${repo} and nothing else.`),
    step(1, 'Create the key on GitHub', `Under "Repository access" choose "Only select repositories" and pick ${name}. "Contents" is already set to "Read and write". Press "Generate token", then copy the key.`,
      h('a', { class: 'publish-btn', href: keyUrl, target: '_blank', rel: 'noopener' }, 'Create the key on GitHub')),
    step(2, 'Paste it here', 'It starts with github_pat_. It is kept in your Cloudflare worker, never in this page.'),
    h('form', { onsubmit: (e: Event) => { e.preventDefault(); connect(); } },
      group({}, inputRow('Key', '', (v) => { token = v.trim(); }, { type: 'password', placeholder: 'github_pat_…' }),
        navRow({ title: 'Connect and Publish', chevron: false, onClick: connect }))));
}

/** The manual way, for pages without a worker. */
export function openDownload() {
  const repo = githubRepo();
  const url = editorPageUrl();
  const html = pageFile().split(PAGE_URL).join(url);
  const mb = new Blob([html]).size / 1_000_000;

  const download = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: 'index.html' }) as HTMLAnchorElement;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    markPublished();
    toast('index.html downloaded');
  };

  sheet('Publish by Hand', () => [
    h('div', { class: 'publish' },
      h('p', { class: 'publish-intro' }, 'Your page is one file called index.html. Put it in your GitHub project and your link shows the new version.'),
      step(1, 'Download your page', 'Your browser saves a file called index.html.',
        h('button', { class: 'publish-btn', type: 'button', onclick: download }, svg('share', 16), 'Download index.html')),
      step(2, 'Upload it to GitHub', repo
        ? `Open github.com/${repo.owner}/${repo.repo}, drag index.html into the page, then press Commit changes.`
        : 'Open your project on github.com, press Add file → Upload files, drag index.html in, then press Commit changes.',
        repo ? h('a', { class: 'publish-btn secondary', href: `https://github.com/${repo.owner}/${repo.repo}/upload/main`, target: '_blank', rel: 'noopener' }, 'Open GitHub upload') : undefined),
      step(3, 'Wait about a minute', 'GitHub updates your page by itself. Refresh your link to see it.')),
    group({ footer: `If your computer saved the file as "index (1).html", rename it to index.html before uploading. Page size: ${mb.toFixed(1)} MB${mb > 5 ? '. That is large: use fewer or smaller images so your page loads quickly.' : '.'}` },
      navRow({ title: 'Open My Page', value: shortUrl(url), onClick: () => open(url, '_blank') })),
  ]);
}
