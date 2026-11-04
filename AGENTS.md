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

아래는 현재 존재를 확인한 검사다. 짧은 파일명은 `.github/scripts/` 기준이며 모두 실행하라는 목록이 아니다. 영향 항목을 빠뜨리지 않되, 재편 중인 최소 조합은 **2단계에서 확정**한다.

| 변경 영역 | 대응 검사·상태 |
|---|---|
| 문서만 | `git diff --check`, `git diff --name-only`, `git status --short`; 링크·우선순위·크기·기록 보존 대조 |
| 탐조지·좌표·ID | `test_central_sites.py`, `test_jeju_sites.py`, `test_metro_sites.py`, `test_a_grade_sites.py`; 최소 조합은 2단계에서 확정 |
| 추천 | `test_weekly_recommendation.mjs`, `test_recommendation_contract.mjs`; 고정 비교 적용 범위는 2단계에서 확정 |
| 기상·조석 | `test_weather.py`, `test_validator_time_contract.py`, `test_tide.py`, `test_today_weather_midnight.mjs`, `test_tide_fallback.mjs` 중 영향 검사 |
| Worker·공개 보호 | `weather-proxy/test/*.test.mjs`, `reports-api/test/*.test.mjs`; 최소 조합은 2단계에서 확정 |
| 지도·팝업 | `test_basemap_controller.mjs` 등 해당 검사; 브라우저 조합은 2단계에서 확정 |
| SEO·공유 | `build_seo_pages.py --check`, `test_seo_pages.py`, `test_share_pages.py` 중 영향 검사 |

탐조지 개수 고정 검사와 과거 고정 입력·커밋 비교에는 알려진 제약이 있다. 통과가 현재 전체 데이터 검증을 뜻하지 않는다. 테스트를 통과시키려고 임의의 예외·허용 개수·정규화를 추가하지 않는다. 제약과 미검증 범위는 후속 작업으로 보고한다.
