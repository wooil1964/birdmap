import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleRequest,handleLegacyRequest} from '../src/public.js';
import {handlePublicationRead} from '../src/publication.js';
import {fakeDb,publicEnv,ORIGIN,withTurnstile} from './helpers.mjs';
const id='33333333-3333-4333-8333-333333333333';
const paths=['/field-updates','/field-updates/read',...['status','confirm','delete','report-draft'].map(x=>'/field-updates/'+id+'/'+x)];
for(const method of ['GET','POST'])for(const path of paths)test('retired '+method+' '+path+' returns no data and touches no DB',async()=>{
 let touches=0;const db=new Proxy({}, {get(){touches++;throw Error('Retired feature must not touch D1');}});
 const env=publicEnv(db);delete env.FIELD_NEWS_RETIRED;
 const req=()=>new Request('https://reports.example'+path+'?contract=publication-v1&nonce='+'f'.repeat(32),{method,headers:ORIGIN,...(method==='POST'?{body:'{invalid-json'}:{})});
 for(const handler of [handleRequest,handleLegacyRequest]){
  const response=await handler(req(),env),body=await response.json();
  assert.equal(response.status,410);assert.equal(body.error.code,'FIELD_NEWS_RETIRED');
  assert.equal(body.updates,undefined);assert.equal(body.draft,undefined);assert.equal(body.publication,undefined);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
 await assert.rejects(()=>handlePublicationRead(req(),env,new URL(req().url)),e=>e.status===410||e.statusCode===410);
 assert.equal(touches,0);
});
test('retirement preserves stored field records and does not affect report routes',async()=>{
 const db=fakeDb(),env=publicEnv(db);
 const create=await withTurnstile(true,()=>handleRequest(new Request('https://reports.example/field-updates',{method:'POST',headers:{...ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'198.18.1.1'},body:JSON.stringify({species:'참새',status:'visible',lat:37.5,lon:127,deviceId:'synthetic-owner-aaaaaaaa',turnstileToken:'synthetic',visibilityRadius:'5'})}),env));
 assert.equal(create.status,201);const before=await db.prepare('SELECT * FROM field_updates').all();assert.equal(before.results.length,1);
 env.FIELD_NEWS_RETIRED='true';
 for(const path of paths)assert.equal((await handleRequest(new Request('https://reports.example'+path,{headers:ORIGIN}),env)).status,410);
 assert.deepEqual(await db.prepare('SELECT * FROM field_updates').all(),before);
 const capabilities=await handleRequest(new Request('https://reports.example/reports/capabilities',{headers:ORIGIN}),env);assert.equal(capabilities.status,200);
});
test('production manifest explicitly retires the field service',()=>{
 assert.match(readFileSync(new URL('../wrangler.public.toml',import.meta.url),'utf8'),/FIELD_NEWS_RETIRED\s*=\s*"true"/);
});
