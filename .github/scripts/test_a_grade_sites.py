"""A-grade draft (IDs 235-238, 240-246): exact preservation of 229 sites, fixed points, notices and fail-closed registry SQL."""
import json
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path

from site_data import load_runtime_sites, load_worker_sites, compare_sites
import update_tide

ROOT = Path(__file__).resolve().parents[2]
SOURCE = json.loads((ROOT / 'data/a-grade-birding-sites-20261031.json').read_text(encoding='utf-8'))
NEW = ['235', '236', '237', '238', '240', '241', '242', '243', '244', '245', '247']
TIDE = {'236': 'DT_0017', '242': 'DT_0031', '243': 'DT_0049', '245': 'SO_0578'}
# Reviewed CSV coordinates (docs/reviews/new-site-candidates/2026-10-31-a-grade-candidates.csv), copied without correction.
FIXED = {'235': (37.39456841, 126.67584323), '236': (36.92386071, 126.37864557), '237': (36.99669917, 126.68439256),
         '238': (37.00506048, 127.99680001), '240': (35.58090006, 126.6683087), '241': (35.89910514, 127.11056907),
         '242': (34.02750252, 127.30886522), '243': (34.9727173, 127.7588314), '244': (35.8067936, 129.50550638),
         '245': (34.62922944, 128.54798234), '247': (34.49389, 126.617132)}


class AGradeSitesTests(unittest.TestCase):
    def test_original_229_records_are_byte_equal_and_only_reviewed_records_follow(self):
        old = subprocess.check_output(['git', 'show', SOURCE['baselineCommit'] + ':index.html'], cwd=ROOT)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'index.html'
            path.write_bytes(old)
            before = load_runtime_sites(path)
        current = load_runtime_sites()
        self.assertEqual(len(before), 229)
        self.assertEqual(current[:229], before)
        self.assertEqual(current[229:], [r['site'] for r in SOURCE['records']])
        self.assertEqual([s['id'] for s in current[229:]], NEW)
        self.assertEqual(len(current), 240)
        ids = [s['id'] for s in current]
        self.assertNotIn('239', ids)
        self.assertNotIn('246', ids)  # Reserved: access not confirmed.
        for retired in ('161', '166', '171', '177', '184'):
            self.assertNotIn(retired, ids)
        self.assertFalse(any('삽교' in s['name'] or '동림' in s['name'] or '이포' in s['name'] or '마동' in s['name'] for s in current[229:]))
        new_names = [s['name'] for s in current[229:]]
        self.assertEqual(len(new_names), len(set(new_names)))
        self.assertFalse(set(new_names) & {s['name'] for s in before})
        for s in current[229:]:
            self.assertEqual(list(s), list(before[-1]) + ['birdingTypeExplicit', 'speciesEvidence'])
            self.assertEqual((s['birdingTypeExplicit'], s['speciesEvidence']), (True, '근거 부족'))
        self.assertFalse(any('birdingTypeExplicit' in s or 'speciesEvidence' in s for s in current[:229]))

    def test_fixed_points_links_and_worker_contract(self):
        report = compare_sites(load_runtime_sites(), load_worker_sites())
        self.assertEqual(report['commonIdCount'], 240)
        self.assertFalse(any(v for v in report.values() if isinstance(v, list)), report)
        for r in SOURCE['records']:
            s, c = r['site'], r['coordinateReview']
            with self.subTest(id=s['id']):
                self.assertEqual((s['lat'], s['lon']), FIXED[s['id']])
                self.assertEqual((c['lat'], c['lon']), FIXED[s['id']])
                self.assertEqual(s['kakaoMapUrl'].split(',')[-2:], [str(s['lat']), str(s['lon'])])
                self.assertEqual(s['windyUrl'], f"https://www.windy.com/{s['lat']}/{s['lon']}?{s['lat']},{s['lon']},10")
                self.assertTrue(s['naverMapUrl'].startswith('https://map.naver.com/v5/search/'))
                self.assertFalse(s['pelagic'] or s['rare'] or s['mijo'] or s['recommend5'])
                self.assertEqual(s['island'], s['id'] in ('242', '245'))
                if not s['island']:  # The popup derives 섬탐조 from these words in env/habitatType.
                    self.assertFalse(any(w in s['env'] + s['habitatType'] for w in ('섬', '도서')))
                self.assertEqual(s['markerVar'], 'marker_birdmap_site_' + s['id'])
        sites = {r['site']['id']: r['site'] for r in SOURCE['records']}
        self.assertIn('OSM', sites['243']['localBirdingTip'])
        self.assertIn('node/4317260103', sites['243']['dataSource'])
        self.assertIn('충주댐 물문화관', sites['238']['localBirdingTip'])
        self.assertNotIn('246', sites)  # 마동호: reserved until access is confirmed.

    def test_species_and_seasons_stay_empty_without_recent_evidence(self):
        for r in SOURCE['records']:
            s = r['site']
            with self.subTest(id=s['id']):
                self.assertEqual(s['birds'], '')
                self.assertEqual(s['seasons'], [])
                self.assertEqual((s['bestSeason'], s['seasonTags'], s['bestMonth']), ('추천 계절 미확정', '추천 계절 미확정', ''))
                self.assertEqual((s['mainBirdGroup'], s['siteGrade']), ('', ''))
                self.assertEqual(s['weatherRuleKey'], 'general_birding')
                self.assertEqual(r['evidenceReview']['status'], '근거 부족')
                for text in (s['searchText'], s['oneLineIntro']):
                    # Place names (e.g. 저어새생태학습관) may contain a species word; nothing else may.
                    text = text.replace(s['name'], '').replace(r['coordinateReview']['pointLabel'], '')
                    for word in ('저어새', '가창오리', '흰발농게', '점박이물범', '도요', '오리'):
                        self.assertNotIn(word, text)
                for phrase in ('현재 출현을 뜻하지 않습니다', '재생음', '촬영 확인 수준'):
                    self.assertIn(phrase, s['localBirdingTip'])

    def test_required_notice_corrections(self):
        sites = {r['site']['id']: r['site']['localBirdingTip'] for r in SOURCE['records']}
        nd = sites['235']
        self.assertIn('2025년 남동유수지 저어새 수치는 1,074마리', nd)
        self.assertIn('남동유수지 수치가 아닙니다', nd)
        self.assertNotIn('355', nd)
        self.assertNotIn('잠기', sites['236'])
        self.assertIn('2026년 3월 27일', sites['236'])
        self.assertNotIn('언제나', sites['236'])
        self.assertIn('22~30번 전방 지정 갯벌·해상', sites['237'])
        self.assertIn('해측 통제구역 진입을 안내하지 않습니다', sites['237'])
        self.assertIn('열목개~등대섬 탐방로는 시설물 안전 문제로 부분통제 중', sites['245'])
        self.assertIn('물때가 맞아도 통제구간에 진입할 수 없습니다', sites['245'])
        self.assertIn('출입 허용을 뜻하지 않습니다', sites['245'])
        for sid in ('235', '240', '244'):
            self.assertIn('조석 미연동 사유', sites[sid])

    def test_official_access_notes_never_claim_unverified_areas(self):
        recs = {r['site']['id']: r for r in SOURCE['records']}
        tip = {sid: r['site']['localBirdingTip'] for sid, r in recs.items()}
        self.assertIn('6코스 신천습지길', tip['241'])
        self.assertIn('완주군 2021-11-02', tip['241'])
        self.assertIn('광양시 2025-01-13', tip['243'])
        self.assertIn('경주시 2025-07-10', tip['244'])
        # Pier and harbour work areas stay explicitly unverified.
        self.assertIn('부두 시설 위 보행 허용 범위는 공식 자료로 확인하지 못했습니다', tip['243'])
        self.assertIn('항만 작업구역과 방파제 통제 여부는 공식 자료로 확인하지 못했습니다', tip['244'])
        for sid in ('241', '243', '244'):
            self.assertIn('길찾기 권장 목적지', tip[sid])
            self.assertIn('출입', tip[sid] if sid != '241' else '출입구')
            self.assertTrue(recs[sid]['accessReview']['officialSources'])
        self.assertEqual(recs['244']['site']['tideSensitive'], '예')  # Not linked is not "no tidal effect".
        self.assertEqual(recs['244']['site']['tideUse'], '미연동')
        self.assertEqual([r['id'] for r in SOURCE['reservedIds']], ['239', '246'])
        self.assertTrue(SOURCE['d1Verification']['status'].startswith('PASS'))

    def test_247_daeheungsa_forest_path(self):
        rec = next(r for r in SOURCE['records'] if r['site']['id'] == '247')
        s, tip = rec['site'], rec['site']['localBirdingTip']
        self.assertEqual((s['name'], s['region'], s['env']), ('대흥사 장춘숲길', '전남 해남군', '산림·계곡'))
        self.assertEqual((s['lat'], s['lon']), (34.49389, 126.617132))  # Given 34.493890 kept as is.
        self.assertIn('장춘동숲길', s['searchText'])
        self.assertEqual(s['environmentBirdingLabel'], '산림탐조')
        self.assertFalse(s['island'] or s['pelagic'] or s['showTide'] or s['showWave'])
        self.assertEqual((s['tideUse'], s['birds'], s['seasons']), ('아니오', '', []))
        self.assertIn('두륜산도립공원', tip)
        self.assertIn('산책로 데크 위의 점이 아닙니다', tip)  # Representative point is beside the road.
        self.assertIn('길찾기 권장 목적지', tip)
        self.assertIn('매표소 정확 위치', rec['accessReview']['unverified'])
        self.assertIn('ID 247', SOURCE['d1Verification']['pending247'])
        mapping = json.loads((ROOT / 'tide_station_mapping.json').read_text(encoding='utf-8'))
        self.assertNotIn('247', mapping['sites'])

    def test_tide_links_only_reviewed_four_and_daily_targets_resolve(self):
        mapping = json.loads((ROOT / 'tide_station_mapping.json').read_text(encoding='utf-8'))
        records = {r['site']['id']: r['site'] for r in SOURCE['records']}
        for sid in NEW:
            s = records[sid]
            if sid in TIDE:
                self.assertTrue(s['showTide'])
                self.assertEqual(s['tideUse'], '예')
                self.assertEqual(mapping['sites'][sid]['tideStationCode'], TIDE[sid])
                self.assertTrue(mapping['sites'][sid]['needsReview'])
                self.assertEqual(mapping['sites'][sid]['apiVerifiedDates'], [])
            else:
                self.assertFalse(s['showTide'])
                self.assertNotIn(sid, mapping['sites'])
        self.assertEqual(mapping['siteCount'], 104)
        resolved, _ = update_tide.resolve_tide_sites(update_tide.load_tide_sites(), mapping['sites'])
        self.assertEqual(len(resolved), 104)
        self.assertEqual({s['id']: s['stationCode'] for s in resolved if s['id'] in TIDE}, TIDE)
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        month = html.split("var MONTH_TIDE_SITE_IDS=new Set([", 1)[1].split("])", 1)[0]
        self.assertFalse(any(f"'{sid}'" in month for sid in NEW))  # Monthly set unchanged (28).


class AGradeRegistrySqlTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''CREATE TABLE sites(site_id TEXT PRIMARY KEY,site_name TEXT,lat REAL,lon REAL,registry_source TEXT,registry_revision TEXT,source_record_json TEXT,created_at TEXT,retired_at TEXT);
          CREATE TABLE system_state(id INTEGER PRIMARY KEY,mode TEXT,generation INTEGER);INSERT INTO system_state VALUES(1,'NORMAL',7);
          CREATE TABLE reports(id TEXT,site_id TEXT,note TEXT);INSERT INTO reports VALUES('keep','14','unchanged');
          CREATE TABLE checklists(id TEXT,site_id TEXT);''')
        self.keys = 'site_id site_name lat lon registry_source registry_revision source_record_json created_at retired_at'.split()
        self.old = [dict(zip(self.keys, [s['id'], 'Synthetic ' + s['id'], 36.5, 127.5, 'synthetic', 'old', '{}', '2026-01-01', None])) for s in load_runtime_sites()[:229]]
        self.new = [dict(self.old[0], site_id=r['site']['id'], site_name=r['site']['name'], lat=r['site']['lat'], lon=r['site']['lon']) for r in SOURCE['records']]
        self.db.executemany('INSERT INTO sites VALUES(?,?,?,?,?,?,?,?,?)', [tuple(s[k] for k in self.keys) for s in self.old])
        self.db.commit()
        folder = ROOT / 'docs/a-grade-sites-20261031'
        self.sql, self.undo = (folder / 'append-registry.sql').read_text(encoding='utf-8'), (folder / 'rollback-registry.sql').read_text(encoding='utf-8')

    def tearDown(self):
        self.db.close()

    def snapshot(self):
        return list(self.db.execute('SELECT * FROM sites ORDER BY site_id'))

    def apply(self, g=7, old=None, new=None):
        self.db.execute(self.sql, [g, json.dumps(self.old if old is None else old), json.dumps(self.new if new is None else new)])
        self.db.commit()

    def rollback(self, g=7, rows=None):
        self.db.execute(self.undo, [g, json.dumps(self.new if rows is None else rows)])
        self.db.commit()

    def test_atomic_append_keeps_229_and_reports_and_refuses_replay_and_239(self):
        before = self.snapshot()
        self.apply()
        self.assertEqual(len(self.snapshot()), 240)
        self.assertEqual([r for r in self.snapshot() if r[0] not in NEW], before)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM sites WHERE site_id=?', ['239']).fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT note FROM reports').fetchone()[0], 'unchanged')
        with self.assertRaises(sqlite3.DatabaseError):
            self.apply()
        self.assertEqual(len(self.snapshot()), 240)

    def test_drift_stale_partial_out_of_range_and_maintenance_abort(self):
        before = self.snapshot()
        drift = json.loads(json.dumps(self.old))
        drift[0]['lat'] = 37
        reserved = self.new[:-1] + [dict(self.new[-1], site_id='239')]
        for args in [(6, None, None), (7, drift, None), (7, self.old[:-1], None), (7, None, self.new[:-1]),
                     (7, None, [self.new[0]] * 11), (7, None, reserved)]:
            with self.subTest(args=str(args)[:60]):
                with self.assertRaises(sqlite3.DatabaseError):
                    self.apply(*args)
                self.assertEqual(self.snapshot(), before)
        self.db.execute("UPDATE system_state SET mode='READ_ONLY_MAINTENANCE'")
        with self.assertRaises(sqlite3.DatabaseError):
            self.apply()
        self.assertEqual(self.snapshot(), before)

    def test_rollback_removes_only_unreferenced_unchanged_new_rows(self):
        before = self.snapshot()
        self.apply()
        refused = [("INSERT INTO reports VALUES('new','242','referenced')", "DELETE FROM reports WHERE id='new'"),
                   ("INSERT INTO checklists VALUES('c','245')", "DELETE FROM checklists WHERE id='c'"),
                   ("UPDATE sites SET site_name='edited' WHERE site_id='236'", "UPDATE sites SET site_name='%s' WHERE site_id='236'" % self.new[1]['site_name'])]
        for change, undo in refused:
            with self.subTest(change=change):
                self.db.execute(change)
                with self.assertRaises(sqlite3.DatabaseError):  # Refused as a whole; data kept.
                    self.rollback()
                self.assertEqual(len(self.snapshot()), 240)
                self.db.execute(undo)
        with self.assertRaises(sqlite3.DatabaseError):
            self.rollback(g=8)
        self.assertEqual(len(self.snapshot()), 240)
        self.rollback()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.db.execute('SELECT note FROM reports').fetchone()[0], 'unchanged')


if __name__ == '__main__':
    unittest.main()
