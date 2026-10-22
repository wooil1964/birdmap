import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
if(!process.argv[2])throw Error('Pass the local Miniflare node_modules directory');
const {Miniflare,convertV4MiniflareOptions}=require(join(resolve(process.argv[2]),'miniflare'));
const script=readFileSync(new URL('../../vworld-tiles/src/worker.mjs',import.meta.url),'utf8');
const sentinel='SYNTHETIC_WORKER_CREDENTIAL_ONLY';
function png(){
 const crc=b=>{let v=0xffffffff;for(const x of b){v^=x;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return(v^0xffffffff)>>>0;};
 const chunk=(tag,b)=>{const t=Buffer.from(tag),s=Buffer.alloc(4),c=Buffer.alloc(4);s.writeUInt32BE(b.length);c.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([s,t,b,c]);};
 const h=Buffer.alloc(13);h.writeUInt32BE(256);h.writeUInt32BE(256,4);h[8]=8;h[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc(256*(1+256*4)))),chunk('IEND',Buffer.alloc(0))]);
}
const bytes=png(),checks={};
const upstream=`export default {fetch(request){const u=new URL(request.url);if(u.hostname!=='api.vworld.kr'||request.headers.has('Origin')||request.headers.has('Referer'))return new Response('unexpected',{status:403});if(!u.pathname.startsWith('/req/wmts/1.0.0/${sentinel}/Base/8/100/'))return new Response('unexpected',{status:403});if(u.pathname.endsWith('/219.png'))return new Response('<ExceptionReport/>',{headers:{'Content-Type':'text/xml'}});if(u.pathname.endsWith('/220.png'))return new Response(null,{status:302,headers:{Location:'https://should-never-be-followed.invalid/'}});if(u.pathname.endsWith('/221.png'))return new Response('bad PNG',{headers:{'Content-Type':'image/png'}});return new Response(Uint8Array.from(atob('${bytes.toString('base64')}'),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=3600'}});}};`;
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[
 {name:'relay',modules:true,script,compatibilityDate:'2026-10-22',bindings:{TILES_ENABLED:'true',VWORLD_API_KEY:sentinel},outboundService:'synthetic-upstream',ratelimits:{CLIENT_TILE_LIMITER:{namespace_id:'998040',simple:{limit:100,period:60}},GLOBAL_TILE_LIMITER:{namespace_id:'998041',simple:{limit:100,period:60}}}},
 {name:'synthetic-upstream',modules:true,script:upstream,compatibilityDate:'2026-10-22'}
]}));
const headers={Referer:'https://wooil1964.github.io/','CF-Connecting-IP':'203.0.113.7'};
try{
 const r=await mf.dispatchFetch('https://tiles.local/tiles/8/218/100.png',{headers});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);checks.nativeFetchAndNativeRateBindings=true;
 checks.noStore=r.headers.get('Cache-Control')==='no-store'&&r.headers.get('Cloudflare-CDN-Cache-Control')==='no-store';assert.ok(checks.noStore);
 for(const [x,name]of [[219,'xmlRejected'],[220,'redirectNotFollowed'],[221,'invalidPngRejected']]){const response=await mf.dispatchFetch('https://tiles.local/tiles/8/'+x+'/100.png',{headers});assert.equal(response.status,502);assert.equal(await response.text(),'tiles_unavailable');checks[name]=true;}
 const denied=await mf.dispatchFetch('https://tiles.local/tiles/8/218/100.png',{headers:{...headers,Referer:'https://example.com/'}});assert.equal(denied.status,403);checks.wrongSourceRejected=true;
}finally{await mf.dispose();}
const limited=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[
 {name:'relay',modules:true,script,compatibilityDate:'2026-10-22',bindings:{TILES_ENABLED:'true',VWORLD_API_KEY:sentinel},outboundService:'synthetic-upstream',ratelimits:{CLIENT_TILE_LIMITER:{namespace_id:'998042',simple:{limit:1,period:60}},GLOBAL_TILE_LIMITER:{namespace_id:'998043',simple:{limit:100,period:60}}}},
 {name:'synthetic-upstream',modules:true,script:upstream,compatibilityDate:'2026-10-22'}
]}));
try{const first=await limited.dispatchFetch('https://tiles.local/tiles/8/218/100.png',{headers});assert.equal(first.status,200);await first.arrayBuffer();const second=await limited.dispatchFetch('https://tiles.local/tiles/8/218/100.png',{headers});assert.equal(second.status,429);checks.nativeLimiterActuallyDenies=true;}finally{await limited.dispose();}
const trialToken='SYNTHETIC_TRIAL_TOKEN_ONLY_'.padEnd(43,'x');
async function trialEngine(enabled,expired=false){
 const now=Date.now(),start=now-(expired?120000:1000),end=now+(expired?-60000:60000);
 return new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[
  {name:'trial',modules:['trial-worker.mjs','worker.mjs'].map(file=>({type:'ESModule',path:fileURLToPath(new URL('../../vworld-tiles/src/'+file,import.meta.url))})),compatibilityDate:'2026-10-22',bindings:{TILES_ENABLED:enabled,TRIAL_ACCESS_TOKEN:trialToken,TRIAL_STARTS_AT:new Date(start).toISOString(),TRIAL_EXPIRES_AT:new Date(end).toISOString(),VWORLD_API_KEY:sentinel},outboundService:'synthetic-upstream',ratelimits:{CLIENT_TILE_LIMITER:{namespace_id:'998044',simple:{limit:100,period:60}},GLOBAL_TILE_LIMITER:{namespace_id:'998045',simple:{limit:100,period:60}}}},
  {name:'synthetic-upstream',modules:true,script:upstream,compatibilityDate:'2026-10-22'}
 ]}));
}
const trial=await trialEngine('true');
try{
 const missing=await trial.dispatchFetch('https://tiles.local/tiles/8/218/100.png',{headers});assert.equal(missing.status,403);checks.trialTokenRequired=true;
 const allowed=await trial.dispatchFetch('https://tiles.local/tiles/8/218/100.png',{headers:{...headers,'X-Birdmap-Trial-Token':trialToken}});assert.equal(allowed.status,200);assert.deepEqual(Buffer.from(await allowed.arrayBuffer()),bytes);checks.trialAuthorizedPng=true;
}finally{await trial.dispose();}
for(const [enabled,expired,name]of [['true',true,'trialExpiryCloses'],['false',false,'trialDisabledCloses']]){
 const closed=await trialEngine(enabled,expired);
 try{const r=await closed.dispatchFetch('https://tiles.local/tiles/8/218/100.png',{headers:{...headers,'X-Birdmap-Trial-Token':trialToken}});assert.equal(r.status,503);checks[name]=true;}finally{await closed.dispose();}
}
const result={status:'passed',engine:'local workerd via Wrangler 4.151.3 / Miniflare',checks,realVworldRequests:0,cloudflareDeployments:0,scope:'Exact relay and trial modules, native rate-limit bindings, synthetic in-process upstream. No production authentication or Cloudflare egress proof.'};
const out=resolve(process.env.VWORLD_NATIVE_OUTPUT||'.ci-results/vworld-native-worker');mkdirSync(out,{recursive:true});writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
