// Review harness only: keep browser test traffic away from production Workers.
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const nativeSpawn=childProcess.spawn;
childProcess.spawn=function(executable,args=[],options){
 const binary=String(executable||'').toLowerCase();
 if(binary.endsWith('chrome.exe')||binary.endsWith('msedge.exe')){
  args=[...args,'--host-resolver-rules=MAP *.workers.dev ~NOTFOUND, MAP challenges.cloudflare.com ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'];
 }
 return nativeSpawn.call(this,executable,args,options);
};
syncBuiltinESMExports();