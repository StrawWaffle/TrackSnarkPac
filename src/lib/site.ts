// Build-time access to the data: the same site.json the browser fetches.
import raw from '../../public/data/site.json';
import { aggregate, allTime, makeContext } from './core';
import type { Payload } from './types';

export const payload = raw as unknown as Payload;
export const ctx = makeContext(payload);
/** All-time numbers, computed once per build. */
export const ALL = aggregate(ctx, allTime(ctx));

/** Base path with a trailing slash, e.g. "/TrackSnarkPac/". */
export const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
