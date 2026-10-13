// Current-writer claim exists only inside one raw atomic D1.batch.
// Old Workers cannot borrow an uncommitted claim or revive hidden locations.
import { WorkerError } from './shared.js';
export const WRITER_FENCE_TABLE='publication_writer_claim';
export const WRITER_FENCE_GUARDS=['reports','field_updates','field_update_events','field_update_confirmations']
 .flatMap(table=>['insert','update','delete'].map(action=>'writer_fence_'+table+'_'+action));
const wrappers=new WeakMap(),wrapped=new WeakSet(),prepared=new WeakMap();
const clean=sql=>sql.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'').trim();
const readonly=sql=>{
 if(typeof sql!=='string')return false;
 const text=clean(sql);
 // Fixed read-only CTEs power existing admin statistics. Unknown/DML CTEs
 // still use the claim path; SQL triggers remain the security boundary.
 return /^(SELECT|EXPLAIN)\b/i.test(text)||
  (/^PRAGMA\s+(?:table_info|foreign_key_check|index_list|index_info)\b/i.test(text)&&!text.includes('='))||
  (/^WITH\b/i.test(text)&&! /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(text));
};
// Only fixed, known canonical-only mutations may avoid the publication claim.
// Their existing operator authentication and in-batch freeze/CAS guards still apply.
// Unknown/native statements require a claim; DB triggers stop every protected write.
const canonicalOnly=sql=>typeof sql==='string'&&
 /^(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+(?:sites|taxa|raw_submissions|checklists|sightings|reviews|audit_log|backfill_runs|transaction_assertions|captcha_redemptions)\b/i.test(clean(sql))&&
 !/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+(?:reports|field_updates|field_update_events|field_update_confirmations)\b/i.test(clean(sql));
function unavailable(){return new WorkerError('WRITE_MAINTENANCE','제보 쓰기를 잠시 중지했습니다. 잠시 후 다시 시도해 주세요.',503);}
export async function writerFenceReady(db) {
 try {
  const row=await db.prepare(`SELECT
   (SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger' AND name IN (${WRITER_FENCE_GUARDS.map(()=>'?').join(',')})) AS guards,
   (SELECT COUNT(*) FROM publication_writer_claim) AS claims,write_frozen FROM public_publication_state WHERE id=1`).bind(...WRITER_FENCE_GUARDS).first();
  return !!row&&Number(row.guards)===WRITER_FENCE_GUARDS.length&&row.claims===0&&row.write_frozen===0;
 }catch{return false;}
}
export function strictWriterDb(binding,required=false) {
 if(!required)return binding;
 if(wrapped.has(binding))return binding;
 if(wrappers.has(binding))return wrappers.get(binding);
 async function batch(statements) {
  const sqls=statements.map(s=>prepared.get(s)?.sql);
  const body=statements.map(s=>prepared.get(s)?.raw||s);
  if(sqls.every(sql=>readonly(sql)||canonicalOnly(sql)))return binding.batch(body);
  // Plain INSERT rejects an orphan. CHECK aborts failed permission acquisition.
  const claim=binding.prepare(`INSERT INTO publication_writer_claim(id,ok)
   VALUES (1,CASE WHEN EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
    AND (SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger' AND name IN (${WRITER_FENCE_GUARDS.map(()=>'?').join(',')}))=${WRITER_FENCE_GUARDS.length}
    THEN 1 ELSE 0 END)`).bind(...WRITER_FENCE_GUARDS);
  try {
   const sets=await binding.batch([claim,...body,binding.prepare('DELETE FROM publication_writer_claim WHERE id=1')]);
   if(!Array.isArray(sets)||sets.length!==body.length+2)throw unavailable();
   return sets.slice(1,-1);
  }catch(error){
   if(/publication_writer_(?:ready|required)|UNIQUE constraint failed: publication_writer_claim|no such table: (?:publication_writer_claim|public_publication_state)/i.test(String(error?.message)))throw unavailable();
   throw error;
  }
 }
 function statement(raw,sql) {
  const proxy=new Proxy(raw,{get(target,key){
   if(key==='bind')return (...values)=>statement(target.bind(...values),sql);
   if(key==='run'&&!readonly(sql))return async()=>(await batch([proxy]))[0];
   if((key==='all'||key==='first')&&!readonly(sql))return async(column)=>{
    const result=(await batch([proxy]))[0];
    if(key==='all')return result;
    const row=result.results?.[0]??null;
    if(column!==undefined&&row){
     if(!Object.hasOwn(row,column))throw new Error('D1_COLUMN_NOTFOUND: Column not found ('+String(column)+')');
     return row[column];
    }return row;
   };
   if(key==='raw'&&!readonly(sql))return ()=>{throw unavailable();};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  prepared.set(proxy,{raw,sql});return proxy;
 }
 const proxy=new Proxy(binding,{get(target,key){
  if(key==='prepare')return sql=>statement(target.prepare(sql),sql);
  if(key==='batch')return batch;
  if(key==='withSession'&&typeof target.withSession==='function')return (...args)=>strictWriterDb(target.withSession(...args),true);
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 wrappers.set(binding,proxy);wrapped.add(proxy);return proxy;
}