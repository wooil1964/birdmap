# Phase 2A 실행·보존 증거

최종 상태: **17/17 PASS, 기존 suite 106/106 PASS**. [원시 집계 JSON](evidence/local-results.json)에는 날짜·도구 버전·각 시험 결과·공식 migration ledger·실행 소스 SHA-256을 기록했다. 실제 운영 행/좌표/이름/토큰은 수집하거나 여기에 넣지 않았다.

## 실행 환경과 격리

- Node v24.18.0, Wrangler 4.137.0, Miniflare 5.20260921.0-alpha.
- 로컬에 이미 있던 Wrangler/Miniflare 패키지를 사용했다. 새 패키지 설치·생성 원격 D1·Worker 배포는 없었다.
- CLI target은 birdmap-phase2a-local, database_id는 합성 UUID, config는 wrangler.local.toml이다. runner는 config/DB/remote를 인자로 받지 않으며 모든 CLI 명령에 --local을 명시한다.
- CLI 자식 환경에서 CLOUDFLARE_/CF_API_/CF_ACCOUNT 관련 환경변수를 제거하고 telemetry를 끈다. 운영 account/database ID와 Worker main/routes를 이 설정에 넣지 않았다.
- Wrangler state는 회차별 .local/<UTC>/wrangler-state, log와 기존 suite TAP도 .local에 보존한다. 기존 회차를 삭제하지 않았다.
- Miniflare getD1Database(TEST_DB)에는 d1Persist:false를 사용했다. 바인딩은 로컬 workerd 런타임이며 실제 원격 D1은 아니다.
- 공개 siteData는 기존 parser로 읽어 ID 190개/중복 0만 사용했다. 합성 sites의 대표좌표는 NULL이다. 관찰 fixture는 임의 합성값이며 운영 데이터를 export하지 않았다.
- 시험 helper는 docs 하위에만 있고 기존 Worker/지도 어디에서도 import되지 않는다.

## 실제 명령

재실행은 로컬 도구의 node_modules 경로를 명시한다. 재실행 시 새로운 .local 회차가 생기며 evidence/local-results.json은 해당 실행 결과로 갱신된다. SHA256SUMS는 이 전달 시점의 문서/코드/결과물 고정값이다.

```powershell
node docs/long-term-db-phase2a/proof/run.mjs --toolchain 'C:\Users\김진호\AppData\Local\npm-cache\_npx\d77349f55c2be1c0\node_modules'
```

runner 내부의 실제 CLI 작업은 d1 migrations apply --local 2회와 SELECT id,name,applied_at FROM d1_migrations를 수행하는 d1 execute --local 1회다. config와 persist-to를 runner가 고정한다. 운영 명령 예시는 제공하거나 실행하지 않는다.

최종 실행은 2026-09-25T22:09:23.654Z ~ 2026-09-25T22:10:31.080Z UTC였다. 첫 apply 후 0001_core.sql 한 행, 두 번째 apply 후 동일 1행으로 확인했다. Wrangler ledger 시험용 DB와 21건 fixture/batch 시험용 DB는 서로 분리했다. 두 DB 모두 같은 신규 DDL을 사용했다. 기존 reports schema 공존은 바인딩 시험에서 별도로 검증했다.

## 시험이 입증한 범위

1. 수정 DDL은 실제 로컬 D1에서 생성되고 FK 음성 사례도 거부됐다. 마지막 foreign_key_check는 0이다.
2. 21건 frozen synthetic source와 raw/checklists/sightings를 비교해 reports 22필드 및 ID/원문/NULL이 보존됨을 확인했다. 같은 manifest는 추가 0, 다른 manifest와 일부 겹친 run은 실패했다.
3. reviews를 동일 request_id의 event_index 0/1로 기록하고 재시도/다른 요청 내용/순번 충돌/부모 불일치를 시험했다.
4. batch 중간 실패, canonical 생성 뒤 후반 실패, stale CAS에서 reports/raw/checklists/sightings/reviews/audit/backfill/assertion 전체의 정렬된 내용 hash가 실행 전과 같았다. CAS 바로 다음 changes() 검사와 성공 후 assertion 0행을 확인했다.
5. native confirmation·좌표를 저장 전에 검사하는 proof 경로를 시험했다. 실제 UI/HTTP 새 writer 구현은 아니다.
6. current public handler에 reports binding과 canonical DTO adapter를 넣은 13경로의 status/headers/JSON이 같았다. generatedAt만 제외했다.
7. 기존 reports-api test suite를 node --test --test-reporter=tap으로 실행해 tests 106 / pass 106 / fail 0 / skipped 0을 확인했다.

관리자 8개 새 dual-write 구현, 이벤트 전체 이력, 동시 edge 부하, native POST 멱등성, 브라우저 E2E, 실제 drain·복구 리허설까지 통과했다고 해석하면 안 된다. count 검토는 canonical 수량 변경이며 기존 공통 count의 자동 배분/수정이 아니다. 최소 proof와 Phase 2B 실제 코드를 구분한다.

## 검증 중 수정한 사항

- 캐시의 Miniflare v5 alpha는 v4 constructor 모양을 바로 받지 않았다. 패키지 제공 convertV4MiniflareOptions를 사용했다.
- smoke SELECT sqlite_version()은 D1에서 허용하지 않아 실패했다. 서비스 상태나 운영 인증 실패로 해석하지 않았다.
- 첫 SQL splitter가 trigger 내부 세미콜론을 잘못 나눠 로컬 DDL 시험에 실패했다. trigger 전체를 한 statement로 유지하도록 수정한 뒤 재실행했다.
- site-only fixture가 legacy raw/native checklist를 혼합하는 결함을 수정했다. 적격 native raw로 시험하고, 출처 불일치 INSERT가 실패하는 trigger/음성 시험을 추가했다.
- 감사 fingerprint는 일반 요청에 필수, 미래 forbidden_content_purged 메타데이터에는 NULL/0만 허용하도록 정합화했다. 실제 purge는 구현하지 않았다.
- 독립 승인 자료의 별도 공개좌표 쌍과 review event_index 직접 충돌 사례를 추가했다.
- 기존 suite 출력 형식을 TAP로 고정해 통과 건수를 결과 JSON에 남겼다.

위 보완 뒤 최종 17개를 다시 실행했고 전부 통과했다. 실패한 사전 회차를 최종 성공 수치에 섞지 않았다. 최종 코드/DDL checksum은 결과 JSON의 source_sha256과 일치한다.

## 저장소·운영 보존

[보존 집계 JSON](evidence/preservation.json)에 비교 방법과 원격 자동 변경을 기록했다.

- main HEAD: d39bf4bf2d7e147b246f867f56567f814eddd4b9.
- 추적 파일 462개: 시작/종료 hash b5478e4ccadd7062d6d7a5341bbf2ac8706826528a80c514705ac0cdec692ac0.
- Phase 1 파일 14개: 시작/종료 hash 05832a166305ba0e5416160c5fa7f750b83067be08b4162ec4434323da917754. 기존 zip도 포함한다.
- 모든 작성은 새 Phase 2A 디렉터리 안에서 이루어졌다. 기존 미추적 Phase 1 자료를 삭제·덮어쓰지 않았다.
- git status는 ?? docs/이며 추적 파일 diff는 비어 있다.
- 원격 main은 조회 사이 자동 기상/조석 갱신으로 9커밋 차이에서 13커밋 차이가 됐다. 원격 변경 파일은 JSON 5개뿐이었다. fetch/pull/commit/push는 하지 않았다.
- 운영 Cloudflare API/D1 호출·쓰기, 인증 갱신, Worker 배포/설정 변경, 운영 migration/export/restore는 모두 0이다.

따라서 **이 작업이 운영 DB·Worker·Git 원격에 변경을 가하지 않았음**을 실행 경로와 로컬 보존 검증으로 확인한다. 외부 작업자의 운영 변경 유무를 실측한 것은 아니다. 오래된 Phase 0/1 운영 수치를 이번 새 실측값처럼 재사용하지 않는다.

## 재검증이 남는 범위

Wrangler에 포함된 alpha Miniflare는 로컬 가능성 증거다. 운영 도구 버전 고정, 원격 staging에서 실제 batch/경합·인증·지역·복구·쓰기 차단을 검증한 후에만 운영 적용 여부를 판단한다. Time Travel 현재 범위와 bookmark는 이번 Phase 2A에서 재조회하지 않았고 export/restore도 수행하지 않았다. Phase 2B 및 모든 운영 변경은 자동 시작하지 않는다.
