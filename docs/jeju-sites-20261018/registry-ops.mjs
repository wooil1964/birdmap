// Operator CLI for the Jeju registry change on production D1 (sites 206-211 only).
//   node docs/jeju-sites-20261018/registry-ops.mjs plan <target.json> <plan-out.json>   read-only
//   node docs/jeju-sites-20261018/registry-ops.mjs apply <target.json> <plan.json>      write (needs approval env)
//   node docs/jeju-sites-20261018/registry-ops.mjs rollback <target.json> <plan.json>   write (needs approval env)
// target.json: {"name":"birdmap-reports","account_id":"...","database_id":"..."}.
// Writes go through d1-rest write(), which refuses unless PHASE2E_PRODUCTION_WRITE_APPROVED=<production db id>.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {loadTarget,read,write,stats} from '../../reports-api/tools/d1-rest.mjs';
import {prepareSiteSeed} from '../../reports-api/tools/sites-seed.mjs';

const NEW=['206','207','208','209','210','211'];
const COLS='site_id,site_name,lat,lon,registry_source,registry_revision,source_record_json,created_at,retired_at';
const dir='docs/jeju-sites-20261018/';
const [mode,targetPath,planPath]=process.argv.slice(2);
if(!['plan','apply','rollback'].includes(mode)||!targetPath||!planPath)throw Error('usage: plan|apply|rollback <target.json> <plan.json>');
const target=loadTarget(targetPath),db=target.database_id;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const state=async()=>(await read(target,db,'SELECT id,mode,generation FROM system_state WHERE id=1'))[0];
const snapshot=()=>read(target,db,`SELECT ${COLS} FROM sites WHERE site_id NOT IN ('206','207','208','209','210','211') ORDER BY site_id`);
const newRows=()=>read(target,db,`SELECT ${COLS} FROM sites WHERE site_id IN ('206','207','208','209','210','211') ORDER BY site_id`);
// Same conditions as append-registry.sql, evaluated read-only with the real bound parameters.
const PRECHECK=`SELECT (SELECT COUNT(*) FROM sites) AS total,
 (SELECT COUNT(*) FROM sites s JOIN json_each(?1) e ON s.site_id=json_extract(e.value,'$.site_id')
   AND s.site_name IS json_extract(e.value,'$.site_name') AND s.lat IS json_extract(e.value,'$.lat')
   AND s.lon IS json_extract(e.value,'$.lon') AND s.registry_source IS json_extract(e.value,'$.registry_source')
   AND s.registry_revision IS json_extract(e.value,'$.registry_revision')
   AND s.source_record_json IS json_extract(e.value,'$.source_record_json')
   AND s.created_at IS json_extract(e.value,'$.created_at') AND s.retired_at IS json_extract(e.value,'$.retired_at')) AS matched,
 json_array_length(?1) AS snapshotRows, json_array_length(?2) AS newRows,
 (SELECT COUNT(*) FROM sites WHERE site_id IN (SELECT json_extract(value,'$.site_id') FROM json_each(?2))) AS clash,
 (SELECT COUNT(*) FROM checklists WHERE site_id IN ('206','207','208','209','210','211')) AS checklistRefs,
 (SELECT COUNT(*) FROM reports WHERE CAST(site_id AS TEXT) IN ('206','207','208','209','210','211')) AS reportRefs`;

if(mode==='plan'){
  const s=await state(),old=await snapshot();
  const seed=await prepareSiteSeed(fs.readFileSync('index.html','utf8'),{capturedAt:new Date().toISOString(),expectedCount:206});
  const rows=seed.sites.filter(r=>NEW.includes(r.site_id)).sort((a,b)=>a.site_id.localeCompare(b.site_id));
  const check=(await read(target,db,PRECHECK,[JSON.stringify(old),JSON.stringify(rows)]))[0];
  const ok=s.mode==='NORMAL'&&check.total===200&&check.matched===200&&check.snapshotRows===200&&check.newRows===6&&check.clash===0;
  const plan={createdAt:new Date().toISOString(),generation:s.generation,snapshot:old,newRows:rows,snapshotSha256:sha(old),newRowsSha256:sha(rows)};
  fs.writeFileSync(planPath,JSON.stringify(plan));
  console.log(JSON.stringify({mode,ok,state:s,check,snapshotSha256:plan.snapshotSha256,newRowsSha256:plan.newRowsSha256,stats}));
  process.exit(ok?0:2);
}
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
const s=await state();
assert.equal(s.mode,'NORMAL');assert.equal(s.generation,plan.generation,'generation changed since plan');
assert.equal(sha(await snapshot()),plan.snapshotSha256,'existing 200 rows changed since plan');
if(mode==='apply'){
  assert.equal((await newRows()).length,0,'206-211 already present');
  await write(target,db,fs.readFileSync(dir+'append-registry.sql','utf8'),[plan.generation,JSON.stringify(plan.snapshot),JSON.stringify(plan.newRows)]);
  assert.equal(sha(await newRows()),plan.newRowsSha256,'inserted rows differ from plan');
}else{
  assert.equal(sha(await newRows()),plan.newRowsSha256,'206-211 differ from plan; refusing');
  await write(target,db,fs.readFileSync(dir+'rollback-registry.sql','utf8'),[plan.generation,JSON.stringify(plan.newRows)]);
  assert.equal((await newRows()).length,0,'rollback did not remove 206-211');
}
assert.equal(sha(await snapshot()),plan.snapshotSha256,'existing 200 rows changed');
console.log(JSON.stringify({mode,ok:true,state:await state(),total:(await read(target,db,'SELECT COUNT(*) n FROM sites'))[0].n,stats}));
