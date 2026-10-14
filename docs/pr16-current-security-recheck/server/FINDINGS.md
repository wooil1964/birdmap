# PR #16 보안 실패: 현재 main 서버·D1 독립 재실행

검증 소스: `399b2f3ac579e365bd48e611465fb5624ce5d9c4` (고정 main). 검증 브랜치 `codex/pr16-current-security-recheck-20261014`.

제품·기존 테스트·기존 재현 하네스 수정 없음. 신규 증거는 이 `server/` 폴더에만 생성했다. 운영 API 호출·Worker/Pages 배포·원격 D1·실사용자 자료 변경은 모두 미실행이다.

## 실행 결과

| 실행 | PASS | FAIL | SKIP | 종료 코드 |
|---|---:|---:|---:|---:|
| 실제 제품 public handler + publication-security/field-updates/publication-path 3스위트 | 110 | 0 | 0 | 0 |
| 실제 local Miniflare/workerd D1: native writer-fence | 13 | 0 | 0 | 0 |
| 실제 local Miniflare/workerd D1: native CAS/공개·관리 handler | 10 | 0 | 0 | 0 |
| 현재 index.html 실제 함수: fresh postflight/route/5초 lease | 20 | 0 | 0 | 0 |
| 이 서버 하위 작업 합계 | **153** | **0** | **0** | |

Chrome 15건 및 5개 화면 폭 집계는 상위 검증의 별도 Chrome 원장에 맡겼으며, 위 153건에 포함하지 않았다. 서버 시험은 실제 제품 함수와 SQL을 호출하며, 브라우저 함수 시험 20건은 실제 소스를 변경 없이 추출해 합성 지연 응답·시계를 사용하는 VM 시험이다. 이를 Chrome 시험으로 표기하지 않는다.

`EXECUTION_MANIFEST.json`은 최초 raw 증거로 보존했다. 기본 Node reporter가 TAP 대신 spec summary를 출력하여 그 원장의 tapSummary가 빈 값이었지만 종료 코드 0과 raw log에는 110/0/0이 존재한다. `EXECUTION_RECONCILED.json`은 그 로그를 다시 읽어 summary를 교차 확인하고 추가 fresh-postflight 시험을 기록한 별도 보조 원장이다. 기존 시험은 다시 실행하거나 원장을 덮어쓰지 않았다.

## 과거 실패 4종과 현재 방어 연결

| 과거 실패 | 재현 전제 | 현재 서버·클라이언트 방어 | 실제 연결 시험 | 현재 서버 하위 판정 |
|---|---|---|---|---|
| V03 hide 이후 과거 공개 GET/정확 좌표 재적용 | 공개 revision R에서 확보한 응답 이후 관리자가 hide하여 R+1; 늦은 응답 또는 구 expectedRevision을 사용 | source write와 publication revision이 같은 트랜잭션으로 진전. state+projection이 first-primary 단일 batch. R 요청은 409/payload 없음. 현행 R+1 projection은 가림 좌표. client fresh postflight와 현재 generation 비교가 이전 응답을 거부 | native M2; `publication: old expected revision is 409 without payload, after withdrawal and hiding`; `publication: atomic state/data and matching authority for /reports/approved`; fresh-postflight 지연 payload 시험 | PASS (Chrome 상태 확인은 별도) |
| V04 승인 철회 이후 새로고침·다른 기기로 과거 제보 복구 | 공개 승인 행을 unpublish 뒤 기존 또는 신규 client가 과거 approved/pending 응답 사용 | canonical review CAS와 같은 publication revision 진전. 현재 공개 SQL은 approved/pending 공개 조건을 다시 적용. unpublish는 승인·대기 공개 모두 제외. old anchor 409; 새 nonce/primary/postflight 확인 없이는 client 공개 권한 없음 | native M3 concurrent unpublish/hide/consent: 1 winner/2 conflicts, 철회 후 approved/pending 양쪽 제외, 정상 재승인 가능. nonce 7개 비정상 입력 거부 및 5개 strict legacy projection 시험 | PASS (다기기 실제 브라우저는 별도) |
| V05 현장소식 remote delete 이후 지연 GET/event/status가 복구 | visible 또는 reappeared 행을 owner가 삭제한 뒤 이전 읽기·상태·확인 작업이 늦게 실행 | deletion은 id+owner+rowRevision+not-deleted CAS, assertion 및 이벤트가 단일 batch. deleted terminal trigger는 좌표/status/activity 재쓰기 금지. child confirmation/status event 금지. current field snapshot은 deleted 제외. client mutation barrier가 공개 상태/마커/DOM를 즉시 폐쇄 | native M4(2/10/20 concurrent delete): 각 1 deletion event, 모두 멱등200, 늦은 status404, 직접 SQL terminal trigger 실패; native M5 confirm/delete; M6 failed CAS 전부 rollback; SQLite `field CAS: status read before delete cannot restore deleted or append a status event`, `confirm read before delete rolls back confirmation/activity and publication`, late child event/confirm 시험 | PASS (늦은 GET 마커/DOM Chrome는 별도) |
| V06 fresh page/old server cache 응답으로 새 client 권한 부여 | 저장·캐시된 old projection과 old HEAD 또는 이미 시작한 in-flight HEAD를 fresh로 오인 | nonce 엄격검증 및 response echo, no-store. client every preflight/payload/postflight nonce 분리; payload 수신 뒤에 시작한 fresh HEAD 필수. 기존 in-flight poll을 postflight로 재사용하지 않음. epoch/revision/generation/nonce 불일치 및 unknown 오류는 fail-closed. permission 만료는 응답 완료 기준이 아닌 HEAD 요청 시작+5초 | native N01/N10 실제 primary anchor, malformed nonce/epoch/revision 및 guard missing 시험; 현재 index fresh-postflight 20건 중 pre-action in-flight route/GPS와 post-payload fresh HEAD 시험, 요청 latency0/4000/4999 lease 및 잘못된 metadata13건 | PASS (새로고침/캐시 Chrome는 별도) |

4종은 제품 기반 서버·D1/함수 증거와 Chrome 증거를 결합해 최종 판정해야 한다. 이 보고서만으로 Chrome 전체 15건 통과 또는 실제 운영 사고 부재를 주장하지 않는다.

## 실제 코드 위치

- `reports-api/src/publication.js:15`: nonce 및 strict expectedEpoch/expectedRevision 요청 계약.
- `reports-api/src/publication.js:36`: 권한·writer-claim·34개 필수 trigger 확인 SQL. 캐시는 trigger rowid 힌트만 저장하며 권한 자체를 캐시하지 않는다.
- `reports-api/src/publication.js:54`: 현재 epoch/revision 정확 문자열 비교; stale 409, unknown 503.
- `reports-api/src/publication.js:59`: `withSession('first-primary')`.
- `reports-api/src/publication.js:131`: authority SELECT와 actual projection을 단일 batch로 실행. locator 복구도 primary 세션을 새로 만들고 전체 state+payload를 다시 읽는다.
- `reports-api/src/field-updates.js:305`, `:338`, `:373`: status/confirm/delete CAS. `row_revision`은 안전범위를 넘는 수에서도 텍스트로 비교한다.
- `reports-api/src/field-updates.js:422`: active field/child event/confirm count를 동일 snapshot에 포함. deleted 부모는 projection에서 제외된다.
- `reports-api/schema.sql:117`: epoch 불변·정확 revision +1. `:120`~`:145` source 행 insert/update/delete에 동일 트랜잭션 권한 진전.
- `reports-api/schema.sql:150`, `:159`, `:162`: deleted terminal, event/confirmation live-parent 불변 조건.
- `index.html:3057`, `:3075`: 5초/숨김 current lease 검출과 동적 위치·이름·길안내·history/stats 폐쇄.
- `index.html:3102`: monotonic HEAD 요청 시작 기준 최대5초. `:3122`: nonce, epoch, revision, projection, serverTime 응답 검증.
- `index.html:3127`, `:3150`: primary HEAD freshness, preflight/payload/postflight/generation 계약.
- `index.html:3192`: 길찾기 실행 전 fresh 권한 검사. GPS callback도 `fieldGuideOnPosition`/`fieldNewsNavigate`/`fieldNavManualGuide`에서 이를 재사용한다.

## 원자성·정합성 관측

- 실제 local workerd D1 writer batches 20개 모두 성공, orphan claim 0. 구 unclaimed writer 20개 모두 거부되어 현재 claim을 빌리지 못했다.
- middle CHECK 및 suffix 오류는 source/revision/claim을 함께 rollback. commit 후 응답 손실은 재쓰기 자동 retry 없이 claim 0을 유지했다.
- freeze 이후 구 writer는 여전히 차단. schema guard 삭제·orphan claim은 fail-closed이고 자동 수선·epoch reset 없음.
- local authority cold rows_read109/warm35, rows_written0. 이는 이 합성 schema 실행의 관측값이며 운영 용량 추정값이 아니다.
- 신규 additive migration의 합성 원본 행은 불변, install frozen, 명시적 thaw 후 정상 write 가능. 운영 migration 실행은 하지 않았다.
- 15개 제품/스키마/원본 테스트·하네스 SHA256 before/after가 모두 일치. source HEAD 동일, tracked diff 없음.

## 한계 및 미실행

- Access JWT·Turnstile 검증 경로는 합성 키/서명과 허용된 fetch stub만 사용한다. 실제 Cloudflare 계정·외부 인증 서비스는 호출하지 않았다.
- 정확한 즉시 철회 수신까지의 지연은 기존 current P1 lease 계약(HEAD 요청 시작에서 최대5초)이다. server mutation 직후 이미 정당하게 공개된 정보를 모든 device에서 0ms에 소거한다고 확대 해석하지 않는다.
- 이전에 합법적으로 공개·다운로드한 좌표를 외부 사용자의 메모리/저장소에서 원격 삭제하는 기능은 이 계약의 보장 범위가 아니다.
- 운영 Worker·Pages·D1, 실제 사용자 등록/삭제/승인, 물리 GPS/카카오맵·티맵 native app은 **미실행**이다. 제품 안전결과와 혼동하지 않는다.
- 실제 Chrome 5폭, 15 위험 세부 집계, GitHub CI SHA/result는 상위 검증 보고서에서 독립 집계한다. 이 서버 하위 결과에는 FAIL/SKIP 없음.
