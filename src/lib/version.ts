// Fingerprints of this build: one for the data, one for the site's own code.
// Pages carry them, /version.json publishes them, and the browser compares the
// two to tell a data update from a site update.
import { createHash } from 'node:crypto';
import { payload } from './site';

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

// every source file of the site, read at build time
const sources = import.meta.glob('/src/**/*.{ts,astro,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const VERSION = {
  // the build date changes daily on its own, so it isn't part of the data fingerprint
  data: hash(JSON.stringify({ ...payload, built: '' })),
  code: hash(Object.keys(sources).sort().map((k) => k + '\n' + sources[k]).join('\n')),
  streams: payload.streams.length,
  superchats: payload.sc.length,
  until: payload.until,
};
