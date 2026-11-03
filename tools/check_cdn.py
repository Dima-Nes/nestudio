#!/usr/bin/env python3
"""Check that every video the site plays from media.nestudio.by is really there and plays well

For each card with data-src="cdn", both copies (data-file 1080p, data-file-m 720p for phones) must:
  answer a Range request with 206 (the player seeks and the phone streams by ranges),
  be video/mp4 with a long Cache-Control,
  start with the moov atom (faststart: playback begins before the whole file is loaded).

  python3 -I tools/check_cdn.py        prints only problems and a summary, exit code 1 if there are any

Run it after uploading new videos and after `move_to_cdn.py switch`. Standard library only.
"""
import html, os, re, struct, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "index.html")
HEAD_BYTES = 65536


def attr(card, name):
    m = re.search(rf'{name}="([^"]*)"', card)
    return html.unescape(m.group(1)) if m else ""


def top_atoms(data):
    atoms, i = [], 0
    while i + 8 <= len(data):
        size, kind = struct.unpack(">I4s", data[i:i + 8])
        if size == 1 and i + 16 <= len(data):
            size = struct.unpack(">Q", data[i + 8:i + 16])[0]
        atoms.append(kind.decode("latin1"))
        if size < 8:
            break
        i += size
    return atoms


def check(url):
    req = urllib.request.Request(url, headers={"Range": f"bytes=0-{HEAD_BYTES - 1}", "User-Agent": "nestudio-check"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status, headers, data = r.status, r.headers, r.read()
    except Exception as e:
        return [f"no answer ({e})"]
    problems = []
    if status != 206:
        problems.append(f"status {status}, expected 206")
    if headers.get("Content-Type") != "video/mp4":
        problems.append(f"type {headers.get('Content-Type')}")
    if "max-age" not in (headers.get("Cache-Control") or ""):
        problems.append("no Cache-Control max-age")
    atoms = top_atoms(data)
    if "moov" not in atoms or ("mdat" in atoms and atoms.index("mdat") < atoms.index("moov")):
        problems.append(f"not faststart (atoms {' '.join(atoms[:4])})")
    return problems


def main():
    cards = [c for c in re.findall(r'<article class="card[^>]*>', open(PAGE, encoding="utf-8").read())
             if attr(c, "data-src") == "cdn"]
    jobs = []
    for c in cards:
        for name in ("data-file", "data-file-m"):
            url = attr(c, name)
            if url:
                jobs.append((attr(c, "data-slug"), url))
            else:
                print(f"{attr(c, 'data-slug')}: no {name}")
    with ThreadPoolExecutor(16) as pool:
        results = list(pool.map(lambda j: check(j[1]), jobs))
    bad = [(slug, url, p) for (slug, url), p in zip(jobs, results) if p]
    for slug, url, p in bad:
        print(f"{slug}: {url} – {'; '.join(p)}")
    missing = sum(1 for c in cards if not attr(c, "data-file") or not attr(c, "data-file-m"))
    print(f"{len(cards)} cdn cards, {len(jobs)} files checked, {len(bad)} with problems, {missing} cards without a copy")
    return 1 if bad or missing else 0


if __name__ == "__main__":
    sys.exit(main())
