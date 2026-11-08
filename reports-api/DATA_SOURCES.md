# 종명 자료 출처와 라이선스

| 파일 | 출처 | 라이선스 | 생성 방법 |
|---|---|---|---|
| `src/official-bird-names.js`, `src/official-bird-aliases.js` | 한국조류학회 한국의 조류 목록 2025(국명·학명·영명 598종). **국내 공식 국명 기준이며 변경하지 않는다.** | 학회 자료(기존 저장소 자료) | `docs/report-autopublish-20261108/gen-bird-aliases.py` |
| `src/intl-taxa.js` | **AviList v2026** (AviList Core Team. 2026. AviList: The Global Avian Checklist, v2026, doi:10.2173/avilist.v2026; 2026-10-20 `AviList-v2026-20Oct2026-extended-version.xlsx`, avilist.org) — 현존 종 학명·영명의 기준 | avilist.org 배포 조건에 따름(내려받은 파일 「How to use」·「Recommended citation」 탭 확인 필요, 인용 필수) | `gen-intl-taxa.py` |
| 같은 파일 | IOC World Bird List v15.2 (Gill, Donsker & Rasmussen (Eds). 2026. doi:10.14344/IOC.ML.15.2, worldbirdnames.org) `master_ioc_list_v15.2.xlsx` 와 `IOC_15.2_vs_other_lists.xlsx`(AviList v2025·Clements v2025·HBW/BirdLife v10·Howard & Moore 4.1·Peters 학명 대응) — AviList v2026과 이름이 다른 종을 연결 | CC BY 4.0 | 같은 생성기 |

- 분류자료는 `src/intl-taxa.js` 한 파일에만 둔다(이전의 `ioc-taxa.js`·`ioc-crosswalk.js`는 제거). 생성 파일 머리말과 시험이 출처·버전을 확인한다.
- 국제목록 연결 규칙: AviList v2026 종이 기준. IOC·다른 목록의 이름은 같은 종이면 동의어로, 분할 전 이름처럼 v2026에 없지만 IOC 등이 인정하면 `LEGACY_SPECIES`로 둔다. 한국 목록이 별개 종으로 구분하는 이름(예: 미국쇠오리/쇠오리)은 국제목록이 합쳤어도 합치지 않는다.
- 자동 공개 판정은 "식별 가능한 이름인지"만 본다. 어떤 이름도 국내 기록종·미기록종으로 확정하지 않는다. 속만 맞는 학명, 목록에 없는 영명·한글명은 식별하지 않고 관리자 검토로 보낸다.
