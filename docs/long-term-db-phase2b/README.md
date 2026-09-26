# Phase 2B — 애플리케이션 구현 및 로컬 검증 결과

**Phase 2B 완료.** 코드 구현과 로컬 검증을 마쳤으며, 기존 프런트 회귀시험 1개 실패는 변경 전 HEAD에서도 재현되는 기존 실패로 사용자가 명시적으로 예외 수용했다. 204개 중 203개 통과/1개 실패 사실을 그대로 기록한다. 날씨·조석 코드/자료는 변경하지 않았다. 이 완료 판정은 운영 활성화 승인이 아니며 Phase 2C는 시작하지 않았다.

Phase 2A의 9테이블·114컬럼 및 SQL을 그대로 사용한다. 운영 활성화 플래그와 Wrangler 배포 설정은 변경하지 않았다. [실행 증거](execution-evidence.md), [보존 검사](preservation.json), [체크포인트](CHECKPOINT.md)를 함께 읽는다.

## A. 시작 상태

- branch `main`, HEAD `d39bf4bf2d7e147b246f867f56567f814eddd4b9`. 시작 시 추적 파일 변경 없이 `?? docs/`만 존재했다.
- 시작할 때 Phase 2B 구현/체크포인트가 없었으며, Phase 1/2A 파일을 먼저 읽고 실제 상태에서 작업했다. 이번 재개에서는 이미 구현된 코드와 시험을 보존했다.
- 시작 시 공개 GitHub 읽기 비교: 2026-09-26T04:30Z, remote main `09e91a2b53a3779c43a2bb1811c9b49a71202f1e`, 로컬보다 14 commits 앞섬/뒤처짐 0. 변경은 자동 생성 날씨·조석 JSON 5개뿐이었다. fetch/pull하지 않았다.
- 로컬 `origin/main` 참조는 `6bf58a583391b174ccd15117ddeaef233010e1ee`이다. 원격 시작 실측과 로컬 추적 참조를 구분한다. 종료 시 GitHub 재조회는 자동 승인 검토의 사용량 오류로 실행되지 않았다.
- Phase 1은 시작 시부터 13파일이었다. 과거 문서에 언급된 execution-evidence.zip은 이미 없었으며 삭제하거나 재생성하지 않았다. Phase 2A 12파일을 보존했다.

## B. 변경 파일 전체 목록

V에 모든 전달 파일과 역할을 한 번에 정리했다. 추적 파일 변경은 5개이고, 새 애플리케이션 코드는 helper/adapter/tool/test로 분리했다. 기존 SQL·기존 테스트·날씨·조석 기능은 변경하지 않았다.

## C. 기존 관리자 8 action 동작 분석

공통으로 admin_note는 입력이 없으면 유지하며 입력 시 기존 1,000자 제한을 유지한다. 아래는 실제 기존 handler에서 추출한 reports 변경 필드다.

| action | 기존 reports 변경 필드 및 의미 |
|---|---|
| approve | status=approved, species, lat/lon, public_lat/public_lon, site_id, observed_on, name_public, decided_at, admin_note. 생략값 유지·기존 정규화 규칙 유지. pending_public은 건드리지 않는다. |
| reject | status=rejected, pending_public=0, decided_at, admin_note |
| unpublish | status=pending, pending_public=0, decided_at, admin_note |
| link | status=approved, spot_key, decided_at, admin_note. 기존 fixed 키 문법 또는 연결되지 않은 제보 UUID. pending_public 유지. |
| unlink | spot_key=NULL, admin_note |
| consent | name_public, admin_note |
| visibility | pending_public, approx_lat/approx_lon, admin_note. 공개는 pending만 가능하며 공개 시 근사 쌍이 없으면 기존 계산법으로 생성. |
| site | site_id 또는 NULL, admin_note. 승인 상태/좌표 유지. |

8개 모두 bird_count/reporter/note/received_at/ip_hash/dedupe_hash를 자동 변경하지 않는다. 기본 NORMAL 경로는 이 계획을 기존 reports에 적용한다. dual 모드는 추가로 canonical FK를 검증하여 미등록 site_id를 거절한다. 관리자 목록의 수정할 값과 revision은 하나의 SELECT 스냅샷에서 읽어 오래된 폼에 새 revision을 붙이는 경쟁 조건을 막는다.

## D. quick POST dual-write

CANONICAL_DUAL_WRITE 경로만 엄격한 non_breeding_confirmed=true 및 request_id를 요구한다. 누락/false/문자열/숫자를 DB 쓰기 전에 거절한다. 현재 quick 입력은 유한한 실제 좌표 쌍이 필수다. 새 경로는 종명·계절·희귀도에서 번식 여부를 추론하지 않는다.

같은 REPORTS_DB.batch 안에 tombstone 검사와 reports/raw_submissions/checklists/sightings INSERT를 넣었다. 중간·후반 실패 모두 rollback을 시험했다. raw에는 선택된 제출 입력과 접수 결과를 저장하고 Turnstile 토큰은 저장하지 않는다. 최초 제출이 아닌 legacy snapshot에는 제출시각/동의를 만들어 넣지 않는다.

기존 UI를 깨지 않도록 NORMAL writer와 현재 기본 UI를 유지한다. 새 UI 확인 문구/request protocol은 REPORTS_CANONICAL_UI_ENABLED=false 뒤에 있다. 이를 켜기 전에는 새 확인 정책이 운영에 적용된 것으로 해석하지 않는다.

## E. idempotency

신규 request UUID를 새 reports.id로 사용한다. 동일 request+동일 입력은 기존 성공 접수를 재사용하고 다른 입력은 409다. CAPTCHA 토큰 변경은 입력 의미에서 제외한다. CAPTCHA 또는 rate-limit 오류가 도착하기 전에 다른 호출이 커밋했으면 성공 기록을 다시 읽는다. INSERT OR IGNORE는 사용하지 않는다.

재시도는 현재 공개 철회도 반영한다. 반려/unpublish/visibility 철회 후 과거 접수 응답의 황색 마커를 다시 반환하지 않는다. 따라서 검토 후 재시도의 status/공개 필드는 현재 상태이며, 검토 전에는 기존 응답과 동일하다. 요청 의미/좌표를 로그에 출력하지 않는다. UI의 재시도 ID는 현재 페이지 메모리에만 유지되며 페이지 새로고침을 넘는 영속 보관은 제공하지 않는다.

## F. count 보존

신규 quick의 NULL/0/1을 구별한다. legacy 합성 21건에서 13개 1은 1/unknown, 8개 NULL은 NULL/unknown으로 남았다. 이는 운영 재실측 건수가 아니라 주어진 legacy 특성을 가진 합성 fixture 검증이다.

여러 종+공유 count는 species 원문과 checklist.shared_bird_count에 그대로 보존한다. 개별 sighting은 unparsed_multiple/count=NULL/taxon=NULL이며 임의 분할하지 않는다. 검증된 관리자의 개별 sighting 검토는 별도 값이고 기존 공유 수량을 자동 수정하지 않는다.

## G. CAS

expected_revision과 현재 revision을 확인하고 checklist UPDATE ... WHERE revision=? 직후 changes() assertion을 실행한다. 사이에 다른 DML을 넣지 않는다. legacy UPDATE, review, audit까지 같은 batch에 포함된다. stale revision/후반 실패는 전체 rollback이며 성공 후 transaction_assertions는 0행이다. 원격 D1의 changes()/실제 동시성은 검증하지 않았다.

## H. reviews

review_id PK, UNIQUE(checklist_id,sequence), UNIQUE(request_id,event_index)를 유지한다. 동일 request에서 상태 검토와 여러 sighting 검토를 허용한다. audit의 event_count와 저장된 review 의미/순서를 접수 receipt와 비교해 replay한다. 사건 의미가 바뀌면 conflict다. 기존 legacy 검토 이력은 만들어 넣지 않았다. 일반 요청은 review/audit append만 수행한다.

## I. append-only / purge 정책

**B 방식**을 선택했다. 기존 DB UPDATE 차단 trigger를 유지하고, 일반 애플리케이션 DB 경계에서는 reviews/audit/raw의 UPDATE 및 일반 DELETE를 차단한다. 새 trigger capability/control 테이블 없이 내부 purge 함수만 원시 binding으로 삭제한다. 직접 D1 자격증명을 가진 사용자를 막는 DB 역할 ACL은 아니다. A 방식은 삭제 예외를 위한 DB 상태·권한 관리가 추가되어 현재 규모에 불필요하다.

purge는 HTTP route가 없는 내부 함수다. 명시적 flag·allowlist actor·확인 문자열·비민감 reason·maintenance·schema/peer gate·revision이 모두 필요하다. native의 raw/checklist/sightings/reviews/관련 audit 및 reports를 같은 batch로 제거하고 최소 forbidden_content_purged tombstone만 남긴다. tombstone에는 원문/좌표/종+위치 fingerprint가 없고 request_fingerprint=NULL, event_count=0이다. 같은 ID의 재접수는 410으로 막는다.

**legacy reports 삭제 금지와 기존 자료 purge 요구의 충돌은 추정하지 않았다.** legacy 대상은 PURGE_LEGACY_DECISION_REQUIRED로 거절한다. inbound spot 연결이 있으면 자동 unlink하지 않고 중단한다. 캐시·백업·외부 복사본 제거는 이 함수의 검증 범위 밖이며 운영자 결정 사항이다. 운영 purge는 0회다.

## J. canonical read adapter

checklists의 compatibility projection으로 기존 reports 22필드를 만든 뒤 기존 SELECT/serializer를 재사용한다. approved/pending/site history/status의 species, count, 날짜, 이름 동의, pending 공개, spot 연결, 좌표 fallback, 정렬, pagination/total을 유지한다. generatedAt만 비교에서 제외한다. 독립 approved의 공개좌표가 NULL이면 실제좌표를 사용하던 기존 동작도 유지하며 정책을 몰래 변경하지 않는다. 사용자 응답은 여전히 legacy다.

장기 DB의 실제좌표는 둘 다 NULL 또는 둘 다 존재한다. 실제좌표가 없으면 site_id가 필요한 Phase 2A 제약을 유지한다. legacy/quick DTO가 표현하지 못하는 site-only complete checklist는 compatibility projection에서 제외하고 미래 확장으로 남긴다.

## K. shadow-read

REPORTS_SHADOW_READ=true인 경우만 canonical DTO를 백그라운드 비교한다. 응답은 legacy를 반환한다. 모양/순서/종/수량/좌표/이름/상태/spot/페이지 필드의 차이를 범주로 기록한다. 값·행 ID·좌표·payload·fingerprint·원시 오류를 기록하지 않는다. 기본 비활성이다.

## L. maintenance/write-freeze

NORMAL은 기존 동작, READ_ONLY_MAINTENANCE는 POST와 관리자 mutation에 503/Retry-After:60, CANONICAL_DUAL_WRITE는 검증된 새 writer다. GET과 관리자 조회는 허용한다. schema 이전의 maintenance에서도 관리자 조회가 가능하며 revision은 NULL이다. 실제 운영 maintenance 전환은 하지 않았다.

## M. mixed-version Worker 대응

같은 activation ID, schema version, build capability, 예상 peer release, mode, ready를 두 Worker의 비공개 service binding endpoint에서 대조한다. gate token을 요구하고 peer 실패 시 legacy 쓰기로 우회하지 않는다. schemaReady는 실제 9개 테이블과 인덱스/trigger SQL의 구조 hash를 검사한다.

설정은 REPORTS_WRITE_MODE, REPORTS_DUAL_WRITE_ENABLED, REPORTS_CONFIRMATION_REQUIRED, REPORTS_SCHEMA_VERSION, REPORTS_ACTIVATION_ID, REPORTS_RELEASE_ID, REPORTS_PEER_RELEASE_ID, REPORTS_GATE_TOKEN, REPORTS_PEER 및 명시적 REPORTS_PENDING_PUBLIC(0 또는 1)이다. production은 REPORTS_REMOTE_VERIFIED=true도 필요하다. 모두 기존 운영 설정에 추가하지 않았다.

이 gate는 구 Worker 전체의 drain 또는 동일 D1 binding을 증명하지 않는다. 운영자는 외부 쓰기 차단 → 확인 UI 배포/재로딩 안내 → 동일 DB·seed·backfill·원격 시험 증명 → 두 새 Worker 100% 배포/구 요청 drain → 활성화 검증 → 차단 해제 순서를 별도로 승인해야 한다. 신규 UI는 capability API를 자동 소비하지 않으며 공개 capabilities는 준비 완료 인증서가 아니다. peer token/배포 ID/활성화 값은 여기서 임의 생성하지 않았다.

## N. sites seed

현재 siteData 190개를 읽고 ID/좌표/원본 레코드를 그대로 보존한다. 중복 ID나 불완전 좌표는 오류다. 같은 이름을 합치지 않는다. registry checksum은 ID 순으로 정렬한 원본 레코드의 stable JSON SHA-256이다(번호를 재발급/재정렬하는 의미가 아님). 재실행 시 전체 동등성을 확인한다. prepare-sites.mjs는 계획 JSON만 출력하며 DB 연결이 없다. 운영 seed는 실행하지 않았다.

## O. backfill 도구

Phase 2A fixture를 운영 도구로 복사하지 않고 별도 validation/transform을 구현했다. frozen reports 22필드 snapshot, canonical manifest SHA-256, transform version, source count, registry revision, captured_at, run_id가 필요하다. manifest는 id 순으로 정렬한 reports의 stable JSON SHA-256이며 원시 파일 바이트 hash와 구분한다.

--dry-run, --prepare-apply, --verify-only를 제공한다. verify-only는 지정된 로컬 SQLite 파일을 readOnly로 열고 쓰기 없이 검사한다. CLI에는 --apply/원격 모드가 없다. 준비된 변환을 같은 batch에 넣는 실행기는 scope=local-test, writeFrozen=true에서만 시험했다.

같은 manifest는 신규 0 및 raw/checklist/sighting 전체 동등성 검사, 다른 manifest/부분 상태/source drift/미등록 FK는 중단한다. 실제 sites 190개와 원본/좌표/checksum을 대조한다. 잘못된 날짜·시각·동의·수량을 추정 보정하지 않는다. schema ledger는 기존 공식 Wrangler 체계, 실행 ledger는 Phase 2A의 6컬럼 backfill_runs 그대로다. 시각/좌표 chronology 추가 판단, 계정별 원격 batch 한도, 실제 동결/drain은 Phase 2C 대상이다.

## P. taxa 처리

기존 taxa DDL 및 FK만 유지했다. legacy taxon_id는 NULL이다. 명시적 sighting 검토에서도 존재하는 taxon만 허용한다. 대량 import·자동 종 매칭·taxonomy source/version 추정은 하지 않았다. complete checklist UI, 사진/R2/media/environment_snapshots, 과거 날씨·조석 소급 연결도 구현하지 않았다.

## Q. 신규 테스트 결과

- 실제 로컬 Miniflare D1: 32/32 PASS. 4테이블 원자성, confirmation zero-write, NULL/0/1, replay/conflict, CAS/rollback, 8 action, 복수 reviews, purge, DTO, maintenance/peer, seed/backfill, 최종 FK/assertion 등을 포함한다.
- CLI/브라우저 함수 protocol: 5/5 PASS. read-only SQLite 파일 바이트 불변, prepare-only, 190 seed, opt-in 확인/재시도, 관리자 revision을 시험했다.
- 보존한 Phase 2A proof를 임시 복사본에서 현재 Worker와 다시 실행: 17/17 PASS. 원본 문서/SQL/proof/evidence는 갱신하지 않았다.
- 새 기능의 전체 브라우저 E2E 또는 실제 원격 동시성까지 검증한 것으로 해석하지 않는다.

## R. 기존 106개 회귀 테스트 결과

기존 reports-api suite 106 PASS / 0 FAIL / 0 SKIP. 기존 테스트 파일 수정 없음. 기본 NORMAL legacy 경로와 관리자 동작을 유지했다.

## S. 날씨·조석 회귀 결과

weather-proxy 36/36 PASS. Python offline 81개 중 80 PASS/1 SKIP. 프런트 204개 중 203 PASS/1 FAIL이며, 완전한 변경 전 HEAD 복사본도 동일 203 PASS/1 FAIL이다.

유일한 실패는 test_weekly_recommendation.mjs의 2026-09-17 매향리 실자료 가정이다. 저장된 주간 최고 만조가 시험 가정(<850cm)과 달리 882cm라 실패한다. 현재 작업으로 생성/변경한 자료가 아니며 자동 날씨·조석 JSON과 기능을 수정하지 않았다. **전체 회귀 통과라고 선언하지 않는다. 사용자는 이 1개를 기존 실패 예외로 기록하고 Phase 2B를 완료하는 데 명시적으로 동의했다.**

## T. Phase 2A와 달라진 부분과 이유

SQL/테이블/컬럼 수는 그대로다. 애플리케이션에서 DELETE 정책 B, native purge tombstone, request receipt, 엄격한 rollout/peer gate, UI opt-in, 실제 registry/날짜 validation을 구체화했다. 현재 공개 DTO의 count는 shared count이며 개별 sighting 수량을 자동 합산하지 않는다. legacy purge 정책과 pending 공개 기본값은 임의 결정하지 않고 fail-closed/미활성 상태로 남겼다.

## U. Phase 2C에서 반드시 원격 검증할 항목

remote staging D1, 공식 migration 이력, 동일 DB binding, 실제 schema hash, batch 원자성/changes()/CAS, 동시 request와 일회용 CAPTCHA, 계정 쿼리 한도, mixed-version 100% 배포/외부 freeze/drain, backfill 동결 및 동등성, old UI 재로딩, rollback Worker, Time Travel/restore rehearsal, 캐시·백업 purge 정책. 모두 이번 단계에서 실행하지 않았다. Phase 2C를 자동 시작하지 않는다.

## V. 생성/수정 파일 전체 목록

| 구분 | 파일 | 역할 |
|---|---|---|
| 수정 | index.html | 기본 OFF 확인 checkbox/request 재시도 UI; siteData/날씨/조석 변경 없음 |
| 수정 | reports-api/src/admin-page.js | revision/request protocol, 현재 페이지 내 재시도 ID |
| 수정 | reports-api/src/admin.js | 공통 action plan, dual writer, capability, revision 일관 조회 |
| 수정 | reports-api/src/public.js | gated quick submit, capabilities, shadow wrapper |
| 수정 | reports-api/src/shared.js | maintenance Retry-After 응답 |
| 신규 | reports-api/src/admin-actions.js | 기존 8 action의 필드 변경 계획 |
| 신규 | reports-api/src/canonical/data.js | 데이터 매핑, projection, SQL 경계, 식별자/해시 |
| 신규 | reports-api/src/canonical/control.js | mode/schema/peer/activation gate |
| 신규 | reports-api/src/canonical/persistence.js | quick/admin batch, CAS, 멱등성, reviews |
| 신규 | reports-api/src/canonical/purge.js | 권한 있는 native 정책 purge 내부 함수 |
| 신규 | reports-api/src/canonical/shadow.js | 민감 값 없는 DTO 차이 집계 |
| 신규 | reports-api/tools/backfill-lib.mjs | frozen source 검증/변환/로컬 실행 |
| 신규 | reports-api/tools/prepare-backfill.mjs | dry-run/verify-only/prepare-apply CLI |
| 신규 | reports-api/tools/sites-seed.mjs | registry seed 계획과 로컬 검증 |
| 신규 | reports-api/tools/prepare-sites.mjs | seed 계획 JSON CLI |
| 신규 | reports-api/local-test/helpers.mjs | 합성 인증/로컬 D1/failure injection |
| 신규 | reports-api/local-test/run.mjs | 실제 D1 32개 시험 |
| 신규 | reports-api/local-test/protocol-check.mjs | CLI/현재 UI 함수 5개 시험 |
| 신규 | reports-api/local-test/repeat-phase2a.mjs | 원본을 보존하는 2A proof 임시 복사 실행 |
| 신규 | reports-api/local-test/baseline-regression.mjs | HEAD 임시 복사 회귀 비교; Git read only |
| 신규 | docs/long-term-db-phase2b/README.md | A–Z 결과 및 미해결 결정 |
| 신규 | docs/long-term-db-phase2b/execution-evidence.md | 실행/한계/재현 방법 |
| 신규 | docs/long-term-db-phase2b/CHECKPOINT.md | 정확한 재개 지점 |
| 신규 | docs/long-term-db-phase2b/preservation.json | 487개 기준 파일 보존 확인 |
| 신규 | docs/long-term-db-phase2b/test-results.json | 최종 시험 집계/소스 SHA-256 |
| 신규 | docs/long-term-db-phase2b/.gitignore | .local 런타임/로그 제외 |

.local 아래 시작 manifest, TAP/JSON 로그, 합성 SQLite/snapshot 및 실패 실행 기록을 보존했다. 재실행 임시 복사본은 Windows Temp에 남겨 두었다. 운영 데이터/토큰을 기록하지 않았다. 이 일시 파일들은 배포 산출물이 아니다.

## W. git diff 요약

추적 파일 5개, 109줄 추가/218줄 삭제. 기존 admin mutation을 작은 공통 모듈로 옮겨 삭제가 크게 보인다. 신규 파일은 untracked여서 이 git diff --stat 수치에 포함되지 않는다. git diff --check 통과. 기준 487개 중 의도한 위 5개 외 모두 byte hash 동일: 나머지 기존 추적 457개 + Phase 1/2A 25개 보존. siteData 좌표/ID와 날씨 Worker 좌표 일치 시험도 통과했다.

## X. 운영 D1 변경 여부

이번 Phase 2B의 운영 D1 API 호출/쓰기/seed/backfill/migration 모두 0. 운영 행수·좌표를 다시 수집하거나 export하지 않았다. 로컬 합성 DDL 및 로컬 Wrangler proof 실행은 운영 migration과 구분한다. 다른 사용자가 운영을 변경했는지에 대한 독립 원격 실측 주장은 하지 않는다.

## Y. 운영 Worker 변경 여부

배포 0, 운영 maintenance/feature flag 변경 0. 기존 Wrangler 설정 파일 hash 보존. 배포 버전을 조회/변경하지 않았으므로 최신 전역 운영 버전 확인 결과로 해석하지 않는다.

## Z. commit/push 여부

commit 0, push 0, fetch/pull 0. HEAD/branch 유지. reset/clean/restore/강제 checkout 없음. 모든 로컬 작업물을 남겨 두었다. 기존 회귀 실패 1개를 사용자 승인 예외로 기록해 Phase 2B를 완료했다. Phase 2C는 시작하지 않으며 다음 지시를 기다린다.