import argparse,base64,datetime,hashlib,json,pathlib,subprocess,sys,urllib.parse,urllib.request
sys.dont_write_bytecode=True;sys.path.insert(0,'C:/Users/김진호/.codex/worktrees/p1-paid-deploy/birdmap/docs/p1-paid-deployment/cutover-20261014');from backup_readonly_dpapi import NoAuthRedirect,HttpsOnlyRedirect
p=argparse.ArgumentParser();p.add_argument('--receipt',required=True);arg=p.parse_args();target=pathlib.Path(arg.receipt);assert not target.exists();raw=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,encoding='utf-8',capture_output=True,check=True).stdout;token=dict(line.split('=',1) for line in raw.splitlines() if '=' in line)['password'];repo='/repos/wooil1964/birdmap';headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'birdmap-independent-weather-readonly'}
def get(path):
 with urllib.request.build_opener(NoAuthRedirect()).open(urllib.request.Request('https://api.github.com'+path,headers=headers),timeout=35) as r:return json.load(r)
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mutationRequests':0,'privateDataRead':False,'errors':[]}
try:
 run=get(repo+'/actions/runs/38495106285');jobs=get(repo+'/actions/runs/38495106285/jobs?per_page=100')['jobs'];record['run']={k:run.get(k) for k in ['id','status','conclusion','event','head_sha','created_at','updated_at']};record['jobs']=[{'id':j['id'],'status':j['status'],'conclusion':j['conclusion'],'steps':[{'name':s['name'],'status':s['status'],'conclusion':s.get('conclusion')} for s in j.get('steps',[])]} for j in jobs]
 main=get(repo+'/branches/main')['commit']['sha'];comparison=get(repo+'/compare/31b5f6d6e0b400ff610ba065d893299c56a12af8...'+main);files=[f['filename'] for f in comparison.get('files',[])];assert comparison['status'] in ['ahead','identical'] and all(f in ['weather_today.json','weather_week.json','tide_today.json','tide_month.json','tide_health.json'] for f in files);record['main']={'sha':main,'status':comparison['status'],'changedFiles':files,'productSourcePreserved':True};page=get(repo+'/pages/builds/latest');record['latestPages']={k:page.get(k) for k in ['status','commit','created_at','updated_at','duration']}
 if run['status']=='completed':
  assert run['conclusion']=='success' and jobs and all(j['status']=='completed' and j['conclusion']=='success' for j in jobs)
  for j in jobs:
   for name in ['Build weather_today.json and weather_week.json','Validate weather_today.json and weather_week.json','Commit updated weather']:
    assert any(s['name']==name and s['status']=='completed' and s['conclusion']=='success' for s in j['steps'])
  record['currentBatches']=[]
  for file in ['weather_today.json','weather_week.json']:
   item=get(repo+'/contents/'+file+'?ref='+main)
   if item.get('encoding')=='base64':b=base64.b64decode(item['content'])
   else:
    url=item['download_url'];parts=urllib.parse.urlsplit(url);assert parts.scheme=='https' and parts.hostname=='raw.githubusercontent.com'
    with urllib.request.build_opener(HttpsOnlyRedirect()).open(urllib.request.Request(url,headers={'User-Agent':'birdmap-independent-readonly'}),timeout=40) as r:b=r.read()
   assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==item['sha'];data=json.loads(b);sites=data.get('sites',{});assert len(sites)==190
   record['currentBatches'].append({'file':file,'sha256':hashlib.sha256(b).hexdigest(),'gitBlobMatches':True,'generatedAt':data.get('generatedAt'),'date':data.get('date'),'siteCount':len(sites),'validatorStatus':'Workflow real validate step success; no date override'})
  record['status']='PASS_WORKFLOW_SUCCESS'
 else:record['status']='PENDING_WORKFLOW'
except BaseException as e:record['status']='FAIL';record['errors'].append({'type':type(e).__name__,'httpCode':getattr(e,'code',None),'detailsRedacted':True})
with target.open('x',encoding='utf-8') as f:json.dump(record,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'status':record['status'],'run':record.get('run'),'main':record.get('main'),'pages':record.get('latestPages'),'batches':record.get('currentBatches'),'errors':record['errors']},ensure_ascii=False));sys.exit(1 if record['errors'] else 0)
