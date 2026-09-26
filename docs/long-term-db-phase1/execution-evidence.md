# Phase 1 v1.1 — 실행 증거와 무변경 확인

이 문서는 설계 단계의 실제 수행 범위와 확인 결과다. SQL 초안의 실행 성공이나 migration 완료 보고서가 아니다.

## 1. 작업물 복구

처음 이어받은 파일은 operations-and-policy.md와 verification-plan.md였다. SQL은 메모리 초안에서 draft 경로로 저장했다. 마지막 인증 갱신 후 재개에서는 이미 저장된 설계 문서 4개와 SQL 7개, 총 11개 파일을 다시 확인하고 보존했다. 이후 checksum 목록과 이 증거 문서를 보완했다. 기존 작업물 삭제·reset·checkout/restore·clean은 하지 않았다.

로컬 HEAD는 시작/각 재개/종료 모두 `d39bf4bf2d7e147b246f867f56567f814eddd4b9`이며 main 브랜치다. 시작과 종료의 추적 파일 내용 해시는 동일하다.

| 검증 | 시작 | 종료 |
|---|---|---|
| 추적 파일 수 | 462 | 462 |
| 내용 SHA-256 | `b5478e4ccadd7062d6d7a5341bbf2ac8706826528a80c514705ac0cdec692ac0` | `b5478e4ccadd7062d6d7a5341bbf2ac8706826528a80c514705ac0cdec692ac0` |
| 추적 파일 diff | 없음 | 없음 |
| status | 첫 작업은 clean; 재개 시 기존 미추적 docs 초안 | `?? docs/` |
| commit/push | 이번 작업 실행 없음 | 실행 없음 |

해시는 git ls-files의 순서대로 각 경로 문자열과 해당 파일 바이트를 SHA-256에 누적한 값이다. Git HEAD만 비교한 결과가 아니다. 새 설계 파일은 미추적 상태로 남기며 index에 추가하지 않았다.

## 2. 운영 읽기 확인

인증 만료로 앞선 직접 조회 시도는 HTTP 401이었고 성공한 데이터 조회로 계산하지 않았다. 사용자가 갱신한 로그인 자격을 정상 Wrangler whoami 절차로 재사용하면서 만료된 access token을 갱신했다. 이후 운영에는 아래 SELECT 및 배포 목록 GET만 사용했다.

- `SELECT status,COUNT(*) AS n FROM reports GROUP BY status ORDER BY status`
- `SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name`
- 공개/관리자 Worker의 deployments GET

이 두 SELECT를 시작과 종료에 각각 조회했다. 반환된 sqlite_schema는 메모리에서 SHA-256으로 비교했고 DB 행의 실제 좌표·이름·IP hash를 출력하거나 파일로 export하지 않았다.

| 측정 | 시작 | 종료 | 결과 |
|---|---|---|---|
| UTC | 2026-09-24T20:19:34.882Z | 2026-09-24T20:23:30.409Z | 인증 정상 |
| KST | 2026-09-25 05:19:34.882 KST | 2026-09-25 05:23:30.409 KST | 같은 검증 구간 |
| reports 전체 | 21 | 21 | 동일 |
| approved | 17 | 17 | 동일 |
| rejected | 4 | 4 | 동일 |
| pending | 0 | 0 | 동일; GROUP BY 결과에 없는 상태는 0 |
| sqlite_schema SHA-256 | `df97b764fe0784164450d7828b6b664fa65cc324585ff7578d85149e7e57c24f` | `df97b764fe0784164450d7828b6b664fa65cc324585ff7578d85149e7e57c24f` | 동일 |
| D1 SELECT rows_written | 각 0 | 각 0 | 성공한 총 4개 조회 모두 0 |
| D1 changed_db | 각 false | 각 false | 성공한 총 4개 조회 모두 false |

| Worker | 시작 활성 version | 종료 활성 version | 비교 |
|---|---|---|---|
| birdmap-reports | `57849940-c4b6-494f-88e9-27ec2e327cd9` / 100% | `57849940-c4b6-494f-88e9-27ec2e327cd9` / 100% | 동일 |
| birdmap-reports-admin | `1eebcf4e-e7e0-4b94-bdf2-65c44962c21a` / 100% | `1eebcf4e-e7e0-4b94-bdf2-65c44962c21a` / 100% | 동일 |

최신 deployment ID도 공개 `cb766030-7b4b-4365-8681-5356870ee641`, 관리자 `a15e233d-d1f4-4ed9-b311-ffacf2e917c4`로 전후 동일했다. 반환된 전체 배포 목록도 메모리 비교에서 동일했다.

확인 결론: **이 작업이 보낸 운영 SQL은 SELECT뿐이며, D1이 반환한 rows_written은 모두 0이다. 운영 스키마·기본/상태별 건수·Worker 배포가 관측 구간에서 동일했다.** DB DDL/DML, migration, export/restore, Worker 배포 요청은 보내지 않았다.

확인 한계: 건수와 스키마 비교는 모든 행 값의 전후 동일성을 증명하는 full-data hash가 아니다. 다른 운영자의 모든 활동이 없었다고 단정하지 않는다. 상세 21건의 site/spot/종/수량/좌표/동의 이상치 수치는 사용자 제공 Phase 0 기준선이며 이번 제한된 재확인에서 전 항목을 다시 계산한 수치가 아니다. Time Travel 복원 시험은 하지 않았다.

## 3. 원격 main의 외부 변경

첫 확인 때 origin/main은 로컬과 같은 d39bf4b였다. 종료 시 원격 main은 `6bf58a583391b174ccd15117ddeaef233010e1ee`였다. GitHub compare GET으로 확인한 차이는 자동 기상·조석 갱신 5개 커밋, 아래 4개 JSON뿐이다.

- tide_health.json
- tide_today.json
- weather_today.json
- weather_week.json

index.html, reports-api 소스·schema·migration, 기상/조석 처리 코드는 변경 목록에 없었다. 이 외부 갱신을 이번 작업의 commit/push로 보고하지 않는다. 로컬에는 fetch/pull/reset을 수행하지 않았으며 기존 작업 트리와 HEAD를 보존했다.

## 4. 정적 검증 결과

SQL 텍스트만 읽는 JavaScript 검사와 독립적인 코드 검토를 수행했다. SQLite 엔진·D1에 초안 DDL/백필 SQL을 실행하지 않았다.

| 확인 | 결과 |
|---|---|
| 최종 보고서 A~AG | 33개 절 존재 |
| 신규 테이블 | 13개(필수 10 + 운영 제어 3) |
| 전체 컬럼 | 171개, 컬럼 사전과 이름 대응 |
| reports 대응 | 기존 22개 컬럼 모두 포함 |
| raw INSERT / SELECT 개수 | 12 / 12 |
| checklist INSERT / SELECT 개수 | 37 / 37; 불확실성은 NULL 기본 |
| sighting INSERT / SELECT 개수 | 12 / 12; species_identified는 NULL 기본 |
| FK 참조 table/column | 정적 참조 누락 없음 |
| index 구성 열 | 존재하지 않는 열 참조 없음 |
| 괄호·문자열 delimiter / draft 표식 | 검사에서 불일치 없음 |
| Git 추적 diff / diff --check | 변경·오류 없음; 미추적 초안 전체 검증을 뜻하지 않음 |

검토 중 발견해 수정한 사항:

- JSON 텍스트 비교를 22키 존재/개수 및 필드별 NULL-safe 비교로 변경하여 키 순서·1/1.0 표기 오탐 제거.
- review가 다른 checklist의 sighting을 가리키지 않도록 복합 FK와 검증 SQL 추가.
- site/checklist/sighting의 영구 식별·출처·종명 원문 UPDATE 보호.
- numeric 타입 CHECK, site seed 명칭 대조, legacy uncertainty/제출 시각 NULL 검증.
- purge 감사의 before/after 모두 NULL 강제.
- 구형 본문·혼합 Worker·epoch·오류 계약과 AI/규칙 추정 차단 금지 명시.
- 다종 원문 자동 분할로 오해할 수 있는 이전 문구 정정.

정적 검사 자체가 SQL parser/실행기와 동일하지 않다. D1 문법 지원, 실제 FK/trigger 동작, batch rollback, 레이스/재개, 비운영 복원, 성능은 Phase 2에서 시험해야 한다. 기존 test/helpers는 schema SQL을 실행하므로 현재 테스트 suite도 이번에는 실행하지 않았다.

## 5. 생성·수정한 저장소 내 파일 전체 목록

- [README.md](README.md)
- [data-dictionary.md](data-dictionary.md)
- [operations-and-policy.md](operations-and-policy.md)
- [verification-plan.md](verification-plan.md)
- [execution-evidence.md](execution-evidence.md)
- [sql/1000_preflight.readonly.sql](sql/1000_preflight.readonly.sql)
- [sql/1001_core_schema.draft.sql](sql/1001_core_schema.draft.sql)
- [sql/1002_legacy_history_index.draft.sql](sql/1002_legacy_history_index.draft.sql)
- [sql/1003_writer_controls.draft.sql](sql/1003_writer_controls.draft.sql)
- [sql/1004_sites_seed.draft.sql](sql/1004_sites_seed.draft.sql)
- [sql/1005_legacy_backfill.draft.sql](sql/1005_legacy_backfill.draft.sql)
- [sql/1090_verify.readonly.sql](sql/1090_verify.readonly.sql)
- [sql/SHA256SUMS.txt](sql/SHA256SUMS.txt)

SQL 7개 파일의 실제 바이트 SHA-256은 [SHA256SUMS.txt](sql/SHA256SUMS.txt)에 기록했다. 이 값은 초안 식별이며 schema_migrations 적용 이력이 아니다. 실제 자동 migration 디렉터리와 Worker 설정은 변경하지 않았다.

## 6. 저장소 밖 인증 도구의 부수 파일

정상 인증 세션 갱신 과정에서 다음 파일 변경을 확인했다. 이는 코드·DB·Worker 변경이 아니며 인증 내용은 보고서에 출력하지 않는다.

- `C:/Users/김진호/AppData/Roaming/xdg.config/.wrangler/config/default.toml`: 만료 access token/세션 캐시 갱신, 2026-09-24 20:19:28 UTC.
- `C:/Users/김진호/AppData/Roaming/xdg.config/.wrangler/logs/wrangler-2026-09-24_20-19-27_575.log`: whoami 실행 로그 생성.

해당 시각 이후 reports-api/.wrangler 아래에 이번 인증 절차가 갱신한 파일은 확인되지 않았다. npm 설치나 새 프로젝트 의존성 추가는 하지 않았다.

## 7. 종료 상태

운영 DB write 0, migration/배포/export/restore 0, Git commit/push 0이다. 저장소 추적 파일과 기존 지도·제보 API·날씨·조석 코드는 바뀌지 않았다. 변경물은 승인된 미추적 설계 산출물이며 원자료 좌표·이름·IP hash를 포함하지 않는다. 정책·실행기·비운영 검증 등 Phase 2 할 일을 문서화했으며 Phase 2를 시작하지 않는다.
