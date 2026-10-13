import {pathToFileURL,fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertLegacyPurgeCompatible} from '../tools/purge-publication-guard.mjs';
for(const table of ['publication_writer_claim','public_publication_state'])test('purge: '+table+' blocks legacy sequential writes before intent',()=>{
 let writes=0;const tables=new Set(['reports','checklists',table]);
 assert.throws(()=>{assertLegacyPurgeCompatible(tables);writes++;},e=>e.code==='PURGE_PUBLICATION_ATOMIC_REQUIRED');
 assert.equal(writes,0);
});
test('purge: check stays read-only and old pre-publication contract remains available',()=>{
 assert.doesNotThrow(()=>assertLegacyPurgeCompatible(new Set(['reports','checklists','system_state'])));
 const source=readFileSync(new URL('../tools/purge-runner.mjs',import.meta.url),'utf8');
 assert.match(source,/async function writable\(tb\)\s*\{\s*assertLegacyPurgeCompatible\(tb\)/);
 assert.ok(source.indexOf('const gate = await writable(tb);')<source.indexOf("if (!known) await write(t, ledgerDb"));
 assert.match(source,/mode\[0\] === 'check'[\s\S]*?await events\(\)/);
});
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

for(const mode of ['purge','reconcile','check'])test('purge CLI actual entry: '+mode+' on fenced DB makes zero writes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'birdmap-purge-synthetic-'));
 const auth=join(dir,'xdg.config','.wrangler','config');mkdirSync(auth,{recursive:true});
 writeFileSync(join(auth,'default.toml'),'oauth_token = "synthetic-never-sent"\n');
 const target=join(dir,'target.json'),preload=join(dir,'preload.mjs');
 writeFileSync(target,JSON.stringify({name:'synthetic',environment:'staging',account_id:'synthetic-account',database_id:'synthetic-main',ledger_database_id:'synthetic-ledger',workers:[]}));
 writeFileSync(preload,"globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('https://api.cloudflare.com/client/v4/accounts/synthetic-account/d1/database/'))throw Error('No external network permitted');const body=JSON.parse(options.body);if(!/^SELECT\\b/i.test(body.sql))throw Error('Unexpected write');const results=/sqlite_schema/.test(body.sql)?['reports','checklists','public_publication_state','publication_writer_claim'].map(name=>({name})):[];return Response.json({success:true,result:[{success:true,results,meta:{rows_written:0,changed_db:false}}]});};\n");
 const path=new URL('../tools/purge-runner.mjs',import.meta.url);
 const args=['--import',pathToFileURL(preload).href,fileURLToPath(path),'--'+mode,'--target',target,'--source-id','10000000-0000-4000-8000-000000000001','--policy-version','existing','--actor-ref','synthetic','--confirm','PURGE_FORBIDDEN_CONTENT'];
 const run=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,APPDATA:dir}});
 assert.equal(run.status,mode==='check'?0:1,run.stderr);
 const receipt=JSON.parse((mode==='check'?run.stdout:run.stderr).trim());
 if(mode!=='check')assert.equal(receipt.error,'PURGE_PUBLICATION_ATOMIC_REQUIRED');
 assert.equal(receipt.rest.writes,0);assert.equal(receipt.rest.rowsWrittenByReads,0);
});
