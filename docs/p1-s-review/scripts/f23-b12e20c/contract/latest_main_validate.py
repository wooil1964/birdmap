# Read-only latest main JSON and exact PR validators at the real current clock.
import sys,json,io,contextlib,hashlib
from pathlib import Path
from datetime import datetime
repo=Path(sys.argv[1]);out=Path(sys.argv[2]);sys.path.insert(0,str(repo/'.github/scripts'))
import update_weather as u
import validate_weather as daily_v
import validate_weather_week as week_v
start=datetime.now(u.KST);rows=[]
keys=['date','startDate','endDate','generatedAt','refreshedAt','updated','status','siteCount','scoreEligibleCount','sampleCount','scoreEligibleSampleCount']
for label,module,name in [('today',daily_v,'weather_today.json'),('week',week_v,'weather_week.json')]:
 p=repo/name;data=json.loads(p.read_text(encoding='utf-8'));accepted=False;error=None;log=io.StringIO()
 try:
  with contextlib.redirect_stdout(log):result=module.validate(p)
  accepted=True
 except Exception as e:error=type(e).__name__+': '+str(e)
 rows.append({'id':label,'accepted':accepted,'error':error,'metadata':{k:data[k] for k in keys if k in data},'fileSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'validatorSource':str(Path(module.__file__).resolve()),'validatorSourceSHA256':hashlib.sha256(Path(module.__file__).read_bytes()).hexdigest(),'runtimeSiteProjection':False,'clockPatched':False})
report={'head':'b12e20c1b6d856a021898a0c1c9221b30393a221','main':'bf74095adb3bf0b13f1aca31193c8d03cf8ff53f','combinedTree':'1065b16fcba94eeeb1a300d9b1e1953be9bfc65e','mode':'Exact new product validators on latest main files, actual datetime.now(KST), all190 runtime sites, no clock/runtime/source patch. Read-only; sanitized metadata and hashes only.','clockStart':start.isoformat(),'clockEnd':datetime.now(u.KST).isoformat(),'rows':rows}
(out/'latest_main_validator.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
assert all(r['accepted'] for r in rows)
