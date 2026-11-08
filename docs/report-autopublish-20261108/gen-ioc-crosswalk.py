# IOC "IOC_15.2_vs_other_lists.xlsx" (worldbirdnames.org, CC BY 4.0)에서 다른 분류목록(AviList v2025, Clements v2025, HBW/BirdLife v10,
# Howard & Moore 4.1, Peters)의 종 학명을 IOC 15.2 종 학명에 대응시켜 reports-api/src/ioc-crosswalk.js 로 만든다. 표준 라이브러리만 사용.
# 사용: python -I gen-ioc-crosswalk.py <vs.xlsx> <out.js>
import sys, json, zipfile, re, xml.etree.ElementTree as ET
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z = zipfile.ZipFile(sys.argv[1])
ss = [''.join(t.text or '' for t in si.iter(M + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
rows = []
for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(M + 'row'):
    d = {}
    for c in r:
        v = c.find(M + 'v')
        if v is not None: d[re.match(r'[A-Z]+', c.get('r')).group()] = (ss[int(v.text)] if c.get('t') == 's' else v.text).strip()
    rows.append(d)
SRC = {'E': 'A', 'G': 'C', 'H': 'B', 'J': 'M', 'L': 'P'}  # A=AviList v2025, C=Clements v2025, B=HBW/BirdLife v10, M=Howard&Moore 4.1, P=Peters
BIN = re.compile(r'^[A-Z][a-z]{2,} [a-z]{2,}$')
syn = {}      # 동의어(소문자) → (IOC 학명(소문자), 출처 문자들)
extra = {}    # IOC 에는 없고 다른 목록에만 있는 종: 학명(소문자) → 출처 문자들
for r in rows[1:]:
    if r.get('C') != 'species': continue
    ioc = r.get('B') if r.get('B') and BIN.match(r['B']) else None
    names = {col: r[col] for col in SRC if r.get(col) and BIN.match(r[col])}
    if ioc:
        for col, n in names.items():
            if n != ioc:
                k = n.lower(); old = syn.get(k, (ioc.lower(), ''))
                if old[0] == ioc.lower(): syn[k] = (ioc.lower(), old[1] + SRC[col])
    else:
        for col, n in names.items(): extra[n.lower()] = extra.get(n.lower(), '') + SRC[col]
# 동의어가 다른 종의 IOC 학명과 겹치면(분할·합병) 모호하므로 뺀다.
iocnames = {r['B'].lower() for r in rows[1:] if r.get('C') == 'species' and r.get('B')}
syn = {k: v for k, v in syn.items() if k not in iocnames}
out = ['// 자동 생성: IOC 15.2 vs other lists 교차표(doi 10.14344/IOC.ML.15.2, CC BY 4.0). 수정하지 말고 gen-ioc-crosswalk.py 로 다시 만든다.',
       '// 출처 문자: A=AviList v2025, C=Clements v2025, B=HBW/BirdLife v10, M=Howard&Moore 4.1, P=Peters. AviList v2026(2026-10-20)은 자료를 받지 못해 포함하지 않았다.',
       "export const CROSSWALK_SYNONYMS = '%s';" % ';'.join('%s>%s>%s' % (k, v[0], ''.join(sorted(set(v[1])))) for k, v in sorted(syn.items())),
       "export const CROSSWALK_EXTRA = '%s';" % ';'.join('%s>%s' % (k, ''.join(sorted(set(v)))) for k, v in sorted(extra.items()) if k not in syn and k not in iocnames)]
open(sys.argv[2], 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print(len(syn), len(extra))
