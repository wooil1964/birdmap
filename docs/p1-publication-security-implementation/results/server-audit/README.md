# 독립 서버 계약 검증

실제 제품 함수와 새 SQL migration을 사용한 합성 테스트다. 운영 Worker 요청·D1 접근·사용자 자료 변경·배포는 실행하지 않았다. 구현 중 working tree를 검증했으며 최종 제품 SHA는 root의 제출 원장에 기록한다. 이 폴더의 manifest에는 검증 시 소스 해시를 남긴다.

## 실행 결과

|시험|통과|실패|skip|증거|
|---|---:|---:|---:|---|
|Node SQLite 실제 SQL + D1-shaped atomic batch|40|0|0|sqlite-final.tap|
|Miniflare/workerd의 실제 ephemeral D1|18|0|0|local-d1-publication.json, local-d1-final.log|

Node v24.18.0, Miniflare 5.20261006.1-alpha의 기존 로컬 설치를 사용했다. 패키지 설치와 원격 배포는 하지 않았다. 첫 시험에서 하나의 SQL 조건에 여러 자료형을 확인한 assertion을 별도 시험 수로 부풀리지 않았다.

재현 명령은 저장소 루트에서 실행한다.

```powershell
node --test reports-api/test/publication-security.test.mjs
$env:WRANGLER_SEND_METRICS='false'
node docs/p1-publication-security-implementation/results/server-audit/local-d1-publication.mjs 'C:\Users\김진호\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules'
```

로컬 D1 명령은 메모리 전용 database를 만들고 종료 시 dispose한다. `--remote`, `deploy`, `upload`, 운영 파일을 실행하는 명령은 없다. Node 테스트의 D1 adapter는 실제 SQLite SQL과 BEGIN/COMMIT/ROLLBACK을 실행하지만 workerd D1의 증명으로 대신하지 않았다. 별도의 18건이 workerd D1 API를 사용한다.

## 실제 검증 범위

- publication state와 공개 projection을 같은 실제 batch transaction에서 읽는다. field parent/history/confirmation count와 site history/count가 별도 시점의 state와 혼합되지 않는 API 경로를 검사했다.
- 원본 nonce·contract·epoch·decimal revision의 엄격 parser, raw legacy 요청의 strict rejection, 성공·오류 응답 no-store를 검사했다.
- 적용한 additive migration 전후 canonical `schemaReady`는 모두 true다. 새 schema.sql의 fresh 설치도 state와 row revision을 제공한다.
- state 누락·부분 trigger 설치·잘못된 epoch/counter에서 읽기 또는 쓰기가 닫힌다. 2^53보다 큰 전역 및 row revision은 CAST TEXT로 round-trip한다. SQLite integer 상한 overflow는 원본 mutation 전체를 중지한다.
- reports INSERT/UPDATE/DELETE가 global revision에 반영되고 원 mutation 또는 canonical batch 실패 시 counter도 함께 rollback된다.
- canonical `persistQuick` 성공에서 reports/raw/checklists/sightings/redemption이 같이 기록되고 중간 실패에서 전부 rollback된다. canonical core fingerprint는 유지된다. 새 publication snapshot을 canonical shadow adapter로 읽어 동일 revision의 정상 비교와 권한 변경에 따른 명시적 inconclusive를 확인했다.
- 실제 status handler 사전 읽기 뒤 owner delete를 끼워넣으면 CAS loser가 deleted를 reappeared로 바꾸거나 이벤트를 남기지 못한다. 실제 confirm handler의 같은 경합도 confirmation/activity/counter 변경 없이 실패한다.
- 기존 unconditional writer의 deleted 상태/좌표/activity 변경과 늦은 child event/confirmation이 DB에서 거부된다. 정상 old writer의 상태 변경은 row revision을 증가시키며 ABA 후 stale CAS가 실패한다. recursive SQLite triggers를 켜도 revision 보정은 종료된다.
- 동시 owner delete는 모두 멱등 성공하며 deleted event는 하나다. 동시 confirm은 하나의 CAS winner를 만들고 정상 loser의 새 요청은 성공한다. Turnstile 대기 중 만료된 상태 변경은 거부된다.
- not_visible → reappeared 및 rejected → approved 재승인은 더 최신 공개 snapshot에서 정상 복구한다.

## 발견·수정과 원본 증거

1. `sqlite-initial.tap`: 초기 범위 30/30이었다.
2. `sqlite-expanded-initial.tap`: 확장 35조건에서 33통과/2실패였다. 실제 결함은 길이32 non-hex epoch가 head에서는 unavailable인데 source INSERT는 성공한 것이다. root가 state CHECK와 source mutation trigger의 text/lowerhex/nonnegative 계약을 보완했다. assertion은 삭제하지 않았다.
3. 같은 최초 확장의 다른 실패는 strict POST의 좌표 없는 receipt를 구 `update` shape로 읽은 harness 오류였다. 새 시험은 POST에 원 좌표가 없음을 검사하고, 새 publication snapshot에서 큰 row revision을 확인한다. 이를 제품 결함이 해결된 것으로 세지 않는다.
4. `sqlite-expanded-after-receipt.tap`: receipt harness 보완 뒤 34/35였으며 epoch source-mutation 결함 1건은 계속 실패했다.
5. 최종 40조건은 위 원본 실패 assertion을 유지하고 추가 CAS·canonical 시험을 포함하여 40/40이다.
6. `local-d1-initial.log`, `local-d1-harness-initial.json`: 첫 DDL splitter가 CASE의 END를 CREATE TRIGGER의 END로 오인하여 incomplete SQL로 설치가 중단됐다. 원본 JSON의 1pass/0fail은 완료 결과가 아니며 설치 중단 로그와 같이 읽어야 한다. splitter를 BEGIN/CASE nesting을 인식하도록 고쳤고 외부 setup 예외도 fail로 기록하게 했다. 제품 SQL을 변경하거나 assertion을 삭제하지 않았다.
7. `local-d1-second.log`, `local-d1-12check-before-expansion.json`: 정상 12조건 완료 결과를 보존했다. 최종 같은 workerd 시험에 partial guard·큰 revision·overflow·canonical rollback을 추가해 18/18이다.

## 남는 운영 확인

이 결과는 승인된 로컬 범위의 서버 계약 증거다. 실제 운영 D1 migration, writer freeze/drain, 기존 CDN cache purge/bypass, primary/replica 설정, mixed Worker release와 peer capability, production rollback 버전은 실행하지 않았다. trigger 이름 존재 검사만으로 privileged DDL 변조 전체를 증명하지 않으므로 운영 preflight에서 실제 정의·core schema fingerprint를 확인해야 한다.

개별 server revision의 snapshot이 안전해도 클라이언트의 preflight/postflight/generation/lease/route/GPS gate가 별도 필수다. Chrome 위험 15건이나 추천 비간섭을 이 서버 58건의 성공으로 대체하지 않는다.

pre-publication-schema.sql은 최초 구현 기반 HEAD `daca2e7308059565db01c6ecd9bbb2847786f59f`의 schema.sql을 변경 전에 복사한 공개 DDL이다. 기존 자료·정확 좌표·비밀정보는 포함하지 않는다.
