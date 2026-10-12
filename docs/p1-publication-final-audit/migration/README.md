# 운영 공개권한 migration — 독립 로컬 원자성 리허설

검증일: 2026-10-12 KST. 운영 API·D1 호출, Worker/Pages 업로드·배포, 제품 코드 수정은 하지 않았다.

## 결론

실제 Wrangler 4.149.0 `d1 migrations apply --local`에서 **30 통과 / 0 실패 / 0 건너뜀**을 확인했다. 추가 읽기 전용 검증은 **3 통과 / 0 실패 / 0 건너뜀**이다. 운영 적용 결과를 뜻하지 않으며, 이 문서는 운영 배포 사전 조건 중 로컬 원자 migration 관문의 증거다.

- 검증 소스: `d39f1bd16baaea08f1241a3fb528a1953a343692`의 별도 `git archive`.
- migration 원본 SHA-256: `7095e20d185a3ed67fc6a848102997917e2c89bc1f17f2a7612f878424f74632`.
- 최신 소스: `cf5767b090275221a516e16112d0e569eedb86e7`.
- migration, schema, 서버 `src/`, 공개·관리 Wrangler 설정 **24개 Git blob 전부 동일**: `SOURCE_BLOB_COMPARISON.json`. 제품 변경 없이 최신 소스에 이 검증 결과를 적용할 수 있다.
- 도구: Node `v24.18.0`, 실제 cached Wrangler `4.149.0` 및 그 Miniflare/workerd D1.
- 운영 조회 자료: root의 `operations/preflight-readonly.json`에 저장된 SQL 정의와 집계만 사용했다. 실제 제보·관찰자·정확 좌표는 가져오지 않았다.

## 입력과 격리

운영 schema 51개 중 Cloudflare 내부 `_cf_KV`, 자동 `sqlite_sequence`, 기존 migration ledger를 사용자 DDL에서 제외한 **48개 table/index/trigger SQL 정의를 그대로** 로컬에 재현했다. ledger는 운영 내용을 조회·복제하지 않고 합성 과거 적용 1건을 별도로 만들었다.

개인자료 대신 다음 합성 자료를 넣었다.

- reports 68건: approved 55, rejected 13.
- raw_submissions/checklists/sightings 각각 68건. 실제 제품의 `checklistFromReport`와 `initialSighting`을 사용했다.
- field_updates 3건: not_visible 2, visible 1; events와 confirmations 각각 3건.
- 모두 명시적 synthetic ID·닉네임·IP hash·좌표·메모다. 실제 68건을 복제한 것이 아니며, 기존 운영 데이터의 개별 내용을 확인했다고 주장하지 않는다.

모든 D1 CLI 명령에 `--local`을 명시했고 가짜 UUID `11111111-1111-4111-8111-111111111111`만 사용했다. subprocess의 Cloudflare 인증 환경변수를 제거했으며 telemetry를 껐다. 실제 운영 binding/UUID를 시험 config에 넣지 않았다. 임시 소스·로컬 SQLite는 검증 후 지웠고 명령·종료 코드·stdout/stderr·합성 스냅샷 hash를 보존했다.

## 핵심 결과

| 범위 | 실제 검증 |
|---|---|
| 실패 원자성 | state table 생성·state insert·field row_revision ALTER 뒤 `transaction_assertions.ok=0` 실행 오류를 주입했다. 문법 오류가 아닌 실행 중 CHECK 오류이며 CLI exit 1이다. 실패 후 사용자 catalog·모든 data·ledger hash가 이전 상태와 정확히 같다. |
| 실패 전/후 전체 hash | 둘 다 `897015ebb6cfbc556fe62099613cbcc4d06171c0ba4b7a938ab54b6adac515b7`. state table과 row_revision이 남지 않고 이전 ledger 1건만 유지된다. |
| 정상 설치 | 전용 migrations_dir의 정확한 `0005_publication_security.sql` **한 파일**만 실제 CLI로 설치, exit 0. 이전 ledger 유지 + 새 적용 기록 1건. |
| 초기 동결 | 정상 epoch 32hex, revision `"0"`, write_frozen=1. field row_revision은 모두 1이며 그 외 원본 필드값은 변하지 않는다. |
| 보고 유지 | 68 reports 및 68 raw/checklist/sighting 원값이 설치 후와 모든 후속 합성 보안 시험 종료 후 동일하다. |
| 기존 report 쓰기 동결 | system_state를 합성 READ_ONLY_MAINTENANCE로 단조 generation 변경 후 기존 INSERT/UPDATE가 `reports_write_frozen`으로 차단된다. |
| 9 field 쓰기 동결 | field_updates/events/confirmations × INSERT/UPDATE/DELETE를 모두 실제 SQL로 실행했다. 모두 exit1 + `reports_write_frozen`, 모든 원값과 권한 counter 불변. 최종 강화 실행은 새 public_publication_state 행도 매 snapshot과 content hash에 포함한다. |
| 명시적 활성화 | write_frozen=0, revision=revision+1 한 SQL로 해제, epoch 유지. 별도 system_state generation 단조 증가로 NORMAL 복귀. |
| CAS 경합 | 잘못된 row_revision의 부모 UPDATE가 changes=0 → 바로 다음 assertion CHECK 실패. whole batch rollback으로 event, permission revision, assertion, 원본 행이 전혀 남거나 바뀌지 않는다. |
| 정상 삭제 | 올바른 CAS + changes assertion + deleted event 한 실제 CLI batch 성공. |
| terminal | 삭제 후 무조건 reappeared UPDATE·늦은 reappeared event·늦은 confirmation이 각각 `field_deleted_terminal`로 차단되고 모든 data hash 불변. |
| 정상 재출현 | 삭제되지 않은 not_visible 부모에 정상 CAS + reappeared event 성공. 삭제를 정상 재출현으로 오인하지 않는다. |
| 재실행 | ledger가 있는 상태에서 migrations apply 재실행은 `No migrations to apply`와 exit0. |
| core 호환 | 실제 `schemaReady`가 CLI로 조회한 설치 후 운영 DDL을 검사해 true. 정본 core fingerprint `76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0` 유지. |
| 권한 SQL | 실제 `publicationStateStatement` SQL로 epoch/revision_type=integer/revision 문자열 및 설치된 guard 22개 확인. 활성 상태 write_frozen=0은 별도 실제 SELECT로 확인. |
| 자료 정합성 | D1 workerd authorizer가 integrity_check PRAGMA를 허용하지 않아 최초 추가 시험의 오류를 보존했다. 설치된 동일 합성 로컬 SQLite를 Node DatabaseSync readOnly로 열어 integrity_check=`ok`, foreign_key_check=빈 배열을 확인했다. 운영 D1 PRAGMA가 통과했다고 보고하지 않는다. |

`d39f1bd-complete-authority/MANIFEST.json`에는 실제 CLI **35개 명령**, 시작·종료 시각, argv, 종료 코드, 기대 종료 코드, stdout/stderr hash가 있다. 의도적 차단 **16개 명령의 exit1**은 각 원자성·불변 조건 검증의 기대 결과이며 제품 실패를 감춘 것이 아니다. `d39f1bd-complete-authority/EXTRA_INTEGRITY_MANIFEST.json`에 추가 3건의 실제 명령과 결과가 있다.

## 실패 증거 보존

성공 실행 전 오류를 삭제하거나 성공으로 재표시하지 않았다.

1. `SETUP_FAILURE.txt`: Windows PowerShell 5.1 archive 모듈 자동 로드 실패. D1 실행 전 실패로 tar.exe 추출로 도구만 바꿨다.
2. `d39f1bd/`: 너무 긴 Windows local D1 persist 경로에서 SELECT1과 seed가 internal error로 실패했다. 이 manifest의 summary0은 **시험 0건**이며 PASS가 아니다. `failure`와 exit1이 남아 있다. 짧은 독립 workspace `.tmp` 경로에서 정상 실행했다.
3. `d39f1bd-shortpersist/`: migration 핵심 9건 통과 뒤, 합성 INSERT 생성기의 문자열 오류와 Wrangler `--json` 오류가 stdout으로 출력된다는 harness 처리 오류로 1건 실패했다. 원본 로그·기대값을 보존했다. 제품 변경 없이 합성 ID quoting과 오류 채널 판정만 고쳤다.
4. `d39f1bd-complete/EXTRA_INTEGRITY_FIRST.json`, `extra-*.first`: D1에서 금지된 PRAGMA와 publication-state SELECT에 없는 write_frozen 필드를 가정한 보조 시험의 1통과/2실패. 해당 출처 계약을 읽고 실제 별도 SELECT로 상태를 확인했으며 무결성은 동일 로컬 DB 파일을 읽기 전용으로 검사했다.

## 재현 명령

두 입력 output/persist 경로는 **존재하지 않는 새로운 독립 경로**를 써야 한다. 이미 생성한 DB에 seed를 덮어쓰지 않는다. 아래는 동일 SHA를 새 replay-1 경로에서 실행하는 정확한 명령이다.

```powershell
& 'C:/Program Files/nodejs/node.exe' `
  'C:/Users/김진호/.codex/worktrees/p1-publication-final-audit/birdmap/docs/p1-publication-final-audit/migration/wrangler_migration_rehearsal.mjs' `
  'C:/Users/김진호/.codex/worktrees/p1-publication-security-guards/birdmap' `
  'C:/Users/김진호/.codex/worktrees/p1-publication-final-audit/birdmap/docs/p1-publication-final-audit/migration/d39f1bd-replay-1' `
  'C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules' `
  d39f1bd16baaea08f1241a3fb528a1953a343692 `
  'C:/Users/김진호/Documents/GitHub/birdmap/.tmp/p1mig-d39-replay-1'

& 'C:/Program Files/nodejs/node.exe' `
  'C:/Users/김진호/.codex/worktrees/p1-publication-final-audit/birdmap/docs/p1-publication-final-audit/migration/wrangler_integrity_recheck.mjs' `
  'C:/Users/김진호/.codex/worktrees/p1-publication-final-audit/birdmap/docs/p1-publication-final-audit/migration/d39f1bd-replay-1' `
  'C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules' `
  'C:/Users/김진호/Documents/GitHub/birdmap/.tmp/p1mig-d39-replay-1/success'
```

## 운영 적용 전 구분 및 중단 조건

[Cloudflare Wrangler 공식 문서](https://developers.cloudflare.com/workers/wrangler/commands/d1/)는 실패한 migration 파일을 rollback하고 그 이전 성공 migration은 유지한다고 명시한다. 로컬에서는 위 동작을 실제 CLI로 확인했다. Wrangler4.149 코드의 `buildMigrationQuery`는 파일 전체와 ledger INSERT를 한 query로 구성한다. local은 실제 D1 batch, remote는 전체 SQL의 query endpoint 호출이다. **REST 배열 batch 원자성을 가정하지 않았다.** 이 subtask에서는 remote를 실행하지 않았다.

운영에서는 root가 별도 안전 조건을 모두 만족한 뒤 다음을 지켜야 한다.

- 실제 database 이름·UUID·binding 및 writer 통제 상태를 다시 확인한다.
- 전용 migrations_dir에는 검증된 SHA의 0005 한 파일만 넣어, 이미 적용된 다른 스키마 migration을 재실행하지 않는다.
- 원자 적용 실패하면 다음 Worker/Pages 단계로 가지 않는다. 초기 write_frozen=1을 확인한 뒤 호환 Worker, cache 전환, 권한 검증이 끝날 때까지 동결을 유지한다.
- 활성화는 epoch/기존 권한 상태를 초기화하지 않고 `write_frozen=0, revision=revision+1`로 수행한다. field row_revision과 삭제 상태를 이전 값으로 복원하지 않는다.
- 실패한 migration 파일 자체의 원자 rollback과 과거 D1 백업 전체 복원은 다르다. 삭제·철회 후의 권한 상태를 잃는 과거 전체 복원은 안전 rollback으로 승인하지 않는다.
- 이 33건은 실제 이용자 concurrency·배포된 Worker/Pages·CDN 차단·rollback artifact 확보를 대신하지 않는다. root의 다른 관문 및 운영 후 검증이 필요하다.

