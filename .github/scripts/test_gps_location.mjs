import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../assets/birdmap-location.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function popup(options={autoPan:true},initialClasses=[]){
 const classes=new Set(initialClasses),node={classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)}};
 return{options,node,classes,getElement(){return this.node;},update(){}};
}
function env({secure=true,supported=true,popupOptions={autoPan:true},popupClasses=[]}={}){
 const layers=new Set(),calls=[],messages=[],gps=[],watched=[],cleared=[];let hidden=false;
 const map={hasLayer:l=>layers.has(l),removeLayer:l=>layers.delete(l),distance:()=>1234.5};
 const L={};for(const kind of ['circle','circleMarker','polyline'])L[kind]=(p,options)=>({kind,p,options,addTo(){layers.add(this);return this;},setLatLng(p){this.p=p;return this;},setRadius(r){this.options.radius=r;return this;},bringToFront(){},bindTooltip(t){this.tooltip=t;return this;},openTooltip(){return this;}});
 L.tooltip=()=>({setContent(n){this.content=n;return this;}});
 const document={readyState:'loading',addEventListener(){},createElement:()=>({textContent:''})};
 const w={document};vm.runInNewContext(source,{window:w,Promise,Number,Date});
 const geo={getCurrentPosition(ok,bad,options){gps.push({ok,bad,options});},watchPosition(ok,bad,options){watched.push({ok,bad,options});return watched.length;},clearWatch:id=>cleared.push(id)};
 const api=w.BirdmapLocation.create({map,L,geolocation:supported?geo:null,isSecure:()=>secure,hidden:()=>hidden,notify:s=>messages.push(s),fit:(...a)=>calls.push(a)});
 const layer={};layers.add(layer);const sourcePopup=popup(popupOptions,popupClasses);layers.add(sourcePopup);let valid=true;
 const target=()=>({layer,point:{lat:36.3,lng:127.3},publicReport:true,label:'출현 지점',valid:()=>valid});
 const position=(extra={})=>({coords:{latitude:37.12345678,longitude:126.23456789,accuracy:25,...extra},timestamp:Date.now()});
 return{api,geo,layers,calls,messages,gps,watched,cleared,layer,popup:sourcePopup,target,position,hide:()=>hidden=true,revoke:()=>valid=false,by:kind=>[...layers].filter(l=>l.kind===kind),distanceText:w.BirdmapLocation.distanceText};
}
function popupState(p){return{descriptor:Object.getOwnPropertyDescriptor(p.options,'autoPan'),value:p.options.autoPan,gpsClass:p.classes.has('birdmap-gps-popup')};}
function restored(p,before,label='popup restored'){
 assert.deepEqual(Object.getOwnPropertyDescriptor(p.options,'autoPan'),before.descriptor,label+' own descriptor');
 assert.equal(p.options.autoPan,before.value,label+' effective value');
 assert.equal(p.classes.has('birdmap-gps-popup'),before.gpsClass,label+' GPS class');
}
async function startGuide(e,p=e.popup,resolve=e.target){
 await e.api.guide(resolve,p);e.gps.at(-1).ok(e.position());await tick();
 assert.equal(e.api.state().guiding,true);assert.equal(p.options.autoPan,false);assert.equal(p.classes.has('birdmap-gps-popup'),true);
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

test('GPS restores the exact own/inherited autoPan setting and existing popup classes',async t=>{
 const cases=[['true',{autoPan:true}],['false',{autoPan:false}],['own undefined',{autoPan:undefined}],['inherited true',Object.create({autoPan:true})],['inherited false',Object.create({autoPan:false})],['absent',{}],['non-enumerable',Object.defineProperty({},'autoPan',{value:true,writable:true,configurable:true,enumerable:false})]];
 for(const [name,popupOptions] of cases)for(const gpsClass of [false,true])await t.test(name+' / existing GPS class '+gpsClass,async()=>{
  const e=env({popupOptions,popupClasses:gpsClass?['birdmap-gps-popup','unrelated']:['unrelated']}),before=popupState(e.popup);
  await e.api.guide(e.target,e.popup);restored(e.popup,before,'before GPS fix');
  e.gps[0].ok(e.position());await tick();assert.equal(e.popup.options.autoPan,false);assert.equal(e.popup.classes.has('birdmap-gps-popup'),true);
  e.api.stopGuide();restored(e.popup,before);assert.equal(e.popup.classes.has('unrelated'),true);
  e.api.stopGuide();e.api.clear();restored(e.popup,before,'repeated cleanup');
 });
});

test('every guide termination restores popup state and stale GPS cannot acquire it again',async t=>{
 const ends={
  'guide end':e=>e.api.stopGuide(),
  'position clear':e=>e.api.clear(),
  'popup close':e=>e.api.popupClosed(e.popup),
  'destination removed':e=>e.api.layerRemoved(e.layer),
  'destination invalid':e=>{e.revoke();e.api.validate();},
  'source popup removed':e=>{e.layers.delete(e.popup);e.api.validate();},
  'publication invalidated':e=>e.api.invalidate(),
  'hidden-page clear':e=>{e.hide();e.api.clear('hidden');},
  'pagehide clear':e=>e.api.clear(''),
  'map destruction':e=>e.api.destroy()
 };
 for(const [name,end] of Object.entries(ends))await t.test(name,async()=>{
  const e=env(),before=popupState(e.popup);await startGuide(e);end(e);restored(e.popup,before,name);
  assert.equal(e.api.state().guiding,false);e.gps[0].ok(e.position());e.gps[0].bad({code:1});await tick();
  restored(e.popup,before,name+' after stale callbacks');assert.equal(e.by('polyline').length,0);
 });
});

test('GPS and watch failures restore a popup that has already been fitted',async t=>{
 for(const code of [1,2,3,99])await t.test('watch error '+code,async()=>{
  const e=env(),before=popupState(e.popup);await startGuide(e);e.api.setTracking(true);e.watched[0].bad({code});
  restored(e.popup,before);assert.equal(e.api.state().guiding,false);assert.equal(e.api.state().tracking,false);
 });
 for(const [name,bad] of [['invalid coordinates',{latitude:NaN}],['invalid accuracy',{accuracy:10001}],['stale timestamp',null]])await t.test(name,async()=>{
  const e=env(),before=popupState(e.popup);await startGuide(e);e.api.setTracking(true);
  e.watched[0].ok(bad?e.position(bad):{...e.position(),timestamp:Date.now()-61000});await tick();restored(e.popup,before);
 });
 await t.test('watch throws',async()=>{
  const e=env(),before=popupState(e.popup);await startGuide(e);e.geo.watchPosition=()=>{throw Error('synthetic watch failure');};e.api.setTracking(true);restored(e.popup,before);
 });
});

test('tracking off and unrelated popup events keep the current guide override',async()=>{
 const e=env(),before=popupState(e.popup);await startGuide(e);e.api.setTracking(true);e.api.setTracking(false);
 e.api.popupClosed(popup());e.api.layerRemoved({});assert.equal(e.api.state().guiding,true);assert.equal(e.popup.options.autoPan,false);assert.equal(e.popup.classes.has('birdmap-gps-popup'),true);
 e.watched[0].bad({code:1});e.watched[0].ok(e.position());await tick();assert.equal(e.popup.options.autoPan,false);
 e.api.stopGuide();restored(e.popup,before);
});

test('repeated same-popup guides and independent locate restore before reacquiring',async()=>{
 const e=env(),before=popupState(e.popup);await startGuide(e);
 await e.api.guide(e.target,e.popup);restored(e.popup,before,'between guides');e.gps.at(-1).ok(e.position());await tick();
 assert.equal(e.popup.options.autoPan,false);e.api.locate();restored(e.popup,before,'independent locate');
 e.gps.at(-1).ok(e.position());await tick();restored(e.popup,before);assert.equal(e.by('polyline').length,0);
});

test('a new popup owns its own snapshot and stale callbacks cannot restore the wrong popup',async()=>{
 const e=env(),first=popupState(e.popup),second=popup({autoPan:false}),secondBefore=popupState(second);e.layers.add(second);
 await startGuide(e);const old=e.gps[0];await e.api.guide(e.target,second);restored(e.popup,first);
 old.bad({code:1});old.ok(e.position());await tick();restored(e.popup,first);restored(second,secondBefore);
 e.gps.at(-1).ok(e.position());await tick();assert.equal(second.classes.has('birdmap-gps-popup'),true);
 e.api.popupClosed(e.popup);assert.equal(e.api.state().guiding,true);assert.equal(second.classes.has('birdmap-gps-popup'),true);
 e.api.stopGuide();restored(second,secondBefore);restored(e.popup,first);
});

test('cancelled delayed destination proofs never restore GPS popup presentation',async t=>{
 for(const phase of ['preflight','refit'])await t.test(phase,async()=>{
  const e=env(),before=popupState(e.popup);let release,delay=phase==='preflight';
  const resolve=()=>delay?new Promise(r=>release=r):e.target();
  let pending;
  if(delay){pending=e.api.guide(resolve,e.popup);await tick();}
  else{await startGuide(e,e.popup,resolve);delay=true;e.gps[0].ok(e.position());await tick();}
  e.api.clear();restored(e.popup,before);release(e.target());if(pending)await pending;await tick();restored(e.popup,before);assert.equal(e.by('polyline').length,0);
 });
});

test('a later failed destination proof restores the already fitted popup',async t=>{
 for(const failure of ['null','changed coordinates','throw'])await t.test(failure,async()=>{
  const e=env(),before=popupState(e.popup);let fail=false;
  const resolve=()=>{if(!fail)return e.target();if(failure==='throw')throw Error('synthetic proof failure');return failure==='null'?null:{...e.target(),point:{lat:38,lng:127}};};
  await startGuide(e,e.popup,resolve);fail=true;e.gps[0].ok(e.position());await tick();restored(e.popup,before);assert.equal(e.api.state().guiding,false);
 });
});

test('restoring GPS changes no live popup padding or unrelated options',async()=>{
 const e=env(),before=popupState(e.popup);e.popup.options.autoPanPaddingTopLeft={x:12,y:85};e.popup.options.keepInView=true;
 await startGuide(e);const resizedPadding={x:20,y:150};e.popup.options.autoPanPaddingTopLeft=resizedPadding;e.popup.options.maxWidth=320;
 e.api.stopGuide();restored(e.popup,before);assert.equal(e.popup.options.autoPanPaddingTopLeft,resizedPadding);assert.equal(e.popup.options.keepInView,true);assert.equal(e.popup.options.maxWidth,320);
});

test('mobile sheet and GPS overrides compose across resize and either close-listener order',async t=>{
 const flows=[
  ['mobile GPS ends before sheet close',['sheet','guide','stop','release']],
  ['mobile sheet closes before GPS',['sheet','guide','release','stop']],
  ['desktop GPS becomes mobile, then GPS ends',['guide','sheet','stop','release']],
  ['desktop GPS becomes mobile, then returns to desktop',['guide','sheet','release','stop']],
  ['desktop-mobile-desktop-mobile',['guide','sheet','release','sheet','stop','release']],
  ['mobile-desktop-mobile-desktop',['sheet','guide','release','sheet','release','stop']]
 ];
 for(const [name,steps] of flows)await t.test(name,async()=>{
  const e=env(),before=popupState(e.popup);let sheet=false,guiding=false,sheetAutoPan;
  for(const step of steps){
   if(step==='guide'){await startGuide(e);guiding=true;}
   if(step==='stop'){e.api.popupClosed(e.popup);guiding=false;}
   if(step==='sheet'){
    e.api.changePopupAutoPan(e.popup,()=>{sheetAutoPan=e.popup.options.autoPan;e.popup.options.autoPan=false;});sheet=true;e.popup.classes.add('birdmap-mobile-popup');
    assert.equal(sheetAutoPan,true,'sheet saves underlying normal autoPan');
   }
   if(step==='release'){
    e.api.changePopupAutoPan(e.popup,()=>{e.popup.options.autoPan=sheetAutoPan;});sheet=false;e.popup.classes.delete('birdmap-mobile-popup');
   }
   assert.equal(e.popup.options.autoPan,sheet||guiding?false:true,name+' after '+step);
   assert.equal(e.popup.classes.has('birdmap-gps-popup'),guiding,name+' GPS class after '+step);
  }
  restored(e.popup,before,name);assert.equal(e.popup.classes.has('birdmap-mobile-popup'),false);
 });
});

test('layout changes on another popup do not release the GPS popup',async()=>{
 const e=env(),other=popup({autoPan:true});await startGuide(e);
 e.api.changePopupAutoPan(other,()=>{assert.equal(other.options.autoPan,true);other.options.autoPan=false;});
 assert.equal(other.options.autoPan,false);assert.equal(e.popup.options.autoPan,false);assert.equal(e.popup.classes.has('birdmap-gps-popup'),true);e.api.stopGuide();
});

test('a guide ended inside a layout callback cannot reacquire popup options or class',async()=>{
 const e=env(),before=popupState(e.popup);await startGuide(e);
 e.api.changePopupAutoPan(e.popup,()=>{assert.equal(e.popup.options.autoPan,true);e.api.stopGuide();e.popup.options.autoPan=true;});
 restored(e.popup,before);assert.equal(e.api.state().guiding,false);
 e.gps[0].ok(e.position());await tick();restored(e.popup,before);
});
