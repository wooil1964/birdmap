# PR #13 R6 독립 Chrome DOM 결과

검증 SHA: e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
제품 index.html SHA256: 21bb6814ebdc587aef5a3baec1b3f67dcf40d69af027f39b94a04a1608d74b56
고정 시계: 2026-10-10 11:00 KST; 화면 폭 344·375·768·1024·1440, 높이 900.

실제 Chrome/Leaflet 지도 마커 팝업과 renderTodayPanel 추천 카드 DOM을 읽었다. 결과 245 pass / 0 fail / 0 실행 예외.

| 그룹 | 결과 |
|---|---:|
| 기존 정상·안전·결측 29종 × 5폭 | 145/145 |
| 이전 차단 참고 상태 6종 만조 경로 × 5폭 | 30/30 |
| 같은 참고 상태 6종 일반 경로 × 5폭 | 30/30 |
| 일반 정상 및 참고 상태 제보 가점 16·rank108 | 10/10 |
| 일반 주간 우선·참고 대체·없는 장소·부적격 sample·빈 장소 | 30/30 |

원래 요청 175건 및 추가 70건을 분리 집계했다. 갱신 지연·미래 생성·잘못된/없는 생성시각·어제 예보·실제 sparse6h builder 출력은 두 DOM 모두 `오늘 적합도 미확인`이며 별점을 표시하지 않았다. 정상 0·92·92.5·100 및 내부 rank108을 유지했다. 만조 90분·91분, 6·24시간 간격, 대체 만조, 강수 1mm, 필수 풍속·강수·파고 결측, eligible 누락/null/false 및 previous_saved는 통과했다.

적용 가능한 today 추천 entry 115건에서 `_weatherState` 전필드가 동일 raw/root/site로 계산한 `storedWeatherState`와 일치했다. 새 weeklyTodayWeather는 후보 자료 계약을 먼저 검사하고 저장자료 출처 상태를 그대로 복제한다. weatherScoreAllowed와 팝업의 표시 검사는 완화하지 않았다.

새 제품 sparse6h_today_site14.json은 이전 독립 검증에서 실제 Python builder가 생성한 row14와 deepEqual이었다. 해당 행을 변경 없이 만조 및 일반 경로에 주입해 두 DOM의 참고 상태를 확인했다. 운영에서의 발생 빈도는 이 검증에서 측정하지 않았다.

주간 자료가 해당 장소에 있으면 유효 sample이 없는 경우 추천 today fallback을 막는 기존 동작을 유지한다. 따라서 현재 today 자체가 유효해 팝업에 92점이 보이면서 추천 카드가 없을 수 있다. 주간 자료에 장소가 없으면 today fallback을 사용한다. 유효 주간 자료는 추천에 우선하며, 참고 today는 팝업에서도 유효 주간 자료로 대체된다.

후보 정책은 표시 상태와 구분했다. 참고 상태(scoreEligible=false) 후보 70건이 남았고, 그중 가점 16점·rank108 조건 5건도 후보로 유지됐다. 모두 카드·팝업 점수는 미확인이다. 후보 자격과 순위 정책은 이번 R6 변경 이전부터 존재하며, 이번 검증은 이 동작을 신규 개선으로 주장하지 않는다.

네트워크 격리는 navigation 전에 설정했다. DNS 전면 차단에서 로컬 서버와 4개 라이브러리 CDN만 제외했고, CDP Fetch는 Worker·Turnstile·telemetry·tile을 합성 응답으로 처리했다. 로컬 weather/week/tide 재요청도 같은 case fixture로 응답하여 실제 index의 자동 재읽기로 입력이 혼용되지 않도록 했다. 제품 함수와 소스는 수정하지 않았으며, 운영 POST/DELETE·D1·배포는 수행하지 않았다.

수평 점수 범위와 잘림을 검사했으며, 물리 기기의 GPS/키보드 및 고정 버튼에 의한 세로 overlay 전체 배치는 이 매트릭스에서 검증하지 않았다.

공식 파일:
- independent_r6_dom.mjs
- targete9c/independent_r6_dom.json
- targete9c/*.png 16개 (정상 5폭 10개, 참고 상태 및 주간 대체 375px 6개)

재현:
R6_GENERATOR_FIXTURE=<review>/docs/p1-s-review/results/r4/sparse6h_generated_today.json
node independent_r6_dom.mjs <exact e9c archive> <output dir> e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
R6_WIDTHS=375 로 대표 화면만 재실행할 수 있다.
