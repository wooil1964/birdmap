# Codex 작업 지침

[AI_WORK_RULES.md](AI_WORK_RULES.md)가 최우선이며 충돌 시 그 문서를 따른다. 역할·좌표·종·ID 검증 및 안전 원칙을 생략하지 않는다.

## 시작과 범위

- `git status`와 최신 main HEAD를 확인하고 작업 브랜치에서 시작한다. 변경 영역과 위험 조건(좌표·종·ID, 공개 보호, 자동 생성, Worker·배포)을 먼저 판단한다.
- AI_WORK_RULES.md를 읽고, 현재 상태는 [HANDOVER.md](HANDOVER.md), 결정은 [active-decisions.md](docs/decisions/active-decisions.md)에서 필요한 부분만 읽는다. 상세 기록·대형 문서는 관련 근거가 필요할 때만 연다.
- 요청 범위를 최소로 유지한다. 범위 확대는 실행 전에 사용자 승인을 받는다. 무관한 리팩터링과 자동 생성 파일 직접 수정을 금지한다.
- `siteData` 초대형 줄을 grep/rg 결과로 전체 출력하지 않는다. 경로·줄 번호만 찾거나 구조적으로 필요한 필드만 추출한다.
- `docs/`에도 CI가 실행하는 스크립트가 있다. 임의 삭제·이동하지 않는다. Python은 기본 `python -B`로 실행한다.

## 검증 선택

변경 영향에 해당하는 최소 로컬 검사만 수행한다. 전체 로컬 회귀는 사용자가 명시적으로 요청한 경우에만 수행한다. PR CI를 기본 안전장치로 유지하되 CI가 확인하지 못하는 항목은 별도 검증한다. 로컬 통과·CI 대기·CI 실패를 구분하고 CI 통과 전 정상 완료로 보고하지 않는다.

아래는 현재 존재를 확인한 검사다. 짧은 파일명은 `.github/scripts/` 기준이며 모두 실행하라는 목록이 아니다. 영향 항목을 빠뜨리지 않는다.

| 변경 영역 | 대응 검사·상태 |
|---|---|
| 문서만 | `git diff --check`, `git diff --name-only`, `git status --short`; 링크·우선순위·크기·기록 보존 대조 |
| 탐조지·좌표·ID | `test_central_sites.py`(공통 계약 합성 시험 포함) + 변경 지역 검사(`test_jeju_sites.py`·`test_metro_sites.py`·`test_a_grade_sites.py`), `test_weather.py`(runtime·Worker 정합성). 조석 연결 신규 등록은 `test_jeju_sites.py`의 매핑 확장 검사 포함 |
| 추천 | `test_weekly_recommendation.mjs`, `test_recommendation_contract.mjs`; CI의 `publication_ci_signatures.mjs` 고정 서명 비교는 범위 재검토 미실시 |
| 기상·조석 | `test_weather.py`, `test_validator_time_contract.py`, `test_tide.py`, `test_today_weather_midnight.mjs`, `test_tide_fallback.mjs` 중 영향 검사 |
| Worker·공개 보호 | 변경한 Worker의 `weather-proxy/test/*.test.mjs` 또는 `reports-api/test/*.test.mjs` |
| 지도·팝업 | `test_basemap_controller.mjs` 등 해당 `test_*.mjs`와 영향 받는 `docs/` 브라우저 하네스. index.html 전체 비교는 없다(C-2) |
| SEO·공유 | `build_seo_pages.py --check`, `test_seo_pages.py`, `test_share_pages.py` 중 영향 검사 |

## 탐조지 데이터 검증 (PR #68)

- 공통 검증은 `site_data_contract.py`의 `assert_repository_sites()`다. 고정 개수가 아니라 PR 기준 main의 `siteData`·`weather-proxy/src/sites.js`와 비교해 ID 삭제·중복·순서 변경, lat·lon·pelagic 무승인 변경, runtime·Worker 이름·환경·좌표 불일치, 필드 스키마 변경을 차단한다. 안내문 등 다른 필드 수정은 허용한다.
- 기준: CI는 runner PR 병합 커밋의 main 부모, 로컬은 `git fetch origin main` 뒤 `merge-base HEAD origin/main`이다.
- 종 변경·신규 탐조지는 `fixtures/site_data_change_reviews.json`에 근거(`baseCommit`은 main 조상, 종 전후 값·레코드 해시 일치)를 기록한다. 좌표·pelagic 변경 승인(`protectedApprovals`)은 기준 main에 있는 것만 인정되므로 같은 PR에서 추가해도 효력이 없다.
- 검사는 근거 URL·승인 링크의 **형식**만 확인한다. 실제 근거의 진위는 사람의 검토로 확인한다.

## 보호 데이터·외부 코드 (C-1·C-2)

- index.html 전체 비교는 없다. 대신 `site_data_contract.py`가 `siteData`·`siteSpotData` 선언을 엄격 문법으로 추출하고(주석·문자열 속 가짜 선언, 다른 대입·`'siteData'` 같은 이름 문자열, `assets/*.js`의 대입은 실패), 고정점 ID·순서·부모·좌표·종과 Worker `admin-page.js` `FIXED_SPOTS` 정합을 검사한다. 고정점 변경 승인(`fixtures/site_spot_reviews.json`)도 기준 main에 있는 것만 인정하며, 신규 고정점은 기준이 정해질 때까지 차단된다.
- 브라우저 하네스는 `site_data_contract.py --export`(계약 통과 후에만 생성)를 기대값으로 삼아 `docs/site-data-guard/guard.cjs`로 실행 중 데이터 대입·변경, 마커·고정점 좌표, 팝업 대상, 카카오·티맵 목적지를 비교한다. 페이지 값을 정답으로 쓰지 않는다. 링크 문구·형식은 바꿀 수 있고 목적지 좌표만 검증한다.
- 페이지 코드(데이터 블록 밖 index.html, `assets/` 아래 모든 텍스트 파일, index.html이 불러오는 다른 로컬 파일)에 나오는 모든 외부 URL의 **호스트**는 기준 main의 `fixtures/external_resources.json` 허용 목록에 있어야 한다. `<base>`, data:/blob:/javascript:/http: 코드 출처, 템플릿으로 만든 호스트는 실패한다. 새 호스트는 허용 목록 PR을 먼저 승인·병합한 뒤 사용한다. 문자열 연결로 쪼갠 호스트는 정적 검사로 보이지 않는다(리뷰로 확인).
- 공개 보호 시간 상수(`PUBLICATION_MAX_AGE` 등)는 페이지에서 한 번만 대입되어야 한다(`test_publication_renewal_margin.mjs`).

## 알려진 검사 제약

- 런타임 감시는 하네스가 실행한 경로만 본다. 정적 문구 검사와 리뷰로 보완한다. 근거 URL·승인 링크는 형식만 검증한다.
- 탐조지 마커 181개 좌표는 index.html 코드 리터럴로도 존재하며 런타임 마커 비교가 보호한다. 유부도·국화도 길찾기 예외 목적지는 `guard.cjs`의 `ROUTE_OVERRIDES`에 있다.
- 기상·조석 자동 생성 JSON 4개는 `test_jeju_sites.py`가 기준 main과 바이트 비교한다(의도된 보호). `publication_ci_signatures.mjs`의 추천 결과 고정 커밋 비교는 범위 재검토 미실시다.
- 실패해도 테스트를 통과시키려고 임의의 예외·허용 목록·정규화를 추가하지 않는다. 실패 원인과 미검증 범위를 보고하고 별도 승인된 개선 PR로 처리한다. 검사 통과가 전체 데이터·기능 검증을 뜻하지 않는다.
