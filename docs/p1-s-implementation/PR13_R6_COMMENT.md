## PR #13 — R6 보완 (참고 상태 today 자료의 현재 적격 점수 승격) · 재검증 요청

이전 차단 SHA `8ccb248` → 시험 `a7f0055`(수정 전 실패 증거) · 코드 `cb2a8c8` · 증거/체크포인트 커밋. R1~R5 범위·S1-R·정상 R4 방어는 유지했고 main 병합·배포·D1 변경은 없습니다.

### 원인과 수정
`weeklyTodayWeather` 가 후보 검사(`weeklyTodayRecommendable`) 뒤에 `dataCurrent/scoreEligible:true, stale:false` 를 무조건 붙여, 추천 카드는 날짜·생성 시각·예정 갱신(`weatherLatestDue`)을 보는 `storedWeatherState`(팝업 경로)와 다르게 92점을 표시했습니다.
→ `weeklyTodayWeather(site, raw)` = 후보 자격(기존 그대로) + **`storedWeatherState(raw, weatherToday, undefined, site)` 결과를 `_weatherState` 로 전달**. 만조 fallback·일반 fallback(카드)과 팝업이 같은 함수·같은 입력으로 판정하므로 검증 결과보다 강한 적격이 만들어질 수 없습니다. `weatherScoreAllowed`·점수·가점 16·정원·P0 는 무변경. 주간 파생 표본(`weeklySampleRecommendable`)과 today 저장자료(`storedWeatherState`)는 adapter 를 구분해 유지합니다.

### 수정 전후 (실제 Chrome `renderTodayPanel` 카드 / Leaflet 팝업, 시계 2026-10-10 11:00)
| 입력 (raw 92·적격 true·정상 풍속·강수) | 수정 전 카드 / 팝업 (만조 · 일반 동일) | 수정 후 카드 / 팝업 |
|---|---|---|
| 생성 05:41 (예정 갱신 10:17 이전) | ★★★★★ 92점 / 미확인 | 미확인 / 미확인 |
| 미래 생성 12:30 | 92점 / 미확인 | 미확인 / 미확인 |
| 비정상 generatedAt 문자열 | 92점 / 미확인 | 미확인 / 미확인 |
| item·root 생성 시각 모두 없음 | 92점 / 미확인 | 미확인 / 미확인 |
| date 오늘 + forecastTime 어제 | 92점 / 미확인 | 미확인 / 미확인 |
| **실제 `build_site_result` sparse6h 출력** (생성 06:10, 예보 12:00, validator 수락) | 92점 / 미확인 | 미확인 / 미확인 |
| 정상(10:30 생성) 92점·제보 16 rank 108 | 92점 / 92점 | 92점 / 92점 (변화 없음) |

수정 전 12/12 불일치(만조 6 + 일반 6) → 수정 후 12/12 일치. 참고 값(기온 등)은 팝업에 그대로 보존. 6번은 날짜 필드만 보면 통과되는 입력이 아닙니다: 날짜·예보·적격이 모두 정상이고 생성 시각만 예정 갱신 이전입니다. fixture(`.github/scripts/fixtures/sparse6h_today_site14.json`)는 `test_weather.py` 가 실제 builder 로 재생성해 일치를 확인하고 `validate_weather.py` 수락도 검증합니다.

**Sol 의 `independent_r4_dom.mjs` 를 그대로 실행**: 8ccb248 = 175 중 145 pass / 30 fail → 현재 **175/175, 예외 0**(`docs/p1-s-implementation/results/r6/sol_dom/`). 5폭(344·375·768·1024·1440)은 자체 시험 R6-3(실제 마커 팝업)에서도 카드·팝업 일치, 가로 잘림 없음.

### 회귀 (Windows, Python 3.12, 로컬 Chrome)
JS 503 pass(reports-api 178 · weather-proxy 36 · 프런트 13파일 289) + Python 75 pass/1 skip → **578 pass / 0 fail / 1 skip** (이전 573/0/1). Sol 행렬 **182/182 · 21/21 · 12/12**.
고정 입력(2026-10-08 22:40, 190곳, 176후보, 제보 ON/OFF): 35141c0·1bd2619·8ccb248·현재 전체 후보 signature 와 상위 10 동일(ON 108 112 15 194 126 14 107 48 195 3 / OFF 112 7 8 10 126 14 107 48 3 5). 합성 null 11곳 176→165 유지.
origin/main(b0975ca)과 merge-tree 충돌 없음, main 의 자동 JSON(2026-10-09 20:56)을 임시 worktree 에만 덮어 전체 스위트와 두 validator 통과(자동 JSON 수정 없음).

### 정책 차이 보고 (변경하지 않음 — 사용자 결정 필요)
후보 자격은 그대로라 참고 상태 today 자료도 **후보로 남고 원점수 기준 순위를 받습니다**(카드 점수만 미확인, rank 92 유지). R4 이전 만조 카드와 같은 동작이며, 참고 자료를 후보에서 제외하는 것은 추천 선정 정책 변경입니다. 주간 예보가 모든 장소를 덮는 정상 운영에서는 today fallback 이 쓰이지 않아 고정 추천에는 영향이 없습니다.

### 범위 분리(미구현, 체크포인트에 유지)
R5(극단 숫자 문자열·JS/Python 입력 집합 차이), 현장소식 삭제 후 오래된 응답으로 마커 재출현·보호 상태 전환 후 길안내 재활성화, S1-P(승인 후 공개 정책·간접 위치 연결).

### 미검증
실기기·배포 환경·로컬 합성 API 제보/현장소식 등록·삭제·길안내 E2E, 운영에서 주간 로더 실패 빈도(합성 재현이며 운영 관측 아님).
