"""Daily update: fetch new VODs, rebuild the data, publish.

    python pipeline/update.py              full run, commits and pushes when there is new data
    python pipeline/update.py --no-push    same, but leaves the changes uncommitted
    python pipeline/update.py --list-only  only list streams and report what is new

Steps:
 0. git pull, so a run on another machine is never repeated or overwritten
 1. list each channel's sources (channels.json) and keep past livestreams
 2. for each one not seen before, download its chat replay and store the
    superchats and gifts in state/streams/<id>.json, or record in
    state/missing.json why it has no readable chat (with its date)
 3. refresh exchange rates once a day (state/rates.json)
 4. fetch up to 60 missing or stale profile pictures (avatars.py) into
    public/avatars, for the channels and the cross-channel donors
 5. rebuild public/data with build.py
 6. if streams, superchats, gifts, missing streams or pictures changed, commit
    pipeline/state, public/data and public/avatars and push; GitHub Actions
    publishes the site

Exit codes: 0 done (with or without new data), 75 YouTube blocked us
(whatever was fetched is still saved and published; rerun later), 1 error.
"""
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import avatars
import build
import money
import youtube
from chat import parse_replay

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
STATE = HERE / "state"


def log(msg):
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}", flush=True)


def git(*args, check=True):
    r = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, encoding="utf-8")
    if check and r.returncode:
        raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip()[-300:]}")
    return r.stdout


def data_key(payload):
    return ([s[0] for s in payload["streams"]], len(payload["sc"]), len(payload["gifts"]), payload["missing"], [c["slug"] for c in payload["channels"]])


def main():
    push = "--no-push" not in sys.argv
    list_only = "--list-only" in sys.argv
    if push and not list_only:
        # another machine may have published since; start from its state so nothing is fetched or pushed twice
        git("pull", "-q", "--ff-only")
    registry = json.loads((HERE / "channels.json").read_text(encoding="utf-8"))
    (STATE / "streams").mkdir(parents=True, exist_ok=True)
    missing_path = STATE / "missing.json"
    missing = json.loads(missing_path.read_text(encoding="utf-8")) if missing_path.exists() else {}
    have = {p.stem for p in (STATE / "streams").glob("*.json")}
    blocked = False

    # 1. list
    todo = {}
    try:
        for ch in registry:
            for src in ch["sources"]:
                vids = youtube.list_videos(src)
                for v in vids:
                    if v["live_status"] == "was_live" and v["id"] not in have and v["id"] not in missing:
                        todo.setdefault(v["id"], (ch["slug"], v))
                log(f"{ch['name']}: {len(vids)} videos in {src}")
    except youtube.Blocked as e:
        log(f"YouTube blocked the listing: {e}")
        return 75
    log(f"{len(todo)} new past livestreams to fetch")
    if list_only:
        for vid, (slug, v) in todo.items():
            log(f"  {slug} {vid} {v['title']}")
        return 0

    # 2. fetch
    for n, (vid, (slug, v)) in enumerate(todo.items(), 1):
        try:
            with youtube.tempdir() as tmp:
                meta, result = youtube.fetch_chat(vid, tmp)
                if meta:
                    superchats, gifts = parse_replay(result)
                    d = meta["upload_date"]
                    rec = {"id": vid, "channel": slug, "date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "title": meta["title"],
                           "duration": meta["duration"], "views": meta["views"], "superchats": superchats, "gifts": gifts}
                    (STATE / "streams" / f"{vid}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=0), encoding="utf-8")
                    log(f"[{n}/{len(todo)}] {slug} {vid}: {len(superchats)} superchats, {len(gifts)} gift messages")
                else:
                    when, title = youtube.stream_date(vid)
                    missing[vid] = {"channel": slug, "reason": result, "date": when, "title": title or v["title"]}
                    missing_path.write_text(json.dumps(missing, ensure_ascii=False, indent=0), encoding="utf-8")
                    log(f"[{n}/{len(todo)}] {slug} {vid}: no readable chat ({result})")
        except youtube.Blocked as e:
            log(f"YouTube blocked us after {n - 1} streams; saving what we have. {e}")
            blocked = True
            break

    # 3. rates, once a day
    rates_path = STATE / "rates.json"
    rates = json.loads(rates_path.read_text(encoding="utf-8")) if rates_path.exists() else None
    if not rates or time.time() - rates.get("fetched", 0) > 20 * 3600:
        try:
            rates = money.fetch_rates()
            rates_path.write_text(json.dumps(rates, indent=0), encoding="utf-8")
            log(f"exchange rates of {rates['date']}")
        except Exception as e:  # keep the previous rates
            log(f"could not refresh exchange rates, keeping {rates and rates['date']}: {e}")

    # 4. profile pictures for the channels and cross-channel donors, a few at a time
    if not blocked:
        try:
            avatars.refresh(registry, build.build(), log=log)
        except youtube.Blocked as e:
            log(f"YouTube blocked the profile pictures; trying again next run. {e}")
            blocked = True

    # 5. build
    payload = build.build()
    log(f"built: {len(payload['streams'])} streams, {len(payload['sc'])} superchats, {len(payload['missing'])} without chat")

    # 6. publish only when the data itself changed (rates and build date move daily on their own)
    try:
        old = json.loads(git("show", "HEAD:public/data/site.json"))
        changed = data_key(old) != data_key(payload)
    except (RuntimeError, json.JSONDecodeError):
        changed = True
    changed = changed or bool(git("status", "--porcelain", "public/avatars", "pipeline/state/avatars.json").strip())
    if not changed:
        git("checkout", "--", "public/data", "pipeline/state/rates.json", check=False)
        log("no new data; nothing to publish")
        return 75 if blocked else 0
    if not push:
        log("new data; --no-push given, leaving it uncommitted")
        return 75 if blocked else 0
    git("add", "pipeline/state", "public/data", "public/avatars")
    git("commit", "-q", "-m", f"Update data {datetime.now():%Y-%m-%d}")
    git("push", "-q")
    log("pushed; GitHub Actions will publish the site")
    return 75 if blocked else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log(f"failed: {e}")
        sys.exit(1)
