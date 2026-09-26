# Phase 2C execution evidence

Generated 2026-09-26T11:46:00.208Z. STATUS: PHASE 2C COMPLETE WITH DOCUMENTED LIMITATIONS. Production NO-GO.

## 검증 요약

| 원격 묶음 | 통과 | 원본 근거(ignored local) |
|---|---:|---|
| schema / PRAGMA | 1 | schema-verification.json |
| initial | 5 | initial-remote-tests.json |
| Access | 6 | access-maintenance-smoke.json |
| backfill | 7 | backfill-remote-results.json |
| core | 28 | core-remote-tests.json |
| rollout_v3 | 14 | rollout-v3-remote-tests.json |
| purge | 13 | purge-remote-tests.json |
| Turnstile | 3 | turnstile-remote-tests.json |
| cutover | 14 | cutover-rehearsal.json |
| recovery | 4 | recovery-remote-tests.json |

합계 95개 검사/단계. 실행 전후와 세부 assertion은 공개 가능한 test-results.json에 포함한다. 실패 재현과 초기 시험 harness의 null/빈값 기대 오류는 삭제하지 않고 .local/release-asymmetry-converged.json, rollout-before-peer-fix.json, rollout-remote-tests.json에 보존했다. 최종 v3 행렬은 별도14PASS. 최초 release 시도는 propagation 미수렴으로 inconclusive였고, 수렴 후 재현과 구분했다.

최종 로컬: local32/32, legacy106/106(실제 assertion105 + helpers파일1), Phase2A17/17, protocol5/5, focused gate13/13. 근거 local32-final.log, legacy106-final.log, phase2a-final.log, protocol-final.log, gate-local-regression.json. 날씨·조석 코드/자료는 수정하지 않았으며 기존 Phase2B에서 사용자 승인한 조석 fixture882cm와 시험상한850cm 불일치 예외는 그대로다. 해당 비관련 시험을 다시 성공했다고 주장하지 않는다.

## Git 및 파일 보존

- branch main; 시작/종료 HEAD d39bf4bf2d7e147b246f867f56567f814eddd4b9; local origin/main 6bf58a583391b174ccd15117ddeaef233010e1ee. commit/push0.
- 최신 remote main 15c9b192d2b24faaffb9f44a625dcd43d0e30710, 읽기전용 조회 2026-09-26T11:45:10.621Z; ahead16/behind0. tide_health.json, tide_month.json, tide_today.json, weather_today.json, weather_week.json만 원격차이. reports/Worker 코드 drift0, fetch/pull/merge0.
- 시작511파일 재해시: 허용된 source변경2, 나머지509 동일, 누락0/예상밖변경0. Phase1/2A 문서 및 Phase2B 문서·기존 patch 보존.
- 기존 추적5파일 diff는 Phase2B 그대로109추가/218삭제. Phase2C 앱수정2파일은 원래 미추적 canonical 디렉터리 안이라 git diff --stat에 잡히지 않는다. 별도 [phase2c-source-changes.patch](phase2c-source-changes.patch) 제공.

## 실제 결함과 최소 수정

1. v1에서 admin release만 변경했을 때 public503/admin200이 실제로 재현됐다. 역방향 peerRelease 일치 검사와 capability 공개를 추가했다.
2. 첫 v2 원격 행렬에서 public peer binding 제거 후 public503/admin200이 재현됐다. 준비상태에 실제 peer.fetch와 gate token 존재를 요구했다.
3. 최종 BUILD phase2c-dual-v3로 구 빌드와 mixed 상태도 차단. purge 역시 역방향 release 검사를 한다. SQL/schema hash/데이터 모델은 변경하지 않았다.

수정 파일: reports-api/src/canonical/control.js, reports-api/src/canonical/purge.js. .local/old-v1은 수정 전 소스의 검토·mixed-build용 사본이다. 새 gate는 배포 propagation이 끝나기 전에 준비됐다고 가정하지 않는다. 각 사례에서 HTTP 및 peer service binding 양쪽이 목표 capability를 실제 관찰할 때까지 확인했다.

## 리소스 및 인증 경계

- 계정 1d697c22a32447b386b9fac6a3538597; staging D1 birdmap-reports-staging / f2c65357-47fc-4f09-82c6-ad0d28f8314f, 생성2026-09-26T10:27:04.772Z. production b48201cc-0abd-4a64-bb61-9dd2a7813d21와 다름.
- 두 staging Worker의 실제 REPORTS_DB와 REPORTS_PEER 확인. routes/custom domains 없음. internet 시험token과 internal gatetoken은 각각 별도이며 값은 보고서에 없다. preview URLs 비활성.
- staging Access app6e5dbd14-6a92-4a8a-8feb-6239d929983c 및 policydc7eaf34-a5c2-4097-8933-8324168c146d만 생성. 기존 team 사용, staging admin /admin 경로, 소유자만 허용. production Access 수정0. Access관리API 권한403이므로 전체 Access설정 불변을 API snapshot으로 증명했다고 주장하지 않는다.
- 공식 cloudflared CLI로 실제 Access JWT 취득, issuer/audience확인. actual Access HTTP와 synthetic actor persistence 시험은 구분한다. JWT·OAuth·gate·salt는 .local/의 ignored 파일 외 보고서에 기록하지 않았다. OAuth401은 공식 Wrangler whoami refresh 후 정상 재개됐다.
- Wrangler4.137 / Node24.18, 실제 remote D1.batch/Service Binding 사용. 로컬 Miniflare는 별도 로컬 회귀검증이다.
- staging deploy command 기록97건; 별도 실제 rollback2회. 최종 active public c8ff615b-4190-4cc7-9aec-14820229cc80; admin 77a57a9c-51f6-4bed-90b2-2a1ac0af330c. 두 Worker maintenance, GET정상/POST503.

## 스키마·원자료·count

0000_legacy.sql 및0001_core.sql은 저장소/Phase2A SQL bytes 그대로 공식 Wrangler 적용. 76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0가 저장소/local/remote에서 같고 schemaReady true. index/trigger/CHECK/FK/UNIQUE 및 PRAGMA 차이0.

합성21건에 대해서만 별도 승인 후 batch64를 실행했다. manifest 3d45dc675a06aba6081d949853b859a891fca135ab65546441b36aeea8baa101; transform phase2b-legacy-v1; registry 4a7aba945b6fbf245cbaca980bc073324584e8bd2c49c15483a449aed436550d. approved17/rejected4/siteNULL5/count1 13/countNULL8. 기존1을 unknown이라는 이유로 NULL로 지우지 않았다. 여러 종+공유count는 원값 호환영역에 보존하고 sighting별 countNULL; 종별 분할/중복배분 없음. 기존21행을 최초 제출 원문으로 정의하거나 review/audit 이력을 만들지 않았다. native 시험 추가 후에는 cohort21 전체값을 따로 재검증했고, 기존 whole-snapshot backfill verifier를 변경해 native행을 무시하도록 완화하지 않았다.

## 복구와 purge 범위

Purge13PASS: 실제 native10040만 제거. guard/revision/peer/권한/확인, batch8/14실패 rollback, 원래PK잔존0·모든 application text의 고유 marker0·타행불변·정확히9필드 tombstone1. 정확좌표·메모·payload·species/location fingerprint가 tombstone에 없고 request_fingerprintNULL/event_count0이다. 재요청410. legacy삭제는 명시적 결정 필요 상태 유지.

Time Travel은 purge 이후 모든 writer 시험을 종료하고 maintenance에서 새 bookmark를 얻었다. 고정 stagingDB에 assertion probe1을 쓴 후 실제 restore했고, 모든10 application tables/data와 sqlite_schema 및 d1_migrations ledger가 기준과 같았다. _cf_KV 등 Cloudflare 내부 metadata byte까지 동일하다는 주장은 하지 않는다. 생성1분 후 요청 timestamp의 bookmark도 조회됐다. 최대 보존은 공식 Free7일/Paid30일이며 이 새 DB의 실제 최대기간/계정플랜은 미확정이다. [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

두 Worker rollback은 v3·Access·staging bindings가 확인된 maintenance 버전만 대상으로 했다. CLI성공 외 activeversion100%, 서비스binding, authenticatedGET200/POST503 및 DBdigest불변까지 확인했다. [Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## 한도와 다음 전환 조건

실측: sites190 statements / backfill64 statements 성공. 최대 bound38/SQL570bytes/text516bytes/serializedrow1033bytes. 공식 개별statement100KB, bound100, row2MB, batch30초, invocation쿼리Free50/Paid1000, 동시연결6. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

향후 3N+1삽입 + 검증16쿼리 예산을 가정하면 floor((Q-17)/3)=Free11/Paid327행이라는 계획상 상한이다. 보수적인 다음시험10/100행도 아직 실행한 대규모 보증이 아니다. 지금의 부분상태 거부 및 최종 run ledger 원칙을 깨는 단순chunk 적용은 금지한다.

공식 Turnstile 테스트 pass/fail/spent만 사용했다. production secret 복사0. 동시pass/spent201/201은 원격 특정catch분기 실행이나 실제브라우저token의 소모를 증명하지 않는다. [Turnstile testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

| 전환 단계 | GO 조건 | NO-GO 조건 |
|---|---|---|
| 외부freeze·drain | 양쪽 모든 writer503, 진행요청 종료 확인 | NORMAL 구writer 접근 가능/진행중write |
| schema·seed | 실제 schemaReady/ID190/checksum 일치 | DDL/FK/registry drift |
| snapshot·backfill | immutable manifest와 전체값 보존, 승인된실행 | changedmanifest/partialstate/원본수변화 |
| 새Worker 배포 | 양쪽 실제v3 capability/release/activation/schema일치 | mixed/unreachable/productionbinding |
| shadow·smoke | shape/count/좌표공개규칙 동일, 원자성/CAS검증 | mismatch/중복/부분쓰기 |
| reopen | 실제HTTP/Access성공,rollback·restore담당/기준승인 | freeze해제방법·복구정책 미확정 |

기설치 staging에서14단계를 순서대로 재연했지만 실제 production drain과 첫migration 전체절차를 한 번에 재현한 것은 아니다. 아래 위험을 해소하고 별도 승인 후 다음Phase를 판단해야 한다.

- Production 적용은 승인되지 않았으며 NO-GO. 실제 외부 writer freeze·구 Worker drain·배포 책임자/중단 기준을 별도로 확정해야 한다. staging wrapper freeze는 production 방화벽 설정 검증이 아니다.
- Turnstile 공식 pass/fail/already-spent Siteverify와 동시 멱등성은 통과했다. 실제 브라우저 발급 single-use token 및 CAPTCHA 실패 직후 concurrent commit 재조회 분기 실행은 원격에서 특정하지 않았다(해당 분기는 로컬 시험 통과).
- 새 staging DB의 생성 직후 요청 시점 bookmark와 실제 복구는 확인했다. 계정 구독에 따른 최대 7일/30일 보존 한도는 계정 수준에서 확정하지 않았다.
- Time Travel의 purge 이전 이력에는 제거 자료가 남을 수 있다. 이번 복구는 purge 이후 bookmark로만 수행했다. 운영 복구 시 금지 자료 재유입 방지 절차가 필요하다.
- legacy purge는 PURGE_LEGACY_DECISION_REQUIRED를 유지한다. 운영자가 보존 정책과 금지자료 삭제 예외를 결정해야 한다. 현재 purge는 권한 있는 내부 함수이며 운영용 인증 진입점을 새로 공개하지 않았다.
- 64/190 statement batch의 성공은 대규모 부하 증명이 아니다. 미래 chunk backfill은 현재 partial-state 거부·manifest 원칙을 유지하는 별도 설계와 한도 검증이 필요하다.
- 일반 DELETE 금지는 application 경계이고 직접 D1 관리자 권한에는 적용되지 않는다. Worker rollback은 DB를 되돌리지 않으며, 이번에는 안전한 maintenance 버전만 복귀했다.
- 이번 14단계 cutover 재연은 기설치 staging에서 migration/seed no-op 및 backfill cohort 검증으로 수행했다. 최초 빈 DB migration/backfill 성공 증거와 구분한다. production 데이터·트래픽·배포 drain을 시험한 것은 아니다.

## 최종 production 읽기전용 검증

2026-09-26T11:45:09.753Z: {"total":23,"approved":19,"rejected":4,"pending":0}. SELECT metadata rows_written0/changed_dbfalse 확인. production Worker 배포·binding snapshot 시작과 동일. public57849940-c4b6-494f-88e9-27ec2e327cd9; admin1eebcf4e-e7e0-4b94-bdf2-65c44962c21a. 행수만으로 외부행위 전체의 무변경을 증명하지는 않으며, 아래0은 이 작업의 실제 실행 내역이다.

- production_d1_writes = 0
- production_migrations = 0
- production_worker_deploys = 0
- production_route_changes = 0
- production_secret_changes = 0
- production_service_binding_changes = 0
- production_access_changes = 0
- production_exports = 0
- production_restores = 0
- commit = 0
- push = 0

## 파일 전체 목록

기존 파일 수정2:

- reports-api/src/canonical/control.js
- reports-api/src/canonical/purge.js

Phase2C 생성/갱신 파일(.local 제외):

- docs/long-term-db-phase2c/.gitignore
- docs/long-term-db-phase2c/CHECKPOINT.md
- docs/long-term-db-phase2c/README.md
- docs/long-term-db-phase2c/execution-evidence.md
- docs/long-term-db-phase2c/phase2c-source-changes.patch
- docs/long-term-db-phase2c/scripts/access-maintenance-smoke.mjs
- docs/long-term-db-phase2c/scripts/apply-backfill.mjs
- docs/long-term-db-phase2c/scripts/apply-staging-schema.mjs
- docs/long-term-db-phase2c/scripts/capture-access-token.mjs
- docs/long-term-db-phase2c/scripts/check-preservation.mjs
- docs/long-term-db-phase2c/scripts/check-remote-main.mjs
- docs/long-term-db-phase2c/scripts/core-remote-tests.mjs
- docs/long-term-db-phase2c/scripts/create-staging-db.mjs
- docs/long-term-db-phase2c/scripts/cutover-rehearsal.mjs
- docs/long-term-db-phase2c/scripts/deploy-staging.mjs
- docs/long-term-db-phase2c/scripts/final-staging-read.mjs
- docs/long-term-db-phase2c/scripts/gate-local-regression.mjs
- docs/long-term-db-phase2c/scripts/initial-remote-tests.mjs
- docs/long-term-db-phase2c/scripts/measure-fixture-limits.mjs
- docs/long-term-db-phase2c/scripts/preflight.mjs
- docs/long-term-db-phase2c/scripts/prepare-fixtures.mjs
- docs/long-term-db-phase2c/scripts/purge-remote-tests.mjs
- docs/long-term-db-phase2c/scripts/recovery-remote-tests.mjs
- docs/long-term-db-phase2c/scripts/remote-client.mjs
- docs/long-term-db-phase2c/scripts/reproduce-release-asymmetry.mjs
- docs/long-term-db-phase2c/scripts/rollout-lib.mjs
- docs/long-term-db-phase2c/scripts/rollout-remote-tests.mjs
- docs/long-term-db-phase2c/scripts/staging-control.mjs
- docs/long-term-db-phase2c/scripts/staging-worker.mjs
- docs/long-term-db-phase2c/scripts/turnstile-remote-tests.mjs
- docs/long-term-db-phase2c/scripts/verify-schema.mjs
- docs/long-term-db-phase2c/scripts/write-final-evidence.mjs
- docs/long-term-db-phase2c/scripts/write-progress-evidence.mjs
- docs/long-term-db-phase2c/test-results.json

.local은 ignored 시험설정/합성fixture/토큰/로그/증거용이며 공유용 산출물에서 제외한다. 기존 Phase2B patch/untracked 목록은 당시 snapshot이므로 Phase2C추가분으로 덮어쓰지 않았다.

## 최종 산출물 검토

2026-09-26 11:47 UTC 재검증: 기존 511개 파일 중 승인된 앱 소스 2개 외 509개 동일, 예상 밖 변경 0. 공유 파일 34개에서 실제 JWT/OAuth/gate token/salt 일치값 0. Phase 2C 스크립트 28개 문법 검사, git diff --check, 변경 patch의 reverse --check 통과(실제 patch 적용 없음). 별도 읽기 전용 검토에서 원격 95개 집계·로컬 결과·최종 상태·제한사항과 원본 증거의 일치를 확인했다.
