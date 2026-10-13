import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const out=resolve(process.argv[2]),toolchain=resolve(process.argv[3]),persist=resolve(process.argv[4]);
const source=join(out,'scratch-d39f1bd1/source');
const cli=join(toolchain,'wrangler/bin/wrangler.js'), config=join(out,'scratch-d39f1bd1/success/wrangler.json');
const evidence={sourceSha:'d39f1bd16baaea08f1241a3fb528a1953a343692',scope:'Additional read-only checks on the already migrated synthetic local D1',at:new Date().toISOString(),checks:[],commands:[]};
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^CLOUDFLARE_|^CF_(API|ACCOUNT)|^WRANGLER_(API|CF)/i.test(k)));
Object.assign(env,{WRANGLER_SEND_METRICS:'false',CI:'true',NO_COLOR:'1'});
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
let n=0;
function query(sql){
 const argv=[cli,'d1','execute','REPORTS_DB','--command',sql,'--json','--local','--config',config,'--persist-to',persist];
 const p=spawnSync(process.execPath,argv,{encoding:'utf8',env,timeout:120000,maxBuffer:8e6});
 const label='extra-'+(++n);writeFileSync(join(out,label+'.stdout.log'),p.stdout||'');writeFileSync(join(out,label+'.stderr.log'),p.stderr||'');
 evidence.commands.push({argv:[process.execPath,...argv],exitCode:p.status,stdoutSha256:createHash('sha256').update(p.stdout||'').digest('hex')});
 assert.equal(p.status,0,p.stdout+p.stderr);return JSON.parse(p.stdout);
}
const db={prepare(sql){let values=[];const stmt={bind(...v){values=v;return stmt;},async all(){let i=0;const rendered=sql.replace(/\?/g,()=>quote(values[i++]));assert.equal(i,values.length);return query(rendered)[0];}};return stmt;}};
async function check(id,fn){try{await fn();evidence.checks.push({id,status:'pass'});}catch(e){evidence.checks.push({id,status:'fail',message:e.message});process.exitCode=1;}}
const {schemaReady}=await import(pathToFileURL(join(source,'reports-api/src/canonical/control.js')));
const {publicationStateStatement}=await import(pathToFileURL(join(source,'reports-api/src/publication.js')));
await check('M23-actual canonical schemaReady calls exact SQL against CLI-migrated operational-schema synthetic D1',async()=>assert.equal(await schemaReady(db),true));
await check('M24-underlying migrated synthetic SQLite integrity and foreign keys checked read-only because D1 authorizer rejects integrity_check',()=>{const dir=join(persist,'v3/d1');const files=readdirSync(dir,{recursive:true}).filter(f=>f.endsWith('.sqlite')&&!f.endsWith('metadata.sqlite'));assert.equal(files.length,1);const local=new DatabaseSync(join(dir,files[0]),{readOnly:true});try{assert.deepEqual(local.prepare('PRAGMA integrity_check').all().map(r=>({...r})),[{integrity_check:'ok'}]);assert.deepEqual(local.prepare('PRAGMA foreign_key_check').all(),[]);}finally{local.close();}});
await check('M25-actual publication state SQL accepts all installed guards and current revision',async()=>{const r=await publicationStateStatement(db).all();assert.equal(r.success,true);assert.equal(r.results.length,1);evidence.publicationState=r.results[0];assert.match(String(r.results[0].epoch),/^[0-9a-f]{32}$/);assert.match(r.results[0].revision,/^(0|[1-9][0-9]*)$/);assert.equal(r.results[0].revision,'3');assert.equal(r.results[0].guards,22);assert.equal(r.results[0].revision_type,'integer');const state=query('SELECT write_frozen FROM public_publication_state WHERE id=1;')[0].results[0];assert.equal(state.write_frozen,0);});
evidence.summary={pass:evidence.checks.filter(c=>c.status==='pass').length,fail:evidence.checks.filter(c=>c.status==='fail').length,skip:0};writeFileSync(join(out,'EXTRA_INTEGRITY_MANIFEST.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence.summary));


