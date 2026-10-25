import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { handleRequest } from '../../vworld-tiles/src/worker.mjs';

const SENTINEL = 'SYNTHETIC_WORKER_CREDENTIAL_ONLY';
const ORIGIN = 'https://wooil1964.github.io';
function png(width = 256) {
  const crc = b => { let v = 0xffffffff; for (const x of b) { v ^= x; for (let i=0;i<8;i++) v=(v>>>1)^((v&1)?0xedb88320:0); } return (v^0xffffffff)>>>0; };
  const chunk = (tag, b) => { const type=Buffer.from(tag),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(b.length);sum.writeUInt32BE(crc(Buffer.concat([type,b])));return Buffer.concat([size,type,b,sum]); };
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(256,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(256*(1+width*4)))),chunk('IEND',Buffer.alloc(0))]);
}
function fixture() {
  const calls = [], limits = [];
  const env = { TILES_ENABLED:'true',VWORLD_API_KEY:SENTINEL,
    CLIENT_TILE_LIMITER:{async limit(v){limits.push(['client',v.key]);return {success:true};}},
    GLOBAL_TILE_LIMITER:{async limit(v){limits.push(['location',v.key]);return {success:true};}} };
  const fetch = async (...args) => { calls.push(args); return new Response(png(), {headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400','Set-Cookie':SENTINEL,'X-Upstream':SENTINEL}}); };
  const request = (path='/tiles/8/218/100.png', headers={},method='GET') => new Request('https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev'+path,{method,headers:{Referer:ORIGIN+'/', 'CF-Connecting-IP':'203.0.113.7',...headers}});
  return {env,calls,limits,fetch,request,run: (req=request(),extra={})=>handleRequest(req,env,{fetch,...extra})};
}
async function rejectedWithoutUpstream(f, request, status) { const response=await f.run(request);assert.equal(response.status,status);assert.equal(f.calls.length,0);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.ok(!(await response.text()).includes(SENTINEL)); }

test('dedicated relay forwards exactly one fixed Base request without spoofed authorization headers or caches',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),png());
  assert.equal(f.calls.length,1);const [url,opt]=f.calls[0];assert.equal(url,'https://api.vworld.kr/req/wmts/1.0.0/'+SENTINEL+'/Base/8/100/218.png');
  assert.equal(opt.redirect,'manual');assert.equal(opt.cache,'no-store');assert.deepEqual(opt.headers,{Accept:'image/png'});assert.equal(opt.method,'GET');
  for(const name of ['Cache-Control','CDN-Cache-Control','Cloudflare-CDN-Cache-Control'])assert.equal(r.headers.get(name),'no-store');
  assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('X-Upstream'),null);assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  assert.equal(f.limits.length,2);assert.ok(!JSON.stringify([...r.headers]).includes(SENTINEL));
});
test('Origin is optional for an image, but present Origin/Referer must agree exactly',async()=>{
  for(const headers of [{Origin:'https://example.com'}, {Referer:'https://wooil1964.github.io.evil.invalid/'},{Referer:''},{Origin:ORIGIN,Referer:'https://example.com/'},{Origin:'null'}]){
    const f=fixture();await rejectedWithoutUpstream(f,f.request(undefined,headers),403);
  }
  const f=fixture();assert.equal((await f.run(f.request(undefined,{Origin:ORIGIN,Referer:''}))).status,200);
});
test('arbitrary URLs, query keys, traversal, noncanonical indices, zoom and overseas tiles never reach upstream',async()=>{
  for(const path of ['/','/tiles/5/27/12.png','/tiles/20/893000/409000.png','/tiles/06/54/25.png','/tiles/8/0218/100.png','/tiles/8/256/100.png','/tiles/8/-1/100.png','/tiles/8/218/100.jpg','/tiles/8/218/100.png?key='+SENTINEL,'/tiles/8/0/0.png','/tiles/8/218/100.png/extra','/proxy?url=https://example.com']){
    const f=fixture();await rejectedWithoutUpstream(f,f.request(path),404);
  }
});
test('non-GET, disabled service, missing secret and missing IP fail before upstream',async()=>{
  let f=fixture();await rejectedWithoutUpstream(f,f.request(undefined,{},'POST'),405);
  for(const key of ['TILES_ENABLED','VWORLD_API_KEY']){f=fixture();delete f.env[key];await rejectedWithoutUpstream(f,f.request(),503);}
  f=fixture();f.env.VWORLD_API_KEY='bad key';await rejectedWithoutUpstream(f,f.request(),503);
  f=fixture();await rejectedWithoutUpstream(f,f.request(undefined,{'CF-Connecting-IP':''}),403);
});
test('both native limiters and unavailable bindings fail closed without retries',async()=>{
  for(const name of ['CLIENT_TILE_LIMITER','GLOBAL_TILE_LIMITER']){
    let f=fixture();f.env[name]={async limit(){return {success:false};}};await rejectedWithoutUpstream(f,f.request(),429);
    f=fixture();delete f.env[name];await rejectedWithoutUpstream(f,f.request(),503);
    f=fixture();f.env[name]={async limit(){throw Error(SENTINEL);}};await rejectedWithoutUpstream(f,f.request(),503);
  }
});
test('redirects, XML, wrong dimensions and corrupt/truncated PNGs return finite errors without leaking bodies',async()=>{
  const corrupt=png();corrupt[45]^=1;
  const cases=[new Response(SENTINEL,{status:302,headers:{Location:'https://example.com/'+SENTINEL}}),new Response(SENTINEL,{status:403}),new Response(SENTINEL,{headers:{'Content-Type':'text/xml'}}),new Response(png(128),{headers:{'Content-Type':'image/png'}}),new Response(corrupt,{headers:{'Content-Type':'image/png'}}),new Response(png().subarray(0,-1),{headers:{'Content-Type':'image/png'}})];
  for(const upstream of cases){const f=fixture();let calls=0;const response=await f.run(undefined,{fetch:async()=>{calls++;return upstream;}});assert.equal(calls,1);assert.equal(response.status,502);assert.equal(await response.text(),'tiles_unavailable');assert.equal(response.headers.get('Location'),null);assert.equal(response.headers.get('Cache-Control'),'no-store');}
});
test('declared and streaming oversize are cancelled and never returned',async()=>{
  for(const declared of [true,false]){
    let cancelled=false;const f=fixture();const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));},cancel(){cancelled=true;}});
    const r=await f.run(undefined,{fetch:async()=>new Response(body,{headers:{'Content-Type':'image/png',...(declared?{'Content-Length':String(2*1024*1024+1)}:{})}})});
    assert.equal(r.status,502);assert.equal(cancelled,true);
  }
});
test('deadline covers missing headers and stalled body, aborting and cancelling without a retry',async()=>{
  let f=fixture(),calls=0;let r=await f.run(undefined,{timeoutMs:20,fetch:async()=>{calls++;return new Promise(()=>{});}});assert.equal(r.status,502);assert.equal(calls,1);
  let cancelled=false,signal;f=fixture();r=await f.run(undefined,{timeoutMs:20,fetch:async(_,opt)=>{signal=opt.signal;return new Response(new ReadableStream({start(c){c.enqueue(png().subarray(0,24));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'image/png'}});}});
  assert.equal(r.status,502);assert.equal(signal.aborted,true);assert.equal(cancelled,true);
});
test('thrown upstream errors are suppressed, with no automatic direct-browser key handoff',async()=>{
  const f=fixture();const r=await f.run(undefined,{fetch:async()=>{throw Error('https://api.vworld.kr/'+SENTINEL);}});assert.equal(r.status,502);assert.equal(await r.text(),'tiles_unavailable');assert.ok(!JSON.stringify([...r.headers]).includes(SENTINEL));
});
