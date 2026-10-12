# 최종 Chrome 보안 검증 추가 원장

정확 PR13 결합 input tree `a599638f3a0b8d95b367b94eaa4eb098127abba3` / 실행시Git HEAD `f7aee08f8bab6371cdffb8e2099d85b51a76765e` / indexSHA256 `b325c1faab66228ef919e4c6c03902c1c7d120a43f7a909c8be0643c8d7e9b86`.
최종 publication_chrome.json: **165pass/0fail/0skip/0notRun**. 5폭344·375·768·1024·1440. 기존4종20 및 위험15는subset, unsafe0. Browser exception·운영requests·외부non-GET0.
별도 branch 결과 publication_chrome_branch_final.json도165/165. input64478은 rebase 전 source이며 f7aee08 indexGitblob과 동일한 점을 소스 대조했다. sourceSha(GitHEAD)와sourceInput(실제HTML)은 구분한다.

lease유효+local옛좌표 상태에서 서버authority만 바꾼 뒤 one-shot success/error, manual success/error, watch success/error, direct guide start를 시험했다(터치기기에서 추가5×3폭, 모든폭에서2×5, 총25추가). 보강 전 정확188b Git375px40pass/11fail을 publication_chrome_before_fresh_gps.json으로 보존: GPS7 및 당시DOM4. 최종기대는동일하게폐쇄다. 초기 evalbuffer fixture 오류도 별도 원장에 보존했다.

이전140원장은 publication_chrome_before_gps_guard.json과 이전 README이다. 그 sourceSha188b는 당시GitHEAD이며 실제input은미커밋workingtree/rawhash52eb...이었다. Git188b그자체의140pass라고해석하지 않는다.

---

# 공개 권한 Chrome 독립 검증 원장

## 이전140조건 실행(아래는 당시 원장)

- 명령: `$env:CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'; node docs/p1-publication-security-implementation/scripts/publication_chrome.mjs`
- 실제 Chrome headless/CDP, 실제 Leaflet 및 제품 전체 HTML.
- 화면 폭: 344 / 375 / 768 / 1024 / 1440px.
- 최종 `publication_chrome.json`: **140 pass / 0 fail / 0 skip / 0 notRun**, 프로세스 exit 0.
- 실행 결과의 source SHA: `188b390c2cddeb8dd8d92abd651d428feb95726b`.
- 실행 시작에 고정한 index 원문 SHA256: `52eb91d2a1dc27bbfb6d516786f5456c3bffaaf20612ccbe69f517146a253caa`.
- 4종 기존 실패(V03 / V04 / V05 / V06) × 5폭 = 20개 검사는 최종 140개에 포함된다.
- 기존 Chrome 위험 3종 × 5폭 = 15개는 위 검사의 subset이며 **unsafe 0**이다. 15를 최종 통과 수에 다시 더하지 않는다.
- 운영 Worker 실제 요청 0, 외부 non-GET 0, 브라우저 전역 예외 0. 모의 POST만 수행한다.

## 검사한 계약

승인 가림/철회, 다른 기기의 현장소식 삭제, 새로고침의 과거 첫 응답을 fresh nonce + epoch/revision + pre/postflight 상태 계약으로 차단한다. nonce/epoch/projection/자료형/overflow 오류, 인접한 2^53 초과 revision, postflight 권한 변경, timeout, offline lease 종료, BFCache, GPS 지연, 요청 순서 역전을 실제 제품 함수와 DOM에서 검사한다.

- 권한 미확인에서 승인/대기/현장 마커, 내부 공개 좌표 store 및 검색 좌표, 동적 팝업 링크, 지도 앱 선택창, GPS 안내가 남지 않아야 한다.
- 카카오맵/티맵과 정적190곳의 기존 링크는 정상 입력에서 유지한다.
- 실제 DOM의 본인 삭제·상태 변경 버튼을 클릭하며 모의 mutation receipt 후 신선한 목록을 다시 확인한다.
- 명시적 재승인·가림 해제·재출현은 복구되어야 한다. 삭제된 terminal field ID를 정상 재출현으로 재사용하지 않으며, 자연 만료된 ID의 정상 재출현은 별도로 검사한다.
- 독립 Chrome 페이지2개에 동일 mock authority revision을 제공하여 정상→보호→삭제→명시복구와 두 기기 길찾기 차단을 검사한다.
- OS 시계가 -24시간 역행하고 네트워크가 실패해도 monotonic lease가 종료되어 위치·href가 폐쇄되는 추가1건을 포함한다.
- 선택한 public GET 모두 요청 `cache:'no-store'`를 확인한다.

## 실패 보존과 교정 근거

원형 실패를 삭제하거나 성공으로 치환하지 않았다.

| 보존 파일 | 당시 결과 | 구분 / 교정 |
|---|---|---|
| harness_initial_error.json + publication_chrome_harness_initial.mjs | assertion0 / Node exit1 | 없는 로컬 asset을 headers 전송 뒤 읽어 ERR_HTTP_HEADERS_SENT. 로컬 서버 read→writeHead 순서 교정. 제품 검증 성공으로 집계하지 않음 |
| publication_chrome_first_product_run.json/.mjs | 106 pass / 31 fail | 정적/동적 링크 selector 혼동, CDP에서 지연 요청 Promise를 await하여 timeout, 초기 지도 준비 부족을 분리 |
| publication_chrome_second_product_run.json/.mjs | 106 pass / 36 fail | component 증거 추가 전 상태. 삭제 terminal ID를 다음 정상 시험에 재사용한 자료 오류와 footer artifact 오류 보존 |
| publication_chrome_375_diagnostic.json/.mjs | 36 pass / 5 fail | 그중 동적 링크 잔존4종은 실제 제품 결함. ready=false·현재 store/marker/search가 비었어도 열린 팝업 href가 visible=true로 남음을 재현 |
| publication_chrome_dom_fixed_first.json/.mjs | 138 pass / 1 fail | 제품 DOM/source 제거 후 핵심 보안 통과. 두 번째 Chrome 페이지의 초기 bootstrap과 합성 revision 전환 경합으로 일시 폐쇄. bootstrap 완료 후 동일 권한을 공급하여 정상 동작 검사 |
| publication_chrome_before_monotonic.json/.mjs | 139 pass / 0 fail | DOM/source 보완 및 하네스 준비 교정 후. 다음 제품 monotonic lease 보완 전 원장 |
| publication_chrome.json | 140 pass / 0 fail | 동일139조건 + OS clock rollback 추가1조건, 최종 제품 source |

실제 제품 결함의 수정은 root 구현자가 수행했다. 독립 시험 담당은 제품 코드를 수정하지 않았다. `publicationForgetLayer`/dynamic DOM/source 폐기는 실제 잔존 href 결함을 해결한 제품 변경이며, assertion을 제거한 것이 아니다.

하네스 교정은 다음 사실을 따른다.

1. 정적 탐조지/고정 공개spot의 주소는 이번 동적 권한 정책 대상과 다르다. 동적 `data-publication-report` 링크와 내부 현재 store를 검사한다.
2. 지연 요청을 시작할 때 CDP expression이 그 Promise 자체를 반환하면 `awaitPromise:true`에 의해 timeout까지 기다린다. 시작 expression을 즉시 끝내고 이후 결정한 순서로 응답을 전달한다.
3. 제품 초기화는 load 후300ms에 marker registry를 구성한다. 초기화 완료190개를 기다려 실제 정적 링크를 검사한다.
4. 서버 terminal 삭제 ID를 다음의 정상 합성 입력으로 재사용하지 않는다. 새 정상 ID를 사용하되 자연 만료/재출현은 같은 ID로 유지한다.
5. 최초 bootstrap 완료 이후 두 mock authority가 같은 확정 revision을 전달하도록 초기화한다. 권한 변경 중 폐쇄를 정상 상태의 실패로 오인하지 않는다.

## 이미지와 범위 한계

- `publication-popup-<width>.png`: 정상 현장소식 팝업.
- `publication-normal-<width>.png`: 정상 두 지도 앱 선택창.
- 375px 팝업과1440px 선택창은 실제 이미지로 열어 시각 검사를 마쳤다. 캡처는 각300ms transition 종료를 기다린다.
- basemap tile 요청은 외부 네트워크 정책상 의도적으로 차단하여 배경이 회색이다. 실제 Leaflet 로딩 실패가 아니다.
- D1 원자성과 실제 handler 경합은 다른 로컬 SQL/Worker 시험의 대상이다. 이 mock으로 해당 보장을 증명하지 않는다.
- 실제 다기기/다른 운영 POP·CDN 설정, 실제 모바일 센서·외부 앱 실행은 미실행이다.
- foreground lease/poll/timeout 로컬 운영값은 별도 운영 승인 대상이며, 확인 직후 철회에 대한0ms 관측이나 이미 전달된 좌표 회수를 보장하지 않는다.
- 운영 API·D1·실사용자 자료·PR13/16은 이 시험에서 변경하지 않았다.

