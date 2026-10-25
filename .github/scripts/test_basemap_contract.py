import subprocess
import unittest
from pathlib import Path
from report_archive_contract import without_approved_basemap as without_basemap, BASEMAP_HEAD as HEAD, BASEMAP_INITIALIZATION as INIT

ROOT = Path(__file__).resolve().parents[2]
# main before the base-map selector (PR #40); its index.html is the pre-selector page.
BASE = 'ff3949a1d3ce867c26d62111e8f0963b2b518eab'


class BasemapScopeTests(unittest.TestCase):
    def test_only_the_two_hooks_differ_from_main_before_the_selector(self):
        before = subprocess.check_output(['git', 'show', BASE + ':index.html'], cwd=ROOT).decode('utf-8').replace('\r\n', '\n')
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(without_basemap(current), before)

    def test_unrelated_changes_survive_scope_normalization(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8')
        for old, new in [('var RECENT_REPORT_LIMIT=15;', 'var RECENT_REPORT_LIMIT=99;'), ("PUBLICATION_MAX_AGE=5000", "PUBLICATION_MAX_AGE=99999")]:
            self.assertIn(old, current)
            self.assertNotEqual(without_basemap(current.replace(old, new, 1)), without_basemap(current))

    def test_duplicate_or_missing_hooks_fail_closed(self):
        current = (ROOT / 'index.html').read_text(encoding='utf-8').replace('\r\n', '\n')
        for literal in (HEAD, INIT):
            for modified in (current.replace(literal, '', 1), current + literal):
                with self.assertRaises(ValueError):
                    without_basemap(modified)

    def test_text_without_the_selector_is_unchanged(self):
        self.assertEqual(without_basemap('existing engine\n'), 'existing engine\n')


if __name__ == '__main__':
    unittest.main()
