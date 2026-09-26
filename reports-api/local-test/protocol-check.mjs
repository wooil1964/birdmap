// Explicit node --test target; separate from the unchanged legacy 106-test suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { baseline } from '../../docs/long-term-db-phase2a/proof/fixture.mjs';
import { ADMIN_PAGE } from '../src/admin-page.js';
import { fingerprint,insert,TRANSFORM_VERSION } from '../src/canonical/data.js';
import { prepareBackfill,applyBackfillLocally } from '../tools/backfill-lib.mjs';
import { prepareSiteSeed,seedSitesLocally } from '../tools/sites-seed.mjs';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const out=new URL('../../docs/long-term-db-phase2b/.local/',import.meta.url);mkdirSync(out,{recursive:true});
const cli=(file,...args)=>spawnSync(process.execPath,[fileURLToPath(new URL('../tools/'+file,import.meta.url)),...args],{encoding:'utf8'});
test('prepared synthetic SQLite fixture verifies through read-only CLI without file mutation',async()=>{
  const filename=new URL('verify-fixture-'+Date.now()+'.sqlite',out),snapshot=new URL('verify-input.json',out);
  const sqlite=new DatabaseSync(fileURLToPath(filename));sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of ['../schema.sql','../../docs/long-term-db-phase2a/migrations/0001_core.sql'])sqlite.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
  const db={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return sqlite.prepare(sql).run(...args);}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const captured_at='2026-09-26T00:00:00.000Z',sites=await prepareSiteSeed(html,{capturedAt:captured_at});await seedSitesLocally(db,sites,{scope:'local-test'});
  await db.batch(baseline.map(r=>insert(db,'reports',r)));
  const source={reports:baseline,source_count:21,manifest_sha256:await fingerprint({reports:baseline}),transform_version:TRANSFORM_VERSION,registry_revision:sites.registry_revision,captured_at,run_id:'verify-only-synthetic'};
  await applyBackfillLocally(db,await prepareBackfill(source),{scope:'local-test',writeFrozen:true});sqlite.close();writeFileSync(snapshot,JSON.stringify(source));
  const bytes=readFileSync(filename);const result=cli('prepare-backfill.mjs','--verify-only',fileURLToPath(snapshot),fileURLToPath(filename));assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).verification.state,'verified');assert.deepEqual(readFileSync(filename),bytes);
  assert.notEqual(cli('prepare-backfill.mjs','--apply',fileURLToPath(snapshot)).status,0);
});
test('sites preparation CLI preserves 190 permanent IDs and duplicate names independently',()=>{
  const result=cli('prepare-sites.mjs',fileURLToPath(new URL('../../index.html',import.meta.url)),'2026-09-26T00:00:00Z');assert.equal(result.status,0,result.stderr);const plan=JSON.parse(result.stdout);assert.equal(plan.sites.length,190);assert.equal(new Set(plan.sites.map(s=>s.site_id)).size,190);
});
function client(enabled) {
  const nodes={};for(const [id,value] of Object.entries({reportSpecies:'합성종',reportObservedOn:'2026-09-20',reportCount:'0',reportReporter:'',reportNote:''}))nodes[id]={value};
  Object.assign(nodes,{reportNamePublic:{checked:false},reportNonBreedingConfirmed:{checked:false},reportSubmitBtn:{disabled:false},reportForm:{reset(){}}});
  const sent=[],messages=[];let failure=true;
  const context=vm.createContext({document:{getElementById:id=>nodes[id]},REPORTS_CANONICAL_UI_ENABLED:enabled,reportSubmissionAttempt:null,reportPicked:{lat:1,lon:2},reportTurnstileToken:'first',REPORTS_API_URL:'https://test.invalid',crypto,Number,JSON,Promise,Error,
    reportsConfigured:()=>true,setReportMessage:m=>messages.push(m),resetReportCaptcha(){},showPendingSpot(){},setTimeout(){},fetch:async(url,options)=>{sent.push(JSON.parse(options.body));if(failure)throw Error('network');return {ok:true,json:async()=>({ok:true,id:'test',status:'pending'})};}});
  vm.runInContext(html.slice(html.indexOf('function submitReport(event){'),html.indexOf("document.getElementById('searchBox').addEventListener",html.indexOf('function submitReport(event){'))),context);
  return {context,nodes,sent,messages,success(){failure=false;},async submit(){context.submitReport();await new Promise(setImmediate);}};
}
test('public client default flag is OFF; legacy payload contract remains unchanged',async()=>{
  assert(html.includes('var REPORTS_CANONICAL_UI_ENABLED=false;'));const c=client(false);await c.submit();assert.equal(c.sent.length,1);assert(!Object.hasOwn(c.sent[0],'request_id'));assert(!Object.hasOwn(c.sent[0],'non_breeding_confirmed'));
});
test('opt-in quick client requires confirmation, distinguishes zero, and retains request ID across network retries',async()=>{
  const c=client(true);await c.submit();assert.equal(c.sent.length,0);c.nodes.reportNonBreedingConfirmed.checked=true;await c.submit();const id=c.sent[0].request_id;assert(id);assert.equal(c.sent[0].birdCount,0);assert.equal(c.sent[0].non_breeding_confirmed,true);
  c.context.reportTurnstileToken='replacement';await c.submit();assert.equal(c.sent[1].request_id,id);c.nodes.reportNote.value='changed';await c.submit();assert.notEqual(c.sent[2].request_id,id);c.success();await c.submit();assert.equal(c.context.reportSubmissionAttempt,null);
});
test('admin client sends loaded revision and stable request ID; missing canonical revision prevents submission',async()=>{
  let handler,fail=true;const sent=[],button={dataset:{act:'reject'}},card={dataset:{id:'synthetic'},querySelector:()=>({value:'note'})};
  const context=vm.createContext({document:{getElementById:()=>({addEventListener:(event,fn)=>{handler=fn;}})},reports:[{id:'synthetic',revision:3}],crypto,Number,JSON,Error,toast(){},doneMessage(){return 'done';},load:async()=>{},fetch:async(url,options)=>{sent.push(JSON.parse(options.body));if(fail)throw Error('network');return {json:async()=>({ok:true})};}});
  vm.runInContext(ADMIN_PAGE.slice(ADMIN_PAGE.indexOf('var adminMutationAttempts={}'),ADMIN_PAGE.indexOf('// 탐조 지역 검색.')),context);
  const event={target:{closest:q=>q==='.card'?card:button}};await handler(event);await handler(event);assert.equal(sent[0].expected_revision,3);assert.equal(sent[0].request_id,sent[1].request_id);
  context.reports[0].revision=null;await handler(event);assert.equal(sent.length,2);context.reports[0].revision=3;fail=false;await handler(event);assert.equal(Object.keys(context.adminMutationAttempts).length,0);
});
