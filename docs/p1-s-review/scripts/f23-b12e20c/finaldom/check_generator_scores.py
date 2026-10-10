import ast, hashlib, json, pathlib, sys
from typing import Any
archive=pathlib.Path(sys.argv[1]); output=pathlib.Path(sys.argv[2])
source=(archive/'.github/scripts/update_weather.py').read_text(encoding='utf-8')
tree=ast.parse(source); names={'apply_threshold_penalty','score_weather'}
selected=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names]
assert len(selected)==2
context={'Any':Any}; exec(compile(ast.Module(body=selected,type_ignores=[]),'<read-only-score-functions>','exec'),context)
config=json.loads((archive/'weather_rules.json').read_text(encoding='utf-8')); rule={**config['default'],**config['rules']['pelagic_seabird']}
rows=[]
for name,wind,wave,rain in [('wind6.01',6.01,.3,0),('wave.701',3,.701,0),('rain.001',3,.3,.001)]:
 score=context['score_weather']('pelagic_seabird',rule,wind,0,wind,rain,15,0,wave)
 rows.append({'name':name,'windSpeed':wind,'waveM':wave,'precipitation3h':rain,'actualGeneratorScore':score,'pelagicRecommendationSafety':wind<=6 and wave<=.7 and rain<=0})
result={'method':'AST-extracted actual pure score functions only; no generator/API execution','sourceSHA256':hashlib.sha256(source.encode()).hexdigest(),'rule':rule,'samples':rows,'pelagicBase':int(rule.get('baseScore',92)),'positiveBonusCondition':'only island_migrant','synthetic99GeneratedByThesePelagicInputs':False,'limitation':'This does not establish occurrence of the exact original99 fixture in operational forecasts. Current pelagic score formula starts92 and only subtracts; raw99 is synthetic contract input.'}
(output/'generator_pelagic_score_proof.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps({'scores':rows,'pelagicBase':result['pelagicBase']},ensure_ascii=False))
