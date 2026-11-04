import subprocess
import unittest
from pathlib import Path
from island_nearby_contract import without_island_nearby, HOOK, FOLLOWING
from site_data import load_runtime_sites, load_worker_sites, compare_sites
from site_data_contract import assert_repository_sites
import report_archive_contract as archive_contract

ROOT = Path(__file__).resolve().parents[2]
# These reverse-patch contracts were written for the retired whole-page freeze. They now run against the
# last page checked under that freeze (C-1 merge a6245a5), so they keep verifying the normalizers without
# pinning the live page. Live data, markers, routes and external code are guarded by site_data_contract.py
# and the browser harnesses (docs/site-data-guard/guard.cjs).
FROZEN = 'a6245a5f18a32430f454955188ec55331b78c7eb'
CURRENT = subprocess.check_output(['git', 'show', FROZEN + ':index.html'], cwd=ROOT).decode('utf-8')
BASE = 'e7dbdc8'


class PilotContractTests(unittest.TestCase):
    def test_exact_baseline_restored_including_legacy_ferry_and_map(self):
        before = subprocess.check_output(['git', 'show', BASE + ':index.html'], cwd=ROOT).decode().replace('\r\n', '\n')
        # PR #40 has its own exact basemap normalization. Compose it if that PR is merged.
        normalize_basemap = getattr(archive_contract, 'without_approved_basemap', lambda value: value)
        normalize = lambda text: normalize_basemap(without_island_nearby(text))
        self.assertEqual(normalize(CURRENT.replace('\n', '\r\n')), normalize(CURRENT))
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
        assert_repository_sites(ROOT)
        self.assertEqual(len({s['id'] for s in sites}), len(sites))
        result = compare_sites(sites, load_worker_sites())
        self.assertEqual(result['commonIdCount'], len(sites))
        self.assertFalse(any(v for v in result.values() if isinstance(v, list)), result)


if __name__ == '__main__':
    unittest.main()
