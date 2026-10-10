import sys,json,io,contextlib,copy,hashlib,tempfile
from pathlib import Path
from datetime import datetime
from unittest.mock import patch
repo,out=Path(sys.argv[1]),Path(sys.argv[2]);sys.path.insert(0,str(repo/'.github/scripts'))
import validate_weather as v
from update_weather import KST
specs=json.loads((Path(__file__).parent/'difference_specs.json').read_text(encoding='utf8'));base=json.loads((out/'normal_current_builder_today.json').read_text(encoding='utf8'));assert len(base['sites'])==190
class Clock(datetime):
 @classmethod
 def now(cls,tz=None):
  at=datetime(2026,10,10,11,0,tzinfo=KST);return at.astimezone(tz) if tz else at.replace(tzinfo=None)
rows=[]
for spec in specs:
 doc=copy.deepcopy(base);doc['generatedAt']=spec['root'];doc['updated']=spec['root']
 for item in doc['sites'].values():item['generatedAt']=spec['item']
 accepted=False;error=None
 with tempfile.TemporaryDirectory(dir=out,prefix='difference_py_') as tmp:
  p=Path(tmp)/'input.json';p.write_text(json.dumps(doc,ensure_ascii=False),encoding='utf8')
  try:
   with patch.object(v,'datetime',Clock),contextlib.redirect_stdout(io.StringIO()):result=v.validate(p)
   accepted=True
  except Exception as e:error=type(e).__name__+': '+str(e)
  rows.append({**spec,'accepted':accepted,'error':error,'inputIDs':190,'runtimeSiteProjection':False,'inputSHA256':hashlib.sha256(p.read_bytes()).hexdigest()})
report={'head':'b12e20c1b6d856a021898a0c1c9221b30393a221','clock':'2026-10-10 11:00 KST','mode':'Diagnostic observation, no safety assertion removed; actual full190 validator on actual-builder synthetic base.','sourceSHA256':hashlib.sha256(Path(v.__file__).read_bytes()).hexdigest(),'rows':rows}
(out/'python_contract_differences.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(report,ensure_ascii=False))