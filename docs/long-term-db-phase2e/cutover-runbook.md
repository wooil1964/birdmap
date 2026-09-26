# Phase 2E Cutover Runbook (확정 명령)

- artifact: 브랜치 `phase2e-cutover`, 커밋 **`183cef95bffaeaed80fe04d0b3af4e397957001d`**. 배포는 이 커밋의 작업 트리에서만 한다.
- 모든 명령은 저장소 루트에서 실행한다. `[P]`는 Production 쓰기다. 운영자의 단 한 번의 "Phase 2E 실행 승인" 뒤 연속 실행한다.
- Time Travel restore와 git push는 이 runbook에 포함되지 않는다(각각 별도 승인).

```
W="node C:/Users/김진호/AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js"
T=docs/long-term-db-phase2e/targets/production.json
APPROVE="PHASE2E_PRODUCTION_WRITE_APPROVED=b48201cc-0abd-4a64-bb61-9dd2a7813d21"
```

| # | 단계 | 명령 | 통과 기준 | 실패 시 |
|---|---|---|---|---|
| 0 | 재확인(읽기) | KST, `git rev-parse HEAD`(=183cef95), `git status`(깨끗함), `node docs/long-term-db-phase2e/scripts/production-readonly-preflight.mjs predestructive` | drift 0, Worker version 57849940/1eebcf4e 그대로 | ABORT BEFORE MUTATION |
| 1 | recovery point(읽기) | `$W d1 time-travel info birdmap-reports --json` | bookmark를 받아 CUTOVER-LOG에 B0으로 기록 | ABORT |
| 2 | Access 토큰(운영자 브라우저) | `docs/long-term-db-phase2c/.local/cloudflared.exe access login https://birdmap-reports-admin.wooil-birdmap.workers.dev` → `node docs/long-term-db-phase2e/scripts/prod-ops.mjs access-token` | CAPTURED, 4개 검사 true | ABORT |
| 3 | [P] safety ledger | `$W d1 create birdmap-safety-ledger` → 새 id를 `$T`의 `ledger_database_id`와 `wrangler.migrate-ledger.json`에 기록 → `$W d1 migrations apply birdmap-safety-ledger --remote -c docs/long-term-db-phase2e/wrangler.migrate-ledger.json` → `node reports-api/tools/purge-runner.mjs --check --target $T` | 0001_safety_ledger 적용, events 0. staging ledger id가 아님 | ABORT (main 무변경) |
| 4 | [P] main migrations | `$W d1 migrations apply birdmap-reports --remote -c docs/long-term-db-phase2e/wrangler.migrate-main.json` | pending이 정확히 0001_core/0002_system_state/0003_captcha_redemptions일 때만 적용 → `node docs/long-term-db-phase2e/scripts/prod-verify.mjs schema` 전 항목 pass | ABORT. 추가형이라 DROP하지 않는다. legacy 서비스는 그대로 |
| 5 | [P] maintenance 배포 | `cd reports-api && $W deploy -c wrangler.public.toml --var REPORTS_WRITE_MODE:READ_ONLY_MAINTENANCE` → `$W deploy -c wrangler.admin.toml --var REPORTS_WRITE_MODE:READ_ONLY_MAINTENANCE REPORTS_OPS_ENABLED:true` | 새 version ID 기록 | Worker rollback(§Rollback A) |
| 6 | [P] gate secret | `node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > ../docs/long-term-db-phase2e/.local/gate.tmp` → `$W secret put REPORTS_GATE_TOKEN -c wrangler.public.toml < ../docs/long-term-db-phase2e/.local/gate.tmp` → admin도 같은 파일로 → tmp 삭제. 값은 출력하지 않는다 | `prod-verify.mjs workers READ_ONLY_MAINTENANCE`: previews off, 단일 version, secret 이름에 REPORTS_GATE_TOKEN → `prod-verify.mjs http maintenance`: GET 200, POST 503+60, 관리자 POST 503 | Rollback A |
| 7 | [P] freeze | `env $APPROVE node reports-api/tools/freeze.mjs --freeze --reason phase2e-cutover --confirm FREEZE_WRITES --target $T` | changes=1, generation G, snapshot(N·digest) 기록 | 원인 확인. maintenance 유지 |
| 8 | drain(읽기) | `node reports-api/tools/freeze.mjs --drain --generation G --rounds 4 --interval 20 --target $T` | drained:true. **frozen N = snapshot.count** | ABORTED — MAINTENANCE HELD |
| 9 | [P] seed | `env $APPROVE node docs/long-term-db-phase2e/scripts/prod-ops.mjs seed <고정 ISO 시각>`를 2회 | 1회: added 190. 2회: verified 0 | MAINTENANCE HELD |
| 10 | manifest(읽기) | `node reports-api/tools/backfill-runner.mjs --dry-run --target $T` → `--prepare --run-id phase2e-20260927 --out docs/long-term-db-phase2e/.local/manifest.json --target $T` → `--verify-only --manifest …` | 다종 공유수량 0, READY_EMPTY, manifest N = frozen N, generation = G. manifest(내용 없음)를 `manifest-summary.json`으로 복사 | MAINTENANCE HELD |
| 11 | [P] backfill | `env $APPROVE node reports-api/tools/backfill-runner.mjs --apply --manifest docs/long-term-db-phase2e/.local/manifest.json --target $T` → `--verify-only` → `node docs/long-term-db-phase2e/scripts/prod-verify.mjs backfill` | applied N, after VERIFIED, 재실행 added 0. 투영 22필드 동일, count 의미·site·provenance pass | 부분 상태는 덮어쓰지 않는다. MAINTENANCE HELD |
| 12 | [P] dual 배포 | `cd reports-api && $W deploy -c wrangler.public.toml` → `$W deploy -c wrangler.admin.toml` (ops 경로 꺼짐) | `prod-verify.mjs workers CANONICAL_DUAL_WRITE` → `prod-verify.mjs http dual-frozen`: capabilities canonical, legacy 형식 POST → 400 NON_BREEDING_CONFIRMATION_REQUIRED(정본 경로가 처리), admin ready | 둘 다 step 5 maintenance version으로 rollback, freeze 유지 |
| 13 | reopen gate(읽기) | `freeze.mjs --status`(generation G, digest = step 8), `backfill-runner --verify-only`(VERIFIED), `prod-verify.mjs schema/backfill/workers` | 전부 pass | MAINTENANCE HELD |
| 14 | [P] unfreeze | `env $APPROVE node reports-api/tools/freeze.mjs --unfreeze --reason phase2e-reopen --confirm UNFREEZE_WRITES --target $T` | changes=1, NORMAL | — |
| 15 | smoke | `prod-verify.mjs http open`. 운영자가 실서비스에서 비민감 관찰 1건 제출(메모 "Phase2E smoke") → 읽기로 reports/raw/checklists/sightings/captcha_redemptions 각 +1 확인 → 관리자 화면에서 그 건 "반려" → reviews +1, audit +1 | 전부 통과 | 즉시 step 7 freeze → 조사 |
| 16 | 사후(읽기) | `prod-verify.mjs backfill after-reopen`, `production-readonly-preflight.mjs end`, staging maintenance 재확인 | 불변식 pass, drift 0 | freeze 후 보고 |

## Rollback

- **A. freeze 전 Worker 문제**: `$W rollback 57849940-c4b6-494f-88e9-27ec2e327cd9 --name birdmap-reports -m "phase2e abort"`, `$W rollback 1eebcf4e-e7e0-4b94-bdf2-65c44962c21a --name birdmap-reports-admin -m "phase2e abort"`. 이것은 현재 production(legacy NORMAL)으로 돌아가는 것이다. preview 설정은 스크립트 단위이므로 rollback 뒤 `prod-verify.mjs workers`로 확인한다. 추가된 스키마와 ledger는 두어도 legacy에 영향이 없다.
- **B. freeze 뒤 reopen 전**: 기본은 `ABORTED — MAINTENANCE HELD`(frozen + maintenance)다. legacy 서비스로 되돌리려면 운영자 판단으로 A의 rollback을 한 뒤 unfreeze한다. canonical 행이 남아 있어도 legacy는 무시한다.
- **C. reopen 뒤 앱 오류**: 즉시 step 7 freeze → step 5 maintenance version으로 rollback → DB 불변식 비교 → 운영자 보고.
- **D. 데이터 손상 의심**: freeze 유지 → `TIME TRAVEL RESTORE RECOMMENDED`로 보고하고 멈춘다. restore는 별도 승인을 받은 뒤 [forbidden-restore-runbook](../long-term-db-phase2d1/forbidden-restore-runbook.md) §5를 따른다(ingress barrier → restore B0 → ledger reconcile → re-freeze → 확인 → reopen).

## Critical path (예상)

| 구간 | 예상 |
|---|---|
| 0–2 확인·Access 로그인 | 5–10분 |
| 3–6 ledger·migration·maintenance 배포·secret | 10–15분 |
| 7–11 freeze·drain·seed·manifest·backfill·검증 | 10–15분 (drain 60초 포함) |
| 12–13 dual 배포·검증 | 5–10분 |
| 14–16 reopen·smoke·사후 검증 | 10–15분 |
| **합계** | **약 45–65분**. 제보·관리자 쓰기 중단은 step 5부터 14까지 약 30–45분 |
