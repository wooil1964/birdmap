import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import vm from 'node:vm';
import {prepareSiteSeed} from '../../reports-api/tools/sites-seed.mjs';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'../..');
const html=readFileSync(join(ROOT,'index.html'),'utf8');
const reviewed=JSON.parse(readFileSync(join(ROOT,'data/jeju-birding-sites-20261018.json'),'utf8'));

test('runtime inline JavaScript parses after literal additions',()=>{
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(match[2].trim()){
  if(/application\/ld\+json/.test(match[1]))assert.doesNotThrow(()=>JSON.parse(match[2]));
  else assert.doesNotThrow(()=>new vm.Script(match[2]));
 }
});

test('229-site plan uses existing picker and requires explicit count, with reviewed payloads',async()=>{
 const options={capturedAt:'2026-10-18T00:00:00+09:00'};
 await assert.rejects(prepareSiteSeed(html,options),/탐조지 수/); // Default 190 guard stays enabled.
 const plan=await prepareSiteSeed(html,{...options,expectedCount:229});
 assert.equal(plan.source_count,229);
 assert.equal(new Set(plan.sites.map(s=>s.site_id )).size,229);
 for(const r of reviewed.records){
  const row=plan.sites.find(s=>s.site_id===r.site.id);
  assert.equal(row.site_name,r.site.name);
  assert.equal(row.lat,r.site.lat);assert.equal(row.lon,r.site.lon);
  assert.deepEqual(JSON.parse(row.source_record_json),r.site);
 }
});
