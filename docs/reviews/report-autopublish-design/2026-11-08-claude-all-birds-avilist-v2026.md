# AviList v2026 반영 (로컬)

기준 f5bc861 위에 쌓음. 자동 공개 OFF 유지, 운영 D1·PR·CI·병합·배포 없음.

## 자료
- 확보: 사용자가 내려받아 준 공식 `AviList-v2026-20Oct2026-extended-version.xlsx`(9.5 MB, 시트 6개: AviList v2026 / Decision summaries / Recommended citation / How to use / References / Changes). 우회 내려받기는 하지 않았다.
- AviList v2026: 종 11,172(멸종 제외 11,021을 사용), 이번 판의 분할 70·신종 5·속 변경 54 등.
- 이전 판: IOC 15.2 현존 11,064종, 대응표(AviList v2025 등).

## 분류목록 차이와 연결 (생성기 `gen-intl-taxa.py`)
- AviList v2026 종 11,021이 기준. IOC 15.2 종 중 v2026에 같은 학명이 없는 것 → 영명으로 v2026 종에 연결(동의어, 학명 변경·속 이동), 연결 불가 703종은 `LEGACY`(IOC 등이 인정하는 분할 전 이름 등)로 보존. 다른 목록(AviList v2025·Clements·HBW·H&M·Peters)의 이름 → 동의어. 총 동의어 3,234쌍, 영명 별칭 2,569.
- 한국 2025 목록 598종: 학명이 AviList v2026과 같은 것 575종, 다른 것 23종. 598종 중 595종이 v2026 종에 연결됨. 연결 못 한 3종(미국쇠오리 Anas carolinensis, 쇠칼새 Apus nipalensis, 검은딱새 Saxicola stejnegeri)은 v2026이 다른 종에 합쳐서 연결하지 않음 — 국내 구분을 유지하므로 합쳐진 국제 이름(예: Anas crecca)은 쇠오리와 같은 종, 미국쇠오리와는 다른 종으로 취급.
- **국내 공식 국명 변경 없음**(한국 목록이 항상 우선, 국제목록이 합친 종도 국내에서는 합치지 않음).

## 판정과 보존
- 한국 목록 → 확인 / AviList v2026 학명·영명 → 확인 / 동의어·분할 전 이름 → 같은 종으로 연결 / 그 밖(속만 맞는 학명, 목록에 없는 영명·한글명) → 식별 안 함, 원문 보존 + 관리자 검토. 국제목록에서 확인되는 미조·미기록 가능종은 자동 공개 유지(시험: Tringa inornata=Prairie Willet 동시 3건 중 공개 1건, Muscicapa tyrrhenica, 신종 Hierococcyx tiganada 공개).

## 번들·성능 (중복 제거)
- 분류자료는 `src/intl-taxa.js` 한 파일(625 KB, gzip 197 KB). 이전 `ioc-taxa.js`+`ioc-crosswalk.js`(743 KB) 제거, 속명 판정 자료 제거.
- wrangler dry-run: 공개 Worker 931→804 KiB(gzip 268→240), 관리자 955→828 KiB(gzip 276→248).
- Node 측정: 모듈 가져오기 30→8 ms, 첫 호출 때 한 번 해석 약 18 ms(Worker 시작에는 넣지 않음), 호출당 약 0.85 µs, 힙 21→13.6 MB. 실제 workerd 시작 시간은 배포 전 측정 필요.
- 시험이 단일 파일·1 MB 미만·출처 머리말을 감시. 출처·라이선스: `reports-api/DATA_SOURCES.md`(AviList 라이선스는 파일의 How to use 탭 확인 필요).

## 시험
- 서버 428/428, 실제 D1 allbirds-native 11/11, duplicate-native 11/11, cap-native 통과, 관리자 Chrome 40/40, 보안 행렬 병렬 200회 0건, 루트 504/516(실패 12건은 기존 퇴역 감사 증거 11+배치 1, 변경 없음).
- 변이: 동의어 제거→시나리오 9 실패, AviList 학명 인식 제거→시나리오 1·4·5·6·9·11 실패.
- 위치 정책 v2·위치 가림·200 m 중복·하루 한도·관리자 사후 관리·index.html 변경 없음.

## 남은 위험
- 한국 목록이 구분하는 종과 국제목록이 합친 종(3종)은 국제 이름이 다른 쪽으로 가면 별개 종으로 취급된다.
- 최신 v2026 분류가 다시 바뀌면 생성기를 새 파일로 재실행해야 한다. AviList 라이선스 문구 확인과 실제 workerd 시작 시간 측정은 배포 전 과제.
