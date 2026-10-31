import subprocess
import unittest
from pathlib import Path
from island_nearby_contract import without_island_nearby, HOOK, FOLLOWING
from site_data import load_runtime_sites, load_worker_sites, compare_sites
import report_archive_contract as archive_contract

ROOT = Path(__file__).resolve().parents[2]
CURRENT = (ROOT / 'index.html').read_text(encoding='utf-8')
BASE = 'e7dbdc8'


class PilotContractTests(unittest.TestCase):
    def test_exact_baseline_restored_including_legacy_ferry_and_map(self):
        before = subprocess.check_output(['git', 'show', BASE + ':index.html'], cwd=ROOT).decode().replace('\r\n', '\n')
        # PR #40 has its own exact basemap normalization. Compose it if that PR is merged.
        normalize_basemap = getattr(archive_contract, 'without_approved_basemap', lambda value: value)
        self.assertEqual(normalize_basemap(without_island_nearby(CURRENT)), normalize_basemap(before))
        self.assertEqual(normalize_basemap(without_island_nearby(CURRENT.replace('\n', '\r\n'))), normalize_basemap(before))
        self.assertEqual(without_island_nearby(before), before)

    def test_partial_duplicate_or_modified_additions_are_rejected(self):
        for literal in ['/* island-nearby:styles:start */\n', '/* island-nearby:styles:end */\n',
                        '/* island-nearby:script:start */\n', '/* island-nearby:script:end */\n\n', HOOK]:
            for bad in [CURRENT.replace(literal, '', 1), CURRENT + literal]:
                with self.assertRaises(ValueError):
                    without_island_nearby(bad)
        for old, new in [('.island-nearby-search summary{min-height:44px', '.island-nearby-search summary{min-height:4px'), ('전남 신안 홍도', '통영 홍도'),
                         (HOOK + FOLLOWING, FOLLOWING + HOOK)]:
            with self.assertRaises(ValueError):
                without_island_nearby(CURRENT.replace(old, new, 1))
        with self.assertRaises(ValueError):
            without_island_nearby(CURRENT + '\nISLAND_NEARBY_PILOT')

    def test_unrelated_edits_remain_visible(self):
        changed = CURRENT.replace('var RECENT_REPORT_LIMIT=15;', 'var RECENT_REPORT_LIMIT=99;', 1)
        self.assertNotEqual(without_island_nearby(changed), without_island_nearby(CURRENT))

    def test_runtime_records_coordinates_and_worker_contract_unchanged(self):
        sites = load_runtime_sites()
        self.assertEqual(len(sites), 240)
        self.assertEqual(len({s['id'] for s in sites}), 240)
        result = compare_sites(sites, load_worker_sites())
        self.assertEqual(result['commonIdCount'], 240)
        self.assertFalse(any(v for v in result.values() if isinstance(v, list)), result)


if __name__ == '__main__':
    unittest.main()
