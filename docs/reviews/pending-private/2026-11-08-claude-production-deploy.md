# 승인 전 제보 좌표 비공개 — 운영 배포 기록 (2026-11-08, Claude)

## 1. 작업 목적

PR #78(Codex #77 포함)의 보안 수정을 운영에 반영한다. 순서는 공개 Worker 먼저, 그다음 main 병합(Pages 자동 배포)이다.

## 2. 배포 전 점검 (01:24~01:27 UTC)

| 항목 | 결과 |
|---|---|
| PR #78 HEAD | `29154224c18d14fd7c6277f1ad681ceb872bad8c` (승인 SHA와 일치) |
| CI | `regression` 성공, `gps-browser` 성공 (run 42431018748) |
| main 충돌 | 없음 (`git merge-tree`, GitHub `mergeable_state=clean`) |
| 운영 공개 Worker | `b81169aa-9af6-4c21-9bc4-b994ddf305af` 100% (PR #76 v2) |
| 새 버전과의 설정 차이 | `REPORTS_PENDING_PUBLIC` "1"→"0"만 다름. D1 `b48201cc…`, 서비스 `birdmap-reports-admin`, 호환일 2026-07-03, 비밀 4개(이름만 확인) 동일 |
| D1 (읽기 전용 SELECT, changes 0) | 승인 133, 반려 22, **대기 0** |
| 마이그레이션 | 없음 (PR에 SQL·마이그레이션 파일 없음) |

wrangler 4.149.0은 `/accounts` 응답이 비어 계정을 찾지 못했다. 그래서 memberships 조회로 `birdmap-reports`를 가진 계정을 확인하고, 그 ID를 `CLOUDFLARE_ACCOUNT_ID`로 넘겼다. 계정 ID는 출력하지 않았다.

## 3. Worker 배포

| 시각 (UTC) | 동작 | 결과 |
|---|---|---|
| 01:27 | `versions upload` 새 버전 (tag `pw-2915422`) | `ce1a9af3-c467-4da7-a7a2-81386a41bdac` |
| 01:28 | `versions upload` 긴급 차단판 (`--var REPORTS_PUBLIC_READS_CLOSED:true`, tag `pw-closed-2915422`) | `f7454270-eb55-40ff-9565-8d9e777e6dec` (ce1a9af3과의 차이는 READS_CLOSED 하나뿐) |
| 01:28 | `b81169aa@100% + ce1a9af3@0%` | 버전 지정 헤더로 0% 검증 |
| 01:29:1x | `ce1a9af3@100% + f7454270@0%` | **운영 적용** |

0% 검증 결과 (`Cloudflare-Workers-Version-Overrides`):
- projection `nonbreeding-location-v2-pending-withheld-v1`
- 승인 마커 131개의 (id, 위도, 경도, 가림, approximate) 집합, 응답 키, 검색 5종, 최근 탐조지가 배포 전과 완전히 같음
- pending 0

## 4. main 병합과 Pages

- 01:29:34 PR #78을 merge commit으로 병합: **`b2fe508f723dba94df07254fed9366b080dbc363`**
- Pages "pages build and deployment" 성공: run 42434471540. 01:30:40에 운영 `index.html`의 계약 식별자가 새 값인 것을 확인했다.
- Worker 적용부터 Pages 반영까지 약 1분 30초. 이 동안 예전 화면은 계약 불일치로 승인 마커를 닫는다(fail closed).

## 5. 운영 API 검증 (01:34 UTC, 배포 전 01:27과 비교)

| 항목 | 배포 전 | 배포 후 |
|---|---|---|
| projection | nonbreeding-location-v2 | nonbreeding-location-v2-pending-withheld-v1 |
| 승인 마커 수 / 위치 가림 | 131 / 4 | 131 / 4 |
| 승인 좌표 집합 | — | **동일** |
| 검색 '매' | 15건, 15건 모두 이동 대상 있음 | 동일 (서명 일치) |
| 최근 탐조지 30일 | 21 | 동일 (서명 일치) |
| `GET /reports/pending` | 0 | 0, 좌표 없음 |
| 없는 접수 번호 상태 조회 | 404 | 404, 좌표 없음 |

승인 133건 중 마커는 131개다. 나머지 2건은 v2에 따라 숨겨지는 행이다(PR #76 때 확인한 구조).

## 6. 운영 사이트 검증 (내장 브라우저, PC 1280×800 · 모바일 375×812 Android UA)

| 항목 | 결과 |
|---|---|
| 승인 마커 | 131개 표시, 검색 색인 131 |
| 대기(황색) 마커 | 0 |
| 위치 가림 4건 | 대략 위치 안내만 표시, 길찾기·GPS 버튼 없음 |
| 카카오맵 | 클릭 → `map.kakao.com/link/to/출현 지점,36.686938,126.455077` (마커 공개 좌표와 같음) |
| T맵 | PC에서는 앱 주소를 열지 않음(설계대로). 모바일 경로는 같은 함수로 만든 `tmap://route?…goalx=126.455077&goaly=36.686938`을 확인 |
| GPS | 가짜 위치(36.70, 126.50)로 "내 위치 찾기" → 파란 점선과 "직선거리 4.26 km" 표시 (계산값과 같음) |
| 출현종 검색 '매' | 15건 (API와 같음) |
| 탐조지 검색 '호미곶' | 결과 1건 정상 |

콘솔 오류 `Invalid LatLng (NaN, NaN)`과 `publication context changed`는 숨겨진 창(지도 크기 0)에서 팝업을 열거나 창 크기 전환·새로고침을 하다 생긴 것이다. 크기를 지정한 뒤에는 다시 나오지 않았다. `publicationNotice`의 차단 안내문은 `display:none` 상태의 정적 문구였다.

## 7. 수행하지 않은 것 (미확인)

- **신규 제보 접수와 관리자 승인을 운영에서 실제로 해 보지 않았다.** 운영 D1에 시험 기록을 넣지 않기 위해서다. 이 흐름은 단위 시험(서버 387건)과 0% 검증으로 확인했다.
- 실기기 GPS·T맵 앱 실행, 운영 관리자 화면.
- **관리자 Worker는 배포하지 않았다**(승인 범위 밖). 지금 관리자 Worker는 대기 제보에 `pending_public=1`을 쓸 수 있다. 하지만 새 공개 Worker는 이 값을 읽지 않으므로 좌표는 노출되지 않는다.

## 8. 복구 기준 (변경됨)

- **`b81169aa`와 `a174e570` 이하로는 절대 되돌리지 않는다**(대기 좌표 노출). 인자 없는 `wrangler rollback`과 `wrangler deploy`도 금지.
- 장애가 나면: `versions deploy f7454270-eb55-40ff-9565-8d9e777e6dec@100%`로 새 코드 긴급 차단(공개 읽기 503, 접수·상태 조회만 열림). 승인 마커 표시도 멈춘다.
- 복원 대상: `ce1a9af3` 또는 고친 새 버전.
- Pages에 문제가 생기면: 머지 커밋을 revert한다. 예전 화면 + 새 Worker가 되어 승인 마커만 닫히고 노출은 없다. 가능하면 revert보다 고쳐서 다시 배포한다.

## 9. PR 정리

PR #77: 댓글로 "#78에 포함되어 병합됨"을 남기고 닫았다. #78 병합 순간(01:29:35) #77의 헤드 커밋이 main에 들어가, GitHub가 #77을 자동으로 merged 상태로 표시했다. main에 추가 병합 커밋은 없다(`b2fe508`이 최신).
