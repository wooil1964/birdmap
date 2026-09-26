# 금지자료 Purge · Time Travel Restore Runbook

도구: `reports-api/tools/purge-runner.mjs`, `freeze.mjs`. Ledger DDL: [migrations/ledger/0001_safety_ledger.sql](migrations/ledger/0001_safety_ledger.sql).

## 1. Ledger 저장소 선택

| 기준 | 별도 D1 (선택) | KV | R2 | Git 문서 |
|---|---|---|---|---|
| main restore와 독립 | O (DB별 Time Travel) | O | O | O |
| 일관성 | 강한 일관성(단일 SQLite) | 최종 일관성 | 객체 단위 강함 | 수동 |
| 실수 삭제 방어 | DELETE trigger로 거부(실측) | 없음 | 버전 관리 설정 필요 | 이력은 남지만 공개 저장소 위험 |
| 감사성 | SQL 조회, 상태 전이 제약 | 약함 | 약함 | 좋음 |
| 쓰기 복잡도 | 기존 REST 도구 재사용 | 새 클라이언트 | 새 클라이언트 | 수동 커밋 |
| 접근 통제 | 계정 API 권한 | 동일 | 동일 | 저장소가 공개라 부적합 |

→ 별도 dedicated D1을 쓴다. Production 이름은 `birdmap-safety-ledger`로 한다. 생성 자체가 Phase 2E 작업이며 **USER CONFIRMATION REQUIRED**다.

## 2. Ledger 내용과 민감성

- 컬럼: `purge_event_id`, `source_type`, `source_id`, `reason_code`, `policy_version`, `actor_ref`, `state`, `intent_at`, `purged_at`.
- `source_id`는 report UUID다. legacy는 서버 `crypto.randomUUID()`, native는 클라이언트가 만든 무작위 UUID다. 위치·종·시각 정보가 없으며, restore 뒤 행을 다시 찾는 key로만 쓴다.
- `actor_ref`는 이메일이 아닌 참조값이다(예: `operator-1`).
- 좌표·종·노트·이름·사진·번식 상세·내용 hash는 저장하지 않는다(staging에서 저장 내용을 검사했다).

## 3. Purge protocol (cross-D1 원자성은 가정하지 않음)

1. main이 frozen이어야 한다(`system_state`). 또는 restore 상황처럼 system_state를 믿을 수 없을 때는 ingress barrier가 closed여야 한다. 둘 다 아니면 `NOT_FROZEN`.
2. ledger `intent`를 기록한다(같은 source_id가 이미 있으면 재사용).
3. main에서 멱등 DELETE를 자식부터 수행한다: reviews → sightings → checklists → raw_submissions → 비-tombstone audit → reports. 그다음 tombstone을 조건부 INSERT한다(canonical이 없는 legacy-only DB면 reports만 삭제).
   - 다른 제보가 spot_key로 이 행에 연결돼 있으면 `PURGE_DEPENDENCIES`로 중단한다. 자동 해제하지 않는다.
4. 잔존 0과 tombstone 1을 검증한다.
5. ledger를 `completed`로 바꾼다.

중간에 끊겼을 때:

| 상황 | 결과 | 복구 |
|---|---|---|
| intent만 있음 | `--check`에 intent·잔존으로 나타남 | `--reconcile` |
| 삭제 후 completed 전 | 잔존 0이지만 intent·tombstone 누락 | `--reconcile` |
| ledger 없이 purge만 된 상태 | 순서상 발생하지 않음 | — |

위 복구 경로는 staging에서 검증했다.

## 4. 금지자료 확정 시 purge — USER CONFIRMATION REQUIRED

```
node reports-api/tools/freeze.mjs --freeze ...        # 필요 시
node reports-api/tools/purge-runner.mjs --purge --source-id <UUID> --policy-version forbidden-v1 --actor-ref operator-1 --confirm PURGE_FORBIDDEN_CONTENT --target $T
node reports-api/tools/purge-runner.mjs --check --target $T   # residue_events=0
```

## 5. Time Travel restore SOP

`system_state`도 restore되므로 이것만으로는 쓰기를 막을 수 없다. staging에서 frozen → NORMAL로 되돌아가는 것을 실측했다.

1. **USER CONFIRMATION REQUIRED** — `freeze.mjs --freeze`, 이어서 `--drain`.
2. **USER CONFIRMATION REQUIRED** — hard barrier: 두 Worker의 workers.dev·preview URL을 끈다(API `POST /workers/scripts/<name>/subdomain {enabled:false, previews_enabled:false}` 또는 Dashboard).
   - custom domain과 zone route가 없는지 수동으로 확인한다.
   - public·admin HTTP가 연속 3회 200이 아닐 때까지 기다린다. staging 실측은 약 15초였다.
   - 공개 조회도 함께 차단된다. 이는 의도된 격리다.
3. restore 대상은 가능하면 freeze 이후 bookmark를 쓴다. 그러면 restore 결과도 frozen 상태가 된다.
4. **USER CONFIRMATION REQUIRED** — `wrangler d1 time-travel restore <db> --bookmark <B>`. 사람이 실행할 때는 `--json`을 쓰지 않는다(확인 절차 생략 방지). 출력의 previous_bookmark를 기록한다.
5. barrier가 유지되는지 확인한다(`--check`는 읽기 전용).
6. `purge-runner --check`로 부활한 금지행 수를 확인한다.
7. **USER CONFIRMATION REQUIRED** — `purge-runner --reconcile --confirm PURGE_FORBIDDEN_CONTENT`를 실행한다. restore로 NORMAL이 되었으므로 gate는 ingress_barrier다.
   - 기대: `all_clean`. 재실행 시 repurged 0이어야 한다.
8. tombstone과 audit를 확인하고, `--check`의 residue_events가 0인지 확인한다.
9. **USER CONFIRMATION REQUIRED** — `freeze.mjs --freeze`로 re-freeze한다(restore가 NORMAL을 되살렸을 수 있음). system_state 테이블 자체가 없는 시점으로 restore했다면 0002 설치부터 다시 한다.
10. **USER CONFIRMATION REQUIRED** — ingress를 재개한다. 공개 approved/pending/status와 관리자 목록에 금지 id가 0건인지 확인한다.
11. **USER CONFIRMATION REQUIRED** — unfreeze → reopen smoke test.
    - staging에서는 폐기된 native request_id 재제출이 410, 신규 제보가 201이었다.

## 한계

- 이미 외부에서 받아간 사본, CDN이나 브라우저 캐시(`max-age=60`)는 회수할 수 없다.
- barrier를 켜기 직전에 진입한 in-flight 요청은 restore 뒤 쓰기가 가능할 수 있다. 그런 쓰기는 금지자료가 아닌 일반 제보다. 이 위험은 3번(freeze 이후 bookmark 사용)과 9번(re-freeze)으로 줄인다.
