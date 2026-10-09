"""Independent actual weekly validator metadata contract. Synthetic one-site documents only."""
import sys,json,io,tempfile,contextlib,hashlib
from pathlib import Path
from unittest.mock import patch
repo=Path(sys.argv[1]); out=Path(sys.argv[2]);sys.path.insert(0,str(repo/'.github/scripts'))
import validate_weather_week as v
from site_data import load_runtime_sites
site=next(s for s in load_runtime_sites() if str(s['id'])=='15')
sample={'forecastTime':'2026-10-10 12:00 KST','windSpeed':3,'windDirectionDeg':0,'gust':5,'precipitation3h':0,'temperature':20,'visibilityKm':15,'cloudPct':20,'waveM':.3,'score':92,'grade':'★★★★★','scoreEligible':True,'missingScoreFields':[]}
base={'startDate':'2026-10-10','endDate':'2026-10-16','generatedAt':'2026-10-10 10:30 KST','forecastDayCount':7,'siteCount':1,'siteWithSamplesCount':1,'unavailableSiteCount':0,'sampleCount':1,'scoreEligibleSampleCount':1,'status':'ok','sites':{'15':{'days':{'2026-10-10':{'samples':[sample]}}}}}
cases=[('normal',{}),('generation_missing',{'generatedAt':'DELETE'}),('generation_null',{'generatedAt':None}),('generation_empty',{'generatedAt':''}),('generation_bad',{'generatedAt':'not-a-time'}),('generation_future',{'generatedAt':'2026-10-10 12:30 KST'}),('forecast_missing_zone',{'forecastTime':'2026-10-10 12:00'}),('forecast_bad_suffix',{'forecastTime':'2026-10-10 12:00 bananas'}),('forecast_minute60',{'forecastTime':'2026-10-10 12:60 KST'}),('site_unavailable_with_samples',{'dataUnavailable':True})]
rows=[]
with tempfile.TemporaryDirectory(dir=out,prefix='validator_c_') as temp:
 for label,change in cases:
  doc=json.loads(json.dumps(base))
  for key,value in change.items():
   if key=='generatedAt':
    if value=='DELETE':doc.pop(key)
    else:doc[key]=value
   elif key=='forecastTime':doc['sites']['15']['days']['2026-10-10']['samples'][0][key]=value
   elif key=='dataUnavailable':doc['sites']['15'][key]=value;doc['unavailableSiteCount']=1
  f=Path(temp)/'input.json';f.write_text(json.dumps(doc,ensure_ascii=False),encoding='utf-8')
  accepted=False;err=''
  try:
   with patch.object(v,'load_runtime_sites',return_value=[site]),contextlib.redirect_stdout(io.StringIO()):v.validate(f)
   accepted=True
  except Exception as ex:err=type(ex).__name__+': '+str(ex)
  rows.append({'id':label,'accepted':accepted,'error':err})
report={'head':'352315a57d038687807dbe0044c136a22fb0c9c5','mode':'Actual validate() and synthetic one-site docs; runtime list projection only, no guard patch. Future comparison diagnostic clock 2026-10-10 11:00KST; validator does not inspect publication clock.','sourceSHA256':hashlib.sha256((repo/'.github/scripts/validate_weather_week.py').read_bytes()).hexdigest(),'rows':rows}
(out/'c_week_validator_actual.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
