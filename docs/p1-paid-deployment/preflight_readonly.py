import json,tomllib,urllib.request,urllib.error,hashlib,pathlib,datetime
root=pathlib.Path.cwd();out=root/'docs/p1-paid-deployment/PREFLIGHT_READONLY.json';config=pathlib.Path('C:/Users/김진호/AppData/Roaming/xdg.config/.wrangler/config/default.toml');auth=tomllib.loads(config.read_text(encoding='utf-8'));token=auth.get('oauth_token');assert isinstance(token,str) and token
account='1d697c22a32447b386b9fac6a3538597';base='https://api.cloudflare.com/client/v4/accounts/'+account
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'Readonly metadata + SELECT-only D1 REST queries; no user row/coordinate serialization','account':account,'checks':{}}
def query(key,url,body=None):
 try:
  payload=None if body is None else json.dumps(body).encode();req=urllib.request.Request(url,data=payload,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=30) as res:r=json.load(res);status=res.status
  receipt['checks'][key]={'status':status,'success':r.get('success')};return r.get('result')
 except urllib.error.HTTPError as e:receipt['checks'][key]={'status':e.code,'success':False};return None
subs=query('subscriptions',base+'/subscriptions');receipt['subscriptions']=subs
settings=query('workersAccountSettings',base+'/workers/account-settings');receipt['workersAccountSettings']=settings
receipt['workers']={}
for worker,role in [('birdmap-reports','public'),('birdmap-reports-admin','admin')]:
 d=query(worker+'.deployments',base+'/workers/scripts/'+worker+'/deployments');s=query(worker+'.settings',base+'/workers/scripts/'+worker+'/settings');routes=query(worker+'.subdomain',base+'/workers/scripts/'+worker+'/subdomain');receipt['workers'][worker]={'deployments':d,'settings':{'compatibility_date':s.get('compatibility_date'),'usage_model':s.get('usage_model'),'limits':s.get('limits'),'bindings':[{'type':b.get('type'),'name':b.get('name'),'database_id':b.get('id') if b.get('type')=='d1' else None,**({'value':b.get('text')} if b.get('name') in ['REPORTS_WRITE_MODE','REPORTS_PUBLICATION_REQUIRED','REPORTS_WRITE_GENERATION'] else {})} for b in s.get('bindings',[])]} if s else None,'subdomain':routes}
cfg=tomllib.loads((root/'reports-api/wrangler.public.toml').read_text(encoding='utf-8'));dbid=cfg['d1_databases'][0]['database_id']
sql='SELECT name,type,sql FROM sqlite_schema WHERE name NOT LIKE \'sqlite_%\' ORDER BY type,name';r=query('schema',base+'/d1/database/'+dbid+'/query',{'sql':sql});rows=r[0]['results'] if r else [];receipt['database']={'id':dbid,'objects':len(rows),'schemaSha256':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest(),'hasPublicationState':any(x['name']=='public_publication_state' for x in rows),'tables':[x['name'] for x in rows if x['type']=='table'],'triggers':[x['name'] for x in rows if x['type']=='trigger']}
for key,sql in [('counts','SELECT (SELECT count(*) FROM reports) reports,(SELECT count(*) FROM field_updates) field_updates'),('ledger','SELECT id,name FROM d1_migrations ORDER BY id')]:
 r=query(key,base+'/d1/database/'+dbid+'/query',{'sql':sql});receipt['database'][key]=r[0].get('results') if r else None
out.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'checks':receipt['checks'],'workersAccountSettings':settings,'subscriptionAvailable':subs is not None,'database':receipt['database'],'activeVersions':{k:v['deployments'] for k,v in receipt['workers'].items()}},ensure_ascii=False))
