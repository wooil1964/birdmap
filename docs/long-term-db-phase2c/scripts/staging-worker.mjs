// STAGING-ONLY test entry. Never used by either production Wrangler config.
// A separate random test secret protects every internet route, including ordinary public APIs.
// Internal administrator persistence tests do NOT claim to test Cloudflare Access authentication.
import {handleRequest as publicHandler,handleLegacyRequest} from '../../../reports-api/src/public.js';
import {handleRequest as adminHandler} from '../../../reports-api/src/admin.js';
import {loadReport,planAction} from '../../../reports-api/src/admin-actions.js';
import {assertWriteGate,capability,schemaReady} from '../../../reports-api/src/canonical/control.js';
import {applicationDb,rows,first,insert,stable,fingerprint,canonicalProjection,canonicalReadDb,assertion,clearAssertion} from '../../../reports-api/src/canonical/data.js';
import {adminIdentity,replayAdmin,persistAdmin} from '../../../reports-api/src/canonical/persistence.js';
import {purgeForbidden} from '../../../reports-api/src/canonical/purge.js';
import {compareShadow,shadowRead} from '../../../reports-api/src/canonical/shadow.js';
import {prepareBackfill,backfillRows} from '../../../reports-api/tools/backfill-lib.mjs';
const DB_ID='f2c65357-47fc-4f09-82c6-ad0d28f8314f';
const ACTOR='phase2c-synthetic-admin@example.test';
const TABLES=['sites','taxa','reports','raw_submissions','checklists','sightings','reviews','audit_log','backfill_runs','transaction_assertions'];
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const failBinding=(db,index)=>({prepare:s=>db.prepare(s),batch(ss){const copy=[...ss];copy.splice(index,0,db.prepare("INSERT INTO transaction_assertions(assertion_id,ok) VALUES ('phase2c-failure',0)"));return db.batch(copy);}});
async function counts(db){const out={};for(const t of TABLES)out[t]=(await first(db,`SELECT COUNT(*) n FROM ${t}`)).n;return out;}
async function digest(db){const values=[];for(const t of TABLES)values.push(await rows(db,`SELECT * FROM ${t} ORDER BY 1`));return fingerprint(values);}
async function internalAdmin(env,input) {
  const binding=input.failIndex===undefined?env.REPORTS_DB:failBinding(env.REPORTS_DB,input.failIndex);
  if(await assertWriteGate({...env,REPORTS_DB:binding},'admin')!==true)throw Error('INTERNAL_TEST_REQUIRES_DUAL_MODE');
  const db=applicationDb(binding),body=input.body,id=input.id,identity=await adminIdentity(body,id,ACTOR);
  const saved=await replayAdmin(db,identity,id,ACTOR);if(saved)return saved;
  const before=await loadReport(db,id),now=new Date().toISOString(),plan=await planAction(db,body,before,{email:ACTOR},now);
  return persistAdmin(binding,{id,body,actor:ACTOR,identity,plan,before,now});
}
async function test(request,env) {
  const input=await request.json(),db=env.REPORTS_DB;
  switch(input.op) {
    case 'state':return {counts:await counts(db),digest:await digest(db),schemaDigest:await fingerprint(await rows(db,'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')),ledgerDigest:await fingerprint(await rows(db,'SELECT * FROM d1_migrations ORDER BY id')),assertions:await rows(db,'SELECT * FROM transaction_assertions'),fk:await rows(db,'PRAGMA foreign_key_check')};
    case 'capability':return {own:await capability(env,env.PHASE2C_ROLE),schemaReady:await schemaReady(db),peer:env.REPORTS_PEER?await env.REPORTS_PEER.fetch(new Request('https://reports-gate.internal/_internal/reports-capability',{headers:{'X-Reports-Gate':env.REPORTS_GATE_TOKEN}})).then(r=>r.json()):null};
    case 'seed': {
      if(env.REPORTS_WRITE_MODE!=='READ_ONLY_MAINTENANCE')throw Error('FREEZE_REQUIRED');
      const sites=input.sites;if(!Array.isArray(sites)||sites.length!==190||new Set(sites.map(s=>s.site_id)).size!==190)throw Error('REGISTRY_INVALID');
      const current=await rows(db,'SELECT * FROM sites ORDER BY site_id'),expected=[...sites].sort((a,b)=>a.site_id.localeCompare(b.site_id));
      if(current.length){if(stable(current)!==stable(expected))throw Error('REGISTRY_DRIFT');return {added:0};}
      const results=await db.batch(sites.map(s=>insert(db,'sites',s)));
      if(stable(await rows(db,'SELECT * FROM sites ORDER BY site_id'))!==stable(expected))throw Error('SEED_VERIFY_FAILED');
      return {added:sites.length,statements:results.length,queries:results.map(r=>r.meta?.duration)};
    }
    case 'legacy-fixture': {
      if(env.REPORTS_WRITE_MODE!=='READ_ONLY_MAINTENANCE')throw Error('FREEZE_REQUIRED');
      const source=input.reports;
      if(!Array.isArray(source)||source.length!==21||source.some(r=>!r.id.startsWith('00000000-0000-4000-8000-')||!r.ip_hash.startsWith('synthetic-')))throw Error('SYNTHETIC_ONLY');
      if((await first(db,'SELECT COUNT(*) n FROM reports')).n)throw Error('REPORTS_NOT_EMPTY');
      await db.batch(source.map(r=>insert(db,'reports',r)));return {added:21};
    }
    case 'backfill': {
      if(env.REPORTS_WRITE_MODE!=='READ_ONLY_MAINTENANCE'||input.approval!=='PHASE2C_SYNTHETIC_BACKFILL_APPROVED')throw Error('EXPLICIT_APPROVAL_REQUIRED');
      const plan=await prepareBackfill(input.plan);
      if(plan.source_count!==21||plan.reports.some(r=>!r.id.startsWith('00000000-0000-4000-8000-')||!r.ip_hash.startsWith('synthetic-')))throw Error('SYNTHETIC_ONLY');
      const live=await rows(db,'SELECT * FROM reports ORDER BY id');if(stable(live)!==stable(plan.reports))throw Error('SOURCE_DRIFT');
      const sites=await rows(db,'SELECT * FROM sites ORDER BY site_id');
      if(sites.length!==190||sites.some(s=>s.registry_revision!==plan.registry_revision||s.retired_at!==null))throw Error('REGISTRY_DRIFT');
      const source=sites.map(s=>{const r=JSON.parse(s.source_record_json);if(r.id!==s.site_id||r.name!==s.site_name||(r.lat??null)!==s.lat||(r.lon??null)!==s.lon)throw Error('REGISTRY_DRIFT');return r;});
      if(await fingerprint(source.sort((a,b)=>a.id.localeCompare(b.id)))!==plan.registry_revision)throw Error('REGISTRY_DRIFT');
      const values=await backfillRows(plan),runs=await rows(db,'SELECT * FROM backfill_runs');
      if(runs.length) {
        if(runs.length!==1||runs[0].run_id!==plan.run_id||runs[0].manifest_checksum!==plan.manifest_sha256||runs[0].transform_version!==plan.transform_version||runs[0].source_count!==21||runs[0].source_revision!==plan.registry_revision)throw Error('MANIFEST_OR_PARTIAL_STATE');
        for(const [table,field,key] of [['raw_submissions','raw','raw_id'],['checklists','checklist','checklist_id'],['sightings','sighting','sighting_id']]) {
          const found=await rows(db,`SELECT * FROM ${table} ORDER BY ${key}`),expected=values.map(v=>v[field]).sort((a,b)=>a[key].localeCompare(b[key]));
          if(stable(found)!==stable(expected))throw Error('BACKFILL_DRIFT');
        }
        if((await rows(db,'PRAGMA foreign_key_check')).length)throw Error('FOREIGN_KEY_ERROR');
        return {state:'verified',added:0};
      }
      if((await rows(db,"SELECT target_id FROM audit_log WHERE action='forbidden_content_purged'")).some(a=>plan.reports.some(r=>r.id===a.target_id)))throw Error('REPORT_PURGED');
      for(const t of ['raw_submissions','checklists','sightings'])if((await first(db,`SELECT COUNT(*) n FROM ${t}`)).n)throw Error('PARTIAL_STATE');
      const ss=[];for(const v of values)ss.push(insert(db,'raw_submissions',v.raw),insert(db,'checklists',v.checklist),insert(db,'sightings',v.sighting));
      ss.push(insert(db,'backfill_runs',{run_id:plan.run_id,manifest_checksum:plan.manifest_sha256,transform_version:plan.transform_version,source_count:21,completed_at:new Date().toISOString(),source_revision:plan.registry_revision}));
      const result=await db.batch(ss);return {added:21,statements:result.length};
    }
    case 'admin-persistence':if(env.PHASE2C_ROLE!=='admin')throw Error('ROLE');return internalAdmin(env,input);
    case 'gate':return {dual:await assertWriteGate(env,env.PHASE2C_ROLE)};
    case 'quick-injected': {
      if(env.PHASE2C_ROLE!=='public')throw Error('ROLE');
      const req=new Request(new URL('/reports',request.url),{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json','CF-Connecting-IP':input.syntheticIp||'203.0.113.201'},body:JSON.stringify(input.body)});
      // Actual Worker handler and actual Siteverify, with documented synthetic IP for rate-limit isolation.
      const testingSecrets={fail:'2x0000000000000000000000000000000AA',spent:'3x0000000000000000000000000000000AA'};
      if(input.captchaScenario&&!testingSecrets[input.captchaScenario])throw Error('TESTING_SCENARIO_INVALID');
      const result=await publicHandler(req,{...env,...(input.captchaScenario?{TURNSTILE_SECRET_KEY:testingSecrets[input.captchaScenario]}:{}),REPORTS_DB:input.failIndex===undefined?db:failBinding(db,input.failIndex)});
      return {status:result.status,body:await result.json(),retryAfter:result.headers.get('Retry-After')};
    }
    case 'record': {
      const report=await first(db,'SELECT * FROM reports WHERE id=?',input.id),canonical=await first(db,canonicalProjection+' AND checklist_id=?',input.id);
      return {exists:!!report&&!!canonical,projectionEqual:!!report&&!!canonical&&stable(report)===stable(canonical),revision:(await first(db,'SELECT revision FROM checklists WHERE checklist_id=?',input.id))?.revision??null,status:report?.status??null,
        fields:report?{species:report.species,site_id:report.site_id,spot_key:report.spot_key,name_public:report.name_public,pending_public:report.pending_public,public_pair_null:report.public_lat===null&&report.public_lon===null,shared_bird_count:report.bird_count}:null,
        protectedDigest:report?await fingerprint(Object.fromEntries(['bird_count','reporter','note','received_at','ip_hash','dedupe_hash','lat','lon','observed_on'].map(k=>[k,report[k]]))):null,
        counts:await rows(db,'SELECT count_value,count_accuracy,interpretation FROM sightings WHERE checklist_id=? ORDER BY source_ordinal',input.id),
        reviews:await rows(db,'SELECT sequence,event_index,decision FROM reviews WHERE checklist_id=? ORDER BY sequence',input.id),auditCount:(await first(db,'SELECT COUNT(*) n FROM audit_log WHERE target_id=?',input.id)).n};
    }
    case 'extra-sighting': {
      const row=await first(db,'SELECT * FROM sightings WHERE checklist_id=? ORDER BY source_ordinal',input.id);if(!row)throw Error('NO_NATIVE');
      if(!input.id.startsWith('10000000-'))throw Error('NATIVE_TEST_ONLY');
      await insert(db,'sightings',{...row,sighting_id:'second:'+input.id,source_ordinal:2,species_original:'합성둘째종',count_value:null,count_source:'not_recorded'}).run();return {added:1};
    }
    case 'cas-direct': {
      if(!input.id.startsWith('10000000-'))throw Error('NATIVE_TEST_ONLY');
      const key='phase2c-cas:'+input.request_id;
      const result=await db.batch([db.prepare('UPDATE checklists SET revision=revision+1 WHERE checklist_id=? AND revision=?').bind(input.id,input.expected_revision),db.prepare('SELECT changes() AS n'),assertion(db,key),clearAssertion(db,key)]);
      return {changes:result[1].results[0].n,assertions:(await first(db,'SELECT COUNT(*) n FROM transaction_assertions')).n};
    }
    case 'read-compare': {
      const results=[];
      for(const path of input.paths) {
        if(!/^\/reports\//.test(path))throw Error('READ_PATH');
        const req=()=>new Request(new URL(path,request.url),{headers:{Origin:'http://localhost'}});
        const a=await publicHandler(req(),env),b=await handleLegacyRequest(req(),{...env,REPORTS_DB:canonicalReadDb(db)}),x=await a.clone().json(),y=await b.json();
        const categories=compareShadow(x,y);const logs=[];await shadowRead(req(),env,a,handleLegacyRequest,x=>logs.push(x));
        results.push({path,status:a.status,canonicalStatus:b.status,ok:x.ok===true&&y.ok===true,shape:Object.keys(x).sort(),categories,shadowLogs:logs,headerEqual:stable([...a.headers])===stable([...b.headers])});
      }return results;
    }
    case 'append-only': {
      const result=[];
      for(const table of ['reviews','audit_log','raw_submissions'])for(const verb of ['UPDATE','DELETE']) {
        const sql=verb==='DELETE'?`DELETE FROM ${table}`:table==='reviews'?"UPDATE reviews SET reason_code='test'":table==='audit_log'?"UPDATE audit_log SET action='test'":"UPDATE raw_submissions SET payload_json='{}'";
        try{applicationDb(db).prepare(sql);result.push({table,verb,rejected:false});}catch{result.push({table,verb,rejected:true});}
      }
      const triggerResults=[];for(const [table,col,error] of [['reviews','reason_code','append_only_review'],['audit_log','action','append_only_audit'],['raw_submissions','payload_json','immutable_raw']]) {
        const n=(await first(db,`SELECT COUNT(*) n FROM ${table}`)).n;if(!n)throw Error('TRIGGER_TEST_REQUIRES_ROW');
        try{await db.prepare(`UPDATE ${table} SET ${col}=${col} WHERE rowid IN (SELECT rowid FROM ${table} LIMIT 1)`).run();triggerResults.push({table,rejected:false});}catch(e){triggerResults.push({table,rejected:String(e.message).includes(error),expectedError:error});}
      }
      return {application:result,directUpdate:triggerResults};
    }
    case 'purge': {
      const e={...env,REPORTS_DB:input.failIndex===undefined?db:failBinding(db,input.failIndex),REPORTS_PURGE_ENABLED:'true',REPORTS_PURGE_ADMINS:ACTOR};
      return purgeForbidden(e,{email:input.unauthorized?'not-authorized@example.test':ACTOR},input.input);
    }
    case 'purge-proof': {
      if(!input.id?.startsWith('10000000-'))throw Error('SYNTHETIC_NATIVE_ONLY');
      const targetCounts={},originalIds={},originalResidue={},unrelated=[];let markerRows=0,audits=[];
      const keyFields={reports:['id','id'],raw_submissions:['source_id','raw_id'],checklists:['checklist_id','checklist_id'],sightings:['checklist_id','sighting_id'],reviews:['checklist_id','review_id'],audit_log:['target_id','audit_id']};
      for(const t of TABLES){const values=await rows(db,`SELECT * FROM ${t} ORDER BY 1`),fields=keyFields[t],target=fields?values.filter(r=>r[fields[0]]===input.id):[];
        markerRows+=values.filter(r=>Object.values(r).some(v=>typeof v==='string'&&v.includes('SYNTHETIC_FORBIDDEN_DETAIL'))).length;
        unrelated.push(fields?values.filter(r=>r[fields[0]]!==input.id):values);
        if(fields){originalIds[t]=target.map(r=>r[fields[1]]);originalResidue[t]=values.filter(r=>input.originalIds?.[t]?.includes(r[fields[1]])).length;if(t==='audit_log')audits=target;else targetCounts[t]=target.length;}
      }
      const a=audits[0],keys=['audit_id','actor_id','action','target_type','target_id','request_id','request_fingerprint','event_count','created_at'].sort();
      const tombstoneValid=audits.length===1&&stable(Object.keys(a).sort())===stable(keys)&&a.audit_id==='purge:'+input.requestId&&a.actor_id===ACTOR&&a.action==='forbidden_content_purged'&&a.target_type==='report'&&a.target_id===input.id&&a.request_id===input.requestId&&a.request_fingerprint===null&&a.event_count===0&&Number.isFinite(Date.parse(a.created_at));
      return {targetCounts,originalIds,originalResidue,markerRows,unrelatedDigest:await fingerprint(unrelated),auditRows:audits.length,tombstoneValid};
    }
    case 'purge-state': {
      const found={};for(const [t,k] of [['reports','id'],['raw_submissions','source_id'],['checklists','checklist_id'],['sightings','checklist_id'],['reviews','checklist_id']])found[t]=(await first(db,`SELECT COUNT(*) n FROM ${t} WHERE ${k}=?`,input.id)).n;
      const audits=await rows(db,'SELECT * FROM audit_log WHERE target_id=?',input.id);
      return {counts:found,audits:audits.map(a=>({action:a.action,request_fingerprint:a.request_fingerprint,event_count:a.event_count,keys:Object.keys(a)})),sensitiveMarkerAbsent:!stable(audits).includes('SYNTHETIC_FORBIDDEN_DETAIL')};
    }
    case 'constraint-probes': {
      if(!input.id.startsWith('10000000-'))throw Error('NATIVE_TEST_ONLY');
      const review=await first(db,'SELECT * FROM reviews WHERE checklist_id=? ORDER BY sequence',input.id);if(!review)throw Error('REVIEW_REQUIRED');
      const probes=[['sequence',{...review,review_id:'phase2c-sequence-probe',request_id:'phase2c-probe-sequence'},'reviews.checklist_id, reviews.sequence'],['event_index',{...review,review_id:'phase2c-event-probe',sequence:999},'reviews.request_id, reviews.event_index']];
      const result=[];for(const [name,value,error] of probes){try{await db.batch([insert(db,'reviews',value),db.prepare("INSERT INTO transaction_assertions VALUES ('force-probe-rollback',0)")]);throw Error('UNEXPECTED_COMMIT');}catch(e){result.push({name,rejected:String(e.message).includes('UNIQUE constraint failed: '+error)});}}
      try{await db.batch([db.prepare('UPDATE checklists SET site_id=? WHERE checklist_id=?').bind('phase2c-missing-site',input.id),db.prepare("INSERT INTO transaction_assertions VALUES ('force-fk-rollback',0)")]);throw Error('UNEXPECTED_COMMIT');}catch(e){result.push({name:'site_fk',rejected:String(e.message).includes('FOREIGN KEY constraint failed')});}
      return result;
    }
    case 'partial-probe': {
      if(env.REPORTS_WRITE_MODE!=='READ_ONLY_MAINTENANCE'||input.approval!=='PHASE2C_SYNTHETIC_BACKFILL_APPROVED')throw Error('FREEZE_AND_APPROVAL_REQUIRED');
      const id='00000000-0000-4000-8000-000000000001',r=await first(db,'SELECT * FROM sightings WHERE checklist_id=? ORDER BY source_ordinal',id);
      if((await first(db,'SELECT source_type FROM checklists WHERE checklist_id=?',id))?.source_type!=='legacy_reports')throw Error('EXPECTED_SYNTHETIC_LEGACY_CHECKLIST');
      if(input.phase==='remove') {
        if(!r||r.count_source!=='legacy_single')throw Error('EXPECTED_SYNTHETIC_LEGACY_SIGHTING');
        await db.prepare('DELETE FROM sightings WHERE sighting_id=?').bind(r.sighting_id).run();return {removed:1};
      }
      if(input.phase==='restore'&&input.row?.checklist_id===id&&input.row?.count_source==='legacy_single'&&!r){await insert(db,'sightings',input.row).run();return {restored:1};}
      throw Error('PARTIAL_PROBE_INVALID');
    }
    case 'restore-probe': {
      if(env.REPORTS_WRITE_MODE!=='READ_ONLY_MAINTENANCE'||input.confirmation!=='STAGING_TIME_TRAVEL_PROBE')throw Error('PROBE_GUARD');
      await db.prepare("INSERT INTO transaction_assertions(assertion_id,ok) VALUES ('phase2c-time-travel-probe',1)").run();return {added:1};
    }
    default:throw Error('UNKNOWN_TEST_OPERATION');
  }
}
export default {async fetch(request,env,ctx) {
  if(env.ENVIRONMENT!=='staging'||env.PHASE2C_DATABASE_ID!==DB_ID)return new Response('Not found',{status:404});
  const path=new URL(request.url).pathname;
  const app=env.PHASE2C_ROLE==='admin'?adminHandler:publicHandler;
  if(path==='/_internal/reports-capability')return app(request,env,ctx);
  if(!env.PHASE2C_TEST_TOKEN||request.headers.get('X-Phase2C-Test')!==env.PHASE2C_TEST_TOKEN)return new Response('Not found',{status:404});
  // Staging boundary rehearsal for old NORMAL writers that have no protocol gate.
  // This is an external test freeze, not a claim that an old production binary can freeze itself.
  if(env.PHASE2C_EXTERNAL_FREEZE==='true'&&request.method==='POST'&&(path==='/reports'||path.startsWith('/admin/api/reports/')))return Response.json({ok:false,error:{code:'STAGING_EXTERNAL_FREEZE'}},{status:503,headers:{'Retry-After':'60'}});
  if(path==='/_phase2c'&&request.method==='POST') {
    try{return json({ok:true,value:await test(request,env)});}catch(e){return json({ok:false,code:e.code||'TEST_FAILED',message:e.code?undefined:String(e.message).slice(0,600)},e.status||500);}
  }
  return app(request,env,ctx);
}};
