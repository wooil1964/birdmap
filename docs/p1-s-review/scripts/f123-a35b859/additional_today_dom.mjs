// Independent PR13 final C1/C2 validation: actual Chrome/Leaflet marker popup and renderTodayPanel DOM.
// Source read-only; fixtures exist only in browser memory; all APIs synthetic before navigation.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url)));
const head=process.argv[4]||'2e485079a34fa5aeeef09e82f3b996bf2696d978',date='2026-10-10',clock=date+'T11:00:00+09:00';
fs.mkdirSync(out,{recursive:true});const rows=[],errors=[],traffic=[],lifecycle=[],badWeekDiagnostics=[],boatDiagnostics=[];let activeFixture=null;
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local'),filename=path.resolve(repo,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!filename.startsWith(repo+path.sep)){res.writeHead(403).end();return;}try{const body=fs.readFileSync(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const transparent='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh1UAAAAASUVORK5CYII=';
class Chrome {
 constructor(proc,ws){this.proc=proc;this.ws=ws;this.id=0;this.pending=new Map();ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Fetch.requestPaused')void this.intercept(m);else if(m.method==='Runtime.exceptionThrown')errors.push({phase:'page',message:m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text});});}
 send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++this.id;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 static async launch(){const profile=path.join(out,'chrome-profile');fs.mkdirSync(profile,{recursive:true});const proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-default-apps','--disable-client-side-phishing-detection','--disable-breakpad','--disable-features=MediaRouter,OptimizationHints','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE cdn.jsdelivr.net, EXCLUDE cdnjs.cloudflare.com, EXCLUDE code.jquery.com, EXCLUDE netdna.bootstrapcdn.com','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='';const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),20000);proc.stderr.on('data',b=>{stderr+=b;const m=stderr.match(/ws:\/\/\S+/);if(m){clearTimeout(timer);resolve(m[0]);}});proc.on('error',reject);});const ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener('open',r));return new Chrome(proc,ws);}
 async fulfill(m,status,text,type='application/json'){return this.send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:type},{name:'Access-Control-Allow-Origin',value:origin}],body:Buffer.from(text).toString('base64')},m.sessionId);}
 async intercept(m){try{const r=m.params.request,u=new URL(r.url);if(u.origin===origin){if(activeFixture&&['/weather_today.json','/weather_week.json','/tide_today.json','/tide_month.json'].includes(u.pathname)){const sc=activeFixture,data=u.pathname==='/weather_week.json'?sc.week:u.pathname==='/tide_month.json'?sc.tide:u.pathname==='/weather_today.json'?(sc.failToday?null:sc.todayDocument||(sc.today?{date,generatedAt:Object.prototype.hasOwnProperty.call(sc,'rootGeneratedAt')?sc.rootGeneratedAt:date+' 10:30 KST',sites:{[sc.id]:sc.today}}:null)):null;await this.fulfill(m,data?200:503,JSON.stringify(data||{ok:false,error:{code:'SYNTHETIC_DATA_NOT_RECEIVED'}}));return;}await this.send('Fetch.continueRequest',{requestId:m.params.requestId},m.sessionId);return;}if(['GET','HEAD'].includes(r.method)&&['cdn.jsdelivr.net','cdnjs.cloudflare.com','code.jquery.com','netdna.bootstrapcdn.com'].includes(u.hostname)){await this.send('Fetch.continueRequest',{requestId:m.params.requestId},m.sessionId);return;}traffic.push({host:u.hostname,method:r.method,synthetic:true});if(u.hostname.endsWith('.workers.dev')){await this.fulfill(m,u.hostname.startsWith('birdmap-events.')?204:503,u.hostname.startsWith('birdmap-events.')?'':JSON.stringify({ok:false,error:{code:'LOCAL_READ_ONLY_MOCK'}}));return;}if(u.hostname==='challenges.cloudflare.com'){await this.fulfill(m,200,'window.turnstile={render:function(){return 1;},reset:function(){},remove:function(){}};','text/javascript');return;}if(m.params.resourceType==='Image'){await this.send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:transparent},m.sessionId);return;}await this.fulfill(m,204,'');}catch(error){errors.push({phase:'intercept',message:error.message});try{await this.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'},m.sessionId);}catch{}}}
 async page(width){const {targetId}=await this.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});await this.send('Page.enable',{},sessionId);await this.send('Runtime.enable',{},sessionId);await this.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},sessionId);await this.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768},sessionId);await this.send('Page.addScriptToEvaluateOnNewDocument',{source:'const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['+JSON.stringify(clock)+']));}static now(){return new NativeDate('+JSON.stringify(clock)+').getTime();}};window.open=function(){return null;};'},sessionId);await this.send('Page.navigate',{url:origin+'/'},sessionId);return{width,targetId,sessionId};}
 async eval(p,expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},p.sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 async wait(p,expression,ms=25000){const start=performance.now();while(performance.now()-start<ms){try{if(await this.eval(p,expression))return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('wait: '+expression);}
 async shot(p,name){const {data}=await this.send('Page.captureScreenshot',{format:'png'},p.sessionId);fs.writeFileSync(path.join(out,name),Buffer.from(data,'base64'));}
}
const raw=(extra={})=>({date,generatedAt:date+' 10:30 KST',refreshedAt:date+' 10:30 KST',forecastTime:date+' 12:00 KST',sourceType:'saved_forecast',score:92,grade:'★★★★★',scoreEligible:true,missingScoreFields:[],stale:false,wind:'북풍 3.0m/s',rain:'강수 없음',wave:'0.3m',temperature:'20.0°C',visibility:'15.0km',...extra});
const tide=(id,events=[['12:00','900']])=>({sites:{[id]:{days:events.map(([highTide,highTideLevel])=>({date,highTide,highTideLevel}))}}});
const sample=(time,extra={})=>({forecastTime:date+' '+time+' KST',windSpeed:3,windDirectionDeg:0,windName:'북풍',precipitation3h:0,waveM:0.3,temperature:20,visibilityKm:15,score:92,grade:'★★★★★',scoreEligible:true,missingScoreFields:[],isPastAtGeneration:false,...extra});
const week=(sites,interval=3)=>({startDate:date,endDate:'2026-10-16',generatedAt:date+' 10:30 KST',sampleIntervalHours:interval,sites});
const boost={14:{siteId:'14',latestDate:'2026-10-09',species:['참새','울새','박새','직박구리']}};
const normal=(name,extra={},changes={})=>({name,id:'14',today:raw(extra),tide:tide('14'),week:null,expectCard:true,expectPopup:'numeric',...changes});
const scenarios=[
 normal('week_unreceived_normal92',{}, {sightings:boost,expectRank:108}),
 normal('week_site_absent_normal92',{}, {week:week({999:{name:'other',days:{}}}),sightings:boost,expectRank:108}),
 normal('score_zero',{score:0,grade:'★'}),normal('score_925',{score:92.5}),normal('score100',{score:100}),
 normal('gap90',{}, {tide:tide('14',[['13:30','900']])}),
 normal('gap91',{}, {tide:tide('14',[['13:31','900']]),expectCard:false,expectPopup:'numeric',semantic:'Tide safety is stricter than independent today popup eligibility.'}),
 normal('alternate_safe_tide',{}, {tide:tide('14',[['13:45','900'],['12:30','870']]),expectTide:'12:30 · 870cm'}),
 normal('week_normal',{}, {today:null,week:week({14:{name:'걸매리',days:{[date]:{samples:[sample('12:00')]}}}}),sightings:boost,expectRank:108}),
 normal('wind_null',{wind:null},{expectCard:false,expectPopup:'unknown',sightings:boost}),
 normal('wind_missing',{wind:undefined},{expectCard:false,expectPopup:'unknown'}),
 normal('wind_direction_missing',{wind:'3m/s'},{expectCard:false,expectPopup:'unknown'}),
 normal('rain_null',{rain:null},{expectCard:false,expectPopup:'unknown',sightings:boost}),
 normal('rain_missing',{rain:undefined},{expectCard:false,expectPopup:'unknown'}),
 normal('eligible_missing',{scoreEligible:undefined},{expectCard:false,expectPopup:'unknown'}),
 normal('eligible_null',{scoreEligible:null},{expectCard:false,expectPopup:'unknown'}),
 normal('eligible_false',{scoreEligible:false},{expectCard:false,expectPopup:'unknown'}),
 normal('unknown_raw_spoofed_state',{scoreEligible:undefined,_weatherState:{scoreEligible:true,kind:'today_saved',dataCurrent:true}},{expectCard:false,expectPopup:'unknown'}),
 normal('previous_saved',{date:'2026-10-09',generatedAt:'2026-10-09 23:44 KST',forecastTime:'2026-10-09 12:00 KST',scoreEligible:false,stale:true,fallbackSource:'previous_saved'},{expectCard:false,expectPopup:'unknown'}),
 normal('island_normal_wave',{}, {id:'3',tide:null,today:null,week:week({3:{days:{[date]:{samples:[sample('12:00')]}}}})}),
 normal('island_required_wave_null',{wave:null},{id:'3',tide:null,expectCard:false,expectPopup:'unknown'}),
 normal('island_required_wave_missing',{wave:undefined},{id:'3',tide:null,expectCard:false,expectPopup:'unknown'}),
 normal('boat_normal_wave',{}, {id:'53',tide:null,today:null,week:week({53:{days:{[date]:{samples:[sample('12:00')]}}}})}),
 normal('boat_required_wave_null',{wave:null},{id:'53',tide:null,expectCard:false,expectPopup:'unknown'}),
 normal('boat_required_wave_missing',{wave:undefined},{id:'53',tide:null,expectCard:false,expectPopup:'unknown'}),
 normal('weekly6h_gap91',{}, {today:null,week:week({14:{days:{[date]:{samples:[sample('12:00')]}}}},6),tide:tide('14',[['13:31','900']]),expectCard:false,expectPopup:'numeric'}),
 normal('weekly24h_gap91',{}, {today:null,week:week({14:{days:{[date]:{samples:[sample('12:00')]}}}},24),tide:tide('14',[['13:31','900']]),expectCard:false,expectPopup:'numeric'}),
 normal('rain1mm',{rain:'3시간 강수 1mm'},{expectCard:false,expectPopup:'caution'}),
 normal('rain0999mm',{rain:'3시간 강수 0.999mm'},{expectCard:true,expectPopup:'numeric'}),
 normal('delayed_generation',{generatedAt:date+' 05:41 KST'},{expectCard:true,expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true}),
 normal('future_generation',{generatedAt:date+' 12:30 KST'},{expectCard:true,expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true}),
 normal('malformed_generation',{generatedAt:'not-a-time'},{expectCard:true,expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true}),
 normal('missing_generation',{generatedAt:undefined},{rootGeneratedAt:null,expectCard:true,expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true}),
 normal('previous_forecast_date',{forecastTime:'2026-10-09 12:00 KST'},{expectCard:true,expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true}),
];
if((process.env.C_GENERATOR_FIXTURE||process.env.R6_GENERATOR_FIXTURE||process.env.R4_GENERATOR_FIXTURE)){const generated=JSON.parse(fs.readFileSync((process.env.C_GENERATOR_FIXTURE||process.env.R6_GENERATOR_FIXTURE||process.env.R4_GENERATOR_FIXTURE),'utf8'));assert.ok(generated.sites&&generated.sites['14']);scenarios.push(normal('generated_sparse6h_delayed',{}, {today:generated.sites['14'],rootGeneratedAt:generated.generatedAt||generated.updated||null,expectCard:true,expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true,generatorFixtureUnmodified:true}));}
const referenceFixtures=scenarios.filter(sc=>sc.diagnostic);
assert.equal(referenceFixtures.length,6,'Run with R6_GENERATOR_FIXTURE to preserve all six prior reference conditions');
for(const sc of scenarios){sc.group=sc.diagnostic?'tide_reference':'original_normal';if(sc.diagnostic)sc.expectRank=92;}
const ordinaryBoost={15:{siteId:'15',latestDate:'2026-10-09',species:['참새','울새','박새','직박구리']}};
for(const sc of referenceFixtures)scenarios.push({...sc,id:'15',name:'ordinary_'+sc.name,tide:null,group:'ordinary_reference',expectRank:92});
scenarios.push(normal('ordinary_fresh_bonus108',{}, {id:'15',tide:null,sightings:ordinaryBoost,expectRank:108,group:'ordinary_control'}));
scenarios.push(normal('ordinary_reference_bonus108',{generatedAt:date+' 05:41 KST'},{id:'15',tide:null,sightings:ordinaryBoost,expectRank:108,expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true,group:'ordinary_control'}));
const weekly15=extra=>week({15:{name:'천수만 사기리',days:{[date]:{samples:[sample('12:00',extra)]}}}});
scenarios.push(normal('ordinary_valid_week_priority',{}, {id:'15',tide:null,week:weekly15({}),group:'week_policy',expectSourceKind:'week_forecast',expectPopupKind:'today_saved'}));
scenarios.push(normal('ordinary_valid_week_replaces_reference',{generatedAt:date+' 05:41 KST'},{id:'15',tide:null,week:weekly15({}),group:'week_policy',expectSourceKind:'week_forecast',expectPopupKind:'week_forecast'}));
scenarios.push(normal('ordinary_week_site_absent_reference',{generatedAt:date+' 05:41 KST'},{id:'15',tide:null,week:week({999:{days:{}}}),group:'week_policy',expectPopup:'unknown',expectCardScoreUnknown:true,diagnostic:true,expectRank:92}));
scenarios.push(normal('ordinary_week_known_ineligible_sample',{}, {id:'15',tide:null,week:weekly15({scoreEligible:false}),group:'week_policy',expectCard:false,semantic:'Known weekly site with no eligible sample blocks recommendation fallback; separate valid current today popup remains numeric.'}));
scenarios.push(normal('ordinary_week_known_ineligible_reference',{generatedAt:date+' 05:41 KST'},{id:'15',tide:null,week:weekly15({scoreEligible:false}),group:'week_policy',expectCard:false,expectPopup:'unknown',semantic:'Known weekly site with no eligible sample blocks recommendation fallback; today reference popup remains unconfirmed.'}));
scenarios.push(normal('ordinary_week_known_empty',{}, {id:'15',tide:null,week:week({15:{name:'천수만 사기리',days:{}}}),group:'week_policy',expectCard:false,semantic:'Known empty weekly site blocks recommendation fallback; separate valid current today popup remains numeric.'}));
const productFixturePath=path.join(repo,'.github/scripts/fixtures/sparse6h_today_site14.json');
const productFixture=JSON.parse(fs.readFileSync(productFixturePath,'utf8'));
assert.deepEqual(productFixture,referenceFixtures.find(sc=>sc.generatorFixtureUnmodified).today,'Product sparse6h fixture must equal unchanged prior independent builder output');
const EMPTY_NOTICE='현재 검증된 기상자료가 없어 추천 탐조지를 표시할 수 없습니다. 자료 갱신 후 다시 확인해 주세요.';
// Explicit expected-policy changes; every other prior scenario keeps its original expectation.
const changedReasons={
 delayed_generation:'10:17 due time passed; 05:41 generation is a reference',
 future_generation:'12:30 generatedAt is after 11:00 evaluation',
 malformed_generation:'generatedAt has no valid timestamp',
 missing_generation:'item and root generatedAt both unavailable',
 previous_forecast_date:'raw date today differs from actual forecast previous date',
 generated_sparse6h_delayed:'unchanged actual builder generation06:10 is before latest due10:17',
 ordinary_delayed_generation:'same delayed reference contract in general route',
 ordinary_future_generation:'same future generation contract in general route',
 ordinary_malformed_generation:'same invalid generation contract in general route',
 ordinary_missing_generation:'same missing generation contract in general route',
 ordinary_previous_forecast_date:'same actual forecast date mismatch in general route',
 ordinary_generated_sparse6h_delayed:'unchanged builder row mapped to general route',
 ordinary_reference_bonus108:'bonus16 may not revive reference source',
 ordinary_week_site_absent_reference:'missing weekly registry entry may not revive delayed today source'
};
const expectationChanges=[];
for(const sc of scenarios){if(Object.prototype.hasOwnProperty.call(changedReasons,sc.name)){
 assert.equal(sc.expectCard,true,'Baseline expected a reference candidate for documented policy change');
 assert.equal(sc.expectPopup,'unknown');assert.equal(sc.expectCardScoreUnknown,true);
 expectationChanges.push({scenario:sc.name,group:sc.group,reason:changedReasons[sc.name],before:{cardCount:1,candidatePresent:true,rankScore:sc.expectRank,cardScore:'오늘 적합도 미확인'},after:{cardCount:0,candidatePresent:false,rankScore:null,cardScore:null,popupScore:'오늘 적합도 미확인',referenceTemperatureRetained:true}});
 sc.expectCExcluded=true;sc.expectCard=false;sc.expectRank=null;sc.expectCardScoreUnknown=false;
}}
assert.equal(expectationChanges.length,14);assert.equal(scenarios.length,49,'Preserve original 49 scenarios, rather than dropping assertions');
function inject(sc){return '(function(){var sc='+JSON.stringify(sc)+';var site=window.__originalSites.find(s=>String(s.id)===sc.id);if(!site)throw Error("missing public site");window.__testedSite=site;siteData=[site];weatherWeek=sc.week;weatherToday=sc.today?{date:'+JSON.stringify(date)+',generatedAt:'+JSON.stringify(date+' 10:30 KST')+',sites:{[sc.id]:sc.today}}:null;if(weatherToday&&Object.prototype.hasOwnProperty.call(sc,"rootGeneratedAt"))weatherToday.generatedAt=sc.rootGeneratedAt;tideMonth=sc.tide;tideToday=null;loadedNotices=[];recentSiteSightings=sc.sightings||{};liveWeatherCache.clear();renderTodayPanel();toggleTodayPanel(true);return true;})()';}
const readCard='(function(){var candidate=weeklyRecommendationForSite(window.__testedSite,weeklyInfo()),e=weeklyPanelRecommendations(weeklyInfo()).find(e=>String(e.site.id)===String(window.__testedSite.id)), card=document.querySelector("#todayPanelBody .todayRankItem"),score=card&&card.querySelector(".todayRankScore"),r=score&&score.getBoundingClientRect();return {candidatePresent:!!candidate,candidateRankScore:candidate?weeklyRankScore(candidate):null,todayAdapterIsNull:weatherToday&&weatherToday.sites&&weatherToday.sites[String(window.__testedSite.id)]?weeklyTodayWeather(window.__testedSite,weatherToday.sites[String(window.__testedSite.id)])===null:null,emptyNotice:[...document.querySelectorAll("#todayPanelBody .smallText")].some(e=>e.textContent==="현재 검증된 기상자료가 없어 추천 탐조지를 표시할 수 없습니다. 자료 갱신 후 다시 확인해 주세요."),bodyText:document.getElementById("todayPanelBody").textContent,cardCount:document.querySelectorAll("#todayPanelBody .todayRankItem").length,cardScore:score&&score.textContent,cardText:card&&card.textContent,rawScore:e?e.score:null,rankScore:e?weeklyRankScore(e):null,bonus:e&&e.recentReport&&e.recentReport.bonus,safe:e&&weeklyRecommendationIsSafe(e),recommendationDate:e&&e.recommendationDate,recommendationTime:e&&e.recommendationTime,sourceState:e&&e.today&&e.today._weatherState,sourceEligible:e&&e.today&&e.today._weatherState&&e.today._weatherState.scoreEligible,sourceKind:e&&e.today&&e.today._weatherState&&e.today._weatherState.kind,cardRect:r&&{left:r.left,right:r.right,clipped:score.scrollWidth>score.clientWidth+1}};})()';
const readPopup='(function(){var root=[...document.querySelectorAll(".leaflet-popup-content [data-live-weather-site-id]")].find(e=>e.dataset.liveWeatherSiteId===String(window.__testedSite.id)),score=root&&root.querySelector("[data-live-weather-field=score]"),r=score&&score.getBoundingClientRect(),w=weatherTodayForSite(window.__testedSite);return {popupForecastTime:w&&w.forecastTime,popupStoredLabel:root&&root.querySelector("[data-live-weather-field=storedStatus]")&&root.querySelector("[data-live-weather-field=storedStatus]").textContent,popupFerryText:root&&[...root.querySelectorAll(".v24BriefingItem")].filter(e=>e.textContent.includes("여객선:")).map(e=>e.textContent),popupInterpretation:root&&root.querySelector("[data-live-weather-field=interpretation]")&&root.querySelector("[data-live-weather-field=interpretation]").textContent,popupScore:score&&score.textContent,popupHasTemperature:root&&root.textContent.includes("20.0°C"),popupHasWind:root&&root.textContent.includes("북풍"),popupStateKind:w&&w._weatherState&&w._weatherState.kind,popupState:w&&w._weatherState,rawStoredState:weatherToday&&weatherToday.sites&&weatherToday.sites[String(window.__testedSite.id)]?storedWeatherState(weatherToday.sites[String(window.__testedSite.id)],weatherToday,undefined,window.__testedSite):null,popupSourceEligible:w&&w._weatherState&&w._weatherState.scoreEligible,popupAllowed:weatherScoreAllowed(w),popupRect:r&&{left:r.left,right:r.right,clipped:score.scrollWidth>score.clientWidth+1}};})()';
const referenceDoc=(stamp='10:30')=>({date,generatedAt:date+' '+stamp+' KST',sites:{14:raw({generatedAt:date+' 05:41 KST'}),15:raw({generatedAt:date+' 05:41 KST'})}});
const normalDoc=(stamp='10:30')=>({date,generatedAt:date+' '+stamp+' KST',sites:{14:raw(),15:raw()}});
const twoSiteWeek=(stamp='10:30',invalid15=false,invalid14=false)=>({...week({14:{days:{[date]:{samples:[sample('12:00',{scoreEligible:!invalid14})]}}},15:{days:{[date]:{samples:[sample('12:00',{scoreEligible:!invalid15})]}}}}),generatedAt:date+' '+stamp+' KST'});
const readLifecycle='(function(){var picks=weeklyPanelRecommendations(weeklyInfo()),body=document.getElementById("todayPanelBody"),empty=[...body.querySelectorAll(".smallText")].find(e=>e.textContent==="'+EMPTY_NOTICE+'");return {candidateIds:siteData.filter(s=>weeklyRecommendationForSite(s,weeklyInfo())).map(s=>String(s.id)).sort(),pickIds:picks.map(e=>String(e.site.id)).sort(),cardCount:body.querySelectorAll(".todayRankItem").length,cardScores:[...body.querySelectorAll(".todayRankScore")].map(e=>e.textContent),emptyNotice:!!empty,emptyText:empty&&empty.textContent,sourceEligible:picks.map(e=>e.today._weatherState.scoreEligible)};})()';
async function runLifecycle(browser,page,width){
 const ref=referenceDoc('10:30');activeFixture={todayDocument:ref,week:null,tide:tide('14')};
 await browser.eval(page,'(function(){siteData=window.__originalSites.filter(s=>["14","15"].includes(String(s.id)));weatherToday='+JSON.stringify(ref)+';weatherWeek=null;tideMonth='+JSON.stringify(tide('14'))+';loadedNotices=[];recentSiteSightings={};renderTodayPanel();toggleTodayPanel(true);return true;})()');
 const phase=async(name,expectedIds,operation)=>{const row={width,phase:name,expectedIds};lifecycle.push(row);try{if(operation)row.loaderResult=await operation();await new Promise(r=>setTimeout(r,180));Object.assign(row,await browser.eval(page,readLifecycle));assert.deepEqual(row.candidateIds,[...expectedIds].sort(),'actual candidate set');assert.deepEqual(row.pickIds,[...expectedIds].sort(),'final recommendation set');assert.equal(row.cardCount,expectedIds.length,'actual card count');assert.equal(row.emptyNotice,expectedIds.length===0,'exact empty-state presence');if(!expectedIds.length)assert.equal(row.emptyText,EMPTY_NOTICE);else {assert.ok(row.cardScores.every(s=>s==='★★★★★ 92점'));assert.ok(row.sourceEligible.every(v=>v===true));}row.passed=true;
 if(width===375&&['all_reference_empty','fresh_today_arrives','partial_reference_today','valid_week_arrives'].includes(name))await browser.shot(page,'lifecycle-'+name+'-'+width+'.png');
 }catch(error){row.passed=false;row.error=error.message;}};
 const reloadToday=()=>browser.eval(page,'loadWeatherToday().then(function(changed){refreshTodayPanelIfOpen();return changed;})');
 const reloadWeek=()=>browser.eval(page,'loadWeatherWeek().then(function(changed){refreshTodayPanelIfOpen();return changed;})');
 await phase('all_reference_empty',[]);
 activeFixture.failToday=true;await phase('network_failure_retains_empty',[],async()=>{const result=await reloadToday();assert.equal(result,false,'failed loader keeps current data');return result;});
 activeFixture.failToday=false;activeFixture.todayDocument=normalDoc('10:31');await phase('fresh_today_arrives',['14','15'],async()=>{const result=await reloadToday();assert.equal(result,true);return result;});
 activeFixture.todayDocument={...normalDoc('10:32'),sites:{14:raw(),15:raw({generatedAt:date+' 05:41 KST'})}};await phase('partial_reference_today',['14'],async()=>{const result=await reloadToday();assert.equal(result,true);return result;});
 activeFixture.todayDocument=referenceDoc('10:33');await phase('all_reference_again',[],async()=>{const result=await reloadToday();assert.equal(result,true);return result;});
 activeFixture.week=twoSiteWeek('10:30');await phase('valid_week_arrives',['14','15'],async()=>{const result=await reloadWeek();assert.equal(result,true);return result;});
 activeFixture.week=twoSiteWeek('10:31',true,false);await phase('partial_week_eligible',['14'],async()=>{const result=await reloadWeek();assert.equal(result,true);return result;});
 activeFixture.week=twoSiteWeek('10:32',true,true);await phase('all_week_ineligible_empty',[],async()=>{const result=await reloadWeek();assert.equal(result,true);return result;});
 activeFixture.week=twoSiteWeek('10:33');await phase('valid_week_recovery',['14','15'],async()=>{const result=await reloadWeek();assert.equal(result,true);return result;});
}
async function runBadWeekDiagnostics(browser,page,width){
 for(const [name,badTime] of [['weekly_no_timezone',date+' 12:00'],['weekly_invalid_minutes',date+' 12:60 KST']]){
  const sc=normal(name,{}, {id:'15',tide:null,today:null,sightings:ordinaryBoost,week:week({15:{days:{[date]:{samples:[sample('12:00',{forecastTime:badTime,score:99,grade:'★★★★★'}),sample('13:00',{score:80,grade:'★★★★'})]}}}})});
  const row={width,scenario:name,expected:{selectedRawScore:80,rankScore:96,scoreDisplay:'★★★★ 80점'},badForecastTime:badTime};badWeekDiagnostics.push(row);
  try{activeFixture=sc;await browser.eval(page,inject(sc));Object.assign(row,await browser.eval(page,readCard));row.strictParserResult=await browser.eval(page,'typeof weeklyForecastTimestamp==="function"?weeklyForecastTimestamp('+JSON.stringify(badTime)+'):"unavailable_before_C"');
   await browser.eval(page,'(function(){toggleTodayPanel(false);var s=window.__testedSite,m=map_7010a44f6ac2025090f0fe07508ed485;m.closePopup();m.setView([s.lat,s.lon],11,{animate:false});var marker=markerRegistry[markerKey(s)];marker.addTo(m);marker.openPopup();refreshOpenBirdPopup();return true;})()');await new Promise(r=>setTimeout(r,180));await browser.wait(page,'[...document.querySelectorAll(".leaflet-popup-content [data-live-weather-site-id]")].some(e=>e.dataset.liveWeatherSiteId==="15"&&e.querySelector("[data-live-weather-field=score]"))',10000);Object.assign(row,await browser.eval(page,readPopup));
   if(row.strictParserResult!=='unavailable_before_C')assert.equal(row.strictParserResult,null,'C strict timestamp parser must reject invalid time');assert.equal(row.rawScore,80,'Invalid highest score must not hide valid 13:00 score80');assert.equal(row.rankScore,96,'valid80 plus existing bonus16');assert.equal(row.cardScore,'★★★★ 80점');assert.equal(row.popupScore,'★★★★ 80점');row.passed=true;
  }catch(error){row.passed=false;row.error=error.message;}
  if(width===375){await browser.shot(page,'diagnostic-'+name+'-popup-'+width+'.png');await browser.eval(page,'map_7010a44f6ac2025090f0fe07508ed485.closePopup();toggleTodayPanel(true);true');await browser.shot(page,'diagnostic-'+name+'-card-'+width+'.png');}
 }
}
// New independent boat matrix: choose and display the valid80 alternative in actual source/DOM.
// Invalid candidate99 is never treated as an expected success. No _weatherState override.
async function runBoatDiagnostics(browser,page,width){
 const sightings={53:{siteId:'53',latestDate:'2026-10-09',species:['참새','울새','박새','직박구리']}};
 const values=[
 ['boat_no_timezone',{forecastTime:date+' 12:00'}],
 ['boat_invalid_minutes',{forecastTime:date+' 12:60 KST'}],
 ['boat_missing_wind',{windSpeed:null}],
 ['boat_missing_direction',{windDirectionDeg:null}],
 ['boat_missing_rain',{precipitation3h:null}],
 ['boat_missing_wave',{waveM:null}],
 ['boat_wind_over6',{windSpeed:6.001}],
 ['boat_wave_over07',{waveM:0.7001}],
 ['boat_rain_above0',{precipitation3h:0.001}],
 ['boat_raw_wind_rounding',{windSpeed:6,safetyRaw:{windSpeed:6.01,waveM:0.3,precipitation3h:0}}],
 ['boat_raw_wave_rounding',{waveM:0.7,safetyRaw:{windSpeed:3,waveM:0.701,precipitation3h:0}}],
 ['boat_exact_safe_boundaries',{windSpeed:6,waveM:0.7,precipitation3h:0,score:80,grade:'★★★★'},'boundary'],
 ['boat_only_missing_wave',{waveM:null},'empty']
 ];
 assert.equal(values.length,13,'Keep every independently specified boat path');
 for(const [name,invalid,mode] of values){
  const samples=mode==='boundary'?[sample('12:00',invalid)]:[sample('12:00',{score:99,grade:'★★★★★',...invalid}),...(mode==='empty'?[]:[sample('13:00',{score:80,grade:'★★★★'})])];
  const sc=normal(name,{}, {id:'53',today:null,tide:null,sightings,week:week({53:{days:{[date]:{samples}}}})});
  const row={width,scenario:name,inputInvalid:invalid,expected:mode==='empty'?{candidatePresent:false,cardCount:0,rankScore:null,popupScore:'오늘 적합도 미확인'}:{candidatePresent:true,cardCount:1,rawScore:80,rankScore:96,bonus:16,scoreDisplay:'★★★★ 80점',selectedForecastTime:date+' '+(mode==='boundary'?'12:00':'13:00')+' KST'}};boatDiagnostics.push(row);
  try{
   activeFixture=sc;await browser.eval(page,inject(sc));Object.assign(row,await browser.eval(page,readCard));
   row.selectedSample=await browser.eval(page,'(function(){var e=weeklyPanelRecommendations(weeklyInfo()).find(e=>String(e.site.id)==="53");return e?{forecastTime:e.sample&&e.sample.forecastTime,sampleScore:e.sample&&e.sample.score,pelagicSafety:weeklyPelagicSafety(e.sample),missingScoreFields:e.sample&&e.sample.missingScoreFields}:null;})()');
   await browser.eval(page,'(function(){toggleTodayPanel(false);var s=window.__testedSite,m=map_7010a44f6ac2025090f0fe07508ed485;m.closePopup();m.setView([s.lat,s.lon],11,{animate:false});markerRegistry[markerKey(s)].addTo(m).openPopup();refreshOpenBirdPopup();return true;})()');
   await new Promise(r=>setTimeout(r,180));await browser.wait(page,'[...document.querySelectorAll(".leaflet-popup-content [data-live-weather-site-id]")].some(e=>e.dataset.liveWeatherSiteId==="53"&&e.querySelector("[data-live-weather-field=score]"))',10000);Object.assign(row,await browser.eval(page,readPopup));
   if(mode==='empty'){assert.equal(row.candidatePresent,false);assert.equal(row.cardCount,0);assert.equal(row.rankScore,null);assert.equal(row.selectedSample,null);assert.equal(row.emptyNotice,true);assert.equal(row.popupScore,'오늘 적합도 미확인');assert.equal(row.popupAllowed,false);}
   else {assert.equal(row.candidatePresent,true,'Actual boat candidate retained only on valid alternative');assert.equal(row.cardCount,1);assert.equal(row.rawScore,80);assert.equal(row.candidateRankScore,96);assert.equal(row.rankScore,96);assert.equal(row.bonus,16);assert.equal(row.safe,true);assert.equal(row.sourceEligible,true);assert.equal(row.sourceKind,'week_forecast');assert.equal(row.cardScore,'★★★★ 80점');assert.equal(row.popupScore,'★★★★ 80점');assert.equal(row.popupAllowed,true);assert.equal(row.selectedSample.forecastTime,row.expected.selectedForecastTime);assert.equal(row.selectedSample.sampleScore,80);assert.equal(row.selectedSample.pelagicSafety,true);assert.deepEqual(row.selectedSample.missingScoreFields,[]);}
   for(const r of [row.cardRect,row.popupRect].filter(Boolean)){assert.ok(r.left>=-1&&r.right<=width+1,'score horizontally visible');assert.equal(r.clipped,false);}
   row.passed=true;
  }catch(error){row.passed=false;row.error=error.message;}
  if(width===375&&['boat_no_timezone','boat_exact_safe_boundaries','boat_only_missing_wave'].includes(name)){await browser.shot(page,name+'-popup-'+width+'.png');await browser.eval(page,'map_7010a44f6ac2025090f0fe07508ed485.closePopup();toggleTodayPanel(true);true');await browser.shot(page,name+'-card-'+width+'.png');}
 }
}
// Separate source-type negative diagnostics: these cannot be counted as core passes.
const typedDiagnostics=[];
async function runTypedDiagnostics(browser,page,width){
 for(const name of ['array_forecast','array_publication']){
  const invalidTime=date+' 12:00 KST',doc=week({15:{days:{[date]:{samples:[sample('12:00',{score:99,grade:'★★★★★',forecastTime:name==='array_forecast'?[invalidTime]:invalidTime}),sample('13:00',{score:80,grade:'★★★★'})]}}}});
  if(name==='array_publication')doc.generatedAt=[date+' 10:30 KST'];
  const sc=normal(name,{}, {id:'15',today:null,tide:null,sightings:ordinaryBoost,week:doc});
  const row={width,scenario:name,expected:name==='array_forecast'?{candidatePresent:true,cardCount:1,rawScore:80,rankScore:96,popupScore:'★★★★ 80점'}:{candidatePresent:false,cardCount:0,rankScore:null,popupScore:'오늘 적합도 미확인'}};typedDiagnostics.push(row);
  try {activeFixture=sc;await browser.eval(page,inject(sc));Object.assign(row,await browser.eval(page,readCard));row.typedParserResult=await browser.eval(page,'weeklyForecastTimestamp('+JSON.stringify(name==='array_forecast'?[invalidTime]:doc.generatedAt)+')');
   await browser.eval(page,'(function(){toggleTodayPanel(false);var s=window.__testedSite,m=map_7010a44f6ac2025090f0fe07508ed485;m.closePopup();m.setView([s.lat,s.lon],11,{animate:false});markerRegistry[markerKey(s)].addTo(m).openPopup();refreshOpenBirdPopup();return true;})()');await new Promise(r=>setTimeout(r,180));await browser.wait(page,'[...document.querySelectorAll(".leaflet-popup-content [data-live-weather-site-id]")].some(e=>e.dataset.liveWeatherSiteId==="15"&&e.querySelector("[data-live-weather-field=score]"))',10000);Object.assign(row,await browser.eval(page,readPopup));
   assert.equal(row.typedParserResult,null,'Timestamp must reject array source type rather than coerce String(array)');assert.equal(row.candidatePresent,row.expected.candidatePresent);assert.equal(row.cardCount,row.expected.cardCount);assert.equal(row.rankScore,row.expected.rankScore);assert.equal(row.popupScore,row.expected.popupScore);if(name==='array_forecast'){assert.equal(row.rawScore,80);assert.equal(row.cardScore,'★★★★ 80점');}else{assert.equal(row.cardScore,null);assert.equal(row.popupAllowed,false);}row.passed=true;
  }catch(error){row.passed=false;row.error=error.message;}
  await browser.shot(page,name+'-popup-'+width+'.png');await browser.eval(page,'map_7010a44f6ac2025090f0fe07508ed485.closePopup();toggleTodayPanel(true);true');await browser.shot(page,name+'-card-'+width+'.png');
 }
}

const additional=[];
const chrome=await Chrome.launch();
try {const width=375,page=await chrome.page(width);
 await chrome.wait(page,'typeof L==="object"&&siteData.length===190&&typeof markerRegistry==="object"&&typeof renderTodayPanel==="function"&&Object.keys(markerRegistry).length>0');await new Promise(r=>setTimeout(r,1600));await chrome.eval(page,'window.__originalSites=siteData;if(birdmapRefreshTimer){clearInterval(birdmapRefreshTimer);birdmapRefreshTimer=null;}true');
 for(const scenario of ['today_item_generated_missing','today_root_array_valid_item','today_forecast_object']){
 const row={scenario,width,expected:{candidatePresent:false,cardCount:0,popupScore:'오늘 적합도 미확인',exceptions:0,referenceWeatherRetained:true},stages:{},exceptions:[]};additional.push(row);
 const baseline=normal('baseline',{generatedAt:date+' 10:50 KST'},{rootGeneratedAt:date+' 10:50 KST',id:'15',tide:null,sightings:ordinaryBoost});activeFixture=baseline;await chrome.eval(page,inject(baseline));row.stages.before=await chrome.eval(page,readCard);assert.equal(row.stages.before.rawScore,92);assert.equal(row.stages.before.rankScore,108);
 const sc=normal(scenario,{generatedAt:date+' 10:50 KST'},{rootGeneratedAt:date+' 10:50 KST',id:'15',tide:null,sightings:ordinaryBoost});if(scenario==='today_item_generated_missing')delete sc.today.generatedAt;if(scenario==='today_root_array_valid_item')sc.rootGeneratedAt=[date+' 10:50 KST'];if(scenario==='today_forecast_object')sc.today.forecastTime={toString:'not-callable'};
 activeFixture=sc;
 try{await chrome.eval(page,inject(sc));row.stages.card=await chrome.eval(page,readCard);}catch(error){row.exceptions.push({phase:'render_and_card',message:error.message});}
 row.stages.probe=await chrome.eval(page,'(function(){var r={};for(var pair of [["candidate",function(){return weeklyRecommendationForSite(window.__testedSite,weeklyInfo());}],["final",function(){return weeklyPanelRecommendations(weeklyInfo());}],["state",function(){return storedWeatherState(weatherToday.sites["15"],weatherToday,undefined,window.__testedSite);} ]]){try{var v=pair[1]();r[pair[0]]={exception:null,present:Array.isArray(v)?v.length>0:!!v,raw:Array.isArray(v)?(v[0]&&v[0].score):v&&v.score,rank:Array.isArray(v)?(v[0]&&weeklyRankScore(v[0])):v&&v.site&&weeklyRankScore(v),scoreEligible:v&&v.scoreEligible};}catch(e){r[pair[0]]={exception:e.name+": "+e.message};}}return r;})()');
 row.stages.renderedDOM=await chrome.eval(page,'({cardCount:document.querySelectorAll("#todayPanelBody .todayRankItem").length,cardScores:[...document.querySelectorAll("#todayPanelBody .todayRankScore")].map(e=>e.textContent),empty:document.getElementById("todayPanelBody").textContent.includes("현재 검증된 기상자료가 없어"),root:weatherToday.generatedAt||null,itemGeneratedAt:weatherToday.sites["15"].generatedAt||null})');await chrome.shot(page,scenario+'-card-375.png');
 try{await chrome.eval(page,'(function(){toggleTodayPanel(false);var s=window.__testedSite,m=map_7010a44f6ac2025090f0fe07508ed485;m.closePopup();m.setView([s.lat,s.lon],11,{animate:false});markerRegistry[markerKey(s)].addTo(m).openPopup();refreshOpenBirdPopup();return true;})()');await chrome.wait(page,'document.querySelector(".leaflet-popup-content [data-live-weather-site-id] [data-live-weather-field=score]")!==null',10000);}catch(error){row.exceptions.push({phase:'popup',message:error.message});}
 row.stages.popupDOM=await chrome.eval(page,'(function(){var root=document.querySelector(".leaflet-popup-content [data-live-weather-site-id]"),score=root&&root.querySelector("[data-live-weather-field=score]");return {popupPresent:!!root,score:score&&score.textContent,windRetained:!!root&&root.textContent.includes("북풍"),temperatureRetained:!!root&&root.textContent.includes("20.0°C")};})()');await chrome.shot(page,scenario+'-popup-375.png');
 row.checks=[{expectation:'No product exception',passed:row.exceptions.length===0&&!Object.values(row.stages.probe).some(p=>p.exception)},{expectation:'Invalid source excludes candidate and final card',passed:row.stages.probe.candidate.present===false&&row.stages.probe.final.present===false&&row.stages.renderedDOM.cardCount===0},{expectation:'Popup score unconfirmed and reference weather retained',passed:row.stages.popupDOM.score==='오늘 적합도 미확인'&&row.stages.popupDOM.windRetained&&row.stages.popupDOM.temperatureRetained}];row.passed=row.checks.every(c=>c.passed);await chrome.eval(page,'map_7010a44f6ac2025090f0fe07508ed485.closePopup();true').catch(()=>{});
 }
 await chrome.send('Target.closeTarget',{targetId:page.targetId});
}finally{try{await chrome.send('Browser.close');}catch{}chrome.proc.kill();server.close();}
const result={head,clock,sourceDigest:createHash('sha256').update(fs.readFileSync(path.join(repo,'index.html'))).digest('hex'),rows:additional,errors,traffic,summary:{total:additional.length,pass:additional.filter(r=>r.passed).length,fail:additional.filter(r=>!r.passed).length,exceptionRows:additional.filter(r=>r.exceptions.length).length},constraints:{actualChromeDom:true,actualLeaflet:true,sourceChanges:0,allAPIRequestsFulfilledSynthetic:true,DNSIsolationBeforeNavigation:true,productionWorkerConnections:0,productionPOSTDELETE:0,coordinatesLogged:false}};fs.writeFileSync(path.join(out,'additional_today_dom.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));if(result.summary.fail||errors.length)process.exitCode=1;
