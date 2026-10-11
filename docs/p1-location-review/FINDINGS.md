# P1 위치 보호 — 최신 main 재적용 및 독립 검증 준비

## 판정과 제출 범위

**독립 검증용 Draft PR 준비 완료. 전면 위치 보호의 운영 승인 판정은 수정 필요.** 삭제·가림을 관측한 같은 페이지에서 이전 요청의 응답 및 늦은 GPS를 막는 핵심 범위는 통과했다. 그러나 더 늦은 요청에 서버가 과거 자료를 반환하거나 새로고침하는 경우까지 해결되지는 않았다. 이 실패를 보존하며 병합·배포하지 않는다.

제품 기준 commit: `d3efe218ad99f97d8ae6d494031b42e4bdac7ec8`.
별도 원격 브랜치: `codex/p1-location-protection-main-20261011`.
문서/최종 PR head는 이후 기록 commit을 포함하므로 NEXT_SESSION.md 및 게시 receipt에서 확인한다.

## 1. 정확한 기준과 최신 main 적합성

- 원 수정: `f27e661c3762d7787f976196ed84eeb8d255c3c7`, parent `b12e20c1b6d856a021898a0c1c9221b30393a221`.
- fetch 후 최신 main: `43bff43301d5915a344bf2c20987698597cf8870`; 제출 전 fetch에서도 동일.
- f27/main 공통 조상: `18171613923ae5cf0a72512eae805c0005037115`.
- f27에는 main의 TMAP(`c361342`) 및 승인 팝업 카카오·티맵 동시 배치(`528337e`)가 없다. f27 전체를 덮어쓰면 이 기능을 잃는다.
- 최신 main의 별도 관리 worktree/새 브랜치에 **f27의 단일 commit diff만** cherry-pick --no-commit했다. 텍스트 충돌 0이며 main에 PR #13 전체를 넣지 않았다.
- 추가 발견한 동일 좌표 가림 전환 팝업 갱신 누락은 fieldMarkerSignature에 locationHidden을 포함하여 보완했다. 원 신규19와 기존 assertions는 유지하고 별도 실제 render 회귀1건을 추가했다.

변경 제품 파일은 index.html뿐이다. 테스트4파일(원 신규19, 새 팝업1, 기존2파일의 새 helper 선언 주입)과 독립 검증 문서/합성 결과를 제출한다. Python·서버·설정·기상/조석 JSON은 변경하지 않았다. [최신 main 기준 제품/테스트 diff](MAIN_DIFF.patch), [source proof](results/root/source_compatibility.json) 참조.

## 2. 티맵·카카오 및 데이터 보존

최신 main 대비 tmapNavigationUrl/Link, spotTmapRouteHtml, spotRouteButtonsHtml, spotPopupHtml, fieldNavExternal 본문이 동일하다. fieldNavChooser에는 main의 두 앱 링크와 f27의 data-field-id가 함께 남는다. 외부 길찾기는 main의 앱 선택창 방식이며 f27의 자동 카카오 창 실행으로 되돌리지 않았다.

실제 Chrome에서 5폭 모두 일반 탐조지·승인 제보·현장소식의 두 링크와 승인 팝업 같은 줄 배치를 확인했다. 숨긴 팝업에는 양쪽 링크가 없고 지연 GPS도 최신 상태를 확인했다. URL contract은 TMAP goalx=경도/goaly=위도이며 실제 외부 앱 실행은 범위 밖이다.

main/f27/재적용/PR13/임시 결합 모두 runtime siteData190, unique ID190, 전체 JSON 및 좌표 hash가 동일하다. 처음 배열183에 후속 concat을 실행한190을 검사했다. 추천 함수는 main→재적용 및 b12→임시결합에서 동일하고 자동5JSON+notices가 main과 동일하다. 날씨 proxy/report 서버 source도 이번 브랜치에서 변경0이다. 좌표를 출력/수정하지 않았다.

## 3. 방어 결과

|경로|결과|
|---|---|
|본인 삭제 → 삭제 전 GET 늦게 도착 / 삭제 후 요청의 과거 항목|페이지 메모리 tombstone/barrier로 마커 복귀 차단|
|현 페이지에서 가림 확인 → 이전 GET 또는 후속 unhidden 항목|fieldProtectedIds가 가림 상태 유지|
|안내 중 보호·종료 → 지연 watch 성공/error|latest target + owner 검사, watch/안내 종료|
|일회성 GPS 성공/error·수동 방향 유도|콜백에서 현재 field 상태 재검사, 숨김/삭제 시 안내 부재|
|이미 열려 있는 앱 선택창|보호·삭제·종료 시 제거|
|좌표·시각 동일하고 hidden만 변경|추가 보완 후 열린 팝업 갱신; 수정 전 별도1건 실패, 수정 후 통과|
|승인/대기/최근 목록의 이전 요청 응답|endpoint별 적용 순번으로 이미 반영한 새 응답보다 오래된 요청 차단|
|site-history fetch 중 승인 목록 갱신|cache generation 불일치 시 오래된 history를 저장하지 않고1회 재요청|

대략 공개 좌표를 가진 protected field 자체를 없애는 S1-P 정책은 이 변경에 포함하지 않는다. 서버가 제공한 보호 좌표의 가공/정확성은 클라이언트만으로 확인하지 못한다. 이미 사용자나 외부 앱이 받은 좌표를 회수하거나 브라우저 힙의 모든 과거 객체를 지운다고 보장하지 않는다.

## 4. 미해결 보안 — 실패로 보존

독립 보안7종은 f27에서2pass/5fail, 최신 main 통합에서 **3pass/4fail/0error/0skip**이다. 기대 보안 속성은 유지했고 exit1을 보존했다. 이 집합은 구현자의 원형7종 명세가 저장소에 없어 독립적으로 정의한 별도7종이다.

1. **승인 제보 가림 뒤 후속 요청의 과거 public payload**: 정확 공개 좌표 마커·카카오/티맵 링크·검색 위치가 복귀할 수 있다.
2. **승인 제보 철회 뒤 후속 요청의 과거 목록**: 철회 마커가 복귀할 수 있다.
3. **다른 기기/관리자 삭제로 field 목록에서 사라짐 → 후속 과거 목록**: 본인 삭제 tombstone이 없으므로 field 마커·안내가 복귀할 수 있다.
4. **페이지 새로고침 → 최초 응답이 과거 자료**: 메모리 tombstone/보호 기록이 초기화되므로 삭제/가림 이전 상태를 복원할 수 있다.

실제 Chrome 별도 ledger에서도 승인 철회 복귀·승인 가림의 양쪽 길찾기 재활성·새로고침 후 삭제 field 복귀 **3종×5폭=15건**을 확인했다. 정상75통과에 합산하지 않는다. 이는 합성 캐시 응답에 대한 재현이며 실제 운영 정보 유출 사고가 있었다는 증거가 아니다.

원인 함수: index.html:2916의 reportResponseCurrent와 index.html:4625의 loadApprovedReports는 요청 순번만 비교한다. 요청이 늦다는 사실은 payload가 최신이라는 증명이 아니다. index.html:5195의 fieldGuardIncoming은 본인이 삭제/가림을 관측한 페이지의 메모리만 이용하고 목록에서 빠진 이유를 삭제로 확정하지 않는다.

서버 측 차이: field GET/client request는 기존부터 no-store, approved GET은 public,max-age=60이다. 두 stale 발생 가능성을 같다고 추정하지 않는다. generatedAt은 응답 생성 시각이며 공개 허가 revision이 아니다. 서버가 현재 권한으로 검증한 목록/위치 보호 상태와 일관된 revision 또는 withdrawal contract, 캐시 무효화가 필요하다. 기존 위치 가림·철회·S1-P 전환의 전면 보장을 하려면 이 경계를 먼저 해결해야 한다.

단순히 missing ID 모두를 영구 삭제하거나 browser storage만 추가하면 정상 만료/재출현/재승인을 막거나 처음 보는 기기의 보호를 보장하지 못한다. 이 정책을 임의 구현하지 않았다. [독립 보안 재현](results/security_variants.json), [Chrome ledger](results/browser/location_chrome.json) 참조.

## 5. 테스트 수치와 기존 실패

|실행 범위|통과|실패|skip|미실행/비고|
|---|---:|---:|---:|---|
|원 f27 JS14파일, Chrome+Python UTF8|349|0|0|보고351의 동일범위는 확인 못함|
|수정 전 b12 JS13파일, 같은 충족 환경|330|0|0|새19 이전 기준|
|f27/b12 환경 미설정 최초 원형|각316/297|각8|각25|Chrome7+Python stdout encoding1 실패; snapshot 보존|
|최신 main43 원형 JS12파일|250|2|0|기존 TMAP 동작과 옛 assertion 차이|
|최신 main 재적용 JS14파일|270|2|0|총272, 위2와 동일. 새19+팝업1 포함|
|PR13 임시결합 JS15파일|348|2|0|총350, 위2와 동일|
|PR13 임시결합 reports-api 자동발견|178|0|0|177 assertion+helper module1; 실제 discovery 명시|
|PR13 임시결합 weather-proxy|36|0|0|local mock|
|PR13 임시결합 Python 기상|56|0|0|local|
|PR13 임시결합 Python 조석|21|0|1|실제 main workbook blob 확보 후. 초기 누락fixture4error 별도 보존|
|PR13 임시결합 자동 합계|639|2|1|642조건. 전부통과라고 보고하지 않음|
|원 신규 위치 보호|19|0|0|수정전에는 새 함수가 없으며 별도7 mutation으로 탐지 검증|
|추가 열린 팝업 회귀|1|0|0|f27 source 0pass/1fail →재적용1pass|
|독립7 mutation의 방어 무효화|7/7 탐지|—|—|각 무효화에서 기대 assertion 실패, 정상 제품 실패로 합산X|
|독립7 security variants|3|4|0|미해결 실제 제품 속성 실패|
|Chrome 정상기능/이번 방어 5폭|75|0|0|실제 Leaflet/DOM|
|Chrome 별도 보안 위험3종×5폭|0|15|0|unsafe 재현. 정상75에 합산X|

351/기존 실패9라는 보고는 실행 범위가 저장되어 있지 않아 정확히 입증하지 못했다. 본 환경에서는 원형8실패/25skip이 같은 b12/f27에 재현됐고, 환경 충족 시 양쪽0실패다. 최신 main의2실패는 원형 main에서 그대로 재현됐으며 카카오 문구가 찾아가기→카카오맵, 외부 자동 window.open→앱 선택창으로 바뀐 계약과 옛 assertion의 불일치다. 원 테스트를 삭제하거나 성공 기대값으로 바꾸지 않았다.

미실행: 운영 API writes·D1·실제 관리자 승인·실제 Kakao/TMAP 앱·실기기 센서·아직 보호를 관측하지 않은 기기의 서버 전체 안전성. UI/API는 합성 자료로 실행했다. 기본 Chrome 배경 지도 타일은 의도적으로 차단했지만 Leaflet/마커/팝업 DOM은 실제 실행했다.

실행 명령·TAP·실패별 대조는 [TEST_AUDIT.md](TEST_AUDIT.md) 및 [실행 manifest](results/execution_manifest.json)에 있다. 최초 source proof는 잘못된 함수명 spotTmapRouteLink로 실패했고 실제 spotTmapRouteHtml 이름으로 정정한 최종 proof와 함께 보존했다. Chrome 초기 하네스 오류들도 원장에 보존하여 제품 실패와 구분했다.

## 6. PR #13 호환성

최신 main 재적용 d3와 PR13 b12의 merge-tree는 충돌0이며 tree `a5808cb647759bdd10726318c061d68545c7c63a`다. 이는 read-only 임시결합이며 실제 main merge가 아니다.

서버 S1-R/shared 및 Python validators는 b12와 동일하고 S2-A/F2/F3/P0 추천 함수는 원문 hash가 동일하다. 별도 고정10월8일22:40 비교에서도190곳·176후보/제보 ON·OFF 전체 candidate signature 및 상위10 모든 점수·날짜·시각이 동일했다. synthetic null점수 후보165도 동일했다. [고정 비교](results/root/pr13_fixed_comparison.json). PR #13 head/본문/댓글/branch는 변경하지 않았다.

## 7. 다음 독립 검증 및 운영 조건

Draft 검증자는 정확 PR head와 main을 다시 고정하고 MAIN_DIFF 및 안전 실패4/Chrome15를 우선 읽는다. 같은 페이지의 out-of-order client 보호와 서버/새로고침 전면 안전을 분리하여 판정한다. 합성 좌표로 local-only 재현하며 실제 사용자 데이터를 등록·삭제하지 않는다.

현재제출은 부분방어 검증용이며 전면보호 승인이 아니다. 과거 자료로의 공개 상태 역행 및 처음 관측/새로고침 경계의 서버 contract를 보완하기 전 기존 위치 보호 전환의 배포 선행 조건이 충족됐다고 보고하지 않는다. 서버 공개 정책/S1-P의 별도 승인을 몰래 포함하지 않는다.

main 병합·Pages/Worker 배포·D1 및 실사용자 자료 변경은 모두0. 별도 운영 승인 전 실제 반영하지 않는다.
