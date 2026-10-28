import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../assets/birdmap-location.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function env({secure=true,supported=true}={}){
 const layers=new Set(),calls=[],messages=[],gps=[],watched=[],cleared=[];let hidden=false;
 const map={hasLayer:l=>layers.has(l),removeLayer:l=>layers.delete(l),distance:()=>1234.5};
 const L={};for(const kind of ['circle','circleMarker','polyline'])L[kind]=(p,options)=>({kind,p,options,addTo(){layers.add(this);return this;},setLatLng(p){this.p=p;return this;},setRadius(r){this.options.radius=r;return this;},bringToFront(){},bindTooltip(t){this.tooltip=t;return this;},openTooltip(){return this;}});
 L.tooltip=()=>({setContent(n){this.content=n;return this;}});
 const document={readyState:'loading',addEventListener(){},createElement:()=>({textContent:''})};
 const w={document};vm.runInNewContext(source,{window:w,Promise,Number,Date});
 const geo={getCurrentPosition(ok,bad,options){gps.push({ok,bad,options});},watchPosition(ok,bad,options){watched.push({ok,bad,options});return watched.length;},clearWatch:id=>cleared.push(id)};
 const api=w.BirdmapLocation.create({map,L,geolocation:supported?geo:null,isSecure:()=>secure,hidden:()=>hidden,notify:s=>messages.push(s),fit:(...a)=>calls.push(a)});
 const layer={};layers.add(layer);const popup={};layers.add(popup);let valid=true;
 const target=()=>({layer,point:{lat:36.3,lng:127.3},publicReport:true,label:'출현 지점',valid:()=>valid});
 const position=(extra={})=>({coords:{latitude:37.12345678,longitude:126.23456789,accuracy:25,...extra},timestamp:Date.now()});
 return{api,layers,calls,messages,gps,watched,cleared,layer,popup,target,position,hide:()=>hidden=true,revoke:()=>valid=false,by:kind=>[...layers].filter(l=>l.kind===kind),distanceText:w.BirdmapLocation.distanceText};
}
test('GPS asks only on activation; blue point, accuracy metres and straight dashed distance use in-memory layers',async()=>{
 const e=env();assert.equal(e.gps.length,0);let proofs=0;
 await e.api.guide(()=>{proofs++;return e.target();},e.popup);assert.equal(proofs,1);assert.equal(e.gps.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(e.gps[0].options)),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 e.gps[0].ok(e.position());await tick();assert.equal(proofs,2);assert.equal(e.by('circleMarker').length,1);assert.equal(e.by('circle')[0].options.radius,25);
 assert.equal(e.by('polyline').length,1);assert.equal(e.by('polyline')[0].options.dashArray,'7 8');assert.match(e.by('polyline')[0].tooltip.content.textContent,/직선거리 1.23 km/);assert.equal(e.calls.length,1);
 assert.equal(e.distanceText(980),'980 m');assert.equal(e.distanceText(12000),'12.0 km');
});
test('independent locate recentres and cancels an old guide; no automatic tracking',async()=>{
 const e=env();await e.api.guide(e.target,e.popup);e.api.locate();e.gps[0].ok(e.position());await tick();assert.equal(e.by('circleMarker').length,0);
 e.gps[1].ok(e.position());assert.equal(e.by('circleMarker').length,1);assert.equal(e.by('polyline').length,0);assert.equal(e.watched.length,0);assert.equal(e.calls[0][1],null);
});
test('clear, guide end, popup close, destination removal, hidden page and invalidation cancel delayed GPS',async()=>{
 for(const action of ['clear','stopGuide','popup','layer','hide','invalidate']){
  const e=env();await e.api.guide(e.target,e.popup);
  if(action==='popup')e.api.popupClosed(e.popup);else if(action==='layer')e.api.layerRemoved(e.layer);else if(action==='hide')e.hide();else e.api[action]();
  e.gps[0].ok(e.position());await tick();assert.equal(e.by('polyline').length,0,action);assert.equal(e.by('circleMarker').length,0,action);
 }
});
test('revocation during GPS or a delayed proof cannot draw a destination',async()=>{
 for(const phase of ['gps','proof']){
  const e=env();let release,count=0;
  await e.api.guide(()=>++count===1?e.target():new Promise(r=>release=r),e.popup);
  if(phase==='gps')e.revoke();e.gps[0].ok(e.position());await tick();
  if(phase==='proof')e.api.invalidate();release(e.target());await tick();assert.equal(e.by('polyline').length,0);assert.equal(e.by('circleMarker').length,0);
 }
});
test('invalid public target never requests GPS; coordinates that change after preflight fail closed',async()=>{
 const e=env();await e.api.guide(()=>null,e.popup);assert.equal(e.gps.length,0);
 let n=0;await e.api.guide(()=>({...e.target(),point:{lat:++n===1?36:38,lng:127}}),e.popup);e.gps[0].ok(e.position());await tick();assert.equal(e.by('polyline').length,0);
});
test('watch is opt-in, updates existing layers without forcing camera, and stops cleanly',async()=>{
 const e=env();await e.api.guide(e.target,e.popup);e.gps[0].ok(e.position());await tick();e.api.setTracking(true);assert.equal(e.watched.length,1);
 e.watched[0].ok(e.position({latitude:37.2,accuracy:40}));await tick();assert.equal(e.by('circleMarker').length,1);assert.equal(e.by('circle')[0].options.radius,40);assert.equal(e.calls.length,1);
 e.api.setTracking(false);e.watched[0].ok(e.position({latitude:38}));await tick();assert.equal(e.by('circleMarker')[0].p.lat,37.2);assert.deepEqual(e.cleared,[1]);
 e.api.stopGuide();assert.equal(e.by('polyline').length,0);assert.equal(e.by('circleMarker').length,1);e.api.clear();assert.equal(e.by('circleMarker').length,0);assert.equal(e.by('circle').length,0);
});
test('denied, unavailable, timeout, insecure, unsupported and invalid/old/inaccurate fixes are explained',()=>{
 for(const code of [1,2,3,99]){const e=env();e.api.locate();e.gps[0].bad({code});assert.match(e.messages.at(-1),/권한|확인|초과|오류/);assert.equal(e.by('circleMarker').length,0);}
 for(const option of [{secure:false},{supported:false}]){const e=env(option);e.api.locate();assert.equal(e.gps.length,0);assert.match(e.messages.at(-1),/HTTPS|지원/);}
 for(const bad of [{latitude:NaN},{longitude:181},{accuracy:-1},{accuracy:10001},{latitude:null},{accuracy:'20'}]){const e=env();e.api.locate();e.gps[0].ok(e.position(bad));assert.equal(e.by('circleMarker').length,0);}
 const e=env();e.api.locate();e.gps[0].ok({...e.position(),timestamp:Date.now()-61000});assert.equal(e.by('circleMarker').length,0);
 const f=env();f.api.locate();f.gps[0].ok(f.position({accuracy:500}));assert.match(f.messages.at(-1),/오차가 큽니다/);
});
test('watched fixes reuse only a live verified target and add no public API polling',async()=>{
 const e=env();let count=0;await e.api.guide(()=>{count++;return e.target();},e.popup);e.gps[0].ok(e.position());await tick();e.api.setTracking(true);
 for(let i=0;i<10;i++)e.watched[0].ok(e.position({latitude:37+i/1000}));await tick();assert.equal(count,2);
 e.revoke();e.watched[0].ok(e.position());await tick();assert.equal(e.by('polyline').length,0);assert.equal(e.api.state().tracking,false);
});
test('initial proofs are serialized; obsolete responses after clear cannot resurrect layers',async()=>{
 const e=env();let release,count=0;
 await e.api.guide(()=>++count<2?e.target():new Promise(r=>release=r),e.popup);e.gps[0].ok(e.position());e.gps[0].ok(e.position({latitude:38}));await tick();assert.equal(count,2);
 e.api.clear();release(e.target());await tick();assert.equal(e.by('polyline').length,0);assert.equal(e.by('circleMarker').length,0);
});
