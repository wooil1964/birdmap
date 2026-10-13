// Explicit trusted fixture writes use the same transaction boundary as current writers.
// Raw handles remain available for unclaimed legacy rejection tests.
export function trustedMutation(sqlite,fn) {
 sqlite.exec('BEGIN');
 try {sqlite.exec('INSERT INTO publication_writer_claim(id,ok) VALUES(1,1)');const out=fn();sqlite.exec('DELETE FROM publication_writer_claim WHERE id=1');sqlite.exec('COMMIT');return out;}
 catch(error){sqlite.exec('ROLLBACK');throw error;}
}
const protectedWrite=sql=>typeof sql==='string'&&/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+(?:reports|field_updates|field_update_events|field_update_confirmations)\b/i.test(sql.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,''));
export function trustedFixtureSqlite(sqlite) {
 return new Proxy(sqlite,{get(target,key){
  if(key==='prepare')return sql=>{const s=target.prepare(sql);return new Proxy(s,{get(stmt,k){
   if(k==='run'&&protectedWrite(sql))return (...v)=>trustedMutation(target,()=>stmt.run(...v));
   const f=Reflect.get(stmt,k,stmt);return typeof f==='function'?f.bind(stmt):f;
  }});};
  if(key==='exec')return sql=>protectedWrite(sql)?trustedMutation(target,()=>target.exec(sql)):target.exec(sql);
  const f=Reflect.get(target,key,target);return typeof f==='function'?f.bind(target):f;
 }});
}
