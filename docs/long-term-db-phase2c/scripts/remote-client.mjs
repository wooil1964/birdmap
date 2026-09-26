import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,state,WORKERS} from './staging-control.mjs';
export const base=role=>`https://${WORKERS[role==='public'?0:1]}.wooil-birdmap.workers.dev`;
export async function http(role,path,body,headers={}) {
  state();const secret=JSON.parse(readFileSync(join(LOCAL,'staging-secrets.json'),'utf8'));
  const r=await fetch(base(role)+path,{method:body===undefined?'GET':'POST',headers:{'X-Phase2C-Test':secret.PHASE2C_TEST_TOKEN,Origin:'http://localhost',...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const raw=await r.text();let value;try{value=JSON.parse(raw);}catch{value={nonJson:true,bodyLength:raw.length};}
  return {status:r.status,headers:Object.fromEntries([...r.headers].filter(([k])=>['content-type','retry-after','location'].includes(k))),body:value};
}
export async function op(role,input) {return http(role,'/_phase2c',input);}
export async function success(role,input) {const r=await op(role,input);if(r.status!==200||r.body.ok!==true)throw Error(JSON.stringify({op:input.op,...r}));return r.body.value;}
