"""Jeju addition contracts: exact preservation, public access points and safe failure."""
import hashlib
import json
import re
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote

from site_data import load_runtime_sites, load_worker_sites, compare_sites
import build_seo_pages as seo
import update_weather as weather

ROOT = Path(__file__).resolve().parents[2]
NEW_IDS = ['206','207','208','209','210','211']
SOURCE = json.loads((ROOT/'data/jeju-birding-sites-20261018.json').read_text(encoding='utf-8'))


class JejuSitesTests(unittest.TestCase):
    def test_exact_original_200_and_only_reviewed_additions(self):
        baseline = subprocess.check_output(['git','show',SOURCE['baselineCommit']+':index.html'],cwd=ROOT)
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'index.html'; path.write_bytes(baseline)
            old=load_runtime_sites(path)
        sites=load_runtime_sites()
        self.assertEqual(len(old),200)
        self.assertEqual(sites[:200],old)  # Full records, not selected fields.
        self.assertEqual(sites[200:],[r['site'] for r in SOURCE['records']])
        self.assertEqual([s['id'] for s in sites[200:]],NEW_IDS)
        self.assertEqual(len(sites),206)
        self.assertEqual(len([s for s in sites if s['sido']=='제주']),17)
        for s in sites[200:]:self.assertEqual(set(s),set(old[-1]))

    def test_public_access_coordinates_worker_and_all_map_links(self):
        report=compare_sites(load_runtime_sites(),load_worker_sites())
        self.assertEqual(report['commonIdCount'],206)
        self.assertFalse(any(v for v in report.values() if isinstance(v,list)),report)
        expected=[(33.550053,126.69415),(33.24452585,126.5596972),(33.430924,126.595761),(33.282955,126.27152),(33.491318,126.811386),(33.511246,126.898868)]
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
            if i>=2:  # VisitJeju official point and the reproducible GBIF query.
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

    def test_old_workbooks_automatic_data_security_and_engine_code_unchanged(self):
        for book in SOURCE['workbookComparison']:
            self.assertEqual(hashlib.sha256((ROOT/'data'/book['file']).read_bytes()).hexdigest(),book['sha256'])
            self.assertFalse(any(book['matches'].values()))
        # Actions and editorial posts rewrite these on main, so on a PR merge commit compare with its main parent;
        # either way the Jeju change itself must not touch them.
        merge=len(subprocess.check_output(['git','rev-list','--parents','-n','1','HEAD'],cwd=ROOT).split())>2
        for file in ['weather_today.json','weather_week.json','tide_today.json','tide_month.json','notices.json',
                     'tide_station_mapping.json','weather_rules.json',
                     'reports-api/src/site-picker.js','reports-api/tools/sites-seed.mjs']:
            ref='HEAD^1' if merge and file.endswith(('today.json','week.json','month.json','notices.json')) else SOURCE['baselineCommit']
            self.assertEqual((ROOT/file).read_bytes().replace(b'\r\n',b'\n'),
              subprocess.check_output(['git','show',ref+':'+file],cwd=ROOT).replace(b'\r\n',b'\n'),file)
        # Everything outside the single literal concat block stays byte-equivalent after newline normalization.
        current=(ROOT/'index.html').read_text(encoding='utf-8')
        old=subprocess.check_output(['git','show',SOURCE['baselineCommit']+':index.html'],cwd=ROOT).decode('utf-8')
        def strip(t):
            t=t.replace('중부권 탐조지 10곳 추가','중부권 10곳·제주 6곳 추가').replace('id="mapTitleSiteCount">200','id="mapTitleSiteCount">206')
            t=t.replace('엑셀 위도·경도 좌표 그대로 반영','탐조지 이름 또는 지역 검색')
            return re.sub(r'siteData=siteData\.concat\([\s\S]*?\);','SITE_ARRAY',t.replace('\r\n','\n'),count=1)
        self.assertEqual(strip(current),strip(old))

    def test_missing_wave_fails_closed_but_inland_does_not_require_it(self):
        from datetime import datetime
        target=datetime(2026,12,10,12,0,tzinfo=weather.KST)
        atmo={'ts':[target.timestamp()*1000],'wind_u-surface':[0], 'wind_v-surface':[0],
              'past3hprecip-surface':[0],'temp-surface':[10]}
        a,b=[weather.build_site_result(r['site'],weather.load_rules(),atmo,None,None,target) for r in SOURCE['records'][:2]]
        self.assertFalse(a['scoreEligible'])
        self.assertIn('wave',a['missingScoreFields'])
        self.assertTrue(b['scoreEligible'])


class JejuRegistryAppendTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript('''CREATE TABLE sites(site_id TEXT PRIMARY KEY,site_name TEXT,lat REAL,lon REAL,
          registry_source TEXT,registry_revision TEXT,source_record_json TEXT,created_at TEXT,retired_at TEXT);
          CREATE TABLE system_state(id INTEGER PRIMARY KEY,mode TEXT,generation INTEGER);
          INSERT INTO system_state VALUES(1,'NORMAL',4);
          CREATE TABLE reports(id TEXT,note TEXT);INSERT INTO reports VALUES('synthetic','unchanged');''')
        keys='site_id site_name lat lon registry_source registry_revision source_record_json created_at retired_at'.split()
        # Exactly the runtime's existing 200 IDs, with synthetic payloads only.
        self.before=[dict(zip(keys,[s['id'],'Synthetic '+s['id'],36.5,127.5,'synthetic','old','{}','2026-01-01',None])) for s in load_runtime_sites()[:200]]
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
        self.assertEqual(len(self.snapshot()),206)
        self.assertEqual([r for r in self.snapshot() if r[0] not in NEW_IDS],old)
        self.assertEqual(self.db.execute('SELECT note FROM reports').fetchone()[0],'unchanged')
        with self.assertRaises(sqlite3.DatabaseError):self.apply()
        self.assertEqual(len(self.snapshot()),206)

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
