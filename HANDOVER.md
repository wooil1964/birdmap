# HANDOVER — 현재 상태와 인수인계

> [AI_WORK_RULES.md](AI_WORK_RULES.md)가 최우선이다. 작업 절차·최소 검사는 [AGENTS.md](AGENTS.md)를 따른다.

## 확인 기준과 현재 서비스

- 1단계 문서 정비 시작 시 main HEAD: `c40ba6e79b8978ec2b8236afe338444b42b2c018`(2026-11-04). 이전 분석 기준 `c40ba6e`와 같다.
- 1·2단계 반영 상태 정리 기준 main HEAD: `7fc90402c7c9578a80ecc0a1451e4c0dd90d0901`(2026-11-04, PR #68 병합 뒤 자동 기상 커밋).
- 서비스 코드 기준은 main의 `index.html`이며 GitHub Pages로 제공한다. 런타임 탐조지는 내부 `siteData`, 기상 Worker 목록은 `weather-proxy/src/sites.js`다. 좌표·ID·기상 분기 필드는 변경 시 양쪽 대조가 필요하다.
- 실시간 기상은 `weather-proxy/`, 저장 기상·조석은 기존 GitHub Actions 자동 갱신 경로를 사용한다. 제보·승인·공개 보호는 `reports-api/`와 D1 관련 코드에 있다.
- `data/`의 엑셀은 오프라인 원본이며 기준 파일은 사용자가 지정한다. 탐조지 수·파일 줄 수는 고정된 현재 사실로 반복하지 않는다.
- 최신 등록 운영 검증 기록은 [2026-10-31 등록 결과](docs/reviews/new-site-candidates/2026-10-31-claude-a-grade-240-deploy.md)다. 해당 문서의 운영·D1·검사 결과는 당시 기록이다. 이번 문서 정비에서는 운영 Worker·D1·브라우저를 실시간 조회하지 않았다.

## 진행 중·보류·확인 필요

- **검사 잔여 제약 C — 미해결**: `site_data_contract.py`의 `assert_engine_matches_base()`가 `siteData` 밖 `index.html` 전체를 PR 기준 main과 비교한다. 팝업·검색·마커·CSS 등 정상 UI 변경도 실패할 수 있다. 개선 시 `siteSpotData` 보호와 JavaScript를 통한 동적 데이터 변경 우회 차단을 유지해야 한다.
- **검사 잔여 제약 D — 일부 미해결**: `test_jeju_sites.py`가 `weather_rules.json`, `notices.json`, `reports-api/tools/sites-seed.mjs`를 기준 main과 바이트 비교한다(`site-picker.js`는 PR #68에서 전용 검사로 이관). 각 기능의 독립 검사를 확인·보강한 뒤에만 고정 비교를 푼다.
- C·D로 실패할 때 통과용 예외·허용 목록·정규화를 임의 추가하지 않는다. 개선은 별도 승인된 PR로 한다.
- **미착수·미실시**: 빠른 탐조지 조회 도구 미착수. 실제 AI 사용량(토큰·시간) 감소 측정 미실시이므로 개선율을 보고하지 않는다. GitHub 브랜치 보호 개선 미착수(공개 API상 main 보호·Ruleset 미적용, 관리자 설정은 미확인). 자동 갱신의 main 직접 커밋 구조를 고려하지 않고 보호를 켜지 않는다.
- **등록 보류**: 삽교호 제외, 동림저수지 239 번호 예약, 마동호 246 등록 보류를 유지한다. 공식 접근 근거 없이 보류를 해제하지 않는다. [유효 결정·현재 자료](docs/decisions/active-decisions.md) 참조.
- **기상**: KMA timeout 8초 유지·관찰 결정이 남아 있다. 현재 장애 발생 여부는 재측정하지 않았다. 과거 403·응답 식별 불일치의 해결 기록을 현재 장애와 혼동하지 않는다.
- **추천**: 공개 보호용 판정과 추천 가점용 판정 분리는 향후 검토이며 구현 완료 상태가 아니다. 위치 가림·번식·민감 위치 보호를 유지한다.
- **VWorld**: 제한값 변경·캐시 도입은 보류 조건을 유지한다. 실제 거절 규모·키 한도 및 캐시 승낙 조건을 먼저 확인한다.
- **모바일**: 과거 기록상 관리자 화면의 실제 휴대폰 승인·공개 취소 및 소프트 키보드 동작은 미확인이었다. 이번에 재검증하지 않았으므로 해결 완료로 표시하지 않는다.
- **과거 후보·eBird**: 원문의 보류 후보·Hotspot 공백 목록은 당시 기록이다. 새 작업에서 현재 코드와 공식 근거를 대조하기 전 현재 전체 미반영 목록으로 사용하지 않는다.

## 현재 유효한 결정 요약

| 결정 | 적용·근거 |
|---|---|
| 삽교호 제외·239 예약·246 보류 | [현재 후보 자료](data/a-grade-birding-sites-20261031.json), [등록 검증 기록](docs/reviews/new-site-candidates/2026-10-31-claude-a-grade-240-deploy.md) |
| 산이면 ID138 좌표 보존 | Worker 현재 좌표는 확인했으나 runtime·기준 엑셀 전수 대조는 이번 범위에서 미실시. 임의 보정 금지 |
| KMA 8초 유지·조건부 재측정 | 현재 코드와 [과거 진단·판단 원문](docs/handover-archive/HANDOVER-before-phase1-c40ba6e.md) |
| 추천용 제보 판정 분리 검토 | 현재 `reports-api/src/public.js` 경로와 보호 조건 유지 |
| VWorld 제한·캐시 변경 보류 | [정책 조사와 재검토 조건](docs/reviews/basemap-pc-wheel-settle/2026-10-28-claude-worker-policy-investigation.md) |

각 결정의 확인 범위와 남은 조건은 [active-decisions.md](docs/decisions/active-decisions.md)에 기록한다. 과거 문서의 완료·미병합·배포·DB 건수는 해당 시점의 사실이며 현재 상태로 승계하지 않는다.

## 다음 작업자의 주의사항

1. 최신 main과 작업 트리 상태를 확인하고 AI_WORK_RULES.md를 읽는다. 사람이 수정하는 코드는 작업 브랜치 → PR → CI 확인 → 사용자 승인 후 병합이 기본이다. 브랜치 보호 활성화 여부를 이 절차만으로 단정하지 않는다.
2. 변경 영역·위험 조건을 정한 뒤 필요한 문서·코드와 최소 검사만 선택한다. CI가 다루지 않는 영향은 따로 검증하며 CI 통과 전 정상 완료라고 보고하지 않는다. 범위 확대 전 사용자 승인을 받는다.
3. 좌표·종·ID·기상 이중 관리·조석 연결은 원본 규칙을 지킨다. 자동 생성 파일을 직접 수정하지 않고, `docs/`의 CI 실행 스크립트를 기록 문서로 오인해 삭제·이동하지 않는다.
4. 제보 승인·민감지·이름 공개 동의·시크릿·운영 조치가 관련된 경우에만 아카이브의 해당 운영 메모와 현재 코드를 대조한다. 과거 DB 0건·Worker version·시험 데이터 정리 결과를 현재 상태로 간주하지 않는다. 운영 변경은 해당 작업의 승인 범위를 확인한다.
5. 완료 기록은 아래 최대 3줄만 남기며 상세 근거·검증 결과는 PR 또는 `docs/handover-archive/`에 기록한다. 새 기록 때문에 과거 사실·결정 근거·검증 결과를 삭제하지 않는다. HANDOVER.md 본문은 10KB 이내로 유지한다. 초과할 경우 종료된 작업 기록을 docs/handover-archive/로 이관하고, 현재 유효한 결정과 다음 작업자의 주의사항은 보존한다.

## 최근 완료 작업

- 1단계 [PR #67](https://github.com/wooil1964/birdmap/pull/67) 병합(`2f10a20f`): AGENTS.md 신설, 규칙·CLAUDE.md 간소화, HANDOVER 축소, 유효 결정 기록 신설.
- 2단계 [PR #68](https://github.com/wooil1964/birdmap/pull/68) 병합(`49122824`): 고정 개수·과거 커밋 비교를 PR 기준 main 비교(`site_data_contract.py`)로 개편. ID·좌표·pelagic·runtime·Worker 보호 유지. 병합 후 push 기상 갱신 성공(실행 `41808015850`, 자동 커밋 `7fc90402`; 실행 보고상 Windy 429로 Open-Meteo 대체 경로 사용). 병합 후 schedule 실행 결과는 이 기록 시점에 없었다.
- 정비 전 HANDOVER 전체 원문은 [기준 커밋 아카이브](docs/handover-archive/HANDOVER-before-phase1-c40ba6e.md)에 보존했다. 이 아카이브는 당시 기록이며 현재 지침이 아니다.
