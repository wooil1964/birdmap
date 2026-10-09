import contextlib, importlib, io, json, sys, tempfile
from datetime import datetime
from pathlib import Path
archive,out=Path(sys.argv[1]),Path(sys.argv[2]);sys.path.insert(0,str(archive/'.github/scripts'))
validator=importlib.import_module('validate_weather');week_validator=importlib.import_module('validate_weather_week')
class Clock(datetime):
 @classmethod
 def now(cls,tz=None):
  stamp=datetime.fromisoformat('2026-10-10T11:00:00+09:00')
  return stamp.astimezone(tz) if tz else stamp.replace(tzinfo=None)
validator.datetime=Clock;week_validator.datetime=Clock
runtime=importlib.import_module('site_data').load_runtime_sites()
def today(root,item):
 rows={str(s['id']):{'date':'2026-10-10','generatedAt':root,'forecastTime':'2026-10-10 12:00 KST','score':92,'grade':'★★★★★','scoreEligible':True,'missingScoreFields':[],'stale':False,'dataUnavailable':False,'wind':'북풍 3m/s','rain':'강수 없음','wave':'0.3m','waveLat':None,'waveLon':None} for s in runtime}
 rows['14']['generatedAt']=item
 return {'date':'2026-10-10','generatedAt':root,'updated':root,'siteCount':len(rows),'successCount':len(rows),'failedCount':0,'staleCount':0,'unavailableSiteCount':0,'scoreEligibleCount':len(rows),'status':'ok','sites':rows}
def run(name,module,data):
 with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',suffix='.json',delete=False) as f:json.dump(data,f);p=Path(f.name)
 try:
  with contextlib.redirect_stdout(io.StringIO()):module.validate(p)
  return {'scenario':name,'accepted':True}
 except Exception as e:return {'scenario':name,'accepted':False,'errorType':type(e).__name__,'reason':str(e)}
 finally:p.unlink()
rows=[run('today_normal_root_and_item1050',validator,today('2026-10-10 10:50 KST','2026-10-10 10:50 KST')),run('today_new_root1050_old_eligible_item1030',validator,today('2026-10-10 10:50 KST','2026-10-10 10:30 KST')),run('today_future_root_and_item1230_at1100',validator,today('2026-10-10 12:30 KST','2026-10-10 12:30 KST'))]
week=json.loads((archive/'weather_week.json').read_text(encoding='utf-8'));week['generatedAt']='2026-10-10 12:30 KST';rows.append(run('weekly_future_root1230_at1100',week_validator,week))
result={'head':'2e485079a34fa5aeeef09e82f3b996bf2696d978','clock':'2026-10-10 11:00 KST','actualValidators':True,'syntheticTodayIDs':len(runtime),'rows':rows,'coordinatesStored':False,'productChanges':0,'networkCalls':0,'notes':'Today batch is synthetic contract data, not a prediction or real report. Normal generator stamps current successful item and envelope at now; previous reuse explicitly sets stale=true/scoreEligible=false.'}
(out/'validator_batch_cases.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
