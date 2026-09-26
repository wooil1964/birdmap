import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { handleRequest as publicHandler } from '../src/public.js';
import { handleRequest as adminHandler } from '../src/admin.js';
import { SCHEMA_VERSION } from '../src/canonical/data.js';
export const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const ORIGIN='https://wooil1964.github.io';
export const ADMIN='local-admin@example.test';
export function splitDDL(sql) {return sql.replace(/--[^\n]*/g,'').match(/\s*CREATE TRIGGER[\s\S]*?END\s*;|[^;]+;/gi).map(s=>s.trim()).filter(Boolean);}
export async function localDb(toolchain) {
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(join(resolve(toolchain),'miniflare'));
  const mf=new Miniflare(convertV4MiniflareOptions({name:'phase2b-local',modules:true,script:'export default {fetch(){return new Response("local-only")}}',compatibilityDate:'2026-09-24',d1Databases:{REPORTS_DB:'phase2b-local-only'},d1Persist:false,host:'127.0.0.1',port:0,cf:false}));
  const db=await mf.getD1Database('REPORTS_DB');
  for(const path of ['../schema.sql','../../docs/long-term-db-phase2a/migrations/0001_core.sql','../../docs/long-term-db-phase2d1/migrations/0003_captcha_redemptions.sql'])await db.batch(splitDDL(readFileSync(new URL(path,import.meta.url),'utf8')).map(s=>db.prepare(s)));
  return {db,close:()=>mf.dispose()};
}
export async function installAuthStubs() {
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'local-key'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({iss:'https://phase2b-test.cloudflareaccess.com',aud:['phase2b-test'],email:ADMIN,exp:Math.floor(Date.now()/1000)+7200})).toString('base64url');
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(head+'.'+payload));
  const token=head+'.'+payload+'.'+Buffer.from(signature).toString('base64url');
  const old=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    if(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:true});
    if(String(url)==='https://phase2b-test.cloudflareaccess.com/cdn-cgi/access/certs')return Response.json({keys:[{...jwk,kid:'local-key',alg:'RS256'}]});
    throw Error('Unexpected external network request');
  };
  return {token,restore:()=>{globalThis.fetch=old;}};
}
export function environments(db) {
  const common={ENVIRONMENT:'test',REPORTS_DB:db,REPORT_IP_SALT:'synthetic-salt',TURNSTILE_SECRET_KEY:'synthetic-key',
    REPORTS_WRITE_MODE:'CANONICAL_DUAL_WRITE',REPORTS_DUAL_WRITE_ENABLED:'true',REPORTS_CONFIRMATION_REQUIRED:'true',REPORTS_SCHEMA_VERSION:SCHEMA_VERSION,
    REPORTS_ACTIVATION_ID:'local-activation',REPORTS_GATE_TOKEN:'local-gate',REPORTS_PENDING_PUBLIC:'1',ACCESS_TEAM_DOMAIN:'phase2b-test',ACCESS_AUD:'phase2b-test',ADMIN_EMAILS:ADMIN};
  const pub={...common,REPORTS_RELEASE_ID:'public-local',REPORTS_PEER_RELEASE_ID:'admin-local'};
  const admin={...common,REPORTS_RELEASE_ID:'admin-local',REPORTS_PEER_RELEASE_ID:'public-local'};
  pub.REPORTS_PEER={fetch:req=>adminHandler(req,admin)};
  admin.REPORTS_PEER={fetch:req=>publicHandler(req,pub)};
  return {pub,admin};
}
export function input(n,patch={}) {return {request_id:uuid(n),non_breeding_confirmed:true,species:`합성시험${n}`,lat:37.1,lon:127.1,observedOn:'2026-09-20',birdCount:1,reporter:'합성테스터',namePublic:true,note:'합성 메모',turnstileToken:'synthetic-token-'+n,...patch};}
export const post=(env,body)=>publicHandler(new Request('https://reports.example/reports',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.'+Number(body.request_id.slice(-3))%250},body:JSON.stringify(body)}),env);
export const adminPost=(env,token,id,body)=>adminHandler(new Request('https://admin.example/admin/api/reports/'+id,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':token,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
export function failingBinding(db,index=2) {return {prepare:sql=>db.prepare(sql),batch(statements){const copy=[...statements];copy.splice(index,0,db.prepare("INSERT INTO transaction_assertions(assertion_id,ok) VALUES ('injected-failure',0)"));return db.batch(copy);}};}
