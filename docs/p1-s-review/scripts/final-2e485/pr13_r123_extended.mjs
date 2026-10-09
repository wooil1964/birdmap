/* PR #13 actual-product independent S2 verification. Read-only Git sources + synthetic memory.
 No patched contract wrappers; expectations are compared to real PR functions. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url))),
 referenceRepo=path.resolve(process.argv[4]||'C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap');
const HEAD='2e485079a34fa5aeeef09e82f3b996bf2696d978',MAIN='b0975cad9f3112af38cc286a892bf6f06722ce12';
const config=Number(process.env.GIT_CONFIG_COUNT||0);process.env.GIT_CONFIG_COUNT=String(config+2);
for(const [i,p] of [[config,repo],[config+1,referenceRepo]]){process.env['GIT_CONFIG_KEY_'+i]='safe.directory';process.env['GIT_CONFIG_VALUE_'+i]=p;}
const sha=b=>createHash('sha256').update(b).digest('hex'),git=(ref,file)=>execFileSync('git',['show',ref+':'+file],{cwd:repo,maxBuffer:1<<28}).toString('utf8');
assert.equal(sha(fs.readFileSync(path.join(repo,'index.html'),'utf8').replace(/\r\n/g,'\n')),sha(git(HEAD,'index.html').replace(/\r\n/g,'\n')),'archive must match explicit PR head');
const {loadP1C}=await import(pathToFileURL(path.join(referenceRepo,'docs/recommendation-masterplan/_scripts/p1c_runtime.mjs')));
const rt=loadP1C(),html=git(HEAD,'index.html'),helper=git(HEAD,'.github/scripts/test_weekly_recommendation.mjs');
function source(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);let depth=0,quote=null;
 for(let i=html.indexOf('{',start);i<html.length;i++){const c=html[i],p=html[i-1];if(quote){if(c===quote&&p!=='\\')quote=null;continue;}
 if(c==='"'||c==="'"){quote=c;continue;}if(c==='/'&&html[i+1]==='*'){i=html.indexOf('*/',i)+1;continue;}
 if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(start,i+1);}throw Error('unbalanced '+name);}
const names=[...new Set([...vm.runInNewContext(helper.match(/const NAMES = (\[[\s\S]*?\]);/)[1]),
 'monthTideForSite','todayKstMonth','weatherScoreAllowed','storedWeatherState','weatherTimeMs','weatherLatestDue',
 'v251EffectiveScore','v251GradeStars','v251ScoreDisplayText','todayWeatherFromWeek','weatherTodayForSite',
 'applyLiveWeatherToPopup','liveWeatherResponseCurrent','liveWeatherComponents','liveWeatherUsableNumber','liveWeatherNumber','liveWeatherSky','liveWeatherPrecipitationText','liveWeatherRepresentativeText'])];
const constants=[html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0],html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0],
 html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0],...[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]),
 html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0],
 html.match(/var LIVE_WEATHER_VALUE_RANGES=\{[\s\S]*?\};/)[0], 'var LIVE_WEATHER_CACHE_TTL_MS=15*60*1000,LIVE_WEATHER_REQUEST_TIMEOUT_MS=12000;'].join('\n');
const functions=names.map(source).join('\n');
const factory=new Function('ctx','Date','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
 'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+
 'var liveWeatherCurrentPopup=ctx.liveWeatherCurrentPopup,setLiveWeatherField=ctx.setLiveWeatherField,setLiveWeatherMissing=ctx.setLiveWeatherMissing;'+
 'var v24BriefingInterpretation=ctx.v24BriefingInterpretation,tideTodayForSite=ctx.tideTodayForSite,applyLiveTomorrow=ctx.applyLiveTomorrow;'+
 constants+'\n'+functions+'\nreturn {'+names.join(',')+'};');
const DAY='2026-10-10',DAY2='2026-10-11',NOW='2026-10-10T08:00:00+09:00';
function make(state={},clock=NOW){const Clock=class extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return new Date(clock).getTime();}};
 return factory({...rt.data,sites:rt.sites,sightings:rt.sightings,...state},Clock);}
const tideSite=rt.sites.find(s=>String(s.id)==='14'),islandSite=rt.sites.find(s=>String(s.id)==='3'),boatSite=rt.sites.find(s=>String(s.id)==='48');
const general={...tideSite,id:'501',name:'Synthetic general',env:'숲',island:false,showWave:false,pelagic:false,weatherRuleKey:'general_birding'};
function sample(value=92,extra={},date=DAY,time='12:00'){return {forecastTime:date+' '+time+' KST',windSpeed:3,windDirectionDeg:0,windName:'북풍',gust:5,precipitation3h:0,
 temperature:20,visibilityKm:15,cloudPct:20,waveM:.3,score:value,grade:value===0?'★':'★★★★★',scoreEligible:true,missingScoreFields:[],isPastAtGeneration:false,...extra};}
function today(value=92,extra={},date=DAY){return {date,forecastTime:date+' 12:00 KST',generatedAt:date+' 07:00 KST',score:value,grade:value===0?'★':'★★★★★',
 scoreEligible:true,missingScoreFields:[],stale:false,dataUnavailable:false,wind:'북풍 3m/s',rain:'강수 없음',wave:'0.3m',...extra};}
function state(site,samples,options={}){return {sites:[site],week:samples?{startDate:DAY,endDate:DAY2,sampleIntervalHours:3,generatedAt:DAY+' 07:00 KST',
 sites:{[site.id]:{days:{[DAY]:{samples}}}}}:null,today:null,tide:{sites:{[site.id]:{days:[{date:DAY,highTide:'12:00',highTideLevel:'900'}]}}},
 notices:[{published:true,siteIds:[site.id]}],sightings:{[site.id]:{latestDate:DAY,species:['일반종A','일반종B','일반종C','일반종D']}},...options};}
function compact(api,s){const e=api.weeklyRecommendationForSite(s,api.weeklyInfo());const rank=e?api.weeklyRankScore(e):null;
 return {candidate:!!e,score:e?.score??null,rank:Number.isFinite(rank)?rank:rank===null?null:String(rank),bonus:e?.recentReport?.bonus??0,mandatory:!!e?.isMandatory,
 safe:e?api.weeklyRecommendationIsSafe(e):null,date:e?.recommendationDate??null,time:e?.recommendationTime??null,tideText:e?.tideText??null,
 topIds:api.todayRecommendedSites().map(x=>String(x.site.id)),popupScore:e?.today?api.v251EffectiveScore(e.today):null};}

const rows=[];const push=(id,actual,expected,scope='synthetic actual product')=>rows.push({id,actual,expected,pass:actual===expected,scope});
const todayState=(s,raw,extra={})=>state(s,null,{today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[s.id]:raw}},...extra});
function snapshot(api,s){const e=api.weeklyRecommendationForSite(s,api.weeklyInfo()),p=api.weatherTodayForSite(s);
 return {candidate:!!e,raw:e?.score,rank:e?api.weeklyRankScore(e):null,safe:e?api.weeklyRecommendationIsSafe(e):null,top:api.todayRecommendedSites().map(x=>String(x.site.id)),
 candidateState:e?.today?e.today._weatherState:null,cardDisplay:e?.today?api.v251ScoreDisplayText(e.today):null,
 cardScoreAllowed:e?.today?api.weatherScoreAllowed(e.today):false,popupDisplay:p?api.v251ScoreDisplayText(p):null,popupState:p?._weatherState,
 popupWind:p?.wind,popupRaw:p?.score};
}
const malformed=[
 ['no_direction','3m/s'],['no_speed','북풍'],['unknown_direction','동북풍 3m/s'],['empty',''],['null',null],['undefined',undefined],
 ['negative','북풍 -3m/s'],['nan','북풍 NaNm/s'],['infinity','북풍 Infinitym/s'],['unit_missing','북풍 3'],
 ['direction_only_unit','북풍 m/s'],['decimals_bad','북풍 3..1m/s'],['plus','북풍 +3m/s'],['exponent','북풍 1e2m/s']];
for(const [label,wind] of malformed)for(const s of [general,tideSite,islandSite]){
 const api=make(todayState(s,today(92,{wind})));push('wind-'+label+'-'+s.id,!!api.weeklyRecommendationForSite(s,api.weeklyInfo()),false);
}
for(const s of [general,tideSite,islandSite]){
 const raw=today();delete raw.wind;delete raw.rain;delete raw.wave;
 const api=make(todayState(s,raw));push('all-weather-own-absent-'+s.id,api.todayRecommendedSites().length,0);
 for(const key of ['score','scoreEligible','missingScoreFields']){
  for(const route of ['today','week']){
   const entry=route==='today'?today():sample(),inherited=entry[key];delete entry[key];Object.setPrototypeOf(entry,{[key]:inherited});
   const api=make(route==='today'?todayState(s,entry):state(s,[entry]));push('inherited-'+key+'-'+route+'-'+s.id,api.todayRecommendedSites().length,0);
  }
 }
}
for(const [label,wave,expected] of [['null',null,true],['undefined',undefined,true],['empty','',false],['normal','0.3m',true],['number',.3,false],['negative','-0.3m',false],['missing-leading-zero','.3m',false]]){
 for(const s of [general,islandSite]){
  const api=make(todayState(s,today(92,{wave}))),expect=s===islandSite&&(wave===null||wave===undefined)?false:expected;
  push('optional-formatted-wave-'+label+'-'+s.id,api.weeklyTodayRecommendable(today(92,{wave}),s),expect);
 }
}
const formats=[
 ['normal',{wind:'북동풍 3.6m/s',rain:'3시간 강수 0.5mm',wave:'0.7m'},true],
 ['trim',{wind:' 북풍 3m/s ',rain:' 강수 없음 ',wave:' 0.3m '},true],
 ['unicode_digits',{wind:'북풍 ٣m/s',rain:'3시간 강수 ٠mm',wave:'٠.٣m'},false],
 ['extreme_wind',{wind:'북풍 '+'9'.repeat(400)+'m/s'},false],
 ['extreme_rain',{rain:'3시간 강수 '+'9'.repeat(400)+'mm'},false],
 ['extreme_wave',{wave:'9'.repeat(400)+'m'},false],
 ['finite_large',{wind:'북풍 10000m/s'},true]];
const formatDetails=[];
for(const [label,fields,expected] of formats){
 const raw=today(92,fields),api=make(todayState(general,raw)),detail=snapshot(api,general);
 formatDetails.push({label,windNumber:api.v24WindNumber(raw.wind),rainAmount:api.v251RainInfo(raw),waveNumber:api.v24WaveNumber(raw.wave),...detail});
 push('formatted-data-'+label,api.weeklyTodayRequiredDataValid(raw,general),expected);
}
const uiBeforeAfter=[];
for(const ref of ['7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e',HEAD]){
 const content=git(ref,'index.html'),fields=names.filter(n=>content.includes('function '+n+'('));
 const extractor=(name)=>{const newer=html;return sourceFrom(content,name);};
 function sourceFrom(h,name){const start=h.indexOf('function '+name+'(');let d=0,q=null;for(let i=h.indexOf('{',start);i<h.length;i++){const c=h[i],p=h[i-1];if(q){if(c===q&&p!=='\\')q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='/'&&h[i+1]==='*'){i=h.indexOf('*/',i)+1;continue;}if(c==='/'&&h[i+1]==='/'){i=h.indexOf('\n',i);continue;}if(c==='{')d++;else if(c==='}'&&--d===0)return h.slice(start,i+1);}throw Error(name);}
 const body=fields.map(extractor).join('\n'),f=new Function('ctx','Date','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
 'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+constants+body+';return {'+fields.join(',')+'};');
 const Clock=class extends Date{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return new Date(NOW).getTime();}};
 const input=todayState(tideSite,today()),a=f({...rt.data,sightings:rt.sightings,...input},Clock);
 const result=snapshot(a,tideSite);uiBeforeAfter.push({head:ref,route:'valid today-only tide fallback',...result});
}
push('valid-tide-today-card-score-visible',uiBeforeAfter[1].cardScoreAllowed,true,'actual candidate → index.html recommendation card line 4343 display call; DOM rendered independently by parent');
push('valid-tide-today-popup-score-visible',!!uiBeforeAfter[1].popupState?.scoreEligible,true,'actual weatherTodayForSite popup route');
const provenance=[];
for(const [label,raw,week,expected] of [
 ['normal-saved',today(),null,true],
 ['missing-eligibility-forged-state',today(92,{scoreEligible:undefined,_weatherState:{dataCurrent:true,scoreEligible:true}}),null,false],
 ['missing-wind-forged-state',today(92,{wind:null,_weatherState:{dataCurrent:true,scoreEligible:true}}),null,false],
 ['previous-saved',today(92,{},'2026-10-09'),null,false],
 ['previous-saved-with-week-derived',today(92,{},'2026-10-09'),[sample()],true],
 ['null-today-week-derived',null,[sample()],true],
 ['invalid-week-derived',null,[sample(92,{precipitation3h:null})],false],
 ['stale-valid-saved',today(92,{stale:true}),null,false],
 ['off-schedule-reference',today(92,{generatedAt:DAY+' 05:00 KST'}),null,false],
 ['null-score',today(null),null,false]]){
 const st=state(general,week,{today:raw?{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[general.id]:raw}}:null}),api=make(st),p=api.weatherTodayForSite(general);
 const actual=api.weatherScoreAllowed(p),d={id:label,expected,allowed:actual,display:api.v251ScoreDisplayText(p),state:p?._weatherState,raw:p?.score,wind:p?.wind};
 provenance.push(d);push('provenance-'+label,actual,expected);
}
const directForgery={...today(92,{scoreEligible:undefined}),_weatherState:{scoreEligible:true}};
const aForgery=make(todayState(general,directForgery));
const forgery={directHelperAllowed:aForgery.weatherScoreAllowed(directForgery),normalPopupAllowed:aForgery.weatherScoreAllowed(aForgery.weatherTodayForSite(general)),
 note:'Private _weatherState is trusted by display helper. Raw data ingestion recomputes and replaces it; direct helper result is not a production bypass.'};
const live=[];
for(const [label,raw,week,expected] of [
 ['normal',today(),null,true],['unknown-eligibility',today(92,{scoreEligible:undefined}),null,false],
 ['missing-wind',today(92,{wind:null}),null,false],['previous-saved',today(92,{},'2026-10-09'),null,false],
 ['normal-week-derived',null,[sample()],true],['invalid-week-derived',null,[sample(92,{windSpeed:null})],false],
 ['null-score',today(null),null,false]]){
 const fields={},captured=[];const dom={liveWeatherCurrentPopup:()=>({}),setLiveWeatherField:(_c,k,v)=>{fields[k]=v;return !!v;},
 setLiveWeatherMissing:(_c,k)=>{fields[k]='자료 없음';return true;},v24BriefingInterpretation:(_s,t)=>{captured.push(t);return 'synthetic interpretation stub';},tideTodayForSite:()=>null,applyLiveTomorrow:()=>false};
 const input=state(general,week,{today:raw?{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[general.id]:raw}}:null,...dom}),api=make(input);
 let updateCount=0;const data={ok:true,siteId:general.id,generatedAt:NOW,observation:{dataTime:NOW,temperature:20,windDirection:'북풍',windDirectionDegrees:0,windSpeed:3,rain:0,humidity:50,weatherText:'맑음'}};
 const applied=api.applyLiveWeatherToPopup(general,{update(){updateCount++;}},data,false),merged=captured.at(-1);
 const actual=api.weatherScoreAllowed(merged);live.push({id:label,applied,updateCount,expected,scoreAllowed:actual,scoreDisplay:fields.score,raw:merged?.score,state:merged?._weatherState,wind:fields.windSpeed});
 push('live-merge-'+label,actual,expected,'actual applyLiveWeatherToPopup and live time/range predicates; only DOM sinks/interpretation/tide lookup stubbed');
}
const baselinePath=path.resolve(process.argv[5]||path.join(out,'baseline7eb_actual_matrix.json'));
const old=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
const current=JSON.parse(fs.readFileSync(path.join(out,'pr13_r123_actual_matrix.json'),'utf8'));
const repaired={matrix:old.rows.filter(x=>!x.contractPass).map(x=>({id:x.id,old:false,new:current.rows.find(n=>n.id===x.id)?.contractPass})),
 special:old.specials.filter(x=>!x.expectedPass).map(x=>({id:x.id,old:false,new:current.specials.find(n=>n.id===x.id)?.expectedPass})),
 popup:old.popup.filter(x=>!x.contractPass).map(x=>({id:x.id,old:false,new:current.popup.find(n=>n.id===x.id)?.contractPass}))};
const report={head:HEAD,previousHead:old.head,evaluationTime:NOW,mode:'actual product function extraction; no guard wrappers or replacements',rows,
 passed:rows.filter(x=>x.pass).length,total:rows.length,failed:rows.filter(x=>!x.pass),formatDetails,uiBeforeAfter,provenance,forgery,live,repaired,
 baselinePath,lineReferences:{candidateFallback:'index.html:3886-3898',weatherScoreAllowed:'index.html:2086-2088',panelDisplay:'index.html:4343',popupResolution:'index.html:2107-2118'},
 scope:'Synthetic contract data. Extreme decimal strings are valid JSON inputs, not observed generator weather. Immutable real snapshot tested separately.'};
fs.writeFileSync(path.join(out,'pr13_r123_extended.json'),JSON.stringify(report,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v,2)+'\n');
console.log(JSON.stringify({head:HEAD,total:report.total,passed:report.passed,failed:report.failed,uiBeforeAfter,forgery,live,repaired},null,2));


