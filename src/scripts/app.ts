// Interactive layer shared by every page. A page sets its scope on <body>
// (data-scope = all | channel | donor, plus data-channel or data-donor) and
// includes the section containers it wants; each render step skips sections
// that aren't on the page.
import { aggregate, allTime, makeContext } from '../lib/core';
import type { Aggregate, Filter, Payload, Person } from '../lib/types';
import { esc, hms, listJoin, mlabel, MON, pct, possessive, usd } from '../lib/format';

type Scope = 'all' | 'channel' | 'donor';
const body = document.body;
const SCOPE = (body.dataset.scope || 'all') as Scope;
const BASE = body.dataset.base || '/';
const $ = (id: string): any => document.getElementById(id);
const has = (id: string) => !!document.getElementById(id);
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---- tooltip (works before data loads) ----
const tip = $('tip');
let touchTip = false;
function placeTip(t: HTMLElement, cx: number, cy: number) {
  tip.textContent = t.dataset.tip!; tip.style.display = 'block';
  const x = Math.max(8, Math.min(cx + 14, innerWidth - tip.offsetWidth - 8));
  const y = cy + 16 + tip.offsetHeight > innerHeight ? cy - tip.offsetHeight - 12 : cy + 16;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
// touch screens have no hover: a tap shows the tooltip, a tap elsewhere hides it
document.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType !== 'touch') { touchTip = false; return; }
  const t = (ev.target as Element).closest?.('[data-tip]') as HTMLElement | null;
  touchTip = !!t;
  if (t) placeTip(t, ev.clientX, ev.clientY); else tip.style.display = 'none';
});
addEventListener('scroll', () => { if (touchTip) { tip.style.display = 'none'; touchTip = false; } }, { passive: true });
document.addEventListener('mousemove', (ev) => {
  if (touchTip) return;
  const t = (ev.target as Element).closest?.('[data-tip]') as HTMLElement | null;
  if (!t) { tip.style.display = 'none'; return; }
  tip.textContent = t.dataset.tip!; tip.style.display = 'block';
  const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8);
  const y = ev.clientY + 16 + tip.offsetHeight > innerHeight ? ev.clientY - tip.offsetHeight - 12 : ev.clientY + 16;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});

async function main() {
  const D: Payload = await (await fetch(`${BASE}data/site.json?v=${body.dataset.vdata}`)).json();
  const ctx = makeContext(D);
  const { NC, MONTHS, LAST, YEAR_FROM, GCH, NCROSS, akey, AIDX } = ctx;
  const CH = D.channels;
  const SCOPE_CH = SCOPE === 'channel' ? CH.findIndex((c) => c.slug === body.dataset.channel) : undefined;
  const SCOPE_A = SCOPE === 'donor' ? AIDX.get(body.dataset.donor || '') : undefined;
  const partial = (ym: string) => (ym === D.since.slice(0, 7) && D.since.slice(8) !== '01') || ym === D.until.slice(0, 7);
  const donorHref = (a: number) => ((GCH.get(a)?.size ?? 0) > 1 && D.authors[a][1] ? `${BASE}donor/${D.authors[a][1]}/` : '');
  const chanHref = (c: number) => `${BASE}channel/${CH[c].slug}/`;
  const nameLink = (a: number) => {
    const [n, id] = D.authors[a], h = donorHref(a);
    const yt = id ? `<a class="yt" href="https://www.youtube.com/channel/${id}" target="_blank" rel="noopener" title="YouTube channel">↗</a>` : '';
    return (h ? `<a class="inlink" href="${h}">${esc(n)}</a>` : esc(n)) + yt;
  };

  // ---- filter state, kept in the URL hash ----
  const F: Filter = { msg: '', title: '', from: YEAR_FROM, to: LAST, who: new Set(), whoMode: 'only', gifts: false, ch: SCOPE_CH };
  if (SCOPE === 'donor' && SCOPE_A !== undefined) F.who = new Set([SCOPE_A]);
  const who = () => F.who as Set<number>;
  const pv = (p: Person, c: number) => p.usd[c] + (F.gifts ? p.gifts[c] * CH[c].price : 0);
  const focus = () => who().size > 0 && F.whoMode === 'only';
  const selName = () => (who().size === 1 ? esc(D.authors[[...who()][0]][0]) : `the ${who().size} selected people`);
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    F.msg = h.get('msg') || ''; F.title = h.get('title') || '';
    F.from = MONTHS.includes(h.get('from') || '') ? h.get('from')! : YEAR_FROM;
    F.to = MONTHS.includes(h.get('to') || '') ? h.get('to')! : LAST;
    F.gifts = h.get('gifts') === '1';
    if (SCOPE !== 'donor') {
      F.who = new Set((h.get('who') || '').split(',').map((k) => AIDX.get(k)).filter((a): a is number => a !== undefined));
      F.whoMode = h.get('whomode') === 'hide' ? 'hide' : 'only';
    }
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (F.msg) h.set('msg', F.msg);
    if (F.title) h.set('title', F.title);
    if (F.from !== YEAR_FROM) h.set('from', F.from);
    if (F.to !== LAST) h.set('to', F.to);
    if (F.gifts) h.set('gifts', '1');
    if (SCOPE !== 'donor' && who().size) { h.set('who', [...who()].map(akey).join(',')); if (F.whoMode === 'hide') h.set('whomode', 'hide'); }
    const s = h.toString();
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  // ---- all-time numbers for the headlines ----
  const ALL = aggregate(ctx, allTime(ctx));
  const ALLC = SCOPE_CH !== undefined ? aggregate(ctx, allTime(ctx, { ch: SCOPE_CH })) : ALL;
  const ALLP = SCOPE_A !== undefined ? aggregate(ctx, allTime(ctx, { who: new Set([SCOPE_A]) })) : null;

  let A: Aggregate, AD: Aggregate, AX: Aggregate;
  const comboSel = new Set<string>(), chanSel = new Set<number>();
  let onlySel = false, scShown = 200, scCrossOnly = false, dCrossOnly = false;
  const dState = { k: 'total', dir: -1 }, cState = { k: 'n', dir: -1 }, chState = { k: 'usd', dir: -1 }, sState = { k: 'date', dir: -1 }, scState = { k: 'date', dir: -1 };

  // ---- generic sortable table ----
  interface Col<T> { id?: string; label: string; k?: string; num?: number; v?: (r: T) => number | string; title?: string; fixed?: number; off?: number; hidden?: boolean }
  function sortable<T>(table: any, cols: Col<T>[], rows: T[], state: { k: string; dir: number }, rowHtml: (r: T, vis: Col<T>[], i: number) => string, after: () => void) {
    const vis = cols.filter((c) => !c.hidden);
    table.tHead.innerHTML = '<tr>' + vis.map((c) => `<th${c.k ? ` data-k="${c.k}"` : ''}${c.num ? ' class="num"' : ''}${c.k === state.k ? ` aria-sort="${state.dir > 0 ? 'ascending' : 'descending'}"` : ''}${c.title ? ` title="${esc(c.title)}"` : ''}>${c.label}</th>`).join('') + '</tr>';
    const col = cols.find((c) => c.k === state.k);
    if (col?.v) rows.sort((a, b) => { const x = col.v!(a), y = col.v!(b); return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * state.dir; });
    table.tBodies[0].innerHTML = rows.map((r, i) => rowHtml(r, vis, i)).join('');
    table.tHead.onclick = (ev: Event) => {
      const th = (ev.target as Element).closest('th[data-k]') as HTMLElement | null; if (!th) return;
      const k = th.dataset.k!, c = cols.find((c) => c.k === k)!;
      state.dir = state.k === k ? -state.dir : c.num ? -1 : 1; state.k = k; after();
    };
  }

  // ---- icon arrays (overview and channel pages, all-time) ----
  const PERSON = 'M5 0.6a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM1.2 10.4v-2.6q0-2.4 2.4-2.4h2.8q2.4 0 2.4 2.4v2.6z';
  function iconArray(on: number, kind: 'person' | 'square') {
    let g = '';
    for (let i = 0; i < 100; i++) {
      const r = Math.floor(i / 10), c = i % 10, cls = i < on ? 'on' : 'off';
      g += kind === 'person'
        ? `<path class="${cls}" transform="translate(${c * 12 + 1},${r * 12 + 0.5})" d="${PERSON}"/>`
        : `<rect class="${cls}" x="${c * 12 + 1}" y="${r * 12 + 1}" width="10" height="10" rx="1.5"/>`;
    }
    return `<svg viewBox="0 0 121 121" role="img">${g}</svg>`;
  }
  function renderArrays() {
    if (!has('arrays')) return;
    const agg = SCOPE === 'channel' ? ALLC : ALL, payers = agg.all.length, cp = agg.cross.length;
    const tot = agg.total, crossUsd = agg.cross.reduce((x, p) => x + p.usd.reduce((a, b) => a + b, 0), 0);
    const sp = Math.round((cp / payers) * 100), sd = Math.round((crossUsd / tot) * 100);
    const where = SCOPE === 'channel' ? ` on ${esc(CH[SCOPE_CH!].name)}` : '';
    $('arrays').innerHTML =
      `<div class="arr"><h3>Out of every 100 people who paid${where}</h3><div aria-label="${sp} of 100 people">${iconArray(sp, 'person')}</div><p><strong>${sp}</strong> gave on more than one channel, ${cp} of ${payers.toLocaleString()} people.</p></div>`
      + `<div class="arr"><h3>Out of every 100 superchat dollars${where}</h3><div aria-label="${sd} of 100 dollars">${iconArray(sd, 'square')}</div><p><strong>${sd}</strong> came from them, ${usd(crossUsd)} of ${usd(tot)}.</p></div>`;
  }

  // ---- filter summary ----
  function perChannel() {
    const parts = CH.map((ch, c) => {
      if (F.ch !== undefined && c !== F.ch) return null;
      const f = focus(), t = f ? AD.chan[c].usd : A.chan[c].usd; if (!t) return null;
      const cr = f ? A.chan[c].usd : A.cross.reduce((x, p) => x + pv(p, c), 0);
      if (f && !cr) return null;
      return `<strong>${pct(cr / t)}</strong> of ${possessive(esc(ch.name))} ${usd(t)}`;
    }).filter(Boolean) as string[];
    return parts.length > 1 ? ` By channel, ${focus() ? 'they' : 'cross-channel donors'} gave ${listJoin(parts)}.` : '';
  }
  function renderSummary() {
    if (!has('fsummary')) return;
    const parts: string[] = [];
    if (F.msg) parts.push(`messages containing "${esc(F.msg)}"`);
    if (F.title) parts.push(`streams with "${esc(F.title)}" in the title`);
    if (SCOPE !== 'donor' && who().size && F.whoMode === 'hide') parts.unshift(`without ${selName()}`);
    if (F.gifts) parts.push('gifted memberships counted at their estimated price');
    if (has('whobox')) {
      $('whobox').hidden = !who().size; $('clearwho').textContent = `Clear selection (${who().size})`;
      document.querySelectorAll('#whomode button').forEach((b: any) => b.setAttribute('aria-pressed', b.dataset.m === F.whoMode));
    }
    parts.push(F.from === YEAR_FROM && F.to === LAST ? `the past year, ${mlabel(F.from)} to ${mlabel(F.to)}` : F.from === MONTHS[0] && F.to === LAST ? 'all time' : `${mlabel(F.from)} to ${mlabel(F.to)}`);
    const lead = `Showing ${parts.join(', ')}.`;
    if (has('ftoggle')) $('ftoggle').textContent = `Filters: ${parts.join(', ').replace(/<[^>]+>/g, '')}`;
    if (SCOPE === 'donor') {
      $('fsummary').innerHTML = `${lead} ${selName()} sent <strong>${usd(A.total)}</strong> in ${A.nsel.toLocaleString()} superchats, which is <strong>${pct(AD.total ? A.total / AD.total : 0)}</strong> of the ${usd(AD.total)} in superchats on these streams.${perChannel()}`;
    } else if (focus()) {
      const n = selName();
      $('fsummary').innerHTML = `${lead} ${n.charAt(0).toUpperCase() + n.slice(1)} sent <strong>${usd(A.total)}</strong> in ${A.nsel.toLocaleString()} superchats, which is <strong>${pct(AD.total ? A.total / AD.total : 0)}</strong> of the ${usd(AD.total)} in this filter.${perChannel()}`;
    } else {
      $('fsummary').innerHTML = `${lead} That's <strong>${usd(A.total)}</strong> in ${A.nsel.toLocaleString()} superchats, and <strong>${pct(A.total ? A.crossUsd / A.total : 0)}</strong> of it, ${usd(A.crossUsd)}, came from ${A.cross.length} cross-channel donors.${perChannel()}`;
    }
  }

  // ---- download what a table currently shows ----
  function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
    const cell = (v: string | number) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
    const a = document.createElement('a');
    // the byte-order mark makes Excel read the file as UTF-8
    a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fileTag = () => [SCOPE === 'channel' ? CH[SCOPE_CH!].slug : SCOPE === 'donor' ? D.authors[SCOPE_A!][0].replace(/[^\w-]+/g, '') : 'all', F.from, F.to].join('_');
  const scRow = (r: (typeof D.sc)[number]) => { const s = D.streams[r[0]]; return [s[2], CH[s[1]].name, r[3], r[2], D.authors[r[1]][0], D.authors[r[1]][1], r[5], s[3], `https://youtu.be/${s[0]}?t=${r[4]}`]; };
  const scHeader = ['date', 'channel', 'amount', 'usd', 'author', 'author_channel_id', 'message', 'stream', 'link'];
  let donorRowsShown: Person[] = [], scRowsShown: (typeof D.sc)[number][] = [];

  // ---- missing chat data, per channel and month ----
  const MISS = CH.map(() => new Map<string, { n: number; r: Record<string, number>; t: string[] }>()), UNDATED = CH.map(() => 0);
  for (const [c, d, r, t] of D.missing) {
    if (!d) { UNDATED[c]++; continue; }
    const m = d.slice(0, 7), x = MISS[c].get(m) || { n: 0, r: {}, t: [] };
    x.n++; x.r[r] = (x.r[r] || 0) + 1; x.t.push(t); MISS[c].set(m, x);
  }
  const COVER = CH.map((_, c) => new Set(D.streams.filter((s) => s[1] === c).map((s) => s[2].slice(0, 7))));
  function missText(c: number, m: string) {
    const x = MISS[c].get(m); if (!x) return '';
    const why = Object.entries(x.r).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
    const eg = x.t.slice(0, 2).map((t) => '"' + (t.length > 48 ? t.slice(0, 47) + '…' : t) + '"').join(', ');
    return `${x.n} stream${x.n > 1 ? 's' : ''} without readable chat: ${why}.\nFor example ${eg}${x.n > 2 ? ` and ${x.n - 2} more` : ''}.`;
  }
  function monthTip(c: number, m: string, b: { cross: number; other: number; n: number }, t: number) {
    const miss = missText(c, m), cov = COVER[c].has(m);
    if (!cov) return miss ? 'No readable chat this month.\n' + esc(miss) : UNDATED[c] ? `No readable chat this month. ${UNDATED[c]} of this channel's streams without chat data have no known date yet.` : 'No streams this month.';
    const lines = `${usd(t)} in ${b.n} superchats\n${usd(b.cross)} from ${focus() ? selName() : 'cross-channel donors'}${t ? ' (' + pct(b.cross / t) + ')' : ''}\n${usd(b.other)} from everyone else`;
    return miss ? lines + '\nAlso ' + esc(miss.charAt(0).toLowerCase() + miss.slice(1)) : lines;
  }

  // ---- monthly small multiples ----
  const rp = (x: number, y0: number, y1: number, w: number, round: boolean) => (round && y0 - y1 > 3 && w > 6
    ? `M${x},${y0}V${y1 + 3}q0,-3 3,-3h${w - 6}q3,0 3,3V${y0}Z`
    : `M${x},${y0}V${y1}h${w}V${y0}Z`);
  const nice = (m: number) => { const p = Math.pow(10, Math.floor(Math.log10(m))); for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= m) return f * p; return 10 * p; };
  function renderMonthly() {
    if (!has('multiples')) return;
    const indep = has('indep') && $('indep').checked;
    const tot = (b: { cross: number; other: number }) => b.cross + b.other;
    const i0 = MONTHS.indexOf(F.from), i1 = MONTHS.indexOf(F.to), VM = MONTHS.slice(i0, i1 + 1);
    const VMON = focus()
      ? A.monthly.map((r, c) => r.slice(i0, i1 + 1).map((b, i) => { const all = AD.monthly[c][i0 + i], sel = b.cross + b.other; return { cross: sel, other: Math.max(0, all.cross + all.other - sel), n: all.n }; }))
      : A.monthly.map((r) => r.slice(i0, i1 + 1));
    const panels = SCOPE === 'channel' ? [SCOPE_CH!] : SCOPE === 'donor' && ALLP?.all[0] ? ALLP.all[0].chs : CH.map((_, c) => c);
    const one = panels.length === 1;
    $('multiples').classList.toggle('one', one);
    const WHO = focus() ? selName() : 'cross-channel donors';
    const gmax = Math.max(1, ...panels.flatMap((c) => VMON[c].map(tot)));
    const W = one ? 1040 : 520, H = one ? 230 : 170, L = 44, R = 6, T = 8, B = 22, iw = W - L - R, ih = H - T - B;
    const n = VM.length, bw = iw / n, gap = Math.max(2, bw * 0.25);
    $('multiples').innerHTML = panels.map((c) => {
      const ch = CH[c], rows = VMON[c];
      const top = nice(indep ? Math.max(1, ...rows.map(tot)) : gmax), step = top / 4;
      const y = (v: number) => T + ih - (v / top) * ih;
      let g = `<defs><pattern id="hatch${c}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" class="hatch"/></pattern></defs>`;
      VM.forEach((m, i) => {
        const miss = MISS[c].has(m), cov = COVER[c].has(m), x = L + i * bw;
        if (miss && !cov) g += `<rect class="hzbg" x="${x}" y="${T}" width="${bw + 0.5}" height="${ih}"/><rect class="hz" x="${x}" y="${T}" width="${bw + 0.5}" height="${ih}" fill="url(#hatch${c})"/>`;
        else if (miss) g += `<rect class="hzbg" x="${x}" y="${T}" width="${bw + 0.5}" height="9"/><rect class="hz" x="${x}" y="${T}" width="${bw + 0.5}" height="9" fill="url(#hatch${c})"/>`;
      });
      for (let i = 0; i <= 4; i++) { const v = step * i, yy = y(v); g += `<line class="${i ? 'gl' : 'base'}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${v >= 1000 ? '$' + v / 1000 + 'k' : '$' + v}</text>`; }
      rows.forEach((b, i) => {
        const x = L + i * bw + gap / 2, w = bw - gap, yc = y(b.cross), yt = y(tot(b)), base = T + ih;
        if (b.cross > 0) g += `<path class="f${c}" d="${rp(x, base, yc, w, !(b.other > 0))}"/>`;
        if (b.other > 0) { const y0 = b.cross > 0 ? yc - 2 : base; if (y0 - yt > 0.5) g += `<path class="fn" d="${rp(x, y0, yt, w, true)}"/>`; }
        const m = VM[i], every = n <= 8 ? 1 : n <= 16 ? 2 : n <= 30 ? 3 : 6;
        if ((+m.slice(5) - 1) % every === 0) g += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${n > 16 ? (m.endsWith('-01') ? m.slice(0, 4) : MON[+m.slice(5) - 1]) : MON[+m.slice(5) - 1] + (m.endsWith('-01') || i === 0 ? ' ' + m.slice(2, 4) : '')}</text>`;
        g += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" data-tip="${esc(ch.name)}, ${mlabel(m)}${partial(m) ? ' (part of the month)' : ''}\n${monthTip(c, m, b, tot(b))}"/>`;
      });
      const sum = rows.reduce((x, b) => x + tot(b), 0), cs = rows.reduce((x, b) => x + b.cross, 0);
      const title = SCOPE === 'channel' ? esc(ch.name) : `<a class="inlink" href="${chanHref(c)}">${esc(ch.name)}</a>`;
      return `<div class="panel"><h3><span class="mark c${c}"></span>${title} <span class="small">${sum ? `${usd(sum)} · ${pct(cs / sum)} (${usd(cs)}) from ${WHO}` : 'no superchats in this filter'}</span></h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ch.name)} superchat dollars per month">${g}</svg></div>`;
    }).join('');
    const pm = [VM[0], VM[VM.length - 1]].filter(partial).map(mlabel);
    if (has('mnote')) $('mnote').textContent = (focus() ? `The colored part is ${SCOPE === 'donor' ? 'their' : 'the selected people\'s'} superchats and grey is everyone else. ` : '')
      + (one ? '' : indep ? 'Each panel has its own scale, so compare shapes, not heights.' : 'All panels share one scale.')
      + (pm.length ? ` ${pm.join(' and ')} ${pm.length > 1 ? 'are part months' : 'is a part month'}.` : '');
  }

  // ---- share of each channel's money (overview, donor pages) ----
  function renderShare() {
    if (!has('share')) return;
    const f = focus();
    if (has('sharetitle')) $('sharetitle').textContent = f ? `How much of each channel's money comes from ${who().size === 1 ? D.authors[[...who()][0]][0] : 'the selected people'}` : "How much of each channel's money comes from shared donors";
    if (has('sharenote')) $('sharenote').textContent = f ? `Share of each channel's superchat dollars in this filter sent by ${who().size === 1 ? 'them' : 'the ' + who().size + ' selected people'}.` : 'Share of the channel\'s superchat dollars sent by people who also donated on at least one of the other channels.';
    $('share').innerHTML = CH.map((ch, c) => {
      const tot = f ? AD.chan[c].usd : A.chan[c].usd, cr = f ? A.chan[c].usd : A.cross.reduce((x, p) => x + pv(p, c), 0);
      const n = f ? A.chan[c].payers.size : A.cross.filter((p) => p.chs.includes(c)).length, s = tot ? cr / tot : 0;
      const whom = f ? `${n} of ${selName()}` : `${n} people who also give on another of these channels`;
      return `<div class="srow" data-tip="${esc(ch.name)}: ${usd(cr)} of ${usd(tot)} came from ${whom}"><div><a class="inlink" href="${chanHref(c)}">${esc(ch.name)}</a></div><div class="strack"><div class="sbar c${c}" style="width:${(s * 100).toFixed(1)}%"></div></div><div class="num">${tot ? pct(s) : '–'} <span class="dim">· ${usd(cr)} of ${usd(tot)}</span></div></div>`;
    }).join('');
  }

  // ---- channel page: where this channel's cross-channel donors also give ----
  function renderAlso() {
    if (!has('also') || SCOPE_CH === undefined) return;
    const c = SCOPE_CH, ids = new Set(A.cross.map((p) => p.a));
    const people = AX.all.filter((p) => ids.has(p.a));
    const rows = CH.map((ch, o) => ({ o, usd: people.reduce((x, p) => x + pv(p, o), 0), n: people.filter((p) => p.usd[o] > 0 || p.gifts[o] > 0).length }));
    const mx = Math.max(1, ...rows.map((r) => r.usd));
    $('also').innerHTML = rows.map((r) => `<div class="srow" data-tip="${r.n} of them gave ${usd(r.usd)} on ${esc(CH[r.o].name)}"><div>${r.o === c ? `${esc(CH[r.o].name)} <span class="dim">(this channel)</span>` : `<a class="inlink" href="${chanHref(r.o)}">${esc(CH[r.o].name)}</a>`}</div><div class="strack"><div class="sbar c${r.o}" style="width:${((r.usd / mx) * 100).toFixed(1)}%"></div></div><div class="num">${usd(r.usd)} <span class="dim">· ${r.n} people</span></div></div>`).join('');
    if (has('alsonote')) $('alsonote').textContent = `What the ${ids.size} cross-channel donors who gave on ${CH[c].name} in this filter sent on every channel over the same months, on one shared scale.`;
  }

  // ---- regulars histograms ----
  function histogram(title: string, bins: string[], cross: number[], single: number[], unit: string) {
    const W = 520, H = 190, L = 40, R = 6, T = 10, B = 34, iw = W - L - R, ih = H - T - B;
    const nc = cross.reduce((x, y) => x + y, 0), ns = single.reduce((x, y) => x + y, 0);
    const pc = cross.map((v) => (nc ? v / nc : 0)), ps = single.map((v) => (ns ? v / ns : 0));
    const mx = Math.max(0.01, ...pc, ...ps), step = [0.05, 0.1, 0.2, 0.25].find((st) => Math.ceil(mx / st) <= 5) || 0.25, nt = Math.ceil(mx / step), top = nt * step;
    const y = (v: number) => T + ih - (v / top) * ih, bw = iw / bins.length, w = Math.min(22, (bw - 10) / 2);
    let g = '';
    for (let i = 0; i <= nt; i++) { const v = step * i, yy = y(v); g += `<line class="${i ? 'gl' : 'base'}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`; }
    bins.forEach((b, i) => {
      const cx = L + i * bw + bw / 2;
      if (pc[i] > 0) g += `<path class="fon" d="${rp(cx - w - 1, T + ih, y(pc[i]), w, true)}"/>`;
      if (ps[i] > 0) g += `<path class="foff" d="${rp(cx + 1, T + ih, y(ps[i]), w, true)}"/>`;
      g += `<text x="${cx}" y="${H - 18}" text-anchor="middle">${b}</text>`;
      g += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" data-tip="${esc(title)}: ${esc(b)}\nCross-channel donors: ${pct(pc[i])} (${cross[i]} ${unit})\nOne channel only: ${pct(ps[i])} (${single[i]} ${unit})"/>`;
    });
    return `<div class="panel"><h3>${esc(title)}</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg></div>`;
  }
  function renderRegulars() {
    if (!has('hists')) return;
    const payers = AD.all.filter((p) => p.npaid > 0), cross = payers.filter((p) => p.chs.length > 1), single = payers.filter((p) => p.chs.length === 1);
    const cBins = ['1', '2–4', '5–9', '10–19', '20–49', '50+'], cEdge = [2, 5, 10, 20, 50, Infinity];
    const sBins = ['~$1', '$2–4', '$5–9', '$10–19', '$20–49', '$50–99', '$100+'], sEdge = [1.95, 4.95, 9.95, 19.95, 49.95, 99.95, Infinity];
    const count = <T,>(list: T[], f: (x: T) => number, edges: number[]) => { const out = edges.map(() => 0); list.forEach((x) => out[edges.findIndex((e) => f(x) < e)]++); return out; };
    const sizes = (list: Person[]) => list.flatMap((p) => p.msgs.map((r) => r[2]));
    $('hkey').innerHTML = `<span><i class="sw on"></i>Cross-channel donors (${cross.length})</span><span><i class="sw off"></i>One channel only (${single.length})</span>`;
    $('hists').innerHTML = histogram('Superchats per person', cBins, count(cross, (p) => p.npaid, cEdge), count(single, (p) => p.npaid, cEdge), 'people')
      + histogram('Size of each superchat', sBins, count(sizes(cross), (v) => v, sEdge), count(sizes(single), (v) => v, sEdge), 'superchats');
  }

  // ---- channel combinations ----
  function renderCombos() {
    if (!has('combos')) return;
    const m = new Map<string, { k: string; chs: number[]; n: number; usd: number }>();
    for (const p of A.cross) { const k = p.chs.join(','); const v = m.get(k) || { k, chs: p.chs, n: 0, usd: 0 }; v.n++; v.usd += p.total; m.set(k, v); }
    const rows = [...m.values()];
    const mn = Math.max(1, ...rows.map((r) => r.n)), mu = Math.max(1, ...rows.map((r) => r.usd));
    type R = (typeof rows)[number];
    const cols: Col<R>[] = [{ label: '✓', k: 'sel', num: 1, v: (r) => (comboSel.has(r.k) ? 1 : 0), title: 'Tick combinations to list those people in the donor list' } as Col<R>]
      .concat(CH.map((ch, c) => ({ label: `<span class="dothead c${c}"></span>${esc(ch.name)}`, k: 'c' + c, v: (r: R) => (r.chs.includes(c) ? 0 : 1) })))
      .concat([{ label: 'People', k: 'n', num: 1, v: (r) => r.n }, { label: '' }, { label: 'Sent', k: 'usd', num: 1, v: (r) => r.usd }, { label: '' }]);
    sortable($('combos'), cols, rows, cState, (r) =>
      `<tr class="combo${comboSel.has(r.k) ? ' sel' : ''}" data-combo="${r.k}" title="Show these people in the donor list">`
      + `<td class="pickc"><input type="checkbox" class="pick" aria-label="Show this combination in the donor list"${comboSel.has(r.k) ? ' checked' : ''}></td>`
      + CH.map((_, c) => `<td class="dotcol"><span class="dot ${r.chs.includes(c) ? 'c' + c : 'off'}"></span></td>`).join('')
      + `<td class="num">${r.n}</td><td class="barcell"><div class="hbar" style="width:${(r.n / mn) * 100}%"></div></td><td class="num">${usd(r.usd)}</td><td class="barcell"><div class="hbar" style="width:${(r.usd / mu) * 100}%"></div></td></tr>`,
    renderCombos);
    [...$('combos').tHead.rows[0].cells].slice(1, NC + 1).forEach((th: any) => th.classList.add('dotcol'));
  }

  // ---- donor table ----
  const DCOLS: Col<Person>[] = [
    { id: 'pick', label: '✓', k: 'sel', num: 1, v: (p) => (who().has(p.a) ? 1 : 0), fixed: 1, title: 'Select people to compare them with everyone else' },
    { id: 'rank', label: '#', fixed: 1 },
    { id: 'who', label: 'Account', k: 'name', v: (p) => D.authors[p.a][0].toLowerCase(), fixed: 1 },
    { id: 'chs', label: 'Channels', k: 'nch', v: (p) => p.chs.length },
    { id: 'active', label: 'Active', k: 'first', v: (p) => p.first, title: 'First and last stream they paid on, and a tick for each stream' },
    { id: 'span', label: 'Days', k: 'span', num: 1, v: (p) => (Date.parse(p.last) - Date.parse(p.first)) / 864e5, title: 'Days between first and last donation', off: 1 },
    { id: 'bar', label: 'Superchats by channel' },
    { id: 'total', label: 'Sent', title: 'Superchats; with gifts counted, plus their estimated gift value (*)', k: 'total', num: 1, v: (p) => p.total },
    { id: 'paid', label: 'Msgs', k: 'paid', num: 1, v: (p) => p.npaid },
    { id: 'streams', label: 'Streams', k: 'streams', num: 1, v: (p) => p.streams.size, off: 1 },
    { id: 'avg', label: 'Avg', k: 'avg', num: 1, v: (p) => (p.npaid ? p.total / p.npaid : 0), title: 'Average superchat', off: 1 },
    { id: 'gifts', label: 'Gifts (est.)', k: 'gift', num: 1, v: (p) => p.giftEst },
    { id: 'open', label: '', fixed: 1 },
  ];
  // narrow screens start without the wide timeline and bar columns; any choice in the Columns menu is remembered
  const hiddenCols = new Set<string>(JSON.parse(store.get('ts-hidden') || 'null') || DCOLS.filter((c) => c.off || (innerWidth < 700 && (c.id === 'active' || c.id === 'bar'))).map((c) => c.id!));
  function buildColMenu() {
    if (!has('colmenu')) return;
    $('colmenu').innerHTML = DCOLS.filter((c) => !c.fixed).map((c) => `<label><input type="checkbox" data-col="${c.id}"${hiddenCols.has(c.id!) ? '' : ' checked'}> ${c.label}</label>`).join('');
    $('colmenu').onchange = (ev: any) => { const id = ev.target.dataset.col; ev.target.checked ? hiddenCols.delete(id) : hiddenCols.add(id); store.set('ts-hidden', JSON.stringify([...hiddenCols])); renderDonors(); };
  }
  function strip(p: Person) {
    const t0 = Date.parse(F.from + '-01'), e = new Date(Date.parse(F.to + '-01')); e.setUTCMonth(e.getUTCMonth() + 1); const t1 = e.getTime();
    const seen = new Set<number>(); let ticks = '';
    for (const r of p.msgs) {
      if (seen.has(r[0])) continue; seen.add(r[0]);
      const s = D.streams[r[0]], x = 1 + ((Date.parse(s[2]) - t0) / (t1 - t0)) * 126;
      ticks += `<rect class="f${s[1]}" x="${x.toFixed(1)}" y="2" width="2" height="10"/>`;
    }
    return `<svg viewBox="0 0 130 14" aria-hidden="true"><line class="track" x1="0" x2="130" y1="7" y2="7"/>${ticks}</svg>`;
  }
  function renderDonors() {
    if (!has('donors')) return;
    const q = $('q').value.toLowerCase().trim();
    // channel pages list everyone who paid there; the overview lists cross-channel donors
    const pool = SCOPE === 'channel' && !dCrossOnly ? AD.all : AD.cross;
    const rows = pool.filter((p) => (!onlySel || who().has(p.a)) && (!q || D.authors[p.a][0].toLowerCase().includes(q))
      && [...chanSel].every((c) => p.chs.includes(c)) && (!comboSel.size || comboSel.has(p.chs.join(','))));
    const mx = Math.max(1, ...pool.map((p) => p.usd.reduce((x, y) => x + y, 0) + p.giftEst));
    const cols = DCOLS.map((c) => ({ ...c, hidden: hiddenCols.has(c.id!) && !c.fixed }));
    const cell: Record<string, (p: Person, i: number) => string> = {
      pick: (p) => `<td class="pickc"><input type="checkbox" class="pick" aria-label="Select ${esc(D.authors[p.a][0])}"${who().has(p.a) ? ' checked' : ''}></td>`,
      rank: (_, i) => `<td class="rank">${i + 1}</td>`,
      who: (p) => `<td class="who">${nameLink(p.a)}</td>`,
      chs: (p) => `<td class="chips">${p.chs.map((c) => `<span class="mark c${c}" title="${esc(CH[c].name)}"></span>`).join('')}</td>`,
      active: (p) => `<td class="strip" data-tip="First: ${p.first}\nLast: ${p.last}\n${p.streams.size} streams"><div class="when">${p.first.slice(0, 7)} to ${p.last.slice(0, 7)}</div>${strip(p)}</td>`,
      span: (p) => `<td class="num">${Math.round((Date.parse(p.last) - Date.parse(p.first)) / 864e5)}</td>`,
      bar: (p) => `<td class="stack" data-tip="${esc(p.chs.map((c) => `${CH[c].name}: ${usd(p.usd[c], true)} in ${p.paid[c]} superchats${p.gifts[c] ? `, ${p.gifts[c]} gifted memberships (≈${usd(p.gifts[c] * CH[c].price)})` : ''}`).join('\n'))}"><div class="stackbar">${p.chs.flatMap((c) => [p.usd[c] > 0 ? `<div class="seg c${c}" style="width:${((p.usd[c] / mx) * 100).toFixed(2)}%"></div>` : '', p.gifts[c] ? `<div class="seg gift g${c}" style="width:${(((p.gifts[c] * CH[c].price) / mx) * 100).toFixed(2)}%"></div>` : '']).join('')}</div></td>`,
      total: (p) => `<td class="num">${usd(p.total)}${F.gifts && p.giftEst ? '<span class="dim">*</span>' : ''}</td>`,
      paid: (p) => `<td class="num dim">${p.npaid}</td>`,
      streams: (p) => `<td class="num dim">${p.streams.size}</td>`,
      avg: (p) => `<td class="num dim">${p.npaid ? usd(p.total / p.npaid, true) : ''}</td>`,
      gifts: (p) => `<td class="num dim">${p.giftN ? `${p.giftN} ≈${usd(p.giftEst)}` : ''}</td>`,
      open: () => `<td><button class="more" aria-expanded="false">Messages</button></td>`,
    };
    donorRowsShown = rows;
    sortable($('donors'), cols, rows, dState, (p, vis, i) => `<tr class="donor" data-a="${p.a}">${vis.map((c) => cell[c.id!](p, i)).join('')}</tr>`, renderDonors);
    $('donors').dataset.ncol = cols.filter((c) => !c.hidden).length;
    $('count').textContent = rows.length === pool.length ? '' : `Showing ${rows.length} of ${pool.length}`;
    if (has('dcross')) $('dcross').setAttribute('aria-pressed', dCrossOnly);
    if (has('onlysel')) { $('onlysel').hidden = !who().size && !onlySel; $('onlysel').setAttribute('aria-pressed', onlySel); }
    if (has('dtitle')) $('dtitle').textContent = SCOPE === 'channel'
      ? `${dCrossOnly ? `${AD.cross.length} cross-channel donors` : `All ${AD.all.length.toLocaleString()} donors`} on ${CH[SCOPE_CH!].name}${F.from === MONTHS[0] && F.to === LAST ? '' : ', in this filter'}`
      : AD.cross.length === NCROSS ? `All ${NCROSS} cross-channel donors` : `${AD.cross.length} of the ${NCROSS} cross-channel donors, in this filter`;
    const cb = $('clearcombo');
    if (cb) { cb.hidden = !comboSel.size; if (comboSel.size) cb.textContent = (comboSel.size === 1 ? 'Only ' + [...comboSel][0].split(',').map((c) => CH[+c].name).join(' + ') : `${comboSel.size} combinations`) + ' ✕'; }
  }
  const msgRow = (r: (typeof D.sc)[number]) => {
    const s = D.streams[r[0]];
    return `<div class="msg"><span class="mark c${s[1]}" title="${esc(CH[s[1]].name)}"></span><span class="num" style="text-align:left">${esc(r[3])}</span><a class="t" href="https://youtu.be/${s[0]}?t=${r[4]}" target="_blank" rel="noopener" title="${esc(s[3])}">${s[2]} · ${hms(r[4])}</a><span>${esc(r[5]) || '<span class="dim">no message</span>'}</span></div>`;
  };
  const byNewest = (x: (typeof D.sc)[number], y: (typeof D.sc)[number]) => D.streams[y[0]][2].localeCompare(D.streams[x[0]][2]) || y[4] - x[4];

  // ---- streams table (channel and donor pages) ----
  function renderStreams() {
    if (!has('streamsT')) return;
    type R = { i: number; date: string; c: number; title: string; usd: number; n: number; cross: number; gifts: number; mine: number; mineN: number };
    const mineBy = new Map<number, { usd: number; n: number }>();
    if (SCOPE === 'donor') for (const p of A.all) for (const r of p.msgs) { const x = mineBy.get(r[0]) || { usd: 0, n: 0 }; x.usd += r[2]; x.n++; mineBy.set(r[0], x); }
    const src = SCOPE === 'donor' ? AD : A;
    const ids = SCOPE === 'donor' ? [...mineBy.keys()] : [...src.perStream.keys()];
    const rows: R[] = ids.map((i) => {
      const s = D.streams[i], ps = src.perStream.get(i) || { usd: 0, n: 0, cross: 0, gifts: 0 }, me = mineBy.get(i) || { usd: 0, n: 0 };
      return { i, date: s[2], c: s[1], title: s[3], usd: ps.usd, n: ps.n, cross: ps.cross, gifts: ps.gifts, mine: me.usd, mineN: me.n };
    });
    const cols: Col<R>[] = [
      { label: 'Date', k: 'date', v: (r) => r.date },
      ...(SCOPE === 'donor' ? [{ label: 'Channel', k: 'ch', v: (r: R) => CH[r.c].name }] : []),
      { label: 'Stream', k: 'title', v: (r) => r.title.toLowerCase() },
      ...(SCOPE === 'donor'
        ? [{ label: 'They sent', k: 'mine', num: 1, v: (r: R) => r.mine }, { label: 'Msgs', k: 'mineN', num: 1, v: (r: R) => r.mineN }, { label: 'Share of stream', k: 'share', num: 1, v: (r: R) => (r.usd ? r.mine / r.usd : 0), title: 'Their part of all superchat dollars on that stream' }]
        : [{ label: 'Superchats', k: 'usd', num: 1, v: (r: R) => r.usd }, { label: 'Msgs', k: 'n', num: 1, v: (r: R) => r.n }, { label: 'From cross-channel', k: 'cross', num: 1, v: (r: R) => (r.usd ? r.cross / r.usd : 0) }, { label: 'Gifts', k: 'gifts', num: 1, v: (r: R) => r.gifts }]),
    ];
    sortable($('streamsT'), cols, rows, sState, (r) => {
      const s = D.streams[r.i];
      const link = `<a class="clamp2" href="https://youtu.be/${s[0]}" target="_blank" rel="noopener" title="${esc(r.title)}">${esc(r.title)}</a>`;
      return `<tr><td class="when">${r.date}</td>${SCOPE === 'donor' ? `<td class="cname"><span class="mark c${r.c}"></span> ${esc(CH[r.c].name)}</td>` : ''}<td>${link}</td>`
        + (SCOPE === 'donor'
          ? `<td class="num">${usd(r.mine, true)}</td><td class="num">${r.mineN}</td><td class="num">${r.usd ? pct(r.mine / r.usd) : ''}</td>`
          : `<td class="num">${usd(r.usd)}</td><td class="num">${r.n}</td><td class="num">${r.usd ? pct(r.cross / r.usd) : ''}</td><td class="num">${r.gifts || ''}</td>`) + '</tr>';
    }, renderStreams);
    if (has('streamsnote')) $('streamsnote').textContent = SCOPE === 'donor'
      ? `They sent superchats on ${rows.length} streams in this filter.`
      : `${rows.length} of ${A.chan[SCOPE_CH!].streams} streams in this filter had superchats or gifted memberships.`;
  }

  // ---- donor page: every message ----
  // ---- channel page: every superchat, from everyone ----
  function renderSuperchats() {
    if (!has('scT')) return;
    type R = { r: (typeof D.sc)[number]; date: string; cross: boolean };
    let rows: R[] = A.all.flatMap((p) => p.msgs.map((r) => ({ r, date: D.streams[r[0]][2], cross: p.chs.length > 1 })));
    if (scCrossOnly) rows = rows.filter((x) => x.cross);
    const total = rows.length;
    scRowsShown = rows.map((x) => x.r);
    const cols: Col<R>[] = [
      { label: 'Date', k: 'date', v: (x) => x.date + String(x.r[4]).padStart(6, '0') },
      { label: 'Amount', k: 'usd', num: 1, v: (x) => x.r[2], title: 'Sorted by US$ value' },
      { label: 'Who', k: 'who', v: (x) => D.authors[x.r[1]][0].toLowerCase() },
      { label: 'Message' },
      { label: 'In the stream', k: 'at', v: (x) => D.streams[x.r[0]][3].toLowerCase() },
    ];
    sortable($('scT'), cols, rows, scState, (x) => {
      const r = x.r, s = D.streams[r[0]];
      const usdNote = /^\$\d/.test(r[3]) ? '' : ` <span class="dim">≈${usd(r[2], true)}</span>`;
      const chips = x.cross ? ' ' + (GCH.get(r[1]) ? [...GCH.get(r[1])!].sort((a, b) => a - b).map((c) => `<span class="mark c${c}" title="Also gives on ${esc(CH[c].name)}"></span>`).join('') : '') : '';
      return `<tr><td class="when">${s[2]}</td><td class="num">${esc(r[3])}${usdNote}</td><td class="who">${nameLink(r[1])}<span class="chips">${chips}</span></td>`
        + `<td>${esc(r[5]) || '<span class="dim">no message</span>'}</td>`
        + `<td><a class="t" href="https://youtu.be/${s[0]}?t=${r[4]}" target="_blank" rel="noopener" title="${esc(s[3])}">${hms(r[4])}</a> <span class="dim">${esc(s[3].length > 46 ? s[3].slice(0, 45) + '…' : s[3])}</span></td></tr>`;
    }, () => { scShown = 200; renderSuperchats(); });
    const tb = $('scT').tBodies[0];
    [...tb.rows].slice(scShown).forEach((tr: any) => tr.remove());
    $('scmore').hidden = total <= scShown;
    $('scmore').textContent = `Show ${Math.min(200, total - scShown)} more`;
    $('sccount').textContent = `${Math.min(scShown, total).toLocaleString()} of ${total.toLocaleString()} superchats${scCrossOnly ? ' from cross-channel donors' : ''}, in this filter`;
    $('sccross').setAttribute('aria-pressed', scCrossOnly);
  }

  function renderMessages() {
    if (!has('msglist')) return;
    const list = A.all.flatMap((p) => p.msgs).sort(byNewest);
    $('msglist').innerHTML = list.map(msgRow).join('') || '<span class="dim">No superchats in this filter.</span>';
    if (has('msgcount')) $('msgcount').textContent = `${list.length} superchats`;
  }

  function renderChans() {
    if (!has('chans')) return;
    type R = { c: number; name: string; url: string; streams: number; missing: number; hours: number; usd: number; paid: number; payers: number; shared: number; crossUsd: number; share: number; gifts: number; giftEst: number; per: number };
    const rows: R[] = CH.map((ch, c) => {
      const x = A.chan[c], cr = A.cross.reduce((s, p) => s + pv(p, c), 0);
      return { c, name: ch.name, url: ch.url, streams: x.streams, missing: ch.missing, hours: x.hours, usd: x.usd, paid: x.paid, payers: x.payers.size,
        shared: A.cross.filter((p) => p.chs.includes(c)).length, crossUsd: cr, share: x.usd ? cr / x.usd : 0, gifts: x.gifts, giftEst: x.gifts * ch.price, per: x.streams ? x.usd / x.streams : 0 };
    });
    const cols: Col<R>[] = [
      { label: 'Channel', k: 'name', v: (r) => r.name }, { label: 'Streams', k: 'streams', num: 1, v: (r) => r.streams },
      { label: 'No chat data', k: 'missing', num: 1, v: (r) => r.missing, title: 'Streams without a usable chat replay (not filtered)' },
      { label: 'Hours', k: 'hours', num: 1, v: (r) => r.hours }, { label: 'Superchats', k: 'usd', num: 1, v: (r) => r.usd },
      { label: 'Per stream', k: 'per', num: 1, v: (r) => r.per }, { label: 'Msgs', k: 'paid', num: 1, v: (r) => r.paid },
      { label: 'Payers', k: 'payers', num: 1, v: (r) => r.payers }, { label: 'Shared payers', k: 'shared', num: 1, v: (r) => r.shared },
      { label: 'From cross-channel', k: 'crossUsd', num: 1, v: (r) => r.crossUsd, title: 'Superchat dollars from people who also donate on another of these channels' },
      { label: 'Cross-channel share', k: 'share', num: 1, v: (r) => r.share }, { label: 'Gifts', k: 'gifts', num: 1, v: (r) => r.gifts },
      { label: 'Gifts (est.)', k: 'giftEst', num: 1, v: (r) => r.giftEst },
    ];
    sortable($('chans'), cols, rows, chState, (r) => `<tr><td class="cname"><span class="mark c${r.c}"></span> <a href="${chanHref(r.c)}">${esc(r.name)}</a><a class="yt" href="${r.url}" target="_blank" rel="noopener" title="YouTube channel">↗</a></td><td class="num">${r.streams}</td><td class="num">${r.missing}</td><td class="num">${Math.round(r.hours).toLocaleString()}</td><td class="num">${usd(r.usd)}</td><td class="num">${usd(r.per)}</td><td class="num">${r.paid.toLocaleString()}</td><td class="num">${r.payers.toLocaleString()}</td><td class="num">${r.shared}</td><td class="num">${usd(r.crossUsd)}</td><td class="num">${pct(r.share)}</td><td class="num">${r.gifts}</td><td class="num">${usd(r.giftEst)}</td></tr>`, renderChans);
  }

  function renderAll() {
    A = aggregate(ctx, F);
    AD = SCOPE === 'donor' || who().size ? aggregate(ctx, { ...F, who: null }) : A;
    AX = SCOPE === 'channel' ? aggregate(ctx, { ...F, ch: undefined }) : A;
    for (const k of [...comboSel]) if (!AD.cross.some((p) => p.chs.join(',') === k)) comboSel.delete(k);
    renderSummary(); renderMonthly(); renderShare(); renderAlso(); renderRegulars(); renderCombos(); renderDonors(); renderStreams(); renderSuperchats(); renderMessages(); renderChans();
  }

  // ---- wire up ----
  if (has('ffrom')) for (const id of ['ffrom', 'fto']) $(id).innerHTML = MONTHS.map((m) => `<option value="${m}">${mlabel(m)}</option>`).join('');
  if (has('ctoggles')) {
    const visible = SCOPE === 'channel' ? CH.map((_, c) => c).filter((c) => c !== SCOPE_CH) : CH.map((_, c) => c);
    $('ctoggles').innerHTML = visible.map((c) => `<button type="button" class="toggle" data-c="${c}" aria-pressed="false" title="Only people who also gave on ${esc(CH[c].name)}"><span class="mark c${c}"></span>${esc(CH[c].name)}</button>`).join(' ');
    $('ctoggles').onclick = (ev: any) => { const b = ev.target.closest('.toggle'); if (!b) return; const c = +b.dataset.c; chanSel.has(c) ? chanSel.delete(c) : chanSel.add(c); b.setAttribute('aria-pressed', chanSel.has(c)); renderDonors(); };
  }
  if (has('combos')) $('combos').tBodies[0].addEventListener('click', (ev: any) => {
    const tr = ev.target.closest('tr.combo'); if (!tr) return;
    const k = tr.dataset.combo; comboSel.has(k) ? comboSel.delete(k) : comboSel.add(k); renderCombos(); renderDonors();
  });
  if (has('clearcombo')) $('clearcombo').onclick = () => { comboSel.clear(); renderCombos(); renderDonors(); };
  if (has('q')) $('q').addEventListener('input', renderDonors);
  if (has('dcsv')) $('dcsv').onclick = () => downloadCsv(`donors_${fileTag()}.csv`,
    ['name', 'channel_id', 'channels', 'superchat_usd', 'superchats', 'gifted_memberships', 'gift_usd_estimate', 'first', 'last', ...CH.map((c) => 'usd_' + c.slug)],
    donorRowsShown.map((p) => [D.authors[p.a][0], D.authors[p.a][1], p.chs.map((c) => CH[c].name).join('; '), p.usd.reduce((x, y) => x + y, 0).toFixed(2), p.npaid, p.giftN, p.giftEst.toFixed(2), p.first, p.last, ...p.usd.map((v) => v.toFixed(2))]));
  if (has('sccsv')) $('sccsv').onclick = () => downloadCsv(`superchats_${fileTag()}.csv`, scHeader, scRowsShown.map(scRow));
  if (has('msgcsv')) $('msgcsv').onclick = () => downloadCsv(`superchats_${fileTag()}.csv`, scHeader, A.all.flatMap((p) => p.msgs).sort(byNewest).map(scRow));
  if (has('dcross')) $('dcross').onclick = () => { dCrossOnly = !dCrossOnly; renderDonors(); };
  if (has('scT')) {
    $('scmore').onclick = () => { scShown += 200; renderSuperchats(); };
    $('sccross').onclick = () => { scCrossOnly = !scCrossOnly; scShown = 200; renderSuperchats(); };
  }
  if (has('indep')) $('indep').addEventListener('change', renderMonthly);
  if (has('donors')) {
    let lastPick: number | null = null;
    const tb = $('donors').tBodies[0];
    tb.addEventListener('click', (ev: any) => {
      const cb = ev.target.closest('.pick'); if (!cb) return;
      const a = +cb.closest('tr').dataset.a, on = cb.checked;
      const order = [...tb.querySelectorAll('tr.donor')].map((r: any) => +r.dataset.a);
      const i = order.indexOf(a), j = lastPick === null ? -1 : order.indexOf(lastPick);
      const range = ev.shiftKey && j >= 0 ? order.slice(Math.min(i, j), Math.max(i, j) + 1) : [a];
      range.forEach((x) => (on ? who().add(x) : who().delete(x)));
      lastPick = a;
      if (!who().size) onlySel = false;
      writeHash(); renderAll();
    });
    tb.addEventListener('click', (ev: any) => {
      const b = ev.target.closest('.more'); if (!b) return;
      const tr = b.closest('tr'), was = tr.classList.contains('open');
      tb.querySelectorAll('tr.msgs').forEach((r: any) => r.remove());
      tb.querySelectorAll('tr.open').forEach((r: any) => { r.classList.remove('open'); r.querySelector('.more').setAttribute('aria-expanded', 'false'); });
      if (was) return;
      const p = AD.all.find((p) => p.a === +tr.dataset.a)!;
      const r = document.createElement('tr'); r.className = 'msgs';
      r.innerHTML = `<td colspan="${$('donors').dataset.ncol}"><div class="msglist">${[...p.msgs].sort(byNewest).map(msgRow).join('') || '<span class="dim">Only gifted memberships in this filter.</span>'}</div></td>`;
      tr.after(r); tr.classList.add('open'); b.setAttribute('aria-expanded', 'true');
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onFilter = () => {
    F.msg = $('fmsg').value.trim(); F.title = $('ftitle').value.trim(); F.from = $('ffrom').value; F.to = $('fto').value;
    if (F.from > F.to) { [F.from, F.to] = [F.to, F.from]; $('ffrom').value = F.from; $('fto').value = F.to; }
    writeHash(); clearTimeout(timer); timer = setTimeout(renderAll, 150);
  };
  function syncInputs() { $('fgifts').checked = F.gifts; $('fmsg').value = F.msg; $('ftitle').value = F.title; $('ffrom').value = F.from; $('fto').value = F.to; }
  ['fmsg', 'ftitle'].forEach((id) => $(id).addEventListener('input', onFilter));
  ['ffrom', 'fto'].forEach((id) => $(id).addEventListener('change', onFilter));
  $('fgifts').addEventListener('change', () => { F.gifts = $('fgifts').checked; writeHash(); renderAll(); });
  $('fyear').onclick = () => { $('ffrom').value = YEAR_FROM; $('fto').value = LAST; onFilter(); };
  $('fall').onclick = () => { $('ffrom').value = MONTHS[0]; $('fto').value = LAST; onFilter(); };
  if (has('whomode')) $('whomode').onclick = (ev: any) => { const b = ev.target.closest('button[data-m]'); if (!b) return; F.whoMode = b.dataset.m; writeHash(); renderAll(); };
  if (has('clearwho')) $('clearwho').onclick = () => { who().clear(); F.whoMode = 'only'; onlySel = false; writeHash(); renderAll(); };
  if (has('onlysel')) $('onlysel').onclick = () => { onlySel = !onlySel; renderDonors(); };
  $('freset').onclick = () => {
    F.gifts = false; $('fgifts').checked = false;
    if (SCOPE !== 'donor') { who().clear(); onlySel = false; }
    $('fmsg').value = ''; $('ftitle').value = ''; $('ffrom').value = YEAR_FROM; $('fto').value = LAST; onFilter();
  };
  if (has('ftoggle')) $('ftoggle').onclick = () => { const f = document.querySelector('.filters')!; const open = f.classList.toggle('open'); $('ftoggle').setAttribute('aria-expanded', open); };
  window.addEventListener('hashchange', () => { readHash(); syncInputs(); renderAll(); });

  if (has('fxdate')) $('fxdate').textContent = D.fx;
  if (has('prices')) $('prices').textContent = listJoin(CH.map((c) => `$${c.price.toFixed(2)} for ${c.name}`));
  if (has('scope')) $('scope').textContent = `Livestreams from ${D.since} to ${D.until}, read from each stream's public chat replay. Amounts are what viewers paid, in US dollars, before YouTube's cut. ${D.missing.length} of the listed streams have no readable chat because they're members-only, age-restricted or have no chat replay. Hatched months in the charts show where they fall.`;
  if (has('foot')) $('foot').textContent = `Built ${D.built} from ${D.streams.length} streams and ${D.sc.length.toLocaleString()} superchats.`;
  readHash(); syncInputs(); buildColMenu(); renderArrays(); renderAll();
  document.querySelectorAll('.loading').forEach((el) => el.remove());
}

main().catch((e) => {
  console.error(e);
  const l = document.querySelector('.loading'); if (l) l.textContent = 'The data failed to load. Try reloading the page.';
});

