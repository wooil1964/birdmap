import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const repo=process.argv[2],out=process.argv[3];
if(!repo||!out)throw new Error('Usage: node pre-renewal-scheduling.mjs <repo> <out.json>');
const sha='c025d75f964ab36f6f2eae541a99461f6de59b70';
const html=execFileSync('git',['show',`${sha}:index.html`],{cwd:repo,encoding:'utf8',maxBuffer:20e6});
function source(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const stop=html.indexOf('\nfunction ',start+1);assert.ok(stop>start,name);const candidate=html.slice(start,stop),end=candidate.indexOf('\n}');return end<0?candidate:candidate.slice(0,end+2);}
async function run({period=4750,rtt=75,pollJitter=0,hidden=false}){
 let mono=0,id=0,nonceSequence=0;const wallStart=Date.parse('2026-10-13T00:00:00+09:00'),timers=new Map(),calls=[],invalidations=[],renewals=[];
 const anchor={contract:'publication-v1',projection:'legacy-public-v1',epoch:'a'.repeat(32),revision:'100'};
 const schedule=(fn,ms)=>{const n=++id;timers.set(n,{at:mono+ms,fn});return n;};
 const ctx={Promise,BigInt,Number,Error,Date:class extends Date{static now(){return wallStart+mono;}},performance:{now:()=>mono},setTimeout:schedule,clearTimeout:n=>timers.delete(n),PUBLICATION_CONTRACT:'publication-v1',PUBLICATION_PROJECTION:'legacy-public-v1',PUBLICATION_MAX_AGE:5000,publicationHeadPromise:null,publicationExpiryTimer:0,publicationRefreshPromise:null,publicationState:{generation:2,ready:true,anchor:{...anchor,nonce:'b'.repeat(32)},until:wallStart+5000,checkedMono:0},document:{hidden:false,getElementById:()=>({hidden:true}),querySelectorAll:()=>[]},reportPublicSpots:{},reportSearchIndex:[],reportFixedHistory:{},recentSiteSightings:{},reportSpotLayers:{},reportPendingLayers:{},fieldMarkers:{},fieldUpdates:[],fieldLayer:null,fieldGuide:null,fieldNavChoiceClose:()=>{},clearSiteHistoryCache:()=>{},clearContributors:()=>{},reportsConfigured:()=>true,publicationNonce:()=> (++nonceSequence).toString(16).padStart(32,'0'),publicationJson:path=>{const params=new URLSearchParams(path.split('?')[1]||''),started=mono;calls.push({path:path.split('?')[0],started});return new Promise(resolve=>schedule(()=>resolve({ok:true,spots:[],sites:[],updates:[],fixedSpots:{},serverTime:new Date(wallStart+mono).toISOString(),publication:{...anchor,nonce:params.get('nonce')}}),rtt));}};
 for(const [name,path] of [['loadApprovedReports','/reports/approved'],['loadPendingReports','/reports/pending'],['loadRecentSiteSightings','/reports/recent-sites?days=14'],['loadFieldUpdates','/field-updates']])ctx[name]=()=>ctx.publicationFetch(path).then(body=>ctx.publicationDataAllowed(body)).catch(()=>false);
 vm.createContext(ctx);vm.runInContext(['publicationRevision','publicationSame','publicationAllowed','publicationNotice','publicationForgetLayer','publicationInvalidate','publicationRenew','publicationValidate','publicationHead','publicationDataAllowed','publicationFetch','publicationRefresh','publicationRecheck'].map(source).join('\n'),ctx);
 const actualInvalidate=ctx.publicationInvalidate,actualRenew=ctx.publicationRenew;
 ctx.publicationInvalidate=reason=>{invalidations.push({reason,at:mono});return actualInvalidate(reason);};
 ctx.publicationRenew=body=>{const result=actualRenew(body);if(result){assert.equal(ctx.publicationState.checkedMono,body._publicationStartedMono);assert.equal(ctx.publicationState.until-wallStart,body._publicationStartedMono+5000);assert.equal(ctx.publicationAllowed(),true);renewals.push({at:mono,started:body._publicationStartedMono,expires:ctx.publicationState.until-wallStart});}return result;};
 ctx.publicationRenew({_publicationStartedMono:0,serverTime:new Date(wallStart).toISOString()});
 for(let t=period;t<=65000;t+=period)schedule(()=>{ctx.publicationRecheck();},t+pollJitter);
 schedule(()=>ctx.loadFieldUpdates(),60000);
 if(hidden){schedule(()=>{ctx.document.hidden=true;ctx.publicationInvalidate('visibility');},32500);schedule(()=>{ctx.document.hidden=false;ctx.publicationRefresh();},42500);}
 async function flush(){for(let n=0;n<40;n++)await Promise.resolve();}
 while(true){let next=null;for(const [key,item]of timers)if(item.at<=65000&&(!next||item.at<next.item.at||(item.at===next.item.at&&key<next.key)))next={key,item};if(!next)break;mono=next.item.at;timers.delete(next.key);next.item.fn();await flush();}
 mono=65000;await flush();
 const counts={head:calls.filter(c=>c.path==='/reports/public-state').length,approved:calls.filter(c=>c.path==='/reports/approved').length,pending:calls.filter(c=>c.path==='/reports/pending').length,recent:calls.filter(c=>c.path==='/reports/recent-sites').length,field:calls.filter(c=>c.path==='/field-updates').length};
 return {period,rtt,pollJitter,hidden,counts,total:calls.length,invalidations,renewals,finalAllowed:ctx.publicationAllowed(),hiddenHeadCalls:hidden?calls.filter(c=>c.path==='/reports/public-state'&&c.started>=32500&&c.started<42500).length:null};
}
const baseline=await run({period:5000,rtt:75});
assert.ok(baseline.invalidations.some(x=>x.reason==='expired'));assert.ok(baseline.counts.approved>0&&baseline.counts.pending>0&&baseline.counts.recent>0);
const fast=await run({period:4750,rtt:75});assert.equal(fast.invalidations.length,0);assert.equal(fast.counts.approved,0);assert.equal(fast.counts.pending,0);assert.equal(fast.counts.recent,0);assert.equal(fast.counts.field,1);assert.equal(fast.finalAllowed,true);
const margin=await run({period:4750,rtt:249});assert.equal(margin.invalidations.length,0);assert.equal(margin.counts.approved,0);
const slow=await run({period:4750,rtt:300});assert.ok(slow.invalidations.some(x=>x.reason==='expired'));assert.ok(slow.counts.approved>0);
const jitter=await run({period:4750,rtt:75,pollJitter:200});assert.ok(jitter.invalidations.some(x=>x.reason==='expired'));assert.ok(jitter.counts.approved>0);
const hidden=await run({period:4750,rtt:75,hidden:true});assert.equal(hidden.hiddenHeadCalls,0);assert.ok(hidden.invalidations.some(x=>x.reason==='visibility'));assert.ok(hidden.counts.approved>0);
const result={inputSha:sha,functions:'Actual existing publication functions evaluated unchanged; cadence and network are virtual deterministic harness inputs',sourceModified:false,productionRequests:0,scenarios:6,passed:6,failed:0,notes:['Steady permission already loaded at time0; startup requests excluded','Field periodic refresh at60000ms retained','No DTO cache or UI restoration changes','All successful renewals expire exactly at actual primary-request-start+5000ms','This is scheduler/contract unit evidence, not Chrome load measurement'],theoreticalHeadRate:{perUserHourAt5000:720,perUserHourAt4750:3600000/4750,twentyUsersEightHoursAt5000:115200,twentyUsersEightHoursAt4750:160*3600000/4750},results:[baseline,fast,margin,slow,jitter,hidden]};writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,results:result.results.map(({renewals,invalidations,...r})=>({...r,renewals:renewals.length,invalidations}))}));
