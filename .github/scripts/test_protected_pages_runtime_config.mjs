import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PACKAGER=join(ROOT,'.github/scripts/package_protected_pages.mjs');
const CONFIG='assets/map-runtime-config.js';
const SAFE_CONFIG=`/* Deployment-time browser configuration. Never commit a credential here.
 * The reviewed source and downloadable candidate intentionally contain no key.
 * A separately approved deployment may supply this object before initialization.
 */
window.BIRDMAP_MAP_CONFIG = window.BIRDMAP_MAP_CONFIG || { vworldKey: '' };`;
const PRIVATE_SENTINEL='SYNTHETIC_PRIVATE_KEY_FOR_PACKAGING_REGRESSION_ONLY';

function fixture(t,{config=SAFE_CONFIG}={}){
 const temp=mkdtempSync(join(tmpdir(),'birdmap-package-'));
 const checkout=join(temp,'checkout'),artifactParent=join(temp,'not-yet-created'),out=join(artifactParent,'artifact');
 t.after(()=>{
  // Remove only this test's freshly created, checked temporary directory.
  assert.equal(resolve(dirname(temp)),resolve(tmpdir()));
  assert.ok(basename(temp).startsWith('birdmap-package-'));
  rmSync(temp,{recursive:true,force:true});
 });
 // Reuse read-only local Git objects so HEAD exists, without creating a commit.
 execFileSync('git',['clone','--shared','--no-checkout','--quiet',ROOT,checkout],{stdio:'pipe'});
 execFileSync('git',['read-tree','--empty'],{cwd:checkout,stdio:'pipe'});
 mkdirSync(join(checkout,'assets'));
 const sites=Array.from({length:229},(_,i)=>({id:String(i+1),lat:36,lon:127}));
 const protectionTokens=[
  'function publicationHead(fresh)','function contributorsCurrent()',
  '_publicationStartedMono','data-publication-app','function publicationForgetLayer(layer,map)',
  'performance.now()-publicationState.checkedMono<PUBLICATION_MAX_AGE',
  "publicationInvalidate(document.hidden?'hidden':'expired')","querySelectorAll('[data-publication-entry]')"
 ];
 writeFileSync(join(checkout,'index.html'),'<!-- '+protectionTokens.join('\n')+' -->\n<script>\nvar siteData='+JSON.stringify(sites)+';\nsiteData=siteData.concat([]);\n</script>\n');
 for(const file of ['weather_today.json','weather_week.json','weather_rules.json','tide_today.json','tide_month.json','notices.json'])writeFileSync(join(checkout,file),'{}');
 writeFileSync(join(checkout,'birdmap-user-guide.png'),'synthetic-image-fixture');
 writeFileSync(join(checkout,'.gitignore'),'/assets/map-runtime-config.local.js\n');
 if(config!==null)writeFileSync(join(checkout,CONFIG),config);
 execFileSync('git',['add','--','.'],{cwd:checkout,stdio:'pipe'});
 writeFileSync(join(checkout,'assets/map-runtime-config.local.js'),PRIVATE_SENTINEL);
 return {checkout,out,artifactParent,run:()=>spawnSync(process.execPath,[PACKAGER,out],{cwd:checkout,encoding:'utf8'})};
}

function assertRejectedBeforeWrites(f,result){
 assert.notEqual(result.status,0);
 assert.equal(existsSync(f.artifactParent),false,'Refusal must precede even artifact parent creation');
 assert.equal(result.stdout,'');
 assert.match(result.stderr,/Protected Pages packaging requires the reviewed keyless runtime configuration/);
 assert.equal(result.stderr.includes(PRIVATE_SENTINEL),false,'Safety errors must not reproduce configuration content');
}

test('protective packaging accepts the canonical keyless config across CRLF and excludes ignored local credentials',t=>{
 const config='\r\n'+SAFE_CONFIG.replace(/\n/g,'\r\n')+'\r\n\r\n';
 const f=fixture(t,{config}),result=f.run();
 assert.equal(result.status,0,result.stderr);
 assert.equal(readFileSync(join(f.out,CONFIG),'utf8'),config);
 assert.equal(existsSync(join(f.out,'assets/map-runtime-config.local.js')),false);
 const manifest=JSON.parse(readFileSync(join(f.out,'protected-baseline.json'),'utf8'));
 assert.equal(manifest.siteDataCount,229);
 assert.ok(manifest.files[CONFIG]);
 assert.equal(JSON.stringify(manifest).includes(PRIVATE_SENTINEL),false);
});

test('protective packaging rejects a nonempty runtime key before creating any artifact path',t=>{
 const f=fixture(t,{config:SAFE_CONFIG.replace("vworldKey: ''","vworldKey: '"+PRIVATE_SENTINEL+"'")});
 assertRejectedBeforeWrites(f,f.run());
});

test('protective packaging rejects unknown runtime JavaScript without executing or echoing it',t=>{
 const payload="globalThis.process.getBuiltinModule('node:fs').writeFileSync('config-executed.txt', '"+PRIVATE_SENTINEL+"');\n"+SAFE_CONFIG;
 const f=fixture(t,{config:payload});
 assertRejectedBeforeWrites(f,f.run());
 assert.equal(existsSync(join(f.checkout,'config-executed.txt')),false);
});

test('protective packaging preserves the older main baseline without a runtime config',t=>{
 const f=fixture(t,{config:null}),result=f.run();
 assert.equal(result.status,0,result.stderr);
 assert.equal(existsSync(join(f.out,CONFIG)),false);
 const manifest=JSON.parse(readFileSync(join(f.out,'protected-baseline.json'),'utf8'));
 assert.equal(Object.hasOwn(manifest.files,CONFIG),false);
 assert.equal(existsSync(join(f.out,'assets/map-runtime-config.local.js')),false);
});

test('protective packaging fails closed when a tracked runtime config has disappeared',t=>{
 const f=fixture(t);
 unlinkSync(join(f.checkout,CONFIG));
 assertRejectedBeforeWrites(f,f.run());
});
