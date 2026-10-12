import json,zipfile,hashlib,subprocess
from pathlib import Path
root=Path.cwd()
z=zipfile.ZipFile(root/'.tmp/protective-pages-b6/artifact-11757876081.zip')
names=z.namelist()
assert 'protected-baseline.json' in names
m=json.loads(z.read('protected-baseline.json'))
assert m['head']=='88262001d82643f809690349e2e0a997903a045b'
input_ref='88262001d82643f809690349e2e0a997903a045b'
checks=[]
for p,digest in m['files'].items():
    assert not Path(p).is_absolute() and '..' not in Path(p).parts
    actual=z.read(p)
    assert hashlib.sha256(actual).hexdigest()==digest,p
    git=subprocess.check_output(['git','show',input_ref+':'+p],cwd=root)
    assert actual==git,p
    checks.append(p)
assert z.read('index.html')==subprocess.check_output(['git','show','c025d75f964ab36f6f2eae541a99461f6de59b70:index.html'],cwd=root)
result={'artifactId':11757876081,'ciMergeSha':m['head'],'prHeadSha':'c025d75f964ab36f6f2eae541a99461f6de59b70','files':len(checks),'digestAndSourceBytesEqual':True,'indexSha256':m['files']['index.html'],'deployment':False,'role':'uploaded protective standby; no Pages rollback activated'}
(root/'docs/p1-publication-final-audit/operations/protected-pages-b6-verified.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))