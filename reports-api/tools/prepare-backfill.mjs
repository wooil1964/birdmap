// Read-only/preparation CLI. There is intentionally no --apply or remote execution mode.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { prepareBackfill, verifyBackfill } from './backfill-lib.mjs';
const args=process.argv.slice(2),mode=args[0];
if(!['--dry-run','--verify-only','--prepare-apply'].includes(mode)||!args[1]||(mode==='--verify-only'?args.length!==3:args.length!==2)) {
  console.error('Usage: node tools/prepare-backfill.mjs --dry-run|--prepare-apply snapshot.json OR --verify-only snapshot.json local.sqlite');process.exitCode=1;
} else {
  try {
    const plan=await prepareBackfill(JSON.parse(readFileSync(args[1],'utf8')));
    let verification=null;
    if(mode==='--verify-only') {
      const sqlite=new DatabaseSync(args[2],{readOnly:true});
      const db={prepare(sql){let values=[];return {bind(...v){values=v;return this;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)||null;}};}};
      try {verification=await verifyBackfill(db,plan);}finally{sqlite.close();}
    }
    console.log(JSON.stringify({mode,source_count:plan.source_count,manifest_sha256:plan.manifest_sha256,transform_version:plan.transform_version,registry_revision:plan.registry_revision,verification,apply_enabled:false}));
  } catch(error){console.error(JSON.stringify({error:error.code||'PREPARATION_FAILED'}));process.exitCode=1;}
}
