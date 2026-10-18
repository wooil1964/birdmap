"""New public birding areas: provenance, unchanged old records and coordinate parity."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote

from site_data import load_runtime_sites, load_worker_sites, compare_sites

ROOT = Path(__file__).resolve().parents[2]
SOURCE = json.loads((ROOT / 'data/central-birding-sites-20261018.json').read_text(encoding='utf-8'))


class CentralSitesTests(unittest.TestCase):
    def test_exact_old_records_and_exact_ten_additions(self):
        before = subprocess.check_output(['git', 'show', SOURCE['baselineCommit'] + ':index.html'], cwd=ROOT)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'index.html'
            path.write_bytes(before)
            old = load_runtime_sites(path)
        current = load_runtime_sites()
        self.assertEqual(current[:190], old)
        self.assertEqual(current[190:200], [r['site'] for r in SOURCE['records']])
        self.assertEqual([s['id'] for s in current[190:200]], [str(i) for i in range(196, 206)])
        self.assertEqual(len(current), 202)
        self.assertTrue(all('삽교' not in s['name'] for s in current[190:]))

    def test_coordinate_links_and_weather_match_reviewed_source(self):
        report = compare_sites(load_runtime_sites(), load_worker_sites())
        self.assertFalse(any(v for v in report.values() if isinstance(v, list)), report)
        rules = json.loads((ROOT / 'weather_rules.json').read_text(encoding='utf-8'))['rules']
        for record in SOURCE['records']:
            s = record['site']
            with self.subTest(site=s['name']):
                self.assertTrue(record['coordinateSource'].startswith('https://'))
                self.assertEqual(len(record['speciesSources']), 2)
                self.assertEqual(s['kakaoMapUrl'].split(',')[-2:], [str(s['lat']), str(s['lon'])])
                self.assertIn(f"/{s['lat']}/{s['lon']}?{s['lat']},{s['lon']},10", s['windyUrl'])
                self.assertIn(record['pointLabel'], unquote(s['naverMapUrl']))
                self.assertIn(s['name'], s['searchText'])
                self.assertTrue(all(b.strip() in s['searchText'] for b in s['birds'].split(',')))
                self.assertIn(s['weatherRuleKey'], rules)
                self.assertFalse(s['showTide'] or s['showWave'] or s['pelagic'])
                self.assertIn('현재 출현을 뜻하지 않습니다', s['localBirdingTip'])
                self.assertIn('대표 탐조 위치', s['localBirdingTip'])
                self.assertNotIn('호사비오리', s['birds'])
                self.assertTrue(all(b.strip() for b in s['birds'].split(',')))


if __name__ == '__main__':
    unittest.main()
