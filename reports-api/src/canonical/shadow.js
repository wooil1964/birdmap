import { canonicalReadDb, stable } from './data.js';
const FIELDS=new Set(['status','species','bird_count','lat','lon','reporter','name_public','spot_key','pending_public','history','total','limit','offset','publicVisibility','receivedAt','decidedAt','date']);
export function compareShadow(a,b) {
  const found=new Set();
  function visit(x,y,key='response') {
    if(stable(x)===stable(y))return;
    if(x===null||y===null||typeof x!==typeof y){found.add('shape');return;}
    if(Array.isArray(x)&&Array.isArray(y)) {if(x.length!==y.length)found.add('count');for(let i=0;i<Math.min(x.length,y.length);i++)visit(x[i],y[i],key);return;}
    if(typeof x==='object'&&typeof y==='object') {
      const keys=new Set([...Object.keys(x),...Object.keys(y)]);
      for(const k of keys){if(k==='generatedAt')continue;if(!Object.hasOwn(x,k)||!Object.hasOwn(y,k)){found.add('shape');if(FIELDS.has(k))found.add(k);}else visit(x[k],y[k],FIELDS.has(k)?k:key);}
      return;
    }
    found.add(FIELDS.has(key)?key:'value_or_order');
  }
  visit(a,b);return [...found].sort();
}
export async function shadowRead(request,env,legacyResponse,reader,log=entry=>console.log(JSON.stringify(entry))) {
  const path=new URL(request.url).pathname;
  const endpoint=path==='/reports/approved'?'approved':path==='/reports/pending'?'pending':path.startsWith('/reports/site/')?'site':'status';
  try {
    const canonical=await reader(request,{...env,REPORTS_DB:canonicalReadDb(env.REPORTS_DB),REPORTS_SHADOW_READ:'false'});
    const differences=compareShadow(await legacyResponse.json(),await canonical.json());
    if(legacyResponse.status!==canonical.status)differences.push('http_status');
    if(differences.length)log({event:'canonical_shadow_mismatch',endpoint,differences});
    return differences;
  }catch {log({event:'canonical_shadow_error',endpoint});return ['read_error'];}
}
