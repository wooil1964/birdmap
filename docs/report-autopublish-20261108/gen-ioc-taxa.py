# IOC World Bird List(master xlsx)에서 속·종 학명·영명을 뽑아 reports-api/src/ioc-taxa.js 를 만든다.
# 사용: PYTHONUTF8=1 python -I gen-ioc-taxa.py <master_ioc_list.xlsx> <out.js>  (표준 라이브러리만 사용)
import sys, json, zipfile, re, xml.etree.ElementTree as ET
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z = zipfile.ZipFile(sys.argv[1])
ss = [''.join(t.text or '' for t in si.iter(M + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
meta = ss[0] if ss else ''
genus = None; species = {}; english = []
root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
for r in root.iter(M + 'row'):
    d = {}
    for c in r:
        v = c.find(M + 'v')
        if v is None: continue
        d[re.match(r'[A-Z]+', c.get('r')).group()] = ss[int(v.text)] if c.get('t') == 's' else v.text
    if d.get('F') and not d.get('G'): genus = d['F'].strip(); species.setdefault(genus, [])
    elif d.get('G') and genus:
        if d.get('I'): continue  # 멸종종 제외
        epi = d['G'].strip(); species[genus].append(epi)
        if d.get('K'): english.append((d['K'].strip().replace('’', "'"), genus + ' ' + epi))
version = re.search(r'\(([\d.]+)\)', [x for x in ss if 'IOC WORLD BIRD LIST' in x][0]).group(1)
out = ['// 자동 생성: IOC World Bird List v%s (doi 10.14344/IOC.ML.%s). 수정하지 말고 gen-ioc-taxa.py 로 다시 만든다.' % (version, version),
       "export const IOC_VERSION = '%s';" % version,
       '// 속명:종소명,종소명;...  (멸종종 제외)',
       "export const IOC_SPECIES = '%s';" % ';'.join(g + ':' + ','.join(e) for g, e in species.items() if e),
       '// 영명|속명 종소명 (줄바꿈 구분)',
       'export const IOC_ENGLISH = ' + json.dumps(chr(10).join(n + '|' + b for n, b in english), ensure_ascii=False) + ';']
open(sys.argv[2], 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print(version, len(species), sum(len(v) for v in species.values()), len(english))
