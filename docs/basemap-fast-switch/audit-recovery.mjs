// A-1–A-4 audit regressions: actual Chrome/Leaflet, all tiles intercepted locally.
// A-3 uses real time and native Math.random; long A-4 waits use a coherent monotonic test clock.
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

const [repo = '.', supplied = '.ci-results/basemap-faults/audit-recovery.json'] = process.argv.slice(2);
const resultPath = supplied;
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
writeFileSync(join(scratch,'probe.html'),"<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"leaflet.css\"><style>html,body,#map{margin:0;height:100%;width:100%}</style><div id=\"map\"></div><script src=\"leaflet.js\"></script><script src=\"controller.js\"></script><script>var m=L.map('map').setView([36.3,127.6],11);var osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{zIndex:1});window.__osmEvents=[];osm.on('tileloadstart tileload tileerror',function(e){__osmEvents.push({event:e.type,key:osm._tileCoordsToKey(e.coords),t:Date.now(),clock:performance.now()})});var birdmapBasemap=BirdmapBasemap.mount({map:m,osm,domesticBounds:[[32.9,124.5],[38.75,132]],config:BIRDMAP_MAP_CONFIG});var orig=L.TileLayer.prototype.createTile;L.TileLayer.prototype.createTile=function(c,done){var task=this._birdmapRepair;if(task){window.__repairLog.push({event:'start',t:Date.now(),clock:performance.now(),key:task.key,canary:task.canary,attempt:task.record.n,active:birdmapBasemap.getState().partialRetryActive});}return orig.call(this,c,function(e,t){if(task)window.__repairLog.push({event:'end',t:Date.now(),clock:performance.now(),key:task.key,ok:!e});done(e,t)});};window.ev=[];</script>");
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
    const profile = mkdtempSync(join(dirname(resolve(resultPath)), 'audit-chrome-'));
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
  async open({ width = 1366, height = 768, mobile = false, answer, touch = false, clock = 'scaled', stored = 'satellite', jitter = true, osmAnswer = () => ({status:200}) }) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    // Uncaught page exceptions fail the scenario; console errors are reported.
    const log = [], osmLog = [], exceptions = [], consoleErrors = [];
    const listener = async m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exceptions.push(String(d.exception?.description || d.text).split('\n')[0].slice(0, 160)); return; }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0].slice(0, 160)); return; }
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params, i = log.length, t = Date.now();
      if(request.url.startsWith('https://tile.openstreetmap.org/')) {
        auditNetwork.osmMocked=(auditNetwork.osmMocked||0)+1;
        const a=osmAnswer(request.url,osmLog.length,osmLog);osmLog.push({url:request.url,t,status:a.status,network:a.network});
        if(a.hang)return;
        const reply=()=>a.network?this.send('Fetch.failRequest',{requestId,errorReason:'InternetDisconnected'},sessionId):this.send('Fetch.fulfillRequest',{requestId,responseCode:a.status,responseHeaders:[{name:'Content-Type',value:a.status===200?'image/png':'text/plain'},{name:'Cache-Control',value:'no-store'}],body:a.status===200?OSMPNG:Buffer.from('fault').toString('base64')},sessionId);
        if(a.delay)setTimeout(()=>reply().catch(()=>{}),a.delay);else await reply().catch(()=>{});return;
      }
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
    const clockScript=clock==='real'?'':`const nativeNow=performance.now.bind(performance),nativeTimeout=setTimeout;performance.now=()=>nativeNow()*50;window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms>=10000?ms/50:ms,...args);`;
    await this.send('Page.addScriptToEvaluateOnNewDocument',{source:CONFIG+`window.__repairLog=[];${clockScript}${jitter?'':'Math.random=()=>0;'}try{localStorage.setItem('birdmap.basemap.preference',${JSON.stringify(stored)})}catch(e){}`},sessionId);
    const evaluate = async expression => { const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression: /^m\./.test(expression)?expression+";void 0":expression, returnByValue: true, awaitPromise: true }, sessionId); if (exceptionDetails) throw Error(exceptionDetails.text); return result.value; };
    await this.send('Page.navigate', { url: PAGE }, sessionId);
    for (let i = 0; i < 100 && !(await evaluate("typeof birdmapBasemap!=='undefined'&&!!birdmapBasemap").catch(() => false)); i++) await sleep(200);
    return { sessionId, evaluate, log, osmLog, exceptions, consoleErrors, close: async () => { this.listeners = this.listeners.filter(l => l !== listener); await this.send('Target.closeTarget', { targetId }); } };
  }
  dispose() { try { this.socket.close(); } catch {} const proc=this.proc;setTimeout(()=>{if(proc.exitCode===null)proc.kill()},1000); }
}


const browser=await Browser.launch(),results=[];
const only=process.env.RECOVERY_CASES?.split(',');
const check=(ok,message)=>{if(!ok)throw Error(message)};
const viewScript=`(()=>{const l=Object.values(m._layers).find(l=>l._birdmapKind);let osmView={total:0,loaded:0};if(osm._map){const range=osm._pxBoundsToTileRange(osm._getTiledPixelBounds(m.getCenter()));for(const t of Object.values(osm._tiles)){if(t.coords.z!==osm._tileZoom||!range.contains(t.coords))continue;osmView.total++;if(t.loaded&&t.el.classList.contains('leaflet-tile-loaded'))osmView.loaded++;}}return{state:birdmapBasemap.getState(),view:l?l._viewTiles():null,osmView,repairs:__repairLog,osmEvents:__osmEvents,now:performance.now(),zoom:m.getZoom()}})()`;
async function snapshot(p){return p.evaluate(viewScript)}
async function waitFor(p,predicate,ms){const end=Date.now()+ms;let s;while(Date.now()<end){s=await snapshot(p);if(predicate(s))return s;await sleep(50)}throw Error('timed out: '+JSON.stringify(s));}
async function open(options={}) {
  const seen=new Map();const policy=options.answer||(()=>({status:200,delay:60}));
  return browser.open({...options,answer:(u,i)=>{const n=seen.get(u)||0;seen.set(u,n+1);return policy(u,i,n)}});
}
function limits(s) {
  const starts=s.repairs.filter(e=>e.event==='start');
  for(const a of starts){check(a.active<=2,'VWorld concurrency');check(starts.filter(b=>b.clock<=a.clock&&a.clock-b.clock<60000).length<=8,'VWorld rolling 60s budget');if(a.canary)check(starts.filter(b=>b.canary&&b.clock<=a.clock&&a.clock-b.clock<60000).length<=1,'VWorld canary budget');}
}
async function scenario(name,fn) {
  if(only&&!only.includes(name))return;
  let p;
  try {
    p=await fn.open();const detail=await fn.run(p),s=await snapshot(p);limits(s);check(p.exceptions.length===0,'page exception');
    results.push({name,ok:true,...detail,...s,requests:p.log,osmRequests:p.osmLog,exceptions:p.exceptions});console.log('PASS '+name+' '+JSON.stringify(detail));
  } catch(error) {
    results.push({name,ok:false,error:String(error),...(p?await snapshot(p).catch(()=>({})):{}),requests:p?.log,osmRequests:p?.osmLog,exceptions:p?.exceptions});console.log('FAIL '+name+' '+String(error));
  } finally {
    if(p)await p.close();writeFileSync(resultPath,JSON.stringify({schema:'vworld-audit-recovery/v1',sourceSha256,auditNetwork,results},null,2));
  }
}
try {
  for(const gap of [600,1000,1100]){
    const selected=new Map();
    await scenario('A1_zoom_'+gap,{
      open:()=>open({answer:(u,i,n)=>{const z=u.split('/').at(-3);if(!selected.has(z))selected.set(z,u);return{status:selected.get(z)===u&&n===0?502:200,delay:80}}}),
      run:async p=>{
        await waitFor(p,s=>s.state.reason==='partial_error',5000);
        for(const z of [12,13,12]){await p.evaluate(`(()=>{m.setZoom(${z});return 1})()`);await sleep(gap)}
        const s=await waitFor(p,s=>s.zoom===12&&s.view?.loaded===s.view?.total&&s.state.reason==='ready',10000);
        check(s.repairs.some(e=>e.event==='start'&&e.key.endsWith(':12')),'retained failed level repaired without further input');
        return{gap,clock:'50x monotonic; actual 250ms zoom animation and actual input gaps'};
      }
    });
  }
  for(const stored of ['osm','satellite']){
    let online=false;
    await scenario('A2_network_'+stored,{
      open:()=>open({clock:'real',stored,answer:()=>({status:502,delay:40}),osmAnswer:()=>online?{status:200,delay:70}:{network:true}}),
      run:async p=>{
        await p.evaluate(`(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));return 1})()`);
        await sleep(10000);const before=p.osmLog.length;online=true;
        await p.evaluate(`(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));return 1})()`);
        const returned=Date.now();const s=await waitFor(p,s=>s.osmView.total>0&&s.osmView.loaded===s.osmView.total,50000);
        const events=s.osmEvents.filter(e=>e.t>=returned);let active=0,max=0;
        for(const e of events){active+=e.event==='tileloadstart'?1:-1;max=Math.max(max,active)}
        check(max<=2,'OSM concurrency');const starts=events.filter(e=>e.event==='tileloadstart');
        for(const a of starts)check(starts.filter(b=>b.t<=a.t&&a.t-b.t<10000).length<=8,'OSM rolling budget');
        check(s.state.preference===stored&&s.state.active==='osm','OSM fallback/selection preserved');
        return{outageMs:10000,healedAfterOnlineMs:Date.now()-returned,initialRequests:before,retries:starts.length,maxConcurrent:max,clock:'real'};
      }
    });
  }
  const osmBad=new Set(),osmSeen=new Map();let osmFirst;
  await scenario('A2_timeout_hidden_resume',{
    open:()=>open({stored:'osm',osmAnswer:(u,i)=>{
      const n=osmSeen.get(u)||0;osmSeen.set(u,n+1);if(i<2){osmBad.add(u);if(i===0)osmFirst=u;}
      if(!osmBad.has(u))return{status:200,delay:50};
      return n===0?{status:502}:n===1||n===2&&u===osmFirst?{hang:true}:{status:200,delay:50};
    }}),
    run:async p=>{
      await waitFor(p,s=>s.osmEvents.filter(e=>e.event==='tileloadstart').length>=s.osmView.total+2,10000);
      const hide=await p.evaluate(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});const at=__osmEvents.push({event:'hidden'})-1;document.dispatchEvent(new Event('visibilitychange'));return at})()`);
      await sleep(600);
      const show=await p.evaluate(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});const at=__osmEvents.push({event:'shown'})-1;document.dispatchEvent(new Event('visibilitychange'));return at})()`);
      const s=await waitFor(p,s=>s.osmView.total>0&&s.osmView.loaded===s.osmView.total,10000);
      check(!s.osmEvents.slice(hide+1,show).some(e=>e.event==='tileloadstart'),'OSM starts while hidden');
      check(await p.evaluate(`!osm._loading&&osm._noTilesToLoad()`),'OSM cancellation or timeout left a stuck Leaflet batch');
      check(osmSeen.get(osmFirst)===4,'interrupted first retry, timed-out second retry, successful third retry');
      return{hiddenBoundary:hide,shownBoundary:show,attemptsIncludingInitial:osmSeen.get(osmFirst),clock:'50x monotonic; native Leaflet completion and cancellation'};
    }
  });
  const bad=new Set();
  await scenario('A3_real_jitter_12_tiles',{
    open:()=>open({clock:'real',width:1920,height:1080,answer:(u,i,n)=>{if(i<12)bad.add(u);return{status:bad.has(u)&&n===0?503:200,delay:80}}}),
    run:async p=>{
      const initial=await waitFor(p,s=>s.view?.total>=48&&s.view.total-s.view.loaded===12,5000);
      const originals=await p.evaluate(`(()=>{const l=Object.values(m._layers).find(l=>l._birdmapKind);window.__good=Object.entries(l._tiles).filter(([,t])=>t.el.classList.contains('leaflet-tile-loaded'));return __good.length})()`);
      const first=await waitFor(p,s=>s.repairs.some(e=>e.event==='start'),80000),firstAt=first.repairs.find(e=>e.event==='start').t;
      await sleep(2000);const round=await snapshot(p);
      check(round.repairs.filter(e=>e.event==='start').length===8,'native random jitter must not fragment the first successful canary round');
      const s=await waitFor(p,s=>s.view?.loaded===s.view?.total,75000);
      check(await p.evaluate(`(()=>{const l=Object.values(m._layers).find(l=>l._birdmapKind);return __good.every(([key,t])=>l._tiles[key]?.el===t.el)})()`),'successful tiles were redrawn');
      return{total:initial.view.total,failed:12,successfulTilesPreserved:originals,firstEightMs:round.repairs.filter(e=>e.event==='start').at(-1).t-firstAt,healedMs:s.repairs.at(-1).t-p.log[0].t,clock:'real time; native Math.random, no timer overrides'};
    }
  });
  let badKey;
  await scenario('A4_cap_then_slow_recovery',{
    open:()=>open({jitter:false,answer:(u,i,n)=>{if(i===0)badKey=u;return{status:u===badKey&&n<6?502:200,delay:60}}}),
    run:async p=>{
      const s=await waitFor(p,s=>s.repairs.filter(e=>e.event==='start').length>=6&&s.view?.loaded===s.view?.total,75000);
      const starts=s.repairs.filter(e=>e.event==='start');check(starts.length===6,'four fast attempts and two slow probes');
      for(let i=4;i<starts.length;i++)check(starts[i].clock-starts[i-1].clock>=900000,'slow probes must wait at least fifteen minutes');
      check(s.state.active==='satellite'&&!s.state.locked,'partial failure cannot trigger broad fallback');
      return{attempts:starts.length,attemptOrdinals:starts.map(e=>e.attempt),slowGapsMs:starts.slice(4).map((e,i)=>e.clock-starts[i+3].clock),clock:'50x coherent monotonic clock; no production constants changed'};
    }
  });
} finally { browser.dispose(); }
const failed=results.filter(r=>!r.ok).length;
console.log(JSON.stringify({passed:results.length-failed,failed}));if(failed)process.exitCode=1;
