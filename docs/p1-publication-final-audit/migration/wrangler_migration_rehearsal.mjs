import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Synthetic only. Every Wrangler D1 invocation uses --local and a fake database UUID.
const inputRoot=resolve(process.argv[2]);
const evidenceDir=resolve(process.argv[3]);
const toolchain=resolve(process.argv[4]);
const sha=process.argv[5];
assert.match(sha,/^[0-9a-f]{40}$/);
const node=process.execPath;
const cli=join(toolchain,'wrangler/bin/wrangler.js');
const wranglerVersion=JSON.parse(readFileSync(join(toolchain,'wrangler/package.json'),'utf8')).version;
assert.equal(wranglerVersion,'4.149.0');
const scratch=join(evidenceDir,'scratch-'+sha.slice(0,8));
const persistBase=resolve(process.argv[6] || join(scratch,'local-persist'));
mkdirSync(persistBase,{recursive:true});
mkdirSync(scratch,{recursive:true});
mkdirSync(evidenceDir,{recursive:true});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const report={at:new Date().toISOString(),sourceSha:sha,scope:'Local synthetic workerd D1 only; zero remote D1/deployment calls',runtime:{node:process.version,wrangler:wranglerVersion},checks:[],commands:[]};
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^CLOUDFLARE_|^CF_(API|ACCOUNT)|^WRANGLER_(API|CF)/i.test(k)));
Object.assign(env,{WRANGLER_SEND_METRICS:'false',CI:'true',NO_COLOR:'1',FORCE_COLOR:'0'});
const source=join(scratch,'source');
mkdirSync(source,{recursive:true});
const archive=join(scratch,'source.zip');
const archived=spawnSync('git',['archive',sha,'--format=zip','--output='+archive],{cwd:inputRoot,encoding:'utf8'});
assert.equal(archived.status,0,archived.stderr);
const expanded=spawnSync('tar.exe',['-xf',archive,'-C',source],{encoding:'utf8'});
assert.equal(expanded.status,0,expanded.stderr);
const preflight=JSON.parse(readFileSync(join(inputRoot,'docs/p1-publication-final-audit/operations/preflight-readonly.json'),'utf8'));
const excluded=new Set(['_cf_KV','sqlite_sequence','d1_migrations']);
const schema=preflight.database.schema.filter(s=>!excluded.has(s.name)&&s.sql);
assert.equal(schema.length,48);
const ordered=['table','index','trigger'].flatMap(t=>schema.filter(s=>s.type===t));
const ddl=ordered.map(s=>s.sql+';').join('\n');
report.input={preflightSchemaSha256:preflight.database.schemaSha256,selectedSchemaSha256:hash(schema),schemaObjects:schema.length,excludedObjects:[...excluded],migrationSha256:hash(readFileSync(join(source,'reports-api/migrations/0005_publication_security.sql'),'utf8'))};
writeFileSync(join(evidenceDir,'operating-user-schema.sql'),ddl+'\n');
const seed=new DatabaseSync(':memory:');
seed.exec('PRAGMA foreign_keys=ON;'+ddl);
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const inserts=[];
const insert=(table,row)=>{const keys=Object.keys(row);const sql='INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(k=>quote(row[k])).join(',')+');';seed.exec(sql);inserts.push(sql);};
insert('system_state',{id:1,mode:'NORMAL',generation:2,reason:'synthetic original normal state',updated_at:'2026-09-26T22:35:29.525Z'});
const {checklistFromReport,initialSighting}=await import(pathToFileURL(join(source,'reports-api/src/canonical/data.js')));
const at=new Date().toISOString();
for(let n=0;n<68;n++){
  const id='10000000-0000-4000-8000-'+String(n+1).padStart(12,'0');
  const row={id,status:n<55?'approved':'rejected',species:'ordinary synthetic bird',lat:37.123,lon:127.456,public_lat:n===0?37.12:null,public_lon:n===0?127.45:null,approx_lat:37.12,approx_lon:127.45,pending_public:0,observed_on:'2026-10-12',received_at:at,decided_at:at,bird_count:1,reporter:'synthetic fixture',note:'synthetic only',admin_note:'synthetic only',site_id:null,name_public:0,spot_key:null,ip_hash:'synthetic-ip-'+n,dedupe_hash:'synthetic-dedupe-'+n};
  insert('reports',row);
  const payload=JSON.stringify({synthetic:true,id});
  insert('raw_submissions',{raw_id:'raw:'+id,source_type:'legacy_reports_snapshot',source_id:id,request_id:null,payload_json:payload,submitted_at:at,submitted_by:null,schema_version:'phase2a-0001',captured_at:at,source_fingerprint:hash(payload),non_breeding_confirmed:null,policy_version:null});
  insert('checklists',checklistFromReport(row,'raw:'+id,at,false));
  insert('sightings',initialSighting(row,at,false));
}
for(let n=0;n<3;n++){
 const id='synthetic-field-'+(n+1), status=n<2?'not_visible':'visible';
 insert('field_updates',{id,species:'ordinary synthetic bird',bird_count:1,status,lat:37.123,lon:127.456,public_lat:37.123,public_lon:127.456,location_hidden:0,nickname:'synthetic fixture',note:null,location_source:'map',gps_accuracy:null,created_at:at,updated_at:at,last_confirmed_at:at,last_activity_at:at,user_hash:'synthetic-owner-'+n,ip_hash:'synthetic-ip-'+n});
 insert('field_update_events',{id:'synthetic-event-'+n,field_update_id:id,status,nickname:'synthetic fixture',created_at:at,user_hash:'synthetic-owner-'+n,ip_hash:'synthetic-ip-'+n});
 insert('field_update_confirmations',{id:'synthetic-confirm-'+n,field_update_id:id,created_at:at,user_hash:'synthetic-observer-'+n,ip_hash:'synthetic-observer-ip-'+n});
}
const migrationLedger=preflight.database.schema.find(s=>s.name==='d1_migrations').sql+';\nINSERT INTO d1_migrations(name) VALUES(\'0000_synthetic_previous_migration.sql\');';
const fixtureSql=ddl+'\n'+inserts.join('\n')+'\n'+migrationLedger+'\n';
writeFileSync(join(scratch,'fixture.sql'),fixtureSql);
const actual=readFileSync(join(source,'reports-api/migrations/0005_publication_security.sql'),'utf8');
const failed=actual.replace('CREATE TRIGGER publication_state_permanent',"INSERT INTO transaction_assertions(assertion_id,ok) VALUES('intentional-migration-failure',0);\nCREATE TRIGGER publication_state_permanent");
assert.notEqual(actual,failed);
for(const name of ['failure','success']){
 const runDir=join(scratch,name); mkdirSync(join(runDir,'migrations'),{recursive:true});
 writeFileSync(join(runDir,'migrations/0005_publication_security.sql'),name==='success'?actual:failed);
 writeFileSync(join(runDir,'worker.js'),'export default {fetch(){return new Response("synthetic local only")}};\n');
 writeFileSync(join(runDir,'wrangler.json'),JSON.stringify({name:'synthetic-publication-migration-'+name,main:'worker.js',compatibility_date:'2026-09-24',d1_databases:[{binding:'REPORTS_DB',database_name:'synthetic-publication-migration',database_id:'11111111-1111-4111-8111-111111111111',migrations_dir:'migrations'}]},null,2)+'\n');
}
let seq=0;
function call(name,label,args,expected=0){
 assert.equal(args.includes('--remote'),false);
 const runDir=join(scratch,name);
 const command=[cli,...args,'--local','--config',join(runDir,'wrangler.json'),'--persist-to',join(persistBase,name)];
 const startedAt=new Date().toISOString();
 const p=spawnSync(node,command,{cwd:runDir,env,encoding:'utf8',timeout:120000,maxBuffer:8e6});
 const filename=String(++seq).padStart(2,'0')+'-'+name+'-'+label;
 writeFileSync(join(evidenceDir,filename+'.stdout.log'),p.stdout||'');
 writeFileSync(join(evidenceDir,filename+'.stderr.log'),p.stderr||'');
 report.commands.push({id:filename,argv:[node,...command],startedAt,endedAt:new Date().toISOString(),exitCode:p.status,expectedExitCode:expected,signal:p.signal,error:p.error?.message,stdoutSha256:hash(p.stdout||''),stderrSha256:hash(p.stderr||'')});
 assert.equal(p.error,undefined,p.error?.message);
 assert.equal(p.status,expected,label+' '+p.stderr+' '+p.stdout);
 return p;
}
function execute(name,label,sql,expected=0){return call(name,label,['d1','execute','REPORTS_DB','--command',sql,'--json'],expected);}
function snapshot(name,label){
 const tables=ordered.filter(s=>s.type==='table').map(s=>s.name);
 const localDir=join(persistBase,name,'v3/d1');
 const localFiles=readdirSync(localDir,{recursive:true}).filter(f=>f.endsWith('.sqlite')&&!f.endsWith('metadata.sqlite'));
 assert.equal(localFiles.length,1);
 const local=new DatabaseSync(join(localDir,localFiles[0]),{readOnly:true});
 try{if(local.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='public_publication_state'" ).get())tables.push('public_publication_state');}finally{local.close();}
 const results=JSON.parse(execute(name,label,"SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name; "+tables.map(t=>'SELECT * FROM '+t+' ORDER BY rowid;').join(' ')+' SELECT * FROM d1_migrations ORDER BY id;').stdout);
 const catalog=results[0].results;
 const content=Object.fromEntries(tables.map((t,i)=>[t,results[i+1].results]));
 const ledger=results.at(-1).results;
 const sha256=hash({catalog,content,ledger});
 const manifest={catalogSha256:hash(catalog),contentSha256:hash(content),ledgerSha256:hash(ledger),sha256,tableCounts:Object.fromEntries(tables.map(t=>[t,content[t].length])),tableSha256:Object.fromEntries(tables.map(t=>[t,hash(content[t])])),schemaNames:catalog.map(s=>s.name),ledger};
 writeFileSync(join(evidenceDir,label+'-'+name+'-snapshot.json'),JSON.stringify(manifest,null,2)+'\n');
 return{catalog,content,ledger,manifest};
}
async function check(id,fn){try{await fn();report.checks.push({id,status:'pass'});}catch(e){report.checks.push({id,status:'fail',message:e.message,stack:e.stack});throw e;}}
try{
 for(const name of ['failure','success'])call(name,'seed',['d1','execute','REPORTS_DB','--file',join(scratch,'fixture.sql'),'--json']);
 await check('M01-48 operating user DDL objects load unchanged with 68 synthetic reports and canonical counterparts',()=>{
  assert.equal(seed.prepare('SELECT COUNT(*) n FROM reports').get().n,68);
  for(const t of ['raw_submissions','checklists','sightings'])assert.equal(seed.prepare('SELECT COUNT(*) n FROM '+t).get().n,68);
 });
 const faultBefore=snapshot('failure','before');
 await check('M02-Wrangler local migrations apply execution-time mid-DDL CHECK failure exits 1',()=>call('failure','apply-fault',['d1','migrations','apply','REPORTS_DB'],1));
 const faultAfter=snapshot('failure','after');
 await check('M03-failed file rolls back every schema object, column, data row and migration ledger',()=>assert.equal(faultAfter.manifest.sha256,faultBefore.manifest.sha256));
 await check('M04-no partial state table or row_revision after failed migration',()=>{assert.equal(faultAfter.catalog.some(s=>s.name==='public_publication_state'),false);assert.equal(Object.hasOwn(faultAfter.content.field_updates[0],'row_revision'),false);assert.equal(faultAfter.ledger.length,1);});
 const successBefore=snapshot('success','before');
 await check('M05-pre-migration report maintenance activation blocks existing writer insert/update',()=>{
  execute('success','maintenance',"UPDATE system_state SET mode='READ_ONLY_MAINTENANCE',generation=generation+1,reason='synthetic coordinated migration',updated_at='"+at+"' WHERE id=1;");
  execute('success','report-update-frozen',"UPDATE reports SET status='pending' WHERE id='10000000-0000-4000-8000-000000000001';",1);
  execute('success','report-insert-frozen',"INSERT INTO reports SELECT '10000000-0000-4000-8000-000000000099',status,species,lat,lon,public_lat,public_lon,observed_on,received_at,decided_at,bird_count,reporter,note,admin_note,site_id,ip_hash,'synthetic-new-dedupe',name_public,spot_key,approx_lat,approx_lon,pending_public FROM reports LIMIT 1;",1);
 });
 await check('M06-valid exact source file installs as one Wrangler local migration',()=>call('success','apply',['d1','migrations','apply','REPORTS_DB']));
 const successAfter=snapshot('success','after');
 await check('M07-all report/canonical/child source values unchanged and field row_revision default 1 only',()=>{
  for(const [table,rows] of Object.entries(successBefore.content)){
   if(table==='system_state')continue;
   const next=successAfter.content[table].map(r=>{const copy={...r};if(table==='field_updates'){assert.equal(copy.row_revision,1);delete copy.row_revision;}return copy;});
   assert.deepEqual(next,rows,table);
  }
 });
 await check('M08-original user schema preserved apart from additive field column, exactly one ledger entry',()=>{
  for(const entry of successBefore.catalog){const next=successAfter.catalog.find(s=>s.name===entry.name);assert.ok(next,entry.name);if(entry.name!=='field_updates')assert.deepEqual(next,entry,entry.name);}
  assert.equal(successAfter.ledger.length,2);assert.deepEqual(successAfter.ledger[0],successBefore.ledger[0]);assert.equal(successAfter.ledger[1].name,'0005_publication_security.sql');
 });
 await check('M09-initial epoch valid, revision0 and write_frozen1',()=>{
  const [q]=JSON.parse(execute('success','state-after',"SELECT epoch,CAST(revision AS TEXT) revision,write_frozen FROM public_publication_state;").stdout);assert.match(q.results[0].epoch,/^[0-9a-f]{32}$/);assert.equal(q.results[0].revision,'0');assert.equal(q.results[0].write_frozen,1);
 });
 for(const table of ['field_updates','field_update_events','field_update_confirmations']){
  const columns=Object.keys(successAfter.content[table][0]);
  for(const operation of ['insert','update','delete'])await check('M10-freeze-'+table+'-'+operation,()=>{
   const condition=table==='field_updates'?"id='synthetic-field-3'":"field_update_id='synthetic-field-3'";
   const sql=operation==='insert'?'INSERT INTO '+table+'('+columns.join(',')+') SELECT '+columns.map(c=>c==='id'?quote('synthetic-new-'+table) :c==='user_hash'?"'synthetic-new-owner'":c).join(',')+' FROM '+table+' WHERE '+condition+' LIMIT 1;':operation==='update'?'UPDATE '+table+' SET '+(table==='field_updates'?"status='reappeared'":table==='field_update_events'?"status='reappeared'":"ip_hash='synthetic-new-ip'")+' WHERE '+condition+';':'DELETE FROM '+table+' WHERE '+condition+';';
   const p=execute('success','frozen-'+table+'-'+operation,sql,1);assert.match(p.stderr+p.stdout,/reports_write_frozen/);
  });
 }
 const afterBarriers=snapshot('success','after-barriers');
 await check('M11-all nine attempted field writes preserve every content row and publication counter',()=>assert.equal(afterBarriers.manifest.contentSha256,successAfter.manifest.contentSha256));
 await check('M12-explicit thaw monotonic epoch-preserving revision and original maintenance restoration',()=>execute('success','thaw',"UPDATE public_publication_state SET write_frozen=0,revision=revision+1 WHERE id=1; UPDATE system_state SET mode='NORMAL',generation=generation+1,reason='synthetic verified activation',updated_at='"+at+"' WHERE id=1;"));
 const beforeCas=snapshot('success','before-cas');
 await check('M13-losing row CAS aborts whole actual CLI batch before child event',()=>{
  const p=execute('success','losing-cas',"UPDATE field_updates SET status='deleted',row_revision=row_revision+1 WHERE id='synthetic-field-3' AND row_revision=999; INSERT INTO transaction_assertions(assertion_id,ok) VALUES('synthetic-cas',CASE WHEN changes()=1 THEN 1 ELSE 0 END); DELETE FROM transaction_assertions WHERE assertion_id='synthetic-cas'; INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES('synthetic-cas-event','synthetic-field-3','deleted','synthetic','"+at+"','synthetic','synthetic');",1);assert.match(p.stderr+p.stdout,/CHECK constraint failed/);
 });
 const afterCas=snapshot('success','after-losing-cas');
 await check('M14-losing CAS leaves original rows, authority, event, assertions and ledger untouched',()=>assert.equal(afterCas.manifest.contentSha256,beforeCas.manifest.contentSha256));
 await check('M15-winning owner deletion CAS, assertion and child deleted event succeeds atomically',()=>execute('success','winning-delete',"UPDATE field_updates SET status='deleted',row_revision=row_revision+1 WHERE id='synthetic-field-3' AND row_revision=1 AND status<>'deleted'; INSERT INTO transaction_assertions(assertion_id,ok) VALUES('synthetic-delete',CASE WHEN changes()=1 THEN 1 ELSE 0 END); DELETE FROM transaction_assertions WHERE assertion_id='synthetic-delete'; INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES('synthetic-delete-event','synthetic-field-3','deleted','synthetic','"+at+"','synthetic','synthetic');"));
 const deleted=snapshot('success','deleted');
 await check('M16-terminal deleted row blocks late unconditional reappeared',()=>{const p=execute('success','late-reappeared',"UPDATE field_updates SET status='reappeared' WHERE id='synthetic-field-3';",1);assert.match(p.stderr+p.stdout,/field_deleted_terminal/);});
 await check('M17-terminal deleted parent blocks late event',()=>{const p=execute('success','late-event',"INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES('synthetic-late-event','synthetic-field-3','reappeared','synthetic','"+at+"','synthetic','synthetic');",1);assert.match(p.stderr+p.stdout,/field_deleted_terminal/);});
 await check('M18-terminal deleted parent blocks late confirmation',()=>{const p=execute('success','late-confirm',"INSERT INTO field_update_confirmations(id,field_update_id,created_at,user_hash,ip_hash) VALUES('synthetic-late-confirm','synthetic-field-3','"+at+"','synthetic-other','synthetic');",1);assert.match(p.stderr+p.stdout,/field_deleted_terminal/);});
 const afterLate=snapshot('success','after-late');
 await check('M19-terminal rejected writes leave every data row unchanged',()=>assert.equal(afterLate.manifest.contentSha256,deleted.manifest.contentSha256));
 await check('M20-normal live field reappearance remains legal and increments row/permission',()=>execute('success','normal-reappeared',"UPDATE field_updates SET status='reappeared',row_revision=row_revision+1 WHERE id='synthetic-field-1' AND row_revision=1 AND status<>'deleted'; INSERT INTO transaction_assertions(assertion_id,ok) VALUES('synthetic-normal',CASE WHEN changes()=1 THEN 1 ELSE 0 END); DELETE FROM transaction_assertions WHERE assertion_id='synthetic-normal'; INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES('synthetic-normal-event','synthetic-field-1','reappeared','synthetic','"+at+"','synthetic','synthetic');"));
 await check('M21-reapplying single-file migration is an idempotent no-op via existing ledger',()=>{const p=call('success','reapply',['d1','migrations','apply','REPORTS_DB']);assert.match(p.stdout,/No migrations to apply/);});
 const final=snapshot('success','final');
 await check('M22-final report/canonical source values preserved through all synthetic security probes',()=>{for(const table of ['reports','raw_submissions','checklists','sightings'])assert.deepEqual(final.content[table],successBefore.content[table],table);assert.equal(final.content.transaction_assertions.length,0);});
 report.outcome={faultRollback:true,validMigrationAtomic:true,initialWriteFrozen:true,nineFieldBarriers:true,cas:true,terminal:true,original68ReportsAndCanonicalPreserved:true,operatingScope:'not executed; this is a local rehearsal only'};
}catch(error){report.failure={message:error.message,stack:error.stack};if(!report.checks.some(c=>c.status==='fail'))report.checks.push({id:'M00-local setup/run completed',status:'fail',message:error.message});process.exitCode=1;}
finally{seed.close();report.summary={pass:report.checks.filter(c=>c.status==='pass').length,fail:report.checks.filter(c=>c.status==='fail').length,skip:0};writeFileSync(join(evidenceDir,'MANIFEST.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));}




