import sys,json,pathlib,datetime,subprocess
sys.path.insert(0,'C:/Users/김진호/.codex/worktrees/p1-paid-deploy/birdmap/docs/p1-paid-deployment/cutover-20261014')
from backup_readonly_dpapi import api,query,DB
out=pathlib.Path(sys.argv[1]);version=sys.argv[2];sha=sys.argv[3];assert not out.exists()
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==sha
ci=json.loads(pathlib.Path('docs/reporter-lifetime-stats/release/CI_RECEIPT.json').read_text(encoding='utf-8'));assert ci['sha']==sha and ci['conclusion']=='success'
worker='birdmap-reports';base='/workers/scripts/'+worker
v=api(base+'/versions/'+version);bindings=v['resources']['bindings'];vs={b['name']:b.get('text') for b in bindings if b['type']=='plain_text'};names={b['name'] for b in bindings}
assert vs['REPORTS_PUBLICATION_REQUIRED']=='true' and vs['REPORTS_WRITE_MODE']=='CANONICAL_DUAL_WRITE' and vs['REPORTS_RELEASE_ID']=='public-phase2e-1' and vs['REPORTS_PEER_RELEASE_ID']=='admin-phase2e-1'
assert {'REPORTS_GATE_TOKEN','TURNSTILE_SECRET_KEY','REPORT_IP_SALT','REPORTS_DB','REPORTS_PEER'}.issubset(names);assert 'PUBLICATION_ROOM' not in names
assert next(b for b in bindings if b['name']=='REPORTS_DB')['id']==DB
assert sha in v['annotations']['workers/message'];assert api(base+'/subdomain')['previews_enabled'] is False
before=api(base+'/deployments')['deployments'][0];assert before['versions']==[{'version_id':'f1f24698-8388-4f36-ae31-38f2dd8e9446','percentage':100}]
adminBefore=api('/workers/scripts/birdmap-reports-admin/deployments')['deployments'][0]
state=query('SELECT id,mode,generation FROM system_state WHERE id=1');assert state[0]['mode']=='NORMAL'
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':sha,'versionId':version,'before':{'id':before['id'],'versions':before['versions']},'adminBefore':{'id':adminBefore['id'],'versions':adminBefore['versions']},'D1Writes':0,'rollbackVersion':'f1f24698-8388-4f36-ae31-38f2dd8e9446','phase':'preflight'}
out.write_text(json.dumps(receipt,indent=2),encoding='utf-8')
payload={'strategy':'percentage','versions':[{'version_id':version,'percentage':100}],'annotations':{'workers/message':'Issue21 approved public-only reporter counts source '+sha+'; D1/admin unchanged; P1 rollback retained'}}
d=api(base+'/deployments',payload)
after=api(base+'/deployments')['deployments'][0];assert after['versions']==[{'version_id':version,'percentage':100}]
adminAfter=api('/workers/scripts/birdmap-reports-admin/deployments')['deployments'][0];assert adminAfter['id']==adminBefore['id'] and adminAfter['versions']==adminBefore['versions']
receipt.update(phase='activated',status='PASS',after={'id':after['id'],'versions':after['versions']},adminUnchanged=True)
out.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');print(json.dumps({'status':'PASS','versionId':version,'deploymentId':d['id'],'adminUnchanged':True,'D1Writes':0}))
