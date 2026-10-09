// Exact product loader and selection functions; only fetch/DOM redraw dependencies mocked.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),head='352315a57d038687807dbe0044c136a22fb0c9c5';
const html=fs.readFileSync(path.join(repo,'index.html'),'utf8').replace(/\r\n/g,'\n');assert.equal(html,execFileSync('git',['show',head+':index.html'],{cwd:repo,encoding:'utf8',maxBuffer:1<<26}).replace(/\r\n/g,'\n'));
const helper=fs.readFileSync(path.join(repo,'.github/scripts/test_weekly_recommendation.mjs'),'utf8'),rules=JSON.parse(fs.readFileSync(path.join(repo,'weather_rules.json'),'utf8'));
const sc=vm.createContext({});vm.runInContext(html.match(/var siteData=([^\n]+);/)[0]+'\n'+html.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0],sc);const site=JSON.parse(JSON.stringify(sc.siteData)).find(s=>String(s.id)==='14');
function source(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);let d=0,q=null;for(let i=html.indexOf('{',start);i<html.length;i++){const c=html[i],p=html[i-1];if(q){if(c===q&&p!=='\\')q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='/'&&html[i+1]==='*'){i=html.indexOf('*/',i)+1;continue;}if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}if(c==='{')d++;else if(c==='}'&&--d===0)return html.slice(start,i+1);}throw Error(name);}
const extra=['monthTideForSite','todayKstMonth','birdmapDataStamp','loadBirdmapData','loadWeatherToday','loadWeatherWeek','loadTideToday','tideTodayDateText','tideTodayIsCurrent','refreshBirdmapData','refreshTodayPanelIfOpen'];
const names=[...new Set([...vm.runInNewContext(helper.match(/const NAMES = (\[[\s\S]*?\]);/)[1]),...extra])];
const constants=[html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0],html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0],html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0],...[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]),html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0]].join('\n');
const factory=new Function('ctx','Date','fetch','document','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,tideToday=ctx.todayTide||null,siteData=ctx.sites,loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.recent;var birdmapDataSeq={},birdmapDataStarted=false,birdmapLastDataCheck=0,BIRDMAP_REFRESH_MIN_GAP_MS=30000;var renderCount=0,popupRefreshCount=0;function renderTodayPanel(){renderCount++;}function refreshOpenBirdPopup(){popupRefreshCount++;}function loadRecommendationWeatherRules(){return Promise.resolve();}function loadTideMonth(){return Promise.resolve();}'+constants+'\n'+names.map(source).join('\n')+'\nreturn {'+names.join(',')+',setFetch:function(fn){fetch=fn;},getState:function(){return {today:weatherToday,week:weatherWeek,seq:{...birdmapDataSeq},renderCount,popupRefreshCount};}};');
const day='2026-10-10',clock=day+'T11:00:00+09:00';class Clock extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return new Date(clock).getTime();}}
const raw=(stamp,rain='강수 없음')=>({date:day,generatedAt:stamp,refreshedAt:stamp,forecastTime:day+' 12:00 KST',score:92,grade:'★★★★★',scoreEligible:true,missingScoreFields:[],stale:false,wind:'북풍 3m/s',rain,wave:'0.3m',temperature:'20°C'});
const today=(stamp,rain)=>({date:day,generatedAt:stamp,updated:stamp,sites:{14:raw(stamp,rain)}});
const week=(stamp,rain=0,eligible=true)=>({startDate:day,endDate:'2026-10-16',generatedAt:stamp,updated:stamp,sampleIntervalHours:3,sites:{14:{name:'걸매리',days:{[day]:{samples:[{forecastTime:day+' 12:00 KST',windSpeed:3,windDirectionDeg:0,windName:'북풍',precipitation3h:rain,waveM:.3,score:eligible?92:null,grade:'★★★★★',scoreEligible:eligible,missingScoreFields:eligible?[]:['precipitation'],isPastAtGeneration:false}]}}}}});
const tide={sites:{14:{days:[{date:day,highTide:'12:00',highTideLevel:'900'}]}}},newStamp=day+' 10:40 KST',oldStamp=day+' 10:30 KST';
const ok=body=>Promise.resolve({ok:true,json:()=>Promise.resolve(body)});
function make(override={}){return factory({todayTide:{date:day,generatedAt:day+' 10:30 KST',sites:{}},week:null,today:today(day+' 05:41 KST'),tide,sites:[site],rules,notices:[{siteId:14,published:true}],recent:{14:{latestDate:day,species:['참새','박새','울새','직박구리']}},...override},Clock,()=>Promise.reject(Error('offline')),{hidden:false,getElementById:()=>({style:{display:'block'}})});}
function snap(api){const state=api.getState(),top=api.todayRecommendedSites();return {todayStamp:state.today?.generatedAt??null,weekStamp:state.week?.generatedAt??null,topIds:top.map(e=>String(e.site.id)),top:top.map(e=>({raw:e.score,rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus??0,sourceKind:e.today?._weatherState?.kind,sourceEligible:e.today?._weatherState?.scoreEligible,safe:api.weeklyRecommendationIsSafe(e)})),renderCount:state.renderCount,popupRefreshCount:state.popupRefreshCount};}
const rows=[];
for(const route of ['today','week']){
 const api=make(),load=()=>route==='today'?api.loadWeatherToday():api.loadWeatherWeek(),older=route==='today'?today(oldStamp):week(oldStamp),newer=route==='today'?today(newStamp):week(newStamp);
 let releaseOld,calls=0;api.setFetch(()=>++calls===1?new Promise(r=>{releaseOld=()=>r({ok:true,json:()=>Promise.resolve(older)});}):ok(newer));
 const first=load(),second=load();const secondApplied=await second;api.refreshTodayPanelIfOpen();const afterNew=snap(api);releaseOld();const firstApplied=await first;api.refreshTodayPanelIfOpen();const afterLate=snap(api);
 assert.equal(firstApplied,false);assert.equal(secondApplied,true);assert.equal(route==='today'?afterLate.todayStamp:afterLate.weekStamp,newStamp);
 rows.push({scenario:'older_request_late_'+route,firstApplied,secondApplied,afterNew,afterLate,expectedOldRequestIgnored:true,propertyPass:true});
}
for(const route of ['today','week']){
 const api=make(),load=()=>route==='today'?api.loadWeatherToday():api.loadWeatherWeek(),newerUnsafe=route==='today'?today(newStamp,'3시간 강수 1mm'):week(newStamp,1),olderSafe=route==='today'?today(oldStamp):week(oldStamp);
 api.setFetch(()=>ok(newerUnsafe));const newApplied=await load();api.refreshTodayPanelIfOpen();const afterNew=snap(api);assert.equal(afterNew.topIds.length,0);
 api.setFetch(()=>ok(olderSafe));const oldApplied=await load();api.refreshTodayPanelIfOpen();const afterOld=snap(api);assert.equal(oldApplied,true);assert.deepEqual(afterOld.topIds,['14']);
 rows.push({scenario:'later_request_older_publication_safety_reversal_'+route,newApplied,oldApplied,afterNew,afterOld,newerInput:{stamp:newStamp,rainMm:1},olderInput:{stamp:oldStamp,rainMm:0},expectedNoOlderPublicationRollback:true,propertyPass:false,actualBehaviorReproduced:true});
}
{
 const api=make();api.setFetch(()=>ok(today(newStamp)));await api.loadWeatherToday();const afterNew=snap(api);api.setFetch(()=>ok(today(day+' 05:41 KST')));const applied=await api.loadWeatherToday();api.refreshTodayPanelIfOpen();const afterOld=snap(api);assert.equal(afterOld.topIds.length,0);
 rows.push({scenario:'later_request_older_reference_invalidates_valid_today',applied,afterNew,afterOld,expectedPublishedStateMonotonic:true,propertyPass:false,actualBehaviorReproduced:true,safetyDirection:'No ineligible recommendation; unnecessary loss of the newer valid data.'});
}
{
 const api=make();api.setFetch(()=>ok(week(newStamp)));await api.loadWeatherWeek();const afterNew=snap(api);api.setFetch(()=>ok(week(oldStamp,0,false)));const applied=await api.loadWeatherWeek();api.refreshTodayPanelIfOpen();const afterOld=snap(api);assert.equal(afterOld.topIds.length,0);
 rows.push({scenario:'later_request_older_ineligible_week_invalidates_valid_week',applied,afterNew,afterOld,expectedPublishedStateMonotonic:true,propertyPass:false,actualBehaviorReproduced:true,safetyDirection:'No ineligible recommendation; unnecessary loss of the newer valid data.'});
}
{
 const api=make();api.setFetch(()=>ok(today(newStamp)));await api.loadWeatherToday();api.setFetch(()=>Promise.reject(Error('offline')));const before=snap(api),changed=await api.refreshBirdmapData(true),after=snap(api);assert.equal(changed,false);assert.deepEqual(after.topIds,before.topIds);assert.equal(after.todayStamp,before.todayStamp);
 rows.push({scenario:'network_error_retains_valid_today',changed,before,after,propertyPass:true});
}
{
 const invalidToday=today(newStamp);invalidToday.sites[14].wind=null;const api=make({today:invalidToday}),before=snap(api);api.setFetch(url=>ok(url.includes('weather_week')?week(newStamp):url.includes('tide_today')?{date:day,generatedAt:newStamp,sites:{}}:invalidToday));const changed=await api.refreshBirdmapData(true),after=snap(api);assert.equal(before.topIds.length,0);assert.deepEqual(after.topIds,['14']);assert.equal(after.top[0].sourceKind,'week_forecast');
 rows.push({scenario:'ineligible_today_normal_week_alternative_recovers',changed,before,after,propertyPass:true});
}
const result={sha:head,clock,sourceDigest:createHash('sha256').update(html).digest('hex'),sourceFunctionHashes:Object.fromEntries(extra.map(n=>[n,createHash('sha256').update(source(n)).digest('hex')])),summary:{conditions:rows.length,propertyPass:rows.filter(r=>r.propertyPass).length,propertyFail:rows.filter(r=>!r.propertyPass).length},rows,constraints:{actualProductFunctions:true,actualDom:false,mockedFetchOnlyMemory:true,mockedDependencies:['DOM visibility','panel renderer and popup refresh counters'],networkCalls:0,productionD1Writes:0,productChanges:0,coordinatesLogged:false}};
fs.writeFileSync(path.join(out,'loader_replay.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
