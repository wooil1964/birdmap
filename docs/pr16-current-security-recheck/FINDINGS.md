# PR #16 과거 보안 실패 — 최신 main 독립 재검증

**판정: PASS. 고정된 현재 소스가 과거 실패 4종과 Chrome 위험 15건을 차단합니다.** 제품 및 운영 환경을 변경한 배포 판정은 아닙니다.

## 기준과 실제 실행 경로

- 고정 main: `399b2f3ac579e365bd48e611465fb5624ce5d9c4`.
- 과거 PR16 제품: `d3efe218ad99f97d8ae6d494031b42e4bdac7ec8`, 보존 head `245298981e27f88ac26bad8b46d819a7df899c86`.
- PR17 통합 제품 `ddc3bc3fb20eec33c47328ac2eb00154865eb377`, 병합 `cb3dd3b2b10752dd59cccec9e0a449eaca48cefb` 이후의 현재 main 보호 계약을 사용했습니다. 과거 PR16을 병합하거나 닫지 않았습니다.
- CI: [38508291864](https://github.com/wooil1964/birdmap/actions/runs/38508291864), 실제 checkout `c85bb595d224300c33738989c8bf1f1184ff50a6`. 이 검증 브랜치의 제품 blob은 고정 main과 같습니다. 변경은 검증 문서·새 합성 하네스·CI 시험 단계뿐입니다.
- 실제 `index.html`의 `publicationHead`, `publicationFetch`, `publicationValidate`, `publicationInvalidate`, `loadApprovedReports`, `loadFieldUpdates`를 Chrome에서 실행했습니다. 실제 `public.js`·`publication.js`·`field-updates.js`·관리 handler는 Node에서, SQL/transaction/CAS는 실제 local Miniflare/workerd D1에서 실행했습니다. 인증 키/CAPTCHA만 합성 stub입니다.

현재 raw 요청 순번은 공개 권한 증거로 사용하지 않습니다. first-primary 권한 조회 → 개별 nonce/expected epoch·revision → 같은 batch의 권한+자료 snapshot → fresh postflight → 현재 generation/lease 확인이 적용됩니다. 초기 상태는 UNVERIFIED이며 확인 실패·숨김·만료 때 마커·팝업·store·이력·검색·길찾기를 닫습니다.

## 과거 실패 4종별 재현과 결과

| ID | 재현 전제 | 현재 방어와 검증 | 결과 |
|---|---|---|---|
| V03 가림 후 과거 승인 응답 | 정상 정확 위치 공개를 먼저 확인. 실제 관리자 hide CAS 뒤 더 나중 요청에 이전 unhidden 자료를 주입 | 실제 새 서버 snapshot의 locationHidden과 증가한 revision 확인. 옛 payload의 nonce를 **현재 요청과 일치시킨 뒤에도** 옛 revision을 거절. 정확 마커·검색 좌표·카카오/티맵 복구 없음 | 5/5 PASS |
| V04 철회 후 과거 승인 응답 | 정상 공개 확인 → 실제 관리자 unpublish → 현재 목록 제외 → 후속 과거 approved 응답 | 원자 SQL snapshot과 fresh postflight, 현재 generation/authority. 마커·검색·두 길찾기 복구 없음 | 5/5 PASS |
| V05 다른 기기 삭제 후 과거 현장 응답 | 사용자 페이지가 삭제하지 않아 tombstone 없는 상태. 다른 actor의 실제 삭제 handler 뒤 후속 과거 field 응답 | 서버 row revision CAS·deleted terminal + 같은 publication gate. 마커·store·정확 좌표 복구 없음. 활성 GPS/선택창 경합은 기존 Chrome 관련 회귀에 별도 연결 | 5/5 PASS |
| V06 새 페이지에서 과거 최초 응답 | 독립 새 Chrome context로 기억/tombstone 없이 시작. 삭제 전 field 응답을 최초 load에 주입 | 초기 미확인과 fresh head/data/postflight. 실제 stale 주입 발생을 확인하고 삭제 복구 없음 | 5/5 PASS |

**원본 VM V06의 삭제+가림 복합 전제도 별도 5/5 PASS로 보충했습니다.** 두 항목의 정상 공개와 실제 카카오/티맵 선택창을 확인한 뒤, 실제 field 삭제 handler와 로컬 privileged fixture SQL CAS로 보호 전환을 적용했습니다. 이 SQL은 새 제품 API/정책 구현이 아닙니다. 새 context에서 tombstone 없이 old payload가 주입돼도 삭제 마커·가림 전 정확 좌표·실제 `#fieldNavChoice`·길찾기가 복구되지 않습니다. 정상 snapshot 도착 시 보호 상태만 복구되고 삭제 항목은 계속 제외됩니다. 이 5건은 **로컬 추가 시험이며 CI에는 미실행**입니다.

원형 V03의 ‘대략 마커를 반드시 유지’ 기대는 현재 승인된 PR17 fail-closed 계약과 구분했습니다. 불신 응답에서는 모든 동적 표시를 닫는 것도 현재 안전 결과이며, 검증된 정상 보호 snapshot이 오면 다시 표시할 수 있습니다. 과거 assertion·원장은 수정하지 않았습니다.

## Chrome 위험 15건 개별 원장

과거 원장은 3종×5폭 **15 unsafe**였습니다. 아래는 각각 별도 ID/width로 재실행한 실제 native 연결 결과이며, CI에서도 같은 15개를 확인했습니다. V05는 과거 Chrome15에 없으므로 별도 시험했습니다.

| 번호 | 폭(px) | 과거 Chrome ID | 현재 ID | 로컬 | CI |
|---:|---:|---|---|---|---|
| 1 | 344 | approved-later-request-stale-server-cache | V04 | PASS | PASS |
| 2 | 344 | approved-later-request-old-cache-unhides-route | V03 | PASS | PASS |
| 3 | 344 | refresh-deleted-tombstone-lost | V06 | PASS | PASS |
| 4 | 375 | approved-later-request-stale-server-cache | V04 | PASS | PASS |
| 5 | 375 | approved-later-request-old-cache-unhides-route | V03 | PASS | PASS |
| 6 | 375 | refresh-deleted-tombstone-lost | V06 | PASS | PASS |
| 7 | 768 | approved-later-request-stale-server-cache | V04 | PASS | PASS |
| 8 | 768 | approved-later-request-old-cache-unhides-route | V03 | PASS | PASS |
| 9 | 768 | refresh-deleted-tombstone-lost | V06 | PASS | PASS |
| 10 | 1024 | approved-later-request-stale-server-cache | V04 | PASS | PASS |
| 11 | 1024 | approved-later-request-old-cache-unhides-route | V03 | PASS | PASS |
| 12 | 1024 | refresh-deleted-tombstone-lost | V06 | PASS | PASS |
| 13 | 1440 | approved-later-request-stale-server-cache | V04 | PASS | PASS |
| 14 | 1440 | approved-later-request-old-cache-unhides-route | V03 | PASS | PASS |
| 15 | 1440 | refresh-deleted-tombstone-lost | V06 | PASS | PASS |

이 15건은 네 종류×5폭 20건의 부분집합이고, 20건은 native 연결 30건의 부분집합입니다. 서로 더해 새 시험 건수로 보고하지 않았습니다.

## PASS / FAIL / SKIP / 미실행 집계

| 범위 | PASS | FAIL | SKIP | 미실행 |
|---|---:|---:|---:|---:|
| 로컬 표적 서버·native fence/CAS·권한 함수 | 153 | 0 | 0 | 0 |
| 로컬 기존 Chrome publication 회귀 | 242 | 0 | 0 | 0 |
| 로컬 실제 제품 API + native D1 + Chrome | 30 | 0 | 0 | 0 |
| 로컬 V06 복합 추가 | 5 | 0 | 0 | 0 |
| 기존 위험15 별도 subset | 15 | 0 | 0 | 0 |
| 새 CI 자동 전체 회귀 | 856 | 0 | 1 | 0 |
| 새 CI publication Chrome / reporter Chrome | 242 / 65 | 0 | 0 | 0 |
| 새 CI native fence / CAS | 13 / 10 | 0 | 0 | 0 |
| 새 CI native 연결 | 30 | 0 | 0 | 0 |
| V06 복합 추가의 CI 실행 | 0 | 0 | 0 | 5 |

로컬 독립 완료 조건은 **153+242+30+5=430 PASS**입니다. CI856을 로컬에 복사하거나 subset15/20을 다시 합산하지 않았습니다. CI skip1은 공식 조석 표본이 rolling 월 범위 밖인 기존 조건입니다.

추가 guard10건(5폭씩)은 **old nonce 실제 불일치**와 **자료 수신 이후 실제 권한 변경을 fresh postflight에서 발견**한 경우입니다. 단순히 구 raw DTO에 contract가 없어 실패한 것만으로 안전 통과를 선언하지 않았습니다. Node 실제 함수·기존 Chrome의 활성 GPS/수동 GPS/선택창/만료·hidden·재접속 회귀는 server/FINDINGS.md와 chrome-current 원장에서 확인할 수 있습니다. native30만으로 실제 GPS 활성 경합 전체를 증명했다고 주장하지 않습니다.

## 원본 보존과 하네스 실패 분류

원형 원장 SHA256은 재확인 후 동일합니다.
- `security_variants.json`: `df0e7aeaacd5bb3213fa4f384ddb712397988a78eec05c460cd795535de1c728`
- `location_chrome.json`: `d23deca98cc20ba9e644535334fed6a5bb43e239c15d527574cf2446d9d286d5`

초기 prototype의 합성 제보가 중복 위치/종/관찰일 계약에 걸려 18건은 setup409로 실패했습니다. 최초 V06은 preset 덮어쓰기로 old payload가 실제 주입되지 않았으므로 그 PASS는 유효 보안 증거에서 제외했습니다. 서로 다른 합성 위치와 **주입 발생을 assertion으로 확인하는 하네스**로 바로잡았습니다. 원본 script/log/JSON/CLASSIFICATION을 모두 보존했습니다.

V06 복합 첫 실행5 FAIL은 `D1.meta.changes=1`이라는 하네스 전제 때문입니다. 실제 field UPDATE와 publication trigger의 changes는2였습니다. SQL의 CAS 조건을 그대로 두고 row revision old+1, 가림 flag와 두 대략 좌표를 전수 검사했으며 원 실패를 보존했습니다. 현재 제품 결함으로 오인하거나 실패 기대값을 삭제하지 않았습니다.

로컬 Windows CRLF와 CI LF의 raw HTML SHA256은 다릅니다. Git blob과 LF 정규화 결과가 동일함을 별도로 입증했습니다. EOL/Unicode 경로·reporter 파싱 수집기 문제는 최초 파일을 덮어쓰지 않고 정정 원장을 추가했습니다.

## SHA와 결과 증거

- 현재 main 자체에는 기존 보안 CI 실행이 없었고 Pages CI만 있었습니다. 가장 가까운 이전 PR23 CI checkout `eeffb675a790aedd9beb4857a274f542094aace4`의 주요28개 blob은 같습니다. 이를 exact399 CI로 과장하지 않았습니다.
- 새 검증 CI는 exact `c85bb595d224300c33738989c8bf1f1184ff50a6`에서 22/22 단계 성공했습니다. 실제 job 로그·artifact의 native30/20/15 개별 행과 로컬 결과를 독립 대조했습니다.
- `FINAL_MANIFEST.json`, `ORIGINAL_15_FINAL_LEDGER.json`, `LOCAL_SOURCE_AND_RESULTS.json`, `ci-fresh/FRESH_CI_REPORT.md`에 source·명령·exit·로그/입력 해시를 저장했습니다.
- 본 결과는 고정399 소스와 합성 로컬 환경에 대한 판정입니다. 실제 운영 Worker·Pages·D1·실사용자 행 검증 및 변경은 **미실행**이고, 물리 GPS·외부 지도 앱·실제 SSO·Cloudflare POP 분산 일관성도 **미실행**입니다. 이를 PASS로 세지 않았습니다.

**PR16 open Draft/head2452989 유지. 제품·main·운영 변경 0, 필수 과거 보안 재현의 현재 실패 0.** 새 검증 브랜치의 하네스/문서/CI 시험만 보존하며 PR16 병합·닫기는 하지 않습니다.
