// Notice when a newer build is published.
// On load: if the page came from a stale cache, reload once with a cache-busting
// address. While open: check every 10 minutes and when the tab comes back into
// view, and offer a reload with a short note on what changed.
const body = document.body;
const BASE = body.dataset.base || '/';
const mine = { data: body.dataset.vdata, code: body.dataset.vcode, streams: +(body.dataset.vstreams || 0), superchats: +(body.dataset.vsc || 0) };

interface Version { data: string; code: string; streams: number; superchats: number; until: string }

async function latest(): Promise<Version | null> {
  try {
    const r = await fetch(`${BASE}version.json?t=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function describe(v: Version) {
  const data = v.data !== mine.data, code = v.code !== mine.code;
  const more = v.streams - mine.streams, sc = v.superchats - mine.superchats;
  const what = more > 0
    ? `${more} more stream${more === 1 ? '' : 's'}${sc > 0 ? ` and ${sc.toLocaleString('en-US')} more superchats` : ''}, up to ${v.until}`
    : 'updated numbers';
  if (data && code) return `The site has been updated, and new data is out: ${what}.`;
  if (data) return `New data is out: ${what}.`;
  return 'The site has been updated.';
}

function banner(v: Version) {
  if (document.getElementById('newver')) return;
  const el = document.createElement('div');
  el.id = 'newver';
  el.className = 'newver';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${describe(v)}</span> <button type="button" data-a="reload">Reload</button> <button type="button" data-a="later">Later</button>`;
  el.onclick = (ev) => {
    const a = (ev.target as HTMLElement).dataset.a;
    if (a === 'reload') reloadFresh(v);
    if (a === 'later') el.remove();
  };
  document.body.appendChild(el);
}

function reloadFresh(v: Version) {
  // a new query string makes GitHub's cache fetch the page again; the #filters stay
  const u = new URL(location.href);
  u.searchParams.set('v', (v.code + v.data).slice(0, 10));
  location.replace(u.toString());
}

const changed = (v: Version | null): v is Version => !!v && (v.data !== mine.data || v.code !== mine.code);

async function check(onLoad: boolean) {
  const v = await latest();
  if (!changed(v)) return;
  const key = `ts-reloaded-${v.code}-${v.data}`;
  let tried = false;
  try { tried = !!sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch { tried = true; }
  if (onLoad && !tried) reloadFresh(v); // stale copy at load: fetch the fresh one once, silently
  else banner(v);
}

check(true);
setInterval(() => { if (document.visibilityState === 'visible') check(false); }, 10 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(false); });
