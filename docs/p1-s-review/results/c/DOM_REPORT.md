# PR #13 C 정책 독립 Chrome DOM 검증

정확한 head: 352315a57d038687807dbe0044c136a22fb0c9c5
비교 before: e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
현재 제품 index SHA256: 4d01b96125614d9b2e42c5a8b01b1da52fc19a90702951eee16149937e3a77da
시계: 2026-10-10 11:00 KST, 폭344·375·768·1024·1440, 높이900.

## 결과

- 기존49조건×5폭: 245 pass / 0 fail / 실행예외0.
- 14조건의 C 기대 강화70건: 실제 weeklyRecommendationForSite 후보null, 추천 카드0, 내부순위null, today adapter null; 팝업 점수 미확인과 기온·풍향 유지. 무조건 assert 제거가 아니라 명시적 ID·사유·before/after 원장을 저장했다.
- 이전 e9c에 동일 강한 C 기대를 적용한70건은 모두 실제 카드1/후보잔존 때문에 실패했다. 로딩/환경 예외는0.
- 원래 정상 및 다른175건 기대는 유지했다. 정상0·92·92.5·100, 제보16/rank108,90/91·6/24h·대체 만조·주간 우선 및 metadata/필수자료 회귀를 확인했다.
- 실제 loader 복구9단계×5폭: 45/45 pass. 두 공개 장소의 전체 참고→네트워크503→정상today 도착→부분 참고→전체 참고→정상week 도착→부분 부적격week→전체 부적격week→정상week 복구. actual loadWeatherToday/Week + refreshTodayPanelIfOpen을 호출하며 fetch 함수를 교체하지 않았다.
- applicable 현재today entry45건에서 storedWeatherState 전필드 일치. 참고 후보70건은 이제없으므로 이전115 상태 비교를 그대로115라고 보고하지 않는다.

## 별도 차단 결함

375px actualChrome 별도2진단은 0 pass / 2 fail이다. 위245/45 통과 집계와 분리한다.

일반 장소15, week root generatedAt=2026-10-10 10:30 KST. 높은 sample99의 forecastTime을 `2026-10-10 12:00` 또는 `2026-10-10 12:60 KST`로 주고, 정상13:00 KST/score80 대안을 함께 넣었다. 제보 가점16을 적용했다.

새 strict weeklyForecastTimestamp는 두 문자열 모두 null로 거절하지만 일반 주간 선발은99점을 최종 후보로 유지한다. 실제 카드·지도 팝업은 모두 `★★★★★ 99점`, 원점수99·rank115·sourceEligible=true이다. 정상 대안80/rank96을 선택하지 않는다.

따라서 today 참고 제외와 복구는 통과했지만, 일반 주간의 무효시각 최고 sample 차단은 C의 현재 검증자료 계약을 충족하지 않는다. weeklyDaylightCandidates/weeklySampleRecommendable 및 최종 derived 출처 생성에서 strict forecast timestamp 계약을 공통 적용하고 정상 대안을 탐색하는 보완이 필요하다. 이는 합성 계약 반례이며 운영에서 실제 발생했다고 단정하지 않는다.

## 파일·재현

- independent_c_dom.mjs
- EXPECTATION_CHANGES.md
- targetC/independent_c_dom.json: 전체245+복구45와 별도 진단2
- targetC/expectation_changes.json: 14개 기대변경 원장
- targetC/weekly_time_diagnostics.json: 차단 결함2 실제DOM
- beforeR6/independent_c_dom.json: 기존70건의 C 기대 실패
- targetC_cli375/independent_c_dom.json: 대표 재실행49/49, 복구9/9, 별도 진단2fail

최종 driver는 별도 진단의 실패도 CLI exit1로 알린다. 전체5폭 최초 실행 후 출력 집계/exit 처리를 강화했고, 동일375px 대표를 재실행해49/9 성공과2진단 실패를 확인했다. 제품 소스·판정·입력은 바뀌지 않았다.

C_GENERATOR_FIXTURE=<review>/docs/p1-s-review/results/r4/sparse6h_generated_today.json
node independent_c_dom.mjs <exact targetC archive> <output dir> 352315a57d038687807dbe0044c136a22fb0c9c5
C_WIDTHS=375 로 대표 재실행. before 재현은 C_DIAGNOSTIC_ONLY=1 C_SKIP_LIFECYCLE=1 C_SKIP_WEEK_DIAGNOSTICS=1과 beforeR6 archive/SHA를 사용한다.

실제 Chrome·Leaflet marker popup 및 카드 DOM을 읽었다. 제품 함수·소스를 패치하지 않았고 시계·자료만 브라우저 메모리와 로컬 CDP 응답으로 고정했다. 모든 Worker·Turnstile·telemetry·타일과 기타외부 요청은 navigation 전 DNS/Fetch로 합성 격리했다. 라이브러리 CDN 정적GET/HEAD만 허용했다. 운영 POST/DELETE·D1·배포·실제 GPS는 수행하지 않았다.

정확한 빈목록 문구를 확인했다. 다만 만조91분·강수1mm처럼 자료 자체는 존재하지만 안전 선발이0인 경우에도 같은 문구를 쓴다. 모든 빈목록이 운영 기상자료 결측이라는 뜻으로 해석하지 않는다. 가로 범위를 검사했으며 물리 기기·세로overlay 전체 배치는 범위 밖이다.
