/** Insights: visitors and taps, read from the creator's own stats worker (stats/ in the repository). */
import { state } from './state';
import { api, signInForm, signOut, signedIn, workerUrl } from './account';
import { platform } from '../../lib/platforms';
import { socialKey } from '../../lib/social-order';
import { h, group, navRow, segmented, hostname } from './ui';

let days = 30;

/** What a clicked item id (`link:<id>`, `social:<id>`, `play:<block>`, `<block>`) is called in the editor. */
function itemName(id: string): string {
  const cfg = state.cfg;
  const [kind, rest] = id.includes(':') ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)] : ['', id];
  const linkName = (linkId: string) => { const l = cfg.links.find((x) => x.id === linkId); return l ? l.title || hostname(l.url) : null; };
  if (kind === 'link') return linkName(rest) ?? 'Removed link';
  if (kind === 'social') {
    const s = cfg.social.find((x, i) => socialKey(x, i) === rest);
    return s ? (platform(s.platform)?.label ?? s.platform) + ' icon' : 'Removed icon';
  }
  const blockName = (blockId: string) => {
    const b = cfg.blocks.find((x) => x.id === blockId);
    if (!b) return 'Removed item';
    return b.title || ({ youtube: 'Video', image: 'Image', post: 'Post', profile: 'Profile' } as Record<string, string>)[b.type] || b.type;
  };
  if (kind === 'go') { // a link inside a Link Menu
    for (const b of cfg.blocks) { const e = b.items?.find((x) => x.id === rest); if (e) return `${e.title || hostname(e.url)} (${b.title || 'Link menu'})`; }
    return 'Removed link';
  }
  if (kind === 'play') return 'Played: ' + blockName(rest);
  return linkName(id) ?? blockName(id); // clicks recorded by the older Cloudflare version used the bare link id
}

export async function insightsTab(redraw: () => void): Promise<HTMLElement> {
  if (!signedIn()) return signInForm(redraw, { header: 'Sign in to see your stats' });
  const endpoint = workerUrl();

  const picker = segmented([{ value: '1', label: 'Today' }, { value: '7', label: '7 Days' }, { value: '30', label: '30 Days' }, { value: '90', label: '90 Days' }], String(days), (v) => { days = +v; redraw(); });
  let s: any;
  try {
    const res = await api(`/stats?days=${days}`);
    if (res.status === 401) return signInForm(redraw, { header: 'Sign in again', footer: 'The saved password no longer works.' });
    if (!res.ok) throw new Error();
    s = await res.json();
  } catch {
    return h('div', {}, picker, group({ footer: `Could not reach ${hostname(endpoint)}. Check your connection and try again.` }, navRow({ title: 'Try Again', onClick: redraw })));
  }

  const rate = s.visitors ? Math.min(100, Math.round((s.clickers / s.visitors) * 100)) + '%' : '–'; // share of visitors who tapped something
  const viewsByDay = Object.fromEntries(s.dailyViews.map((d: any) => [d.k, d.n]));
  const clicksByDay = Object.fromEntries(s.dailyClicks.map((d: any) => [d.k, d.n]));
  const span = Math.max(days, 7);
  const daily = Array.from({ length: span }, (_, i) => {
    const k = new Date(Date.now() - (span - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { k, v: (viewsByDay[k] ?? 0) as number, c: (clicksByDay[k] ?? 0) as number };
  });
  const max = Math.max(1, ...daily.map((d) => d.v));
  const rows = (items: { k: string; n: number }[], label = (k: string) => k) =>
    items.length ? items.map((r) => navRow({ title: label(r.k), value: String(r.n) })) : [navRow({ title: 'No data yet' })];
  const country = (code: string) => { try { return code === '??' ? 'Unknown' : new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; } };

  return h('div', {},
    picker,
    h('div', { class: 'stat-cards' }, [['Visitors', s.visitors], ['Taps', s.clicks], ['Tap Rate', rate]].map(([l, v]) =>
      h('div', { class: 'stat-card' }, h('b', {}, String(v)), h('span', {}, String(l))))),
    group({ header: `Visitors per Day${days < 7 ? ' (last 7 days)' : ''}`, footer: 'Each visitor counts once every 30 minutes, and a tap on the same item once every 30 minutes. Bots, link scanners and this browser are left out. No cookies.' },
      h('div', { class: 'chart', style: `gap:${span > 30 ? 1 : 3}px` }, s.views || s.clicks
        ? daily.map((d) => h('div', { title: `${d.k}: ${d.v} visitors, ${d.c} taps`, style: `height:${(d.v / max) * 100}%${d.v ? '' : ';opacity:.25'}` }))
        : h('span', { class: 'empty' }, 'No visitors yet'))),
    group({ header: 'Most Tapped' }, ...rows(s.perItem, itemName)),
    group({ header: 'Where Visitors Come From', footer: 'Tip: use yourlink/?src=story in a story or a post to see it here as its own source.' }, ...rows(s.bySource)),
    group({ header: 'Countries' }, ...rows(s.byCountry, country)),
    group({ header: 'Devices' }, ...rows(s.byDevice, (k) => k[0].toUpperCase() + k.slice(1))),
    group({ footer: 'Signing out forgets the password in this browser. You need it again to publish or see stats here.' },
      navRow({ title: 'Sign Out of This Browser', chevron: false, onClick: () => { signOut(); redraw(); } })));
}
