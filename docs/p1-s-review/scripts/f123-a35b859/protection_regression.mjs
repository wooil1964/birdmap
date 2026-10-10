// Independent PR #13 S1-R review. Memory SQLite and local modules only; no production traffic or source edits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url)));
const base='b0975cad9f3112af38cc286a892bf6f06722ce12',head='a35b8598d55890e705042e4d6f88621357749d09';
fs.mkdirSync(out,{recursive:true});
const git=p=>execFileSync('git',['show',base+':'+p],{cwd:repo,maxBuffer:8*1024*1024}).toString('utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const now='2026-10-09T12:00:00+09:00',NativeDate=Date;
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return new NativeDate(now).getTime();}};
let turnstileCalls=0,localAdminJwks=null;
globalThis.fetch=async(url)=>{if(String(url)==='https://p1s-local-review.cloudflareaccess.com/cdn-cgi/access/certs'&&localAdminJwks)return new Response(JSON.stringify(localAdminJwks));if(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify'){turnstileCalls++;return new Response(JSON.stringify({success:true}));}throw Error('Unexpected external network call');};
const headShared=await import(pathToFileURL(path.join(repo,'reports-api/src/shared.js')));
const beforeSharedText=git('reports-api/src/shared.js'),beforeSharedUrl='data:text/javascript;base64,'+Buffer.from(beforeSharedText).toString('base64');
const beforeShared=await import(beforeSharedUrl);
const toModule=(source,p,overrides={})=>'data:text/javascript;base64,'+Buffer.from(source.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(_whole,quote,spec)=>'from '+quote+(overrides[spec]||new URL(spec,pathToFileURL(path.join(repo,p))).href)+quote)).toString('base64');
const fieldBeforeUrl=toModule(git('reports-api/src/field-updates.js'),'reports-api/src/field-updates.js',{'./shared.js':beforeSharedUrl});
const publicBeforeUrl=toModule(git('reports-api/src/public.js'),'reports-api/src/public.js',{'./shared.js':beforeSharedUrl,'./field-updates.js':fieldBeforeUrl});
const beforePublic=await import(publicBeforeUrl),headPublic=await import(pathToFileURL(path.join(repo,'reports-api/src/public.js')));
const beforeAdmin=await import(toModule(git('reports-api/src/admin-actions.js'),'reports-api/src/admin-actions.js',{'./shared.js':beforeSharedUrl}));
const actualAdminHandler=await import(pathToFileURL(path.join(repo,'reports-api/src/admin.js')));
const headAdmin=await import(pathToFileURL(path.join(repo,'reports-api/src/admin-actions.js')));
const {fakeDb,publicEnv,ORIGIN}=await import(pathToFileURL(path.join(repo,'reports-api/test/helpers.mjs')));
const sourceFiles={};
for(const p of ['reports-api/src/shared.js','reports-api/src/public.js','reports-api/src/field-updates.js','reports-api/src/admin-actions.js','reports-api/src/admin.js','reports-api/schema.sql','reports-api/test/helpers.mjs']){
 const current=fs.readFileSync(path.join(repo,p),'utf8'),h=execFileSync('git',['show',head+':'+p],{cwd:repo,maxBuffer:8*1024*1024}).toString('utf8');
 assert.equal(current.replace(/\r\n/g,'\n'),h.replace(/\r\n/g,'\n'));
 sourceFiles[p]={baseGitSha256:sha(git(p)),headGitSha256:sha(h),worktreeSha256:sha(current),sourceChange:git(p)!==h};
}
assert.deepEqual(beforeShared.SENSITIVE_SPECIES,headShared.SENSITIVE_SPECIES);
assert.deepEqual(beforeShared.SENSITIVE_KEYWORDS,headShared.SENSITIVE_KEYWORDS);
const LF=String.fromCharCode(10),CR=String.fromCharCode(13),CRLF=CR+LF;
const classify=(module,raw,note='')=>module.isSensitiveReport({species:[raw],speciesText:raw,note});
const protection=[];
for(const name of headShared.SENSITIVE_SPECIES){
 for(const suffix of ['', '1',' 1',' 2마리','3개체']){
  const raw=name+suffix,before=classify(beforeShared,raw),after=classify(headShared,raw);
  assert.equal(after,true,raw);assert.equal(before,suffix==='');
  protection.push({kind:'protected_name_or_quantity',raw,before,after,changed:before!==after});
 }
 for(const separator of [',','/',LF,';']){
  const raw='참새'+separator+name+'1',before=classify(beforeShared,raw),after=classify(headShared,raw);
  assert.equal(before,false,raw);assert.equal(after,true,raw);
  protection.push({kind:'legacy_mixed_separator',raw,before,after,changed:true});
 }
}
const ordinary=['갈매기','괭이갈매기','검은머리갈매기','쇠제비갈매기2','알락오리','알락할미새','동박새','한국동박새','참새','참새1','참새 3마리','검은어깨매','붉은배새매','새매','매미새','참매미','올빼미과'];
const normalRows=ordinary.map(raw=>{const before=classify(beforeShared,raw),after=classify(headShared,raw);assert.equal(before,false,raw);assert.equal(after,false,raw);return {raw,before,after};});
const breeding=headShared.SENSITIVE_KEYWORDS.map(word=>{const before=classify(beforeShared,'참새',word+' 확인'),after=classify(headShared,'참새',word+' 확인');assert.equal(before,true);assert.equal(after,true);return {word,before,after};});
const ambiguous=['저어새 -1','저어새 1-3','저어새1.5','저어새?','저어새류','저 어 새','저어새(2)','저어새+1','저어새1e3','저어새 2마리 정도'].map(raw=>{
 const before=classify(beforeShared,raw),after=classify(headShared,raw);assert.equal(before,false);assert.equal(after,false);return {raw,before,after,scope:'Existing ambiguous-input S1-P design item; not an S1-R regression'};
});
const additional=['저어새0','저어새100001','저어새01','저어새 2 마리','저어새'.normalize('NFD')].map(raw=>{
 const before=classify(beforeShared,raw),after=classify(headShared,raw);assert.equal(after,true);return {raw,before,after,meaning:'Conservative protected-base detection; not a validated individual count or taxon write'};
});
function normalizeOutcome(module,raw){try{return {ok:true,names:module.normalizeSpecies(raw)};}catch(error){return {ok:false,error:error.code};}}
const normalizerRows=[
 ['lf','저어새'+LF+'참새',['저어새','참새']],
 ['crlf','저어새'+CRLF+'참새',['저어새','참새']],
 ['cr','저어새'+CR+'참새',['저어새','참새']],
 ['semicolon','참새;저어새1',['참새','저어새1']],
 ['middot','참새·저어새1',['참새','저어새1']],
 ['comma','참새,저어새1',['참새','저어새1']],
 ['new_slash_rejected','참새/저어새1',null],
 ['literal_backslash_n_rejected','저어새'+String.fromCharCode(92)+'n참새',null],
].map(([label,raw,expected])=>{
 const before=normalizeOutcome(beforeShared,raw),after=normalizeOutcome(headShared,raw);
 if(expected)assert.deepEqual(after.names,expected,label);else assert.equal(after.ok,false,label);
 return {label,raw,rawCodepoints:[...raw].map(c=>c.codePointAt(0)),before,after};
});
async function request(module,db,method,url,body){
 const response=await module.handleRequest(new Request('https://reports.example'+url,{method,headers:{...ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.1'},body:body===undefined?undefined:JSON.stringify(body)}),publicEnv(db));
 return {status:response.status,body:await response.json()};
}
const today=headShared.kstDateString(new Date());
const reportRow=(species,extra={})=>({id:'11111111-1111-4111-8111-111111111111',status:'approved',site_id:'19',species,lat:36,lon:126,observed_on:today,...extra});
const recentRows=[];
for(const raw of ['저어새','저어새1','저어새 1','저어새 2마리','저어새 2 마리','흰꼬리수리1','매1','참새,저어새1','참새/저어새1','참새'+LF+'저어새1','참새'+CRLF+'저어새1','참새;저어새1','저어새'.normalize('NFD'),'갈매기','알락오리','동박새','저어새 -1','저어새류']){
 const result={raw};
 for(const [version,module] of [['before',beforePublic],['after',headPublic]]){
  const db=fakeDb([reportRow(raw)]),initial=JSON.stringify(db.rows),got=await request(module,db,'GET','/reports/recent-sites');
  assert.equal(got.status,200);
  assert.equal(JSON.stringify(db.rows),initial);
  result[version]={included:got.body.sites.length>0,speciesStrings:got.body.sites.flatMap(s=>s.species),privateFields:got.body.sites.some(s=>Object.keys(s).some(k=>!['siteId','latestDate','species'].includes(k)))};
  assert.equal(result[version].privateFields,false);
 }
 assert.equal(result.after.included,!classify(headShared,raw));
 recentRows.push(result);
}
const reportsPost=[];
for(const raw of ['저어새','저어새1','저어새 2마리','참새'+LF+'저어새1','참새'+CRLF+'저어새1','참새/저어새','갈매기','알락오리','동박새']){
 const result={raw};
 for(const [version,module] of [['before',beforePublic],['after',headPublic]]){
  const db=fakeDb([]),got=await request(module,db,'POST','/reports',{species:raw,lat:36,lon:126,observedOn:today,turnstileToken:'local-mock'});
  result[version]={status:got.status,storedSpecies:db.rows[0]?.species??null,pendingPublic:db.rows[0]?.pending_public??null,publicVisibility:got.body.publicVisibility??null,spotReturned:!!got.body.spot,
   exactCoordinatesReturned:!!got.body.spot&&got.body.spot.lat===36&&got.body.spot.lon===126,error:got.body.error?.code??null};
 }
 reportsPost.push(result);
}
for(const raw of ['저어새1','저어새 2마리','참새'+LF+'저어새1','참새'+CRLF+'저어새1']){
 const row=reportsPost.find(x=>x.raw===raw);assert.equal(row.before.pendingPublic,1);assert.equal(row.after.pendingPublic,0);assert.equal(row.after.spotReturned,false);
}
for(const raw of ['갈매기','알락오리','동박새']){
 const row=reportsPost.find(x=>x.raw===raw);assert.equal(row.before.pendingPublic,1);assert.equal(row.after.pendingPublic,1);
}
const fieldPost=[];
for(const raw of ['저어새','저어새1','저어새 1','저어새 2마리','흰꼬리수리1','매1','갈매기','알락오리','동박새','저어새 -1']){
 const result={raw};
 for(const [version,module] of [['before',beforePublic],['after',headPublic]]){
  const db=fakeDb([]),got=await request(module,db,'POST','/field-updates',{species:raw,status:'visible',lat:36,lon:126,count:1,nickname:'합성',deviceId:'device-aaaaaaaaaaaaaaaa',turnstileToken:'local-mock'});
  assert.equal(got.status,201);
  const first=got.body.update,list1=await request(module,db,'GET','/field-updates'),list2=await request(module,db,'GET','/field-updates');
  assert.equal(list1.status,200);assert.equal(list2.status,200);
  assert.equal(first.lat,list1.body.updates[0].lat);assert.equal(first.lon,list1.body.updates[0].lon);
  assert.equal(first.lat,list2.body.updates[0].lat);assert.equal(first.lon,list2.body.updates[0].lon);
  result[version]={status:got.status,locationHidden:first.locationHidden===true,exactCoordinatesReturned:first.lat===36&&first.lon===126,stablePublicPoint:true,
   generalFlagDoesNotImplyBreeding:first.status==='visible'};
 }
 if(classify(headShared,raw)){assert.equal(result.after.locationHidden,true);assert.equal(result.after.exactCoordinatesReturned,false);}
 fieldPost.push(result);
}
const fieldBreeding=[];
for(const word of headShared.SENSITIVE_KEYWORDS){
 const got=await request(headPublic,fakeDb([]),'POST','/field-updates',{species:'참새',status:'visible',lat:36,lon:126,count:1,nickname:'합성',note:word+' 확인',deviceId:'device-aaaaaaaaaaaaaaaa',turnstileToken:'local-mock'});
 assert.equal(got.status,400);assert.equal(got.body.error.code,'FIELD_BREEDING_NOT_ALLOWED');fieldBreeding.push({word,status:got.status,error:got.body.error.code});
}
const adminRows=[];
for(const raw of ['저어새'+LF+'참새','저어새'+CRLF+'참새','참새/저어새']){
 const result={raw};
 for(const [version,module] of [['before',beforeAdmin],['after',headAdmin]]){
  try{const plan=await module.planAction(fakeDb([]),{action:'approve',species:raw},reportRow('참새'),{email:'synthetic@example.test'},new Date().toISOString());result[version]={ok:true,storedSpecies:plan.patch.species,status:plan.patch.status};}
  catch(error){result[version]={ok:false,error:error.code};}
 }
 adminRows.push(result);
}
const policyBoundary=[];
for(const [version,module] of [['before',beforePublic],['after',headPublic]]){
 const db=fakeDb([reportRow('저어새1')]),approved=await request(module,db,'GET','/reports/approved'),history=await request(module,db,'GET','/reports/site/19');
 policyBoundary.push({version,approvedReturnsSpecies:approved.body.spots.some(s=>s.species.includes('저어새1')),approvedUsesActualPoint:approved.body.spots.some(s=>s.lat===36&&s.lon===126),siteHistoryReturnsSpecies:history.body.history.some(h=>h.species.includes('저어새1')),siteHistoryTotal:history.body.total,scope:'Unchanged S1-P approval policy, not a newly introduced regression'});
}

const adminAuthenticatedCases=[];
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const kid='local-r123-admin',jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
localAdminJwks={keys:[{...jwk,kid,alg:'RS256'}]};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const signedHeader=encode({alg:'RS256',kid}),signedBody=encode({iss:'https://p1s-local-review.cloudflareaccess.com',aud:['local-aud'],email:'owner@synthetic.invalid',exp:Math.floor(Date.now()/1000)+600});
const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(signedHeader+'.'+signedBody));
const token=signedHeader+'.'+signedBody+'.'+Buffer.from(signature).toString('base64url');
async function adminCall(db,action,authenticated=true,extra={}){
 const response=await actualAdminHandler.handleRequest(new Request('https://admin.example/admin/api/reports/11111111-1111-4111-8111-111111111111',{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{'Cf-Access-Jwt-Assertion':token}:{})},body:JSON.stringify({action,...extra})}),{ENVIRONMENT:'production',REPORTS_DB:db,ACCESS_TEAM_DOMAIN:'p1s-local-review',ACCESS_AUD:'local-aud',ADMIN_EMAILS:'owner@synthetic.invalid'});
 return {status:response.status,body:await response.json()};
}
{
 const db=fakeDb([reportRow('참새')]),got=await adminCall(db,'unpublish',false);assert.equal(got.status,403);assert.equal(db.rows[0].status,'approved');
 adminAuthenticatedCases.push({name:'unauthenticated_unpublish_blocked',status:got.status,recordPreserved:true});
}
for(const action of ['unpublish','reject']){
 const db=fakeDb([reportRow('참새')]),got=await adminCall(db,action);assert.equal(got.status,200);assert.equal(db.rows[0].status,action==='unpublish'?'pending':'rejected');
 const publicRows=await request(headPublic,db,'GET','/reports/approved');assert.equal(publicRows.body.spots.length,0);
 adminAuthenticatedCases.push({name:action,status:got.status,approvedRemoved:true,recordPreserved:db.rows.length===1});
}
{
 const db=fakeDb([reportRow('참새',{status:'pending',pending_public:1,approx_lat:36,approx_lon:126})]),got=await adminCall(db,'visibility',true,{public:false});assert.equal(got.status,200);assert.equal(db.rows[0].pending_public,0);
 const publicRows=await request(headPublic,db,'GET','/reports/pending');assert.equal(publicRows.body.spots.length,0);
 adminAuthenticatedCases.push({name:'pending_visibility_withdraw',status:got.status,pendingRemoved:true,recordPreserved:true});
}
{
 const db=fakeDb([reportRow('참새')]),got=await adminCall(db,'delete-everything');assert.equal(got.status,400);assert.equal(db.rows.length,1);
 adminAuthenticatedCases.push({name:'no_permanent_delete_action',status:got.status,error:got.body.error?.code,recordPreserved:true});
}
const fieldOwnerDeleteCases=[];
{
 const db=fakeDb([]),device='device-local-owner-aaaaaaaa',created=await request(headPublic,db,'POST','/field-updates',{species:'참새',status:'visible',lat:36,lon:126,count:1,nickname:'합성',deviceId:device,turnstileToken:'local-mock'});assert.equal(created.status,201);const id=created.body.update.id;
 const denied=await request(headPublic,db,'POST','/field-updates/'+id+'/delete',{deviceId:'device-other-owner-bbbbbbb'});assert.equal(denied.status,403);
 const retained=await request(headPublic,db,'GET','/field-updates');assert.ok(retained.body.updates.some(row=>row.id===id));fieldOwnerDeleteCases.push({name:'other_device_delete_blocked',status:denied.status,recordRetained:true});
 const own=await request(headPublic,db,'POST','/field-updates/'+id+'/delete',{deviceId:device});assert.equal(own.status,200);fieldOwnerDeleteCases.push({name:'own_delete',status:own.status});
 const removed=await request(headPublic,db,'GET','/field-updates');assert.ok(!removed.body.updates.some(row=>row.id===id));fieldOwnerDeleteCases.push({name:'get_excludes_deleted',status:removed.status,removed:true});
 const again=await request(headPublic,db,'POST','/field-updates/'+id+'/delete',{deviceId:device});assert.equal(again.status,200);assert.equal(again.body.alreadyDeleted,true);fieldOwnerDeleteCases.push({name:'idempotent_owner_delete',status:again.status,alreadyDeleted:true});
}

const payload={schemaVersion:1,base,head,evaluationTime:now,sourceFiles,
 constraints:{localMemoryOnly:true,productionEndpointCalls:0,productionD1Access:0,sourceEdits:0,coordinateNumbersInResult:false,turnstile:'Bounded exact URL local fetch mock; no network',turnstileMockCalls:turnstileCalls},
 protectionCases:protection,ordinaryControls:normalRows,breedingCases:breeding,ambiguousCases:ambiguous,additionalCases:additional,normalizerCases:normalizerRows,recentSitesCases:recentRows,legacySubmitCases:reportsPost,fieldSubmitCases:fieldPost,fieldBreedingCases:fieldBreeding,adminPlanCases:adminRows,adminAuthenticatedCases,fieldOwnerDeleteCases,unchangedPolicyBoundary:policyBoundary,
 summary:{exactAndQuantityCases:95,legacyMixedCases:76,protectedRepresentationCases:protection.length,repairedProtectedRepresentationCases:protection.filter(x=>x.changed).length,ordinaryControls:normalRows.length,ordinaryFalsePositiveCount:normalRows.filter(x=>x.after).length,existingBreedingCases:breeding.length,
  recentApiCases:recentRows.length,legacySubmitCases:reportsPost.length,fieldSubmitCases:fieldPost.length,fieldBreedingCases:fieldBreeding.length,adminPlanCases:adminRows.length,adminAuthenticatedCases:adminAuthenticatedCases.length,fieldOwnerDeleteCases:fieldOwnerDeleteCases.length,allAssertionsPassed:true},
 interpretation:'S1-R closes represented exact-list count/delimiter gaps. Ambiguous-input/read-after-approval/canonical privacy are separately deferred S1-P. No production disclosure claim. Counts do not represent operational reports or biological occurrence.'};
fs.writeFileSync(path.join(out,'pr13_r123_s1.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({output:path.join(out,'pr13_r123_s1.json'),...payload.summary},null,2));
