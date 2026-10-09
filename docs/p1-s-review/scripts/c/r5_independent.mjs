import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const refs={before:'e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6',head:'352315a57d038687807dbe0044c136a22fb0c9c5',main:'b0975cad9f3112af38cc286a892bf6f06722ce12'};
function extract(source,name){const match=source.match(new RegExp('^function '+name+'\\([^\\n]*\\}$','m'))||source.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));assert.ok(match,name);return match[0];}
const names=['weeklyScoreValid','weeklyOwn','weeklyTodayRequiredDataValid','weeklyTodayRecommendable'];
const hashes={},rows=[];
for(const [version,ref] of Object.entries(refs)){
 if(version==='main')continue;
 const source=execFileSync('git',['show',ref+':index.html'],{cwd:repo,encoding:'utf8',maxBuffer:1<<25});
 const parts=names.map(n=>extract(source,n));hashes[version]=Object.fromEntries(names.map((n,i)=>[n,createHash('sha256').update(parts[i]).digest('hex')]));
 const context=vm.createContext({Number,Object,Array});vm.runInContext(parts.join('\n'),context);
 const site={showWave:false,island:false,pelagic:false};
 const raw={score:92,scoreEligible:true,missingScoreFields:[],wind:'북풍 3m/s',rain:'강수 없음',wave:null};
 const variants=[['normal',{}],['extreme_wind',{wind:'북풍 '+'9'.repeat(400)+'m/s'}],['extreme_rain',{rain:'3시간 강수 '+'9'.repeat(400)+'mm'}],['extreme_wave',{wave:'9'.repeat(400)+'m'}],['trim',{wind:' 북풍 3m/s ',rain:' 강수 없음 '}],['unicode_digits',{wind:'북풍 ٣m/s'}]];
 for(const [label,fields] of variants){const item={...raw,...fields};rows.push({version,label,accepted:context.weeklyTodayRecommendable(item,site),numericIsFinite:label.startsWith('extreme')?Number.isFinite(Number('9'.repeat(400))):null});}
}
for(const name of names)assert.equal(hashes.before[name],hashes.head[name]);
fs.writeFileSync(path.join(out,'r5_js.json'),JSON.stringify({refs,actualProductFunctions:names,hashes,rows,networkCalls:0,productChanges:0},null,2)+'\n');
console.log(JSON.stringify({beforeAfterGuardsIdentical:true,rows}));
