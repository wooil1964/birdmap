# 국제 분류목록 자료 생성: AviList v2026(기준) + IOC 15.2(+ 다른 목록 대응표)의 학명·영명을 AviList v2026 종에 연결해
# reports-api/src/intl-taxa.js 하나로 만든다(자료 중복 없음). 표준 라이브러리만 사용.
# 사용: python -I gen-intl-taxa.py <AviList-v2026 extended.xlsx> <master_ioc_list_v15.2.xlsx> <IOC_15.2_vs_other_lists.xlsx> <out.js>
import sys, json, zipfile, re, xml.etree.ElementTree as ET
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def sheet(path, n=1):
    z = zipfile.ZipFile(path)
    ss = [''.join(t.text or '' for t in si.iter(M + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    out = []
    for r in ET.fromstring(z.read('xl/worksheets/sheet%d.xml' % n)).iter(M + 'row'):
        d = {}
        for c in r:
            v = c.find(M + 'v')
            if v is not None: d[re.match(r'[A-Z]+', c.get('r')).group()] = (ss[int(v.text)] if c.get('t') == 's' else v.text).strip()
        out.append(d)
    return out
BIN = re.compile(r'^[A-Z][a-z]{2,} [a-z]{2,}$')
norm = lambda s: s.replace('’', "'")
# 1. AviList v2026 현존·재도입 종(멸종 제외)
avi, avi_eng = {}, {}
for r in sheet(sys.argv[1])[1:]:
    if r.get('B') != 'species' or not BIN.match(r.get('E', '')): continue
    o = r.get('O', '')
    if o in ('Extinct', '(extinct)'): continue
    avi[r['E'].lower()] = (r['E'], norm(r.get('H', '')), [norm(r.get(c, '')) for c in 'IJ'])
for b, (_, e, _) in avi.items():
    if e: avi_eng.setdefault(e.lower(), []).append(b)
avi_eng = {e: v[0] for e, v in avi_eng.items() if len(v) == 1}
# 2. IOC 15.2 현존 종
ioc, genus = {}, None
for d in sheet(sys.argv[2]):
    if d.get('F') and not d.get('G'): genus = d['F'].strip()
    elif d.get('G') and genus and not d.get('I'): ioc[(genus + ' ' + d['G'].strip()).lower()] = (genus + ' ' + d['G'].strip(), norm(d.get('K', '')))
syn, legacy, eng = {}, {}, {}  # 동의어→AviList 학명(소문자) / AviList에 없는 인정 학명→출처 / 영명 별칭→AviList 학명
def canon_of_ioc(b):
    if b in avi: return b
    e = ioc.get(b, ('', ''))[1].lower()
    return avi_eng.get(e)
for b, (name, e) in ioc.items():
    if b in avi: continue
    c = canon_of_ioc(b)
    if c: syn[b] = c
    else: legacy[b] = 'I'
# 3. 다른 목록 대응표(AviList v2025·Clements v2025·HBW/BirdLife·H&M·Peters)
SRC = {'E': 'A', 'G': 'C', 'H': 'B', 'J': 'M', 'L': 'P'}
for r in sheet(sys.argv[3])[1:]:
    if r.get('C') != 'species': continue
    base = r.get('B', '').lower() if BIN.match(r.get('B', '')) else None
    c = (canon_of_ioc(base) if base else None)
    names = {col: r[col] for col in SRC if BIN.match(r.get(col, ''))}
    for col, n in names.items():
        k = n.lower()
        if k in avi or k in ioc or k == base: continue  # 다른 분류목록의 이름이 AviList·IOC에서는 별개의 종이면 합치지 않는다
        if c: syn.setdefault(k, c)
        elif base and base in legacy: syn.setdefault(k, base)
        elif k not in syn and k not in legacy and k not in ioc: legacy[k] = SRC[col]
syn = {k: v for k, v in syn.items() if k not in avi and k != v}
legacy = {k: v for k, v in legacy.items() if k not in avi and k not in syn}
# 4. 영명 별칭(AviList 영명과 다른 IOC·Clements·BirdLife 영명)
def add_eng(e, b):
    k = norm(e).lower()
    if not k or k in avi_eng or (k in eng and eng[k] != b): return
    eng[k] = b
for b, (_, e, others) in avi.items():
    for x in others: add_eng(x, b)
for b, (_, e) in ioc.items():
    c = b if b in avi else syn.get(b)
    if c and e: add_eng(e, c)
amb = {k for k in eng if k in avi_eng}
# 5. 출력
T, N = '\t', chr(10)
genera = {}
for b, (name, e, _) in sorted(avi.items()):
    g, ep = name.split(' '); genera.setdefault(g, []).append(ep + '~' + e)
for line in [e for v in genera.values() for e in v]: assert T not in line and N not in line
cites = [x for x in sheet(sys.argv[1], 3) if x][:6]
out = ['// 자동 생성: gen-intl-taxa.py. 수정하지 말고 생성기로 다시 만든다. 출처·라이선스는 reports-api/DATA_SOURCES.md.',
       '// 기준: AviList v2026 (2026-10-20, doi:10.2173/avilist.v2026) 현존 종 %d개. 연결: IOC World Bird List v15.2 (doi:10.14344/IOC.ML.15.2, CC BY 4.0)와 그 다른 목록 대응표.' % len(avi),
       "export const INTL_VERSION = 'AviList v2026 + IOC 15.2';",
       '// 속<탭>종소명~영명<탭>… (AviList v2026 종, 줄바꿈 구분)',
       'export const AVI_SPECIES = ' + json.dumps(N.join(g + T + T.join(v) for g, v in genera.items()), ensure_ascii=False) + ';',
       '// 동의어>AviList 학명 (IOC 15.2·AviList v2025·Clements·HBW/BirdLife·H&M·Peters에서 AviList v2026과 이름이 달라진 종)',
       'export const AVI_SYNONYMS = ' + json.dumps(';'.join(k + '>' + v for k, v in sorted(syn.items())), ensure_ascii=False) + ';',
       '// AviList v2026에는 없지만 IOC 15.2 또는 다른 목록이 인정하는 종(분할 전 이름 등)',
       'export const LEGACY_SPECIES = ' + json.dumps(';'.join(sorted(legacy)), ensure_ascii=False) + ';',
       '// 영명 별칭>AviList 학명 (줄바꿈 구분)',
       'export const ENGLISH_ALIASES = ' + json.dumps(N.join(k + '>' + v for k, v in sorted(eng.items())), ensure_ascii=False) + ';']
open(sys.argv[4], 'w', encoding='utf-8', newline='\n').write(N.join(out) + N)
print(len(avi), len(ioc), len(syn), len(legacy), len(eng))
