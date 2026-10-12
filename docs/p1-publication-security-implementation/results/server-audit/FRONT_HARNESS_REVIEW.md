# 기존 프런트 단위 harness의 공개 권한 계약 반영

root가 처음 실행한 `results/front-initial/front.tap`의 272조건 중 238통과·34실패 원장은 그대로 보존했다. 제품 수정은 root만 수행하며 이 후속 작업은 아래 다섯 시험 파일만 보완했다.

- `.github/scripts/test_field_news.mjs`
- `.github/scripts/test_location_popup_guard.mjs`
- `.github/scripts/test_location_protection.mjs`
- `.github/scripts/test_site_history_cache.mjs`
- `.github/scripts/test_weekly_recommendation.mjs`

첫 보완의 같은 14개 JS 스위트는 **276조건, 274통과·2실패·0skip**이었다. 원형 두 실패를 보존한 뒤 root의 명시적 후속 지시로 실제 main의 두 앱 계약을 더 엄격한 실행 시험으로 교체했다. 새 dynamic-popup 두 시험과 monotonic 권한 fixture를 추가한 결과는 **278조건, 278통과·0실패·0skip**이었다. 이후 root의 GPS fresh-head 보강에 맞춰 3개 독립 시험을 추가하고 전체를 재실행한 최종 결과는 **281조건, 281통과·0실패·0skip**이다. 시험 삭제·skip 처리로 수치를 맞추지 않았다.

## 원본 시험별 근거

아래 번호는 초기 front.tap의 test ID이며 최종 번호는 새 시험 추가로 이동할 수 있다.

|초기 ID / 시험명|원인|보완 및 유지한 assertion|
|---|---|---|
|21, 23: 공개 소식의 길안내 대상·보호/비정상 좌표|실제 `fieldPublicPoint`가 참조하는 publicationAllowed 누락|실제 publicationAllowed 소스와 유효기간 있는 ready 상태를 주입. 공개 정상 좌표 허용·보호/이상 좌표 null assertion 유지. 미확인/만료면 정상 좌표도 null이라는 부정 시험 추가|
|25: 카카오 링크 문구|main의 기존 문구는 카카오맵, 시험 기대는 카카오맵 찾아가기|원형 실패 보존 뒤 현재 정확 label/URL, TMAP goalx=경도·goaly=위도 및 두 앱 링크 정확히 2개를 함께 검사. URL validation assertion 유지|
|27: window.open 소스 가정|main은 두 앱 선택창을 쓰는 기존 변경|원형 실패 보존 뒤 실제 fieldNavExternal와 fieldNavChooser를 합성 DOM에서 실행. 자동 window.open=0, 두 앱 href·target/rel, 보호·이상좌표·권한미확인에서 선택창=0을 검사|
|28: 내 현장소식 삭제|등록 성공을 result.body.update.id 즉시 공개 shape로 찾던 소스 검사|승인된 좌표 없는 receipt의 result.body.id와 loadFieldUpdates 재조회 검사로 전환. confirmation-before-POST·server ownership·본인 버튼·403/404 처리·fieldMineAdd 횟수 assertion 유지|
|29: 보호 전환 열린 팝업|실제 fieldPublicPoint의 publicationAllowed 누락|실제 helper와 유효 권한 fixture만 주입. 열린 팝업 갱신 1회와 route=false assertion 유지|
|30~43: field GET·GPS·보호·선택창|publicationDataAllowed/RouteCheck 등 신규 의존성과 rowRevision/expiresAt/checkedAt/publication fixture 누락|실제 Allowed/Same/DataAllowed/Revision/Validate/Renew/RouteCheck 소스 사용. verified transport 경계의 합성 fresh head를 입력하고 비동기 route 확인이 끝난 뒤 GPS 콜백을 전달. 기존 삭제/보호 복귀0·지연GPS 안내0·watch 해제·정상 안내 assertion 유지|
|32: 가림 뒤 더 늦은 과거 GET|구 시험은 authority 없는 응답과 영구 sticky를 가정|뒤에 요청됐어도 **과거 publication revision 1**이 실린 응답을 입력하여 기존 정확좌표 재노출0 assertion 유지. 더 높은 명시 권한 revision 2의 정상 가림 해제는 별도 복구 시험으로 추가|
|44~47: approved/pending/recent 순번·history generation|publicationFetch/DataAllowed 누락|이미 검증된 합성 transport 경계에서 명시 publication을 제공하고 실제 Allowed/Same/DataAllowed 검사. 오래된 요청은 렌더0·이력 재조회·순서 정상 반영 assertion 유지|
|97~102, 104~105: 이력 메모리캐시 및 오류|actual cachedSiteHistory와 fetchSiteHistory가 새 공통 권한 helper에 의존|유효 publication fixture와 실제 Allowed/Same/DataAllowed 소스 주입. TTL 시험에서는 같은 revision의 fresh head 갱신이 별도 절차로 이뤄졌음을 명시. 내용·순서·페이지·실패 null·실패 캐시0 assertion 유지|
|103: 서버 60초 캐시 활용|승인된 no-store 정책과 직접 충돌|정상 query 범위와 no-store 전달, 실제 publicationJson의 no-store 소스를 검사. 60초 HTTP 캐시 보존을 기대하지 않음|
|106: fetchSiteHistory의 자체 AbortController|timeout이 실제 공통 publicationJson으로 이동|actual publicationJson의 AbortController와 PUBLICATION_TIMEOUT을 검사. timeout이 없어도 성공하게 만들지 않음|
|112: Worker max-age와 메모리 TTL 동일|새 정책은 HTTP 캐시를 제거하고 권한 lease 안에서만 메모리를 재사용|실제 cachedSiteHistory의 publicationDataAllowed, shared.js의 no-store, TTL>0 검사. 미확인·만료·다른 revision에서 실제 cache getter가 null인 시험 추가|
|249 / R01 H: recent-sites 실패·이상 입력|publicationFetch/DataAllowed 누락|추천 loader 단위에 실제 helper와 명시 정상 publication을 제공. 가점 산식·P0·정원 assertion 불변. 다른 publication revision의 제보를 가점으로 적용하지 않는 assertion 추가|

## 단위 범위와 한계

이 시험들은 기존 field/render/cache/recommendation 함수의 독립 단위 범위다. `publicationAllowed=true` 같은 무조건 통과 stub를 사용하지 않는다. 유효 state와 실제 helper를 평가하며 명시적 부정 조건도 검사한다.

일부 기존 fixture의 fetch/fieldApi는 이미 검증된 공개 snapshot의 transport 경계로 둔다. field route 단위에는 실제 validator/renewal/route gate를 사용하지만 head의 HTTP 전달 자체는 합성한다. nonce preflight/postflight·실제 로더·Chrome DOM·서버 revision을 연결한 전체 보안 성공을 이 단위 결과로 주장하지 않는다. 해당 전체 검증은 별도 보안/Chrome 원장으로 확인해야 한다.

R01 H의 “직전 자료 유지” assertion은 isolated `loadRecentSiteSightings` 함수의 기존 catch 동작을 측정한다. 제품 전체에서 publicationFetch 실패에 따라 publicationInvalidate가 제보 가점을 회수하는 동작은 별도 authority lifecycle 시험의 기대다. 이 단위 assertion을 전체 UI가 미확인 제보 가점을 계속 사용해도 된다는 정책으로 해석하면 안 된다.

fieldReplace 직접 호출 시험은 기존 순수 helper의 tombstone/보호 입력 방어를 유지한다. 새 제품의 POST 공개 위치는 그 helper에 raw receipt를 즉시 넣는 방식이 아니라 publication 재조회로만 표시한다.

## 명령·증거

원형 34실패: `docs/p1-publication-security-implementation/results/front-initial/front.tap`.

최종:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
$env:PATH='C:\Users\김진호\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;'+$env:PATH
$tests=@(Get-ChildItem .github/scripts -Filter 'test_*.mjs' | ForEach-Object {$_.FullName})
node --test --test-reporter=tap @tests
```

첫 전체 결과 274/276은 `front-harness-full-final.tap`, 개별 location21/21은 `front-harness-location-final.tap`, cache17/17은 `front-harness-cache-first.tap`, weekly126/126은 `front-harness-weekly-final.tap`에 보존했다. `front-harness-field-first.tap`의 두 기존 실패도 보존한다.

최종 현재 계약의 전체 결과는 **front-main-contract-full-final.tap (278/278)**이다. 새 field popup의 `options.publicationDynamic`, 현재 store 조회, 삭제·미확인 뒤 기존 popup factory에서 정확좌표를 읽지 않는 조건과 actual publicationForgetLayer의 content 교체·close·unbind·map remove·_source=null을 2개 독립 시험으로 추가했다.

구현 중 monotonic lease 조건이 추가된 뒤 첫 재실행은 **252/278·26실패**였으며 `front-main-contract-monotonic-initial.tap`에 보존했다. 정상 fixture에 `checkedMono:performance.now()` 및 PUBLICATION_MAX_AGE를 추가했고 새 popup 시험의 실제 FIELD_STATUS_LABEL 의존성을 주입했다. actual Allowed 검사와 정상/부정 assertion은 유지했다. wall clock 유효해도 monotonic lease 만료면 좌표가 null인 부정 조건도 검사한다.

실제 운영 POST·DELETE·배포는 하지 않았다.

## GPS fresh-head 최종 보강

root는 guide start/position/error와 one-shot 성공·오류 및 수동 GPS callback에도 실제 publicationRouteCheck를 추가했다. 기존 보호·삭제·owner assertion을 유지하고, 비동기 fresh head가 완료된 후 값을 관찰하도록 테스트의 await 경계를 보완했다.

새 3개 독립 시험:

1. cached 권한이 아직 유효해도 fresh head를 확인할 수 없으면 직접 fieldGuideStart가 watch/안내를 시작하지 않는다.
2. one-shot 성공·오류·수동 GPS 응답 뒤 각각 새로운 head를 확인하며, 실패하면 외부 선택창·방향 안내·watch가 없다.
3. 정상 watch 위치 및 오류 반영은 각각 새 head 뒤에서만 발생한다. head 이전에는 위치 선을 갱신하지 않으며, 정상 오류 처리의 watch 종료도 유지된다.

위치는 actual publicationRouteCheck·validator·renewal·Allowed와 실제 field helper를 실행한다. transport fresh head만 합성 경계다. 개별 location 결과는 **front-fresh-gps-location.tap (24/24)**, 최종 전체 실제 TAP은 **front-fresh-gps-full-final.tap (281/281)**이다. `front-harness-final.json`은 이 TAP의 tests/pass/fail/skipped를 파싱한 값과 Node exit0·각 harness hash를 기록한다. 이전 278 성공 원장은 `front-before-fresh-gps-278.tap`에도 보존했다.
