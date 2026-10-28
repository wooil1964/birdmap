import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {reportSearchPayload} from '../../reports-api/src/report-search.js';
const source=readFileSync(new URL('../../assets/birdmap-species-search.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const pick=name=>{const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);let depth=0;for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'&&--depth===0)return html.slice(start,i+1);}throw Error(name);};
const real=['escapeHtml','siteHistoryEntryHtml','publicationSame','publicationAllowed','publicationDataAllowed','publicationRenew','publicationRouteCheck','reportArchivePayload','spotKakaoRouteUrl','tmapNavigationUrl','openTmapNavigation'].map(pick).join('\n');
class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.hidden=false;this.value='';this.parentNode=null;this._text='';this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),contains:x=>this.classes.has(x)};this.style={setProperty(){},removeProperty(){}};}
  appendChild(n){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);this.children.push(n);n.parentNode=this;return n;}
  contains(n){return n===this||this.children.some(x=>x.contains(n));}
  set textContent(x){this._text=String(x);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
  querySelector(s){return s==='.leaflet-popup-close-button'?this.closeButton:null;}
  getBoundingClientRect(){return{x:0,y:0,top:0,left:0,bottom:1000,right:1440,width:1440,height:1000};}
  getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()];}
}
const anchor=revision=>({contract:'publication-v1',epoch:'11111111111141118111111111111111',revision,projection:'legacy-public-v1'});
const row=(id,extra={})=>({id,date:'2026-10-26',species:['직박구리'],reporter:'새 공개 이름',locationHidden:false,target:{kind:'spot',spotId:'root'},...extra});
const page=(reports,{offset=0,total=reports.length,publication=anchor('1')}={})=>({ok:true,offset,limit:20,total,hasMore:offset+reports.length<total,reports,publication});
function environment(){
  const listeners=[],calls=[],events=new Map(),layers=new Set(),pane=new Element(),container=new Element(),body=new Element(),originalPopup={original:true};
  const marker={getLatLng:()=>({lat:37,lng:127}),getElement:()=>marker.element,element:new Element('path'),getPopup:()=>originalPopup,bringToFront(){calls.push(['highlight']);},addTo(m){layers.add(this);return this;}};
  layers.add(marker);
  const m={_popup:null,on(names,fn){for(const n of names.split(' ')){if(!events.has(n))events.set(n,[]);events.get(n).push(fn);}},fire(name,detail){for(const fn of events.get(name)||[])fn(detail);},hasLayer:x=>layers.has(x),getPane:()=>pane,getContainer:()=>container,stop(){},setView(p,z){calls.push(['move',p.lat,p.lng,z]);},closePopup(p=this._popup){if(!p)return;layers.delete(p);/* Leaflet retains the closed popup pointer until replaced. */this.fire('popupclose',{popup:p});}};
  const input=new Element('input');input.id='reportArchiveSearch';input.value='KEEP';body.appendChild(input);
  const find=(node,id)=>node.id===id?node:node.children.map(x=>find(x,id)).find(Boolean);
  const document={readyState:'complete',hidden:false,body,createElement:t=>new Element(t),createTextNode:s=>{const n=new Element('#text');n.textContent=s;return n;},getElementById:id=>find(body,id)||null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn,capture)=>listeners.push({name,fn,capture})};
  const state={generation:0,anchor:anchor('1'),ready:true,until:Date.now()+5000,checkedMono:performance.now()};
  const e={calls,marker,m,layers,body,input,listeners,fetch:()=>Promise.resolve(page([row('r1'),row('r2')])),gate:null,opened:[],alerts:[]};
  const w={document,map_7010a44f6ac2025090f0fe07508ed485:m,publicationState:state,PUBLICATION_MAX_AGE:5000,REPORT_ARCHIVE_PAGE:20,
    performance,Promise,WeakMap,Number,queueMicrotask,setTimeout:()=>1,clearTimeout(){},publicationExpiryTimer:0,addEventListener(){},matchMedia:()=>({matches:false}),
    navigator:{userAgent:'PC Chrome'},location:{href:''},alert:message=>e.alerts.push(message),open:()=>{const tab={location:{href:''},opener:w};e.opened.push(tab);return tab;},
    publicationNotice(){},publicationRefresh(){calls.push(['refresh']);},publicationInvalidate(){state.generation++;state.ready=false;state.until=0;calls.push(['invalidate']);},
    reporterStatsHistoryHtml:r=>r.reporter||'익명 제보',reporterStatsElement:name=>{const n=new Element('button');n.textContent=name||'익명 제보';return n;},
    reportPublicSpots:{root:{id:'root',lat:37,lon:127,locationHidden:false,history:[{id:'r1'},{id:'r2'}]}},reportSpotLayers:{root:marker},
    siteSpotData:[],siteSpotLayers:[],reportFixedHistory:{},reporterStatsWitnesses:new WeakMap(),reportSearchIndex:[],applyMobilePopupAutoPan(){calls.push(['legacyPan']);},
    RECENT_REPORT_DAYS:60,RECENT_REPORT_LIMIT:15,kstDateTextBefore:()=> '2026-08-01',
    publicationFetch:path=>{calls.push(['fetch',path]);return e.fetch(path);},
    publicationHead:async()=>{if(e.gate)await e.gate();return{publication:state.anchor,_publicationGeneration:state.generation,_publicationStartedMono:performance.now()};},
    L:{popup(options,source){const node=new Element();node.closeButton=new Element('a');return{options,_source:source,point:null,content:null,
      setLatLng(p){this.point=p;this._latlng=p;return this;},setContent(n){this.content=n;node.textContent='';if(typeof n==='string')node.textContent=n;else node.appendChild(n);return this;},getContent(){return this.content;},getElement:()=>node,
      update(){calls.push(['update']);},openOn(map){map._popup=this;layers.add(this);pane.appendChild(node);calls.push(['popup',this]);map.fire('popupopen',{popup:this});return this;}}}}
  };w.window=w;vm.createContext(w);vm.runInContext(real,w);
  for(const id of ['r1','r2']){const entry={kind:'spot',spotId:'root',date:'2026-10-26',species:['직박구리'],reporter:'낡은 이름',lat:1,lon:2};w.reportSearchIndex.push(entry);w.reporterStatsWitnesses.set(entry,id);}
  vm.runInContext(source,w);e.w=w;e.originalPopup=originalPopup;
  e.click=(id,species='직박구리')=>{const node={getAttribute:k=>k==='data-report-id'?id:k==='data-species'?species:null};const ev={target:{closest:s=>s==='.speciesSearchLink'?node:null},preventDefault(){},stopImmediatePropagation(){}};for(const l of listeners)if(l.name==='click')l.fn(ev);};
  e.buttons=()=>e.m._popup.content.children.find(n=>n.className==='birdmap-report-location-routes').children;
  e.route=async(app,button=e.buttons()[app==='kakao'?0:1])=>{let stopped=false,prevented=false;const ev={target:{closest:s=>s==='[data-birdmap-report-route]'?button:null},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};for(const l of listeners)if(l.name==='click')l.fn(ev);await new Promise(r=>setImmediate(r));return{stopped,prevented};};
  e.moves=()=>calls.filter(x=>x[0]==='move');return e;
}

test('history species links carry exact report ID and escape names, without touching date/reporter or archive input',()=>{
  const e=environment(),entry={id:'r1',date:'2026-10-26',species:['흰뺨검둥오리','<b>&"x'],reporter:'기여자'};
  const out=e.w.siteHistoryEntryHtml(entry);
  assert.match(out,/data-report-id="r1"/);assert.match(out,/2026\.10\.26/);assert.match(out,/제보자: 기여자/);
  assert.match(out,/&lt;b&gt;&amp;&quot;x/);assert.match(out,/제보 공개 위치로 이동/);
  assert.ok(!/<b>/.test(out));assert.ok(!/speciesSearchLink/.test(e.w.siteHistoryEntryHtml({...entry,id:'bad"id'})));
  assert.ok(!/speciesSearchLink/.test(e.w.siteHistoryEntryHtml({...entry,id:undefined})));
  assert.equal(e.input.value,'KEEP');
});
test('same species, date and marker use exact ID and fresh proof metadata, never captured coordinates',async()=>{
  const e=environment();e.fetch=()=>Promise.resolve(page([row('r2',{species:['새 종명'],reporter:'현재 공개 이름',lat:89,lon:179})]));
  assert.equal(await e.w.openPublicReportLocation('r2','직박구리'),true);
  assert.deepEqual(e.moves(),[['move',37,127,13]]);
  assert.match(e.m._popup.content.textContent,/새 종명.*2026-10-26.*현재 공개 이름/);
  assert.ok(!e.m._popup.content.textContent.includes('낡은 이름'));
  assert.equal(e.marker.getPopup(),e.originalPopup);assert.equal(e.input.value,'KEEP');
});
test('protected, breeding, hidden attached or fixed report proof never routes, even under a public parent marker',async()=>{
  for(const kind of ['spot','fixed'])for(const protection of ['protected','breeding','hidden']){
    const e=environment();e.fetch=()=>Promise.resolve(page([row('r1',{locationHidden:true,target:undefined,protection})]));
    if(kind==='fixed'){e.w.siteSpotData=[{id:'fixed:1:0',lat:37,lon:127}];e.w.siteSpotLayers=[e.marker];e.w.reportFixedHistory={'fixed:1:0':[{id:'r1'}]};e.w.reportSearchIndex[0].kind='fixed';e.w.reportSearchIndex[0].spotId='fixed:1:0';}
    assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),false,kind+' '+protection);assert.equal(e.moves().length,0);assert.equal(e.m._popup,null);
  }
});
test('approved projection may omit a false root flag; exact search proof must still explicitly allow location',async()=>{
  const e=environment();delete e.w.reportPublicSpots.root.locationHidden;
  assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),true);
  const denied=environment();delete denied.w.reportPublicSpots.root.locationHidden;
  denied.fetch=()=>Promise.resolve(page([row('r1',{locationHidden:true,target:undefined})]));
  assert.equal(await denied.w.openPublicReportLocation('r1','직박구리'),false);assert.equal(denied.moves().length,0);
});
test('real public projection blocks protected species and breeding or hidden attached/fixed rows before frontend routing',async()=>{
  const root={id:'root',species:'직박구리',note:'',observed_on:'2026-10-26',reporter:'공개 이름',name_public:1,lat:37,lon:127,public_lat:37,public_lon:127,spot_key:null};
  for(const spot_key of ['root','fixed:1:0'])for(const restricted of [{species:'저어새'},{note:'둥지 관찰'},{note:'번식 기록'},{public_lat:37.5,public_lon:127.5}]){
    const e=environment(),hidden={...root,id:'r1',spot_key,...restricted};
    const result=reportSearchPayload([root,hidden],[],{q:'',offset:0});
    const proofRow=result.reports.find(x=>x.id==='r1');assert.equal(proofRow.locationHidden,true);assert.equal(proofRow.target,undefined);
    e.fetch=()=>Promise.resolve({...result,publication:anchor('1')});
    assert.equal(await e.w.openPublicReportLocation('r1',''),false);assert.equal(e.moves().length,0);assert.equal(e.m._popup,null);
  }
});
test('missing ID, hidden parent, missing/duplicate witness, wrong marker membership, invalid coordinates fail closed',async()=>{
  const changes=[
    e=>{e.w.reportPublicSpots.root.locationHidden=true;},e=>{delete e.w.reportSpotLayers.root;},
    e=>{e.w.reportPublicSpots.root.history=[];},e=>{e.w.reportSearchIndex=[];},
    e=>{const copy={...e.w.reportSearchIndex[0]};e.w.reportSearchIndex.push(copy);e.w.reporterStatsWitnesses.set(copy,'r1');},
    e=>{e.marker.getLatLng=()=>({lat:null,lng:127});},e=>{e.marker.getLatLng=()=>({lat:Infinity,lng:127});},
    e=>{e.marker.getLatLng=()=>({lat:38,lng:127});},e=>{e.layers.delete(e.marker);}
  ];
  for(const change of changes){const e=environment();change(e);assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),false);assert.equal(e.moves().length,0);}
  const e=environment();assert.equal(await e.w.openPublicReportLocation('rX','직박구리'),false);assert.equal(await e.w.openPublicReportLocation('bad/id','직박구리'),false);assert.equal(e.moves().length,0);
});
test('page two exact-ID lookup keeps publication and validates total/schema; no first-species fallback',async()=>{
  const e=environment(),first=Array.from({length:20},(_,i)=>row('other'+i));
  e.fetch=url=>Promise.resolve(url.includes('offset=20')?page([row('r1')],{offset:20,total:21}):page(first,{total:21}));
  assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),true);assert.equal(e.calls.filter(x=>x[0]==='fetch').length,2);
  for(const bad of [page([row('r1')],{offset:20,total:22}),page([row('r1')],{offset:20,total:21,publication:anchor('2')}),{ok:true,reports:[row('r1')]}]){
    const x=environment();x.fetch=url=>Promise.resolve(url.includes('offset=20')?bad:page(first,{total:21}));
    assert.equal(await x.w.openPublicReportLocation('r1','직박구리'),false);assert.equal(x.moves().length,0);
  }
});
test('fresh gate rechecks publication generation, proof revision, and the current marker object',async()=>{
  for(const change of [
    e=>{e.w.publicationState.generation++;e.w.publicationState.anchor=anchor('2');},
    e=>{e.w.publicationState.anchor=anchor('2');},
    e=>{delete e.w.reportSpotLayers.root;},
    e=>{e.marker.getLatLng=()=>({lat:0,lng:0});}
  ]){const e=environment();e.gate=()=>change(e);assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),false);assert.equal(e.moves().length,0);}
});
test('a slower old click cannot override the newer exact report',async()=>{
  const e=environment();let release;e.fetch=url=>url.includes('q=A')?new Promise(r=>{release=r;}):Promise.resolve(page([row('r2',{species:['두 번째 제보']})]));
  const a=e.w.openPublicReportLocation('r1','A');const b=e.w.openPublicReportLocation('r2','B');assert.equal(await b,true);
  release(page([row('r1',{species:['첫 제보']})]));assert.equal(await a,false);assert.equal(e.moves().length,1);
  assert.match(e.m._popup.content.textContent,/두 번째 제보/);
});
test('closing a visible card cancels a pending location read and cannot reopen or move later',async()=>{
  const e=environment();assert.equal(await e.w.openPublicReportLocation('r2','B'),true);const popup=e.m._popup;
  let release;e.fetch=()=>new Promise(r=>{release=r;});const pending=e.w.openPublicReportLocation('r1','A');
  e.m.closePopup();assert.equal(e.m._popup,null);assert.equal(popup.getContent(),'');assert.equal(popup._source,null);assert.equal(popup._latlng,null);
  release(page([row('r1')]));assert.equal(await pending,false);assert.equal(e.moves().length,1);assert.equal(e.m._popup,null);
});
test('authorized fixed report reveals only its existing marker and scrubs retained popup on invalidation',async()=>{
  const e=environment();e.w.siteSpotData=[{id:'fixed:1:0',lat:37,lon:127}];e.w.siteSpotLayers=[e.marker];e.w.reportFixedHistory={'fixed:1:0':[{id:'r1'}]};
  e.w.reportSearchIndex[0].kind='fixed';e.w.reportSearchIndex[0].spotId='fixed:1:0';e.layers.delete(e.marker);
  e.fetch=()=>Promise.resolve(page([row('r1',{target:{kind:'fixed',spotId:'fixed:1:0'}})]));
  assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),true);assert.equal(e.layers.has(e.marker),true);
  const popup=e.m._popup;e.w.publicationInvalidate('changed');
  assert.equal(e.m._popup,null);assert.equal(popup.getContent(),'');assert.equal(popup._source,null);assert.equal(popup._latlng,null);assert.equal(e.marker.getPopup(),e.originalPopup);
});
test('when approved rendering replaces a marker before the gate only the current object is used',async()=>{
  const e=environment(),replacement={...e.marker,element:new Element('path')};replacement.getElement=()=>replacement.element;
  e.gate=()=>{e.layers.delete(e.marker);e.layers.add(replacement);e.w.reportSpotLayers.root=replacement;};
  assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),true);
  assert.equal(e.m._popup._source,replacement);assert.equal(e.marker.element.classList.contains('birdmap-report-location-selected'),false);assert.equal(replacement.element.classList.contains('birdmap-report-location-selected'),true);
});
test('invalidation and selected layer removal synchronously close the mini card and remove highlight',async()=>{
  for(const action of ['invalidate','remove']){
    const e=environment();assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),true);
    assert.ok(e.marker.element.classList.contains('birdmap-report-location-selected'));
    if(action==='invalidate')e.w.publicationInvalidate('test');else{e.layers.delete(e.marker);e.m.fire('layerremove',{layer:e.marker});}
    assert.equal(e.m._popup,null);assert.equal(e.marker.element.classList.contains('birdmap-report-location-selected'),false);
    assert.equal(e.marker.getPopup(),e.originalPopup);
  }
});
test('DOM history click uses public proof, never opens archive or changes search input',async()=>{
  const e=environment();let opened=0;e.w.openReportArchive=()=>opened++;e.w.searchReportArchive=()=>opened++;
  e.click('r1');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(e.moves().length,1);assert.equal(opened,0);assert.equal(e.input.value,'KEEP');
  assert.ok(e.listeners.some(x=>x.name==='click'&&x.capture===true));
});
test('hidden page, expired lease, malformed API and network failure never move',async()=>{
  for(const change of [
    e=>{e.w.document.hidden=true;},e=>{e.w.publicationState.until=0;},
    e=>{e.fetch=()=>Promise.resolve({ok:true,reports:[]});},e=>{e.fetch=()=>Promise.reject(new Error('offline'));}
  ]){const e=environment();change(e);assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),false);assert.equal(e.moves().length,0);}
});

test('mini card has three coordinate-free buttons; Kakao uses only the current public marker and consumes the click',async()=>{
  const e=environment();e.fetch=()=>Promise.resolve(page([row('r1',{lat:89,lon:179})]));
  assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),true);
  assert.deepEqual(e.buttons().map(n=>n.textContent),['카카오맵 찾아가기','티맵 찾아가기','내 위치 찾기']);
  for(const b of e.buttons())assert.equal(b.getAttribute('href'),null);
  const requests=e.calls.filter(x=>x[0]==='fetch').length;
  assert.deepEqual(await e.route('kakao'),{stopped:true,prevented:true});
  assert.equal(e.calls.filter(x=>x[0]==='fetch').length,requests+1);
  assert.equal(e.opened[0].location.href,'https://map.kakao.com/link/to/'+encodeURIComponent('출현 지점')+',37,127');
  assert.equal(e.opened[0].opener,null);assert.equal(e.moves().length,1);
});

test('distinct report IDs route to their own marker, never the earlier report destination',async()=>{
  const e=environment(),second={...e.marker,element:new Element('path'),getLatLng:()=>({lat:36.6,lng:126.4})};
  e.w.reportPublicSpots.other={id:'other',lat:36.6,lon:126.4,history:[{id:'r2'}]};e.w.reportSpotLayers.other=second;e.layers.add(second);
  e.w.reportSearchIndex[1].spotId='other';
  e.fetch=()=>Promise.resolve(page([row('r1'),row('r2',{target:{kind:'spot',spotId:'other'}})]));
  for(const [id,lat,lon] of [['r1',37,127],['r2',36.6,126.4]]){
    assert.equal(await e.w.openPublicReportLocation(id,'직박구리'),true);await e.route('kakao');
    assert.ok(e.opened.at(-1).location.href.endsWith(','+lat+','+lon));
  }
});

test('TMAP stays visible on desktop, explains mobile requirement without opening an app URL; mobile reuses exact public coordinates',async()=>{
  for(const ua of ['PC Chrome','Android Chrome','iPhone Safari']){
    const e=environment();e.w.navigator.userAgent=ua;assert.equal(await e.w.openPublicReportLocation('r2','직박구리'),true);await e.route('tmap');
    assert.equal(e.opened.length,0);
    if(ua==='PC Chrome'){assert.equal(e.w.location.href,'');assert.match(e.alerts[0],/스마트폰/);}
    else assert.equal(e.w.location.href,'tmap://route?goalname='+encodeURIComponent('출현 지점')+'&goalx=127&goaly=37');
  }
});

test('fixed report uses the public fixed marker, with an explicit observation-location disclaimer',async()=>{
  const e=environment();e.w.siteSpotData=[{id:'fixed:1:0',lat:37,lon:127}];e.w.siteSpotLayers=[e.marker];e.w.reportFixedHistory={'fixed:1:0':[{id:'r1'}]};
  e.w.reportSearchIndex[0].kind='fixed';e.w.reportSearchIndex[0].spotId='fixed:1:0';
  e.fetch=()=>Promise.resolve(page([row('r1',{lat:89,lon:179,target:{kind:'fixed',spotId:'fixed:1:0'}})]));
  assert.equal(await e.w.openPublicReportLocation('r1','직박구리'),true);assert.match(e.m._popup.content.textContent,/실제 관찰 지점이 아닙니다/);
  await e.route('kakao');assert.equal(e.opened[0].location.href,'https://map.kakao.com/link/to/'+encodeURIComponent('탐조지 공개 고정 위치')+',37,127');
});

test('revoked, protected, breeding, hidden, missing or wrong-target fresh proof blocks already-rendered buttons',async()=>{
  for(const changed of [[],[row('r2')],[row('r1',{locationHidden:true,target:undefined,protection:'protected'})],[row('r1',{locationHidden:true,target:undefined,protection:'breeding'})],[row('r1',{locationHidden:true,target:undefined})],[row('r1',{target:{kind:'spot',spotId:'other'}})]]){
    const e=environment();await e.w.openPublicReportLocation('r1','직박구리');e.fetch=()=>Promise.resolve(page(changed));await e.route('kakao');
    assert.equal(e.opened.length,0);assert.equal(e.w.location.href,'');
  }
});

test('fresh route gate blocks changed revision, marker removal/replacement and coordinate mismatch',async()=>{
  for(const change of [
    e=>e.w.publicationState.anchor=anchor('2'),e=>e.layers.delete(e.marker),e=>delete e.w.reportSpotLayers.root,
    e=>{const replacement={...e.marker};e.w.reportSpotLayers.root=replacement;e.layers.add(replacement);},
    e=>e.marker.getLatLng=()=>({lat:38,lng:127}),
    e=>{e.marker.getLatLng=()=>({lat:38,lng:127});e.w.reportPublicSpots.root.lat=38;}
  ]){const e=environment();await e.w.openPublicReportLocation('r1','직박구리');e.gate=()=>change(e);await e.route('kakao');assert.equal(e.opened.length,0);}
});

test('closing, switching cards, visibility invalidation and layer removal cancel pending external navigation',async()=>{
  for(const action of ['close','switch','invalidate','remove']){
    const e=environment();await e.w.openPublicReportLocation('r1','직박구리');let release;
    e.fetch=()=>new Promise(r=>{release=r;});await e.route('kakao');
    if(action==='close')e.m.closePopup();
    if(action==='switch'){e.fetch=()=>Promise.resolve(page([row('r2')]));await e.w.openPublicReportLocation('r2','직박구리');}
    if(action==='invalidate')e.w.publicationInvalidate('visibility');
    if(action==='remove'){e.layers.delete(e.marker);e.m.fire('layerremove',{layer:e.marker});}
    release(page([row('r1')]));await new Promise(r=>setImmediate(r));assert.equal(e.opened.length,0,action);
  }
});

test('detached old buttons, duplicate activation and failed networking cannot navigate twice or retain a route',async()=>{
  const e=environment();await e.w.openPublicReportLocation('r1','직박구리');const old=e.buttons()[0];e.m.closePopup();
  await e.w.openPublicReportLocation('r2','직박구리');await e.route('kakao',old);assert.equal(e.opened.length,0);
  let release;e.fetch=()=>new Promise(r=>{release=r;});await e.route('kakao');await e.route('tmap');
  release(page([row('r2')]));await new Promise(r=>setImmediate(r));assert.equal(e.opened.length,1);assert.equal(e.w.location.href,'');
  e.fetch=()=>Promise.reject(Error('offline'));await e.route('kakao');assert.equal(e.opened.length,1);
});

test('blocked Kakao popup produces an explicit message and no navigation',async()=>{
  const e=environment();e.w.open=()=>null;await e.w.openPublicReportLocation('r1','직박구리');await e.route('kakao');
  assert.match(e.alerts[0],/팝업이 차단/);assert.equal(e.opened.length,0);
});

test('a manually detached popup root cannot activate its retained buttons',async()=>{
  const e=environment();await e.w.openPublicReportLocation('r1','직박구리');e.m._popup.content.isConnected=false;await e.route('kakao');assert.equal(e.opened.length,0);
});

test('GPS target reuses exact-row proof and fresh public gate; protected and hidden rows never yield coordinates',async()=>{
  const e=environment();const target=await e.w.publicReportGuideTarget('r1','직박구리');
  assert.equal(target.point.lat,37);assert.equal(target.point.lng,127);assert.equal(target.valid(),true);
  e.w.publicationInvalidate('revoked');assert.equal(target.valid(),false);
  for(const extra of [{locationHidden:true,target:undefined},{target:undefined},{target:{kind:'spot',spotId:'wrong'}}]){
    const x=environment();x.fetch=()=>Promise.resolve(page([row('r1',extra)]));assert.equal(await x.w.publicReportGuideTarget('r1','직박구리'),null);
  }
});
test('GPS preflight rechecks marker identity and cancels proofs when a card closes or publication changes',async()=>{
  for(const action of ['close','invalidate','remove']){
    const e=environment();await e.w.openPublicReportLocation('r1','직박구리');let release;
    e.fetch=()=>new Promise(r=>release=r);const pending=e.w.publicReportGuideTarget('r1','직박구리');
    if(action==='close')e.m.closePopup();if(action==='invalidate')e.w.publicationInvalidate('revision');if(action==='remove')e.layers.delete(e.marker);
    release(page([row('r1')]));assert.equal(await pending,null,action);
  }
});
test('GPS button sends a resolver and its popup to the local controller, never an external URL',async()=>{
  const e=environment();await e.w.openPublicReportLocation('r1','직박구리');let target,popup;
  e.w.birdmapLocation={async guide(resolve,p){popup=p;target=await resolve();return true;}};
  await e.route('gps',e.buttons()[2]);assert.equal(target.point.lat,37);assert.equal(popup,e.m._popup);assert.equal(e.opened.length,0);assert.equal(e.w.location.href,'');
});
