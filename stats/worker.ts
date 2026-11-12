/** yourlinki stats: an optional Cloudflare Worker that counts page views and clicks in a D1 database.
 *
 *   POST /hit    {"l"?: item id, "r"?: referrer, "s"?: source}   sent by the published page (sendBeacon)
 *   GET  /stats?days=30                                           read by the editor, needs `Authorization: Bearer <STATS_PASSWORD>`
 *
 * No cookies. A visitor is a hash of a random daily salt, IP and browser, so it can't be traced across days or back to an IP. */

interface Env { DB: D1Database; STATS_PASSWORD?: string }

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
    db.prepare("DELETE FROM settings WHERE key LIKE 'salt:%' AND key != ?").bind(key),
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(key, crypto.randomUUID()),
  ]);
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  salt = { day, value: row!.value };
  return salt.value;
}

async function hit(request: Request, env: Env, body: any) {
  const h = request.headers;
  const ua = h.get('user-agent') ?? '';
  if (isBot(ua) || SCANNERS.has((request as any).cf?.asn) || !body || typeof body !== 'object') return;
  const item = typeof body.l === 'string' ? body.l.slice(0, 80) : null;
  const now = Date.now();
  const id = enc.encode((await dailySalt(env.DB, new Date(now).toISOString().slice(0, 10))) + (h.get('cf-connecting-ip') ?? '') + ua);
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
      ctx.waitUntil(hit(request, env, body).catch((e) => console.error('tracking failed', e)));
      return new Response(null, { status: 204, headers: CORS });
    }
    if (url.pathname === '/stats' && request.method === 'GET') {
      const pw = env.STATS_PASSWORD;
      const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!pw || !eq(given, pw)) return json({ error: 'Wrong password' }, 401);
      return json(await stats(url, env));
    }
    return json({ ok: true, name: 'yourlinki stats' });
  },
};
