# PR #13 R6 최종 독립 검증

## 1. 종합 판정

**수정 필요. 추천 적격성 정책은 C — 배포 차단.** R6의 출처·표시 보완은 통과했고, 정상 자료의 점수·추천·P0·S1-R 회귀 및 최신 main 임시 결합도 통과했다. 그러나 실제 예보 날짜가 추천일과 다른 자료, 예보시각 검증이 불가능한 자료가 참고 표시만 받고 최종 추천에 남는다. 알려진 무효 시각 자료를 점수·제보·mandatory·정원으로 추천하는 동작은 승인할 수 없다.

이는 R6에서 새로 생긴 후보 회귀가 아니다. 이전 SHA에도 같은 후보·순위 동작이 존재한다. R6가 해결한 표시 결함과, 이번 요청에서 별도로 검증한 미해결 선발·시각 관문을 분리한다. 테스트 성공을 이 계약 위반의 해결로 간주하지 않는다.

예정 갱신 지연만 있고 예보 날짜·실제 시각·필수 기상값·생성시각이 유효한 경우는 물리적으로 위험하다고 단정할 수 없다. 이 좁은 조건에 한해 **B 정책 논의**가 가능하다. 허용 지연·내부점수 사용·표시 설명·복구 동작을 명시하고 사용자 승인을 받아야 한다. 현재 모든 참고 상태를 함께 유지하는 **A는 부적합**하다. C는 알려진 무효 예보의 선발 차단을 반드시 요구하며, 모든 참고 자료 제외는 분석한 보수적 대안이다. 검증자가 후보 정책을 구현하거나 임의 허용 시간을 만들지 않았다.

## 2. 정확한 코드·자료·권한

- 검증 head: **e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6**.
- 이전 차단 head: **8ccb248faa2c5c7b5a6019d12e19e21031169460**.
- 확인한 원격 main: **b0975cad9f3112af38cc286a892bf6f06722ce12**.
- 임시 결합 tree: **59d2dbf50fd9914e97e17d2902a7b804e37219d4**. merge-tree만 사용했으며 main·PR을 병합하지 않았다.
- 검증 브랜치: review/p1-s-pr13. 검증 브랜치의 제품 파일은 이전7eb 버전이므로 실행 대상으로 사용하지 않고 위 SHA의 별도 archive를 실행했다.
- 원 설계 P1_SAFETY_DESIGN §8~10, AI_WORK_RULES, 이전 R4/FINDINGS/NEXT, 구현 보고6081270125 및 전체 새 diff를 확인했다. P1-A~D를 반복하지 않았다.
- 이전 대비14파일 변경. 제품 런타임 변경은 index.html의 today adapter와 호출부14줄이며, 나머지는 테스트·fixture·비교 도구·인수인계다. weatherScoreAllowed나 원본 유효점수 검사를 완화한 변경은 없다.
- 고정 자료는 **2026-10-08 22:40 KST**, immutable manifest16파일, 공개 승인 제보11곳/24종명 문자열,190곳을 사용했다. 최신 main·10/10 합성 자료와 이 입력을 혼용하지 않았다.
- 민감 원자료·비밀·보호종 원좌표를 수집/저장하지 않았다. 좌표 변경 확인은 기존190곳 벡터 해시로만 기록했다. 브라우저 API는 로컬 합성 API/메모리 DB이며 운영 Worker·D1·실제 제보 POST/DELETE는 하지 않았다.

## 3. R6 출처·카드·팝업 판정: 통과

정확한 head에서 weeklyTodayWeather(site, raw)는 원자료 계약 통과 후 **storedWeatherState(raw, weatherToday, undefined, site)**를 호출한다. 날짜·forecastTime·generatedAt·예정 갱신·stale의 기존 판정이 그대로 전달되며 raw 객체를 임의 현재 적격으로 승격하지 않는다. 일반 fallback/만조 fallback/entry/card/popup 경로를 실제 함수와 실제 Chrome DOM으로 확인했다. applicable today entry115건에서 상태 전체 필드가 원래 storedWeatherState와 같았다.

| 참고 입력 | 실제 함수 및 Chrome 표시 |
|---|---|
| 예정 갱신 경과 | 카드·Leaflet 팝업 모두 오늘 적합도 미확인 |
| 미래 generatedAt | 같은 미확인 상태 |
| generatedAt 비정상 | 같은 미확인 상태 |
| item/root 생성시각 누락 | 같은 미확인 상태 |
| 예보 날짜 불일치 | 같은 미확인 상태 |
| 실제 Python builder sparse6h 출력 | 갱신 예정 이후 두 표시 모두 미확인 |

실제 builder에 합성6시간 예보를 입력하여06:10 생성·오늘12:00 예보·raw92·scoreEligible true·stale false가 나오는 것을 확인했고 실제 validator도 수락했다. 변경하지 않은 출력은08:00에는 현재,11:00에는 예정 갱신10:17 경과로 참고가 된다. 제품 fixture와 독립 builder 출력의 JSON 일치도 확인했다. **실제 운영에서 이 입력이 발생했다거나 그 빈도를 확인한 것은 아니다.** validator의 스키마 통과가 평가시점의 추천 현재성을 보증하지도 않는다.

5폭344/375/768/1024/1440px에서 기존 정상·안전·결측145건과 참고 만조30건, 합계 **구현자 보고175/175를 독립 재현**했다. 일반 참고/일반 대조/주간 대체70건을 추가하여 **245/245, fail0, 실행 예외0**. root가 별도375px에서49/49를 재실행했다. 정상0·92·92.5·100, 제보16에 따른rank108, 정상 및 안전한 대체 만조,90분 허용·91분 제외, 주간 기상 표시, 필수 풍속·강수·파고 결측과 metadata 누락/null/false·previous_saved를 포함했다.

추천 카드는 유효한 주간 기상을 우선 사용한다. 팝업은 정상 today가 있으면 today 점수를 사용하고, today가 참고일 때 유효한 주간 자료로 대체한다. 주간 registry에 장소가 없을 때 fallback을 시도하며, 장소가 존재하지만 samples가 부적격인 경우에는 현재 코드가 일반 today로 무조건 되살리지 않는다. 이 동작을 대안 분석에서 그대로 유지했다. 만조±90분 위반으로 카드가 없는 경우와 그 장소 자체의 오늘 기상 팝업(정상 점수 포함)을 표시 불일치로 세지 않았다.

새 R6 카드 테스트를 이전8ccb에 테스트만 복사해 실행하면 **10pass/2fail**, 새 head에서는12/12pass다. 실패는 R6 참고표시 시험2건이며 제품 코드 수정 없이 이전 결함의 해결을 입증했다.

## 4. 독립 자동 회귀·추가 계약

| 실제 실행 범위 | pass | fail | skip |
|---|---:|---:|---:|
| reports_api | 178 | 0 | 0 |
| weekly | 147 | 0 | 0 |
| frontend | 110 | 0 | 0 |
| chromium | 20 | 0 | 0 |
| card_dom | 12 | 0 | 0 |
| weather | 54 | 0 | 0 |
| tide | 21 | 0 | 1 |
| weather_proxy | 36 | 0 | 0 |
| **합계** | **578** | **0** | **1** |

실제 명령·8실행 범위·환경 변수는 results/r6/execution_manifest.json, 출력과 해시는 test_summary.json 및 각 TAP에 보존했다. reports-api178에는 Node가 발견한 helper 모듈1건이 포함된다. 프런트110은 today 자정/현장소식/제보 검색/site history cache/recent contributors/공지KST/월간KST/tide fallback/자동갱신9파일이다. Chromium20은 notice close7 및 month tide13을 실제 Chrome으로 실행했다. 조석 skip1은 공식 샘플이 현행 rolling 기간 밖인 기존 skip이다.

- 실제 제품 함수 **S2 행렬182/182, 특별 분기21/21, 팝업 계약12/12** 통과.
- 추가 계약103건은 **100pass/3불일치**. 3건은 R5의 극단 숫자문자열 wind/rain/wave이며 아래 잔여 위험으로 남긴다. 578 회귀나 보안 통과에 합치지 않았다.
- R1~R3 필수 실제자료·own scoreEligible/score·typed score·finite/range·비필수 파고 계약을 유지했다. 점수0/100/92.5와 내부rank108을 구분했다. 참고용 기온·풍향·조석은 유지된다.
- P0 정상 시각의90/91,6h/24h 간격 상한, 안전 대체 만조, 강수1mm 경계 및 결측·선상 기상 관문은 기존 시험과 상세 DOM에서 통과했다. **잘못된 절대 날짜 입력에 대한 아래 반례는 별도 미해결**이다.
- S1-R actual 보호 표현171건 누락0, 일반종17건 오탐0. 줄바꿈/슬래시/수량·일반종 혼합, 최근집계18, 기존 저장/신규입력·현장소식, 인증 관리자5, 본인삭제4를 실제 handler·인메모리 DB로 재실행했다. 신규표현 방어를 승인 후 전면 비공개 S1-P 완료라고 해석하지 않았다.

## 5. 추천 적격성 정책: C의 재현 가능한 근거

제품 함수의 위치는 정확한 head index.html 기준이다.

| 위치 | 실제 역할·미해결 관문 |
|---|---|
|2066 storedWeatherState|시간·생성·예정갱신·stale를 판정해 참고/false 상태를 만든다.|
|3872 weeklyTodayRecommendable|raw own score/eligibility/필수값은 확인하나 실제 출처 시각을 검사하지 않는다.|
|3882 weeklyTodayWeather|정확한 상태를 전달하나 false/reference 객체도 반환한다.|
|3894 weeklyTideWeather|raw.date와 시·분 근접 검사를 사용해 실제 forecast 날짜 불일치를 걸러내지 못한다.|
|4018 weeklyWeatherEntryForSite|raw.date의 범위만 확인하고 참고 entry를 채택한다.|
|4117 entry 최종 점수 검사|dayScore 숫자 유효성을 확인하나 시간 적격 상태를 보장하지 않는다.|
|4183 weeklyRecommendationIsSafe / 4190 todayRecommendedSites|기상 수치 caution과 점수 확인 뒤 rank/mandatory/정원으로 전달하며 출처 false를 차단하지 않는다.|

실제 함수18조합(9조건×만조/일반)을 **2026-10-10 11:00 KST**에 실행했다. before/head 모두 18조합 중 후보·최종14건으로 같으며 새 head에서는 이 중 참고 상태12건이 남는다. 원자료 own scoreEligible은 true, 파생 _weatherState.scoreEligible은 false다. 이를 raw false 우회로 잘못 설명하지 않는다. canonical previous_saved/rawfalse/staletrue는 두 경로 모두 차단됐다.

핵심 반례: raw.date=10/10, forecastTime=**10/9 12:00**, 만조=**10/10 12:00**. 날짜를 포함한 절대 차이는 **1,440분**이나 시·분만 보면0이므로 후보·최종·수치안전=true가 된다. raw92+최근제보16=rank108, mandatorytrue이고 카드·팝업은 미확인이다. 일반 fallback은 forecastTime 오류·누락에도 최종에 남는다. 공지·제보·mandatory가 부적격 출처를 제거하지 못한다.

S2-A 설계의 rawValid ∧ eligibilityValid ∧ requiredDataValid ∧ **기존 시각/안전/계절 관문**과 대조할 때 알려진 날짜 불일치·검증 불능 예보를 현재 추천 근거로 사용하는 것은 부합하지 않는다. 풍속·강수·파고 수치가 기준 안이라는 것과 해당 만조의 유효한 기상예보를 확인했다는 것은 별개다. 미확인 표시도 내부순위 선발의 유효성을 회복하지 않는다.

반례는 합성 코드 계약 시험이며 정상 builder가 날짜를 잘못 생성했다는 증거가 아니다. 확인한 정상 builder는 예보 날짜를 유지하며 validator는 날짜 불일치를 거절한다. 실제 운영 발생·침해·사고·위험 기상 관측을 단정하지 않는다. 그럼에도 이번 명시적 검증 범위에서 알려진 무효 시각 경로를 남긴 채 승인할 수 없다.

예정 갱신 지연만으로 물리적 위험을 단정하지 않는다. 실제 예보가 같은 날 정상시각이고 기상·P0 조건이 모두 검증된 지연 자료라면 별도 B 정책을 논의할 수 있다. 이 예외는 future/bad/missing generation 및 invalid/mismatched forecast와 분리해야 한다. 허용 최대 나이·점수/가점 사용 여부를 검증자가 임의로 정하지 않는다.

## 6. 동일 입력 정상 추천 전수 비교

35141c0 / 최신main b0975cad / 이전8ccb / 새e9c 네 버전에서190곳 전수 signature와 좌표 벡터 해시,176후보·176 수치안전 후보, 제보ON/OFF 최종결과가 모두 같다. 모든 raw/display/rank/bonus/date/time/axis/order를 비교했다. 아래 유형은 **추천 선발 축**이며 실제 서식환경 분류와 다르다. 기존 유형 정원 및 mandatory 때문에 rank가 전체 내림차순인 표가 아니다.

### 최근 승인 제보 ON

| 순위 | ID·탐조지 | 원점수 | 표시 | rank | 제보 가점 | 추천일·시각 KST | 선발 유형 |
|---:|---|---:|---:|---:|---:|---|---|
| 1 | 108 호곡리 | 92 | 92 | 103 | 11 | 2026-10-09 09:00 | field |
| 2 | 112 알뜨르비행장 | 100 | 100 | 100 | 0 | 2026-10-13 09:00 | field |
| 3 | 15 천수만 사기리 | 92 | 92 | 94 | 2 | 2026-10-09 09:00 | field |
| 4 | 194 천수만 강당리 | 92 | 92 | 94 | 2 | 2026-10-09 09:00 | field |
| 5 | 126 해리천습지 | 92 | 92 | 94 | 2 | 2026-10-09 09:00 | mudflat |
| 6 | 14 걸매리 | 92 | 92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 7 | 107 매향리 | 92 | 92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 8 | 48 대진항 | 92 | 92 | 92 | 0 | 2026-10-09 09:00 | pelagic |
| 9 | 195 평화의공원 | 92 | 92 | 108 | 16 | 2026-10-09 09:00 | other |
| 10 | 3 굴업도 | 100 | 100 | 100 | 0 | 2026-10-09 18:00 | other |

### 최근 승인 제보 OFF

| 순위 | ID·탐조지 | 원점수 | 표시 | rank | 제보 가점 | 추천일·시각 KST | 선발 유형 |
|---:|---|---:|---:|---:|---:|---|---|
| 1 | 112 알뜨르비행장 | 100 | 100 | 100 | 0 | 2026-10-13 09:00 | field |
| 2 | 7 교동도 | 92 | 92 | 92 | 0 | 2026-10-09 12:00 | field |
| 3 | 8 석모도 | 92 | 92 | 92 | 0 | 2026-10-09 18:00 | field |
| 4 | 10 강화도 | 92 | 92 | 92 | 0 | 2026-10-09 09:00 | field |
| 5 | 126 해리천습지 | 92 | 92 | 92 | 0 | 2026-10-09 09:00 | mudflat |
| 6 | 14 걸매리 | 92 | 92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 7 | 107 매향리 | 92 | 92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 8 | 48 대진항 | 92 | 92 | 92 | 0 | 2026-10-09 09:00 | pelagic |
| 9 | 3 굴업도 | 100 | 100 | 100 | 0 | 2026-10-09 18:00 | other |
| 10 | 5 대청도 | 100 | 100 | 100 | 0 | 2026-10-09 18:00 | other |

합성 score null11곳 입력은 별도 시험이며 기존 허위0점 후보가 제거되어165곳이 된다. 이 결과를 정상176후보와 혼용하지 않는다. 전체 후보·추천 필드·해시는 independent_replay.json 및 review_summary.json에 보존했다.

## 7. 참고 제외의 영향: 분석만 시행

**19시나리오×ON/OFF=38조건**. 실제 후보/P0/점수는 수정하지 않고, 선발 직전 분석용 필터를 적용한 뒤 실제 autumnBalancedRecommendations와 독립4/3/1/2·기존 tuple/phase 선발을 대조했다. 현행, 참고 kind 제외, 파생 display eligibility 명시true 요구의3조건 **114회가 일치**했다. 두 필터의 retained set은 이번38조건에서 같지만 모든 자료형에 보편적으로 같다고 증명한 것은 아니다. unknown state는 실제 현행 후보에 없었다.

- 정상 주간 고정 자료:176→176, 상위10 불변.
- **실제 고정 자료의 주간 미수신**:166→166, 참고 후보0. today generated21:04/forecast21:00이22:40에 현재로 판정되므로 strict 제외로0이 되는 사례가 아니다. 190 중24제외는 만조3/선상 주간필요9/계절13에서1중복이며 실제 필수 today 결측0이다. 정상 주간176과의 차이는 로더 입력 변경이다.
- 같은 물리 기상·점수·예보·조석을 고정하고 생성 metadata만 지연/미래/오류/누락으로 만든 주간 미수신 조건:166참고 후보가 현행에서는 유지되고 분석용 제외 시0. **운영 발생률을 측정한 결과가 아니다.** 후보0은 유효 근거가 없을 때의 빈 추천 상태이며 안전한 후보를 임의 점수로 보충하지 않는다.
- 주간11제보 장소만 누락+해당 today 참고인 혼합 조건:176→165. ON은 기존10에서112,7,8,20,14,107,9,48,3,5로 바뀐다. OFF도 같은 filtered list이며 현행은112,10,15,7,126,14,107,48,3,5다. 유효한 주간자료가 있는 나머지 장소는 유지된다.
- 주간 장소가 존재하지만 해당11 samples가 부적격인 조건은 현행부터165이고 추가 제외 효과0. 누락과 부적격을 동일 fallback 정책으로 바꾸지 않았다.
- 실제 builder 단일장소 출력은08:00 현재1→1,11:00 참고1→0. 10/8 고정 실험과 달리 별도10/10 합성 clock이며 같은 입력 내에서만 전후 비교했다.

### 전체38조건 결과

| 조건 이름 | 제보 | 현행 후보 | 참고 후보 | 분석용 제외 후 | 현행 상위 ID | 제외 후 상위 ID |
|---|---|---:|---:|---:|---|---|
| fixed_normal_week | OFF | 176 | 0 | 176 | 112, 7, 8, 10, 126, 14, 107, 48, 3, 5 | 112, 7, 8, 10, 126, 14, 107, 48, 3, 5 |
| fixed_normal_week | ON | 176 | 0 | 176 | 108, 112, 15, 194, 126, 14, 107, 48, 195, 3 | 108, 112, 15, 194, 126, 14, 107, 48, 195, 3 |
| fixed_week_loader_failure | OFF | 166 | 0 | 166 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 |
| fixed_week_loader_failure | ON | 166 | 0 | 166 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 |
| fixed_week_empty_registry | OFF | 166 | 0 | 166 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 |
| fixed_week_empty_registry | ON | 166 | 0 | 166 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 |
| fixed_week_missing_site14 | OFF | 175 | 0 | 175 | 112, 7, 8, 10, 126, 107, 9, 48, 3, 5 | 112, 7, 8, 10, 126, 107, 9, 48, 3, 5 |
| fixed_week_missing_site14 | ON | 175 | 0 | 175 | 108, 112, 15, 194, 126, 107, 9, 48, 195, 3 | 108, 112, 15, 194, 126, 107, 9, 48, 195, 3 |
| fixed_week_missing_report_sites | OFF | 176 | 0 | 176 | 112, 10, 15, 7, 126, 14, 107, 48, 3, 5 | 112, 10, 15, 7, 126, 14, 107, 48, 3, 5 |
| fixed_week_missing_report_sites | ON | 176 | 0 | 176 | 108, 112, 15, 194, 126, 14, 107, 48, 195, 3 | 108, 112, 15, 194, 126, 14, 107, 48, 195, 3 |
| fixed_week_site14_no_samples | OFF | 175 | 0 | 175 | 112, 7, 8, 10, 126, 107, 9, 48, 3, 5 | 112, 7, 8, 10, 126, 107, 9, 48, 3, 5 |
| fixed_week_site14_no_samples | ON | 175 | 0 | 175 | 108, 112, 15, 194, 126, 107, 9, 48, 195, 3 | 108, 112, 15, 194, 126, 107, 9, 48, 195, 3 |
| fixed_week_report_sites_no_samples | OFF | 165 | 0 | 165 | 112, 7, 8, 20, 14, 107, 9, 48, 3, 5 | 112, 7, 8, 20, 14, 107, 9, 48, 3, 5 |
| fixed_week_report_sites_no_samples | ON | 165 | 0 | 165 | 112, 7, 8, 20, 14, 107, 9, 48, 3, 5 | 112, 7, 8, 20, 14, 107, 9, 48, 3, 5 |
| controlled_2240_today_fresh_week_failure | OFF | 166 | 0 | 166 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 |
| controlled_2240_today_fresh_week_failure | ON | 166 | 0 | 166 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 |
| controlled_2240_today_delayed_week_failure | OFF | 166 | 166 | 0 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 | 없음 |
| controlled_2240_today_delayed_week_failure | ON | 166 | 166 | 0 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 | 없음 |
| controlled_2240_today_future_week_failure | OFF | 166 | 166 | 0 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 | 없음 |
| controlled_2240_today_future_week_failure | ON | 166 | 166 | 0 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 | 없음 |
| controlled_2240_today_bad_generation_week_failure | OFF | 166 | 166 | 0 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 | 없음 |
| controlled_2240_today_bad_generation_week_failure | ON | 166 | 166 | 0 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 | 없음 |
| controlled_2240_today_missing_generation_week_failure | OFF | 166 | 166 | 0 | 7, 8, 10, 15, 126, 9, 11, 6, 3, 108 | 없음 |
| controlled_2240_today_missing_generation_week_failure | ON | 166 | 166 | 0 | 108, 15, 194, 37, 126, 9, 10, 195, 6, 34 | 없음 |
| controlled_2240_mixed_report_reference | OFF | 176 | 11 | 165 | 112, 10, 15, 7, 126, 14, 107, 48, 3, 5 | 112, 7, 8, 20, 14, 107, 9, 48, 3, 5 |
| controlled_2240_mixed_report_reference | ON | 176 | 11 | 165 | 108, 112, 15, 194, 126, 14, 107, 48, 195, 3 | 112, 7, 8, 20, 14, 107, 9, 48, 3, 5 |
| controlled_previous_saved_week_failure | OFF | 0 | 0 | 0 | 없음 | 없음 |
| controlled_previous_saved_week_failure | ON | 0 | 0 | 0 | 없음 | 없음 |
| controlled_sparse6h_before_due | OFF | 1 | 0 | 1 | 14 | 14 |
| controlled_sparse6h_before_due | ON | 1 | 0 | 1 | 14 | 14 |
| controlled_sparse6h_after_due | OFF | 1 | 1 | 0 | 14 | 없음 |
| controlled_sparse6h_after_due | ON | 1 | 1 | 0 | 14 | 없음 |
| controlled_sparse6h_future_generation | OFF | 1 | 1 | 0 | 14 | 없음 |
| controlled_sparse6h_future_generation | ON | 1 | 1 | 0 | 14 | 없음 |
| controlled_sparse6h_bad_generation | OFF | 1 | 1 | 0 | 14 | 없음 |
| controlled_sparse6h_bad_generation | ON | 1 | 1 | 0 | 14 | 없음 |
| controlled_sparse6h_forecast_previous_date | OFF | 1 | 1 | 0 | 14 | 없음 |
| controlled_sparse6h_forecast_previous_date | ON | 1 | 1 | 0 | 14 | 없음 |

목록 변경량이나 후보 감소를 그 자체로 개선이라고 평가하지 않는다. 기대 효과는 검증 불능 근거로 추천하는 것을 막는 것이며, 영향은 loader·metadata 상태에 의존한다. 빈 목록 안내·재시도·캐시 복구·정상 대안 선택 검증이 필요하다. 실제 운영 빈도 및 최신 자료 전체를 strict policy로 장기간 평가하는 작업은 남아 있다.

## 8. 최신 main 임시 결합·브라우저 회귀

merge-tree 충돌0. 결합 index는 정확한 PR head, weather_today/week 및 tide_today/month는 최신 main의 Git blob과 CRLF 정규화 후 동일함을 source_crosscheck.json에 검증했다. 자동 JSON을 PR의 과거 자료로 덮어쓰지 않았다. actual today validator190/190, weekly validator190곳·10640samples 성공; 결합 weekly147+frontend110=**257pass**. actual tide health100곳/39관측소 fresh/ok, live100/tomorrow100, unavailable/failed0. 월간 일부28대상·stale280은 기존 자료 상태로 남고 전체 월간 조석이 완전하다고 보고하지 않는다.

로컬 합성 API/실제 Leaflet1.9.3/Chrome에서 5폭 일반 E2E **55/55**, page exception0. 추천 패널/마커·팝업/제보/현장소식/본인삭제/현장소식 목록의 보호 길안내 제한·일반안내/네트워크 실패·캐시를 확인했다. 별도 새 정상 만조 card/popup92·rank108도 통과했다. 모바일 팝업의 기존 대략 좌표 안내는 유지되므로 모든 보호 위치의 안내가 차단됐다는 의미는 아니다. 보호/삭제 지연 응답 결함은 성공 합계와 분리한 진단이다.

운영 Workers/Turnstile/telemetry/타일은 navigation 전에 합성 응답으로 격리하고 CDN의 정적 GET/HEAD만 허용했다. 실제 운영 POST/DELETE·GPS·외부 길안내 이동은 차단했다. 네트워크 오류를 Leaflet 제품 실패로 오인하지 않았다. 5폭은 Chrome 에뮬레이션이며 실물 모바일·운영 접근권한/배포 설정·모든 세로길이/가림 상태를 검증한 것은 아니다. 스크린샷 확인에서375px 팝업 상단 일부가 고정 컨트롤과 겹치는 기존 레이아웃 한계가 보였다. R6는 CSS/팝업 배치를 바꾸지 않았으며 DOM 점수 일치 통과를 완전한 시각 배치 통과로 확대하지 않는다. DOM과 스크린샷16개 및 일반 E2E5개를 저장했다.

## 9. 잔여 보안 위험의 배포 판단

| 과제 | 직접 근거와 범위 | 우선순위·선행 차단 판단 |
|---|---|---|
|R5 극단 숫자문자열→Infinity|실제 JS12조건 및 추가계약3불일치 재현. before/head13개 관련 소스 blob 불변. 이전 실제 생성기의400자리 입력 finite 정제 및 hypot overflow의 inf 생성 표현에 대한 validator 거절 근거 유지. 400자리 formatted 문자열 자체는 Python validator도 수락.|별도 **P2 방어**. 현재 정상 생성 경로 유입 증거 없음·공개제보는 weatherJSON 쓰기 권한 없음. 현 PR의 독립 선행 차단으로 확대할 근거 없음. 실제 유입 확인 시 격상.|
|삭제 후 늦은 GET로 마커 복귀|actual owner-delete200→fresh GET 제외→old GET 완료 시 UI 복귀. 서버DB deleted/final fresh GET 제외 유지. root 실제 Chrome에서도 진단; 별도 handler 시험 렌더러는 대역.|별도 **P1 보안 PR을 우선**. 상태 철회·위치 안내 위험을 무시하지 않음. field 권한/공개확장 없음·서버 삭제와 fresh 제외 유지 근거로 현재 제한 PR과 분리 가능. 실제 민감정보 회수/비동의 노출 대응 릴리스라면 **배포 전 필수 차단**으로 격상.|
|보호 상태에 old 응답 재적용|main/head 관련8함수 동일, 기존6현상 실제 재현. JSON assertion pass는 결함 재현 성공이며 보호 기능 성공 아님. 현행field 공개status/confirm/delete는 location_hidden을 바꾸지 않음.|별도 **P1**. **backend 재분류/field hide/S1-P 상태전환 배포 전 반드시 차단**. 요청세대·응답 최신성·보호 상태 단조성 및 marker/popup/news/guide/cache 동시 회수 필요.|
|S1-P 승인 후 공개·간접 위치|S1-R 표현 방어 통과와 기존 approved/site history·stored flag·대략 위치 안내 정책은 다름.|별도 제품정책 승인 필요. 이번 PR로 전면 비공개 완료라고 선언 금지. 실제 비동의 민감노출 확인 시 기존/신규 여부와 무관하게 즉시 보류/회수.|

운영 민감행·건수·사고를 조회하지 않았고 실제 민감정보가 유출됐다고 단정하지 않는다. 삭제 문제를 단순히 기존 결함이라는 이유로 무시하지 않는다. 후속에는 pendingGET→delete200→fresh 제외→old 완료 후에도 제외 유지, 서버 보호 전환 후 old응답으로 안내 복귀 불가를 필수 회귀로 요청한다. 별도 정책은 검증자가 몰래 구현하지 않았다.

## 10. 구현자 보완 지시·다음 승인

1. **추천 출처 관문**을 후보 채택 전 및 최종 선발에 적용한다. 최소 known-invalid/unknown forecast 날짜·시각·출처는 배제한다. 일반/만조/today/주간/공지-only/unknown/mandatory/정원 보충 전체에서 같은 계약을 사용하고 가점으로 되살리지 않는다.
2. 만조는 실제 forecast timestamp와 tide timestamp의 **날짜·timezone 포함 절대 차이≤90분**을 검사한다. raw.date+시분만 맞는 어제/미래 날짜를 통과시키지 않는다. 미래 예보와 미래 generatedAt는 구분한다.
3. 정상적인 주간 후보와 차선 예보·다른 안전 만조를 먼저 탐색한다. 기존 안전 조건·정원·제보 점수·ID 동점 정책·S1-R 공개범위를 바꾸지 않는다. 참고 팝업의 기온·풍향·조석은 남긴다.
4. 후보 정책은 사용자 승인 후 구현한다. 보수적 기본안은 derived current eligibility 명시true를 요구하고 참고는 정보에만 남기는 것. 예정 갱신 지연 예외를 원하면 별도 B 정책에서 허용 시간·대표 예보·필수자료·내부점수/표시를 명시해 승인받는다. known-invalid 시각은 예외 대상이 아니다.
5. 정상·기존 차단 대조를 포함한18조합 actual 후보/final/rank 회귀, 절대90/91 및 날짜 넘어감,6h/24h·대체 만조, 제보16/공지/mandatory/보충 우회, 전체참고→빈목록·재시도·최신응답 복구·주간정상대안 시험을 추가한다. R6 표시245와 정상190/176·ON/OFF 전수는 유지한다.
6. 최신 head/main을 다시 확인해 임시 결합·validator·브라우저 회귀 후 독립 재검증을 요청한다. 별도P1 삭제/보호 응답 PR을 우선 계획한다.

이 문서는 검증·설계 요청이며 제품 코드는 수정하지 않았다. **main 병합·Pages/Worker 배포·운영 D1·실사용자 제보 변경 없음. 사용자 정책 승인과 구현자의 새 SHA를 기다린다.**

## 11. 근거·재개

원본 결과 results/r6, 재현 scripts/r6, 실행 명령 execution_manifest.json. 주요 자료: source_crosscheck.json, detailed_dom_full/root.json, independent_replay.json, r6_reference_policy.json, reference_selection(_before).json, pr13_r123_actual_matrix/extended.json, sparse6h_generator_proof.json, SECURITY_REVIEW_R6.md, R6_CONTRACT_POLICY_AUDIT.md. 로그·실패·skip을 보존했고 scratch제품 archive/profile은 검증 결과 복사 후 삭제한다.

중간 체크포인트3488b393271737850f27f16fc9c09d3bd7a2b648는 push 완료. 최종 보고 커밋과 PR13/Issue9 게시본문 read-back 증빙은 다음 세션에서 git log 및 results/r6/github_receipts.json으로 확인한다. 파일이 없으면 게시가 완료된 것으로 간주하지 않는다. 자기 커밋 SHA를 문서에 순환 삽입하지 않는다.


## R6 최종 게시·저장 완료

최종 보고 체크포인트 **20a73321c7ec09dd6262b9c3ef471660f2da8df0**를 검증 브랜치에 push했다. PR13 댓글 **6081928890** 및 Issue9 댓글 **6081932642** 게시 후 API로 본문 전체를 정규화 대조하여 일치를 확인했다. 정확한 URL·본문 SHA256·SHA·체크시각은 results/r6/github_receipts.json, 게시 본문은 FINAL_R6_COMMENT.md에 저장했다.

- [PR #13 최종 검증](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6081928890)
- [Issue #9 기록](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6081932642)

이 세션의 실험·보고·게시가 완료됐다. 추가 제품 실험은 남아 있지 않으며 **수정 필요/C 판정에 따른 사용자 정책 승인과 구현자 새 SHA를 기다린다**. 게시 증빙 최종 checkpoint는 git log -1에서 확인한다. main/Pages/Worker/D1/실사용자 제보 변경 없음.
