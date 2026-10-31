#!/usr/bin/env python3
"""Page for every portfolio video: nestudio.by/v/<slug>/, plus sitemap.xml and 404.html

1. Every card in index.html gets a permanent data-slug (made from its title once, never changed later)
   and becomes a link to its page, so search engines can follow it.
2. v/<slug>/index.html is (re)written for every card: its own title, description, Open Graph and
   VideoObject markup, the video itself (opens right away), a short case block and related works.
   Header, footer, styles (assets/site.css) and the player (assets/site.js) are the same as on the portfolio.
3. Pages of cards that no longer exist are removed; sitemap.xml lists the portfolio and every video page.
   Another version of a project (card with data-of="<main slug>") keeps its page, but its canonical is the main
   page, it is left out of the sitemap, and all versions are listed first among each other's related works.

Run after adding or editing cards:  python3 -I tools/build_video_pages.py
"""
import html, json, os, re, shutil

SITE = "https://nestudio.by"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "index.html")
OUT = os.path.join(ROOT, "v")
RELATED = 12

TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюяіў",
              ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
               "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya", "i", "u"]))
MONTHS = {"янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "июн": 6, "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12}
e = lambda s: html.escape(s, quote=True)


def slugify(title):
    s = "".join(TR.get(ch, ch) for ch in title.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > 60:
        s = s[:60].rsplit("-", 1)[0]
    return s or "video"


def attr(card, name):
    m = re.search(rf'{name}="([^"]*)"', card)
    return html.unescape(m.group(1)) if m else ""


def block(text, start, end):
    i = text.index(start)
    return text[i:text.index(end, i) + len(end)]


def cover(card):
    src, vid = attr(card, "data-src"), attr(card, "data-id")
    if src == "yt":
        return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
    img = re.search(r'<img src="([^"]*)"', card)
    url = html.unescape(img.group(1)) if img else ""
    if url.startswith("https://drive.google.com/thumbnail"):
        return re.sub(r"sz=w\d+", "sz=w1200", url)
    if url.endswith(".webp"):   # cards show light WebP; link previews get the full-size JPG next to it
        url = url[:-5] + ".jpg"
    return url if url.startswith("http") else f"{SITE}/{url.lstrip('/')}" if url else ""


def iso_date(d):
    m = re.match(r"(\w{3})\w*\s+(\d{4})", d)
    return f"{m.group(2)}-{MONTHS.get(m.group(1), 1):02d}-01" if m else ""


def short(s, n=160):
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0].rstrip(",.;:–- ") + "…"


def as_link(card):
    """Card button -> link to the video's page, h2 -> h3 (the page has one h1 and section h2s)."""
    slug = attr(card, "data-slug")
    card = card.replace('<button class="cardlink" type="button"', f'<a class="cardlink" href="/v/{slug}/"', 1)
    card = card.replace("</button>\n</article>", "</a>\n</article>")
    return card.replace('<h2 class="cardtitle">', '<h3 class="cardtitle">').replace("</h2>", "</h3>")


def rooted(card):
    """Relative media paths work on the portfolio only; video pages live two folders deeper."""
    return re.sub(r'(?<![\w-])(src|data-file|data-file-m)="(?!https?:|/)([^"]+)"', r'\1="/\2"', card)


def video_ld(card, slug, title, desc):
    src, vid = attr(card, "data-src"), attr(card, "data-id")
    url = f"{SITE}/v/{slug}/"
    v = {"@type": "VideoObject", "name": title, "description": desc or title, "url": url,
         "thumbnailUrl": cover(card), "uploadDate": iso_date(attr(card, "data-date")),
         "publisher": {"@id": f"{SITE}/#org"}}
    if src == "yt":
        v["embedUrl"] = f"https://www.youtube.com/embed/{vid}"
    elif src == "gd":
        v["embedUrl"] = f"https://drive.google.com/file/d/{vid}/preview"
    elif attr(card, "data-file"):
        f = attr(card, "data-file")
        v["contentUrl"] = f if f.startswith("http") else f"{SITE}/{f.lstrip('/')}"
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Видео-портфолио", "item": f"{SITE}/"},
        {"@type": "ListItem", "position": 2, "name": title, "item": url}]}
    org = {"@type": "Organization", "@id": f"{SITE}/#org", "name": "nestudio", "url": f"{SITE}/"}
    return json.dumps({"@context": "https://schema.org", "@graph": [v, crumbs, org]}, ensure_ascii=False)


def head(title, desc, url, image, og_type, extra="", canonical=""):
    img = (f'<meta property="og:image" content="{e(image)}">\n'
           f'<meta name="twitter:image" content="{e(image)}">\n') if image else ""
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{f'<link rel="canonical" href="{canonical or url}">' if url else '<meta name="robots" content="noindex">'}
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="nestudio">
<meta property="og:locale" content="ru_RU">
{f'<meta property="og:url" content="{url}">' if url else ''}
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
{img}<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/logo.png">
<link rel="stylesheet" href="/assets/site.css">
{extra}</head>
"""


def page(card, slug, related, parts, cats):
    title, desc = attr(card, "data-title"), attr(card, "data-long")
    tag, date = attr(card, "data-tag"), attr(card, "data-date")
    vertical = attr(card, "data-vertical") == "1"
    cat = attr(card, "data-cats").split()[0]
    own = rooted(card).replace(" reveal", "", 1)
    grid = "\n".join(rooted(c) for c in related)
    ld = f'<script type="application/ld+json">{video_ld(card, slug, title, desc)}</script>\n'
    facts = [tag, date, "вертикальное 9:16" if vertical else "горизонтальное 16:9"]
    main = attr(card, "data-of")   # another version of a project: search engines get the main page
    return head(f"{title} · {tag} · nestudio", short(desc or title), f"{SITE}/v/{slug}/", cover(card), "video.other", ld,
                f"{SITE}/v/{main}/" if main else "") + f"""<body class="is-loading" data-page="video">
{parts['header']}

<main class="page">
  <section class="portfolio-intro case-intro{' vertical' if vertical else ''}">
    <div class="case-text-col">
      <div class="section-title"><a href="/">Видео-портфолио</a> · {e(tag)}</div>
      <h1 class="case-title">{e(title)}</h1>
      <p class="case-desc">{e(desc)}</p>
      <ul class="case-facts">{''.join(f'<li>{e(f)}</li>' for f in facts if f)}</ul>
      <div class="case-actions">
        <button class="header-cta" type="button" data-play>Смотреть видео</button>
        <a class="header-cta ghost" href="https://t.me/nestudiopro" target="_blank" rel="noopener">Обсудить похожий проект</a>
      </div>
    </div>
    <div class="case-media">
{own}
    </div>
  </section>

  <h2 class="section-title related-title">Ещё работы: {e(cats.get(cat, tag))}</h2>
  <section class="works" id="works" aria-label="Похожие работы">
{grid}
  </section>
  <div class="case-actions" style="justify-content:center;margin-top:20px"><a class="header-cta" href="/">Все работы nestudio</a></div>
</main>

{parts['footer']}

{parts['modal']}

<script src="/assets/site.js"></script>
</body>
</html>
"""


def not_found(parts):
    return head("Страница не найдена · nestudio", "Такой страницы нет. Все работы nestudio – в видео-портфолио.", "", "", "website") + f"""<body class="is-loading" data-page="video">
{parts['header']}

<main class="page">
  <section class="portfolio-intro case-intro">
    <div class="case-text-col">
      <div class="section-title">Ошибка 404</div>
      <h1 class="case-title">Такой страницы нет</h1>
      <p class="case-desc">Возможно, ссылка устарела или в адресе опечатка. Все работы студии собраны в видео-портфолио.</p>
      <div class="case-actions"><a class="header-cta" href="/">Открыть портфолио</a></div>
    </div>
  </section>
  <section class="works" id="works" aria-label="Работы"></section>
</main>

{parts['footer']}

{parts['modal']}

<script src="/assets/site.js"></script>
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
    text = re.sub(r'<article class="card.*?</article>', lambda m: as_link(m.group(0)), text, flags=re.S)
    open(PAGE, "w", encoding="utf-8", newline="\n").write(text)

    parts = {"header": block(text, '<header class="site-header">', "</header>"),
             "footer": block(text, '<div id="site-bottom-nav">', "</footer>"),
             "modal": block(text, '<div class="vmodal"', "</div>\n</div>")}
    cats = {k: html.unescape(v) for k, v in re.findall(r'data-filter="(\w+)">([^<]+?)\s*<', text)}
    all_cards = [m.group(0) for m in re.finditer(r'<article class="card.*?</article>', text, flags=re.S)]

    slugs = []
    for card in all_cards:
        slug = attr(card, "data-slug"); slugs.append(slug)
        cat = attr(card, "data-cats").split()[0]
        project = attr(card, "data-of") or slug
        others = [c for c in all_cards if c is not card]
        versions = [c for c in others if project in (attr(c, "data-of"), attr(c, "data-slug"))]
        same = [c for c in others if cat in attr(c, "data-cats").split() and c not in versions]
        related = (versions + same + [c for c in others if c not in same and c not in versions])[:RELATED]
        os.makedirs(os.path.join(OUT, slug), exist_ok=True)
        with open(os.path.join(OUT, slug, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page(card, slug, related, parts, cats))
    for name in os.listdir(OUT):
        if name not in slugs and os.path.isdir(os.path.join(OUT, name)):
            shutil.rmtree(os.path.join(OUT, name))

    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(not_found(parts))
    urls = [f"{SITE}/"] + [f"{SITE}/v/{attr(c, 'data-slug')}/" for c in all_cards if not attr(c, "data-of")]
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    print(f"pages: {len(slugs)}, sitemap: {len(urls)} urls")


if __name__ == "__main__":
    main()
