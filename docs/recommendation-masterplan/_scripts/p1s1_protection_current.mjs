// Analysis-only P1-S1. Actual read-only GET handlers against SQLite :memory:.
// No production endpoint, POST handler, remote D1, deployment, source mutation or coordinate output.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';

const repo=path.resolve(process.argv[2]||process.cwd());
const out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url)));
fs.mkdirSync(out,{recursive:true});
const reference=process.argv[4]||'4fc14b3c7ba19ad4d5b91efa305a80b3d474dc57';
const sourcePaths=['reports-api/src/shared.js','reports-api/src/public.js','reports-api/src/field-updates.js','reports-api/src/admin-actions.js','reports-api/src/canonical/data.js','reports-api/src/canonical/persistence.js','reports-api/src/canonical/control.js','reports-api/schema.sql','reports-api/test/helpers.mjs','index.html'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=Object.fromEntries(sourcePaths.map(p=>{
 const work=fs.readFileSync(path.join(repo,p)),git=execFileSync('git',['show',reference+':'+p],{cwd:repo,maxBuffer:8*1024*1024});
 assert.equal(work.toString('utf8').replace(/\r\n/g,'\n'),git.toString('utf8').replace(/\r\n/g,'\n'),p+' content does not match latest source reference');
 return [p,{gitSha256:hash(git),worktreeSha256:hash(work),matchesReferenceIgnoringCheckoutCRLF:true}];
}));
const {handleRequest}=await import(pathToFileURL(path.join(repo,'reports-api/src/public.js')));
const shared=await import(pathToFileURL(path.join(repo,'reports-api/src/shared.js')));
const {normalizeSpecies,splitSpecies,isSensitiveReport,kstDateString,SENSITIVE_SPECIES,SENSITIVE_KEYWORDS}=shared;
const {fakeDb,publicEnv,ORIGIN}=await import(pathToFileURL(path.join(repo,'reports-api/test/helpers.mjs')));
const fieldSource=fs.readFileSync(path.join(repo,'reports-api/src/field-updates.js'),'utf8');
const fieldProtectionText=fieldSource.match(/function protection\(species, note\) \{[\s\S]*?\n\}/)[0];
const fieldProtection=new Function('isSensitiveReport',fieldProtectionText+';return protection;')(isSensitiveReport);
const html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
const frontendPointText=html.match(/function fieldPublicPoint\(update\)\{[\s\S]*?\n\}/)[0];
const fieldPublicPoint=new Function(frontendPointText+';return fieldPublicPoint;')();
const NativeDate=Date, evaluationTime='2026-10-08T22:40:00+09:00';
globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[evaluationTime]));}static now(){return new NativeDate(evaluationTime).getTime();}};
globalThis.fetch=async()=>{throw Error('External network forbidden');};
const today=kstDateString(new Date()),at=new Date().toISOString(),syntheticPoint={lat:36,lon:126};
async function get(db,url){const response=await handleRequest(new Request('https://reports.example'+url,{method:'GET',headers:ORIGIN}),publicEnv(db));assert.equal(response.status,200,url);return response.json();}
function makeRow(extra={}){return {id:'11111111-1111-4111-8111-111111111111',species:'울새',status:'approved',site_id:'19',lat:syntheticPoint.lat,lon:syntheticPoint.lon,observed_on:today,received_at:at,note:null,...extra};}
function coordsMatch(spot){return !!spot&&spot.lat===syntheticPoint.lat&&spot.lon===syntheticPoint.lon;}
function sanitizeApproved(body,id){const spot=body.spots.find(s=>s.id===id);return {spotPresent:!!spot,actualCoordinatePublished:coordsMatch(spot),locationHidden:spot?.locationHidden===true,navigationPermittedByExistingSpotFlag:!!spot&&spot.locationHidden!==true,speciesCount:spot?.species.length||0,historyRows:spot?.history.length||0};}
const cases=[
 ['protected_exact','저어새','protected'],
 ['protected_suffix','저어새1','protected'],
 ['protected_spaced_suffix','저어새 1','protected'],
 ['protected_count_unit','저어새 2마리','protected'],
 ['protected_other_suffix','흰꼬리수리1','protected'],
 ['protected_short_suffix','매1','protected'],
 ['protected_count_zero','저어새0','ambiguous_protected'],
 ['protected_negative_count','저어새 -1','ambiguous_protected'],
 ['protected_count_range','저어새 1-3','ambiguous_protected'],
 ['protected_count_decimal','저어새 1.5','ambiguous_protected'],
 ['protected_suffix_unknown','저어새류','ambiguous_protected'],
 ['protected_suffix_question','저어새?','ambiguous_protected'],
 ['protected_parenthesis','저어새(2)','ambiguous_protected'],
 ['protected_internal_space','저 어 새','ambiguous_protected'],
 ['protected_decomposed_unicode','저어새'.normalize('NFD'),'ambiguous_protected'],
 ['mixed_comma','저어새,울새','protected'],
 ['mixed_slash','저어새/울새','protected'],
 ['mixed_newline','저어새\n울새','protected'],
 ['mixed_crlf','저어새\r\n울새','protected'],
 ['mixed_semicolon','저어새;울새','protected'],
 ['mixed_middot','저어새·울새','protected'],
 ['mixed_delimiters','울새,저어새1;박새/참새\n매1','protected'],
 ['ordinary_simple','울새','ordinary'],
 ['ordinary_suffix','울새1','ordinary'],
 ['ordinary_mixed_comma','울새,박새','ordinary'],
 ['ordinary_similar_short','검은어깨매','ordinary'],
 ['ordinary_similar_other','참새','ordinary'],
 ['ordinary_egg_syllable','알락할미새','ordinary'],
 ['ordinary_parenthesis','참새(2)','ordinary'],
 ['ordinary_digits_inside','조류2호','unknown'],
 ['ordinary_ambiguous_range','울새 1-3','unknown'],
 ['ordinary_count_zero','울새0','ambiguous_quantity'],
 ['ordinary_negative_count','울새 -1','ambiguous_quantity'],
 ['ordinary_count_over_report_cap','울새100001','ambiguous_quantity'],
 ['ordinary_count_over_field_cap','울새1000','endpoint_quantity'],
 ['breeding_nest','울새','breeding','둥지 확인'],
 ['breeding_chick','울새','breeding','새끼 관찰'],
 ['breeding_chickfeeding','울새','breeding','육추 중'],
 ['breeding_incubation','울새','breeding','포란 중'],
 ['breeding_nesting','울새','breeding','영소 중'],
 ['breeding_general','울새','breeding','번식 관찰'],
 ['breeding_egg_only','울새','breeding_policy_extension','알 2개 확인'],
 ['breeding_laying','울새','breeding_policy_extension','산란 확인'],
 ['breeding_nest_spaced','울새','ambiguous_breeding','둥 지 확인'],
 ['breeding_chick_spaced','울새','ambiguous_breeding','새 끼 확인'],
 ['ordinary_keyword_negated','울새','breeding_keyword_negation','둥지 아님'],
 ['ordinary_keyword_incidental','울새','breeding_keyword_incidental','관찰자 별명은 새끼리'],
 ['protected_hidden_request','저어새1','protected',null,true],
];
const results=[];
for(const [label,raw,expectedClass,note,hidden] of cases){
 let normalized=null,error=null;
 try{normalized=normalizeSpecies(raw);}catch(e){error=e.code||e.message;}
 const modes=[{mode:'legacy_db_literal',stored:raw},{mode:'validated_normalize_species',stored:normalized?.join(' · ')}].filter(x=>x.stored!==undefined);
 const rowResults=[];
 for(const m of modes){
  const names=splitSpecies(m.stored),classified=isSensitiveReport({species:names,speciesText:m.stored,note:note||null});
  const row=makeRow({species:m.stored,note:note||null,...(hidden?{public_lat:36.01,public_lon:126.01}:{})});
  const db=fakeDb([row]),before=JSON.stringify(db.rows);
  const recent=await get(db,'/reports/recent-sites?days=14'),approved=await get(db,'/reports/approved'),history=await get(db,'/reports/site/19');
  assert.equal(JSON.stringify(db.rows),before);
  assert.ok(recent.sites.every(s=>Object.keys(s).every(k=>['siteId','latestDate','species'].includes(k))));
  assert.ok(history.history.every(s=>!('lat' in s)&&!('lon' in s)&&!('note' in s)));
  const field=normalized?.length===1?fieldProtection(normalized[0],note):null;
  let fieldRead=null;
  if(field&&!field.breeding){
   const fdb=fakeDb([]),publicPoint=field.sensitiveSpecies?{lat:36.01,lon:126.01}:syntheticPoint;
   await fdb.prepare('INSERT INTO field_updates (id,species,bird_count,status,lat,lon,public_lat,public_lon,location_hidden,nickname,note,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('synthetic-field',normalized[0],1,'visible',36,126,publicPoint.lat,publicPoint.lon,field.sensitiveSpecies?1:0,'합성',note||null,at,at,at,'test-user','test-ip').run();
   const beforeField=JSON.stringify((await fdb.prepare('SELECT * FROM field_updates').all()).results);
   const got=await get(fdb,'/field-updates'),entry=got.updates[0];
   assert.equal(JSON.stringify((await fdb.prepare('SELECT * FROM field_updates').all()).results),beforeField);
   fieldRead={present:!!entry,actualCoordinatePublished:coordsMatch(entry),locationHidden:entry?.locationHidden===true,navigationPermitted:!!fieldPublicPoint(entry),classifiedCreatePolicyOnly:true};
  }
  rowResults.push({mode:m.mode,storedSpecies:m.stored,splitSpecies:names,sensitive:classified,recentIncluded:recent.sites.length>0,
    recentSiteIdPresent:recent.sites.length>0,recentDatePresent:recent.sites.length>0,recentSpeciesCount:recent.sites.reduce((n,s)=>n+s.species.length,0),
    approved:sanitizeApproved(approved,row.id),siteHistory:{total:history.total,rows:history.history.length,siteIdPresent:!!history.siteId,coordinatesPresent:false},
    fieldCreateDecision:field?{blocked:field.breeding,approximate:field.sensitiveSpecies}:null,fieldRead,rowsUnchanged:true});
 }
 results.push({label,input:raw,note:note||null,expectedClass,normalizerAccepted:normalized!==null,normalizerOutput:normalized,normalizerError:error,results:rowResults});
}
const byLabel=label=>results.find(x=>x.label===label).results.find(x=>x.mode==='validated_normalize_species');
assert.equal(byLabel('protected_exact').recentIncluded,false);
for(const label of ['protected_suffix','protected_spaced_suffix','protected_count_unit','protected_other_suffix','protected_short_suffix','mixed_newline','mixed_crlf']) assert.equal(byLabel(label).recentIncluded,true,label);
assert.equal(results.find(x=>x.label==='mixed_slash').normalizerAccepted,false);
for(const label of ['mixed_comma','mixed_semicolon','mixed_middot'])assert.equal(byLabel(label).recentIncluded,false,label);
for(const label of ['ordinary_simple','ordinary_similar_short','ordinary_similar_other','ordinary_egg_syllable']) assert.equal(byLabel(label).recentIncluded,true);
for(const label of ['breeding_nest','breeding_chick','breeding_chickfeeding','breeding_incubation','breeding_nesting','breeding_general']) assert.equal(byLabel(label).recentIncluded,false,label);
assert.equal(byLabel('breeding_egg_only').recentIncluded,true);
assert.equal(byLabel('breeding_laying').recentIncluded,true);
assert.equal(byLabel('protected_hidden_request').recentIncluded,false);
const linkCases=[];
for(const spotKey of ['11111111-1111-4111-8111-111111111111','fixed:19:0']){
 const target=makeRow(),attached=makeRow({id:'22222222-2222-4222-8222-222222222222',species:'저어새',public_lat:36.01,public_lon:126.01,spot_key:spotKey});
 const db=fakeDb([target,attached]),before=JSON.stringify(db.rows),body=await get(db,'/reports/approved'),history=await get(db,'/reports/site/19'),recent=await get(db,'/reports/recent-sites');
 assert.equal(JSON.stringify(db.rows),before);
 const targetSpot=body.spots[0],fixed=body.fixedSpots[spotKey];
 linkCases.push({spotKeyType:spotKey.startsWith('fixed:')?'fixed':'report',sensitiveAttachedRowHasHiddenCoordinates:true,
  sensitiveSpeciesPresentInTargetSpot:targetSpot.species.includes('저어새'),targetActualCoordinatePublished:coordsMatch(targetSpot),
  targetFlagHidden:targetSpot.locationHidden===true,navigationPermittedBySpotFlag:targetSpot.locationHidden!==true,
  sensitiveSpeciesPresentInFixedHistory:fixed?.history.some(x=>x.species.includes('저어새'))||false,siteHistoryTotal:history.total,
  siteHistorySensitiveRowPresent:history.history.some(x=>x.species.includes('저어새')),recentAggregateSpecies:recent.sites.flatMap(s=>s.species),rowsUnchanged:true});
}
const pendingCases=[];
for(const raw of ['저어새','저어새1','울새']){
 const normalized=normalizeSpecies(raw),sensitive=isSensitiveReport({species:normalized,speciesText:normalized.join(' · '),note:''});
 for(const mode of ['legacy_policy','canonical_non_breeding_policy']){
  const pendingPublic=mode==='legacy_policy'?(sensitive?0:1):1;
  const approximate=mode==='legacy_policy';
  const row=makeRow({status:'pending',species:normalized.join(' · '),pending_public:pendingPublic,approx_lat:approximate?36.01:36,approx_lon:approximate?126.01:126});
  const db=fakeDb([row]),before=JSON.stringify(db.rows),body=await get(db,'/reports/pending'),spot=body.spots[0];
  assert.equal(JSON.stringify(db.rows),before);
  pendingCases.push({raw,mode,configuredSyntheticRowFromSourceDecision:true,pendingPublic,sensitiveByExistingClassifier:sensitive,
    present:!!spot,actualCoordinatePublished:coordsMatch(spot),approximateFlag:spot?.approximate??null,rowsUnchanged:true});
 }
}
const existingFieldRows=[];
for(const species of ['저어새','저어새1','울새']){
 const fdb=fakeDb([]);
 await fdb.prepare('INSERT INTO field_updates (id,species,bird_count,status,lat,lon,public_lat,public_lon,location_hidden,nickname,note,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .bind('existing-field',species,1,'visible',36,126,36,126,0,'합성','둥지 확인',at,at,at,'test-user','test-ip').run();
 const body=await get(fdb,'/field-updates'),entry=body.updates[0];
 existingFieldRows.push({species,syntheticLegacyBreedingNote:true,present:!!entry,actualCoordinatePublished:coordsMatch(entry),navigationPermitted:!!fieldPublicPoint(entry)});
}
const statusCases=[];
for(const status of ['approved','pending','rejected']){
 const db=fakeDb([makeRow({status,species:'저어새1'})]),recent=await get(db,'/reports/recent-sites'),approved=await get(db,'/reports/approved'),history=await get(db,'/reports/site/19');
 statusCases.push({status,recentIncluded:recent.sites.length>0,approvedIncluded:approved.spots.length>0,siteHistoryRows:history.total});
}
const payload={schemaVersion:1,sourceCommit:reference,evaluationTime,sourceFiles,currentProtectedSpecies:SENSITIVE_SPECIES,currentBreedingKeywords:SENSITIVE_KEYWORDS,
 constraints:{operatingCodeReadOnly:true,productionEndpointsQueried:0,productionD1Access:0,postHandlerCalls:0,coordinatesInResult:false,syntheticMemorySQLiteOnly:true,networkFailClosed:true},
 inputCases:results,linkedSpotCases:linkCases,pendingPolicyCases:pendingCases,existingFieldReadCases:existingFieldRows,statusCases,
 notes:[
  'Existing APIs are tested as written. Approved/history publishing is currently administrator-mediated, not a promise to exclude every protected species.',
  'Field create policy is evaluated via the unmodified extracted pure protection function and normalizer; GET rows are inserted directly in SQLite memory. No create POST was invoked.',
  'Canonical pending fixture follows source policy (explicit non-breeding and configured public flag); actual write-mode configuration was not queried.',
  'An exact name with an approved actual coordinate can appear in approved/site-history by current intent even though recent-sites excludes it.',
  'Tests reproduce defects and existing contracts; synthetic output does not prove a production disclosure.',
  'Egg-only and laying keywords are not on the current six-keyword list; adding them is a policy expansion requiring explicit design decision.'
 ]};
fs.writeFileSync(path.join(out,'p1s_protection_current.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({output:path.join(out,'p1s_protection_current.json'),inputCases:results.length,readModeCases:results.reduce((n,x)=>n+x.results.length,0),linkedSpotCases:linkCases.length,pendingPolicyCases:pendingCases.length,existingFieldReadCases:existingFieldRows.length,statusCases:statusCases.length,allAssertionsPassed:true},null,2));
