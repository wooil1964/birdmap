import base64,contextlib,datetime,hashlib,io,json,pathlib,subprocess,sys,tempfile,urllib.parse,urllib.request
ROOT=pathlib.Path.cwd();OUT=ROOT/'docs/reporter-lifetime-stats/operating-final';target=OUT/'CURRENT_BATCH_VALIDATORS.json';assert not target.exists();sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'.github/scripts'));sys.path.insert(0,'C:/Users/김진호/.codex/worktrees/p1-paid-deploy/birdmap/docs/p1-paid-deployment/cutover-20261014');from backup_readonly_dpapi import NoAuthRedirect,HttpsOnlyRedirect
import validate_weather,validate_weather_week
expected=json.loads((OUT/'WEATHER_PROGRESS_3.json').read_text(encoding='utf-8'));assert expected['status']=='PASS_WORKFLOW_SUCCESS';main=expected['main']['sha'];raw=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,encoding='utf-8',capture_output=True,check=True).stdout;token=dict(line.split('=',1) for line in raw.splitlines() if '=' in line)['password'];headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'birdmap-current-batch-validator-readonly'};receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceMain':main,'validatorCodeProduct':'ab7f0504aaf028dd01ffaf28abea0078875a9314','clock':'Actual current KST; datetime unmodified, no fixture date override','batchSource':'Exact Git blobs from successful real automatic workflow38495106285','rows':[],'errors':[],'operatingWrites':0,'productEdits':0,'rawPublicWeatherFilesCommitted':False}
try:
 with tempfile.TemporaryDirectory(prefix='birdmap-weather-validator-') as name:
  temp=pathlib.Path(name).resolve();assert temp.parent==pathlib.Path(tempfile.gettempdir()).resolve()
  for file,module in [('weather_today.json',validate_weather),('weather_week.json',validate_weather_week)]:
   with urllib.request.build_opener(NoAuthRedirect()).open(urllib.request.Request('https://api.github.com/repos/wooil1964/birdmap/contents/'+file+'?ref='+main,headers=headers),timeout=35) as r:item=json.load(r)
   if item.get('encoding')=='base64':b=base64.b64decode(item['content'])
   else:
    url=item['download_url'];p=urllib.parse.urlsplit(url);assert p.scheme=='https' and p.hostname=='raw.githubusercontent.com'
    with urllib.request.build_opener(HttpsOnlyRedirect()).open(urllib.request.Request(url,headers={'User-Agent':'birdmap-readonly'}),timeout=40) as r:b=r.read()
   assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==item['sha'];digest=hashlib.sha256(b).hexdigest();assert digest==next(x['sha256'] for x in expected['currentBatches'] if x['file']==file)
   path=temp/file;path.write_bytes(b)
   with contextlib.redirect_stdout(io.StringIO()):data=module.validate(path)
   sites=data['sites'];assert len(sites)==190
   receipt['rows'].append({'file':file,'status':'PASS','sha256':digest,'gitBlob':item['sha'],'generatedAt':data.get('generatedAt'),'date':data.get('date'),'siteCount':len(sites),'statusOfBatch':data.get('status'),'scoreEligibleCount':data.get('scoreEligibleCount'),'scoreEligibleSampleCount':data.get('scoreEligibleSampleCount'),'sampleCount':data.get('sampleCount'),'sourceSHA256MatchesActualMain':True,'actualValidatorFunction':module.__name__+'.validate(path)','codeSHA256':hashlib.sha256(pathlib.Path(module.__file__).read_bytes()).hexdigest()})
 receipt['status']='PASS'
except BaseException as e:receipt['status']='FAIL';receipt['errors'].append({'type':type(e).__name__,'detailsRedacted':True,'httpCode':getattr(e,'code',None)})
receipt['summary']={'pass':sum(x['status']=='PASS' for x in receipt['rows']),'fail':len(receipt['errors']),'skip':0}
with target.open('x',encoding='utf-8') as f:json.dump(receipt,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'status':receipt['status'],'summary':receipt['summary'],'sourceMain':main,'rows':receipt['rows'],'errors':receipt['errors']},ensure_ascii=False));sys.exit(1 if receipt['errors'] else 0)
