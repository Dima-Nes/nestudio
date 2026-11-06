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
4. A work with a case study (cases/<slug>.md) gets the full story under the video: project passport,
   sections with frames from the video (a click plays the video from that moment), FAQ and a call to action,
   plus Article, key moments (Clip) and FAQPage markup. The format is described in cases/README.md.

Run after adding or editing cards or cases:  python3 -I tools/build_video_pages.py
"""
import hashlib, html, json, os, re, shutil

SITE = "https://nestudio.by"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "index.html")
OUT = os.path.join(ROOT, "v")
CASES = os.path.join(ROOT, "cases")
RELATED = 12
FAQ_TITLE = "Частые вопросы"
PASSPORT = [("client", "Заказчик"), ("task", "Задача"), ("format", "Формат"), ("duration", "Хронометраж"),
            ("services", "Что сделали"), ("tools", "Инструменты")]
# what kind of work it is, for page titles: «Белинвестбанк – рекламный ролик | nestudio»
KIND = {"ads": "рекламный ролик", "clips": "музыкальный клип", "shoot": "видеосъёмка", "video": "видео",
        "greet": "видеопоздравление", "pharma": "ролик для фармацевтики", "corp": "корпоративное видео", "anim": "анимация"}

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


def versioned(text):
    """/assets/site.css and site.js get ?v=<hash of the file>: after a change browsers load the new file, not a cached one."""
    def ver(m):
        with open(os.path.join(ROOT, "assets", m.group(1)), "rb") as f:
            return f'/assets/{m.group(1)}?v={hashlib.sha1(f.read()).hexdigest()[:8]}"'
    return re.sub(r'/assets/(site\.(?:css|js))(?:\?v=\w+)?"', ver, text)


def block(text, start, end):
    i = text.index(start)
    return text[i:text.index(end, i) + len(end)]


def cover(card):
    src, vid = attr(card, "data-src"), attr(card, "data-id")
    if src == "yt":   # our copy of the YouTube cover (media/p/yt-<id>.jpg), YouTube's own as a fallback
        own = f"media/p/yt-{vid}.jpg"
        return f"{SITE}/{own}" if os.path.exists(os.path.join(ROOT, own)) else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
    img = re.search(r'<img src="([^"]*)"', card)
    url = html.unescape(img.group(1)) if img else ""
    if url.startswith("https://drive.google.com/thumbnail"):
        return re.sub(r"sz=w\d+", "sz=w1200", url)
    if url.endswith(".webp"):   # cards show light WebP; link previews get the full-size JPG next to it
        url = url[:-5] + ".jpg"
    return url if url.startswith("http") else f"{SITE}/{url.lstrip('/')}" if url else ""


def iso_date(d):
    m = re.match(r"(\w{3})\w*\s+(\d{4})", d)
    return f"{m.group(2)}-{MONTHS.get(m.group(1), 1):02d}-01T12:00:00+03:00" if m else ""


def short(s, n=160):
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0].rstrip(",.;:–- ") + "…"


def seconds(tc):
    """'1:05' or '65' -> 65, '' -> None"""
    if not tc:
        return None
    m, _, s = tc.strip().rpartition(":")
    return int(m or 0) * 60 + int(s)


def webp_size(path):
    """(width, height) from a WebP header, so frames reserve their place before they load."""
    with open(path, "rb") as f:
        b = f.read(30)
    if b[12:16] == b"VP8X":
        return 1 + int.from_bytes(b[24:27], "little"), 1 + int.from_bytes(b[27:30], "little")
    if b[12:16] == b"VP8L":
        n = int.from_bytes(b[21:25], "little")
        return (n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1
    return int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF


def inline(s):
    s = e(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', s)


def read_case(slug):
    """cases/<slug>.md -> {'meta': {...}, 'body': html, 'frames': [...], 'faq': [(q, a)]} or None"""
    path = os.path.join(CASES, slug + ".md")
    if not os.path.exists(path):
        return None
    text = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    meta = {}
    if text.startswith("---\n"):
        head_, text = text[4:].split("\n---\n", 1)
        for line in head_.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
    frames, faq, out = [], [], []
    in_faq, question, answer = False, None, []

    def figure(m):
        cap, name, tc = m.group(1), m.group(2), m.group(3)
        src = f"/media/cases/{slug}/{name}"
        w, h = webp_size(os.path.join(ROOT, src.lstrip("/")))
        t = seconds(tc)
        frames.append({"src": f"{SITE}{src}", "caption": cap, "t": t})
        play = (f'<button class="case-frame-play" type="button" data-t="{t}" aria-label="Смотреть с {e(tc)}">'
                f'<span>▶ {e(tc)}</span></button>') if t is not None else ""
        return (f'<figure class="case-frame{" tall" if h > w else ""}"><div class="case-frame-img">'
                f'<img src="{src}" alt="{e(cap)}" width="{w}" height="{h}" loading="lazy" decoding="async">{play}</div>'
                f'<figcaption>{inline(cap)}</figcaption></figure>')

    def flush_faq():
        if question:
            faq.append((question, " ".join(answer)))
            out.append(f'<details class="case-faq"><summary>{inline(question)}</summary>'
                       + "".join(f"<p>{inline(p)}</p>" for p in answer) + "</details>")

    for chunk in re.split(r"\n\s*\n", text.strip()):
        lines = [l.rstrip() for l in chunk.strip().split("\n")]
        first = lines[0]
        if first.startswith("## "):
            if in_faq:
                flush_faq(); question = None
            title = first[3:].strip()
            in_faq = title == FAQ_TITLE
            out.append(f'<h2 id="{slugify(title)}">{inline(title)}</h2>')
            lines = lines[1:]
            if not lines:
                continue
            first = lines[0]
        if in_faq:
            if first.startswith("### "):
                flush_faq(); question, answer = first[4:].strip(), [" ".join(lines[1:])] if lines[1:] else []
            else:
                answer.append(" ".join(lines))
            continue
        if first.startswith("### "):
            out.append(f"<h3>{inline(first[4:].strip())}</h3>")
            lines = lines[1:]
            if not lines:
                continue
        img = re.compile(r'^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$')
        if all(img.match(l) for l in lines):
            figs = "".join(figure(img.match(l)) for l in lines)
            out.append(figs if len(lines) == 1 else f'<div class="case-gallery n{min(len(lines), 3)}">{figs}</div>')
        elif all(l.startswith("- ") for l in lines):
            out.append("<ul>" + "".join(f"<li>{inline(l[2:])}</li>" for l in lines) + "</ul>")
        elif all(re.match(r"\d+\.\s", l) for l in lines):
            items = [re.sub(r"^\d+\.\s+", "", l) for l in lines]
            out.append('<ol class="case-steps">' + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ol>")
        elif all(l.startswith(">") for l in lines):
            out.append("<blockquote>" + "<br>".join(inline(l.lstrip("> ")) for l in lines) + "</blockquote>")
        else:
            out.append(f"<p>{inline(' '.join(lines))}</p>")
    if in_faq:
        flush_faq()
    return {"meta": meta, "body": "\n".join(out), "frames": frames, "faq": faq}


def as_link(card):
    """Card button -> link to the video's page, h2 -> h3 (the page has one h1 and section h2s)."""
    slug = attr(card, "data-slug")
    card = card.replace('<button class="cardlink" type="button"', f'<a class="cardlink" href="/v/{slug}/"', 1)
    card = card.replace("</button>\n</article>", "</a>\n</article>")
    return card.replace('<h2 class="cardtitle">', '<h3 class="cardtitle">').replace("</h2>", "</h3>")


def rooted(card):
    """Relative media paths work on the portfolio only; video pages live two folders deeper."""
    return re.sub(r'(?<![\w-])(src|data-file|data-file-m)="(?!https?:|/)([^"]+)"', r'\1="/\2"', card)


def video_ld(card, slug, title, desc, case=None):
    src, vid = attr(card, "data-src"), attr(card, "data-id")
    url = f"{SITE}/v/{slug}/"
    v = {"@type": "VideoObject", "name": title, "description": desc or title, "url": url,
         "thumbnailUrl": cover(card), "uploadDate": iso_date(attr(card, "data-date")),
         "publisher": {"@id": f"{SITE}/#org"}}
    graph = []
    if case:
        meta, frames = case["meta"], case["frames"]
        if meta.get("published"):   # exact first publication date, e.g. a demo whose date matters
            v["uploadDate"] = meta["published"]
        total = seconds(meta.get("duration", ""))
        if total:
            v["duration"] = f"PT{total // 60}M{total % 60}S"
        v["thumbnailUrl"] = [cover(card)] + [f["src"] for f in frames]
        # key moments: each frame with a time code is a clip of the video, its link plays from that moment
        timed = sorted((f for f in frames if f["t"] is not None), key=lambda f: f["t"])
        if timed:
            v["hasPart"] = [{"@type": "Clip", "name": f["caption"], "startOffset": f["t"],
                             "endOffset": timed[i + 1]["t"] if i + 1 < len(timed) else (total or f["t"] + 5),
                             "url": f"{url}?t={f['t']}"} for i, f in enumerate(timed)]
        graph.append({"@type": "Article", "headline": meta.get("h1", title), "description": meta.get("description", desc),
                      "image": [f["src"] for f in frames] or [cover(card)], "mainEntityOfPage": url,
                      "datePublished": meta.get("date") or iso_date(attr(card, "data-date")),
                      "author": {"@id": f"{SITE}/#org"}, "publisher": {"@id": f"{SITE}/#org"}, "video": {"@id": f"{url}#video"}})
        v["@id"] = f"{url}#video"
        if case["faq"]:
            graph.append({"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in case["faq"]]})
    if src == "yt":
        v["embedUrl"] = f"https://www.youtube.com/embed/{vid}"
    elif src == "gd":
        v["embedUrl"] = f"https://drive.google.com/file/d/{vid}/preview"
    elif attr(card, "data-file"):
        v["contentUrl"] = video_file(card)
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Видео-портфолио", "item": f"{SITE}/"},
        {"@type": "ListItem", "position": 2, "name": title, "item": url}]}
    org = {"@type": "Organization", "@id": f"{SITE}/#org", "name": "nestudio", "url": f"{SITE}/"}
    return json.dumps({"@context": "https://schema.org", "@graph": [v, crumbs, org] + graph}, ensure_ascii=False).replace("</", "<\\/")


def video_file(card):
    f = attr(card, "data-file")
    return "" if not f else f if f.startswith("http") else f"{SITE}/{f.lstrip('/')}"


def head(title, desc, url, image, og_type, extra="", canonical="", video=""):
    img = (f'<meta property="og:image" content="{e(image)}">\n'
           f'<meta name="twitter:image" content="{e(image)}">\n') if image else ""
    if video:   # Yandex builds video snippets from og:video
        img += f'<meta property="og:video" content="{e(video)}">\n<meta property="og:video:type" content="video/mp4">\n'
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


def case_anchor(case):
    m = re.search(r'<h2 id="([^"]+)"', case["body"])
    return m.group(1) if m else ""


def case_section(case):
    """The case study under the video: story on the left, project passport on the right, then a call to action."""
    meta = case["meta"]
    rows = "".join(f"<div><dt>{label}</dt><dd>{inline(meta[k])}</dd></div>" for k, label in PASSPORT if meta.get(k))
    return f"""
  <div class="case-layout">
    <article class="case-body">
{case['body']}
    </article>
    <aside class="case-passport" aria-label="Паспорт проекта">
      <div class="case-passport-in">
        <div class="section-title">Паспорт проекта</div>
        <dl>{rows}</dl>
        <a class="header-cta" href="https://t.me/nestudiopro" target="_blank" rel="noopener">Обсудить похожий проект</a>
      </div>
    </aside>
  </div>

  <section class="case-cta">
    <h2>{e(meta.get('cta', 'Нужен похожий ролик?'))}</h2>
    <p>{inline(meta.get('cta_text', 'Расскажите о задаче – предложим идею, сценарий и формат. Обычно отвечаем в течение часа.'))}</p>
    <div class="case-actions">
      <a class="header-cta" href="https://t.me/nestudiopro" target="_blank" rel="noopener">Написать в Telegram</a>
      <a class="header-cta ghost" href="tel:+375447138869">+375 44 713-88-69</a>
      <a class="header-cta ghost" href="mailto:nestudiowork@gmail.com">nestudiowork@gmail.com</a>
    </div>
  </section>
"""


def page(card, slug, related, parts, cats):
    title, desc = attr(card, "data-title"), attr(card, "data-long")
    tag, date = attr(card, "data-tag"), attr(card, "data-date")
    vertical = attr(card, "data-vertical") == "1"
    cat = attr(card, "data-cats").split()[0]
    own = rooted(card).replace(" reveal", "", 1)
    grid = "\n".join(rooted(c) for c in related)
    case = read_case(slug)
    meta = case["meta"] if case else {}
    ld = f'<script type="application/ld+json">{video_ld(card, slug, title, desc, case)}</script>\n'
    facts = [tag, date, "вертикальное 9:16" if vertical else "горизонтальное 16:9"]
    if meta.get("duration"):
        facts.insert(2, meta["duration"])
    main = attr(card, "data-of")   # another version of a project: search engines get the main page
    h1, lead = meta.get("h1", title), meta.get("lead", desc)
    kind = KIND.get(cat, "")
    plain = f"{title} – {kind} | nestudio" if kind and kind.split()[-1][:4] not in title.lower() else f"{title} | nestudio"
    return head(meta.get("title", plain), short(meta.get("description", desc or title)),
                f"{SITE}/v/{slug}/", cover(card), "article" if case else "video.other", ld,
                f"{SITE}/v/{main}/" if main else "", video_file(card)) + f"""<body class="is-loading" data-page="{'case' if case else 'video'}">
{parts['header']}

<main class="page">
  <section class="portfolio-intro case-intro{' vertical' if vertical else ''}">
    <div class="case-text-col">
      <div class="section-title"><a href="/">Видео-портфолио</a> · {e(tag)}{' · кейс' if case else ''}</div>
      <h1 class="case-title">{e(h1)}</h1>
      <p class="case-desc">{inline(lead)}</p>
      <ul class="case-facts">{''.join(f'<li>{e(f)}</li>' for f in facts if f)}</ul>
      <div class="case-actions">
        <button class="header-cta" type="button" data-play>Смотреть видео</button>
        <a class="header-cta ghost" href="{'#' + case_anchor(case) if case else 'https://t.me/nestudiopro'}"{'' if case else ' target="_blank" rel="noopener"'}>{'Читать кейс' if case else 'Обсудить похожий проект'}</a>
      </div>
    </div>
    <div class="case-media">
{own}
    </div>
  </section>
{case_section(case) if case else ''}
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
    return head("Страница не найдена · nestudio", "Такой страницы нет. Все работы nestudio – в видео-портфолио.", "", "", "website",
                '<meta http-equiv="refresh" content="0;url=/">\n<script>location.replace("/")</script>\n') + f"""<body class="is-loading" data-page="video">
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


def lastmod(card):
    """Date of the page's content: the case date if there is a case, else the work's month."""
    case = os.path.join(CASES, attr(card, "data-slug") + ".md")
    if os.path.exists(case):
        m = re.search(r"^date:\s*(\d{4}-\d{2}-\d{2})", open(case, encoding="utf-8").read(), re.M)
        if m:
            return m.group(1)
    return iso_date(attr(card, "data-date"))[:10]


def sitemap(cards):
    """Pages plus a video entry each (Google and Yandex video search): cover, title, description, file or player."""
    x = lambda s: html.escape(s, quote=False)
    rows = [f"  <url><loc>{SITE}/</loc><lastmod>{max(lastmod(c) for c in cards)}</lastmod></url>\n"]
    for c in cards:
        if attr(c, "data-of"):
            continue
        slug, src, vid = attr(c, "data-slug"), attr(c, "data-src"), attr(c, "data-id")
        case = read_case(slug)
        title = case["meta"].get("h1", attr(c, "data-title")) if case else attr(c, "data-title")
        desc = short(case["meta"].get("description", "") if case else "", 2000) or attr(c, "data-long") or title
        where = (f"<video:player_loc>https://www.youtube.com/embed/{vid}</video:player_loc>" if src == "yt"
                 else f"<video:content_loc>{x(video_file(c))}</video:content_loc>" if video_file(c) else "")
        video = (f"<video:video><video:thumbnail_loc>{x(cover(c))}</video:thumbnail_loc><video:title>{x(title)}</video:title>"
                 f"<video:description>{x(short(desc, 2000))}</video:description>{where}</video:video>") if where and cover(c) else ""
        rows.append(f"  <url><loc>{SITE}/v/{slug}/</loc><lastmod>{lastmod(c)}</lastmod>{video}</url>\n")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n' + "".join(rows) + "</urlset>\n")


def with_item_list(text, cards):
    """The portfolio page gets an ItemList of all works (between the ITEMLIST markers), so robots see the whole catalogue."""
    items = [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/v/{attr(c, 'data-slug')}/", "name": attr(c, "data-title")}
             for i, c in enumerate(c for c in cards if not attr(c, "data-of"))]
    ld = json.dumps({"@context": "https://schema.org", "@type": "ItemList", "name": "Портфолио nestudio",
                     "numberOfItems": len(items), "itemListElement": items}, ensure_ascii=False).replace("</", "<\\/")
    tag = f'<!-- ITEMLIST --><script type="application/ld+json">{ld}</script><!-- /ITEMLIST -->'
    if "<!-- ITEMLIST -->" in text:
        return re.sub(r"<!-- ITEMLIST -->.*?<!-- /ITEMLIST -->", lambda m: tag, text, flags=re.S)
    return text.replace("</head>", tag + "\n</head>", 1)


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
    text = versioned(text)
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
            f.write(versioned(page(card, slug, related, parts, cats)))
    for name in os.listdir(OUT):
        if name not in slugs and os.path.isdir(os.path.join(OUT, name)):
            shutil.rmtree(os.path.join(OUT, name))

    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(versioned(not_found(parts)))
    urls = [f"{SITE}/"] + [f"{SITE}/v/{attr(c, 'data-slug')}/" for c in all_cards if not attr(c, "data-of")]
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write(sitemap(all_cards))
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(with_item_list(text, all_cards))
    print(f"pages: {len(slugs)}, sitemap: {len(urls)} urls")


if __name__ == "__main__":
    main()
