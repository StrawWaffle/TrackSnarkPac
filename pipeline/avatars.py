"""Profile pictures for the channels and the cross-channel donors.

Each picture is read from the public channel page (its og:image), fetched once
at 88 px and saved as public/avatars/<key>.jpg, so the site serves its own copy
and visitors' browsers never contact YouTube. <key> is a YouTube channel id, or
ch-<slug> for the tracked channels. state/avatars.json records when each was
fetched; pictures older than MAX_AGE days are fetched again.

    python pipeline/avatars.py          # fetch what's missing or stale, then rebuild
"""
import json
import re
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import youtube

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "avatars"
STATE = HERE / "state" / "avatars.json"
MAX_AGE = 120  # days
OG_RE = re.compile(r'<meta property="og:image" content="([^"]+)"')


def _get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": youtube.UA, "Accept-Language": "en-US", "Cookie": "CONSENT=YES+1"})
    return urllib.request.urlopen(req, timeout=timeout).read()


def picture_url(channel_url):
    """The channel's profile picture at 88 px, or "" when the page has none."""
    youtube._pace()
    try:
        page = _get(channel_url).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (429, 503):
            raise youtube.Blocked(f"HTTP {e.code} on a channel page") from e
        return ""  # deleted or terminated channel
    if "unusual traffic" in page or "not a bot" in page:
        raise youtube.Blocked("bot check on a channel page")
    m = OG_RE.search(page)
    return re.sub(r"=s\d+.*$", "=s88-c-k-c0x00ffffff-no-rj", m.group(1)) if m else ""


def targets(registry, payload):
    """(key, channel page) for every tracked channel and every cross-channel donor."""
    chans = defaultdict(set)
    for s, a, *_ in payload["sc"]:
        chans[a].add(payload["streams"][s][1])
    for s, a, *_ in payload["gifts"]:
        chans[a].add(payload["streams"][s][1])
    out = [(f"ch-{c['slug']}", c["url"]) for c in registry]
    out += [(payload["authors"][a][1], f"https://www.youtube.com/channel/{payload['authors'][a][1]}")
            for a, cs in chans.items() if len(cs) > 1 and payload["authors"][a][1]]
    return out


def refresh(registry, payload, limit=60, log=print):
    """Fetch up to `limit` missing or stale pictures. Returns how many changed.
    Raises youtube.Blocked when YouTube pushes back; what was saved stays."""
    seen = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    stale = (date.today() - timedelta(days=MAX_AGE)).isoformat()
    todo = [(k, u) for k, u in targets(registry, payload) if seen.get(k, {}).get("fetched", "") < stale]
    todo.sort(key=lambda t: seen.get(t[0], {}).get("fetched", ""))  # never-fetched first
    OUT.mkdir(parents=True, exist_ok=True)
    changed = 0
    try:
        for key, url in todo[:limit]:
            src = picture_url(url)
            img = _get(src) if src else b""
            path = OUT / f"{key}.jpg"
            if img and (not path.exists() or path.read_bytes() != img):
                path.write_bytes(img)
                changed += 1
            elif not img and path.exists():
                path.unlink()
                changed += 1
            seen[key] = {"fetched": date.today().isoformat(), "has": bool(img)}
    finally:
        STATE.write_text(json.dumps(seen, indent=0, sort_keys=True), encoding="utf-8")
    log(f"profile pictures: {min(len(todo), limit)} checked, {changed} new or changed, {max(0, len(todo) - limit)} left for later")
    return changed


if __name__ == "__main__":
    import build
    reg = json.loads((HERE / "channels.json").read_text(encoding="utf-8"))
    refresh(reg, build.build(), limit=1000)
    build.build()
