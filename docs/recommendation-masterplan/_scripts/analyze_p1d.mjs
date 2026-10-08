/* P1-D fixed candidate/score quota sensitivity analysis. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {DOCS,sha256} from './recommendation_runtime.mjs';import {loadP1C,physicalSignature} from './p1c_runtime.mjs';
import {ordersFor,compact,count} from './p1b_experiment.mjs';import {POLICIES,selectQuota,axis} from './p1d_policies.mjs';
const rt=loadP1C(),orders=ordersFor(rt.sites),results=[];
const ids=list=>list.map(e=>String(e.site.id));
function summary(api,selected){
 const group=f=>count(selected.map(f)),region=group(e=>e.site.sido),rule=group(e=>rt.canonical(e.site));
 const hhi=d=>Object.values(d).reduce((a,n)=>a+(n/selected.length)**2,0);
 return{rankSum:selected.reduce((a,e)=>a+api.weeklyRankScore(e),0),rawSum:selected.reduce((a,e)=>a+e.score,0),
 displaySum:selected.reduce((a,e)=>a+api.v251EffectiveScore(e.today),0),bonusSum:selected.reduce((a,e)=>a+(e.recentReport?.bonus||0),0),
 pickPhases:group(e=>e.selectedAxis),primaryAxes:group(axis),regions:region,canonicalRules:rule,
 env:group(e=>e.site.env),habitatType:group(e=>e.site.habitatType),mainBirdGroup:group(e=>e.site.mainBirdGroup),
 regionCategories:Object.keys(region).length,ruleCategories:Object.keys(rule).length,regionHHI:hhi(region),ruleHHI:hhi(rule)};
}
for(const reports of [true,false]){
 const api=rt.makeScenario({reports,cap:16}),observed=new Map();api.setObserver((s,e)=>observed.set(String(s.id),e));
 const actual=api.todayRecommendedSites();assert.equal(observed.size,190);
 const entries=[...observed.values()].filter(e=>e&&api.weeklyRecommendationIsSafe(e)!==false);
 entries.forEach(e=>e.stableOrder=rt.sites.findIndex(s=>s.id===e.site.id));
 assert.equal(entries.length,176);assert.ok(entries.every(e=>api.weeklyRecommendationIsSafe(e)===true));
 const originals=new Map([...observed].map(([k,e])=>[k,physicalSignature(e)]));
 const current=selectQuota(api,rt,entries,'current_4312');assert.deepEqual(compact(api,current),compact(api,actual));
 const scoreOrder=(a,b)=>api.weeklyRankScore(b)-api.weeklyRankScore(a)||Number(a.site.id)-Number(b.site.id);
 const land=entries.filter(e=>!e.axes.pelagic).sort(scoreOrder),boat=entries.filter(e=>e.axes.pelagic).sort(scoreOrder);
 const options=[land.slice(0,10),...(boat.length?[[...land.slice(0,9),boat[0]]]:[])],rankSum=list=>list.reduce((a,e)=>a+api.weeklyRankScore(e),0);
 const maximum=Math.max(...options.map(rankSum));const currentIds=ids(current),policies=[];
 for(const policy of POLICIES){
  const trace=[],selected=selectQuota(api,rt,entries,policy,trace),base=ids(selected);
  assert.equal(selected.length,10);assert.equal(new Set(base).size,10);assert.ok(selected.every(e=>api.weeklyRecommendationIsSafe(e)===true));
  assert.ok(selected.filter(e=>e.axes.pelagic).length<=1);
  const m=summary(api,selected);if(policy==='global_rank')assert.equal(m.rankSum,maximum);
  let changes=0;for(const order of orders){const positions=new Map(order.map((s,i)=>[String(s.id),i]));
   const shuffled=entries.map(e=>({...e,stableOrder:positions.get(String(e.site.id))})).sort((a,b)=>a.stableOrder-b.stableOrder);
   if(JSON.stringify(ids(selectQuota(api,rt,shuffled,policy)))!==JSON.stringify(base))changes++;
  }assert.equal(changes,0);
  api.setSelector(e=>selectQuota(api,rt,e,policy));
  for(const order of [rt.sites,orders[0],orders[999]]){api.setSites(order);observed.clear();
   const full=api.todayRecommendedSites();assert.deepEqual(compact(api,full),compact(api,selected));assert.equal(observed.size,190);
   for(const[k,e]of observed)assert.equal(physicalSignature(e),originals.get(k));
  }
  api.setSites(rt.sites);
  const all190=rt.sites.map(site=>{
   const e=api.weeklyRecommendationForSite(site,api.weeklyInfo());let reason='selected',stage='selection';
   if(!e){stage='candidate';if(!api.weeklyMudflatTideGateOpen(site,api.weeklyInfo()))reason='required_tide_gate_not_met';
    else if(!api.weeklyInfo().dates.some(d=>api.weeklyDatePolicy(site,d)))reason='no_season_habitat_policy';
    else if(!api.weeklySeasonalBestWeatherDay(site,api.weeklyInfo()))reason='no_eligible_seasonal_daylight_sample';
    else reason='candidate_returned_null_other';
   }else if(api.weeklyRecommendationIsSafe(e)===false){stage='safety';reason='weather_gate_false';}
   else if(!base.includes(String(site.id)))reason='eligible_not_selected_by_policy';
   return{id:String(site.id),name:site.name,sido:site.sido,canonicalRule:rt.canonical(site),env:site.env,habitatType:site.habitatType,mainBirdGroup:site.mainBirdGroup,
    stage,reason,season:e?.season||null,axes:e?.axes||null,priority:e?.priority??null,isMandatory:e?.isMandatory??null,
    raw:e?.score??null,display:e?api.v251EffectiveScore(e.today):null,rank:e?api.weeklyRankScore(e):null,
    candidate:!!e,gate:e?api.weeklyRecommendationIsSafe(e):null,selected:base.includes(String(site.id)),
    inCurrent:currentIds.includes(String(site.id)),currentNotSelectedButThisPolicy:!!e&&!currentIds.includes(String(site.id))&&base.includes(String(site.id))};
  });
  const tide=selected.filter(e=>e.tideMatched).map(e=>{const t=api.weeklyBestMudflatTide(e.site,api.weeklyInfo()),gap=Math.abs(api.weeklySampleMinutes(t.sample)-t.minutes);assert.ok(gap<=90);return{id:String(e.site.id),gapMinutes:gap,date:t.date};});
  policies.push({policy,top10:compact(api,selected).map((e,i)=>({...e,primaryAxis:axis(selected[i]),sido:selected[i].site.sido,canonicalRule:rt.canonical(selected[i].site)})),
   summary:m,rankSumUpperBound:maximum,rankSumGap:maximum-m.rankSum,changesVsCurrent:10-base.filter(id=>currentIds.includes(id)).length,
   enteredVsCurrent:base.filter(id=>!currentIds.includes(id)),removedVsCurrent:currentIds.filter(id=>!base.includes(id)),trace,
   permutationStability:{runs:1000,orderedListChanges:changes,rate:changes/1000},fullPipelineChecks:3,
   candidatePhysicalFieldsUnchanged:true,tideEvidence:tide,selectedAllGateTrue:true,shipAtMost1:true,
   exclusionCounts:count(all190.map(e=>e.reason)),all190});
 }
 const [quota,flex]=['quota_only_2211','flex_2211'].map(p=>policies.find(r=>r.policy===p));
 results.push({reports,candidateCount:entries.length,rawCandidateDistribution:count(entries.map(e=>e.score)),rankCandidateDistribution:count(entries.map(e=>api.weeklyRankScore(e))),
  candidateSeasons:count(entries.map(e=>e.season)),candidateRegions:count(entries.map(e=>e.site.sido)),candidateCanonicalRules:count(entries.map(e=>rt.canonical(e.site))),registeredRegions:count(rt.sites.map(s=>s.sido)),registeredCanonicalRules:count(rt.sites.map(rt.canonical)),candidatePrimaryAxes:count(entries.map(axis)),
  candidateAxisMembership:Object.fromEntries(['field','mudflat','pelagic','other'].map(k=>[k,entries.filter(e=>k==='other'?axis(e)==='other':!!e.axes[k]&&(k==='pelagic'||!e.axes.pelagic)).length])),
  secondaryAxisOverlap:entries.filter(e=>e.axes.field&&e.axes.mudflat).map(e=>String(e.site.id)),
  registered:rt.sites.length,domestic:rt.sites.filter(s=>s.sido!=='중국').length,
  policies,quotaVsFlexSameFloors:{membershipChanges:10-quota.top10.filter(e=>flex.top10.some(b=>b.id===e.id)).length,
   orderedSame:JSON.stringify(quota.top10.map(e=>e.id))===JSON.stringify(flex.top10.map(e=>e.id))},
  numericalUpperBoundProof:{objective:'sum of existing internal rankScore only; no ecological utility claim',maxShip:1,options:options.map(e=>({ids:ids(e),rankSum:rankSum(e)})),maximum}});
}
const report={schemaVersion:1,codeCommit:rt.manifest.codeCommit,evaluationTime:rt.manifest.evaluationTime,
 inputManifest:rt.manifest,reportSha256:rt.manifest.recentSites.sha256,functionSourceSha256:rt.functionsHash,previousCheckpoint:'7447c38102c1832a944d5cf4281ae6ebd3b485b0',
 policies:{current_4312:'Original axis comparators and4/3/1/2 with A1 suffix, source fill comparator.',
 global_rank:'All safe candidates by rank DESC,recent tie,date ASC,ID ASC; ship at most1. This also removes priority/core/axis staging.',
 flex_1111:'Original prefix floors1/1/1/1 then global_rank fill; quotas are design hypotheses.',
 flex_2211:'Original prefix floors2/2/1/1 then global_rank fill; quotas are design hypotheses.',
 quota_only_2211:'Original prefix floors2/2/1/1 then source fill comparator; controls for quota-only intervention.'},
 method:'Actual 190 candidate pipeline ON/OFF; same fixed pool/scores; 1000 cached-candidate permutations per policy/scenario, three full actual pipelines per policy/scenario.',
 limits:['The global difference is a joint quota/comparator change, not pure causal quota effect.','No ecological occurrence probability or new score was generated.','Quota axes, canonical weather rule and habitat/env/birdgroup are different labels.','No region floor; categories use original sido including compound/overseas labels.','Only one forecast/report snapshot, not interday/seasonal stability.','Gate true means existing rule pass, not comprehensive field safety.'],results};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(DOCS,'_results/p1d_quotas.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({reports:r.reports,candidates:r.candidateCount,seasons:r.candidateSeasons,axes:r.candidatePrimaryAxes,overlap:r.secondaryAxisOverlap,
 policies:r.policies.map(p=>({policy:p.policy,ids:p.top10.map(e=>e.id),summary:p.summary,gap:p.rankSumGap,changed:p.changesVsCurrent,exclusion:p.exclusionCounts}))})),null,2));
