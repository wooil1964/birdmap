#!/usr/bin/env python3
"""Checks the generated SEO files: in sync, valid sitemap, unique metadata, and nothing private or dynamic."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_data import load_runtime_sites  # noqa: E402
import build_seo_pages as seo  # noqa: E402

sites = load_runtime_sites()
files = seo.build_all(sites)
for path, content in files.items():
    assert path.exists() and path.read_text(encoding="utf-8") == content, "stale: %s" % path

assert seo.species_of({"birds": "검독수리 노랑부리저어새, 쇠뜸부기, 검독수리"}) == ["노랑부리저어새", "쇠뜸부기"]
pages = seo.indexable_sites(sites)
ids = [s["id"] for s in pages]
assert len(ids) == len(set(ids)) and 150 <= len(ids) <= 190, len(ids)

# sitemap: absolute https URLs under the project path, no duplicates, every one maps to a file
ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
locs = [u.text for u in ET.parse(ROOT / "sitemap.xml").getroot().findall("s:url/s:loc", ns)]
assert len(locs) == len(set(locs)) == len(ids) + 2
for loc in locs:
    assert loc.startswith(seo.BASE_URL + "/") and loc.endswith("/"), loc
    rel = loc[len(seo.BASE_URL) + 1:]
    assert (ROOT / rel / "index.html").exists() if rel else (ROOT / "index.html").exists(), loc
assert "lastmod" not in (ROOT / "sitemap.xml").read_text(encoding="utf-8")
robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
assert "Allow: /" in robots and "Disallow" not in robots and "Sitemap: %s/sitemap.xml" % seo.BASE_URL in robots

by_id = {s["id"]: s for s in sites}
titles, descs = set(), set()
coord = re.compile(r"\d{2}\.\d{4,}")
for sid in ids:
    text = (ROOT / "sites" / sid / "index.html").read_text(encoding="utf-8")
    title = re.search(r"<title>(.+?)</title>", text).group(1)
    desc = re.search(r'<meta name="description" content="(.+?)">', text).group(1)
    assert title not in titles and desc not in descs, sid
    titles.add(title)
    descs.add(desc)
    assert 'rel="canonical" href="%s/sites/%s/"' % (seo.BASE_URL, sid) in text
    assert "noindex" not in text
    # nothing dynamic or private: no script other than JSON-LD, no network call, no coordinates, no Worker host
    assert len(re.findall(r"<script\b", text)) == 1 and 'type="application/ld+json"' in text, sid
    for banned in ("fetch(", "XMLHttpRequest", "workers.dev", "lat", "lon", "geo", "GeoCoordinates", "latitude", "longitude"):
        assert banned not in text.replace("tooltip", ""), (sid, banned)
    assert not coord.search(text), (sid, coord.search(text).group(0))
    for ld in re.findall(r'<script type="application/ld\+json">(.+?)</script>', text):
        json.loads(ld)
    assert "../../?site=%s" % sid in text
    # Whole-word scan covers meta descriptions and accidentally joined source bird names too.
    sensitive_pattern = re.compile(r'(?<![가-힣])(?:%s)(?![가-힣])' % '|'.join(re.escape(w) for w in sorted(seo.NEST_SENSITIVE, key=len, reverse=True)))
    assert not sensitive_pattern.search(text), sid
    # relative links resolve
    for href in re.findall(r'href="(\.\./[^"?#]*)"', text):
        target = (ROOT / "sites" / sid / href).resolve()
        assert (target / "index.html").exists(), (sid, href)
names = [s["name"] for s in pages]
assert len(names) == len(set(names)), "page labels must be unique"
hub = (ROOT / "sites/index.html").read_text(encoding="utf-8")
assert all('href="%s/"' % sid in hub for sid in ids)
index = (ROOT / "index.html").read_text(encoding="utf-8")
assert 'href="sites/"' in index and 'rel="canonical" href="%s/"' % seo.BASE_URL in index and 'name="description"' in index
# the share previews stay out of the index so they do not compete with sites/<ID>/
for share in (ROOT / "share").glob("*/index.html"):
    assert 'name="robots" content="noindex,follow"' in share.read_text(encoding="utf-8"), share
print("OK: %d indexable pages, %d sitemap URLs" % (len(ids), len(locs)))
