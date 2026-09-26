// Re-run the unmodified Phase 2A proof in a disposable local copy; original evidence is never overwritten.
import { readFileSync,writeFileSync,mkdtempSync,cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
// Keep Windows D1 storage paths below MAX_PATH; retain every run instead of deleting it.
const target=mkdtempSync(join(tmpdir(),'birdmap-p2a-'));
const phase='docs/long-term-db-phase2a';
for(const path of [phase+'/proof',phase+'/migrations',phase+'/wrangler.local.toml','reports-api/src','reports-api/test','reports-api/schema.sql','reports-api/package.json','index.html']) {
  cpSync(join(root,path),join(target,path),{recursive:true});
}
const result=spawnSync(process.execPath,[join(target,phase,'proof/run.mjs'),'--toolchain',process.argv[2]],{cwd:target,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
const evidence=JSON.parse(readFileSync(join(target,phase,'evidence/local-results.json'),'utf8'));
evidence.replay_note='Unmodified Phase 2A proof/model/fixture/DDL; current Phase 2B Worker code copied locally. Original Phase 2A files untouched.';
writeFileSync(join(root,'docs/long-term-db-phase2b/.local/phase2a-replay.json'),JSON.stringify(evidence,null,2)+'\n');
process.exitCode=result.status??1;
