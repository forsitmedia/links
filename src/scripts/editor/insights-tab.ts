/** Insights: visitors and taps, read from the creator's own stats worker (stats/ in the repository). */
import { state, changed } from './state';
import { platform } from '../../lib/platforms';
import { socialKey } from '../../lib/social-order';
import { h, group, navRow, inputRow, segmented, hostname, toast } from './ui';

const KEY = 'yourlinki-stats-password';
const read = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

/** The creator's browser: the published page on this origin doesn't count its visits. */
write('yourlinki-owner', '1');

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
  if (kind === 'play') return 'Played: ' + blockName(rest);
  return linkName(id) ?? blockName(id); // clicks recorded by the older Cloudflare version used the bare link id
}

function connectForm(redraw: () => void, error = ''): HTMLElement {
  let endpoint = state.cfg.stats ?? '';
  let password = read(KEY);
  return h('div', {},
    group({ header: 'Connect your stats', footer: 'Stats are optional. They go to your own free Cloudflare Worker (the stats folder in the repository, see the README). The password stays in this browser.' + (error ? ` ${error}` : '') },
      inputRow('Address', endpoint, (v) => { endpoint = v.trim(); }, { placeholder: 'https://yourlinki-stats.….workers.dev', type: 'url' }),
      inputRow('Password', password, (v) => { password = v; }, { type: 'password' }),
      navRow({ title: 'Connect', chevron: false, onClick: async () => {
        const url = endpoint.replace(/\/+$/, '');
        if (!/^https:\/\//.test(url)) return toast('The address starts with https://');
        try {
          const res = await fetch(url + '/stats?days=1', { headers: { authorization: 'Bearer ' + password } });
          if (res.status === 401) return toast('Wrong password');
          if (!res.ok) throw new Error();
        } catch { return toast('Could not reach that address'); }
        write(KEY, password);
        if (state.cfg.stats !== url) { state.cfg.stats = url; changed(); toast('Connected. Publish once so your page starts counting.'); }
        redraw();
      } })));
}

export async function insightsTab(redraw: () => void): Promise<HTMLElement> {
  const endpoint = state.cfg.stats;
  const password = read(KEY);
  if (!endpoint || !password) return connectForm(redraw);

  const picker = segmented([{ value: '1', label: 'Today' }, { value: '7', label: '7 Days' }, { value: '30', label: '30 Days' }, { value: '90', label: '90 Days' }], String(days), (v) => { days = +v; redraw(); });
  let s: any;
  try {
    const res = await fetch(`${endpoint}/stats?days=${days}`, { headers: { authorization: 'Bearer ' + password } });
    if (res.status === 401) { write(KEY, ''); return connectForm(redraw, 'The saved password no longer works.'); }
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
    group({ footer: 'Disconnecting forgets the password in this browser. Your page keeps counting until you remove the address and publish.' },
      navRow({ title: 'Disconnect This Browser', chevron: false, onClick: () => { write(KEY, ''); redraw(); } }),
      navRow({ title: 'Stop Counting on My Page', chevron: false, onClick: () => {
        if (!confirm('Remove stats from your page? Publish afterwards to apply it.')) return;
        delete state.cfg.stats; write(KEY, ''); changed(); redraw();
      } })));
}
