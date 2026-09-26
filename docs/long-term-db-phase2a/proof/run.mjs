// Run: node docs/long-term-db-phase2a/proof/run.mjs --toolchain <cached node_modules directory>
// Never accepts a remote/config/database override. All DBs and payloads are local/synthetic.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { baseline, corners, row, uuid, siteIds, NOW } from './fixture.mjs';
import { all, insert, backfill, transformed, migrationStatements, stable, hash, adapter, legacyProjection, submitQuick, reviewBatch } from './model.mjs';
import { handleRequest as publicHandler } from '../../../reports-api/src/public.js';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = resolve(root, 'docs/long-term-db-phase2a');
const toolchain = process.argv[2] === '--toolchain' && process.argv.length === 4 ? resolve(process.argv[3]) : null;
if (!toolchain) throw Error('Pass only --toolchain <installed node_modules directory>');
const { Miniflare, convertV4MiniflareOptions } = require(join(toolchain,'miniflare'));
const wrangler = join(toolchain, 'wrangler/bin/wrangler.js');
const runDir = join(dir, '.local', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(runDir, { recursive: true });
const evidence = { started_at: new Date().toISOString(), scope: 'isolated local D1; synthetic only; no production calls', versions: { node: process.version, wrangler: require(join(toolchain,'wrangler/package.json')).version, miniflare: require(join(toolchain,'miniflare/package.json')).version }, tests: [], wrangler: {} };
evidence.source_sha256 = Object.fromEntries(['migrations/0001_core.sql','proof/fixture.mjs','proof/model.mjs','proof/run.mjs','wrangler.local.toml'].map(p=>[p,hash(readFileSync(join(dir,p),'utf8'))]));
function cli(args) {
  assert(!args.includes('--remote'));
  const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(runDir,'wrangler.log') };
  for (const key of Object.keys(env)) if (/^(CLOUDFLARE_|CF_API_|CF_ACCOUNT)/.test(key)) delete env[key];
  const result = spawnSync(process.execPath, [wrangler, ...args, '--config', join(dir,'wrangler.local.toml'), '--persist-to', join(runDir,'wrangler-state')], { cwd: dir, env, encoding: 'utf8', timeout: 55000 });
  if (result.status !== 0) throw Error('local Wrangler failed: ' + (result.stderr || result.stdout));
  return result.stdout;
}
function splitDDL(sql) {
  const clean = sql.replace(/--[^\n]*/g,'');
  return clean.match(/\s*CREATE TRIGGER[\s\S]*?END\s*;|[^;]+;/gi).map(s=>s.trim()).filter(Boolean);
}
let mf;
let db;
async function test(number, name, fn) {
  await fn();
  evidence.tests.push({ number, name, result: 'PASS' });
  console.log(`PASS ${number}: ${name}`);
}
const count = async (table, where='1') => (await all(db, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`))[0].n;
const snapshot = async () => {
  const state = {};
  for (const t of ['reports','raw_submissions','checklists','sightings','reviews','audit_log','backfill_runs','transaction_assertions']) state[t] = await all(db,`SELECT * FROM ${t} ORDER BY 1`);
  return hash(state);
};
const failUnchanged = async fn => {
  const before = await snapshot();
  await assert.rejects(fn);
  assert.equal(await snapshot(),before);
};
try {
  // Wrangler creates its own official ledger in a different, isolated local database.
  const apply1 = cli(['d1','migrations','apply','birdmap-phase2a-local','--local']);
  const apply2 = cli(['d1','migrations','apply','birdmap-phase2a-local','--local']);
  const ledger = JSON.parse(cli(['d1','execute','birdmap-phase2a-local','--local','--command','SELECT id,name,applied_at FROM d1_migrations ORDER BY id','--json']));
  assert.equal(ledger[0].results.length,1);
  assert.equal(ledger[0].results[0].name,'0001_core.sql');
  evidence.wrangler = { first_apply: 'PASS', second_apply: 'no additional migration', ledger: ledger[0].results, first_reported_success: /success|applied|✅/i.test(apply1), second_reported_no_pending: /No migrations|no migrations|already/i.test(apply2) };
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'phase2a-proof', modules:true,
    script: 'export default {fetch(){return new Response("phase2a local proof")}}',
    compatibilityDate:'2026-09-24', d1Databases:{TEST_DB:'phase2a-synthetic-only'},
    d1Persist:false, host:'127.0.0.1', port:0, cf:false }));
  db = await mf.getD1Database('TEST_DB');
  await test(1,'schema executes in local D1 and Wrangler ledger is idempotent',async()=>{
    await db.batch(splitDDL(readFileSync(join(root,'reports-api/schema.sql'),'utf8')).map(s=>db.prepare(s)));
    await db.batch(splitDDL(readFileSync(join(dir,'migrations/0001_core.sql'),'utf8')).map(s=>db.prepare(s)));
    const tables = (await all(db,"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")).map(t=>t.name);
    assert.equal(tables.length,10); // reports + 7 core + 2 support, excluding Wrangler's separate ledger.
    const columns = {};
    for (const t of tables) columns[t] = (await all(db,`PRAGMA table_info(${t})`)).length;
    evidence.schema = { tables, columns, new_tables:9, new_columns:Object.entries(columns).filter(([t])=>t!=='reports').reduce((n,[,v])=>n+v,0) };
    assert(!tables.some(t=>['migration_control','mutation_permits','schema_migrations','media','environment_snapshots'].includes(t)));
    assert.equal(siteIds.length,190);
    assert.equal(new Set(siteIds).size,190);
    await db.batch(siteIds.map(id=>insert(db,'sites',{site_id:id,site_name:`합성탐조지${id}`,lat:null,lon:null,registry_source:'synthetic',registry_revision:'fixture-v1',source_record_json:stable({id}),created_at:NOW,retired_at:null})));
  });
  await test(2,'foreign_key_check and enforcement',async()=>{
    assert.deepEqual(await all(db,'PRAGMA foreign_key_check'),[]);
    const t = transformed(row(500));
    await assert.rejects(()=>insert(db,'sightings',t.sighting).run());
  });
  await test(3,'21-row synthetic backfill, permanent IDs and complete source snapshots',async()=>{
    await db.batch(baseline.map(r=>insert(db,'reports',r)));
    evidence.backfill = await backfill(db,baseline);
    for(const t of ['reports','raw_submissions','checklists','sightings']) assert.equal(await count(t),21);
    assert.deepEqual(await all(db,legacyProjection+' ORDER BY id'),baseline.toSorted((a,b)=>a.id.localeCompare(b.id)));
    for(const raw of await all(db,'SELECT * FROM raw_submissions')) {
      const source = baseline.find(r=>r.id===raw.source_id);
      assert.equal(raw.payload_json,stable(source)); assert.equal(raw.source_fingerprint,hash(source));
      assert.equal(raw.non_breeding_confirmed,null); assert.equal(raw.submitted_at,null);
    }
    assert.equal(await count('checklists','complete_list IS NOT NULL OR duration_minutes IS NOT NULL OR protocol IS NOT NULL'),0);
  });
  await test(4,'approved 17 and rejected 4',async()=>{assert.equal(await count('checklists',"status='approved'"),17);assert.equal(await count('checklists',"status='rejected'"),4);});
  await test(5,'site NULL 5',async()=>assert.equal(await count('checklists','site_id IS NULL'),5));
  await test(6,'count 1 remains 13, accuracy unknown',async()=>assert.equal(await count('sightings',"count_value=1 AND count_accuracy='unknown'"),13));
  await test(7,'count NULL remains 8, accuracy unknown; zero distinguished',async()=>{
    assert.equal(await count('sightings',"count_value IS NULL AND count_accuracy='unknown'"),8);
    await failUnchanged(()=>db.prepare("UPDATE sightings SET count_value=NULL,count_accuracy='exact' WHERE sighting_id=?").bind(`sighting:${uuid(1)}:1`).run());
  });
  await test(8,'public NULL coordinate pairs preserved for all 21',async()=>assert.equal(await count('checklists','public_lat IS NULL AND public_lon IS NULL'),21));
  await test(9,'approved pending_public residue 15 retained',async()=>assert.equal(await count('checklists',"status='approved' AND pending_public=1"),15));
  await test(10,'species source strings preserved exactly',async()=>{
    const got = await all(db,'SELECT checklist_id,species_original FROM sightings ORDER BY checklist_id');
    assert.deepEqual(got.map(r=>r.species_original),baseline.map(r=>r.species));
    await failUnchanged(()=>db.prepare('UPDATE sightings SET species_original=? WHERE checklist_id=?').bind('다른원문',uuid(1)).run());
  });
  await test(11,'same backfill adds zero; changed manifest or partial state rejected',async()=>{
    assert.equal((await backfill(db,baseline)).added,0);
    await failUnchanged(()=>backfill(db,baseline.map((r,i)=>i? r:{...r,note:'different'})));
    // A partial run with no ledger cannot silently skip duplicate IDs.
    await failUnchanged(()=>backfill(db,[baseline[0]],'partial-run'));
    evidence.synthetic_counts={reports:21,raw:21,checklists:21,sightings:21,approved:17,rejected:4,site_null:5,count_one:13,count_null:8,public_null_pairs:21,approved_pending_public_one:15,rerun_added:0};
  });
  await test(12,'dual-write mid-batch and stale CAS roll back all tables',async()=>{
    const req={id:uuid(1),requestId:'rollback-middle',expectedRevision:1,status:'rejected',events:[]};
    await failUnchanged(()=>reviewBatch(db,{...req,failMiddle:true}));
    await reviewBatch(db,{...req,requestId:'cas-success'});
    assert.equal((await all(db,'SELECT revision FROM checklists WHERE checklist_id=?',uuid(1)))[0].revision,2);
    await failUnchanged(()=>reviewBatch(db,{...req,requestId:'stale-cas'}));
    assert.equal(await count('transaction_assertions'),0);
    // Failure AFTER raw/checklist/sighting writes must roll back the legacy INSERT too.
    const r=row(501);
    await failUnchanged(()=>db.batch([insert(db,'reports',r),...migrationStatements(db,r),insert(db,'transaction_assertions',{assertion_id:'last-failure',ok:0})]));
  });
  await test(13,'multiple sighting reviews per request and exact retry identity',async()=>{
    const second={...transformed(baseline[1]).sighting,sighting_id:`sighting:${uuid(2)}:2`,source_ordinal:2,species_original:'합성둘째종',count_value:null,count_source:'not_recorded'};
    await insert(db,'sightings',second).run();
    const req={id:uuid(2),requestId:'two-reviews',expectedRevision:1,status:'approved',events:[{sightingId:`sighting:${uuid(2)}:1`,count:1,accuracy:'unknown'},{sightingId:second.sighting_id,count:0,accuracy:'exact'}]};
    await reviewBatch(db,req);
    assert.equal(await count('reviews',"request_id='two-reviews'"),2);
    assert.equal((await reviewBatch(db,req)).replay,true);
    await failUnchanged(()=>reviewBatch(db,{...req,events:[{...req.events[0],count:99},req.events[1]]}));
    const prior=(await all(db,"SELECT * FROM reviews WHERE request_id='two-reviews' ORDER BY event_index"))[0];
    await failUnchanged(()=>insert(db,'reviews',{...prior,review_id:'wrong-parent',request_id:'wrong-parent',sequence:99,sighting_id:`sighting:${uuid(3)}:1`}).run());
    await failUnchanged(()=>insert(db,'reviews',{...prior,review_id:'event-collision',sequence:99,validated_count:99}).run());
    await failUnchanged(()=>db.batch([db.prepare("UPDATE reports SET status='pending' WHERE id=?").bind(uuid(2)),insert(db,'reviews',{...prior,review_id:'sequence-collision',request_id:'sequence-collision'})]));
    assert.equal(await count('sightings',"count_value=0 AND count_accuracy='exact'"),1);
  });
  await test(14,'site-only coordinates allowed; partial, absent site and invalid FK rejected',async()=>{
    const r=row(600,{lat:null,lon:null,site_id:siteIds[0]});
    const t=transformed(r,true); t.checklist.record_mode='complete_checklist';
    const mismatch=transformed(row(601));mismatch.checklist.source_type='native';mismatch.checklist.record_mode='complete_checklist';
    await failUnchanged(()=>db.batch([insert(db,'raw_submissions',mismatch.raw),insert(db,'checklists',mismatch.checklist)]));
    await db.batch([insert(db,'raw_submissions',t.raw),insert(db,'checklists',t.checklist),insert(db,'sightings',t.sighting)]);
    for(const patch of [{actual_lat:1},{site_id:null},{site_id:'not-a-site'}]) {
      const key=Object.keys(patch)[0];await failUnchanged(()=>db.prepare(`UPDATE checklists SET ${key}=? WHERE checklist_id=?`).bind(patch[key],r.id).run());
    }
    assert.equal((await all(db,legacyProjection+' AND checklist_id=?',r.id)).length,0);
  });
  await test(15,'quick submissions require finite actual coordinate pair before storage',async()=>{
    for(const patch of [{lat:null},{lon:null},{lat:''},{lat:undefined},{lat:NaN},{lon:181}]) await failUnchanged(()=>submitQuick(db,row(700,{...patch,status:'pending'}),true));
  });
  await test(16,'explicit true non-breeding confirmation required before storage',async()=>{
    for(const flag of [undefined,null,false,0,1,'true']) await failUnchanged(()=>submitQuick(db,row(701,{status:'pending'}),flag));
    await submitQuick(db,row(701,{status:'pending'}),true);
    assert.equal(await count('raw_submissions',"source_id='"+uuid(701)+"' AND source_type='native_submission' AND non_breeding_confirmed=1"),1);
    const r=transformed(row(702),true);r.raw.non_breeding_confirmed=null;
    await failUnchanged(()=>insert(db,'raw_submissions',r.raw).run());
  });
  await test(17,'current public API and canonical compatibility DTO regression',async()=>{
    await db.batch(corners.map(r=>insert(db,'reports',r)));
    await backfill(db,corners,'corner-cases');
    const multi=(await all(db,'SELECT count_value,count_source FROM sightings WHERE checklist_id=?',uuid(101)))[0];
    assert.deepEqual(multi,{count_value:null,count_source:'ambiguous_group'});
    assert.equal((await all(db,'SELECT shared_bird_count FROM checklists WHERE checklist_id=?',uuid(101)))[0].shared_bird_count,7);
    const paths=['/reports/approved','/reports/pending',`/reports/site/${siteIds[0]}`,`/reports/site/${siteIds[0]}?limit=2&offset=1`,`/reports/site/${siteIds[0]}?offset=999`,'/reports/site/unknown','/reports/site/%21',...([1,18,104,105,106,999].map(n=>`/reports/${uuid(n)}/status`))];
    const results=[];
    for(const path of paths) {
      const req=()=>new Request('https://reports.example'+path,{headers:{Origin:'https://wooil1964.github.io'}});
      const env=binding=>({ENVIRONMENT:'production',REPORTS_DB:binding});
      const a=await publicHandler(req(),env(db));const b=await publicHandler(req(),env(adapter(db)));
      assert.equal(a.status,b.status);assert.deepEqual([...a.headers],[...b.headers]);
      const bodyA=await a.json();const bodyB=await b.json();delete bodyA.generatedAt;delete bodyB.generatedAt;
      assert.deepEqual(bodyA,bodyB);results.push({path,status:a.status});
    }
    evidence.api_comparison=results;
    const old=spawnSync(process.execPath,['--test','--test-reporter=tap'],{cwd:join(root,'reports-api'),encoding:'utf8',timeout:55000});
    writeFileSync(join(runDir,'existing-suite.tap'),old.stdout+old.stderr);
    assert.equal(old.status,0,'existing reports-api suite failed; see ignored local TAP');
    evidence.existing_suite=old.stdout.split(/\r?\n/).filter(l=>/^# (tests|pass|fail|skipped|cancelled|suites)/.test(l));
    assert.deepEqual(await all(db,'PRAGMA foreign_key_check'),[]);
  });
  evidence.final_foreign_key_check=0;
  evidence.final_assertion_rows=await count('transaction_assertions');
  evidence.status='PASS';
} catch(error) {
  evidence.status='FAIL';evidence.error=String(error?.message || error);process.exitCode=1;
  console.error(evidence.error);
} finally {
  if(mf) await mf.dispose();
  evidence.finished_at=new Date().toISOString();
  mkdirSync(join(dir,'evidence'),{recursive:true});
  writeFileSync(join(dir,'evidence/local-results.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(`Evidence: ${join(dir,'evidence/local-results.json')}`);
}
