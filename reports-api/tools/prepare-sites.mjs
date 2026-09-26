// Emits a seed plan from the public registry. No database connection or apply mode.
import { readFileSync } from 'node:fs';
import { prepareSiteSeed } from './sites-seed.mjs';
try {
  if(process.argv.length!==4)throw Error('Usage: node tools/prepare-sites.mjs index.html <captured-at-ISO>');
  console.log(JSON.stringify(await prepareSiteSeed(readFileSync(process.argv[2],'utf8'),{capturedAt:process.argv[3]})));
} catch(error) {console.error(JSON.stringify({error:error.code||'SEED_PREPARATION_FAILED'}));process.exitCode=1;}
