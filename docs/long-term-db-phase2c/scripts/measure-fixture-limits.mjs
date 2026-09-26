import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL} from './staging-control.mjs';
const values=JSON.parse(readFileSync(join(LOCAL,'backfill-values.json'),'utf8'));
const metrics=[];
for(const v of values)for(const [table,key] of [['raw_submissions','raw'],['checklists','checklist'],['sightings','sighting']]){
 const row=v[key],columns=Object.keys(row),sql=`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`;
 metrics.push({table,parameters:columns.length,sqlBytes:Buffer.byteLength(sql),maxTextBytes:Math.max(...Object.values(row).map(v=>typeof v==='string'?Buffer.byteLength(v):0)),serializedRowBytes:Buffer.byteLength(JSON.stringify(row))});
}
const result={at:new Date().toISOString(),actualSuccessfulBatches:{sites:190,synthetic21Backfill:64},maxBoundParameters:Math.max(...metrics.map(x=>x.parameters)),maxStatementBytes:Math.max(...metrics.map(x=>x.sqlBytes)),maxTextBytes:Math.max(...metrics.map(x=>x.maxTextBytes)),maxSerializedRowBytes:Math.max(...metrics.map(x=>x.serializedRowBytes)),official:{queryInvocationFree:50,queryInvocationPaid:1000,boundParameters:100,statementBytes:100000,rowBytes:2000000,batchTimeoutSeconds:30,simultaneousConnections:6,timeTravelFreeDays:7,timeTravelPaidDays:30},future:{formula:'3N+1 insert statements plus validation queries; with budget reserve16 => floor((Q-17)/3)',freeBudgetRows:11,paidBudgetRows:327,conservativeTrialRows:{free:10,paid:100},status:'planning bound only; no production chunk implementation or large-load proof; actual plan unconfirmed; current whole-snapshot verifier intentionally rejects partial states'},source:'https://developers.cloudflare.com/d1/platform/limits/'};
writeFileSync(join(LOCAL,'fixture-limits.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
