# PR #13 최종 C1/C2 독립 계약 재검증

검증 SHA: 2e485079a34fa5aeeef09e82f3b996bf2696d978  
이전 차단 SHA: 352315a57d038687807dbe0044c136a22fb0c9c5  
main 기준: b0975cad9f3112af38cc286a892bf6f06722ce12

AI_WORK_RULES.md, 이전 C_CONTRACT_AUDIT.md, 새 제품·validator diff 및 실제 호출 경로를 읽었다. 제품·운영·Git 상태는 변경하지 않았다. 모든 스크립트/합성 결과는 이 전용 temp에 저장했다.

## 판정 범위

이전 C1/C2의 43행 실패는 해결됐다. 그러나 후속 독립 자료형 진단에서 시각 배열을 문자열로 암묵 변환하여 현재 적격으로 사용하는 계약 우회를 발견했다. JSON으로 운반할 수 있는 객체는 실제 후보/최종 선발까지 TypeError를 전파했다. **명시적 string 검사 보완 후 재검증을 권고한다.** 이는 C1/C2의 타입 계약 보완이며 B 예외나 새 점수·지연 정책을 제안하지 않는다.

정상 생성기는 padded KST 문자열만 출력한다. 운영에 배열/객체 자료가 유입됐다는 증거는 없다. 이 제한을 유지하되, C 정책의 무효자료 제외 계약을 통과했다고 보고할 수는 없다.

## 완료된 독립 실행

| 검사 | 실제 결과 |
|---|---:|
| 기존 score/자료형 실제 함수 matrix | 182/182 |
| 특별 분기 | 21/21 |
| 팝업 계약 | 12/12 |
| 기존 source 핵심74행 | 74/74, 이전43행 불일치 제거 |
| 날짜·절대 시각 helper | 23/23 |
| 최종 mandatory/정원 별도 재현 | 무효 timestamp 장소3개 모두 제거 |
| 추가 C1/C2·선상·fallback·정상점수 | 80/80 |
| 추가 JS 주간 sample 자료형 | 92/92 |
| 실제 Python 주간 validator 기존10반례 | 10/10 기대 충족 |
| Python/JS 위92 sample 대조 | 92/92 일치 |
| 기존 확장103조건 | 100 통과, 기존 R5 3불일치 유지 |

74핵심행의 기대값을 새로운 동작에 맞춰 통과시키지 않았다. 새 SHA와 helper 목록으로 실제 제품 함수들을 추출해 같은 기대를 검사했다. 기존 startDate 누락4건은 계속 별도 schema 진단이며 핵심74행에 섞지 않았다. source audit의 프로세스 종료0은 JSON의 모든 행 통과와 동의어가 아니다.

고정2026-10-08 22:40 KST 자료의 정상 후보176곳과 기존 상위10은 matrix에서 유지됐다. 최종 전수 ON/OFF 및 main 결합은 root의 별도 검증 범위다.

## 선상 포함 C2 차선 선택

실제 선상 탐조지 ID48을 포함해 일반/갯벌/섬/선상에서 다음5개99점 예보를 각각 넣었다.

- timezone 없는 시각
- UTC 꼬리
- bananas 꼬리
- 12:60
- KST 뒤 junk

함께 넣은 정상 차선은 같은 날13:00,80점이며 갯벌 만조는12:00으로60분 차다. 제보 가점16 및 공지를 함께 유지했다. 20경로 모두 무효99를 버리고 정상80/표시80/bonus16/rank96/최종 선발을 확인했다. 정상 대안이 없는20경로는 후보·최종 모두 제외됐다. 추가 정상0·92·92.5·100 × 4경로16건은 유지됐으며 rank108과 100 초과 내부 순위점수를 금지하지 않았다.

이는 실제 추천/점수 표시 함수 대조다. Chrome DOM의 카드/팝업 동시 확인은 root의 별도 E2E 결과와 결합해야 한다.

## fallback을 구분한 결과

- 문서 발행 검증false 또는 site unavailable로 weeklyWeekSite=null이 되면, 정상 현재 today가 있는 일반/갯벌/섬은80/bonus16/rank96으로 대체됐다.
- 선상은 기존 pelagic&&!bestWeather 규칙에 따라 today-only로 추천하지 않았다. 정상 today 기상 자체는 팝업 적격으로 유지됐다.
- 검증된 주간 사이트 안에 scoreEligible=false 표본만 있을 때에는 weeklyWeekSite가 존재하고 bestWeather가 없으므로 모든4경로가 today를 이용해 승격되지 않았다. docVerified=false와 raw 표본scoreEligible=false를 같은 상황으로 취급하지 않았다.

## Python과 실제 정상 생성기

c_week_validator_actual.py는 실제 validate_weather_week.validate()를 호출한다. datetime.now를 평가시계2026-10-10 11:00 KST로 고정하고 runtime 목록만 단일 사이트로 투영했다. validator/가드는 바꾸지 않았다.

주간 generatedAt 누락/null/빈문자열/비정상/미래를 모두 거부하며, 무효 forecastTime과 dataUnavailable·표본 공존도 거부했다. 92개의 물리 기상/점수/metadata 자료형 조건은 JS와 일치했다. 잘 구성된 ineligible 저장자료는 Python이 보존하고 JS가 추천에서 제외하므로, 저장 유효성과 추천 적격성이 모든 입력에서 같다고 주장하지 않는다.

normal_current_builder.py는 실제 build_site_result/build_week_days/write_week_output을 합성 상류 자료로 호출했다. 날짜10/10, target10:55·평가11:00, 실제 ID14/3/48의 정상 today/week validator 모두 통과했다. 정상 생성된92점은 수정하지 않았다.

actual_current_builder.py는 이와 별도로 **실제 시스템 KST 시각05:28:16(10/10)**을 target으로 사용하고 실제 시계를 따르는 validator에 통과했다. 3곳의 발행05:28/예보06:00/점수92가 정상이며, 두 결과는 별도 JSON으로 보존했다. 운영 기상 JSON을 바꾸거나 시각만 바꿔 validator를 통과시킨 것이 아니다.

별도 parser 입력집합 진단: JS는 ISO +09 문자열을 허용하고 Python은 canonical KST를 요구하며, Python strptime은 zero padding 없는 KST를 허용하고 JS는 거부한다. 정상 생성기 출력은 일치한다. 이4진단은 C1/C2 핵심/92자료형 집계와 별개이며 아래 배열 우회와 혼동하지 않는다.

## 잔여 차단: timestamp 원본 자료형

timestamp_type_diagnostics.mjs는 모든 비정상 값을 JSON.stringify/JSON.parse로 왕복시켰다. 상속 프로토타입이나 비JSON 실행 객체를 사용하지 않았다.

### 배열8경로

- generatedAt: ["2026-10-10 10:30 KST"]
- 또는 최고99점 표본의 forecastTime: ["2026-10-10 12:00 KST"]; 정상80점13:00 표본 동반.

weeklyForecastTimestamp는 String(text||"").trim()으로 배열을 canonical 문자열로 바꾼다. 일반/갯벌/섬/선상 × 위2조건8행 모두99점/bonus16/rank115/표시99/최종목록에 남았다. forecast 배열은 정상80 차선도 가렸다. 모든 route에서 파생상태는 week_forecast·dataCurrent=true·scoreEligible=true였다.

timestamp_type_python.py의 실제 validate()는 publication/forecast 배열2건과 객체2건을 모두 AssertionError로 거부한다. frontend와 validator의 명시적 string 계약이 다르다.

### 객체 예외8경로

JSON 객체 {"toString":"not-callable"}를 publication 또는 forecast에 넣었다. helper의 TypeError는 실제 weeklyRecommendationForSite 및 todayRecommendedSites 호출에서도 일반/갯벌/섬/선상8행 모두 전파됐다. helper만 실패한 결과를 전체 선발 실패로 추정한 것이 아니다.

실제 Chrome DOM 전체가 어떤 상태로 남는지는 이 하위 감사에서 검증하지 않았다. 발행 객체의 네트워크 로더 적용 여부나 오래된 DOM 잔류도 root E2E와 분리해야 한다. 이 문서는 직접 메모리로 공급한 JSON shape의 실제 추천 함수/최종 함수 예외만 확정한다.

### 구체적 보완 요청

2e4850의 index.html 기준:

- 3902 weeklyForecastTimestamp: String 변환 전에 typeof text==="string"인지 검사하고 다른 유형은 null로 반환한다. 기존 normal KST·승인된 ISO+09 문자열,0/100/92.5 및 내부 rank108/115 계약은 유지한다.
- 3724 weeklyDocVerified,3740 weeklyDaylightCandidates 및2066 storedWeatherState: 동일 strict helper를 사용하되, 배열·객체·number·boolean을 검증된 시각으로 승격하거나 예외를 전파하지 않아야 한다.
- 3931 weeklyRecommendationEligible·4129 weeklyRecommendationForSite·4244 todayRecommendedSites: 위 입력이 후보/최종에서 제외되는지 회귀로 확인한다.
- Python validator의31 parse_forecast_time은 이미 isinstance(text,str)로 배열/객체를 거부한다. 정상 자료에 대한 새로운 정책을 만들 필요가 없다.

C1/C2 원래 실패의 수정은 확인됐고, 잔여 유형 경로는 보완이 필요하다. 과거 존재하던 helper 결함이므로 “새 정상 기능 회귀8건”이라고 부르지 않는다. 그러나 이번 C1/C2의 “엄격하게 검증된 시각/발행 출처”에 남은 구멍이다.

## 재실행

PowerShell 변수는 아래 경로를 사용한다. 이미 통과한 단계를 중복 실행할 필요는 없지만 root가 독립 재현할 수 있도록 기록한다.

~~~powershell
$fArchive='C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap/docs/p1-s-review/.scratch/targetFinal'
$fOut='C:/Users/김진호/.codex/visualizations/2026/10/08/01a1190e-204e-7790-ad48-3431ee07838f/pr13_final_contract'
$fAnalysis='C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap'
$fBaseline='C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap/docs/p1-s-review/results/r123/baseline7eb_actual_matrix.json'
$fPython='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'

node "$fOut/pr13_r123_actual_matrix.mjs" $fArchive $fOut $fAnalysis
node "$fOut/c_temporal_source_actual.mjs" $fArchive $fOut $fAnalysis
node "$fOut/pr13_r123_extended.mjs" $fArchive $fOut $fAnalysis $fBaseline
& $fPython "$fOut/normal_current_builder.py" $fArchive $fOut
node "$fOut/final_c1_c2_additional.mjs" $fArchive $fOut $fAnalysis
& $fPython "$fOut/c_week_validator_actual.py" $fArchive $fOut
& $fPython "$fOut/actual_current_builder.py" $fArchive $fOut
node "$fOut/timestamp_type_diagnostics.mjs" $fArchive $fOut $fAnalysis
& $fPython "$fOut/timestamp_type_python.py" $fArchive $fOut
~~~

temp에는 민감종 원본 좌표·비밀정보가 없다. 제품/운영 POST·DELETE, D1, 배포, main 병합 및 Git 변경은 하지 않았다. 실행 마지막에 제품 checkout git status --short는 비어 있었다.

