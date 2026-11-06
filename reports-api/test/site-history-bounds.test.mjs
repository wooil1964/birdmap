import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, canonicalDb, publicEnv, ORIGIN } from './helpers.mjs';
import { handleRequest } from '../src/public.js';
import { SITE_HISTORY_SCAN_MAX, siteHistoryStatement } from '../src/site-history.js';

function row(n, patch = {}) {
  return {id:'history-'+String(n).padStart(6,'0'),status:'approved',species:'청둥오리',
    lat:37.5,lon:127.5,site_id:'19',observed_on:'2020-01-01',received_at:'2020-01-01T00:00:00Z',...patch};
}
async function get(env, suffix = '', strict = false) {
  const url = new URL('https://test/reports/site/19' + suffix);
  if (strict) {
    const head = await handleRequest(new Request('https://test/reports/public-state?nonce='+'a'.repeat(32),{headers:ORIGIN}),env);
    const anchor = (await head.json()).publication;
    for (const [key,value] of Object.entries({contract:'publication-v1',nonce:'a'.repeat(32),expectedEpoch:anchor.epoch,expectedRevision:anchor.revision})) url.searchParams.set(key,value);
  }
  const response = await handleRequest(new Request(url,{headers:ORIGIN}),env);
  return {status:response.status,cache:response.headers.get('Cache-Control'),body:await response.json()};
}

test('site history boundary keeps exact filtered totals, stable ordering and late pages in both read paths', async () => {
  const rows = Array.from({length:SITE_HISTORY_SCAN_MAX},(_,n)=>row(n,
    n%4===1?{species:'매'}:n%4===2?{note:'둥지'}:n%4===3?{public_lat:37.6,public_lon:127.6}:{}));
  // Neither other sites nor non-approved rows consume this site's budget.
  rows.push(...Array.from({length:SITE_HISTORY_SCAN_MAX+1},(_,n)=>row(n,{id:'else-'+n,site_id:'20'})),row(999999,{status:'pending'}));
  const env=publicEnv(fakeDb(rows));
  const visible=rows.filter(r=>r.site_id==='19'&&r.status==='approved'&&Number(r.id.slice(-6))%4===0).sort((a,b)=>b.id.localeCompare(a.id));
  for (const strict of [false,true]) {
    const result=await get(env,'?limit=5&offset=245',strict);
    assert.equal(result.status,200);
    assert.equal(result.body.total,visible.length);
    assert.deepEqual(result.body.history.map(r=>r.id),visible.slice(245,250).map(r=>r.id));
    assert.equal(result.cache,'no-store');
    assert.deepEqual(Object.keys(result.body.history[0]).sort(),['date','id','species']);
    const empty=await get(env,'?limit=5&offset=250',strict);
    assert.equal(empty.body.total,visible.length);assert.deepEqual(empty.body.history,[]);
  }
});

test('site history overflow refuses every page with no partial total, history, coordinates or publication permission', async () => {
  // Mostly restricted candidates: the limit must apply before JS policy filtering.
  const env=publicEnv(fakeDb(Array.from({length:SITE_HISTORY_SCAN_MAX+1},(_,n)=>row(n,{species:n%10?'매':'청둥오리'}))));
  for (const strict of [false,true]) for (const suffix of ['','?limit=1&offset=0','?limit=50&offset=900']) {
    const result=await get(env,suffix,strict);
    assert.equal(result.status,503);assert.equal(result.cache,'no-store');
    assert.deepEqual(result.body,{ok:false,error:{code:'SITE_HISTORY_UNAVAILABLE',message:'출현 이력을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'}});
  }
});

test('bounded canonical history query uses site and evidence indexes without an order temp table', () => {
  let sql;
  siteHistoryStatement({prepare(text){sql=text;return {bind(){return this;}};}},{REPORTS_WRITE_MODE:'CANONICAL_DUAL_WRITE'},'19');
  assert.match(sql,new RegExp('LIMIT '+(SITE_HISTORY_SCAN_MAX+1)+'$'));
  const db=canonicalDb();
  const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all('19').map(r=>r.detail).join('\n');
  assert.match(plan,/SEARCH reports USING INDEX reports_site_history/);
  assert.match(plan,/SEARCH location_checklist USING INDEX sqlite_autoindex_checklists_1/);
  assert.match(plan,/SEARCH location_raw USING INDEX \S+ \((?:raw_id|source_type)=/);
  assert.doesNotMatch(plan,/SCAN reports|USE TEMP B-TREE/);
});
