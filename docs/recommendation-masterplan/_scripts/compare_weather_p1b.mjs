/* New weather comparison; original P1-A inputs/results are read-only. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {loadRuntime,compactTop,candidateRows,distribution,DOCS,sha256} from './recommendation_runtime.mjs';
const OLD='docs/recommendation-masterplan/_snapshots/input_manifest.json';
const NEW='docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json';
const NOW='2026-10-08T22:40:00+09:00';
const old=loadRuntime(OLD),fresh=loadRuntime(NEW);
assert.equal(old.functionsHash,fresh.functionsHash);assert.deepEqual(old.sites,fresh.sites);
assert.equal(old.manifest.recentSites.sha256,fresh.manifest.recentSites.sha256);
const delta=old.manifest.files.filter(f=>f.sha256!==fresh.manifest.files.find(x=>x.path===f.path)?.sha256).map(f=>f.path).sort();
assert.deepEqual(delta,['weather_today.json','weather_week.json']);
const count=values=>values.reduce((a,v)=>(a[String(v)]=(a[String(v)]||0)+1,a),{});
function run(rt,now,reports){
 const api=rt.makeApi(reports,rt.sites,now),rows=candidateRows(rt,api),candidate=rows.filter(r=>r.entry),top=compactTop(api);
 const samples=rt.sites.flatMap(s=>Object.values(rt.data.week.sites[String(s.id)]?.days||{}).flatMap(d=>d.samples||[]));
 const eligible=rt.sites.filter(s=>rt.data.today.sites[String(s.id)]?.scoreEligible===true);
 const popup=rt.sites.map(s=>api.weatherTodayForSite(s));
 const daylight=rt.sites.flatMap(s=>api.weeklyInfo().dates.flatMap(d=>api.weeklyDaylightCandidates(s,d)));
 return {codeCommit:rt.manifest.codeCommit,now,reports,
 metadata:{today:{generatedAt:rt.data.today.generatedAt,refreshedAt:rt.data.today.refreshedAt,status:rt.data.today.status},
 week:{generatedAt:rt.data.week.generatedAt,refreshedAt:rt.data.week.refreshedAt,status:rt.data.week.status}},
 metrics:{todayRaw:distribution(rt.sites.map(s=>rt.data.today.sites[String(s.id)]?.score)),
 todayEligibleCount:eligible.length,todayEligible:distribution(eligible.map(s=>rt.data.today.sites[String(s.id)]?.score)),
 weekSamples:samples.length,weekRaw:distribution(samples.map(s=>s.score)),futureDaylightCount:daylight.length,futureDaylight:distribution(daylight.map(s=>s.score)),
 candidates:candidate.length,gate:count(candidate.map(r=>r.gate===null?'unknown':r.gate)),
 candidateRaw:distribution(candidate.map(r=>r.entry.score)),candidateDisplay:distribution(candidate.map(r=>api.v251EffectiveScore(r.entry.today))),
 rank:distribution(candidate.map(r=>api.weeklyRankScore(r.entry))),
 popupStates:count(popup.map(p=>p?._weatherState?.kind||'none')),popupValid:popup.filter(p=>Number.isFinite(api.v251EffectiveScore(p))).length,
 missing:Object.fromEntries(['windSpeed','windDirectionDeg','gust','precipitation3h','temperature','visibilityKm','cloudPct','waveM','score'].map(k=>[k,samples.filter(s=>s[k]===null||s[k]===undefined).length]))},
 top10:top,rows:rows.map(r=>({id:r.id,name:r.name,candidate:!!r.entry,gate:r.gate,
 raw:r.entry?.score??null,display:r.entry?api.v251EffectiveScore(r.entry.today):null,rank:r.entry?api.weeklyRankScore(r.entry):null,
 bonus:r.entry?.recentReport?.bonus||0,date:r.entry?.recommendationDate||null,time:r.entry?.recommendationTime||null}))};
}
const historical=run(old,old.manifest.evaluationTime,true);
const previous=JSON.parse(fs.readFileSync(path.join(DOCS,'_results/p1a_1f0b0b5_1930_summary.json')));
assert.equal(historical.metrics.candidates,previous.quality.candidates);
assert.deepEqual(historical.metrics.todayRaw,previous.metrics.todayRaw.distribution);
assert.deepEqual(historical.top10.map(r=>[r.id,r.rank]),previous.top10.map(r=>[r.siteId,r.rankScore]));
const matrix=[];
for(const rt of [old,fresh])for(const reports of [true,false])matrix.push(run(rt,NOW,reports));
const changes={};
for(const reports of [true,false]){
 const a=matrix.find(x=>x.codeCommit===old.manifest.codeCommit&&x.reports===reports),b=matrix.find(x=>x.codeCommit===fresh.manifest.codeCommit&&x.reports===reports);
 changes[reports?'reportsOn':'reportsOff']={membershipChanged:JSON.stringify(a.top10.map(r=>r.id))!==JSON.stringify(b.top10.map(r=>r.id)),
 allCandidateCoreChanges:a.rows.map((x,i)=>JSON.stringify(x)===JSON.stringify(b.rows[i])?null:{id:x.id,name:x.name,before:x,after:b.rows[i]}).filter(Boolean)};
}
const payload={schemaVersion:1,oldManifest:OLD,newManifest:NEW,evaluationTime:NOW,
 functionSourceSha256:fresh.functionsHash,unchangedRuntimeSha256:sha256(JSON.stringify(fresh.sites)),
 changedInputPaths:delta,reportSha256:fresh.manifest.recentSites.sha256,historicalP1AKeyAssertions:true,historical,matrix,changes,
 limitations:['과거 실화면 관측이 아닌 고정 자료 재생이다.','Only weather differs; old/new compared at same 22:40 clock.','Reports OFF is a control; all other inputs are identical.']};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(DOCS,'_results/weather_comparison_p1b_2240.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({historical:historical.metrics,matrix:matrix.map(({rows,...x})=>x),changes},null,2));
