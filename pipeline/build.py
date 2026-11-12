"""Build public/data (site.json and the CSV downloads) from pipeline/state.

    python pipeline/build.py

State, all committed to the repo:
    channels.json          the channel registry (order = color order on the site)
    state/streams/<id>.json one file per stream with readable chat
    state/missing.json      streams without readable chat: reason, date, title
    state/rates.json        exchange rates used for the US$ values
"""
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

from money import parse_amount, to_usd

HERE = Path(__file__).resolve().parent
STATE = HERE / "state"
DATA = HERE.parent / "public" / "data"


def load_state():
    registry = json.loads((HERE / "channels.json").read_text(encoding="utf-8"))
    streams = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((STATE / "streams").glob("*.json"))]
    missing = json.loads((STATE / "missing.json").read_text(encoding="utf-8")) if (STATE / "missing.json").exists() else {}
    rates = json.loads((STATE / "rates.json").read_text(encoding="utf-8"))
    return registry, streams, missing, rates


def build():
    registry, streams, missing, rates = load_state()
    idx = {c["slug"]: i for i, c in enumerate(registry)}
    own = {c["slug"]: c["own_account"].lower() for c in registry}
    price = {c["slug"]: c["gift_price"] for c in registry}
    streams = sorted((s for s in streams if s["channel"] in idx), key=lambda s: (s["date"], s["id"]))

    rows_streams, authors, aidx, sc, gifts = [], [], {}, [], []
    csv_sc, csv_gifts, csv_streams = [], [], []
    person = defaultdict(lambda: {"name": "", "id": "", "usd": defaultdict(float), "n": defaultdict(int), "gifted": defaultdict(int)})

    def author(name, cid):
        key = cid or "n:" + name
        if key not in aidx:
            aidx[key] = len(authors)
            authors.append([name, cid if cid.startswith("UC") else ""])
        return aidx[key], key

    for si, s in enumerate(streams):
        c = idx[s["channel"]]
        rows_streams.append([s["id"], c, s["date"], s["title"], s["duration"], s["views"]])
        s_usd, s_n, s_g = 0.0, 0, 0
        for name, cid, amount_text, offset, message, sticker in s["superchats"]:
            usd = to_usd(amount_text, rates)
            if usd is None:
                continue
            a, key = author(name, cid)
            msg = message or (f"(sticker: {sticker})" if sticker else "")
            sc.append([si, a, usd, amount_text, offset, msg])
            p = person[key]; p["name"], p["id"] = name, authors[a][1]; p["usd"][s["channel"]] += usd; p["n"][s["channel"]] += 1
            s_usd += usd; s_n += 1
            _, code = parse_amount(amount_text)
            csv_sc.append([s["channel"], s["date"], s["id"], s["title"], offset, name, authors[a][1], amount_text, code or "", usd, msg,
                           f"https://youtu.be/{s['id']}?t={offset}"])
        for name, cid, count, offset in s["gifts"]:
            if name.lower() == own[s["channel"]]:
                continue  # the channel gifting from its own account
            a, key = author(name, cid)
            gifts.append([si, a, count, offset])
            p = person[key]; p["name"], p["id"] = name, authors[a][1]; p["gifted"][s["channel"]] += count
            s_g += count
            csv_gifts.append([s["channel"], s["date"], s["id"], s["title"], offset, name, authors[a][1], count,
                              round(count * price[s["channel"]], 2), f"https://youtu.be/{s['id']}?t={offset}"])
        csv_streams.append([s["channel"], s["date"], s["id"], s["title"], s["duration"], s["views"], s_n, round(s_usd, 2), s_g, f"https://youtu.be/{s['id']}"])

    miss_count = defaultdict(int)
    reasons = defaultdict(lambda: defaultdict(int))
    missing_rows = []
    for vid, m in sorted(missing.items(), key=lambda kv: kv[1].get("date") or ""):
        if m["channel"] not in idx:
            continue
        miss_count[m["channel"]] += 1
        reasons[m["channel"]][m["reason"]] += 1
        missing_rows.append([idx[m["channel"]], m.get("date") or "", m["reason"], m.get("title") or ""])

    payload = {
        "channels": [{"name": c["name"], "slug": c["slug"], "url": c["url"], "price": c["gift_price"],
                      "missing": miss_count[c["slug"]], "reasons": dict(reasons[c["slug"]])} for c in registry],
        "since": rows_streams[0][2], "until": rows_streams[-1][2], "fx": rates["date"], "built": date.today().isoformat(),
        "streams": rows_streams, "authors": authors, "sc": sc, "gifts": gifts, "missing": missing_rows,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "site.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    def write(name, header, rows):
        with (DATA / name).open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f); w.writerow(header); w.writerows(rows)

    slugs = [c["slug"] for c in registry]
    write("superchats.csv", ["channel", "date", "video_id", "title", "offset_s", "author", "author_channel_id", "amount", "currency", "usd", "message", "link"], csv_sc)
    write("gifts.csv", ["channel", "date", "video_id", "title", "offset_s", "author", "author_channel_id", "memberships", "usd_estimate", "link"], csv_gifts)
    write("streams.csv", ["channel", "date", "video_id", "title", "duration_s", "views", "superchats", "usd", "gifted_memberships", "link"], csv_streams)
    donors = []
    for p in person.values():
        chs = [c for c in slugs if p["n"][c] or p["gifted"][c]]
        gift_usd = sum(p["gifted"][c] * price[c] for c in chs)
        donors.append([p["name"], p["id"], len(chs), "; ".join(chs), sum(p["n"].values()), round(sum(p["usd"].values()), 2),
                       sum(p["gifted"].values()), round(gift_usd, 2)] + [round(p["usd"][c], 2) for c in slugs])
    donors.sort(key=lambda r: r[5], reverse=True)
    header = ["name", "channel_id", "n_channels", "channels", "superchats", "usd", "gifted_memberships", "gift_usd_estimate"] + [f"usd_{c}" for c in slugs]
    write("donors.csv", header, donors)
    write("cross-channel-donors.csv", header, [r for r in donors if r[2] > 1])
    return payload


if __name__ == "__main__":
    p = build()
    print(f"site.json: {len(p['streams'])} streams, {len(p['sc'])} superchats, {len(p['gifts'])} gifts, {len(p['authors'])} people, {len(p['missing'])} without chat")
