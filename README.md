# TrackSnarkPac

Superchats on four political YouTube channels (Pisco, Counterpoints, The Soy Pill, Lib & Learn) from 2025-11-12 to 2026-11-11, and the people who donate on more than one of them.

The page is `index.html`, served by GitHub Pages. It carries the raw rows and computes every number in the browser, so the filters at the top (message text, stream title, months) change all totals, charts and tables. A filtered view can be shared by its link.

The data behind it is in `data/` (unfiltered):

| file | rows |
|---|---|
| `cross-channel-donors.csv` | people who sent superchats or gifted memberships on two or more of the channels, with US$ per channel |
| `donors.csv` | everyone who paid, matched by YouTube channel ID |
| `superchats.csv` | every superchat and super sticker: stream, time in the stream, original amount and currency, US$ value, message, link |
| `gifts.csv` | gifted memberships: who, how many, which stream |
| `streams.csv` | every stream counted, with totals |

Amounts are what viewers paid, before YouTube's roughly 30% cut. Other currencies were converted to US dollars at the rates of 2026-11-12. Gifted memberships are valued at each channel's cheapest membership level (Pisco $4.99, Counterpoints $2.99, The Soy Pill $2.99, Lib & Learn $1.99) and kept apart as an estimate.

All data comes from the public chat replays of the channels' livestreams.
