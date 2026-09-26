# Phase 2D — Production Cutover Readiness

판정: **PHASE 2E PRODUCTION CUTOVER: NO-GO**.

Phase 2D는 readiness 검토와 사람 승인 방식의 runbook 작성이다. Phase 2E는 시작하지 않았다. Production D1·Worker·Access·route·secret·binding·maintenance를 변경하지 않았다. commit/push도 하지 않았다. 현재 앱 소스와 Phase 1/2A/2B/2C 결과물은 보존한다.

## 읽는 순서

1. [Go/No-Go 체크리스트](go-no-go-checklist.md): 미충족 필수 조건과 해소 증거.
2. [운영 전환 runbook](production-cutover-runbook.md): 각 단계의 목적·명령·기대·검증·중단·복귀.
3. [복구 runbook](recovery-runbook.md): 네 수준의 rollback과 금지자료 재노출 방지.
4. [실행 증거](execution-evidence.md): 실측·시험·원본 보존·원격 무변경 검증.
5. [재개 지점](CHECKPOINT.md): 이후 작업은 남은 차단 조건부터 재개.

## 확정한 운영 계획

| 역할 | 담당 |
|---|---|
| Cutover 실행 | 운영자 본인 |
| Production D1 검증 | 운영자 본인 |
| Worker rollback | 운영자 본인 |
| Time Travel 복구 판단 | 운영자 본인 |
| Abort 최종 결정 | 운영자 본인 |

작업 시간은 **KST 02:00~04:00**이며 달력 날짜는 별도 확정한다. 사전 공지는 “탐조지도 조회는 가능하며, 출현종 제보 및 관리자 수정은 일시 중단됩니다”를 기본으로 한다. 정상화 뒤 완료를 공지한다. 실제 공지는 이번 작업에서 발송하지 않았다. 지연 또는 검증 실패 시 중단하고 READ_ONLY_MAINTENANCE를 유지한다. 복구로 금지자료가 돌아올 위험이 있으면 조회도 별도 격리한다.

사용자의 역할·시간·공지 결정은 계획 승인이다. Production 실행 승인은 아니다. 각 production 변경 직전 별도 확인이 필요하다.

## 새로 확인한 사실

- 현재 운영 자료는 다시 계산한 **23건(approved 19, rejected 4, pending 0)**이다. 이 수치는 관측값이고 migration 상수가 아니다. 실제 전환 N은 freeze와 drain 이후 정한다.
- 실제 public 좌표가 모두 NULL이고 승인 19건은 현 API의 실제 좌표 fallback 대상이다. 이번 단계에서 좌표·공개 정책을 바꾸지 않았다.
- 최신 원격 main과 로컬 HEAD 사이 변경은 날씨·조석 JSON 5개뿐이다. reports 관련 원격 code drift는 없다. 기존 로컬 Phase 2B/2C 변경과 구분했다.
- 동적 N=22/24/37 로컬 backfill 검증은 모두 통과했다. 현재 원격 생산용 실행기는 없다. Phase 2C 합성 21건 전용 실행기는 재사용할 수 없다.
- Production 두 Worker 모두 workers.dev와 preview URL이 활성 상태다. 신 Worker의 maintenance 배포만으로 구 Worker 진입 차단·진행 요청 종료를 증명할 수 없다.
- Wrangler 4.137.0의 `d1 migrations list --remote`도 ledger 초기화 CREATE를 할 수 있다. 이번 조사에서는 실행하지 않았다.

## NO-GO의 핵심 이유

1. 모든 production writer와 옛 version/preview 경로를 닫는 독립 freeze 경계 및 drain 관측 수단이 미검증이다.
2. 동적 N frozen snapshot/manifest 생성, 원격 seed/apply/full verify, 응답 유실 재개를 담당할 production 실행기와 전용 config가 없다.
3. 최초 core-only migration의 생산용 구성, 실제 계정 limit/복구 기간, 시간 예산이 확정되지 않았다.
4. 실제 CAPTCHA 경합 분기와 복구 후 금지자료 제거 경로에 미검증 부분이 있다. legacy 금지자료 삭제 정책은 확정했지만 현재 함수는 legacy를 거부한다.

계획과 구현 공백을 구분했다. 없는 도구의 실행 명령을 만들어내거나 staging 시험 통과를 production 준비 완료로 취급하지 않는다. 필수 조건을 해소하고 재판정한 뒤에만 사용자가 Phase 2E를 별도로 승인할 수 있다.

## 설계 기준

Phase 2A 9테이블·114컬럼, Phase 2B legacy 보존·dual-write, Phase 2C 원격 gate 수정이 기준이다. Phase 1의 13테이블·171컬럼 및 별도 migration ledger/permit 설계를 되살리지 않는다. 현재 변경은 검토 문서와 격리 시험뿐이다. legacy 1은 `count_value=1, count_accuracy='unknown'`을 보존하며 NULL/0을 구분한다. 여러 종+공유 수량은 원문과 공유값을 보존하고 종별로 나누지 않는다. site_id·spot_key·동의 원값·좌표·원본 UUID를 임의 수정하지 않는다.

예외 정책: 사후 확인된 금지 번식자료는 legacy라는 이유로 계속 보존하지 않는다. 별도의 명시적 승인과 검증된 purge 절차를 통해 제거한다. 이번 Phase에서 실제 자료를 판정·삭제하지 않았다.
