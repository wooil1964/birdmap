import json,subprocess,urllib.request,urllib.error,datetime,sys,pathlib,os
REPO='wooil1964/birdmap';REF='codex/pr16-current-security-recheck-20261014';SHA='c85bb595d224300c33738989c8bf1f1184ff50a6';ROOT=pathlib.Path.cwd()
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):raise RuntimeError('auth_redirect_forbidden')
def api(path,body=None):
 assert path.startswith('/repos/'+REPO+'/actions/')
 env=os.environ.copy();env.update(GIT_TERMINAL_PROMPT='0',GCM_INTERACTIVE='never')
 r=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',capture_output=True,text=True,encoding='utf-8',env=env,timeout=30);assert r.returncode==0
 values=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x);token=values.get('password');assert token
 if body is not None:assert path=='/repos/'+REPO+'/actions/workflows/publication-security-ci.yml/dispatches' and body=={'ref':REF}
 req=urllib.request.Request('https://api.github.com'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'birdmap-local-security-recheck'})
 with urllib.request.build_opener(NoRedirect()).open(req,timeout=45) as res:
  raw=res.read();return res.status,json.loads(raw) if raw else None
if __name__=='__main__':
 action=sys.argv[1];target=ROOT/'docs/pr16-current-security-recheck/ci-fresh';target.mkdir(exist_ok=True)
 if action=='dispatch':
  assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==SHA
  assert not (target/'DISPATCH.json').exists()
  status,_=api('/repos/'+REPO+'/actions/workflows/publication-security-ci.yml/dispatches',{'ref':REF});assert status==204
  record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'expectedSha':SHA,'ref':REF,'status':status,'scope':'Verification-only CI. No deployment, main write, operating D1 or real user data.','credentialsLogged':False};(target/'DISPATCH.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');print(json.dumps(record))
 elif action=='status':
  status,data=api('/repos/'+REPO+'/actions/workflows/publication-security-ci.yml/runs?branch='+REF+'&event=workflow_dispatch&per_page=5')
  runs=[x for x in data['workflow_runs'] if x['head_sha']==SHA]
  brief=[{k:x.get(k) for k in ['id','head_sha','status','conclusion','html_url','created_at','updated_at']} for x in runs];print(json.dumps(brief))
  (target/('STATUS_'+datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S')+'.json')).write_text(json.dumps({'runs':brief},indent=2),encoding='utf-8')
 else:raise RuntimeError('bad action')
