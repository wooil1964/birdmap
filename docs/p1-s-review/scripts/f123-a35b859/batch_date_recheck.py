# Exact final product builder/validator. Synthetic upstream only; operating JSON read-only.
import sys,json,io,contextlib,hashlib,tempfile
from pathlib import Path
from datetime import datetime,timedelta
from unittest.mock import patch
repo=Path(sys.argv[1]);out=Path(sys.argv[2]);sys.path.insert(0,str(repo/'.github/scripts'))
import update_weather as u
import validate_weather as vt
import validate_weather_week as vw
from site_data import load_runtime_sites
now=datetime.now(u.KST);assert now.date().isoformat()=='2026-10-10',str(now)
def frozen(at):
 class Clock(datetime):
  @classmethod
  def now(cls,tz=None):
   return at.astimezone(tz) if tz else at.replace(tzinfo=None)
 return Clock
def run(module,filename,at):
 before=hashlib.sha256(filename.read_bytes()).hexdigest()
 try:
  with patch.object(module,'datetime',frozen(at)),contextlib.redirect_stdout(io.StringIO()):
   data=module.validate(filename)
  accepted=True;error=''
 except Exception as e:
  accepted=False;error=type(e).__name__+': '+str(e);data=None
 assert hashlib.sha256(filename.read_bytes()).hexdigest()==before
 return {'accepted':accepted,'error':error,'evaluationKst':at.isoformat(),'inputSHA256':before,'dataUnmodified':True,'summary':{k:v for k,v in (data or {}).items() if k in ['date','generatedAt','startDate','endDate','status','siteCount','sampleCount','scoreEligibleCount','scoreEligibleSampleCount']}}
old=repo/'weather_today.json';old_week=repo/'weather_week.json'
published=json.loads(old.read_text(encoding='utf8'))['date'];assert published=='2026-10-09'
rows=[{'id':'old_today_current_date',**run(vt,old,now)},
 {'id':'old_today_actual_generation_date',**run(vt,old,datetime(2026,10,9,21,10,tzinfo=u.KST))},
 {'id':'old_week_current_date',**run(vw,old_week,now)}]
assert rows[0]['accepted'] is False and 'Batch date mismatch' in rows[0]['error']
assert rows[1]['accepted'] is True and rows[2]['accepted'] is True
start=now.replace(hour=0,minute=0,second=0,microsecond=0)
stamps=[(start+timedelta(hours=h)).timestamp()*1000 for h in range(0,168,3)]
n=len(stamps);atm={'ts':stamps,'wind_u-surface':[0]*n,'wind_v-surface':[-3]*n,'past3hprecip-surface':[0]*n,'temp-surface':[293.15]*n,'visibility-surface':[15000]*n,'lclouds-surface':[20]*n,'cloudUnit':'percent','visibilityUnit':'m'}
wave={'ts':stamps,'waves_height-surface':[.3]*n}
sites=load_runtime_sites();assert len(sites)==190
rules=json.loads((repo/'weather_rules.json').read_text(encoding='utf8'))
today_sites={str(s['id']):u.build_site_result(s,rules,atm,wave,None,now) for s in sites}
week_sites={str(s['id']):{'name':s['name'],'days':u.build_week_days(s,rules,atm,wave,now)} for s in sites}
date=now.date().isoformat();stamp=now.strftime('%Y-%m-%d %H:%M KST')
td={'date':date,'generatedAt':stamp,'refreshedAt':stamp,'updated':stamp,'source':'SYNTHETIC validation-only atmosphere and marine arrays','status':'ok','siteCount':190,'successCount':190,'failedCount':0,'staleCount':sum(bool(x.get('stale')) for x in today_sites.values()),'unavailableSiteCount':0,'scoreEligibleCount':sum(bool(x.get('scoreEligible')) for x in today_sites.values()),'sites':today_sites}
start_day,end_day=u.week_window(now);sample_count=sum(len(d['samples']) for s in week_sites.values() for d in s['days'].values())
wd={'startDate':start_day.isoformat(),'endDate':end_day.isoformat(),'generatedAt':stamp,'refreshedAt':stamp,'sampleIntervalHours':3,'forecastDayCount':u.WEEK_FORECAST_DAYS,'source':td['source'],'status':'ok','siteCount':190,'siteWithSamplesCount':190,'unavailableSiteCount':0,'sampleCount':sample_count,'scoreEligibleSampleCount':sum(bool(x.get('scoreEligible')) for s in week_sites.values() for d in s['days'].values() for x in d['samples']),'sites':week_sites}
assert all('waveLat' not in x and 'waveLon' not in x for x in td['sites'].values())
# Full synthetic batches remain temporary and never replace weather_today/week.
with tempfile.TemporaryDirectory(prefix='birdmap-review-current-',dir=out) as tmp:
 t=Path(tmp)/'synthetic_today.json';w=Path(tmp)/'synthetic_week.json'
 t.write_text(json.dumps(td,ensure_ascii=False),encoding='utf8');w.write_text(json.dumps(wd,ensure_ascii=False),encoding='utf8')
 rows.extend([{'id':'new_current_synthetic_today_builder190',**run(vt,t,now)},{'id':'new_current_synthetic_week_builder190',**run(vw,w,now)}])
assert rows[-1]['accepted'] and rows[-2]['accepted']
result={'head':'2e485079a34fa5aeeef09e82f3b996bf2696d978','clientCurrentDate':'2026-10-10','executionKst':now.isoformat(),'mode':'actual builder for all190 sites; synthetic upstream, no network/API key; clock injection only for explicit historical regression','rows':rows,'oldBatchDateProven':True,'datedCheckRemoved':False,'operatingJSONRewritten':False,'realWeatherClaimed':False,'coordinateValuesSaved':False,'sourceSHA256':{x:hashlib.sha256((repo/'.github/scripts'/x).read_bytes()).hexdigest() for x in ['update_weather.py','validate_weather.py','validate_weather_week.py']}}
(out/'batch_date_recheck.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,ensure_ascii=True))
