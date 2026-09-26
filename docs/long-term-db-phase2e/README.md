# Phase 2E — Production Cutover

**FINAL EXECUTION GATE: READY** (2026-09-27 KST 점검). Production 변경 0, push 0. 실행하려면 운영자의 "Phase 2E 실행 승인"이 필요하다.

## 운영자 결정 (2026-09-27)

1. **`REPORTS_PENDING_PUBLIC=1`**
   - production에 기존 값은 없었다. legacy는 번식 키워드와 지정 19종에 해당하면 비공개로 하는 규칙을 썼다.
   - 이 결정은 비번식 확인을 거친 신규 대기 제보의 대략 좌표 마커를 공개하는 정책 변경이다. 운영자가 명시적으로 결정했다.
   - 기존 23건의 원값은 보존한다.
2. **프론트엔드 자동 전환**
   - index.html이 `/reports/capabilities`를 보고 새 제출 형식(비번식 확인·request_id)을 켠다.
   - legacy Worker에서는 이 경로가 404라서 기존 형식을 유지한다. 하위 호환된다.

## 알아야 할 순서 조건 — push

- 새 index.html은 GitHub Pages(main push)로 배포된다. push는 별도 승인 사항이다.
- **push를 먼저 하면**(권장): cutover 순간부터 제보 중단 없이 새 형식으로 넘어가고, runbook step 15의 제보 smoke를 그대로 실행할 수 있다.
- **push 없이 실행하면**: reopen 뒤 실서비스 제보는 push 전까지 400으로 거부된다. 저장은 되지 않는 안전한 실패다. step 15의 제출 smoke는 push 뒤로 미뤄진다.
- push는 merge가 필요하다. 원격 main에 자동 JSON 커밋 17개가 더 있다. push하면 `update-weather` 워크플로와 Pages 재배포가 일어나고, Worker 자동 배포는 없다.

## 문서

- [cutover-runbook.md](cutover-runbook.md): 확정 명령, 통과 기준, abort·rollback, critical path
- [execution-evidence.md](execution-evidence.md): preflight 실측, 분석, 시험, 공식 문서
- [CHECKPOINT.md](CHECKPOINT.md), [CUTOVER-LOG.md](CUTOVER-LOG.md), [FINAL-STATE.md](FINAL-STATE.md), [rollback-evidence.md](rollback-evidence.md)
