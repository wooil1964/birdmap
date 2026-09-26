# Freeze · Drain · Unfreeze Runbook

staging에서 검증을 마친 절차다. Production에서 실행하는 것은 Phase 2E에서 사용자 확인을 받은 뒤다. **Production에서는 아래의 모든 쓰기 단계가 Production D1 write다.**

공통: `$T`는 target JSON이다. Production target은 `environment:"production"`이며, 쓰기에는 `PHASE2E_PRODUCTION_WRITE_APPROVED=b48201cc-0abd-4a64-bb61-9dd2a7813d21` 환경변수가 필요하다. 이 변수는 해당 명령에만 붙이고, 셸 세션 전체에 남기지 않는다.

## 0. 선행 조건 (한 번만)

1. **USER CONFIRMATION REQUIRED** — [0002_system_state.sql](migrations/0002_system_state.sql)을 설치한다(추가형 DDL, mode NORMAL). 설치해도 기존 쓰기는 그대로 동작한다. staging에서는 `d1 migrations apply`로 적용했다.
2. **USER CONFIRMATION REQUIRED** — freeze보다 **먼저** 새 빌드를 NORMAL 모드로 배포한다. 그래야 frozen 응답이 503 WRITE_MAINTENANCE + Retry-After 60이 된다. 배포하지 않아도 구 빌드는 쓰기 0이지만 응답이 409/500으로 나간다.
3. `node reports-api/tools/freeze.mjs --status --target $T` 결과가 다음과 같아야 한다: `gate.present=true`, `state.mode=NORMAL`. gate fingerprint를 기록해 둔다(staging 값은 `e9f55bcf…`).

## 1. Freeze — USER CONFIRMATION REQUIRED

```
node reports-api/tools/freeze.mjs --freeze --reason "<사유>" --confirm FREEZE_WRITES --target $T
```

- 기대: `changes=1`, `state.mode=READ_ONLY_MAINTENANCE`, `generation=G`, `snapshot{count,max_received_at,max_decided_at,digest}`. 이 snapshot은 freeze와 같은 batch에서 읽은 frozen 상태다. G와 snapshot을 기록한다.
- `TRANSITION_NOT_APPLIED`가 나오면 이미 frozen이거나 상태를 알 수 없다는 뜻이다. `--status`로 확인하기 전에는 진행하지 않는다.
- `GATE_MISSING`이 나오면 trigger가 없거나 변경된 것이다. Abort.

## 2. Drain

```
node reports-api/tools/freeze.mjs --drain --generation G --rounds 4 --interval 20 --target $T
```

`drained:true`의 조건:
- 모든 라운드에서 mode가 frozen이고 generation이 G다.
- gate trigger 4개가 존재하고 fingerprint가 같다.
- reports digest와 canonical digest가 같다.

`drained:false`(exit 2)이면 Abort한다. 대기 시간은 보조 증거이고, 판단 근거는 trigger 직렬화다.

## 3. 공개 확인 (읽기)

- 공개 GET `/reports/approved` → 200
- `POST /reports` → 503 WRITE_MAINTENANCE, Retry-After 60
- 관리자 GET → 200

## 4. Unfreeze — USER CONFIRMATION REQUIRED

```
node reports-api/tools/freeze.mjs --unfreeze --reason "<사유>" --confirm UNFREEZE_WRITES --target $T
```

기대: `changes=1`, mode NORMAL, generation G+1.

## 5. Reopen smoke test

1. 운영자가 합성이 아닌 정상 경로로 제보 1건을 보낸다 → 201. 해당 건은 운영 정책에 따라 즉시 반려하거나 폐기한다.
2. 관리자 consent 같은 무해한 action 1건 → 200.
3. 공개 GET 200을 확인한다.
4. 실패하면 **즉시 다시 freeze**하고 원인을 조사한다.

## 관측된 경합 동작 (staging 5라운드)

freeze commit보다 먼저 직렬화된 쓰기만 남는다. 이후 요청은 모두 503을 받는다. 최종 상태는 freeze 순간 snapshot과 같다.
