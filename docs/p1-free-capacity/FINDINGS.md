# Workers Free 보완 — 진행 중 독립 검증

**현재 판정: 운영 보류. 최종 재검증 진행 중.**
기준 제품c025d75, 첫 서버f87b9a8, 클라이언트9b4555a, primary 보완5c03d3b, 복구 보완 현재제품 `3d42910cb0cea8a5e79c2d57d068c91b86b18332`.

## 검증된 사실

- 실제 native workerd: HEAD cold103/warm23. approved/recent224→144, pending104→24, field140→60, history285→205, contributors227→147. 모든 요청은 guard22를 실측하며 쓰기0. cold burst10/20는 각각103 한 번+warm9/19번이었으나 운영 cold 빈도 증거가 아니다.
- 새 primary session 복구: 수정 전 합성2시험 실패, 수정 후 publication72/72. 독립 native15/15에서 HEAD session621→622, payload623→624와 statement session 일치. 같은 session에서 두 번째 query가 primary라는 초기 설계 가정을 제거했다.
- 9b 독립 자동734 pass/0 fail/1 skip. 5c의 영향받은 API253/253 새 실행과 unchanged 비API483 합계736/0/1은 영향 검증이며 최종전체 재실행 수치로 과장하지 않는다. 새3d 프런트 회귀는 실행 중.
- S2 182/182·특별21/21·popup12/12·freshHEAD20/20. S1-R171 누락0/일반17오탐0. 고정2026-10-08 22:40의190곳176후보 ON/OFF signature와75추천/P0/S2함수 및4정적 길찾기함수 동일.
- 5c+latestmain076 임시 merge-tree b447965381cfe1c7f6b7ed9094feda096cce74ba 충돌0, 자동6JSON 보존. 3d 결합 재확인은 대기.

## 실패와 보완

9b 실제 Chrome10/20 부하17pass/1fail. 20명 중4명은 현장소식 주기 조회가 권한 변경을 먼저 발견했고 승인 목록을 지운 뒤 field만 정상복구했다. 이후ready=true로 HEAD만 갱신해 approved0/field1/allowedtrue가6.5초 유지됐다. 보호 실패 노출은 표본0이나 정상복구 결함이다. 3d는 needsRefresh로 전체4목록 복구 요구를 유지한다. 실제 수정 후 Chrome 결과는 아직 통과로 처리하지 않는다.

9b/5c 동일index의 잠정 steady 계측10명168요청(HEAD158/field10),20명332(HEAD312/field20). initial2초90/180으로9요청/user, 초기approved는2회/user가 남았다. 잠정 수치는 실패한cohort와 연결돼 있어 최종보안 승인 모형으로 사용하지 않는다. 수정 후 동일조건 재측정 중이다.

기존 부하 하네스 cold alias 실패, 초기 ENOENT/잘못된 파일명, latestmain weather2-only 전제 실패는 setup/하네스 계약 실패 원형을 보존하고 제품 안전 결함과 구분한다. 자동승인 검토에서 기존 예상읽기23 사전변경 거절은 실행되지 않았으며 새 actual observation으로 측정했다.

## 별도 미해결 및 금지

10/12 고정 자료 현재날짜 validator는 Batch date mismatch exit1. 최신main의 실제10/13 배치 today/week0/0·자정/갱신48/48은 별도 입력 증거다. 날짜 검사 삭제/JSON 날짜 수정/운영 갱신 실행은 없다.

기존 active Worker494b97 source에는 새S1-R/B6/publication 방어가 없다는 저장 감사 근거가 있다. 합성 표현 누락과 과거cache 재노출 가능성을 코드 위험으로 유지하지만 실제 사고나 민감행 존재·열람을 단정하지 않는다. 기존활성버전 안전rollback 승인 없음.

20명8시간은5초HEAD만115200회, 선택4.75초 약121264회로 Worker Free를 넘는다. 최종모형은 실제수정후Chrome비용+기존계정수요+10분타이머+상호작용/cold/지연을 구분한다. 이 최소안으로20명8h 운영승인을 요청하지 않는다.

main·기존PR13/16/17 head·Worker 업로드/활성화·Pages·운영D1·실사용자자료·요금제 변경0. 별도branch만commit/push. 세부실행은server/client/integration 원장과 NEXT_SESSION.md에 기록한다.
