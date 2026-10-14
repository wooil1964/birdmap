import concurrent.futures,subprocess,json,hashlib,os,re,datetime
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'docs/reporter-lifetime-stats/full-ab7';out.mkdir(exist_ok=True)
node='C:/Program Files/nodejs/node.exe';py='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
env=os.environ.copy();env.update(PYTHONUTF8='1',PYTHONIOENCODING='utf-8',PYTHONDONTWRITEBYTECODE='1',CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe',PUBLICATION_TEST_OUTPUT='docs/reporter-lifetime-stats/full-ab7/chrome',WRANGLER_SEND_METRICS='false');env['PATH']=str(Path(py).parent)+os.pathsep+env['PATH']
jobs=[('front',[node,'--test','--test-reporter=tap',*[str(p) for p in sorted((root/'.github/scripts').glob('test_*.mjs'))]],root),('api',[node,'--test','--test-reporter=tap'],root/'reports-api'),('proxy',[node,'--test','--test-reporter=tap',*[str(p) for p in sorted((root/'weather-proxy/test').glob('*.test.mjs'))]],root)]
jobs += [(n,[py,str(root/'.github/scripts'/f)],root) for n,f in [('weather','test_weather.py'),('time','test_validator_time_contract.py'),('tide','test_tide.py'),('share','test_share_pages.py')]]
jobs += [('chrome',[node,'docs/p1-publication-final-audit/browser/publication_chrome_final_r4.mjs'],root),('reporter-chrome',[node,'docs/reporter-lifetime-stats/browser/reporter_chrome.mjs'],root),('signatures',[node,'.github/scripts/publication_ci_signatures.mjs','.', 'HEAD','b12e20c1b6d856a021898a0c1c9221b30393a221'],root)]
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
def run(j):
 n,args,cwd=j;e=env.copy()
 if n=='reporter-chrome':e['PUBLICATION_TEST_OUTPUT']='docs/reporter-lifetime-stats/full-ab7/reporter-chrome'
 r=subprocess.run(args,cwd=cwd,env=e,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=600)
 (out/(n+'.log')).write_bytes(r.stdout)
 t=r.stdout.decode('utf-8',errors='replace');nodecounts={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|skipped) (\d+)$',t,re.M)}
 x={'name':n,'command':args,'cwd':str(cwd),'exit':r.returncode,'nodeCounts':nodecounts,'logSha256':hashlib.sha256(r.stdout).hexdigest()}
 print(json.dumps(x),flush=True);return x
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:results=list(ex.map(run,jobs))
(out/'MANIFEST.json').write_text(json.dumps({'sha':sha,'rows':results,'finished':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2),encoding='utf-8')
raise SystemExit(any(x['exit']!=0 for x in results))
