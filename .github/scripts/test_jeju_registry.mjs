import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {prepareSiteSeed,seedSitesLocally} from '../../reports-api/tools/sites-seed.mjs';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'../..');
const html=readFileSync(join(ROOT,'index.html'),'utf8');
const reviewed=JSON.parse(readFileSync(join(ROOT,'data/jeju-birding-sites-20261018.json'),'utf8'));
// Registry size comes from the validated expectation (PR base + approval ledgers), not a fixed literal.
const SITE_COUNT=createRequire(import.meta.url)('../../docs/site-data-guard/guard.cjs').expected().siteData.length;

test('runtime inline JavaScript parses after literal additions',()=>{
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(match[2].trim()){
  if(/application\/ld\+json/.test(match[1]))assert.doesNotThrow(()=>JSON.parse(match[2]));
  else assert.doesNotThrow(()=>new vm.Script(match[2]));
 }
});

test('validated-size plan uses existing picker and requires explicit count, with reviewed payloads',async()=>{
 const options={capturedAt:'2026-10-18T00:00:00+09:00'};
 await assert.rejects(prepareSiteSeed(html,options),/탐조지 수/); // Default 190 guard stays enabled.
 const plan=await prepareSiteSeed(html,{...options,expectedCount:SITE_COUNT});
 assert.equal(plan.source_count,SITE_COUNT);
 assert.equal(new Set(plan.sites.map(s=>s.site_id )).size,SITE_COUNT);
 await assert.rejects(prepareSiteSeed(html,{...options,expectedCount:SITE_COUNT+1}),/탐조지 수/);
 for(const r of reviewed.records){
  const row=plan.sites.find(s=>s.site_id===r.site.id);
  assert.equal(row.site_name,r.site.name);
  assert.equal(row.lat,r.site.lat);assert.equal(row.lon,r.site.lon);
  assert.deepEqual(JSON.parse(row.source_record_json),r.site);
 }
});

// Rejection paths that replace the old byte lock on reports-api/tools/sites-seed.mjs.
// Synthetic pages and an in-memory DB double only: no D1 or operational API is touched.
const site=(id,extra={})=>({id,name:'시험 '+id,lat:36.5,lon:127.5,...extra});
const page=records=>`<script>var siteData=${JSON.stringify(records)};</script>`;
const CAPTURED='2026-11-04T00:00:00+09:00';
const plan=(records,options={})=>prepareSiteSeed(page(records),{capturedAt:CAPTURED,expectedCount:records.length,...options});
const code=expected=>error=>error.code===expected;

test('seed plan accepts a well-formed registry, including sites without coordinates',async()=>{
 const result=await plan([site('1'),site('2',{lat:undefined,lon:undefined})]);
 assert.equal(result.source_count,2);
 assert.deepEqual(result.sites.map(s=>[s.site_id,s.lat,s.lon]),[['1',36.5,127.5],['2',null,null]]);
});

test('seed plan rejects count, duplicate, coordinate, identity and capture-time faults',async()=>{
 await assert.rejects(plan([site('1'),site('2')],{expectedCount:3}),code('REGISTRY_INVALID'));
 await assert.rejects(plan([site('1'),site('1')]),code('REGISTRY_INVALID'));
 for(const extra of [{lat:91},{lon:-181},{lat:'36.5'},{lon:undefined},{lat:null,lon:127.5}])
  await assert.rejects(plan([site('1'),site('2',extra)]),code('REGISTRY_COORDINATE_INVALID'),JSON.stringify(extra));
 for(const extra of [{name:''},{name:undefined},{name:7}])
  await assert.rejects(plan([site('1'),site('2',extra)]),code('REGISTRY_INVALID'),JSON.stringify(extra));
 // A non-string ID is rejected, but may surface as a TypeError from checksum sorting before
 // the explicit REGISTRY_INVALID check runs. Either way no plan is produced.
 await assert.rejects(plan([site('1'),site(2)]));
 for(const capturedAt of [undefined,'','not a time'])
  await assert.rejects(plan([site('1')],{capturedAt}),code('CAPTURE_TIME_REQUIRED'),String(capturedAt));
});

function memoryDb(existing){
 const calls={prepared:0,batches:[]};
 return {calls,prepare(sql){calls.prepared++;return {bind:(...values)=>({sql,values,all:async()=>({results:existing})})};},
  async batch(statements){calls.batches.push(statements);}};
}

test('local seed refuses non-test scopes and drifted registries without writing',async()=>{
 const ready=await plan([site('1'),site('2')]);
 for(const scope of [undefined,'production','remote','LOCAL-TEST']){
  const db=memoryDb([]);
  await assert.rejects(seedSitesLocally(db,ready,{scope}),code('SEED_DISABLED'),String(scope));
  assert.equal(db.calls.prepared,0);assert.equal(db.calls.batches.length,0);
 }
 const drifted=memoryDb([ready.sites[0],{...ready.sites[1],site_name:'바뀐 이름'}]);
 await assert.rejects(seedSitesLocally(drifted,ready,{scope:'local-test'}),code('REGISTRY_DRIFT'));
 assert.equal(drifted.calls.batches.length,0);
 const same=memoryDb([...ready.sites]); // The real query is ORDER BY site_id.
 assert.deepEqual(await seedSitesLocally(same,ready,{scope:'local-test'}),{added:0});
 assert.equal(same.calls.batches.length,0);
 const empty=memoryDb([]);
 assert.deepEqual(await seedSitesLocally(empty,ready,{scope:'local-test'}),{added:2});
 assert.equal(empty.calls.batches.length,1);assert.equal(empty.calls.batches[0].length,2);
});
