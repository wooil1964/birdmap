import sys, json, math, io, contextlib, copy, tempfile, hashlib
from pathlib import Path
from datetime import datetime
repo=Path(sys.argv[1]).resolve(); out=Path(sys.argv[2]).resolve()
sys.path.insert(0,str(repo/'.github/scripts'))
import update_weather as uw
import validate_weather as validator
baseline=json.loads((repo/'weather_today.json').read_text(encoding='utf-8'))
clock=datetime.fromisoformat(baseline['date']+'T12:00:00+09:00')
class FrozenDate(datetime):
    @classmethod
    def now(cls,tz=None): return clock.astimezone(tz) if tz else clock.replace(tzinfo=None)
validator.datetime=FrozenDate
runtime=uw.load_sites() if hasattr(uw,'load_sites') else validator.load_runtime_sites()
site=next(s for s in runtime if not (s.get('showWave') or s.get('island') or s.get('pelagic')) and baseline['sites'][str(s['id'])]['scoreEligible'])
site_id=str(site['id'])
def actual_validator(document):
    with tempfile.TemporaryDirectory(prefix='birdmap-r5-') as tmp:
        fixture=Path(tmp)/'weather.json'; fixture.write_text(json.dumps(document,ensure_ascii=False),encoding='utf-8')
        try:
            with contextlib.redirect_stdout(io.StringIO()): validator.validate(fixture)
            return True
        except AssertionError: return False
variants=[('normal',{}),('extreme_wind',{'wind':'북풍 '+'9'*400+'m/s'}),('extreme_rain',{'rain':'3시간 강수 '+'9'*400+'mm'}),('extreme_wave',{'wave':'9'*400+'m'}),('trim',{'wind':' 북풍 3m/s ','rain':' 강수 없음 '}),('unicode_digits',{'wind':'북풍 ٣m/s'})]
rows=[]
for label,fields in variants:
    document=copy.deepcopy(baseline);document['sites'][site_id].update(fields)
    rows.append({'label':label,'acceptedByActualValidator':actual_validator(document)})
raw_overflow='9'*400
finite_sources={'valueAtRejects400DigitInput':uw.value_at({'wind_u-surface':[raw_overflow]},'wind_u-surface',0) is None,'hourlyValueRejects400DigitInput':uw.hourly_value({'wind_speed_10m':[raw_overflow]},'wind_speed_10m',0) is None,'parsed400DigitsFinite':math.isfinite(float(raw_overflow))}
atmospheric={'ts':[clock.timestamp()*1000],'wind_u-surface':[1.7e308],'wind_v-surface':[1.7e308],'past3hprecip-surface':[0.0],'temp-surface':[20],'gust-surface':[3.0]}
rules=json.loads((repo/'weather_rules.json').read_text(encoding='utf-8'))
computed=uw.build_site_result(site,rules,atmospheric,None,None,clock)
document=copy.deepcopy(baseline); document['sites'][site_id]=computed
# Totals are unaffected because this chosen original entry and the synthetic replacement are eligible/current/available.
overflow={'finiteInputsHypotNotFinite':not math.isfinite(math.hypot(1.7e308,1.7e308)),'generatorOutputsInfString':'inf' in computed['wind'],'scoreEligible':computed['scoreEligible'],'validatorAllowsGeneratedOverflow':actual_validator(document)}
source_hashes={f:hashlib.sha256((repo/f).read_text(encoding='utf-8').replace('\r\n','\n').encode()).hexdigest() for f in ['.github/scripts/update_weather.py','.github/scripts/validate_weather.py']}
result={'sha':'8ccb248faa2c5c7b5a6019d12e19e21031169460','batchDate':baseline['date'],'testClock':clock.isoformat(),'sourceHashes':source_hashes,'actualValidatorRows':rows,'actualGeneratorFiniteSourceChecks':finite_sources,'actualGeneratorHypotOverflow':overflow,'networkCalls':0,'productChanges':0,'rawCoordinatesLogged':False}
(out/'r5_python.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
