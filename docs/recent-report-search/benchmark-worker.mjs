// Local benchmark wrapper only. Never deploy: diagnostics are added to response headers.
import product from '../../reports-api/src/public.js';
import { AsyncLocalStorage } from 'node:async_hooks';
const storage=new AsyncLocalStorage(),bindings=new WeakMap();
function instrument(native){
  if(bindings.has(native))return bindings.get(native);
  function database(db){
    const wrap={prepare(sql){
      function statement(real){return {real,sql,bind(...values){return statement(real.bind(...values));},async all(){
        const result=await real.all();record(result,sql);return result;
      },async first(column){const row=(await this.all()).results?.[0]??null;return column===undefined?row:row?.[column]??null;}};}
      return statement(db.prepare(sql));
    },async batch(statements){
      const results=await db.batch(statements.map(s=>s.real));results.forEach((result,i)=>record(result,statements[i].sql));return results;
    }};
    if(typeof db.withSession==='function')wrap.withSession=mode=>{storage.getStore()?.primarySessions.push(mode);return database(db.withSession(mode));};
    return wrap;
  }
  const result=database(native);bindings.set(native,result);return result;
}
function record(result,sql){
  storage.getStore()?.queries.push({kind:sql.includes('revision_type')?'publication':sql.includes('FROM sites')?'sites':'reports',
    rowsRead:result.meta?.rows_read??null,rowsWritten:result.meta?.rows_written??null,durationMs:result.meta?.duration??null});
}
export default {async fetch(request,env,ctx){
  const trace={primarySessions:[],queries:[]};
  return storage.run(trace,async()=>{
    const response=await product.fetch(request,{...env,REPORTS_DB:instrument(env.REPORTS_DB)},ctx);
    const headers=new Headers(response.headers);headers.set('X-Synthetic-Metrics',JSON.stringify(trace));
    return new Response(response.body,{status:response.status,headers});
  });
}};
