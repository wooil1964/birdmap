# Phase 2A 컬럼·제약 사전

정의 정본은 [0001_core.sql](migrations/0001_core.sql)이다. 신규 9개 테이블 114개 컬럼이며, 기존 reports 22컬럼·Wrangler 내부 d1_migrations는 이 수에 포함하지 않는다. 모든 ID는 명시적 NOT NULL PK다. `NULL 가능`과 DEFAULT 부재를 구분하며, DEFAULT가 없는 시각을 현재시각으로 임의 채우지 않는다.

## audit_log (9개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `audit_id` PK | TEXT | 아니오 | 없음 | 감사 이벤트 ID |
| `actor_id` | TEXT | 아니오 | 없음 | 인증된 작업자 ID; 사용자 입력을 신뢰하지 않음 |
| `action` | TEXT | 아니오 | 없음 | 작업 종류; payload를 넣지 않음 |
| `target_type` | TEXT | 아니오 | 없음 | 대상 종류 |
| `target_id` | TEXT | 아니오 | 없음 | 대상 영구 ID |
| `request_id` | TEXT | 아니오 | 없음 | 작업/재시도 그룹 ID |
| `request_fingerprint` | TEXT | 예 | 없음 | 멱등성 비교용 승인된 요청 의미의 SHA-256; raw payload 해시를 audit에 복사하지 않음 |
| `event_count` | INTEGER | 아니오 | 없음 | 요청에 속한 review 수 |
| `created_at` | TEXT | 아니오 | 없음 | 이 행이 생성된 실제 처리시각 |

## backfill_runs (6개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `run_id` PK | TEXT | 아니오 | 없음 | 명시적인 backfill 실행 ID |
| `manifest_checksum` | TEXT | 아니오 | 없음 | 정렬·형식을 고정한 입력 manifest SHA-256 |
| `transform_version` | TEXT | 아니오 | 없음 | 변환 규칙 버전 |
| `source_count` | INTEGER | 아니오 | 없음 | 입력 행 수 |
| `completed_at` | TEXT | 아니오 | 없음 | 원자적 backfill 성공 기록시각 |
| `source_revision` | TEXT | 아니오 | 없음 | 입력 스냅샷/registry revision 식별자 |

## checklists (38개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `checklist_id` PK | TEXT | 아니오 | 없음 | 관찰 묶음 ID; legacy reports.id 그대로 |
| `site_id` | TEXT | 예 | 없음 | 기존 siteData.id 그대로; 대표좌표와 관찰좌표를 혼동하지 않음 |
| `raw_id` | TEXT | 아니오 | 없음 | 불변 원자료 ID |
| `source_type` | TEXT | 아니오 | 없음 | legacy/native 출처 구분 |
| `source_id` | TEXT | 아니오 | 없음 | 출처 원본 ID |
| `record_mode` | TEXT | 아니오 | 없음 | legacy_report / quick_report / complete_checklist |
| `status` | TEXT | 아니오 | 'pending' | pending / approved / rejected 현재 상태 |
| `observation_date` | TEXT | 아니오 | 없음 | 관찰일; legacy observed_on 그대로 |
| `start_time` | TEXT | 예 | 없음 | 확인된 관찰 시작시각만, legacy NULL |
| `timezone` | TEXT | 예 | 없음 | 확인된 관찰 시간대만, legacy NULL |
| `duration_minutes` | REAL | 예 | 없음 | 확인된 노력 시간, legacy NULL |
| `distance_m` | REAL | 예 | 없음 | 확인된 노력 거리, legacy NULL |
| `observer_count` | INTEGER | 예 | 없음 | 확인된 관찰자 수, legacy NULL |
| `protocol` | TEXT | 예 | 없음 | 확인된 관찰 방법, legacy NULL |
| `complete_list` | INTEGER | 예 | 없음 | 명시적 완전목록 여부; legacy NULL은 false가 아님 |
| `actual_lat` | REAL | 예 | 없음 | 실제 관찰 위도, site 좌표로 채우지 않음 |
| `actual_lon` | REAL | 예 | 없음 | 실제 관찰 경도 |
| `coordinate_uncertainty_m` | REAL | 예 | 없음 | 알려진 오차만; 임의 기본 오차 금지 |
| `approx_lat` | REAL | 예 | 없음 | 기존 pending 공개용 대략 위도 보존 |
| `approx_lon` | REAL | 예 | 없음 | 기존 pending 공개용 대략 경도 보존 |
| `public_lat` | REAL | 예 | 없음 | 기존 별도 공개 위도 보존 |
| `public_lon` | REAL | 예 | 없음 | 기존 별도 공개 경도 보존 |
| `coordinate_policy` | TEXT | 아니오 | 'actual' | legacy_fallback / actual / explicit / withheld 정책 메타데이터 |
| `pending_public` | INTEGER | 아니오 | 0 | 기존 pending 마커 허용 플래그; approved 잔류값도 보존 |
| `name_public` | INTEGER | 아니오 | 0 | 이름 공개 동의 0/1 |
| `spot_key` | TEXT | 예 | 없음 | legacy 지도 연결 키 원문 |
| `species_text` | TEXT | 아니오 | 없음 | legacy/API 합성 종 문자열 원문 |
| `shared_bird_count` | INTEGER | 예 | 없음 | legacy 제출 묶음의 공통 수량; 종별 count로 배분 금지 |
| `reporter` | TEXT | 예 | 없음 | 표시 이름; name_public 동의에 따름 |
| `note` | TEXT | 예 | 없음 | 제보 메모, 비공개 저장 정책 적용 |
| `admin_note` | TEXT | 예 | 없음 | 관리자 전용 메모 |
| `received_at` | TEXT | 아니오 | 없음 | 접수시각 원값 |
| `decided_at` | TEXT | 예 | 없음 | 마지막 처리시각 원값; 과거 이력을 추정하지 않음 |
| `compat_ip_hash` | TEXT | 예 | 없음 | legacy rate limit 해시, raw IP 아님 |
| `compat_dedupe_hash` | TEXT | 예 | 없음 | legacy dedupe 해시 그대로; 새 taxonomy dedupe 정본 아님 |
| `created_at` | TEXT | 아니오 | 없음 | 이 행이 생성된 실제 처리시각 |
| `revision` | INTEGER | 아니오 | 1 | 동시성 CAS 번호; 양의 정수 |
| `updated_at` | TEXT | 아니오 | 없음 | 현재 projection을 수정한 실제 처리시각 |

## raw_submissions (12개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `raw_id` PK | TEXT | 아니오 | 없음 | 불변 원자료 ID |
| `source_type` | TEXT | 아니오 | 없음 | legacy/native 출처 구분 |
| `source_id` | TEXT | 아니오 | 없음 | 출처 원본 ID |
| `request_id` | TEXT | 예 | 없음 | 작업/재시도 그룹 ID |
| `payload_json` | TEXT | 아니오 | 없음 | 불변 입력 JSON; legacy는 현재 reports 22필드 스냅샷이며 최초 제출 원문이라고 주장하지 않음 |
| `submitted_at` | TEXT | 예 | 없음 | native 접수시각; legacy 최초 제출시각은 NULL |
| `submitted_by` | TEXT | 예 | 없음 | 확인된 제출자 식별자만, 모르면 NULL |
| `schema_version` | TEXT | 아니오 | 없음 | payload 계약 버전 |
| `captured_at` | TEXT | 아니오 | 없음 | 스냅샷을 만든 실제 시각 |
| `source_fingerprint` | TEXT | 아니오 | 없음 | private raw 원문 멱등성/무결성 SHA-256 |
| `non_breeding_confirmed` | INTEGER | 예 | 없음 | legacy NULL / 적격 native 1만 |
| `policy_version` | TEXT | 예 | 없음 | native에서 확인한 정책 버전; legacy NULL |

## reviews (16개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `review_id` PK | TEXT | 아니오 | 없음 | 개별 불변 검토 ID |
| `checklist_id` | TEXT | 아니오 | 없음 | 관찰 묶음 ID; legacy reports.id 그대로 |
| `sequence` | INTEGER | 아니오 | 없음 | checklist 안에서 증가하는 검토 순번 |
| `decision` | TEXT | 아니오 | 없음 | submitted / approved / corrected / rejected / unpublished / reapproved |
| `sighting_id` | TEXT | 예 | 없음 | 해당 checklist 소속 sighting만 참조 |
| `validated_taxon_id` | TEXT | 예 | 없음 | 검토자가 확인한 taxonomy ID |
| `validated_count` | INTEGER | 예 | 없음 | 검토가 확인한 수량; 미확인 NULL |
| `validated_count_accuracy` | TEXT | 예 | 없음 | exact / estimated / minimum / unknown; 수량 NULL에는 exact 불가 |
| `from_status` | TEXT | 예 | 없음 | 확인된 직전 상태, 불명 NULL |
| `to_status` | TEXT | 아니오 | 없음 | 검토 결과 상태 |
| `actor_id` | TEXT | 아니오 | 없음 | 인증된 작업자 ID; 사용자 입력을 신뢰하지 않음 |
| `request_id` | TEXT | 아니오 | 없음 | 작업/재시도 그룹 ID |
| `event_index` | INTEGER | 아니오 | 없음 | 요청 전체에서 고정한 0 이상의 개별 이벤트 순번 |
| `reason_code` | TEXT | 예 | 없음 | 구조화한 사유 코드; 민감 설명을 복사하지 않음 |
| `note` | TEXT | 예 | 없음 | 검토 사유; 민감 payload 복사 금지 |
| `created_at` | TEXT | 아니오 | 없음 | 이 행이 생성된 실제 처리시각 |

## sightings (13개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `sighting_id` PK | TEXT | 아니오 | 없음 | 해당 checklist 소속 sighting만 참조 |
| `checklist_id` | TEXT | 아니오 | 없음 | 관찰 묶음 ID; legacy reports.id 그대로 |
| `source_ordinal` | INTEGER | 아니오 | 없음 | 입력 단위 내 영구 순번 |
| `species_original` | TEXT | 아니오 | 없음 | 불변 원종 문자열 |
| `species_identified` | TEXT | 예 | 없음 | 검토 후 표시 종명; 자동 사전 매칭으로 채우지 않음 |
| `interpretation` | TEXT | 아니오 | 'unknown' | single / unparsed_multiple / unknown |
| `taxon_id` | TEXT | 예 | 없음 | 검증된 분류 ID만; 미매칭 NULL |
| `count_value` | INTEGER | 예 | 없음 | 종별 관찰/검토 수량; 0과 NULL 분리 |
| `count_accuracy` | TEXT | 아니오 | 'unknown' | exact / estimated / minimum / unknown; legacy 1도 unknown |
| `count_source` | TEXT | 아니오 | 없음 | legacy_single / reported / reviewed / not_recorded / ambiguous_group |
| `interpretation_note` | TEXT | 예 | 없음 | 해석 근거; 원문 대체 금지 |
| `created_at` | TEXT | 아니오 | 없음 | 이 행이 생성된 실제 처리시각 |
| `updated_at` | TEXT | 아니오 | 없음 | 현재 projection을 수정한 실제 처리시각 |

## sites (9개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `site_id` PK | TEXT | 아니오 | 없음 | 기존 siteData.id 그대로; 대표좌표와 관찰좌표를 혼동하지 않음 |
| `site_name` | TEXT | 아니오 | 없음 | registry 탐조지 이름 |
| `lat` | REAL | 예 | 없음 | 탐조지 대표 위도; actual이 아님 |
| `lon` | REAL | 예 | 없음 | 탐조지 대표 경도; actual이 아님 |
| `registry_source` | TEXT | 아니오 | 없음 | 탐조지 목록 출처 |
| `registry_revision` | TEXT | 아니오 | 없음 | 목록 revision/checksum |
| `source_record_json` | TEXT | 아니오 | 없음 | 해당 registry 원본 JSON |
| `created_at` | TEXT | 아니오 | 없음 | 이 행이 생성된 실제 처리시각 |
| `retired_at` | TEXT | 예 | 없음 | 목록에서 은퇴한 시각; ID 재사용 금지 |

## taxa (9개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `taxon_id` PK | TEXT | 아니오 | 없음 | 검증된 분류 ID만; 미매칭 NULL |
| `source_taxon_key` | TEXT | 아니오 | 없음 | 외부 분류체계의 버전 내 키 |
| `korean_name` | TEXT | 예 | 없음 | 출처의 국명 |
| `scientific_name` | TEXT | 예 | 없음 | 출처의 학명 |
| `taxon_rank` | TEXT | 아니오 | 없음 | 출처의 계급 |
| `taxonomy_source` | TEXT | 아니오 | 없음 | 분류체계 출처 |
| `taxonomy_version` | TEXT | 아니오 | 없음 | 분류체계 버전 |
| `taxon_status` | TEXT | 아니오 | 없음 | accepted / unresolved / deprecated; synonym 자동 통합 보류 |
| `created_at` | TEXT | 아니오 | 없음 | 이 행이 생성된 실제 처리시각 |

## transaction_assertions (2개)

| 컬럼 | 타입 | NULL 가능 | DEFAULT | 의미 |
|---|---|---|---|---|
| `assertion_id` PK | TEXT | 아니오 | 없음 | 한 batch 안의 검사 식별자 |
| `ok` | INTEGER | 아니오 | 없음 | NOT NULL CHECK(ok=1); 0/NULL은 batch 실패 |

## 제약·인덱스·trigger의 역할

- **sites**: 대표좌표도 NULL 쌍 또는 유효 숫자 쌍. site_id UPDATE 금지. 기존 ID는 변경·재사용하지 않고 retired_at으로 은퇴한다.
- **taxa**: (taxonomy_source, taxonomy_version, source_taxon_key) UNIQUE. UPDATE 금지. 새 분류 버전은 새 행이며 자동 synonym/parent 연결은 보류한다.
- **raw_submissions**: (source_type, source_id) UNIQUE와 nullable request_id UNIQUE. native는 confirmation=1, policy_version/request_id/submitted_at 필수. legacy는 confirmation/policy_version NULL. UPDATE 금지.
- **checklists**: raw_id UNIQUE FK, (source_type,source_id) UNIQUE, legacy ID=source_id. 실제 좌표 NULL 쌍은 FK로 유효한 site_id가 있을 때만 허용. 숫자형·범위 검사. 신규 approx/public은 쌍 제약, legacy의 불완전 공개/대략 쌍은 변경 없이 보존한다. explicit이면 공개 쌍 필수. source identity UPDATE 금지, INSERT 때 raw 출처·source_id 일치 trigger. 이 작은 출처 제약은 writer permit/22필드 guard가 아니다.
- **sightings**: (checklist_id,source_ordinal) UNIQUE, (checklist_id,sighting_id) UNIQUE. count는 0 이상 정수 또는 NULL. NULL이면 unknown; 값이 있으면 unknown도 허용. single 외에는 taxon/count NULL. ambiguous_group의 count NULL. 원문·원래 순번·부모·ID UPDATE 금지.
- **reviews**: (checklist_id,sequence) UNIQUE와 (request_id,event_index) UNIQUE. 부모 checklist와 sighting의 복합 FK로 다른 묶음 sighting 검토를 거부. sighting 없는 상태 이벤트는 validated_* 모두 NULL. UPDATE 금지.
- **audit_log**: 요청·action·대상별 UNIQUE. request/checklist당 1개 audit에 event_count를 기록한다. before/after JSON은 없다. 일반 이벤트 fingerprint 필수, forbidden_content_purged는 fingerprint NULL 및 event_count=0 강제. 이는 향후 정책용 제약이며 purge 경로를 구현하거나 실행하지 않았다. UPDATE 금지.
- **backfill_runs**: run_id PK, manifest UNIQUE. DDL 버전표가 아니다. 합성 proof는 전체 backfill과 완료 행을 한 batch로 쓴다. 동일 manifest 재실행은 source/canonical 3테이블 내용 검증 후 건너뛰고, 수정·부분 상태는 중단한다. 적용 후 일반 쓰기가 열린 DB에서 이 단순 backfill 재실행기를 사용하지 않는다.
- **transaction_assertions**: 즉시 직전 UPDATE의 changes()=1을 CHECK로 강제한 뒤 같은 batch에서 삭제한다. 성공 후 0행. 영구 lock/permit/버전 상태를 저장하지 않는다.
- FK는 ON DELETE RESTRICT이며 CASCADE를 사용하지 않는다. 명시적 정책 폐기 외의 삭제는 향후 application 권한에서 차단한다. DB role별 DELETE 권한 모델을 구현한 것은 아니다.
- 검색 인덱스: taxa 이름/버전, checklist site·status·관찰일·접수일·ID, 승인 목록, pending 공개, spot_key, IP 접수시각, sighting taxon, review sighting/taxon, audit 대상·시각. UNIQUE/PK 자동 인덱스는 별도 존재한다. 기존 reports 인덱스는 이 DDL이 수정하지 않는다.
- TEXT 날짜는 DDL만으로 달력상의 유효성·시차·관찰일과 접수일 순서를 모두 검증하지 않는다. 신규 입력의 strict validation, 기존 이상값 탐지·보존/보류는 Phase 2B의 preflight와 writer가 담당해야 한다. 누락된 과거 시각을 추정하지 않는다.

## checklists: canonical과 호환 필드의 수명

| 분류 | 필드 | 분석·보존 원칙 / reports 폐기 이후 |
|---|---|---|
| 영구 관찰 정본 | checklist_id, site_id, raw_id, source_type, source_id, record_mode | ID·출처 연결 영구 유지. site는 실제 좌표 대체값이 아니다. |
| 관찰·노력 정본 | observation_date, start_time, timezone, duration_minutes, distance_m, observer_count, protocol, complete_list | 확인한 값만 분석. legacy effort/complete_list는 NULL. |
| 위치 정본 | actual_lat, actual_lon, coordinate_uncertainty_m | 입력 실제값 보존. site-only도 표현하되 기존 빠른 제보 기능에는 아직 열지 않는다. |
| 운영 상태·공개 정책 | status, coordinate_policy, name_public | 분석 수량이 아니다. 이름 동의는 reports 폐기 후에도 유지. 정책 버전은 raw에 남긴다. |
| 현재 보정 공개값 | public_lat, public_lon | 기존 값/NULL/불완전 쌍 보존. legacy API fallback 유지. 영구 생태 위치로 사용하지 않으며 폐기 시 별도 공개 projection으로 이전 가능. |
| 기존 pending 표현 | approx_lat, approx_lon, pending_public | 승인 잔류 플래그도 유지. pending 상태와 함께만 평가. 생태분석 금지, legacy 마커 계약 종료 후 제거 후보. |
| 기존 지도 연결 | spot_key | report UUID/fixed:key 원문. site FK와 다르다. 고아·순환·유효 fixed key 검증은 application/preflight. 향후 관계 모델·이력 이관 후 제거 후보. |
| 기존 입력 표현 | species_text | 현재 legacy API/검색 계약용; taxa 또는 sightings 대체 금지. raw와 species_original 보존 및 API 종료 검증 후 projection에서 제거 가능. |
| 묶음 수량 원문 | shared_bird_count | legacy bird_count 그대로. 여러 종에 복제·합산하지 않음. 검토된 sighting count 변경을 자동 전파하지 않음. raw 보존 후 호환 종료 시 제거 후보. |
| 제한·중복 호환 | compat_ip_hash, compat_dedupe_hash | 기존 rate limit/dedupe 동작 유지. 새 생태 중복키로 오용 금지. IP hash 보존기간·salt 전환·신규 dedupe 규칙을 별도 확정한 후 제거/전환. |
| 운영 설명·접수 시각 | reporter, note, admin_note, received_at, decided_at | name_public 동의와 관리자 권한 적용. note에 분석 사실을 추정하지 않음. 과거 결정 시각의 원값 보존, 전체 과거 review를 재구성하지 않음. |
| 동시성·처리 메타데이터 | revision, created_at, updated_at | 생태 관찰일이 아님. reports 폐기 후에도 동시성/출처 관리용 유지. |

호환 필드는 reports 폐기와 동시에 자동 삭제하지 않는다. raw는 삭제 가능한 공개 cache가 아니며, 보존기간·금지자료 정책·권한에 따라 별도로 관리한다. 현재 공개 DTO는 legacy_report/quick_report이며 실제 좌표가 있는 행만 취급한다. site-only/complete_checklist를 섞어 null이 지도 0,0으로 해석되지 않도록 차단한다.

## 후속 기능으로 미룬 구조

media는 업로드·권리·촬영시각·checksum·공개권한이 실제 구현될 때 sightings FK와 함께 추가한다. environment_snapshots는 관찰시각·예보발행시각·조회시각·출처·단위·위치·관측/예보/모델 구분을 가진 불변 자료로 추가한다. 현재 날씨/조석 JSON을 과거 관찰 환경으로 소급해서 채우지 않는다. 이번 migration에는 두 테이블 DDL이 없다.
