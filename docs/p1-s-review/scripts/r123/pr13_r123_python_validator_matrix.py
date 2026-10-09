"""Analysis only: current Python weather validator acceptance matrix (no repo writes)."""
import contextlib, io, json, sys, tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
REPO=Path(sys.argv[1]); OUT=Path(sys.argv[2])
sys.path.insert(0,str(REPO/'.github/scripts'))
import validate_weather as today_validator
import validate_weather_week as week_validator
from update_weather import KST
FIXED_NOW="2026-10-08T22:40:00+09:00"
DAY="2026-10-08"
class FixedDateTime(datetime):
 @classmethod
 def now(cls,tz=None):
  result=datetime.fromisoformat(FIXED_NOW)
  return result.astimezone(tz) if tz else result.replace(tzinfo=None)
SITE={"id":"501","name":"Synthetic inland", "showWave":False,"island":False,"pelagic":False}
CASES=[("zero",{"score":0}),("hundred",{"score":100}),("float",{"score":92.5}),
 ("null",{"score":None}),("missing_score",{"__delete__":"score"}),("NaN",{"score":float("nan")}),
 ("Infinity",{"score":float("inf")}),("-Infinity",{"score":float("-inf")}),("empty",{"score":""}),
 ("numeric_string",{"score":"92"}),("negative",{"score":-1}),("above100",{"score":101}),
 ("boolean_true",{"score":True}),("boolean_false",{"score":False}),
 ("eligible_false_score92",{"scoreEligible":False}),("eligible_missing",{"__delete__":"scoreEligible"}),
 ("eligible_null",{"scoreEligible":None}),("eligible_one",{"scoreEligible":1}),
 ("eligible_string",{"scoreEligible":"true"}),("eligible_float",{"scoreEligible":0.5}),("missing_reason_null",{"missingScoreFields":None}),("missing_reason_absent",{"__delete__":"missingScoreFields"}),("missing_reason",{"missingScoreFields":["precipitation"]}),
 ("required_wind_null",{"windSpeed":None,"wind":None}),("required_rain_null",{"precipitation3h":None,"rain":None}),
 ("required_direction_null",{"windDirectionDeg":None}),("wave_required_null",{"waveM":None,"wave":None,"__wave_required__":True}),
 ("valid_ineligible_null",{"score":None,"scoreEligible":False,"grade":"","missingScoreFields":["precipitation"],"precipitation3h":None,"rain":None})]
CASES += [("optional_wave_string", {"waveM":"0.3"}), ("optional_wave_negative", {"waveM":-1}), ("optional_wave_NaN", {"waveM":float("nan")})]
BASE_WEEK={"forecastTime":DAY+" 12:00 KST","windSpeed":3,"windDirectionDeg":0,"precipitation3h":0,"waveM":.3,
 "score":92,"grade":"★★★★★","scoreEligible":True,"missingScoreFields":[]}
BASE_TODAY={"name":SITE["name"],"date":DAY,"forecastTime":DAY+" 12:00 KST","generatedAt":DAY+" 12:00 KST",
 "stale":False,"dataUnavailable":False,"score":92,"grade":"★★★★★","scoreEligible":True,"missingScoreFields":[],
 "wind":"북풍 3m/s","rain":"강수 없음","wave":"0.3m","waveLat":None,"waveLon":None}
CASES += [
 ("formatted_normal", {"wind":"북동풍 3.6m/s","rain":"3시간 강수 0.5mm","wave":"0.7m"}),
 ("formatted_trim", {"wind":" 북풍 3m/s ","rain":" 강수 없음 ","wave":" 0.3m "}),
 ("formatted_unicode", {"wind":"북풍 ٣m/s","rain":"3시간 강수 ٠mm","wave":"٠.٣m"}),
 ("formatted_extreme_wind", {"wind":"북풍 "+"9"*400+"m/s"}),
 ("formatted_extreme_rain", {"rain":"3시간 강수 "+"9"*400+"mm"}),
 ("formatted_extreme_wave", {"wave":"9"*400+"m"}),
 ("formatted_finite_large", {"wind":"북풍 10000m/s"}),
 ("wind_speed_missing", {"wind":"북풍"}),
 ("wind_direction_missing", {"wind":"3m/s"}),
 ("wave_optional_null", {"wave":None}),
 ("wave_optional_absent", {"__delete__":"wave"}),
 ("wave_optional_number", {"wave":0.3}),
 ("wave_optional_empty", {"wave":""}),
 ("wave_optional_negative", {"wave":"-0.3m"}),
 ("week_optional_wave_absent", {"__delete__":"waveM"}),
 ("wind_trailing_newline", {"wind":"북풍 3m/s\n"}),
 ("wind_form_feed", {"wind":"북풍\f3m/s"}),
 ("rain_trailing_newline", {"rain":"강수 없음\n"})]
rows=[]
with tempfile.TemporaryDirectory(prefix="birdmap_p1s2_",dir=OUT) as tmp:
 for name,fields in CASES:
  per={"case":name,"baseNominalRecommendationCase":name in ("zero","hundred","float")}
  for route,validator,base in [("weekly",week_validator,BASE_WEEK),("today",today_validator,BASE_TODAY)]:
   entry=dict(base)
   entry.update({k:v for k,v in fields.items() if not k.startswith("__")})
   if "__delete__" in fields: entry.pop(fields["__delete__"],None)
   if route=="weekly":
    document={"startDate":DAY,"endDate":DAY,"forecastDayCount":7,"siteCount":1,"siteWithSamplesCount":1,
     "unavailableSiteCount":0,"sampleCount":1,"scoreEligibleSampleCount":int(bool(entry.get("scoreEligible"))),
     "status":"ok","sites":{"501":{"days":{DAY:{"samples":[entry]}}}}}
   else:
    document={"date":DAY,"siteCount":1,"successCount":1,"failedCount":0,"staleCount":0,
      "unavailableSiteCount":0,"scoreEligibleCount":int(bool(entry.get("scoreEligible"))),"status":"ok","sites":{"501":entry}}
   f=Path(tmp)/(route+".json");f.write_text(json.dumps(document,ensure_ascii=False),encoding="utf-8")
   runtime=dict(SITE,showWave=fields.get("__wave_required__",False))
   accepted=False;message=""
   try:
    with patch.object(validator,"load_runtime_sites",return_value=[runtime]), patch.object(validator,"datetime",FixedDateTime),contextlib.redirect_stdout(io.StringIO()):
     validator.validate(f)
    accepted=True
   except Exception as ex: message=type(ex).__name__+": "+str(ex)
   per[route]={"documentAccepted":accepted,"message":message}
  rows.append(per)
result={"head":"1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c","baselineFixtureCorrection":"old optional base wave .3m normalized to generator canonical 0.3m; algorithm unchanged", "scope":"Synthetic one-site temporary JSON; production file/DB/Worker untouched. Validator document acceptance is distinct from recommendation eligibility.",
 "sourceDate":DAY,"fixedEvaluationTime":FIXED_NOW,"rows":rows,"pythonNumericPredicate":{"boolRejected":not today_validator.finite_number(True),
 "numberStringRejected":not today_validator.finite_number("92"),"floatAccepted":today_validator.finite_number(92.5)}}
(OUT/"pr13_r123_python_validator_matrix.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"cases":len(rows),"todayAccepted":sum(x["today"]["documentAccepted"] for x in rows),
 "weekAccepted":sum(x["weekly"]["documentAccepted"] for x in rows),"rows":rows},ensure_ascii=False))
