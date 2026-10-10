# PR #13 — F2·F3 최종 독립 검증

## 1. 종합 판정

**조건부 승인.** 검증 대상은 **b12e20c1b6d856a021898a0c1c9221b30393a221**이다. 이전 a35b8598의 F2-a 명시적 발행 출처, F2-b 동일 root 교정 복구, F3 parser 밖 객체형 시각 예외는 실제 제품 함수·로더·Chrome에서 해결됐다. 새 배포 차단 추천 우회는 확인되지 않았다.

자동 회귀는 직접 실행하여 **621 pass / 0 fail / 1 skip**을 확인했다. 이 수치에 독립 추가 시험이나 원형 진단 실패를 합쳐 전부 성공이라고 보고하지 않는다. 정상 고정 자료의 190곳·176후보, 제보 ON/OFF 전체 signature 및 상위10은 불변이다.

운영 Worker의 현재 버전·보호 유지 rollback 검증과 보호 상태 전환 시 기존 캐시 위험의 선행 처리는 운영 승인 조건이다. PR 전용 CI가 없어 CI 성공을 주장하지 않는다. 이 판정은 운영 배포 실행 허가가 아니며 사용자의 별도 승인을 기다린다.

## 2. 대상과 방법

- 정확 head: b12e20c1b6d856a021898a0c1c9221b30393a221.
- 이전 차단: a35b8598d55890e705042e4d6f88621357749d09.
- 10/10 검증 main: bf74095adb3bf0b13f1aca31193c8d03cf8ff53f, 임시 tree1065b16fcba94eeeb1a300d9b1e1953be9bfc65e.
- 10/11 최종 main 결합: 아래 최신 결합 절 및 finalmain 증빙 참조.
- AI_WORK_RULES, F123_RECHECK, FINDINGS, NEXT_SESSION, 구현 보고6097853553와 새 diff를 읽고 기존 검증에서 이어받았다. P1-A~D를 반복하지 않았다.
- 독립 정확 Git archive의 제품 함수를 추출하거나 실제 Chrome/Leaflet에서 실행했다. 구현자 loadApi의 root 자동 보정 adapter로 malformed 입력을 정상화하지 않았다.
- target index LF SHA256: 0e807c2e0ad380a9c60eddb7e69a6abe34382c72a5a20175c71aa863d8ac0d69. archive CRLF와 Git LF 차이만 정규화하여 일치 검증.
- 기본 계약 시계는 2026-10-10 11:00 KST, 정상 추천 재현은 2026-10-08 22:40 KST다. 최신 main은 별도의 실제 캡처 시각을 기록한다.
- 제품 수정·실제 main 병합·Pages/Worker 배포·D1·실사용자 POST/DELETE 모두0. 공개 승인 스냅샷·합성 DB/API만 사용하고 민감 원좌표·secret·Chrome profile은 저장하지 않는다.

## 3. F2-a — 양측 발행 출처

**통과.** root/item 각각 generatedAt missing, null, empty, 배열, 객체, 숫자, boolean, 무효/불일치를 실제 일반·갯벌·섬 today 후보/최종에 넣어60/60 통과했다. 부적격 원점수92나 가점16/rank108로 후보를 되살리지 않는다. 선상 today-only는 기존 정책상 후보를 만들지 않으며 주간 선상 typed 경로도 검증했다.

storedWeatherState(index.html2066~2086)는 원본 문자열만 읽고 root와 item의 엄격 parser 결과·같은 절대 순간·미래 여부를 확인한다. 없는 item을 root로 대신해서 적격 승격하지 않는다. 반환되는 참고 metadata와 점수 적격성을 분리한다.

실제190 Python validator F2 20/20, F3 35/35 통과. 실제 process_site/build_site_result/main의 정상190은 root=item10:50/적격190, 재사용 대조는 root10:55/item14=10:50/stale=true/eligible=false와 나머지189의 동일 발행으로 today/week 모두 통과했다. generatedAt이 다른 참고 행까지 일률 삭제하는 정책이 아니다.

live merge6/6에서는 원본 불변, 정상 점수 유지, missing/null/empty/mismatch/stale은 적합도 미확인을 확인했다. Chrome 객체형 today root/item2조건 및 기존 today3조건도 후보·최종·카드·Leaflet 예외0, 참고 기온·풍향 유지다.

### Python·JS 계약의 정확한 범위

|입력|Python 저장 validator|JS 현재 추천|
|---|---|---|
|canonical KST 양측 동일 정상|수락|정상92/rank108|
|양측 누락·null·배열·무효|거부|추천 제외|
|동일 순간 KST/ISO 혼합 또는 양측 ISO+09|거부(strict KST/raw equality)|기존 parser 허용·정상 조건이면 적격|
|양측 미래 KST12:30(평가11:00)|저장 schema 수락|현재 적격 false·최종0|
|양측 오래된 KST05:41|저장 schema 수락|기간/갱신 검사에 따라 최종0|

Python은 canonical KST 생성 스키마와 저장자료 구조를 검증하며 JS는 기존 ISO+09 허용 및 현재시각 검증을 수행한다. 전체 허용 입력 집합·시간 범위가 동일하다고 주장하지 않는다. 실제 생성기와 main 정상190은 canonical KST를 출력해 일치한다. 이 표현/저장검증 차이에서는 비정상 최종 추천 우회가 재현되지 않았다. 결과는 contract/js_contract_differences.json 및 python_contract_differences.json에 별도 보존했다.

## 4. F2-b — 정확한 연속 입력과 복구

**통과.** 다음 입력을 실제 loadWeatherToday·최종 선발·Chrome 카드에서 실행했다.

|단계|입력|실제 적용|최종 추천|유지 상태|
|---:|---|---|---:|---|
|1|root1040/item1040, 강수1mm|true|0|검증된 위험1040|
|2|root1050/item1030, 강수0|false|0|1040/1040 보존|
|3|root1050/item1050, 강수0|true|1|1050/1050·92/bonus16/rank108|

Node와 Chrome344·375·768·1024·1440px 모두 **적용[true,false,true], 추천[0,0,1]**. exact_F2_assertions.json은 적용 순서를 별도로 assert하여 카드 개수만으로 성공 처리하지 않았다. 같은 관측치의 추가 assertion을 별도 독립 스위트처럼 합산하지 않는다.

이전 a35는 동일 입력의 적용[true,true,false], 추천[0,0,0]으로 재현됐다. 새 loadBirdmapData(index4553)·loadWeatherToday(4579)는 혼합 발행을 검증된 비교 기준으로 인정하지 않고 같은 root 교정본을 받는다. 이미 검증된 동일 발행의 내용 충돌은 계속 차단한다.

역방향 불일치·최초 혼합·같은 root 교정·검증된 같은 발행 충돌·다음 정상 발행도 Node6/6·Chrome30/30. F1 기존28/140 및 별도 loader 확장10/10 통과. 요청 순번 역전, 과거 발행, 미래 최초/중간 도착, 자정, today/week 독립이 유지된다.

실제 만료 검증은 미래 만조/예보15:30을 고정하여14:17 예정 작업+30분 후14:48에 기존1040 추천이0으로 끝나는지 확인했다. 혼합1440/1435 거부0, 정상1440/1440 적용1로 복구했다. 최신 정상 뒤 새 위험자료도 적용하여0으로 전환된다.

### 성공으로 바꾸지 않은 별도 진단

일반 malformed forecast 배열/date 배열/scoreEligible 문자열은 generatedAt이 일관되면 발행 비교 기준으로 저장될 수 있어 동일 root 정상 교정이0→0으로 남는 가용성 진단3건이 있다. 금지 자료의 추천·TypeError는0. 요청된 root/item 불일치 복구와 검증된 동일 발행 충돌 방어를 구분한다. 이3건은 신규 안전 통과 집계에 포함하지 않는다.

최초 추가 만료fixture는12:30에1040 배치가 만료됐다고 가정했지만 실제 due는10:17이었다. 원래28의12:30 카드0은 만조12시가 과거가 된 결과였다. 최초7조건3/4 원장·exit1·script를 보존하고 실제14:48 만료 시험을 따로 기록했다. assertion 삭제로 성공시키지 않았다.

## 5. F3 — 객체형 시각과 차선 예보

**통과.** typed77/77, parser7/7, live6/6, TypeError0. forecastTime와 generatedAt 각각 원본 문자열·배열·객체(특히 toString:not-callable)·숫자·boolean·null 및 ISO+09를 실제 일반·갯벌·섬·선상·today 후보/최종에서 검증했다.

원본 typeof 검사 이후 엄격 parser를 호출하며 weeklySampleMinutes(3697), weeklySampleAsWeather(3797), storedWeatherState/live, 공지/mandatory 이유, 주간 coverage(4294), renderTodayPanel(4367)의 String/렌더 경로도 예외 없이 완료했다.

배열형 무효 최고99는 후보에서 제외되고 정상 차선 원점수80·가점16·rank96이 유지된다. 실제 카드와 Leaflet 팝업80점 표시를 확인했다. 정상0·92·92.5·100 표시 및92+16의 내부108 허용도 유지된다.

root 검증자도 함수 F2/F3/live60/77/6, 동일root Node6/Chrome375 6, Python20/35와 정상/stale builder, today generated 객체Chrome2를 별도로 재실행했다. 초회 출력 폴더/fixture env 오류와 사용량에 따른 승인 검사 미실행은 root_execution_manifest.json에 제품 실패와 분리했다. 동일 assertion 재실행 exit0이다.

## 6. 자동 회귀와 독립 추가 결과

|자동 범위|pass|fail|skip|
|---|---:|---:|---:|
|reports-api|178|0|0|
|주간 추천|165|0|0|
|프런트9파일|127|0|0|
|Chrome 공지 닫기·월간 조석|20|0|0|
|추천 카드 DOM|18|0|0|
|Python 기상|56|0|0|
|Python 조석|21|0|1|
|weather-proxy|36|0|0|
|합계|621|0|1|

실제 파일과 명령은 execution_manifest.json, TAP 원장 및 SHA256은 test_summary.json. skip은 공식 조석 sample 날짜가 rolling monthly window 밖인 기존1건이다. 이전615에서 추가된 주간2·프런트3·카드1을 포함한다.

|독립 추가 범위|통과|실패/제한|
|---|---:|---|
|S2 matrix/특별/팝업|182/21/12|0|
|C source/helper|74/23|0, 별도 schema4 원장|
|C1C2 추가/JS수치/Python수치/week validator|80/92/92/10|0|
|F2/F3/live|60/77/6|0|
|Python F2/F3 실제190|20/35|0|
|F1 Node/Chrome5폭|28/140|0|
|F2 same-root Node/Chrome5폭|6/30|0|
|기본 Chrome/무효 문자열|245/10|0|
|typed DOM/today/발행 객체 DOM|4/3/2|0|
|원형 lifecycle45|35|10 보존|
|C/F2 안전 lifecycle45|45|0|
|이전 safe+control55 그대로|50|5 보존|
|정상 builder-shaped matched control|10|0|
|무효 혼합 control 거부·정상 자료 보존|5|0|
|원형 선상65|40|25 보존|
|일반 E2E target/10·10 결합|55/55|0|

다른 관측치·별도 반복시험을621 합계에 중복 가산하지 않는다. 새10/11 결합 E2E는 최신 결합 절에 별도 기록한다.

## 7. lifecycle·선상 실패 판정

|시험(각5폭)|원형 기대|실제 계약과 판단|
|---|---|---|
|fresh_today_arrives root1031/item1030|카드14/15|불일치 제외가 승인C/F2와 실제builder/validator에 합치|
|partial_reference_today root1032/item14=1030|카드14|불일치 제외·참고정보 유지|
|원래 partial matched control의 item15=0541, eligible=true/stale=false|정상1032 적용|일관된1031 후 혼합batch 거부·정상1031 보존|
|builder-shaped item15=0541, eligible=false/stale=true|14복구·15참고|적용·14복구·15미확인/기온풍향 유지|

원형35/45 및 이전 control50/55 결과는 보존했다. 새 입력은 실제builder 재사용 flag를 따랐으며 제품 guard나 기존 실패 assertion을 완화하지 않았다. 참조 lifecycle_expectation_ledger.json, matched_controls/matched_controls.json.

선상40/65의25건은5조건×5폭에서 카드13:00 안전 대안80/rank96과 장소 팝업12:00 대표 예보99가 다른 기존 의미/안내 문제다. 추천 최종은 안전한13시만 남긴다. 팝업의 별점·기상 해설·여객선 표시가 선상탐조 안전 관문과 같은 뜻인지 오해 가능성이 남아 있어 전부 성공으로 처리하지 않는다. 원형 boat JSON과 boat_contract_reassessment.json에 원시 시각·값·안전 상태·실제 문구를 보존했다. 합성99점이 실제 생성 배치에서 관측됐다는 증거나 실제 사고를 주장하지 않는다. 이번 F2/F3가 이 안내 문제까지 해결했다고 보고하지 않는다.

## 8. 정상 추천 전수 보존

35141c0·main 코드·a35·b12에 같은2026-10-08 22:40 입력을 사용했다. 190곳·176후보, 후보ID/순서·원점수·화면점수·rank·bonus·추천일/시각·유형·P0·전체190signature·좌표hash가 ON/OFF 모두 동일하다. 독립 selector 계산과 실제선발도 일치한다. 최신 실시간 자료에서도176이라고 확대하지 않는다.

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


추천 유형은 기존 axis이며 서식환경 분류가 아니다. rank108이 전역1위가 아닌 기존 정원 영향도 그대로다. 배점·정원·ID 동점 정책을 운영에 적용하지 않았다.

P0의 만조90/91분·6/24시간 간격의90분 절대상한·자정60분·1440분 차단·달력 경계·정상 차선/대체 만조, 강수1mm, 선상 풍속6m/s·파고0.7m·무강수·필수 결측 제외가 유지된다. 공지/mandatory/가점/정원 보충이 부적격 자료를 되살리지 않는다.

S1-R 보호 표현171 누락0·일반17 오탐0. 번식6·최근 집계18·legacy submit9·현장소식10+번식6·관리자인증5·본인삭제4의 실제 서버 함수/메모리 DB 회귀 통과. 승인·감사·대략좌표·삭제 정책 유지. S1-P 전면 비공개 정책은 범위 밖이다.

## 9. 최신 main·CI·기상 날짜

첫 재개 시 확인한 main은 b596cdc8ede83fe25e64ec10b2dc88d4141673b2, 임시 merge-tree2c3703e7234f9f0ab02786f03d03a2314bf5cfcf다. 충돌0이며 실제main 병합은 하지 않았다. 새main에는 c361342 TMAP 추가와528337e 보고 팝업 링크 공존 변경이 포함됐다.

자동5JSON은 main blob과 동일하다. 제품8파일 head 동일성은7/8이며 index가main TMAP 변경을 함께 보존하므로 strict8 assertion exit1을 보존했다. 추천·저장·loader·live·parser137/137 실제함수와 추천constants는 b12와 동일하고 siteData전체JSON·좌표190/190도 동일하다. main의 navigation12함수는 결합에서 보존됐다. root도별도111함수·siteData/좌표·자동5blob을교차확인했다.

실제10/11 06:50:11~12KST Python검사는 today190/week10640 모두통과했다. 자료는10/11 04:16KST발행·04:18갱신이다. 실제06:51:54JS평가는 today190모두 갱신지연 참고상태/current=false/eligible=false이며 scoreAllowed0이었다. 정상주간docVerified=true에서후보176·최종10이선택되고모두safe/eligible·예외0이다. 이번현자료는제보OFF이며10/8고정자료나운영제보ON을섞지않았다. 현재topIDs7,8,10,15,126,107,14,48,3,5는고정10/8의OFF목록과도별도시각/자료결과다.

새main영향unit은 midnight17/17·history16/16·autorefresh31/31·field_news7/9, 합계71/73이다. field2실패는카카오버튼옛문구와자동window.open 기대가main의새문구/직접앱선택chooser와달라생긴다. exact main에도같은7/9·같은testblob/실패원인이재현돼PR신규회귀로판정하지않는다. 실패를삭제하거나621자동통과에합산하지않았다.

실제Chrome344·375·768·1024·1440px에서 최신main 계약 E2E55/55·전체부적격empty/정상원본복구10/10·현재marker 범위를 명시한일반/보호Kakao·TMAP20/20, 페이지예외0을확인했다. storedtoday참고→정상week_forecast/current/eligible 대안선택을실제DOM에서확인했다. 최신notice변경후별도5폭E2E는아래최종갱신추가기록으로분리한다.

원형현재E2E45/55의10실패는 rawtoday를무효로만든상황에도정상주간대안이있어서팝업미확인을기대할수없었던차이다. 새시험에서는rawtoday참고계약확인때만week대안을별도로제거하고, 원본today/week복구시10카드와적격week파생점수가복구되는지추가확인했다. 원형assertion과실패원장을보존했다.

초기TMAP15/20의5실패는닫히는이전일반Leaflet팝업을global querySelector가읽은범위오류였다. 실제현재marker.getPopup().getElement()에서는보호팝업hidden-note=true/카카오0/TMAP0이고일반팝업은두링크를유지해20/20이다. 최초15/20원장도보존했다. 티맵앱을실제로실행하지않았으며Chrome화면폭시험은물리모바일/GPS/설치앱검증을대체하지않는다.

선상잔여표시의실제기준도대조했다. 선상추천은원본wind<=6/wave<=0.7/무강수, 기존여객선안내는표시값을읽어wind7/wave1.5부터주의,11/2부터위험이다. 대표기상/여객선과선상탐조추천은같은판정이아니다. 실제generator순수계산은wind6.01→85, wave0.701/강수0.001→92이며엄격선상안전추천에서는모두제외된다. 합성99를실제생성사례로주장하지않는다. 이전352와b12의기존팝업5조건도같아신규F2/F3회귀로합산하지않았다.

정확 refs/tree/clock·strict실패·mainbaseline은 finalmain/의source_manifest.json,main_delta_impact.json,latest_main_validator.json,js_current190.json,unit_checks.json과execution_receipts.json에있다. raw좌표대신hash만저장했다.

최신main기상schedule run38079151621(10/11 04:16~04:18KST), 월간조석run38088304953(06:37KST)의build/validate/commitstep 성공을읽기전용으로확인했다. main Pages38088325736성공도 b12PR배포나CI성공과다른사실이다. deployment_readonly/github_metadata_readonly.json 참조.

10/10의 current 검증과10/11 새main 검증은 별도 기록한다. 이전10/9 JSON을10/10 현재 배치로 검사한 Batch date mismatch 근거는 FINAL_DEPLOY_RECHECK에서 이어받았다. 실제 생성일 고정 시험과 실제 현재 배치/정상 합성builder는 별도로 검사했으며 날짜 검사 삭제·과거JSON날짜 변경·자동JSON수정은0.

PR 전용 검증 CI가 미구축이다. head b12의 all-event Actions 및 commit status 조회 결과를 저장하고, 기존 main 자동갱신 성공과 구분한다. 4개 workflow는 운영JSON 생성·commit/push를 포함해 임의 dispatch/rerun하지 않았다. 수동 독립 exact-SHA 증빙을 병합 검토 근거로 채택할지는 운영 승인 항목이며 CI 성공으로 대체 표기하지 않는다.

### 게시 전 최종 main 갱신

최종 확인 main은 **89e7e339812fbd9c096008cb5631c88fd8765c03**, 임시 tree **e02191c1ca4cc00e0faedab2ffd4e10b14c537e2**다. b596 대비 **notices.json만** 변경됐다(10월 출현종 공개 공지3개). 자동기상 갱신이라고 추정하지 않고 실제diff를확인했다. 제품·기상/조석·137함수·탐조지190/좌표는불변이며 최신공지도mainblob을보존한다.

새공지입력으로 실제07:00:50~53KST validators와후보/최종을추가실행했다. today190은같은갱신지연reference/scoreAllowed0, 정상week후보176·최종10all safe/eligible·예외0이고직전현재topID/점수와같다. 과거22:40입력을이시험에섞지않았다.

새결합 실제Chrome평가는07:00:45.7677508KST다. 일반5폭55/55·예외0, rawtoday참고상태유지/activeweek현재적격·정상10카드·현장소식등록/본인삭제/보호길안내/오류보존을확인했다. archive10파일과exacttree는일치하며직전대비공지외9파일이같다. 빈목록·복구10과scopedTMAP20은직전검증+소스불변근거로재사용하고새로합산하지않았다. finaldom/FINAL89_DOM_REPORT.md 및final89_execution_manifest.json 참조.

최종원격확인시각과공지입력보존·전체후보적격검사 결과는 finalmain/final_notice 증빙에따로있다. 게시후예약갱신까지미래무변경을보증하는판정이아니다.
## 10. 잔여 위험·운영 선행 조건

|항목|판단과 선행 조건|
|---|---|
|운영 Worker/rollback|공개 Worker settings/deployments/versions/content 읽기전용 GET은401, admin metadata는429로 확인 실패했다. 기존 인증을 메모리에서 사용했으며 token/secret/raw source 저장·인증refresh·POST/D1/배포0. 현재 version과 보호 유지 rollback은 미확인이다. 과거 문서ID·로컬Wrangler·Git SHA로 현재 운영 증거를 대체하지 않는다. 운영 전 확인 필수.|
|R5 극단 숫자 문자열|기존 별도P2. 이번 시각 F3로 해결되지 않음. 현재 신뢰된 생성경로/최종 차단 시험에서 새 우회 증거 없음.|
|삭제 후 늦은GET 마커 복귀|별도P1 보안 위험 유지. 서버 실제삭제가 DOM의 과거 응답 철회까지 보증하지 않음. 개인정보·민감위치 철회가 운영 전환 요구이면 그 전환 전에 cache 경합을 해결해야 함.|
|보호 상태 역전·길안내 복귀|서버 재분류/fieldhide/S1-P 전환 전 필수 선행 차단. S1-R 때문에 과거 공개자료가 새 보호 상태가 되는 경우도 포함. 실제 운영 대상 영향은 원자료를 외부 저장하지 않는 읽기전용 점검으로 먼저 확인해야 함.|
|S1-P 승인 후 공개/간접위치|별도 사용자 정책 승인·서버와 cache 회수·길안내/집계 검증 후 시행. 표현 방어S1-R과 구분.|
|동일 발행 malformed 교정·대표시각 안내|위 진단 원장에 남는 가용성/설명 한계. 금지 후보 복귀 또는 새F2/F3 회귀로 판정하지 않음.|

R5/field15함수 및 backend/builder7파일은 a35→b12 source hash가 같다. 신규 노출이나 실제 유출 사고의 증거는 없다. 그러나 기존 결함이라는 이유로 보호 전환의 cache 위험을 무시하지 않는다.

현재 제한된 출처·시각·추천 계약은 통과했다. 실제 보호 전환 영향이 확인되지 않은 상태에서 무조건 단독 배포 가능이라고 판정하지 않는다. 현장소식 철회/보호 재분류가 수반되면 별도P1 조치를 해당 운영 전환의 선행 조건으로 적용한다.

## 11. 최종 승인 조건과 순서

1. 공개 Worker의 실제 현재 버전, S1-R 보호를 유지하는 rollback 대상, Pages rollback Git SHA와 배포 전환 영향 근거를 확정한다. 목록에 버전이 있다는 것만으로 보호 유지가 검증된 것은 아니다.
2. 보호 재분류·민감정보 철회가 필요한 경우 기존 삭제/보호 응답 경합을 해당 전환 전에 차단한다. 영향이 없으면 제한S1-R/C 배포 범위와 근거를 기록한다.
3. 최신main 병합 시 자동JSON을 보존하고 exact head 검증 증빙을 채택한다. head나 제품 코드가 바뀌면 영향 시험을 다시 실행한다.
4. 사용자 별도 승인 이후에만 서버S1-R 선배포→보호 읽기 확인→Pages→자동 기상 정상배치/validator/추천 제외·복구 확인 순서를 검토한다.
5. 롤백은 보호가 약한 서버로 단순 회귀하지 않고 미리 확보한 보호 유지 버전과 Pages SHA를 함께 관리한다.

추가 제품 구현을 수행하지 않았다. 이 문서는 검증 브랜치의 분석·합성 증거이며 병합·배포·D1 실행 기록이 아니다. 게시 완료 링크와 보고서 commit은 NEXT_SESSION 및 github_receipts.json에서 확인한다.

## 12. 재현과 산출물

기준 경로: docs/p1-s-review/scripts/f23-b12e20c 및 results/f23-b12e20c. 전체 자동 명령은 execution_manifest.json, 독립 범위별 명령은 contract/execution_manifest.json, dom/execution_manifest.json, loader 각 실행 manifest, root_execution_manifest.json. 정확 데이터/코드 hash는 각 source/artifact manifest와 independent_replay.json.

대표 명령(절대경로 인자 사용):
- node contract/contract_matrix.mjs <exact target> <out> <analysis> <combined>
- node loader/loader_contractF_node.mjs <target> <out> <head>
- LOADER_WIDTHS=375 node loader/loader_contractF_dom.mjs <target> <out> <head>
- <Python> contract/python_contract.py <target> <out>
- C_GENERATOR_FIXTURE=<fixed fixture> node dom/additional_generated_object_dom.mjs <target> <out> <head>
- node independent_replay.mjs <review> <analysis> <out>
- node protection_regression.mjs <target> <out>

Git archive로 정확 head와 임시 merge-tree를 재생성한 뒤 실행한다. review의 역사적 index를 제품 검증에 쓰지 않는다. fixture·원형 실패 원장은 덮어쓰지 않는다. 민감 좌표는 hash만 전수 비교한다.


## b12e20c 최종 게시 및 readback 완료 (2026-10-11)
보고서 증거 commit: `dde70ebe2b1be6802d352298766feb8ac92b5b96`.
- PR #13: https://github.com/wooil1964/birdmap/pull/13#issuecomment-6102686789
- Issue #9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6102688337
두 댓글을 API로 다시 읽어 준비한 2,199자 본문과 각각 전체 일치함을 확인했다. 본문은 `results/f23-b12e20c/FINAL_F23_COMMENT.md`, 게시 증빙은 `results/f23-b12e20c/github_receipts.json`에 저장했다. 최종 판정은 조건부 승인이다. 운영 승인 조건은 F23_RECHECK.md 및 NEXT_SESSION.md에 기재했으며 제품 코드·main·Pages/Worker·D1·실사용자 데이터를 변경하지 않았다. 검증 브랜치 증빙 저장을 완료한 후 별도 운영 승인을 기다린다. 마지막 증빙 commit은 review/p1-s-pr13의 git log -1에서 확인한다.


## Worker 메타데이터 추가 확인 — 2026-10-11 07:23 KST

사용자가 지정한 두 `wrangler versions view`와 추가 읽기 전용 `wrangler deployments list`를 Wrangler 4.149.0으로 실행해 모두 exit 0을 확인했다.

| 버전 | 생성 시각 KST | 배포 이력 판단 |
|---|---|---|
| `494b97d1-69ab-40f7-bbbf-e8c6e3c5effc` | 2026-10-08 14:19:39.572 | 조회 시점 최신 배포, 100% 적용 |
| `16dae92a-4bd7-4fda-ba90-d5075604d4db` | 2026-10-06 23:58:25.144 | 직전 배포 버전 |

표시된 바인딩과 secret 이름은 두 버전이 같고 `CANONICAL_DUAL_WRITE`가 유지된다. Secret 값은 읽지 않았다. 원본 설정·계정 이메일·D1 ID는 증거 파일에 저장하지 않았다.

이 추가 확인으로 **현재 운영 Worker 버전 미확인 조건은 해소**됐다. 이전 HTTP 401/429 기록은 당시의 실패 증거로 보존한다. 두 버전 모두 source/tag/message만으로 실제 제품 코드나 S1-R 보호 기능을 입증할 수 없으므로 **보호 유지 rollback 대상 확인 조건은 미해결**이다. 직전 버전을 보호 유지 rollback으로 승인하지 않는다.

최종 판정은 **조건부 승인 유지**. Pages rollback SHA, 실제 보호 전환 영향 및 전환 시 cache 보안 선행 조건은 그대로 남는다. 제품 코드 변경·배포·rollback·D1·실사용자 데이터 변경은 0이다.

정제 증빙: `results/f23-b12e20c/worker_versions_readonly.json`.


Worker 추가 확인 게시 완료: [PR #13](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6102822780), [Issue #9](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6102823104). 두 댓글의 870자 본문을 API로 재조회해 전체 일치를 확인했다. 증빙은 results/f23-b12e20c/worker_versions_github_receipts.json, 본문은 WORKER_VERSIONS_COMMENT.md. 현재 Worker 확인 조건만 해소됐으며 보호 유지 rollback 및 별도 운영 승인 조건은 남는다.
