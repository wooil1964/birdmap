#!/usr/bin/env python3
"""Generate one static share page and preview image per birding site.

Preview crawlers (Naver Cafe, KakaoTalk, ...) do not run JavaScript, so the map's
?site=<ID> URL always previews as the map itself. This builds a real HTML file per
site under share/<ID>/ whose <head> already contains that site's own OG tags, plus
the 1200x630 PNG those tags point at.

Source of truth is the runtime siteData inside index.html, so re-running this after
a site is added or renamed is enough - no per-site file is written by hand.

Preview images: no per-site photo with confirmed copyright and source exists in this
repository, so every card is the shared 들뫼생태연구회 design carrying only the site
name, region and other fields already published on the map. No coordinates are drawn
on the card or written into the description, so a sensitive site's exact location is
never exposed by the preview.

Usage:
  python .github/scripts/build_share_pages.py            # write share/
  python .github/scripts/build_share_pages.py --check    # fail if share/ is stale
  python .github/scripts/build_share_pages.py --skip-images
"""
from __future__ import annotations

import argparse
import html
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_data import load_runtime_sites  # noqa: E402

BASE_URL = "https://wooil1964.github.io/birdmap"
SHARE_DIR = ROOT / "share"
IMAGE_DIR = SHARE_DIR / "og"
IMAGE_SIZE = (1200, 630)

# 카드에는 지도에 이미 공개된 항목만 넣는다. 좌표는 넣지 않는다.
FONT_CANDIDATES = (
    "C:/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Bold.otf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
)
INK = (26, 43, 30)
MUTED = (90, 110, 95)
BAND = (46, 93, 52)
PAPER = (247, 251, 247)
ACCENT = (232, 243, 233)


def text_of(site: dict, key: str) -> str:
    return str(site.get(key) or "").strip()


def page_title(site: dict) -> str:
    return "%s — 전국 탐조지도" % text_of(site, "name")


def page_description(site: dict) -> str:
    """지도에 이미 있는 값만 조합한다. 새 관찰 사실이나 미확인 정보를 만들지 않는다."""
    facts = [f for f in (text_of(site, "region"), text_of(site, "env"), text_of(site, "mainBirdGroup")) if f]
    parts = [" · ".join(facts)] if facts else []
    intro = text_of(site, "oneLineIntro")
    if intro:
        parts.append(intro)
    parts.append("들뫼생태연구회 전국 탐조지도에서 기상·조석과 탐조 정보를 확인하세요.")
    return " ".join(parts)


def share_url(site: dict, base_url: str) -> str:
    return "%s/share/%s/" % (base_url, site["id"])


def image_url(site: dict, base_url: str) -> str:
    return "%s/share/og/%s.png" % (base_url, site["id"])


def map_url(site: dict, base_url: str) -> str:
    return "%s/?site=%s" % (base_url, site["id"])


def page_html(site: dict, base_url: str = BASE_URL) -> str:
    """수집기가 자바스크립트 없이 읽을 수 있도록 메타태그를 HTML에 그대로 넣는다."""
    e = html.escape
    name = text_of(site, "name")
    title = page_title(site)
    description = page_description(site)
    rows = [
        ("지역", text_of(site, "region")),
        ("환경유형", text_of(site, "env")),
        ("대표 조류군", text_of(site, "mainBirdGroup")),
        ("추천 시기", text_of(site, "bestSeason")),
    ]
    # 지도 이동은 사람 브라우저에서만 일어난다. 서버 리다이렉트를 쓰지 않으므로
    # 수집기는 이 HTML과 메타태그를 그대로 읽는다.
    relative_map = "../../?site=%s" % site["id"]
    body_rows = "".join(
        '<div class="row"><dt>%s</dt><dd>%s</dd></div>' % (e(label), e(value))
        for label, value in rows if value
    )
    return """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s | 들뫼생태연구회</title>
<meta name="description" content="%(description)s">
<link rel="canonical" href="%(share_url)s">
<meta property="og:type" content="article">
<meta property="og:site_name" content="들뫼생태연구회 전국 탐조지도">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(description)s">
<meta property="og:url" content="%(share_url)s">
<meta property="og:image" content="%(image_url)s">
<meta property="og:image:secure_url" content="%(image_url)s">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="%(name)s 탐조지 미리보기 이미지">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%(title)s">
<meta name="twitter:description" content="%(description)s">
<meta name="twitter:image" content="%(image_url)s">
<style>
body{margin:0;background:#f7fbf7;color:#1a2b1e;font-family:'Malgun Gothic',Arial,sans-serif;line-height:1.6}
.wrap{max-width:640px;margin:0 auto;padding:24px 16px 40px}
.brand{font-size:13px;color:#5a6e5f;letter-spacing:.02em}
h1{margin:6px 0 4px;font-size:28px}
.intro{margin:0 0 16px;color:#33503a}
img.card{display:block;width:100%%;height:auto;border:1px solid #cfe0d2;border-radius:8px;margin:0 0 18px}
dl{margin:0 0 20px;border-top:1px solid #dce9de}
.row{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #dce9de}
dt{flex:0 0 96px;margin:0;color:#5a6e5f;font-size:14px}
dd{margin:0;font-size:15px}
a.open{display:inline-block;padding:12px 18px;background:#2e5d34;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold}
.note{margin-top:16px;font-size:13px;color:#5a6e5f}
</style>
</head>
<body>
<div class="wrap">
<p class="brand">들뫼생태연구회 · 전국 탐조지도</p>
<h1>%(name)s</h1>
<p class="intro">%(description)s</p>
<img class="card" src="../og/%(id)s.png" width="1200" height="630" alt="%(name)s 탐조지 미리보기 이미지">
<dl>%(rows)s</dl>
<p><a class="open" href="%(relative_map)s">탐조지도 열기</a></p>
<p class="note">잠시 후 탐조지도의 %(name)s 위치로 이동합니다. 바로 가려면 위 버튼을 누르세요.</p>
</div>
<script>
/* 사람이 보는 브라우저에서만 이동한다. 미리보기 수집기는 이 스크립트를 실행하지 않으므로
   위 메타태그를 그대로 읽는다. 서버 리다이렉트는 쓰지 않는다. */
setTimeout(function(){location.replace(%(relative_map_js)s);},1200);
</script>
</body>
</html>
""" % {
        "title": e(title),
        "description": e(description),
        "name": e(name),
        "id": e(str(site["id"])),
        "share_url": e(share_url(site, base_url)),
        "image_url": e(image_url(site, base_url)),
        "relative_map": e(relative_map),
        "relative_map_js": "'" + relative_map.replace("'", "\\'") + "'",
        "rows": body_rows,
    }


def load_font(size: int):
    from PIL import ImageFont

    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    raise RuntimeError(
        "한글 글꼴을 찾지 못했습니다. 다음 중 하나가 필요합니다: " + ", ".join(FONT_CANDIDATES)
    )


def fit_font(draw, text: str, max_width: int, start: int, floor: int):
    size = start
    while size > floor:
        font = load_font(size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 2
    return load_font(floor)


def ellipsize(draw, text: str, font, max_width: int) -> str:
    if draw.textlength(text, font=font) <= max_width:
        return text
    while text and draw.textlength(text + "…", font=font) > max_width:
        text = text[:-1]
    return text + "…"


def card_image(site: dict):
    """공통 디자인 카드. 좌표는 그리지 않는다."""
    from PIL import Image, ImageDraw

    width, height = IMAGE_SIZE
    image = Image.new("RGB", IMAGE_SIZE, PAPER)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width, 104), fill=BAND)
    draw.rectangle((0, height - 12, width, height), fill=BAND)

    draw.text((64, 34), "들뫼생태연구회 · 전국 탐조지도", font=load_font(38), fill=(255, 255, 255))

    inner = width - 128
    name = text_of(site, "name")
    name_font = fit_font(draw, name, inner, 96, 46)
    draw.text((64, 178), name, font=name_font, fill=INK)

    region_font = load_font(46)
    draw.text((64, 306), ellipsize(draw, text_of(site, "region"), region_font, inner),
              font=region_font, fill=MUTED)

    meta = " · ".join(f for f in (text_of(site, "env"), text_of(site, "mainBirdGroup")) if f)
    if meta:
        meta_font = load_font(34)
        draw.rectangle((64, 380, width - 64, 452), fill=ACCENT)
        draw.text((84, 398), ellipsize(draw, meta, meta_font, inner - 40), font=meta_font, fill=INK)

    intro_font = load_font(32)
    draw.text((64, 486), ellipsize(draw, text_of(site, "oneLineIntro"), intro_font, inner),
              font=intro_font, fill=MUTED)

    foot_font = load_font(26)
    foot = "wooil1964.github.io/birdmap"
    draw.text((64, 560), foot, font=foot_font, fill=MUTED)
    tag = "권역 ID %s" % site["id"]
    draw.text((width - 64 - draw.textlength(tag, font=foot_font), 560), tag, font=foot_font, fill=MUTED)
    return image


def build(base_url: str, skip_images: bool, check: bool) -> int:
    sites = load_runtime_sites()
    wanted: dict[Path, bytes] = {}
    for site in sites:
        wanted[SHARE_DIR / str(site["id"]) / "index.html"] = page_html(site, base_url).encode("utf-8")

    stale = []
    for path, data in wanted.items():
        # git 의 autocrlf 체크아웃에서도 같은 판정이 나오도록 줄바꿈을 정규화해 비교한다.
        current = path.read_text(encoding="utf-8").replace("\r\n", "\n") if path.exists() else None
        if current != data.decode("utf-8"):
            stale.append(path)
    existing_pages = {p for p in SHARE_DIR.glob("*/index.html")}
    orphans = sorted(existing_pages - set(wanted))

    image_paths = {IMAGE_DIR / ("%s.png" % site["id"]) for site in sites}
    missing_images = sorted(p for p in image_paths if not p.exists())
    orphan_images = sorted(set(IMAGE_DIR.glob("*.png")) - image_paths)

    if check:
        problems = stale + orphans + missing_images + orphan_images
        if problems:
            print("share/ 가 최신이 아닙니다. build_share_pages.py 를 다시 실행하세요:")
            for path in problems[:20]:
                print("  -", path.relative_to(ROOT))
            return 1
        print("share/ 최신 상태입니다 (%d곳)" % len(sites))
        return 0

    for path, data in wanted.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    for path in orphans:
        path.unlink()
        if not any(path.parent.iterdir()):
            path.parent.rmdir()

    if not skip_images:
        IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        for site in sites:
            card_image(site).save(IMAGE_DIR / ("%s.png" % site["id"]), format="PNG", optimize=True)
        for path in orphan_images:
            path.unlink()

    print("share/ 생성 완료: %d곳%s" % (len(sites), " (이미지 생략)" if skip_images else ""))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=BASE_URL, help="공유 페이지의 절대 주소 기준")
    parser.add_argument("--skip-images", action="store_true", help="HTML만 생성")
    parser.add_argument("--check", action="store_true", help="생성물이 최신인지 확인만 한다")
    args = parser.parse_args()
    return build(args.base_url.rstrip("/"), args.skip_images, args.check)


if __name__ == "__main__":
    raise SystemExit(main())
