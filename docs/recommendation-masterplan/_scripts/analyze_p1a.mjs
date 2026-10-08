/* Analysis only: fixed Git objects + public aggregate snapshot; no network or application writes.
 * node docs/recommendation-masterplan/_scripts/analyze_p1a.mjs [--write]
 * stdout: compact summary. --write: analysis JSON files only under this docs directory.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const DOCS=path.resolve(HERE,'..'), ROOT=path.resolve(DOCS,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(DOCS,'_snapshots/input_manifest.json')));
const PIN=manifest.codeCommit, NOW=manifest.evaluationTime;
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=new Map(manifest.files.map(f=>{
 const b=execFileSync('git',['show',PIN+':'+f.path],{cwd:ROOT,maxBuffer:1<<28});
 assert.equal(hash(b),f.sha256,'Git input changed: '+f.path); return [f.path,b];
}));
const text=name=>{assert.ok(bytes.has(name),'Unmanifested source: '+name);return bytes.get(name).toString('utf8');};
const json=name=>JSON.parse(text(name));
const html=text('index.html'), helper=text('.github/scripts/test_weekly_recommendation.mjs');
const siteContext=vm.createContext({});
vm.runInContext(html.match(/var siteData=([^\n]+);/)[0]+'\n'+html.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0],siteContext);
const sites=JSON.parse(JSON.stringify(siteContext.siteData));
assert.equal(sites.length,190);assert.equal(new Set(sites.map(s=>String(s.id))).size,190);
function functionSource(name){
 const start=html.indexOf('function '+name+'('); assert.ok(start>=0,'Missing '+name);
 let depth=0,quote=null;
 for(let i=html.indexOf('{',start);i<html.length;i++){
  const c=html[i],previous=html[i-1];
  if(quote){if(c===quote&&previous!=='\\')quote=null;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='/'&&html[i+1]==='*'){i=html.indexOf('*/',i)+1;continue;}
  if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(start,i+1);
 }
 throw Error('Unbalanced source: '+name);
}
const names=[...new Set([...vm.runInNewContext(helper.match(/const NAMES = (\[[\s\S]*?\]);/)[1]),
 'monthTideForSite','todayKstMonth','weatherScoreAllowed','storedWeatherState','weatherTimeMs','weatherLatestDue',
 'v251EffectiveScore','v251GradeStars','v251ScoreDisplayText','todayWeatherFromWeek','weatherTodayForSite'])];
const constants=html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0]+'\n'+
 html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0]+'\n'+html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0]+'\n'+
 [...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]).join('\n')+'\n'+
 html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0];
const extracted=names.map(functionSource).join('\n');
const factory=new Function('ctx','Date',
 'var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
 'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+
 constants+'\n'+extracted+'\nreturn {'+names.join(',')+'};');
const Clock=class extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return new Date(NOW).getTime();}};
const today=json('weather_today.json'), weatherWeek=json('weather_week.json'), rules=json('weather_rules.json');
const tide=json('tide_month.json'), notices=json('notices.json');
const reportBytes=fs.readFileSync(path.join(ROOT,manifest.recentSites.path));
assert.equal(hash(reportBytes),manifest.recentSites.sha256,'Report snapshot hash changed');
const reports=JSON.parse(reportBytes);
assert.equal(reports.ok,true);
assert.ok(Object.keys(reports).every(k=>['ok','days','since','today','sites'].includes(k)));
assert.ok(reports.sites.every(s=>Object.keys(s).every(k=>['siteId','latestDate','species'].includes(k))),'Public aggregate fields only');
const sightings={};
for(const item of reports.sites) if(item&&item.siteId&&/^\d{4}-\d{2}-\d{2}$/.test(String(item.latestDate||''))&&Array.isArray(item.species))
 sightings[String(item.siteId)]={latestDate:String(item.latestDate),species:item.species.map(String)};
const makeApi=recent=>factory({week:weatherWeek,today,tide,sites,notices,rules,sightings:recent},Clock);
const api=makeApi(sightings), noReport=makeApi({});
const range=api.weeklyInfo();
const count=(rows,fn)=>rows.reduce((out,x)=>{const key=String(fn(x));out[key]=(out[key]||0)+1;return out;},{});
const num=n=>typeof n==='number'&&Number.isFinite(n);
const max=a=>a.length?Math.max(...a):null;
const dist=a=>({units:a.length,valid:a.filter(num).length,unknown:a.filter(x=>!num(x)).length,
 count92:a.filter(x=>x===92).length,distribution:count(a,x=>num(x)?x:'unknown')});
const canonical=s=>rules.aliases?.[s.weatherRuleKey]||s.weatherRuleKey||'general_birding';
const rawSamples=sites.flatMap(site=>Object.entries(weatherWeek.sites[String(site.id)]?.days||{})
 .flatMap(([date,day])=>(day.samples||[]).map(sample=>({site,date,sample}))));
const daylight=sites.flatMap(site=>range.dates.flatMap(date=>api.weeklyDaylightCandidates(site,date).map(sample=>({site,date,sample}))));
const top=api.todayRecommendedSites(), panel=api.weeklyPanelRecommendations(range);
assert.deepEqual(top.map(e=>e.site.id),panel.map(e=>e.site.id),'Editorial must not change selection');
const selected=new Map(top.map((e,i)=>[String(e.site.id),{rank:i+1,axis:e.selectedAxis}]));
const all190=sites.map(site=>{
 const id=String(site.id), stored=today.sites[id]||null, available=rawSamples.filter(x=>String(x.site.id)===id);
 const day=daylight.filter(x=>String(x.site.id)===id);
 const representative=api.weeklySeasonalBestWeatherDay(site,range);
 const entry=api.weeklyRecommendationForSite(site,range), gate=entry?api.weeklyRecommendationIsSafe(entry):null;
 const tideGate=api.weeklyMudflatTideGateOpen(site,range);
 const policies=range.dates.map(date=>api.weeklyDatePolicy(site,date)).filter(Boolean);
 const popup=api.weatherTodayForSite(site), popupState=popup?popup._weatherState:null;
 let reason=null;
 if(!entry){
  if(!tideGate)reason='required_tide_gate_not_met';
  else if(!policies.length)reason='no_season_habitat_policy';
  else if(!representative)reason='no_eligible_seasonal_daylight_sample';
  else reason='candidate_function_returned_null_other';
 }else if(gate===false)reason='current_weather_caution_gate_false';
 else if(!selected.has(id))reason='not_selected_by_quota_priority_or_tie_order';
 return {siteId:id,name:site.name,region:site.region,sido:site.sido,ruleKey:site.weatherRuleKey,canonicalRule:canonical(site),
 storedTodayRaw:stored?.score??null,storedTodayEligible:stored?.scoreEligible===true,storedTodayStale:stored?.stale===true,
 popupEffectiveScore:popup?api.v251EffectiveScore(popup):null,popupState:popupState?.kind||null,
 weekSampleCount:available.length,weekMaximum:max(available.filter(x=>x.sample.scoreEligible===true&&num(x.sample.score)).map(x=>x.sample.score)),
 futureDaylightCount:day.length,futureDaylightMaximum:max(day.map(x=>x.sample.score)),
 seasonalRepresentativeScore:representative?.sample.score??null,
 candidate:!!entry,cautionGate:entry?(gate===null?'unknown':gate?'true':'false'):null,
 rawScore:entry?.score??null,displayScore:entry?.today?api.v251EffectiveScore(entry.today):null,
 rankScore:entry?api.weeklyRankScore(entry):null,reportBonus:entry?.recentReport?.bonus||0,
 date:entry?.recommendationDate||null,time:entry?.recommendationTime||null,axes:entry?.axes||null,
 priority:entry?.priority??null,isMandatory:entry?.isMandatory??null,basis:entry?.basisText||null,
 tideText:entry?.tideText||null,reasons:entry?.reasons||[],
 displayRank:selected.get(id)?.rank??null,selectedAxis:selected.get(id)?.axis??null,exclusionReason:reason};
});
const candidates=all190.filter(x=>x.candidate);
const passed=candidates.filter(x=>x.cautionGate!=='false');
const compactTop=(entries,engine)=>entries.map((e,i)=>({position:i+1,siteId:String(e.site.id),name:e.site.name,rawScore:e.score,
 displayScore:e.today?engine.v251EffectiveScore(e.today):null,rankScore:engine.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,
 date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis,basis:e.basisText,tide:e.tideText||null}));
const byType={};
for(const key of [...new Set(sites.map(canonical))].sort()){
 const rows=all190.filter(x=>x.canonicalRule===key), typeSamples=rawSamples.filter(x=>canonical(x.site)===key);
 byType[key]={sites:rows.length,todayRaw:dist(rows.map(x=>x.storedTodayRaw)),
 todayEligible:dist(rows.filter(x=>x.storedTodayEligible).map(x=>x.storedTodayRaw)),
 weekSamples:dist(typeSamples.map(x=>x.sample.score)),weekMax:dist(rows.map(x=>x.weekMaximum)),
 futureDaylightMax:dist(rows.map(x=>x.futureDaylightMaximum)),
 candidateRaw:dist(rows.filter(x=>x.candidate).map(x=>x.rawScore)),
 candidateDisplay:dist(rows.filter(x=>x.candidate).map(x=>x.displayScore))};
}
const requiredWave=rawSamples.filter(x=>x.site.showWave||x.site.island||x.site.pelagic);
const rawDisplayDiff=rawSamples.filter(x=>api.v251EffectiveScore(api.weeklySampleAsWeather(x.site,x.sample,x.date))!==x.sample.score);
const rawCaution=rawSamples.filter(x=>api.weeklySampleCaution(x.sample));
const payload={schemaVersion:1,codeCommit:PIN,evaluationTime:NOW,range,
 provenance:{inputManifest:'_snapshots/input_manifest.json',reportRetrievedAt:manifest.recentSites.retrievedAt,
 reportSha256:hash(reportBytes),scriptSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replaceAll('\r\n','\n')),
 functionSourceSha256:hash(extracted),runtimeCanonicalSha256:hash(JSON.stringify(sites)),sourceFilesVerified:manifest.files.length},
 metadata:{today:Object.fromEntries(Object.entries(today).filter(([k])=>!['sites','errors'].includes(k))),
 week:Object.fromEntries(Object.entries(weatherWeek).filter(([k])=>k!=='sites')),
 tide:{generatedAt:tide.generatedAt,windowStart:tide.windowStart,windowEnd:tide.windowEnd,status:tide.status},
 reportSiteCount:reports.sites.length},
 metrics:{todayRaw:dist(all190.map(x=>x.storedTodayRaw)),
 todayStoredEligible:dist(all190.filter(x=>x.storedTodayEligible).map(x=>x.storedTodayRaw)),
 popupEffective:dist(all190.map(x=>x.popupEffectiveScore)),
 weekSamples:dist(rawSamples.map(x=>x.sample.score)),
 futureDaylightSamples:dist(daylight.map(x=>x.sample.score)),
 cautionFreeDaylight:dist(daylight.filter(x=>!api.weeklySampleCaution(x.sample)).map(x=>x.sample.score)),
 wholeWeekMaximum:dist(all190.map(x=>x.weekMaximum)),
 futureDaylightMaximum:dist(all190.map(x=>x.futureDaylightMaximum)),
 seasonalRepresentative:dist(all190.map(x=>x.seasonalRepresentativeScore)),
 candidateRaw:dist(candidates.map(x=>x.rawScore)),candidateDisplay:dist(candidates.map(x=>x.displayScore)),
 passedGateRaw:dist(passed.map(x=>x.rawScore)),internalRank:dist(candidates.map(x=>x.rankScore))},
 quality:{siteCount:sites.length,uniqueIds:new Set(sites.map(s=>String(s.id))).size,
 storedEligibleCount:all190.filter(x=>x.storedTodayEligible).length,storedStaleIds:all190.filter(x=>x.storedTodayStale).map(x=>x.siteId),
 noSampleIds:all190.filter(x=>!x.weekSampleCount).map(x=>x.siteId),popupStates:count(all190,x=>x.popupState),
 missingSampleFields:Object.fromEntries(['windSpeed','windDirectionDeg','gust','precipitation3h','temperature','visibilityKm','cloudPct','waveM','score']
 .map(k=>[k,rawSamples.filter(x=>x.sample[k]===null||x.sample[k]===undefined).length])),
 requiredWaveSamples:requiredWave.length,requiredWaveMissing:requiredWave.filter(x=>!num(x.sample.waveM)).length,
 rawCautionSamples:rawCaution.length,rawCaution92:rawCaution.filter(x=>x.sample.score===92).length,
 rawDisplayDifference:rawDisplayDiff.length,raw92DisplayDifference:rawDisplayDiff.filter(x=>x.sample.score===92).length,
 candidates:candidates.length,cautionGate:count(candidates,x=>x.cautionGate),selectedCount:top.length,
 selectedAxis:count(top,x=>x.selectedAxis),candidateExcluded:all190.filter(x=>!x.candidate).map(x=>({id:x.siteId,name:x.name,reason:x.exclusionReason})),
 reportBonuses:all190.filter(x=>x.reportBonus).map(x=>({id:x.siteId,bonus:x.reportBonus})),
 unselected100:passed.filter(x=>x.rawScore===100&&!x.displayRank).map(x=>({id:x.siteId,name:x.name})),
 runtimeWorkerComparison:(()=>{
  const worker=JSON.parse(text('weather-proxy/src/sites.js').match(/Object\.freeze\((.*)\);/s)[1]);
  const mismatch=sites.filter(s=>!worker[String(s.id)]||['lat','lon'].some(k=>Math.abs(Number(s[k])-Number(worker[String(s.id)][k]))>1e-10));
  return {runtime:sites.length,worker:Object.keys(worker).length,coordinateMismatchIds:mismatch.map(s=>String(s.id)),
 nameMismatchIds:sites.filter(s=>s.name!==worker[String(s.id)]?.name).map(s=>String(s.id)),
 environmentMismatchIds:sites.filter(s=>s.env!==worker[String(s.id)]?.environment).map(s=>String(s.id)),
 pelagicMismatchIds:sites.filter(s=>!!s.pelagic!==!!worker[String(s.id)]?.pelagic).map(s=>String(s.id)),
 workerOnlyIds:Object.keys(worker).filter(id=>!sites.some(s=>String(s.id)===id))};
 })()},
 byType,top10:compactTop(top,api),noReportControlTop10:compactTop(noReport.todayRecommendedSites(),noReport),
 reportSelectionImpact:(()=>{const off=noReport.todayRecommendedSites().map(e=>String(e.site.id)),on=top.map(e=>String(e.site.id));
 return {commonSites:on.filter(id=>off.includes(id)).length,entered:on.filter(id=>!off.includes(id)),exited:off.filter(id=>!on.includes(id))};})(),all190,
 limits:['기상 JSON은 원자료를 반올림한 뒤 저장되므로 점수 생성의 원자료 정밀도를 역복원할 수 없다.',
 'cautionGate true는 현행 강수/파고 주의 판정 통과이며 모든 위험에 대한 안전 보증이 아니다.',
 '제보 없음은 비교 대조군이며 실제 제보 자료가 없다는 뜻이 아니다.',
 '고정 시계+별도 취득 제보 재생은 실제 당시 서비스 화면의 관측이 아니다.',
 '10월 단일 저장 시점으로 계절 정확도·출현 확률·장기 안정성을 판정하지 않는다.']};
assert.equal(candidates.length,Object.values(payload.quality.cautionGate).reduce((a,b)=>a+b,0));
assert.ok(top.every(e=>api.weeklyRecommendationIsSafe(e)!==false));
assert.ok(payload.quality.runtimeWorkerComparison.coordinateMismatchIds.length===0);
const summary={...payload};delete summary.all190;
if(process.argv.includes('--write')){
 const dir=path.join(DOCS,'_results');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'p1a_1f0b0b5_1930.json'),JSON.stringify(payload,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'p1a_1f0b0b5_1930_summary.json'),JSON.stringify(summary,null,2)+'\n');
}
console.log(JSON.stringify({codeCommit:PIN,evaluationTime:NOW,metrics:payload.metrics,quality:payload.quality,
 byType:Object.fromEntries(Object.entries(byType).map(([k,v])=>[k,{sites:v.sites,today:v.todayRaw.distribution,weekMax:v.weekMax.distribution,candidates:v.candidateRaw.distribution}])),
 top10:payload.top10,noReportControlTop10:payload.noReportControlTop10},null,2));

