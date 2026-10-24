import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {startServer} from '../../docs/vworld-candidate/server.mjs';

// Only newly created synthetic fixtures are used. No existing credential file,
// real tile service, external API or database is read or contacted.
const SENTINEL='SYNTHETIC_PRIVATE_FILE_MUST_NOT_BE_SERVED';
async function fixture(t){
 const temp=mkdtempSync(join(tmpdir(),'birdmap-preview-'));
 const root=join(temp,'checkout');
 mkdirSync(join(root,'assets'),{recursive:true});
 writeFileSync(join(root,'index.html'),'<title>Fixture map</title>');
 writeFileSync(join(root,'baseline-snapshot.txt'),'<title>Fixture baseline</title>');
 writeFileSync(join(root,'weather_today.json'),'{"fixture":true}');
 writeFileSync(join(root,'assets','birdmap-basemap.js'),'/* public fixture controller */');
 writeFileSync(join(root,'assets','map-runtime-config.js'),'window.BIRDMAP_MAP_CONFIG={vworldKey:""};');
 writeFileSync(join(root,'assets','map-runtime-config.local.js'),SENTINEL);
 writeFileSync(join(root,'assets','map-runtime-config.local.json'),SENTINEL);
 writeFileSync(join(root,'.env'),SENTINEL);
 writeFileSync(join(root,'unreviewed.txt'),SENTINEL);
 const server=await startServer(0,{root});
 t.after(async()=>{
  await new Promise((done,error)=>server.close(err=>err?error(err):done()));
  // Delete only this test's freshly created, fixed-prefix temporary directory.
  assert.equal(resolve(dirname(temp)),resolve(tmpdir()));
  assert.ok(basename(temp).startsWith('birdmap-preview-'));
  rmSync(temp,{recursive:true,force:true});
 });
 return {root,temp,server,port:server.address().port};
}
function get(port,path,{method='GET',host='127.0.0.1:'+port}={}){
 return new Promise((done,error)=>{
  // node:http preserves raw traversal paths; fetch/URL would normalize them.
  const req=request({hostname:'127.0.0.1',port,path,method,agent:false,headers:{Host:host}},res=>{
   let body='';res.setEncoding('utf8');res.on('data',part=>body+=part);
   res.on('end',()=>done({status:res.statusCode,headers:res.headers,body}));
  });
  req.on('error',error);req.end();
 });
}

test('isolated preview serves only known public runtime files with protective headers',async t=>{
 const {server,port}=await fixture(t);
 assert.equal(server.address().address,'127.0.0.1');
 for(const path of ['/','/index.html','/assets/birdmap-basemap.js','/assets/map-runtime-config.js','/weather_today.json?fixture=1','/baseline']){
  const res=await get(port,path);
  assert.equal(res.status,200,path);
  assert.equal(res.headers['cache-control'],'no-store');
  assert.equal(res.headers['x-content-type-options'],'nosniff');
  assert.equal(res.headers['content-security-policy'],"connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'");
  assert.equal(res.body.includes(SENTINEL),false,path);
 }
 assert.match((await get(port,'/')).body,/<title>격리 시안 · Fixture map/);
});

test('ignored local configuration and case variants cannot be served on Windows or Linux',async t=>{
 const {port}=await fixture(t);
 for(const path of [
  '/assets/map-runtime-config.local.js','/assets/map-runtime-config.local.json',
  '/ASSETS/MAP-RUNTIME-CONFIG.LOCAL.JS','/assets/Map-Runtime-Config.Local.Js',
  '/assets/map-runtime-config%2elocal.js','/assets/map-runtime-config.local.js?public=1',
  '/assets/map-runtime-config.local.js/','/.env','/%2eenv','/unreviewed.txt',
  '/docs/vworld-candidate/server.mjs','/baseline-snapshot.txt','/source-snapshot.txt'
 ]){
  const res=await get(port,path);assert.equal(res.status,404,path);
  assert.equal(res.body.includes(SENTINEL),false,path);
 }
});

test('raw and encoded nested traversal cannot resolve to even an allowed public file',async t=>{
 const {port}=await fixture(t);
 for(const path of [
  '/assets/../index.html','/assets/%2e%2e/index.html','/assets/nested/../../index.html',
  '/assets/nested/%2e%2e/%2e%2e/index.html','/assets/..%5cindex.html',
  '/assets%5cmap-runtime-config.local.js','/assets/%252e%252e/index.html',
  '/assets/%00/map-runtime-config.js','//assets/map-runtime-config.js','/assets/./birdmap-basemap.js'
 ]){
  const res=await get(port,path);assert.equal(res.status,404,path);
  assert.equal(res.body.includes(SENTINEL),false,path);
 }
 assert.equal((await get(port,'/%zz')).status,400);
});

test('non-GET methods and non-loopback Host headers are blocked',async t=>{
 const {port}=await fixture(t);
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){
  assert.equal((await get(port,'/index.html',{method})).status,405,method);
 }
 for(const host of ['example.test','127.0.0.1.evil.test','localhost.evil.test','localhost@evil.test']){
  assert.equal((await get(port,'/index.html',{host})).status,403,host);
 }
 assert.equal((await get(port,'/index.html',{host:'localhost:'+port})).status,200);
});

test('allowed runtime path cannot escape the fixture root through a directory link',async t=>{
 const {temp,port}=await fixture(t);
 const outside=join(temp,'outside'),linkedRoot=join(temp,'linked-checkout');
 mkdirSync(outside);mkdirSync(linkedRoot);
 writeFileSync(join(linkedRoot,'index.html'),'<title>Linked fixture</title>');
 writeFileSync(join(outside,'birdmap-basemap.js'),SENTINEL);
 symlinkSync(outside,join(linkedRoot,'assets'),process.platform==='win32'?'junction':'dir');
 const linkedServer=await startServer(0,{root:linkedRoot});
 try{
  const res=await get(linkedServer.address().port,'/assets/birdmap-basemap.js');
  assert.equal(res.status,404);assert.equal(res.body.includes(SENTINEL),false);
  assert.equal((await get(port,'/assets/birdmap-basemap.js')).status,200);
 }finally{await new Promise((done,error)=>linkedServer.close(err=>err?error(err):done()));}
});
