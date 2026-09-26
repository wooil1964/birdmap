# Production-prep Backfill Runner Guide

도구: `reports-api/tools/backfill-runner.mjs`. Worker 쪽 로직: `reports-api/src/canonical/ops.js`. N은 frozen source에서 읽으며 하드코딩하지 않는다.

## 모드

| 모드 | 동작 | DB write |
|---|---|---|
| `--dry-run` | source를 읽고 변환·불변식만 검증. manifest 없음 | 0 |
| `--prepare --run-id ID --out m.json` | frozen을 요구. 전체를 두 번 읽어 변동이 없음을 확인한 뒤 manifest 파일만 생성(`wx`로 만들어 기존 파일을 덮어쓰지 않음) | 0 |
| `--verify-only --manifest m.json` | source와 manifest가 일치하는지, target 상태(READY_EMPTY / VERIFIED / PARTIAL_OR_DRIFT / MANIFEST_OR_PARTIAL_STATE)를 확인 | 0 |
| `--apply --manifest m.json` | verify 통과 → admin ops route → Worker `batch()` 1회 → 사후 verify | canonical만 |

- Production `--apply`에는 `PHASE2E_PRODUCTION_WRITE_APPROVED`가 필요하다. 설정하지 않으면 `PRODUCTION_WRITE_NOT_APPROVED`로 요청 전에 중단한다.
- Production 쓰기 단계는 모두 **USER CONFIRMATION REQUIRED**다.

## Manifest (payload 없음)

필드: `manifest_version`, `database_id`, `run_id`, `generated_at`(= 행 captured_at으로 고정), `source_row_count`, `approved/rejected/pending_count`, `max_received_at`, `max_decided_at`, `source_digest`(22필드 전체 정렬 sha256), `schema_fingerprint`, `site_registry_revision`, `site_registry_checksum`, `site_count`, `transform_version`, `freeze_generation`, `manifest_checksum`.

## 안전 규칙

- Worker는 apply 직전에 같은 invocation에서 source를 다시 읽는다. manifest와 필드 하나라도 다르면 `MANIFEST_MISMATCH`로 중단하며 자동 진행하지 않는다.
- 쓰기 batch의 첫 문장은 assertion이다: `mode=READ_ONLY_MAINTENANCE AND generation=G AND COUNT(reports)=N`. 같은 트랜잭션 안에서 확인하므로, 실패하면 전체가 rollback된다.
- 같은 manifest로 재실행하면 insert 0이고 전체 동등성을 검사한다(VERIFIED).
- partial 상태나 다른 run이면 덮어쓰지 않는다.
- 폐기 ledger나 tombstone에 있는 id가 source에 있으면 `REPORT_PURGED`로 중단한다.
- **다종 + 공유 수량 legacy**(종 구분자가 있고 bird_count가 NOT NULL)는 모든 모드에서 `LEGACY_SHARED_MULTI_SPECIES_COUNT`로 ABORT + REPORT한다. 복사·분배·NULL 변환은 하지 않는다. 운영자 정책 승인 전에는 진행하지 않는다. 현재 production 해당 건수는 0이다(dry-run 실측).
- seed(`/admin/api/ops/seed`)도 frozen과 빈 sites를 같은 batch assertion으로 확인한다. 이미 있으면 동등성만 검사한다.

## 한도

- Worker query는 N과 무관하게 고정 12회이고 쓰기 batch는 1회(3N+3문)다.
- staging에서 N=1000(3,003문) 단일 batch가 6.4초에 성공했다.
- 계정 plan이 확정되지 않았으므로 Phase 2E 직전 frozen N으로 다시 계산한다. N이 1,000을 넘으면 별도 검토 없이 단일 batch를 강행하지 않는다.

## Phase 2E 순서 (요약)

1. freeze + drain
2. core migration (USER CONFIRMATION)
3. seed (USER CONFIRMATION)
4. `--dry-run`
5. `--prepare`
6. `--verify-only`
7. `--apply` (USER CONFIRMATION)
8. `--verify-only` → VERIFIED
