# 종명 자료 출처와 라이선스

| 파일 | 출처 | 라이선스 | 생성 방법 |
|---|---|---|---|
| `src/official-bird-names.js`, `src/official-bird-aliases.js` | 한국조류학회 한국의 조류 목록 2025(국명·학명·영명 598종) | 학회 자료(국내 기준명, 기존 저장소 자료) | `docs/report-autopublish-20261108/gen-bird-aliases.py` |
| `src/ioc-taxa.js` | IOC World Bird List v15.2, Gill, Donsker & Rasmussen (Eds). 2026. doi:10.14344/IOC.ML.15.2, `master_ioc_list_v15.2.xlsx` (worldbirdnames.org) | CC BY 4.0 | `gen-ioc-taxa.py` (멸종종 제외) |
| `src/ioc-crosswalk.js` | 같은 곳의 `IOC_15.2_vs_other_lists.xlsx` (IOC 15.2와 AviList v2025·Clements v2025·HBW/BirdLife v10·Howard & Moore 4.1·Peters의 학명 대응) | CC BY 4.0 (IOC 배포본) | `gen-ioc-crosswalk.py` |

- 생성 파일 머리말에 출처·버전·"수정하지 말 것"을 적었다. 갱신은 생성기를 다시 돌려서만 한다.
- AviList v2026(2026-10-20, doi:10.2173/avilist.v2026)은 avilist.org가 스크립트 내려받기를 막아(HTTP 403) 받지 못했으므로 **반영하지 않았다**. 대신 IOC가 배포한 AviList v2025 대응표를 썼다. 라이선스는 내려받은 파일의 안내로 확인한 뒤에 넣어야 한다(공개 문서에서 확인하지 못함).
- 자동 공개 판정은 이 자료로 "식별 가능한 이름인지"만 본다. 어떤 이름도 국내 기록종·미기록종으로 확정하지 않는다.
