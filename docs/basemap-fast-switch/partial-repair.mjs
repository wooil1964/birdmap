// Partial-repair regression: actual product code and Leaflet 1.9.3. Long recovery/window waits use a virtual clock.
// Fast switching and tile faults in real Chrome against a LOCAL index.html. The Worker config is injected and every
// tile request is answered by CDP (no network, no credential): normal, sporadic errors, a rate-limit storm (429), an
// outage (502), slow tiles, a hang; also zooming out to 4, views at the border and a wheel burst. Reports, per scenario,
// the controller outcome and how many tiles were requested.
//   CHROME_PATH=... node docs/basemap-fast-switch/partial-repair.mjs [repo=.] [result=.ci-results/basemap-faults/partial-repair.json]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const [repo = '.', supplied = '.ci-results/basemap-faults/partial-repair.json'] = process.argv.slice(2);
const resultPath = process.argv[1].endsWith('partial-repair.mjs') ? supplied : join(dirname(supplied),'partial-repair.json');
mkdirSync(dirname(resolve(resultPath)),{recursive:true});
const scratch=mkdtempSync(join(dirname(resolve(resultPath)),'repair-page-'));
async function dependency(name,hash){
  const local=process.env.BIRDMAP_LEAFLET_DIR;
  const bytes=local?readFileSync(join(local,name)):Buffer.from(await (await fetch('https://cdn.jsdelivr.net/npm/leaflet@1.9.3/dist/'+name)).arrayBuffer());
  if(createHash('sha256').update(bytes).digest('base64')!==hash)throw Error('Leaflet integrity '+name);
  writeFileSync(join(scratch,name),bytes);
}
await dependency('leaflet.js','WBkoXOwTeyKclOHuWtc+i2uENFpDZ9YPdf5Hf+D7ewM=');
await dependency('leaflet.css','kLaT2GOSpHechhsozzB+flnD+zUyjE2LlfWPgU04xyI=');
const controllerBytes=readFileSync(join(resolve(repo),'assets/birdmap-basemap.js'));
const sourceSha256=createHash('sha256').update(controllerBytes).digest('hex');
writeFileSync(join(scratch,'controller.js'),controllerBytes);
writeFileSync(join(scratch,'probe.html'),"<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"leaflet.css\"><style>html,body,#map{margin:0;height:100%;width:100%}</style><div id=\"map\"></div><script src=\"leaflet.js\"></script><script src=\"controller.js\"></script><script>var m=L.map('map').setView([36.3,127.6],11);var osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{zIndex:1});var birdmapBasemap=BirdmapBasemap.mount({map:m,osm,domesticBounds:[[32.9,124.5],[38.75,132]],config:BIRDMAP_MAP_CONFIG});var orig=L.TileLayer.prototype.createTile;L.TileLayer.prototype.createTile=function(c,done){var task=this._birdmapRepair;if(task){window.__repairLog.push({event:'start',t:Date.now(),key:task.key,canary:task.canary,attempt:task.record.n,active:birdmapBasemap.getState().partialRetryActive});}return orig.call(this,c,function(e,t){if(task)window.__repairLog.push({event:'end',t:Date.now(),key:task.key,ok:!e});done(e,t)});};window.ev=[];</script>");
const PAGE=pathToFileURL(join(scratch,'probe.html')).href;
const ENDPOINT = 'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles';
const CONFIG = `window.BIRDMAP_MAP_CONFIG = { vworldMode: 'worker', vworldTileEndpoint: '${ENDPOINT}' };`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function crc32(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 2;
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(256 * 769, 90))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64').toString('base64');

function pngTile(overlay=false){let raw=Buffer.alloc(256*1025);for(let y=0;y<256;y++){for(let x=0;x<256;x++){let i=y*1025+1+x*4;raw[i]=overlay?255:50;raw[i+1]=overlay?255:130;raw[i+2]=overlay?255:190;raw[i+3]=overlay?(x%64<2||y%64<2?200:0):255;}}let hdr=Buffer.from(ihdr);hdr[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64')}
const OSMPNG=pngTile(),OVERLAYPNG=pngTile(true);

const auditNetwork = {workerIntercepted:0, externalBlocked:0, staticServed:0};
class Browser {
  static async launch() {
    const profile = mkdtempSync(join(dirname(resolve(resultPath)), 'round3-chrome-'));
    const proc = spawn(process.env.CHROME_PATH, ['--headless=new','--remote-debugging-pipe','--no-sandbox','--disable-gpu','--disable-background-networking','--hide-scrollbars','--allow-file-access-from-files','--user-data-dir='+profile,'about:blank'], {stdio:['ignore','pipe','pipe','pipe','pipe'],windowsHide:true});
    let buffer=''; const listeners=[];
    proc.stderr.on('data',()=>{});
    const socket={addEventListener:(type,fn)=>{if(type==='message')listeners.push(fn)},send:data=>proc.stdio[3].write(data+'\0'),close:()=>{try{proc.stdio[3].write(JSON.stringify({id:90000000,method:'Browser.close'})+'\0')}catch{}}};
    proc.stdio[4].setEncoding('utf8');
    proc.stdio[4].on('data',chunk=>{buffer+=chunk;let pos;while((pos=buffer.indexOf('\0'))>=0){const data=buffer.slice(0,pos);buffer=buffer.slice(pos+1);if(data)for(const fn of listeners)fn({data});}});
    const browser=new Browser(proc,socket,profile);
    console.log(JSON.stringify({browser:await browser.send('Browser.getVersion'),chromePid:proc.pid,profile}));
    return browser;
  }
  constructor(proc, socket, profile) {
    Object.assign(this, { proc, socket, profile, seq: 0, pending: new Map(), listeners: [] });
    socket.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } else if (m.method) for (const l of this.listeners) l(m); });
  }
  send(method, params = {}, sessionId) { const id = ++this.seq; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
  async open({ width, height, mobile, answer, touch = false }) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    // Uncaught page exceptions fail the scenario; console errors are reported.
    const log = [], exceptions = [], consoleErrors = [];
    const listener = async m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exceptions.push(String(d.exception?.description || d.text).split('\n')[0].slice(0, 160)); return; }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0].slice(0, 160)); return; }
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params, i = log.length, t = Date.now();
      if(request.url.startsWith('https://tile.openstreetmap.org/')){auditNetwork.osmMocked=(auditNetwork.osmMocked||0)+1;await this.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Cache-Control',value:'no-store'}],body:OSMPNG},sessionId);return;}
      if (request.url.startsWith('file:')) { await this.send('Fetch.continueRequest',{requestId},sessionId);return;}
      if (!request.url.startsWith(ENDPOINT + '/')) {
        auditNetwork.externalBlocked++;
        await this.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});
        return;
      }
      auditNetwork.workerIntercepted++;
      log.push({ url: request.url, t });
      const a = answer(request.url, i, log); log[i].status=a.status;
      // no-store as the Worker sends it: without it Chrome reuses tile images already shown and undercounts requests.
      const reply = () => a.status === 200
        ? this.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: request.url.endsWith('.jpeg') ? 'image/jpeg' : 'image/png' }, { name: 'Cache-Control', value: 'no-store' }], body: request.url.endsWith('.jpeg') ? JPEG : request.url.includes('/hybrid/') ? OVERLAYPNG : PNG }, sessionId).catch(() => {})
        : this.send('Fetch.fulfillRequest', { requestId, responseCode: a.status, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from('x').toString('base64') }, sessionId).catch(() => {});
      if (a.hang) return;
      if (a.network) return this.send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }, sessionId).catch(() => {});
      if (a.delay) setTimeout(reply, a.delay); else reply();
    };
    this.listeners.push(listener);
    await this.send('Page.enable', {}, sessionId); await this.send('Runtime.enable', {}, sessionId);
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*' , requestStage: 'Request' }] }, sessionId);
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    if (touch) await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: CONFIG + "window.__repairLog=[];var off=0;window.performance.now=()=>Date.now()+off;window.Math.random=()=>0;var nt=setTimeout;window.setTimeout=(f,ms,...a)=>ms>15000?nt(()=>{off+=ms-ms/50;f(...a)},ms/50):nt(f,ms,...a);"+ "try{localStorage.setItem('birdmap.basemap.preference','satellite')}catch(e){}" }, sessionId);
    const evaluate = async expression => { const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression: /^m\./.test(expression)?expression+";void 0":expression, returnByValue: true, awaitPromise: true }, sessionId); if (exceptionDetails) throw Error(exceptionDetails.text); return result.value; };
    await this.send('Page.navigate', { url: PAGE }, sessionId);
    for (let i = 0; i < 100 && !(await evaluate("typeof birdmapBasemap!=='undefined'&&!!birdmapBasemap").catch(() => false)); i++) await sleep(200);
    return { sessionId, evaluate, log, exceptions, consoleErrors, close: async () => { this.listeners = this.listeners.filter(l => l !== listener); await this.send('Target.closeTarget', { targetId }); } };
  }
  dispose() { try { this.socket.close(); } catch {} const proc=this.proc;setTimeout(()=>{if(proc.exitCode===null)proc.kill()},1000); }
}

const b=await Browser.launch(),results=[],interruptionResults=[];
function writeResults(){writeFileSync(resultPath,JSON.stringify({schema:'product-r1plus/v2',sourceSha256,clock:'long waits accelerated by test clock only',unit:1200,auditNetwork,results,interruptionResults},null,2));}
// Observe native Leaflet's direct completion path; do not replace it with the img callback.
async function observeReady(p) {
  await p.evaluate(`(()=>{window.__nativeReady=[];const original=L.TileLayer.prototype._tileReady;L.TileLayer.prototype._tileReady=function(c,e,el){const k=this._tileCoordsToKey(c),stopped=e&&e.message==='tile repair stopped',empty=el&&el.src===L.Util.emptyImageUrl;const result=original.call(this,c,e,el);if(stopped)__nativeReady.push({key:k,empty,loaded:!!this._tiles[k]?.loaded});return result}})()`);
}
async function waitFor(p, expression, ms=8000) {
  for(let t=Date.now();Date.now()-t<ms;){if(await p.evaluate(expression))return;await sleep(50)}
  throw Error('interruption wait: '+expression);
}
async function visibilityBoundary(p, hidden) {
  return p.evaluate(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>${hidden}});const boundary={event:'visibility',hidden:${hidden},t:Date.now()};const index=__repairLog.push(boundary)-1;document.dispatchEvent(new Event('visibilitychange'));return{index,t:boundary.t}})()`);
}
function startsAfter(log, boundary, end=log.length) { return log.slice(boundary+1,end).filter(e=>e.event==='start'); }
async function interruptionDone(name,p,extra={}) {
  const native=await p.evaluate(`(()=>{const l=Object.values(m._layers).find(l=>l._url&&l._url.includes('/satellite/'));return{loading:l?l._loading:null,noTilesToLoad:l?l._noTilesToLoad():null,ready:__nativeReady||[],zoom:m.getZoom()}})()`);
  const r={name,...extra,...await probe(p),native,requests:structuredClone(p.log),exceptions:p.exceptions};
  interruptionResults.push(r);writeResults();console.log(JSON.stringify({interruption:name,requests:r.requests.length,starts:r.repairs.filter(e=>e.event==='start').length,gray:r.view?r.view.total-r.view.loaded:null,native}));await p.close();
}
async function runInterruptions() {
  let x,p;
  p=await open((u,i,n)=>{if(i===0)x=u;return{status:u===x&&n===0?502:200,hang:u===x&&n===1,delay:100}});await observeReady(p);await sleep(23000);await interruptionDone('A_timeout_then_recover',p);
  p=await open((u,i,n)=>{if(i===0)x=u;return{status:u===x&&n===0?502:200,delay:u===x&&n===1?3000:100}});await observeReady(p);await waitFor(p,"__repairLog.some(e=>e.event==='start')");await p.evaluate('m.panBy([2,0],{animate:false});void 0');await sleep(10000);await interruptionDone('B_pan2_then_recover',p);
  let y;p=await open((u,i,n)=>{if(i===0)x=u;if(i===1)y=u;return{status:u===y||u===x&&n===0?502:200,hang:u===x&&n===1,delay:100}});await observeReady(p);await sleep(45000);await interruptionDone('C_delayedX_persistentY',p);
  let base;
  p=await open((u,i,n)=>{if(i===0)x=u;if(!u.includes('/satellite/')&&!base)base=u;return{status:u===x&&(n===0||n===2)||u===base&&n===0?502:200,delay:u===x&&n===1?3000:100}});await observeReady(p);await waitFor(p,"__repairLog.some(e=>e.event==='start')");await p.evaluate("birdmapBasemap.setPreference('vworld');void 0");await waitFor(p,"birdmapBasemap.getState().active==='vworld'&&birdmapBasemap.getState().reason==='ready'");const baseState=await p.evaluate('birdmapBasemap.getState()');await p.evaluate("birdmapBasemap.setPreference('satellite');void 0");await sleep(6000);await interruptionDone('D_type_switch_resume',p,{baseState});
  let zoomTile;
  p=await open((u,i,n)=>{if(i===0)x=u;if(u.includes('/satellite/12/')&&!zoomTile)zoomTile=u;return{status:(u===x||u===zoomTile)&&n===0?502:200,delay:u===x&&n===1?3000:100}},390,844,true);await observeReady(p);await waitFor(p,"__repairLog.some(e=>e.event==='start')");await b.send('Input.synthesizePinchGesture',{x:195,y:420,scaleFactor:2,relativeSpeed:1200,gestureSourceType:'touch'},p.sessionId);await sleep(10000);await interruptionDone('E_mobile_pinch_resume',p);
  p=await open((u,i,n)=>{if(i===0)x=u;return{status:u===x&&n===0?502:200,delay:u===x&&n===1?3000:100}});await observeReady(p);await waitFor(p,"__repairLog.some(e=>e.event==='start')");const hidden=await visibilityBoundary(p,true);await sleep(4000);const shown=await visibilityBoundary(p,false);await sleep(6000);await interruptionDone('F_hidden_resume',p,{hiddenBoundary:hidden.index,shownBoundary:shown.index});
}
function checkInterruptions() {
  let checks=0;const assert=(name,ok)=>{checks++;if(!ok)throw Error(name)};
  for(const r of interruptionResults){
    const a=r.repairs.filter(e=>e.event==='start');
    assert(r.name+' no exception',r.exceptions.length===0);
    assert(r.name+' satellite retained',r.state.active==='satellite'&&!r.state.locked);
    assert(r.name+' no stuck Leaflet batch',!r.native.loading&&r.native.noTilesToLoad);
    assert(r.name+' can continue',a.length>=2);
    assert(r.name+' native completion precedes empty src',r.native.ready.every(e=>!e.empty&&e.loaded));
    assert(r.name+' concurrent bound',a.every(e=>e.active<=2));
    assert(r.name+' rolling bound',a.every(e=>a.filter(f=>f.t<=e.t&&e.t-f.t<1200).length<=8));
    assert(r.name+' canary bound',a.filter(e=>e.canary).every(e=>a.filter(f=>f.canary&&f.t<=e.t&&e.t-f.t<1200).length<=1));
    // Type/zoom changes keep a record's attempt ordinal; normal requests are not counted as repairs.
    assert(r.name+' per-key bound',a.every(e=>e.attempt<=4));
    if(r.name!=='C_delayedX_persistentY')assert(r.name+' holes healed',r.view.loaded===r.view.total);
  }
  for(const name of ['A_timeout_then_recover','B_pan2_then_recover','C_delayedX_persistentY','F_hidden_resume'])assert(name+' stopped tile settled',interruptionResults.find(r=>r.name===name).native.ready.length>0);
  const c=interruptionResults.find(r=>r.name==='C_delayedX_persistentY'),counts=Object.values(Object.groupBy(c.repairs.filter(e=>e.event==='start'),e=>e.key)).map(g=>g.length);
  assert('C delayed X heals while Y reaches cap',counts.includes(2)&&counts.includes(4)&&c.view.total-c.view.loaded===1);
  const d=interruptionResults.find(r=>r.name==='D_type_switch_resume');assert('D Base heals before satellite return',d.baseState.active==='vworld'&&d.baseState.reason==='ready');
  const e=interruptionResults.find(r=>r.name==='E_mobile_pinch_resume');assert('E real touch pinch changed zoom and resumed repairs',e.native.zoom===12&&e.repairs.some(r=>r.event==='start'&&r.key.endsWith(':12')));
  const f=interruptionResults.find(r=>r.name==='F_hidden_resume');assert('F no starts while hidden',startsAfter(f.repairs,f.hiddenBoundary,f.shownBoundary).length===0);assert('F resumed after visible',startsAfter(f.repairs,f.shownBoundary).length>0);
  const equalMs=[{event:'start',t:1},{event:'visibility',t:1},{event:'start',t:1}];assert('same ms: earlier start is excluded',startsAfter(equalMs.slice(0,2),1).length===0);assert('same ms: illegal later start is detected',startsAfter(equalMs,1).length===1);
  console.log(JSON.stringify({interruptionChecks:checks,passed:true}));
}

const probe=p=>p.evaluate(`(()=>{var l=Object.values(m._layers).find(l=>l._url&&l._url.includes('/satellite/'));return{state:birdmapBasemap.getState(),view:l?l._viewTiles():null,repairs:window.__repairLog,hidden:document.hidden}})()`);
async function done(name,p,extra={}){let r={name,...extra,...await probe(p),requests:structuredClone(p.log),exceptions:p.exceptions};results.push(r);writeResults();console.log(JSON.stringify({name,n:r.requests.length,repairs:r.repairs.filter(x=>x.event==='start').length,view:r.view,active:r.state.active,exceptions:r.exceptions}));await p.close();}
async function open(policy,width=1366,height=768,mobile=false){let seen=new Map();return await b.open({width,height,mobile,touch:mobile,answer:(u,i,log)=>{let n=seen.get(u)||0;seen.set(u,n+1);return policy(u,i,n,log)}})}
try{
for(let status of [429,502,503]){let p=await open((u,i,n)=>({status:i<4&&n===0?status:200,delay:100}));await sleep(4000);await done('transient_'+status,p);}
let p=await open((u,i,n)=>({status:/\/satellite\/11\/(1749|1750)\/80[12]/.test(u)?429:200,delay:60}));await sleep(26000);await done('persistent4_full_backoff',p);
p=await open((u,i,n)=>({status:/\/satellite\/11\/(1749|1750)\/80[12]/.test(u)&&n<2?502:200,delay:60}));await sleep(10000);await done('fails_twice_then_heals',p);
for(const status of [502,503]){p=await open((u,i,n)=>({status:/\/satellite\/11\/(1749|1750)\/80[12]/.test(u)?status:200,delay:60}));await sleep(26000);await done('persistent4_'+status,p);}
// Many partial errors, fanout and sustained window limit. 10/24 remains below existing broad-outage threshold.
let failURLs=new Set();p=await open((u,i,n)=>{if(i<10)failURLs.add(u);return{status:failURLs.has(u)&&n===0?503:200,delay:200}});await sleep(6500);await done('fanout_budget10',p);
p=await open((u,i,n)=>({status:i<4&&n===0?429:200,delay:100}));await sleep(350);let endMove;for(let i=0;i<10;i++){endMove=await p.evaluate(`(()=>{m.panBy([${i%2?-100:100},0],{animate:false});return Date.now()})()`);await sleep(180)}await sleep(3500);await done('fast_pan_quiet750',p,{endMove});
p=await open((u,i,n)=>({status:i<4&&n===0?502:200,delay:100}));await sleep(300);let h=await visibilityBoundary(p,true),hiddenAt=h.t;await sleep(3500);let v=await visibilityBoundary(p,false),shownAt=v.t;await sleep(3500);await done('hidden_then_visible',p,{hiddenAt,shownAt,hiddenBoundary:h.index,shownBoundary:v.index});
p=await open((u,i,n)=>({status:u.includes('/hybrid/')?200:i<2&&n===0?429:200,delay:100}));await p.evaluate("birdmapBasemap.setPreference('hybrid')");await sleep(4000);await done('hybrid_primary_partial',p);
p=await open((u,i,n)=>({status:i<2&&n===0?429:200,delay:100}),390,844,true);await sleep(4000);await done('mobile_touch_partial',p);
p=await open((u,i,n)=>i===0?{hang:true}:{status:200,delay:100});await sleep(13000);await done('normal_hang12',p);
let selected;p=await open((u,i,n)=>{if(i===0)selected=u;return u===selected?(n===0?{status:502,delay:100}:{hang:true}):{status:200,delay:100}});await sleep(14500);await done('repair_hang12_keeps_satellite',p);
p=await open(()=>({status:429,delay:100}));await sleep(1000);await done('broad_outage_osm',p);
p=await open((u,i,n)=>({status:i<2&&n===0?429:200,delay:100}));await sleep(350);await p.evaluate("birdmapBasemap.setPreference('osm')");await sleep(2500);await done('user_osm_cancels',p);
p=await open((u,i,n)=>({status:i<2&&n===0?429:200,delay:100}));await sleep(300);await p.evaluate('birdmapBasemap.destroy()');await sleep(2000);await done('destroy_cancels',p);

p=await open((u,i,n)=>({status:i<2&&n===0?502:200,delay:1000}));for(let i=0;i<80;i++){if(await p.evaluate("__repairLog.some(x=>x.event==='start')"))break;await sleep(100)}let hidden=await visibilityBoundary(p,true),hiddenStart=hidden.t;await sleep(2500);await done('hidden_inflight',p,{hiddenStart,hiddenBoundary:hidden.index});
let broad=false;p=await open((u,i,n)=>({status:broad&&i>=24?503:i<2&&n===0?502:200,delay:broad?100:1000}));for(let i=0;i<80;i++){if(await p.evaluate("__repairLog.some(x=>x.event==='start')"))break;await sleep(100)}broad=true;await p.evaluate('m.panBy([1200,0],{animate:false});void 0');await sleep(2000);await done('mixed_broad',p);
await runInterruptions();
}finally{b.dispose();}
// These are the same 98 invariants used for the design model, now enforced on product code.
let checked=0;function check(name,ok){checked++;if(!ok)throw Error(name)}
for(const r of results){const a=r.repairs.filter(x=>x.event==='start');
 check(r.name+' exceptions',r.exceptions.length===0);
 check(r.name+' concurrency',a.every(x=>x.active<=2));
 check(r.name+' rolling repair budget',a.every(x=>a.filter(y=>y.t<=x.t&&x.t-y.t<1200).length<=8));
 check(r.name+' rolling canary budget',a.filter(x=>x.canary).every(x=>a.filter(y=>y.canary&&y.t<=x.t&&x.t-y.t<1200).length<=1));
 check(r.name+' attempts per key',[...new Set(a.map(x=>x.key))].every(k=>a.filter(x=>x.key===k).length<=4));
 if(r.endMove)check('750 ms quiet',a[0].t-r.endMove>=750);
 if(r.hiddenAt)check('hidden starts',startsAfter(r.repairs,r.hiddenBoundary,r.shownBoundary).length===0);
}
for(const name of ['transient_429','transient_502','transient_503','fails_twice_then_heals','fanout_budget10','hybrid_primary_partial','mobile_touch_partial']){
 const r=results.find(x=>x.name===name);check(name+' no holes',r.view.total===r.view.loaded);check(name+' no fallback',r.state.active!=='osm'&&!r.state.locked);
}
const persistent=results.find(x=>x.name==='persistent4_full_backoff');for(const name of ['persistent4_502','persistent4_503']){const r=results.find(x=>x.name===name);check(name+' bounded and retained',r.repairs.filter(x=>x.event==='start').length===16&&r.view.total-r.view.loaded===4&&!r.state.locked&&r.state.active==='satellite');}
check('persistent bounded',persistent.repairs.filter(x=>x.event==='start').length===16&&persistent.view.total-persistent.view.loaded===4&&!persistent.state.locked&&persistent.state.active==='satellite');
check('repair timeout retains imagery',results.find(x=>x.name==='repair_hang12_keeps_satellite').state.active==='satellite');
check('normal timeout fallback',results.find(x=>x.name==='normal_hang12').state.reason==='tile_timeout');
for(const name of ['hidden_inflight','mixed_broad']){const r=results.find(x=>x.name===name);check(name+' exceptions',r.exceptions.length===0);check(name+' outcome',name==='hidden_inflight'?startsAfter(r.repairs,r.hiddenBoundary).length===0:r.state.active==='osm'&&r.state.locked);}
console.log(JSON.stringify({partialRepairChecks:checked,passed:true}));
checkInterruptions();
