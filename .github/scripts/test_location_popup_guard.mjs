import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const html=fs.readFileSync(process.env.INDEX_PATH||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../index.html'),'utf8').replace(/\r\n/g,'\n');
function source(name){const s=html.indexOf('function '+name+'(');assert.ok(s>=0,name);let depth=0,q=null;for(let i=html.indexOf('{',s);i<html.length;i++){const c=html[i];if(q){if(c===q&&html[i-1]!=='\\')q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(s,i+1);}throw Error(name);}
test('publicationForgetLayer는 이전 팝업·source·binding을 제거하고 지도에서 레이어를 내린다',()=>{
 const calls=[],popup={_source:{synthetic:true},setContent(text){calls.push(['content',text]);}};
 const marker={getPopup(){return popup;},closePopup(){calls.push(['close']);},unbindPopup(){calls.push(['unbind']);}};
 const map={removeLayer(layer){assert.equal(layer,marker);calls.push(['remove']);}};
 const forget=new Function(source('publicationForgetLayer')+';return publicationForgetLayer;')();forget(marker,map);
 assert.equal(popup._source,null);assert.deepEqual(calls.map(c=>c[0]),['content','close','unbind','remove']);assert.match(calls[0][1],/최신 상태를 확인할 수 없습니다/);
 assert.doesNotThrow(()=>forget(null,map));
});
