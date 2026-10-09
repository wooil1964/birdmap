# Exact product builder + validator, synthetic sparse 6h atmosphere. No network.
import sys,json,io,contextlib
from pathlib import Path
from datetime import datetime
from unittest.mock import patch
repo=Path(sys.argv[1]); out=Path(sys.argv[2]); sys.path.insert(0,str(repo/'.github/scripts'))
import update_weather as u
import validate_weather as v
from site_data import load_runtime_sites
site=next(s for s in load_runtime_sites() if str(s['id'])=='14')
target=datetime(2026,10,10,6,10,tzinfo=u.KST)
stamps=[datetime(2026,10,10,h,tzinfo=u.KST).timestamp()*1000 for h in (12,18)]
at={'ts':stamps,'wind_u-surface':[0,0],'wind_v-surface':[-3,-3],'past3hprecip-surface':[0,0], 'temp-surface':[293.15,293.15], 'visibility-surface':[15000,15000], 'lclouds-surface':[20,20], 'cloudUnit':'percent', 'visibilityUnit':'m'}
rules=json.loads((repo/'weather_rules.json').read_text(encoding='utf-8'))
result=u.build_site_result(site,rules,at,None,None,target)
doc={'date':'2026-10-10','siteCount':1,'successCount':1,'failedCount':0,'staleCount':0,'unavailableSiteCount':0,'scoreEligibleCount':1,'status':'ok','sites':{'14':result}}
f=out/'sparse6h_generated_today.json'; f.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
class Clock(datetime):
 @classmethod
 def now(cls,tz=None):
  a=datetime(2026,10,10,11,0,tzinfo=u.KST)
  return a.astimezone(tz) if tz else a.replace(tzinfo=None)
accepted=False;err=''
try:
 with patch.object(v,'load_runtime_sites',return_value=[site]),patch.object(v,'datetime',Clock),contextlib.redirect_stdout(io.StringIO()):v.validate(f)
 accepted=True
except Exception as ex:err=repr(ex)
summary={'mode':'actual build_site_result and validate; sparse synthetic 6h forecast array, queued/delayed early run target 06:10; not an observed API event','target':target.isoformat(),'spacingHours':6,'raw':result,'validatorAccepted':accepted,'validatorError':err}
(out/'sparse6h_generator_proof.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
