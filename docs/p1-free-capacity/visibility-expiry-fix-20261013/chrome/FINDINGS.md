# 숨김·만료 수정의 독립 Chrome 회귀

제품·체크아웃 SHA: `38a616c10f9edd93f1ab389c62b7bcc9b3ca96fd`.
실제 git show 프런트 SHA256: `7b9eec9b0203ec3c5ca89bc16cbdcae62adacb03fcb9f00c62079f85fb6e1f47`.
모든 실행은 실제 Chrome·Leaflet, 로컬 포트0, 새 임시 프로필, 합성 API·좌표를 사용했다. 기존 원형 하네스와 assertion은 수정하지 않았다. 제품은 root만 수정했으며 이 검증 담당은 제품 변경·commit/push/운영 변경을 하지 않았다.

## 결과

| 하네스 | PASS | FAIL | SKIP | 종료 코드 |
|---|---:|---:|---:|---:|
| 원형 publication_chrome_final_r4.mjs | 237 | 4 | 0 | 1 |
| 원형 free_contract_chrome.mjs | 16 | 0 | 0 | 0 |
| 원형 free_contract_compound.mjs | 1 | 0 | 0 | 0 |
| native_window_route_browser.mjs | 8 | 0 | 0 | 0 |
| 신규 two-tab-context-diagnostic.mjs | 3 | 0 | 0 | 0 |
| 신규 two-context-authority-diagnostic.mjs | 5 | 0 | 0 | 0 |

원형은239/2였던 이전 SHA와 달리 이번에는237/4다. 이 결과를 통과로 바꾸지 않는다. 원형 기본 회귀는344/375/768/1024/1440px를 모두 검사했다. 기존 Chrome15 위험 케이스는15/15 PASS. 모든 실행에서 operatingRequests=0, externalNonGet=0, browserErrors=[]다. CDN 의존성 GET 이외의 외부 요청은 CDP Fetch에서 차단했다. 실제 Workers/D1 호출은 없다.

## 원형4 FAIL의 재현과 분류

1. `independent-head-transit-counts-in-five-second-lease`(375): 전체 작업6024.400ms, remaining0의 합을<=5100ms로 요구해서 FAIL. 이것은 직접4목록 호출 뒤 needsRefresh를 완료하는 복합 작업이며, 실제 권한 유지 시간이 아니다. 별도 원형 compound 시험은6034.400ms 뒤 allowed=false/ready=false·모든동적 DOM/stores 폐쇄를 확인해PASS한다. 원형 시간 assertion을 삭제하지 않았다.
2. `both-independent-clients-normal`: 원형은 같은 browserContext 안에375px·1440px 두 탭을 연 뒤 둘 다 동시에 정상 공개를 요구한다. 결과[false,true]. 신규 작은 진단에서 첫탭 document.hidden=true/ready=false/allowed=false/approved0/fields0/coords[]이고 둘째탭visible정상임을 실제 측정했다. 현재 승인된 숨김 계약이 첫탭을 폐쇄하는 동작이며, 원형의 두 탭을 독립적으로 보이는 기기로 취급한 환경 가정과 충돌한다.
3. `new-explicit-authority-restores-both-devices`: 동일한 첫탭hidden 때문에 결과[false,true]로FAIL. 첫탭을 실제 활성화하고 fresh 자료를 읽으면 정상복구함을3건·5건 진단 모두 확인했다.
4. `earlier-request-arrives-after-new-protected-snapshot`: 첫탭hidden에서 직접loader를 호출하므로 deferred0이고 기대2와 달라FAIL. 작은 진단은 실제hidden loader 호출이 새network요청0·deferred0임도확인했다. 이전SHA의 동일case는1payload 공유로FAIL했는데, 현재0은새숨김폐쇄계약때문이다. 정상visible 상태에서 fresh postflight/다른generation 지연응답 차단은 기존 독립contract16에서전부PASS다.

이4개를FAIL 그대로 보고하고 환경·계약 가정의 차이로 구분한다. 이 원형4FAIL에서 신규 기능 회귀나 좌표재노출 증거는 확인되지 않았다. root의 숨김30/만료12/부하 결과는 별도이며 이 문서로 성공을 대신하지 않는다.

## 독립 visible 기기의 철회·재승인

two-context 진단은 서로 다른 Chrome browserContext2개를 생성하고 focus emulation을 명시적으로 켜서 두 클라이언트를visible로 유지한다.

- 정상 revision100: 두 client 모두allowedtrue, 승인/field 마커와합성coords1개.
- 철회 revision101: 철회한 승인·field의마커와coords0, routeGatefalse, guide/choice없음.
- 재승인 revision102: 최신fresh 자료에따라두client정상복구.

별도의pending 합성기록은 철회대상이아니므로1개유지한다. 모든동적기록을삭제한것으로보고하지않는다. 독립context+focus emulation은 물리다기기 시험은아니다. SQL CAS·승인철회 원자성은 별도 서버검증을필요로한다.

## 정상 native 길찾기와 안전 폐쇄

native8은375/1440px × 승인/field × Kakao/TMAP를 trusted CDP 클릭으로 검사한다. fresh primary HEAD가 실제추가되고정상URL이계산된다. Kakao는실제about:blank창생성과CDP활성화로부모document.hidden 전환을확인했다. 목적지URL대입은proxy로기록하여외부로이동하지않는다. TMAP는정상URL을생성하고native launch는false mock이다. 전체8/8 PASS다. 창열기를fresh권한확인후실행하는현재계약에서정상click이자신의preflight를숨김으로무효화하지않음을확인한다.

원형의보호·철회후old cache,본인삭제+지연GET,lateGPS,정상및보호Kakao/TMAP,동의철회cache,timeout/offline 회귀는해당케이스PASS다. 실제mobile/iOSpopup 정책·물리GPS·외부앱실행은미검증이다. 이결과로모든브라우저의popup 성공이나운영유출사고유무를보증하지않는다.

## 실행과 저장

공통환경은PUBLICATION_TEST_INDEX_REF와PUBLICATION_TEST_ASSET_REF 모두위제품SHA, PUBLICATION_TEST_ROOT/BIRDMAP_LOAD_REPO는현재p1-free-capacity작업트리다. PUBLICATION_TEST_OUTPUT은각새하위폴더다.

    node docs/p1-publication-final-audit/browser/publication_chrome_final_r4.mjs
    node docs/p1-publication-final-audit/browser/free_contract_chrome.mjs
    node docs/p1-publication-final-audit/browser/free_contract_compound.mjs
    node docs/p1-free-capacity/resume-20261013/load/native_window_route_browser.mjs
    node docs/p1-free-capacity/visibility-expiry-fix-20261013/chrome/two-tab-context-diagnostic.mjs
    node docs/p1-free-capacity/visibility-expiry-fix-20261013/chrome/two-context-authority-diagnostic.mjs

각결과JSON/run.log/EXIT_CODE.txt,원형5폭스크린샷을저장했다. 기존미추적자료·이전실패원장은보존했다. 배포승인판정은root의다른필수결과및WorkersFree용량·미검증을합쳐야하며, 이담당은배포를실행하지않았다.
