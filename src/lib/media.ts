import { safeImg, withScheme } from './types';

export const videoRatio = (aspect?: string) => aspect === 'wide' ? '21 / 9' : aspect === 'square' ? '1 / 1' : '16 / 9';

/** Only recognized YouTube video URLs can become an embedded player. */
export function youtubeVideo(value: string): { id: string; start: number } | null {
  try {
    const url = new URL(withScheme(value));
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (host === 'youtu.be') id = parts[0];
    else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1];
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    const time = url.searchParams.get('start') ?? url.searchParams.get('t') ?? '';
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);
    const seconds = /^\d+$/.test(time) ? Number(time) : match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
    return { id, start: Math.min(86400, seconds) };
  } catch { return null; }
}

export function youtubeCover(url: string, custom?: string | null): string {
  const video = youtubeVideo(url);
  return safeImg(custom) || (video ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : '');
}

/** Post previews link to web pages; their cover and excerpt remain editable. */
export function postUrl(value: string): string {
  try {
    const url = new URL(withScheme(value));
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function postSource(value: string): string {
  try {
    const host = new URL(withScheme(value)).hostname.replace(/^www\./, '');
    const names: Record<string, string> = { 'instagram.com': 'Instagram', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'linkedin.com': 'LinkedIn', 'medium.com': 'Medium', 'substack.com': 'Substack', 'pinterest.com': 'Pinterest' };
    const root = Object.keys(names).find((key) => host === key || host.endsWith('.' + key));
    return root ? names[root] : host;
  } catch { return 'Post preview'; }
}
