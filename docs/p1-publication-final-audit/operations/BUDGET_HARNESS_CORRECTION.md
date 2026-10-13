# 예산 계산 harness 입력 계약 보완

Root 첫 두 실행은 `steady.errors`와 `sampledUnauthorisedDynamic`라는 실제 최종 LOAD_COMPARISON 계약에 없는 필드를 요구해 exit1이었다. 당시에는 중간 복사본이라고 추정한 기록을 남겼으나, 최종 normalize script의 실제 계약은 단수 `steady.error`와 미국식 `sampledUnauthorizedDynamic`다. 이 원인 정정을 별도로 보존한다.

최종 계산은 실제 속성 존재와 `steady.error===0`, `sampledUnauthorizedDynamic===0`를 요구한다. raw cohort의 실제 `phaseRows.steady-foreground.errors===0`를 함께 검사한다. 모든 원형 steady sample에 allowed boolean 및 approved/fields integer를 요구하고, 부적격 샘플에 동적 마커가 있으면 그대로 실패한다. undefined를0으로 채우거나0 판정을 삭제하지 않는다. 제품·시험 성공 assertion·원 요청 timestamp는 변경하지 않았다. 최초 잘못된 필드 계약과 실패 기록은 보존한다.

직전 이 보완 저장은 자동 승인 검토의 사용량 오류로 실행되지 않았다. 2026-10-13 사용자 재개 후 정상 권한 검토를 통해 재실행한다.