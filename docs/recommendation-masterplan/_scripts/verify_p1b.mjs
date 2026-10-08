/* Compare every trial/frequency/policy against an independently written tuple selector. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {loadRuntime,DOCS,sha256} from './recommendation_runtime.mjs';
const read=f=>JSON.parse(fs.readFileSync(path.join(DOCS,'_results',f)));
const rt=loadRuntime('docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json');
const independent=read('p1b_independent_selector.json'),alternatives=read('p1b_alternatives.json'),weather=read('weather_comparison_p1b_2240.json');
const results=[];
for(const [label,reports] of [['on',true],['off',false]]){
 const actual=read('p1b_permutations_'+label+'.json'),ind=independent.results.find(r=>r.pin==='35141c0'&&r.reports===reports),alt=alternatives.results.find(r=>r.reports===reports);
 assert.equal(actual.completed,true);assert.equal(actual.trials.length,1000);assert.equal(actual.candidateCount,176);
 assert.deepEqual(actual.trials.map(t=>t.ids),ind.selectionArrays);assert.deepEqual(actual.trials,alt.cachedOriginalTrials);
 for(const row of actual.summary.selectionFrequency)assert.equal(row.times,ind.selectionCount[row.id],row.id+' independent frequency');
 const hash=sha256(JSON.stringify(actual.trials.map(t=>t.ids)));assert.equal(hash,ind.selectionArraysSha256);
 const oldInd=independent.results.find(r=>r.pin.startsWith('1f0b0b5')&&r.reports===reports);assert.deepEqual(ind.selectionArrays,oldInd.selectionArrays);
 for(const policy of alt.alternatives){
  const expected=ind.alternatives[{A1:'id',A2:'conditions',A3:'diversity'}[policy.policy]];
  assert.deepEqual(policy.top10.map(t=>t.id),expected.map(e=>e.id));
  assert.equal(policy.summary.membershipChangeRate,0);assert.equal(policy.summary.orderChangeRate,0);
 }
 const api=rt.makeApi(reports),entries=rt.sites.map(s=>api.weeklyRecommendationForSite(s,api.weeklyInfo())).filter(Boolean),byId=new Map(entries.map(e=>[String(e.site.id),e]));
 const tideEvidence=entries.filter(e=>e.tideMatched).map(e=>{const t=api.weeklyBestMudflatTide(e.site,api.weeklyInfo());assert.ok(t&&t.sample);const gap=Math.abs(api.weeklySampleMinutes(t.sample)-t.minutes);assert.ok(gap<=90);return {id:String(e.site.id),date:t.date,tideMinutes:t.minutes,forecast:t.sample.forecastTime,gapMinutes:gap};});
 const displays={},raws={},ranks={},byEnv={},byHabitat={},byBirdGroup={};let tideChecked=0,pelagicChecked=0,cappedSlots=0;
 const increment=(obj,k)=>{obj[String(k)]=(obj[String(k)]||0)+1;};
 for(const trial of actual.trials)for(const id of trial.ids){
  const e=byId.get(id);assert.ok(e);assert.equal(api.weeklyRecommendationIsSafe(e),true);
  increment(displays,api.v251EffectiveScore(e.today));increment(raws,e.score);increment(ranks,api.weeklyRankScore(e));
  increment(byEnv,e.site.env);increment(byHabitat,e.site.habitatType);increment(byBirdGroup,e.site.mainBirdGroup);
  if(api.v251EffectiveScore(e.today)!==e.score)cappedSlots++;
  if(e.tideMatched){assert.ok(e.sample);tideChecked++;}
  if(e.axes.pelagic){assert.equal(api.weeklyPelagicSafety(e.sample),true);pelagicChecked++;}
 }
 assert.equal(pelagicChecked,1000);
 results.push({reports,orderedIdsSha256:hash,all1000ListsAnd190FrequenciesIndependentlyEqual:true,
  oldAndNewWeatherSamePermutedSelection:true,all3AlternativesIndependentlyEqual:true,selectedGateTrue:10000,
  selectedPelagicSafetyChecked:pelagicChecked,tideMatchedSelectedSlots:tideChecked,tideEvidence,
  selectedSlotDisplayDistribution:displays,selectedSlotRawDistribution:raws,selectedSlotRankDistribution:ranks,cappedSlots,
  habitatMetadata:{envSlots:byEnv,habitatTypeSlots:byHabitat,mainBirdGroupSlots:byBirdGroup},
  summary:actual.summary});
}
const payload={schemaVersion:1,codeCommit:rt.manifest.codeCommit,evaluationTime:rt.manifest.evaluationTime,
 previousCheckpoint:'c968c6c',weatherComparisonKeyAssertions:weather.historicalP1AKeyAssertions,allComparisonsPassed:true,results};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(DOCS,'_results/p1b_validation.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({results:results.map(r=>({reports:r.reports,orderedIdsSha256:r.orderedIdsSha256,allEqual:r.all1000ListsAnd190FrequenciesIndependentlyEqual,
 display:r.selectedSlotDisplayDistribution,cappedSlots:r.cappedSlots,habitat:r.habitatMetadata})),passed:true},null,2));
