/** yourlinki worker (optional): one-click publishing from the editor, and visitor stats in a D1 database.
 *
 *   POST /hit      {"l"?: item id, "r"?: referrer, "s"?: source}   sent by the published page (sendBeacon)
 *   GET  /stats?days=30                                             editor Insights
 *   POST /publish  the page HTML                                    commits it as index.html to GITHUB_REPO
 *   POST /github   {"token": "github_pat_…"}                         stores the GitHub key used by /publish
 * Everything but /hit needs `Authorization: Bearer <STATS_PASSWORD>`.
 *
 * No cookies. A visitor is a hash of a random daily salt, IP and browser, so it can't be traced across days or back to an IP. */

interface Limiter { limit(o: { key: string }): Promise<{ success: boolean }> }
interface Env { DB: D1Database; STATS_PASSWORD?: string; GITHUB_REPO?: string; HITS?: Limiter; LOGINS?: Limiter }

/* Spending guards. On Cloudflare's free plan nothing is ever billed (limits just stop requests), and these keep
   usage far below even the free limits, whatever anyone sends:
   - DAILY_CAP: at most this many visits + taps are recorded per day (UTC). Past it, nothing touches the database.
   - HITS (wrangler.jsonc): one device can send at most 30 pings a minute.
   - LOGINS (wrangler.jsonc): 30 signed-in requests a minute per device, so the password can't be guessed. */
const DAILY_CAP = 10_000;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const isBot = (ua: string) => !ua || /bot|crawl|spider|preview|facebookexternalhit|meta-external|slurp|curl|wget|python|go-http|node-fetch|axios|okhttp|headless|lighthouse|java\/|undici/i.test(ua);
const deviceOf = (ua: string) => (/ipad|tablet/i.test(ua) ? 'tablet' : /mobile|iphone|android/i.test(ua) ? 'mobile' : 'desktop');
const hostOf = (ref: unknown) => { try { return new URL(String(ref)).hostname.replace(/^(www|l|lm|m)\./, '') || null; } catch { return null; } };
// Networks that only send automated traffic (Meta's link scanner, cloud providers).
const SCANNERS = new Set([32934, 63293, 16509, 14618, 8075, 15169, 396982, 14061, 24940, 16276, 63949, 20473]);
const WINDOW = 30 * 60_000; // the same visitor again within 30 minutes counts once

/** In-app browsers rarely send a referrer, but name themselves in the user agent. */
function sourceOf(ua: string, ref: unknown, src: unknown): string | null {
  if (typeof src === 'string' && src.trim()) return src.trim().slice(0, 40);
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'TikTok';
  if (/Threads/i.test(ua)) return 'Threads';
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  return hostOf(ref);
}

let salt = { day: '', value: '' };
async function dailySalt(db: D1Database, day: string) {
  if (salt.day === day) return salt.value;
  const key = 'salt:' + day;
  await db.batch([
    db.prepare("DELETE FROM settings WHERE (key LIKE 'salt:%' OR key LIKE 'count:%') AND substr(key, instr(key, ':') + 1) != ?").bind(day),
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(key, crypto.randomUUID()),
  ]);
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  salt = { day, value: row!.value };
  return salt.value;
}

let cappedDay = '';
/** Counts one recorded hit for today; false once today's cap is reached. */
async function underCap(db: D1Database, day: string) {
  if (cappedDay === day) return false;
  const row = await db.prepare("INSERT INTO settings (key, value) VALUES (?1, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 WHERE CAST(value AS INTEGER) < ?2 RETURNING value")
    .bind('count:' + day, DAILY_CAP).first();
  if (!row) { cappedDay = day; console.warn('daily cap reached', day); }
  return !!row;
}

async function hit(request: Request, env: Env, body: any) {
  const h = request.headers;
  const ua = h.get('user-agent') ?? '';
  if (isBot(ua) || SCANNERS.has((request as any).cf?.asn) || !body || typeof body !== 'object') return;
  const item = typeof body.l === 'string' ? body.l.slice(0, 80) : null;
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (!(await underCap(env.DB, day))) return;
  const id = enc.encode((await dailySalt(env.DB, day)) + (h.get('cf-connecting-ip') ?? '') + ua);
  const visitor = hex(await crypto.subtle.digest('SHA-256', id)).slice(0, 16);
  const row = [now, h.get('cf-ipcountry'), sourceOf(ua, body.r, body.s), deviceOf(ua), visitor];
  if (item) await env.DB.prepare('INSERT INTO clicks (ts, country, referrer, device, visitor, link_id) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE NOT EXISTS (SELECT 1 FROM clicks WHERE visitor = ?5 AND link_id = ?6 AND ts > ?7)')
    .bind(...row, item, now - WINDOW).run();
  else await env.DB.prepare('INSERT INTO views (ts, country, referrer, device, visitor) SELECT ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (SELECT 1 FROM views WHERE visitor = ?5 AND ts > ?6)')
    .bind(...row, now - WINDOW).run();
}

const eq = (a: string, b: string) => a.length === b.length && [...a].reduce((r, ch, i) => r | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

async function stats(url: URL, env: Env) {
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const since = Date.now() - days * 86_400_000;
  const q = async (sql: string) => (await env.DB.prepare(sql).bind(since).all()).results;
  const one = async (sql: string) => (await env.DB.prepare(sql).bind(since).first()) as any;
  const [views, clicks, perItem, byCountry, byDevice, bySource, dailyViews, dailyClicks] = await Promise.all([
    one('SELECT COUNT(*) n, COUNT(DISTINCT visitor) v FROM views WHERE ts >= ?'),
    one('SELECT COUNT(*) n, COUNT(DISTINCT visitor) v FROM clicks WHERE ts >= ?'),
    q('SELECT link_id k, COUNT(*) n FROM clicks WHERE ts >= ? GROUP BY link_id ORDER BY n DESC LIMIT 30'),
    q("SELECT COALESCE(country,'??') k, COUNT(*) n FROM views WHERE ts >= ? GROUP BY 1 ORDER BY n DESC LIMIT 10"),
    q('SELECT device k, COUNT(*) n FROM views WHERE ts >= ? GROUP BY device ORDER BY n DESC'),
    q("SELECT COALESCE(referrer,'Direct') k, COUNT(*) n FROM views WHERE ts >= ? GROUP BY 1 ORDER BY n DESC LIMIT 10"),
    q("SELECT date(ts/1000,'unixepoch') k, COUNT(*) n FROM views WHERE ts >= ? GROUP BY 1 ORDER BY 1"),
    q("SELECT date(ts/1000,'unixepoch') k, COUNT(*) n FROM clicks WHERE ts >= ? GROUP BY 1 ORDER BY 1"),
  ]);
  return { days, views: views.n, visitors: views.v, clicks: clicks.n, clickers: clicks.v, perItem, byCountry, byDevice, bySource, dailyViews, dailyClicks };
}

/* Publishing: the page is committed to the creator's GitHub repository, which GitHub Pages serves.
   The key is a fine-grained GitHub token limited to that one repository (Contents: read and write).
   It is stored in this worker's database and never sent back out. */
const MAX_PAGE = 20_000_000;

async function github(env: Env, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, { ...init, headers: {
    authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'user-agent': 'yourlinki', 'x-github-api-version': '2022-11-28',
    ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status} on ${path}`), { status: res.status });
  return res.json() as Promise<any>;
}

async function publish(request: Request, env: Env) {
  if (!env.GITHUB_REPO) return json({ error: 'GITHUB_REPO is not set in wrangler.jsonc' }, 500);
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token'").first<{ value: string }>();
  if (!row) return json({ error: 'github', repo: env.GITHUB_REPO }, 409);
  const html = await request.text();
  if (html.length > MAX_PAGE || !/^<!doctype html>/i.test(html) || !html.includes('id="yourlinki-config"')) return json({ error: 'That is not a yourlinki page' }, 400);
  try {
    // One commit that replaces index.html, through the Git data API (handles large pages, unlike the contents API).
    const ref = await github(env, row.value, '/git/ref/heads/main');
    const parent = await github(env, row.value, `/git/commits/${ref.object.sha}`);
    const blob = await github(env, row.value, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: html, encoding: 'utf-8' }) });
    const tree = await github(env, row.value, '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree: [{ path: 'index.html', mode: '100644', type: 'blob', sha: blob.sha }] }) });
    const commit = await github(env, row.value, '/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Update my page', tree: tree.sha, parents: [ref.object.sha] }) });
    await github(env, row.value, '/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    return json({ ok: true, commit: commit.sha });
  } catch (e: any) {
    console.error('publish failed', e);
    if (e.status === 401 || e.status === 403 || e.status === 404) return json({ error: 'github', repo: env.GITHUB_REPO, expired: true }, 409);
    return json({ error: 'GitHub did not accept the update. Try again in a minute.' }, 502);
  }
}

async function connectGithub(request: Request, env: Env) {
  if (!env.GITHUB_REPO) return json({ error: 'GITHUB_REPO is not set in wrangler.jsonc' }, 500);
  let token = '';
  try { token = String((await request.json() as any).token ?? '').trim(); } catch {}
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) return json({ error: 'That does not look like a GitHub key. It starts with github_pat_' }, 400);
  try { await github(env, token, '/git/ref/heads/main'); } catch { return json({ error: `That key cannot open ${env.GITHUB_REPO}. Check that you picked this repository.` }, 400); }
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('github_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(token).run();
  return json({ ok: true });
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/hit' && request.method === 'POST') {
      // Read the body now: once the response is sent it can no longer be read.
      let body: unknown = null;
      try { body = JSON.parse((await request.text()).slice(0, 4000)); } catch {}
      const ip = request.headers.get('cf-connecting-ip') ?? '';
      if (env.HITS && !(await env.HITS.limit({ key: ip })).success) return new Response(null, { status: 204, headers: CORS });
      ctx.waitUntil(hit(request, env, body).catch((e) => console.error('tracking failed', e)));
      return new Response(null, { status: 204, headers: CORS });
    }
    const route = `${request.method} ${url.pathname}`;
    if (['GET /stats', 'POST /publish', 'POST /github'].includes(route)) {
      if (env.LOGINS && !(await env.LOGINS.limit({ key: request.headers.get('cf-connecting-ip') ?? '' })).success) return json({ error: 'Too many tries, wait a minute' }, 429);
      const pw = env.STATS_PASSWORD;
      const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!pw || !eq(given, pw)) return json({ error: 'Wrong password' }, 401);
      if (route === 'GET /stats') return json(await stats(url, env));
      if (route === 'POST /publish') return publish(request, env);
      return connectGithub(request, env);
    }
    return json({ ok: true, name: 'yourlinki stats' });
  },
};
