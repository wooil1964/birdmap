# 데이터 표준 v1.1 — 전체 컬럼·제약 사전

이 문서는 SQL 초안의 CREATE TABLE 텍스트에서 열 정의를 추출해 대조한 사전이다. SQL을 실행해 생성한 운영 스키마가 아니다. 기준 파일은 [1001](sql/1001_core_schema.draft.sql), [1003](sql/1003_writer_controls.draft.sql)이다.

NULL 허용 “예”도 표 아래 복합 CHECK에 의해 조건부 제한될 수 있다. DEFAULT “없음”은 값을 추정해 채우지 않는다는 뜻이다. NOT NULL이며 DEFAULT가 없는 열은 writer/runner가 명시적으로 제공해야 한다. BOOLEAN은 INTEGER 0/1, 시각·JSON·UUID·기존 숫자형 site ID의 문자열 표현은 TEXT, 수량은 INTEGER, 좌표·측정값은 REAL이다. 숫자 열의 타입 CHECK와 SQLite affinity를 함께 사용한다.

모든 FK의 ON DELETE는 RESTRICT이고 ON UPDATE는 기본 NO ACTION이다. 정상 삭제 API는 없다. 금지자료 예외 폐기는 허가된 서비스가 관련 reviews/media/environment/sightings/checklists/raw/reports를 명시적 순서로 제거하고 비민감 감사만 남긴다. 이 DDL의 UPDATE 차단 trigger는 일반 자료 불변성을 보강하며, DB 자격증명을 가진 사람의 임의 DELETE까지 구분하는 사용자 권한 시스템은 아니다.

## schema_migrations

미래 실제 적용 이력. 기존 과거 이력을 추정하지 않음.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `version` | INTEGER | 아니오 | 없음 | `NOT NULL PRIMARY KEY CHECK (version > 0)` |
| `name` | TEXT | 아니오 | 없음 | `NOT NULL UNIQUE` |
| `checksum` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (length(checksum)=64 AND checksum NOT GLOB '*[^0-9a-f]*')` |
| `applied_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `runner_version` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `source_manifest_checksum` | TEXT | 예 | 없음 | `추가 없음` |

## sites

현재 siteData 영구 ID와 출처 레지스트리. 이름이 같아도 별개.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `site_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `site_name` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `province` | TEXT | 예 | 없음 | `추가 없음` |
| `district` | TEXT | 예 | 없음 | `추가 없음` |
| `lat` | REAL | 아니오 | 없음 | `NOT NULL CHECK (lat BETWEEN -90 AND 90) CHECK (lat IS NULL OR typeof(lat) IN ('integer','real'))` |
| `lon` | REAL | 아니오 | 없음 | `NOT NULL CHECK (lon BETWEEN -180 AND 180) CHECK (lon IS NULL OR typeof(lon) IN ('integer','real'))` |
| `coordinate_uncertainty_m` | REAL | 예 | 없음 | `CHECK (coordinate_uncertainty_m IS NULL OR coordinate_uncertainty_m >= 0) CHECK (coordinate_uncertainty_m IS NULL OR typeof(coordinate_uncertainty_m) IN ('integer','real'))` |
| `habitat_type` | TEXT | 예 | 없음 | `추가 없음` |
| `site_status` | TEXT | 아니오 | 'unknown' | `NOT NULL DEFAULT 'unknown' CHECK (site_status IN ('active','retired','unknown'))` |
| `registry_source` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `registry_revision` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `source_record_json` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (json_valid(source_record_json))` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `updated_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `retired_at` | TEXT | 예 | 없음 | `추가 없음` |

## taxa

출처·버전별 불변 분류군. 원문과 분리.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `taxon_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `source_taxon_key` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `korean_name` | TEXT | 예 | 없음 | `추가 없음` |
| `scientific_name` | TEXT | 예 | 없음 | `추가 없음` |
| `english_name` | TEXT | 예 | 없음 | `추가 없음` |
| `taxon_rank` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `parent_taxon_id` | TEXT | 예 | 없음 | `추가 없음` |
| `taxonomy_source` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `taxonomy_version` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `taxon_status` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (taxon_status IN ('accepted','synonym','unresolved','deprecated'))` |
| `accepted_taxon_id` | TEXT | 예 | 없음 | `추가 없음` |
| `source_record_json` | TEXT | 예 | 없음 | `CHECK (source_record_json IS NULL OR json_valid(source_record_json))` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

복합 제약:

```sql
UNIQUE (taxonomy_source,taxonomy_version,source_taxon_key),
UNIQUE (taxon_id,taxonomy_source,taxonomy_version),
CHECK (parent_taxon_id IS NULL OR parent_taxon_id <> taxon_id),
CHECK (accepted_taxon_id IS NULL OR accepted_taxon_id <> taxon_id),
CHECK (taxon_status <> 'synonym' OR accepted_taxon_id IS NOT NULL),
FOREIGN KEY (parent_taxon_id,taxonomy_source,taxonomy_version)
    REFERENCES taxa(taxon_id,taxonomy_source,taxonomy_version) ON DELETE RESTRICT,
FOREIGN KEY (accepted_taxon_id,taxonomy_source,taxonomy_version)
    REFERENCES taxa(taxon_id,taxonomy_source,taxonomy_version) ON DELETE RESTRICT
```

## raw_submissions

적격 신규 입력 원문 또는 명시적인 legacy 현재행 snapshot.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `raw_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `source_type` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (source_type IN ('legacy_reports_snapshot','native_submission'))` |
| `source_id` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `request_id` | TEXT | 예 | 없음 | `UNIQUE` |
| `payload_json` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (json_valid(payload_json))` |
| `submitted_at` | TEXT | 예 | 없음 | `추가 없음` |
| `submitted_by` | TEXT | 예 | 없음 | `추가 없음` |
| `schema_version` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `captured_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `source_fingerprint` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (length(source_fingerprint)=64 AND source_fingerprint NOT GLOB '*[^0-9a-f]*')` |
| `non_breeding_confirmed` | INTEGER | 예 | 없음 | `CHECK (non_breeding_confirmed IS NULL OR non_breeding_confirmed = 1)` |
| `policy_version` | TEXT | 예 | 없음 | `추가 없음` |

복합 제약:

```sql
UNIQUE (source_type,source_id),
CHECK (
    (source_type='legacy_reports_snapshot' AND non_breeding_confirmed IS NULL AND policy_version IS NULL)
    OR (source_type='native_submission' AND non_breeding_confirmed=1
        AND non_breeding_confirmed IS NOT NULL AND policy_version IS NOT NULL
        AND request_id IS NOT NULL AND submitted_at IS NOT NULL)
  )
```

## checklists

탐조 단위·현재 검토상태·좌표·기존 API 호환 투영.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `checklist_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `site_id` | TEXT | 예 | 없음 | `REFERENCES sites(site_id) ON DELETE RESTRICT` |
| `raw_id` | TEXT | 아니오 | 없음 | `NOT NULL UNIQUE REFERENCES raw_submissions(raw_id) ON DELETE RESTRICT` |
| `source_type` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (source_type IN ('legacy_reports','native'))` |
| `source_id` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `record_mode` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (record_mode IN ('legacy_report','quick_report','complete_checklist'))` |
| `status` | TEXT | 아니오 | 'pending' | `NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected'))` |
| `observation_date` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `start_time` | TEXT | 예 | 없음 | `추가 없음` |
| `timezone` | TEXT | 예 | 없음 | `추가 없음` |
| `duration_minutes` | REAL | 예 | 없음 | `CHECK (duration_minutes IS NULL OR duration_minutes >= 0) CHECK (duration_minutes IS NULL OR typeof(duration_minutes) IN ('integer','real'))` |
| `distance_m` | REAL | 예 | 없음 | `CHECK (distance_m IS NULL OR distance_m >= 0) CHECK (distance_m IS NULL OR typeof(distance_m) IN ('integer','real'))` |
| `observer_count` | INTEGER | 예 | 없음 | `CHECK (observer_count IS NULL OR (typeof(observer_count)='integer' AND observer_count > 0))` |
| `protocol` | TEXT | 예 | 없음 | `CHECK (protocol IS NULL OR protocol IN ('incidental','stationary','traveling','area','other'))` |
| `complete_list` | INTEGER | 예 | 없음 | `CHECK (complete_list IS NULL OR complete_list IN (0,1))` |
| `actual_lat` | REAL | 아니오 | 없음 | `NOT NULL CHECK (actual_lat BETWEEN -90 AND 90) CHECK (actual_lat IS NULL OR typeof(actual_lat) IN ('integer','real'))` |
| `actual_lon` | REAL | 아니오 | 없음 | `NOT NULL CHECK (actual_lon BETWEEN -180 AND 180) CHECK (actual_lon IS NULL OR typeof(actual_lon) IN ('integer','real'))` |
| `coordinate_uncertainty_m` | REAL | 예 | 없음 | `CHECK (coordinate_uncertainty_m IS NULL OR coordinate_uncertainty_m >= 0) CHECK (coordinate_uncertainty_m IS NULL OR typeof(coordinate_uncertainty_m) IN ('integer','real'))` |
| `approx_lat` | REAL | 예 | 없음 | `CHECK (approx_lat IS NULL OR approx_lat BETWEEN -90 AND 90) CHECK (approx_lat IS NULL OR typeof(approx_lat) IN ('integer','real'))` |
| `approx_lon` | REAL | 예 | 없음 | `CHECK (approx_lon IS NULL OR approx_lon BETWEEN -180 AND 180) CHECK (approx_lon IS NULL OR typeof(approx_lon) IN ('integer','real'))` |
| `public_lat` | REAL | 예 | 없음 | `CHECK (public_lat IS NULL OR public_lat BETWEEN -90 AND 90) CHECK (public_lat IS NULL OR typeof(public_lat) IN ('integer','real'))` |
| `public_lon` | REAL | 예 | 없음 | `CHECK (public_lon IS NULL OR public_lon BETWEEN -180 AND 180) CHECK (public_lon IS NULL OR typeof(public_lon) IN ('integer','real'))` |
| `coordinate_policy` | TEXT | 아니오 | 'actual' | `NOT NULL DEFAULT 'actual' CHECK (coordinate_policy IN ('legacy_fallback','actual','explicit','withheld'))` |
| `pending_public` | INTEGER | 아니오 | 0 | `NOT NULL DEFAULT 0 CHECK (pending_public IN (0,1))` |
| `name_public` | INTEGER | 아니오 | 0 | `NOT NULL DEFAULT 0 CHECK (name_public IN (0,1))` |
| `spot_key` | TEXT | 예 | 없음 | `추가 없음` |
| `species_text` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `shared_bird_count` | INTEGER | 예 | 없음 | `CHECK (shared_bird_count IS NULL OR (typeof(shared_bird_count)='integer' AND shared_bird_count >= 0))` |
| `reporter` | TEXT | 예 | 없음 | `추가 없음` |
| `note` | TEXT | 예 | 없음 | `추가 없음` |
| `admin_note` | TEXT | 예 | 없음 | `추가 없음` |
| `received_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `decided_at` | TEXT | 예 | 없음 | `추가 없음` |
| `compat_ip_hash` | TEXT | 예 | 없음 | `추가 없음` |
| `compat_dedupe_hash` | TEXT | 예 | 없음 | `UNIQUE` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `revision` | INTEGER | 아니오 | 1 | `NOT NULL DEFAULT 1 CHECK (typeof(revision)='integer' AND revision > 0)` |
| `updated_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

복합 제약:

```sql
UNIQUE (source_type,source_id),
CHECK (source_type <> 'legacy_reports' OR
    (record_mode='legacy_report' AND checklist_id=source_id)),
CHECK (record_mode <> 'legacy_report' OR source_type='legacy_reports'),
CHECK (source_type='legacy_reports' OR
    ((approx_lat IS NULL)=(approx_lon IS NULL) AND (public_lat IS NULL)=(public_lon IS NULL))),
CHECK (coordinate_policy <> 'explicit' OR (public_lat IS NOT NULL AND public_lon IS NOT NULL))
```

## sightings

탐조 안의 관찰. 원문·동정 결과·개체수·정확도 분리.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `sighting_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `checklist_id` | TEXT | 아니오 | 없음 | `NOT NULL REFERENCES checklists(checklist_id) ON DELETE RESTRICT` |
| `source_ordinal` | INTEGER | 아니오 | 없음 | `NOT NULL CHECK (typeof(source_ordinal)='integer' AND source_ordinal > 0)` |
| `species_original` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `species_identified` | TEXT | 예 | 없음 | `추가 없음` |
| `interpretation` | TEXT | 아니오 | 'unknown' | `NOT NULL DEFAULT 'unknown' CHECK (interpretation IN ('single','unparsed_multiple','unknown'))` |
| `taxon_id` | TEXT | 예 | 없음 | `REFERENCES taxa(taxon_id) ON DELETE RESTRICT` |
| `count_value` | INTEGER | 예 | 없음 | `CHECK (count_value IS NULL OR (typeof(count_value)='integer' AND count_value >= 0))` |
| `count_accuracy` | TEXT | 아니오 | 'unknown' | `NOT NULL DEFAULT 'unknown' CHECK (count_accuracy IN ('exact','estimated','minimum','unknown'))` |
| `count_source` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (count_source IN ('legacy_single','reported','reviewed','not_recorded','ambiguous_group'))` |
| `interpretation_note` | TEXT | 예 | 없음 | `추가 없음` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `updated_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

복합 제약:

```sql
UNIQUE (checklist_id,source_ordinal),
UNIQUE (checklist_id,sighting_id),
CHECK (count_value IS NOT NULL OR count_accuracy='unknown'),
CHECK (interpretation='single' OR (taxon_id IS NULL AND count_value IS NULL)),
CHECK (count_source <> 'ambiguous_group' OR count_value IS NULL)
```

## reviews

전환 이후 실제 검토 사건을 순서대로 추가.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `review_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `checklist_id` | TEXT | 아니오 | 없음 | `NOT NULL REFERENCES checklists(checklist_id) ON DELETE RESTRICT` |
| `sequence` | INTEGER | 아니오 | 없음 | `NOT NULL CHECK (typeof(sequence)='integer' AND sequence > 0)` |
| `decision` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (decision IN ('submitted','approved','corrected','rejected','unpublished','reapproved'))` |
| `sighting_id` | TEXT | 예 | 없음 | `추가 없음` |
| `validated_taxon_id` | TEXT | 예 | 없음 | `REFERENCES taxa(taxon_id) ON DELETE RESTRICT` |
| `validated_count` | INTEGER | 예 | 없음 | `CHECK (validated_count IS NULL OR (typeof(validated_count)='integer' AND validated_count >= 0))` |
| `validated_count_accuracy` | TEXT | 예 | 없음 | `CHECK (validated_count_accuracy IS NULL OR validated_count_accuracy IN ('exact','estimated','minimum','unknown'))` |
| `from_status` | TEXT | 예 | 없음 | `CHECK (from_status IS NULL OR from_status IN ('pending','approved','rejected'))` |
| `to_status` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (to_status IN ('pending','approved','rejected'))` |
| `actor_id` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `request_id` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `reason_code` | TEXT | 예 | 없음 | `추가 없음` |
| `note` | TEXT | 예 | 없음 | `추가 없음` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

복합 제약:

```sql
UNIQUE (checklist_id,sequence),
UNIQUE (request_id,checklist_id),
FOREIGN KEY (checklist_id,sighting_id) REFERENCES sightings(checklist_id,sighting_id) ON DELETE RESTRICT,
CHECK (sighting_id IS NOT NULL OR (validated_taxon_id IS NULL AND validated_count IS NULL AND validated_count_accuracy IS NULL)),
CHECK (validated_count IS NOT NULL OR validated_count_accuracy IS NULL OR validated_count_accuracy='unknown')
```

## media

관찰별 첨부 메타데이터. 기존 자료에는 생성하지 않음.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `media_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `sighting_id` | TEXT | 아니오 | 없음 | `NOT NULL REFERENCES sightings(sighting_id) ON DELETE RESTRICT` |
| `media_type` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (media_type IN ('photo','audio','video'))` |
| `storage_key` | TEXT | 아니오 | 없음 | `NOT NULL UNIQUE` |
| `checksum` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (length(checksum)=64 AND checksum NOT GLOB '*[^0-9a-f]*')` |
| `photographer` | TEXT | 예 | 없음 | `추가 없음` |
| `captured_at` | TEXT | 예 | 없음 | `추가 없음` |
| `rights` | TEXT | 예 | 없음 | `추가 없음` |
| `visibility` | TEXT | 아니오 | 'private' | `NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public'))` |
| `evidence_flag` | INTEGER | 아니오 | 0 | `NOT NULL DEFAULT 0 CHECK (evidence_flag IN (0,1))` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

## environment_snapshots

관찰 시점에 연결한 관측/예보/모델 자료. 과거 소급 보충 금지.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `snapshot_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `checklist_id` | TEXT | 아니오 | 없음 | `NOT NULL REFERENCES checklists(checklist_id) ON DELETE RESTRICT` |
| `source` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `data_type` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (data_type IN ('observed','forecast','modeled'))` |
| `target_time` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `issued_at` | TEXT | 예 | 없음 | `추가 없음` |
| `retrieved_at` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `station_id` | TEXT | 예 | 없음 | `추가 없음` |
| `temperature_c` | REAL | 예 | 없음 | `CHECK (temperature_c IS NULL OR typeof(temperature_c) IN ('integer','real'))` |
| `wind_direction` | REAL | 예 | 없음 | `CHECK (wind_direction IS NULL OR (wind_direction >= 0 AND wind_direction < 360)) CHECK (wind_direction IS NULL OR typeof(wind_direction) IN ('integer','real'))` |
| `wind_speed` | REAL | 예 | 없음 | `CHECK (wind_speed IS NULL OR wind_speed >= 0) CHECK (wind_speed IS NULL OR typeof(wind_speed) IN ('integer','real'))` |
| `precipitation` | REAL | 예 | 없음 | `CHECK (precipitation IS NULL OR precipitation >= 0) CHECK (precipitation IS NULL OR typeof(precipitation) IN ('integer','real'))` |
| `period_start` | TEXT | 예 | 없음 | `추가 없음` |
| `period_end` | TEXT | 예 | 없음 | `추가 없음` |
| `tide_station_id` | TEXT | 예 | 없음 | `추가 없음` |
| `tide_height_cm` | REAL | 예 | 없음 | `CHECK (tide_height_cm IS NULL OR typeof(tide_height_cm) IN ('integer','real'))` |
| `tide_datum` | TEXT | 예 | 없음 | `추가 없음` |
| `source_lat` | REAL | 예 | 없음 | `CHECK (source_lat IS NULL OR source_lat BETWEEN -90 AND 90) CHECK (source_lat IS NULL OR typeof(source_lat) IN ('integer','real'))` |
| `source_lon` | REAL | 예 | 없음 | `CHECK (source_lon IS NULL OR source_lon BETWEEN -180 AND 180) CHECK (source_lon IS NULL OR typeof(source_lon) IN ('integer','real'))` |
| `source_url` | TEXT | 예 | 없음 | `추가 없음` |
| `variables_json` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (json_valid(variables_json))` |
| `units_json` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (json_valid(units_json))` |
| `quality` | TEXT | 예 | 없음 | `추가 없음` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

복합 제약:

```sql
CHECK ((source_lat IS NULL)=(source_lon IS NULL))
```

## audit_log

전환 이후 변경과 비민감 purge tombstone. 삭제된 대상도 가리킬 수 있어 대상 FK 없음.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `audit_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `actor_id` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `action` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `target_type` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `target_id` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `before_json` | TEXT | 예 | 없음 | `CHECK (before_json IS NULL OR json_valid(before_json))` |
| `after_json` | TEXT | 예 | 없음 | `CHECK (after_json IS NULL OR json_valid(after_json))` |
| `request_id` | TEXT | 아니오 | 없음 | `NOT NULL` |
| `created_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

복합 제약:

```sql
UNIQUE (request_id,action,target_type,target_id),
CHECK (action<>'forbidden_content_purged' OR (target_type='report' AND before_json IS NULL AND after_json IS NULL))
```

## migration_control

두 Worker가 공유하는 쓰기 epoch와 전환 상태. 운영 제어용.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `singleton` | INTEGER | 아니오 | 없음 | `NOT NULL PRIMARY KEY CHECK (singleton=1)` |
| `writer_epoch` | INTEGER | 아니오 | 없음 | `NOT NULL CHECK (typeof(writer_epoch)='integer' AND writer_epoch > 0)` |
| `writer_mode` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (writer_mode IN ('reports_only','pair'))` |
| `guards_enabled` | INTEGER | 아니오 | 없음 | `NOT NULL CHECK (guards_enabled IN (0,1))` |
| `updated_at` | TEXT | 아니오 | 없음 | `NOT NULL` |

## mutation_permits

단일 원자적 batch 안에서만 살아 있는 한 reports 행 쓰기 허가. 업무 이력 저장소가 아님.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `request_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `report_id` | TEXT | 아니오 | 없음 | `NOT NULL UNIQUE` |
| `operation` | TEXT | 아니오 | 없음 | `NOT NULL CHECK (operation IN ('insert','update','delete'))` |
| `writer_epoch` | INTEGER | 아니오 | 없음 | `NOT NULL CHECK (typeof(writer_epoch)='integer' AND writer_epoch > 0)` |
| `before_json` | TEXT | 예 | 없음 | `CHECK (before_json IS NULL OR json_valid(before_json))` |
| `after_json` | TEXT | 예 | 없음 | `CHECK (after_json IS NULL OR json_valid(after_json))` |
| `non_breeding_confirmed` | INTEGER | 예 | 없음 | `CHECK (non_breeding_confirmed IS NULL OR non_breeding_confirmed=1)` |
| `policy_version` | TEXT | 예 | 없음 | `추가 없음` |

복합 제약:

```sql
CHECK ((operation='insert' AND before_json IS NULL AND after_json IS NOT NULL
          AND non_breeding_confirmed IS NOT NULL AND non_breeding_confirmed=1 AND policy_version IS NOT NULL)
      OR (operation='update' AND before_json IS NOT NULL AND after_json IS NOT NULL)
      OR (operation='delete' AND before_json IS NOT NULL AND after_json IS NULL))
```

## migration_assertions

CHECK 실패로 같은 batch 전체를 취소하는 일회성 assertion. 정상 commit 후 0행.

| 컬럼 | 타입 | NULL 허용 | DEFAULT | 열 제약 |
|---|---|---|---|---|
| `assertion_id` | TEXT | 아니오 | 없음 | `NOT NULL PRIMARY KEY` |
| `ok` | INTEGER | 아니오 | 없음 | `NOT NULL CHECK (ok=1)` |

## 의미·입력 검증 계약

- sites의 lat/lon은 기존 탐조지 대표점이다. 관찰 actual 좌표가 아니다. name은 site_name에 그대로 보존한다. province/district/habitat/uncertainty는 근거가 없으면 NULL; site_status는 unknown이다. 원본 객체 전체는 source_record_json에 보존한다. created_at/updated_at은 이 레지스트리 적재 시각이며 과거 개설·수정일을 주장하지 않는다.
- raw_id는 요청서의 submission_id, payload_json은 raw_payload_json에 해당한다. captured_at은 현재 DB의 포착 시각이다. native submitted_at은 실제 수락 시각, submitted_by는 확인 가능한 계정의 불투명 ID이며 없으면 NULL이다. legacy 둘 다 NULL; 기존 received_at은 payload 및 checklist에 따로 그대로 보존한다. schema_version은 payload 해석 규약이고 데이터 표준·migration version과 별개다.
- source_fingerprint는 canonical **논리 JSON**의 SHA-256이다. 저장 문자열 자체의 바이트 SHA가 아니다. runner는 legacy 22키를 schema.sql 순서로 배치하고 키 누락/중복/추가를 거부한 뒤 JSON.parse→같은 ECMAScript JSON.stringify 규칙으로 직렬화한다. 문자열·NULL·배열 순서는 변경하지 않는다. 수를 반올림하거나 좌표를 보정하지 않는다. native는 고정 payload 스키마의 키 순서·중첩 객체 정렬 규칙을 버전으로 고정한다. SQL json_object의 1.0과 JS의 1 차이를 해시 오류로 보지 않도록 양쪽에 같은 canonical 함수를 사용한다. 실제 hash는 보고서/로그로 내보내지 않는다.
- checklist의 received_at/decided_at은 실제 알려진 시각을 보존한다. created_at/updated_at은 새 구조에 생성·변경된 시각이다. revision=1은 migration 후의 초기 상태이며 과거 수정 횟수가 아니다. 원문 메모는 note(요청서 notes), 단일·빠른 입력은 quick_report, 상세 탐조는 complete_checklist, 이전 자료는 legacy_report로 구분한다.
- observation_date는 현 계약의 KST 달력 날짜 그대로다. start_time과 timezone은 입력된 경우 함께 검증한다. 실제 달력 날짜·UTC ISO 형식·시간대·미래일·시각 역전은 엄격한 앱 validator로 검사한다. 문자열 타입만으로 날짜의 의미가 검증됐다고 주장하지 않는다. legacy effort·complete_list·coordinate_uncertainty_m는 NULL이다.
- actual/approx/public은 각각 별개다. 신규 좌표 쌍은 SQL로 강제한다. legacy 부분 쌍은 예외 보존이 가능하나 preflight에서 발견하면 자동수정 없이 전환을 중단한다. 세계 범위 DB CHECK와 현행 API의 국내 범위 검증을 구분한다.
- species_original과 sighting 출처키는 UPDATE trigger로 불변이다. species_identified(정제한 표기), taxon_id, 해석 상태, 개체수 변경은 실제 review/audit를 남긴다. checklist.species_text는 현재 기존 API 표시문이다. legacy 최초 적재에서는 현재 species 문자열을 보존하며 ‘최초 제출 당시 종명’이라고 부르지 않는다.
- count_accuracy=unknown은 정확도를 모른다는 뜻이다. count_value=1과 공존 가능하다. count_value=NULL이면 accuracy는 unknown이어야 한다. 0은 명시적 프로토콜 의미가 승인된 신규 입력에서만 허용하며 이전 과정에서 만들지 않는다. count_source=reviewed는 관리자 수량 정정, legacy_single은 과거 단일 종 수량의 직접 이전이다.
- reviews의 target_type/target_id는 checklist_id와 선택적 sighting_id로 강하게 표현한다. sighting_id가 있으면 그 sighting 검토, 없으면 checklist 상태 검토다. decision=요청서 decision, actor_id=reviewer_id, created_at=reviewed_at, reason_code/note=reason이다. validated_taxon/count는 sighting 검토에서만 쓰며 소속은 복합 FK로 보장한다. 금지자료 확인은 일반 관찰 review를 영구 보존하지 않고 비민감 audit의 purge 사건으로 종결한다.
- taxon_rank는 출처의 rank 문자열을 그대로 보존한다. 한국어명·학명·영문명이 없으면 NULL이다. 동일 source/version 내 parent/accepted를 FK로 제한한다. 순환, accepted 대상의 상태, 출처 진위·라이선스는 importer 검사 대상이다. 출처 레코드 JSON에는 공식 분류 변경의 다대다 관계 근거를 보존할 수 있다.
- media.checksum은 파일 SHA-256, visibility 기본 private, rights 미확인은 NULL이다. 권리·정책·개인정보 검토 전 public 전환을 금지한다. photographer를 name_public 동의 없이 reporter에서 복사하지 않는다. 업로드 EXIF/음성/영상의 위치·번식 내용은 별도 검토한다.
- environment의 snapshot_id는 environment_id에 해당한다. temperature_c=섭씨, wind_direction=북쪽 기준 도(0 이상 360 미만), wind_speed=m/s, precipitation=mm, tide_height_cm=cm이다. 강수 누적 구간은 period_start/end, 조위 기준면은 tide_datum으로 구분한다. 값이 있어도 단위·기준면·기간이 없으면 검증 완료로 취급하지 않는다. source 좌표는 관측소/모델 지점이며 actual 좌표와 동일하다고 가정하지 않는다. 추가 변수는 variables_json/units_json으로 이름·단위를 보존한다.
- 정상 감사 before/after는 허용 필드의 실제 변경값만 private으로 보존한다. 금지자료로 확인되면 기존 민감 감사 사본도 제거한다. purge tombstone은 before/after 둘 다 NULL을 SQL CHECK로 강제한다. 대상에 FK가 없는 것은 삭제된 자료의 비민감 처리를 기억하기 위해서다.
- mutation_permits의 before/after에는 업무 행의 22필드가 일시적으로 들어갈 수 있으나 같은 batch에서 반드시 소비되어 commit 후 0행이어야 한다. 이 값은 로그로 출력하지 않는다. source_fingerprint·dedupe_hash·ip_hash는 서로 다른 목적이며 대체하지 않는다.

## 추가 DB 보호

원자료·reviews·audit·taxa UPDATE 차단, site ID 불변, checklist 출처 불변, sighting 출처/원문 불변 trigger를 제공한다. 보고서 UUID는 운영 guard 초안에서 UPDATE를 차단한다. spot_key는 NULL/다른 reports UUID/fixed 키가 섞인 기존 문자열이므로 억지 FK를 두지 않는다. 출처별 실제 참조 집합 검증과 고아·자기·연쇄 연결 검사는 앱/검증 SQL로 수행한다.

현재 인덱스 목적·선택 근거는 [최종 보고서 E/AA](README.md)에 있다. future D1 검증에서 syntax/pragma 지원, assertion 원자성, trigger/외래키 동작을 확인해야 한다. 이 문서는 실행 성공의 증거가 아니다.
