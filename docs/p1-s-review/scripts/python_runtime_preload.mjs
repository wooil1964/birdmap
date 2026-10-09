/* Analysis/test process adapter only. No repository or product edits.
 * Optional Windows bundled Python: set BIRDMAP_PYTHON to its absolute executable path.
 * node --import ./docs/recommendation-masterplan/_scripts/python_runtime_preload.mjs --test .github/scripts/test_weekly_recommendation.mjs
 */
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
process.env.PYTHONIOENCODING='utf-8';
process.env.PYTHONDONTWRITEBYTECODE='1';
const original=childProcess.execFileSync;
childProcess.execFileSync=function(command,args,options){
 if(process.env.BIRDMAP_PYTHON&&(command==='python3'||command==='python'))command=process.env.BIRDMAP_PYTHON;
 return original.call(this,command,args,options);
};
syncBuiltinESMExports();
