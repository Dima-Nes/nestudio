#!/usr/bin/env python3
"""Move portfolio videos from Google Drive to our own storage (media.nestudio.by, Cloudflare R2)

Google Drive plays its videos only in its own slow iframe (and on phones only in a new tab).
Our copies play in the site's player right away; the Drive original (data-id) stays the fallback.

  python3 -I tools/move_to_cdn.py list               Drive cards and the size of each original
  python3 -I tools/move_to_cdn.py download           originals -> cdn-work/src/<slug>.mp4
  python3 -I tools/move_to_cdn.py encode             web copies -> cdn-work/out/<slug>.mp4 (1080p) and out/m/<slug>.mp4 (720p), needs ffmpeg
  rclone copy cdn-work/out r2:nestudio-media         upload (rclone remote "r2" set up with the R2 keys, by the owner)
  python3 -I tools/move_to_cdn.py switch             cards with an uploaded copy -> data-src="cdn", then rebuilds the pages

Each step skips what is already done, so it can be stopped and run again. cdn-work/ is not committed.
"""
import html, os, re, subprocess, sys

import requests

CDN = "https://media.nestudio.by"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "index.html")
WORK = os.path.join(ROOT, "cdn-work")
SRC, OUT = os.path.join(WORK, "src"), os.path.join(WORK, "out")


def attr(card, name):
    m = re.search(rf'{name}="([^"]*)"', card)
    return html.unescape(m.group(1)) if m else ""


def drive_cards():
    text = open(PAGE, encoding="utf-8").read()
    return [c for c in re.findall(r'<article class="card[^>]*>', text) if attr(c, "data-src") == "gd"]


def drive_get(fid, stream=True):
    return requests.get("https://drive.usercontent.google.com/download",
                        params={"id": fid, "export": "download", "confirm": "t"}, stream=stream, timeout=60)


def mb(n):
    return f"{n / 1048576:7.1f} MB"


def cmd_list():
    total = 0
    for c in drive_cards():
        with drive_get(attr(c, "data-id")) as r:
            size = int(r.headers.get("Content-Length", 0)) if r.ok and "html" not in r.headers.get("Content-Type", "") else 0
        total += size
        print(f"{mb(size) if size else '      ?   '}  {attr(c, 'data-slug')}")
    print(f"{len(drive_cards())} videos on Google Drive, originals {mb(total)}")


def cmd_download():
    os.makedirs(SRC, exist_ok=True)
    for c in drive_cards():
        slug, path = attr(c, "data-slug"), os.path.join(SRC, attr(c, "data-slug") + ".mp4")
        if os.path.exists(path):
            continue
        with drive_get(attr(c, "data-id")) as r:
            if not r.ok or "html" in r.headers.get("Content-Type", ""):
                print("not downloadable (check sharing):", slug); continue
            with open(path + ".part", "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
        os.replace(path + ".part", path)
        print("downloaded", mb(os.path.getsize(path)), slug)


def encode(src, dst, height, crf):
    # H.264 + AAC plays everywhere; faststart puts the index first, so playback starts before the whole file arrives
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src,
                    "-vf", f"scale=-2:'min({height},ih)'", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", dst + ".part.mp4"], check=True)
    os.replace(dst + ".part.mp4", dst)


def cmd_encode():
    os.makedirs(os.path.join(OUT, "m"), exist_ok=True)
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".mp4"):
            continue
        src = os.path.join(SRC, name)
        for dst, h, crf in ((os.path.join(OUT, name), 1080, 23), (os.path.join(OUT, "m", name), 720, 27)):
            if not os.path.exists(dst):
                encode(src, dst, h, crf)
        print(f"{mb(os.path.getsize(os.path.join(OUT, name)))} + {mb(os.path.getsize(os.path.join(OUT, 'm', name)))}  {name}")


def cmd_switch():
    text = open(PAGE, encoding="utf-8").read()
    done = 0

    def switch(m):
        nonlocal done
        tag, slug = m.group(0), attr(m.group(0), "data-slug")
        if attr(tag, "data-src") != "gd":
            return tag
        url = f"{CDN}/{slug}.mp4"
        if requests.head(url, timeout=30).status_code != 200:   # only what is really uploaded
            return tag
        done += 1
        return (tag.replace('data-src="gd"', 'data-src="cdn"', 1)
                   .replace('data-file=""', f'data-file="{url}" data-file-m="{CDN}/m/{slug}.mp4"', 1))

    text = re.sub(r'<article class="card[^>]*>', switch, text)
    open(PAGE, "w", encoding="utf-8", newline="\n").write(text)
    print(f"switched to our storage: {done}, still on Drive: {len(drive_cards())}")
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "build_video_pages.py")], check=True)


if __name__ == "__main__":
    {"list": cmd_list, "download": cmd_download, "encode": cmd_encode, "switch": cmd_switch}[sys.argv[1] if len(sys.argv) > 1 else "list"]()
