// Actual approved loader and search functions; verified transport is synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function source(name,next){
 const start=html.indexOf('function '+name+'('),end=html.indexOf('function '+next+'(',start);
 assert.ok(start>=0&&end>start,'Actual product function '+name);
 return html.slice(start,end);
}
const loader=source('loadApprovedReports','renderApprovedReports');
const sequence=html.slice(html.indexOf('var reportRequestSeq='),html.indexOf('function cachedSiteHistory('));
const search=source('buildReportSearchIndex','reportEntryMatches');
const fixture=()=>({ok:true,spots:[{id:'synthetic-ordinary',lat:37,lon:127,
 history:[{date:'2026-10-13',species:['ordinary-synthetic'],reporter:'synthetic-independent'}]}],
 fixedSpots:{'fixed:195:0':{history:[
 {date:'2026-10-13',species:['fixed-synthetic-a'],reporter:'synthetic-a'},
 {date:'2026-10-12',species:['fixed-synthetic-b'],reporter:'synthetic-b'}]}}});
function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
function environment(body){
 let resolve;const snapshots=[],popupSnapshots=[],errors=[];
 const pending=new Promise(r=>{resolve=r;});
 const c={Promise,Array,Object,console:{error:(...args)=>errors.push(args)},
 reportFixedHistory:{},reportSearchIndex:[],recentReportsFailed:false,
 siteSpotData:[{id:'fixed:195:0',lat:37.01,lon:127.01}],
 reportsConfigured:()=>true,publicationFetch:()=>pending,publicationDataAllowed:()=>true,
 clearSiteHistoryCache(){},renderRecentReports(){},
 renderApprovedReports(){snapshots.push(JSON.parse(JSON.stringify(c.reportFixedHistory)));},
 refreshFixedSpotPopups(){popupSnapshots.push(JSON.parse(JSON.stringify(c.reportFixedHistory)));}};
 vm.createContext(c);vm.runInContext(sequence+'\n'+search+'\n'+loader,c);
 return {c,snapshots,popupSnapshots,errors,release:()=>resolve(body)};
}
for(const frozen of [false,true])test('overlapping approved consumers preserve fixed history and shared DTO'+(frozen?' (frozen)':''),async()=>{
 const body=fixture(),before=JSON.parse(JSON.stringify(body));if(frozen)deepFreeze(body);
 const e=environment(body),a=e.c.loadApprovedReports(),b=e.c.loadApprovedReports();
 e.release();assert.deepEqual(await Promise.all([a,b]),[true,true]);
 assert.equal(e.errors.length,0);
 assert.deepEqual(e.snapshots.map(s=>s['fixed:195:0'].length),[2,2]);
 assert.deepEqual(e.popupSnapshots.map(s=>s['fixed:195:0'].length),[2,2]);
 const fixed=e.c.reportSearchIndex.filter(s=>s.kind==='fixed');
 assert.deepEqual(Array.from(fixed,s=>s.date),['2026-10-13','2026-10-12']);
 assert.equal(e.c.reportSearchIndex.filter(s=>s.kind==='spot').length,1);
 assert.deepEqual(body,before,'Consumers must not transform the shared response');
 assert.notEqual(e.c.reportFixedHistory,body.fixedSpots);
 assert.notEqual(e.c.reportFixedHistory['fixed:195:0'],body.fixedSpots['fixed:195:0'].history);
});
test('unverified approved response cannot restore fixed history or popup names',async()=>{
 const body=fixture(),e=environment(body);e.c.publicationDataAllowed=()=>false;
 const pending=e.c.loadApprovedReports();e.release();assert.equal(await pending,false);
 assert.equal(Object.keys(e.c.reportFixedHistory).length,0);assert.equal(e.snapshots.length,0);assert.equal(e.popupSnapshots.length,0);
});
test('approved withdrawal clears previously linked fixed history',async()=>{
 const body={ok:true,spots:[],fixedSpots:{}},e=environment(body);
 e.c.reportFixedHistory={'fixed:195:0':fixture().fixedSpots['fixed:195:0'].history};
 const pending=e.c.loadApprovedReports();e.release();assert.equal(await pending,true);
 assert.equal(Object.keys(e.c.reportFixedHistory).length,0);assert.equal(e.c.reportSearchIndex.length,0);
 assert.deepEqual(e.popupSnapshots.map(s=>Object.keys(s).length),[0]);
});
