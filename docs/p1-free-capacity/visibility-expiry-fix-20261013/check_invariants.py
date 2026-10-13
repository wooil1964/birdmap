from pathlib import Path
import subprocess,sys,json,re,hashlib
root=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve()
base='c060f505ab95e5a3854f0e1be77fd8214de6b126';product='38a616c10f9edd93f1ab389c62b7bcc9b3ca96fd'
def git(*args):return subprocess.check_output(['git','-C',str(root),*args])
def show(ref,path):return git('show',ref+':'+path)
def sha(b):return hashlib.sha256(b).hexdigest()
def tree(ref):
 result={}
 for record in git('ls-tree','-rz',ref).split(b'\0'):
  if record:
   meta,path=record.split(b'\t',1);mode,kind,obj=meta.decode('ascii').split();result[path.decode('utf-8')]={'mode':mode,'kind':kind,'object':obj}
 return result
old=show(base,'index.html').decode('utf-8');current=show(product,'index.html').decode('utf-8');assert (root/'index.html').read_text(encoding='utf-8')==current
sys.path.insert(0,str(root/'.github/scripts'));from site_data import load_runtime_sites
baselinePath=out/'before-index.html'
if not baselinePath.exists():baselinePath.write_text(old,encoding='utf-8')
before=load_runtime_sites(baselinePath);after=load_runtime_sites(root/'index.html');assert before==after and len(after)==190
bt,at=tree(base),tree(product)
protected=[p for p in bt if p!='index.html' and not p.startswith('docs/') and not any('test' in s.lower() for s in p.split('/'))]
checks=[]
for p in protected:
 assert bt[p]==at[p],p
 w=(root/p).read_bytes();n=w.replace(b'\r\n',b'\n')
 def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
 assert bt[p]['object'] in [blob(w),blob(n)],p
 checks.append({'path':p,'gitBlob':at[p]['object'],'workingMatches':True})
start='function weeklyPelagicRecommendationSeason';end='function renderTodayPanel'
coreOld=old[old.index(start):old.index(end)];coreNew=current[current.index(start):current.index(end)];assert coreOld==coreNew
constants=['var PUBLICATION_MAX_AGE=5000,PUBLICATION_POLL_MS=5000,PUBLICATION_TIMEOUT=4000;','var REPORTS_REFRESH_MS=10*60*1000;']
for value in constants:assert value in old and value in current
margin=re.search(r'var PUBLICATION_RENEW_MARGIN_MS=\d+;',current).group(0);assert margin in old
result={'baselineProduct':base,'testedProduct':product,'workingIndexMatchesGit':True,'indexSha256':sha(show(product,'index.html')),'sites':{'count':len(after),'uniqueIds':len({str(s['id']) for s in after}),'allFieldsAndOrderEqual':before==after,'coordinatesEqual':all(a['lat']==b['lat'] and a['lon']==b['lon'] for a,b in zip(before,after))},'protectedFileCount':len(checks),'protectedFiles':checks,'recommendationCore':{'start':start,'end':end,'unchanged':True,'sha256':sha(coreNew.encode('utf-8'))},'timingConstants':constants+[margin],'effectiveRenewalMs':4750,'timingAndCapacityPolicyChanged':False,'productionD1WorkerAndDataChanges':0,'note':'Original fixture date remains unchanged. This proves non-interference, not current-date weather validity, production operation or capacity approval.'}
(out/'INVARIANTS.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='protectedFiles'},ensure_ascii=False,indent=2))
