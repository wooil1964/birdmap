# Phase 2E — Production Cutover

**FINAL EXECUTION GATE: NOT READY** (2026-09-27 00:0x KST 점검)

Production 변경 0, commit 0, push 0. 운영자 정책 판단이 필요한 중단 조건 두 가지(§7·§10)가 확인됐다. 그래서 실행 명령 확정과 artifact commit은 하지 않았다. 결정되면 이어서 준비한다.

## 차단 1 — REPORTS_PENDING_PUBLIC (§10)

- Production public Worker에는 `REPORTS_PENDING_PUBLIC`이 **없다**. 바인딩은 ENVIRONMENT, REPORT_IP_SALT, REPORTS_DB, TURNSTILE_SECRET_KEY뿐이다.
- 현재 production(HEAD legacy)의 대기 마커 공개 규칙은 상수가 아니다. `pending_public = isSensitiveReport ? 0 : 1`이다.
  - 메모·종명에 번식 키워드(둥지·번식·포란·육추·새끼·영소)가 있으면 비공개.
  - 또는 **지정 19종**(저어새·두루미·매 등)이면 비공개.
- 새 dual-write 경로는 env 상수 `REPORTS_PENDING_PUBLIC`(0 또는 1)만 쓴다. 이 값이 없으면 준비 상태(ready)가 되지 않는다.
- → "현재 값 그대로 유지"는 불가능하다. 어떤 선택이든 정책 결정이다.
  - `1`: 비번식 확인을 거친 모든 신규 대기 제보의 대략 좌표 마커를 공개한다. 사용자 정책 §1(희귀종이라는 이유만으로 비공개 처리하지 않음)과 방향이 맞지만, 현재 동작과는 다르다.
  - `0`: 모든 신규 대기 제보를 승인 전까지 비공개로 한다.
  - legacy 규칙 유지: 코드 변경이 필요하다. 종 목록 기반 비공개는 §1과 충돌할 수 있다.
- 기존 23건의 pending_public 원값은 어느 경우에도 그대로 보존된다.

## 차단 2 — 실서비스 프론트엔드가 새 제출 형식을 보내지 않음

- GitHub Pages(main)의 `index.html`은 `request_id`와 `non_breeding_confirmed`를 보내지 않는다.
- 작업본 `index.html`(+18줄, 미커밋)에는 새 UI가 있지만 `REPORTS_CANONICAL_UI_ENABLED=false` 상수로 꺼져 있고, `/reports/capabilities`를 보고 자동으로 전환하는 기능도 없다.
- CANONICAL_DUAL_WRITE로 전환하면 실서비스 제보가 **모두 400(NON_BREEDING_CONFIRMATION_REQUIRED)**으로 거부된다. 저장은 되지 않으므로 안전한 실패지만, 제보 기능은 중단된다. 이 상태는 새 index.html이 push될 때까지 이어진다.
- push는 별도 승인 사항이다. 현재 로컬 main은 원격보다 자동 JSON 커밋 17개 뒤라, push 전에 병합이 필요하다.
- push에 `index.html`이 포함되면 `update-weather` 워크플로(자동 JSON 커밋)와 Pages 재배포가 일어난다. Worker 자동 배포는 없다.
- 선택지:
  - (a) cutover 직후 flag=true인 index.html을 push한다(그 사이 제보 중단).
  - (b) UI가 capabilities를 보고 자동 전환하도록 수정한 뒤 cutover 전에 push한다(코드 변경).
  - (c) cutover 전에 flag=true를 push한다. legacy 경로가 새 필드와 수량 0을 어떻게 처리하는지 추가 검증이 필요하다.

## 준비 완료 항목

[execution-evidence.md](execution-evidence.md) 참고. Production 23건(19/4/0), 스키마, Worker version, Time Travel bookmark 확인, 공식 문서 재확인, 비밀정보 검사, push 부작용 조사.
