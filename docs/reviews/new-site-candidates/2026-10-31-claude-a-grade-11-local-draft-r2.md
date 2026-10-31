# 신규 11곳 로컬 초안 — 잔여 오류 수정과 최종 회귀검사 (2차)

- 작성: Claude Code (2026-10-31)
- 작업 위치: 기존 워크트리 `C:/Users/김진호/Documents/GitHub/birdmap-a-grade-11`, 브랜치 `local/a-grade-11-draft`(기준 `origin/main` f8f80af, 커밋 없음)
- 기준선: 같은 f8f80af의 깨끗한 임시 워크트리(검사 후 삭제)
- 금지 준수: 커밋·Push·PR·병합 없음, 운영 D1·Worker·Pages·운영 데이터 변경 없음, 인증 우회 없음, 기존 등록지 삭제·ID 재배정 없음
- diff: `2026-10-31-a-grade-11-local-draft-r2.diff`(코드·시험·SQL·하네스), `...-r2-data.diff`(검토 원본 JSON·공유 페이지 HTML). OG 이미지 11개는 워크트리 `share/og/`에 있음(바이너리라 diff 제외)

## 최종 판정: **차단**

운영 D1 읽기가 계속 401이라 신규 ID 충돌을 확인할 수 없다. 이 조건이 풀리기 전에는 11곳 전체도, 준비 완료 7곳만도 운영 등록 승인 대상이 아니다. D1이 해소되면 7곳은 "운영 등록 승인 가능", 4곳은 "조건부"가 된다.

## 1. 수정한 오류와 변경 파일

| 오류 | 수정 | 파일 |
|---|---|---|
| 월간 자료가 없는 지점에도 "월간 조석표를 확인해 주세요" | 월간 조석 28곳에만 붙임(버튼 표시 기준과 동일) | `index.html` `monthTideFallbackMissingHtml`, `tideTodayForSite`(반환 객체에 `siteId`만 추가) |
| 일별 조석이 아직 없는 신규 지점이 "정보 없음" | 오늘 일별 파일에 지점 항목이 없으면 `tideUse=예` → "조석 자료 준비 중", 그 밖 → "조석 자료 미제공" | `index.html` `v24TideHtml(tide,site)` 및 호출부 1곳 |
| 근거 없는 지점에 종군 문구(도요·물떼새, 물새 등) | 신규 레코드의 명시 필드 `speciesEvidence:"근거 부족"`이면 종군 없는 서식지 문구 | `index.html` `v252ProfileBirdSentence`, `v252CurrentTargetSentence`, `v251EnvironmentWeatherSentence` |
| 장소·환경 낱말(예: 번식섬)로 유형이 바뀜 | 신규 레코드의 명시 필드 `birdingTypeExplicit:true`이면 `environmentBirdingLabel`을 그대로 사용 | `index.html` `v25EnvironmentLabel` |
| CI 브라우저 하네스 6개와 보호 Pages 패키징이 229곳을 기다림 | 현재 총수 240으로(수도권 과거 재현 하네스의 208·229는 유지) | `docs/current-location/popup-regression.cjs`, `verify.cjs`, `docs/report-pick-search/browser.cjs`, `docs/recent-reports-controls/browser.cjs`, `docs/p1-publication-final-audit/browser/publication_chrome_final_r4.mjs`, `docs/reporter-lifetime-stats/browser/reporter_chrome.mjs`, `.github/scripts/package_protected_pages.mjs`(고유 ID 수) |

추가·수정한 검증 파일:

- `data/a-grade-birding-sites-20261031.json`, `index.html` 신규 11줄: 두 명시 필드 추가(다른 값 변경 없음을 스크립트로 확인)
- `.github/scripts/current_location_contract.py`: 엔진 변경 8곳을 "정확히 일치할 때만 되돌리는" 섬으로 추가. 되돌린 결과가 main `index.html`과 **바이트 단위로 같음**을 확인
- `.github/scripts/test_a_grade_popup.mjs`(신규): 실제 함수로 ① 기존 229곳의 유형·문구 4종이 main과 완전히 같음 ② 신규 11곳은 명시 유형을 쓰고 종군 이름 없음 ③ 준비 중/미제공 ④ 일별 지연 시 월간 안내는 28곳에만
- `.github/scripts/test_a_grade_sites.py`: 신규 레코드 키 = 기존 키 + 두 필드, 기존 229곳엔 두 필드 없음
- `docs/a-grade-sites-20261031/native-registry.mjs`(신규): 실제 Miniflare D1에서 추가·복구 SQL 검증
- `.github/workflows/publication-security-ci.yml`: 위 시험·하네스 연결

**기존 229곳 영향**: 레코드·유형·종군 문구는 그대로다(시험으로 확인). 유일한 동작 변화는 **일별 조석이 늦은 날 월간 버튼이 없는 기존 72곳에서 "월간 조석표를 확인해 주세요" 꼬리말이 빠지는 것**이다(요구사항 1).

**처음 시도에서 고친 회귀**: 처음엔 `tideTodayForSite`가 새 객체를 반환하게 했는데, 기존 조석 fallback 계약("오늘 파일에 지점이 없으면 null")을 깨 Node 시험 4건이 새로 실패했다. 계약은 되돌리고 구분을 표시 단계로 옮겨 해결했다.

## 2. 조석 안내·탐조 해석 결과 (실제 브라우저)

| 확인 | PC 1440px | 모바일 375px |
|---|---|---|
| 신규 조석 4곳(236·242·245 확인) | "조석: 조석 자료 준비 중", 월간 문구·버튼 없음 | 거문도 같은 표시 |
| 기존 월간 대상 19번 | 실제 조석값과 "한 달 조석 보기" 버튼 유지 | – |
| 기존 비월간 193번 | 실제 조석값, 버튼 없음(그대로) | – |
| 신규 해석 문구 | "10월 가을철에는 서식지 특성만 참고하고, 실제 출현종은 최근 관찰 기록으로 확인하세요." 종군 이름 0 | 같음 |
| 기존 해석 문구(19·193) | 변경 없음 | – |
| 탐조 유형 | 신규 11곳 모두 명시값(남동유수지 공원탐조, 거문도·소매물도 섬탐조 등) | 같음 |
| 팝업 접기·펼치기·닫기 | 닫기 버튼 동작 | 펼치기(시트 위로), 접기, 닫기 모두 동작, 가로 넘침 없음 |

## 3. Playwright·Miniflare·Pillow

설치: CI와 같은 고정 버전을 **저장소 밖 작업 폴더에만** 설치했다(playwright-core 1.62.1, miniflare 5.20261006.1-alpha → `scratchpad/toolchain`, Pillow 13.0.0 → `scratchpad/pyvenv`). 시스템·저장소 의존성 파일은 바꾸지 않았다. npm이 workerd 설치 스크립트를 막았지만 플랫폼 바이너리가 포함돼 Miniflare는 정상 동작했다.

| 하네스 | 초안 | 기준선 |
|---|---|---|
| 신규 11곳 Miniflare D1(`a-grade-sites-20261031/native-registry.mjs`) | 18/18 | (없음) |
| 중부·제주·수도권 Miniflare D1 하네스 5개 | 모두 통과 | 모두 통과 |
| P1 writer fence / CAS / issue28 native | 14/14, 10/10, 12/12 | 같음 |
| GPS 팝업 회귀(`popup-regression.cjs`) | 750건 PASS | 750건 PASS |
| 제보 위치·장소 검색(`report-pick-search`) | 296건 PASS | 296건 PASS |
| 최근 제보 PC·모바일 조작(`recent-reports-controls`) | 96건 PASS | 96건 PASS |
| 기반지도 빠른 전환·타일 장애(`basemap-fast-switch`) | 67/67(최종 초안 재검사 18:07~18:19, 약 12분) | 통과 |
| 섬 주변 검색 Chrome(`island-nearby-pilot`) | 25/25 | 25/25 |
| 제보 API·SQLite 보안(`reports-api`) | 371/371 | 371/371 |
| 추천 서명(`publication_ci_signatures`) | 통과 | 통과 |
| 공개·동의 보안 Chrome | 147/147 | 147/147 |
| 같은 검사, 느린 CDN 1024px | 31/31 | 31/31 |
| 제보자 누적 통계 Chrome | 135/135 | 135/135 |
| 현장소식 폐지·일반 제보 Chrome | 60/60 | 60/60 |
| 보호 Pages 복구물 패키징 | 통과(671개 파일, 커밋 전이라 신규 공유 파일 미포함) | 통과(671개 파일) |

초안의 첫 실행에서 Playwright 3종과 패키징은 229 대기 조건 때문에 실패했다. 조건을 240으로 고친 뒤 해당 항목만 다시 돌려 통과했다. 기반지도 하네스는 엔진 수정 도중에 돌았을 수 있어 최종 상태로 한 번 더 돌렸다(67/67).

## 4. 공유 페이지·OG 이미지

- HTML 11개(235~238, 240~246) 생성, 239 없음. `build_share_pages.py --check` "최신 상태(240곳)", `test_share_pages.py` OK(Pillow 환경)
- OG 이미지 11개 생성(`share/og/<ID>.png`), 공유 HTML의 `og:image`가 해당 PNG를 가리킴. 한글 장소명이 정상으로 그려짐을 이미지로 확인
- 기존 229개 이미지는 로컬 글꼴 차이로 다시 그려져 **원복**했다(신규 11개만 남김). 운영 반영 시 `build-share-pages.yml`에 `site_ids` 235~238 240~246을 지정해 CI 글꼴로 다시 만드는 것을 권장

## 5. 기존 229곳 보존

- main 대비 229곳 전 필드 동일(Python), 렌더링 함수 출력 동일(Node), 전체 HTML 동결 시험 통과
- 신규 필드 두 개는 신규 11곳에만 있음
- 카카오맵·티맵·Windy 링크 좌표는 대표 좌표와 동일(신규 11곳)

## 6. 신규 11곳 개별 판정

| ID | 탐조지 | 판정 | 남은 것 |
|---|---|---|---|
| 235 | 남동유수지 저어새섬 | 준비 완료 | D1 |
| 236 | 가로림만·웅도 | 준비 완료 | D1, 첫 일별 조석 생성 |
| 237 | 석문호·석문방조제 | 준비 완료 | D1 |
| 238 | 충주호·충주댐 | 준비 완료 | D1 |
| 240 | 곰소만·줄포만 | 준비 완료 | D1, 조석 미연동 정책 확인 |
| 241 | 만경강 신천습지 | **조건부** | 공개 제방 탐조 동선 확인 |
| 242 | 거문도 | 준비 완료 | D1, 첫 일별 조석 생성 |
| 243 | 광양 망덕포구 | **조건부** | 부두 보행 허용 범위 확인 |
| 244 | 경주 감포항 | **조건부** | 공개 보행 구역 확인 |
| 245 | 소매물도 | 준비 완료 | D1, 첫 일별 조석 생성 |
| 246 | 고성 마동호 | **조건부** | 관리사무소 방문 허용 확인 |

239 동림저수지는 예약만 하고 어디에도 등록하지 않았다. 삽교호 제외 유지. 대표점(마동호 35.03541936, 128.38107441, 망덕포구 OSM 부두, 충주댐)은 그대로다. 조건부 4곳은 브라우저 시험을 통과했지만 PASS로 올리지 않았다.

## 7. D1 읽기·ID 충돌

- 저장소의 읽기 전용 도구(SELECT만 허용)로 1회 재시도 → **401 Authentication error, BLOCKED 유지**. 읽기 0·쓰기 0, 인증정보 출력·저장 없음
- 프런트·Worker·공유·SQL 범위에서는 235~246 충돌 없음, 239 미사용
- D1 쓰기·INSERT·DELETE·마이그레이션 하지 않음

## 8. 기준선 대비 회귀검사

| 항목 | 초안 | 기준선 | 판정 |
|---|---|---|---|
| 기존 229곳 무결성 | 동일 | – | PASS |
| 신규 11곳 ID·좌표 | 정확 | – | PASS |
| 마커 수 | 240(브라우저) | 229 | PASS |
| 239 미등록 / 삽교호 제외 | 확인 | – | PASS |
| 조석 일별 / 월간 대상 | 104 / 28 | 100 / 28 | PASS |
| Python 시험 13종 + SEO·공유 `--check` | 모두 통과 | 모두 통과 | PASS |
| Node 시험 | 575건 중 542 통과, 실패 8 | 571건 중 538 통과, 실패 8 | **신규 실패 0**(실패 8건은 같은 목록) |
| Worker 시험 | 36/36 | 36/36 | PASS |
| Miniflare D1 하네스 | 모두 통과 | 모두 통과 | PASS |
| 브라우저 하네스 | 3항 표 | 3항 표 | PASS(신규 실패 0) |
| 최근 제보·보호종 | 모의 API 하네스 통과 | 같음 | PASS(모의) |

기준선 공통 실패 8건(이번 변경과 무관, 정상이라고 간주하지 않음): 공지 닫기 버튼 클릭 영역 A~F 5건, `test_recommendation_contract.mjs` 1건, 정원 밖 공지 연계 장소 1건, 주간 편집 목록 1건. 날짜·환경 의존 여부는 별도 조사가 필요하다.

## 9. 미해결 문제와 등록 차단 조건

**차단**

1. D1 401 — 신규 ID 충돌·generation·NORMAL 미확인

**조건부**

2. 241·243·244·246 현장·기관 확인

**운영 전에만 확인 가능**

3. 신규 4곳 실제 일별 조석 생성(승인 후 workflow), 매핑 `apiSupport` 기록
4. 신규 11곳 실시간 기상(Worker 배포 후)
5. 최근 제보·제보자 통계·보호종 비공개는 모의 API로만 검증. 운영 API 실측 아님

**정책 확인**

6. 곰소만·감포항·남동유수지 조석 미연동, 월간 28곳 유지
7. 기존 비월간 72곳의 월간 꼬리말 제거
8. 근거 부족 문구를 신규 11곳에만 적용(종 기록이 빈 기존 수도권 10곳은 그대로). 확대 여부

## 10. 운영 배포 전 최종 승인 사항

1. Wrangler 재로그인 등으로 D1 읽기 인증 복구 → 읽기 전용 충돌 확인
2. 조건부 4곳 포함 여부(제외 시 총수·시험·SQL 재조정)
3. 9항 정책 확인
4. 커밋·PR 생성·병합 각 단계 승인
5. 배포 순서: Worker 사이트 목록 → D1 원자 추가 → Pages. 각 단계 승인
6. 배포 직후 `build-share-pages.yml`(site_ids 지정)과 조석·기상 workflow 실행 승인
7. 복구 계획(1차 보고서 8항): Pages 노출부터 복구, 신규 ID 참조 제보가 있으면 D1 삭제·Worker 축소 중단, 참조가 없을 때만 복구 SQL
