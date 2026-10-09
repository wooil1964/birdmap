# PR #13 C 정책 독립 계약 감사

- 검증 SHA: 352315a57d038687807dbe0044c136a22fb0c9c5
- 이전 SHA: e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
- 범위: 실제 Git blob의 제품 함수 호출, 별도 합성 입력, 저장된 공개 승인 제보 11곳과 고정 자료 대조. 제품 함수의 계약을 통과시키는 래퍼나 가드 패치를 넣지 않았다.
- 권고: 현재 자료만 허용하는 C 정책의 today 보완은 확인됐지만, 주간/일반 fallback의 미검증 시각·출처를 현재 적격으로 만드는 경로가 남았다. 해당 범위는 보완 후 재검증이 필요하다. B 예외는 제안하지 않는다.

## 확인된 보완과 정상 회귀

| 독립 실행 | 결과 | 의미 |
|---|---:|---|
| 기존 S2 실제 함수 matrix | 182/182 | 점수·실제 필수 기상값·원본 명시 속성 계약 유지 |
| 특별 분기 | 21/21 | 정상 차선 예보·안전 대체 만조 및 기존 가점/분기 계약 유지 |
| 팝업 계약 | 12/12 | 해당 점수 미확인/정상 표시 조건 유지 |
| 절대 날짜·시각 helper | 23/23 | 90/91분, 자정60분, 전후 날짜1440분, 월말·연말·윤년/평년·비정상 날짜·시각 |
| 추가 source controls | 21/21 | 3/6/24시간 간격 × 90/91/120분9건 + 기존 today 참고/이전날/미래/결측12건 |
| C 정책19시나리오 × 제보 ON/OFF | 38/38 | 실제 새 제품 출력이 기존 e9c의 분석상 strict 정책 후보 수·상위10 전 항목과 일치 |
| 독립 정원·정렬 선발 대조 | 114 일치 | 같은 후보를 실제 제품 선발과 독립 4/3/1/2 selector로 대조 |
| 확장103조건 | 100통과, 기존 R5 3불일치 | 극단적인 표시 숫자 문자열의 Infinity 변환 문제가 별도로 남음 |

고정 자료의 평가시각은 2026-10-08 22:40 KST, 탐조지190곳, 정상 후보176곳이다. 정상 제보 ON/OFF 상위10의 ID·순서·원점수·표시점수·순위점수·가점·추천일·시각은 유지됐다. 제보 ON 순서는 108,112,15,194,126,14,107,48,195,3; OFF 순서는 112,7,8,10,126,14,107,48,3,5다.

정상 고정 자료에서 주간 로더만 전체 실패하면 검증된 today 후보166곳이다. controlled 혼합 참고 조건은165곳, 전체 today 참고 조건은0곳, 실제 Python sparse6h 생성기 출력의 예정 갱신 이후 조건도0곳이다. 이 controlled 자료는 고정22:40 자료와 섞어 변화 원인을 설명하지 않았다. 날짜가 하루 어긋난 기존1440분 today 반례는 candidate/final/rank 모두 제외됐다.

정상 미래 주간 예보(발행10:30, 평가11:00, 예보12:00)는 계속 허용된다. 미래 예보 시각과 미래 발행 시각을 구분했다.

## 남은 계약 불일치: 74핵심 행 중43행

c_temporal_source_actual.json은 전체 source78행, 핵심 계약74행, 별도 schema 진단4행을 저장한다. 43행은 동일 원인에 대한 경로/표현 조합 수이며 43개의 독립 결함을 뜻하지 않는다.

| 원인/입력 | 불일치 행 | 실제 출력과 요구 차이 |
|---|---:|---|
| 주간 generatedAt 누락/null/빈문자열/비정상/미래 × 일반·조석·섬·선상 | 20 | 후보와 최종목록에92점/rank108 유지. 주간 파생 상태를 dataCurrent/scoreEligible=true로 생성 |
| 주간 site.dataUnavailable=true와 표본 공존 × 4경로 | 4 | 알려진 unavailable 상태를 무시하고 후보 유지 |
| 주간 최고99점 표본의 timezone 누락/UTC/garbage suffix/minute60/trailing garbage × 일반·섬·선상 | 15 | 엄격 parser는 null이나 최고99점/rank115 채택. 정상80점 차선 표본을 가림 |
| 일반 today forecastTime의 timezone 누락/UTC/비KST ISO/24:00 ISO | 4 | 엄격 parser null과 무관하게 storedWeatherState에서 eligible=true; 후보92점/rank108 유지 |

잘못된 최고점 표본과 함께 둔 정상 차선80점 예보는 13:00, 만조는12:00로60분 차이다. 조석5개 잘못된 최고점 표현은 모두 정상 차선80점 선택에 성공했다. 처음 검토 중15:00 차선(180분) fixture가 발견되어 수정했으며, 최종 JSON에는 해당 거짓 실패를 포함하지 않았다.

독립적으로 구성한13개 장소의 실제 최종 선발 재현에서는 2026-10-10 12:00 bananas 표본3개(ID600,601,606)가 모두 상위10에 남았다. 각 장소에 공지/mandatory와 제보 가점16을 줬으며 원점수99/순위115, strict parser=null, week_forecast 적격true였다. 이 검증은 source78행 집계와 별도 fillRoute 증거다. 공지·가점·mandatory·정원 선발 뒤의 최종 guard도 잘못 생성된 출처true를 다시 신뢰한다.

### 실제 코드 위치 및 수정 방향

352 SHA의 index.html 기준:

- 3722 weeklyWeekSite: 주간 root의 검증된 발행 출처 및 사이트 unavailable 상태를 확인하지 않는다.
- 3732 weeklyDaylightCandidates: 문자열 앞부분의 날짜·시각으로 후보를 만들며3887의 엄격한 weeklyForecastTimestamp 계약을 적용하지 않는다. 유효 시각·날짜·timezone을 먼저 확인한 뒤 최고점/차선 선택을 수행해야 한다.
- 3774 weeklySampleAsWeather: generatedAt을 복사하면서 무조건 dataCurrent=true, raw 표본 점수 계약만으로 scoreEligible=true를 만든다. 출처 검증 결과에 따라 파생 상태를 부여해야 한다.
- 2050/2066 weatherTimeMs/storedWeatherState: permissive Date.parse와 문자열 첫10자리 검사 때문에 일반 today 경로가 엄격한 C 시각 계약과 다르다. 추천 가능 여부의 parser/정규화 계약을 일치시켜야 한다.
- 3908 weeklyTodayWeather, 3916 weeklyRecommendationEligible: 현재 상태true 조건은 추가됐으나, 위 경로가 부여한 미검증true를 막지 못한다. 후보 생성 및 최종 선발 모두 검증된 출처에 근거해야 한다.
- .github/scripts/validate_weather_week.py 31/47: 실제 strict forecast parser 및 validate()와 JS의 시각 계약을 일치시켜야 한다.

발행 metadata는 누락·잘못된 형식·비정상 날짜·미래인 경우 현재 적격으로 승격하지 않는 방향을 요청한다. 정상 미래 예보의 시각은 유효한 주간 범위 안에서 허용해야 한다. 주간 자료의 허용 최대 연령이나 새로운 갱신 주기를 임의로 정하지 않았으며, today의 주기 규칙을 주간에 그대로 적용하는 방안을 검증했다고 주장하지 않는다.

## Python 실제 validator와의 대조

c_week_validator_actual.py는 실제 validate()를 호출했다. 합성 단일 사이트 자료를 위해 runtime site 목록만 동일한 장소1곳으로 투영했으며 validator 함수와 가드를 수정하지 않았다.

- 정상 자료: 승인.
- generatedAt 누락/null/빈문자열/비정상/미래: 5건 모두 승인. 실제 validator는 발행시각을 검사하지 않는다.
- forecastTime timezone 누락/garbage suffix/minute60: 3건 거부. 같은 입력을 비조석 JS는 후보로 유지한다.
- dataUnavailable=true와 samples 공존: 거부. JS는 후보로 유지한다.

주간 startDate 누락4경로는 별도 schema 진단이다. 이 필드의 소비 범위/스키마 전체를 위 C source 차단 근거43행과 섞지 않았다. actual validator source SHA256은42395257a896eb7f99a27da1549ebce55bbe022d558bb3539815d27a53d567cd다.

## 결함의 시점과 범위

주간 출처 승격·permissive 시각 처리 경로는 이전 코드에 있던 경로다. 새로운 정상 기능 회귀43건이라고 해석하지 않는다. 다만 새 C 최종 가드는 이 상태를 적격 출처로 계속 신뢰하므로 이번에 승인받은 “검증된 현재 자료만” 정책이 모든 추천 경로에서 완성됐다고 판정할 수 없다. today 참고/1440분 제거와 정상 데이터 보존은 실제로 해결됐다.

위 합성 숫자는 가드 검증용 입력값이며 조류 출현 확률이나 새로운 운영 배점을 만들지 않았다. 원본 보호종 좌표, 비밀정보, 실사용자 POST/DELETE는 사용·저장하지 않았다.

## 재실행 명령

PowerShell에서 아래와 같이 실행한다. archive는 정확한352 제품 사본, Git blob은 SHA로 읽는다. 결과는 검증 전용 temp 폴더에만 쓴다.

~~~powershell
$cArchive = 'C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap/docs/p1-s-review/.scratch/targetC'
$cAnalysis = 'C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap'
$cOut = 'C:/Users/김진호/.codex/visualizations/2026/10/08/01a1190e-204e-7790-ad48-3431ee07838f/pr13_c_contract'
$cBaseline = 'C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap/docs/p1-s-review/results/r123/baseline7eb_actual_matrix.json'
$cBeforePolicy = 'C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap/docs/p1-s-review/results/r6/r6_reference_policy.json'
$cPython = 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'

node "$cOut/pr13_r123_actual_matrix.mjs" $cArchive $cOut $cAnalysis
node "$cOut/pr13_r123_extended.mjs" $cArchive $cOut $cAnalysis $cBaseline
node "$cOut/c_temporal_source_actual.mjs" $cArchive $cOut $cAnalysis

$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
& $cPython "$cOut/sparse6h_generator_actual.py" $cArchive $cOut
& $cPython "$cOut/c_week_validator_actual.py" $cArchive $cOut
node "$cOut/c_reference_policy.mjs" $cArchive $cAnalysis $cOut $cBeforePolicy
~~~

source audit의 기대/실제 불일치는 JSON에 기록되며 프로세스 종료0이 “모든 계약 통과”를 뜻하지 않는다. matrix/정책 script는 assert를 사용한다. 기존 R5 3건과 주간 출처/시각43행을 전체 회귀 테스트의 보고 pass 수에 합산하지 않는다.
