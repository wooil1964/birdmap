// Synthetic local SQLite only. Emits aggregate timings/sizes, never row values.
// Run: node --expose-gc docs/nonbreeding-location-20261106/benchmark-site-history.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { siteHistoryStatement, boundedSiteHistoryPayload, SITE_HISTORY_SCAN_MAX } from '../../reports-api/src/site-history.js';
import { siteHistoryPayload } from '../../reports-api/src/shared.js';

const ddl=['../../reports-api/schema.sql','../long-term-db-phase2a/migrations/0001_core.sql'].map(p=>readFileSync(new URL(p,import.meta.url),'utf8')).join('\n');
const env={REPORTS_WRITE_MODE:'CANONICAL_DUAL_WRITE'};
function dataset(size,native) {
  const db=new DatabaseSync(':memory:');db.exec(ddl);
  const report=db.prepare(`INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,note,site_id,ip_hash,dedupe_hash)
    VALUES(?1,'approved','매',37.5,127.5,'2020-01-01','2020-01-01T00:00:00Z',?2,'19','synthetic',?1)`);
  const raw=db.prepare(`INSERT INTO raw_submissions(raw_id,source_type,source_id,request_id,payload_json,submitted_at,schema_version,captured_at,source_fingerprint,non_breeding_confirmed,policy_version)
    VALUES(?1,'native_submission',?1,?1,?2,'2020-01-01T00:00:00Z','quick-v1','2020-01-01T00:00:00Z',?3,1,'non-breeding-v1')`);
  const checklist=db.prepare(`INSERT INTO checklists(checklist_id,raw_id,source_type,source_id,record_mode,status,observation_date,actual_lat,actual_lon,species_text,received_at,created_at,updated_at)
    VALUES(?1,?1,'native',?1,'quick_report','approved','2020-01-01',37.5,127.5,'매','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z')`);
  const note=native?'합성 관찰 '+ '가'.repeat(480):null;
  const payload=JSON.stringify({input:{species:'매',lat:37.5,lon:127.5,observedOn:'2020-01-01',note,non_breeding_confirmed:true}});
  db.exec('BEGIN; INSERT INTO publication_writer_claim(id,ok) VALUES(1,1)');
  for(let i=0;i<size;i++) {
    const id='bench-'+String(i).padStart(6,'0');report.run(id,note);
    if(native){raw.run(id,payload,'a'.repeat(64));checklist.run(id);}
  }
  db.exec('DELETE FROM publication_writer_claim WHERE id=1; COMMIT');
  return db;
}
function sqlFor(guarded) {
  let sql;
  siteHistoryStatement({prepare(text){sql=text;return {bind(){return this;}};}},env,'19');
  return guarded?sql:sql.replace(/ LIMIT \d+$/,'');
}
function sample(db,guarded) {
  globalThis.gc?.();const before=process.memoryUsage().heapUsed;
  const start=performance.now(),rows=db.prepare(sqlFor(guarded)).all('19'),queried=performance.now();
  const resultBytes=Buffer.byteLength(JSON.stringify(rows));
  const loadedHeap=process.memoryUsage().heapUsed-before;
  const filterStart=performance.now();let outcome='ok',total;
  try{total=(guarded?boundedSiteHistoryPayload:siteHistoryPayload)(rows,5,0).total;}catch(e){outcome=e.code;}
  return {queryMs:queried-start,policyMs:performance.now()-filterStart,rowsReturned:rows.length,resultBytes,loadedHeapBytes:loadedHeap,outcome,...(total===undefined?{}:{visibleTotal:total})};
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const measurements=[];
for(const native of [false,true])for(const size of [1000,10000,100000]) {
  const db=dataset(size,native);
  for(const guarded of [false,true]) {
    const runs=Array.from({length:3},()=>sample(db,guarded)),base=runs[0];
    measurements.push({profile:native?'native-long-note':'legacy-unknown',candidates:size,query:guarded?'bounded':'baseline',
      ...Object.fromEntries(['queryMs','policyMs','rowsReturned','resultBytes','loadedHeapBytes'].map(k=>[k,Number(median(runs.map(r=>r[k])).toFixed(3))])),
      outcome:base.outcome,...(base.visibleTotal===undefined?{}:{visibleTotal:base.visibleTotal})});
  }
  db.close();
}
const planDb=dataset(1,true);
const queryPlan=planDb.prepare('EXPLAIN QUERY PLAN '+sqlFor(true)).all('19').map(r=>r.detail);planDb.close();
console.log(JSON.stringify({runtime:process.version,sqlite:'node:sqlite',repetitions:3,statistic:'median',candidateBudget:SITE_HISTORY_SCAN_MAX,
  caveat:'Local SQLite + JS only; excludes D1/Worker serialization, network, CPU limits and actual meta.rows_read. Heap delta includes local JSON size measurement; not peak isolate memory.',
  queryPlan,measurements},null,2));
