# Phase 2D.1 CHECKPOINT

STATUS: PHASE 2D.1 COMPLETE — PHASE 2E PRODUCTION CUTOVER: GO (재판정 2026-09-26 14:45Z). Phase 2E NOT STARTED.

## 완료
- A freeze/drain/unfreeze/race/barrier: PASS
- B backfill runner(동적 N·read-only prepare·abort·limits): PASS
- C external ledger·restore 생존·재-purge·crash 복구: PASS
- D Turnstile:
  - 1차 NO-GO. 원인 분석 결과 idempotency_key는 원인이 아님(앱은 key 미사용). staging에서 concurrent Siteverify 복수 success라는 race-like behavior가 반복 재현됨.
  - 사용자 승인 후 application-level redemption guard(captcha_redemptions, 같은 batch, idempotency_key=request_id) 구현.
  - 로컬 11/11 PASS. staging 브라우저: A·B×3·C·D·E·F·J 모두 PASS. 같은 토큰·request_id 4개 동시 → 저장 정확히 1건.
- 회귀: 106/32/5/13/17 + freeze/backfill 10 PASS (guard 적용 후 재실행). drift는 날씨·조석 JSON만. Production 시작=종료.

## 마지막 성공 시험
- 14:43Z staging 복구 확인: 두 Worker READ_ONLY_MAINTENANCE, GET 200 / POST 503, 시험 secret·원래 REPORT_IP_SALT 복원, FK 0.
- 14:43Z production 읽기 재확인.

## 다음 (사용자 결정 — Phase 2E 별도 승인 사항)
1. `REPORTS_PENDING_PUBLIC`, 작업 날짜·공지, commit·release artifact 확정.
2. legacy NORMAL 과도기 동안 Turnstile guard가 없다는 점을 수용할지 결정.
3. Phase 2E를 명시적으로 승인하기 전에는 아무것도 실행하지 않는다.
- destructive staging 시험(restore, backfill rehearsal)을 반복하지 않는다. 재개할 때는 실제 staging 상태를 먼저 확인한다.

## staging 자원
- main D1 f2c65357…: 0002·0003 적용, system_state NORMAL gen18, reports 77, restore 1회 수행.
- rehearsal D1 37520f96… (마지막 N=23, frozen), ledger D1 6e84fce8… (events 5, 모두 completed).
- Workers: public d87f8d26…, admin d733bf66…, 둘 다 READ_ONLY_MAINTENANCE. secret은 기존 staging 값.
- 위젯 birdmap-phase2d-staging-browser 유지(새로 만든 것 없음). 시험 서버 3개 모두 종료.

## Git
- HEAD d39bf4bf…, commit 0, push 0.
- 수정: admin.js, public.js, shared.js, canonical/persistence.js, canonical/data.js, local-test/helpers.mjs.
- 신규: canonical/ops.js, tools 4개, docs/long-term-db-phase2d1/(migrations 0002·0003·ledger, scripts, 문서).

## Production 변경
D1 write 0 · migration 0 · deploy 0 · freeze 0 · Access/route/secret/binding 0 · restore 0.
