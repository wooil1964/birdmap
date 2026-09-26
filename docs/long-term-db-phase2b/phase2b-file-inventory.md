# Phase 2B 변경·생성 파일 전체 목록

작성 시각: 2026-09-26T10:11:35.963Z. 현재 저장소의 실제 Git/파일 상태를 기준으로 작성했다. Phase 2C는 시작하지 않았으며 이번 요청에서는 코드/DB/Worker를 수정하지 않았다.

## 집계와 기준

| 구분 | 파일 수 | 의미 |
|---|---:|---|
| HEAD 대비 변경된 추적 파일 | 5 | Phase 2B 애플리케이션 변경 |
| Phase 2B 신규 미추적 전달 파일 | 24 | 기존 신규 21개 + 이번 검토 산출물 3개 |
| Phase 2B 변경·생성 전달 파일 합계 | 29 | 아래 A+B 전체 |
| 기존 Phase 1/2A 미추적 파일 | 25 | 시작 manifest에 존재, 원본 SHA-256 동일 |
| 현재 Git 미추적 파일 전체(ignored 제외) | 49 | B+C, untracked-files.txt와 정확히 동일 |
| Phase 2B ignored 로컬 실행 파일 | 49 | 별도 D에 모든 경로 나열 |
| 기타 ignored 파일 | 34 | 기존 Phase 2A 로컬 실행 자료, Phase 2B 신규로 분류하지 않음 |
| staged 변경 | 0 | index 변경 없음 |

미추적 목록의 정의는 `git ls-files --others --exclude-standard -z`다. untracked-files.txt 자체와 이번 패치/목록 파일도 포함했다. ignored 파일은 일반 미추적 목록에서 제외되므로 D에 별도로 기록한다. 전역 Windows Temp의 도구 임시 복사본은 저장소 목록 범위 밖이다.

## A. 변경된 추적 파일 — 5개

- `index.html`
- `reports-api/src/admin-page.js`
- `reports-api/src/admin.js`
- `reports-api/src/public.js`
- `reports-api/src/shared.js`

## B. Phase 2B에서 생성된 미추적 전달 파일 — 24개

- `docs/long-term-db-phase2b/.gitignore`
- `docs/long-term-db-phase2b/CHECKPOINT.md`
- `docs/long-term-db-phase2b/README.md`
- `docs/long-term-db-phase2b/execution-evidence.md`
- `docs/long-term-db-phase2b/phase2b-file-inventory.md`
- `docs/long-term-db-phase2b/phase2b-working-tree.patch`
- `docs/long-term-db-phase2b/preservation.json`
- `docs/long-term-db-phase2b/test-results.json`
- `docs/long-term-db-phase2b/untracked-files.txt`
- `reports-api/local-test/baseline-regression.mjs`
- `reports-api/local-test/helpers.mjs`
- `reports-api/local-test/protocol-check.mjs`
- `reports-api/local-test/repeat-phase2a.mjs`
- `reports-api/local-test/run.mjs`
- `reports-api/src/admin-actions.js`
- `reports-api/src/canonical/control.js`
- `reports-api/src/canonical/data.js`
- `reports-api/src/canonical/persistence.js`
- `reports-api/src/canonical/purge.js`
- `reports-api/src/canonical/shadow.js`
- `reports-api/tools/backfill-lib.mjs`
- `reports-api/tools/prepare-backfill.mjs`
- `reports-api/tools/prepare-sites.mjs`
- `reports-api/tools/sites-seed.mjs`

이번 요청에서 만든 파일은 phase2b-file-inventory.md, phase2b-working-tree.patch, untracked-files.txt 세 개다. 기존 execution-evidence.md에 최신 원격 main 조회 및 검토 증거를 추가했다. 그 외 기존 코드/문서/로컬 DB·시험 자료는 보존했다. 진행 중 나타난 execution-evidence.zip은 사용자가 폐기했다고 확인했고 최종 목록 시점에 존재하지 않아 제외했다. 이 작업에서 ZIP을 생성/삭제하지 않았다.

## C. Phase 2B 시작 전부터 존재한 미추적 파일 — 25개

Phase 1 13개, Phase 2A 12개이며 시작 manifest와 현재 byte hash가 모두 같다. Git 미추적 목록에는 들어가지만 Phase 2B 신규 생성으로 분류하지 않는다.

- `docs/long-term-db-phase1/README.md`
- `docs/long-term-db-phase1/data-dictionary.md`
- `docs/long-term-db-phase1/execution-evidence.md`
- `docs/long-term-db-phase1/operations-and-policy.md`
- `docs/long-term-db-phase1/sql/1000_preflight.readonly.sql`
- `docs/long-term-db-phase1/sql/1001_core_schema.draft.sql`
- `docs/long-term-db-phase1/sql/1002_legacy_history_index.draft.sql`
- `docs/long-term-db-phase1/sql/1003_writer_controls.draft.sql`
- `docs/long-term-db-phase1/sql/1004_sites_seed.draft.sql`
- `docs/long-term-db-phase1/sql/1005_legacy_backfill.draft.sql`
- `docs/long-term-db-phase1/sql/1090_verify.readonly.sql`
- `docs/long-term-db-phase1/sql/SHA256SUMS.txt`
- `docs/long-term-db-phase1/verification-plan.md`
- `docs/long-term-db-phase2a/.gitignore`
- `docs/long-term-db-phase2a/README.md`
- `docs/long-term-db-phase2a/SHA256SUMS.txt`
- `docs/long-term-db-phase2a/data-dictionary.md`
- `docs/long-term-db-phase2a/evidence/local-results.json`
- `docs/long-term-db-phase2a/evidence/preservation.json`
- `docs/long-term-db-phase2a/execution-evidence.md`
- `docs/long-term-db-phase2a/migrations/0001_core.sql`
- `docs/long-term-db-phase2a/proof/fixture.mjs`
- `docs/long-term-db-phase2a/proof/model.mjs`
- `docs/long-term-db-phase2a/proof/run.mjs`
- `docs/long-term-db-phase2a/wrangler.local.toml`

## D. Phase 2B ignored 로컬 실행 산출물 — 49개

실제 경로만 기록했다. 로그/합성 fixture/실패 회차/시험 복사본/로컬 SQLite이며 내용은 패치에 포함되지 않는다. 원격 DB export가 아닌 현재 로컬 파일 목록이다.

- `docs/long-term-db-phase2b/.local/existing-reports-final.tap`
- `docs/long-term-db-phase2b/.local/existing-reports.tap`
- `docs/long-term-db-phase2b/.local/frontend-baseline-final.tap`
- `docs/long-term-db-phase2b/.local/frontend-baseline.tap`
- `docs/long-term-db-phase2b/.local/frontend-final.tap`
- `docs/long-term-db-phase2b/.local/frontend-regression-configured.tap`
- `docs/long-term-db-phase2b/.local/frontend-regression.tap`
- `docs/long-term-db-phase2b/.local/frontend-verified.tap`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/.local/2026-09-26T09-42-45-914Z/wrangler-state/v3/cache/miniflare-CacheObject/metadata.sqlite`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/.local/2026-09-26T09-42-45-914Z/wrangler-state/v3/cache/miniflare-CacheObject/metadata.sqlite-shm`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/.local/2026-09-26T09-42-45-914Z/wrangler-state/v3/cache/miniflare-CacheObject/metadata.sqlite-wal`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/.local/2026-09-26T09-42-45-914Z/wrangler-state/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/.local/2026-09-26T09-42-45-914Z/wrangler-state/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite-shm`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/.local/2026-09-26T09-42-45-914Z/wrangler-state/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite-wal`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/.local/2026-09-26T09-42-45-914Z/wrangler.log`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/evidence/local-results.json`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/migrations/0001_core.sql`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/proof/fixture.mjs`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/proof/model.mjs`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/proof/run.mjs`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/docs/long-term-db-phase2a/wrangler.local.toml`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/index.html`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/package.json`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/schema.sql`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/admin-actions.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/admin-page.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/admin.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/canonical/control.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/canonical/data.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/canonical/persistence.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/canonical/purge.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/canonical/shadow.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/public.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/shared.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/src/site-picker.js`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/test/admin-worker.test.mjs`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/test/helpers.mjs`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/test/public-worker.test.mjs`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/test/site-picker.test.mjs`
- `docs/long-term-db-phase2b/.local/p2a-1790415763484/reports-api/test/validation.test.mjs`
- `docs/long-term-db-phase2b/.local/phase2a-replay.json`
- `docs/long-term-db-phase2b/.local/phase2b-local-results.json`
- `docs/long-term-db-phase2b/.local/protocol-check.tap`
- `docs/long-term-db-phase2b/.local/python-regression.log`
- `docs/long-term-db-phase2b/.local/start-manifest.json`
- `docs/long-term-db-phase2b/.local/synthetic-snapshot.json`
- `docs/long-term-db-phase2b/.local/verify-fixture-1790415852840.sqlite`
- `docs/long-term-db-phase2b/.local/verify-input.json`
- `docs/long-term-db-phase2b/.local/weather-proxy.tap`

## 패치·의존 자료·보존 검증

- 기준 HEAD: `d39bf4bf2d7e147b246f867f56567f814eddd4b9`
- 명령: `git diff --no-color --no-ext-diff --no-textconv --binary --full-index HEAD --`
- 추적 파일 staged/unstaged 전체 diff를 바이트 그대로 저장했다. 미추적 내용은 Git diff에 포함되지 않으며 따로 커밋하거나 패치에 임의 삽입하지 않았다.
- 패치 크기: 25420 bytes
- 패치 SHA-256: `ef752dcd1cd47cac61217f521c6e67c1efa5a3354d968430e42e6ebf2070cb29`
- untracked-files.txt SHA-256: `6060d2fffcc7dc7e8258fe4948bf1b5e00c7df2bc4223b1c6cc6efd76e5d5e95`
- 로컬 시험 재현에는 C의 Phase 2A 기존 의존 파일(migrations/0001_core.sql, proof/fixture.mjs, proof/model.mjs, proof/run.mjs, wrangler.local.toml)도 필요하다. 이들은 신규 파일/추적 패치에 들어가지 않으므로 전체 작업물을 전달할 때 함께 보존해야 한다.
- 시작 보존 근거는 D의 .local/start-manifest.json이다. 경로 구분자를 정규화하여 원본 Phase 1/2A 25개 hash를 확인했다.
- 이번 검토 작업에서 허용한 문서 4개를 제외한 기존 파일 590개의 경로+내용 SHA-256 집계가 시작/종료 동일하다: `8d69893914c6f3a6267b479478b0deea89d39981a1c45720ef29aeeb7fc6d763`. 코드, 기존 증거/시험, ignored 로컬 DB 파일까지 포함한다.
- 원격 main 조회: `15c9b192d2b24faaffb9f44a625dcd43d0e30710`, 2026-09-26T10:06:37.8128022Z UTC
- 로컬 origin/main 참조: `6bf58a583391b174ccd15117ddeaef233010e1ee`; fetch 없이 보존
- commit/push/운영 migration/배포/Phase 2C 시작: 없음
