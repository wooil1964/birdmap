/* P1-D original selection-contract audit. Analysis only; no operating mutations. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_results'));
const prior=Number(process.env.GIT_CONFIG_COUNT||0);process.env.GIT_CONFIG_COUNT=String(prior+1);process.env['GIT_CONFIG_KEY_'+prior]='safe.directory';process.env['GIT_CONFIG_VALUE_'+prior]=repo;
const {loadRuntime}=await import(pathToFileURL(path.join(repo,'docs/recommendation-masterplan/_scripts/recommendation_runtime.mjs')));
const MANIFEST='docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json',rt=loadRuntime(MANIFEST);
const sha=b=>createHash('sha256').update(b).digest('hex');
const count=values=>values.reduce((o,k)=>(o[k]=(o[k]||0)+1,o),{});
const axisKey=a=>['field','mudflat','pelagic'].filter(k=>a[k]).join('+')||'other';
function describe(site){return{id:String(site.id),name:site.name,country:site.country,sido:site.sido,region:site.region,canonicalRule:rt.canonical(site),env:site.env,habitatType:site.habitatType};}
const actualResults=[true,false].map(reports=>{
 const api=rt.makeApi(reports),week=api.weeklyInfo();
 const rows=rt.sites.map((site,stableOrder)=>{
  const e=api.weeklyRecommendationForSite(site,week);if(e){e.stableOrder=stableOrder;return{...describe(site),candidate:true,entry:e,axes:e.axes,season:e.season,safe:api.weeklyRecommendationIsSafe(e)};}
  const tideGate=api.weeklyMudflatTideGateOpen(site,week);
  const dates=week.dates.map(date=>{const policy=api.weeklyDatePolicy(site,date);return{date,policyAllowed:!!policy,remoteExcluded:api.todayIsAutumnRemoteIsland(site,api.weeklyMonthForDate(date)),daylightEligible:api.weeklyDaylightCandidates(site,date).length};});
  const axes=api.autumnBirdingAxes(site);
  let reason=tideGate===false?'tide_gate_closed':dates.every(d=>d.remoteExcluded)?'autumn_remote_island_name_policy':site.pelagic===true&&!axes.pelagic?'registered_pelagic_excluded_by_autumn_axis_policy':'unresolved';
  assert.notEqual(reason,'unresolved');
  return{...describe(site),candidate:false,axes,reason,tideGate,dateEvidence:dates,qualifyingTides:reason==='tide_gate_closed'?(api.weeklyQualifyingHighTides(site,week)||[]).map(t=>({date:t.date,time:t.time,level:t.level})):undefined};
 });
 const candidate=rows.filter(r=>r.candidate);assert.equal(candidate.length,176);
 assert.ok(candidate.every(r=>r.season==='autumn'&&r.safe===true));
 const top=api.todayRecommendedSites();
 assert.ok(top.every(e=>candidate.some(r=>r.id===String(e.site.id))));
 const controlled=api.autumnBalancedRecommendations(candidate.map(r=>({...r.entry,stableOrder:Number(r.id)})));
 assert.deepEqual(controlled.map(e=>String(e.site.id)),top.map(e=>String(e.site.id)),'stable-ID control equals present source order');
 const safeById=Object.fromEntries(candidate.map(r=>[r.id,r.entry]));
 const topRows=top.map((e,i)=>{
  const base=safeById[String(e.site.id)];assert.equal(e.score,base.score);assert.equal(e.rankScore,base.rankScore);
  let tideGap=null;if(e.tideMatched){const matches=api.weeklyUsableHighTides(e.site,week).filter(t=>t.date===e.recommendationDate&&t.sample?.forecastTime===e.sample?.forecastTime);assert.ok(matches.length);tideGap=Math.min(...matches.map(t=>Math.abs(api.weeklySampleMinutes(e.sample)-t.minutes)));assert.ok(tideGap<=90);}
  if(e.axes.pelagic)assert.equal(api.weeklyPelagicSafety(e.sample),true);
  return{...describe(e.site),position:i+1,axes:e.axes,selectedAxis:e.selectedAxis,rawScore:e.score,displayScore:api.v251EffectiveScore(e.today),rankScore:e.rankScore,bonus:e.recentReport?.bonus||0,date:e.recommendationDate,time:e.recommendationTime,tideGap,safe:api.weeklyRecommendationIsSafe(e)};
 });
 return{reports,rows:rows.map(({entry,...r})=>r),registered:rt.sites.length,candidateCount:candidate.length,excludedCount:rows.length-candidate.length,candidateSeasonCounts:count(candidate.map(r=>r.season)),safeCounts:count(candidate.map(r=>String(r.safe))),axisCombinationCounts:count(candidate.map(r=>axisKey(r.axes))),axisMembershipCounts:Object.fromEntries(['field','mudflat','pelagic'].map(k=>[k,candidate.filter(r=>r.axes[k]).length])),canonicalCounts:count(candidate.map(r=>r.canonicalRule)),envCounts:count(candidate.map(r=>String(r.env))),habitatCounts:count(candidate.map(r=>String(r.habitatType))),rawSidoCounts:count(candidate.map(r=>String(r.sido))),excludedReasonCounts:count(rows.filter(r=>!r.candidate).map(r=>r.reason)),top:topRows};
});
assert.deepEqual(actualResults[0].rows.map(r=>[r.id,r.candidate,r.axes,r.season,r.safe,r.reason]),actualResults[1].rows.map(r=>[r.id,r.candidate,r.axes,r.season,r.safe,r.reason]));
const api=rt.makeApi(true);
function entry(id,axis,score=92,more={}){
 const axes={field:false,mudflat:false,pelagic:false};if(axis!=='other')axes[axis]=true;
 return{site:{id:String(id),name:'synthetic '+id},axes,score,rankScore:score,priority:4,isMandatory:false,recommendationDate:'2026-10-10',season:'autumn',stableOrder:Number(id),...more};
}
const checks=[];
function test(name,entries,verify){
 const saved=JSON.stringify(entries),top=api.autumnBalancedRecommendations(entries);
 assert.equal(JSON.stringify(entries),saved);assert.ok(top.length<=10);assert.equal(new Set(top.map(e=>String(e.site.id))).size,top.length);assert.ok(top.filter(e=>e.axes.pelagic).length<=1);
 verify(top);checks.push({name,passed:true,inputCount:entries.length,top:top.map(e=>({id:String(e.site.id),axis:e.selectedAxis,raw:e.score,rank:e.rankScore,season:e.season,mandatory:e.isMandatory})),selectedAxisCounts:count(top.map(e=>e.selectedAxis)),inputUnchanged:true});
}
const fields=[1,2,3,4,5].map(i=>entry(i,'field')),muds=[10,11,12,13].map(i=>entry(i,'mudflat',90)),ships=[20,21].map(i=>entry(i,'pelagic',90)),others=[30,31,32,33].map(i=>entry(i,'other',89));
test('current 4/3/1/2 when all axis pools available',[...fields,...muds,...ships,...others],top=>assert.deepEqual(count(top.map(e=>e.selectedAxis)),{field:4,mudflat:3,pelagic:1,other:2}));
test('shortage filled by all entries; no mandatory ship slot',[entry(1,'field'),...Array.from({length:15},(_,i)=>entry(30+i,'other'))],top=>assert.deepEqual(count(top.map(e=>e.selectedAxis)),{field:1,other:2,fill:7}));
test('only two entries returns two entries',[entry(30,'other'),entry(31,'other')],top=>assert.equal(top.length,2));
test('all-pelagic pool caps at one across fill',ships,top=>assert.equal(top.length,1));
test('mixed-season high-score excluded from full autumn quota',[...fields,...muds,...ships,...others,entry(900,'other',99,{season:'winter'})],top=>assert.equal(top.some(e=>e.site.id==='900'),false));
test('mixed-season high-score admitted only in shortage fill',[entry(1,'field',80),entry(900,'other',99,{season:'winter'}),entry(901,'other',98,{season:'winter'})],top=>{assert.equal(top.length,3);assert.ok(top.filter(e=>e.season==='winter').every(e=>e.selectedAxis==='fill'));});
test('missing-season compatibility participates in quota',[entry(30,'other',99,{season:undefined})],top=>assert.equal(top[0].selectedAxis,'other'));
test('same ID in separate axis entries consumes one slot',[...fields,{...entry(1,'mudflat',99)},...muds,...ships,...others],top=>{assert.equal(top.length,10);assert.equal(top.filter(e=>e.site.id==='1').length,1);});
test('compound axes have disjoint selected slots',[...fields.map(e=>({...e,axes:{...e.axes,mudflat:true}})),...muds,...ships,...others],top=>{assert.equal(top.filter(e=>e.selectedAxis==='field').length,4);assert.equal(top.filter(e=>e.selectedAxis==='mudflat').length,3);assert.equal(top.filter(e=>e.axes.field).length,5);assert.equal(top.filter(e=>e.axes.mudflat).length,7);});
test('mandatory priority can outrank score within other quota',[entry(30,'other',92,{priority:1,isMandatory:true}),entry(31,'other',100),entry(32,'other',99),...fields,...muds,...ships],top=>{assert.ok(top.some(e=>e.site.id==='30'));assert.equal(top.some(e=>e.site.id==='32'),false);});
const unsafeDirect=entry(999,'other',100,{today:{rain:'3시간 강수 1.0mm',wave:'2.0m'},sample:{precipitation3h:1,waveM:2}});
const direct=api.autumnBalancedRecommendations([unsafeDirect]);assert.equal(direct.length,1);assert.equal(api.weeklyRecommendationIsSafe(direct[0]),false);
const result={schemaVersion:1,codeCommit:rt.manifest.codeCommit,evaluationTime:rt.manifest.evaluationTime,manifest:MANIFEST,functionsSha256:rt.functionsHash,sourceContractHashes:Object.fromEntries(['weeklySeasonQuotaEntries','autumnBalancedRecommendations','autumnFieldRank','weeklyDatePolicy','weeklyRecommendationForSite','todayRecommendedSites'].map(n=>[n,sha(rt.source(n))])),scope:'Read-only immutable source audit. Synthetic selector entries test structure, not ecological likelihood or weather safety. Fixed input actual candidates test original pipeline. No coordinate output or production writes.',actualResults,syntheticChecks:checks,syntheticPassed:checks.length,syntheticFailed:0,selectorSafetyBoundary:{directUnsafeEntrySelected:true,directInputSafeState:false,interpretation:'The pure selector does not implement safety filtering; todayRecommendedSites filters weeklyRecommendationIsSafe===false before invoking selector. D alternatives must receive same prefiltered candidate set.'},existingRelatedTests:['soft target은 4/3/1/2, 복합형 dedupe와 mandatory 독점 방지','들판/갯벌/선상 부족 시 다른 유형으로 채우며 선상 0 허용','최종 선발 전 caution 제외 후 같은 축 보충, 점수 하한선 없음'],cautions:['SelectedAxis slots are mutually exclusive allocations; raw axes can overlap.','Canonical weatherRuleKey groups, env/habitat text, and recommendation axes describe different things.','All fixed candidate seasons are autumn, so mixed-season behavior is demonstrated only with synthetic selector entries.','Global score alternatives alter comparator priorities as well as quotas unless separately controlled.','Region fields can be compound and are not normalized administrative units.']};

const rootResultPath=path.join(repo,'docs/recommendation-masterplan/_results/p1d_quotas.json');
if(fs.existsSync(rootResultPath)){
 const rootBytes=fs.readFileSync(rootResultPath),rootResult=JSON.parse(rootBytes),policyChecks=[];
 assert.equal(rootResult.codeCommit,rt.manifest.codeCommit);assert.equal(rootResult.evaluationTime,rt.manifest.evaluationTime);
 assert.equal(rootResult.reportSha256,rt.manifest.recentSites.sha256);assert.equal(rootResult.functionSourceSha256,rt.functionsHash);
 const primary=e=>e.axes.pelagic?'pelagic':e.axes.field?'field':e.axes.mudflat?'mudflat':'other';
 const sumField=(list,f)=>list.reduce((sum,e)=>sum+f(e),0);
 for(const result of rootResult.results){
  const original=actualResults.find(r=>r.reports===result.reports),api=rt.makeApi(result.reports),week=api.weeklyInfo();
  const candidates=rt.sites.map(site=>api.weeklyRecommendationForSite(site,week)).filter(e=>e&&api.weeklyRecommendationIsSafe(e)!==false);
  const byId=new Map(candidates.map(e=>[String(e.site.id),e]));
  assert.equal(result.candidateCount,candidates.length);
  assert.deepEqual(result.candidateCanonicalRules,original.canonicalCounts);assert.deepEqual(result.candidateRegions,original.rawSidoCounts);
  assert.deepEqual(result.candidatePrimaryAxes,count(candidates.map(primary)));
  assert.deepEqual(result.candidateAxisMembership,{...original.axisMembershipCounts,other:original.axisCombinationCounts.other});
  for(const policy of result.policies){
   assert.equal(policy.top10.length,10);assert.equal(new Set(policy.top10.map(r=>r.id)).size,10);
   const entries=policy.top10.map(row=>{
    const e=byId.get(row.id);assert.ok(e,row.id+' candidate');assert.equal(api.weeklyRecommendationIsSafe(e),true);
    assert.equal(row.raw,e.score);assert.equal(row.display,api.v251EffectiveScore(e.today));assert.equal(row.rank,api.weeklyRankScore(e));
    assert.equal(row.bonus,e.recentReport?.bonus||0);assert.equal(row.date,e.recommendationDate);assert.equal(row.time,e.recommendationTime);
    assert.equal(row.primaryAxis,primary(e));assert.equal(row.canonicalRule,rt.canonical(e.site));assert.equal(row.sido,e.site.sido);
    if(e.axes.pelagic)assert.equal(api.weeklyPelagicSafety(e.sample),true);
    return e;
   });
   assert.ok(entries.filter(e=>e.axes.pelagic).length<=1);
   const group=f=>count(entries.map(f)),phases=count(policy.top10.map(e=>e.axis));
   assert.deepEqual(policy.summary.pickPhases,phases);assert.deepEqual(policy.summary.primaryAxes,group(primary));
   assert.deepEqual(policy.summary.regions,group(e=>e.site.sido));assert.deepEqual(policy.summary.canonicalRules,group(e=>rt.canonical(e.site)));
   assert.deepEqual(policy.summary.env,group(e=>e.site.env));assert.deepEqual(policy.summary.habitatType,group(e=>e.site.habitatType));
   assert.deepEqual(policy.summary.mainBirdGroup,group(e=>e.site.mainBirdGroup));
   assert.equal(policy.summary.rankSum,sumField(entries,e=>api.weeklyRankScore(e)));assert.equal(policy.summary.rawSum,sumField(entries,e=>e.score));
   assert.equal(policy.summary.displaySum,sumField(entries,e=>api.v251EffectiveScore(e.today)));assert.equal(policy.summary.bonusSum,sumField(entries,e=>e.recentReport?.bonus||0));
   const tidal=entries.filter(e=>e.tideMatched).map(e=>{
    const t=api.weeklyBestMudflatTide(e.site,week),gap=Math.abs(api.weeklySampleMinutes(e.sample)-t.minutes);assert.ok(gap<=90);
    return{id:String(e.site.id),gapMinutes:gap,date:t.date};
   });assert.deepEqual(policy.tideEvidence,tidal);
   assert.equal(policy.all190.filter(r=>r.candidate).length,176);
   assert.equal(policy.all190.filter(r=>!r.candidate).length,14);
   assert.ok(policy.all190.filter(r=>r.candidate).every(r=>r.gate===true&&r.season==='autumn'));
   if(policy.policy==='current_4312'){
    assert.deepEqual(policy.top10.map(row=>({id:row.id,raw:row.raw,rank:row.rank,date:row.date,time:row.time,axis:row.axis})),original.top.map(row=>({id:row.id,raw:row.rawScore,rank:row.rankScore,date:row.date,time:row.time,axis:row.selectedAxis})));
   }
   policyChecks.push({reports:result.reports,policy:policy.policy,candidatesIdentical:true,scoreDateTimeUnchanged:true,safeAllTrue:true,shipCount:entries.filter(e=>e.axes.pelagic).length,tideEvidenceExact:true,rawAxisCanonicalHabitatRegionGroupsExact:true,rankSum:policy.summary.rankSum,rankGap:policy.rankSumGap,regionCategories:policy.summary.regionCategories,canonicalCategories:policy.summary.ruleCategories});
  }
 }
 result.rootResultsCrosscheck={path:'docs/recommendation-masterplan/_results/p1d_quotas.json',sha256:sha(rootBytes),policies:policyChecks.length,allPassed:true,checks:policyChecks};
}

fs.writeFileSync(path.join(out,'p1d_contract_audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({actual:actualResults.map(r=>({reports:r.reports,candidate:r.candidateCount,excluded:r.excludedReasonCounts,season:r.candidateSeasonCounts,safe:r.safeCounts,axes:r.axisMembershipCounts,axisCombination:r.axisCombinationCounts,top:r.top.map(t=>t.id)})),syntheticPassed:checks.length,selectorSafetyBoundary:result.selectorSafetyBoundary},null,2));
