#!/usr/bin/env python3
"""Shareable page for every portfolio video: nestudio.by/v/<slug>/

1. Every card in index.html gets a permanent data-slug (made from its title once, never changed later).
2. v/<slug>/index.html is (re)written for every card: Open Graph tags, so Telegram, Viber, WhatsApp,
   VK and mail show the cover, title and description, then a redirect to /?v=<slug>,
   where the portfolio opens with that video playing.
3. Pages of cards that no longer exist are removed.

Run after adding or editing cards:  python3 -I tools/build_video_pages.py
"""
import html, os, re, shutil

SITE = "https://nestudio.by"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "index.html")
OUT = os.path.join(ROOT, "v")

TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюяіў",
              ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
               "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya", "i", "u"]))


def slugify(title):
    s = "".join(TR.get(ch, ch) for ch in title.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > 60:
        s = s[:60].rsplit("-", 1)[0]
    return s or "video"


def attr(card, name):
    m = re.search(rf'{name}="([^"]*)"', card)
    return html.unescape(m.group(1)) if m else ""


def cover(card):
    src, vid = attr(card, "data-src"), attr(card, "data-id")
    if src == "yt":
        return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
    img = re.search(r'<img src="([^"]*)"', card)
    url = html.unescape(img.group(1)) if img else ""
    if url.startswith("https://drive.google.com/thumbnail"):
        return re.sub(r"sz=w\d+", "sz=w1200", url)
    return url if url.startswith("http") else f"{SITE}/{url}" if url else ""


def page(card, slug):
    e = lambda s: html.escape(s, quote=True)
    title, desc = attr(card, "data-title"), attr(card, "data-long")
    tag, date = attr(card, "data-tag"), attr(card, "data-date")
    img, url = cover(card), f"{SITE}/v/{slug}/"
    target = f"/?v={slug}"
    image_tags = (f'<meta property="og:image" content="{e(img)}">\n'
                  f'<meta name="twitter:image" content="{e(img)}">\n') if img else ""
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)} · nestudio</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="nestudio">
<meta property="og:locale" content="ru_RU">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
{image_tags}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta http-equiv="refresh" content="0; url={target}">
<script>location.replace({target!r});</script>
<style>:root{{color-scheme:light dark}}body{{margin:0;min-height:100vh;display:grid;place-items:center;
font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#111;color:#fff;padding:16px}}
main{{max-width:560px}}img{{width:100%;border-radius:16px}}a{{color:#d4bc7f}}p{{color:rgba(255,255,255,.7)}}</style>
</head>
<body>
<main>
{f'<img src="{e(img)}" alt="">' if img else ''}
<p>{e(tag)} · {e(date)}</p>
<h1>{e(title)}</h1>
<p>{e(desc)}</p>
<p><a href="{target}">Смотреть на nestudio.by</a></p>
</main>
</body>
</html>
"""


def main():
    text = open(PAGE, encoding="utf-8").read()
    cards = re.findall(r'<article class="card[^>]*>', text)
    used = {attr(c, "data-slug") for c in cards} - {""}

    def add_slug(m):
        tag = m.group(0)
        if 'data-slug="' in tag:
            return tag
        base = slugify(attr(tag, "data-title")); slug, n = base, 2
        while slug in used:
            slug, n = f"{base}-{n}", n + 1
        used.add(slug)
        return tag.replace(' data-id="', f' data-slug="{slug}" data-id="', 1)

    text = re.sub(r'<article class="card[^>]*>', add_slug, text)
    open(PAGE, "w", encoding="utf-8").write(text)

    slugs = set()
    for m in re.finditer(r'<article class="card.*?</article>', text, flags=re.S):
        card = m.group(0); slug = attr(card, "data-slug"); slugs.add(slug)
        os.makedirs(os.path.join(OUT, slug), exist_ok=True)
        with open(os.path.join(OUT, slug, "index.html"), "w", encoding="utf-8") as f:
            f.write(page(card, slug))
    for name in os.listdir(OUT):
        if name not in slugs and os.path.isdir(os.path.join(OUT, name)):
            shutil.rmtree(os.path.join(OUT, name))
    print(f"pages: {len(slugs)}")


if __name__ == "__main__":
    main()
