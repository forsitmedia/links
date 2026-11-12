/** Publishing: download the page as index.html, then upload it to the creator's GitHub copy. */
import { pageFile, markPublished } from './state';
import { h, group, navRow, sheet, svg, toast } from './ui';

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

const step = (n: number, title: string, text: string, action?: Node) =>
  h('div', { class: 'publish-step' }, h('span', { class: 'publish-num' }, String(n)),
    h('div', {}, h('b', {}, title), h('p', {}, text), action));

export function openPublish() {
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

  sheet('Publish', () => [
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
      navRow({ title: 'Open My Page', value: pageUrl().replace(/^https?:\/\//, ''), onClick: () => open(pageUrl(), '_blank') })),
  ]);
}
