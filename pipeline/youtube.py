"""Everything that talks to YouTube, paced gently.

At least GAP seconds pass between requests. When YouTube answers with a bot
check, a captcha or a rate limit, Blocked is raised and the run stops; the
next daily run carries on where this one left off.
"""
import re
import tempfile
import time
import urllib.request
from pathlib import Path

import yt_dlp

GAP = 15.0  # seconds between YouTube requests
BLOCK_RE = re.compile(r"not a bot|captcha|too many requests|HTTP Error 429|HTTP Error 503|rate.limited|try again later", re.I)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
_last = 0.0


class Blocked(Exception):
    """YouTube asked us to slow down or prove we're not a bot."""


def _pace():
    global _last
    wait = _last + GAP - time.time()
    if wait > 0:
        time.sleep(wait)
    _last = time.time()


def _opts(**extra):
    return {"quiet": True, "no_warnings": True, "noprogress": True, **extra}


def list_videos(url):
    """Flat listing of a playlist or a channel's streams tab:
    [{"id", "title", "live_status", "approx_date"}] with dates estimated from "3 months ago"."""
    _pace()
    opts = _opts(extract_flat="in_playlist", extractor_args={"youtubetab": {"approximate_date": [""]}})
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        if BLOCK_RE.search(str(e)):
            raise Blocked(str(e)) from e
        raise
    return [{"id": e["id"], "title": e.get("title") or "", "live_status": e.get("live_status"), "approx_date": e.get("upload_date")}
            for e in info.get("entries") or [] if e and e.get("id")]


def fetch_chat(video_id, workdir):
    """Download a past livestream's chat replay into workdir.
    Returns (metadata, path to the .live_chat.json) or (None, reason) when the
    stream has no readable chat: "members-only", "age-restricted" or "no chat replay"."""
    _pace()
    opts = _opts(skip_download=True, writesubtitles=True, subtitleslangs=["live_chat"], outtmpl=str(Path(workdir) / "%(id)s.%(ext)s"))
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}")
    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        if BLOCK_RE.search(msg):
            raise Blocked(msg) from e
        if "members-only" in msg or "Join this channel" in msg:
            return None, "members-only"
        if "confirm your age" in msg:
            return None, "age-restricted"
        return None, "no chat replay"
    found = sorted(Path(workdir).glob(f"{video_id}*.live_chat.json"))
    if not found:
        return None, "no chat replay"
    meta = {"title": info.get("title") or "", "upload_date": info.get("upload_date") or "",
            "duration": int(info.get("duration") or 0), "views": int(info.get("view_count") or 0)}
    return meta, found[0]


def stream_date(video_id):
    """The stream date from the public watch page. Works for members-only and
    replay-less streams, where yt-dlp stops before returning metadata."""
    _pace()
    req = urllib.request.Request(f"https://www.youtube.com/watch?v={video_id}",
                                 headers={"User-Agent": UA, "Accept-Language": "en-US", "Cookie": "CONSENT=YES+1"})
    page = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    m = re.search(r'"uploadDate":"(\d{4}-\d{2}-\d{2})', page)
    if not m and ("unusual traffic" in page or "not a bot" in page):
        raise Blocked("bot check on the watch page")
    title = re.search(r'<meta name="title" content="([^"]*)"', page)
    return (m.group(1) if m else ""), (title.group(1) if title else "")


def tempdir():
    # yt-dlp can leave a failed replay's .part file open on Windows; don't crash on cleanup
    return tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
