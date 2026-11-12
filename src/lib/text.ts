// Headline paragraphs for each page type. Used at build time, so the numbers
// are in the HTML before the data loads, and again in the browser.
import { aggregate, allTime, median, type Context } from './core';
import { esc, listJoin, mlabel, pct, possessive, usd } from './format';
import type { Aggregate } from './types';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** Numbers below ten as words, as in running text. */
export const numberWord = (n: number) => (n >= 0 && n < 10 ? WORDS[n] : n.toLocaleString('en-US'));

export interface Lede { lede: string; context: string }

export function ledeAll(ctx: Context, base: string, ALL: Aggregate = aggregate(ctx, allTime(ctx))): Lede {
  const { D, MONTHS } = ctx, CH = D.channels;
  const chan = (i: number) => `<a class="inlink" href="${base}channel/${CH[i].slug}/">${esc(CH[i].name)}</a>`;
  const gifts = ALL.cross.reduce((x, p) => x + p.giftEst, 0), allGifts = ALL.all.reduce((x, p) => x + p.giftEst, 0);
  const lede = `Since ${mlabel(MONTHS[0])}, <strong>${ALL.cross.length} people</strong> have paid for superchats on more than one of ${numberWord(CH.length)} political YouTube channels: ${listJoin(CH.map((_, i) => chan(i)))}. Together they sent <strong>${usd(ALL.crossUsd)}</strong>, which is ${pct(ALL.crossUsd / ALL.total)} of the ${usd(ALL.total)} in superchats on these streams. Their gifted memberships add about ${usd(gifts)} more. Counting gifts at their estimated price, cross-channel donors gave ${usd(ALL.crossUsd + gifts)} of ${usd(ALL.total + allGifts)}, or ${pct((ALL.crossUsd + gifts) / (ALL.total + allGifts))}.`;
  const payers = ALL.all.filter((p) => p.npaid > 0), cross = payers.filter((p) => p.chs.length > 1), single = payers.filter((p) => p.chs.length === 1);
  const heavy = payers.filter((p) => p.npaid >= 20), hc = heavy.filter((p) => p.chs.length > 1).length;
  const context = `Most of them are regulars. A typical cross-channel donor sent ${numberWord(median(cross.map((p) => p.npaid)))} superchats of around ${usd(median(cross.flatMap((p) => p.msgs.map((r) => r[2]))), true)}. Someone who gives on one channel only typically sent ${numberWord(median(single.map((p) => p.npaid)))}, of ${usd(median(single.flatMap((p) => p.msgs.map((r) => r[2]))), true)}. Of the ${heavy.length} people who sent 20 or more superchats, ${hc} gave on more than one channel.`;
  return { lede, context };
}

export function ledeChannel(ctx: Context, base: string, c: number, ALL: Aggregate = aggregate(ctx, allTime(ctx))): Lede {
  const { D } = ctx, CH = D.channels, ch = CH[c];
  const ALLC = aggregate(ctx, allTime(ctx, { ch: c }));
  const first = D.streams.find((s) => s[1] === c)?.[2] ?? D.since;
  const cr = ALLC.cross, crUsd = cr.reduce((x, p) => x + p.usd[c], 0);
  const byA = new Map(ALL.all.map((p) => [p.a, p]));
  const elsewhere = CH.map((_, o) => (o === c ? 0 : cr.reduce((x, p) => x + (byA.get(p.a)?.usd[o] ?? 0), 0)));
  const lede = `Since ${mlabel(first.slice(0, 7))}, <strong>${ALLC.all.length.toLocaleString('en-US')} people</strong> have paid ${usd(ALLC.chan[c].usd)} in superchats on ${esc(ch.name)}. <strong>${cr.length}</strong> of them also donate on at least one of the other channels here, and they sent <strong>${usd(crUsd)}</strong>, ${pct(ALLC.chan[c].usd ? crUsd / ALLC.chan[c].usd : 0)} of ${possessive(esc(ch.name))} superchat money.`;
  const parts = CH.map((o, i) => (i !== c && elsewhere[i] ? `${usd(elsewhere[i])} on <a class="inlink" href="${base}channel/${o.slug}/">${esc(o.name)}</a>` : '')).filter(Boolean);
  return { lede, context: parts.length ? `Those ${cr.length} people also sent ${listJoin(parts)}.` : '' };
}

export function ledeDonor(ctx: Context, base: string, a: number, ALL: Aggregate = aggregate(ctx, allTime(ctx))): Lede {
  const { D, NCROSS } = ctx, CH = D.channels;
  const p = aggregate(ctx, allTime(ctx, { who: new Set([a]) })).all[0];
  if (!p) return { lede: 'No donations found for this person.', context: '' };
  const parts = p.chs.map((c) => `${usd(p.usd[c])} in ${p.paid[c]} on <a class="inlink" href="${base}channel/${CH[c].slug}/">${esc(CH[c].name)}</a>${p.gifts[c] ? ` plus ${p.gifts[c]} gifted memberships worth about ${usd(p.gifts[c] * CH[c].price)}` : ''}`);
  const rank = [...ALL.cross].sort((x, y) => y.total - x.total).findIndex((q) => q.a === p.a) + 1;
  return {
    lede: `<strong>${esc(D.authors[p.a][0])}</strong> sent <strong>${usd(p.total)}</strong> in ${p.npaid} superchats across ${numberWord(p.chs.length)} channels between ${p.first} and ${p.last}. That's ${listJoin(parts)}.`,
    context: `By superchat dollars, that makes them number ${rank} of the ${NCROSS} people who give on more than one of these channels.`,
  };
}
