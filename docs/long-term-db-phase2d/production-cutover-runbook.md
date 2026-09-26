# Phase 2E Production Cutover Runbook

**PRODUCTION — DO NOT RUN IN PHASE2D**

현재 판정은 **NO-GO**다. 이 문서는 사람이 각 단계를 승인·확인하는 절차이며 master script가 아니다. `BLOCKED — NO EXECUTABLE COMMAND`는 현재 도구/환경이 없다는 뜻이다. 해당 단계는 실행 가능한 것으로 승인하지 않는다. 운영자 승인만으로 기술적 증거 공백이 해소되지는 않는다. 아래 명령은 이번 Phase에서 실행하지 않았다.

## 0. 책임·작업 창·실행 대상

실행, Production D1 검증, Worker rollback, Time Travel 판단, Abort 최종 결정은 모두 운영자 본인이다. KST 02:00~04:00, 달력 날짜는 미확정. 지연/검증 실패는 중단하고 write maintenance 유지. 04:00 직전까지 무리하게 새 단계를 시작하지 않고 복구·검증 여유를 확보한다. 사전·정상화 공지를 한다. 정상 상황의 공지는 지도 조회 유지와 제보/관리자 수정 일시 중단을 알린다. 복원 사고 시 조회 격리가 필요하면 영향 범위를 추가 공지한다.

| 자원 | 승인 시 대조할 정확한 대상 |
|---|---|
| Account | `1d697c22a32447b386b9fac6a3538597` |
| Production D1 | `birdmap-reports` / `b48201cc-0abd-4a64-bb61-9dd2a7813d21` |
| public Worker | `birdmap-reports` |
| admin Worker | `birdmap-reports-admin` |
| 금지 혼동 대상 | staging D1 `f2c65357-47fc-4f09-82c6-ad0d28f8314f`, `*-staging-*` Worker |
| Source | Phase 2A core DDL, Phase 2B 앱, Phase 2C v3 gate 수정이 포함된 별도 승인 artifact |

현재 작업물은 미커밋이므로 Git HEAD만 배포 artifact 증거로 삼지 않는다. 파일별 hash, build hash, config·schema hash를 승인 기록에 넣고 검증한 소스 그대로 배포한다. 이번 단계에서 commit/push하지 않는다. 이후 commit/release 절차도 별도 승인 사항이다.

**PRODUCTION — DO NOT RUN IN PHASE2D** (명령 표기용 로컬 변수)

```powershell
$wranglerScript = 'C:\Users\김진호\AppData\Local\npm-cache\_npx\d77349f55c2be1c0\node_modules\wrangler\bin\wrangler.js'
# 아래 변수는 사전 검토하여 실제 존재·내용·hash를 확인한 경로만 지정한다.
# $approvedCoreOnlyMigrationConfig, $approvedPublicConfig, $approvedAdminConfig
# $snapshotPath, $localSqlitePath, $approvedBookmark
```

현재 config 파일을 이름만 바꾸어 dual-write 배포하지 않는다. production account/DB UUID, main entry, Access, 기존 secret 보존, 상호 service binding, gate secret, vars, preview/route 통제까지 리뷰해야 한다. staging wrapper 또는 합성 시험 endpoint는 운영 배포에서 제외한다.

## 1. 실행 전 baseline·code drift

목적: 현재 artifact와 최신 main/운영 배포를 확정한다.

**PRODUCTION — DO NOT RUN IN PHASE2D** (Git/배포 읽기)

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git rev-parse origin/main
git ls-remote origin refs/heads/main
& node $wranglerScript deployments list --json -c reports-api/wrangler.public.toml
& node $wranglerScript deployments list --json -c reports-api/wrangler.admin.toml
```

GitHub compare GET으로 HEAD...최신 main 파일 목록과 patch를 읽는다. fetch/pull/rebase/merge를 실행하지 않는다. reports-api/**, index 제보 부분, config/schema/migration drift가 있으면 **PHASE_2D_NO_GO_CODE_DRIFT**로 중단한다. 날씨/조석 JSON만 바뀌면 별도 기록한다.

기대·검증: 승인 source hash, 생산 binding, 배포 version, Access 흐름, UI capability 일치. GO: 관련 원격 drift 없음과 알려진 로컬 변경만 존재. NO-GO: 다른 배포/소스/DB 대상 또는 파일 불명. rollback: 아직 production 변경 전이므로 중단·재검토한다.

## 2. 모든 writer의 독립 freeze

목적: 새/구 Worker 모두에 대해 새로운 write 진입을 차단한다. **현재 BLOCKED — NO EXECUTABLE COMMAND**. 실측한 workers.dev 주소 앞에 독립된 검증 경계가 없다.

| 진입점 | 동결 중 기대 | 현재/추가 확인 |
|---|---|---|
| public workers.dev `POST /reports` | 503 + Retry-After | 현재 실제 경로. 프런트 UI 차단만으로 부족 |
| admin workers.dev `POST /admin/api/reports/<uuid>` | Access 인증 후 503 + Retry-After | approve/reject/unpublish/link/unlink/consent/visibility/site 8개 전부 |
| public approved/pending/site/status GET | 기존 공개 규칙 유지 | 좌표 fallback 포함. API 캐시도 확인 |
| admin 조회 GET | 기존 Access 허용자만 조회 | Access 자체 변경은 요청 없이 하지 않음 |
| 두 Worker version/alias/preview URL | write 우회 불가 | 현재 `previews_enabled=true`; 기존 URL·과거 binding 확인 필수 |
| custom route/domain | 같은 원칙 | 현재 Worker custom domain 목록 0. 모든 zone route까지 완전함을 증명한 것은 아님 |
| service binding 호출자·scheduled/queue/workflow | DB write 중단 | 현재 보고서 Writer 전체 inventory와 직접 호출 경로 확인 필요 |
| Dashboard/Wrangler/REST D1·CI·기타 스크립트 | 승인 실행자 외 write 0 | 운영자 쓰기 중지, 배포 자동화 및 직접 writer 통제 기록 |

선택할 전략은 **Worker 배포와 독립된 진입 차단 + 모든 우회 경로 폐쇄 + 두 Worker maintenance + drain**이다. 구현 방식과 명령은 별도 staging 검증 후 확정해야 한다. 기존 workers.dev 도메인은 사용자 zone WAF 경계라고 가정할 수 없다. WAF Block은 400–499 응답만 지원하므로 요구한 503/Retry-After 수단으로 제시하지 않는다. Access 로그인/403 역시 GET 유지+POST503의 대체 검증이 아니다. [WAF 응답](https://developers.cloudflare.com/waf/custom-rules/create-dashboard/), [Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

**USER CONFIRMATION REQUIRED**: 향후 실제 freeze/우회 폐쇄 시 적용 객체·규칙·되돌림 명령을 먼저 제시하고 승인받는다. `workers_dev=false`만으로 version/route가 모두 닫힌다고 보지 않는다. 과거 version URL은 과거 binding을 유지할 수 있다. [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/).

기대·검증: 외부·인증된 관리자·service/direct writer 등 모든 경로의 차단 상태, GET 정상, production write 없는 거부시험. GO: 경계와 우회 폐쇄 확인. NO-GO: 단 하나의 구 writer라도 접근 가능. rollback: 데이터 변경 전에도 검증 실패 시 기존 안전 상태/공지 계획을 운영자가 결정하며, DDL로 진행하지 않는다.

## 3. 두 Worker maintenance 배포 및 drain

목적: 앱도 쓰기를 닫고 freeze 이전 요청을 모두 종료시킨다. 먼저 Step 2의 외부 차단이 계속 작동해야 한다. 현재 생산용 maintenance config·배포 관측 계획은 BLOCKED.

**PRODUCTION — DO NOT RUN IN PHASE2D / USER CONFIRMATION REQUIRED**

```powershell
# 승인 config: REPORTS_WRITE_MODE=READ_ONLY_MAINTENANCE, 올바른 production binding.
# admin 먼저, 확인 후 public. 각 배포는 별도 승인·검증한다.
& node $wranglerScript deploy -c $approvedAdminConfig
& node $wranglerScript deploy -c $approvedPublicConfig
```

기대: 두 maintenance 버전 100%, GET 허용, POST503/Retry-After, stage wrapper 없음. schema 적용 전 ready=false여도 maintenance는 쓰기를 닫아야 한다. 검증 후 두 version UUID를 안전 rollback 대상으로 기록한다. GO: 각 배포·HTTP 기대 충족. NO-GO: Access/GET 회귀·mixed writer 개방. rollback: 외부 차단 유지 아래 검증 버전으로 L1, 데이터 변경 없이 중단.

**drain 기준은 별개다.** 다음 모두 충족해야 DDL에 진입한다.

1. freeze 전 시작된 모든 public/admin/direct writer 요청이 terminal 상태라는 관측, 또는 검증된 강제 종료 수단의 성공 증거.
2. 각 writer의 active 요청 0과 지연 완료/에러 처리 종료. 관측 시스템의 누락·샘플링 범위를 확인한다. 현재 설정 GET의 `observability=null`은 충분한 관측 증거가 아니다.
3. 전체 reports 22필드의 private digest·status 집계·count·max received marker·latest decided marker를 서로 다른 관측 시점에서 비교한다. 예: 30초 간격 3회는 **보조 관측**이며 시간만으로 drain 성공을 선언하지 않는다.
4. 배포 종료·새 요청 거부·기존 요청 종료·마지막 DB 변경 시점을 같은 실행 기록에 연결한다.

`count`와 `received_at`만 안정이어도 관리자 UPDATE는 계속될 수 있다. HTTP Worker의 연결 유지에는 일률적 60초 종료 상한이 없으므로 “60초 대기”는 drain 명령이 아니다. D1 30초 제한도 전체 HTTP 요청 상한으로 쓰지 않는다. [Workers 실행 한도](https://developers.cloudflare.com/workers/platform/limits/).

GO: 모든 이전 writer 종료 확인. NO-GO: 로그/활성 요청을 관측 못하거나 digest 변동. 외부 freeze+maintenance 유지, DDL 미실행.

## 4. frozen snapshot·manifest·복구점

목적: freeze+drain 완료 후 그 시점의 N과 원문 의미를 고정한다. **BLOCKED — NO EXECUTABLE COMMAND**: production snapshot/envelope 생성기와 remote 전체 verify 도구가 없다. Phase 2D는 민감 production 행을 수집/export하지 않았다.

실제 Phase 2E에서는 전체 22컬럼 원값을 제한 접근 위치에 보관하고 승인된 snapshot 도구로만 처리한다. Git·보고서·일반 로그에 원문/좌표/이름/IP hash를 넣지 않는다. 저장·암호화·접근·삭제/보존 절차와 이후 금지자료 삭제 대상 여부를 확정한다.

manifest/envelope 필수값:

| 값 | 계산·검증 규칙 |
|---|---|
| source_count N, status_counts | frozen reports에서 계산; 21/23 상수 금지 |
| source digest / manifest_sha256 | 현재 라이브러리 형식은 `SHA256(stable({reports: id순 전체행}))`; 22필드·NULL·0 보존 |
| highest/last received marker | max received_at 및 동일 timestamp의 id tie-break, private 기록 |
| schema fingerprint | 정렬한 실제 sqlite_schema·reports 컬럼/제약·index 검증; 관측 hash와 비교 |
| registry_revision | siteData 190 ID 및 원레코드 checksum; 이름 자동 병합 금지 |
| transform_version | `phase2b-legacy-v1` |
| captured_at / generated_at | 유효 UTC ISO; 라이브러리는 captured_at이 필수, generated_at으로 대체 금지 |
| run_id | 이 frozen source의 고유 실행 ID, 재실행 시 같은 값 |
| freeze/drain evidence | 두 버전·완료 시각·관측 증거와 승인 참조 |

기존 prepareBackfill 검사는 status_counts/schema fingerprint/freeze 증거를 검증하지 않는다. 상위 envelope digest와 검증기를 별도 구현·시험한 뒤 사용한다. 파일에 필드만 추가하고 검증 완료라 주장하지 않는다.

**PRODUCTION — DO NOT RUN IN PHASE2D** (준비 및 읽기, snapshot 도구는 별도 필요)

```powershell
node reports-api/tools/prepare-backfill.mjs --dry-run $snapshotPath
node reports-api/tools/prepare-backfill.mjs --prepare-apply $snapshotPath
& node $wranglerScript d1 time-travel info birdmap-reports --json -c reports-api/wrangler.public.toml
```

앞 두 명령의 기대는 검증된 요약과 `apply_enabled:false`다. **운영 apply 명령이 아니다**. 복구점은 실제로 사용 가능한 bookmark/시점을 private 운영 기록에 남긴다. GO: 전체 snapshot·digest·상위 envelope·registry·복구점 확인. NO-GO: 어떤 불일치/부분자료/복구점 불명이라도 중단. rollback: 아직 DB 변경 전, maintenance 유지 및 재판정.

## 5. 0000 legacy 존재 확인 → 0001 core 최초 적용

목적: 운영 reports는 그대로 두고 canonical core만 최초 추가한다. 현재 운영은 reports 22컬럼+_cf_KV, 명시 index 5개, trigger/FK 및 migration ledger 없음. 저장소 schema.sql은 다른 생성 순서와 `reports_site_history` index를 포함하므로 파일 재실행으로 맞추지 않는다.

**PRODUCTION — DO NOT RUN IN PHASE2D** (변경 전 SELECT)

```powershell
& node $wranglerScript d1 execute birdmap-reports --remote --command "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name" --json -c reports-api/wrangler.public.toml
& node $wranglerScript d1 execute birdmap-reports --remote --command "SELECT * FROM pragma_table_info('reports') ORDER BY cid" --json -c reports-api/wrangler.public.toml
& node $wranglerScript d1 execute birdmap-reports --remote --command "SELECT name FROM sqlite_schema WHERE type='table' AND name='d1_migrations'" --json -c reports-api/wrangler.public.toml
# ledger가 실제 존재할 때만 실행한다.
& node $wranglerScript d1 execute birdmap-reports --remote --command "SELECT id,name,applied_at FROM d1_migrations ORDER BY id" --json -c reports-api/wrangler.public.toml
```

NOT NULL은 전체 table_info 결과의 `notnull`도 별도로 비교한다. “0000 존재 확인”은 기존 reports 구조·데이터 baseline을 검증하는 단계다. `0000_legacy.sql`의 CREATE를 운영에 다시 실행하거나 적용했다고 ledger에 INSERT하지 않는다.

**현재 BLOCKED**: 승인된 migration config와 전용 디렉터리가 아직 없다. 향후 `migrations_dir`에는 hash가 검토된 `docs/long-term-db-phase2a/migrations/0001_core.sql` **한 파일만** 둔다. 공식 Wrangler `d1_migrations`를 사용하며 중복 ledger를 만들지 않는다. 기존 reports-api/migrations 전체를 사용하면 이미 있는 열에 ALTER를 재실행할 수 있다. `reports_site_history` 추가 필요성은 별도 검토·승인 대상으로 분리하고 core에 몰래 넣지 않는다.

**PRODUCTION — DO NOT RUN IN PHASE2D / USER CONFIRMATION REQUIRED**

```powershell
& node $wranglerScript d1 migrations apply birdmap-reports --remote -c $approvedCoreOnlyMigrationConfig
```

Wrangler 4.137.0 `migrations list --remote`도 ledger CREATE를 실행할 수 있어 사전 SELECT 대신 사용하지 않는다. apply에는 `--yes` 인수가 없고 비대화형 실행은 확인을 생략할 수 있으므로, 승인 책임을 CLI prompt에 맡기지 않는다. [공식 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

기대: 공식 ledger에 실제 0001 적용 이력 1개, additive 9테이블·114컬럼, 기존 reports 22필드·N·digest 그대로. 검증: schemaReady와 전체 schema/FK·CHECK·registry 적용 전 빈 canonical 상태. GO: 기대 전체 일치. NO-GO: partial DDL/예상 외 ledger/원본 차이. rollback: 외부 freeze+maintenance, 상태 확인; additive 구조를 즉석 DROP하지 않고 recovery L3/L4 판단.

## 6. schemaReady·FK/CHECK 검증

목적: 앱이 기대한 동일 스키마인지 확인한다. **BLOCKED**: 생산용 독립 full-schema verifier가 필요하다. Phase 2C verify-schema는 staging UUID 강제 도구다.

기대:

```text
schema = phase2a-0001
build = phase2c-dual-v3
canonical schema SHA-256 = 76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0
```

schemaReady는 canonical 9테이블+명시 index10+trigger8의 SQL 공백 정규화/끝세미콜론 제거 후 stable JSON SHA256이다. reports·공식 ledger·내부 테이블·데이터는 이 hash에 포함되지 않으므로 별도 검증한다. NOT NULL/DEFAULT/CHECK/UNIQUE/FK/trigger를 임의 완화하지 않는다.

`GET /reports/capabilities`는 UI 기능/maintenance만 알려주며 schemaReady 증거가 아니다. Access 인증 `GET /admin/api/capabilities`와 gate header로 보호된 양쪽 `GET /_internal/reports-capability`를 사용하되 secret을 명령/로그에 출력하지 않는다. 현재 production 검증 client는 별도 준비 대상이다. `ready=true`만으로 peer 실제 응답·같은 DB·drain까지 증명하지 않는다.

**PRODUCTION — DO NOT RUN IN PHASE2D** (읽기)

```powershell
& node $wranglerScript d1 execute birdmap-reports --remote --command "SELECT * FROM pragma_foreign_key_check" --json -c reports-api/wrangler.public.toml
& node $wranglerScript d1 execute birdmap-reports --remote --command "SELECT COUNT(*) n FROM transaction_assertions" --json -c reports-api/wrangler.public.toml
```

예상 FK 결과 0행, assertion 0. table-valued PRAGMA 지원은 실제 적용 전 검증 client에서 확인하고, 오류를 정상으로 간주하지 않는다. CHECK 위반 삽입 시험은 staging에서만 한다. GO: hash·별도 legacy·ledger·FK/CHECK 정상. NO-GO: 하나라도 불일치; maintenance 유지, 스키마를 추정 보정하지 않는다.

## 7. sites 최초 seed

목적: siteData의 기존 190 ID를 그대로 등록한다.

**PRODUCTION — DO NOT RUN IN PHASE2D** (로컬 계획 요약, write 없음)

```powershell
# frozen manifest의 승인한 captured_at을 한 번 고정한다. 재실행 시 현재 시각으로 바꾸지 않는다.
$capturedAtUtc = $approvedFrozenManifest.captured_at
$seedOutput = & node reports-api/tools/prepare-sites.mjs index.html $capturedAtUtc
if ($LASTEXITCODE -ne 0) { throw 'SEED_PREPARATION_FAILED' }
$seedPlan = $seedOutput | ConvertFrom-Json
$seedPlan | Select-Object source_count, registry_revision
```

현재 checksum은 `4a7aba945b6fbf245cbaca980bc073324584e8bd2c49c15483a449aed436550d`. 실제 실행 artifact에서 다시 산출한다. source_record 전체/좌표를 로그에 출력하지 않는다. 최초 승인한 seed plan 전체와 captured_at을 제한 접근 기록에 보관하고 재실행 때 그대로 사용한다. checksum이 같아도 새 시각으로 plan을 재생성하면 sites.created_at 차이로 REGISTRY_DRIFT가 될 수 있다.

**USER CONFIRMATION REQUIRED — BLOCKED — NO EXECUTABLE COMMAND**: 원격 생산 seed 도구 없음. `seedSitesLocally(scope:'local-test')`를 production에 연결하지 않는다.

기대: sites 190, ID·이름·기존 좌표·source record·revision 전체 일치, taxa 0. 같은 source 재실행 신규 0, 변경 source 거부. GO: full verify·FK 0. NO-GO: 누락/합병/재번호/부분 seed. rollback: 빈 상태/완료 상태를 먼저 검증, 삭제·덮어쓰기 없이 maintenance.

## 8. frozen N 최초 backfill

목적: 같은 DB의 원자 batch로 raw/checklist/sighting cohort와 backfill_runs를 생성한다. **USER CONFIRMATION REQUIRED — BLOCKED — NO EXECUTABLE COMMAND**: production remote apply/full verify/resume 도구가 없다.

`prepare-backfill --prepare-apply`는 apply하지 않는다. Phase 2C 실행기는 21·합성 UUID·synthetic IP·staging DB guard가 있으며 ID만 바꾸어 쓰지 않는다. `applyBackfillLocally`의 local-test guard를 우회하지 않는다.

기대: frozen reports N 불변, raw N, checklist N. 현재 transform은 원문을 하나의 legacy sighting으로 보존하므로 sighting N이며 여러 종 문자열이면 unresolved 해석+개별 count NULL+compat shared count 보존이다. 실제 frozen source의 종/수량 구조를 다시 검증한다. 종별 수량 분배·NULL을 0/1 생성·unknown 수량 삭제·taxon 추정·historical review/audit 생성은 금지한다.

검증: reports 전체22필드 및 canonical projection/원문 provenance 동등성, approved/rejected/pending·site/spot·동의·coordinate fallback·count 의미, FK0, assertions0, backfill_runs 실제manifest1. 동일 manifest 재실행은 신규0+전체동등성. 변경 manifest와 partial state는 자동 repair 없이 오류. 응답 유실 시 먼저 verify; 성공이면 재삽입0 replay, 부분 상태이면 중단한다.

GO: 모든 조건 및 다음 limit 검증 통과. NO-GO: frozen source 변동/중복/오류/유실상태 불명. rollback: 외부 freeze+maintenance, reports 유지, L3부터 판단. INSERT OR IGNORE로 충돌을 숨기지 않는다.

### 초기 batch 예산과 미래 chunk

현재 라이브러리의 성공 경로를 실제 계측했다. K는 site_id가 NULL 아닌 source 행 수다.

| 구간 | SQL 문장 수 |
|---|---:|
| 사전 전체 검증 | N+K+6 |
| 하나의 원자 쓰기 batch | 3N+1 |
| 사후 전체 검증 | 4N+7 |
| 합계 | 8N+K+14 |
| binding 실행 호출 합계(batch를 한 호출로 센 값) | 5N+K+14 |

현재 관측 N23/K18 대입은 pre47+batch70+post99=216 SQL, binding147이다. **현재 관측값 예시**이며 frozen 값으로 다시 계산한다. Phase 2C의 `reserve16` 식은 현행 helper 전체 비용이 아니다. seed190은 별도 단계·예산이다.

공식 한도는 Worker invocation당 queries Free50/Paid1000, 문장 100KB·매개변수100·row/string2MB 및 전체 batch 호출30초 제약을 검토해야 한다. 실제 executor invocation 경계와 batch accounting을 확인해야 하며 `.batch()` 하나라는 이유로 모든 query를 1로 예산화하지 않는다. 전체 pre+post SELECT만 해도 현재 관측 기준146개라 단일 Free invocation은 부적합하다. 계정 plan은 403으로 미확정이며 staging190 batch 성공만으로 Paid라고 추정하지 않는다. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [batch 원자성](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Paid 문장 수 범위 안이라고 시간·CPU·payload·실제 source 검증이 통과한 것은 아니다. 승인한 원격 실행기로 current N과 같은 크기의 합성 자료를 같은 호출 경계에서 시험해야 한다. 부적합하면 즉석 chunking을 하지 않는다. 미래 대규모 backfill은 chunk manifest/완료 이력/부분 상태/재시도 원칙을 별도 Phase에서 설계한다.

## 9. 공개 DTO·shadow·실제 HTTP smoke

목적: 기존 읽기 의미를 유지함을 증명한다. **현재 생산용 전체 비교 client와 frozen baseline 생성은 BLOCKED**. 합성 staging 동등성만으로 실제 자료 전체를 대체하지 않는다.

검증 경로: GET /reports/approved, /pending, /site/<id>의 모든 page/total, /<uuid>/status. species 원문 표시, bird_count NULL/0/1, 날짜, name_public/reporter, pending_public, spot 대표/연결, 좌표 fallback, 순서·pagination·total·status·response shape를 private 비교한다. 공개 보고는 mismatch 경로/필드 이름/건수만 기록한다.

외부 write 차단 상태의 실제 HTTP smoke는 GET 정상과 의도한 503+Retry-After·인증 실패 거부를 확인한다. **운영 테스트 제보를 넣지 않는다.** 성공 write/CAS 등은 staging에서 검증한다. 전환 후 첫 적법한 실사용 요청을 승인된 감시로 확인하며, 합성 자료를 production에 넣는 별도 허가는 이 runbook에 포함되지 않는다.

비교 완료의 증거도 필요하다. background 방식을 쓰면 `REPORTS_SHADOW_READ=true`, 필수 경로별 실제 비교 실행/완료 건수, `canonical_shadow_error=0`을 확인한다. 현재 shadow.js는 성공 로그를 내지 않으므로 “mismatch 로그 없음”은 통과 증거가 아니다. 완료 관측이 없으면 검증 client의 직접 legacy/canonical 비교 결과·완료 건수를 사용한다.

GO: 필수 비교 완료+mismatch0+shadow error0, HTTP 기대 일치, 원본 digest 그대로. NO-GO: 미실행/로그 누락 또는 공개범위·마커·이름·좌표 등 어느 차이든 maintenance 유지. rollback: L2/L3. 현재 사용자 read는 계속 legacy다.

## 10. UI·양방향 gate 확인 후 활성화

목적: 구/신 Worker 혼재에서 한쪽만 writer가 열리지 않게 한다. 먼저 외부 freeze를 유지한 상태로 배포한다.

필수 승인 config 값: `ENVIRONMENT=production`, `REPORTS_WRITE_MODE=CANONICAL_DUAL_WRITE`, `REPORTS_DUAL_WRITE_ENABLED=true`, `REPORTS_CONFIRMATION_REQUIRED=true`, `REPORTS_SCHEMA_VERSION=phase2a-0001`, `REPORTS_REMOTE_VERIFIED=true`, 동일 nonempty ACTIVATION_ID, 각 RELEASE_ID와 정확한 상대 PEER_RELEASE_ID, `REPORTS_PENDING_PUBLIC`의 승인한 0/1, 실제 상호 REPORTS_PEER service binding 및 동일 gate secret. 기존 TURNSTILE/IP salt/Access를 staging 값으로 바꾸지 않는다. 운영 신규 pending 공개값은 별도 결정이 필요하다. 현재 자료 원값은 변경하지 않는다.

`REPORTS_REMOTE_VERIFIED=true`는 실제 시험·승인 증거를 확인한 뒤에만 설정한다. README 문구만으로 true 처리하지 않는다. 신 public+구 admin 또는 구 public+신 admin에서 v3 새 writer는 peer 불일치로 닫히지만, 구 NORMAL writer는 v3가 통제하지 못하므로 Step 2 독립 freeze로 따로 차단한다. 한쪽 release mismatch를 양방향 확인하는 v3를 유지한다. capability ready 외에 실제 peer 응답/대칭 기대값과 DB binding을 확인한다.

**PRODUCTION — DO NOT RUN IN PHASE2D / USER CONFIRMATION REQUIRED**

```powershell
# 외부 freeze를 유지하고 승인된 dual config로 admin 확인 후 public 확인.
& node $wranglerScript deploy -c $approvedAdminConfig
& node $wranglerScript deploy -c $approvedPublicConfig
```

실제 Phase 2E에서는 각 배포 후 버전 수렴·capability·GET·차단 상태를 확인한 뒤 다음 배포를 승인한다. 현재 dual config/실행 client는 BLOCKED이므로 위 명령을 지금 사용할 수 없다. `index.html`의 `REPORTS_CANONICAL_UI_ENABLED=false`는 별도 승인으로 전환해야 하며, 현재 capabilities API 자동 연동은 없다. request_id+non_breeding_confirmed 전송·오류 안내·구 탭 새로고침과 실제 배포 결과를 검증한다. 캐시된 구 UI의 제출 영향 및 공지 계획도 확인한다. 프런트 변경·배포는 별도 승인 범위다.

GO: schemaReady, v3 build·activation·release·peerRelease 대칭, 같은 production DB, UI 준비·Access·Turnstile·HTTP 정상. NO-GO: 한 항목이라도 미충족. rollback: 외부 freeze 유지, 두 maintenance 버전으로 복귀.

## 11. 외부 freeze 해제·감시·정상화

목적: 검증된 writer만 사용자에게 연다. **USER CONFIRMATION REQUIRED — BLOCKED — NO EXECUTABLE COMMAND**: 독립 freeze 수단과 해제 명령의 staging rehearsal이 선행되어야 한다.

기대: 승인한 최신 두 Worker만 write 가능, 옛 preview/version/direct writer는 계속 닫힘. 적법한 실제 제보의 reports/raw/checklist/sighting 동시 생성, 중복0, 관리자 CAS/reviews/audit 일관성을 민감 payload 없이 확인한다. 같은 요청 retry는 replay, 다른 payload conflict를 유지한다. 정상 완료 공지를 한다.

GO: 전체 필수 checklist 서명과 명시적 사용자 해제 승인. NO-GO: shadow/HTTP/CAS/peer/count 오류 또는 시간 초과. 즉시 외부 freeze 재적용+maintenance, [복구 runbook](recovery-runbook.md)으로 이동. Phase 2D 승인 응답을 이 단계 해제 승인으로 재사용하지 않는다.
