# Phase 2E Go/No-Go 체크리스트

**현재 NO-GO.** 아래 필수 미충족 항목 중 하나라도 남으면 시작하지 않는다. 실행 담당자·검증 담당자는 모두 운영자 본인이다. `PASS`는 근거가 있는 완료, `BLOCKED`는 구현/증거 부족, `AT CUTOVER`는 지금 수행하면 안 되는 시점 의존 확인이다.

| 조건 | 현재 상태 | GO에 필요한 증거 |
|---|---|---|
| Phase 1/2A/2B/2C 기준·gate 수정 확인 | PASS | 기존 결과물과 현재 control/purge 검토, 원본 hash 보존 |
| 원격 reports code drift 없음 | PASS, 전환 직전 재확인 | GitHub main 비교; 관련 코드 변경이면 `PHASE_2D_NO_GO_CODE_DRIFT`로 중단 |
| Production SELECT preflight | PASS | 새 집계 23/19/4/0, 22컬럼·ledger 없음·Worker ID/binding 확인 |
| 현재 N 하드코딩 없음 | PASS(라이브러리), BLOCKED(운영 실행기) | N=22/24/37 시험; frozen N 전체 원격 경로 증거 |
| 역할 5개 명문화 | PASS | 모두 운영자 본인, 단일 담당 겸임 |
| 시간대·공지 정책 | PASS | KST 02–04, 사전/정상화 공지; 실제 날짜는 미정 |
| 승인한 달력 날짜·중단 시간 | AT CUTOVER | 날짜, KST/UTC, 04:00 전 중단 여유, 공지 기록 |
| 모든 writer/옛 URL 목록 | BLOCKED | preview/version/alias/custom routes/service binding/직접 D1·CI 등 전체 경로 |
| 독립 쓰기 freeze | BLOCKED | 모든 ingress POST 503+Retry-After, GET 유지, 우회 없음; 구 Worker도 차단 |
| 기존 요청 drain | BLOCKED | freeze 전 모든 writer 종료 또는 검증된 취소, 전체 행 digest 안정 보조 증거 |
| frozen snapshot+manifest 도구 | BLOCKED | 검증된 generator/envelope checker, 민감 원문 보관·접근 계획 |
| 최초 additive migration 전용 config | BLOCKED | 0001_core만 pending; 0000/기존 ALTER 재실행 없음 |
| schemaReady 기준 | PASS(정의), AT CUTOVER(실제) | canonical 27객체 hash 일치, reports22필드·FK·ledger 별도검증 |
| site registry | PASS(현재), AT CUTOVER | 190 ID·checksum 일치, 이름 병합/좌표 추정 없음 |
| production seed 실행기 | BLOCKED | 원격 최초 seed·동일 재실행·변경 거절 시험, 바인딩 guard |
| production backfill 실행기 | BLOCKED | 원자 batch, N·22필드 의미 검증, 재실행 0·partial/manifest 변경 거절 |
| 실제 limit/계정 plan | BLOCKED | 구독/실제 실행 경계, SQL·binding 호출·30초/CPU 예산 및 시간 시험 |
| 실제 브라우저 Turnstile | 검증 결과는 execution-evidence 참조 | 정상·재사용·경합 및 CAPTCHA 실패 후 재조회 분기 증거 모두 필요 |
| 두 Worker 배포 순서·동일 schema/binding | BLOCKED | 검증된 maintenance/activation config, old writer 경로 차단과 배포 drain |
| non-breeding UI+강제 전환 | AT CUTOVER | 새 UI request_id/boolean 동작 확인, 구 UI 영향 공지, 강제 전환 승인 |
| 신규 pending 공개 기본값 | BLOCKED — 운영자 결정 필요 | `REPORTS_PENDING_PUBLIC=0/1` 중 명시적 결정; 기존 자료 원값은 그대로 보존 |
| legacy/canonical DTO·shadow 동등성 | AT CUTOVER | frozen 전체자료 기준 경로·total·순서·pagination·동의·spot·좌표 비교 |
| 실계정 Time Travel 범위/bookmark | BLOCKED/AT CUTOVER | 사용 가능한 timestamp/bookmark 직접 확인; 구독 GET은 403 |
| legacy 금지자료 처리 정책 | PASS | 확인된 금지자료는 별도 승인 purge; legacy 무조건 보존 예외 폐기 |
| legacy purge 실제 경로 | BLOCKED | 현재 `PURGE_LEGACY_DECISION_REQUIRED`; 별도 구현·staging 시험 필요 |
| 독립 forbidden ledger+복구 격리 | BLOCKED | D1 복구와 독립된 저장소·접근 책임, 복구 후 재적용/GET 격리 시험 |
| abort/rollback 문서 | PASS(절차), 실행성 BLOCKED | recovery-runbook 및 미구현 freeze/legacy purge 보완 |
| 실제 Production 실행 승인 | 미요청 | Phase 2D 최종 판정과 별개로 Phase 2E 및 각 write 단계 명시적 승인 |

## 즉시 Abort

아래 어느 하나라도 발생하면 다음 write 단계를 실행하지 않는다.

- frozen reports count 또는 전체 source digest/상태/최신 marker 변동.
- freeze 실패, 우회 writer 접근, mixed-version writer 개방 또는 drain 미확인.
- schemaReady false, schema/registry checksum 차이, FK/CHECK 이상.
- manifest 불일치, 부분 backfill 상태, canonical cohort count 불일치, UUID/dedupe 중복.
- shadow mismatch(좌표·이름 공개·species·수량·status·spot·순서·pagination·total 포함).
- peer gate 실패, 일방 release 기대 불일치, CAS·changes assertion 이상 또는 assertions 잔류.
- 실제 HTTP smoke 실패, 예상치 못한 4xx/5xx, Access 인증 흐름 실패.
- 실제 limit 초과, 타임아웃/응답 유실 뒤 commit 상태 미확인.
- 04:00 내 안전 검증·복구 여유 부족 또는 담당자 판단으로 중단.

기본 유지 상태는 **외부 freeze + 두 Worker READ_ONLY_MAINTENANCE + legacy reports 보존**이다. 현 production 구 버전에 maintenance flag만 넣으면 freeze된다는 가정은 금지한다. 금지자료 복구 위험이 있으면 공개 GET도 격리한다. 실패 상태를 NULL/0 보정, UPDATE 덮어쓰기, INSERT OR IGNORE 또는 chunking 즉석 도입으로 통과시키지 않는다.
