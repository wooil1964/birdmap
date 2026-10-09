import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const repo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const refs={before:'352315a57d038687807dbe0044c136a22fb0c9c5',head:'2e485079a34fa5aeeef09e82f3b996bf2696d978',main:'b0975cad9f3112af38cc286a892bf6f06722ce12'};
const files=['reports-api/src/field-updates.js','reports-api/src/public.js','reports-api/src/shared.js','reports-api/src/admin.js','reports-api/src/admin-actions.js','reports-api/src/canonical/persistence.js','.github/scripts/update_weather.py','.github/scripts/validate_weather.py','.github/scripts/validate_weather_week.py','.github/workflows/update-weather.yml','reports-api/wrangler.public.toml','reports-api/wrangler.admin.toml','weather-proxy/wrangler.toml'];
const read=(ref,file)=>execFileSync('git',['show',ref+':'+file],{cwd:repo,maxBuffer:1<<26});
const sha=x=>createHash('sha256').update(x).digest('hex');
const hashes=Object.fromEntries(files.map(file=>[file,Object.fromEntries(Object.entries(refs).map(([version,ref])=>[version,sha(read(ref,file))]))]));
for(const file of files.filter(f=>f!=='.github/scripts/validate_weather_week.py'))assert.equal(hashes[file].before,hashes[file].head,file);
const result={refs,canonicalGitBlobSha256:hashes,beforeHeadAllUnchanged:false,unchangedFileCount:files.filter(f=>hashes[f].before===hashes[f].head).length,changedFiles:files.filter(f=>hashes[f].before!==hashes[f].head),networkCalls:0,productChanges:0,coordinatesLogged:false};
fs.writeFileSync(path.join(out,'source_unchanged.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({unchangedFileCount:files.filter(f=>hashes[f].before===hashes[f].head).length,output:path.join(out,'source_unchanged.json')}));


