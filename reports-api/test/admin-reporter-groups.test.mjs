import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {canonicalDb} from './helpers.mjs';
import {confirmedIdentityAction} from '../src/reporter-identity.js';
import {adminStats} from '../src/admin-stats.js';
import {ADMIN_PAGE} from '../src/admin-page.js';
import {handleRequest} from '../src/admin.js';
import {environments,installAuthStubs} from '../local-test/helpers.mjs';

const ENV = {REPORTS_CONFIRMED_IDENTITIES:'1', REPORTS_PUBLICATION_REQUIRED:'true'};
const MIGRATION = readFileSync(new URL('../migrations/0007_reporter_identity.sql', import.meta.url), 'utf8');
const query = (db, params={}, env=ENV) => adminStats(db, new URL('https://admin.example/admin/api/stats?'+new URLSearchParams(params)), new Date(), env);
const select = row => ({reporter:row.reporter, reporterKey:row.reporter_key});
const confirm = (db, reportIds) => confirmedIdentityAction(db, {action:'confirm', reportIds, confirmedSamePerson:true, reason:'본인 확인'}, 'admin@example.test');
const revoke = (db, groupId) => confirmedIdentityAction(db, {action:'revoke', groupId, reason:'확인 철회'}, 'admin@example.test');
function insert(db, id, reporter, species='참새') {
  db.sqlite.prepare(`INSERT INTO reports(id,status,species,reporter,name_public,lat,lon,observed_on,received_at,ip_hash,dedupe_hash,note,admin_note)
    VALUES(?,'approved',?,?,1,35.123456,126.654321,'2026-10-02',?,'SECRET-IP',?,'SECRET-NOTE','SECRET-ADMIN')`)
    .run(id,species,reporter,'2026-10-'+(id.charCodeAt(0)-96).toString().padStart(2,'0')+'T00:00:00Z',id);
}
async function seeded() {
  const db = canonicalDb(); db.sqlite.exec(MIGRATION);
  for (const [id,name,species] of [['a','동명','동박새3 까치5'],['b','동 명','저어새2 동박새3'],['c','동명','박새'],['d','동명 ','찌르레기'],['e','동명','참새'],['z','  ','고니']]) insert(db,id,name,species);
  const first = await confirm(db,['b','a']), second = await confirm(db,['d','c']);
  return {db,first,second};
}
const ids = async (db, row, extra={}) => (await query(db, {view:'list',...select(row),...extra})).rows.map(r=>r.id).sort();
const notFound = e => e.status===404 && e.code==='STATS_REPORTER_NOT_FOUND';

test('동명 확인그룹 두 개와 미연결 제보: 목록의 키로 상세 건수·종수를 각각 제한하고 원본을 보존한다', async()=>{
  const {db,first,second} = await seeded();
  const before = JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());
  const {rows} = await query(db,{view:'reporters'});
  const named = rows.filter(r=>r.reporter==='동명');
  assert.equal(named.length,3);
  assert.equal(new Set(named.map(r=>r.reporter_key)).size,3);
  for (const [key,expected] of [['group:'+first.groupId,['a','b']],['group:'+second.groupId,['c','d']],['name:동명',['e']]]) {
    const row = named.find(r=>r.reporter_key===key);
    assert.deepEqual(await ids(db,row),expected);
    const detail = await query(db,{view:'list',...select(row)});
    assert.equal(detail.summary.total,row.total);
    assert.equal(detail.summary.species,row.species);
    assert.equal(detail.summary.individuals,row.individuals);
  }
  assert.deepEqual((await query(db,{view:'list',noReporter:'1'})).rows.map(r=>r.id),['z']);
  assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),before);
});

test('목록 조회 후 추가된 동명 제보는 확인그룹에 자동 편입되지 않는다', async()=>{
  const {db,first,second} = await seeded();
  const rows = (await query(db,{view:'reporters'})).rows;
  insert(db,'f','동명'); insert(db,'g','동 명');
  assert.deepEqual(await ids(db,rows.find(r=>r.reporter_key==='group:'+first.groupId)),['a','b']);
  assert.deepEqual(await ids(db,rows.find(r=>r.reporter_key==='group:'+second.groupId)),['c','d']);
  assert.deepEqual(await ids(db,rows.find(r=>r.reporter_key==='name:동명')),['e','f']);
  const unlinked = (await query(db,{view:'reporters'})).rows.find(r=>r.reporter==='동 명');
  assert.deepEqual(await ids(db,unlinked),['g']);
});

test('닉네임·키 위조, 없는 그룹, 키 단독 및 충돌·중복 필터를 거부하고 이름만으로 모호한 그룹을 합산하지 않는다', async()=>{
  const {db,first} = await seeded();
  for (const params of [
    {reporter:'다른 이름',reporterKey:'group:'+first.groupId},
    {reporter:'동 명',reporterKey:'group:'+first.groupId},
    {reporter:'동명',reporterKey:'group:00000000-0000-0000-0000-000000000000'},
    {reporter:'동명',reporterKey:'name:동 명'},
    {reporter:'동명',reporterKey:"' OR 1=1 --"},
  ]) await assert.rejects(query(db,{view:'list',...params}),notFound);
  for (const params of [
    {reporterKey:'group:'+first.groupId}, {reporter:'동명',reporterKey:''},
    {reporter:'동명',noReporter:'1'}, {reporter:'동명',reporterKey:'name:동명',noReporter:'1'},
    {reporter:'동명'}, {reporter:'동명',species:'박새'},
    [['reporter','동명'],['reporter','동명']],
    [['reporter','동명'],['reporterKey','name:동명'],['reporterKey','group:'+first.groupId]],
    [['status','approved'],['status','pending']], [['view','list'],['view','reporters']],
    [['noReporter','1'],['noReporter','0']],
  ]) await assert.rejects(query(db,params),e=>e.status===400 && e.code==='STATS_FILTER_INVALID');
});

test('해제·재확인 후 오래된 키는 다른 동명 그룹으로 넘어가지 않고 새 목록만 정확히 조회한다', async()=>{
  const {db,first} = await seeded();
  const old = (await query(db,{view:'reporters'})).rows.find(r=>r.reporter_key==='group:'+first.groupId);
  await revoke(db,first.groupId);
  await assert.rejects(ids(db,old),notFound);
  const unlinked = (await query(db,{view:'reporters'})).rows.find(r=>r.reporter_key==='name:동 명');
  assert.deepEqual(await ids(db,unlinked),['b']);
  const replacement = await confirm(db,['a','b','e']);
  await assert.rejects(ids(db,unlinked),notFound);
  const fresh = (await query(db,{view:'reporters'})).rows.find(r=>r.reporter_key==='group:'+replacement.groupId);
  assert.deepEqual(await ids(db,fresh),['a','b','e']);
  assert.equal(fresh.species,4);
});

test('승인·공개동의 변경은 관리자 그룹 범위를 바꾸지 않으며 상태 필터는 매번 재평가한다', async()=>{
  const {db,first} = await seeded();
  const row = (await query(db,{view:'reporters'})).rows.find(r=>r.reporter_key==='group:'+first.groupId);
  await db.prepare("UPDATE reports SET name_public=0,status='pending' WHERE id='a'").run();
  assert.deepEqual(await ids(db,row),['a','b']);
  assert.deepEqual(await ids(db,row,{status:'approved'}),['b']);
  assert.deepEqual(await ids(db,row,{status:'pending'}),['a']);
  const fresh = await query(db,{view:'list',...select(row)});
  assert.equal(fresh.summary.approved,1); assert.equal(fresh.summary.pending,1);
  await db.prepare("DELETE FROM reports WHERE id='a'").run();
  await assert.rejects(ids(db,row),notFound);
});

test('기본 OFF와 구형 스키마에서도 원래 이름 정확 일치·공백·익명 기준을 유지한다', async()=>{
  const db = canonicalDb();
  insert(db,'a','동명'); insert(db,'b','동명 '); insert(db,'c','  ');
  const rows = (await query(db,{view:'reporters'},{})).rows;
  for (const row of rows.filter(r=>r.reporter!==null)) {
    assert.equal(row.reporter_key,row.reporter);
    const detail = await query(db,{view:'list',...select(row)},{});
    assert.equal(detail.summary.total,1);
  }
  assert.deepEqual((await query(db,{view:'list',reporter:'동명'},{})).rows.map(r=>r.id),['a']);
  await assert.rejects(query(db,{reporter:'동명',reporterKey:'group:fake'},{}),notFound);
});

test('이름만 온 유일 그룹도 검증 후 키를 고정하고, 검증 직후 해제되면 빈 결과로 닫는다', async()=>{
  for (const change of ['insert','revoke']) {
    const db = canonicalDb(); db.sqlite.exec(MIGRATION);
    insert(db,'a','동명'); insert(db,'b','동 명');
    const group = await confirm(db,['a','b']);
    let changed = false;
    const racingDb = {prepare(sql) {
      const stmt = db.prepare(sql);
      if (!sql.startsWith('SELECT DISTINCT ') || !sql.includes('AS reporter_key')) return stmt;
      return {bind(...values) {stmt.bind(...values); return this;}, async all() {
        const result = await stmt.all();
        if (!changed) {
          changed = true;
          if (change==='insert') insert(db,'c','동명'); else await revoke(db,group.groupId);
        }
        return result;
      }};
    }};
    const result = await query(racingDb,{view:'list',reporter:'동명'});
    assert.equal(result.filters.reporterKey,'group:'+group.groupId);
    assert.deepEqual(result.rows.map(r=>r.id).sort(),change==='insert'?['a','b']:[]);
    assert.equal(result.summary.total,change==='insert'?2:0);
  }
});

test('인증된 통계 응답에만 그룹 키를 주며 상세에도 보호종 위치·메모·해시·이메일은 없다', async t=>{
  const auth = await installAuthStubs(); t.after(auth.restore);
  const {db} = await seeded(), env = {...environments(db).admin,...ENV};
  const call = (params,token=auth.token) => handleRequest(new Request('https://admin.example/admin/api/stats?'+new URLSearchParams(params),{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}}),env);
  const response = await call({view:'reporters'});
  assert.equal(response.status,200); assert.equal(response.headers.get('Cache-Control'),'no-store');
  const listing = await response.json();
  for (const row of listing.rows.filter(r=>r.reporter!==null)) {
    const res = await call({view:'list',...select(row)});
    assert.equal(res.status,200); assert.equal(res.headers.get('Cache-Control'),'no-store');
    const body = await res.text();
    for (const secret of ['lat','lon','35.123456','126.654321','SECRET','ip_hash','dedupe_hash','admin_note','@example']) assert.ok(!body.includes(secret),secret);
    const denied = await call({view:'list',...select(row)},null);
    assert.ok([401,403].includes(denied.status));
    assert.ok(!(await denied.text()).includes(row.reporter_key));
  }
});

test('관리자 화면은 닉네임과 키를 함께 보내고 기존 이름 필터를 중복 없이 교체한다',()=>{
  const fields = {sfReporter:'다른 이름',sfSpecies:'박새',sfStatus:'approved',sfFrom:'',sfTo:'',sfYear:'',sfMonth:'',sfSite:''};
  const context = vm.createContext({URLSearchParams,document:{getElementById:id=>({value:fields[id]})}});
  vm.runInContext(ADMIN_PAGE.slice(ADMIN_PAGE.indexOf('function statsQuery('),ADMIN_PAGE.indexOf('function renderCards(')),context);
  const row = {reporter:'동명',reporter_key:'group:123'};
  const drill = context.drillFor('reporters',row);
  const url = new URL(context.statsQuery('list',drill),'https://admin.example');
  assert.equal(url.searchParams.get('reporter'),row.reporter);
  assert.equal(url.searchParams.get('reporterKey'),row.reporter_key);
  assert.equal(url.searchParams.getAll('reporter').length,1);
  assert.equal(url.searchParams.get('species'),'박새'); assert.equal(url.searchParams.get('status'),'approved');
  const anonymous = new URL(context.statsQuery('list',context.drillFor('reporters',{reporter:null})),'https://admin.example');
  assert.equal(anonymous.searchParams.get('noReporter'),'1');
  assert.ok(!anonymous.searchParams.has('reporter')); assert.ok(!anonymous.searchParams.has('reporterKey'));
});
