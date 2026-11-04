"""Jeju addition contracts: exact preservation, public access points and safe failure."""
import hashlib
import json
import re
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from report_archive_contract import without_report_archive
from pathlib import Path
from urllib.parse import unquote, urlsplit

from site_data import load_runtime_sites, load_worker_sites, compare_sites
from site_data_contract import (assert_repository_sites, assert_engine_matches_base,
                                baseline_ref, baseline_bytes, historical_sites, assert_mapping_extension)
import build_seo_pages as seo
import update_weather as weather

ROOT = Path(__file__).resolve().parents[2]
NEW_IDS = ['206','207','208','209','210','211','212','213']
SOURCE = json.loads((ROOT/'data/jeju-birding-sites-20261018.json').read_text(encoding='utf-8'))

# Only generated weather/tide files stay byte-locked to the PR base. The rest are content-checked:
#   site-picker.js  -> reports-api/test/site-picker.test.mjs (reports-api CI step)
#   weather_rules.json -> test_weather.py WeatherRulesContractTests
#   notices.json    -> validate_notices() below
#   sites-seed.mjs  -> test_jeju_registry.mjs rejection-path tests
JEJU_BASE_FILE_CONTRACTS = (
    'weather_today.json', 'weather_week.json', 'tide_today.json', 'tide_month.json',
)

# Fields index.html actually reads from notices.json (noticeCard, activeNotice, noticeLinkedSites,
# appendNoticeRoutePoints, weeklyEditorialRecommendations). Unknown keys are rejected to catch typos.
NOTICE_FIELDS = {'title', 'summary', 'content', 'start', 'end', 'published', 'image', 'link', 'linkText',
                 'siteIds', 'siteId', 'sites', 'site', 'points', 'weeklyRecommendations'}
NOTICE_DATE = re.compile(r'\d{4}-\d{2}-\d{2}\Z')


def _unique_pairs(pairs):
    keys = [key for key, _ in pairs]
    if len(keys) != len(set(keys)):
        raise ValueError('duplicate JSON key')
    return dict(pairs)


def _no_constant(value):
    raise ValueError('non-finite JSON number')


def validate_notices(text, sites, root=ROOT):
    """Raise ValueError for notices the page would mis-render, silently drop or link unsafely."""
    from datetime import date
    ids, names = {str(s['id']) for s in sites}, {s['name'] for s in sites}

    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def text_field(notice, key, where, required=False):
        if key in notice or required:
            require(isinstance(notice.get(key), str), f'{where}: {key} must be text')

    def coordinate(point, where):
        require(isinstance(point, dict), where + ': coordinate must be an object')
        lat, lon = point.get('lat'), point.get('lon')
        require(type(lat) in (int, float) and type(lon) in (int, float) and -90 <= lat <= 90
                and -180 <= lon <= 180 and (lat, lon) != (0, 0), where + ': invalid coordinate')

    def site_ref(value, where):
        require(type(value) in (int, str) and str(value).strip() in ids | names, where + ': unknown site')

    notices = json.loads(text, object_pairs_hook=_unique_pairs, parse_constant=_no_constant)
    require(isinstance(notices, list), 'notices.json must be a list')
    weekly_published = 0
    for index, notice in enumerate(notices):
        where = f'notice {index}'
        require(isinstance(notice, dict), where + ': must be an object')
        require(set(notice) <= NOTICE_FIELDS, where + ': unknown field ' + ', '.join(sorted(set(notice) - NOTICE_FIELDS)))
        require(isinstance(notice.get('title'), str) and notice['title'].strip(), where + ': title required')
        text_field(notice, 'content', where, required=True)
        for key in ('summary', 'linkText', 'image', 'link'):
            text_field(notice, key, where)
        require(type(notice.get('published')) is bool, where + ': published must be true/false')
        days = []
        for key in ('start', 'end'):
            if key in notice:
                value = notice[key]
                require(isinstance(value, str) and NOTICE_DATE.match(value), f'{where}: {key} must be YYYY-MM-DD')
                try:
                    days.append(date.fromisoformat(value))
                except ValueError:
                    raise ValueError(f'{where}: {key} is not a real date') from None
        require(len(days) < 2 or days[0] <= days[1], where + ': start after end')
        link = notice.get('link', '')
        if link:  # index.html assigns this straight to <a href>.
            parts = urlsplit(link)
            require(parts.scheme in ('http', 'https') and parts.hostname, where + ': link must be http(s)')
        image = notice.get('image', '')
        if image.strip():
            parts = urlsplit(image.strip())
            if parts.scheme or image.strip().startswith('//'):
                require(parts.scheme in ('http', 'https') and parts.hostname, where + ': image must be http(s)')
            else:
                require('..' not in image and (Path(root) / image.strip().lstrip('/')).is_file(),
                        where + ': image file missing')
        for key in ('siteIds', 'sites'):
            if key in notice:
                require(isinstance(notice[key], list), f'{where}: {key} must be a list')
                for value in notice[key]:
                    site_ref(value, where)
        for key in ('siteId', 'site'):
            if notice.get(key) is not None:
                site_ref(notice[key], where)
        if 'points' in notice:
            require(isinstance(notice['points'], list) and notice['points'], where + ': points must be a list')
            for point in notice['points']:
                require(isinstance(point, dict) and set(point) <= {'name', 'lat', 'lon', 'access'},
                        where + ': unknown point field')
                require(isinstance(point.get('name'), str) and point['name'].strip(), where + ': point name required')
                coordinate(point, where)
                if point.get('access') is not None:
                    coordinate(point['access'], where + ' access')
        if 'weeklyRecommendations' in notice:
            entries = notice['weeklyRecommendations']
            require(isinstance(entries, list), where + ': weeklyRecommendations must be a list')
            for item in entries:
                require(isinstance(item, dict) and set(item) <= {'siteId', 'name', 'reason'} and 'siteId' in item,
                        where + ': invalid weekly recommendation')
                require(type(item['siteId']) in (int, str) and str(item['siteId']) in ids, where + ': unknown weekly site')
                for key in ('name', 'reason'):
                    text_field(item, key, where)
            weekly_published += notice['published']
    # weeklyEditorialRecommendations() reads only the first published list; a second one is silently ignored.
    require(weekly_published <= 1, 'more than one published weeklyRecommendations list')
    return notices


def assert_jeju_base_files(root, ref):
    for file in JEJU_BASE_FILE_CONTRACTS:
        current = (Path(root) / file).read_bytes().replace(b'\r\n', b'\n')
        if current != baseline_bytes(root, ref, file).replace(b'\r\n', b'\n'):
            raise AssertionError('Base file contract changed: ' + file)


class JejuSitesTests(unittest.TestCase):
    def test_pr_base_protection_and_historical_reviewed_schema(self):
        assert_repository_sites(ROOT)
        old=historical_sites(ROOT,SOURCE['baselineCommit'])
        reviewed=[r['site'] for r in SOURCE['records']]
        self.assertEqual([s['id'] for s in reviewed],NEW_IDS)
        for s in reviewed:self.assertEqual(set(s),set(old[-1]))

    def test_public_access_coordinates_worker_and_all_map_links(self):
        report=compare_sites(load_runtime_sites(),load_worker_sites())
        self.assertEqual(report['commonIdCount'],len(load_runtime_sites()))
        self.assertFalse(any(v for v in report.values() if isinstance(v,list)),report)
        expected=[(33.550053,126.69415),(33.24452585,126.5596972),(33.430924,126.595761),(33.282955,126.27152),(33.491318,126.811386),(33.511246,126.898868),(33.473698,126.686472),(33.48976,126.792654)]
        self.assertEqual(len(SOURCE['records']),len(expected))
        for i,(r,coordinate) in enumerate(zip(SOURCE['records'],expected)):
            s=r['site']
            self.assertEqual((s['lat'],s['lon']),coordinate)
            self.assertEqual(s['kakaoMapUrl'].split(',')[-2:],[str(v) for v in coordinate])
            self.assertIn(f"/{s['lat']}/{s['lon']}?{s['lat']},{s['lon']},10",s['windyUrl'])
            self.assertIn(r['pointLabel'] if s['id']!='211' else s['name'],unquote(s['naverMapUrl']))  # 211 searches the findable beach name.
            self.assertIn(r['pointLabel'],s['localBirdingTip'])
            self.assertGreaterEqual(len(r['speciesSources']),2 if i<2 else 1)
            self.assertGreaterEqual(len(r['accessSources']),2 if i<2 else 1)
            if 2<=i<=4:  # VisitJeju official point and the reproducible GBIF query.
                self.assertIn('visitjeju.net',r['accessSources'][0]);self.assertIn('gbif.org',r['speciesSources'][0])
            self.assertFalse(s['island'] or s['pelagic'] or s['showTide'])

    def test_no_species_sighting_nest_or_rarity_promotion(self):
        for r in SOURCE['records'][:2]:
            s=r['site']
            self.assertEqual(s['birds'],'원앙')
            self.assertFalse(s['rare'] or s['mijo'] or s['recommend5'])
            self.assertEqual(s['siteGrade'],'')
            self.assertIn('과거',s['bestSeason'])
            self.assertIn('현재 출현을 뜻하지 않습니다',s['localBirdingTip'])
            self.assertIn('보장하지 않습니다',s['localBirdingTip'])
            self.assertIn('드론·재생음',s['localBirdingTip'])
            self.assertEqual(s['ebirdHotspotUrl'],'')
            self.assertEqual(s['ksaUrl'],'')
            self.assertEqual(s['localDeparturePoint'],'')  # Existing UI labels this field as a boat departure point.
        self.assertEqual(seo.indexable_sites([r['site'] for r in SOURCE['records'][:2]]),[])

    def test_forest_sites_list_only_common_unprotected_species_with_protection_notice(self):
        shared=(ROOT/'reports-api/src/shared.js').read_text(encoding='utf-8')
        protected=set(re.findall(r"'([^']+)'",shared.split('SENSITIVE_SPECIES = [')[1].split(']')[0]))
        self.assertIn('팔색조',protected)
        for r in SOURCE['records'][2:5]:
            s=r['site'];birds=[b.strip() for b in s['birds'].split(',')]
            self.assertFalse(set(birds)&(protected|{'긴꼬리딱새','두견이','휘파람새','섬휘파람새','팔색조'}),s['id'])
            self.assertFalse(s['rare'] or s['mijo'] or s['recommend5'] or s['island'] or s['pelagic'])
            self.assertEqual((s['siteGrade'],s['ebirdHotspotUrl'],s['ksaUrl'],s['localDeparturePoint']),('','','',''))
            self.assertEqual(s['weatherRuleKey'],'forest_songbird')
            for phrase in ['현재 출현을 뜻하지 않습니다','보장하지 않습니다','둥지 탐색','재생음','드론','번식기']:
                self.assertIn(phrase,s['localBirdingTip'],s['id'])
        review=SOURCE['forestReview20261019']
        self.assertEqual([c['decision'][:2] for c in review['candidates']].count('등록'),4)
        self.assertEqual(len(review['candidates']),7)

    def test_jongdal_coastal_record(self):
        shared=(ROOT/'reports-api/src/shared.js').read_text(encoding='utf-8')
        protected=set(re.findall(r"'([^']+)'",shared.split('SENSITIVE_SPECIES = [')[1].split(']')[0]))
        r=SOURCE['records'][5];s=r['site']
        self.assertEqual(s['id'],'211')
        self.assertFalse(set(b.strip() for b in s['birds'].split(','))&(protected|{'노랑부리백로'}))
        self.assertEqual((s['weatherRuleKey'],s['showWave'],s['seasons']),('coastal_seabird',True,['봄','가을','겨울']))
        for phrase in ['현재 출현을 뜻하지 않습니다','보장하지 않습니다','통제초소','통제 구간에는 들어가지 마세요','차도·갓길','드론·재생음']:
            self.assertIn(phrase,s['localBirdingTip'])
        self.assertNotIn('출입 제한 지역',s['localBirdingTip'])
        # Roadside pin on the OSM public path, within 50 m of the official beach point.
        o=r['officialBeachPoint'];self.assertIn('openstreetmap.org/way/370073534',r['coordinateSource'])
        self.assertLess(((o['lat']-s['lat'])*110540)**2+((o['lon']-s['lon'])*92900)**2,50**2)

    def test_grey_bunting_sites_use_exact_user_coordinates_and_claim_only_records(self):
        exact={'212':(33.473698,126.686472),'213':(33.48976,126.792654)}
        for r in SOURCE['records'][6:]:
            s=r['site'];lat,lon=exact[s['id']]
            self.assertEqual((s['lat'],s['lon']),(lat,lon))  # No snapping to parking, trailheads or roads.
            self.assertTrue(s['kakaoMapUrl'].endswith(f',{lat},{lon}'))
            self.assertEqual((s['birds'],s['seasons'],s['showTide'],s['showWave']),('검은멧새',['겨울'],False,False))
            self.assertIn('user-specified',r['coordinateSource'])
            for phrase in ['지정 좌표','개체수와 반복 월동은 확인되지 않았고','보장하지 않습니다','주차 가능 여부는 확인되지 않았습니다']:
                self.assertIn(phrase,s['localBirdingTip'])
            for claim in ['매년','마리','번식']:
                self.assertNotIn(claim,s['localBirdingTip'])
        tip=SOURCE['records'][7]['site']['localBirdingTip']  # 213: winter and the 2025-04 spring record kept apart.
        self.assertIn('모두 2024/25 한 겨울의 기록',tip);self.assertIn('2025년 4월 17일 iNaturalist 관찰 1건은 봄 기록으로 따로',tip)
        sites={s['id']:s for s in load_runtime_sites()}
        self.assertTrue({'59','181'} <= sites.keys())  # Field protection is relative to the PR base.

    def test_old_workbooks_automatic_data_security_and_engine_code_unchanged(self):
        for book in SOURCE['workbookComparison']:
            self.assertEqual(hashlib.sha256((ROOT/'data'/book['file']).read_bytes()).hexdigest(),book['sha256'])
            self.assertFalse(any(book['matches'].values()))
        # Current files follow this PR's exact main base, without historical count exceptions.
        ref=baseline_ref(ROOT)
        assert_jeju_base_files(ROOT,ref)
        assert_mapping_extension(ROOT)
        assert_engine_matches_base(ROOT,without_report_archive)

    def test_missing_wave_fails_closed_but_inland_does_not_require_it(self):
        from datetime import datetime
        target=datetime(2026,12,10,12,0,tzinfo=weather.KST)
        atmo={'ts':[target.timestamp()*1000],'wind_u-surface':[0], 'wind_v-surface':[0],
              'past3hprecip-surface':[0],'temp-surface':[10]}
        a,b=[weather.build_site_result(r['site'],weather.load_rules(),atmo,None,None,target) for r in SOURCE['records'][:2]]
        self.assertFalse(a['scoreEligible'])
        self.assertIn('wave',a['missingScoreFields'])
        self.assertTrue(b['scoreEligible'])


class JejuFileBoundaryTests(unittest.TestCase):
    """Synthetic files exercise delegation without editing runtime or API code."""
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.contents = {name: b'synthetic baseline\n' for name in JEJU_BASE_FILE_CONTRACTS}
        for name, content in self.contents.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        self.reader = patch(__name__ + '.baseline_bytes', side_effect=lambda root, ref, name: self.contents[name])
        self.reader.start()
        self.addCleanup(self.reader.stop)

    def test_site_picker_code_change_is_delegated_to_its_security_suite(self):
        target = self.root / 'reports-api/src/site-picker.js'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('/* Synthetic normal picker UI change */', encoding='utf-8')
        assert_jeju_base_files(self.root, 'a' * 40)

    def test_rules_notices_and_seed_are_content_checked_not_byte_locked(self):
        for name in ('weather_rules.json', 'notices.json', 'reports-api/tools/sites-seed.mjs'):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'synthetic normal edit\n')
            with self.subTest(file=name):
                assert_jeju_base_files(self.root, 'a' * 40)

    def test_generated_weather_and_tide_file_protection_is_unchanged(self):
        for name in ('weather_today.json', 'weather_week.json', 'tide_today.json', 'tide_month.json'):
            target = self.root / name
            target.write_bytes(b'synthetic changed generation\n')
            with self.subTest(file=name), self.assertRaisesRegex(AssertionError, 'Base file contract'):
                assert_jeju_base_files(self.root, 'a' * 40)
            target.write_bytes(self.contents[name])


SYNTHETIC_SITES = [{'id': '1', 'name': '시험 갯벌'}, {'id': '2', 'name': '시험 섬'}, {'id': '3', 'name': '시험 호수'}]


def synthetic_notices():
    """Self-contained notices by role, so mutation tests never depend on the live list's order or size."""
    return {
        'plain': {'title': '일반 공지', 'summary': '요약', 'content': '본문', 'start': '2026-11-01',
                  'end': '2026-11-30', 'published': True, 'link': 'https://example.org/a', 'linkText': '자세히',
                  'siteIds': [1, '2']},
        'spot': {'title': '관찰 지점 공지', 'content': '', 'published': True, 'site': '시험 섬',
                 'points': [{'name': '지점', 'lat': 37.1, 'lon': 126.7, 'access': {'lat': 37.11, 'lon': 126.71}},
                            {'name': '접근점 없음', 'lat': 36.0, 'lon': 129.3}]},
        'weekly': {'title': '주간 추천', 'content': '', 'published': True,
                   'weeklyRecommendations': [{'siteId': 1, 'name': '시험 갯벌', 'reason': '도요 이동기'}, {'siteId': '3'}]},
    }


class NoticesContractTests(unittest.TestCase):
    def check(self, notices, root=ROOT):
        if isinstance(notices, dict):
            notices = list(notices.values())
        return validate_notices(json.dumps(notices, ensure_ascii=False), SYNTHETIC_SITES, root)

    def test_current_notices_pass(self):
        text = (ROOT / 'notices.json').read_text(encoding='utf-8')
        sites = load_runtime_sites()
        validate_notices(text, sites)
        live = json.loads(text)
        extra = {'title': '추가 공지', 'content': '', 'published': False}
        # Adding, removing and reordering live notices must not trip position-dependent checks.
        for name, notices in (('reversed', live[::-1]), ('first removed', live[1:]), ('last removed', live[:-1]),
                              ('added', [extra] + live), ('pretty', live)):
            with self.subTest(change=name):
                validate_notices(json.dumps(notices, ensure_ascii=False, indent=2), sites)

    def test_synthetic_baseline_and_normal_edits_are_allowed(self):
        self.check(synthetic_notices())
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'img').mkdir()
            (Path(directory) / 'img/n.jpg').write_bytes(b'jpg')
            local = synthetic_notices()
            local['plain']['image'] = 'img/n.jpg'
            self.check(local, directory)
        changes = {
            'edit text': lambda d: d['plain'].update(title='수정된 제목', content='수정된 본문', summary=''),
            'unpublish': lambda d: d['plain'].update(published=False, end='2026-12-31'),
            'empty link': lambda d: d['plain'].update(link='', linkText=''),
            'remote image': lambda d: d['spot'].update(image='https://example.org/p.jpg'),
            'move point': lambda d: d['spot']['points'][0].update(lat=37.12, lon=126.72),
            'drop access': lambda d: d['spot']['points'][0].pop('access'),
            'drop dates': lambda d: [d['plain'].pop('start'), d['plain'].pop('end')],
            'site by id': lambda d: d['spot'].update(site='2', siteId=3),
            'weekly reason edit': lambda d: d['weekly']['weeklyRecommendations'][0].update(reason='수정 사유'),
            'remove notice': lambda d: d.pop('plain'),
        }
        for name, change in changes.items():
            notices = synthetic_notices()
            change(notices)
            with self.subTest(change=name):
                self.check(notices)
        roles = synthetic_notices()
        for name, order in (('reorder', [roles['weekly'], roles['plain'], roles['spot']]),
                            ('add', [{'title': '새 공지', 'content': '', 'published': True}, *roles.values()]),
                            ('empty list', [])):
            with self.subTest(change=name):
                self.check(order)

    def test_invalid_notices_fail(self):
        cases = {
            'item not an object': (lambda d: d.update(plain=[]), 'must be an object'),
            'missing title': (lambda d: d['plain'].pop('title'), 'title required'),
            'blank title': (lambda d: d['plain'].update(title=' '), 'title required'),
            'missing content': (lambda d: d['plain'].pop('content'), 'content must be text'),
            'published text': (lambda d: d['plain'].update(published='true'), 'published must be true/false'),
            'published missing': (lambda d: d['plain'].pop('published'), 'published must be true/false'),
            'bad date': (lambda d: d['plain'].update(start='2026/11/01'), 'start must be YYYY-MM-DD'),
            'impossible date': (lambda d: d['plain'].update(end='2026-02-30'), 'end is not a real date'),
            'start after end': (lambda d: d['plain'].update(start='2026-12-01'), 'start after end'),
            'typo field': (lambda d: d['plain'].update(pubished=True), 'unknown field pubished'),
            'script link': (lambda d: d['plain'].update(link='javascript:alert(1)'), 'link must be http'),
            'relative link': (lambda d: d['plain'].update(link='notices.json'), 'link must be http'),
            'data image': (lambda d: d['plain'].update(image='data:image/png;base64,AA'), 'image must be http'),
            'missing image': (lambda d: d['plain'].update(image='img/no-such-notice.jpg'), 'image file missing'),
            'parent image path': (lambda d: d['plain'].update(image='../secret.jpg'), 'image file missing'),
            'unknown site id': (lambda d: d['plain'].update(siteIds=[99999]), 'unknown site'),
            'unknown site name': (lambda d: d['spot'].update(site='없는 탐조지'), 'unknown site'),
            'siteIds not list': (lambda d: d['plain'].update(siteIds=1), 'siteIds must be a list'),
            'empty points': (lambda d: d['spot'].update(points=[]), 'points must be a list'),
            'point out of range': (lambda d: d['spot']['points'][0].update(lat=95), 'invalid coordinate'),
            'point zero': (lambda d: d['spot']['points'][1].update(lat=0, lon=0), 'invalid coordinate'),
            'point text coordinate': (lambda d: d['spot']['points'][0].update(lon='126.7'), 'invalid coordinate'),
            'point unnamed': (lambda d: d['spot']['points'][0].update(name=''), 'point name required'),
            'point extra field': (lambda d: d['spot']['points'][0].update(species='물수리'), 'unknown point field'),
            'bad access': (lambda d: d['spot']['points'][0].update(access={'lat': 37.1}), 'access: invalid coordinate'),
            'weekly unknown site': (lambda d: d['weekly']['weeklyRecommendations'].append({'siteId': 99999}),
                                    'unknown weekly site'),
            'weekly missing site': (lambda d: d['weekly']['weeklyRecommendations'].append({'name': 'x'}),
                                    'invalid weekly recommendation'),
            'second weekly list': (lambda d: d['plain'].update(weeklyRecommendations=[{'siteId': 1}]),
                                   'more than one published weeklyRecommendations'),
        }
        for name, (change, message) in cases.items():
            notices = synthetic_notices()
            change(notices)
            with self.subTest(case=name), self.assertRaisesRegex(ValueError, message):
                self.check(notices)
        for name, text, message in (('broken JSON', '[{', 'Expecting'), ('not a list', '{}', 'must be a list'),
                                    ('duplicate key', '[{"title":"a","title":"b","content":"","published":true}]',
                                     'duplicate JSON key')):
            with self.subTest(case=name), self.assertRaisesRegex(ValueError, message):
                validate_notices(text, SYNTHETIC_SITES)


class JejuRegistryAppendTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript('''CREATE TABLE sites(site_id TEXT PRIMARY KEY,site_name TEXT,lat REAL,lon REAL,
          registry_source TEXT,registry_revision TEXT,source_record_json TEXT,created_at TEXT,retired_at TEXT);
          CREATE TABLE system_state(id INTEGER PRIMARY KEY,mode TEXT,generation INTEGER);
          INSERT INTO system_state VALUES(1,'NORMAL',4);
          CREATE TABLE reports(id TEXT,note TEXT);INSERT INTO reports VALUES('synthetic','unchanged');''')
        keys='site_id site_name lat lon registry_source registry_revision source_record_json created_at retired_at'.split()
        # Historical registration fixture, independent of current registry order/size.
        self.before=[dict(zip(keys,[s['id'],'Synthetic '+s['id'],36.5,127.5,'synthetic','old','{}','2026-01-01',None])) for s in historical_sites(ROOT,SOURCE['baselineCommit'])]
        self.new=[dict(self.before[0],site_id=i,site_name='Synthetic '+i) for i in NEW_IDS]
        self.db.executemany('INSERT INTO sites VALUES(?,?,?,?,?,?,?,?,?)',[tuple(s[k] for k in keys) for s in self.before])
        self.db.commit()
        self.sql=(ROOT/'docs/jeju-sites-20261018/append-registry.sql').read_text(encoding='utf-8')

    def tearDown(self):
        self.db.close()

    def apply(self,generation=4,before=None,new=None):
        self.db.execute(self.sql,[generation,json.dumps(self.before if before is None else before),json.dumps(self.new if new is None else new)])
        self.db.commit()

    def snapshot(self):
        return list(self.db.execute('SELECT * FROM sites ORDER BY site_id'))

    def test_atomic_append_preserves_every_old_field_and_reports_and_rejects_replay(self):
        old=self.snapshot();self.apply()
        self.assertEqual(len(self.snapshot()),208)
        self.assertEqual([r for r in self.snapshot() if r[0] not in NEW_IDS],old)
        self.assertEqual(self.db.execute('SELECT note FROM reports').fetchone()[0],'unchanged')
        with self.assertRaises(sqlite3.DatabaseError):self.apply()
        self.assertEqual(len(self.snapshot()),208)

    def test_stale_changed_incomplete_duplicate_unreviewed_and_maintenance_fail_closed(self):
        old=self.snapshot()
        changed=json.loads(json.dumps(self.before));changed[0]['lat']=37
        for options in [dict(generation=3),dict(before=changed),dict(before=self.before[:-1]),
                        dict(before=[self.before[0]]*200),dict(before=self.before[:-1]+[self.before[0]]),
                        dict(new=self.new[:-1]),dict(new=[self.new[0],self.new[0]]),
                        dict(new=self.new[:-1]+[dict(self.new[-1],site_id='999')])]:
            with self.subTest(options=options):
                with self.assertRaises(sqlite3.DatabaseError):self.apply(**options)
                self.assertEqual(self.snapshot(),old)
        self.db.execute("UPDATE system_state SET mode='READ_ONLY_MAINTENANCE'")
        with self.assertRaises(sqlite3.DatabaseError):self.apply()
        self.assertEqual(self.snapshot(),old)


if __name__=='__main__':unittest.main()
