/* Fixed-input P1-C: original bonus function + isolated policy hooks; no production writes. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {DOCS,sha256} from './recommendation_runtime.mjs';
import {loadP1C,SCENARIOS,physicalSignature} from './p1c_runtime.mjs';
import {select} from './p1b_policies.mjs';import {ordersFor,compact,metrics,count} from './p1b_experiment.mjs';
const rt=loadP1C(),orders=ordersFor(rt.sites),referenceApi=rt.makeScenario({reports:true,cap:16});
const referenceRows=rt.sites.map(site=>referenceApi.weeklyRecommendationForSite(site,referenceApi.weeklyInfo()));
const physical=new Map(rt.sites.map((s,i)=>[String(s.id),physicalSignature(referenceRows[i])]));
const baseline=compact(referenceApi,referenceApi.todayRecommendedSites());
const results=[];
for(const policy of SCENARIOS){
 const api=rt.makeScenario(policy),observed=new Map();api.setObserver((s,e)=>{observed.set(String(s.id),e);});
 const original=api.todayRecommendedSites(),rows=[...observed].filter(([,e])=>e&&api.weeklyRecommendationIsSafe(e)!==false).map(([,e])=>e);
 assert.equal(observed.size,190);assert.equal(rows.length,176);
 for(const [id,e] of observed)assert.equal(physicalSignature(e),physical.get(id),policy.id+' physical '+id);
 rows.forEach(e=>e.stableOrder=rt.sites.findIndex(s=>s.id===e.site.id));
 const safeRows=rows;assert.ok(safeRows.every(e=>api.weeklyRecommendationIsSafe(e)===true));
 const stable=select(api,rt,safeRows,'A1'),stableTop=compact(api,stable),originalTop=compact(api,original);
 api.setSelector(e=>select(api,rt,e,'A1'));let fullChecks=0;
 for(const order of [rt.sites,orders[0],orders[999]]){api.setSites(order);assert.deepEqual(compact(api,api.todayRecommendedSites()),stableTop);fullChecks++;}
 const trials=[];
 for(const order of orders){
  const positions=new Map(order.map((s,i)=>[String(s.id),i]));
  const e=safeRows.map(x=>({...x,stableOrder:positions.get(String(x.site.id))}));
  const selected=api.autumnBalancedRecommendations(e);
  trials.push({ids:selected.map(x=>String(x.site.id)),axes:selected.map(x=>x.selectedAxis)});
 }
 const bonusRows=safeRows.filter(e=>e.recentReport).map(e=>({id:String(e.site.id),name:e.site.name,raw:e.score,rank:api.weeklyRankScore(e),
  display:api.v251EffectiveScore(e.today),date:e.recommendationDate,time:e.recommendationTime,
  ageDays:e.recentReport.ageDays,latestDate:e.recentReport.latestDate,literalSpeciesCount:e.recentReport.speciesCount,bonus:e.recentReport.bonus}));
 const m=metrics(rt,trials,originalTop,safeRows);
 results.push({policy,candidateCount:safeRows.length,physicalCandidateSignaturesUnchanged:true,selectedSafe:stable.every(e=>api.weeklyRecommendationIsSafe(e)===true),
 originalTop10:originalTop,stableIdTop10:stableTop,changesVsCap16:10-stableTop.filter(e=>baseline.some(b=>b.id===e.id)).length,
 bonusRows,rankDistribution:count(safeRows.map(e=>api.weeklyRankScore(e))),bonusTotal:bonusRows.reduce((a,e)=>a+e.bonus,0),
 arrayControl:{runs:1000,membershipChangeRate:m.membershipChangeRate,orderChangeRate:m.orderChangeRate,meanReplaced:m.meanReplaced,
  distinctSelected:m.distinctSelected,stableIdPermutationInvariant:true,stableFullChecks:fullChecks},
 idsSha256:sha256(JSON.stringify(trials.map(t=>t.ids))),all190:[...observed].map(([id,e])=>({id,candidate:!!e,gate:e?api.weeklyRecommendationIsSafe(e):null,
 raw:e?.score??null,rank:e?api.weeklyRankScore(e):null,display:e?api.v251EffectiveScore(e.today):null,report:e?.recentReport||null}))});
}
const literalAudit=rt.reports.sites.map(item=>{
 const literal=[...new Set(item.species.filter(Boolean))],removeSuffix=literal.map(x=>x.replace(/\s*\d+$/u,'').trim());
 const groups=count(removeSuffix);return{id:item.siteId,latestDate:item.latestDate,literalCount:literal.length,
 literalDuplicates:item.species.length-literal.length,numericSuffixTokens:literal.filter(x=>/\d+$/u.test(x)),
 diagnosticOnlySuffixCollapsedCount:new Set(removeSuffix).size,diagnosticCollisionGroups:Object.entries(groups).filter(([,n])=>n>1).map(([token,n])=>({token,strings:n}))};
});
const payload={schemaVersion:1,codeCommit:rt.manifest.codeCommit,evaluationTime:rt.manifest.evaluationTime,inputManifest:rt.manifest,
 initialCheckpoint:'8bd44e3',functionSourceSha256:rt.functionsHash,
 method:'Actual 190-candidate pipeline per policy; A1 3 full pipeline orders per policy; source autumn selector1000 cached-candidate orders per policy. Physical signatures identical.',
 inputMissing:['species observation dates','independent observer identity/count','effort duration/distance','complete checklist','per-species row membership'],
 speciesAudit:literalAudit,results,limits:['Cap values are sensitivity scenarios, not ecologically calibrated weights.',
 'maxLatestAge7 filters whole site aggregate by latestDate; it cannot reconstruct an actual days=7 species union.',
 'visit date recalculates site-level latestDate age only; not each species persistence.',
 'Suffix collapse is a diagnostic string collision count, not verified taxonomy normalization.']};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(DOCS,'_results/p1c_reports.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({results:results.map(r=>({policy:r.policy.id,bonus:r.bonusTotal,top:r.stableIdTop10.map(e=>e.id),change:r.changesVsCap16,array:r.arrayControl})),speciesAudit:literalAudit},null,2));
