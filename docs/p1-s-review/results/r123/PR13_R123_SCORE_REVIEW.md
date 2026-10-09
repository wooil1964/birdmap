# PR #13 R1–R3 score contract 재검증 (독립 실행)

검증 head: `1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c`. 대조 head: `7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e`. main 기준: `38b45299c832b8ab8ad549762c02979fa8ddfb28`.

기존 차단 사유인 오늘 fallback 실제 필수값 누락, unknown 메타데이터의 점수 표시, optional wave 및 상속 필드의 불일치는 해결됐다. 다만 새 출처 요구와 정상 만조 fallback 변환이 연결되지 않아 추천 카드가 정상 점수를 “미확인”으로 표시하는 회귀(R4)를 확인했다. 안전 부적격 후보를 되살리거나 순위를 변경하는 결함은 아니다. 병합 전 정상 fallback 표시를 보완하고 실제 카드 회귀 테스트를 추가하는 것을 권고한다. 최종 PR 등급은 다른 담당 검증과 종합해야 한다.

## 1. 실행 방법과 범위

실제 PR 함수 본문을 Git blob에서 추출하여 실행했다. 제품 guard 교체, 별도 모형 predicate, 운영 API 요청, DB/Worker 접근, 제품 파일 수정은 없다. 소스 archive와 Git blob은 LF 정규화 후 동일함을 검증했다(archive는 CRLF). 합성 계약 입력은 메모리 또는 임시 JSON이며 조류 출현 확률/생태 배점 자료가 아니다.

- JS 계약 평가 시계: `2026-10-10T08:00:00+09:00`.
- Python validator 평가 시계: `2026-10-08T22:40:00+09:00`, 문서 일자 10월 8일. validator의 datetime만 고정하고 제품 검증 함수는 그대로 사용.
- 정상 추천 회귀: 기존 `input_manifest_35141c0_2240.json` 및 해당 불변 원본/공개 승인 제보를 `p1c_runtime.mjs`로 읽음. 최신 기상자료를 섞지 않음.
- live merge 시험은 실제 `applyLiveWeatherToPopup`, 응답 시각 검사, 관측/예보 구성 및 값 범위 함수를 실행. DOM 출력 sink, 탐조 해석, 조석 lookup 및 내일 DOM만 stub. 실제 브라우저 DOM 증거는 root의 E2E 담당 결과와 구분.

재현에는 다음 인자를 명시한다. `targetRepo`는 head와 old commit을 보유한 Git 저장소 또는 그 저장소 아래 archive이며, `referenceRepo`는 불변 P1 분석 스냅샷 및 `_scripts/p1c_runtime.mjs`를 보유해야 한다. 출력 폴더는 미리 존재해야 한다.

```text
node pr13_r123_actual_matrix.mjs <targetRepo> <out> <referenceRepo>
node pr13_r123_extended.mjs <targetRepo> <out> <referenceRepo> <baseline7eb_actual_matrix.json>
python pr13_r123_python_validator_matrix.py <targetRepo> <out>
```

extended는 첫 번째 스크립트가 만든 `<out>/pr13_r123_actual_matrix.json`을 읽는다. baseline 파일은 이전 독립 감사 결과의 복사본이며 old/new 카드 표시만 추가로 실제 신구 함수 양쪽을 실행했다. Python은 `PYTHONDONTWRITEBYTECODE=1`, `PYTHONIOENCODING=utf-8`로 실행한다.

## 2. 결과와 통과 숫자의 의미

| 검증 | old 감사 | new 실제 재실행 | 범위 |
|---|---:|---:|---|
| score/메타데이터/필수자료 26종 × 일반·만조·섬·선상·today 7경로 | 175/182 | 182/182 | candidate 및 최종 포함 여부 |
| 만조 대안/P0/공지/가점/mandatory/fill/optional wave/상속/전체 결측 | 14/21 | 21/21 | 실제 후보 및 최종 선발 |
| popup 12조건 | 4/12 | 12/12 | weatherTodayForSite → weatherScoreAllowed/display |
| 추가 계약·출처·live·정상 카드 표시 | 별도 실행 없음 | 99/103 | 4불일치 아래 구분 |
| Python 실제 document validator | 기존 31×2 호출 | 49×2 = 98 호출 | today 20문서, week 21문서 수락; “98통과” 아님 |

기존 실패 7 + 7 + 8 = 22조건은 저장된 old 감사 결과와 새 실제 결과를 ID별 대조하여 모두 해결됐음을 확인했다. 새로운 4불일치는 정상 카드 표시 1건과 파싱 비유한 극값 계약 3건이다. 182 행렬은 candidate/top assertion이며 `popupScore`를 표시한다는 assertion은 없다. 따라서 정상 tide_today의 effective score가 NaN이어도 182/182는 통과할 수 있다. 합계 수치로 표시 회귀가 해결됐다고 판단하면 안 된다.

raw score는 실제 number/finite/0..100이어야 하며 0과 float를 정상 값으로 인정한다. scoreEligible는 own field의 정확한 true, missingScoreFields는 own empty array가 필요하다. null/undefined/NaN/±Infinity/빈 문자열/'92'/음수/>100/bool, 미확인 eligibility/결측 사유를 candidate/최종/주요 popup 경로에서 차단한다. rawscore 0에 새로운 최소 임계값을 넣지 않았다. 합성 score92+bonus16의 내부 rank108도 그대로며 rankScore를 100으로 자르지 않는다.

wind 방향/속도 없는 문자열, 단위 누락, unknown 방향, NaN/Infinity 문자열, 비정상 소수·부호·지수 표현, 실제 wind/rain/wave 전체 삭제, inherited score/scoreEligible/missingScoreFields를 각 일반·만조·섬 경로에서 추가 확인했다. 모든 정상 합성 사례에 공지 및 최근 4종 제보(16점)가 존재하므로 안전 관문 우회 여부를 같이 검사했다.

같은 날 두 만조와 다른 날짜 만조의 최고 후보 score:null → 다음 정상 score80 선택을 유지한다. P0 90분 허용/91·120분 차단, 강수 .999 허용/1 차단, 파고2 차단, 선상 wind6 허용/6.001 차단·wave .701 차단·강수 양수 차단, 부적격 fill 차단이 그대로 통과한다.

네 계절 balanced selector에 invalid entry를 직접 넘기는 별도 시험에서는 그 entry가 남는다. 이는 내부 함수의 입력 전제 방어 부족이다. 실제 todayRecommendedSites는 candidate + weeklyScoreValid + P0를 먼저 검사하므로 이 직접 호출 결과를 운영 우회 결함으로 보고하지 않았다.

## 3. R4: 정상 today 만조 fallback 카드 표시 회귀

실제 코드 경로:

1. `weeklyWeekSite(site)`가 없으면 `weeklyTideWeather`의 today fallback(`index.html:3886–3898`)이 own 필드, 필수 기상, 만조 날짜/시각 ±90분, 강수/파고를 검사한다.
2. 결과 weather는 `Object.assign({},raw)`로 만들어져 `_weatherState`가 없다(`3896`).
3. 정상 score92 후보가 만들어지고 final 목록에 남는다.
4. 실제 `renderTodayPanel` 카드(`4343`)는 `entry.score`가 아니라 `v251ScoreDisplayText(entry.today)`를 호출한다.
5. 새 `weatherScoreAllowed`(`2086–2088`)는 출처 state가 없으면 false라 “오늘 적합도 미확인”을 반환한다.

동일 만조 12:00/유효 예보12:00·풍속3·강수0·파고.3·정상 metadata·공지·제보16점의 신구 실제 결과:

| 항목 | 7eb | 1bd |
|---|---|---|
| 후보/최종 | true / [14] | true / [14] |
| 안전/raw/rank | true / 92 / 108 | true / 92 / 108 |
| 추천 카드 표시 | ★★★★★ 92점 | 오늘 적합도 미확인 |
| site popup 표시 | ★★★★★ 92점 | ★★★★★ 92점 |

site popup은 `weatherTodayForSite`(`2107–2118`) → `storedWeatherState`(`2066`)로 적격 출처를 다시 계산하여 정상이다. 따라서 “모든 팝업 표시 실패”나 “안전 관문 우회”로 확대하면 안 된다.

운영 도달 조건은 실제로 존재한다. `weatherWeek=null`로 초기화(`902`), 주간 첫 로더 실패/미수신 또는 해당 site가 주간 sites에 없을 때 today fallback을 탄다. `loadBirdmapData`(`4476` 인근)의 실패는 이전값을 유지하므로 아직 주간 자료를 받지 못했다면 null이 남는다. 오늘 및 조석 자료는 별도로 수신할 수 있다(`4493`, `4509`, `4547`). 패널은 초기 렌더 후 각 비동기 자료 반영 때 다시 렌더한다(`3262–3265`). 전 주간 site가 존재하나 유효 sample이 0인 경우는 fallback 허용이 아니므로 이를 혼동하지 않는다.

보완 지시: today 만조 fallback 반환 weather에 검증된 출처를 생성하는 공통 변환을 연결하라. “state 없는 객체도 점수 허용”으로 display guard를 완화하지 말라. raw score92/rank108/선발과 안전·시각 조건은 유지하며, 정상 카드 표시와 invalid fallback 표시를 실제 renderTodayPanel DOM으로 검증하라. 생성/신선도 정책은 기존 구현을 재사용하고 임의 true를 전역 부여하지 말라.

## 4. 출처 및 실시간 병합 검증

정상 saved, 정상 weekly-derived, old saved에서 정상 weekly-derived로 대체는 점수를 표시한다. missing eligibility/필수wind/null score, previous_saved 단독, stale/reference 단독, invalid weekly-derived는 미확인이다. 기존 기상 wind 문자열은 참고로 유지되며 점수만 차단한다.

live merge 7조건은 모두 기대와 일치한다. 정상 저장/주간 파생 점수는 유지하고 missing metadata·풍속·score 및 previous_saved는 정상 최신 기상(풍속3, 강수0, 유효 응답 시간)을 병합해도 점수가 되살아나지 않는다. `applyLiveWeatherToPopup`(`2520–2560`)의 실제 state 전파와 display 호출을 실행했다.

raw에 `_weatherState:{scoreEligible:true}`를 넣어도 정상 ingestion `weatherTodayForSite`는 새 state로 덮어써 차단한다. `weatherScoreAllowed` 자체에 위조 private state 객체를 직접 넘기면 true지만 이는 내부 provenance 신뢰 전제이며 정상 UI 경로의 source forgery 우회로 확인하지 않았다.

## 5. R5: 문자열 유한성 및 JS/Python parity — 방어 보완 권고(P2)

`weeklyTodayRequiredDataValid`(`3865–3870`)와 Python `validate_weather.py:15–17,54–61`은 정규식만 검사한다. `'9'.repeat(400)`을 숫자 부분으로 넣은 정상 문법 wind/rain/wave는 문자열이므로 valid JSON이며 두 검증기에서 모두 허용한다. 실제 JS 숫자 파싱은 Infinity다.

- 극값 wind: general candidate=true/safe=true/top[501], 표시92. 일반 탐조에 새 풍속 상한이 없기 때문에 이 부정확한 자료를 가점/공지까지 포함해 선발한다.
- 극값 rain/wave: candidate=true라도 P0 최종 안전에서 false/top[], 각각 popup35/92점 표시.
- finite wind10000은 현재 계약상 finite/nonnegative이며 일반 탐조의 새 상한을 근거 없이 만들지 않았다. 극값 Infinity와 구분한다.

**현실 유입 미확인:** 이 실험은 정상 생성 기상 스냅샷에서 발견된 데이터가 아니다. `update_weather.py:260–268,439–449,527–528,534`는 float 및 finite 검사를 하고 정상 .1f 형식으로 출력한다. 400자리 수는 정상 유한 double의 범위를 넘어 정상 생성기가 이 문자열을 만들었다는 증거가 없다. 생성기 오버플로가 'inf'를 출력하면 새 regex에서 거절된다. 따라서 현재 운영의 위험 기상 추천 발생으로 주장하지 않고 malformed 저장값 방어 권고로 분리한다.

보완 지시: 문자열 형식 확인 후 캡처한 숫자를 Number/float로 변환해 finite 및 nonnegative를 검사하라. JS/Python에서 같은 ASCII 형식·trim 정책을 명시하라. 새로운 생태학적 점수나 풍속 임계값은 추가하지 말라.

같은 문자열 추가 시험에서 parity가 다른 항목도 확인했다:

| 입력 | JS today 적격 | Python today 문서 |
|---|---|---|
| 정상 canonical 문자열 | 허용 | 허용 |
| 앞뒤 whitespace | trim 후 허용 | 거절 |
| Arabic Unicode 숫자 | 거절(ASCII JS \\d) | 허용(Python Unicode \\d) |
| 400자리 wind/rain/wave | 허용 | 허용 |
| nonwave today wave:null/absent | 허용 | 허용 |
| nonwave week waveM:absent | 허용 | 거절(KeyError) |

Unicode/whitespace/optional key mismatch는 현재 생성기의 canonical 출력에 대한 실제 회귀로 확인되지 않았다. 예보값을 추정하지 않고 명시적인 schema 및 formatter 입력 계약으로 맞추는 후속 과제다. today 문서의 ineligible score92 수락은 reference 저장 정책이며 frontend 점수 허용과 다르다. today에 존재하지 않는 windDirectionDeg/waveM를 바꾸는 Python 시험은 실제 today schema 검증 근거로 쓰지 않았다.

Python base optional wave는 이전 시험의 `.3m`에서 생성기 canonical `0.3m`로 정규화했다. 신규 검사가 표기 형식까지 요구하므로 유효 score 경계 시험에 유효 기상값을 사용하기 위한 fixture 보정이며 제품 코드 변경은 없다.

## 6. 불변 정상 입력 결과

190곳 원본·기상·조석·공지·11곳 승인 제보 고정 입력에서 후보176, 자동추천10의 ID/raw/display/rank/bonus/date/time/axis 전체가 기존 대조군과 정확히 같다. 후보 필터만 별도로 만든 결과가 아니라 실제 `todayRecommendedSites` 및 `weeklyRecommendationForSite`를 실행했다.

| 순위 | ID | raw/display | rank | 제보 가점 |
|---:|---:|---:|---:|---:|
| 1 | 108 | 92/92 | 103 | 11 |
| 2 | 112 | 100/100 | 100 | 0 |
| 3 | 15 | 92/92 | 94 | 2 |
| 4 | 194 | 92/92 | 94 | 2 |
| 5 | 126 | 92/92 | 94 | 2 |
| 6 | 14 | 92/92 | 92 | 0 |
| 7 | 107 | 92/92 | 92 | 0 |
| 8 | 48 | 92/92 | 92 | 0 |
| 9 | 195 | 92/92 | 108 | 16 |
| 10 | 3 | 100/100 | 100 | 0 |

이 고정 입력은 주간 자료가 정상 존재하므로 R4 today fallback 표시 회귀를 드러내지 않는다. 정상 고정 목록 불변과 결측/로더 실패 시 표시 회귀는 동시에 성립한다.

산출물: `pr13_r123_actual_matrix.mjs/json`, `pr13_r123_extended.mjs/json`, `pr13_r123_python_validator_matrix.py/json`, `baseline7eb_actual_matrix.json`. 제품 코드와 자동 생성 JSON을 변경하지 않았다.
