import product from './source/reports-api/src/public.js';
import {AsyncLocalStorage} from 'node:async_hooks';
const traceStorage=new AsyncLocalStorage(),bindings=new WeakMap();let nativeNext=0;
function kind(sql){return sql.includes('guardLocators')?'cold-state':sql.includes('AS guards')?'warm-state':'payload';}
function instrument(native){
 const existing=bindings.get(native);if(existing)return existing;
 const nativeId=++nativeNext;
 function wrapDb(db){
  const obj={prepare(sql){const trace=traceStorage.getStore();function stmt(real){return {real,sql,bind(...values){return stmt(real.bind(...values));},async all(){const r=await real.all();trace?.queries.push({kind:kind(sql),rowsRead:r.meta?.rows_read,rowsWritten:r.meta?.rows_written,changedDb:r.meta?.changed_db,duration:r.meta?.duration});return r;},async first(column){const r=await this.all();const row=r.results?.[0]??null;return column===undefined?row:row?.[column]??null;}};}return stmt(db.prepare(sql));},async batch(statements){const trace=traceStorage.getStore(),r=await db.batch(statements.map(s=>s.real));for(let n=0;n<r.length;n++)trace?.queries.push({kind:kind(statements[n].sql),rowsRead:r[n].meta?.rows_read,rowsWritten:r[n].meta?.rows_written,changedDb:r[n].meta?.changed_db,duration:r[n].meta?.duration});return r;}};
  if(typeof db.withSession==='function')obj.withSession=constraint=>{traceStorage.getStore()?.primarySessions.push(constraint);return wrapDb(db.withSession(constraint));};
  return obj;
 }
 const entry={nativeId,wrapped:wrapDb(native)};bindings.set(native,entry);return entry;
}
export default {async fetch(request,env,ctx){const entry=instrument(env.REPORTS_DB),trace={nativeId:entry.nativeId,queries:[],primarySessions:[]};return traceStorage.run(trace,async()=>{const response=await product.fetch(request,{...env,REPORTS_DB:entry.wrapped},ctx);const headers=new Headers(response.headers);headers.set('X-Synthetic-Local-Metrics',JSON.stringify(trace));return new Response(response.body,{status:response.status,statusText:response.statusText,headers});});}};
