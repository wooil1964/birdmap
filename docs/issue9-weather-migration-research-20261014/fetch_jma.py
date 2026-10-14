import io,json,zipfile,hashlib,urllib.request,datetime
from pathlib import Path
p=Path('docs/issue9-weather-migration-research-20261014')
url='https://www.jma.go.jp/jma/jma-eng/jma-center/rsmc-hp-pub-eg/Besttracks/bst_all.zip'
b=urllib.request.urlopen(url,timeout=30).read();z=zipfile.ZipFile(io.BytesIO(b));raw=z.read(z.namelist()[0]).decode('ascii');lines=raw.splitlines();out=[];i=0
while i<len(lines):
 h=lines[i];assert h.startswith('66666');n=int(h[12:15]);block=lines[i+1:i+1+n];i+=1+n
 if h[6:10] not in ['1411','1515']:continue
 assert len(block)==n
 rows=[]
 for l in block:
  yy=int(l[:2]);year=2000+yy if yy<50 else 1900+yy
  dt=datetime.datetime(year,int(l[2:4]),int(l[4:6]),int(l[6:8]),tzinfo=datetime.timezone.utc)
  rows.append({'utc':dt.isoformat().replace('+00:00','Z'),'kst':dt.astimezone(datetime.timezone(datetime.timedelta(hours=9))).isoformat(),'grade':int(l[13:14]),'latitude':int(l[15:18])/10,'longitude':int(l[19:23])/10,'pressureHpa':int(l[24:28]),'maxWindKt':int(l[33:36] or '0') if l[33:36].strip() else None})
 out.append({'id':h[6:10],'name':h[30:50].strip(),'n':n,'records':rows})
assert len(out)==2
(p/'JMA_CASE_TRACKS.json').write_text(json.dumps({'url':url,'downloadedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'archiveSHA256':hashlib.sha256(b).hexdigest(),'archiveBytes':len(b),'zipMember':z.namelist()[0],'storms':out,'caution':'Official post-analysis storm-centre coordinates, not bird locations or local wind field. No avian prediction.'},indent=2)+'\n',encoding='utf8')
print([(s['id'],s['name'],s['n']) for s in out])
