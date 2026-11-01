"""The PR #62 exception restores exact HTML and rejects malformed or unrelated edits."""
import subprocess
import unittest
from pathlib import Path
from marker_visibility_contract import MARKER_VISIBILITY_ISLANDS, without_marker_visibility

ROOT = Path(__file__).resolve().parents[2]
CURRENT = (ROOT / 'index.html').read_text(encoding='utf-8')


class MarkerVisibilityScopeTests(unittest.TestCase):
    def test_exact_four_reviewed_changes_restore_pr_base(self):
        base = subprocess.check_output(['git', 'show', 'df900110bb21be678e096fa3ded905359105b7ea:index.html'], cwd=ROOT).decode('utf-8').replace('\r\n', '\n')
        self.assertEqual(without_marker_visibility(CURRENT), base)
        self.assertEqual(without_marker_visibility(CURRENT.replace('\n', '\r\n')), base)
        self.assertEqual(without_marker_visibility(base), base)

    def test_missing_duplicate_partial_and_tampered_changes_fail_closed(self):
        for old, new in MARKER_VISIBILITY_ISLANDS:
            for changed in (CURRENT.replace(new, '', 1), CURRENT + new,
                            CURRENT.replace(new, old, 1), CURRENT.replace(new, new + '/* tampered marker */', 1)):
                with self.subTest(fragment=new[:60]):
                    # Unrelated appended text remains visible to the historical equality check.
                    if '/* tampered marker */' in changed:
                        self.assertIn('/* tampered marker */', without_marker_visibility(changed))
                    else:
                        with self.assertRaises(ValueError):
                            without_marker_visibility(changed)
        with self.assertRaises(ValueError):
            without_marker_visibility(CURRENT.replace('birdmapMarkers.refreshSites();', 'birdmapMarkers.refreshSites(999);', 1))
        with self.assertRaises(ValueError):
            without_marker_visibility(CURRENT + '\nbirdmapMarkers.unreviewed();\n')

    def test_unrelated_security_coordinates_and_count_edits_remain_visible(self):
        clean = without_marker_visibility(CURRENT)
        for old, new in [('PUBLICATION_MAX_AGE=5000', 'PUBLICATION_MAX_AGE=999999'),
                         ('var RECENT_REPORT_LIMIT=15;', 'var RECENT_REPORT_LIMIT=99;'),
                         ('fixedSpotId:fixed.id', 'fixedSpotId:"wrong"')]:
            self.assertIn(old, CURRENT)
            self.assertNotEqual(without_marker_visibility(CURRENT.replace(old, new, 1)), clean)


if __name__ == '__main__':
    unittest.main()
