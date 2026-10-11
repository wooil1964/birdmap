/* Independent security properties, using product function sources.
 * Synthetic data only. No network, Worker, D1, user writes, or external coordinates.
 * This is an independently chosen seven-case set; the implementer's unspecified
 * "7 mutations" list was not found and is NOT claimed to have been reproduced.
 *
 * node docs/p1-location-review/scripts/independent_security_variants.mjs
 *   --index PATH --out PATH --label LABEL
 * INDEX_PATH can supply the input when --index is absent.
 * Exit 1 preserves any failed security property; results are still written.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = name => { const i=args.indexOf(name); return i<0 ? null : args[i+1]; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const indexPath = path.resolve(option('--index') || process.env.INDEX_PATH || path.join(root,'index.html'));
const outPath = option('--out');
const original = fs.readFileSync(indexPath,'utf8');
const HTML = original.replace(/\r\n/g,'\n');
const NOW = Date.parse('2026-10-08T10:00:00+09:00');
const iso = minutes => new Date(NOW-minutes*60000).toISOString();
const makeUpdate = (id, extra={}) => Object.assign({
  id, species:'Synthetic ordinary bird', status:'visible', lat:36.6, lon:126.4,
  updatedAt:iso(5), firstSeenAt:iso(5), lastConfirmedAt:null,
  nickname:'Synthetic tester', confirmCount:0, count:1, note:'', history:[],
},extra);
const hiddenUpdate = id => makeUpdate(id,{locationHidden:true,lat:36.5,lon:126.5});
const makeSpot = (id, hidden=false) => ({
  id, species:['Synthetic ordinary bird'],
  lat:hidden?36.5:36.6, lon:hidden?126.5:126.4,
  ...(hidden?{locationHidden:true}:{}),
  history:[{date:'2026-10-08',species:['Synthetic ordinary bird']}],
});

function source(name, optional=false){
  const start=HTML.indexOf('function '+name+'(');
  if(start<0){if(optional)return '';throw new Error('Missing product function: '+name);}
  let depth=0, quote=null;
  for(let i=HTML.indexOf('{',start);i<HTML.length;i++){
    const c=HTML[i], prev=HTML[i-1];
    if(quote){if(c===quote&&prev!=='\\')quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='/'&&HTML[i+1]==='/'){i=HTML.indexOf('\n',i);continue;}
    if(c==='/'&&HTML[i+1]==='*'){i=HTML.indexOf('*/',i+2)+1;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return HTML.slice(start,i+1);
  }
  throw new Error('Unbalanced product function: '+name);
}
const sourceLine=name=>HTML.slice(0,HTML.indexOf('function '+name+'(')).split('\n').length;
const sourceJoin=names=>names.map(name=>source(name)).join('\n');

function reportsEnv(){
  const calls=[];
  const live=new Set();
  const map={removeLayer(marker){live.delete(marker);}};
  const L={circleMarker(position){
    return {
      position:position.slice(),popup:'',bindPopup(popup){this.popup=popup;return this;},
      bindTooltip(){return this;},addTo(){live.add(this);return this;},
    };
  }};
  const functions=['reportRequestStart','reportResponseCurrent','loadApprovedReports','renderApprovedReports',
    'spotKakaoRouteUrl','spotKakaoRouteHtml','spotPopupHtml','birdmapSpotMarker','buildReportSearchIndex'];
  const optional=['tmapNavigationUrl','tmapNavigationLink','spotTmapRouteHtml','spotRouteButtonsHtml'];
  const body=[
    'var REPORTS_API_URL="https://synthetic.invalid",reportRequestSeq={approved:0,pending:0,recent:0},reportAppliedSeq={approved:0,pending:0,recent:0};',
    'var reportSpotLayers={},reportFixedHistory={},recentReportsFailed=false,reportSearchIndex=[],siteSpotData=[];',
    'function reportsConfigured(){return true} function clearSiteHistoryCache(){} function renderRecentReports(){} function refreshFixedSpotPopups(){} function removePendingLayer(){}',
    'function escapeHtml(value){return String(value)} function spotSpeciesCoveredByHistory(){return false} function spotHistoryHtml(){return ""}',
    sourceJoin(functions),optional.map(name=>source(name,true)).join('\n'),
    'return {loadApprovedReports,get layers(){return reportSpotLayers},get index(){return reportSearchIndex}};',
  ].join('\n');
  const api=new Function('fetch','L','map_7010a44f6ac2025090f0fe07508ed485',body)(
    () => new Promise(resolve=>calls.push(resolve)),L,map);
  const respond=(n,spots,ageMinutes=0)=>calls[n]({ok:true,json:async()=>({ok:true,generatedAt:iso(ageMinutes),spots})});
  const snapshot=()=>({
    ids:Object.keys(api.layers),
    markers:Object.fromEntries(Object.entries(api.layers).map(([id,m])=>[id,{
      coordinates:m.position,hasKakaoRoute:m.popup.includes('https://map.kakao.com/link/to/'),
      hasTmapRoute:m.popup.includes('tmap://route'),hiddenNote:m.popup.includes('spotHiddenNote'),
    }])),
    searchCoordinates:api.index.map(e=>[e.lat,e.lon]),
  });
  return {api,respond,snapshot};
}

function element(tag='div'){
  return {
    tag,children:[],attributes:{},textContent:'',className:'',hidden:false,parentNode:null,
    appendChild(child){this.children.push(child);child.parentNode=this;return child;},
    removeChild(child){this.children=this.children.filter(x=>x!==child);child.parentNode=null;},
    setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},
  };
}
const textTree=node=>[node.textContent||'',...(node.children||[]).map(textTree)].join(' ');
function fieldEnv(){
  const calls=[],markers=[],map={closePopup(){},removeLayer(){},hasLayer(){return true;}};
  const L={
    divIcon:options=>options,
    layerGroup:()=>({addTo(){return this;},removeLayer(){}}),
    marker(position){
      const marker={
        position:position.slice(),content:null,contentUpdates:0,opened:false,callback:null,
        bindPopup(callback){this.callback=callback;return this;},addTo(){markers.push(this);return this;},
        setLatLng(pos){this.position=pos.slice();return this;},setIcon(){return this;},
        isPopupOpen(){return this.opened;},openPopup(){this.opened=true;this.content=this.callback();return this;},
        getPopup(){return {setContent:content=>{this.contentUpdates++;this.content=content;}};},
      };
      return marker;
    },
  };
  const functions=['fieldGuardIncoming','fieldBarrier','loadFieldUpdates','fieldFind','fieldValidUpdate',
    'fieldMarkerClass','fieldMarkerSignature','renderFieldMarkers','fieldRemoveLocal','fieldPublicPoint',
    'fieldIsActive','fieldAgeMin','fieldActivityMs','fieldAgeText','fieldPopupNode','fieldLine','fieldGuideTarget',
    'fieldNavChoiceGuard','fieldNavChoiceClose'];
  const body=[
    'var fieldUpdates=[],fieldMarkers={},fieldLayer=null,fieldGuide=null,fieldAvailable=false,fieldClockOffset=0,fieldTtlHours=3,fieldStepName="menu";',
    'var fieldRequestSeq=0,fieldAppliedSeq=0,fieldBarrierSeq=0,fieldTombstones={},fieldProtectedIds={};',
    'var FIELD_OLD_MIN=60,FIELD_AGING_MIN=30,FIELD_STATUS_LABEL={visible:"visible",reappeared:"reappeared",searching:"searching"};',
    'function reportsConfigured(){return true} function fieldMap(){return map} function fieldNowMs(){return NOW}',
    'function fieldEl(id){return id==="fieldPanel"?{hidden:true}:id==="fieldToggleBtn"?{hidden:true}:null;}',
    'function fieldClock(value){return String(value)} function fieldIsMine(){return false} function fieldRender(){} function renderFieldNews(){}',
    sourceJoin(functions),
    'return {loadFieldUpdates,fieldRemoveLocal,fieldPublicPoint,get updates(){return fieldUpdates},get markers(){return fieldMarkers},get tombstones(){return fieldTombstones},get protectedIds(){return fieldProtectedIds}};',
  ].join('\n');
  const api=new Function('L','map','NOW','document','fieldApi',body)(
    L,map,NOW,{createElement:element,body:element('body')},
    ()=>new Promise(resolve=>calls.push(resolve)));
  const respond=(n,updates)=>calls[n]({ok:true,status:200,body:{ok:true,updates,serverTime:new Date(NOW).toISOString()}});
  const snapshot=()=>({
    ids:api.updates.map(u=>u.id),markerIds:Object.keys(api.markers),
    navigationEligible:api.updates.map(u=>({id:u.id,allowed:!!api.fieldPublicPoint(u)})),
    hidden:api.updates.map(u=>({id:u.id,hidden:u.locationHidden===true})),
  });
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {api,respond,snapshot,settle,markers};
}

const results=[];
async function run(id,title,fn){
  try{
    const {expected,actual,pass,functions}=await fn();
    results.push({id,title,expected,actual,pass,status:pass?'pass':'fail',functions:functions.map(name=>({name,line:sourceLine(name)}))});
  }catch(error){
    results.push({id,title,pass:false,status:'error',error:{name:error.name,message:error.message}});
  }
}

await run('V01','Approved hidden response then older in-flight public response',async()=>{
  const e=reportsEnv();const old=e.api.loadApprovedReports(),fresh=e.api.loadApprovedReports();
  e.respond(1,[makeSpot('synthetic-a',true)]);await fresh;
  e.respond(0,[makeSpot('synthetic-a')],5);await old;
  const actual=e.snapshot(),m=actual.markers['synthetic-a'];
  return {expected:{hiddenNote:true,kakaoRoute:false,tmapRoute:false,coordinates:[36.5,126.5]},actual,
    pass:m.hiddenNote&&!m.hasKakaoRoute&&!m.hasTmapRoute&&m.coordinates[0]===36.5&&m.coordinates[1]===126.5,
    functions:['reportResponseCurrent','loadApprovedReports','renderApprovedReports','spotPopupHtml']};
});
await run('V02','Approved withdrawal then older in-flight public response',async()=>{
  const e=reportsEnv();const old=e.api.loadApprovedReports(),fresh=e.api.loadApprovedReports();
  e.respond(1,[]);await fresh;e.respond(0,[makeSpot('synthetic-a')],5);await old;
  const actual=e.snapshot();
  return {expected:{restoredMarkers:0},actual,pass:actual.ids.length===0,
    functions:['reportResponseCurrent','loadApprovedReports','renderApprovedReports']};
});
await run('V03','Approved hidden state then later request returns older cache',async()=>{
  const e=reportsEnv();let p=e.api.loadApprovedReports();e.respond(0,[makeSpot('synthetic-a',true)]);await p;
  p=e.api.loadApprovedReports();e.respond(1,[makeSpot('synthetic-a')],5);await p;
  const actual=e.snapshot(),m=actual.markers['synthetic-a'];
  return {expected:{exactCoordinatesRestored:false,kakaoRoute:false,tmapRoute:false,hiddenNote:true},actual,
    pass:m.hiddenNote&&!m.hasKakaoRoute&&!m.hasTmapRoute&&m.coordinates[0]===36.5&&m.coordinates[1]===126.5,
    functions:['reportResponseCurrent','loadApprovedReports','renderApprovedReports','spotPopupHtml']};
});
await run('V04','Approved withdrawal then later request returns older cache',async()=>{
  const e=reportsEnv();let p=e.api.loadApprovedReports();e.respond(0,[]);await p;
  p=e.api.loadApprovedReports();e.respond(1,[makeSpot('synthetic-a')],5);await p;
  const actual=e.snapshot();
  return {expected:{restoredMarkers:0,restoredSearchCoordinates:0},actual,
    pass:actual.ids.length===0&&actual.searchCoordinates.length===0,
    functions:['reportResponseCurrent','loadApprovedReports','renderApprovedReports','buildReportSearchIndex']};
});
await run('V05','Remote field deletion observed then later request returns older cache',async()=>{
  const e=fieldEnv();let p=e.api.loadFieldUpdates();e.respond(0,[makeUpdate('synthetic-a')]);await p;
  p=e.api.loadFieldUpdates();e.respond(1,[]);await p;
  p=e.api.loadFieldUpdates();e.respond(2,[makeUpdate('synthetic-a')]);await p;
  const actual=e.snapshot();
  return {expected:{restoredUpdates:0,restoredMarkers:0,navigationEligible:0},actual,
    pass:actual.ids.length===0&&actual.markerIds.length===0&&!actual.navigationEligible.some(u=>u.allowed),
    functions:['loadFieldUpdates','fieldGuardIncoming','fieldRemoveLocal','fieldPublicPoint']};
});
await run('V06','Fresh page loses deletion/protection guards and receives older cache',async()=>{
  const prior=fieldEnv();let p=prior.api.loadFieldUpdates();prior.respond(0,[makeUpdate('synthetic-deleted'),hiddenUpdate('synthetic-hidden')]);await p;
  prior.api.fieldRemoveLocal('synthetic-deleted');prior.respond(1,[makeUpdate('synthetic-deleted'),hiddenUpdate('synthetic-hidden')]);await prior.settle();
  const refreshed=fieldEnv();p=refreshed.api.loadFieldUpdates();
  refreshed.respond(0,[makeUpdate('synthetic-deleted'),makeUpdate('synthetic-hidden')]);await p;
  const actual={beforeRefresh:prior.snapshot(),afterRefresh:refreshed.snapshot()};
  return {expected:{deletedRestored:false,hiddenNavigationAllowed:false},actual,
    pass:!actual.afterRefresh.ids.includes('synthetic-deleted')&&!actual.afterRefresh.navigationEligible.some(u=>u.id==='synthetic-hidden'&&u.allowed),
    functions:['fieldRemoveLocal','fieldGuardIncoming','loadFieldUpdates','fieldPublicPoint']};
});
await run('V07','Only locationHidden changes at identical coordinates/time: open popup refresh',async()=>{
  const e=fieldEnv();let p=e.api.loadFieldUpdates();e.respond(0,[makeUpdate('synthetic-a')]);await p;
  const marker=e.api.markers['synthetic-a'].marker;marker.openPopup();
  const before=textTree(marker.content);
  p=e.api.loadFieldUpdates();e.respond(1,[makeUpdate('synthetic-a',{locationHidden:true})]);await p;
  const text=textTree(marker.content);
  const actual={beforeGuideButton:before.includes('현장 방향 안내'),afterGuideButton:text.includes('현장 방향 안내'),
    afterHiddenNote:text.includes('대략적인 위치'),popupContentUpdates:marker.contentUpdates,
    currentNavigationAllowed:!!e.api.fieldPublicPoint(e.api.updates[0])};
  return {expected:{afterGuideButton:false,afterHiddenNote:true,currentNavigationAllowed:false},actual,
    pass:!actual.afterGuideButton&&actual.afterHiddenNote&&!actual.currentNavigationAllowed,
    functions:['fieldMarkerSignature','renderFieldMarkers','fieldPopupNode','fieldGuideTarget']};
});

const report={
  schema:'birdmap-independent-location-security-variants-v1',label:option('--label')||'unlabelled',
  recordedAt:new Date().toISOString(),evaluationTime:'2026-10-08 10:00:00 KST',
  indexPath,indexSha256:crypto.createHash('sha256').update(original).digest('hex'),
  scope:{network:false,operatingWrites:false,coordinates:'synthetic only',functionExecution:'actual product function source; fake DOM/map/fetch',
    implementerOriginalSevenMutationList:'not found; not independently verified',chromeDOM:false,
    serverFieldCacheContract:'Existing endpoint and client request use no-store; simulated older server cache is a contract-adversarial scenario',
    serverApprovedCacheContract:'Existing endpoint uses public,max-age=60; generatedAt does not equal an authorization revision'},
  counts:{total:results.length,pass:results.filter(r=>r.status==='pass').length,fail:results.filter(r=>r.status==='fail').length,error:results.filter(r=>r.status==='error').length,skip:0},
  results,
};
if(outPath){const absolute=path.resolve(outPath);fs.mkdirSync(path.dirname(absolute),{recursive:true});fs.writeFileSync(absolute,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
if(report.counts.fail||report.counts.error)process.exitCode=1;
