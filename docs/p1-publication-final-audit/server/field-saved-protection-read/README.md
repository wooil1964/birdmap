# B6: 저장된 보호 현장소식 공개 좌표 — 독립 workerd 검증

기준 제품 SHA `7f493b1c60bc6002465a44d4ced39ac129afbba7`, 수정 SHA `c025d75f964ab36f6f2eae541a99461f6de59b70`. 제품 편집·운영 API·운영 D1·실사용자 자료 조회는 하지 않았다. D1은 Miniflare 실제 workerd의 임시 합성 데이터베이스다. 운영 사전 점검의 사용자 정의 DDL 48개만 복제했고 값은 모두 새 합성 값이다.

## 수정 전 보안 실패

`repro.mjs`는 동일한 9행 fixture로 실제 `handleRequest`의 nonce preflight → publication-v1 `/field-updates` → postflight를 호출한다. 모두 현재 epoch/revision이며 no-store다. `저어새1`, `흰꼬리수리1`, `매1`을 `location_hidden=0`, public/private 좌표 동일 상태로 저장하면 새 `isSensitiveReport`는 보호종을 정확하게 판정하지만 이전 `publicEntry`가 정확 좌표를 공개했다. 실제 프런트 `fieldGuardIncoming`, `fieldPublicPoint`, `fieldGuideTarget`, 카카오맵·티맵 URL 함수도 허용했다. 7f 결과는 **10 pass / 3 fail / 0 skip, exit 1**이다. 이 실패 원장은 보존했다.

원자 migration의 write freeze는 과거 형식 INSERT를 차단했다. 합성 fixture에서 명시적으로 thaw한 뒤 같은 형식 INSERT가 성공했다. 실제 구버전 Worker 요청이나 운영 지연 쓰기가 발생했다는 증거는 없으며 운영 유출 사고를 단정하지 않는다. 그러나 새 서버의 현재·검증된 읽기 자체가 보호종 좌표를 공개하는 직접 실패는 확인했다.

## 최소 수정 독립 검토

c025는 saved species를 기존 S1-R 분류 함수로 재판정한다. 저장 hidden이 없거나 같은 SQL snapshot에서 기존 공개점이 private 점과 다르다는 boolean 증거가 없으면 `locationHidden=true`, `lat/lon=null`을 반환한다. 기존 hidden+다른 공개점은 고정된 참고점을 유지하며 길찾기를 금지한다. private lat/lon은 SQL 비교에만 사용되고 SELECT/DTO에는 포함되지 않는다. 새 무작위 점을 읽기마다 만들거나 공개 ID를 seed로 좌표를 만들지 않는다.

동일 원형 `repro.mjs`를 수정 후 실행한 결과는 **13 pass / 0 fail / 0 skip, exit 0**이다. 실패 assertion을 삭제하거나 완화하지 않았다. `SOURCE_BLOBS.json`에서 index/shared/공개 라우터/migration/schema 등 제품 출처의 변화 범위를 확인한다.

이는 현재 현장소식의 기존 ‘보호종이면 정확 좌표와 길찾기 제한’ 계약을 저장자료 읽기에서도 유지하는 S1-R 보완이다. 관리자 승인 reports 전체를 비공개로 바꾸는 S1-P 정책은 구현하거나 승인하지 않았다. SQL의 다른 점 증거는 기존 `LOCATION_HIDDEN_SQL`과 같은 계약이며 별도의 최소 거리 보장이나 가명 처리 정밀도 정책을 새로 증명한 것은 아니다.

## 확장 검증

`expanded.mjs`는 원형과 별개로 10행 workerd fixture와 actual `publicEntry` 계약 행렬을 추가한다. 결과는 **25 pass / 0 fail / 0 skip, exit 0**이다.

- 보호 flag0 정확점 3행, 일반 5행, hidden1 기존 대략점 1행, hidden1이지만 정확점 1행을 현재 권한 API로 검사한다.
- protected 표현 171개 × 저장 형태 3종 = 513 DTO cell을 실제 `publicEntry`로 검사한다. 보호 누락 0이며 LF/CRLF와 일반종 혼합도 포함한다. 513건을 모두 API/D1 호출한 것으로 보고하지 않는다.
- 일반종 17개 표현의 오탐 0과 정상 정확 좌표 유지.
- 실제 snapshot 결과는 `public_point_masked` 0/1만 가지며 private lat/lon 속성이 없다.
- 모든 GET 전후 합성 행과 권한 상태 hash가 동일하고 revision은 2 → 2다. hash는 `8a1e4f26f524d598d1e3824220f40f880d80a7bdb4e700c8469080b9d74f9ba5`다. 읽기가 운영 데이터나 로컬 원자료를 재분류해서 쓰지 않는다.
- 실제 canonical dual-write capability/schemaReady를 통과한 합성 owner가 hidden1 대략점의 `not_visible` → `reappeared` → `deleted`를 요청한다. 실제 strict receipt HTTP 201/201/200, 좌표 없는 receipt, 대략점 유지/길찾기 폐쇄, 삭제 뒤 목록 부재, terminal 행과 row_revision=4를 확인한다. peer·Turnstile만 합성 모의이며 외부 서비스 호출은 없다.

`API_DTO_FIXTURE.json`은 위 실제 API가 생성한 DTO 10개와 receipt 3개 및 fresh snapshots다. Chrome 독립 agent에 전달했다. `fieldValidUpdate`는 좌표 null 행을 표시하지 않고 길찾기도 차단한다. 이 legacy 행은 화면에서 선택할 마커가 없지만 알려진 ID에 대한 소유권·삭제 API 영수증 경로는 살아 있다. 좌표 없는 legacy 항목의 별도 owner UI는 이번 최소 보안 수정에서 구현하지 않았다.

## 명령·증거와 한계

정확한 argv/입력 SHA/스크립트 SHA-256/exit code는 `RUN_COMMANDS.json`, 세 개의 실제 결과는 해당 디렉터리 `MANIFEST.json`이다. 재현 시 새 output 디렉터리를 사용하며 원본 실패 기록을 덮어쓰지 않는다. 임시 git archive 원형과 synthetic D1은 보존 대상이 아니며 source SHA와 script로 재생할 수 있다.

카카오맵·티맵은 실제 URL 함수를 검증한 것이며 외부 앱이나 물리 GPS를 실행한 결과는 아니다. Chrome DOM은 별도 Chrome agent 원장에서 확인해야 한다. 공개 권한 설계의 다른 실패나 Free 용량 한도가 이 수정으로 해결됐다고 보고하지 않는다. 보안 rollback 후보는 이 saved-data guard를 포함한 source/version으로 다시 증명해야 한다.
