# Independent exact product weekly validator and typed sample cross-check.
import sys,json,io,tempfile,contextlib,hashlib
from pathlib import Path
from datetime import datetime
from unittest.mock import patch
repo=Path(sys.argv[1]);out=Path(sys.argv[2]);sys.path.insert(0,str(repo/'.github/scripts'))
import validate_weather_week as v
from site_data import load_runtime_sites
runtime=load_runtime_sites();site=next(s for s in runtime if str(s['id'])=='15')
class Clock(datetime):
 @classmethod
 def now(cls,tz=None):
  a=datetime(2026,10,10,11,0,tzinfo=v.KST)
  return a.astimezone(tz) if tz else a.replace(tzinfo=None)
sample={'forecastTime':'2026-10-10 12:00 KST','windSpeed':3,'windDirectionDeg':0,'gust':5,'precipitation3h':0,'temperature':20,'visibilityKm':15,'cloudPct':20,'waveM':.3,'score':92,'grade':'★★★★★','scoreEligible':True,'missingScoreFields':[]}
base={'startDate':'2026-10-10','endDate':'2026-10-16','generatedAt':'2026-10-10 10:30 KST','forecastDayCount':7,'siteCount':1,'siteWithSamplesCount':1,'unavailableSiteCount':0,'sampleCount':1,'scoreEligibleSampleCount':1,'status':'ok','sites':{'15':{'days':{'2026-10-10':{'samples':[sample]}}}}}
cases=[('normal',{}),('generation_missing',{'generatedAt':'DELETE'}),('generation_null',{'generatedAt':None}),('generation_empty',{'generatedAt':''}),('generation_bad',{'generatedAt':'not-a-time'}),('generation_future',{'generatedAt':'2026-10-10 12:30 KST'}),('forecast_missing_zone',{'forecastTime':'2026-10-10 12:00'}),('forecast_bad_suffix',{'forecastTime':'2026-10-10 12:00 bananas'}),('forecast_minute60',{'forecastTime':'2026-10-10 12:60 KST'}),('site_unavailable_with_samples',{'dataUnavailable':True})]
rows=[];typed=[]
with tempfile.TemporaryDirectory(dir=out,prefix='validator_final_') as tmp:
 def call(doc,runtime_site):
  f=Path(tmp)/'input.json';f.write_text(json.dumps(doc,ensure_ascii=False),encoding='utf-8')
  try:
   with patch.object(v,'load_runtime_sites',return_value=[runtime_site]),patch.object(v,'datetime',Clock),contextlib.redirect_stdout(io.StringIO()):v.validate(f)
   return True,''
  except Exception as ex:return False,type(ex).__name__+': '+str(ex)
 for label,change in cases:
  doc=json.loads(json.dumps(base))
  for key,value in change.items():
   if key=='generatedAt':
    if value=='DELETE':doc.pop(key)
    else:doc[key]=value
   elif key=='forecastTime':doc['sites']['15']['days']['2026-10-10']['samples'][0][key]=value
   elif key=='dataUnavailable':doc['sites']['15'][key]=value;doc['unavailableSiteCount']=1
  accepted,err=call(doc,site);want=label=='normal'
  rows.append({'id':label,'expectedAccepted':want,'accepted':accepted,'pass':accepted==want,'error':err})
 js=json.loads((out/'final_c1_c2_additional.json').read_text(encoding='utf-8'))
 for item in js['numeric']:
  sid=item['siteId'];rt=next((s for s in runtime if str(s['id'])==sid),None)
  if rt is None:
   rt=dict(next(s for s in runtime if str(s['id'])=='14'));rt.update(id=sid,island=False,pelagic=False,showWave=False,weatherRuleKey='general_birding')
  doc=json.loads(json.dumps(base));doc['sites']={sid:{'days':{'2026-10-10':{'samples':[item['sample']]}}}}
  doc['scoreEligibleSampleCount']=1 if item['sample']['scoreEligible'] is True else 0
  accepted,err=call(doc,rt)
  typed.append({'id':item['id'],'jsRecommendable':item['actualRecommendable'],'pythonStorageValid':accepted,'same':accepted==item['actualRecommendable'],'error':err})
 format_diag=[]
 for label,key,text in [('generated_ISO_KST','generatedAt','2026-10-10T10:30:00+09:00'),('generated_unpadded_KST','generatedAt','2026-10-10 9:30 KST'),('forecast_ISO_KST','forecastTime','2026-10-10T12:00:00+09:00'),('forecast_unpadded_KST','forecastTime','2026-10-10 12:0 KST')]:
  doc=json.loads(json.dumps(base))
  if key=='generatedAt':doc[key]=text
  else:doc['sites']['15']['days']['2026-10-10']['samples'][0][key]=text
  accepted,err=call(doc,site);format_diag.append({'id':label,'field':key,'value':text,'accepted':accepted,'error':err,'scope':'Parser input-set diagnostic; canonical generator emits padded KST. Not counted in C1/C2 core or numeric parity.'})
report={'head':'2e485079a34fa5aeeef09e82f3b996bf2696d978','before':'352315a57d038687807dbe0044c136a22fb0c9c5','clock':'2026-10-10 11:00 KST','mode':'Actual validate() controlled datetime.now and runtime site projection only. No validator/source guards patched.','sourceSHA256':hashlib.sha256((repo/'.github/scripts/validate_weather_week.py').read_bytes()).hexdigest(),'rows':rows,'passed':sum(r['pass'] for r in rows),'total':len(rows),'typed':typed,'typedSame':sum(r['same'] for r in typed),'typedTotal':len(typed),'formatDiagnostics':format_diag,'limits':['Storage validity and recommendation eligibility are distinct. This typed matrix uses eligible samples/contradictory false samples so equal outcomes are expected; well-formed ineligible stored samples are intentionally accepted by Python and excluded by JS.','ISO+09 acceptance in JS and canonical KST requirement in Python, plus strptime nonpadded acceptance, are diagnosed separately and do not alter normal generated records.']}
(out/'c_week_validator_actual.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'head':report['head'],'passed':report['passed'],'total':report['total'],'rows':rows,'typedSame':report['typedSame'],'typedTotal':report['typedTotal'],'mismatches':[r for r in typed if not r['same']],'formatDiagnostics':format_diag},ensure_ascii=False))
assert report['passed']==report['total'];assert report['typedSame']==report['typedTotal']

