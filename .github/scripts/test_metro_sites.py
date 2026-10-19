"""Preserve all 208 records and fail closed on incomplete or drifted registry appends."""
import hashlib
import json
import re
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path
from site_data import load_runtime_sites, load_worker_sites, compare_sites

ROOT=Path(__file__).resolve().parents[2]
SOURCE=json.loads((ROOT/'data/metro-birding-sites-20261019.json').read_text(encoding='utf-8'))
NEW=[str(i) for i in range(214,235)]

class MetroSitesTests(unittest.TestCase):
    def test_all_old_records_and_engine_outside_approved_metadata_are_preserved(self):
        old=subprocess.check_output(['git','show',SOURCE['baselineCommit']+':index.html'],cwd=ROOT).decode('utf-8')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'index.html';path.write_text(old,encoding='utf-8');before=load_runtime_sites(path)
        current=load_runtime_sites()
        self.assertEqual(len(before),208);self.assertEqual(current[:208],before)
        self.assertEqual(current[208:],[r['site'] for r in SOURCE['records']])
        self.assertEqual([s['id'] for s in current[208:]],NEW);self.assertEqual(len(current),229)
        def strip(t):
            t=t.replace('최종 업데이트: 2026.10.19','최종 업데이트: 2026.10.18').replace('수도권 21곳 추가','중부권 10곳·제주 8곳 추가').replace('id="mapTitleSiteCount">229','id="mapTitleSiteCount">208')
            return re.sub(r'siteData=siteData\.concat\([\s\S]*?\);','SITE_ARRAY',t.replace('\r\n','\n'),count=1)
        self.assertEqual(strip((ROOT/'index.html').read_text(encoding='utf-8')),strip(old))

    def test_links_coordinates_source_boundaries_and_unknown_records(self):
        report=compare_sites(load_runtime_sites(),load_worker_sites())
        self.assertEqual(report['commonIdCount'],229)
        self.assertFalse(any(v for v in report.values() if isinstance(v,list)),report)
        unknown={'214','217','221','222','223','225','226','227','232','234'}
        self.assertEqual({r['site']['id'] for r in SOURCE['records'] if not r['site']['birds']},unknown)
        for r in SOURCE['records']:
            s=r['site'];c=r['coordinateReview']
            with self.subTest(id=s['id']):
                self.assertEqual((s['lat'],s['lon']),(c['lat'],c['lon']))
                self.assertEqual(s['kakaoMapUrl'].split(',')[-2:],[str(s['lat']),str(s['lon'])])
                self.assertIn(f"/{s['lat']}/{s['lon']}?{s['lat']},{s['lon']},10",s['windyUrl'])
                self.assertTrue(c['sourceUrl'].startswith('https://'))
                self.assertTrue(all(not s[k] for k in ['rare','mijo','recommend5','island','pelagic','showTide','showWave']))
                for phrase in ['現在','둥지 위치:']:
                    self.assertNotIn(phrase,s['localBirdingTip'])
                for phrase in ['현재 출현을 뜻하지 않습니다','재생음','공개','촬영 확인 수준']:
                    self.assertIn(phrase,s['localBirdingTip'])
                if s['id'] in unknown:
                    self.assertEqual(s['seasons'],[]);self.assertEqual(s['bestSeason'],'추천 계절 미확정')
        for b in SOURCE['workbookHashes']:
            self.assertEqual(hashlib.sha256((ROOT/'data'/b['file']).read_bytes()).hexdigest(),b['sha256'])

class MetroAppendTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript('''CREATE TABLE sites(site_id TEXT PRIMARY KEY,site_name TEXT,lat REAL,lon REAL,registry_source TEXT,registry_revision TEXT,source_record_json TEXT,created_at TEXT,retired_at TEXT);
          CREATE TABLE system_state(id INTEGER PRIMARY KEY,mode TEXT,generation INTEGER);INSERT INTO system_state VALUES(1,'NORMAL',4);
          CREATE TABLE reports(id TEXT,note TEXT);INSERT INTO reports VALUES('keep','unchanged');''')
        self.keys='site_id site_name lat lon registry_source registry_revision source_record_json created_at retired_at'.split()
        self.old=[dict(zip(self.keys,[s['id'],'Synthetic '+s['id'],36.5,127.5,'synthetic','old','{}','2026-01-01',None])) for s in load_runtime_sites()[:208]]
        self.new=[dict(self.old[0],site_id=i,site_name='Synthetic '+i) for i in NEW]
        self.db.executemany('INSERT INTO sites VALUES(?,?,?,?,?,?,?,?,?)',[tuple(s[k] for k in self.keys) for s in self.old]);self.db.commit()
        self.sql=(ROOT/'docs/metro-sites-20261019/append-registry.sql').read_text(encoding='utf-8')
    def tearDown(self):self.db.close()
    def snapshot(self):return list(self.db.execute('SELECT * FROM sites ORDER BY site_id'))
    def apply(self,g=4,old=None,new=None):
        self.db.execute(self.sql,[g,json.dumps(self.old if old is None else old),json.dumps(self.new if new is None else new)]);self.db.commit()
    def test_atomic_append_preserves_every_field_and_reports_and_rejects_replay(self):
        old=self.snapshot();self.apply();self.assertEqual(len(self.snapshot()),229)
        self.assertEqual([r for r in self.snapshot() if r[0] not in NEW],old)
        self.assertEqual(self.db.execute('SELECT note FROM reports').fetchone()[0],'unchanged')
        with self.assertRaises(sqlite3.DatabaseError):self.apply()
        self.assertEqual(len(self.snapshot()),229)
    def test_stale_drift_incomplete_duplicate_unreviewed_and_maintenance_abort_atomically(self):
        old=self.snapshot();drift=json.loads(json.dumps(self.old));drift[0]['lat']=37
        for args in [(3,None,None),(4,drift,None),(4,self.old[:-1],None),(4,self.old[:-1]+[self.old[0]],None),
                     (4,None,self.new[:-1]),(4,None,[self.new[0]]*21),(4,None,self.new[:-1]+[dict(self.new[-1],site_id='999')])]:
            with self.subTest(args=args):
                with self.assertRaises(sqlite3.DatabaseError):self.apply(*args)
                self.assertEqual(self.snapshot(),old)
        self.db.execute("UPDATE system_state SET mode='READ_ONLY_MAINTENANCE'")
        with self.assertRaises(sqlite3.DatabaseError):self.apply()
        self.assertEqual(self.snapshot(),old)

if __name__=='__main__':unittest.main()
