import json,sys,urllib.request,urllib.parse,urllib.error,secrets,datetime,pathlib,hashlib
sys.path.insert(0,'C:/Users/김진호/.codex/worktrees/p1-paid-deploy/birdmap/docs/p1-paid-deployment/cutover-20261014')
from backup_readonly_dpapi import api,DB
ORIGIN='https://wooil1964.github.io';BASE='https://birdmap-reports.wooil-birdmap.workers.dev'
OUT=pathlib.Path(sys.argv[1]);assert not OUT.exists()
rows=[]
def get(path,params=None):
 url=BASE+path+('?' + urllib.parse.urlencode(params) if params else '')
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'Origin':ORIGIN,'Cache-Control':'no-cache','User-Agent':'birdmap-issue21-readonly-audit/1.0'}),timeout=20) as r:return r.status,json.load(r),dict(r.headers)
 except urllib.error.HTTPError as e:
  raw=e.read()
  try:b=json.loads(raw)
  except json.JSONDecodeError:b={'transportError':True}
  return e.code,b,dict(e.headers)
def hval(h,k):return next((v for n,v in h.items() if n.lower()==k.lower()),None)
def head():
 n=secrets.token_hex(16);status,b,h=get('/reports/public-state',{'nonce':n});assert status==200 and b['publication']['nonce']==n and hval(h,'Cache-Control')=='no-store';return b['publication']
def protected(path,params=None):
 a=head();n=secrets.token_hex(16);p=dict(params or {},contract=a['contract'],nonce=n,expectedEpoch=a['epoch'],expectedRevision=a['revision']);status,b,h=get(path,p);after=head()
 assert a['epoch']==after['epoch'] and a['revision']==after['revision']
 if status==200:assert b['publication']['epoch']==a['epoch'] and b['publication']['revision']==a['revision'] and b['publication']['nonce']==n
 assert hval(h,'Cache-Control')=='no-store';assert hval(h,'Access-Control-Allow-Origin')==ORIGIN
 return status,b,h
status,monthly,h=protected('/contributors/monthly');assert status==200
people=monthly.get('contributors',[]);assert people,'No currently public source for mandatory verification'
for i,person in enumerate(people[:5]):
 name=person['name'];status,b,h=protected('/reports/reporter-stats',{'source':'monthly','month':monthly['month'],'reporter':name});assert status==200
 assert set(b)=={'speciesCount','reportCount','publication','serverTime'}
 assert type(b['speciesCount']) is int and type(b['reportCount']) is int and b['reportCount']>0
 sql="SELECT species FROM reports WHERE status='approved' AND name_public=1 AND reporter IS NOT NULL AND TRIM(reporter)<>'' AND reporter=?1 COLLATE BINARY"
 data=api('/d1/database/'+DB+'/query',{'sql':sql,'params':[name]});assert len(data)==1 and data[0]['meta'].get('rows_written',0)==0
 reports=data[0]['results'];unique={x for r in reports for x in (r.get('species') or '').split(' · ') if x}
 assert b['reportCount']==len(reports) and b['speciesCount']==len(unique)
 rows.append({'id':'public-source-'+str(i+1),'pass':True,'onlyTwoCounts':True,'primarySQLCountsMatch':True,'noStore':True,'nonceAndPostflight':True,'cors':True})
 # No name, species, reportid or response data retained.
status,b,h=get('/reports/reporter-stats');assert status==400;rows.append({'id':'legacy-without-contract','pass':True,'status':status})
status,b,h=protected('/reports/reporter-stats',{'source':'monthly','month':monthly['month'],'reporter':'NONEXISTENT_SYNTHETIC_'+secrets.token_hex(4)});assert status==404 and 'speciesCount' not in b and 'reportCount' not in b;rows.append({'id':'unknown-source-generic','pass':True,'status':status})
# Former anchors cannot be used after a fabricated revision mismatch; no DB mutation.
a=head();status,b,h=get('/reports/reporter-stats',{'source':'monthly','month':monthly['month'],'reporter':people[0]['name'],'contract':a['contract'],'nonce':secrets.token_hex(16),'expectedEpoch':a['epoch'],'expectedRevision':str(int(a['revision'])+1)});assert status==409;rows.append({'id':'wrong-revision-denied','pass':True,'status':status})
status,b,h=protected('/reports/approved');assert status==200;rows.append({'id':'existing-approved-compatible','pass':True})
status,b,h=protected('/field-updates');assert status==200;rows.append({'id':'existing-field-compatible','pass':True})
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows,'pass':len(rows),'fail':0,'realUserMutations':0,'D1RowsWritten':0,'privatePayloadPersisted':False,'limit':'Actual revocation/deletion user actions are not performed; atomicity/CAS validated on synthetic native D1.'}
OUT.write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');print(json.dumps({'pass':len(rows),'fail':0,'privatePayloadPersisted':False}))
