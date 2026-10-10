# PR #13 F1·F2·F3 최종 독립 검증

## 1. 종합 판정 — 수정 필요

정확 대상 **a35b8598d55890e705042e4d6f88621357749d09**. F1 미래 발행 비교기준 오염과 주간 배열 시각 우회는 해결됐다. 자동 회귀 **615 pass / 0 fail / 1 skip**, 정상 고정 **190곳·176후보** 및 제보 ON/OFF 전수 결과도 유지됐다. 그러나 **F2의 명시적 양측 발행시각 계약 미완결, 동일 root 정상 교정 복구 미충족, F3 parser 밖 객체형 시각 예외**가 실제 함수·로더·Chrome에서 확인되어 병합·배포 승인을 진행할 수 없다.

사용자가 승인한 정책은 검증된 현재 자료만 추천하는 C다. B 지연 예외, 배점·정원·동점 정책 변경은 없다. 아래 실패는 합성 계약 입력의 재현이다. 운영 발생 빈도·당시 실제 날씨·민감정보 유출 사고를 입증하는 자료는 아니다.

## 2. 검증 코드·자료·권한

- head: a35b8598d55890e705042e4d6f88621357749d09.
- 이전 차단: 2e485079a34fa5aeeef09e82f3b996bf2696d978.
- 최종 Git 원격 main: bf74095adb3bf0b13f1aca31193c8d03cf8ff53f.
- 임시 merge-tree: 379b0c06bad6a12570e45ed8916ae98f2645a4a7.
- AI_WORK_RULES, FINAL_DEPLOY_RECHECK, FINDINGS, NEXT_SESSION, 새 diff·구현보고6097341141을 읽고 이어받았다. P1-A~D 반복 없음.
- 신규 제품 diff는 index.html의 source/parser/publication 비교와 validate_weather.py의 item 발행 검사다. 생성기·live merge·서버 공개 정책은 이전2e485와 동일하며 기존 S1-R/S2-A 범위도 회귀 확인했다.
- 검증 브랜치의 역사적 제품 소스는 시험에 쓰지 않았다. 정확 Git archive/blob을 호출했고 CRLF→LF만 정규화해 index SHA256 187daaf4818b6592c6346e87064bb608abe49b7fd6b78a79781184a3f655af61와 일치했다.
- 정상 비교: 10/8 22:40 KST·manifest16파일·공개 승인 제보11곳 고정. 계약 반례: 10/10 11:00 KST. 최신 main 검사는 별도 실제21:15~21:19 시각이다. 과거 고정 입력과 최신 기상을 혼용하지 않았다.
- 실제 Chrome/Leaflet의 API는 탐색 전 합성 응답으로 격리, 정적 CDN GET/HEAD만 허용했다. 메모리 API/DB로 등록·삭제·관리자 회귀를 수행했다.
- 기본·lifecycle·loader·일반 E2E는344·375·768·1024·1440px. 추가 typed/today 반례는375px. 실제 민감 원좌표는 공개하지 않고 벡터 hash로 보존을 확인했다.
- 제품 수정·main 병합·Pages/Worker 배포·운영 D1·실사용자 등록/삭제0.

## 3. F1 — 통과

birdmapDataTime:4545는 원본 문자열 parser를 통과하고 Date.now 이하인 발행만 비교 기준으로 쓴다. today/week 모두 미래12:30 최초→정상10:50은0→1 복구, 정상10:40→미래12:30→정상10:50은 정상 유지 후 갱신한다. 위험10:40→이전 정상10:30은0을 유지한다.

같은 발행 충돌·발행 누락/무효·요청 순번 역전·자정·today/week 독립·최신자료 적격기간 만료도 기존 성공 기대대로 **Node28/28·Chrome140/140·예외0**. 이전2e485 동일Node28은23pass/5fail이었다. 미래자료가 비교 기준을 오염시키던 새 회복 결함은 해결됐다.

## 4. F2 — 필수 보완

### F2-a. 누락 item 또는 무효 root의 적격 승격

storedWeatherState:2071은 item.generatedAt이 없으면 root를 대신 쓴다. 2081–2082의 동일성 guard는 rootMs가 유효하고 item이 존재할 때만 실행된다. 그 결과 **item 누락/null/빈값 또는 root 누락/null/배열**이 현재 적격 출처로 승격될 수 있다.

실제 loader에서 root=item10:40·강수1mm의 추천0 → root10:50·item 생성시각 누락/null/빈값·강수0가 **후보·최종1/raw92/bonus16/rank108**로 돌아왔다. 최초 root 누락/null/배열+유효 item10:50도 추천된다. 확장 actual loader10은4pass/6fail. 모든 malformed root가 이미 정상자료 뒤 로더를 통과한다고 확대하지 않는다. 최초 root 객체는 stamp 생성 예외로 적용되지 않는 별도 경로다.

Chrome375에서도 누락 item 및 root 배열이 카드·Leaflet 팝업92점/rank108을 남겼다. root/item matrix60=30pass/30fail은 반복 조건 수이고 결함30개가 아니다. 실제190ID Python validator20조건은20/20(정상2수락·비정상18거부), 따라서 JS와 계약이 다르다. live merge도 실제 freshness/merge에서 누락/null/빈 item의 scoreEligible=true·92점을 유지했다(정상/stale/불일치3pass·누락3fail, 저장 원본은 불변).

**수정 요구:** 적격 today에는 root와 item 모두 명시적 원본 문자열 발행시각이 있고 엄격 parser를 통과하며 계약상 동일해야 한다. 없는 쪽을 다른 쪽으로 대체해 적격 승격하지 않는다. Python54와 JS를 일치시키고 일반·갯벌·섬·today 후보/최종/live/card/popup에서 재시험한다. 정상 주간 대안·기온/풍향/조석 참고·stale/false 재사용은 보존한다. 선상 today-only는 기존 정책상 추천되지 않으며 주간 선상 typed 경로는 별도 통과했다.

동일 반례는 이전2e485에서도92/rank108로 재현돼 **기존 미완결 계약**이다. 실제 정상 생성기가 malformed 배치를 만든다는 증거는 없지만 승인 C의 출처 검사 우회이므로 배포 전 필수 보완이다.

### F2-b. 사용자 필수 exact1050 교정 복구

1040/1040 rain1 →1050/1030 rain0 →1050/1050 rain0에서 실제 적용은 **[true,true,false]**, 카드 **[0,0,0]**이며 마지막 저장 item은10:30이다. 혼합 배치 안전 제외는 개선됐지만 정상 동일root 교정본이 적용되지 않는다. 추가6조건은Node3pass/3fail·Chrome5폭30중15pass/15fail·예외0. root1050/item1055 및 최초 혼합 배치 뒤 동일root 교정도 실패한다.

loadBirdmapData:4549의 stamp 동일 및 next<=have guard가 부적격 혼합 root1050을 비교 기준으로 저장해 교정본을 막는다. 역방향 oldroot1030/item1050, 이미 검증된 같은 발행 충돌 보존, 정상1055/1055 복구는 통과했다. 이전2e485는 같은 sequence [0,1,1]이며 마지막 교정본 적용도false였다.

**수정 요구:** 검증되지 않은 혼합 배치와 검증된 동일발행 충돌을 구분해 정상 동일root 교정을 복구한다. 같은 발행의 임의 덮어쓰기로 완화하지 않는다. known unsafe·older/same verified 충돌·request seq·만료 관문을 유지하고 exact sequence 성공을 실제 loader/최종/5폭 DOM으로 입증한다. 이는 안전 추천 우회와 구분되는 **요청된 복구 계약 미충족**이다.

## 5. F3 — helper 통과, 실제 소비 경로 실패

weeklyForecastTimestamp:3906, weatherTimeMs:2050의 typeof string guard는 정상이다. helper7/7, 주간 일반·갯벌·섬·선상 canonical 자료형48/48, JS ISO+09 대조11/11. 배열형99점은 제외되고 정상80+가점16=rank96이 선택돼 실제 카드·팝업80점이 유지된다.

그러나 today forecastTime={"toString":"not-callable"}는 storedWeatherState:2070,2074의 **String(day.forecastTime)** 경로에서 TypeError다. 후보·최종을 각각 직접 호출했고 Chrome375 카드와 Leaflet 팝업(weatherTodayForSite→storedWeatherState)에서도 예외를 확인했다. 추천 카드가 없는 것만으로 성공이 아니며 빈자료 안내도 정상 완료되지 않았다.

주간 generatedAt={"toString":"not-callable"}는 후보에서는 제외되지만 **renderTodayPanel:4380**이 basisInfo 문구에 원본 객체를 연결해 TypeError를 낸다. 실제 Chrome DOM 확인. typed4는3pass/1fail; 추가 today3은0pass/3fail(출처우회2·객체예외1). parser 통과를 UI 예외0로 보고하지 않는다.

F3 확장77=70pass/7fail이며6실패는F2와 겹치고 독립 today 예외 입력은1종이다. Python190×35=35/35로 비문자열 거부를 확인했다. 기존 Python 주간 canonical KST와 today ISO 처리 허용집합 차이는 별도 기록했고 새 일치로 오산하지 않았다. 정상 KST/JS ISO+09는 유지된다. today 객체 예외는 이전2e485에서도 동일한 **미완결**이다.

**수정 요구:** parser 밖 날짜 추출·sameDay 비교·발행 문구에서도 비문자열 원본에 String/연결 변환을 적용하지 않는다. 검증된 시각/문자열만 사용해 후보 제외·미확인/빈자료 안내를 안정적으로 완료한다. 해당 JSON 객체의 실제 후보/최종/card/Leaflet 예외0, 정상80 차선·0/92/92.5/100·rank108·참고정보 보존을 재시험한다.

## 6. 전체 자동 회귀 및 별도 계약 결과

|자동 스위트|pass|fail|skip|
|---|---:|---:|---:|
|reports-api|178|0|0|
|주간추천 JS|163|0|0|
|프런트9파일|124|0|0|
|Chromium 닫기7+월간조석13|20|0|0|
|추천 카드 DOM|17|0|0|
|Python 기상|56|0|0|
|조석|21|0|1|
|weather-proxy|36|0|0|
|합계|615|0|1|

조석skip은 기존 기간이 지난 공식 표본. 정확 명령/파일/범위/workdir/TAP/hash는 execution_manifest.json/test_summary.json. 프런트9는 today-midnight, field-news, report-search, site-history-cache, recent-contributors, notice-date, briefing-month, tide-fallback, data-autorefresh다.

|별도 독립 시험|pass|fail|구분|
|---|---:|---:|---|
|S2 matrix / 특별 / 팝업|182 /21 /12|0|기존 계약|
|C source core / 절대시각helper|74 /23|0|기존 시각관문|
|C1C2 추가·선상 / JS수치 / Python수치|80 /92 /92|0|무효99→정상80|
|Python 주간 추가|10|0|기존 검사|
|기존 loader Node / Chrome5폭|28 /140|0|F1 해결|
|same-root 추가 Node / Chrome5폭|3 /15|3 /15|F2 복구|
|root/item source matrix|30|30|F2 계약|
|추가 actual loader|4|6|최종 추천 우회|
|Python root/item / 자료형|20 /35|0|JS 차이 별도|
|live merge|3|3|누락 item 적격 유지|
|F3 JS 확장|70|7|F2겹침6·today예외1|
|Chrome 기본5폭 / 문자열진단5폭|245 /10|0|카드·팝업/정상차선|
|원래 lifecycle45 기대|35|10|기존 기대 충돌·결과 보존|
|C/F2 안전 original45 / 일치 control10|45 /10|0|제외·정상복구|
|typed Chrome375|3|1|객체 발행렌더 예외|
|today 추가 Chrome375|0|3|출처우회2·객체예외1|
|일반 E2E target / 최신결합5폭|55 /55|0|기존 기능|

root 검증자도 Node28·same-root Node6/Chrome375 6·today Chrome375 3·root/item 직접60·actual190 Python builder/validator를 독립 재실행해 같은 결론을 확인했다. exit1·JSON 실패를 저장했다. 초회 하네스 의존성·fixture 오류는 initial_harness로 보존하고 제품 실패와 분리했다. 위 실패를615 성공에 합쳐 전체 성공으로 표시하지 않는다.

### lifecycle 기대값 재판정

|시험 ID(각5폭)|이전 기대|C/F2 기대|근거|
|---|---|---|---|
|fresh_today_arrives: root10:31/item10:30|카드14/15|후보/최종/카드 없음·점수미확인·참고 유지|실제builder 적격190 root=item·Python 불일치 거부|
|partial_reference_today: root10:32/item14=10:30|카드14|14도제외·참고유지|같은 출처 계약|
|별도 일치 control root=item10:31|추가대조|14/15복구|actual Chrome 정상|
|별도 부분일치 control root=item14=10:32|추가대조|14복구·15참고|정상/참고 구분|

원래 script/assertion과35/10 실패 원장을 보존했다. 동일 입력2×5 제외는 승인 C/F2와 실제 생성기/validator로 정당화되므로 정상기능 회귀가 아니다. 별도 일치control10을 추가해 기대 변경만으로 복구 검증을 대체하지 않았다. dom-lifecycle_expectation_ledger.json 참조.

## 7. 정상 추천 190곳·176후보 보존

35141c0·최신main **코드**·2e485·a35에 같은10/8 22:40 고정 자료를 사용했다. ON/OFF 모두 후보176·ID/순서·raw/display/rank/bonus/date/time/type/P0·전체190signature·좌표hash 동일, 별도 selector 계산도 실제선발과 같다. 최신main 실시간 기상에서176이라고 확대하지 않는다.


### 제보 ON — 네 버전 동일

|순위|ID·장소|원점수/표시|가점|rank|추천일·시각|유형|
|---:|---|---:|---:|---:|---|---|
|1|108 호곡리|92/92|11|103|2026-10-09 09:00|field|
|2|112 알뜨르비행장|100/100|0|100|2026-10-13 09:00|field|
|3|15 천수만 사기리|92/92|2|94|2026-10-09 09:00|field|
|4|194 천수만 강당리|92/92|2|94|2026-10-09 09:00|field|
|5|126 해리천습지|92/92|2|94|2026-10-09 09:00|mudflat|
|6|14 걸매리|92/92|0|92|2026-10-11 18:00|mudflat|
|7|107 매향리|92/92|0|92|2026-10-11 18:00|mudflat|
|8|48 대진항|92/92|0|92|2026-10-09 09:00|pelagic|
|9|195 평화의공원|92/92|16|108|2026-10-09 09:00|other|
|10|3 굴업도|100/100|0|100|2026-10-09 18:00|other|

### 제보 OFF — 네 버전 동일

|순위|ID·장소|원점수/표시|가점|rank|추천일·시각|유형|
|---:|---|---:|---:|---:|---|---|
|1|112 알뜨르비행장|100/100|0|100|2026-10-13 09:00|field|
|2|7 교동도|92/92|0|92|2026-10-09 12:00|field|
|3|8 석모도|92/92|0|92|2026-10-09 18:00|field|
|4|10 강화도|92/92|0|92|2026-10-09 09:00|field|
|5|126 해리천습지|92/92|0|92|2026-10-09 09:00|mudflat|
|6|14 걸매리|92/92|0|92|2026-10-11 18:00|mudflat|
|7|107 매향리|92/92|0|92|2026-10-11 18:00|mudflat|
|8|48 대진항|92/92|0|92|2026-10-09 09:00|pelagic|
|9|3 굴업도|100/100|0|100|2026-10-09 18:00|other|
|10|5 대청도|100/100|0|100|2026-10-09 18:00|other|

유형은 추천axis이며 서식환경 재분류가 아니다. 전역rank 단독순위가 아닌 기존정원 때문에 rank108이9위인 것은 새 점수 오류가 아니다.

P0: 만조90분허용/91분제외·6/24h절대상한·자정60분·1440분제외·월말/연말/윤평년/잘못된날짜·정상차선/안전대체만조·강수1mm·선상풍속6m/s/파고0.7m/무강수·결측제외가 유지됐다. 공지/mandatory/가점/정원은 **올바르게 부적격 판정된** 자료를 되살리지 않는다. F2의 잘못된 적격승격은 별도로 남는다.

S1-R 보호표현171 누락0·일반17 오탐0·번식6·recent18·legacy submit9·field submit10+breeding6·관리자인증5·owner delete4의 실제 추출 서버 함수/메모리DB 회귀 통과. 과거자료 읽기·대략좌표·삭제·승인/감사 범위 유지. S1-P 승인 후 전면비공개는 구현하지 않았다.

## 8. 최신 main·생성기·validator·CI·rollback

최종 Git 원격 head/main은a35/bf740. GitHub PR metadata의 cached base_sha를 최신main 근거로 쓰지 않았다. 이전main4b164→bf740은 weather_today/week/tide_month3자동파일만 변경. 임시merge-tree 충돌0, 자동5JSON main blob 바이트 동일·제품8파일 head blob 바이트 동일(verification_summary.json). 실제main 병합 없음.

최신 main의20:13KST 발행을 실제21:19KST에 새 Python today/week validator로190/10640 전수검사 통과. JS190도root=item/current적격. 최신결합Chrome은 캡처한21:15:44KST 시계에서5폭55/55, live 정상root=item20:13/current/eligible=true 확인. 이 시각 이후 모든 기간의 적격성을 주장하지 않는다.

actual process_site/build_site_result/main을 합성 provider10:50으로190실행해 root=item/적격190·today/week validator 통과.10:55의ID14 이전자료 재사용은item10:50/stale=true/scoreEligible=false, 다른189는root=item10:55로두validator통과. 오래된 참고자료의 root/item 불일치까지금지하는 기대가 아니다. 정상live/참고정보는 유지하고누락item 계약만미완결.

이전10/9JSON을10/10batch로검증한 Batch date mismatch 입증은 FINAL_DEPLOY_RECHECK의 기존증빙을 이어받았다. 이번은실제10/10main와현재날짜actualbuilder190을별도검사했다. 날짜검사삭제/옛JSON날짜변경/자동자료수정없음.

**PR전용CI 없음·exact SHA Actions0/status0이므로 CI성공 주장 없음.** workflow4개는운영JSON생성/commitpush를포함하므로dispatch/rerun0. 읽기전용 main update-weather [run38047614684](https://github.com/wooil1964/birdmap/actions/runs/38047614684)의schedule/build/validate/commit성공확인(head e5c8124,20:12:55KST). a35CI와구분한다.

실제 공개Worker version·현재보호유지 rollback version·리허설은미확인이다. 문서상의과거ID/로컬Wrangler설정을현재증거로대체하지않는다. **배포준비미완료**로남긴다.

## 9. 잔여 보안 위험과 단독 배포

관련15함수/7파일은2e485와같고새F는공개권한을늘리지않았다. 기존race는이전실제재현+source동일성으로추적하며이번전체재현으로보고하지않는다. 운영사고단정없음.

|기존위험|우선순위·선행조건|
|---|---|
|R5극단숫자문자열/JS·Python 차이|별도P2. 비신뢰weather쓰기/실제유입도입시사전필수검증으로격상. F3시각타입으로해결됐다고보고하지않음.|
|삭제후oldGET마커복귀|별도P1보안PR최우선. 서버삭제유지/UI철회미완결. 실제개인정보·민감위치철회가요구되는전환이면해결전배포차단. 제한S1-R/C의신규노출증거없어이사유만으로추가차단을단정하지않음.|
|보호상태old응답/길안내복귀|별도P1. 서버 재분류·fieldhide·S1-P 전환 전 필수 차단. S1-R 배포로 과거 공개자료가 새 보호 상태로 전환되는 경우도 포함한다. 실제 전환 영향은 이번 운영 원자료에서 확인하지 않았다. 이미도착한자료의늦은재적용은fresh서버제외만으로해결되지않음.|
|S1-P승인후공개/간접위치|별도사용자정책승인·서버/캐시회수·길안내/집계검증후시행. S1-R표현방어와구분.|

현재PR은위잔여문제와별개로F2/F3때문에단독배포불가다. 별도정책을몰래구현하지않았다.

## 10. 최종 보완 및 배포 준비 순서

1. F2-a양측명시적발행/PythonJS일치, F2-b동일root교정복구, F3parser밖객체날짜/렌더예외를새구현SHA에서보완한다. 본검증자는제품을수정하지않는다.
2. 실패안전성공기대와actual loader/최종/Chrome카드·팝업을유지해재검증한다. 기존615/S2/P0/S1-R/정상190176/동일발행위험보존/5폭/latestmain을영향범위대로확인한다.
3. 통과후현재Workerversion·보호유지rollback·PagesrollbackGitSHA·CI미구축의대체검증증거·배포후갱신관찰계획을고정한다. 미확인을준비완료로넘기지않는다.
4. 사용자별도운영승인후에만 **서버S1-R선배포→보호읽기검증→Pages→자동기상갱신/추천복구확인** 순서를검토한다. rollback은취약서버로무조건되돌리지않고보호유지대상을먼저확보한다.

제품수정·main병합·Pages/Worker배포·D1·실사용자변경0. 새보완SHA와사용자별도승인대기.

## 11. 재현·증거

- [자동8명령/TAP](results/f123-a35b859/execution_manifest.json) · [계약/Python명령](results/f123-a35b859/contract-execution_manifest.json) · [Chrome명령](results/f123-a35b859/dom-execution_manifest.json) · [root재실행](results/f123-a35b859/root_execution_manifest.json)
- [전수·blob교차증빙](results/f123-a35b859/verification_summary.json) · [F2/F3source감사](results/f123-a35b859/F23_CONTRACT_AUDIT.md) · [loader비교](results/f123-a35b859/loader-REPORT.md)
- [DOM검증](results/f123-a35b859/dom-DOM_REPORT.md) · [기존lifecycle실패원장](results/f123-a35b859/dom-lifecycle_expectation_ledger.json) · [정상190전수](results/f123-a35b859/independent_replay.json)
- [rootChrome today실패3](results/f123-a35b859/root-today-dom/additional_today_dom.json)

이 보고서는 실제 실행 결과로 작성했다. 자동615성공과 별도 안전계약 실패를 전체성공으로 합산하지 않는다.

게시 완료: [PR #13 최종 판정](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6097679288), [Issue #9 동일 판정](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6097679798). API readback에서 게시 본문 전체가 준비한 본문과 정확히 일치함을 확인했다. 보고서 commit86a93e726096820cc2e9e59228d08176250f6705, 게시 증빙 results/f123-a35b859/github_receipts.json. 새 보완 SHA 및 사용자 별도 승인 대기.
