# PR #13 C 정책 최종 독립 안전 검증

## 1. 종합 판정: 수정 필요

대상 352315a57d038687807dbe0044c136a22fb0c9c5의 기존 1,440분 today 오류와 이미 참고로 판정된 today 자료의 추천 잔존은 해결됐다. 정상 190곳·176후보, 제보 ON/OFF 추천 순위 및 기존 안전 관문도 유지됐다. 그러나 검증되지 않은 주간 발행·예보 시각이 적격 출처로 승격되고, 나중 요청의 이전 발행자료가 최신 위험 예보를 덮어써 추천을 복구하는 반례가 남았다. 승인된 “검증된 현재 자료만” C 정책이 전체 경로에서 완성됐다고 판정할 수 없다.

사용자는 C만 승인했다. 제한적 갱신 지연 예외 B는 승인하지 않았으며 이번 검증에서도 적용하지 않았다. 아래 실패는 합성 계약 반례다. 운영에서 발생한 빈도·실제 당시 강수·민감정보 유출 사고를 관측했다고 주장하지 않는다. 남은 경로들은 이전 코드에도 존재하므로 신규 정상 기능 회귀로 과장하지 않는다. 기존 결함이라는 사실만으로 이번 안전 계약의 차단 근거를 무시하지도 않는다.

## 2. 정확한 코드·자료·검증 범위

- head: 352315a57d038687807dbe0044c136a22fb0c9c5
- before: e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
- 최신 원격 main: b0975cad9f3112af38cc286a892bf6f06722ce12 (마지막 ls-remote 재확인)
- 임시 merge-tree: 0a32d8b656405ba3ee8cf85dc0208b9e0aa3d3d6 / 충돌0. 실제 branch 병합 아님.
- 독립 검증 브랜치: review/p1-s-pr13. 제품 checkout/운영 코드 수정 없음.
- AI_WORK_RULES.md·R6_RECHECK.md·FINDINGS.md·NEXT_SESSION.md·C 전체 diff와 구현 보고 댓글6082482919를 먼저 확인했다. P1-A~D는 반복하지 않았다.
- 고정 평가: 2026-10-08 22:40 KST. 기존 manifest16파일과 공개 승인 제보11곳 스냅샷의 hash 보존. 탐조지·좌표는 전체 hash 비교하고 좌표값은 보고하지 않았다.
- 독립 시간/loader/DOM 합성 검사는 별도 2026-10-10 11:00 KST. 현재 main 운영 자료 검사는 별도 2026-10-09 21:10 KST. 서로 섞어 알고리즘 변화로 해석하지 않았다.
- 실제 제품 함수 추출·실제 Chrome/Leaflet DOM·Python builder/validator를 사용했다. 검사를 통과시키는 제품 가드 래퍼/패치는 없다. API는 합성 메모리 데이터이며 외부 Worker 요청은 페이지 탐색 전부터 합성 처리했다.

## 3. 해결된 C·P0·S1-R 검증

### 1,440분 반례

평가 10월10일11:00, raw.date=2026-10-10, forecastTime=2026-10-09 12:00, 만조10월10일12:00, 원점수92, 제보16, 공지에 따른 mandatory=true를 그대로 제품 함수로 호출했다. KST 명시 표현도 별도 비교했다. before는 후보·최종 true, rank108이다. C는 후보null·최종목록 없음·ranknull이며 팝업은 “오늘 적합도 미확인”으로 기상 참고정보를 유지한다. 일반/조석 두 경로를 포함한20조건에서 before 후보16(참고14 포함)→C 후보2(정상2만)이다. 이 exact 반례는 해결됐다.

weeklyKstTimestamp3880, weeklyForecastTimestamp3887, weeklyTideTimestamp3893, weeklyTideForecastGapMinutes3899의 독립 helper23/23 통과. 90분 허용·91분 차단·자정60분·전후날1440분·월말·연말·윤년/평년·4월31일·24시·60분 및 timezone 오류를 확인했다. 3/6/24시간 간격×90/91/120분9개 실제 선발 control도 통과했다. 조석의 무효 최고99점 예보는 정상13:00/80점 차선(만조12:00,60분 차)으로 전환했고 안전한 다른 날짜/같은 날 대체 만조도 유지됐다. 정상 미래 주간 예보는 허용된다. 미래 예보와 미래 발행은 구분한다.

weeklyTodayWeather3908은 storedWeatherState2066을 사용하고 부적격 참고 today를 null로 제외한다. weeklyRecommendationEligible3916 및 weeklyRecommendationForSite4114/todayRecommendedSites4229의 후보·최종 가드가 추가됐다. previous_saved, 예정 갱신 경과, future/bad/missing generatedAt, 전날 forecast·missing/unparseable time은 이 today 계약에서 제외된다. 정상 week가 있으면 참고 today 때문에 week를 차단하지 않는다. 별도 아래의 미검증 주간 true 승격은 이 성공 범위에 포함하지 않는다.

강수1mm, 선상풍속6m/s·파고0.7m, 결측 제외와 90분 절대 상한은 유지됐다. 공지·가점·정원 자체가 부적격 today를 되살리지 않았다. 원점수0·92·92.5·100 유효, 내부 rank108 허용, 풍향/기온/조석 참고 보존도 통과했다. 별점과 원점수를 rank로 바꾸지 않았다.

S1-R 실제 보호 표현171개 누락0, 일반종17개 오탐0; 기존 번식6, 최근집계18, legacy9, 현장소식10/번식6, 관리자 인증5, 본인 삭제4 회귀 assertion 모두 통과. 저어새 수량·혼합 구분자·LF/CRLF·과거 슬래시 및 일반종 수량을 포함한다. 보호 입력을 최근 가점에서 제외하는 기존 정책은 유지했다. S1-R과 승인 후 전면 비공개 S1-P는 다르다.

## 4. 남은 차단 결함과 구체적인 보완 요청

### C1 — 주간 발행 출처 미검증 (배포 전 필수)

평가10/10 11:00, 정상 sample12:00KST/score92/필수기상값/원본 scoreEligible=true에 root generatedAt을 누락·null·빈문자열·비정상·미래12:30으로 바꾸면 일반·조석·섬·선상 모두 후보·최종 raw92/rank108이다. weeklySampleAsWeather3774가 주간 발행시각을 복사하면서 무조건 dataCurrent=true와 scoreEligible=true를 만들고 최종 가드가 이를 신뢰한다. site.dataUnavailable=true와 samples 공존도4경로 모두 추천된다.

수정 요청: weeklyWeekSite3722 및 파생 weather 생성 전에 주간 발행시각의 존재·엄격한 유효 형식·미래 여부와 명시 unavailable/적격 상태를 검증한다. 검증되지 않은 raw에서 true 출처를 생성하지 않는다. Python validate_weather_week의 발행 검사도 동일 계약으로 보완한다. 정상 미래 예보는 허용하고, 주간 자료에 today의 갱신 주기나 새 최대 연령을 임의로 도입하지 않는다. 주간 최대 연령 정책이 필요하면 별도 설계·승인한다. 이번 필수 보완은 누락/무효/미래 발행자료의 현재 승격 차단이다.

### C2 — 엄격 시각 parser가 일반 주간/일반 today에 적용되지 않음 (배포 전 필수)

일반 장소15의 최고99점 sample.forecastTime을 2026-10-10 12:00 또는 2026-10-10 12:60 KST로 두고 정상13:00KST/80점 차선과 제보16을 함께 제공한다. weeklyForecastTimestamp는 null이지만 weeklyDaylightCandidates3732가 prefix 날짜/시·분으로 최고점을 선택한다. 실제 최종 raw99/rank115, 카드와 Leaflet 팝업 “★★★★★ 99점”; 정상80/rank96 대안은 가려진다. 실제 Chrome375px에서2/2 실패를 독립 재실행했다. UTC·bananas suffix·trailing garbage까지 일반/섬/선상15개 조합에서 동일하다. 일반 today도 weatherTimeMs2050의 느슨한 Date.parse로 nozone/UTC/nonKST ISO/24:00 ISO4개가 strict parser와 다르게 통과한다.

13개 장소의 별도 공지/mandatory/제보16/정원 실험에서 무효시각3개(ID600,601,606)가 최종10곳에 raw99/rank115로 남았다. 최종 가드 추가만으로 잘못 만든 출처 true를 막을 수 없다.

수정 요청: 모든 후보 경로의 forecast 날짜·시각·timezone을 제품의 명시 parser 계약으로 먼저 확인한 뒤 최고점/차선/대체 만조를 고른다. weeklySampleMinutes3689·weeklySampleDateText3697의 prefix 처리를 적격 판정으로 사용하지 않는다. 일반 today는 storedWeatherState와 추천 parser의 허용 형식을 일치시킨다. 정상 차선과 참고정보는 보존하고 무효 최고점이 정상 대안을 가리지 않도록 한다. .github/scripts/validate_weather_week.py31/47의 strict 판정과 JS를 대조한다.

독립 source78행은 핵심74행 중31일치·43불일치다. 원인은20발행metadata+4unavailable+15비조석 forecast+4일반today 시각으로 묶인다. 이는43개 독립 결함 또는43개 신규 회귀가 아니다. startDate 누락4행은 별도 schema 진단이며 주된 차단 근거와 합산하지 않는다. 실제 Python 주간 validator10조건은 정상 승인, 발행5변형 모두 승인, forecast3변형 및 unavailable 공존은 거부했다. JS/Python 계약 차이는 검증된 사실이다.

### C3 — 더 늦은 요청의 이전 발행자료가 최신 위험 근거를 덮어씀 (배포 전 필수)

loadBirdmapData4524/birdmapDataStamp4518은 요청seq 최신 여부와 동일 stamp만 검사한다. 정상 10:40 발행, forecast12:00, 강수1mm를 적용하면 후보/카드0이다. 이어 더 늦은 요청이 이전10:30발행/강수0mm를 받으면 적용true, 후보·카드1(raw92/rank108)로 복귀한다. 두 발행은 모두10:17 갱신 이후의 current 창 안에 있으므로 참고 today 제외로 해결되지 않는다. today/week 각각5폭에서 이0→1을 실제 Chrome·실제 loader·최종 selector로 확인했다. 먼저 보낸 요청의 늦은 응답은 올바르게 차단한다.

수정 요청: 요청seq 차단을 유지하고 수신자료의 발행 version을 이미 적용한 검증 자료와 비교한다. 나중 요청이라고 더 오래된 발행본을 적용하지 않는다. 검증된 절대 발행시각으로 비교하고 문자열 사전순/동일 stamp 비교만 사용하지 않는다. root/item 충돌·같은발행·결측/무효발행·일자변경·유효성 만료의 처리를 명시한다. 최신 위험 자료는 목록이 비어도 보존하며 “마지막 안전 추천”으로 역전하지 않는다. 보존 자료가 시간이 지나 부적격이면 C에 따라 제외하고 B 예외를 만들지 않는다. loadWeatherToday4541/loadWeatherWeek4557/refreshBirdmapData4585→candidate→final→DOM의 위험0→0 회귀 시험을 추가한다.

Node 실제 loader8조건은4불변성통과·4실패. corrected Chrome40조건은20통과·20실패·예외0: 위험역전10, 오래된 참고/부적격 덮어쓰기로 정상추천이 사라지는 가용성퇴행10이다. 초기 loader DOM에는 reset/toggle이 시작한 비동기 week fixture가 today baseline에 섞였다. 초기 JSON은 보존하고 최종 결함 근거에서 제외했다. corrected는 URL별 응답·baseline 카드0·today weekStamp=null·afterOld카드1을 강제했고 root가5폭40조건 전체를 재실행했다. assertion을 제거하지 않았다.

## 5. 전체 실행 결과 — 성공과 추가 계약 실패를 분리

|스위트|pass|fail|skip|
|---|---:|---:|---:|
|reports_api|178|0|0|
|weekly|155|0|0|
|frontend|110|0|0|
|chromium|20|0|0|
|card_dom|14|0|0|
|weather|54|0|0|
|tide|21|0|1|
|weather_proxy|36|0|0|
|합계|588|0|1|

각 실행 명령·작업 경로는 results/c/execution_manifest.json, 발견된 실제 테스트 및 TAP hash는 test_summary.json에 있다. reports178에는 Node가 수집한 helper 모듈1건이 포함된다. Chromium20은 notice-close-hit7 및 월간조석13이며 이전 브라우저 환경 실패7건도 실제 Chrome 재실행 통과다. 조석 skip1은 오래된 공식 rolling sample 조건이다. weather54·weekly155·card14는 이 exact SHA의 실제 수다.

추가 독립검사: S2 matrix182/182·특별21/21·팝업12/12; 확장103중100통과/기존R5 3불일치; 절대helper23/23; source core74중43불일치+schema4진단; C정책38/38; 실제 Chrome기본245/245·복구45/45; 일반E2E55/55·예외0. 무효 주간 시각DOM2실패와 loader 불변성20실패는588 성공에 숨기거나 합산하지 않았다. 최종 DOM driver는 별도 진단2실패로 exit1이며 실행환경 오류가 아니다.

새 C 시험만 before 제품에 적용하면 주간147pass/8fail, 카드10pass/4fail. 변경된 C DOM70조건은 before에서0pass/70fail, 예외0이다. 검증 스크립트의 파일 경로만 바꾼 것이 아니라 source·기대 계약·실제 adapter와 최종선발을 별도 감사했다. 확장 baseline도7eb의 당시 실제 실패와 대조했다. 하네스 준비 중 fixture 파일/기준 파일 미배치 오류는 준비 오류로 구분하고 의존 순서를 고쳐 재실행했으며 제품 실패/성공 수치에 넣지 않았다.

## 6. R6 DOM 기대값 변경 원장·빈 목록·복구

|시험 ID (각 5폭)|변경 전|C 기대값 / 실제|유지한 팝업 정보|
|---|---|---|---|
|delayed_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|future_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|malformed_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|missing_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|previous_forecast_date|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|generated_sparse6h_delayed|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_delayed_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_future_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_malformed_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_missing_generation|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_previous_forecast_date|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_generated_sparse6h_delayed|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_reference_bonus108|후보·카드1 / rank108|후보null·카드0 / ranknull|미확인·기온·풍향|
|ordinary_week_site_absent_reference|후보·카드1 / rank92|후보null·카드0 / ranknull|미확인·기온·풍향|

위14ID×5폭=70은 명시적으로 후보/카드/rank 제거로 바꿨다. 나머지175의 정상·P0·필수자료 기대는 유지했다. 참고 팝업의 “오늘 적합도 미확인”·기온·풍향·조석은 남는다. 카드가 없다는 이유만으로 장소 자체의 참고 팝업을 표시 오류라 하지 않았다. applicable 현재today entry45건의 storedWeatherState 전체필드가 adapter와 일치한다.

전체 참고/전체부적격/주간today동시실패의 빈 목록에 “현재 검증된 기상자료가 없어 추천 탐조지를 표시할 수 없습니다. 자료 갱신 후 다시 확인해 주세요.”가 표시된다. 합성2장소9단계×5폭45/45로 전체 참고→네트워크503→정상today도착→부분참고→전체참고→정상week도착→부분부적격week→전체부적격week→정상week복구를 실제 fetch loader/renderer에서 확인했다. 정상today·조석 주간미수신, 특정site만week없음, 정상week우선도 포함했다. 빈 안내는 기상 수치/조석 gate로 모두 제외된 경우에도 쓰이므로 모든 빈 목록을 “원자료 없음”이라고 해석하지 않는다. 늦은 응답의 version 역전은 위C3 실패로 별도 남는다.

실제 화면폭344·375·768·1024·1440px(높이900). Leaflet와 실제 marker popup이 로드됐다. 일반55단계는 추천·지도·제보 UI·현장소식·합성본인삭제·일반길안내·보호제한·네트워크 실패를 검사했다. 물리 모바일 기기와 모든 세로 길이의 레이아웃을 전수 검사했다고 확대하지 않는다. 외부 정적 CDN GET/HEAD만 허용, 모든 운영 API 쓰기는0이다.

## 7. 정상190곳·176후보·상위10 전수 비교

35141c0/main/before/C 네 코드에 동일 manifest·시계·제보를 적용했다. 양쪽176후보의 ID와 배열순서, raw/display/rank/bonus/date/time/type/P0 및 전체190 signature와 좌표 vector hash가 동일하다. 독립4/3/1/2 selector와 실제선발도 일치한다. 원점수·표시는 모두 raw이며 rank만 가점을 포함한다.

제보 ON:

|순위|ID / 탐조지|원점수 / 표시|rank / 가점|추천일·시각|추천 유형|P0|
|---:|---|---:|---:|---|---|---|
|1|108 호곡리|92 / 92|103 / 11|2026-10-09 09:00|field|적격|
|2|112 알뜨르비행장|100 / 100|100 / 0|2026-10-13 09:00|field|적격|
|3|15 천수만 사기리|92 / 92|94 / 2|2026-10-09 09:00|field|적격|
|4|194 천수만 강당리|92 / 92|94 / 2|2026-10-09 09:00|field|적격|
|5|126 해리천습지|92 / 92|94 / 2|2026-10-09 09:00|mudflat|적격|
|6|14 걸매리|92 / 92|92 / 0|2026-10-11 18:00|mudflat|적격|
|7|107 매향리|92 / 92|92 / 0|2026-10-11 18:00|mudflat|적격|
|8|48 대진항|92 / 92|92 / 0|2026-10-09 09:00|pelagic|적격|
|9|195 평화의공원|92 / 92|108 / 16|2026-10-09 09:00|other|적격|
|10|3 굴업도|100 / 100|100 / 0|2026-10-09 18:00|other|적격|

제보 OFF:

|순위|ID / 탐조지|원점수 / 표시|rank / 가점|추천일·시각|추천 유형|P0|
|---:|---|---:|---:|---|---|---|
|1|112 알뜨르비행장|100 / 100|100 / 0|2026-10-13 09:00|field|적격|
|2|7 교동도|92 / 92|92 / 0|2026-10-09 12:00|field|적격|
|3|8 석모도|92 / 92|92 / 0|2026-10-09 18:00|field|적격|
|4|10 강화도|92 / 92|92 / 0|2026-10-09 09:00|field|적격|
|5|126 해리천습지|92 / 92|92 / 0|2026-10-09 09:00|mudflat|적격|
|6|14 걸매리|92 / 92|92 / 0|2026-10-11 18:00|mudflat|적격|
|7|107 매향리|92 / 92|92 / 0|2026-10-11 18:00|mudflat|적격|
|8|48 대진항|92 / 92|92 / 0|2026-10-09 09:00|pelagic|적격|
|9|3 굴업도|100 / 100|100 / 0|2026-10-09 18:00|other|적격|
|10|5 대청도|100 / 100|100 / 0|2026-10-09 18:00|other|적격|

아래19시나리오×ON/OFF=38조건에서는 실제 C 후보와 top 전체 projection이 기존 R6의 저장된 strict 분석 기대와 일치했다. 같은 조건 안에서만 비교했다. 후보 감소는 의도한 C 제외이며 정상 고정 결과 회귀가 아니다. 이 좁은 scenario 통과를 무효 주간 source C1/C2가 해결됐다는 근거로 사용하지 않는다.

|동일 입력 시나리오|이전 후보|이전 참고 후보|C 후보|ON/OFF 일치|
|---|---:|---:|---:|---|
|fixed_normal_week|176|0|176|전체 top projection 일치|
|fixed_week_loader_failure|166|0|166|전체 top projection 일치|
|fixed_week_empty_registry|166|0|166|전체 top projection 일치|
|fixed_week_missing_site14|175|0|175|전체 top projection 일치|
|fixed_week_missing_report_sites|176|0|176|전체 top projection 일치|
|fixed_week_site14_no_samples|175|0|175|전체 top projection 일치|
|fixed_week_report_sites_no_samples|165|0|165|전체 top projection 일치|
|controlled_2240_today_fresh_week_failure|166|0|166|전체 top projection 일치|
|controlled_2240_today_delayed_week_failure|166|166|0|전체 top projection 일치|
|controlled_2240_today_future_week_failure|166|166|0|전체 top projection 일치|
|controlled_2240_today_bad_generation_week_failure|166|166|0|전체 top projection 일치|
|controlled_2240_today_missing_generation_week_failure|166|166|0|전체 top projection 일치|
|controlled_2240_mixed_report_reference|176|11|165|전체 top projection 일치|
|controlled_previous_saved_week_failure|0|0|0|전체 top projection 일치|
|controlled_sparse6h_before_due|1|0|1|전체 top projection 일치|
|controlled_sparse6h_after_due|1|1|0|전체 top projection 일치|
|controlled_sparse6h_future_generation|1|1|0|전체 top projection 일치|
|controlled_sparse6h_bad_generation|1|1|0|전체 top projection 일치|
|controlled_sparse6h_forecast_previous_date|1|1|0|전체 top projection 일치|

## 8. 최신 main 임시 결합·자동자료 보존

merge-tree 충돌0, 결합 index는 exact head, weather_today/week 및 tide_today/month는 latestmain blob과 정규화 후 전부 일치한다. 자동자료를 덮어쓰지 않았다. actual validator: today190/190/좌표·이름·registry불일치0, week190/10640적격sample. 결합 JS265(주간155+관련프런트110)통과. 일반 Chrome55단계도 이 결합상태로 실행했다. results/c/verification_summary.json에 blob/rawhash·실행결과 교차검증을 보존했다.

실제 조석health를 읽기전용 검증:100장소/39관측소 fresh/ok·today/tomorrow100. 월간partial/stale280은 기존 월간 범위 한계이며 이번 C 변경의 새 결함이라 주장하지 않는다. 충돌 없음은 제품 안전성 승인과 다르다. PR head 및 main이 새로 바뀌면 임시 결합/validator/영향 테스트를 다시 실행해야 한다.

## 9. 잔여 보안 위험·별도 PR와 선행 조건

|사항|현재 평가·선행 조건|
|---|---|
|R5 극단 숫자 문자열|확장103의wind/rain/wave3불일치. 400자리 표시문자열의Number→Infinity와JS/Python 계약 방어 부족은 남음. 정상 생성finite검사·overflow inf validator차단·workflow commit전검증, 공개사용자의weatherJSON쓰기경로 미확인에 근거해 별도P2. validator가 모든 형식문자열을 차단한다고 쓰지 않는다. 비신뢰 유입/정상 생성 위험 확인 시 배포차단 격상.|
|현장소식 삭제 뒤늦은GET|실제 owner-delete200→freshGET제외→oldGET프런트/marker대역복귀. DBdeleted/finalfresh제외 유지. 철회내용 UI재출현이라 별도P1 보안PR 우선. 현재 C의 새 권한/캐시경로가 없고 서버삭제가 유지되어 이번 단독 선행차단으로 확대하지 않았지만, 실제 개인정보/민감위치 철회나 사고 확인 시 공개회수 및 선행차단으로 격상. request generation/version·삭제tombstone·marker/popup/cache/길안내 동시회수 시험 필요.|
|보호상태old응답 재적용|새hidden→oldpublic으로길안내복귀 최소반례는 남음. 공개status/confirm/delete는hidden을 바꿀 권한 없음. 별도P1이지만 backend보호재분류/fieldhide/S1-P 전환 배포 전에는 필수차단. 오래된응답이 보호상태를 되돌리지 않게 하고 기존표시/캐시/길안내 회수 필요.|
|S1-P 승인후공개정책|S1-R 표현방어와 별도. 기존 승인report/site-history의 간접 위치 연결·저장flag 신뢰·대략안내를 전면비공개로 바꾸지 않았다. 별도 사용자정책 승인·데이터migration설계·old자료/캐시/팝업/길안내 회수검증 후 보호전환 배포.|

기존 source13파일 및 field8함수의 before/head 또는 main/head hash가 동일하다. 최소 보호재현의 passed6은 “기존 결함을 재현하는 assertion 성공”이지 보안통과가 아니다. 실제 삭제메모리 API의 marker수는 대역이며 실제 Leaflet DOM이라 주장하지 않는다. 일반E2E의 actualLeaflet와 별도다. C가 이 네 위험을 해결했다고 보고하지 않는다. 실제 운영 민감행/사고 건수는 조회하지 않았다.

## 10. 최종 보완 지시·병합 전 검토와 승인 대기

1. 구현자에게 C1/C2/C3의 실제 제품 계약 보완을 요청한다. 이번 독립 검증자가 제품 코드를 수정하지 않는다. B 예외·추천배점·ID동점·유형정원·민감종공개정책은 변경하지 않는다.
2. 새 SHA에서 source core74(43실패→기대충족), invalid-highest2 DOM(정상80/rank96 선택), loader40(특히위험0→0), exact1440·normal176·기존588·245/45 및 S1-R를 재검증한다. 별도 R5는 별도 결과로 유지한다.
3. 통과 후에만 사용자 별도 병합·배포 승인을 받는다. 최신 head/main을 다시 고정하고 clean merge-tree·자동JSONmain유지·validator·CI/Pages작업경로를 확인한다.
4. 승인된 배포는 backend S1-R와 frontend 적격가드의 배포순서/호환성을 명시하고 단계별 합성smoke·정상공개GET·rollback을 확인한다. 새API필드나보호정책 전환이 생기면 서버계약 우선 및 오래된응답보호 선행조건을 완료한다. main merge, Pages, public Worker는 각각 승인된 범위로 실행해야 한다. D1 schema/data 변경은 이번 범위가 아니다.

현재는 수정 필요이므로 병합·배포 승인 단계로 진행하지 않는다. 운영코드수정·main병합·Pages/Worker배포·운영D1·실사용자 등록/삭제 모두 수행하지 않았다. 결과를 검증 전용 브랜치에 저장하고 PR #13·Issue #9에 게시/본문 재확인한다. 사용자 승인과 구현자의 새 SHA를 기다린다.

## 11. 재현·증빙

- execution_manifest.json: 실제8스위트 명령/작업경로.
- verification_summary.json/source_proof.mjs: exact제품/결합/자동자료hash·결과 독립assert.
- reference_selection.mjs/json/_before.json: exact1440 및참고20조건.
- independent_replay.mjs/json: immutable16manifest·190전수·ON/OFF.
- c_temporal_source_actual.mjs/json, c_week_validator_actual.py/json, C_CONTRACT_AUDIT.md: 추가source/시각/Python차이.
- independent_c_dom.mjs 및 detailed_dom_full/root/before.json, EXPECTATION_CHANGES.md:245/45·70명시기대변경·무효주간2.
- loader_replay.mjs/json, loader_dom_corrected.mjs 및 corrected_full/root.json, SECURITY_REVIEW_C.md:발행rollback·정정baseline.
- c_reference_policy.mjs/json/c_policy_before_after.json:19×ONOFF38·독립선발114.
- NEXT_SESSION.md: 정확 재개명령·미완료제품보완·마지막commit확인방법.
