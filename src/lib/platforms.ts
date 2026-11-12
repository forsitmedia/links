/** Social platforms. `slug` is the simple-icons name; platforms without one use a local `icon`. */
export type Platform = { key: string; label: string; slug?: string; icon?: string; prefix: string };

export const PLATFORMS: Platform[] = [
  { key: 'instagram', label: 'Instagram', slug: 'instagram', prefix: 'https://instagram.com/' },
  { key: 'tiktok', label: 'TikTok', slug: 'tiktok', prefix: 'https://tiktok.com/@' },
  { key: 'youtube', label: 'YouTube', slug: 'youtube', prefix: 'https://youtube.com/@' },
  { key: 'x', label: 'X', slug: 'x', prefix: 'https://x.com/' },
  { key: 'threads', label: 'Threads', slug: 'threads', prefix: 'https://threads.net/@' },
  { key: 'whatsapp', label: 'WhatsApp', slug: 'whatsapp', prefix: 'https://wa.me/' },
  { key: 'spotify', label: 'Spotify', slug: 'spotify', prefix: 'https://open.spotify.com/' },
  { key: 'facebook', label: 'Facebook', slug: 'facebook', prefix: 'https://facebook.com/' },
  { key: 'github', label: 'GitHub', slug: 'github', prefix: 'https://github.com/' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'briefcase', prefix: 'https://linkedin.com/in/' },
  { key: 'telegram', label: 'Telegram', slug: 'telegram', prefix: 'https://t.me/' },
  { key: 'twitch', label: 'Twitch', slug: 'twitch', prefix: 'https://twitch.tv/' },
  { key: 'website', label: 'Website', icon: 'globe', prefix: 'https://' },
  { key: 'email', label: 'Email', icon: 'mail', prefix: 'mailto:' },
];

export const platform = (key: string) => PLATFORMS.find((p) => p.key === key);
