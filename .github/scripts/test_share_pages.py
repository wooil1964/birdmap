"""Regression tests for the per-site share pages and their preview metadata."""
import html
import re
import unittest
from pathlib import Path

import build_share_pages as share
from site_data import load_runtime_sites

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://wooil1964.github.io/birdmap"
CHECKED_IDS = ("19", "193", "122", "20", "21")


def meta(document: str, prop: str) -> str:
    found = re.findall(
        r'<meta (?:property|name)="%s" content="([^"]*)">' % re.escape(prop), document
    )
    assert len(found) >= 1, "%s meta missing" % prop
    return html.unescape(found[0])


class SharePageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sites = load_runtime_sites()
        cls.by_id = {str(s["id"]): s for s in cls.sites}

    def test_generated_output_is_current(self):
        """탐조지를 추가·개명했는데 share/ 를 다시 만들지 않으면 여기서 걸린다."""
        self.assertEqual(share.build(BASE, skip_images=False, check=True), 0)

    def test_every_site_has_a_page_and_an_image(self):
        for site in self.sites:
            sid = str(site["id"])
            self.assertTrue((ROOT / "share" / sid / "index.html").is_file(), sid)
            self.assertTrue((ROOT / "share" / "og" / ("%s.png" % sid)).is_file(), sid)
        pages = list((ROOT / "share").glob("*/index.html"))
        self.assertEqual(len(pages), len(self.sites))

    def test_preview_metadata_is_unique_per_site(self):
        titles, images, urls = set(), set(), set()
        for site in self.sites:
            document = share.page_html(site, BASE)
            titles.add(meta(document, "og:title"))
            images.add(meta(document, "og:image"))
            urls.add(meta(document, "og:url"))
        self.assertEqual(len(images), len(self.sites))
        self.assertEqual(len(urls), len(self.sites))
        # 어청도·흑산도처럼 같은 이름으로 등록된 권역이 있어 제목은 이름 수만큼만 다르다.
        # 이름을 지어내지 않고 그대로 쓰고, 구분은 고유한 URL·이미지(카드에 권역 ID 표기)가 맡는다.
        self.assertEqual(len(titles), len({str(s["name"]) for s in self.sites}))

    def test_checked_sites_carry_their_own_name_and_links(self):
        for sid in CHECKED_IDS:
            site = self.by_id[sid]
            document = (ROOT / "share" / sid / "index.html").read_text(encoding="utf-8")
            self.assertIn(site["name"], meta(document, "og:title"))
            self.assertEqual(meta(document, "og:url"), "%s/share/%s/" % (BASE, sid))
            self.assertEqual(
                meta(document, "og:image"),
                "%s/share/og/%s.png?v=%s" % (BASE, sid, share.IMAGE_VERSION),
            )
            self.assertIn('href="../../?site=%s"' % sid, document)

    def test_absolute_urls_only_for_og_image_and_url(self):
        for site in self.sites:
            document = share.page_html(site, BASE)
            for prop in ("og:url", "og:image", "og:image:secure_url", "twitter:image"):
                self.assertTrue(meta(document, prop).startswith("https://"), prop)

    def test_no_coordinates_are_exposed(self):
        """민감한 번식지의 상세 위치가 공유 페이지로 새어 나가지 않는지 확인한다."""
        for site in self.sites:
            document = (ROOT / "share" / str(site["id"]) / "index.html").read_text(encoding="utf-8")
            for value in (site["lat"], site["lon"]):
                for shape in ("%.4f", "%.5f", "%.6f", "%r"):
                    self.assertNotIn(shape % float(value), document)

    def test_site_text_is_escaped_and_not_invented(self):
        made_up = re.compile(r"관찰됨|목격|개체 확인|번식 확인")
        for site in self.sites:
            document = share.page_html(site, BASE)
            self.assertNotRegex(meta(document, "og:description"), made_up)
            self.assertEqual(
                meta(document, "og:description"), share.page_description(site)
            )
        hostile = dict(self.by_id["19"], name='유부도"><script>x()</script>')
        document = share.page_html(hostile, BASE)
        self.assertNotIn("<script>x()</script>", document)
        self.assertIn("&lt;script&gt;", document)

    def test_crawler_reads_metadata_without_javascript(self):
        """이동은 스크립트로만 하고 meta refresh·서버 리다이렉트는 쓰지 않는다."""
        document = (ROOT / "share" / "19" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("http-equiv", document.lower())
        head = document[: document.index("</head>")]
        for prop in ("og:title", "og:description", "og:image", "og:url"):
            self.assertIn('"%s"' % prop, head)
        self.assertIn("location.replace('../../?site=19')", document)

    def test_site_name_survives_a_centre_crop(self):
        """네이버 카페처럼 좌우를 잘라 보여 줘도 탐조지명이 남아야 한다."""
        widest = 0
        for site in self.sites:
            card = share.measure_card(site)
            self.assertLessEqual(len(card["lines"]), share.NAME_MAX_LINES, site["name"])
            self.assertLessEqual(card["max_width"], share.SAFE_WIDTH, site["name"])
            widest = max(widest, card["max_width"])
        # 선언한 안전 폭이 정사각형 가운데 잘라내기(630px)보다 좁아야 의미가 있다.
        self.assertLessEqual(share.SAFE_WIDTH, min(share.IMAGE_SIZE))
        self.assertLessEqual(widest, share.SAFE_WIDTH)

    def test_card_shows_only_the_name_and_the_group_line(self):
        """소개문·조류군·URL·권역 ID는 카드에서 빼고 HTML 설명에만 남긴다."""
        site = self.by_id["19"]
        card = share.measure_card(site)
        self.assertEqual(card["lines"], [site["name"]])
        drawn = "".join(card["lines"])
        for removed in (site["oneLineIntro"], site["mainBirdGroup"], site["region"]):
            self.assertNotIn(removed, drawn)
        description = share.page_description(site)
        for kept in (site["oneLineIntro"], site["mainBirdGroup"], site["region"]):
            self.assertIn(kept, description)

    def test_preview_images_are_png_of_the_declared_size(self):
        for sid in CHECKED_IDS:
            data = (ROOT / "share" / "og" / ("%s.png" % sid)).read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n", sid)
            width = int.from_bytes(data[16:20], "big")
            height = int.from_bytes(data[20:24], "big")
            self.assertEqual((width, height), share.IMAGE_SIZE, sid)


if __name__ == "__main__":
    unittest.main()
