# 배포 후 첫 실제 신규 제보 점검표 (PR #80 운영판)

> 목적: 실제 이용자 제보가 처음 들어왔을 때, 시험 제보를 넣지 않고 그 제보 하나로 전 과정을 확인한다.
> 전제: 공개 `227a6942`, 관리자 `8a8f1668`, `REPORTS_AUTO_PUBLIC=0`, `REPORTS_UNVERIFIED_READS=0`.
> 원칙: 모든 D1 확인은 **SELECT만** 쓴다. 좌표(`lat`·`lon`·`public_lat`·`public_lon`·`approx_*`), 제보자, IP 해시, 메모는 조회하거나 기록하지 않는다. 결과 표의 `changes`가 0인지 함께 기록한다.

D1 조회 명령 형식(계정 ID 환경변수 필요, 비밀 출력 금지):
`npx -y wrangler@4.149.0 d1 execute birdmap-reports --remote -c wrangler.public.toml --json --command "<SQL>"`

## 0. 사전 확인 (제보가 들어오기 전 한 번)

| # | 확인 | 기대 |
|---|---|---|
| 0-1 | 공개·관리자 배포 버전 | `227a6942` 100% / `6a805ded` 0%, `8a8f1668` 100% |
| 0-2 | 두 스위치 | 모두 "0" |
| 0-3 | 기준 수치 | `SELECT status, COUNT(*) n FROM reports GROUP BY status` → 승인 133 / 반려 22 / 대기 0 (이후 변동은 정상 처리 결과인지 기록) |
| 0-4 | 공개 API | 승인 마커 131, `/reports/pending` 0건 |

## 1. 새 제보 감지

`SELECT id, status, pending_public, species, bird_count, observed_on, received_at FROM reports WHERE status='pending' ORDER BY received_at DESC LIMIT 5`

- 이후 단계에서는 이 제보의 `id`를 `:id`로 쓴다. id는 기록해도 되지만 좌표는 기록하지 않는다.

## 2. 접수와 저장 (관리자 조치 전)

| # | 확인 | SQL / 방법 | 기대 |
|---|---|---|---|
| 2-1 | reports | `SELECT status, pending_public, species, bird_count FROM reports WHERE id=':id'` | `pending`, `pending_public=0`, species는 제보자 원문 |
| 2-2 | 원자료 | `SELECT schema_version, policy_version, non_breeding_confirmed FROM raw_submissions WHERE request_id=':id'` | `quick-v1`, `non-breeding-v1`, `1` |
| 2-3 | 정본 | `SELECT status, pending_public, revision FROM checklists WHERE checklist_id=':id'` | `pending`, `0`, `1` |
| 2-4 | 종별 행 | `SELECT source_ordinal, species_original, species_identified, interpretation, count_value, count_source, interpretation_note FROM sightings WHERE checklist_id=':id' ORDER BY source_ordinal` | 분리되는 입력이면 종마다 1행(예: `동박새3, 박새2` → 동박새 3 / 박새 2, `reported`). 숫자가 없으면 `not_recorded`. 같은 종 두 번이면 `unknown`·`duplicate_species`. 분리 불가면 원문 1행(`species_identified` 없음) |
| 2-5 | 자동 판정 기록 | `SELECT COUNT(*) n FROM reviews WHERE checklist_id=':id'` | **0** (스위치 OFF이면 기록하지 않음) |
| 2-6 | 접수증·상태 | 제보자 화면 안내 또는 `GET /reports/:id/status` | `pending` / `withheld`, 좌표 없음 |
| 2-7 | 공개 API | `/reports/pending`(계약 포함), `/reports/approved`, `/reports/search?q=<종명>` | 대기 0건, 승인 수 변화 없음, 검색에 나오지 않음 |

## 3. 관리자 목록

| # | 확인 | 기대 |
|---|---|---|
| 3-1 | "검토 대기" 탭 | 새 제보 카드, 배지 **검토 대기 · 비공개** |
| 3-2 | "자동 공개 · 미검증" 탭 | 0건 |
| 3-3 | 카드 정보 | 종별 표시(구조화된 경우 "종별: … — n종, 개체수 m(입력분)"), 위치 공개/가림 요청 표시 |
| 3-4 | 미확인 종명 | 공식 국명과 정확히 맞지 않으면 "공식 국명 확인 필요" 표시만(원문 수정 없음) |
| 3-5 | 대기 수동 공개 버튼 | 없음 |

## 4. 관리자 처리 (실제 판단에 따라 한 가지)

### 4-A 승인 (필요하면 종명·개체수 정정과 함께)

| # | 확인 | SQL / 방법 | 기대 |
|---|---|---|---|
| A-1 | 상태 | `SELECT status, decided_at FROM reports WHERE id=':id'` | `approved`, 시각 기록 |
| A-2 | 정본 | `SELECT status, revision FROM checklists WHERE checklist_id=':id'` | `approved`, revision 2 이상 |
| A-3 | 검토 이력 | `SELECT sequence, decision, sighting_id, validated_count, from_status, to_status, reason_code FROM reviews WHERE checklist_id=':id' ORDER BY sequence` | `approved`(또는 반려 후 `reapproved`). 종명을 고쳤으면 종별 `corrected` 행 |
| A-4 | 감사 | `SELECT action, event_count FROM audit_log WHERE target_id=':id'` | `approve` |
| A-5 | 종명 정정 시 | 2-4 SQL 재실행 | 원문(`species_original`) 그대로, 식별 국명·개체수만 바뀜. 남는 행은 `superseded` |
| A-6 | 지도 | 새로고침 또는 5초 이내 | 승인 마커 +1(위치 정책 v2상 숨김 대상이면 +0). 상세창에 종별 개체수 |
| A-7 | 위치 보호 | 상세창 | 제보자 위치 가리기 → 대략 위치 안내, 길찾기 없음. 보호종이면 v2 판정대로 |
| A-8 | 길찾기 | 카카오맵·T맵 | 목적지 = 공개 좌표(가림이면 버튼 없음) |
| A-9 | 검색 | `/reports/search?q=<종명>` 또는 화면 검색 | 결과에 포함(가림이면 이동 없음) |
| A-10 | 탐조지 연결 시 | 탐조지 이력, 최근 탐조지 | 이력에 표시 |
| A-11 | 관리자 통계 | 요약 카드 | 승인 +1, 종수·관찰 개체수(구조화 입력분) 반영 |
| A-12 | 회원별 통계 | 이름 공개 동의 시 | 종수·종 목록 반영 |

### 4-B 반려

| # | 확인 | 기대 |
|---|---|---|
| B-1 | 사유 없이 반려 시도 | 화면에서 막힘 |
| B-2 | `SELECT status FROM reports WHERE id=':id'` | `rejected` |
| B-3 | `SELECT decision, reason_code FROM reviews WHERE checklist_id=':id' ORDER BY sequence DESC LIMIT 1` | `rejected`, `reject:<사유코드>` |
| B-4 | 상태 조회 | `not_published` |
| B-5 | 공개 API·화면 | 어디에도 나오지 않음 |

### 4-C 공개 취소 (승인 후에 필요할 때)

| # | 확인 | 기대 |
|---|---|---|
| C-1 | `reports.status` | `pending`, `pending_public=0` |
| C-2 | 관리자 배지 | **공개 취소** |
| C-3 | 지도·검색 | 5초 이내 사라짐 |

## 5. 실패 판정과 즉시 조치

| 증상 | 조치 |
|---|---|
| 승인 전에 공개 API·화면에 좌표가 나옴 | 즉시 `versions deploy 6a805ded…@100%`(공개 읽기 차단) 후 보고 |
| 반려·공개 취소 뒤에도 마커가 남음(5초 이상) | 차단판 전환 검토, 원인 조사 |
| 종별 행·통계가 기대와 다름 | 운영 변경 없이 기록 후 보고(데이터 수정 금지) |
| 관리자 처리 409·503 | 재시도 전에 `reviews`·`audit_log`로 중복 처리 여부 확인 |

## 6. 기록 양식

| 항목 | 값 |
|---|---|
| 제보 id |  |
| 접수 시각(UTC) |  |
| 원문 종명 / 종별 분리 결과 |  |
| 접수증·상태 |  |
| 관리자 처리(승인/반려/정정) · 시각 |  |
| 공개 반영 확인 시각 |  |
| 이상 여부 |  |
| D1 조회 changes 합계 | 0 이어야 함 |
