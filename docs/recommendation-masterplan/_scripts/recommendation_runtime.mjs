/* Analysis-only source extraction. Reads immutable Git objects/snapshots. No application writes. */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import {execFileSync} from 'node:child_process'; import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export const DOCS=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const ROOT=path.resolve(DOCS,'../..');
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function loadRuntime(manifestPath, options={}){
 const manifest=JSON.parse(fs.readFileSync(path.resolve(ROOT,manifestPath)));
 const map=new Map(manifest.files.map(f=>{
  let raw=f.snapshotPath?gunzipSync(fs.readFileSync(path.resolve(ROOT,f.snapshotPath))):
   execFileSync('git',['show',(f.sourceCommit||manifest.codeCommit)+':'+f.path],{cwd:ROOT,maxBuffer:1<<28});
  assert.equal(sha256(raw),f.sha256,f.path+' hash mismatch'); return [f.path,raw];
 }));
 const text=f=>map.get(f).toString('utf8'), json=f=>JSON.parse(text(f));
 const html=text('index.html'), helper=text('.github/scripts/test_weekly_recommendation.mjs');
 const context=vm.createContext({});vm.runInContext(html.match(/var siteData=([^\n]+);/)[0]+'\n'+html.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0],context);
 const sites=JSON.parse(JSON.stringify(context.siteData));assert.equal(sites.length,190);assert.equal(new Set(sites.map(s=>String(s.id))).size,190);
 function source(name){
  const start=html.indexOf('function '+name+'(');assert.ok(start>=0,'missing '+name);let depth=0,quote=null;
  for(let i=html.indexOf('{',start);i<html.length;i++){const c=html[i],p=html[i-1];
   if(quote){if(c===quote&&p!=='\\')quote=null;continue;}
   if(c==='"'||c==="'"){quote=c;continue;}
   if(c==='/'&&html[i+1]==='*'){i=html.indexOf('*/',i)+1;continue;}
   if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}
   if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(start,i+1);
  }throw Error('unbalanced '+name);
 }
 const names=[...new Set([...vm.runInNewContext(helper.match(/const NAMES = (\[[\s\S]*?\]);/)[1]),
  'monthTideForSite','todayKstMonth','weatherScoreAllowed','storedWeatherState','weatherTimeMs','weatherLatestDue',
  'v251EffectiveScore','v251GradeStars','v251ScoreDisplayText','todayWeatherFromWeek','weatherTodayForSite'])];
 const constants=html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0]+'\n'+html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0]+'\n'+
  html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0]+'\n'+[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]).join('\n')+'\n'+
  html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0];
 const functions=names.map(source).join('\n');
 const reportBytes=fs.readFileSync(path.resolve(ROOT,manifest.recentSites.path));assert.equal(sha256(reportBytes),manifest.recentSites.sha256);
 const reports=JSON.parse(reportBytes);assert.equal(reports.ok,true);
 assert.ok(Object.keys(reports).every(k=>['ok','days','since','today','sites'].includes(k)));
 assert.ok(reports.sites.every(s=>Object.keys(s).every(k=>['siteId','latestDate','species'].includes(k))));
 const sightings=Object.fromEntries(reports.sites.filter(s=>s.siteId&&/^\d{4}-\d{2}-\d{2}$/.test(s.latestDate)&&Array.isArray(s.species))
  .map(s=>[String(s.siteId),{latestDate:String(s.latestDate),species:s.species.map(String)}]));
 const data={week:json('weather_week.json'),today:json('weather_today.json'),tide:json('tide_month.json'),notices:json('notices.json'),rules:json('weather_rules.json')};
 const factory=new Function('ctx','Date',
  'var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
  'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+constants+'\n'+functions+
  '\nvar originalAutumn=autumnBalancedRecommendations;'+
  'return {'+names.join(',')+',setSites:function(s){siteData=s;},setSelector:function(fn){autumnBalancedRecommendations=fn||originalAutumn;}};');
 function makeApi(withReports=true, order=sites, now=options.now||manifest.evaluationTime){
  const Clock=class extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}};
  return factory({...data,sites:order,sightings:withReports?sightings:{}},Clock);
 }
 return {manifest,sites,data,reports,sightings,makeApi,source,functions,functionsHash:sha256(functions),coreFieldIds:[7,8,10,15,20],
  canonical:s=>data.rules.aliases?.[s.weatherRuleKey]||s.weatherRuleKey||'general_birding'};
}
export function distribution(values){const out={};for(const v of values){const k=typeof v==='number'&&Number.isFinite(v)?String(v):'unknown';out[k]=(out[k]||0)+1;}return out;}
export function compactTop(api){return api.todayRecommendedSites().map((e,i)=>({position:i+1,id:String(e.site.id),name:e.site.name,
 raw:e.score,display:e.today?api.v251EffectiveScore(e.today):null,rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,
 date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis,basis:e.basisText}));}
export function candidateRows(rt, api){
 const week=api.weeklyInfo();return rt.sites.map(site=>{const e=api.weeklyRecommendationForSite(site,week);
  return {id:String(site.id),name:site.name,entry:e,gate:e?api.weeklyRecommendationIsSafe(e):null};});
}
