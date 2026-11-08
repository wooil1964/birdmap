# Generates reports-api/src/official-bird-aliases.js from the KOS 2025 checklist XLSX sheet extracted as JSON
# (Codex work/sheet2.xml.json; XLSX SHA-256 b660e125a35abc00df77aa61f3ba24997de7fe1d213ef1350ceacfe08466ba7a).
# Usage: python gen-bird-aliases.py <sheet2.xml.json> <out.js>
import json, sys
rows = json.load(open(sys.argv[1], encoding='utf-8'))
out, seen_ko = [], set()
for r in rows:
    v = {k[0]: x for k, x in r.items()}
    if (v.get('C') or '').strip().lower() != 'species':
        continue
    ko, sci, eng = (v.get('E') or '').strip(), (v.get('F') or '').strip(), (v.get('H') or '').strip()
    if ko and sci and eng and ko not in seen_ko:
        seen_ko.add(ko); out.append([ko, sci, eng])
lines = ',\n'.join('  ' + json.dumps(x, ensure_ascii=False) for x in out)
open(sys.argv[2], 'w', encoding='utf-8', newline='\n').write(
    "// 한국조류학회 「2025 한국조류목록」 v2.1 Species: [국명, 학명, 영명]. 생성 파일(docs/report-autopublish-20261108/gen-bird-aliases.py).\n"
    "// 학명·영명으로 입력해도 공식 국명과 같은 종으로 비교하기 위한 대응표다. 별칭·유사어는 추가하지 않았다.\n"
    f"export const BIRD_NAME_TABLE = Object.freeze([\n{lines}\n]);\n")
print(len(out))
