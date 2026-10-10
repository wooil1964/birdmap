/* PR #13 actual-product independent S2 verification. Read-only Git sources + synthetic memory.
 No patched contract wrappers; expectations are compared to real PR functions. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url))),
 referenceRepo=path.resolve(process.argv[4]||'C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap');
const HEAD='a35b8598d55890e705042e4d6f88621357749d09',MAIN='bf74095adb3bf0b13f1aca31193c8d03cf8ff53f';
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
 'v251EffectiveScore','v251GradeStars','v251ScoreDisplayText','todayWeatherFromWeek','weatherTodayForSite'])];
const constants=[html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0],html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0],
 html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0],...[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]),
 html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0]].join('\n');
const functions=names.map(source).join('\n');
const factory=new Function('ctx','Date','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
 'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+
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


export {fs,path,sha,source,html,HEAD,MAIN,make,state,sample,today,compact,general,tideSite,islandSite,boatSite,DAY,rt};
