import subprocess
import unittest
from pathlib import Path
from current_location_contract import GPS_ISLANDS, without_current_location

ROOT = Path(__file__).resolve().parents[2]
CURRENT = (ROOT / 'index.html').read_text(encoding='utf-8')


class GpsScopeTests(unittest.TestCase):
    def test_only_exact_reviewed_gps_changes_differ_from_main(self):
        baseline = subprocess.check_output(['git', 'show', 'a810b0341b1a63441fb49f6b2076778556e0eb1a:index.html'], cwd=ROOT).decode().replace('\r\n', '\n')
        self.assertEqual(without_current_location(CURRENT), baseline)

    def test_missing_duplicated_or_modified_islands_fail_closed(self):
        for _, new in GPS_ISLANDS:
            for text in (CURRENT.replace(new, '', 1), CURRENT + new, CURRENT.replace(new, new.replace('birdmap-location', 'wrong-location', 1), 1) if 'birdmap-location' in new else CURRENT.replace(new, new.replace('fixedSpotId', 'wrongId'), 1)):
                with self.assertRaises(ValueError):
                    without_current_location(text)

    def test_unrelated_security_and_count_edits_remain_visible(self):
        clean = without_current_location(CURRENT)
        for old, new in [('PUBLICATION_MAX_AGE=5000', 'PUBLICATION_MAX_AGE=999999'), ('var RECENT_REPORT_LIMIT=15;', 'var RECENT_REPORT_LIMIT=99;')]:
            self.assertIn(old, CURRENT)
            self.assertNotEqual(without_current_location(CURRENT.replace(old, new, 1)), clean)
        self.assertEqual(without_current_location('existing engine\n'), 'existing engine\n')


if __name__ == '__main__':
    unittest.main()
