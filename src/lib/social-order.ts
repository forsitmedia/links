import type { Social } from './types';

export const socialKey = (item: Social, index: number) => item.id || `social:${index}`;

/** Old configurations get stable identities, including repeated platforms. */
export function normalizeSocials(raw: unknown): Social[] {
  const used = new Set<string>();
  return (Array.isArray(raw) ? raw : []).filter((s) => s && typeof s.platform === 'string' && typeof s.url === 'string').map((s, i) => {
    let id = typeof s.id === 'string' && s.id ? s.id : `social:${i}`;
    while (used.has(id)) id += '-copy';
    used.add(id);
    return { id, platform: s.platform, url: s.url };
  });
}
export function moveSocial(list: Social[], id: string, target: string, after = false): boolean {
  const from = list.findIndex((s, i) => socialKey(s, i) === id);
  const to = list.findIndex((s, i) => socialKey(s, i) === target);
  if (from < 0 || to < 0 || from === to) return false;
  const destination = to + (after ? 1 : 0) - (from < to ? 1 : 0);
  if (destination === from) return false;
  // Materialize fallback ids before changing indices in an old in-memory draft.
  list.forEach((s, i) => { s.id ??= socialKey(s, i); });
  list.splice(destination, 0, list.splice(from, 1)[0]);
  return true;
}
export function stepSocial(list: Social[], id: string, direction: number): boolean {
  const from = list.findIndex((s, i) => socialKey(s, i) === id);
  const next = list[from + direction];
  return !!next && moveSocial(list, id, socialKey(next, from + direction), direction > 0);
}
