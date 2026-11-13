/** Signing in to the creator's own yourlinki worker (stats/ in the repository): one password for publishing and Insights.
 * The worker address is part of the page config (the page sends its visits there); the password stays in this browser. */
import { state, changed } from './state';
import { h, group, inputRow, navRow, toast } from './ui';
import { discoverPage } from './page-url';

const KEY = 'yourlinki-stats-password';
const read = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

/** The creator's browser: the published page on this origin doesn't count its visits. */
write('yourlinki-owner', '1');

export const workerUrl = () => state.cfg.stats ?? '';
export const signedIn = () => !!workerUrl() && !!read(KEY);
export const signOut = () => write(KEY, '');

/** A request to the worker with the saved password. A 401 signs this browser out. */
export async function api(path: string, init: RequestInit = {}, endpoint = workerUrl()): Promise<Response> {
  const res = await fetch(endpoint + path, { ...init, headers: { ...(init.headers ?? {}), authorization: 'Bearer ' + read(KEY) } });
  if (res.status === 401) signOut();
  return res;
}

/** Address + password. Calls `done` once the worker accepted the password. */
export function signInForm(done: () => void, o: { header?: string; footer?: string } = {}): HTMLElement {
  let endpoint = workerUrl();
  let password = '';
  const submit = async () => {
    const url = endpoint.trim().replace(/\/+$/, '');
    if (!/^https:\/\//.test(url)) return toast('The address starts with https://');
    try {
      const res = await fetch(url + '/stats?days=1', { headers: { authorization: 'Bearer ' + password } });
      if (res.status === 401) return toast('Wrong password');
      if (res.status === 429) return toast('Too many tries. Wait a minute.');
      if (!res.ok) throw new Error();
    } catch { return toast('Could not reach that address'); }
    write(KEY, password);
    if (state.cfg.stats !== url) { state.cfg.stats = url; changed(); }
    await discoverPage(url);
    changed(true);
    done();
  };
  const form = h('form', { onsubmit: (e: Event) => { e.preventDefault(); submit(); } },
    group({ header: o.header ?? 'Sign in', footer: o.footer ?? 'Your password is saved in this browser only, so you sign in once per device.' },
      ...(workerUrl() ? [] : [inputRow('Address', endpoint, (v) => { endpoint = v; }, { placeholder: 'https://yourlinki-stats.….workers.dev', type: 'url' })]),
      inputRow('Password', password, (v) => { password = v; }, { type: 'password' }),
      navRow({ title: 'Sign In', chevron: false, onClick: submit })));
  setTimeout(() => (form.querySelector('input[type=password]') as HTMLInputElement | null)?.focus(), 50);
  return form;
}
