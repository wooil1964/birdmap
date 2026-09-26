# Phase 2D.1 — Production NO-GO 해소

판정: **PHASE 2E PRODUCTION CUTOVER: GO** (2026-09-26 14:45Z 재판정. Phase 2E는 시작하지 않음)

- 1차 판정(14:05Z)은 NO-GO였다. 사유는 Turnstile 동시 검증이었다.
- 원인 분석 결과: 앱은 idempotency_key를 쓰지 않았으므로 key는 원인이 아니다. staging에서 concurrent Siteverify가 복수 success를 반환하는 race-like behavior가 반복 재현됐다.
- 사용자 승인에 따라 application-level redemption guard를 구현했고, 앱 경계에서 PASS했다.
- 아래 설명 중 D에 관한 부분은 1차 판정 당시의 기록이다.

- Phase 2D의 NO-GO 조건 네 가지 중 A·B·C는 해소했다. D(Turnstile)는 실제 브라우저 시험에서 **동시 검증 1회 보장 실패**를 발견했다.
- Production 변경 0, commit 0, push 0. Phase 2E는 시작하지 않았다.

## 읽는 순서

1. [execution-evidence.md](execution-evidence.md) — 모든 실측과 표
2. [freeze-drain-runbook.md](freeze-drain-runbook.md)
3. [backfill-runner-guide.md](backfill-runner-guide.md)
4. [forbidden-restore-runbook.md](forbidden-restore-runbook.md)
5. [turnstile-browser-test.md](turnstile-browser-test.md)
6. [phase2e-final-candidate-runbook.md](phase2e-final-candidate-runbook.md)
7. [CHECKPOINT.md](CHECKPOINT.md), [test-results.json](test-results.json)

## GO 체크리스트

| 조건 | 결과 |
|---|---|
| 모든 write endpoint 확인 | PASS |
| system_state freeze gate | PASS (구 HEAD 바이너리 포함) |
| concurrent freeze race | PASS (5라운드) |
| drain 기준 | PASS |
| unfreeze 정상화 | PASS |
| restore용 hard maintenance barrier | PASS (Worker ingress 차단, restore 뒤에도 유지) |
| production-prep backfill runner | PASS |
| --prepare read-only | PASS |
| dynamic N | PASS (22/23/24/37/400/1000) |
| shared multi-species abort | PASS |
| D1 limits 공식 확인 | PASS (2026-09-26) |
| external forbidden ledger | PASS |
| main restore 후 ledger 생존 | PASS |
| restore 후 재-purge | PASS |
| fresh Turnstile token | PASS |
| reuse reject | PASS (앱 경로). 단, 다른 경로에서는 재사용 토큰이 success |
| expiry reject | PASS |
| concurrent exactly-one (application boundary) | **PASS** — redemption guard 적용 후 같은 토큰·request_id 4개 동시 제출 3라운드 모두 저장 1건, 나머지 CAPTCHA_REUSED 계열. (Siteverify 직접 동시 호출은 여전히 복수 success — 외부 관측 기록) |
| redemption guard 로컬 A–J + 장애 주입 | PASS (11/11) |
| invalid / 만료 시 redemption 0 | PASS |
| Siteverify idempotency retry | PASS (같은 key 재시도는 멱등 success, 새 key는 timeout-or-duplicate) |
| same request_id replay 저장 0 | PASS |
| 기존 회귀 테스트 | PASS (106/32/5/13/17, guard 적용 후 재실행) |
| remote code drift 없음 | PASS (3회) |
| Production write 0 | PASS |

## 변경한 코드 (미커밋)

- `reports-api/src/shared.js`, `public.js`, `canonical/persistence.js`: freeze trigger 거절 → 503 WRITE_MAINTENANCE 매핑.
- `reports-api/src/admin.js`: `REPORTS_OPS_ENABLED`일 때만 동작하는 `/admin/api/ops/seed|backfill` 경로(동적 import).
- 신규 `reports-api/src/canonical/ops.js`.
- Turnstile redemption guard:
  - `canonical/persistence.js`: 같은 batch 안에서 redemption 정리·INSERT, CAPTCHA_REUSED 처리
  - `canonical/data.js`: 테이블·DELETE allowlist 추가
  - `shared.js`: `verifyTurnstile`에 idempotency_key 인자 추가
  - `public.js`: request_id를 key로, token SHA-256을 persistQuick에 전달
  - 신규 [0003_captcha_redemptions.sql](migrations/0003_captcha_redemptions.sql)
  - `reports-api/local-test/helpers.mjs`: 로컬 DB에 0003 추가, fixture 토큰을 요청별 고유값으로 변경
- 신규 `reports-api/tools/`: `d1-rest.mjs`, `freeze.mjs`, `backfill-runner.mjs`, `purge-runner.mjs`.
- 신규 `docs/long-term-db-phase2d1/`: migrations, scripts(staging·로컬 시험), 문서.
