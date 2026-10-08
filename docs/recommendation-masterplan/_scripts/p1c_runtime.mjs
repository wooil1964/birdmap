/* P1-C isolated analysis runtime. Product functions/data are immutable. */
import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
import {loadRuntime,ROOT} from './recommendation_runtime.mjs';
export const MANIFEST='docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json';
export const SCENARIOS=[
 {id:'reports_off',reports:false},
 ...[0,2,4,8,12,16,24].map(cap=>({id:'cap_'+cap,reports:true,cap})),
 {id:'visit_date_cap16',reports:true,cap:16,dateBasis:'visit'},
 {id:'latest_age7_cap16',reports:true,cap:16,maxLatestAge:7},
 {id:'recency_only_cap16',reports:true,cap:16,recencyOnly:true},
 {id:'cap0_without_report_tie',reports:true,cap:0,disableReportTie:true}
];
export function loadP1C(){
 const rt=loadRuntime(MANIFEST),html=execFileSync('git',['show',rt.manifest.codeCommit+':index.html'],{cwd:ROOT,maxBuffer:1<<28}).toString('utf8');
 const constants=[html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0],html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0],
 html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0],...[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]),
 html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0]].join('\n');
 const names=[...rt.functions.matchAll(/^function (\w+)\(/gm)].map(m=>m[1]);
 const hook=`
 var baseCandidate=weeklyRecommendationForSite,baseBonus=weeklyRecentReportBonus,baseTie=weeklyRecentTieBreak,observer=null;
 var policy=ctx.policy||{};
 if(policy.cap!==undefined)WEEKLY_RECENT_BONUS_MAX=policy.cap;
 if(policy.disableReportTie)weeklyRecentTieBreak=function(){return 0;};
 weeklyRecommendationForSite=function(site,week){
  var e=baseCandidate(site,week);
  if(!e){if(observer)observer(site,null);return null;}
  if(policy.dateBasis==='visit')e.recentReport=baseBonus(site,e.recommendationDate);
  if(e.recentReport&&policy.maxLatestAge!==undefined&&e.recentReport.ageDays>policy.maxLatestAge)e.recentReport=null;
  if(e.recentReport&&policy.recencyOnly){
   var age=e.recentReport.ageDays,recency=age<=1?12:age<=3?9:age<=7?5:2;
   e.recentReport=Object.assign({},e.recentReport,{bonus:Math.min(WEEKLY_RECENT_BONUS_MAX,recency)});
  }
  e.rankScore=Number.isFinite(e.score)?e.score+(e.recentReport?e.recentReport.bonus:0):null;
  if(observer)observer(site,e);return e;
 };
 `;
 const factory=new Function('ctx','Date','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
 'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+
 constants+'\n'+rt.functions+'\n'+hook+
 'return {'+names.join(',')+',setSites:function(s){siteData=s;},setObserver:function(o){observer=o;},setSelector:function(fn){autumnBalancedRecommendations=fn;}};');
 function makeScenario(policy={},overrides={},order=rt.sites,now=rt.manifest.evaluationTime){
  assert.ok(policy.cap===undefined||(Number.isFinite(policy.cap)&&policy.cap>=0),'nonnegative finite cap only');
  const Clock=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}};
  const context={...rt.data,sites:order,sightings:rt.sightings,...overrides,policy};
  if(policy.reports===false)context.sightings={};
  return factory(context,Clock);
 }
 return {...rt,makeScenario};
}
export function physicalSignature(e){
 if(!e)return null;const {site,recentReport,rankScore,stableOrder,selectedAxis,...rest}=e;
 return JSON.stringify({id:String(site.id),...rest});
}
