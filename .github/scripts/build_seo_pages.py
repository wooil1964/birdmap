#!/usr/bin/env python3
"""Generate static, crawlable guide pages (sites/<ID>/), the hub (sites/), sitemap.xml and robots.txt.

Search crawlers should not need JavaScript, the Workers or D1 to read a birding site's
public facts. Every page here is plain HTML with no <script>, no fetch and no external
request, so a crawl never reaches Cloudflare.

Source is the runtime siteData in index.html, using only fields the map already shows.
Never written: coordinates (no lat/lon, no geo JSON-LD), reports, news, reporter names.

A site gets its own indexable page only when it has enough distinct facts:
  - at least MIN_SPECIES listed species, with region, environment and season present, and
  - for sites sharing a name (island spots such as 어청도), a species list that differs from
    the pages already kept for that name; copies are reachable through map links on the kept page.
The rest stay reachable on the map (?site=<ID>) and get no page and no sitemap entry.

Usage:
  python .github/scripts/build_seo_pages.py            # write sites/, sitemap.xml, robots.txt
  python .github/scripts/build_seo_pages.py --check    # fail if any of them is stale
"""
from __future__ import annotations

import argparse
import html
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_data import load_runtime_sites  # noqa: E402

BASE_URL = "https://wooil1964.github.io/birdmap"
SITES_DIR = ROOT / "sites"
MIN_SPECIES = 3
DUP_JACCARD = 0.5
# 번식·둥지 위치 추정에 쓰일 수 있는 종은 검색용 페이지에 싣지 않는다(지도의 공개 자료에는 그대로 있다).
# 목록은 보수적으로 잡았으며, 바꾸려면 여기만 고치고 다시 생성한다.
NEST_SENSITIVE = frozenset("""긴점박이올빼미 수리부엉이 솔부엉이 올빼미 팔색조 황새 따오기 호사비오리 뜸부기 흰눈썹뜸부기
검독수리 뿔쇠오리 알락쇠오리 쇠부리슴새""".split())
SIDO_ORDER = ["서울", "인천", "경기", "서울·경기", "강원", "충남", "충북", "대전", "대전·충북", "세종", "충북·경북",
              "전북", "전북·충남", "전남", "전남·전북·경남", "전북·경남", "광주", "경북", "경남", "대구", "부산", "울산", "제주", "중국"]

CSS = (
    "body{margin:0;background:#f7fbf7;color:#1a2b1e;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;line-height:1.65}"
    ".wrap{max-width:760px;margin:0 auto;padding:20px 16px 48px}"
    "nav.crumb{font-size:13px;color:#5a6e5f;margin-bottom:8px}nav.crumb a{color:#2e5d34}"
    "h1{margin:4px 0 8px;font-size:26px;line-height:1.3}h2{margin:26px 0 8px;font-size:18px;border-bottom:1px solid #dce9de;padding-bottom:4px}"
    ".lead{margin:0 0 14px;color:#33503a}"
    "dl{margin:0}.row{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #e4efe5}"
    "dt{flex:0 0 96px;margin:0;color:#5a6e5f;font-size:14px}dd{margin:0;font-size:15px;min-width:0;overflow-wrap:anywhere}"
    "ul{margin:6px 0;padding-left:20px}li{margin:3px 0}"
    ".birds{display:flex;flex-wrap:wrap;gap:6px;padding:0;list-style:none}.birds li{margin:0;background:#e8f3e9;border-radius:14px;padding:3px 11px;font-size:14px}"
    "a.open{display:inline-block;padding:12px 18px;background:#2e5d34;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold}"
    ".note{margin-top:20px;font-size:13px;color:#5a6e5f}"
    ".sites{columns:2;column-gap:20px;padding-left:18px}@media(max-width:480px){.sites{columns:1}}"
    "a{color:#2e5d34}"
)


def e(value) -> str:
    return html.escape(str(value), quote=True)


def text_of(site: dict, key: str) -> str:
    return str(site.get(key) or "").strip()


def species_of(site: dict) -> list[str]:
    raw = text_of(site, "birds")
    group = text_of(site, "mainBirdGroup")
    if group and raw.startswith(group):
        raw = raw[len(group):]
    seen: list[str] = []
    for name in raw.split(","):
        name = name.strip()
        if name and name not in seen and name not in NEST_SENSITIVE:
            seen.append(name)
    return seen


def split_tags(value: str) -> list[str]:
    return [t.strip() for t in value.replace("·", ";").split(";") if t.strip()]


def jaccard(a: list[str], b: list[str]) -> float:
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 1.0


def indexable_sites(sites: list[dict]) -> list[dict]:
    """Pages to publish. Same-name sites are separate spots, so one that lists clearly different
    species (Jaccard < DUP_JACCARD against every kept page of that name) gets its own page titled
    "<name> 지점 <id>"; a copy of an already kept list is left to the kept page's map links.
    Returned dicts are copies: "name" is the page label, "_otherIds" the same-name sites without a page."""
    kept: dict[str, list[dict]] = {}
    result = []
    for site in sites:  # siteData order = id order
        name = text_of(site, "name")
        species = species_of(site)
        if len(species) < MIN_SPECIES or not all(text_of(site, k) for k in ("region", "env", "bestSeason")):
            continue
        peers = kept.setdefault(name, [])
        if any(jaccard(species, species_of(p)) >= DUP_JACCARD for p in peers):
            continue
        result.append(dict(site, name=name if not peers else "%s 지점 %s" % (name, site["id"]), _base=name))
        peers.append(site)
    for page in result:
        page["_otherIds"] = [str(s["id"]) for s in sites if text_of(s, "name") == page["_base"]
                             and s["id"] not in {p["id"] for p in kept[page["_base"]]}] if page["name"] == page["_base"] else []
    return result


def page_url(site: dict) -> str:
    return "%s/sites/%s/" % (BASE_URL, site["id"])


def map_href(site: dict) -> str:
    return "../../?site=%s" % site["id"]


def page_title(site: dict) -> str:
    return "%s 탐조 가이드 | %s 주요 조류·추천 시기 | 전국탐조지도" % (text_of(site, "name"), text_of(site, "region"))


def page_description(site: dict) -> str:
    birds = ", ".join(species_of(site)[:4])
    return ("%s %s의 탐조 환경(%s)과 대표 조류(%s 등), 추천 시기(%s)를 확인하고 전국탐조지도에서 위치를 살펴보세요."
            % (text_of(site, "region"), text_of(site, "name"), text_of(site, "env"), birds, text_of(site, "bestSeason")))


def cautions(site: dict) -> list[str]:
    items = ["야생 조류와 서식지를 보호하기 위해 거리를 두고 관찰하고, 번식 중인 새와 둥지에는 접근하지 마세요."]
    if site.get("island") or site.get("pelagic"):
        items.append("섬·해상 탐조지입니다. 배편과 기상 상황은 출발 전에 직접 확인하세요.")
    if text_of(site, "tideSensitive") == "예":
        items.append("조석의 영향을 받는 탐조지입니다. 방문 전 물때를 확인하세요.")
    if text_of(site, "waveSensitive") == "예":
        items.append("파도·바람의 영향을 받는 탐조지입니다. 당일 해상 기상을 확인하세요.")
    if text_of(site, "country") not in ("", "대한민국"):
        items.append("국외 탐조지입니다. 현지 출입 규정과 안전 정보를 따로 확인하세요.")
    return items


def related_sites(site: dict, pages: list[dict], limit: int = 8) -> list[dict]:
    others = [s for s in pages if s["id"] != site["id"] and text_of(s, "sido") == text_of(site, "sido")]
    others.sort(key=lambda s: (text_of(s, "sigungu") != text_of(site, "sigungu"), int(s["id"])))
    return others[:limit]


def head(title: str, description: str, canonical: str, og_image: str | None, og_type: str) -> str:
    image = ""
    if og_image:
        image = ('<meta property="og:image" content="%(i)s">\n<meta property="og:image:width" content="1200">\n'
                 '<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="%(i)s">\n') % {"i": e(og_image)}
    return (
        '<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        "<title>%(t)s</title>\n<meta name=\"description\" content=\"%(d)s\">\n"
        '<link rel="canonical" href="%(c)s">\n'
        '<meta property="og:type" content="%(ot)s">\n<meta property="og:site_name" content="들뫼생태연구회 전국 탐조지도">\n'
        '<meta property="og:locale" content="ko_KR">\n<meta property="og:title" content="%(t)s">\n'
        '<meta property="og:description" content="%(d)s">\n<meta property="og:url" content="%(c)s">\n'
        '%(img)s<meta name="twitter:card" content="summary_large_image">\n'
        '<meta name="twitter:title" content="%(t)s">\n<meta name="twitter:description" content="%(d)s">\n'
    ) % {"t": e(title), "d": e(description), "c": e(canonical), "ot": og_type, "img": image}


def json_ld(data: dict) -> str:
    # "<" is escaped so no field value can close the script element.
    return '<script type="application/ld+json">%s</script>\n' % json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def breadcrumb(items: list[tuple[str, str]]) -> dict:
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}


def site_page(site: dict, pages: list[dict]) -> str:
    name = text_of(site, "name")
    title, desc = page_title(site), page_description(site)
    species = species_of(site)
    rows = [("지역", text_of(site, "region")), ("환경", text_of(site, "env")),
            ("탐조 유형", text_of(site, "environmentBirdingLabel")), ("대표 조류군", text_of(site, "mainBirdGroup"))]
    season = [("추천 시기", text_of(site, "bestSeason")), ("추천 월", ", ".join(split_tags(text_of(site, "bestMonth")))),
              ("추천 시간대", ", ".join(split_tags(text_of(site, "bestTime"))))]
    field = [("권장 렌즈", text_of(site, "lensRecommend")), ("촬영 거리", text_of(site, "photoDistance")),
             ("차량 탐조", text_of(site, "carBirding")), ("도보 수준", text_of(site, "walkingLevel")),
             ("주차", text_of(site, "parkingV23")), ("화장실", text_of(site, "restroomV23"))]

    def dl(pairs):
        body = "".join('<div class="row"><dt>%s</dt><dd>%s</dd></div>' % (e(k), e(v)) for k, v in pairs if v)
        return "<dl>%s</dl>" % body if body else ""

    features = [t for t in text_of(site, "birdingFeature").split(";") if t.strip()]
    feature_html = ("<ul>%s</ul>" % "".join("<li>%s</li>" % e(t.strip()) for t in features)) if features else ""
    field_html = dl(field)
    related = related_sites(site, pages)
    related_html = ""
    if related:
        related_html = "<h2>같은 지역의 다른 탐조지</h2><ul>%s</ul>" % "".join(
            '<li><a href="../%s/">%s</a> (%s)</li>' % (e(s["id"]), e(text_of(s, "name")), e(text_of(s, "region"))) for s in related)
    if site.get("_otherIds"):
        related_html += "<h2>지도의 같은 이름 탐조 지점</h2><ul>%s</ul>" % "".join(
            '<li><a href="../../?site=%s">%s 지점 %s (지도에서 열기)</a></li>' % (e(i), e(site["_base"]), e(i)) for i in site["_otherIds"])
    crumbs = [("전국 탐조지도", BASE_URL + "/"), ("탐조지 가이드", BASE_URL + "/sites/"), (name, page_url(site))]
    out = head(title, desc, page_url(site), "%s/share/og/%s.png?v=2" % (BASE_URL, site["id"]), "article")
    out += json_ld(breadcrumb(crumbs))
    out += "<style>%s</style>\n</head>\n<body>\n<div class=\"wrap\">\n" % CSS
    out += '<nav class="crumb"><a href="../../">전국 탐조지도</a> › <a href="../">탐조지 가이드</a> › %s</nav>\n' % e(name)
    out += "<h1>%s 탐조 가이드</h1>\n" % e(name)
    out += '<p class="lead">%s</p>\n' % e("%s의 탐조 환경과 대표 조류, 추천 시기를 정리했습니다." % text_of(site, "region"))
    out += '<p><a class="open" href="%s">전국탐조지도에서 %s 열기</a></p>\n' % (e(map_href(site)), e(name))
    out += "<h2>탐조지 개요</h2>\n%s\n" % dl(rows)
    if feature_html:
        out += "<h2>탐조 특징</h2>\n%s\n" % feature_html
    out += "<h2>대표 관찰 조류</h2>\n<ul class=\"birds\">%s</ul>\n" % "".join("<li>%s</li>" % e(s) for s in species)
    out += "<h2>추천 탐조 시기</h2>\n%s\n" % dl(season)
    if field_html:
        out += "<h2>현장 정보</h2>\n%s\n" % field_html
    out += "<h2>탐조 시 주의 사항</h2>\n<ul>%s</ul>\n" % "".join("<li>%s</li>" % e(c) for c in cautions(site))
    out += related_html + "\n"
    out += '<p style="margin-top:24px"><a class="open" href="%s">전국탐조지도에서 %s 열기</a></p>\n' % (e(map_href(site)), e(name))
    out += ('<p class="note">들뫼생태연구회 전국 탐조지도의 공개 탐조지 정보입니다. 정확한 위치, 실시간 기상·조석, 최근 출현 제보는 '
            '지도에서 확인할 수 있으며, 이 페이지에는 포함되지 않습니다. 번식에 민감한 일부 종은 보호를 위해 이 페이지에 싣지 않았습니다.</p>\n</div>\n</body>\n</html>\n')
    return out


def hub_page(pages: list[dict]) -> str:
    title = "전국 탐조지 목록 | 지역별 탐조 가이드 | 전국탐조지도"
    desc = "전국 %d곳의 탐조지를 시·도별로 모아, 탐조지마다 대표 조류와 추천 시기를 정리한 가이드입니다." % len(pages)
    groups: dict[str, list[dict]] = {}
    for s in pages:
        groups.setdefault(text_of(s, "sido"), []).append(s)
    order = sorted(groups, key=lambda k: (SIDO_ORDER.index(k) if k in SIDO_ORDER else len(SIDO_ORDER), k))
    out = head(title, desc, BASE_URL + "/sites/", None, "website")
    out += json_ld(breadcrumb([("전국 탐조지도", BASE_URL + "/"), ("탐조지 가이드", BASE_URL + "/sites/")]))
    out += "<style>%s</style>\n</head>\n<body>\n<div class=\"wrap\">\n" % CSS
    out += '<nav class="crumb"><a href="../">전국 탐조지도</a> › 탐조지 가이드</nav>\n<h1>전국 탐조지 가이드</h1>\n'
    out += '<p class="lead">%s</p>\n<p><a class="open" href="../">전국탐조지도 열기</a></p>\n' % e(desc)
    for sido in order:
        out += '<h2 id="sido-%s">%s (%d곳)</h2>\n<ul class="sites">' % (e(sido), e(sido), len(groups[sido]))
        for s in sorted(groups[sido], key=lambda s: (text_of(s, "sigungu"), int(s["id"]))):
            out += '<li><a href="%s/">%s</a> <small>%s</small></li>' % (e(s["id"]), e(text_of(s, "name")), e(text_of(s, "sigungu")))
        out += "</ul>\n"
    out += '<p class="note">탐조지 정보는 전국 탐조지도의 공개 자료를 그대로 옮긴 것입니다. 위치와 실시간 정보는 지도에서 확인하세요.</p>\n</div>\n</body>\n</html>\n'
    return out


def sitemap_xml(pages: list[dict]) -> str:
    urls = [BASE_URL + "/", BASE_URL + "/sites/"] + [page_url(s) for s in pages]
    # No <lastmod>: the repo has no reliable per-page modification date, and a wrong one is worse than none.
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "".join("  <url><loc>%s</loc></url>\n" % e(u) for u in urls) + "</urlset>\n")


ROBOTS = ("User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % BASE_URL)


def build_all(sites: list[dict]) -> dict[Path, str]:
    pages = indexable_sites(sites)
    files = {SITES_DIR / "index.html": hub_page(pages), ROOT / "sitemap.xml": sitemap_xml(pages), ROOT / "robots.txt": ROBOTS}
    for s in pages:
        files[SITES_DIR / str(s["id"]) / "index.html"] = site_page(s, pages)
    return files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    files = build_all(load_runtime_sites())
    if args.check:
        stale = [str(p.relative_to(ROOT)) for p, c in files.items() if not p.exists() or p.read_text(encoding="utf-8") != c]
        extra = sorted(str(p.relative_to(ROOT)) for p in SITES_DIR.glob("*/index.html") if p not in files)
        if stale or extra:
            print("stale:", stale[:10], "extra:", extra[:10])
            return 1
        print("sites/ in sync: %d pages" % (len(files) - 3))
        return 0
    if SITES_DIR.exists():
        shutil.rmtree(SITES_DIR)
    for p, c in files.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(c, encoding="utf-8", newline="\n")
    print("wrote %d site pages + hub, sitemap.xml, robots.txt" % (len(files) - 3))
    return 0


if __name__ == "__main__":
    sys.exit(main())
