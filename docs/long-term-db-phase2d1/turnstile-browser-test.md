# Turnstile 실제 브라우저 시험

- 일시: 2026-09-26 13:4x–13:58Z. 사용자가 본인 브라우저에서 토큰 10개를 직접 발급했다. Claude는 challenge를 풀거나 우회하지 않았다.
- 위젯: `birdmap-phase2d-staging-browser` (managed, hosts: staging public, localhost). production 위젯 `birdmap-reports`와 그 secret은 사용하지 않았다.
- secret: staging public Worker에 stdin으로 설정했고 시험이 끝난 뒤 기존 시험 secret으로 되돌렸다. 토큰과 secret은 메모리에만 두었고 로그·파일·대화에 남지 않았다.
- 도구: [scripts/turnstile-browser.mjs](scripts/turnstile-browser.mjs). 결과 원본은 `.local/turnstile-browser.json`.

공식 문서(2026-09-26 확인, 갱신 2026-09-16) https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

- 토큰 유효기간: 5분
- 토큰은 1회만 검증할 수 있고, 재사용하면 `timeout-or-duplicate`
- `idempotency_key`(UUID)로 안전하게 재시도할 수 있음
- 같은 key로 재전송했을 때의 결과는 명시되지 않음

## 결과

| # | 시험 | 경로 | 결과 |
|---|---|---|---|
| A | fresh | 앱 POST /reports | PASS — 201, 4테이블 +1 |
| B | 재사용 | 앱 (순차, 새 request_id) | PASS — 403 CAPTCHA_FAILED, DB 0 |
| B' | 재사용 | 직접 Siteverify (앱에서 2회 쓴 뒤) | **success:true** — 관측 기록. 공식 single-use 계약과 다른 결과가 한 번 관측됨(원인은 확인하지 못함) |
| C | 만료 310초 | 앱 / 직접 첫 사용 | PASS — 403 / `invalid-input-response` |
| D | invalid | 앱 / 직접 | PASS — 403 / `invalid-input-response` |
| 33 | 같은 토큰 직접 동시 5회 ×2 | Siteverify | **FAIL — 5/5, 5/5 성공** |
| 33 | 같은 토큰, 다른 제보 4건 동시 ×3 | 앱 | **FAIL — commit 4/4, 3/4.** 3라운드는 IP rate limit(429×4)에 걸려 측정 무효 |
| 34 | 같은 request_id+payload replay | 앱 | PASS — 201, insert 0. replay에 쓴 토큰이 이후 새 제보에서 201 → replay는 토큰을 소비하지 않음 |
| 35 | idempotency_key | 직접 | 같은 key 재시도는 성공, 새 key나 key 없음은 `timeout-or-duplicate` → 같은 key 재시도는 안전함 |

## 결론

- 2026-09-26 staging 실측에서 동일 Turnstile token의 concurrent Siteverify 요청이 복수 success를 반환하는 race-like behavior가 관측됐다. 순차 재사용은 앱 경로에서 거부됐으나, 다른 호출 경로에서는 success가 한 번 관측됐다.
- 앱은 Siteverify의 결과에만 의존하므로, 토큰 하나로 여러 건이 저장될 수 있다. 실측 최대 4건이며, 남은 제한은 IP rate limit(10분 5건, 하루 20건)뿐이다.
- 데이터 중복이나 부분 저장은 없다(각 request_id는 원자적). 현재 production legacy 경로에도 같은 성질이 있다.
- **§33 FAIL → Phase 2E NO-GO.**

## 해소 후보 (미구현 — 승인 필요)

1. **앱 수준 1회 사용 강제 (권장)**: 같은 write batch 안에 `INSERT INTO captcha_tokens(token_sha256 PRIMARY KEY, used_at)`를 넣는다. 토큰이 중복되면 UNIQUE 위반으로 batch 전체가 rollback된다.
   - 필요한 것: 새 테이블(추가형 DDL), `persistQuick` 한 줄, legacy 경로는 `batch()`로 전환.
   - 사람이 다시 브라우저로 토큰을 발급하는 재시험이 필요하다.
2. Siteverify에 `idempotency_key=request_id`를 보낸다. commit 실패 뒤 재시도할 때 CAPTCHA를 다시 풀지 않아도 되지만(§35), 동시 중복 문제는 해결하지 못한다. 1번과 함께 쓰는 보조 수단이다.

---

# 재시험 — idempotency_key 원인 분석 (2026-09-26 14:0x–14:17Z)

## 1. 현재 구현 조사

| 질문 | 답 (코드 근거) |
|---|---|
| 앱이 Siteverify `idempotency_key`를 만드는가 | **아니다.** `verifyTurnstile`(reports-api/src/shared.js)은 `secret`, `response`, `remoteip`만 보낸다. HEAD도 같다(`idempotency` 문자열 0건) |
| token이나 request_id로 key를 만드는가, 같은 token이면 같은 key인가 | 해당 없음. 앱은 key를 보내지 않는다 |
| 서로 다른 request_id가 같은 key를 쓰는 경우 | 없음 |
| 1차 직접 동시 5회 시험의 key | 5회 모두 key 없음. 라운드마다 새 토큰 |
| 1차 `idempotency` 단계 | 무작위 UUID K를 한 번 재사용한 뒤 새 UUID. 동시 시험과는 다른 토큰 |

→ 1차 결과(5/5, 앱 4/4)는 idempotency_key 사용 방식에서 나온 것이 아니다. 앱 key 생성 방식에 고칠 것이 없으므로 코드를 수정하지 않고 재시험했다.

## 2. 재시험 결과 (시험마다 새 브라우저 토큰, `scripts/turnstile-retest.mjs`, `.local/turnstile-retest.json`)

| 시험 | 기대 | 결과 |
|---|---|---|
| A1, A2: 같은 토큰, 서로 다른 UUID key로 동시 5회 | 성공 1 | **5/5, 5/5 성공 — FAIL** (응답 34–60ms) |
| B: K1 → 같은 K1 재시도 | 같은 검증의 재시도 | 첫 호출 성공, 재시도도 success(멱등 반환). 두 번째 사용으로 세지 않음 |
| C: 같은 토큰 + 새 K2, 이어서 key 없음 | 실패 | **PASS** — 둘 다 `timeout-or-duplicate` |
| D1, D2: 같은 토큰, key 없이 동시 5회 | 성공 1 | **5/5, 5/5 성공 — FAIL** |
| APP: 같은 토큰으로 request_id A/B/C/D 동시 제출 | 저장 1 | **201×4, 4테이블 각 +4 — FAIL** |
| APP: 같은 request_id+payload replay(토큰은 무효값) | 201, 저장 0 | **PASS** — Siteverify 전에 replay |
| invalid | 403 | **PASS** — `invalid-input-response` |
| 만료 310초(미사용) | 403 | **PASS** |
| fresh | 201 | **PASS** (APP 시험에서 1건 이상 201, 1차 A) |

## 3. 결론

- 순차 재사용은 매번 `timeout-or-duplicate`로 거부됐다(C, 1차 idempotency 단계).
- 2026-09-26 staging 실측에서 동일 Turnstile token의 concurrent Siteverify 요청이 복수 success를 반환하는 race-like behavior가 반복 재현되었다(서로 다른 key·key 없음, 4라운드 20/20). 공식 문서는 token을 single-use로 명시하므로, 이는 공식 계약에 대한 판단이 아니라 관측 기록이다.
- idempotency_key는 원인이 아니며, 올바른 unique key 조건에서도 재현됐다.
- 따라서 사용자 지시 §5의 조건("올바른 unique idempotency key 조건에서도 여러 logical submission 성공이 재현")을 충족한다. 앱 수준의 방어가 필요하다는 근거가 있다.
- **D는 FAIL로 유지한다.**

## 4. 제안 설계 — 앱 수준 1회 사용 방어 (→ 사용자 승인 후 구현, §5 참조)

1. **스키마(추가형, 새 migration 0003)**:
   `captcha_redemptions(token_sha256 TEXT PRIMARY KEY CHECK(length=64 hex), request_id TEXT NOT NULL, redeemed_at TEXT NOT NULL)`.
   UNIQUE는 PK로 보장한다. schemaReady fingerprint 대상 9테이블에는 포함하지 않는다.
2. **저장값**: token 원문은 저장하지 않는다. `SHA-256(token)`만 저장한다.
   - token은 Cloudflare가 발급한 고엔트로피 난수라 hash에서 되돌릴 수 없다.
   - 개인정보(IP·이름·좌표)는 넣지 않는다. request_id는 이미 raw_submissions에 있는 무작위 UUID다.
3. **트랜잭션 위치**: Siteverify 성공 뒤, 제보 저장과 **같은 D1 batch 안**에서 `INSERT INTO captcha_redemptions`를 `INSERT reports`보다 먼저 둔다.
   - 동시에 들어온 두 번째 요청은 PK 충돌로 batch 전체가 rollback된다.
   - catch에서 먼저 같은 request_id의 replay를 확인한다. 없으면 403 CAPTCHA_FAILED로 응답한다.
   - legacy NORMAL 경로의 단일 `INSERT reports.run()`은 두 문장짜리 `batch()`로 바꾼다.
   - freeze trigger는 같은 batch의 reports INSERT에서 걸리므로 freeze 의미는 그대로다.
4. **보존기간과 cleanup**: token 유효기간은 300초다. 보존은 1시간(시계 오차 여유 포함)으로 한다.
   - 같은 batch에 `DELETE FROM captcha_redemptions WHERE redeemed_at < now-1h`를 넣어 기회적으로 정리한다. 별도 cron은 두지 않는다.
   - `applicationDb`의 DELETE 허용 목록에 이 한 문장만 추가한다.
5. **보조 수단**: Siteverify에 `idempotency_key=request_id`(UUID)를 보낸다.
   - 같은 request_id의 네트워크 재시도는 같은 key가 되어 멱등 success를 받는다(TEST B). commit 실패 뒤 재시도할 때 CAPTCHA를 다시 풀 필요가 없어진다.
   - request_id가 다르면 key도 달라진다. legacy 경로(request_id 없음)는 key를 보내지 않는다.
6. **복구 영향**: main D1을 restore하면 redemption도 과거로 돌아간다. 그러나 300초가 지난 토큰은 어차피 만료되므로 재사용 위험은 restore 시점 앞뒤 5분으로 한정된다. restore SOP에서는 ingress가 차단돼 있다.
7. **검증 계획**:
   - 로컬: 같은 토큰으로 동시 N건 → 저장 1건. 같은 request_id replay → 저장 0.
   - staging: 브라우저 토큰으로 APP 동시 제출 2라운드 이상, 각 라운드 저장 정확히 1건(사용자 참여 필요).
   - Production은 Phase 2E의 USER CONFIRMATION 단계로만 적용한다.

---

# 5. Redemption guard 구현과 재시험 (승인 후, 2026-09-26 14:2x–14:43Z)

공식 single-use 계약에 더해, 앱 수준의 redemption uniqueness를 defense-in-depth로 적용한다.

## 구현

| 항목 | 내용 |
|---|---|
| 스키마 | [0003_captcha_redemptions.sql](migrations/0003_captcha_redemptions.sql): `token_hash` PK(64 hex CHECK), `request_id`, `redeemed_at`, `redeemed_at` index. token 원문·IP·종·위치·payload 없음 |
| hash | Web Crypto SHA-256(`sha256Hex`). 원문은 DB·로그·evidence에 남지 않는다 |
| 순서 | request_id replay 확인(Siteverify 전) → Siteverify(`idempotency_key=request_id`) → SHA-256 → **같은 batch**: purge assertion → 1시간 지난 redemption DELETE → redemption INSERT → reports·raw·checklist·sighting INSERT |
| 충돌 | PK 충돌 시 batch 전체 rollback → replay 확인 → 다른 request_id의 redemption이 있으면 **403 CAPTCHA_REUSED** |
| idempotency_key | request_id는 프론트엔드 `crypto.randomUUID()`(v4)이고 서버 `requestId()`는 RFC 4122 v1–5 UUID만 받는다(fixture도 v4 형식) → 변환 없이 사용. 같은 request 재시도는 같은 key, 다른 request는 다른 key |
| 범위 | request_id가 있는 dual-write(정본) 제출 경로. legacy NORMAL 경로(현재 production, request_id 없음)는 바꾸지 않았다 → 전환 전 과도기 동안은 기존과 같은 노출 |
| 접근 | `captcha_redemptions`를 참조하는 곳은 `canonical/persistence.js`와 `canonical/data.js`의 allowlist뿐. 조회 API 없음 |
| 보존·cleanup | 1시간(token 유효기간 300초 + 여유). 매 제출 batch에서 기회적으로 삭제하며 cron은 두지 않는다 |
| schemaReady | 9테이블 fingerprint 대상이 아니므로 기존 hash `76b07a46…` 그대로 |

## 로컬 (`scripts/local-captcha-guard.mjs`, 11/11 PASS)

A fresh, B 동시 4건 ×3(racy stub: 저장 1 + CAPTCHA_REUSED 3), C replay, D payload 변경 409, E invalid, F 만료, G1 batch 전 장애(부분 0, 같은 key 재시도 성공, 다른 request는 거부), G2 batch 안 장애 3위치(전체 rollback, 재시도 성공), H PK 충돌 rollback, I 1시간 cleanup, J 노출 0.

회귀: legacy 106, local 32(fixture를 요청별 고유 토큰으로 수정), protocol 5, gate 13, Phase 2A 17, freeze/backfill 10 — 모두 PASS.

## staging 실제 브라우저 (`scripts/turnstile-guard-browser.mjs`, `.local/turnstile-guard-browser.json`)

| 시험 | 결과 |
|---|---|
| A fresh | PASS — 201, 4테이블 +1, redemption +1 |
| B1 같은 토큰·request_id 4개 동시 | PASS — 201×1, CAPTCHA_REUSED×3, 각 테이블 +1 |
| B2 | PASS — 201×1, CAPTCHA_FAILED×1 + CAPTCHA_REUSED×2, 각 +1 |
| B3 | PASS — 201×1, CAPTCHA_REUSED×3, 각 +1 |
| C replay | PASS — 201, 원래 결과와 동일(키 순서 무관 비교), 저장 0 |
| D payload 변경 | PASS — 409 IDEMPOTENCY_CONFLICT, 저장 0 |
| E invalid | PASS — 403, redemption 0, 저장 0 |
| F 만료 310초 | PASS — 403, redemption 0, 저장 0 |
| J API 노출 | PASS — 공개 5·관리자 2 경로에 hash·테이블명 0 |
| 관찰(PASS 기준 아님) | 직접 Siteverify 동시 5회(서로 다른 key) → 5 success. race-like behavior가 계속 재현되지만 앱 경계에서 차단됨 |

G(장애 주입)·H·I는 로컬 D1에서 검증했다. staging에서는 실제 토큰으로 장애를 주입하지 않았다.

**Turnstile D: PASS (application boundary 기준).**

- staging 복구: 두 Worker READ_ONLY_MAINTENANCE, 시험 secret과 원래 `REPORT_IP_SALT` 복원(시험 중 제 IP의 staging 제출 한도 때문에 임시 교체), secret 이름 목록 동일.
- main staging D1에는 0003이 적용된 상태로 남는다.
