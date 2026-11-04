#!/usr/bin/env python3
"""Tell Yandex (and Bing) through IndexNow which pages changed, so they are re-crawled within hours, not weeks.

Run after a push, once GitHub Pages has published the change:
  python3 -I tools/indexnow.py            # pages changed in the last commit
  python3 -I tools/indexnow.py --all      # every page from sitemap.xml
The key file <KEY>.txt in the site root proves the site is ours; do not delete it.
"""
import json, os, re, subprocess, sys, urllib.request

SITE, HOST, KEY = "https://nestudio.by", "nestudio.by", "2562e43b161eb51b4be1ad995e535016"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def changed():
    out = subprocess.run(["git", "-C", ROOT, "diff", "--name-only", "HEAD~1", "HEAD"], capture_output=True, text=True).stdout
    urls = set()
    for p in out.split():
        if p == "index.html":
            urls.add(f"{SITE}/")
        m = re.match(r"v/([^/]+)/index\.html$", p) or re.match(r"cases/([^/]+)\.md$", p)
        if m and m.group(1) != "README":
            urls.add(f"{SITE}/v/{m.group(1)}/")
    return sorted(urls)


def main():
    urls = re.findall(r"<loc>([^<]+)</loc>", open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()) if "--all" in sys.argv else changed()
    if not urls:
        return print("nothing to send")
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"{SITE}/{KEY}.txt", "urlList": urls}).encode()
    for api in ("https://yandex.com/indexnow", "https://api.indexnow.org/indexnow"):
        req = urllib.request.Request(api, body, {"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                print(api, r.status, len(urls), "urls")
        except Exception as e:
            print(api, "error:", e)


if __name__ == "__main__":
    main()
