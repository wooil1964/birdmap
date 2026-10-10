# Actual Python parser/validator on JSON-transportable timestamp type diagnostics.
import sys,json,io,tempfile,contextlib
from pathlib import Path
from datetime import datetime
from unittest.mock import patch
repo=Path(sys.argv[1]);out=Path(sys.argv[2]);sys.path.insert(0,str(repo/'.github/scripts'))
import validate_weather_week as v
from site_data import load_runtime_sites
site=next(s for s in load_runtime_sites() if str(s['id'])=='15')
class Clock(datetime):
 @classmethod
 def now(cls,tz=None):
  a=datetime(2026,10,10,11,0,tzinfo=v.KST);return a.astimezone(tz) if tz else a.replace(tzinfo=None)
sample={'forecastTime':'2026-10-10 12:00 KST','windSpeed':3,'windDirectionDeg':0,'gust':5,'precipitation3h':0,'waveM':.3,'score':99,'grade':'★★★★★','scoreEligible':True,'missingScoreFields':[]}
base={'startDate':'2026-10-10','endDate':'2026-10-16','generatedAt':'2026-10-10 10:30 KST','forecastDayCount':7,'siteCount':1,'siteWithSamplesCount':1,'unavailableSiteCount':0,'sampleCount':1,'scoreEligibleSampleCount':1,'status':'ok','sites':{'15':{'days':{'2026-10-10':{'samples':[sample]}}}}}
cases=[('publication-array','generatedAt',['2026-10-10 10:30 KST']),('forecast-array','forecastTime',['2026-10-10 12:00 KST']),('publication-object','generatedAt',{'toString':'not-callable'}),('forecast-object','forecastTime',{'toString':'not-callable'})]
rows=[]
with tempfile.TemporaryDirectory(dir=out,prefix='timestamp_py_') as tmp:
 for label,key,value in cases:
  doc=json.loads(json.dumps(base))
  if key=='generatedAt':doc[key]=value
  else:doc['sites']['15']['days']['2026-10-10']['samples'][0][key]=value
  f=Path(tmp)/'input.json';f.write_text(json.dumps(doc),encoding='utf-8');accepted=False;error=None
  try:
   with patch.object(v,'load_runtime_sites',return_value=[site]),patch.object(v,'datetime',Clock),contextlib.redirect_stdout(io.StringIO()):v.validate(f)
   accepted=True
  except Exception as e:error=type(e).__name__+': '+str(e)
  rows.append({'id':label,'accepted':accepted,'error':error})
report={'head':'a35b8598d55890e705042e4d6f88621357749d09','clock':'2026-10-10 11:00 KST','mode':'Actual validator validate() with clock and single-site projection only, transported JSON timestamps.','rows':rows}
(out/'timestamp_type_python.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
assert not any(r['accepted'] for r in rows)
