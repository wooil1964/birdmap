/* Analysis only. Immutable Git-source functions; synthetic values are regression stimuli, not ecological predictions. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const OUT=path.resolve(process.argv[3]||path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_results'));
const WT=path.resolve(process.argv[2]||process.cwd());
const manifestPath='docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json';
const manifestBytes=fs.readFileSync(path.join(WT,manifestPath));
const manifest=JSON.parse(manifestBytes);
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=new Map(manifest.files.map(f=>{
  const b=f.snapshotPath?gunzipSync(fs.readFileSync(path.join(WT,f.snapshotPath))):execFileSync('git',['-c',`safe.directory=${WT}`,'-C',WT,'show',`${f.sourceCommit||manifest.codeCommit}:${f.path}`],{maxBuffer:32*1024*1024});
  assert.equal(sha(b),f.sha256,f.path+' fixed-source hash');return[f.path,b];
}));
const text=p=>bytes.get(p).toString('utf8'),json=p=>JSON.parse(text(p));
const HTML=text('index.html'),TEST=text('.github/scripts/test_weekly_recommendation.mjs');
const siteCtx=vm.createContext({});
vm.runInContext(HTML.match(/var siteData=([^\n]+);/)[0]+'\n'+HTML.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0],siteCtx);
const sites=JSON.parse(JSON.stringify(siteCtx.siteData));assert.equal(sites.length,190);
function source(name){
  const start=HTML.indexOf('function '+name+'(');assert.ok(start>=0,name);let depth=0,quote=null;
  for(let i=HTML.indexOf('{',start);i<HTML.length;i++){
    const c=HTML[i],prev=HTML[i-1];if(quote){if(c===quote&&prev!=='\\')quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='/'&&HTML[i+1]==='*'){i=HTML.indexOf('*/',i)+1;continue;}
    if(c==='/'&&HTML[i+1]==='/'){i=HTML.indexOf('\n',i);continue;}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return HTML.slice(start,i+1);
  }throw Error('unbalanced '+name);
}
const names=[...new Set([...vm.runInNewContext(TEST.match(/const NAMES = (\[[\s\S]*?\]);/)[1]),'monthTideForSite','todayKstMonth','weatherScoreAllowed','v251EffectiveScore'])];
const functionText=names.map(source).join('\n');
const constants=HTML.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0]+'\n'+HTML.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0]+'\n'+HTML.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0]+'\n'+[...HTML.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]).join('\n')+'\n'+HTML.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0];
const reportBytes=fs.readFileSync(path.join(WT,manifest.recentSites.path));assert.equal(sha(reportBytes),manifest.recentSites.sha256);
const reports=JSON.parse(reportBytes);
assert.deepEqual(Object.keys(reports).sort(),['days','ok','since','sites','today']);
assert.ok(reports.sites.every(s=>Object.keys(s).sort().join('|')==='latestDate|siteId|species'));
const sightings=Object.fromEntries(reports.sites.map(s=>[String(s.siteId),{latestDate:s.latestDate,species:s.species}]));
const actual={siteData:sites,weatherWeek:json('weather_week.json'),weatherToday:json('weather_today.json'),tideMonth:json('tide_month.json'),notices:json('notices.json'),recentSiteSightings:sightings,rules:json('weather_rules.json')};
const factory=new Function('ctx','Date',
  'var weatherWeek=ctx.weatherWeek||null,tideMonth=ctx.tideMonth||null,weatherToday=ctx.weatherToday||null,siteData=ctx.siteData||[];'+
  'var loadedNotices=ctx.notices||[],PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.recentSiteSightings||{};'+constants+'\n'+functionText+
  '\nvar originalCandidate=weeklyRecommendationForSite,originalBonus=weeklyRecentReportBonus;'+
  'weeklyRecommendationForSite=function(site,week){var e=originalCandidate(site,week);if(!e)return null;'+
  'var p=ctx.policy;if(p.mode==="off"){e.recentReport=null;}else{'+
  'var r=p.mode==="visit"?originalBonus(site,e.recommendationDate):e.recentReport;'+
  'if(r){r=Object.assign({},r);if(p.noVariety)r.bonus-=r.speciesCount>=4?4:r.speciesCount>=2?2:0;r.bonus=Math.min(p.cap,r.bonus);}e.recentReport=r;}'+
  'e.rankScore=Number.isFinite(e.score)?e.score+(e.recentReport?e.recentReport.bonus:0):null;return e;};'+
  'return {'+names.join(',')+',rawBonus:originalBonus};');
const NOW='2026-10-08T22:40:00+09:00',DAY='2026-10-10',DAY2='2026-10-11';
const variants=[{name:'OFF',mode:'off',cap:0},...['today','visit'].flatMap(mode=>[0,4,8,12,16].map(cap=>({name:mode+'_cap'+cap,mode,cap}))),...['today','visit'].map(mode=>({name:mode+'_noVariety',mode,cap:16,noVariety:true}))];
function make(state,policy){
  const ctx={rules:actual.rules,...state,policy};
  if(policy.mode==='off')ctx.recentSiteSightings={};
  const Clock=class extends Date{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return new Date(NOW).getTime();}};
  return factory(ctx,Clock);
}
function smp(time,score=99,extra={}){return {forecastTime:DAY+' '+time+' KST',windSpeed:3,windDirectionDeg:0,windName:'북풍',gust:5,precipitation3h:0,temperature:20,visibilityKm:15,cloudPct:20,waveM:0.3,score,grade:'★★★★★',scoreEligible:true,missingScoreFields:[],isPastAtGeneration:false,...extra};}
function week(site,rows,interval=3){return {startDate:DAY,endDate:DAY2,sampleIntervalHours:interval,sites:{[site.id]:{name:site.name,ruleKey:'general_birding',days:Object.fromEntries(Object.entries(rows).map(([day,samples])=>[day,{samples}]))}}};}
function tide(site,rows){return {sites:{[site.id]:{days:rows}}};}
function base(site,rows,opts={}){return {siteData:[site],weatherWeek:week(site,rows,opts.interval),weatherToday:null,tideMonth:null,notices:[{siteIds:[site.id],published:true}],recentSiteSightings:{[site.id]:{latestDate:'2026-10-08',species:['a','b','c','d']}},...opts};}
const mud=sites.find(s=>String(s.id)==='14'),boat=sites.find(s=>String(s.id)==='48');
const general={...mud,id:'501',name:'부정fixture 일반 갯벌',env:'갯벌',island:false};
const event=(date,time,level)=>({date,highTide:time,highTideLevel:String(level)});
function candidate(api,site){return api.weeklyRecommendationForSite(site,api.weeklyInfo());}
function stripReport(e){if(!e)return null;const x={...e};delete x.rankScore;delete x.recentReport;return JSON.parse(JSON.stringify(x));}
const tests=[];
const add=(name,state,check)=>tests.push({name,state,check});
const excluded=(api,site)=>{assert.equal(candidate(api,site),null);assert.equal(api.todayRecommendedSites().length,0);};
for(const [gap,time,allowed] of [[90,'10:30',true],[91,'10:29',false],[120,'10:00',false]])for(const interval of [3,6,24]){
  const state=base(mud,{[DAY]:[smp(time)]},{interval,tideMonth:tide(mud,[event(DAY,'12:00',900)])});
  add(`tide-gap${gap}-interval${interval}`,state,(api)=>{if(!allowed)excluded(api,mud);else{const e=candidate(api,mud);assert.ok(e);assert.equal(e.recommendationTime,time);assert.equal(e.isMandatory,true);assert.equal(api.todayRecommendedSites().length,1);}});
}
for(const [id,threshold] of [['19',710],['14',850],['107',850]])for(const offset of [0,-1]){
  const site=sites.find(s=>String(s.id)===id),state=base(site,{[DAY]:[smp('12:00')]},{tideMonth:tide(site,[event(DAY,'12:00',threshold+offset)])});
  add(`tide-height${id}-${threshold+offset}`,state,api=>{if(offset<0)excluded(api,site);else{assert.ok(candidate(api,site));assert.equal(api.todayRecommendedSites().length,1);}});
}
add('tide-unsafe-highest-other-safe-date',base(mud,{[DAY]:[smp('12:00',99,{waveM:2.4})],[DAY2]:[smp('12:00',80,{forecastTime:DAY2+' 12:00 KST'})]},{tideMonth:tide(mud,[event(DAY,'12:00',900),event(DAY2,'12:00',880)])}),api=>{const e=candidate(api,mud);assert.equal(e.recommendationDate,DAY2);assert.equal(e.score,80);assert.match(e.tideText,/880cm/);assert.doesNotMatch(e.tideText+(e.extraText||''),/900cm/);});
add('tide-unsafe-first-other-safe-same-date',base(mud,{[DAY]:[smp('09:00',99,{precipitation3h:1}),smp('15:00',80)]},{tideMonth:tide(mud,[event(DAY,'08:30,15:30','900,870')])}),api=>{const e=candidate(api,mud);assert.equal(e.recommendationTime,'15:00');assert.match(e.tideText,/870cm/);assert.doesNotMatch(e.tideText+(e.extraText||''),/900cm/);});
add('tide-all-danger-excluded-despite-notice-report-mandatory',base(mud,{[DAY]:[smp('12:00',99,{precipitation3h:1,waveM:2.4})]},{tideMonth:tide(mud,[event(DAY,'12:00',900)])}),api=>excluded(api,mud));
add('tide-missing-data-excluded-despite-notice-report',base(mud,{[DAY]:[smp('12:00')]}),api=>excluded(api,mud));
for(const rain of [0.999,1,1.04])add('general-rain-'+rain,base(general,{[DAY]:[smp('09:00',99,{precipitation3h:rain}),smp('12:00',80)]}),api=>{const e=candidate(api,general);assert.equal(e.recommendationTime,rain<1?'09:00':'12:00');assert.equal(api.weeklyRecommendationIsSafe(e),true);assert.equal(api.todayRecommendedSites().length,1);});
add('general-all-danger-notice-report-excluded',base(general,{[DAY]:[smp('09:00',99,{precipitation3h:1}),smp('12:00',98,{waveM:2})]}),api=>{const e=candidate(api,general);assert.ok(e);assert.equal(api.weeklyRecommendationIsSafe(e),false);assert.equal(api.todayRecommendedSites().length,0);});
add('general-ineligible-notice-report-excluded',base(general,{[DAY]:[smp('12:00',99,{scoreEligible:false})]}),api=>excluded(api,general));
const pelagicChanges=[['at',{windSpeed:6,waveM:0.7,precipitation3h:0},true],['wind-over',{windSpeed:6.001},false],['wave-over',{waveM:0.7001},false],['rain-positive',{precipitation3h:0.0001},false],['wind-missing',{windSpeed:null},false],['wave-missing',{waveM:null},false],['rain-missing',{precipitation3h:null},false],['wind-string',{windSpeed:'3'},false],['wave-string',{waveM:'0.3'},false],['rain-string',{precipitation3h:'0'},false]];
for(const [name,extra,want] of pelagicChanges)add('pelagic-'+name,base(boat,{[DAY]:[smp('12:00',99,extra)]}),api=>{const e=candidate(api,boat);assert.equal(!!e,want);assert.equal(api.todayRecommendedSites().length,want?1:0);if(e){assert.equal(api.weeklyPelagicSafety(e.sample),true);assert.equal(api.weeklyRecommendationIsSafe(e),true);}});
for(const [name,extra] of [['rain',{precipitation3h:0.01}],['wind',{windSpeed:6.1}],['wave',{waveM:0.8}],['missing',{waveM:null}]])add('pelagic-danger-highest-safe-lower-'+name,base(boat,{[DAY]:[smp('09:00',99,extra),smp('12:00',80)]}),api=>{const e=candidate(api,boat);assert.equal(e.recommendationTime,'12:00');assert.equal(e.score,80);assert.equal(api.todayRecommendedSites().length,1);});
for(const [name,extra] of [['gap91',{}],['missing-time',{forecastTime:undefined}],['ineligible',{scoreEligible:false}],['stale',{stale:true}],['rain',{rain:'3시간 강수 1.0mm'}],['wave',{wave:'2.0m'}],['score-missing',{score:null}],['wrong-date',{date:'2026-10-09',forecastTime:'2026-10-09 10:30 KST'}]]){
  const time=name==='gap91'?'10:29':'10:30';
  const state=base(mud,{}, {weatherWeek:null,tideMonth:tide(mud,[event(DAY,'12:00',900)]),weatherToday:{sites:{14:{date:DAY,forecastTime:DAY+' '+time+' KST',score:99,wind:'북풍 3m/s',rain:'강수 없음',wave:'0.3m',...extra}}}});
  add('today-fallback-'+name,state,api=>excluded(api,mud));
}

for(const [metadataName,metadata] of [['undefined',undefined],['null',null],['zero',0],['negative',-1],['bad-string','bad'],['numeric-string','6'],['NaN',NaN],['Infinity',Infinity]])for(const [gap,time,allowed] of [[90,'10:30',true],[91,'10:29',false]]){
 const state=base(mud,{[DAY]:[smp(time)]},{interval:metadata,tideMonth:tide(mud,[event(DAY,'12:00',900)])});
 add('tide-metadata-'+metadataName+'-gap'+gap,state,api=>{if(!allowed)excluded(api,mud);else{assert.ok(candidate(api,mud));assert.equal(api.todayRecommendedSites().length,1);}});
}
for(const [invalidName,extra] of [['missing-time',{forecastTime:undefined}],['malformed-time',{forecastTime:'invalid'}],['wrong-date',{forecastTime:'2026-10-09 12:00 KST'}],['ineligible',{scoreEligible:false}]]){
 const state=base(mud,{[DAY]:[smp('12:00',99,extra)]},{tideMonth:tide(mud,[event(DAY,'12:00',900)])});
 add('tide-week-invalid-'+invalidName,state,api=>excluded(api,mud));
}

const checks=[];let failures=0;
for(const v of variants)for(const t of tests){
  const baseline=make(t.state,{mode:'today',cap:16}),api=make(t.state,v);let error=null;
  try{t.check(api);for(const s of t.state.siteData)assert.deepEqual(stripReport(candidate(api,s)),stripReport(candidate(baseline,s)),'only recentReport/rankScore may change');}catch(e){error=e.stack;failures++;}
  checks.push({variant:v.name,fixture:t.name,pass:!error,error});
}
const actualResults=variants.map(v=>{const api=make(actual,v),all=sites.map(s=>candidate(api,s)),top=api.todayRecommendedSites();return {variant:v.name,candidates:all.filter(Boolean).length,safe:all.reduce((a,e)=>{const key=e?String(api.weeklyRecommendationIsSafe(e)):'noCandidate';a[key]=(a[key]||0)+1;return a;},{}),top:top.map((e,i)=>({position:i+1,id:String(e.site.id),raw:e.score,display:api.v251EffectiveScore(e.today),rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,ageDays:e.recentReport?.ageDays??null,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis}))};});
const off=make(actual,{mode:'off',cap:0}),zero=make(actual,{mode:'today',cap:0});
const zeroDiff=sites.map(s=>{const a=candidate(off,s),b=candidate(zero,s);return {id:String(s.id),offReport:!!a?.recentReport,cap0Report:!!b?.recentReport,offRank:a?off.weeklyRankScore(a):null,cap0Rank:b?zero.weeklyRankScore(b):null};}).filter(r=>r.offReport!==r.cap0Report||r.offRank!==r.cap0Rank);
const tieDemoState=base(general,{[DAY]:[smp('12:00',92)]});
const tieSites=[{...general,id:'601',name:'tie A'},{...general,id:'602',name:'tie B'}];
tieDemoState.siteData=tieSites;tieDemoState.weatherWeek={startDate:DAY,endDate:DAY,sites:Object.fromEntries(tieSites.map(s=>[s.id,{name:s.name,days:{[DAY]:{samples:[smp('12:00',92)]}}}]))};tieDemoState.notices=[];tieDemoState.recentSiteSightings={602:{latestDate:'2026-10-08',species:['a']}};
const tieOff=make(tieDemoState,{mode:'off',cap:0}),tieZero=make(tieDemoState,{mode:'today',cap:0});
const tieDemonstration={off:tieOff.todayRecommendedSites().map(e=>String(e.site.id)),cap0:tieZero.todayRecommendedSites().map(e=>String(e.site.id)),allRanksEqual:tieSites.every(s=>tieOff.weeklyRankScore(candidate(tieOff,s))===tieZero.weeklyRankScore(candidate(tieZero,s)))};
assert.deepEqual(tieDemonstration.off,['601','602']);assert.deepEqual(tieDemonstration.cap0,['602','601']);assert.equal(tieDemonstration.allRanksEqual,true);
const report={codeCommit:manifest.codeCommit,evaluationTime:NOW,manifestPath,manifestSha256:sha(manifestBytes),sourceHashes:Object.fromEntries([...bytes].map(([p,b])=>[p,sha(b)])),extractedFunctions:names,extractedFunctionsSha256:sha(functionText),reportSnapshotSha256:sha(reportBytes),variants,fixtureCount:tests.length,totalChecks:checks.length,passedChecks:checks.length-failures,failedChecks:failures,checks,actualResults,cap0VsOff:{sameRankButRetainedReports:zeroDiff,tieDemonstration},publicReportFieldSchema:{root:Object.keys(reports).sort(),site:Object.keys(reports.sites[0]).sort(),allowedOnly:true},scope:'Safety regression values are copied/adapted from P0 test stimulus; cap variants are policy sensitivity experiments, not ecology-based probability or optimal scoring. Actual results are fixed 351/22:40 with held 19:32 public aggregate. No API/DB writes or source changes.'};
const priorGitConfigCount=Number(process.env.GIT_CONFIG_COUNT||0);
process.env.GIT_CONFIG_COUNT=String(priorGitConfigCount+1);process.env['GIT_CONFIG_KEY_'+priorGitConfigCount]='safe.directory';process.env['GIT_CONFIG_VALUE_'+priorGitConfigCount]=WT;
const rootModuleUrl=pathToFileURL(path.join(WT,'docs/recommendation-masterplan/_scripts/p1c_runtime.mjs')).href;
const rootModule=await import(rootModuleUrl),rootRuntime=rootModule.loadP1C();
const rootChecks=[];
for(const p of rootModule.SCENARIOS)for(const t of tests){
  const mapped={sites:t.state.siteData,week:t.state.weatherWeek,today:t.state.weatherToday,tide:t.state.tideMonth,notices:t.state.notices,sightings:p.reports===false?{}:t.state.recentSiteSightings};
  const api=rootRuntime.makeScenario(p,mapped,t.state.siteData,NOW);
  const baseline=rootRuntime.makeScenario({reports:true,cap:16},mapped,t.state.siteData,NOW);let error=null;
  try{t.check(api);for(const s of t.state.siteData)assert.deepEqual(stripReport(candidate(api,s)),stripReport(candidate(baseline,s)),'analysis policy must preserve physical entry');}catch(e){error=e.message.split('\n')[0];failures++;}
  rootChecks.push({scenario:p.id,fixture:t.name,pass:!error,error});
}
report.rootAnalysisRuntimeReview={runtimeSha256:sha(fs.readFileSync(path.join(WT,'docs/recommendation-masterplan/_scripts/p1c_runtime.mjs'))),baseRuntimeSha256:sha(fs.readFileSync(path.join(WT,'docs/recommendation-masterplan/_scripts/recommendation_runtime.mjs'))),scenarioCount:rootModule.SCENARIOS.length,fixtures:tests.length,totalChecks:rootChecks.length,passedChecks:rootChecks.filter(c=>c.pass).length,failedChecks:rootChecks.filter(c=>!c.pass).length,checks:rootChecks,offOverrideHandling:'The reports:false flag is verified by the analysis runtime; synthetic mappings also supply empty sightings. Runtime override order has been corrected independently of production code.'};
report.rootActualResults=rootModule.SCENARIOS.map(p=>{const api=rootRuntime.makeScenario(p),entries=sites.map(s=>candidate(api,s));return {scenario:p.id,candidates:entries.filter(Boolean).length,top:api.todayRecommendedSites().map((e,i)=>({position:i+1,id:String(e.site.id),raw:e.score,display:api.v251EffectiveScore(e.today),rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,ageDays:e.recentReport?.ageDays??null,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis}))};});
for(const [ownName,rootName] of [['OFF','reports_off'],['today_cap0','cap_0'],['today_cap4','cap_4'],['today_cap8','cap_8'],['today_cap12','cap_12'],['today_cap16','cap_16'],['visit_cap16','visit_date_cap16'],['today_noVariety','recency_only_cap16']])assert.deepEqual(actualResults.find(r=>r.variant===ownName).top,report.rootActualResults.find(r=>r.scenario===rootName).top,ownName+' independent vs root');
report.independentVsRootCommonScenarios={count:8,top10FullObjectsExact:true};
fs.writeFileSync(path.join(OUT,'p1c_negative_fixtures.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(OUT,'p1c_negative_checks.csv'),'variant,fixture,pass\n'+checks.map(r=>[r.variant,r.fixture,r.pass].join(',')).join('\n')+'\n');
fs.writeFileSync(path.join(OUT,'p1c_negative_top10.csv'),'variant,position,id,raw,display,rank,bonus,ageDays,date,time,axis\n'+actualResults.flatMap(r=>r.top.map(t=>[r.variant,t.position,t.id,t.raw,t.display,t.rank,t.bonus,t.ageDays??'',t.date,t.time,t.axis].join(','))).join('\n')+'\n');
console.log(JSON.stringify({fixtures:tests.length,independentChecks:checks.length,independentPass:checks.filter(c=>c.pass).length,rootChecks:rootChecks.length,rootPass:rootChecks.filter(c=>c.pass).length,totalFail:failures,commonScenariosExact:8,cap0VsOffReportCount:zeroDiff.length,tieDemonstration,rootActualTop:report.rootActualResults.map(r=>({scenario:r.scenario,candidates:r.candidates,top:r.top.map(t=>t.id)}))},null,2));
if(failures)process.exitCode=1;
