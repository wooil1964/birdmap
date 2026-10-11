import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const html=fs.readFileSync(process.env.INDEX_PATH||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../index.html'),'utf8').replace(/\r\n/g,'\n');
function source(name){const s=html.indexOf('function '+name+'(');assert.ok(s>=0,name);let depth=0,q=null;for(let i=html.indexOf('{',s);i<html.length;i++){const c=html[i];if(q){if(c===q&&html[i-1]!=='\\')q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(s,i+1);}throw Error(name);}
test('가림 상태만 바뀌어도 열린 현장소식 팝업을 최신 보호 상태로 갱신한다',()=>{
 const visible={id:'synthetic',species:'합성 일반종',status:'visible',updatedAt:'2026-10-11T10:00:00Z',lat:35,lon:125,history:[]};
 const hidden={...visible,locationHidden:true};
 let popup={protected:false,route:true},updates=0;
 const marker={setLatLng(){return this;},setIcon(){return this;},getElement(){return null;},isPopupOpen(){return true;},getPopup(){return {setContent(node){popup=node;updates++;}};}};
 const L={divIcon(){return {};},layerGroup(){return {addTo(){return this;}};}};
 const api=new Function('L','marker',
  'var FIELD_OLD_MIN=60,fieldUpdates=[],fieldMarkers={},fieldLayer={},fieldGuide=null;'+
  'function fieldAgeMin(){return 0;}function fieldIsActive(){return true;}function fieldMap(){return {};}function fieldNavChoiceGuard(){}function renderFieldNews(){}'+
  'function fieldPopupNode(u){return {protected:u.locationHidden===true,route:!!fieldPublicPoint(u)};}'+
  ['fieldMarkerClass','fieldMarkerSignature','fieldPublicPoint','fieldFind','renderFieldMarkers'].map(source).join('\n')+
  ';return {set(u){fieldUpdates=[u];},prime(u){fieldMarkers[u.id]={marker:marker,signature:fieldMarkerSignature(u)};},render:renderFieldMarkers};')(L,marker);
 api.set(visible);api.prime(visible);api.set(hidden);api.render();
 assert.equal(updates,1,'보호 전환을 열린 팝업에 적용');
 assert.deepEqual(popup,{protected:true,route:false},'보호 상태·길안내 제한을 반영');
});
