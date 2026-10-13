// Independent synthetic SQLite/D1-shaped contract tests. No production requests.
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRequest, handleLegacyRequest } from '../src/public.js';
import { schemaReady } from '../src/canonical/control.js';
import { publicationRevision } from '../src/publication.js';
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
const migration = () => readFileSync(new URL('../migrations/0005_publication_security.sql', import.meta.url), 'utf8');

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
  return { sqlite, db, env };
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
const fieldInput = patch => ({ species: '참새', status: 'visible', lat: 37.123, lon: 127.456, nickname: '합성시험', deviceId: DEVICE_A, turnstileToken: 'synthetic-token', ...patch });
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


const output=resolve(process.env.SAVED_FIELD_FIXTURE_OUTPUT||'docs/p1-publication-final-audit/browser/c025d75-saved-protected/actual_api_fixture.json');mkdirSync(new URL('.',new URL('file:///'+output.replaceAll('\\','/'))),{recursive:true});
const {sqlite,db,env}=fixture();
const initialSqlRows=[];
async function currentField(id){const r=await current(env,'/field-updates');assert.equal(r.status,200,JSON.stringify(r.body));return r.body.updates.find(x=>x.id===id)||null;}
async function legacy(name,hidden,masked,label){const id=await create(env);sqlite.prepare('UPDATE field_updates SET species=?,location_hidden=?,public_lat=?,public_lon=?,row_revision=row_revision+1 WHERE id=?').run(name,hidden,masked?37.12:37.123,masked?127.45:127.456,id);const before={...field(sqlite,id)},rev=revision(sqlite),dto=await currentField(id);assert.deepEqual({...field(sqlite,id)},before);assert.equal(revision(sqlite),rev);initialSqlRows.push({label,id,privateSyntheticPoint:{lat:before.lat,lon:before.lon},savedHidden:before.location_hidden,savedPublicPoint:{lat:before.public_lat,lon:before.public_lon},dto});return {id,dto};}
const cases=[];
for(const [name,label] of [['저어새1','quantity-nospace'],['저어새 2마리','quantity-unit'],['흰꼬리수리1','eagle-quantity'],['매1','falcon-quantity'],['참새/저어새1','mixed-slash'],['참새\n매1','mixed-lf']]){const r=await legacy(name,0,false,label);cases.push({kind:'unverified-protected',label,...r});}
for(const [hidden,masked,label] of [[1,true,'saved-masked-proof'],[1,false,'hidden-flag-exact']]){const r=await legacy('저어새1',hidden,masked,label);cases.push({kind:masked?'verified-masked':'unverified-protected',label,...r});}
for(const name of ['갈매기','알락오리','알락할미새','동박새','한국동박새']){const r=await legacy(name,0,false,'normal-'+name);cases.push({kind:'normal',label:name,...r});}
const created=await call(env,'/field-updates',{method:'POST',body:fieldInput({species:'저어새1'})});assert.equal(created.status,201,JSON.stringify(created.body));const ownerId=created.body.id;const ownerInitial=await currentField(ownerId);const steps=[];
for(const status of ['not_visible','reappeared']){const response=await post(env,ownerId,'status',{status,deviceId:DEVICE_A,turnstileToken:'synthetic-token'});assert.equal(response.status,201,JSON.stringify(response.body));steps.push({action:'status',status,receipt:{status:response.status,body:response.body},afterDto:await currentField(ownerId)});}
const removed=await post(env,ownerId,'delete',{deviceId:DEVICE_A});assert.equal(removed.status,200,JSON.stringify(removed.body));steps.push({action:'delete',receipt:{status:removed.status,body:removed.body},afterDto:await currentField(ownerId)});
// Independent API-only receipts for the legacy row that intentionally lacks a selectable client point.
const legacyId=cases[0].id,legacySteps=[];for(const status of ['not_visible','reappeared']){const response=await post(env,legacyId,'status',{status,deviceId:DEVICE_A,turnstileToken:'synthetic-token'});assert.equal(response.status,201);legacySteps.push({action:'status',status,receipt:{status:response.status,body:response.body},afterDto:await currentField(legacyId)});}const legacyRemoved=await post(env,legacyId,'delete',{deviceId:DEVICE_A});assert.equal(legacyRemoved.status,200);legacySteps.push({action:'delete',receipt:{status:legacyRemoved.status,body:legacyRemoved.body},afterDto:await currentField(legacyId)});
const result={schema:'birdmap-saved-protected-actual-product-api-fixture-v1',sourceSha:'3d42910cb0cea8a5e79c2d57d068c91b86b18332',generatedAt:new Date().toISOString(),inputMethod:'Actual handleRequest/publication functions from pinned product archive; real Node SQLite schema+migration+triggers; synthetic normal create then historical writer-shaped SQL state; current protected GET DTOs, status/delete receipts',privateCoordinateNotice:'All coordinates are synthetic; no operating API or real reports are read.',cases,syntheticSqlRowProof:initialSqlRows,createdOwner:{id:ownerId,createReceipt:{status:created.status,body:created.body},initialDto:ownerInitial,steps},legacyKnownIdReceipts:{id:legacyId,steps:legacySteps},sqlReadSelections:db.calls.filter(x=>(x.mode==='batch'?x.sql.join('\n'):x.sql).includes('public_point_masked')).map(x=>x.sql)};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sourceSha:result.sourceSha,path:output,cases:cases.length,normal:cases.filter(x=>x.kind==='normal').length,withheld:cases.filter(x=>x.dto.lat===null).length,createdOwnerSteps:steps.map(x=>({action:x.action,status:x.receipt.status,body:x.receipt.body}))},null,2));
