// Official migration, only against the guarded new staging database. Production configs untouched.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {assertRemoteIdentity,migrationConfig,wrangler,queryRead,DB_NAME,STAGING_DB,LOCAL} from './staging-control.mjs';
await assertRemoteIdentity();
const before=await queryRead("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name");
if(before.results.some(t=>!['_cf_KV','_cf_METADATA','d1_migrations','sqlite_sequence'].includes(t.name)))throw Error('Staging already contains schema: inspect prior run instead of repeating');
const config=migrationConfig(),started_at=new Date().toISOString();
const first=wrangler(['d1','migrations','apply',DB_NAME,'--remote'],config,'migration-first');
const second=wrangler(['d1','migrations','apply',DB_NAME,'--remote'],config,'migration-second');
const ledger=await queryRead('SELECT id,name,applied_at FROM d1_migrations ORDER BY id');
const fk=await queryRead('PRAGMA foreign_key_check');
const evidence={started_at,finished_at:new Date().toISOString(),database_id:STAGING_DB,first_succeeded:true,second_no_additional:/No migrations|no migrations|already/i.test(second),ledger:ledger.results,foreign_key_violations:fk.results.length,production_migrations:0};
writeFileSync(join(LOCAL,'migration-results.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
