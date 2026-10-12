import json,zipfile,hashlib,subprocess
from pathlib import Path
root=Path.cwd()
z=zipfile.ZipFile(root/'.tmp/protective-pages/artifact-11741316486.zip')
names=z.namelist()
assert 'protected-baseline.json' in names
m=json.loads(z.read('protected-baseline.json'))
assert m['head']=='7b136fc73f81366de14ba88d90020104ce3b8c65'
input_ref='6d0f435b89f11a28ec0bef3c258fa141e4161e47'
checks=[]
for p,digest in m['files'].items():
    assert not Path(p).is_absolute() and '..' not in Path(p).parts
    actual=z.read(p)
    assert hashlib.sha256(actual).hexdigest()==digest,p
    git=subprocess.check_output(['git','show',input_ref+':'+p],cwd=root)
    assert actual==git,p
    checks.append(p)
result={'artifactId':11741316486,'ciMergeSha':m['head'],'prHeadSha':input_ref,'files':len(checks),'digestAndSourceBytesEqual':True,'indexSha256':m['files']['index.html'],'deployment':False,'role':'uploaded protective standby; no Pages rollback activated'}
(root/'docs/p1-publication-final-audit/operations/protected-pages-verified.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))