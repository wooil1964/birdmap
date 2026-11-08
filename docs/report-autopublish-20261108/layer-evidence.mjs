// Per-case leak report for one source tree (used on mutated copies). Prints which matrix cases leak coordinates
// through /reports/pending, and whether a replayed receipt claims public_unverified with reads OFF.
// Usage: ROOT=<reports-api dir> node layer-evidence.mjs
import {pathToFileURL} from 'node:url';
const R=p=>import(pathToFileURL(process.env.ROOT+'/'+p).href);
const {canonicalDb}=await R('test/helpers.mjs');
const {environments,installAuthStubs,input,post,ORIGIN}=await R('local-test/helpers.mjs');
const {handleRequest}=await R('src/public.js');
const {kstDateString}=await R('src/shared.js');
const TODAY=kstDateString(new Date());
const CASES={legacy_flag_only:[{},null],protected:[{species:'매'},{}],protected_v2_19:[{species:'저어새'},{}],breeding_note:[{note:'둥지에서 새끼 확인'},{}],
  rare:[{species:'말똥가리'},{}],unknown_name:[{species:'처음보는새'},{}],positive_control:[{},{}]};
const auth=await installAuthStubs();
const db=canonicalDb(),envs=environments(db);Object.assign(envs.pub,{REPORTS_AUTO_PUBLIC:'0',REPORTS_UNVERIFIED_READS:'0'});
const ids={};let i=0;
for(const [key,[patch,review]] of Object.entries(CASES)){
  const body=input(5000+i++,{species:'참새',observedOn:TODAY,lat:35+i/100,lon:127+i/100});
  if((await post(envs.pub,body)).status!==201)throw Error('seed');ids[key]=body;
  const p={pending_public:1,...patch};db.sqlite.prepare(`UPDATE reports SET ${Object.keys(p).map(k=>k+'=?').join(',')} WHERE id=?`).run(...Object.values(p),body.request_id);
  if(review)db.sqlite.prepare(`INSERT INTO reviews(review_id,checklist_id,sequence,decision,to_status,actor_id,request_id,event_index,reason_code,created_at) VALUES (?,?,1,'submitted','pending','system:auto-public',?,0,'auto_public:auto-public-v1',?)`).run('r:'+key,body.request_id,body.request_id+':m',new Date().toISOString());
}
Object.assign(envs.pub,{REPORTS_AUTO_PUBLIC:'1',REPORTS_UNVERIFIED_READS:'1'});
const spots=(await (await handleRequest(new Request('https://synthetic.invalid/reports/pending',{headers:{Origin:ORIGIN}}),envs.pub)).json()).spots;
const visible=Object.keys(ids).filter(k=>spots.some(s=>s.id===ids[k].request_id));
envs.pub.REPORTS_UNVERIFIED_READS='0';
const replay=await (await post(envs.pub,ids.positive_control)).json();
auth.restore();
console.log(JSON.stringify({visible_with_reads_ON:visible,replay_receipt_with_reads_OFF:replay.publicVisibility}));
