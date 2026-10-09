# P1-S 1단계 구현 체크포인트

브랜치 `fix/p1-s-safety-guards` (PR #13). **main 병합·운영 배포·Worker 배포·D1 변경은 승인되지 않았다.**
설계: 분석 브랜치 `analysis/recommendation-masterplan` 의 `P1_SAFETY_DESIGN.md`(60bfbdb). 분석·검증 브랜치는 변경하지 않았다.

## 진행 이력
| 단계 | 커밋 | 내용 |
|---|---|---|
| S1-R | dc6f0e5 | 보호종 수량·구분자·줄바꿈 판정 (Sol Ultra 독립 검증 통과, 이번 보완에서 변경 없음) |
| S2-A | b0cd662, 2892270, 56a797c, 7eb6764 | typed 점수·적격 계약, Python bool/list 검증, 비교 도구 (Sol 검증: 수정 필요 R1·R2·R3) |
| **R1+R3 보완** | aa4f394 | today 필수 기상값(풍속·풍향·강수·필수 파고) 검사, 비필수 wave 값 검사, own 적격 필드 |
| **R1 Python** | 70ef08a | `validate_weather.py` 적격 항목의 실제 wind/rain/(필수)wave 검사 |
| **R2 보완** | 362ce50 | 팝업 점수는 검증된 적격 출처에서만 표시 |
| 증거·문서 | 1bd2619 | R1~R3 재현 전후 matrix, 비교 결과 (Sol 재검증: R1~R3 해결, **R4 신규 회귀 지적**) |
| **R4 보완 코드** | 8e2ced9 | 검증된 today 만조 fallback 에 출처(`_weatherState`) 연결 → 추천 카드 점수 표시 |
| **R4 DOM 회귀 시험** | c2e1c8e, 8ccb248 | 실제 Chrome 에서 `renderTodayPanel` 카드 + 팝업 DOM 일치 시험 (344·375·768·1024·1440) — Sol 재검증: R4 해결, **R6(참고 자료 출처 승격) 지적** |
| **R6 DOM 시험(수정 전 실패)** | a7f0055 | 참고 today 6종 × 만조/일반 × 5폭, 실제 builder sparse6h fixture |
| **R6 보완 코드** | cb2a8c8 | 출처 판정을 `storedWeatherState` 한 곳으로 통합 (Sol 재검증: R6 표시 통과, **C 정책(후보 적격성) 필요 — 배포 차단**) |
| **C 정책 실패 시험** | 5f0ec9a | 수정 전(e9c97d6) 실패 재현: 1,440분 반례·참고 자료 후보·빈 목록·복구 |
| **C 후보 관문 + 절대 시각** | 99be30f | 현재 검증된 자료만 후보, 만조-예보 절대 시각 90분 |
| **C 최종 방어 + 빈 목록 UI** | e46a8f7 | 선발 전·후 `weeklyRecommendationEligible`, 빈 목록 안내 |
| **C 증거·회귀** | a3658e2 외 | Sol DOM/행렬/정책 실험/E2E/S1-R 재실행 결과(`results/c/`) |

## R1~R3 변경 요약 (모두 index.html + validate_weather.py)
- `weeklyTodayRequiredDataValid(raw, site)`: today 저장 항목의 `wind`("북동풍 3.6m/s", 8방위), `rain`("강수 없음"/"3시간 강수 0.5mm"), `wave`("0.7m") 를 생성기 형식 그대로 검사.
  파고는 `showWave/island/pelagic` 지역에서만 필수이며, 필수가 아니어도 값이 있으면 형식이 맞아야 한다. site 를 모르면 파고 null 을 허용하지 않는다(fail closed).
- `weeklyTodayRecommendable(raw, site)`: own `scoreEligible===true`, own 유효 `score`, own 빈 `missingScoreFields` + 위 필수 기상값. `weeklyTideWeather`, `weeklyWeatherEntryForSite`, `storedWeatherState` 가 같은 함수를 쓴다.
- `weeklySampleRecommendable(site, sample)`: own 필드 확인, 비필수 `waveM` 은 null/없음 또는 유한한 0 이상 숫자(주간 Python validator 와 같음).
- `weatherScoreAllowed`: `_weatherState.scoreEligible===true` + 유효 점수만 허용(출처 없는 객체는 거부, 재추정 없음).
  `weatherTodayForSite` → `storedWeatherState(day, root, now, site)`; 주간 파생 weather 의 `_weatherState.scoreEligible` 는 `weeklySampleRecommendable` 결과.
  이전 저장(previous_saved)의 점수·풍속·기온 등은 참고 값으로 그대로 남고 점수·별점만 "오늘 적합도 미확인"이 된다.
- 변경하지 않음: 점수 산식, 기본 92점, 가점 16, 유형별 정원 4/3/1/2, P0 90분·강수 1mm·선상 관문, 생성기, Worker, D1.

### JS/Python 계약 정합성 (R3)
| 항목 | 프런트 | Python |
|---|---|---|
| weekly 비필수 wave | null/없음 또는 유한 ≥0 | `waveM` null 또는 유한 ≥0 |
| today 풍속·풍향·강수 | 적격 항목에 필수 | `validate_weather.py` 적격 항목에 필수(같은 정규식) |
| today 파고 | 필수 지역 필수, 그 외 null 허용·값은 `^\d+(\.\d+)?m$` | 동일 |
| own 적격 필드 | `hasOwnProperty` | JSON 에는 상속 개념이 없음 |

상속된 `scoreEligible`(Object.create) 거부는 **메모리 합성 객체의 계약 시험**이다. 실제 JSON 으로는 만들 수 없으므로 운영 공격 경로로 주장하지 않는다.

## R4 (정상 today 만조 fallback 카드가 "오늘 적합도 미확인")
- 원인: `weeklyTideWeather` 의 today 분기가 검증된 raw 를 `Object.assign({},raw)` 로만 복사해 `_weatherState`(출처)가 없었다. `weatherScoreAllowed` 는 검증된 `_weatherState.scoreEligible===true` 를 요구하므로 추천 카드(`renderTodayPanel` → `v251ScoreDisplayText(entry.today)`)만 미확인이 됐고, 팝업은 `storedWeatherState` 로 출처를 다시 계산해 정상 표시됐다.
- (아래 R6 에서 출처 판정이 `storedWeatherState` 로 대체됨 — 무조건 적격 부여는 폐기) 수정: `weeklyTodayWeather(site, raw, date)` 한 함수에서 `weeklyTodayRecommendable` 검증 → 통과한 것에만 `_weatherState`(scoreEligible:true, kind today_saved/today_fallback)를 붙인다.
  `weeklyTideWeather` 와 `weeklyWeatherEntryForSite` 가 같은 함수를 쓴다. **검증되지 않은 raw 에는 출처가 붙을 수 없고, `weatherScoreAllowed` 는 변경하지 않았다.** 점수 산식·P0 90분·강수 1mm·선상·가점 16·정원 무변경.
- 증거(`results/r4/`): 수정 전(1bd2619) 걸매리 today fallback — card `오늘 적합도 미확인` / popup `★★★★★ 92점`(0·92.5·100 도 같은 불일치), 수정 후 모두 일치(rank 108 유지).
  카드 시험: 수정 전 6 fail/3 pass → 수정 후 9/9. 만조 90분 허용·91분 차단·대체 만조(12:30 · 870cm)·결측/적격 미확인/이전 저장 미표시(popup 은 미확인 + 참고 값)도 포함.
  (91분 시나리오에서 카드가 없고 팝업이 92점인 것은 불일치가 아니다: 팝업은 그 장소의 오늘 기상이고, 카드는 만조 관문을 통과한 추천이다.)

## R6 (참고 상태 today 자료가 추천 카드에서 현재 적격 점수로 승격)
- 원인: R4 의 `weeklyTodayWeather` 가 `weeklyTodayRecommendable`(점수·적격 metadata·필수 기상값) 통과 후 `dataCurrent:true, scoreEligible:true, stale:false` 를 **무조건** 부여했다. 팝업은 `storedWeatherState` 가 날짜·예보 시각·생성 시각·미래 생성·예정 갱신(`weatherLatestDue`)·stale 을 다시 판정해 달랐다. 일반 today fallback 의 같은 단정은 R4 이전(7eb6764)부터 있었다.
- 수정(`index.html`): `weeklyTodayWeather(site, raw)` = `weeklyTodayRecommendable`(후보 자격, **기존 그대로**) + `storedWeatherState(raw, weatherToday, undefined, site)` 결과를 `_weatherState` 로 전달.
  `weeklyTideWeather`·`weeklyWeatherEntryForSite`(카드)와 팝업(`weatherTodayForSite`)이 같은 함수·같은 입력으로 판정하므로 더 강한 적격이 새로 생기지 않는다. `weatherScoreAllowed`·점수·가점·정원·P0 무변경.
  입력 adapter 구분: 주간 파생(`weeklySampleAsWeather`, 표본 단위 `weeklySampleRecommendable`) / today 저장자료(`weeklyTodayWeather` → `storedWeatherState`).
- Sol 의 6개 입력(갱신 지연 05:41, 미래 생성 12:30, 비정상 generatedAt, item/root 생성 시각 없음, date 오늘+forecastTime 어제, 실제 `build_site_result` sparse6h 출력)은 모두 카드·팝업이 "오늘 적합도 미확인"으로 같다. 6번이 단순 날짜 필드 검사로 통과되지 않는 이유: builder 출력은 날짜·예보·적격이 모두 정상이고 **생성 시각(06:10)이 예정 갱신(10:17) 이전**이라는 점만 다르다 — 이는 `weatherLatestDue` 까지 쓰는 `storedWeatherState` 만 잡는다.
- 증거(`results/r6/`): 수정 전(8ccb248) 12/12 불일치(만조 6 + 일반 6: 카드 92점 / 팝업 미확인) → 수정 후 12/12 일치; Sol 의 `independent_r4_dom.mjs` 를 그대로 실행 175 중 **145 pass/30 fail → 175/175**(`results/r6/sol_dom/`).
  sparse6h fixture(`.github/scripts/fixtures/sparse6h_today_site14.json`)는 `test_weather.py` 가 실제 `build_site_result` 로 재생성해 같음을 확인하고 `validate_weather.py` 가 수락함을 검증한다.
- **정책 차이 보고(아래 C 정책으로 대체됨 — 참고 자료는 더 이상 후보가 아니다)**: 후보 자격은 그대로라 참고 상태(생성 지연 등) today 자료도 **후보로 남고 원점수 기준 순위를 받는다**(카드 점수는 미확인, rank 92 유지). 이는 R4 이전의 만조 카드 동작과 같다. 참고 자료를 후보에서 아예 빼는 것은 추천 선정 정책 변경이므로 사용자 승인 후 별도 결정 사항이다.
  운영 영향 범위: 주간 예보가 모든 장소를 덮는 정상 운영에서는 today fallback 자체가 쓰이지 않는다(고정 입력 176후보·상위 10 변화 없음). 주간 로더 실패/장소 누락 시에만 해당.

## C 정책 (사용자 승인: 검증된 현재 기상자료만 추천 후보 · 참고/지연/무효 시각 자료는 최종 추천 제외)
승인 범위: 별도 구현 브랜치 코드·테스트·commit/push·PR #13 갱신. **B(제한적 지연 예외)는 승인되지 않았다** — 허용 지연 시간·유예·대체 점수 없음. main 병합·Pages/Worker 배포·D1 변경 금지.

- **핵심 반례**: 평가 11:00, raw.date=오늘, 실제 forecastTime=어제 12:00, 만조=오늘 12:00, 원점수 92, 제보 가점 16(rank 108), mandatory. 이전 코드는 시·분만 비교해 0분으로 보고 후보·최종에 포함했다(절대 차이 1,440분).
- **구현(`index.html`)**
  - 절대 시각 helper: `weeklyKstTimestamp`(Asia/Seoul 날짜·시각, 달력 검증), `weeklyForecastTimestamp`("YYYY-MM-DD HH:MM KST" 또는 ISO `+09:00`만 허용, 시간대 없음·다른 표기는 null), `weeklyTideTimestamp`, `weeklyTideForecastGapMinutes`(해석 불가 null).
  - 만조 대응: `weeklyTideNearestSample`(주간 표본)과 `weeklyTideWeather`(today fallback)가 절대 시각 차이 ≤90분(주간 표본은 기존 `min(90, 간격/2)`)만 인정한다. 해석 불가·날짜 불일치는 제외. 기존 `date !== tide.date` 문자열 비교는 절대 시각으로 대체.
  - 후보 관문: `weeklyTodayWeather`는 `storedWeatherState`(날짜·forecastTime·generatedAt 유효/미래·`weatherLatestDue`·stale)가 `scoreEligible===true` 일 때만 객체를 돌려준다. 참고·previous_saved·지연·무효 생성 시각·예보 시각 누락 자료는 후보 근거가 아니다(원본·팝업 참고 값은 그대로).
  - `weeklyRecommendationEligible(entry)`: 점수 유효 + (주간 표본이면 `weeklySampleRecommendable`) + 적격 출처(`_weatherState.scoreEligible===true`). `weeklyRecommendationForSite` 끝(후보 채택 전)과 `todayRecommendedSites`(선발 전 + 계절/정원 선발이 돌려준 최종 목록)에서 적용 → 공지 priority·mandatory·제보 가점 16·정원 보충으로 되살릴 수 없다.
  - 모든 후보가 제외되면 빈 목록: "현재 검증된 기상자료가 없어 추천 탐조지를 표시할 수 없습니다. 자료 갱신 후 다시 확인해 주세요." 새 정상 자료가 오면 `refreshTodayPanelIfOpen` 으로 복구.
  - 유지: 주간 예보는 `weeklySampleRecommendable`·표본 선택 계약 그대로(유효한 미래 주간 예보를 오늘이 아니라는 이유로 제외하지 않음), 점수 산식·가점 16·정원 4/3/1/2·ID 동점·P0(강수 1mm·선상 6.0m/s·0.7m)·S1-R·`weatherScoreAllowed` 무변경.
- **수정 전후(실제 Chrome 카드·팝업, 시계 2026-10-10 11:00)**: 1,440분 반례 — 카드 있음(rank 108, mandatory)/팝업 미확인 → **카드 없음**(빈 목록 안내)/팝업 미확인(기온 참고 값 유지). 6종 참고 자료(갱신 지연·미래 생성·비정상/없는 생성 시각·어제 예보·실제 builder sparse6h) × 만조/일반: 후보 있음 → 후보 없음. 정상 92/0/92.5/100·rank 108·만조 90분 허용/91분 제외·대체 만조·주간 기반은 변화 없음.
- **정책 영향(`results/c/reference_policy_on_C.json`, Sol 의 19시나리오×제보 ON/OFF=38조건을 제품 코드로 재실행)**: 고정 정상 주간 176/176(상위 10 동일), 주간 로더 실패(today 정상) 166, 주간 11곳 누락 165 등 정상 입력은 변화 없음. 생성 지연·미래·비정상·누락 생성 시각 today 만 있는 합성 조건은 166 → 0(빈 목록), 혼합(참고 11곳) 176 → 165. 이는 의도된 후보 감소이며 정상 입력 회귀가 아니다. 운영 발생 빈도는 측정하지 않았다.
- **갱신 흐름 확인**: `loadBirdmapData` 는 파일별 요청 순번으로 늦게 온 *이전 요청* 응답을 버린다(실제 Chrome 시험 R7: 늦은 옛 응답이 최신 정상 자료를 덮어쓰지 못함, 오류 시 직전 자료 유지, 정상 갱신·주간 대체 예보 도착 시 추천 복구). 발행 시각은 *같음*만 비교하므로 이후 요청이 더 오래된 파일을 돌려주면 반영되지만, C 정책에서 그 자료는 참고 상태라 추천 근거가 되지 못한다(안전 방향, R7 에서 확인). 현장소식 삭제/보호 상태 늦은 응답 결함(별도 과제)과 같은 코드가 아니다.

## 테스트 (2026-10-09, Windows, Python 3.12, `PYTHONUTF8=1 PYTHONIOENCODING=utf-8`, `CHROME_PATH=…/chrome.exe`)
| 스위트 | 결과 |
|---|---|
| reports-api | 178/178 |
| 주간 추천 | 145/145 (기존 136 + R1-1~7, R3-1~2 신규 9) |
| 프런트 9파일(자정 17 포함) | 110/110 (Sol 기준 106 + R2 신규 4) |
| Chrome 공지 닫기 7 + 월간 조석 13 | 20/20 |
| 기상 Python | 53/53 (기존 50 + 신규 3) |
| 조석 Python | 21 통과, 1 skip |
| weather-proxy | 36/36 |
| 합계 | **563 pass / 0 fail / 1 skip** (Sol 기준 547/0/1) |

R4 보완 후(참고): 주간 추천 146(+1 R4-9), **카드 DOM 시험 9(신규)**, 그 외 동일 → JS 499 pass(reports-api 178 · weather-proxy 36 · 프런트 13파일 285) + Python 74 pass/1 skip = **573 pass / 0 fail / 1 skip**.
Sol 행렬 재실행(`results/r4/matrix_after_r4.json`): 182/182 · 특별 21/21 · 팝업 12/12. 고정 입력(190곳·176후보) ON/OFF 전체 후보 signature·상위 10 은 35141c0 · 1bd2619 · 현재가 동일(`results/r4/compare_fixed_input.json`).
최신 origin/main(38b4529)과 `git merge-tree` 충돌 없음, main 의 자동 JSON(2026-10-09 16:28)을 임시 worktree 에만 덮어 전체 스위트·두 validator 통과(자동 JSON 수정 없음).

수정 전 실패 확인: 주간 신규 7건 실패, 자정(R2) 신규 3건 실패, Python 신규 16 subtest 실패 → 수정 후 전부 통과.
Sol Ultra 의 실제 함수 matrix(`results/r123/review_matrix_adapted.mjs`, 원본 스크립트에서 소스 선택만 working tree 로 바꿈):
7eb6764 = matrix 175/182, 특별분기 14/21, 팝업 4/12 → 현재 **182/182, 21/21, 12/12**.

R6 보완 후(참고): 주간 추천 147(R6-4·5 신규, R4-9 교체), 카드 DOM 12(R6-1~3 신규), Python 기상 54(sparse6h fixture 시험 신규) → JS 503 pass(reports-api 178 · weather-proxy 36 · 프런트 13파일 289) + Python 75 pass/1 skip = **578 pass / 0 fail / 1 skip** (직전 573/0/1).
Sol 행렬 재실행(`results/r6/matrix_after_r6.json`): 182/182 · 21/21 · 12/12. 고정 입력 ON/OFF 전체 후보 signature·상위 10 은 35141c0 · 1bd2619 · 8ccb248 · 현재가 동일(`results/r6/compare_fixed_input.json`).
최신 origin/main(b0975ca)과 `git merge-tree` 충돌 없음, main 의 자동 JSON(2026-10-09 20:56)을 임시 worktree 에만 덮어 전체 스위트(JS 503, Python 75+1 skip)와 두 validator 통과(자동 JSON 수정 없음).

C 정책 후(현재): 주간 추천 155(C-1~8 신규, R6-4/5 교체), 카드 DOM 14(R6-1/1b/3 교체, R7 신규), Python 54 → JS 513 pass(reports-api 178 · weather-proxy 36 · 프런트 13파일 299) + Python 75 pass/1 skip = **588 pass / 0 fail / 1 skip** (직전 578/0/1). 수정 전(5f0ec9a) 신규 실패: 주간 8·Chrome 4.
- 기대값/fixture 를 바꾼 기존 시험(승인된 C 정책): today fallback fixture 에 실제 생성 시각·예보 시각 추가(R01/R02/겨울·봄·여름/M02/P0-B3·C4/S2-A8/R1), P0-B3 은 07:30 만조가 지금보다 이전이 되지 않도록 시계 06:30, R6-1/R6-3 은 "참고 → 카드 없음"으로 변경.
- Sol 도구 재실행(제품은 현재 head): S2 행렬 **182/182**, 특별 분기 **21/21**, 팝업 **12/12**; Sol R6 DOM 245 중 175 통과 + 14개 참고 시나리오(×5폭)는 "카드 있음 + 미확인" 기대가 C 정책으로 의도적으로 바뀌어 불일치(그 행은 모두 카드 0·팝업 미확인·기온 유지); 일반 E2E **55/55**(예외 0); S1-R 보호 표현 171·일반 17 오탐 0 `allAssertionsPassed`.
- 최신 origin/main(b0975ca)과 merge-tree 충돌 없음(실제 병합 없음), main 자동 JSON(2026-10-09 20:56)을 임시 worktree 에만 덮어 JS 513 · Python 75+1 skip · 두 validator 통과.

## 고정 입력 비교 (`results/r123/compare_fixed_input.json`)
`node .github/scripts/compare_p1s_recommendation.mjs 35141c04d4fd152982b1f4683d5b7a6f4f7514e5 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e worktree`
- 2026-10-08 22:40, 190곳, 후보 176, 제보 ON/OFF 모두: 세 버전의 **전체 후보 signature(점수·순위·날짜·시각·사유·조석·가점·표시 기상) 동일**, 상위 10 동일.
  ON: 108 112 15 194 126 14 107 48 195 3 / OFF: 112 7 8 10 126 14 107 48 3 5.
- 합성 null 점수: 35141c0 후보 176(0점 11) → 7eb6764·현재 165(0점 0).
- 현재 `weather_today.json`(origin/main 2026-10-09 16:28 포함) 두 validator 통과, 적격 181곳이 모두 프런트 today 검사를 통과(브라우저에서 가짜 시계로 확인).

## 로컬 화면 확인 (정적 서버 + 실제 JSON, 운영 API 변경 없음)
- PC·모바일(375) 로드, 스크립트 오류 없음(운영 API CORS 차단 로그만).
- 검증된 저장 기상 팝업: "★★★☆☆ 74점"; 같은 항목의 rain 을 메모리에서 null 로 바꾼 뒤 새 팝업: "오늘 적합도 미확인"(기온·풍향 참고 값 유지).
- 미검증: 로컬 합성 API 를 쓴 제보·현장소식 등록/삭제/길안내 E2E, live 기상 merge 의 실제 네트워크 흐름(코드상 `mergedToday._weatherState.scoreEligible` 은 이제 검증된 stored 상태를 따른다), Cloudflare 배포 환경, 실기기.

## 후속 과제 (이번 R4 와 섞지 않음 — 배포 전 위험 평가에 유지)
- (해결됨) 참고 상태 today 자료의 후보 자격 정책 → C 정책으로 구현. **B(제한적 지연 예외)는 별도 분석·사용자 승인 후 검토.**
- **R5 (P2)**: 숫자 400자리 같은 극단 숫자 문자열이 today 정규식(형식만 검사)과 `validate_weather.py` 를 통과하고 `Number()` 가 Infinity 가 된다. 생성기의 정상 출력(`.1f`)으로는 유입 증거 없음. 정규식 뒤 캡처 숫자의 finite/비음수 검사를 JS/Python 양쪽에 맞추는 방어 과제. 입력 집합 차이(JS trim 허용 / Python 거부, 유니코드 숫자, 비필수 `waveM` key 생략)도 같은 후속 시험으로.
- **기존 현장소식 늦은 응답**: 오래된 응답이 삭제된 마커를 되살릴 수 있다(보호 상태 재노출 건과 같은 원인, 응답 순서 가드 없음).
- **S1-P**: 승인된 보호종 공개 정책, 숨긴 자식의 부모/고정 지점 간접 연결.

## 별도 관리: 기존 캐시 결함 (이번 PR 에서 새로 생기지 않았고 수정하지 않음)
`loadFieldUpdates()`(index.html)가 응답 순서·버전 확인 없이 `fieldUpdates = result.body.updates...` 로 덮어쓴다.
서버가 `locationHidden:true` 로 갱신한 뒤 **늦게 도착한 이전 응답**(`false`)이 화면에 다시 적용되면 현장소식 길안내 버튼이 되살아날 수 있다(Sol Ultra 가 실제 브라우저로 재현, main 과 동일 함수 hash).
코드상으로도 순서/seq 가드가 없음을 확인했다. 이 상태의 좌표는 서버가 내려준 값이라 정확 원본 좌표 노출로 확인된 것은 없다 — 다만 보호 상태 재노출이므로 **S1-P 또는 별도 보안 작업의 우선 과제**다(요청 seq/updatedAt 단조 증가 확인, 보호 갱신 시 marker·popup·길안내·캐시 폐기).
같은 패턴이 출현종 제보(`/reports/approved` 등)에도 있는지는 이번에 조사하지 않았다.

## 다음 명령
```
git checkout fix/p1-s-safety-guards
cd reports-api && node --test
cd .. && PYTHONUTF8=1 PYTHONIOENCODING=utf-8 node --test .github/scripts/test_weekly_recommendation.mjs .github/scripts/test_today_weather_midnight.mjs
cd .github/scripts && PYTHONUTF8=1 python -B -m unittest test_weather test_tide
```

## 미해결 정책 (S1-P, 이번 범위 아님)
승인된 보호종 제보의 전면 비공개, 숨긴 자식의 부모/고정 지점 연결, site-history·approved·pending·status·월간 집계의 읽기 시 재검증, 알/산란 문맥 판정, 전체 조류 사전, field 대략 좌표 공개·길안내 허용 여부, legacy 원문 영구 보존, 위 캐시 단조성.

## 운영 반영 금지 범위
main 병합, Pages 배포, `reports-api` Worker 배포, D1 쓰기/스키마, 운영 제보·현장소식 변경, 기상 JSON 수정. Sol Ultra 재검증 후 사용자 승인 전까지 유지.
