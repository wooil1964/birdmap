import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {queryRead,assertRemoteIdentity,STAGING_DB,ROOT,LOCAL} from './staging-control.mjs';
import {schemaReady} from '../../../reports-api/src/canonical/control.js';
import {fingerprint,stable} from '../../../reports-api/src/canonical/data.js';
await assertRemoteIdentity();
const canonical=['sites','taxa','raw_submissions','checklists','sightings','reviews','audit_log','backfill_runs','transaction_assertions'];
const allTables=['reports',...canonical];
const schema=(await queryRead('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')).results;
const remote={prepare(sql){let params=[];return {bind(...v){params=v;return this;},async all(){return {results:(await queryRead(sql,params)).results};}};}};
const ready=await schemaReady(remote);
const normalized=schema.filter(r=>r.sql!==null&&canonical.includes(r.tbl_name)).map(({type,name,sql})=>({type,name,sql:sql.replace(/\s+/g,' ').trim().replace(/;$/,'')}));
const remoteHash=await fingerprint(normalized);
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(join(ROOT,'reports-api/schema.sql'),'utf8'));
sqlite.exec(readFileSync(join(ROOT,'docs/long-term-db-phase2a/migrations/0001_core.sql'),'utf8'));
const expected=sqlite.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all();
const expectedNorm=expected.filter(r=>r.sql!==null&&canonical.includes(r.tbl_name)).map(({type,name,sql})=>({type,name,sql:sql.replace(/\s+/g,' ').trim().replace(/;$/,'')}));
const tables={},differences=[];
const assertIdentifier=name=>{if(!/^\w+$/.test(name))throw Error('Unexpected schema identifier');return name;};
for(const table of allTables) {
  const manifest={};
  for(const kind of ['table_xinfo','foreign_key_list','index_list']) {
    const sql=`PRAGMA ${kind}(${assertIdentifier(table)})`;
    const actual=(await queryRead(sql)).results,local=sqlite.prepare(sql).all();
    manifest[kind]=actual;if(stable(actual)!==stable(local))differences.push({table,kind});
  }
  manifest.indexes={};
  for(const index of manifest.index_list) {
    const sql=`PRAGMA index_xinfo(${assertIdentifier(index.name)})`,actual=(await queryRead(sql)).results,local=sqlite.prepare(sql).all();
    manifest.indexes[index.name]=actual;if(stable(actual)!==stable(local))differences.push({table,index:index.name});
  }
  tables[table]=manifest;
}
const localHash=await fingerprint(expectedNorm),ddlEqual=stable(normalized)===stable(expectedNorm);
const evidence={checked_at:new Date().toISOString(),database_id:STAGING_DB,schema_ready:ready,remote_hash:remoteHash,local_hash:localHash,expected_phase2b_hash:'76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0',classification:ready&&ddlEqual&&!differences.length?'A_MATCH':differences.length?'C_SEMANTIC_DIFFERENCE':'B_SERIALIZATION_REVIEW_REQUIRED',new_tables:canonical.length,new_columns:canonical.reduce((n,t)=>n+tables[t].table_xinfo.length,0),reports_columns:tables.reports.table_xinfo.length,ddl_identical:ddlEqual,pragma_differences:differences,foreign_key_check:(await queryRead('PRAGMA foreign_key_check')).results,sqlite_schema:schema,normalized,tables};
writeFileSync(join(LOCAL,'schema-verification.json'),JSON.stringify(evidence,null,2)+'\n');sqlite.close();
console.log(JSON.stringify(Object.fromEntries(Object.entries(evidence).filter(([k])=>!['sqlite_schema','normalized','tables'].includes(k))),null,2));
if(evidence.classification!=='A_MATCH')process.exitCode=2;
