// Local-only rehearsal of the dedicated 0007 migrations_dir with real Wrangler 4.149.0 (--local).
// Production DDL (from the read-only schema dump) + synthetic rows. Fake DB UUID, no Cloudflare auth in env.
// Usage: node rehearse-0007-local.mjs <emptyWorkDir> <schemaDump.json: [{type,name,tbl_name,sql}] from a read-only
//   "SELECT type,name,tbl_name,sql FROM sqlite_schema"> <0007 file from `git cat-file blob <sha>:reports-api/migrations/0007_reporter_identity.sql`>
// Runs: seed -> migrations list -> apply -> re-apply (no-op) on p-ok, and an injected last-statement collision on p-fail.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const [dir, schemaPath, sql0007] = process.argv.slice(2);
const sha = b => createHash('sha256').update(b).digest('hex');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLOUDFLARE_|^CF_/.test(k)));
env.WRANGLER_SEND_METRICS = 'false'; env.CI = '1';
const log = [];
function w(args, expectFail = false) {
  const argv = ['--yes', 'wrangler@4.149.0', ...args];
  let out, code = 0;
  try { out = execFileSync('npx', argv, { cwd: dir, env, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  log.push({ args: args.join(' '), code, expectFail, tail: out.split('\n').filter(l => l.trim()).slice(-4) });
  if (!!code !== expectFail) throw Error('UNEXPECTED ' + args.join(' ') + '\n' + out);
  return out;
}
const q = (persist, sql) => JSON.parse(w(['d1', 'execute', 'birdmap-reports', '--local', '--persist-to', persist, '--json', '-c', 'wrangler.migrate-0007.json', '--command', JSON.stringify(sql)]))[0].results;

// Dedicated config: only the 0007 file in its own migrations_dir. Fake UUID.
mkdirSync(join(dir, 'migrations-0007'), { recursive: true });
copyFileSync(sql0007, join(dir, 'migrations-0007', '0007_reporter_identity.sql'));
const fileSha = sha(readFileSync(join(dir, 'migrations-0007', '0007_reporter_identity.sql')));
writeFileSync(join(dir, 'wrangler.migrate-0007.json'), JSON.stringify({ name: 'm7-rehearsal', compatibility_date: '2026-07-03',
  d1_databases: [{ binding: 'REPORTS_DB', database_name: 'birdmap-reports', database_id: '11111111-1111-4111-8111-111111111111', migrations_dir: 'migrations-0007' }] }, null, 1));

// Seed: production DDL (tables -> synthetic rows -> indexes -> triggers), production ledger names.
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')).filter(s => s.sql && !['_cf_KV'].includes(s.name) && !s.name.startsWith('sqlite_'));
const ledger = ['0001_core.sql','0002_system_state.sql','0003_captcha_redemptions.sql','0004b_publication_writer_fence.sql','0005_publication_security.sql','0005c_publication_enable.sql','0006_field_visibility.sql'];
const rows = [
  ...schema.filter(s => s.type === 'table').map(s => s.sql + ';'),
  `INSERT INTO public_publication_state VALUES(1,'${'ab'.repeat(16)}',295,0);`,
  ...['a','b','c','d','e'].map((x, i) => `INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,reporter,name_public,ip_hash,dedupe_hash) VALUES('syn-${x}','approved','까치',35.0,127.0,'2026-10-0${i + 1}','2026-10-0${i + 1}T00:00:00Z','synthetic-${i % 2}',1,'h${x}','d${x}');`),
  ...ledger.map((n, i) => `INSERT INTO d1_migrations(id,name,applied_at) VALUES(${i + 1},'${n}','2026-10-01 00:00:00');`),
  ...schema.filter(s => s.type === 'index').map(s => s.sql + ';'),
  ...schema.filter(s => s.type === 'trigger').map(s => s.sql + ';'),
];
writeFileSync(join(dir, 'seed.sql'), rows.join('\n'));
const snap = p => {
  const objs = q(p, "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' AND name<>'d1_migrations' ORDER BY type,name");
  const data = q(p, "SELECT (SELECT json_group_array(json_array(id,status,species,reporter,received_at,name_public)) FROM reports) AS r,(SELECT json_group_array(json_array(id,epoch,revision,write_frozen)) FROM public_publication_state) AS s,(SELECT COUNT(*) FROM publication_writer_claim) AS c")[0];
  const led = q(p, 'SELECT id,name FROM d1_migrations ORDER BY id');
  return { objs, objHash: sha(JSON.stringify(objs)), dataHash: sha(JSON.stringify(data)), revision: JSON.parse(data.s)[0][2], claims: data.c, ledger: led.map(l => l.name) };
};
const R = { fileSha };
for (const name of ['ok', 'fail']) {
  const p = join(dir, 'p-' + name); rmSync(p, { recursive: true, force: true });
  w(['d1', 'execute', 'birdmap-reports', '--local', '--persist-to', p, '--file', 'seed.sql', '-c', 'wrangler.migrate-0007.json']);
  if (name === 'fail') // Inject a name collision on the LAST statement of 0007 to observe partial-install behavior.
    q(p, 'CREATE TRIGGER identity_events_delete BEFORE DELETE ON sites BEGIN SELECT 1; END');
  const before = snap(p);
  const list = w(['d1', 'migrations', 'list', 'birdmap-reports', '--local', '--persist-to', p, '-c', 'wrangler.migrate-0007.json']);
  const applyOut = w(['d1', 'migrations', 'apply', 'birdmap-reports', '--local', '--persist-to', p, '-c', 'wrangler.migrate-0007.json'], name === 'fail');
  const after = snap(p);
  const prev = new Map(before.objs.map(o => [o.type + o.name, o.sql]));
  R[name] = { listShowsOnly0007: /0007_reporter_identity\.sql/.test(list) && !/0002_|0003_|0004_|0006_/.test(list),
    beforeObjects: before.objs.length, afterObjects: after.objs.length,
    newObjects: after.objs.filter(o => !prev.has(o.type + o.name)).map(o => o.type + ':' + o.name),
    changedExisting: after.objs.filter(o => prev.has(o.type + o.name) && prev.get(o.type + o.name) !== o.sql).map(o => o.name),
    removedExisting: before.objs.filter(o => !after.objs.some(a => a.type + a.name === o.type + o.name)).map(o => o.name),
    dataUnchanged: before.dataHash === after.dataHash, revisionBefore: before.revision, revisionAfter: after.revision, claimsAfter: after.claims,
    ledgerBefore: before.ledger.length, ledgerAfter: after.ledger, applyTail: applyOut.split('\n').filter(l => l.trim()).slice(-3) };
  if (name === 'ok') {
    const again = w(['d1', 'migrations', 'apply', 'birdmap-reports', '--local', '--persist-to', p, '-c', 'wrangler.migrate-0007.json']);
    R.ok.rerun = { noop: /No migrations to apply/i.test(again), ledgerAfterRerun: snap(p).ledger.length };
    R.ok.fkCheck = q(p, 'PRAGMA foreign_key_check').length;
    // Post-apply precondition SQL from the plan (exact objects present).
    R.ok.identityObjects = q(p, "SELECT COUNT(*) AS n FROM sqlite_schema WHERE (type='table' AND name IN('reporter_identity_groups','reporter_identity_events')) OR (type='trigger' AND name IN('identity_groups_insert','identity_groups_update','identity_groups_delete','identity_groups_created','identity_groups_revoked','identity_events_insert','identity_events_update','identity_events_delete'))")[0].n;
    // A confirm without writer claim must be rejected even after install (fence intact).
    try { q(p, "INSERT INTO reporter_identity_groups(id,report_ids,representative_id,confirmed_by,evidence,created_at) VALUES('g1','[\"syn-a\",\"syn-c\"]','syn-a','x','y','z')"); R.ok.insertWithoutClaim = 'ACCEPTED(!)'; }
    catch (e) { R.ok.insertWithoutClaim = /publication_writer_required/.test(e.message) ? 'rejected:publication_writer_required' : 'rejected:other'; }
  }
}
R.commands = log.map(l => ({ cmd: l.args.slice(0, 120), code: l.code, expectFail: l.expectFail }));
writeFileSync(join(dir, 'result.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ ...R, ok: { ...R.ok }, fail: { ...R.fail } }, null, 1));
