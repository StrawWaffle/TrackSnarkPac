# TrackSnarkPac

Superchats on 4 political YouTube channels (Pisco, Counterpoints, The Soy Pill and Lib & Learn) from 2024-05-17 to 2026-11-11, and the people who donate on more than one of them.

The site is built with [Astro](https://astro.build) and published to GitHub Pages by the workflow in `.github/workflows/deploy.yml` on every push to `main`.

- `/` is the overview, `/channel/<slug>/` has a page per channel and `/donor/<YouTube channel id>/` a page per cross-channel donor. Pages are generated from the data, so a new channel or donor gets a page on the next build.
- `src/lib/core.ts` computes every number from the raw rows and runs both at build time and in the browser; `src/scripts/app.ts` draws the charts and tables and handles the filters, which change every number on a page and are kept in the link.
- Channel colors come from a validated 8-color palette in channel order (`src/lib/palette.ts`).

`public/data/` holds the data (unfiltered):

| file | rows |
|---|---|
| `site.json` | everything the pages compute from: channels, streams, people, superchats, gifted memberships, streams without chat data |
| `cross-channel-donors.csv` | people who sent superchats or gifted memberships on two or more of the channels, with US$ per channel |
| `donors.csv` | everyone who paid, matched by YouTube channel ID |
| `superchats.csv` | every superchat and super sticker: stream, time in the stream, original amount and currency, US$ value, message, link |
| `gifts.csv` | gifted memberships: who, how many, which stream |
| `streams.csv` | every stream counted, with totals |

Amounts are what viewers paid, before YouTube's roughly 30% cut. Other currencies were converted to US dollars at the rates of 2026-11-12. Gifted memberships are valued at each channel's cheapest membership level (Pisco $4.99, Counterpoints $2.99, The Soy Pill $2.99, Lib & Learn $1.99) and kept apart as an estimate.

All data comes from the public chat replays of the channels' livestreams.

Local preview: `npm install`, then `npm run dev`.
