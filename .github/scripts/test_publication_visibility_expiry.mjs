import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(process.env.INDEX_PATH||new URL('../../index.html',import.meta.url),'utf8');
const block=html.slice(html.indexOf('var PUBLICATION_CONTRACT='),html.indexOf('/* publication:end */'));
assert.ok(block.includes('function publicationFetch('));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function env(){
 let wall=1_000_000,mono=0;const events={},calls=[],queue=[],removed=[];
 const authority={contract:'publication-v1',projection:'legacy-public-v1',epoch:'a'.repeat(32),revision:'1'};
 const doc={hidden:false,addEventListener(name,fn){(events[name]||(events[name]=[])).push(fn);},getElementById(){return {hidden:false,style:{}};},querySelectorAll(){return [];}};
 const c={Date:class extends Date{static now(){return wall;}},performance:{now:()=>mono},Promise,BigInt,Number,Uint8Array,URL,crypto:{getRandomValues(b){for(let i=0;i<b.length;i++)b[i]=(calls.length+i)%256;}},AbortController,
 document:doc,window:{addEventListener(name,fn){(events[name]||(events[name]=[])).push(fn);}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
 REPORTS_API_URL:'https://synthetic.invalid',reportsConfigured:()=>true,
 reportSpotLayers:{},reportPendingLayers:{},fieldMarkers:{},fieldUpdates:[],reportSearchIndex:[],reportFixedHistory:{},recentSiteSightings:{},contributorsData:null,fieldGuide:null,
 clearSiteHistoryCache(){},clearContributors(){c.contributorsData=null;},renderRecentReports(){},refreshFixedSpotPopups(){},renderFieldNews(){},refreshTodayPanelIfOpen(){},
 fieldNavChoiceClose(){},fieldGuideStop(){c.fieldGuide=null;},
 map_7010a44f6ac2025090f0fe07508ed485:{removeLayer(x){removed.push(x);}},
 loadApprovedReports:()=>Promise.resolve(true),loadPendingReports:()=>Promise.resolve(true),loadRecentSiteSightings:()=>Promise.resolve(true),loadFieldUpdates:()=>Promise.resolve(true),
 fetch(url){const u=new URL(url);calls.push(u.pathname);const make=()=>({ok:true,json:async()=>({ok:true,spots:[],serverTime:new Date(wall).toISOString(),publication:{...authority,nonce:u.searchParams.get('nonce')}})});
   if(queue.length)return queue.shift()(make);return Promise.resolve(make());}};
 vm.createContext(c);vm.runInContext(block,c);
 function seed(){c.publicationState.ready=true;c.publicationState.until=wall+5000;c.publicationState.checkedMono=mono;c.publicationState.anchor={...authority};c.publicationState.needsRefresh=false;
 c.reportPublicSpots={one:{lat:37,lon:127,reporter:'synthetic-private'}};c.reportSpotLayers={one:{unbindPopup(){},getPopup(){return null;}}};c.fieldUpdates=[{id:'one',lat:37,lon:127,nickname:'synthetic-private'}];c.contributorsData={name:'synthetic-private'};}
 function hide(){doc.hidden=true;for(const fn of events.visibilitychange||[])fn();}
 return {c,doc,calls,queue,seed,hide,authority,advance(ms){wall+=ms;mono+=ms;},removed};
}
const closed=e=>!e.c.publicationState.ready&&Object.keys(e.c.reportPublicSpots).length===0&&Object.keys(e.c.reportSpotLayers).length===0&&e.c.contributorsData===null;
test('hidden permission detection destructively removes live coordinates and names',()=>{const e=env();e.seed();e.doc.hidden=true;assert.equal(e.c.publicationAllowed(),false);assert.ok(closed(e));});
test('exact5000ms expiry detection destructively removes live coordinates and names',()=>{const e=env();e.seed();e.advance(5000);assert.equal(e.c.publicationAllowed(),false);assert.ok(closed(e));});
test('valid4999ms permission stays public and the lease cap is unchanged',()=>{const e=env();e.seed();e.advance(4999);assert.equal(e.c.publicationAllowed(),true);assert.equal(e.c.PUBLICATION_MAX_AGE,5000);assert.equal(e.c.PUBLICATION_POLL_MS,5000);assert.equal(e.c.PUBLICATION_RENEW_MARGIN_MS,1000);/* renewal starts 1s before the unchanged 5s cap (was 250ms; expired on ordinary slow responses) */assert.equal(Object.keys(e.c.reportPublicSpots).length,1);});
test('hidden HEAD issues no network request',async()=>{const e=env();e.doc.hidden=true;await assert.rejects(e.c.publicationHead(true));assert.equal(e.calls.length,0);});
test('hidden payload/refresh/route issues no network and never executes callback',async()=>{const e=env();e.seed();e.hide();let ran=false;await assert.rejects(e.c.publicationFetch('/reports/approved'));assert.equal(await e.c.publicationRefresh(),false);assert.equal(await e.c.publicationRouteCheck(()=>{ran=true;}),false);assert.equal(ran,false);assert.equal(e.calls.length,0);assert.ok(closed(e));});
test('HEAD started before visibility barrier is rejected after late arrival',async()=>{const e=env();e.seed();const d=deferred();e.queue.push(make=>d.promise.then(make));const p=e.c.publicationHead(true);e.hide();d.resolve();await assert.rejects(p);assert.ok(closed(e));});
test('payload arriving after hide never issues postflight or restores data',async()=>{const e=env();e.seed();const d=deferred();e.queue.push(make=>Promise.resolve(make()),make=>d.promise.then(make));const p=e.c.publicationFetch('/reports/approved');await new Promise(r=>setImmediate(r));assert.equal(e.calls.length,2);e.hide();d.resolve();await assert.rejects(p);assert.equal(e.calls.length,2);assert.ok(closed(e));});
test('late old HEAD failure cannot invalidate newer visible recovered state',async()=>{const e=env();e.seed();const d=deferred();e.queue.push(()=>d.promise);const p=e.c.publicationHead(true);e.hide();e.doc.hidden=false;e.seed();const generation=e.c.publicationState.generation;d.reject(new Error('late old failure'));await assert.rejects(p);assert.equal(e.c.publicationState.generation,generation);assert.equal(e.c.publicationAllowed(),true);});
test('visibility barrier releases old in-flight references for normal recovery',async()=>{const e=env();e.seed();const d=deferred();e.queue.push(make=>d.promise.then(make));const old=e.c.publicationHead();e.hide();e.doc.hidden=false;const fresh=await Promise.race([e.c.publicationHead(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fresh visible recovery must not wait for the old context')),150))]).finally(()=>d.resolve());assert.equal(fresh._publicationGeneration,e.c.publicationState.generation);await assert.rejects(old);assert.equal(e.c.publicationState.anchor.revision,'1');});
test('new primary authority is accepted through fresh payload and postflight',async()=>{const e=env();e.seed();e.authority.revision='2';const data=await e.c.publicationFetch('/reports/approved');assert.equal(data.publication.revision,'2');assert.equal(e.c.publicationState.anchor.revision,'2');assert.equal(e.c.publicationDataAllowed(data),true);assert.equal(e.calls.length,3);});
test('renewal must match current epoch/revision and generation',()=>{const e=env();e.seed();const h={publication:{...e.authority,revision:'0'},_publicationStartedMono:0,_publicationGeneration:e.c.publicationState.generation,serverTime:new Date().toISOString()};assert.equal(e.c.publicationRenew(h),false);assert.ok(closed(e));});
