# Phase 2D 실행 증거

최종 판정: **PHASE 2E PRODUCTION CUTOVER: NO-GO**. Production 변경은 수행하지 않았다. 아래 실측은 2026-09-26 UTC이며 KST는 +9시간이다. 준비 문서 작성 완료와 실제 cutover 준비 완료를 구분한다.

## 1. 시작·종료 Git 및 소스 보존

| 항목 | 결과 |
|---|---|
| Branch / HEAD | `main` / `d39bf4bf2d7e147b246f867f56567f814eddd4b9` — 시작·종료 동일 |
| 로컬 origin/main | `6bf58a583391b174ccd15117ddeaef233010e1ee` — fetch 없이 보존 |
| 최신 GitHub main | `15c9b192d2b24faaffb9f44a625dcd43d0e30710` |
| 마지막 remote GET | 2026-09-26T12:36:57.496Z |
| HEAD...remote 비교 | remote ahead16/behind0, 변경 파일 5개 |
| 변경 파일 | tide_health.json, tide_month.json, tide_today.json, weather_today.json, weather_week.json |
| reports 관련 code drift | 0 — `PHASE_2D_NO_GO_CODE_DRIFT`에는 해당하지 않음 |
| 기존 파일 hash 검증 | **545/545 동일**, 2026-09-26T12:37:02.127Z |
| commit / push / fetch / merge | 모두 0 |

기존 추적 변경은 index.html, reports-api/src/admin-page.js, admin.js, public.js, shared.js 5개이며 합계 +109/-218이다. Phase 2D 시작 시 이미 있던 변경으로 내용과 hash가 그대로다. 기존 미추적 docs, reports-api/local-test, src/admin-actions.js, src/canonical, tools도 삭제·교체하지 않았다. Phase 1/2A/2B/2C 문서와 patch를 변경하지 않았다. 날씨·조석 파일도 이번 작업에서 수정하지 않았다.

읽은 기준: Phase 1 전체 역사 문서·SQL, Phase 2A README/data dictionary/execution evidence/migration/proof, Phase 2B 문서·테스트·준비 도구·현재 앱, Phase 2C README/evidence/test-results/CHECKPOINT/patch 및 원격 proof 코드. 병렬 검토자는 읽기만 했고 파일 수정은 주 작업자만 수행했다.

## 2. Production 신규 SELECT 실측

완료한 baseline: **2026-09-26T12:13:00.480Z → 12:37:01.239Z**. 두 baseline에서 다음 결과와 스키마가 같았다. 운영은 실제 freeze하지 않았으므로 미래 실행 때 반드시 다시 측정한다.

| 지표 | 새 실측값 |
|---|---:|
| 전체 reports | 23 |
| approved / rejected / pending | 19 / 4 / 0 |
| 예상 외 status | 0 |
| site_id NULL / 값 존재 | 5 / 18 |
| 현재 190 registry에 없는 site_id | 0 |
| species NULL / 빈 문자열 | 0 / 0 |
| 다종 구분자 후보 / 후보와 공유 count | 0 / 0 |
| species 최대 문자 수 | 8 |
| bird_count NULL / INTEGER 1 / 그 외 값 | 8 / 15 / 0 |
| public 좌표 둘 다 NULL / 불완전 쌍 | 23 / 0 |
| approx 좌표 둘 다 NULL / 불완전 쌍 | 2 / 0 |
| actual 좌표 둘 다 NULL / 불완전 쌍 | 0 / 0 |
| 승인 자료 중 actual fallback 대상 | 19 |
| actual/public 범위 검사 이상 | 0 |
| spot_key NULL / 값 존재 / orphan | 23 / 0 / 0 |
| observed_on 검사 이상 | 0 |
| received_at / decided_at 파싱 이상 | 0 / 0 |
| decided_at < received_at | 0 |

species는 현 parser 구분자인 쉼표·가운뎃점·슬래시·세미콜론·개행 포함 여부를 집계했다. 실제 종명 원문은 조회하지 않았으며 의미론적으로 모든 문자열을 검증했다고 주장하지 않는다. 날짜는 SQLite date/julianday 기반 검사이므로 준비 라이브러리의 엄격한 날짜 검증을 대신하지 않는다. spot self-link SUM은 전부 NULL 입력으로 SQL NULL을 반환했다. nonnull0이므로 연결 자체가 없으며 NULL 집계를 임의 숫자로 바꾸어 보고하지 않았다.

동의값 분포:

| name_public | pending_public | 건수 |
|---:|---:|---:|
| 0 | 0 | 4 |
| 0 | 1 | 8 |
| 1 | 0 | 2 |
| 1 | 1 | 9 |

name_public 0/1=12/11, pending_public 0/1=6/17. 최근 received_at은 `2026-09-25T23:15:36.003Z`, 최초는 `2026-09-20T12:50:43.058Z`다. UUID·좌표·제보자 이름·note·IP hash를 운영 보고서에 나열하지 않았다.

이 23건은 migration 상수가 아니다. Phase 0 21건의 숫자를 재사용하지 않았다. 현재 15개 count=1은 legacy backfill 시 1+unknown, NULL8개는 NULL+unknown이 기대되지만 **실제 적용 기준은 frozen N 재측정 결과**다. 기존 값을 정규화/수정하지 않았다.

## 3. 운영 스키마·Worker

sqlite_schema에서 비 SQLite 내부 객체를 확인했다. table은 reports와 _cf_KV, reports 실제 22컬럼이다. 명시 index는 reports_dedupe(unique dedupe_hash), reports_ip_recent(ip_hash,received_at), reports_pending_public(pending_public,status), reports_spot_key(spot_key), reports_status(status)다. schema SQL에 trigger/FK는 없다. migration 이름의 내부 이력 테이블 및 d1_migrations는 없었다. PK의 SQLite 자동 index는 이 명시 index 수에 포함하지 않았다.

reports status는 NOT NULL/default pending/CHECK 3상태이며 name_public·pending_public은 NOT NULL/default0이다. 기존 schema.sql과 열 물리 순서/DDL 생성 이력이 다르고 운영에는 reports_site_history index가 없다. 이를 core-only 최초 적용 절차에서 별도로 다뤄야 한다. 기존 legacy CREATE/ALTER를 다시 적용하지 않는다.

- 운영 legacy schema fingerprint: `e2dd02bd52185dd86ddd48844b574db98fae40497a97994f6d602854b7f71ddd`.
- registry: 190개, revision `4a7aba945b6fbf245cbaca980bc073324584e8bd2c49c15483a449aed436550d`.
- 기대 canonical schema hash: `76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0` (아직 운영에 없음).

| 운영 Worker | 활성 version (100%) |
|---|---|
| birdmap-reports | `57849940-c4b6-494f-88e9-27ec2e327cd9` |
| birdmap-reports-admin | `1eebcf4e-e7e0-4b94-bdf2-65c44962c21a` |

시작/종료 deployments·bindings·subdomain 설정 동일. 두 REPORTS_DB는 production UUID `b48201cc-0abd-4a64-bb61-9dd2a7813d21`, gate/peer 새 설정은 아직 없다. workers.dev와 previews_enabled가 모두 true다. 해당 Worker custom domain 결과는 0개다. 모든 zone route·과거 version caller까지 조사 완료라는 뜻은 아니다. observability 설정은 null이며 외부 관측 시스템 존재 여부는 별도 확인이 필요하다. subscriptions GET은 403이어서 계정 plan·최대 Time Travel 기간은 확정하지 못했다.

두 baseline의 12개 SELECT 결과 묶음(24개 정상 조회)에 대해 D1 반환 meta.rows_written=0, changed_db=false를 확인했다. 처음 columns SELECT의 예약어 notnull 인용 오류로 읽기 400이 있었고 고친 뒤 다시 조회했다. 이 실패와 앞선 SELECT도 mutation을 포함하지 않았다. **전체 production 행을 snapshot해 byte 단위 동일성을 확인한 것은 아니다.** 증거 범위는 선택한 집계·스키마·배포/설정과 수행한 명령의 write0이다.

## 4. Phase 2C gate 수정 재확인 및 이전 시험

기존 patch의 실제 control.js/purge.js를 확인했다. v3는 자신의 peerRelease도 응답하며 peer binding/gate token/expected peer release가 없으면 준비 완료가 되지 않는다. write와 purge에서 상대 `peer.peerRelease === own.release`를 검증한다. 새 writer의 fail-closed를 보장하는 수정이며 구 production NORMAL writer를 외부에서 닫아주는 기능은 아니다.

Phase 2C 기록의 원격 95개 PASS(스키마1+initial5+Access6+backfill7+core28+rollout14+purge13+Turnstile3+cutover14+recovery4)를 읽어 확인했다. local32, legacy106(105 assertions+helper file), Phase2A17, protocol5, gate13 PASS 기록도 보존했다. 이번 Phase 2D에서 이 전부를 재실행했다고 주장하지 않는다. 변경 없는 앱·날씨·조석 전체 테스트를 이유 없이 반복하지 않았다. Phase2B의 기존 조석 최고값882cm 대850cm 가정 실패는 사용자가 허용한 기존 예외로 그대로다.

Phase2C 마지막 cutover rehearsal은 이미 설치된 staging에서 migration/seed no-op이 포함됐으며 생산 최초 설치의 증거가 아니다. 최초 빈 staging 설치·합성 backfill 성공과도 구분한다. 이번 runbook은 0000 존재 확인→0001 최초 적용→schema/FK→seed 최초→backfill 최초 순서를 명시한다.

## 5. 이번 동적 N 로컬 검증

새 ignored runner에서 기존 helper와 backfill-lib를 그대로 사용했다. 각 cohort는 독립 ephemeral Miniflare D1이며 production·staging D1에 쓰지 않았다. Node24.18.0, 설치된 Miniflare5.20260921.0-alpha/Wrangler4.137.0 사용. 원본 Phase2A runner/evidence를 덮어쓰지 않았다.

| N | site 값 존재 K | SQL prepares | 원자 write batch | 결과 |
|---:|---:|---:|---:|---|
| 22 | 11 | 201 | 67 | PASS |
| 24 | 12 | 218 | 73 | PASS |
| 37 | 19 | 329 | 112 | PASS |

시작12:15:47.086Z, 종료12:18:23.357Z. 세 cohort 모두 기존22필드 불변, raw/checklist/sighting N, NULL/0/1 및 여러 종+공유값 보존, legacy unknown count 보존, FK0, 기존 review/audit 허위 생성0을 확인했다. 같은 manifest 재실행 추가0+전체digest 동일. source/manifest 변경·변조·한 sighting이 빠진 부분 상태는 거절하고 자동 복구하지 않았다. 부분 상태 생성은 로컬 합성 DB에서만 했다.

계측식은 pre N+K+6, batch3N+1, post4N+7, 합계8N+K+14 SQL이다. binding 실행 호출 수는 batch를 1로 세면5N+K+14다. 이것을 Cloudflare query quota와 무조건 같은 단위로 취급하지 않는다. N23/K18 예시는 SQL216/binding147이며 실제 원격 executor 호출 경계·plan·시간 예산은 아직 미확정이다.

## 6. 실제 브라우저 Turnstile — 미실행과 정확한 이유

실계정 widget 목록 GET200과 로그인된 Dashboard를 확인했다. 처음에는 production 도메인용 widget 1개만 있었다. Production secret을 조회/사용하지 않았다. 허용된 staging 시험을 위해 독립 widget `birdmap-phase2d-staging-browser`를 생성했다. host는 localhost와 staging public host만 허용했다. key 값은 ignored 로컬 파일에만 저장했다.

staging public에 이 widget secret을 잠시 적용하고 같은 기존 소스의 staging 두 Worker를 dual 모드로 준비했다. 실제 schemaReady·peer 대칭을 확인하고 localhost 시험 페이지를 열었다. 아직 CAPTCHA 실행 전이었고 token은 발급/소비되지 않았다.

**브라우저 도구의 “CAPTCHA 완료 시 실행 시점 별도 확인” 규칙 때문에 확인을 요청했으나, 정리 시점까지 답변을 받지 못해 실행하지 않았다.** 네 항목(정상, 재사용, concurrent submit, 실패 직후 commit 재조회)을 실제 토큰 PASS로 표시하지 않는다. 인증 실패나 widget 생성 불가가 이유는 아니다. 도구 규칙에 따른 승인 대기였으며 미검증 상태를 유지한다.

준비 과정 첫 secret put은 마지막 version이 활성 배포가 아니라는 Wrangler 보호 조건으로 실패했다. staging에 동일 소스 maintenance 버전을 먼저 배포한 뒤 secret 설정과 dual 준비가 성공했다. Production에는 실행하지 않았다. 이후 시험을 수행하지 않고 기존 공식 시험용 secret과 두 staging maintenance를 복구했다.

최종 staging 검증 2026-09-26T12:36:30.526Z:

| Worker | 최종 version | 모드·HTTP |
|---|---|---|
| birdmap-reports-staging-public | `f47c285a-5bd9-4d42-8ea2-92c3046d343e` | READ_ONLY_MAINTENANCE, GET200, POST503, Retry-After60 |
| birdmap-reports-staging-admin | `91719d81-e187-4863-981a-e91739c14c12` | READ_ONLY_MAINTENANCE, Access GET200, 인증 mutation503, Retry-After60 |

실제 staging D1은 sites190/taxa0/reports33/raw33/checklists33/sightings34/reviews15/audit13/backfill1/assertions0, FK0. 준비 전후 application 전체 digest·schema digest·ledger digest가 동일했다. Phase2D staging D1 write0. 명시적 staging deploy5회와 성공 secret 설정2회(복귀 포함), 격리 widget 생성1회가 있었고 **production deploy/secret 변경은0**이다. 이전 Phase2C 파일/이력은 보존했고 새 staging version만 추가됐다. widget은 후속 시험용으로 남아 있으나 현재 Worker는 기존 시험 secret을 사용한다. 로컬 시험 서버·탭은 종료했다.

### Phase 2E 이전 실제 토큰 수동 검증 절차

1. staging binding UUID와 양쪽 maintenance를 확인한다. 독립 staging widget만 사용한다. token·secret은 보고서/CLI 로그/스크린샷에 출력하지 않는다.
2. 승인된 staging 설정으로 dual을 준비하고 실제 peer/schema readiness를 확인한다. 기존 Phase2D preparation script와 secret 파일은 .local에 있으며 production 명령으로 바꾸지 않는다.
3. 운영자가 CAPTCHA를 직접 완료하거나 실행 시점에 진행을 승인한다. 첫 실제 token으로 신규 합성 request_id 제출201, 네 테이블 각1 증가를 확인한다.
4. **새 request_id와 다른 dedupe payload**에 같은 token을 재사용하여 CAPTCHA_FAILED/403·DB 변경0을 확인한다. 같은 request_id replay201은 CAPTCHA 이전 replay일 수 있어 재사용 차단 증거가 아니다.
5. 새 token을 발급해 같은 request_id·payload 두 요청을 동시에 보낸다. 한 번만 commit, 실패 응답의 뒤따른 retry는 저장 결과 replay·추가0을 확인한다.
6. CAPTCHA 실패 직후 commit 재조회 분기는 별도의 안전한 staging 계측이 필요하다. 민감 원문 없이 요청 상관 ID·첫 replay miss·실제 Siteverify 실패·catch 이후 replay hit·201·commit1을 연결한다. 201/201 응답만으로 그 분기 실행을 증명하지 않는다. 현재 준비 페이지는 이 분기 계측이 없으므로 추가 필요하다.
7. 테스트 후 staging secret/maintenance를 복귀시키고 전체 counts·FK·assertions·의도한 합성 증가량을 검증한다. 어떤 실패도 production 변경으로 해결하지 않는다.

실제 Turnstile token은 단일 사용이며 제한된 유효시간을 가지므로 오래 저장해 재사용 시험을 대신하지 않는다. [공식 Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## 7. 교차 검토로 보완한 실행 조건

- 운영 migration 목록은 SELECT로 읽는다. Wrangler migrations list의 ledger CREATE 가능성을 코드에서 확인했다.
- Time Travel restore `--json`은 실행 확인을 생략한다. human runbook 변경 명령에서 제외했다.
- seed timestamp/plan을 고정하고 shadow 실행 완료 증거를 요구한다.
- v3 새 writer와 독립적으로 구 writer를 freeze해야 한다.
- 실제 UI flag는 OFF이며 capabilities 자동 연동은 없다. UI 전환·기존 탭 영향은 별도 승인/검증한다.
- 신규 pending_public 기본값0/1은 미결 운영자 결정으로 남긴다.
- core 이전 bookmark의 reports-only 상태는 현재 purge 함수로 처리할 수 없다. 독립 ledger·조회 격리·별도 검증된 legacy 제거 경로가 필요하다.
- 이미 다운로드된 사본까지 회수했다고 주장하지 않는다. 통제 가능한 응답·캐시·관리 사본 검증 범위를 명시한다.

## 8. 생성·수정 파일과 최종 무변경 범위

이번 Phase에서 공유 가능한 생성 파일은 다음 7개뿐이다.

```text
docs/long-term-db-phase2d/.gitignore
docs/long-term-db-phase2d/README.md
docs/long-term-db-phase2d/production-cutover-runbook.md
docs/long-term-db-phase2d/go-no-go-checklist.md
docs/long-term-db-phase2d/recovery-runbook.md
docs/long-term-db-phase2d/execution-evidence.md
docs/long-term-db-phase2d/CHECKPOINT.md
```

`.local/`에는 start/end 집계·Git/Worker 증거, hash manifest, 동적N 시험 코드/결과, staging widget 비밀 파일, 격리 시험 서버/제어 코드, Wrangler 비공개 로그가 있다. .gitignore로 제외했고 secret scan 대상 공유 문서에 값을 복사하지 않았다. 이 디렉터리는 비밀정보가 있으므로 원본 전체를 첨부/공유하지 않는다. Phase2B 검토용 patch와 untracked 목록은 당시 snapshot으로 보존하고 이번 작업으로 갱신하지 않았다.

| 작업 | 이번 Phase 실행 |
|---|---:|
| Production D1 write / migration | 0 / 0 |
| Production Worker deploy / freeze | 0 / 0 |
| Production Access / route / secret / binding 변경 | 모두0 |
| Production export / restore / Time Travel restore | 모두0 |
| 기존 앱·schema·날씨·조석 파일 변경 | 0 |
| Git commit / push | 0 / 0 |
| Phase 2E 시작 | 아니오 |

최종 증거는 실행 명령·D1 meta·시작/종료 설정 비교·545개 파일 hash에 근거한다. 타 주체의 모든 가능한 변경까지 전역 감사를 완료했다는 뜻은 아니다. 운영 전환의 필수 미해결 조건을 [체크리스트](go-no-go-checklist.md)에 남겼으며 Phase 2E를 자동 실행하지 않는다.

문서 최종 검사(12:42:18Z): 필수 문서6개, 상대 링크7개, 코드블록 짝, 알려진 인증값 미포함 검사 PASS. 공유 대상 신규 파일7개와 .local 제외를 Git으로 확인했다. 기존545개 hash를 다시 확인했고 `git diff --check`도 통과했다. 비공개 `document-validation.json`에는 검사 상태와 파일명만 기록한다.
