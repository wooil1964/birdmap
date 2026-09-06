# HANDOVER.md — AI 작업 인수인계 문서

이 문서는 여러 AI(ChatGPT, Codex, Claude Code, Gemini)가 이 저장소에서 순차적으로 작업할 때
현재 상태와 최근 완료 작업을 공유하기 위한 인수인계 문서입니다.

> 작업 규칙은 `AI_WORK_RULES.md`가 최우선이며, 이 문서와 충돌하면 `AI_WORK_RULES.md`를 따릅니다.

## 현재 서비스 기준

- 실제 서비스 파일: main 브랜치의 `index.html` (GitHub Pages 배포)
- 실시간 기상: Cloudflare Worker (`weather-proxy/`) 연동
- 기상·조석 데이터: GitHub Actions가 `weather_today.json`, `tide_today.json`, `tide_month.json` 자동 갱신
- 오프라인 원본 DB: `data/` 폴더의 엑셀 파일 (기준 엑셀은 사용자가 지정)

## 최근 완료 작업

- '오늘 어디 갈까' 계절 추천 보정(2026-09-07): 9~10월 물때 필수추천은 사용자 확정 대상인 유부도(700cm)·매향리(850cm)·걸매리(850cm)만 siteId 기준으로 적용하고, 가을 원거리 섬 제외는 확정 대표명(백령도·외연도·어청도)만 추천 후보에서 제외하도록 `index.html`을 보정했다. 동남해안 9월 강한 동풍 mandatory 규칙은 유지했다.
- '오늘 어디 갈까' 필수 포함 규칙(2026-09-06): 기존 `v251EffectiveScore` 점수는 올리지 않고, 9~10월 갯벌 조석 조건과 9월 동남해안 동풍 조건을 `mandatoryReason`으로 추천 목록에 추가 표시하도록 `index.html`만 최소 확장했다.
- '오늘 어디 갈까' 패널 + 탐조 이슈 연동(2026-09-06): 상단에 `🧭 오늘 어디 갈까` 버튼과 `#todayPanel` 추가. ① Top 5는 기존 `v251EffectiveScore`(저장 기상)만으로 정렬하며 새 점수·가산점 없음, 카드에 기존 별점/점수·조석 고저조(`v24TideDayEvents` 재사용, stale 시 '※ 이전 자료')·기상 자료 신선도(`storedWeatherLabel`)를 표시하고 클릭 시 `moveToSite` 재사용. ② `📢 지금 볼 만한 탐조 이슈` 섹션은 기존 noticePanel과 동일한 `activeNotice` 필터·동일 데이터(`loadedNotices` 공유)를 사용해 활성 공지의 제목·요약을 그대로 표시(자연어 재해석·자동 점수화·탐조지 추론 금지). 현재 notices.json에는 siteId류 구조 필드가 없어 연계 배지·지도 이동은 비활성이며, 향후 공지에 `siteIds`/`siteId`/`sites`(id 또는 정확한 이름)가 추가되면 `noticeLinkedSites`가 자동으로 '📢 현재 탐조 이슈 연계' 태그와 '지도에서 보기' 버튼을 붙인다. notices.json·추천 점수·조석/기상 로직은 무변경.
- 모바일 popup 겹침·가로 스크롤 안정화(2026-09-06): 원인은 ① Leaflet popup autoPan 기본 패딩(5px)이 모바일 상단 고정 UI(`#topUiWrap`, z-index 10001)를 고려하지 않음, ② `moveToSite`의 `setView` 애니메이션이 popup autoPan 결과를 되돌림, ③ 모바일 패널 고정 `top:178px`이 버튼 줄바꿈 시 실제 상단 UI 높이(약 198px)보다 작아 겹침. 수정: 상단 UI 실제 높이를 CSS 변수(`--birdmapTopUiH`, `--birdmapPopupMaxH`)로 계산해 패널 top·popup 최대 높이에 반영, popupopen 시 `autoPanPaddingTopLeft/BottomRight` 동적 설정, 이동/애니메이션 안정화 후 `popup.update()` 재보정, 열린 검색 패널 아래 popup 최소 공간(180px)이 있으면 패널 유지·없으면 기존 패턴대로 자동 닫기. `#birdmapPanel`·입력창·`#noticePanel`에 box-sizing 보정, 모바일 한정 `html,body{overflow-x:hidden}` 안전장치. 390x844/360x800/412x915 및 1366/1920 데스크톱 회귀 검증(187개·중복 ID 0·조석/기상/버튼 정상). 조석·기상·좌표·데이터 변경 없음.
- 기상 최종 원격 검증: 코드 `842a8d1` 및 `959ee96` main push, Actions `34022709060`/`34023132421` 성공. 최종 자동 JSON `a1233ee`: 2026-09-06 17:54 생성/18:00 갱신, 187 성공, 실패·stale·재사용·없음 0, 점수 적격 187. Windy GFS + Open-Meteo 시정 보완. 회귀 총 61개 통과. KMA 외부 timeout과 모바일 팝업 겹침은 미해결이며 신규 추천 기능은 구현하지 않았다.

- 기상 안정화(2026-09-06, Worker 배포 완료): runtime/Worker 코드 187개 전수 일치, ID 188 추가 및 ID 14 이름 일치. 저장 기상 concat 파서 오류 수정, 원 시각·출처·stale·점수 적격 상태 분리, 일부 KMA 요청 실패 시 유효 응답 보존. 실제 Open-Meteo 저장 기상 187개 성공, 이전 자료는 오늘 점수에서 제외. 상세 `.github/scripts/weather_system_review.md` 참조. Worker version 0c8fbbb2-728d-4dfd-8d3b-2ed0fb5d8e05 배포 완료. 대표 실제 호출은 7곳 KMA_TIMEOUT, 독도 해양 우선 분기였다. 코드 배포와 외부 API 정상화를 구분할 것.

- 조석 안정화(2026-09-06): 공식 코드 99개 탐조지/38개 관측소 검증, 필수 8곳 및 전체 today/tomorrow 인증 API 실호출 확인. 명시적 매핑, fallback 출처·원 생성/현재 갱신 시각, 실제 HTTP·live·timeout 진단, 월간 캐시, 회귀 검사와 Actions 진단을 보강했다. 상세 증거와 반복 비교 결과는 `.github/scripts/tide_system_review.md`, `tide_api_verification.json`, `tide_api_benchmark.json` 참조. 외해 기준의 내부 갯벌 대표성 등 31개 검토 표시는 보존했다.
- 탐조 의사결정 2단계는 `.github/scripts/birding_decision_design.md`에 설계만 작성. 기존 점수 중복, 추천 시간 승인 규칙, 관측/추정 분리, 모바일 및 단일 원본 후보를 정리했으며 새 기능은 구현하지 않았다.
- 현재 런타임/Worker 코드는 187개(중복 ID 0), ID 188 이천항 포함. 공통 좌표와 조석 매핑 좌표는 일치한다. production Worker에도 188 반영 완료. 외부 KMA timeout은 남아 있다. 아래 과거 162개/반영 보류 기록을 현재 상태로 오인하지 말 것.
- 기상 표시 개선 및 Worker 배포 완료
- 한 달 조석 데이터·모달 기능 완료
- P1 품질 개선 완료
- 모바일 상단 UI 정리 완료
- 186개 엑셀 정제본 생성, 신규 30개는 지도 반영 보류
- 강수 우선 탐조 해석 수정(PR #2) 및 강수 시 별점·점수 보정(PR #3) 완료
- 수도권 하천계 6곳(ID 157·158·159·160·162·163) 1차 지도 반영 — 권역 수 156→162, ID 161은 보류 유지
- eBird 링크 버튼 비노출 실험(2026-07-08): 비멤버 유입 감소 원인 확인을 위해 팝업의 eBird 버튼만 임시로 숨김.
  데이터(`ebirdHotspotUrl`, Hotspot ID, 정적 팝업 HTML)는 모두 보존.
  복원 방법: `index.html`에서 ① `var SHOW_EBIRD_BUTTON=false;`를 `true`로 변경,
  ② CSS의 `a.ebird,.btn.ebird{display:none !important}` 한 줄(및 그 위 주석) 삭제 — 두 가지 모두 되돌려야 함.

## 진행 중 / 보류 사항

- 신규 탐조지 후보 중 24개(ID 161, 164~186): 엑셀 정제본에는 포함되었으나 지도 반영은 보류 상태.
  반영 시 `AI_WORK_RULES.md` 5항(좌표 검증)과 7항(기상 이중 관리)을 반드시 준수할 것.
- 반영된 6곳의 eBird Hotspot ID는 미확정으로 공백 유지 중(후보 ID는 보완표 참조). 공식 확인 후 입력할 것.
- 조석 매핑 검증기는 이제 HTML의 고정 개수/정규식 대신 조석 대상 ID 집합 및 공식 코드를 검증한다. mappingVersion 2가 실행 기준이며 유부도 DT_0018, 매향리 SO_1268은 보호한다. Excel·HTML 전체를 덮어써 매핑을 되돌리지 말 것.

## 다음 작업자를 위한 주의사항

1. 작업 시작 전 `git status`와 최신 main 상태를 확인한다.
2. `AI_WORK_RULES.md` 전문을 읽고 준수한다.
3. `index.html`의 `siteData`와 `weather-proxy/src/sites.js`는 수동 이중 관리 상태이므로
   탐조지·좌표 변경 시 양쪽을 모두 확인한다.
4. 자동 생성 파일(`weather_today.json`, `tide_today.json`, `notices.json` 등)은
   직접 수정해도 다음 자동 실행에서 사라질 수 있다.
5. 작업 완료 후 `AI_WORK_RULES.md` 12항 형식으로 보고하고, 이 문서의
   "최근 완료 작업"을 갱신한다.
