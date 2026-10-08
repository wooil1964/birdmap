# P1-S2 독립 점수 계약 감사

운영 코드는 수정하지 않았다. 고정 Git 소스에서 추출한 실제 함수와 합성 입력을 사용했다. 문서의 "설계 wrapper 통과"는 임시 메모리에서 미래 계약을 적용한 모형의 기대 결과이며, 운영 수정·배포의 검증 통과를 뜻하지 않는다.

## 기준과 재현

- 코드: 35141c04d4fd152982b1f4683d5b7a6f4f7514e5. 최신 origin/main 4fc14b3c7ba19ad4d5b91efa305a80b3d474dc57의 index.html 원본 SHA-256이 같은지 실행 중 assert한다.
- 고정 입력: input_manifest_35141c0_2240.json 및 기존 gzip/공개 집계 스냅샷. 고정 추천 시계 2026-10-08 22:40 KST.
- 합성 분기 시계: 2026-10-10 08:00 KST. 미래 12:00 sample이 지난 시각 때문에 탈락하지 않게 구분했다. 계절 분기는 2027-04-10·2027-06-10·2026-12-10 각 08:00을 쓴다.
- Python validator 시계: 2026-10-08 22:40 KST. datetime.now를 patch하며 임시 JSON만 생성한다.
- 고정 입력 10,640 samples의 scoreEligible===true 중 유효하지 않은 raw score 0개. 최신 main 기상 2026-10-09 05:41 KST의 10,136 samples도 별도로 읽어 같은 결함 0개. 최신 기상은 고정 추천 비교에 넣지 않았다.
- 실제 운영 결함 입력이 유입됐거나 실제 추천이 위험했다는 주장은 하지 않는다.

분석 스크립트는 repo/output을 CLI 인자로 받는다. 분석 폴더 _scripts에 이식한 후에도 같은 명령을 쓸 수 있다.

~~~powershell
$env:PYTHONDONTWRITEBYTECODE='1'
node <scripts>/p1s2_score_matrix.mjs <analysis-worktree> <results-directory>
& <python-runtime>/python.exe <scripts>/p1s2_python_validator_matrix.py <analysis-worktree> <results-directory>
~~~

기존 고정 스냅샷을 변경하지 않는다. Python은 load_runtime_sites만 합성 1곳으로 patch하여 실제 validate()를 임시 JSON에 적용한다. 문서 수용 여부와 추천 적격 여부를 구분한다.

## 점수 흐름과 변경 대상

| 경로 | 현재 동작과 위험 | 설계 적용 지점 |
|---|---|---|
| update_weather.py:361 score_weather | 점수 정수 계산 후 0~100 clamp. 임의 생태 가점 생성 없음 | 공식 유지, 입력/결측·schema 일관성만 검증 |
| update_weather.py:464 build_site_result | stale·강수 결측·필수 파고 결측이면 scoreEligible=false, score=None | 유지. 오늘 formatted wind/rain/wave adapter와 생성 계약 대조 |
| update_weather.py:682 build_week_days | missing이면 score=None, grade 빈 값, eligibility false. 표시용 반올림과 선상 safetyRaw 분리 | 유지. boolean·numeric-string·필드타입을 정확히 다루는 schema 검사 |
| update_weather.py:993 previous_saved 재사용 | 이전 참고자료의 score/grade를 보존하되 stale:true, scoreEligible:false로 강등 | 참고자료의 숫자를 삭제하지 않음. false는 추천·유효 적합도에서 제외 |
| validate_weather.py:15/24 | score bool/string/범위는 이미 엄격하게 검사. 그러나 scoreEligible truthiness; today eligibility 누락·null이면 eligible 분기를 건너뜀. 필수 formatted weather 실제 누락은 확인하지 않음 | scoreEligible bool 타입 명시, eligible true는 필수자료와 빈 array 이유 목록 검증. ineligible saved_reference 숫자 보존은 허용 |
| validate_weather_week.py:15/47 | score bool/string/범위·필수 수치·wave를 이미 엄격하게 검사. eligibility 1/'true'/0.5 및 missingScoreFields:null은 통과 가능 | scoreEligible 정확한 bool, missingScoreFields list 계약. weekly false는 기존 score=None+결측 사유 유지 |
| index.html:4454/4470 loadWeatherToday/loadWeatherWeek | loadBirdmapData는 sites object/발행 stamp를 검사한 뒤 수신 객체를 전역값에 둠. score schema 검사 없음 | 수신 경계 schema 검증을 선택한다면 원본과 valid projection 분리; call-site 방어도 유지 |
| index.html:3730 weeklyDaylightCandidates | scoreEligible===true 확인 후 Number(score)의 유한성만 검사. null/빈 문자열/boolean을 0 또는 1로 변환함 | 최고점·일별 선택 및 만조 nearest 선택 이전에 shared typed predicate |
| index.html:3850/3889 weeklyTideWeather/weeklyTideNearestSample | weekly nearest는 위 필터를 사용. today null은 명시 차단하지만 numeric-string/bool/범위오류·unknown eligibility는 통과 가능 | weekly/today adapter에서 같은 계약, 기존 90분 상한·주의 기준은 그대로 적용 |
| index.html:3974 weeklyWeatherEntryForSite | weekly score에 Number(), today는 결측 일부만 차단 후 Number(); eligibility!==false를 적격으로 가정 | true만 적격. 필수 weather 불명·score 모순은 null entry 반환 |
| index.html:4034 weeklyRecommendationForSite | score 없을 때도 일반 공지 issue-only 후보가 살아남을 수 있음. 선상/weekly 명시 sample 관문은 존재 | 어떤 사유·가점·mandatory도 유효점수 필수 계약을 우회하지 못하게 final entry validation |
| index.html:4128/4144 weeklyRankScore/todayRecommendedSites | finite rank나 score만 사용; 안전 함수 null은 final 선발에서 제외하지 않음 | raw-score eligibility 별도. final selection에 valid entry guard. rankScore>100 허용 유지 |
| index.html:3418/3484/3561/3609 계절 선발·fill | 호출자가 정상 후보만 넘긴다는 가정. invalid entry 직접 주입에 대한 통합 방어 없음 | selector input 또는 공통 add에서 valid entry guard, quota 숫자와 정렬 변경 없음 |
| index.html:4229/4247 편집/추천 패널 | candidate+safe===false만 제외 | same valid contract 재사용, 별도의 일반 공지 콘텐츠는 그대로 표시 가능 |
| index.html:2066/2083/2098/2105 stored/popup/today-from-week | null을 숫자로 표시하진 않지만 numeric-string/bool/range는 완전히 검증하지 않음. unknown eligibility를 true로 해석하는 경로 존재 | number predicate+validated provenance. converted weekly object는 sample 적격 정보를 private adapter에서 전달 |
| index.html:1900/1909 점수·별점 표시 | Number() 사용, raw/weather 적격에 의존 | invalid score는 미확인. raw weather/조석 정보 표시와 점수 적격을 분리 |
| index.html:2518 live popup 합성 | Worker의 관측/예보가 wind/rain/temperature를 갱신하지만 score 자체는 저장 기상에서 유지 | live hour rain을 3h score 원자료로 재계산하지 않음. base stored validation provenance 보존 |
| weather-proxy/src/index.js | KMA 관측/초단기/내일 기상 수신·물리량 검증. 주간 score를 생성·정렬하지 않음 | 이 S2 최소안에는 Worker/D1 변경 불필요 |

행 번호는 같은 index.html 기준이다. Python 필수 수치는 windSpeed, windDirectionDeg, precipitation3h이며 wave는 showWave/island/pelagic에 한해 필수다. visibility/gust/cloud는 현행 optional 의미를 유지한다. weather_rules의 감점 문턱과 P0 안전 문턱을 필수 데이터 계약과 혼동하지 않는다.

## 허용 계약

- raw score: JavaScript typeof number + Number.isFinite + 0<=score<=100. Python int/float(명시 bool 제외) + math.isfinite + 같은 범위. 정수·소수·0·100 허용.
- null/undefined/NaN/±Infinity/빈 문자열/숫자 문자열/bool/음수/100 초과는 거부. 1e999 JSON overflow도 거부.
- scoreEligible 값은 별도 own boolean 필드이며 추천에는 true만 허용. false·누락·null·숫자·문자열·상속 property는 적격 증거가 아님.
- missingScoreFields는 실제 list/array, eligible true일 때 명시적으로 빈 목록이어야 한다. 목록이 비었어도 필수 수치가 실제로 없는 모순은 거부한다.
- weekly windSpeed·precipitation3h는 finite number>=0, direction은 0<=x<360. 필요한 wave도 finite number>=0. 파고 비필수 내륙의 null은 허용한다.
- today는 원래 숫자형 windSpeed/precipitation3h가 없으므로 기존 저장 formatted wind/rain/wave 또는 생성 시 추가되는 typed projection으로 검사한다. root schema를 weekly형으로 강제하면 정상 today 자료를 오탐한다.
- 0점은 정상 점수다. 이번 계약으로 새 최소 추천 점수 문턱을 만들지 않는다. 적격 점수 0이더라도 강수·파고·선상·계절·만조·시간 관문은 별도로 통과해야 한다.
- raw score<=100은 가점 적용 전 조건이다. rankScore=raw+기존 report bonus는 100을 초과해도 유효하며 100으로 clamp하지 않는다. 최대16·4/3/1/2는 유지한다.
- scoreEligible false의 today saved_reference는 이전 숫자·날씨를 보존할 수 있다. 그것을 현재 적합도나 추천으로 승인하지 않는다. weekly false의 score=None 계약과 분리한다.
- 공지-only 미확인 후보 제외 및 today unknown eligibility 제외는 현행 동작을 더 보수적으로 바꾸는 명시적 계약 강화다. 단순 숫자 coercion 교정과 정책 영향이 같다고 설명하지 않는다.
- 현재 P0 절대 90분·강수1mm·파고2m·선상풍속6m/s/파고0.7m/강수0 등 안전 조건과 원자료 우선 사용을 완화하지 않는다.

## 재현 결과

### 156행 비교

26개 입력/metadata 변형을 일반 weekly, 갯벌 weekly, 섬 weekly, 선상 weekly, 일반 today, 갯벌 today의 6개 실제 full candidate→final 경로에서 실행했다. 합성 입력에 기존 공지와 report bonus를 같이 둬 우회가 가능한지도 확인했다.

| 경로 | 현행이 설계 후보 계약과 다른 행 수 |
|---|---:|
| 일반 weekly | 13 |
| 갯벌 weekly | 13 |
| 섬 weekly | 14 |
| 선상 weekly | 6 |
| 일반 today | 20 |
| 갯벌 today | 14 |
| 합계 | 80 |

80은 합성 행의 후보 적격 계약 차이이며 80개의 별개 운영 결함·안전 사고를 뜻하지 않는다. 결측 coercion, score range/type, actual required-field 모순, unknown eligibility·공지-only 정책 강화가 함께 포함된다.

주요 사례:
- weekly score:null+eligible:true → 일반/갯벌/섬 entry.score=0, 기존 report bonus16이면 rank=16, 1곳 fixture의 final top에 포함됨. 선상은 typeof number 검사로 null 자체는 차단.
- weekly empty/bool은 비선상에서 0/1, 숫자 문자열은 92로 변환됨.
- 선상은 number finite지만 raw 범위를 확인하지 않아 score:-1 및101이 기존 기상 조건을 통과하면 후보가 됨.
- 일반 today score:null/NaN/undefined는 weatherEntry에서 거부돼도 공지 사유가 있으면 entry.score:null, safe:null인 후보를 final top에 넣을 수 있음. 같은 null 입력에서 공지가 없으면 current도 제외.
- 갯벌 today score:null은 만조 기상 관문이 이미 차단함. 문자열92/bool/음수/>100 및 eligibility unknown은 별도 보완 필요.
- missingScoreFields:['precipitation']이면서 eligible:true, 또는 실제 wind/rain/requiredwave:null인 모순 입력은 현재 일부 경로에서 후보에 들어감. 지금 고정 데이터에서 관찰되었다는 뜻은 아님.
- metadata null/absent true assumption과 required wave 비대상 null을 구분했다. today windDirectionDeg:null은 그 schema에 없는 필드를 건드린 것으로 기대 적격에 영향을 주지 않는다.

### 특별 분기 32건

- 같은 날 두 만조 및 서로 다른 날짜: 가장 높은 만조의 score가 null이고 낮은 만조에 유효 score80이 있으면 current는 높은 조위의 score0을 택함. 분석 guard는 invalid sample을 만조 선택 전에 제외해 각각 870cm/880cm의 유효한 만조를 택함.
- 최종 후보를 만든 뒤 score만 검사하는 방식은 invalid highest가 valid lower를 가리는 문제를 해결하지 못함. sample 필터·tide 선택 전 검사와 final 방어가 모두 필요.
- 공지·report·mandatory 없이/있이 weather 없는 후보, 부족 fill의 invalid entry, 4계절 selector 직접 invalid entry 주입.
- 봄·여름·겨울에서 weekly와 today의 0/null 비교 12건.
- 90/91/120분, 일반 강수0.999/1·파고2, 선상 6/0.7 경계와 초과·강수 양수. score0도 안전 관문을 우회하지 않음.
- invalid score의 popup 적격은 false로 두면서 기존 raw wind/rain/wave/forecastTime 문자열 보존 확인.
- 특별 분기 설계 모형 기대 assert 32/32. 156행 기대 assert 156/156. 생산 구현을 적용한 테스트 결과가 아니다.

### 고정 정상 결과 불변

단순 최종 predicate filter만 돌린 것이 아니다. 실제 함수의 private binding을 별도의 분석 factory 안에서 감싸 다음 순서로 실제 todayRecommendedSites를 실행했다.

1. weeklyDaylightCandidates 결과를 strictWeekly로 검사해 일별 대표점수·계절 최고점·tide nearest 선택 **전에** 잘못된 sample을 제거.
2. weeklyWeatherEntryForSite와 weeklyTideWeather의 today adapter에 엄격한 계약 적용.
3. weeklyPelagicSafety에서 raw range 확인 추가.
4. weeklyRecommendationForSite 결과와 4계절 selector input을 strictEntry로 검사.
5. 점수 표시용 weatherScoreAllowed에 raw number/range 검사 적용.

current와 가상 guard의 전체 top 객체(position/ID/raw/display/rank/bonus/date/time/axis) 및 후보 수176을 deepEqual로 비교했다. current 결과는 기존 loadP1C({cap:16,reports:true}) 런타임과도 exact compare했다. 10곳/점수/순서/후보 수가 불변이다.

기존 고정 추천 ID:
108,112,15,194,126,14,107,48,195,3

가상 wrapper의 display는 raw numeric/range만 보완했다. 실제 UI의 fresh/provenance/scoreEligible adapter·live 합성·모바일 layout 전체 구현이 끝났다는 증거는 아니다. 별도 구현 시 브라우저 테스트가 필요하다.

### Python 28×2=56호출

현재 today validator가 16문서를, weekly validator가 8문서를 받아들였다. 단순 pass 총계를 계약 준수로 해석하지 않는다.

- 정수0/100·소수92.5 두 validator 허용; null·score 누락·NaN/Inf·empty/string·음수/>100·bool score 두 validator 거부.
- eligibility 1/'true'/0.5는 두 validator가 true처럼 취급해 문서를 받아들임.
- missingScoreFields:null은 두 validator가 빈 것처럼 취급해 허용. 누락은 weekly KeyError, today는 get이어서 허용.
- 실제 required wind/rain/wave 결측은 weekly가 차단. today formatted 데이터는 숫자 필드 검증 대상이 아니므로 같은 표시 자료 결측을 직접 확인하지 않음.
- today eligibility false/null/누락 문서 수용은 추천 적격을 뜻하지 않는다. false+이전 유효 숫자 score는 의도된 saved_reference일 수 있으므로 무조건 오류로 세면 안 된다.
- 정상 ineligible null+사유 문서는 유지한다.

## 대안 비교 및 우선 권고

| 항목 | S2-A: shared frontend predicate+today/weekly adapter+Python strict type parity | S2-B: 수신 경계 normalized/quarantined projection + schema contract |
|---|---|---|
| 안전성 | sample 최대점·만조 선택 전+final/fill 모두 적용하면 높음. 누락된 호출 지점 위험이 있어 call graph 테스트 필요 | 불완전 입력을 invalid projection으로 격리하므로 다중 consumer에 강함. provenance/valid view 설계가 더 큼 |
| 호환성 | 현행 필드·응답 보존. unknown eligibility 및 공지-only 숫자 결측 추천은 의도적으로 제외 | raw document 보존하고 별도 valid view 사용하면 호환. 전체 문서 삭제 방식은 정상 날씨 정보 손실 |
| 정상 오탐 | typed 0/float·optional null·today formatted adapter를 명시하면 낮음. 과도한 regex/새 TTL 도입 주의 | schema 버전·구형 자료 adapter가 불완전하면 오탐 가능 |
| 코드 범위 | index.html 함수 지점 + Python validator/tests. 생성식 및 점수·quota 유지 | loaders·전역자료 consumer·presentation provenance·schema/tests까지 더 큼 |
| Worker/D1 | 필요 없음 | 브라우저 projection만이면 필요 없음. typed today fields를 generator에서 추가할 경우 Python만 변경, 원본 필드 유지 |
| API 응답 | 기존 public reports 응답 변화 없음. weather JSON 기존 필드 유지 가능 | additive schema marker/typed fields는 선택; breaking replacement는 피함 |
| 테스트 | 표156+특수32·cross-runtime numeric matrix·full regression으로 가능 | malformed document 부분격리·새로고침·구형/신규자료·stale projection·cache race 추가 |
| 롤백 | frontend/Python validation commit 분리 복귀가 간단. 공개 보호 S1 보완을 함께 되돌리지 않음 | schema consumer/version/cache 복귀까지 필요, 더 어렵음 |

가장 작은 우선안은 **S2-A**다. 모든 selection path가 재사용하는 순수 typed score predicate와 source-specific eligibility/weather adapter를 두고 sample 선택 전과 최종 후보/selector의 불변조건을 맞춘다. 숫자 문자열을 변환해 살리거나 score를0으로 채우지 않는다. parse/format은 today 원래 기상 문자열 adapter에서만 하고 raw score는 변환하지 않는다.

Python validator 강화는 scoreEligible 정확한 bool·missingScoreFields list, actual eligible required-field 확인에 집중한다. 이미 정상 구현된 finite_number와0~100 조건을 중복 변경하지 않는다. previous_saved reference 값을 지우는 통합false→None 규칙을 만들지 않는다.

S2-B는 향후 typed today 표준화/독립 consumer 확대 시 검토한다. 지금 최소 방어에 불필요한 전역 구조 변경을 섞지 않는다.

## 구현 전 확정할 테스트·롤백 조건

- S2-T01 score value matrix: JS/Python 같은 허용 truth table, inherited eligible property도 rejected.
- S2-T02 actual required fields와 empty/null/absent reason list, nonrequired wave null.
- S2-T03 general/tide/today/island/pelagic/notice/report/mandatory/editorial/fill 각 candidate와final 모두.
- S2-T04 invalid highest+valid lower: general 시각·같은날 두만조·다른날 만조 및 P0 gap90/91/120.
- S2-T05 0/100/float 정상 score와 bonus rank>100 보존, cap16/quota/P1-B array behavior 미변경.
- S2-T06 public current stored_score, previous_saved reference, todayFromWeek, live popup merge의 score provenance/별점/미확인/원시 날씨·조석 정보.
- S2-T07 10/8 22:40 fixed top 전체 객체·후보176 exact reproduction. current remote main 날씨는 별도의 live audit로 표기.
- S2-T08 126 weekly·Python weather/tide·reports-api 및 현장소식/삭제/관리승인 회귀. M02 unknown eligibility를 true로 기대하는 기존 테스트는 명시적 계약 강화 승인 후 기대값 변경 근거를 기록.
- S2-T09 PC/모바일 popup와추천패널·normal/live network·JSON invalid/old/new/cache refresh concurrency.
- P0/score source safetyRaw의 hard limits 유지. parser 시각과 fresh metadata를 numerical contract에서 강제로 true로 올리지 않는다.
- 구현 분리: frontend guard/Python validator를 각각 review할 수 있는 commit, 배포전 고정 재현+현재generated data validators; main/Pages/Worker/D1 변경은 별도 승인 후.
- 캐시: 현재 JSON no-cache+발행 stamp·seq guard 유지. 기존 cache가 이전 policy로 계산한 추천을 남기지 않게 새 frontend 로드에서 valid projection/recommendation cache 재검증. freshness 미확인 데이터를 자동수치보정하지 않음.
- 롤백: source commit rollback 가능 여부 검증. 보호 S1 정책을 운영에 적용한 뒤 S2만 되돌릴 때 보호 여부가 이전 취약 code로 돌아가지 않게 별도 commit. raw/원본 제보·기상·DB변환을 하지 않았으므로 파괴적 데이터복구 불필요.
- 기존 invalid 데이터가 없었다는 범위 확인만 했고 앞으로의 수신 오류 확률은 추정하지 않았다. 현재 wrapper는 신규 TTL 또는 전부지기상바람 제한을 도입하지 않았다. 날짜 유효성/provenance를 더 엄격하게 할 때 별도 policy/test 범위를 명시해야 한다.
