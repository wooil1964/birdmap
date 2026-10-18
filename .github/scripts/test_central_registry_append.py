"""Exercise the exact operational append SQL using synthetic SQLite data only."""
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / 'docs/central-sites-20261018/append-registry.sql').read_text(encoding='utf-8')
KEYS = 'site_id site_name lat lon registry_source registry_revision source_record_json created_at retired_at'.split()


class RegistryAppendTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''CREATE TABLE sites (
          site_id TEXT PRIMARY KEY,site_name TEXT NOT NULL,lat REAL,lon REAL,
          registry_source TEXT,registry_revision TEXT,source_record_json TEXT,
          created_at TEXT,retired_at TEXT);
          CREATE TABLE system_state(id INTEGER PRIMARY KEY,mode TEXT,generation INTEGER);
          INSERT INTO system_state VALUES(1,'NORMAL',4);
          CREATE TABLE reports(id TEXT PRIMARY KEY,note TEXT);
          INSERT INTO reports VALUES('synthetic','must remain unchanged');''')
        self.before = [dict(zip(KEYS, [str(i),'Synthetic '+str(i),36.5,127.5,'synthetic','old','{}','2026-01-01',None])) for i in range(1,191)]
        self.new = [dict(self.before[0],site_id=str(i),site_name='Synthetic '+str(i),registry_revision='new') for i in range(196,206)]
        self.db.executemany('INSERT INTO sites VALUES(?,?,?,?,?,?,?,?,?)', [tuple(s[k] for k in KEYS) for s in self.before])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def apply(self, generation=4, before=None, proposed=None):
        self.db.execute(SQL, [generation,json.dumps(self.before if before is None else before),json.dumps(self.new if proposed is None else proposed)])
        self.db.commit()

    def snapshot(self):
        return [dict(r) for r in self.db.execute('SELECT * FROM sites ORDER BY site_id')]

    def test_only_ten_new_rows_no_old_or_report_changes(self):
        old=self.snapshot()
        self.apply()
        self.assertEqual(len(self.snapshot()),200)
        self.assertEqual([r for r in self.snapshot() if int(r['site_id'])<196],old)
        self.assertEqual(self.db.execute('SELECT note FROM reports').fetchone()[0],'must remain unchanged')
        with self.assertRaises(sqlite3.DatabaseError): self.apply()
        self.assertEqual(len(self.snapshot()),200)

    def test_stale_generation_or_changed_registry_aborts_atomically(self):
        old=self.snapshot()
        with self.assertRaises(sqlite3.DatabaseError): self.apply(generation=3)
        self.assertEqual(self.snapshot(),old)
        changed=json.loads(json.dumps(self.before));changed[0]['lat']=37
        with self.assertRaises(sqlite3.DatabaseError): self.apply(before=changed)
        self.assertEqual(self.snapshot(),old)

    def test_duplicate_missing_or_unreviewed_ids_aborts(self):
        old=self.snapshot()
        for proposed in [self.new[:-1],self.new[:-1]+[self.new[0]],self.new[:-1]+[dict(self.new[-1],site_id='999')]]:
            with self.subTest(ids=[r['site_id'] for r in proposed]):
                with self.assertRaises(sqlite3.DatabaseError): self.apply(proposed=proposed)
                self.assertEqual(self.snapshot(),old)

    def test_maintenance_mode_aborts(self):
        self.db.execute("UPDATE system_state SET mode='READ_ONLY_MAINTENANCE' WHERE id=1")
        old=self.snapshot()
        with self.assertRaises(sqlite3.DatabaseError): self.apply()
        self.assertEqual(self.snapshot(),old)


if __name__ == '__main__': unittest.main()
