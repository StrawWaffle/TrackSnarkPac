// Shape of public/data/site.json, written by the data pipeline (export_site.py).

export interface Channel {
  name: string;
  slug: string;
  url: string;
  /** US$ price of the cheapest membership level, which is what a gift buys. */
  price: number;
  /** Listed streams with no readable chat. */
  missing: number;
  /** Count of missing streams by reason ("members-only", "no chat replay", ...). */
  reasons: Record<string, number>;
}

/** [video id, channel index, date YYYY-MM-DD, title, duration s, views] */
export type Stream = [string, number, string, string, number, number];
/** [display name, YouTube channel id or ""] */
export type Author = [string, string];
/** [stream index, author index, US$, amount as shown, offset s, message] */
export type Superchat = [number, number, number, string, number, string];
/** [stream index, author index, memberships gifted, offset s] */
export type Gift = [number, number, number, number];
/** [channel index, date or "", reason, title] */
export type Missing = [number, string, string, string];

export interface Payload {
  channels: Channel[];
  since: string;
  until: string;
  fx: string;
  built: string;
  streams: Stream[];
  authors: Author[];
  sc: Superchat[];
  gifts: Gift[];
  missing: Missing[];
}

export interface Filter {
  msg: string;
  title: string;
  from: string;
  to: string;
  /** Selected people (author indices). */
  who: Set<number> | null;
  whoMode: 'only' | 'hide';
  /** Count gifted memberships at their estimated price. */
  gifts: boolean;
  /** Only this channel's streams (channel pages). */
  ch?: number;
}

export interface Person {
  a: number;
  usd: number[];
  paid: number[];
  gifts: number[];
  msgs: Superchat[];
  streams: Set<number>;
  first: string;
  last: string;
  /** Channels this person gave on over the whole period (not just the filter). */
  chs: number[];
  giftEst: number;
  giftN: number;
  npaid: number;
  /** Superchats, plus gift value when gifts are counted. */
  total: number;
}

export interface ChannelTotals {
  usd: number;
  paid: number;
  payers: Set<number>;
  gifts: number;
  streams: number;
  hours: number;
}

export interface MonthBin {
  cross: number;
  other: number;
  n: number;
}

export interface Aggregate {
  all: Person[];
  cross: Person[];
  crossSet: Set<number>;
  chan: ChannelTotals[];
  monthly: MonthBin[][];
  /** Per stream: superchat US$, count, US$ from cross-channel donors, gifts. */
  perStream: Map<number, { usd: number; n: number; cross: number; gifts: number }>;
  total: number;
  crossUsd: number;
  nsel: number;
}
