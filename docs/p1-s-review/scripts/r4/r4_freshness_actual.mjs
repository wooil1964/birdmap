/* PR #13 actual-product independent S2 verification. Read-only Git sources + synthetic memory.
 No patched contract wrappers; expectations are compared to real PR functions. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url))),
 referenceRepo=path.resolve(process.argv[4]||'C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap');
const HEAD='8ccb248faa2c5c7b5a6019d12e19e21031169460',MAIN='b0975cad9f3112af38cc286a892bf6f06722ce12';
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

// New independent source-level R4 freshness fixtures. Same date/noon/tide: no cross-date semantic confusion.
const OLD='1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c';
const clock='2026-10-10T11:00:00+09:00';
function refApi(ref,input){
 const content=git(ref,'index.html'),fields=names.filter(n=>content.includes('function '+n+'('));
 function sourceFrom(h,name){const start=h.indexOf('function '+name+'(');let d=0,q=null;for(let i=h.indexOf('{',start);i<h.length;i++){const c=h[i],p=h[i-1];if(q){if(c===q&&p!=='\\')q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='/'&&h[i+1]==='*'){i=h.indexOf('*/',i)+1;continue;}if(c==='/'&&h[i+1]==='/'){i=h.indexOf('\n',i);continue;}if(c==='{')d++;else if(c==='}'&&--d===0)return h.slice(start,i+1);}throw Error(name);}
 const body=fields.map(n=>sourceFrom(content,n)).join('\n'),f=new Function('ctx','Date','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+constants+body+';return {'+fields.join(',')+'};');
 const Clock=class extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return new Date(clock).getTime();}};
 return f({...rt.data,sightings:rt.sightings,...input},Clock);
}
function snap(a,s){const e=a.weeklyRecommendationForSite(s,a.weeklyInfo()),p=a.weatherTodayForSite(s);return {candidate:!!e,top:a.todayRecommendedSites().map(e=>String(e.site.id)),raw:e?.score,rank:e?a.weeklyRankScore(e):null,safe:e?a.weeklyRecommendationIsSafe(e):null,card:e?a.v251ScoreDisplayText(e.today):null,cardAllowed:e?a.weatherScoreAllowed(e.today):false,cardState:e?.today?._weatherState,popup:a.v251ScoreDisplayText(p),popupAllowed:a.weatherScoreAllowed(p),popupState:p?._weatherState};}
const raw=(extra={})=>today(92,{generatedAt:DAY+' 10:30 KST',...extra});
const cases=[['normal',raw()],['same_day_generation_delayed',raw({generatedAt:DAY+' 05:41 KST'})],['future_generated',raw({generatedAt:DAY+' 12:30 KST'})],['malformed_generated',raw({generatedAt:'not-a-timestamp'})],['missing_generated_and_root',raw({generatedAt:undefined}),null],['forecast_previous_but_date_current',raw({forecastTime:'2026-10-09 12:00 KST'})],['previous_saved',raw({date:'2026-10-09',forecastTime:'2026-10-09 12:00 KST',generatedAt:'2026-10-09 23:44 KST',stale:true,scoreEligible:false,fallbackSource:'previous_saved'})],['previous_day_lies_eligible',raw({date:'2026-10-09',forecastTime:'2026-10-09 12:00 KST',generatedAt:'2026-10-09 23:44 KST'})],['explicit_stale',raw({stale:true})],['wind_missing',raw({wind:null})],['rain_missing',raw({rain:null})],['eligible_missing',raw({scoreEligible:undefined})],['eligible_null',raw({scoreEligible:null})],['eligible_false',raw({scoreEligible:false})]];
cases.push(['generator_sparse6h_delayed',JSON.parse(fs.readFileSync(path.join(out,'sparse6h_generated_today.json'),'utf8')).sites['14']]);
const rows=[];
for(const [id,r,gen] of cases)for(const s of [tideSite,general]){
 const input=state(s,null,{today:{date:DAY,generatedAt:gen===null?undefined:gen||DAY+' 10:30 KST',sites:{[s.id]:r}}});
 const before=snap(refApi(OLD,input),s),after=snap(refApi(HEAD,input),s);rows.push({id,route:s===tideSite?'tide_today':'ordinary_today',before,after,newDisplayPromotion:!before.cardAllowed&&after.cardAllowed,cardPopupMismatch:after.candidate&&after.card!==after.popup});
}
const normalScores=[];for(const score of [0,92,92.5,100]){const r=raw({score,grade:score===0?'★':'★★★★★'}),input=state(tideSite,null,{today:{date:DAY,generatedAt:DAY+' 10:30 KST',sites:{14:r}}});const d=snap(refApi(HEAD,input),tideSite);assert.equal(d.card,d.popup);assert.equal(d.rank,score+16);normalScores.push({score,...d});}
const report={head:HEAD,before:OLD,evaluationTime:clock,mode:'Exact Git functions; frozen clock; synthetic source only; no product guard modifications.',normalScores,rows,newMismatches:rows.filter(r=>r.newDisplayPromotion&&r.cardPopupMismatch),notes:['All problematic cases use same-day forecast and same-noon tide except explicitly named forecast-date mismatch.','Ordinary fallback already fabricated dataCurrent=true on old1bd. New tide fallback gains that behavior.','previous_saved and previous date remain excluded in actual candidate paths.']};
fs.writeFileSync(path.join(out,'r4_freshness_actual.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({head:HEAD,totalRows:rows.length,normalScores:normalScores.map(x=>({score:x.score,card:x.card,popup:x.popup,rank:x.rank})),newMismatches:report.newMismatches.map(r=>({id:r.id,route:r.route,oldCard:r.before.card,newCard:r.after.card,popup:r.after.popup,popupState:r.after.popupState})),previous:rows.filter(r=>r.id.startsWith('previous')).map(r=>({id:r.id,route:r.route,before:r.before.candidate,after:r.after.candidate}))},null,2));

