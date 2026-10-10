import sys,json,io,contextlib,copy,hashlib,tempfile
from pathlib import Path
from datetime import datetime,timedelta
from unittest.mock import patch
repo,out=Path(sys.argv[1]),Path(sys.argv[2]);sys.path.insert(0,str(repo/'.github/scripts'))
import update_weather as u,validate_weather as vt,validate_weather_week as vw
from site_data import load_runtime_sites
HEAD='a35b8598d55890e705042e4d6f88621357749d09';DAY='2026-10-10';STAMP=DAY+' 10:50 KST';at=datetime(2026,10,10,11,0,tzinfo=u.KST);sites=load_runtime_sites();assert len(sites)==190
class Clock(datetime):
 @classmethod
 def now(cls,tz=None):return at.astimezone(tz) if tz else at.replace(tzinfo=None)
def validate(module,doc,clock=at):
 with tempfile.TemporaryDirectory(dir=out,prefix='validator_input_') as tmp:
  p=Path(tmp)/'input.json';p.write_text(json.dumps(doc,ensure_ascii=False),encoding='utf8')
  accepted=False;error=None
  try:
   with patch.object(module,'datetime',Clock),contextlib.redirect_stdout(io.StringIO()):module.validate(p)
   accepted=True
  except Exception as e:error=type(e).__name__+': '+str(e)
  return {'accepted':accepted,'error':error}
def doc():
 rows={str(s['id']):{'date':DAY,'generatedAt':STAMP,'forecastTime':DAY+' 12:00 KST','score':92,'grade':'★★★★★','scoreEligible':True,'missingScoreFields':[],'stale':False,'dataUnavailable':False,'wind':'북풍 3m/s','rain':'강수 없음','wave':'0.3m','waveLat':None,'waveLon':None} for s in sites}
 return {'date':DAY,'generatedAt':STAMP,'updated':STAMP,'siteCount':190,'successCount':190,'failedCount':0,'staleCount':0,'unavailableSiteCount':0,'scoreEligibleCount':190,'status':'ok','sites':rows}
values=[('normal',STAMP),('old',DAY+' 10:30 KST'),('new',DAY+' 10:55 KST'),('missing','ABSENT'),('null',None),('empty',''),('array',[STAMP]),('object',{'toString':'not-callable'}),('number',1791601200000),('boolean',True)]
f2=[]
for side in ('root','item'):
 for label,value in values:
  data=doc();target=data if side=='root' else data['sites']['14']
  if label=='missing':target.pop('generatedAt')
  else:target['generatedAt']=value
  result=validate(vt,data);f2.append({'id':'F2-'+side+'-'+label,'raw':value,'runtimeSiteProjection':False,'ids':190,'expectedAccepted':label=='normal',**result,'pass':result['accepted']==(label=='normal')})
# Run real process_site + build_site_result + main envelope / stale reuse, with providers replaced by memory arrays.
start=datetime(2026,10,10,tzinfo=u.KST);stamps=[(start+timedelta(hours=h)).timestamp()*1000 for h in range(0,168,3)];n=len(stamps)
atm={'ts':stamps,'wind_u-surface':[0]*n,'wind_v-surface':[-3]*n,'past3hprecip-surface':[0]*n,'temp-surface':[293.15]*n,'visibility-surface':[15000]*n,'lclouds-surface':[20]*n,'cloudUnit':'percent','visibilityUnit':'m'};wave={'ts':stamps,'waves_height-surface':[.3]*n}
def provider(key,lat,lon,parameters,model):return copy.deepcopy(wave if parameters==['waves'] else atm)
real_process=u.process_site
builder=[]
for mode,time_text in [('normal','10:50'),('stale_reuse','10:55')]:
 at=datetime.fromisoformat(DAY+'T'+time_text+':00+09:00');normal_path=out/'normal_current_builder_today.json';today_path=normal_path if mode=='normal' else out/'stale_current_builder_today.json';week_path=out/('normal_current_builder_week.json' if mode=='normal' else 'stale_current_builder_week.json');previous={} if mode=='normal' else json.loads(normal_path.read_text(encoding='utf8'))['sites']
 def process(*args,**kwargs):
  if mode=='stale_reuse' and str(args[1]['id'])=='14':raise RuntimeError('synthetic provider failure')
  return real_process(*args,**kwargs)
 with patch.object(u,'datetime',Clock),patch.object(u,'request_forecast',side_effect=provider),patch.object(u,'wave_coordinate_candidates',return_value=[(0.0,0.0,'synthetic')]),patch.object(u,'process_site',side_effect=process),patch.object(u,'load_previous_sites',return_value=previous),patch.object(u,'OUTPUT_PATH',today_path),patch.object(u,'WEEK_OUTPUT_PATH',week_path),patch.dict(u.os.environ,{'WINDY_API_KEY':'synthetic-validation-only'}),contextlib.redirect_stdout(io.StringIO()):u.main()
 data=json.loads(today_path.read_text(encoding='utf8'));week=json.loads(week_path.read_text(encoding='utf8'));valid_t=validate(vt,data);valid_w=validate(vw,week);item=data['sites']['14']
 builder.append({'mode':mode,'rootGeneratedAt':data['generatedAt'],'itemGeneratedAt':item['generatedAt'],'itemStale':item['stale'],'itemEligible':item['scoreEligible'],'rootItemSameCount':sum(v.get('generatedAt')==data['generatedAt'] for v in data['sites'].values()),'eligibleItemSameCount':sum(v.get('generatedAt')==data['generatedAt'] for v in data['sites'].values() if v['scoreEligible']),'eligibleCount':data['scoreEligibleCount'],'todayValidation':valid_t,'weekValidation':valid_w,'originalCoordinatesStored':False,'actualProcessSite':True,'actualMainEnvelope':True,'actualReuseBranch':mode=='stale_reuse'})

at=datetime(2026,10,10,11,0,tzinfo=u.KST)
# Actual full190 week validator. Every timestamp type is roundtripped in JSON; no single-site projection.
base=json.loads((out/'normal_current_builder_week.json').read_text(encoding='utf8'));base['generatedAt']=DAY+' 10:30 KST'
week_types=[('string',DAY+' 12:00 KST'),('array',[DAY+' 12:00 KST']),('object',{'toString':'not-callable'}),('number',1791601200000),('boolean',True),('null',None),('ISO',DAY+'T12:00:00+09:00')]
f3=[]
for field in ('publication','forecast'):
 for label,value in week_types:
  data=copy.deepcopy(base)
  if field=='publication':data['generatedAt']=value.replace('12:00','10:30') if isinstance(value,str) else value
  else:
   first=next(sample for sample in data['sites']['14']['days'][DAY]['samples'] if sample['forecastTime']==DAY+' 12:00 KST');first['forecastTime']=value
  result=validate(vw,data);f3.append({'id':'F3-week-'+field+'-'+label,'value':value,'expectedAccepted':label=='string',**result,'pass':result['accepted']==(label=='string'),'ISOAllowsetSeparate':label=='ISO'})
for field in ('publication-root','publication-item','forecast'):
 for label,value in week_types:
  data=doc();target=data if field=='publication-root' else data['sites']['14'];key='forecastTime' if field=='forecast' else 'generatedAt';target[key]=value.replace('12:00','10:50') if key=='generatedAt' and isinstance(value,str) else value
  result=validate(vt,data);expected=label=='string' or (field=='forecast' and label=='ISO');f3.append({'id':'F3-today-'+field+'-'+label,'value':value,'expectedAccepted':expected,**result,'pass':result['accepted']==expected,'ISOAllowsetSeparate':label=='ISO'})
report={'head':HEAD,'sourceSHA256':{f:hashlib.sha256((repo/'.github/scripts'/f).read_bytes()).hexdigest() for f in ['update_weather.py','validate_weather.py','validate_weather_week.py']},'f2':{'cases':len(f2),'pass':sum(r['pass'] for r in f2),'rows':f2},'f3':{'cases':len(f3),'pass':sum(r['pass'] for r in f3),'rows':f3},'builder':builder,'notes':['Clock is fixed for explicit synthetic contract tests. Runtime contains all190 IDs; no runtime projection.','Providers are in-memory synthetic arrays; wave candidate coordinates are synthetic zeros. All result writes remain in designated visualization directory.','Actual main date/stale accounting and actual validators execute without product guard patches.','Python ISO acceptance difference is separate from raw-type contracts. Today malformed forecast may fail via TypeError/AttributeError; rejection is preserved, not counted as UI TypeError.']}
(out/'python_contract.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'f2':{'cases':len(f2),'pass':report['f2']['pass']},'f3':{'cases':len(f3),'pass':report['f3']['pass'],'mismatches':[r for r in f3 if not r['pass']]},'builder':builder},ensure_ascii=False));assert all(r['pass'] for r in f2)
assert all(x['todayValidation']['accepted'] and x['weekValidation']['accepted'] for x in builder)
