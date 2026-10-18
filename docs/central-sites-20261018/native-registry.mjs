import {createRequire} from 'node:module';import path from 'node:path';
const require=createRequire(import.meta.url);
if(!process.argv[2])throw Error('Pass the local Miniflare node_modules directory');
const {Miniflare,convertV4MiniflareOptions}=require(path.join(path.resolve(process.argv[2]),'miniflare'));
import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('docs/central-sites-20261018/append-registry.sql','utf8');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local test")}}',compatibilityDate:'2026-10-01',d1Databases:{DB:'central-local-only'},d1Persist:false,host:'127.0.0.1',port:0,cf:false}));
try{
const db=await mf.getD1Database('DB');await db.exec("CREATE TABLE sites(site_id TEXT PRIMARY KEY,site_name TEXT NOT NULL,lat REAL,lon REAL,registry_source TEXT,registry_revision TEXT,source_record_json TEXT,created_at TEXT,retired_at TEXT); CREATE TABLE system_state(id INTEGER PRIMARY KEY,mode TEXT,generation INTEGER); INSERT INTO system_state VALUES(1,'NORMAL',4);");
const keys='site_id site_name lat lon registry_source registry_revision source_record_json created_at retired_at'.split(' ');
const old=Array.from({length:190},(_,i)=>Object.fromEntries(keys.map((k,n)=>[k,[String(i+1),'Synthetic '+(i+1),36.5,127.5,'synthetic','old','{}','2026-01-01',null][n]])));
const added=Array.from({length:10},(_,i)=>({...old[0],site_id:String(i+196),site_name:'Synthetic '+i,registry_revision:'new'}));
await db.batch(old.map(s=>db.prepare('INSERT INTO sites VALUES(?,?,?,?,?,?,?,?,?)').bind(...keys.map(k=>s[k]))));
for(const [generation,rows] of [[3,added],[4,added.slice(1)],[4,added.slice(0,9).concat(added[0])]]){
 await assert.rejects(()=>db.prepare(sql).bind(generation,JSON.stringify(old),JSON.stringify(rows)).run());
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sites').first()).n,190);
}
await db.prepare(sql).bind(4,JSON.stringify(old),JSON.stringify(added)).run();
assert.equal((await db.prepare('SELECT COUNT(*) n FROM sites').first()).n,200);
const actual=(await db.prepare("SELECT * FROM sites WHERE CAST(site_id AS INTEGER)<196 ORDER BY CAST(site_id AS INTEGER)").all()).results;assert.deepEqual(actual,old);
await assert.rejects(()=>db.prepare(sql).bind(4,JSON.stringify(old),JSON.stringify(added)).run());
console.log(JSON.stringify({engine:'native local D1',tests:5,pass:5,fail:0,oldRowsUnchanged:190,added:10}));
}finally{await mf.dispose();}
