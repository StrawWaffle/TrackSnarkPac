// Everything that turns the raw rows into numbers. No DOM here, so Astro uses
// the same code at build time (page lists, static summaries) as the browser.
import type { Aggregate, ChannelTotals, Filter, MonthBin, Payload, Person } from './types';

export interface Context {
  D: Payload;
  NC: number;
  MONTHS: string[];
  LAST: string;
  YEAR_FROM: string;
  /** Channels each person gave on over the whole period. */
  GCH: Map<number, Set<number>>;
  NCROSS: number;
  /** Stable key for a person: YouTube channel id, or "n:" + name. */
  akey: (a: number) => string;
  AIDX: Map<string, number>;
}

export function makeContext(D: Payload): Context {
  const MONTHS: string[] = [];
  for (let y = +D.since.slice(0, 4), m = +D.since.slice(5, 7); ; ) {
    const ym = y + '-' + String(m).padStart(2, '0');
    MONTHS.push(ym);
    if (ym >= D.until.slice(0, 7)) break;
    if (++m > 12) { m = 1; y++; }
  }
  const LAST = MONTHS[MONTHS.length - 1];
  const YEAR_FROM = MONTHS.find((x) => x > +LAST.slice(0, 4) - 1 + '-' + LAST.slice(5)) || MONTHS[0];
  const GCH = new Map<number, Set<number>>();
  const add = (a: number, c: number) => { let x = GCH.get(a); if (!x) { x = new Set(); GCH.set(a, x); } x.add(c); };
  D.sc.forEach((r) => add(r[1], D.streams[r[0]][1]));
  D.gifts.forEach((g) => add(g[1], D.streams[g[0]][1]));
  const akey = (a: number) => D.authors[a][1] || 'n:' + D.authors[a][0];
  return {
    D, NC: D.channels.length, MONTHS, LAST, YEAR_FROM, GCH,
    NCROSS: [...GCH.values()].filter((x) => x.size > 1).length,
    akey, AIDX: new Map(D.authors.map((_, a) => [akey(a), a])),
  };
}

export const terms = (s: string) => s.toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
export const matches = (text: string, ts: string[]) => !ts.length || ts.some((t) => text.toLowerCase().includes(t));

export function allTime(ctx: Context, extra: Partial<Filter> = {}): Filter {
  return { msg: '', title: '', from: ctx.MONTHS[0], to: ctx.LAST, who: null, whoMode: 'only', gifts: false, ...extra };
}

/** All numbers for one filter. Cross-channel status comes from the whole period. */
export function aggregate(ctx: Context, f: Filter): Aggregate {
  const { D, NC, MONTHS, GCH } = ctx;
  const CH = D.channels;
  const mt = terms(f.msg), tt = terms(f.title);
  const okStream = D.streams.map((s) => {
    const ym = s[2].slice(0, 7);
    return ym >= f.from && ym <= f.to && matches(s[3], tt) && (f.ch === undefined || s[1] === f.ch);
  });
  const W = f.who && f.who.size ? f.who : null, hide = f.whoMode === 'hide';
  const skip = (a: number) => !!W && (hide ? W.has(a) : !W.has(a));
  const people = new Map<number, Person>();
  const P = (a: number): Person => {
    let p = people.get(a);
    if (!p) {
      p = { a, usd: Array(NC).fill(0), paid: Array(NC).fill(0), gifts: Array(NC).fill(0), msgs: [], streams: new Set(),
        first: '9999', last: '0000', chs: [], giftEst: 0, giftN: 0, npaid: 0, total: 0 };
      people.set(a, p);
    }
    return p;
  };
  const chan: ChannelTotals[] = CH.map(() => ({ usd: 0, paid: 0, payers: new Set<number>(), gifts: 0, streams: 0, hours: 0 }));
  const perStream: Aggregate['perStream'] = new Map();
  const PS = (i: number) => { let x = perStream.get(i); if (!x) { x = { usd: 0, n: 0, cross: 0, gifts: 0 }; perStream.set(i, x); } return x; };
  const sel: typeof D.sc = [];
  const giftRows: typeof D.gifts = [];
  D.streams.forEach((s, i) => { if (okStream[i]) { chan[s[1]].streams++; chan[s[1]].hours += s[4] / 3600; } });
  for (const r of D.sc) {
    if (!okStream[r[0]] || !matches(r[5], mt) || skip(r[1])) continue;
    const s = D.streams[r[0]], c = s[1], p = P(r[1]);
    p.usd[c] += r[2]; p.paid[c]++; p.msgs.push(r); p.streams.add(r[0]);
    if (s[2] < p.first) p.first = s[2];
    if (s[2] > p.last) p.last = s[2];
    chan[c].usd += r[2]; chan[c].paid++; chan[c].payers.add(r[1]); sel.push(r);
  }
  if (!mt.length) for (const g of D.gifts) {
    if (!okStream[g[0]] || skip(g[1])) continue;
    const s = D.streams[g[0]], c = s[1], p = P(g[1]);
    p.gifts[c] += g[2]; p.streams.add(g[0]); chan[c].gifts += g[2]; chan[c].payers.add(g[1]);
    PS(g[0]).gifts += g[2];
    if (f.gifts) { chan[c].usd += g[2] * CH[c].price; giftRows.push(g); }
    if (s[2] < p.first) p.first = s[2];
    if (s[2] > p.last) p.last = s[2];
  }
  const all = [...people.values()];
  for (const p of all) {
    p.chs = [...(GCH.get(p.a) ?? [])].sort((x, y) => x - y);
    p.giftEst = p.gifts.reduce((x, n, c) => x + n * CH[c].price, 0);
    p.total = p.usd.reduce((x, y) => x + y, 0) + (f.gifts ? p.giftEst : 0);
    p.giftN = p.gifts.reduce((x, y) => x + y, 0);
    p.npaid = p.paid.reduce((x, y) => x + y, 0);
  }
  const cross = all.filter((p) => p.chs.length > 1);
  const crossSet = new Set(cross.map((p) => p.a));
  const monthly: MonthBin[][] = CH.map(() => MONTHS.map(() => ({ cross: 0, other: 0, n: 0 })));
  for (const r of sel) {
    const s = D.streams[r[0]], mi = MONTHS.indexOf(s[2].slice(0, 7));
    const ps = PS(r[0]); ps.usd += r[2]; ps.n++; if (crossSet.has(r[1])) ps.cross += r[2];
    if (mi < 0) continue;
    const b = monthly[s[1]][mi]; b.n++;
    if (crossSet.has(r[1])) b.cross += r[2]; else b.other += r[2];
  }
  for (const g of giftRows) {
    const s = D.streams[g[0]], mi = MONTHS.indexOf(s[2].slice(0, 7));
    if (mi < 0) continue;
    const v = g[2] * CH[s[1]].price, b = monthly[s[1]][mi];
    if (crossSet.has(g[1])) b.cross += v; else b.other += v;
  }
  const total = chan.reduce((x, c) => x + c.usd, 0);
  const crossUsd = cross.reduce((x, p) => x + p.total, 0);
  return { all, cross, crossSet, chan, monthly, perStream, total, crossUsd, nsel: sel.length };
}

/** People who gave on two or more channels and have a YouTube channel id (they get a page). */
export function crossDonors(ctx: Context): { a: number; id: string; name: string }[] {
  return [...ctx.GCH.entries()]
    .filter(([a, chs]) => chs.size > 1 && ctx.D.authors[a][1])
    .map(([a]) => ({ a, id: ctx.D.authors[a][1], name: ctx.D.authors[a][0] }));
}

export function median(values: number[]): number {
  const v = [...values].sort((x, y) => x - y);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : 0;
}
