import { youtubeVideo } from './media';

/** Metadata requests only go to YouTube's fixed oEmbed endpoint. */
export async function videoDetails(value: string, fetcher: typeof fetch = fetch) {
  const video = youtubeVideo(value);
  if (!video) return null;
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${video.id}`);
  endpoint.searchParams.set('format', 'json');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetcher(endpoint, { signal: controller.signal, redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const data: any = await response.json();
    if (typeof data.title !== 'string' || !data.title.trim()) return null;
    return { id: video.id, title: data.title.trim().slice(0, 200) };
  } catch { return null; }
  finally { clearTimeout(timeout); }
}
