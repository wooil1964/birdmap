# Phase 2D.1 실행 증거

최종 판정: **PHASE 2E PRODUCTION CUTOVER: GO** (2026-09-26 14:45Z). 1차 판정 NO-GO의 유일한 원인이던 Turnstile §33은 사용자가 승인한 application-level redemption guard로 해소했다(§9). GO라도 Phase 2E는 시작하지 않았다. 시각은 2026-09-26 UTC. 기계 판독 결과: [test-results.json](test-results.json). 비공개 원본은 `.local/`(ignored).

## 1. 시작·종료 상태

| 항목 | 시작 (12:57Z) | 파괴적 staging 직전 (13:14Z) | 종료 (14:01Z) |
|---|---|---|---|
| branch / HEAD | main / d39bf4bf… | 동일 | 동일 |
| GitHub main | 15c9b192… | 15c9b192… | 7686c688… (+1 자동 커밋) |
| HEAD→remote 차이 | 날씨·조석 JSON 5개 | 동일 | 동일 5개, reports·Worker·schema·UI·migration drift 0 |
| Production reports | 23 / 19 / 4 / 0 | 23 / 19 / 4 / 0 | 23 / 19 / 4 / 0 |

Production 시작·종료 비교: 12개 SELECT 결과, schema fingerprint `e2dd02bd…`, 두 Worker version(`57849940…`, `1eebcf4e…`)·binding·subdomain 설정이 **완전히 같다**. 모든 production query의 `rows_written=0`.

## 2. 쓰기 경로 전수 조사 (§5)

코드 전체에서 `.run()`, `.batch(`, `INSERT/UPDATE/DELETE`를 조사했다. CI(.github)·weather-proxy에는 D1 쓰기가 없다.

| method | endpoint | Worker | 현재 mutation | freeze 시 기대 | drain 확인 |
|---|---|---|---|---|---|
| POST | /reports (legacy NORMAL) | public | `INSERT reports` 1문 | trigger ABORT → 새 빌드 503 WRITE_MAINTENANCE, 구 빌드 409 | reports digest 불변 |
| POST | /reports (dual) | public | batch: assertion+`INSERT reports`+raw+checklist+sighting | 같은 batch 안 trigger ABORT → 전체 rollback, 503 | reports+canonical digest |
| POST | /admin/api/reports/:id (8 action, legacy) | admin | `UPDATE reports` 1문 | trigger ABORT → 새 빌드 503, 구 빌드 500 | reports digest |
| POST | /admin/api/reports/:id (8 action, dual) | admin | batch: checklists/sightings UPDATE + `UPDATE reports` + reviews/audit | 전체 rollback, 503 | 두 digest |
| POST | /admin/api/ops/seed, /ops/backfill (신규, `REPORTS_OPS_ENABLED`일 때만) | admin | sites / canonical INSERT (reports 쓰지 않음) | **freeze를 요구**(batch 안 assertion: READ_ONLY_MAINTENANCE+generation) | canonical digest 는 의도적으로 변함 |
| — | `purgeForbidden()` | 내부 함수, HTTP 경로 없음 | DELETE | 경로 없음 | — |
| — | 운영자 REST/wrangler (`freeze.mjs`, `purge-runner.mjs`) | Cloudflare API | system_state UPDATE, purge DELETE | 운영자 전용, DELETE는 trigger 대상 아님 | 도구 출력 |
| GET/OPTIONS | 공개 5개 경로, 관리자 3개 경로, `/_internal/reports-capability` | 둘 다 | 없음 | 계속 200 | — |

누락된 앱 쓰기 경로는 없다. 모든 앱 mutation은 같은 문장이나 같은 batch 안에서 `reports`를 INSERT/UPDATE한다. 따라서 `reports` trigger가 모든 앱 경로를 원자적으로 막는다.

## 3. Freeze (A)

**설계**: [migrations/0002_system_state.sql](migrations/0002_system_state.sql). `system_state(id=1, mode, generation, reason, updated_at)` 한 행과 `reports` BEFORE INSERT/UPDATE trigger로 구성한다. trigger는 쓰기 문장 자체와 같은 트랜잭션에서 실행되므로 앱이 미리 SELECT하는 방식이 아니다. 행이 없으면 frozen으로 취급한다(fail closed). 상태 전이는 mode 반전과 generation +1만 허용하고 DELETE는 금지한다. Phase 1식 permit/ledger 구조는 되살리지 않았다. 기존 `transaction_assertions`는 ops batch의 frozen 확인에만 재사용했다.

**로컬**(Miniflare, `.local/local-freeze-backfill.json`) 10/10 PASS. 현재 production 소스와 같은 **HEAD legacy 코드**를 `git show`로 임시 폴더에 꺼내 실행했다.

| 경로 (frozen) | HEAD 바이너리 | 새 빌드 |
|---|---|---|
| POST /reports | 409 DUPLICATE_REPORT, 쓰기 0 | 503 WRITE_MAINTENANCE, Retry-After 60 |
| admin mutation | 500 INTERNAL_ERROR, 쓰기 0 | 503 WRITE_MAINTENANCE, Retry-After 60 |

→ 구 바이너리·preview URL·옛 version도 DB에서 막힌다. 올바른 503 응답을 내려면 새 빌드를 freeze **전에** 배포해야 한다.

**staging**(실제 D1 `f2c65357…`, 실제 HTTP, 실제 Access JWT):

| 시험 | 결과 |
|---|---|
| basic 9/9 | NORMAL 쓰기 정상 → freeze(changes=1, generation+1, 같은 batch snapshot) → POST /reports·injected POST·관리자 8 action 모두 503+60, reports/canonical digest 불변 → 공개 GET 5·관리자 GET 3 모두 200 → drain 4라운드/60초 → 잘못된 generation은 NOT drained → 이중 freeze는 TRANSITION_NOT_APPLIED → unfreeze 후 201/200/200 |
| race 3라운드 (250ms 간격) | 각 라운드 public 6 commit/6 차단, admin 3/3. 최종 digest = freeze 순간 snapshot |
| race burst 2라운드 (freeze ±150ms) | 2/10, 1/5; 3/9, 0/6. 최종 digest = freeze snapshot |
| dual 3/3 | CANONICAL_DUAL_WRITE: quick 201·admin 200 → frozen 시 두 batch 503, 두 digest 불변 → unfreeze 뒤 정상 |

Race 판정 기준: 201을 받은 행은 모두 freeze snapshot에 있다. 503을 받은 요청은 흔적이 0이다. 관리자 200은 반영됐고 503은 이전 값을 유지했다. freeze snapshot 이후 commit은 0건이다.

## 4. Drain 기준 (F)

drain은 다음을 모두 만족해야 성립한다(`tools/freeze.mjs --drain`).

1. freeze UPDATE의 `changes=1`과 새 generation G를, snapshot과 같은 REST batch에서 얻는다. D1은 batch 안 문장을 다른 query와 섞지 않고 순차 실행한다.
2. 4개 gate trigger가 존재하고 SQL fingerprint가 모든 라운드에서 같다(staging `e9f55bcf…`).
3. `mode=READ_ONLY_MAINTENANCE`이고 generation이 G에서 변하지 않는다.
4. reports 전체 digest(행 수·max received/decided 포함)와 canonical 7개 테이블 digest가 모든 라운드에서 같다.

시간 대기는 보조 증거일 뿐이다. 정의는 D1의 직렬화와 trigger다. freeze commit 뒤 도착한 앱 쓰기는 구조적으로 commit될 수 없다.

## 5. Unfreeze (G)

basic·race·dual·restore 이후 모두에서 `--unfreeze`(changes=1, generation+1)를 실행했다. 이후 공개 POST 201, 관리자 200, GET 200을 확인했다. staging main의 최종 generation은 18, mode는 NORMAL이다. 두 staging Worker는 env 수준에서 READ_ONLY_MAINTENANCE다.

## 6. Hard maintenance barrier (H)

Time Travel restore는 `system_state`도 과거로 돌린다. 실측: purge 이전 bookmark로 restore하자 mode가 frozen(gen15)에서 **NORMAL(gen14)**로 되돌아갔다. 따라서 D1 밖의 barrier로 **Worker ingress 차단**을 선택했다. Cloudflare API로 두 Worker의 `workers.dev`와 preview URL을 끄고 custom domain 0을 확인한다(`ingressClosed()`). 모든 version에 적용되며 D1 내용과 무관하다. 새 인프라는 필요 없다.

- 전파: 차단 뒤 약 15초 안에 public·admin 모두 404가 됐다. 연속 3회 확인한 뒤에만 다음 단계로 진행한다.
- restore 뒤에도 barrier는 유지됐다(closed=true, HTTP 404).
- 한계: zone route는 도구가 조회하지 않는다. production에는 없음(Phase 2D 조사: custom domain 0)을 runbook에서 수동 확인한다. 차단 직전에 진입한 in-flight 요청은 restore 뒤 쓰기가 가능할 수 있다. 이를 막기 위해 restore 대상은 freeze 이후 bookmark를 우선 사용하고, restore 직후 re-freeze한다.

## 7. Backfill runner (I, J)

도구: `reports-api/tools/backfill-runner.mjs` (의미는 [backfill-runner-guide.md](backfill-runner-guide.md) 참조).

- apply는 원자성이 **문서화된** Worker binding `batch()`만 사용한다(admin ops route). REST batch는 원자성이 문서화돼 있지 않아 apply에 쓰지 않는다.
- Worker 쪽 query 수는 N과 무관하게 12회로 고정이며 쓰기는 batch 1회다.

**D1 limits 공식 확인** — 2026-09-26, https://developers.cloudflare.com/d1/platform/limits/ (페이지 갱신 2026-04-21)

| 항목 | Free | Paid |
|---|---|---|
| Queries per Worker invocation | 50 | 1,000 |
| SQL statement length | 100 KB | 100 KB |
| Bound parameters per query | 100 | 100 |
| Query duration | 30 s | 30 s |
| Time Travel | 7일 | 30일 |

- 공식 문서: batch 안의 각 문장에 개별 query 한도가 적용된다. `batch()`는 SQL 트랜잭션으로 실패 시 전체 rollback된다(https://developers.cloudflare.com/d1/worker-api/d1-database/).
- 계정 plan은 subscriptions GET이 403이라 미확정이다.
- 현재 production N=23: batch 72문, 최대 bound parameter는 checklist INSERT 약 40개(<100), 문장 길이는 raw payload 약 2KB 수준(<100KB).

**실측 (staging rehearsal D1 `37520f96…`)**

| N | batch 문장 | apply 시간 | 결과 |
|---:|---:|---:|---|
| 22 | 69 | 4.3 s | PASS |
| 23 | 72 | 4.4 s (동적 import 수정 후 재확인 6.7 s) | PASS |
| 24 | 75 | 3.8 s | PASS |
| 37 | 114 | 5.2 s | PASS |
| 400 | 1,203 | 5.7 s | PASS |
| 1,000 | 3,003 | 6.4 s | PASS |

- N=1000의 3,003문 batch가 성공했으므로, 이 계정에서 batch는 per-invocation query 한도에 1회로 계산된다(실측). 현재 N=23 대비 여유가 40배 이상이다.
- 모든 cohort에서: `--prepare`는 write 0이고 전후 digest가 같다. manifest에 payload(합성 종명)가 없다. raw/checklist/sighting은 각각 N건, reviews/audit/assertions는 0건이다. 재 apply는 0건 추가이고 VERIFIED다.
- 중단 경로 PASS:
  - 변조 manifest → MANIFEST_INVALID
  - source 1행 추가+재freeze → MANIFEST_MISMATCH(source_row_count, rejected_count, source_digest, freeze_generation)
  - sighting 1건 삭제 → PARTIAL_OR_DRIFT(verify와 apply 모두 덮어쓰지 않음)
  - 다종+공유수량 → LEGACY_SHARED_MULTI_SPECIES_COUNT(dry-run·prepare 모두 중단, manifest 미생성)
  - Production 쓰기 guard(네트워크 호출 없는 단위 시험)
- **Production 읽기 전용**:
  - `--dry-run`: 23건(approved 19, rejected 4, pending 0), count 1=15, NULL=8, site NULL=5, 다종 0, batch 72, REST reads 3, writes 0
  - `--prepare`: FREEZE_REQUIRED로 거부, manifest 미생성

## 8. External safety ledger (K, L, M)

- 저장소: 별도 D1 `birdmap-safety-ledger-staging` (`6e84fce8…`). 선택 근거는 [forbidden-restore-runbook.md](forbidden-restore-runbook.md) §1.
- 스키마 [migrations/ledger/0001_safety_ledger.sql](migrations/ledger/0001_safety_ledger.sql): 컬럼 9개(id·유형·source UUID·사유·정책버전·actor_ref·state·시각 2개). 좌표·종·노트·이름·hash 없음. DELETE 금지(시험에서 실제 거부 확인). intent→completed 전이만 허용.
- purge 결과: 합성 3종(reports만 있는 legacy, native dual 4테이블, backfill된 legacy)을 purge했다. 잔존 0, tombstone 1, 공개·관리자 노출 0, status 404, 재실행 멱등.
- restore: purge 이전 bookmark `00000012-00000006-000050f2-1d1b…`로 **1회** 수행. wrangler 응답의 previous_bookmark는 `00000012-ffffffff-…`.
  - main: 금지행 3건이 모두 부활했다(잔존 1/4/4). system_state도 NORMAL gen14로 되돌아갔다.
  - ledger digest `deecf0cc…`는 restore 전후 같다. **ledger 생존 PASS**.
  - `--reconcile`(gate=ingress_barrier): 3건 재-purge, all_clean. 재실행 시 재-purge 0. tombstone 3.
  - re-freeze → ingress 재개 → 노출 0 → unfreeze → 폐기된 native request_id 재제출 410, 신규 201.
- crash 창: A(intent만 기록) → reconcile이 purge와 complete를 수행. B(main 삭제 후 미완료) → tombstone 보완과 complete. 이후 intent 0, 잔존 0.

## 9. Turnstile (N, O, P)

공식 확인: 2026-09-26, https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ (갱신 2026-09-16). 문서 내용: 토큰 유효 5분, 1회만 검증 가능, 재사용 시 `timeout-or-duplicate`, `idempotency_key`(UUID)로 안전한 재시도 가능. 같은 key로 재전송한 경우의 동작은 명시가 없다.

- 위젯: `birdmap-phase2d-staging-browser`(managed)만 사용. production 위젯과 secret은 사용하지 않았다.
- 사용자가 브라우저에서 토큰 10개를 발급했다. 토큰 값은 어디에도 기록하지 않았다.

| 시험 | 결과 |
|---|---|
| A fresh | **PASS** — 201, 4테이블 각 +1 |
| B reuse (앱, 순차) | **앱은 PASS** — 403 CAPTCHA_FAILED, DB 0. **그러나** 직후 같은 토큰을 로컬에서 직접 Siteverify하자 `success:true` |
| C 만료 (310초, 미사용 토큰) | **PASS** — 앱 403, DB 0. 직접 첫 사용 → `invalid-input-response`(문서의 timeout-or-duplicate가 아님) |
| D invalid | **PASS** — 403, 직접 → `invalid-input-response` |
| §33 직접 동시 5회 ×2 | **FAIL** — 성공 5/5, 5/5 |
| §33 앱 동시 4건 ×3 | **FAIL** — commit 4/4, 3/4. 3라운드는 rate limit 429×4(측정 무효) |
| §34 replay | **PASS** — 같은 request_id+payload replay 201, insert 0. replay에 쓴 새 토큰이 이후 새 제보에서 201 → replay는 토큰을 소비하지 않음. 응답 본문 비교는 키 순서까지 보는 비교라 false였으므로 본문 동일성은 이번에 주장하지 않는다(Phase 2C deepEqual 증거는 있음) |
| §35 idempotency_key | 첫 호출(key K) 성공 → 같은 K 재시도 **성공** → 새 key 실패(`timeout-or-duplicate`) → key 없음 실패. 같은 key 재시도가 안전하다는 것을 확인했다. 앱은 현재 key를 보내지 않는다 |

**1차 해석 (당시 NO-GO)**: 2026-09-26 staging 실측에서 동일 Turnstile token의 concurrent Siteverify 요청이 복수 success를 반환하는 race-like behavior가 관측됐다. 앱은 Siteverify 결과에만 의존했으므로 토큰 하나로 여러 건이 commit됐다. 공식 문서는 token을 single-use로 명시한다.

**원인 분석 재시험**: 앱은 `idempotency_key`를 보내지 않았고 1차 동시 시험도 key 없이 수행했다. 따라서 key는 원인이 아니다. 새 토큰으로 서로 다른 UUID key 동시 5회 ×2, key 없이 동시 5회 ×2를 다시 했고 모두 5/5 success였다(race-like behavior 반복 재현). 순차 재사용은 매번 `timeout-or-duplicate`였다.

**해소 (사용자 승인)**: 공식 single-use 계약에 더해 앱 수준의 redemption uniqueness를 defense-in-depth로 적용했다. `captcha_redemptions`에 token SHA-256을 PK로 넣고, 제보 저장과 같은 batch에서 처리한다. `idempotency_key=request_id`도 추가했다.
- 로컬 11/11 PASS(장애 주입 G1·G2, PK rollback H, cleanup I 포함).
- staging 실제 브라우저: 같은 토큰으로 request_id 4개를 동시에 보낸 시험 3라운드 모두 **저장 정확히 1건**, 나머지는 CAPTCHA_REUSED(한 건은 CAPTCHA_FAILED). replay 저장 0, payload 변경 409, invalid·만료 redemption 0, API 노출 0.
- 상세: [turnstile-browser-test.md](turnstile-browser-test.md) §5. **Turnstile D는 application boundary 기준 PASS.**
- 남은 범위: legacy NORMAL 경로(현재 production, request_id 없음)는 guard를 적용하지 않았다. 과도기 동안은 기존과 같은 노출이며 IP rate limit만 걸린다.

## 10. 회귀 (Q)

- legacy 106/106, local32 32/32, protocol 5/5, gate 13/13, Phase 2A 17/17: 모두 PASS.
- Phase 2A 시험 17이 처음 FAIL했다. 원인은 `src/canonical/ops.js`가 `tools/`를 정적 import하는데 replay 하네스가 tools를 복사하지 않은 것이다. admin.js에서 ops 모듈을 동적 import하도록 바꾼 뒤 PASS했고, staging N=23도 재확인했다.
- 조석 baseline(Python)은 로컬에 Python이 없어 이번에 재실행하지 않았다. 기존 known exception은 그대로 두며, 조석 자료는 수정하지 않았다.
- **사고**: 최초 local32 실행(13:04Z)이 `docs/long-term-db-phase2b/.local/phase2b-local-results.json`(비공개, 미추적)을 덮어썼다. 원본은 복구할 수 없다. 새 내용도 32 PASS다. 이후 실행은 백업→실행→원본 복원 방식으로 했다.

## 11. 무변경 확인 (T)

| 항목 | 결과 |
|---|---:|
| Production D1 write / migration / deploy / freeze / maintenance | 0 |
| Production Access / route / secret / binding / restore | 0 |
| commit / push / fetch / pull / reset / clean | 0 |

Staging에서 한 일:
- D1 2개 생성
- migration: main 0002, rehearsal 0000–0002, ledger 0001
- Worker deploy 7회(NORMAL 2, DUAL 3, 최종 MAINTENANCE 2). secret put 2회도 각각 새 version을 만듦
- secret 변경 2회(위젯 적용 → 시험 secret 복귀)
- ingress 차단·재개 각 1회
- main Time Travel restore 1회
- Turnstile 재시험·guard 시험(14:0x–14:43Z):
  - main에 0003_captcha_redemptions 적용
  - Worker deploy 6회(dual 열기 2회씩 ×2, maintenance 복귀 2회씩 ×2)
  - staging 위젯 secret 적용·복귀 각 2회
  - `REPORT_IP_SALT` 임시 교체 후 원래 값 복원 1회(제 IP의 staging 하루 제출 한도 때문)
  - 최종: 두 Worker READ_ONLY_MAINTENANCE, GET 200 / POST 503, secret 이름 목록 동일, FK 0
- Production 재확인(14:43Z): 시작=종료 동일, drift는 날씨·조석 JSON만.
