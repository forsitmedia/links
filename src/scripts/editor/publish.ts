/** Publishing. Signed in to the creator's worker: one press puts the page online (the worker commits it to GitHub).
 * Without a worker: download index.html and upload it to the GitHub copy by hand. */
import { pageFile, markPublished } from './state';
import { api, signedIn, signInForm } from './account';
import { h, group, inputRow, navRow, sheet, svg, toast } from './ui';

/** On `<owner>.github.io/<repo>/editor/`, the GitHub repository this editor was published from. */
export function githubRepo(): { owner: string; repo: string } | null {
  const host = location.hostname.toLowerCase();
  if (!host.endsWith('.github.io')) return null;
  const owner = host.slice(0, -'.github.io'.length);
  const parts = location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('editor');
  return { owner, repo: at > 0 ? parts[at - 1] : host };
}

/** The public page: the folder that holds this editor. */
export const pageUrl = () => new URL('../', location.href).href;
const shortUrl = () => pageUrl().replace(/^https?:\/\//, '').replace(/\/$/, '');

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

async function publishNow(body: HTMLElement) {
  body.replaceChildren(h('div', { class: 'publish-status' }, h('span', { class: 'spinner' }), h('p', {}, 'Publishing…')));
  const html = pageFile();
  let res: Response, data: any = {};
  try {
    res = await api('/publish', { method: 'POST', headers: { 'content-type': 'text/html' }, body: html });
    data = await res.json().catch(() => ({}));
  } catch {
    return failed(body, 'Could not reach your yourlinki worker. Check your internet connection.');
  }
  if (res.status === 401) return body.replaceChildren(signInForm(() => publishNow(body), { header: 'Sign in again', footer: 'The saved password no longer works.' }));
  if (res.status === 409 && data.error === 'github') return body.replaceChildren(connectGithub(body, data.repo, !!data.expired));
  if (!res.ok) return failed(body, data.error || 'Publishing failed. Try again in a minute.');

  markPublished();
  const mb = new Blob([html]).size / 1_000_000;
  body.replaceChildren(
    h('div', { class: 'publish-status done' }, svg('check', 34), h('b', {}, 'Published'), h('p', {}, 'Your page updates in about a minute. Your link stays the same.')),
    group({ header: 'Your link', footer: mb > 5 ? `Your page is ${mb.toFixed(1)} MB. Use fewer or smaller images so it loads quickly.` : 'Put this link in your Instagram bio.' },
      navRow({ title: shortUrl(), chevron: false, trail: h('span', { class: 'val' }, 'Copy'), onClick: async () => { await navigator.clipboard.writeText(pageUrl()); toast('Link copied'); } }),
      navRow({ title: 'Open My Page', onClick: () => open(pageUrl(), '_blank') })));
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
  const keyUrl = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
    name: `yourlinki ${name} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`.slice(0, 40), // unique: GitHub refuses repeated names description: `Lets the yourlinki editor publish ${repo}`, target_name: owner, expires_in: 'none', contents: 'write' });
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
  const html = pageFile();
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
      navRow({ title: 'Open My Page', value: shortUrl(), onClick: () => open(pageUrl(), '_blank') })),
  ]);
}
