// Runs registry-ops.mjs plan -> apply -> rollback against a local Miniflare D1 by routing its
// Cloudflare REST calls to the local database. Never contacts Cloudflare.
// Usage: node docs/jeju-sites-20261018/ops-local.mjs <node_modules dir containing miniflare>
import {createRequire} from 'node:module';import path from 'node:path';import fs from 'node:fs';import os from 'node:os';
import assert from 'node:assert/strict';
import {prepareSiteSeed} from '../../reports-api/tools/sites-seed.mjs';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(path.join(path.resolve(process.argv[2]),'miniflare'));
const core=fs.readFileSync('docs/long-term-db-phase2e/migrations-main/0001_core.sql','utf8');
const table=n=>core.match(new RegExp('CREATE TABLE '+n+' \\([\\s\\S]*?\\n\\);'))[0];
const LOCAL_DB='00000000-0000-0000-0000-00000000jeju';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {}',d1Databases:{DB:'ops-local'},d1Persist:false}));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jeju-ops-'));
try{
  const db=await mf.getD1Database('DB');
  for(const s of [table('sites'),table('raw_submissions'),table('checklists'),
    "CREATE TABLE system_state (id INTEGER PRIMARY KEY, mode TEXT NOT NULL, generation INTEGER NOT NULL, reason TEXT, updated_at TEXT NOT NULL)",
    "INSERT INTO system_state VALUES (1,'NORMAL',4,'x','2026-10-13T00:00:00Z')",
    "CREATE TABLE reports (id TEXT PRIMARY KEY, site_id TEXT, species TEXT)","INSERT INTO reports VALUES ('keep','59','동박새')"])await db.prepare(s).run();
  const seed=await prepareSiteSeed(fs.readFileSync('index.html','utf8'),{capturedAt:'2026-10-01T00:00:00Z',expectedCount:206});
  const old=seed.sites.filter(s=>!['206','207','208','209','210','211'].includes(s.site_id)),ks=Object.keys(old[0]);
  await db.batch(old.map(s=>db.prepare(`INSERT INTO sites (${ks}) VALUES (${ks.map(()=>'?')})`).bind(...ks.map(k=>s[k]))));
  // Route d1-rest's REST calls into the local D1, reporting rows_written/changed_db like the real API.
  globalThis.fetch=async(url,init)=>{
    assert.ok(String(url).includes('/d1/database/'+LOCAL_DB+'/query'),'unexpected request '+url);
    const {sql,params}=JSON.parse(init.body);
    try{const r=await db.prepare(sql).bind(...(params||[])).all();const w=r.meta.changes||0;
      return new Response(JSON.stringify({success:true,result:[{success:true,results:r.results,meta:{rows_written:w,changed_db:w>0}}]}));}
    catch(e){return new Response(JSON.stringify({success:false,errors:[{message:e.message}],result:[]}),{status:400});}
  };
  let runs=0;const targetPath=path.join(tmp,'target.json'),planPath=path.join(tmp,'plan.json');
  fs.writeFileSync(targetPath,JSON.stringify({name:'local',account_id:'local',database_id:LOCAL_DB,environment:'staging'}));
  const ops=async mode=>{process.argv=[process.argv[0],'registry-ops.mjs',mode,targetPath,planPath];
    const exit=process.exit;let code=0;process.exit=c=>{code=c;throw Object.assign(Error('exit'),{exitCode:c});};
    try{await import('./registry-ops.mjs?'+mode+(++runs));}catch(e){if(e.message!=='exit')throw e;}finally{process.exit=exit;}return code;};
  const count=async()=>(await db.prepare('SELECT COUNT(*) n FROM sites').first()).n;
  const reports=async()=>JSON.stringify((await db.prepare('SELECT * FROM reports').all()).results);
  const rep0=await reports();
  assert.equal(await ops('plan'),0);assert.equal(await count(),200);
  assert.equal(await ops('apply'),0);assert.equal(await count(),206);
  await assert.rejects(()=>ops('apply'),/already present/);assert.equal(await count(),206);
  assert.equal(await ops('rollback'),0);assert.equal(await count(),200);assert.equal(await reports(),rep0);
  console.log(JSON.stringify({engine:'registry-ops.mjs on local Miniflare D1',plan:'ok',apply:'206',reapply:'refused',rollback:'200, reports unchanged'}));
}finally{await mf.dispose();fs.rmSync(tmp,{recursive:true,force:true});}
