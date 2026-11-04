# 현재 유효한 결정

> [AI_WORK_RULES.md](../../AI_WORK_RULES.md)가 최우선이다. 이 문서는 `c40ba6e79b8978ec2b8236afe338444b42b2c018` 기준 자료·코드에 대조한 결정 요약이다. 운영 실시간 상태를 보증하지 않는다. 변경·보류 해제는 별도 작업 범위와 승인을 확인한다.

## 탐조지 등록·좌표

- **삽교호 제외 유지.** [현재 후보 자료](../../data/a-grade-birding-sites-20261031.json)의 `excluded`가 2026-10-18 결정을 유지하며 [중부권 등록 근거](../central-sites-20261018/README.md)도 제외를 명시한다. 현재 Worker 목록에 삽교호 이름은 없다.
- **동림저수지 ID239는 번호만 예약, 미등록.** 같은 후보 자료의 `reservedIds`와 현재 Worker 미등록이 일치한다. 방역 통제의 현재 범위·기간은 이번에 확인하지 않았다. 과거 사유를 현행 통제 사실로 단정하지 않는다.
- **마동호 ID246 등록 보류.** 관리사무소 방문 허용과 공개 관찰 지점의 공식 근거가 미확인이다. ID와 대표점 `35.03541936, 128.38107441`은 후보 자료에 보존한다. 현재 Worker에 등록되지 않았고 [기존 검사](../../.github/scripts/test_a_grade_sites.py)도 예약 상태를 확인한다.
- **산이면 ID138 좌표 임의 보정 금지.** [현재 Worker 목록](../../weather-proxy/src/sites.js)의 좌표는 `34.644702777777781, 126.48733888888889`다. 별도 과거 결정 근거와 runtime·기준 엑셀의 대조는 이번에 확인하지 못했다. 전수 일치 완료로 표현하지 않으며, 변경 시 AI_WORK_RULES.md 5항에 따라 대조·불일치 보고를 먼저 한다.

등록·운영 검증의 최신 확인 기록은 [2026-10-31 결과](../reviews/new-site-candidates/2026-10-31-claude-a-grade-240-deploy.md)다. 기록에 있는 운영 Worker·D1 건수·HTTP 결과는 당시 사실이며 이번에 재조회한 값이 아니다.

## KMA timeout

**8초 유지·관찰, retry 추가와 특정 API만의 timeout 연장은 보류.** [현재 코드](../../weather-proxy/src/index.js)의 `UPSTREAM_TIMEOUT_MS`·`TOMORROW_TIMEOUT_MS`가 모두 `8_000`이다. 병렬 호출 구조를 유지한다.

[과거 진단 원문](../handover-archive/HANDOVER-before-phase1-c40ba6e.md)의 2026-09-23·24 기록에서는 간헐적 상류 지연이 유력했지만 timeout 요청의 headers/body 지연과 10~12초 내 완료 여부는 확인되지 않았다. 야간 22:30~23:30에 반복적인 사용자 영향이 있을 때만 재측정 후 대응을 검토한다. 현재도 장애가 발생한다고 단정하지 않는다. 진단에 키·URL·query·응답 본문을 남기지 않는다.

## 추천 가점용 제보 판정

**판정 분리는 향후 검토이며 미구현.** [현재 공개 API](../../reports-api/src/public.js)의 `/reports/recent-sites`는 위치 가림을 제외하고 공개 보호용 `isSensitiveReport()`를 사용한다. 보호종의 일반 출현도 가점 대상에서 빠질 수 있다. 향후 추천 반영 판정을 분리하더라도 위치 가림·번식 제보·개인정보·민감 위치 보호는 유지한다. 원래 검토 취지는 [아카이브](../handover-archive/HANDOVER-before-phase1-c40ba6e.md)에 보존했다.

## VWorld

**제한값 변경과 캐시 도입 보류.** [정책 조사](../reviews/basemap-pc-wheel-settle/2026-10-28-claude-worker-policy-investigation.md)의 판단대로 실제 거절 규모·Lambda 호출량·키 한도를 확보한 뒤 변경을 검토한다. 캐시는 해당 문서에 기록된 VWorld 사전 승낙 조건이 충족될 때만 검토한다. 이는 기존 조사에 기록된 보류 조건이며 약관의 현재 유효성을 이번에 새로 검증한 것은 아니다.

[현재 타일 Worker](../../vworld-tiles/src/worker.mjs)는 `no-store`, 두 limiter 및 서울 relay 경로를 유지한다. 코드 확인을 운영 지표·키 한도 확인으로 대신하지 않는다.
