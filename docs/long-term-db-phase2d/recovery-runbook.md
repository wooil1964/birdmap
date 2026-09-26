# Phase 2E 복구 runbook — 작성만, 실행 안 함

**PRODUCTION — DO NOT RUN IN PHASE2D**

모든 production 변경은 **USER CONFIRMATION REQUIRED**이다. 실행·검증·rollback·Time Travel 판단·Abort 담당은 모두 운영자 본인이다. 현재 외부 freeze/조회 격리/legacy purge 실행 수단이 준비되지 않아 이 문서는 승인된 즉시 실행 절차가 아니다. 각 BLOCKED를 먼저 해소한다.

## 네 수준의 복구

| 수준 | 사용 조건·목적 | 실행 형태 | 기대·검증·GO | NO-GO·유지 상태 |
|---|---|---|---|---|
| L1 Worker rollback | 새 코드 결함, DB 데이터 유지 가능 | 검증된 버전 UUID로 두 Worker 각각 rollback | binding/Access/route·100% 버전·GET 확인, 외부 freeze 유지 | 기존 NORMAL 버전은 maintenance를 모른다. 구 버전으로 돌아갔다는 이유로 write 재개 금지 |
| L2 canonical 기능 중지 | 비교·dual-write 오류 | 승인된 maintenance config 배포, shadow 필요 시 중지 | 공개 조회는 원래 legacy reports 기반. 쓰기 닫힘 확인 | `NORMAL + DUAL=false`는 reports-only writer를 다시 연다. canonical 쓰기 이후 동기화 없이 사용 금지 |
| L3 additive schema 유지 | 스키마는 있으나 canonical 사용 중단 | reports authoritative 조회, 추가 테이블 그대로 두기 | reports source digest/동의/공개 동작 보존, 후속 조정 계획 | DROP/DELETE/ALTER로 되돌리지 않는다. 재개 전에 canonical 전체 동등성 재검증 |
| L4 Time Travel | DB 손상으로 앞 수준 불충분 | 승인한 bookmark로 복원 | 복원 검증·신규 정상자료 손실 대책·forbidden ledger 재적용 후에만 공개 | 전체 DB 시점 복원이다. Worker rollback과 별개이며 최후 수단 |

현재 공개 read는 canonical로 바뀌지 않았다. 존재하지 않는 canonical read switch를 rollback 명령으로 만들지 않는다.

## L1 실행 형식

목적: 외부 쓰기 차단을 유지하면서 검증된 코드로 되돌린다. 현재 운영 버전은 public `57849940-c4b6-494f-88e9-27ec2e327cd9`, admin `1eebcf4e-e7e0-4b94-bdf2-65c44962c21a`이지만 **maintenance 버전이라고 보장하지 않는다**. Phase 2E에서 검증한 두 maintenance 버전 UUID를 별도로 기록한다.

**PRODUCTION — DO NOT RUN IN PHASE2D / USER CONFIRMATION REQUIRED**

```powershell
# 독립 freeze 유지 + 별도로 검증한 UUID/config가 있어야 실행한다.
& node $wranglerScript rollback $verifiedMaintenancePublicVersion --message $rollbackReason -c $approvedPublicConfig
& node $wranglerScript rollback $verifiedMaintenanceAdminVersion --message $rollbackReason -c $approvedAdminConfig
```

기대: 각 지정 버전이 100% 활성. 검증: deployments GET, 두 D1 binding, 공개/관리 GET, 모든 writer 503+Retry-After, 옛 version 경로 차단. GO는 조회 정상+write 닫힘이다. NO-GO는 버전/secret/binding 불일치나 옛 writer 개방이며 외부 freeze를 유지하고 재배포 계획을 검토한다. 기본 “이전 버전”으로 자동 rollback하지 않는다. secret 변경 등으로 rollback이 거부되면 승인 없는 우회 배포도 하지 않는다.

## 금지 번식자료 정책

둥지·번식지·알·포란·육추·번식 위치를 특정하는 행동은 수집하지 않는다. non-breeding 확인은 사용자 명시값이며 종명·보호등급·계절·지역·AI로 추정하지 않는다. legacy의 confirmation 미상값은 미상으로 남긴다. 미상이라는 이유만으로 삭제하거나 번식자료라고 추정하지 않는다.

실제로 금지자료로 확인된 legacy는 별도 명시적 승인 후 제거 대상이다. 정확 좌표, note/번식 상세, raw payload, canonical 관찰 및 민감 review, 기존 민감 audit 사본을 제거하고 비민감 tombstone만 남긴다. 단순 status=rejected 또는 좌표만 숨기는 방식은 충분하지 않다.

현재 `reports-api/src/canonical/purge.js`는 native_submission만 처리하고 legacy는 409 `PURGE_LEGACY_DECISION_REQUIRED`로 막는다. **정책 결정은 완료, 구현은 미완료**다. 이를 운영에서 즉석으로 해제하지 않는다. 별도 변경·시험·승인이 필요하다. 일반 review/audit UPDATE·DELETE를 열어 purge를 대신하지 않는다.

## D1와 독립된 forbidden-content ledger

복원하면 D1 audit/tombstone도 과거로 돌아간다. 따라서 동일 DB 내 audit만으로 재유입을 막을 수 없다. 접근이 제한되고 D1 restore 대상이 아닌 운영 기록 저장소가 필요하다. 저장 위치·접근 제어·보존 책임은 운영자가 다음 준비 단계에서 확정한다. 이번 단계에서 외부 저장소를 생성하지 않았다.

최소 필드: event_id, opaque report ID, 처리 시각, 처리 유형, 처리자 역할/내부 식별자, 고정 비민감 사유코드, 승인 참조, 진행/완료 상태. 처리 전 승인 기록을 먼저 남기고, 처리 후 제거 검증과 완료를 기록한다. report ID 자체도 제한 접근한다.

기록 금지: 좌표, 제보자 이름, IP hash, 종+위치 fingerprint, note, raw payload, 민감 before_json/after_json, 민감 원문의 hash. 공개 보고에는 ledger 대상 ID 목록을 싣지 않는다. `forbidden_content_purged` audit에도 민감 payload를 복제하지 않는다.

## L4 Time Travel 단계

각 단계는 사람이 결과를 확인한 뒤 다음으로 진행한다. master script를 만들지 않는다.

| 단계 | 목적·명령/동작 | 기대·검증 | GO / NO-GO / 복귀 |
|---|---|---|---|
| R1 사고 격리 | **USER CONFIRMATION REQUIRED**. 외부 writer freeze와 **공개 GET 격리**를 승인된 도구로 실행. 현재 도구 BLOCKED | 구/신 Worker, preview, 직접 writer, 캐시 경로 모두 차단; 관리자 검증 경로만 유지 | 격리 입증 시 GO. 못하면 restore 금지. 단순 READ_ONLY_MAINTENANCE는 GET을 허용하므로 부족 |
| R2 복구점·손실 평가 | 아래 info 명령. pre-cutover bookmark, 실제 복구 가능 timestamp, 이후 정상 접수/관리변경 수·재적용 자료 확인 | 특정 bookmark가 실제 존재, 손실 범위와 민감 백업 접근 통제 기록 | 운영자가 손실·재생 및 복원 승인. 미확인/자료 없음은 NO-GO |
| R3 독립 ledger 확보 | D1 밖 최신 금지자료 목록·완료/미완료 사건 확인, 복구점 이후 purge 전부 포함 | ledger 최신성·접근 권한·대상 해석 가능 | 목록 누락·legacy purge 도구 부재는 NO-GO |
| R4 실제 복원 | 아래 restore 명령, 별도 승인 | 반환 bookmark 기록, 기대 schema·reports source·후속 정상자료 상태 확인 | 실패/응답 유실은 상태 먼저 조회, 무작정 재시도 금지 |
| R5 금지자료 재제거 | **USER CONFIRMATION REQUIRED**. 승인한 purge 함수/운영 경로로 ledger 전 대상 재검사·필요 시 재적용. 현재 legacy 경로 BLOCKED | 해당 복구 스키마에 존재하는 reports/raw/checklist/sighting/review/민감 audit에서 대상 제거, 비민감 tombstone만 남음 | 일부라도 남으면 공개 금지. 복구 이전 정책을 핑계로 보존 금지 |
| R6 전체 검증 | 모든 관련 FK/CHECK·count·assertion·schema·source 의미, 승인된 정상자료 재적용, legacy/canonical 비교 | 정상자료 손실 해소/승인, 금지자료 노출 0 | 불일치 시 계속 격리, 추가 복원도 별도 승인 |
| R7 노출 검증 | 공개 approved/pending/site/status/spot 연결, 관리자 목록·검토, 통제 가능한 CDN·신규 응답·서비스 관리 사본 확인 | 통제 가능한 경로의 재노출 없음; TTL/새로고침 안내와 통제 불가 사본 범위 기록 | 캐시 제거 등 외부 변경은 별도 승인. 새 응답 경로 검증 못하면 GET 재개 금지 |
| R8 재개 판단 | **USER CONFIRMATION REQUIRED**. 운영자 최종 승인 후 조회부터, 쓰기는 별도 gate/CAS/동등성 조건 충족 후 | 두 Worker 동일 활성화·ready·peer, smoke·감시 정상 | 실패는 다시 격리. 정상화 공지는 실제 검증 완료 뒤 |

core 도입 전 bookmark로 복원하면 reports만 있고 schemaReady=false이며 checklist도 없다. 현재 purge 함수는 legacy 허용 변경만으로 그 상태를 처리할 수 없다. reports-only 복구 상태의 별도 승인·시험된 제거 경로 또는 검증된 재구성 절차가 없으면 공개 재개는 NO-GO다.

서버 GET을 격리해도 이미 열린 화면은 기존 마커를 유지할 수 있고 다운로드/오프라인 사본은 회수할 수 없다. R7은 통제 가능한 응답·관리 사본의 재노출 방지를 검증하는 절차다. 이미 전달된 모든 사본의 삭제를 보장하지 않는다. 캐시 TTL·재로딩 안내와 통제 밖 잔존 위험을 운영 기록에 남긴다.

**PRODUCTION — DO NOT RUN IN PHASE2D** (R2 읽기)

```powershell
& node $wranglerScript d1 time-travel info birdmap-reports --json -c reports-api/wrangler.public.toml
& node $wranglerScript d1 time-travel info birdmap-reports --timestamp $approvedTimestamp --json -c reports-api/wrangler.public.toml
```

**PRODUCTION — DO NOT RUN IN PHASE2D / USER CONFIRMATION REQUIRED** (R4 변경)

```powershell
& node $wranglerScript d1 time-travel restore birdmap-reports --bookmark $approvedBookmark -c reports-api/wrangler.public.toml
```

Wrangler 4.137.0에서는 restore에 `--json`을 붙이면 확인 질문 없이 복원을 실행한다. 위 변경 명령에는 `--json`, `--yes`, 비대화형 자동 승인을 붙이지 않는다. Time Travel 명령은 원격 대상이며 `--remote` 인수가 없다. CLI 확인창을 사용자 승인의 대체로 보지도 않는다.

공식 한도는 Free 7일/Paid 30일이나 이 계정 구독 조회는 403이었다. 계정의 최대 보존 기간을 확정하지 않았다. Phase 2C에서 새 staging DB의 bookmark 복구는 검증했지만 production 기간·최초 cutover·purge 이전 복원을 검증한 것은 아니다. 실제 cutover 직전 사용 가능한 bookmark를 다시 확인한다. [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [D1 한도](https://developers.cloudflare.com/d1/platform/limits/).

04:00까지 복구·검증을 마치지 못하면 복구를 서둘러 공개하지 않는다. 쓰기는 maintenance, 민감 재유입 가능성이 있으면 조회도 격리한 채 후속 작업과 공지를 운영자가 결정한다.
