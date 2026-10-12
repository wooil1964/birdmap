// Public permission contract. No user identity or private coordinates in anchors.
import {WorkerError,jsonResponse,publicPayload,pendingPayload,historyEntry,splitSpecies,isSensitiveReport,LOCATION_HIDDEN_SQL,kstDateString} from './shared.js';
import {fieldSnapshotStatements,fieldSnapshotPayload} from './field-updates.js';
export const PUBLICATION_CONTRACT='publication-v1';
export const PUBLICATION_PROJECTION='legacy-public-v1';
export const PUBLICATION_GUARDS=['publication_state_permanent','publication_state_transition',...['reports','field_updates'].flatMap(t=>['insert','update','delete'].map(a=>`publication_${t}_${a}`)),'field_deleted_terminal','field_revision_valid','field_revision_advance','field_event_live','field_confirmation_live',...['field_updates','field_update_events','field_update_confirmations'].flatMap(t=>['insert','update','delete'].map(a=>`field_freeze_${t}_${a}`))];
const MAX_REV=9223372036854775807n;
export function publicationRevision(value,minimum=0n) {
 if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(value))return false;
 const n=BigInt(value);return n>=minimum&&n<=MAX_REV;
}
const token=v=>typeof v==='string'&&/^[0-9a-f]{32}$/.test(v);
function fail(code,message,status=503){throw new WorkerError(code,message,status);}
export function publicationRequest(url,head=false) {
 const nonce=url.searchParams.get('nonce');
 if(!token(nonce))fail('PUBLICATION_REQUEST_INVALID','공개 위치 확인 요청이 유효하지 않습니다.',400);
 if(!head&&(url.searchParams.get('contract')!==PUBLICATION_CONTRACT||!token(url.searchParams.get('expectedEpoch'))||!publicationRevision(url.searchParams.get('expectedRevision'))))fail('PUBLICATION_REQUEST_INVALID','공개 위치 확인 요청이 유효하지 않습니다.',400);
 return {nonce,epoch:url.searchParams.get('expectedEpoch'),revision:url.searchParams.get('expectedRevision')};
}
// Cache only lookup positions, never permission or a positive guard result.
// Every warm read still verifies all required trigger names/types in its own
// primary snapshot. A stale locator falls back to a complete cold snapshot.
const guardLookupHints=new WeakMap();
function guardLocators(row) {
 if(!row||typeof row.guardLocators!=='string')return null;
 let slots;try{slots=JSON.parse(row.guardLocators);}catch{return null;}
 if(!Array.isArray(slots)||slots.length!==PUBLICATION_GUARDS.length)return null;
 const byName=new Map();
 for(const slot of slots){
  if(!slot||!PUBLICATION_GUARDS.includes(slot.name)||byName.has(slot.name)||typeof slot.rowid!=='string'||!/^[1-9][0-9]{0,18}$/.test(slot.rowid)||BigInt(slot.rowid)>MAX_REV)return null;
  byName.set(slot.name,slot.rowid);
 }
 return PUBLICATION_GUARDS.map(name=>[name,byName.get(name)]);
}
export function publicationStateStatement(db,slots=null) {
 const columns="epoch,CAST(revision AS TEXT) AS revision,typeof(revision) AS revision_type";
 if(slots){
  const checks=slots.map((_,i)=>`(SELECT COUNT(*) FROM sqlite_schema WHERE rowid=?${i*2+1} AND type='trigger' AND name=?${i*2+2})`);
  return db.prepare(`SELECT ${columns},(${checks.join('+')}) AS guards FROM public_publication_state WHERE id=1`).bind(...slots.flatMap(([name,rowid])=>[rowid,name]));
 }
 return db.prepare(`SELECT ${columns},
 (SELECT json_group_array(json_object('name',name,'rowid',CAST(rowid AS TEXT))) FROM sqlite_schema WHERE type='trigger' AND name IN (${PUBLICATION_GUARDS.map(()=>'?').join(',')})) AS guardLocators
 FROM public_publication_state WHERE id=1`).bind(...PUBLICATION_GUARDS);
}
function verifiedState(row,slots) {
 if(slots)return row;
 const discovered=guardLocators(row);
 return discovered?{...row,guards:discovered.length}:null;
}
function rememberGuardLocators(binding,row) {
 const slots=guardLocators(row);if(slots)guardLookupHints.set(binding,slots);
}
function validateState(row,request,head) {
 if(!row||!token(row.epoch)||row.revision_type!=='integer'||!publicationRevision(row.revision)||Number(row.guards)!==PUBLICATION_GUARDS.length)fail('PUBLICATION_UNAVAILABLE','공개 위치의 최신 상태를 확인할 수 없습니다.');
 if(!head&&(row.epoch!==request.epoch||row.revision!==request.revision))fail('PUBLICATION_CHANGED','공개 위치 상태가 변경됐습니다. 다시 확인해 주세요.',409);
 return {contract:PUBLICATION_CONTRACT,epoch:row.epoch,revision:row.revision,projection:PUBLICATION_PROJECTION,nonce:request.nonce};
}
function primary(db){return typeof db.withSession==='function'?db.withSession('first-primary'):db;}
export async function publicationAnchor(binding,request) {
 try{
  const db=primary(binding),slots=guardLookupHints.get(binding)||null;
  let row=await publicationStateStatement(db,slots).first();
  if(slots&&Number(row?.guards)!==PUBLICATION_GUARDS.length){guardLookupHints.delete(binding);row=await publicationStateStatement(db).first();}
  const anchor=validateState(verifiedState(row,slots&&Object.hasOwn(row||{},'guards')?slots:null),request,true);
  rememberGuardLocators(binding,row);return anchor;
 }catch(e){if(e instanceof WorkerError)throw e;fail('PUBLICATION_UNAVAILABLE','공개 위치의 최신 상태를 확인할 수 없습니다.');}
}
const paths=new Set(['/reports/approved','/reports/pending','/reports/recent-sites','/field-updates','/contributors/monthly']);
export function isPublicationPath(path){return paths.has(path)||path.startsWith('/reports/site/');}
function readPlan(db,url,now) {
 const path=url.pathname;
 if(path==='/reports/approved')return {statements:[db.prepare("SELECT id,species,lat,lon,public_lat,public_lon,observed_on,reporter,name_public,spot_key FROM reports WHERE status='approved' ORDER BY observed_on DESC,received_at DESC")],build:s=>({ok:true,generatedAt:now.toISOString(),...publicPayload(s[0].results||[])})};
 if(path==='/reports/pending')return {statements:[db.prepare(`SELECT id,species,observed_on,approx_lat,approx_lon,(approx_lat<>lat OR approx_lon<>lon) AS approx_offset,${LOCATION_HIDDEN_SQL} AS location_hidden FROM reports WHERE status='pending' AND pending_public=1 AND approx_lat IS NOT NULL AND approx_lon IS NOT NULL ORDER BY observed_on DESC,received_at DESC`)],build:s=>({ok:true,generatedAt:now.toISOString(),spots:pendingPayload(s[0].results||[])})};
 if(path==='/reports/recent-sites') {
  const days=Math.min(30,Math.max(1,Math.floor(Number(url.searchParams.get('days'))||14))),today=kstDateString(now),since=kstDateString(new Date(now.getTime()-days*86400000));
  return {statements:[db.prepare(`SELECT site_id,species,observed_on,note FROM reports WHERE status='approved' AND site_id IS NOT NULL AND site_id<>'' AND observed_on>=?1 AND observed_on<=?2 AND NOT ${LOCATION_HIDDEN_SQL} ORDER BY observed_on DESC,received_at DESC,id DESC`).bind(since,today)],build:s=>{
   const bySite=new Map();for(const row of s[0].results||[]){const species=splitSpecies(row.species);if(isSensitiveReport({note:row.note,speciesText:row.species,species}))continue;const siteId=String(row.site_id);if(!bySite.has(siteId))bySite.set(siteId,{siteId,latestDate:row.observed_on,species:[]});for(const name of species)if(!bySite.get(siteId).species.includes(name))bySite.get(siteId).species.push(name);}
   return {ok:true,days,since,today,sites:[...bySite.values()]};
  }};
 }
 if(path==='/field-updates')return {statements:fieldSnapshotStatements(db,now),build:s=>fieldSnapshotPayload(s,now)};
 if(path.startsWith('/reports/site/')) {
  const siteId=decodeURIComponent(path.slice('/reports/site/'.length));if(!/^[0-9A-Za-z_-]{1,16}$/.test(siteId))fail('SITE_ID_INVALID','탐조지 ID 형식이 아닙니다.',400);
  const limit=Math.min(50,Math.max(1,Number(url.searchParams.get('limit'))||5)),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
  return {statements:[db.prepare("SELECT id,species,observed_on,reporter,name_public FROM reports WHERE status='approved' AND site_id=?1 ORDER BY observed_on DESC,received_at DESC,id DESC LIMIT ?2 OFFSET ?3").bind(siteId,limit,offset),db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='approved' AND site_id=?1").bind(siteId)],build:s=>({ok:true,siteId,total:Number(s[1].results?.[0]?.n||0),limit,offset,history:(s[0].results||[]).map(historyEntry)})};
 }
 const raw=url.searchParams.get('month'),month=raw===null?kstDateString(now).slice(0,7):raw;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('INVALID_MONTH','월 형식이 유효하지 않습니다.',400);
 const [year,mon]=month.split('-').map(Number),start=month+'-01',end=mon===12?(year+1)+'-01-01':year+'-'+String(mon+1).padStart(2,'0')+'-01';
 return {statements:[db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='approved' AND observed_on>=?1 AND observed_on<?2").bind(start,end),db.prepare("SELECT reporter,COUNT(*) AS n FROM reports WHERE status='approved' AND name_public=1 AND reporter IS NOT NULL AND TRIM(reporter)<>'' AND observed_on>=?1 AND observed_on<?2 GROUP BY reporter ORDER BY n DESC,reporter ASC").bind(start,end)],build:s=>{const contributors=(s[1].results||[]).map(r=>({name:r.reporter,count:Number(r.n)}));return {month,approvedReports:Number(s[0].results?.[0]?.n||0),publicContributors:contributors.length,contributors};}};
}
export async function handlePublicationRead(request,env,url) {
 if(request.method!=='GET')return null;
 const head=url.pathname==='/reports/public-state';
 if(!head&&!isPublicationPath(url.pathname))return null;
 if(!head&&!url.searchParams.has('contract')&&env.REPORTS_PUBLICATION_REQUIRED!=='true')return null;
 const input=publicationRequest(url,head),binding=env.REPORTS_DB;
 if(!binding)fail('PUBLICATION_UNAVAILABLE','공개 위치의 최신 상태를 확인할 수 없습니다.');
 const now=new Date();
 if(head)return jsonResponse(request,env,{ok:true,publication:await publicationAnchor(binding,input),serverTime:now.toISOString()},200,{'Cache-Control':'no-store'});
 try {
  const db=primary(binding),plan=readPlan(db,url,now),slots=guardLookupHints.get(binding)||null;
  let sets=await db.batch([publicationStateStatement(db,slots),...plan.statements]);
  if(!Array.isArray(sets)||sets.length!==plan.statements.length+1)fail('PUBLICATION_UNAVAILABLE','공개 위치 자료를 확인할 수 없습니다.');
  let row=sets[0].results?.[0],usedSlots=slots;
  if(slots&&Number(row?.guards)!==PUBLICATION_GUARDS.length){
   // Never bless the first payload using a later schema-only check. Reread
   // state and every payload statement together from the primary instead.
   guardLookupHints.delete(binding);usedSlots=null;
   sets=await db.batch([publicationStateStatement(db),...plan.statements]);
   if(!Array.isArray(sets)||sets.length!==plan.statements.length+1)fail('PUBLICATION_UNAVAILABLE','공개 위치 자료를 확인할 수 없습니다.');
   row=sets[0].results?.[0];
  }
  const publication=validateState(verifiedState(row,usedSlots),input,false),payload=plan.build(sets.slice(1));
  rememberGuardLocators(binding,row);
  return jsonResponse(request,env,{...payload,publication,serverTime:now.toISOString()},200,{'Cache-Control':'no-store'});
 } catch(e){if(e instanceof WorkerError)throw e;fail('PUBLICATION_UNAVAILABLE','공개 위치 자료를 확인할 수 없습니다.');}
}
