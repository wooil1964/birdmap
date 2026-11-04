import subprocess
import unittest
from pathlib import Path
from current_location_contract import GPS_ISLANDS, REPORT_PICK_SEARCH_HEAD, without_current_location
from marker_visibility_contract import without_marker_visibility

ROOT = Path(__file__).resolve().parents[2]
# These reverse-patch contracts were written for the retired whole-page freeze. They now run against the
# last page checked under that freeze (C-1 merge a6245a5), so they keep verifying the normalizers without
# pinning the live page. Live data, markers, routes and external code are guarded by site_data_contract.py
# and the browser harnesses (docs/site-data-guard/guard.cjs).
FROZEN = 'a6245a5f18a32430f454955188ec55331b78c7eb'
CURRENT = subprocess.check_output(['git', 'show', FROZEN + ':index.html'], cwd=ROOT).decode('utf-8')


class GpsScopeTests(unittest.TestCase):
    def test_only_exact_reviewed_gps_changes_differ_from_main(self):
        baseline = subprocess.check_output(['git', 'show', 'a810b0341b1a63441fb49f6b2076778556e0eb1a:index.html'], cwd=ROOT).decode().replace('\r\n', '\n')
        self.assertEqual(without_current_location(CURRENT), baseline)

    def test_missing_duplicated_or_modified_islands_fail_closed(self):
        # Exercise the GPS islands after reversing the separately verified marker additions.
        current = without_marker_visibility(CURRENT)
        for _, new in GPS_ISLANDS:
            for text in (current.replace(new, '', 1), current + new, current.replace(new, new.replace('birdmap-location', 'wrong-location', 1), 1) if 'birdmap-location' in new else current.replace(new, new.replace('fixedSpotId', 'wrongId'), 1)):
                with self.assertRaises(ValueError):
                    without_current_location(text)

    def test_report_pick_search_head_is_exact_and_fail_closed(self):
        self.assertEqual(CURRENT.count(REPORT_PICK_SEARCH_HEAD), 1)
        script_only = REPORT_PICK_SEARCH_HEAD.splitlines(True)[1]
        for text in (CURRENT.replace(REPORT_PICK_SEARCH_HEAD, REPORT_PICK_SEARCH_HEAD * 2, 1),
                     CURRENT.replace(REPORT_PICK_SEARCH_HEAD, script_only, 1),
                     CURRENT.replace('</body>', script_only + '</body>', 1)):
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
