from pathlib import Path
from datetime import datetime
from unittest.mock import patch
import copy,contextlib,io,json,subprocess,sys
root=Path(sys.argv[1]);out=Path(sys.argv[2]);sys.path.insert(0,str(root/'.github/scripts'))
import validate_weather as tv
import validate_weather_week as wv
from update_weather import KST
from site_data import load_runtime_sites
base=json.loads((root/'weather_today.json').read_text(encoding='utf-8'));weekly=json.loads((root/'weather_week.json').read_text(encoding='utf-8'))
evaluation=datetime.strptime(base['generatedAt'][:-4],'%Y-%m-%d %H:%M').replace(tzinfo=KST)
class Frozen(datetime):
 @classmethod
 def now(cls,tz=None):return evaluation.astimezone(tz) if tz else evaluation.replace(tzinfo=None)
sid=next(k for k,v in base['sites'].items() if v['scoreEligible']);site=next(s for s in load_runtime_sites() if str(s['id'])==sid)
rows=[];js_cases=[]
for id,mode,mutation in [('today-control','today','none'),('today-forecast-24','today','24'),('today-forecast-minute60','today','60'),('today-future-generation','today','future'),('today-wrong-forecast-date','today','wrongdate'),('week-control','week','none'),('week-short-minute-generation','week','short'),('week-future-generation','week','future')]:
 document=copy.deepcopy(base if mode=='today' else weekly)
 if mode=='today':
  if mutation=='24':document['sites'][sid]['forecastTime']=base['date']+' 24:00 KST'
  if mutation=='60':document['sites'][sid]['forecastTime']=base['date']+' 16:60 KST'
  if mutation=='wrongdate':document['sites'][sid]['forecastTime']='2026-10-11 16:00 KST'
  if mutation=='future':
   document['generatedAt']=base['date']+' 23:59 KST'
   for day in document['sites'].values():day['generatedAt']=document['generatedAt']
 else:
  if mutation=='short':document['generatedAt']=base['date']+' 16:6 KST'
  if mutation=='future':document['generatedAt']=base['date']+' 23:59 KST'
 path=out/(id+'-synthetic.json');path.write_text(json.dumps(document,ensure_ascii=False),encoding='utf-8')
 buf=io.StringIO();error=None;validator=tv if mode=='today' else wv
 try:
  with patch.object(validator,'datetime',Frozen),contextlib.redirect_stdout(buf):validator.validate(path)
 except Exception as e:error=type(e).__name__+': '+str(e)
 (out/(id+'.log')).write_text(buf.getvalue()+(error or 'PASS')+'\n',encoding='utf-8')
 text=document['sites'][sid]['forecastTime'] if mode=='today' and mutation!='future' else document['generatedAt']
 rows.append({'id':id,'mode':mode,'mutation':mutation,'pythonAccepted':error is None,'pythonError':error,'syntheticOnly':mutation!='none','inputShaProduct':'9b129940ae484f9f9f777eaecc1ce4473e840f05'})
 js_cases.append({'id':id,'mode':mode,'text':text,'root':{k:v for k,v in document.items() if k!='sites'},'day':document['sites'].get(sid) if mode=='today' else None,'site':site,'evaluation':evaluation.isoformat()})
casepath=out/'JS_TIME_CASES.json';casepath.write_text(json.dumps(js_cases,ensure_ascii=False),encoding='utf-8')
p=subprocess.run(['C:/Program Files/nodejs/node.exe',str(out/'actual_js_time_contract.mjs'),str(root),str(casepath)],capture_output=True,text=True,encoding='utf-8')
(out/'js-contract.log').write_text(p.stdout+p.stderr,encoding='utf-8');assert p.returncode==0,p.stderr
j={x['id']:x for x in json.loads(p.stdout)}
for row in rows:
 x=j[row['id']];row['jsTimestamp']=x['timestamp'];row['jsWeatherState']=x['weatherState']
 valid=x['weatherState']['scoreEligible'] if row['mode']=='today' else x['timestamp'] is not None and x['timestamp']<=evaluation.timestamp()*1000
 row['jsSourceAllowed']=valid;row['contractParity']=row['pythonAccepted']==valid
result={'evaluationKst':evaluation.isoformat(),'realFixtureBytesUnchanged':True,'syntheticMutationsOnlyInNewOutputFolder':True,'rows':rows,'summary':{'cases':len(rows),'contractMatch':sum(x['contractParity'] for x in rows),'contractMismatch':sum(not x['contractParity'] for x in rows)},'note':'Week JS check is strict generated timestamp/non-future only, not a full weekly validator. Today uses actual storedWeatherState.'}
(out/'TIME_CONTRACT_PARITY.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'summary':result['summary'],'rows':[{k:x[k] for k in ['id','pythonAccepted','pythonError','jsSourceAllowed','contractParity']} for x in rows]},ensure_ascii=False,indent=2))
