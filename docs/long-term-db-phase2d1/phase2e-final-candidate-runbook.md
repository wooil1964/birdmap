# Phase 2E Final Candidate Runbook

**PRODUCTION — DO NOT RUN WITHOUT SEPARATE PHASE 2E APPROVAL.** Phase 2D.1 재판정은 GO(2026-09-26 14:45Z)지만, 실행은 사용자의 별도 승인과 아래 단계별 확인이 있어야 한다.

이 문서는 GO 판정과 사용자의 별도 승인 뒤에만 쓴다. Phase 2D 문서([production-cutover-runbook](../long-term-db-phase2d/production-cutover-runbook.md))를 대체하지 않는다. 그 문서의 역할·시간창(KST 02:00–04:00)·공지·Abort 기준은 그대로 유효하다. 여기서는 Phase 2D.1 도구로 "BLOCKED"였던 단계를 채운다.

- **USER CONFIRMATION REQUIRED**는 Production 쓰기 단계이며, 단계마다 따로 확인한다.
- Production 쓰기 명령에는 그 명령에만 `PHASE2E_PRODUCTION_WRITE_APPROVED=b48201cc-0abd-4a64-bb61-9dd2a7813d21`를 붙인다.

## 대상 확인

| 항목 | 값 |
|---|---|
| Account | `1d697c22…` |
| Production D1 | `birdmap-reports` / `b48201cc…` |
| Worker | `birdmap-reports`, `birdmap-reports-admin` |
| 금지 혼동 대상 | staging (`f2c65357…`, `*-staging-*`) |

## 0. 사전 (쓰기 없음)

1. drift 확인: reports·Worker·schema·UI·migration 코드 drift가 있으면 NO-GO.
2. Production SELECT preflight.
3. `backfill-runner --dry-run`: `LEGACY_SHARED_MULTI_SPECIES_COUNT`가 나오면 중단.
4. 승인할 artifact의 hash를 기록한다(현재 미커밋 작업물 → 별도 release 승인).

## 1. Freeze 기반 설치

1. **USER CONFIRMATION REQUIRED** — Production safety ledger D1 `birdmap-safety-ledger` 생성 + [ledger DDL](migrations/ledger/0001_safety_ledger.sql).
2. **USER CONFIRMATION REQUIRED** — [0002_system_state.sql](migrations/0002_system_state.sql) 적용. mode NORMAL이라 서비스 영향은 없다.
   - Production에는 `d1_migrations`가 없으므로 이 파일만 담은 전용 migrations 디렉터리로 적용한다.
   - 적용 뒤 `freeze.mjs --status`로 gate present·fingerprint를 기록한다.
3. **USER CONFIRMATION REQUIRED** — 새 빌드 두 Worker를 NORMAL 모드로 배포한다(503 매핑 포함, `REPORTS_OPS_ENABLED` 미설정).
   - 두 Worker의 legacy smoke(GET 200, 합성 제보는 하지 않음)를 확인한다.

## 2. Freeze · Drain · Snapshot

1. 사전 공지를 게시한다.
2. **USER CONFIRMATION REQUIRED** — `freeze.mjs --freeze`. G와 snapshot을 기록한다.
3. `freeze.mjs --drain --generation G` → `drained:true`.
4. Time Travel bookmark를 기록한다(`d1 time-travel info`, 읽기). 이 bookmark는 frozen 상태의 복구 지점이다.

## 3. Schema · Seed · Backfill

1. **USER CONFIRMATION REQUIRED** — 0001_core와 [0003_captcha_redemptions](migrations/0003_captcha_redemptions.sql)를 담은 migrations 디렉터리로 적용한다(ledger에 0002만 있으므로 0001·0003만 pending인지 먼저 확인). schemaReady hash `76b07a46…`를 확인한다.
   - dual-write 제출 경로는 `captcha_redemptions`가 없으면 모든 제출이 실패한다. 따라서 §4의 dual-write 배포 전에 반드시 설치돼 있어야 한다.
2. **USER CONFIRMATION REQUIRED** — admin Worker에 `REPORTS_OPS_ENABLED=true`로 재배포(Access 유지).
3. **USER CONFIRMATION REQUIRED** — seed: `/admin/api/ops/seed`에 `tools/prepare-sites.mjs index.html <고정 시각>` plan을 보낸다. 190개, revision `4a7aba94…`.
4. `backfill-runner --prepare --run-id phase2e-<날짜>` → `--verify-only`(READY_EMPTY). manifest의 N = snapshot count, generation = G인지 확인한다.
5. **USER CONFIRMATION REQUIRED** — `backfill-runner --apply` → `after: VERIFIED`.
6. `--verify-only` → VERIFIED. 재 apply는 added 0.
7. **USER CONFIRMATION REQUIRED** — ops 비활성 재배포(`REPORTS_OPS_ENABLED` 제거).

## 4. Worker cutover · Shadow · Dual-write

1. **USER CONFIRMATION REQUIRED** — 두 Worker를 READ_ONLY_MAINTENANCE env + gate/peer secret·binding으로 배포하고, peer readiness(v3 대칭)를 확인한다.
2. **USER CONFIRMATION REQUIRED** — shadow read(`REPORTS_SHADOW_READ=true`): frozen 자료 전체에서 mismatch 0.
3. **USER CONFIRMATION REQUIRED** — CANONICAL_DUAL_WRITE 배포(public → admin 순서, peer 대칭 확인). DB는 아직 frozen이다.
4. `REPORTS_PENDING_PUBLIC` 값은 운영자가 결정한다(Phase 2D 미결 사항).

## 5. Unfreeze · Reopen

1. **USER CONFIRMATION REQUIRED** — `freeze.mjs --unfreeze`.
2. Reopen smoke test: 제보 1건 201(4테이블 +1), 관리자 action 1건 200(revision +1), 공개 GET 200, shadow mismatch 0.
   - 실패하면 즉시 re-freeze → §6 Abort.
3. 정상화를 공지한다.

## 6. Abort · Rollback

| 시점 | 조치 |
|---|---|
| freeze 전 | 중단만 한다 |
| freeze 후 · core 전 | **USER CONFIRMATION REQUIRED** unfreeze. 구 빌드 동작은 그대로 |
| core/seed/backfill 뒤 | canonical 테이블은 추가형이라 legacy read에 영향이 없다. **USER CONFIRMATION REQUIRED** Worker를 이전 NORMAL 빌드로 rollback한 뒤 unfreeze. 테이블 제거는 별도 결정 |
| dual-write 뒤 이상 | **USER CONFIRMATION REQUIRED** re-freeze → maintenance 배포 → 원인 분석. 필요하면 §7 |

## 7. Time Travel Restore + External Ledger 재-purge

[forbidden-restore-runbook.md](forbidden-restore-runbook.md) §5를 그대로 따른다. 핵심 순서:

1. freeze + drain
2. **ingress 차단** (USER CONFIRMATION)
3. restore (USER CONFIRMATION, 사람이 실행하며 `--json` 금지)
4. `purge-runner --check`
5. `--reconcile` (USER CONFIRMATION)
6. re-freeze
7. ingress 재개 (USER CONFIRMATION) + 노출 0 확인
8. unfreeze + smoke

restore 직후에는 쓰기도 민감자료 조회도 다시 열지 않는다.

## Phase 2E 실행 전 운영자 결정 (Phase 2D에서 넘어온 사항, 기술 NO-GO 아님)

- `REPORTS_PENDING_PUBLIC` 0/1 결정.
- 실제 작업 날짜(KST 02:00–04:00)와 공지.
- 배포 artifact 확정: 현재 작업물은 미커밋이다. commit·release 절차는 별도 승인 사항이다.
- Turnstile redemption guard는 dual-write 경로에만 적용된다. freeze 전 NORMAL 과도기에는 legacy 경로가 기존과 같은 노출 상태임을 수용할지 확인한다.

Turnstile §33은 redemption guard로 해소했다([turnstile-browser-test.md](turnstile-browser-test.md) §5).
