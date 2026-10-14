import sys,json,importlib.util
from pathlib import Path
sys.path.insert(0,'.github/scripts')
spec=importlib.util.spec_from_file_location('weather_model','.github/scripts/update_weather.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
rules=json.loads(Path('weather_rules.json').read_text(encoding='utf8'));out=[]
for key in rules['rules']:
 rule={**rules['default'],**rules['rules'][key]}
 for speed in [0,3,6,9,12]:
  for direction in [0,45,90,135,180,225,270,315]:
   for rain in [0,.9,1,1.1,2,3]:
    score=mod.score_weather(key,rule,speed,direction,5,rain,20,20,.5)
    out.append({'rule':key,'speedMps':speed,'fromDeg':direction,'precipitation3h':rain,'score':score})
p=Path('docs/issue9-weather-migration-research-20261014')
(p/'SCORING_SENSITIVITY.json').write_text(json.dumps({'kind':'Synthetic inputs through unchanged actual Python score_weather. No ecological alternative weights or probabilities. Not historical observed performance.','rows':out},indent=2)+'\n',encoding='utf8')
print('synthetic function calls',len(out))
print('calm direction counterexample',[(x['fromDeg'],x['score']) for x in out if x['rule']=='island_migrant' and x['speedMps']==0 and x['precipitation3h']==0])
