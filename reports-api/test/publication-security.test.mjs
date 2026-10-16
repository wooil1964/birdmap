import { strictWriterDb } from '../src/writer-fence.js';
import { trustedFixtureSqlite } from './fixture-writer.mjs';
// Independent synthetic SQLite/D1-shaped contract tests. No production requests.
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRequest, handleLegacyRequest } from '../src/public.js';
import { FIELD_UPDATE_TTL_HOURS } from '../src/field-updates.js';
import { schemaReady } from '../src/canonical/control.js';
import { publicationRevision, PUBLICATION_GUARDS } from '../src/publication.js';
import { persistQuick } from '../src/canonical/persistence.js';
import { shadowRead } from '../src/canonical/shadow.js';

const ORIGIN = 'https://wooil1964.github.io';
const CONTRACT = 'publication-v1';
const PROJECTION = 'legacy-public-v1';
const NONCE = 'a'.repeat(32);
const DEVICE_A = 'publication-owner-aaaaaaaa';
const DEVICE_B = 'publication-reader-bbbbbbbb';
const HERE = new URL('../../docs/p1-publication-security-implementation/results/server-audit/', import.meta.url);
const baseline = readFileSync(new URL('pre-publication-schema.sql', HERE), 'utf8');
const canonical = ['../../docs/long-term-db-phase2a/migrations/0001_core.sql', '../../docs/long-term-db-phase2d1/migrations/0003_captcha_redemptions.sql']
  .map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
const migration = () => ['0005_publication_security.sql','0006_field_visibility.sql'].map(name=>readFileSync(new URL('../migrations/'+name, import.meta.url), 'utf8')).join('\n');

// Real SQL, transaction rollback, and SELECT results in D1.batch order; no hand-written query branches.
function fixture({ migrate = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(baseline + '\n' + canonical);
  if (migrate) {
    sqlite.exec(migration());
    assert.equal(sqlite.prepare('SELECT write_frozen FROM public_publication_state WHERE id=1').get().write_frozen,1,'운영 migration은 닫힌 상태로 설치된다');
    sqlite.exec('UPDATE public_publication_state SET write_frozen=0,revision=revision+1 WHERE id=1'); // 명시적 local activation 후 정상 기능을 시험한다.
  }
  const calls = [];
  let beforeBatch = null;
  const db = {
    sqlite, calls,
    setBeforeBatch(fn) { beforeBatch = fn; },
    prepare(sql) {
      let params = [];
      const statement = {
        sql, get params() { return params; },
        bind(...values) { params = values; return statement; },
        execute() {
          const s = sqlite.prepare(sql);
          if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) return { results: s.all(...params).map(row => ({ ...row })), success: true, meta: { changes: 0 } };
          const result = s.run(...params);
          return { results: [], success: true, meta: { changes: Number(result.changes) } };
        },
        async all() { calls.push({ mode: 'all', sql }); return statement.execute(); },
        async first() { calls.push({ mode: 'first', sql }); return statement.execute().results[0] ?? null; },
        async run() { calls.push({ mode: 'run', sql }); return statement.execute(); },
      };
      return statement;
    },
    async batch(statements) {
      if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; await hook(statements); }
      calls.push({ mode: 'batch', sql: statements.map(s => s.sql) });
      sqlite.exec('BEGIN');
      try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const env = { ENVIRONMENT: 'production', REPORTS_DB: db, REPORT_IP_SALT: 'synthetic-salt', TURNSTILE_SECRET_KEY: 'synthetic-key', REPORTS_PUBLICATION_REQUIRED: 'true' };
  return { sqlite:migrate?trustedFixtureSqlite(sqlite):sqlite, db, env };
}

let ip = 0;
let activeTurnstile = 0, originalTurnstileFetch;
async function call(env, path, { method = 'GET', body, turnstile = true, onTurnstile } = {}) {
  const request = new Request('https://publication.test' + path, { method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.' + (++ip % 200 + 1) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if(turnstile&&activeTurnstile++===0)originalTurnstileFetch=globalThis.fetch;
  if (turnstile) globalThis.fetch = async url => {
    assert.equal(String(url), 'https://challenges.cloudflare.com/turnstile/v0/siteverify', 'Only synthetic Turnstile is allowed');
    if (onTurnstile) await onTurnstile();
    return Response.json({ success: true });
  };
  try { const response = await handleRequest(request, env); return { status: response.status, headers: response.headers, body: await response.json() }; }
  finally { if(turnstile&&--activeTurnstile===0)globalThis.fetch=originalTurnstileFetch; }
}
async function head(env, nonce = NONCE) { return call(env, '/reports/public-state?nonce=' + encodeURIComponent(nonce)); }
function query(path, state, extra = {}) {
  const params = new URLSearchParams({ contract: CONTRACT, nonce: NONCE, expectedEpoch: state.epoch, expectedRevision: state.revision, ...extra });
  return path + (path.includes('?') ? '&' : '?') + params;
}
async function current(env, path) {
  const before = await head(env); assert.equal(before.status, 200, JSON.stringify(before.body));
  return call(env, query(path, before.body.publication));
}
function revision(sqlite) { return sqlite.prepare('SELECT CAST(revision AS TEXT) AS revision FROM public_publication_state WHERE id=1').get().revision; }
function privilegedState(sqlite, assignment) {
  // Simulates direct privileged repair/corruption; restore the exact trigger before exercising product code.
  const sql = sqlite.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='publication_state_transition'").get().sql;
  sqlite.exec('DROP TRIGGER publication_state_transition');
  sqlite.exec('PRAGMA ignore_check_constraints=ON');
  sqlite.exec('UPDATE public_publication_state SET ' + assignment + ' WHERE id=1');
  sqlite.exec('PRAGMA ignore_check_constraints=OFF');
  sqlite.exec(sql);
}
function insertReport(sqlite, id = 'synthetic-approved', patch = {}) {
  const row = { id, status: 'approved', species: '참새', lat: 37.123, lon: 127.456, public_lat: null, public_lon: null, approx_lat: 37.12, approx_lon: 127.45, pending_public: 1, observed_on: '2026-10-12', received_at: new Date().toISOString(), bird_count: 1, reporter: '합성시험', name_public: 1, site_id: '1', ip_hash: 'synthetic', dedupe_hash: id, ...patch };
  sqlite.prepare('INSERT INTO reports (' + Object.keys(row).join(',') + ') VALUES (' + Object.keys(row).map(() => '?').join(',') + ')').run(...Object.values(row));
}
function canonicalInput(n) {
  const id='10000000-0000-4000-8000-'+String(n).padStart(12,'0'),at=new Date().toISOString();
  return { row:{id,status:'pending',species:'참새',lat:37.123,lon:127.456,public_lat:null,public_lon:null,approx_lat:37.12,approx_lon:127.45,pending_public:1,observed_on:'2026-10-12',received_at:at,decided_at:null,bird_count:1,reporter:'합성시험',note:null,admin_note:null,site_id:null,name_public:0,spot_key:null,ip_hash:'synthetic',dedupe_hash:'canonical-'+id},input:{species:'참새',lat:37.123,lon:127.456,observedOn:'2026-10-12',non_breeding_confirmed:true},accepted:{ok:true,id,status:'pending',publicVisibility:'approximate'},tokenHash:n.toString(16).padStart(64,'0') };
}
const fieldInput = patch => ({ species: '참새', status: 'visible', visibilityRadius:'all', lat: 37.123, lon: 127.456, nickname: '합성시험', deviceId: DEVICE_A, turnstileToken: 'synthetic-token', ...patch });
async function create(env, patch) {
  const result = await call(env, '/field-updates', { method: 'POST', body: fieldInput(patch) });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(typeof (result.body.update?.id ?? result.body.id), 'string');
  return result.body.update?.id ?? result.body.id;
}
const post = (env, id, action, body, options = {}) => call(env, '/field-updates/' + id + '/' + action, { method: 'POST', body, ...options });
const field = (sqlite, id) => sqlite.prepare('SELECT * FROM field_updates WHERE id=?').get(id);
const events = (sqlite, id) => sqlite.prepare('SELECT * FROM field_update_events WHERE field_update_id=? ORDER BY rowid').all(id);
const count = (sqlite, id) => sqlite.prepare('SELECT COUNT(*) AS n FROM field_update_confirmations WHERE field_update_id=?').get(id).n;
function noCoordinates(result) { assert.equal(JSON.stringify(result.body).includes('37.123'), false); assert.equal(JSON.stringify(result.body).includes('127.456'), false); }

test('publication: additive migration preserves canonical schemaReady and fresh schema contract', async () => {
  const before = fixture({ migrate: false });
  assert.equal(await schemaReady(before.db), true);
  before.sqlite.exec(migration());
  assert.equal(await schemaReady(before.db), true);
  assert.ok(before.sqlite.prepare('PRAGMA table_info(field_updates)').all().some(r => r.name === 'row_revision'));
  const fresh = new DatabaseSync(':memory:'); fresh.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  assert.ok(fresh.prepare('SELECT epoch,CAST(revision AS TEXT) AS revision FROM public_publication_state').get());
});

test('publication: head echoes only valid fresh nonce and strict version strings', async () => {
  const { env } = fixture();
  const result = await head(env);
  assert.equal(result.status, 200); assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.body.publication.contract, CONTRACT); assert.equal(result.body.publication.projection, PROJECTION);
  assert.match(result.body.publication.epoch, /^[0-9a-f]{32}$/); assert.match(result.body.publication.revision, /^(0|[1-9][0-9]*)$/);
  assert.equal(result.body.publication.nonce, NONCE); noCoordinates(result);
});

for (const nonce of ['', 'abc', 'g'.repeat(32), 'a'.repeat(31), 'a'.repeat(33), '["' + NONCE + '"]', '{"toString":"not-callable"}']) {
  test('publication: invalid nonce fails closed ' + JSON.stringify(nonce), async () => {
    const result = await head(fixture().env, nonce); assert.equal(result.status, 400); noCoordinates(result);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
  });
}

test('publication: revision parser rejects coercion, noncanonical decimal, underflow/overflow', () => {
  for (const value of [undefined, null, 0, 1, NaN, Infinity, -Infinity, true, false, [], ['42'], {}, { toString: 'not-callable' }, '', ' ', '-1', '+1', '01', '1.0', '1e3', '9223372036854775808', '9999999999999999999999']) assert.equal(publicationRevision(value), false, String(typeof value) + ':' + JSON.stringify(value));
  for (const value of ['0', '1', '42', '9007199254740993', '9223372036854775807']) assert.equal(publicationRevision(value), true, value);
});

test('publication: incomplete trigger installation cannot issue a valid authority anchor', async () => {
  const { env, sqlite } = fixture();
  sqlite.exec('DROP TRIGGER publication_reports_delete');
  const result = await head(env); assert.equal(result.status, 503); noCoordinates(result);
});

test('publication: malformed epoch or counter is unavailable and source writes abort', async () => {
  for (const assignment of ["epoch='gggggggggggggggggggggggggggggggg'", "revision='bogus'", 'revision=-1']) {
    const { env, sqlite } = fixture(); privilegedState(sqlite, assignment);
    assert.equal((await head(env)).status, 503, assignment);
    assert.throws(() => insertReport(sqlite), assignment);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get().n, 0, assignment);
  }
});

for (const path of ['/reports/approved', '/reports/pending', '/reports/recent-sites', '/reports/site/1', '/field-updates']) {
  test('publication: strict legacy ' + path + ' cannot expose a raw coordinate response', async () => {
    const { env, sqlite } = fixture(); insertReport(sqlite); await create(env);
    const result = await call(env, path); assert.ok([400, 503].includes(result.status), JSON.stringify(result.body)); noCoordinates(result);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
  });
  test('publication: atomic state/data and matching authority for ' + path, async () => {
    const { env, db, sqlite } = fixture(); insertReport(sqlite); await create(env);
    db.calls.length = 0; const result = await current(env, path);
    assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(result.body.publication.revision, revision(sqlite)); assert.equal(result.body.publication.nonce, NONCE);
    assert.ok(db.calls.some(c => c.mode === 'batch' && c.sql.some(s => /public_publication_state/.test(s)) && c.sql.some(s => /\bFROM (reports|field_updates)\b/.test(s))), 'Authority and projection must be read in one transaction');
    assert.equal(db.calls.some(c => ['all', 'first'].includes(c.mode) && /\bFROM (reports|field_updates)\b/.test(c.sql)), false, 'No split projection SELECT outside snapshot');
  });
}

test('publication: old expected revision is 409 without payload, after withdrawal and hiding', async () => {
  const { env, sqlite } = fixture(); insertReport(sqlite);
  const old = (await head(env)).body.publication;
  sqlite.prepare("UPDATE reports SET status='rejected',public_lat=38,public_lon=128 WHERE id=?").run('synthetic-approved');
  const result = await call(env, query('/reports/approved', old));
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'PUBLICATION_CHANGED'); noCoordinates(result);
  assert.equal((await current(env, '/reports/approved')).body.spots.length, 0);
});

test('publication: missing schema or singleton is 503 and mutation does not succeed', async () => {
  const absent = fixture({ migrate: false });
  assert.equal((await head(absent.env)).status, 503);
  const { sqlite, env } = fixture();
  // Simulates incomplete installation after privileged corruption, without operating D1 access.
  const guards = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name='public_publication_state'").all();
  for (const { name } of guards) sqlite.exec('DROP TRIGGER "' + name + '"');
  sqlite.exec('DELETE FROM public_publication_state');
  assert.equal((await head(env)).status, 503);
  assert.throws(() => insertReport(sqlite));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get().n, 0);
});

test('publication: revision larger than 2^53 remains decimal text and exact', async () => {
  const { sqlite, env } = fixture();
  privilegedState(sqlite, 'revision=9007199254740993');
  const first = await head(env); assert.equal(first.status, 200); assert.equal(first.body.publication.revision, '9007199254740993');
  insertReport(sqlite); const next = await head(env); assert.equal(next.body.publication.revision, '9007199254740994');
  assert.equal((await call(env, query('/reports/approved', first.body.publication))).status, 409);
});

test('publication: overflow aborts source mutation and counter in the same transaction', async () => {
  const { sqlite } = fixture();
  privilegedState(sqlite, 'revision=9223372036854775807');
  assert.throws(() => insertReport(sqlite));
  assert.equal(revision(sqlite), '9223372036854775807');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get().n, 0);
});

test('publication: insert/update/delete coverage and failed batch rollback include counter', async () => {
  const { sqlite, db } = fixture(); const begin = BigInt(revision(sqlite));
  insertReport(sqlite); assert.ok(BigInt(revision(sqlite)) > begin);
  const afterInsert = BigInt(revision(sqlite)); sqlite.prepare("UPDATE reports SET name_public=0,note='합성 변경' WHERE id=?").run('synthetic-approved'); assert.ok(BigInt(revision(sqlite)) > afterInsert);
  const beforeFailure = revision(sqlite);
  await assert.rejects(strictWriterDb(db,true).batch([db.prepare("UPDATE reports SET status='rejected' WHERE id='synthetic-approved'"), db.prepare("INSERT INTO transaction_assertions(assertion_id,ok) VALUES('injected-failure',0)")]),/CHECK constraint failed/);
  assert.equal(revision(sqlite), beforeFailure); assert.equal(sqlite.prepare('SELECT status FROM reports').get().status, 'approved');
  sqlite.exec("DELETE FROM reports WHERE id='synthetic-approved'"); assert.ok(BigInt(revision(sqlite)) > BigInt(beforeFailure));
});

test('canonical dual write: success and injected failure keep publication/report/raw/checklist/redemption atomic',async()=>{
  const {db,sqlite}=fixture(); const firstInput=canonicalInput(1),before=revision(sqlite);
  await persistQuick(strictWriterDb(db,true),firstInput.row,firstInput.input,firstInput.accepted,firstInput.tokenHash);
  assert.ok(BigInt(revision(sqlite))>BigInt(before));
  for(const table of ['reports','raw_submissions','checklists','sightings','captcha_redemptions'])assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,1,table);
  let injectedCause; const frozen=revision(sqlite),second=canonicalInput(2),failing={prepare:sql=>db.prepare(sql),batch:list=>{const copy=[...list];copy.splice(5,0,db.prepare("INSERT INTO transaction_assertions(assertion_id,ok) VALUES('canonical-injected',0)"));return strictWriterDb(db,true).batch(copy).catch(error=>{injectedCause=error;throw error;});}};
  await assert.rejects(persistQuick(failing,second.row,second.input,second.accepted,second.tokenHash),e=>e.code==='WRITE_FAILED');
  assert.match(String(injectedCause),/CHECK constraint failed/,'Injected middle failure reached original CHECK, not writer fence');
  assert.equal(revision(sqlite),frozen);
  for(const table of ['reports','raw_submissions','checklists','sightings','captcha_redemptions'])assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,1,table);
  assert.equal(await schemaReady(db),true);
});

test('canonical shadow: same authority snapshots compare and changed authority is explicitly inconclusive',async()=>{
  const {db,env,sqlite}=fixture(),input=canonicalInput(3); await persistQuick(strictWriterDb(db,true),input.row,input.input,input.accepted,input.tokenHash);
  const publication=(await head(env)).body.publication,path=query('/reports/pending',publication);
  const req=()=>new Request('https://publication.test'+path,{headers:{Origin:ORIGIN}});
  const original=await handleLegacyRequest(req(),env),logs=[];
  assert.deepEqual(await shadowRead(req(),env,original.clone(),handleLegacyRequest,entry=>logs.push(entry)),[]);
  sqlite.prepare("UPDATE reports SET pending_public=0 WHERE id=?").run(input.row.id);
  assert.deepEqual(await shadowRead(req(),env,original.clone(),handleLegacyRequest,entry=>logs.push(entry)),['publication_changed']);
  assert.equal(logs.at(-1).event,'canonical_shadow_inconclusive');
});

test('field CAS: deleted is terminal against old unconditional status/activity/coordinate writes', async () => {
  const { env, sqlite } = fixture(); const id = await create(env);
  assert.equal((await post(env, id, 'delete', { deviceId: DEVICE_A })).status, 200);
  const before = field(sqlite, id), version = revision(sqlite);
  for (const set of ["status='reappeared'", "last_activity_at='2099-01-01T00:00:00.000Z'", 'public_lat=38,public_lon=128']) assert.throws(() => sqlite.prepare('UPDATE field_updates SET ' + set + ' WHERE id=?').run(id),/field_deleted_terminal/);
  assert.deepEqual(field(sqlite, id), before); assert.equal(revision(sqlite), version);
});

test('field CAS: late child event or confirmation cannot append after deletion', async () => {
  const { env, sqlite }=fixture(); const id=await create(env); await post(env,id,'delete',{deviceId:DEVICE_A});
  const before=revision(sqlite),beforeEvents=events(sqlite,id),at=new Date().toISOString();
  assert.throws(()=>sqlite.prepare("INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES('late-event',?,'reappeared','합성',?,'synthetic','synthetic')").run(id,at),/field_deleted_terminal/);
  assert.throws(()=>sqlite.prepare("INSERT INTO field_update_confirmations(id,field_update_id,user_hash,ip_hash,created_at) VALUES('late-confirm',?,'synthetic-other','synthetic',?)").run(id,at),/field_deleted_terminal/);
  assert.equal(revision(sqlite),before); assert.deepEqual(events(sqlite,id),beforeEvents); assert.equal(count(sqlite,id),0);
});

test('field CAS: row revision advancement terminates even with recursive SQLite triggers', async()=>{
  const {env,sqlite}=fixture(); const id=await create(env); sqlite.exec('PRAGMA recursive_triggers=ON');
  sqlite.prepare("UPDATE field_updates SET status='not_visible' WHERE id=?").run(id);
  assert.equal(field(sqlite,id).row_revision,2); assert.equal(field(sqlite,id).status,'not_visible');
});

test('field CAS: old normal writer advances row revision and old CAS cannot perform ABA write', async () => {
  const { env, sqlite, db } = fixture(); const id = await create(env);
  sqlite.prepare("UPDATE field_updates SET status='not_visible' WHERE id=?").run(id);
  sqlite.prepare("UPDATE field_updates SET status='reappeared' WHERE id=?").run(id);
  const now = field(sqlite,id); assert.equal(now.status,'reappeared'); assert.equal(now.row_revision,3);
  await assert.rejects(strictWriterDb(db,true).batch([db.prepare("UPDATE field_updates SET status='not_visible',row_revision=row_revision+1 WHERE id=? AND row_revision=1").bind(id),db.prepare("INSERT INTO transaction_assertions(assertion_id,ok) VALUES('aba-failure',CASE WHEN changes()=1 THEN 1 ELSE 0 END)")]),/CHECK constraint failed/);
  assert.equal(field(sqlite,id).status,'reappeared'); assert.equal(field(sqlite,id).row_revision,3);
});

test('field CAS: row revision over 2^53 is serialized and compared as exact text', async () => {
  const { env, sqlite } = fixture(); const id = await create(env);
  const sql=sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name='field_revision_valid'").get().sql;
  sqlite.exec('DROP TRIGGER field_revision_valid'); sqlite.prepare('UPDATE field_updates SET row_revision=9007199254740993 WHERE id=?').run(id); sqlite.exec(sql);
  const before=await current(env,'/field-updates'); assert.equal(before.body.updates[0].rowRevision,'9007199254740993');
  const after=await post(env,id,'status',{status:'not_visible',deviceId:DEVICE_B,turnstileToken:'synthetic-token'}); assert.equal(after.status,201,JSON.stringify(after.body)); noCoordinates(after);
  const refreshed=await current(env,'/field-updates'); assert.equal(refreshed.body.updates[0].rowRevision,'9007199254740994');
});

test('field CAS: status read before delete cannot restore deleted or append a status event', async () => {
  const { env, db, sqlite } = fixture(); const id = await create(env);
  await post(env, id, 'status', { status: 'not_visible', deviceId: DEVICE_B, turnstileToken: 'synthetic-token' });
  db.setBeforeBatch(async () => { assert.equal((await post(env, id, 'delete', { deviceId: DEVICE_A })).status, 200); });
  const result = await post(env, id, 'status', { status: 'reappeared', deviceId: DEVICE_B, turnstileToken: 'synthetic-token' });
  assert.ok([404, 409].includes(result.status), JSON.stringify(result.body)); assert.equal(field(sqlite, id).status, 'deleted');
  assert.deepEqual(events(sqlite, id).map(e => e.status), ['visible', 'not_visible', 'deleted']);
});

test('field CAS: confirm read before delete rolls back confirmation/activity and publication', async () => {
  const { env, db, sqlite } = fixture(); const id = await create(env); let afterDelete;
  db.setBeforeBatch(async () => { assert.equal((await post(env, id, 'delete', { deviceId: DEVICE_A })).status, 200); afterDelete = revision(sqlite); });
  const result = await post(env, id, 'confirm', { deviceId: DEVICE_B });
  assert.ok([404, 409].includes(result.status), JSON.stringify(result.body)); assert.equal(field(sqlite, id).status, 'deleted');
  assert.equal(count(sqlite, id), 0); assert.equal(field(sqlite, id).last_confirmed_at, null); assert.equal(revision(sqlite), afterDelete);
});

test('field CAS: concurrent owner deletion is idempotent and appends exactly one event', async () => {
  const { env, sqlite } = fixture(); const id = await create(env);
  const results = await Promise.all([post(env, id, 'delete', { deviceId: DEVICE_A }), post(env, id, 'delete', { deviceId: DEVICE_A })]);
  assert.deepEqual(results.map(r => r.status), [200, 200]); assert.equal(events(sqlite, id).filter(e => e.status === 'deleted').length, 1);
});

test('field CAS: concurrent confirmations have one CAS winner and normal loser retry succeeds', async()=>{
  const {env,sqlite}=fixture(); const id=await create(env);
  const pair=await Promise.all([post(env,id,'confirm',{deviceId:DEVICE_B}),post(env,id,'confirm',{deviceId:'publication-reader-cccccccc'})]);
  assert.deepEqual(pair.map(r=>r.status).sort(),[201,409]); assert.equal(count(sqlite,id),1);
  const loser=pair[0].status===409?DEVICE_B:'publication-reader-cccccccc';
  assert.equal((await post(env,id,'confirm',{deviceId:loser})).status,201); assert.equal(count(sqlite,id),2);
});

test('field CAS: status expiry during asynchronous validation cannot revive expired item', async () => {
  const { env, sqlite } = fixture(); const now = Date.now();
  mock.timers.enable({ apis: ['Date'], now });
  try {
    const id = await create(env); mock.timers.setTime(now + FIELD_UPDATE_TTL_HOURS * 3600000 - 1);
    const result = await post(env, id, 'status', { status: 'not_visible', deviceId: DEVICE_B, turnstileToken: 'synthetic-token' }, { onTurnstile: () => mock.timers.setTime(now + FIELD_UPDATE_TTL_HOURS * 3600000 + 1) });
    assert.ok([409, 410].includes(result.status), JSON.stringify(result.body)); assert.equal(field(sqlite, id).status, 'visible');
    assert.deepEqual(events(sqlite, id).map(e => e.status), ['visible']);
  } finally { mock.timers.reset(); }
});

test('field TTL: guarded writes remain valid at four hours, expire after eight', async () => {
  const {env,sqlite}=fixture();
  assert.equal(FIELD_UPDATE_TTL_HOURS,8);
  const fourHoursAgo=new Date(Date.now()-4*3600000).toISOString();
  const statusId=await create(env);
  sqlite.prepare('UPDATE field_updates SET last_activity_at=? WHERE id=?').run(fourHoursAgo,statusId);
  const statusResult=await post(env,statusId,'status',{status:'not_visible',deviceId:DEVICE_B,turnstileToken:'synthetic-token'});
  assert.equal(statusResult.status,201,JSON.stringify(statusResult.body));
  const confirmId=await create(env);
  sqlite.prepare('UPDATE field_updates SET last_activity_at=? WHERE id=?').run(fourHoursAgo,confirmId);
  const confirmResult=await post(env,confirmId,'confirm',{deviceId:DEVICE_B});
  assert.equal(confirmResult.status,201,JSON.stringify(confirmResult.body));
  const expiredId=await create(env);
  const expiredAt=new Date(Date.now()-(FIELD_UPDATE_TTL_HOURS*60+1)*60000).toISOString();
  sqlite.prepare('UPDATE field_updates SET last_activity_at=? WHERE id=?').run(expiredAt,expiredId);
  const expired=await post(env,expiredId,'status',{status:'not_visible',deviceId:DEVICE_B,turnstileToken:'synthetic-token'});
  assert.equal(expired.status,410,JSON.stringify(expired.body));
});

test('field CAS: normal expire/reappear/reapprove are not permanent tombstones', async () => {
  const { env, sqlite } = fixture(); const id = await create(env);
  const missing = await post(env, id, 'status', { status: 'not_visible', deviceId: DEVICE_B, turnstileToken: 'synthetic-token' }); assert.equal(missing.status, 201);
  const reappeared = await post(env, id, 'status', { status: 'reappeared', deviceId: DEVICE_B, turnstileToken: 'synthetic-token' }); assert.equal(reappeared.status, 201);
  const result = await current(env, '/field-updates'); assert.equal(result.body.updates.find(u => u.id === id).status, 'reappeared');
  insertReport(sqlite); sqlite.exec("UPDATE reports SET status='rejected'"); assert.equal((await current(env, '/reports/approved')).body.spots.length, 0);
  sqlite.exec("UPDATE reports SET status='approved'"); assert.equal((await current(env, '/reports/approved')).body.spots.length, 1);
});



// Historical writer-shaped rows are synthetic. No production rows are repaired
// during a read; unknown masking proof closes the coordinate projection only.
async function legacyField(env, sqlite, species, hidden = 0, masked = false) {
  const id = await create(env);
  sqlite.prepare("UPDATE field_updates SET species=?,location_hidden=?,public_lat=?,public_lon=?,row_revision=row_revision+1 WHERE id=?")
    .run(species, hidden, masked ? 37.12 : 37.123, masked ? 127.45 : 127.456, id);
  return id;
}

test('B6 saved protected quantities: strict current snapshot omits unverified coordinates and does not write', async () => {
  const { env, sqlite } = fixture();
  const names = ['저어새1', '저어새 2마리', '흰꼬리수리1', '매1', '참새/저어새1', '참새\n매1'];
  const ids = [];
  for (const name of names) ids.push(await legacyField(env, sqlite, name));
  const before = ids.map(id => ({ ...field(sqlite, id) })), rev = revision(sqlite);
  for (let i = 0; i < 3; i++) {
    const response = await current(env, '/field-updates');
    assert.equal(response.status, 200);
    assert.equal(response.body.publication.revision, rev);
    for (const id of ids) {
      const entry = response.body.updates.find(row => row.id === id);
      assert.equal(entry.locationHidden, true);
      assert.equal(entry.lat, null); assert.equal(entry.lon, null);
      assert.equal(Object.hasOwn(entry, 'public_point_masked'), false);
      assert.equal(Object.hasOwn(entry, 'user_hash'), false);
    }
    noCoordinates(response);
  }
  assert.deepEqual(ids.map(id => ({ ...field(sqlite, id) })), before);
  assert.equal(revision(sqlite), rev);
});

test('B6 legacy GET uses the same saved-protection projection as strict GET', async () => {
  const { env, sqlite } = fixture(); await legacyField(env, sqlite, '저어새1');
  env.REPORTS_PUBLICATION_REQUIRED = 'false';
  const response = await call(env, '/field-updates');
  assert.equal(response.status, 200); noCoordinates(response);
  assert.equal(response.body.updates[0].locationHidden, true);
  assert.equal(response.body.updates[0].lat, null);
});

test('B6 normal stored species retain exact public coordinates without false positives', async () => {
  const { env, sqlite } = fixture();
  const names = ['갈매기', '알락오리', '알락할미새', '동박새', '한국동박새', '검은어깨매'];
  const ids = [];
  for (const name of names) ids.push(await legacyField(env, sqlite, name));
  const response = await current(env, '/field-updates'); assert.equal(response.status, 200);
  for (const id of ids) {
    const entry = response.body.updates.find(row => row.id === id);
    assert.equal(entry.locationHidden, undefined);
    assert.equal(entry.lat, 37.123); assert.equal(entry.lon, 127.456);
  }
});

test('B6 verified saved masked coordinates remain stable across strict and legacy reads', async () => {
  const { env, sqlite } = fixture(); const id = await legacyField(env, sqlite, '저어새1', 1, true);
  for (let i = 0; i < 3; i++) {
    const response = await current(env, '/field-updates');
    const entry = response.body.updates.find(row => row.id === id);
    assert.equal(entry.locationHidden, true);
    assert.equal(entry.lat, 37.12); assert.equal(entry.lon, 127.45);
  }
  env.REPORTS_PUBLICATION_REQUIRED = 'false';
  const entry = (await call(env, '/field-updates')).body.updates.find(row => row.id === id);
  assert.equal(entry.lat, 37.12); assert.equal(entry.lon, 127.45);
});

test('B6 hidden flag alone cannot authorize exact stored coordinates', async () => {
  const { env, sqlite } = fixture(); await legacyField(env, sqlite, '저어새1', 1, false);
  const response = await current(env, '/field-updates'); assert.equal(response.status, 200);
  assert.equal(response.body.updates[0].locationHidden, true); noCoordinates(response);
  assert.equal(response.body.updates[0].lat, null); assert.equal(response.body.updates[0].lon, null);
});

test('B6 unknown historical masking does not break owner deletion or normal reappearance receipts', async () => {
  const { env, sqlite } = fixture(); const id = await legacyField(env, sqlite, '매1');
  for (const status of ['not_visible', 'reappeared']) {
    const result = await post(env, id, 'status', { status, deviceId: DEVICE_B, turnstileToken: 'synthetic-token' });
    assert.equal(result.status, 201); assert.equal(result.body.id, id); assert.equal(result.body.status, status);
    noCoordinates(result);
    const entry = (await current(env, '/field-updates')).body.updates.find(row => row.id === id);
    assert.equal(entry.status, status); assert.equal(entry.locationHidden, true); assert.equal(entry.lat, null);
  }
  const removed = await post(env, id, 'delete', { deviceId: DEVICE_A });
  assert.equal(removed.status, 200); assert.equal(field(sqlite, id).status, 'deleted');
  assert.equal((await current(env, '/field-updates')).body.updates.length, 0);
});


for (const guard of PUBLICATION_GUARDS) {
  test('Free SQL: warm lookup still rejects missing guard ' + guard, async () => {
    const { env, sqlite } = fixture();
    assert.equal((await head(env)).status, 200); // Cold hint discovery.
    assert.equal((await head(env)).status, 200); // Physically rechecks warm locators.
    sqlite.exec('DROP TRIGGER ' + guard);
    const result = await head(env);
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'PUBLICATION_UNAVAILABLE'); noCoordinates(result);
  });
}

test('Free SQL: stale lookup repair reruns state and data together, never relabels an earlier payload', async () => {
  const { env, db, sqlite } = fixture(); insertReport(sqlite);
  const anchor = (await head(env)).body.publication;
  const trigger = sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name='field_confirmation_live'").get().sql;
  sqlite.exec("DROP TRIGGER field_confirmation_live; CREATE TRIGGER unrelated_lookup_shift AFTER INSERT ON transaction_assertions BEGIN SELECT 1; END;");
  sqlite.exec(trigger); // Same required names, different rowid hint.
  const original = db.batch.bind(db); let batches = 0;
  db.batch = async statements => {
    const result = await original(statements); batches++;
    if (batches === 1) sqlite.exec("UPDATE reports SET public_lat=37.2,public_lon=127.5 WHERE id='synthetic-approved'");
    return result;
  };
  const result = await call(env, query('/reports/approved', anchor));
  assert.equal(batches, 2, 'Cold recovery must reread the full snapshot');
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'PUBLICATION_CHANGED'); noCoordinates(result);
});

test('Free SQL: different D1 bindings cannot share lookup hints', async () => {
  const good = fixture(), bad = fixture(); assert.equal((await head(good.env)).status, 200);
  bad.sqlite.exec('DROP TRIGGER field_deleted_terminal');
  assert.equal((await head(bad.env)).status, 503);
  assert.equal((await head(good.env)).status, 200);
});

// A first-primary constraint applies only to the first query of each session.
// Model that constraint explicitly, rather than treating a binding as primary forever.
function freshPrimaryOnly(db) {
  const sessions=[];
  db.withSession=mode=>{
    assert.equal(mode,'first-primary');
    const entry={queries:0};sessions.push(entry);
    return {
      prepare(sql) {
        const statement=db.prepare(sql);
        const first=statement.first.bind(statement);
        statement.first=async()=>{assert.equal(++entry.queries,1,'A recovery read needs its own first-primary session');return first();};
        return statement;
      },
      async batch(statements) {
        assert.equal(++entry.queries,1,'A recovery batch needs its own first-primary session');
        return db.batch(statements);
      }
    };
  };
  return sessions;
}
function relocateGuard(sqlite) {
  const ddl=sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name='field_confirmation_live'").get().sql;
  sqlite.exec("DROP TRIGGER field_confirmation_live; CREATE TRIGGER unrelated_lookup_shift AFTER INSERT ON transaction_assertions BEGIN SELECT 1; END;");
  sqlite.exec(ddl);
}
test('Free SQL: HEAD locator repair starts a new primary session',async()=>{
  const {env,db,sqlite}=fixture();const sessions=freshPrimaryOnly(db);
  assert.equal((await head(env)).status,200);relocateGuard(sqlite);
  assert.equal((await head(env)).status,200);
  assert.deepEqual(sessions.map(s=>s.queries),[1,1,1]);
});
test('Free SQL: payload locator repair starts a new primary session and rebuilds its batch',async()=>{
  const {env,db,sqlite}=fixture();insertReport(sqlite);const sessions=freshPrimaryOnly(db);
  const anchor=(await head(env)).body.publication;relocateGuard(sqlite);
  const result=await call(env,query('/reports/approved',anchor));
  assert.equal(result.status,200);assert.equal(result.body.spots.length,1);
  assert.deepEqual(sessions.map(s=>s.queries),[1,1,1]);
});
