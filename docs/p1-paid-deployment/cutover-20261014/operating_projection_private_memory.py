import base64,datetime,json,pathlib,subprocess,sys
from backup_readonly_dpapi import dpapi,restore
out=pathlib.Path('docs/p1-paid-deployment/cutover-20261014/OPERATING_PRIVATE_PROJECTION.json');assert not out.exists()
try:
 receipt=json.loads(pathlib.Path('docs/p1-paid-deployment/cutover-20261014/POST_PROBE_BACKUP.json').read_text(encoding='utf-8'))
 envelope=json.loads(dpapi(pathlib.Path(receipt['encryptedPath']).read_bytes(),True))
 con,counts,digest=restore(base64.b64decode(envelope['sqlBase64']).decode('utf-8-sig'),envelope['schema'])
 con.row_factory=__import__('sqlite3').Row
 rows=[dict(x) for x in con.execute("SELECT id,species,lat,lon,public_lat,public_lon,observed_on,reporter,name_public,spot_key FROM reports WHERE status='approved' ORDER BY observed_on DESC,received_at DESC")]
 nonapproved=[x[0] for x in con.execute("SELECT id FROM reports WHERE status<>'approved'")]
 source=r"""import {publicPayload} from './reports-api/src/shared.js';
import assert from 'node:assert/strict';import fs from'node:fs';
const input=JSON.parse(fs.readFileSync(0,'utf8')),base='https://birdmap-reports.wooil-birdmap.workers.dev';
const nonce=()=>crypto.randomUUID().replaceAll('-','');
async function get(p){const r=await fetch(base+p,{cache:'no-store',headers:{Origin:'https://wooil1964.github.io'}});assert.equal(r.status,200);return r.json();}
try{const n=nonce(),head=await get('/reports/public-state?nonce='+n);assert.equal(head.publication.nonce,n);const a=head.publication;assert.equal(a.revision,'1');
const dnonce=nonce();const body=await get('/reports/approved?contract=publication-v1&expectedEpoch='+a.epoch+'&expectedRevision='+a.revision+'&nonce='+dnonce);assert.equal(body.publication.nonce,dnonce);const expected=publicPayload(input.rows);assert.deepEqual({spots:body.spots,fixedSpots:body.fixedSpots},expected);
const hnonce=nonce(),after=await get('/reports/public-state?nonce='+hnonce);assert.equal(after.publication.nonce,hnonce);assert.equal(after.publication.epoch,a.epoch);assert.equal(after.publication.revision,a.revision);
const ids=new Set(body.spots.flatMap(x=>[x.id,...x.history.map(h=>h.id)]).concat(Object.values(body.fixedSpots).flatMap(x=>x.history.map(h=>h.id))));assert.equal(input.nonapproved.filter(id=>ids.has(id)).length,0);
const hidden=input.rows.filter(x=>!x.spot_key&&x.public_lat!=null&&x.public_lon!=null&&(x.public_lat!==x.lat||x.public_lon!==x.lon));
let precise=0;for(const row of hidden){const spot=body.spots.find(s=>s.id===row.id);assert.ok(spot?.locationHidden);assert.equal(spot.lat,row.public_lat);assert.equal(spot.lon,row.public_lon);if(spot.lat===row.lat&&spot.lon===row.lon)precise++;}assert.equal(precise,0);
console.log(JSON.stringify({status:'PASS',approvedRows:input.rows.length,spots:body.spots.length,fixedGroups:Object.keys(body.fixedSpots).length,hiddenSpots: hidden.length,maskedExactCoordinateLeaks:0,nonapprovedHistoryLeaks:0,completeApprovedProjectionMatchesEncryptedOriginal:true,privateReporterPolicyMatchesNamePublic:true,privatePayloadSaved:false,realUserMutations:0,requests:3}));
}catch(e){console.log(JSON.stringify({status:'FAIL',errorType:e.name,privatePayloadLogged:false}));process.exitCode=1;}"""
 result=subprocess.run(['C:/Program Files/nodejs/node.exe','--input-type=module','-e',source],input=json.dumps({'rows':rows,'nonapproved':nonapproved},ensure_ascii=False),capture_output=True,text=True,encoding='utf-8',timeout=50)
 # Node returns safe aggregates only. Never expose stderr/exception messages/private stdin.
 record=json.loads(result.stdout);record['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();record['memoryOnlyPrivateComparison']=True;record['encryptedOriginalReceipt']='POST_PROBE_BACKUP.json';record['sourceProjection']='reports-api/src/shared.js publicPayload';record['scope']='Existing approved public-coordinate/consented name policy only; not S1-P or retroactive erasure of already downloaded data';assert result.returncode==0 and record['status']=='PASS'
 out.write_bytes((json.dumps(record,indent=2)+'\n').encode());con.close();print(json.dumps(record))
except BaseException as error:
 print(json.dumps({'status':'FAIL','errorType':type(error).__name__,'privatePayloadLogged':False}));sys.exit(1)
