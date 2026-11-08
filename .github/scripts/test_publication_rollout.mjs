/* Synthetic rollout regression. Read the pre-PR frontend from its pinned Git commit;
   never substitute a new frontend constant for the actual old source. No network or D1. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const OLD_REF='e05f725557986934aea8fe167b766f7e82f6a948';
const CURRENT=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const PRIOR_V2=execFileSync('git',['show','29e88cbac9d3537a37028db08e872c9f2866f46b:index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});
const WITHHELD=execFileSync('git',['show','b2fe508f723dba94df07254fed9366b080dbc363:index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});
const PREVIOUS=execFileSync('git',['show',OLD_REF+':index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});
function block(html){const start=html.indexOf('var PUBLICATION_CONTRACT='),end=html.indexOf('/* publication:end */');assert.ok(start>=0&&end>start);return html.slice(start,end);}
function source(html,name){
 const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
 let depth=0,quote=null;
 for(let i=html.indexOf('{',start);i<html.length;i++){
  const ch=html[i];
  if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
  if(ch==='"'||ch==="'"){quote=ch;continue;}
  if(ch==='/'&&html[i+1]==='*'){i=html.indexOf('*/',i)+1;continue;}
  if(ch==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}
  if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return html.slice(start,i+1);
 }
 throw new Error('Unbalanced function '+name);
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function env(html,projection){
 let wall=1000000,mono=0,nonce=0,pendingPopup=null;
 const events={},calls=[],queue=[],removed=[];
 const authority={contract:'publication-v1',projection,epoch:'a'.repeat(32),revision:'1'};
 const list={textContent:''},badge={textContent:''};
 const box={_birdmapLoaded:[],querySelector(selector){return selector==='.siteHistoryList'?list:selector==='.siteHistoryCount'?badge:null;}};
 const doc={hidden:false,addEventListener(name,fn){(events[name]||(events[name]=[])).push(fn);},getElementById(){return {hidden:false,style:{}};},querySelectorAll(selector){return selector==='.siteHistoryBox'?[box]:[];}};
 const c={Date:class extends Date{static now(){return wall;}},performance:{now:()=>mono},Promise,BigInt,Number,Uint8Array,URL,AbortController,
  crypto:{getRandomValues(bytes){bytes.fill(++nonce);}},document:doc,window:{addEventListener(name,fn){(events[name]||(events[name]=[])).push(fn);}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
  REPORTS_API_URL:'https://synthetic.invalid',reportsConfigured:()=>true,
  reportSpotLayers:{},reportPendingLayers:{},reportSearchIndex:[],reportFixedHistory:{},recentSiteSightings:{},contributorsData:null,
  siteHistoryCache:{},siteHistoryGen:0,SITE_HISTORY_TTL:300000,SITE_HISTORY_PAGE:5,
  clearContributors(){c.contributorsData=null;},renderRecentReports(){},refreshFixedSpotPopups(){},refreshTodayPanelIfOpen(){},
  map_7010a44f6ac2025090f0fe07508ed485:{removeLayer(layer){removed.push(layer);},closePopup(){}},
  loadApprovedReports:()=>Promise.resolve(true),loadPendingReports:()=>Promise.resolve(true),loadRecentSiteSightings:()=>Promise.resolve(true),
  fetch(url,options){
   const u=new URL(url);calls.push({path:u.pathname,cache:options.cache});
   const make=(snapshot={...authority})=>({ok:true,json:async()=>({ok:true,spots:[],history:[],total:0,serverTime:new Date(wall).toISOString(),publication:{...snapshot,nonce:u.searchParams.get('nonce')}})});
   return queue.length?queue.shift()(u,make):Promise.resolve(make());
  }};
 vm.createContext(c);vm.runInContext(block(html)+'\n'+['clearSiteHistoryCache','cachedSiteHistory','fetchSiteHistory','clearRenderedSiteHistories'].map(name=>source(html,name)).join('\n'),c);
 function seed(id='cached'){
  c.publicationState.ready=true;c.publicationState.until=wall+5000;c.publicationState.checkedMono=mono;c.publicationState.anchor={...authority};c.publicationState.needsRefresh=false;
  c.reportPublicSpots={[id]:{lat:0,lon:0,reporter:'synthetic-private'}};c.reportSpotLayers={[id]:{unbindPopup(){},getPopup(){return null;}}};
  const pendingLayer={options:{publicationDynamic:true},unbindPopup(){},closePopup(){},getPopup(){return pendingPopup;}};
  pendingPopup={_source:pendingLayer,content:'synthetic-private-coordinate',setContent(value){this.content=value;}};
  c.reportPendingLayers={[id+'-pending']:pendingLayer};c.map_7010a44f6ac2025090f0fe07508ed485._popup=pendingPopup;
  c.reportSearchIndex=[{id}];c.reportFixedHistory={[id]:[{id}]};c.recentSiteSightings={[id]:1};c.contributorsData={name:'synthetic-private'};
  c.siteHistoryCache.synthetic={at:wall,data:{publication:{...authority},history:[{id,reporter:'synthetic-private'}]}};box._birdmapLoaded=[{id}];list.textContent='synthetic-private';badge.textContent='1';
 }
 function hide(){doc.hidden=true;for(const fn of events.visibilitychange||[])fn();}
 function closed(){
  return !c.publicationState.ready&&Object.keys(c.reportPublicSpots).length===0&&Object.keys(c.reportSpotLayers).length===0&&Object.keys(c.reportPendingLayers).length===0&&pendingPopup?._source===null&&!pendingPopup.content.includes('synthetic-private-coordinate')&&c.reportSearchIndex.length===0&&Object.keys(c.reportFixedHistory).length===0&&Object.keys(c.recentSiteSightings).length===0&&c.contributorsData===null&&Object.keys(c.siteHistoryCache).length===0&&box._birdmapLoaded.length===0&&!list.textContent.includes('synthetic-private')&&badge.textContent==='';
 }
 return {c,doc,calls,queue,authority,seed,hide,closed,restore(){for(const fn of events.pageshow||[])fn({persisted:true});},advance(ms){wall+=ms;mono+=ms;}};
}
const historyRefusal=()=>Promise.resolve({ok:false,status:503,json:async()=>({ok:false,error:{code:'SITE_HISTORY_UNAVAILABLE',message:'synthetic'}})});
test('new frontend bounded site-history 503 fails only that history and keeps the unchanged lease',async()=>{
 const e=env(CURRENT,'nonbreeding-location-v2-autopublic-v1');e.seed();const generation=e.c.publicationState.generation;
 e.queue.push((u,make)=>Promise.resolve(make()),historyRefusal);
 assert.equal(await e.c.fetchSiteHistory({id:'big'},0),null);assert.equal(e.calls.length,2);
 assert.equal(e.c.publicationState.generation,generation);assert.equal(e.c.publicationAllowed(),true);assert.ok(e.c.reportPublicSpots.cached);assert.equal(e.c.siteHistoryCache.big,undefined);
 e.advance(5000);assert.equal(e.c.publicationAllowed(),false);assert.ok(e.closed());
});
test('new frontend history refusal code on another endpoint still closes public data',async()=>{
 const e=env(CURRENT,'nonbreeding-location-v2-autopublic-v1');e.seed();e.queue.push((u,make)=>Promise.resolve(make()),historyRefusal);
 await assert.rejects(e.c.publicationFetch('/reports/approved'));assert.ok(e.closed());
});
test('new frontend history refusal after an authority change still closes public data',async()=>{
 const e=env(CURRENT,'nonbreeding-location-v2-autopublic-v1');e.seed();e.authority.revision='2';e.queue.push((u,make)=>Promise.resolve(make()),historyRefusal);
 await assert.rejects(e.c.publicationFetch('/reports/site/big'));assert.ok(e.closed());
});
const readsClosed=()=>Promise.resolve({ok:false,status:503,json:async()=>({ok:false,error:{code:'PUBLIC_READS_CLOSED',message:'synthetic'}})});
test('new frontend emergency closure on a site-history payload still closes all public data',async()=>{
 const e=env(CURRENT,'nonbreeding-location-v2-autopublic-v1');e.seed();e.queue.push((u,make)=>Promise.resolve(make()),readsClosed);
 await assert.rejects(e.c.publicationFetch('/reports/site/big'));assert.ok(e.closed());
});
for(const [version,html,projection] of [['old',PREVIOUS,'legacy-public-v1'],['v2',PRIOR_V2,'nonbreeding-location-v2'],['withheld',WITHHELD,'nonbreeding-location-v2-pending-withheld-v1'],['new',CURRENT,'nonbreeding-location-v2-autopublic-v1']]){
 test(version+' frontend emergency read closure clears everything, stays closed, and recovers only with fresh permission',async()=>{
  const e=env(html,projection);e.seed();
  e.queue.push(readsClosed);await assert.rejects(e.c.publicationHead(true));assert.ok(e.closed());
  e.queue.push(readsClosed);assert.equal(await e.c.publicationRecheck(),false);assert.ok(e.closed());assert.equal(e.c.cachedSiteHistory('synthetic'),null);
  const body=await e.c.publicationFetch('/reports/approved');assert.equal(e.c.publicationDataAllowed(body),true);
  assert.equal(e.c.reportPublicSpots.cached,undefined,'closed data is not revived by reopening');assert.equal(e.c.cachedSiteHistory('synthetic'),null);
 });
}
for(const [version,html,projection,other] of [['old',PREVIOUS,'legacy-public-v1','nonbreeding-location-v2-autopublic-v1'],['v2',PRIOR_V2,'nonbreeding-location-v2','nonbreeding-location-v2-autopublic-v1'],['withheld',WITHHELD,'nonbreeding-location-v2-pending-withheld-v1','nonbreeding-location-v2-autopublic-v1'],['new',CURRENT,'nonbreeding-location-v2-autopublic-v1','nonbreeding-location-v2-pending-withheld-v1']]){
 test(version+' frontend accepts matching API and uses no-store for all checks',async()=>{
  const e=env(html,projection),body=await e.c.publicationFetch('/reports/approved');assert.equal(e.c.publicationDataAllowed(body),true);assert.equal(e.calls.length,3);assert.ok(e.calls.every(call=>call.cache==='no-store'));
 });
 test(version+' frontend rejects other projection at unchanged epoch/revision and purges caches and rendered history',async()=>{
  const e=env(html,projection);e.seed();assert.ok(e.c.cachedSiteHistory('synthetic'));e.authority.projection=other;await assert.rejects(e.c.publicationHead(true));assert.ok(e.closed());assert.equal(e.c.cachedSiteHistory('synthetic'),null);
 });
 test(version+' frontend rejects switch between preflight and payload',async()=>{
  const e=env(html,projection);e.seed();e.queue.push(async(u,make)=>{const r=make(),body=await r.json();e.authority.projection=other;return {...r,json:async()=>body};});await assert.rejects(e.c.publicationFetch('/reports/approved'));assert.equal(e.calls.length,2);assert.ok(e.closed());
 });
 test(version+' frontend rejects pre-switch payload when postflight sees new policy',async()=>{
  const e=env(html,projection);e.seed();const d=deferred();e.queue.push((u,make)=>Promise.resolve(make()),(u,make)=>{const response=make();return d.promise.then(()=>response);});
  const pending=e.c.publicationFetch('/reports/approved');await flush();assert.equal(e.calls.length,2);e.authority.projection=other;d.resolve();await assert.rejects(pending);assert.equal(e.calls.length,3);assert.ok(e.closed());
 });
 test(version+' frontend cannot retain a pre-switch cache beyond the unchanged five-second lease',()=>{
  const e=env(html,projection);e.seed();e.authority.projection=other;e.advance(4999);assert.equal(e.c.publicationAllowed(),true);e.advance(1);assert.equal(e.c.publicationAllowed(),false);assert.ok(e.closed());
 });
 test(version+' frontend late payload cannot revive data after hidden-to-visible recovery',async()=>{
  const e=env(html,projection);e.seed();const d=deferred();e.queue.push((u,make)=>Promise.resolve(make()),(u,make)=>{const response=make();return d.promise.then(()=>response);});
  const pending=e.c.publicationFetch('/reports/approved');await flush();e.hide();assert.ok(e.closed());e.doc.hidden=false;await e.c.publicationFetch('/reports/approved');e.seed('fresh');const generation=e.c.publicationState.generation;
  d.resolve();await assert.rejects(pending);assert.equal(e.c.publicationState.generation,generation);assert.equal(e.c.publicationAllowed(),true);assert.ok(e.c.reportPublicSpots.fresh);assert.equal(e.c.reportPublicSpots.cached,undefined);
 });
 test(version+' frontend current payload 503 also closes other cached public data',async()=>{
  const e=env(html,projection);e.seed();e.queue.push((u,make)=>Promise.resolve(make()),()=>Promise.resolve({ok:false,status:503}));
  await assert.rejects(e.c.publicationFetch('/reports/site/synthetic'));assert.ok(e.closed());
 });
 test(version+' frontend late HTTP failure from old HEAD cannot invalidate recovered data',async()=>{
  const e=env(html,projection);e.seed();const d=deferred();e.queue.push(()=>d.promise);const pending=e.c.publicationHead();e.hide();e.doc.hidden=false;await e.c.publicationFetch('/reports/approved');e.seed('fresh');const generation=e.c.publicationState.generation;
  d.resolve({ok:false,status:503});await assert.rejects(pending);assert.equal(e.c.publicationState.generation,generation);assert.equal(e.c.publicationAllowed(),true);assert.ok(e.c.reportPublicSpots.fresh);
 });
}

test('withheld (PR #78) frontend discards nonempty pending DTOs and direct marker calls while keeping approved data',async()=>{
 const e=env(WITHHELD,'nonbreeding-location-v2-pending-withheld-v1');e.seed();const popup=e.c.map_7010a44f6ac2025090f0fe07508ed485._popup;
 vm.runInContext(['removePendingLayer','showPendingSpot','renderPendingReports','loadPendingReports'].map(name=>source(WITHHELD,name)).join('
'),e.c);
 e.c.reportRequestStart=()=>1;e.c.reportResponseCurrent=()=>true;e.c.publicationDataAllowed=()=>true;
 e.c.publicationFetch=async()=>({ok:true,spots:[{id:'unexpected',lat:37.512345,lon:127.054321}]});
 assert.equal(await e.c.loadPendingReports(),false);
 assert.equal(Object.keys(e.c.reportPendingLayers).length,0);
 assert.equal(popup._source,null);assert.ok(!popup.content.includes('synthetic-private-coordinate'));
 e.c.showPendingSpot({id:'unexpected',lat:37.512345,lon:127.054321});
 assert.equal(Object.keys(e.c.reportPendingLayers).length,0);
 assert.ok(e.c.reportSpotLayers.cached,'approved marker is unchanged');
});
test('new frontend draws only verified:false pending DTOs, never over an approved spot, and removes them when the list drops them',async()=>{
 const e=env(CURRENT,'nonbreeding-location-v2-autopublic-v1');e.seed();
 vm.runInContext(['removePendingLayer','showPendingSpot','renderPendingReports','loadPendingReports'].map(name=>source(CURRENT,name)).join('
'),e.c);
 const added=[];e.c.birdmapPendingMarker=spot=>({spot,options:{},addTo(){added.push(spot.id);return this;}});
 e.c.reportRequestStart=()=>1;e.c.reportResponseCurrent=()=>true;e.c.publicationDataAllowed=()=>true;
 const spots=[{id:'u1',verified:false,lat:37.1,lon:127.1,species:['참새']},{id:'legacy',lat:37.2,lon:127.2,species:['매']},{id:'cached',verified:false,lat:37.3,lon:127.3,species:['까치']},{id:'bad',verified:false,lat:'x',lon:127.4}];
 e.c.publicationFetch=async()=>({ok:true,spots});
 assert.equal(await e.c.loadPendingReports(),true);
 assert.deepEqual(Object.keys(e.c.reportPendingLayers),['u1'],'only verified:false with finite coordinates and no approved layer');
 e.c.publicationFetch=async()=>({ok:true,spots:[]});
 assert.equal(await e.c.loadPendingReports(),true);
 assert.equal(Object.keys(e.c.reportPendingLayers).length,0,'rejected/withdrawn reports disappear on the next list');
 e.c.publicationAllowed=()=>false;e.c.showPendingSpot(spots[0]);
 assert.equal(Object.keys(e.c.reportPendingLayers).length,0,'no drawing without fresh public permission');
});
test('v2 frontend BFCache restore purges retained pending coordinates before any new reads',()=>{
 const e=env(PRIOR_V2,'nonbreeding-location-v2');e.seed();e.authority.projection='nonbreeding-location-v2-autopublic-v1';
 e.restore();assert.ok(e.closed());
});
