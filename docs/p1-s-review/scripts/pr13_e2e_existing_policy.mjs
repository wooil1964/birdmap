// Execute unchanged actual field functions from PR and comparison main with synthetic dependencies only.
// Usage: node pr13_e2e_existing_policy.mjs REPOSITORY OUTPUT_DIRECTORY
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(process.argv[2]||process.cwd());
const out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url)));
fs.mkdirSync(out,{recursive:true});
const refs={base:'38b45299c832b8ab8ad549762c02979fa8ddfb28',head:'7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e'};
const read=(ref)=>execFileSync('git',['show',ref+':index.html'],{cwd:repo,encoding:'utf8',maxBuffer:8*1024*1024}).replace(/\r\n/g,'\n');
const sources=Object.fromEntries(Object.entries(refs).map(([name,ref])=>[name,read(ref)]));
const names=['loadFieldUpdates','fieldValidUpdate','fieldFind','fieldPublicPoint','fieldGuideStart','fieldGuideUpdate','fieldPopupNode','fieldNewsNavigate'];
function extract(source,name){
 const match=source.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));
 assert.ok(match,'Missing actual '+name);return match[0];
}
const hashes=Object.fromEntries(names.map(name=>[name,Object.fromEntries(Object.entries(sources).map(([version,source])=>[version,createHash('sha256').update(extract(source,name)).digest('hex')]))]));
for(const name of ['loadFieldUpdates','fieldPublicPoint','fieldGuideStart','fieldGuideUpdate'])assert.equal(hashes[name].base,hashes[name].head,'Must reproduce unchanged function '+name);
function fixture(hidden=false){
 return {id:'11111111-1111-4111-8111-111111111111',species:'울새',status:'visible',locationHidden:hidden,lat:36,lon:126,updatedAt:'2026-10-09T00:00:00Z',firstSeenAt:'2026-10-09T00:00:00Z',history:[]};
}
async function race(source){
 let resolveOld;const old=new Promise(r=>{resolveOld=r;});let calls=0;
 const context=vm.createContext({Date,Promise,Array,isNaN,isFinite,FIELD_STATUS_LABEL:{visible:'보임'},reportsConfigured:()=>true,
 fieldApi:()=>++calls===1?old:Promise.resolve({ok:true,status:200,body:{updates:[fixture(true)]}}),
 fieldUpdates:[],fieldAvailable:true,fieldClockOffset:0,fieldTtlHours:3,fieldStepName:'none',
 fieldEl:()=>({hidden:true}),renderFieldMarkers:()=>{},fieldRender:()=>{}});
 vm.runInContext(['fieldValidUpdate','fieldFind','fieldPublicPoint','loadFieldUpdates'].map(name=>extract(source,name)).join('\n'),context);
 const first=context.loadFieldUpdates();await context.loadFieldUpdates();
 const newResponseHidden=context.fieldUpdates[0].locationHidden===true;
 resolveOld({ok:true,status:200,body:{updates:[fixture(false)]}});await first;
 const oldResponseRevertedHidden=context.fieldUpdates[0].locationHidden!==true;
 const navigationReenabled=context.fieldPublicPoint(context.fieldUpdates[0])!==null;
 assert.ok(newResponseHidden&&oldResponseRevertedHidden&&navigationReenabled);
 return {actualFunctionsExecuted:true,newResponseHidden,oldResponseRevertedHidden,navigationReenabled,coordinatesLogged:false};
}
function popupGuide(source){
 const row=fixture(true),elements=new Map();
 const element=(selector)=>{if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);};
 let watchStarted=false,popupClosed=false;
 const layer=()=>({addTo(){return this;},setLatLng(){return this;},setLatLngs(){return this;}});
 const context=vm.createContext({fieldUpdates:[row],fieldGuide:null,
 fieldMap:()=>({closePopup(){popupClosed=true;}}),matchMedia:()=>({matches:false}),navigator:{geolocation:{}},
 L:{latLng:(lat,lon)=>({lat,lon}),circleMarker:layer,polyline:layer,marker:layer,divIcon:()=>({})},
 fieldGuideBox:()=>({querySelector:element}),document:{body:{classList:{add(){}}}},
 fieldGuideWatch:()=>{watchStarted=true;},fieldGuideFit:()=>{},fieldGuideStop:()=>{},
 fieldIsActive:()=>true,fieldAgeText:()=>'',fieldAgeMin:()=>0,fieldToast:()=>{}});
 vm.runInContext(['fieldFind','fieldPublicPoint','fieldGuideUpdate','fieldGuideStart'].map(name=>extract(source,name)).join('\n'),context);
 const newsNavigationBlocked=context.fieldPublicPoint(row)===null;
 context.fieldGuideStart(row.id);
 const approximatePopupGuideStarted=context.fieldGuide!==null;
 const approximateWarningShown=element('.fieldGuideHidden').hidden===false;
 const approximateTitleShown=element('.fieldGuideAge').textContent.includes('대략');
 assert.ok(newsNavigationBlocked&&approximatePopupGuideStarted&&approximateWarningShown&&approximateTitleShown&&watchStarted&&popupClosed);
 return {actualFunctionsExecuted:true,newsNavigationBlocked,approximatePopupGuideStarted,approximateWarningShown,approximateTitleShown,watchStarted,coordinatesLogged:false,
  mockedDependencies:['Leaflet drawing','DOM','geolocation watcher','active/age helpers; tested row is visible']};
}
const experiments={};
for(const [version,source] of Object.entries(sources))experiments[version]={lateResponse:await race(source),protectedPopupGuide:popupGuide(source)};
const line=(source,name)=>source.slice(0,source.indexOf('function '+name+'(')).split('\n').length;
const sourceLines=Object.fromEntries(Object.entries(sources).map(([version,source])=>[version,Object.fromEntries(names.map(name=>[name,line(source,name)]))]));
const policies=Object.fromEntries(Object.entries(sources).map(([version,source])=>[version,{
 desktopCreationHidden:source.includes('@media (pointer:fine){#fieldToggleBtn{display:none!important}}'),
 popupGuideHiddenOnFinePointer:source.includes('@media (pointer:fine){.fieldGuideBtn,#fieldGuideBox,.fieldGuideRingWrap{display:none!important}}'),
 explicitApproximateWarning:source.includes("hidden.textContent='위치 보호로 대략적인 지점입니다. 실제 관찰 지점이 아닙니다.';"),
 popupGuideAddedWithoutLocationHiddenCondition:extract(source,'fieldPopupNode').includes("add('🧭 현장 방향 안내',function(){fieldGuideStart(update.id);}).className='fieldGuideBtn';")
}]));
const result={schemaVersion:1,refs,sourceFunctionHashes:hashes,sourceLines,experiments,policies,
 classification:'Both behaviors pre-exist on latest comparison main. Neither is introduced by S1-R. They remain S1-P/navigation-cache policy decisions.',
 constraints:{networkCalls:0,productionD1Access:0,sourceChanges:0,coordinatesLogged:false}};
fs.writeFileSync(path.join(out,'pr13_e2e_existing_policy.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({actualScenarios:4,passed:4,unchangedFunctionCount:Object.values(hashes).filter(h=>h.base===h.head).length,output:path.join(out,'pr13_e2e_existing_policy.json')}));
