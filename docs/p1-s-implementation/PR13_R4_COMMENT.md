## PR #13 — R4 보완 (정상 today 만조 fallback 추천 카드 점수 표시) · 재검증 요청

이전 head `1bd2619` → 보완 커밋 `8e2ced9`(코드) · `c2e1c8e`+후속(실제 Chrome DOM 시험) · 증거/체크포인트 커밋. R1~R3·S1-R 은 변경하지 않았고 main 병합·배포·D1 변경은 없습니다.

### 원인과 수정
`weeklyTideWeather` 의 정상 today 분기가 검증을 통과한 raw 를 출처(`_weatherState`) 없이 복사해, `weatherScoreAllowed`(검증된 `_weatherState.scoreEligible===true` 요구)가 추천 카드(`renderTodayPanel`)에서만 점수를 거부했습니다(팝업은 `storedWeatherState` 가 출처를 다시 계산해 정상).
→ `weeklyTodayWeather(site, raw, date)` 한 함수에서 `weeklyTodayRecommendable`(own true·빈 목록·유효 점수·필수 기상값) 검증 후에만 출처를 붙이고, `weeklyTideWeather`·`weeklyWeatherEntryForSite` 가 함께 사용합니다. 검증되지 않은 raw 에는 출처가 붙을 수 없고 `weatherScoreAllowed` 는 완화하지 않았습니다. 점수 산식·P0(90분·강수 1mm·선상)·가점 16·정원은 무변경.

### 수정 전후 (실제 Chrome `renderTodayPanel` 카드 + 탐조지 팝업 DOM, 걸매리 14, 주간 자료 없음/해당 장소 없음, 정상 today·조석)
| 시나리오 | 수정 전 카드 / 팝업 | 수정 후 카드 / 팝업 |
|---|---|---|
| 92점 + 제보 16 (rank 108) | 오늘 적합도 미확인 / ★★★★★ 92점 | ★★★★★ 92점 / ★★★★★ 92점 (rank 108 유지) |
| 0점 · 92.5 · 100 | 모두 미확인 / 점수 | 카드 = 팝업 = 0·92.5·100점 |
| 주간 자료 있으나 해당 장소 없음 | 미확인 / 92점 | 92점 / 92점 |
| 만조 90분 허용 · 91분 차단 | 90분 카드 미확인 | 90분 카드 92점, 91분 카드 없음 |
| 안전한 대체 만조 | 12:30 · 870cm 카드 미확인 | 12:30 · 870cm, 92점 |
| 주간 기상 기반 | 92점 / 92점 | 동일 (변화 없음) |
| 필수 풍속·강수 결측 · 적격 미확인 · missingScoreFields 목록 · previous_saved | 카드 없음 / 팝업 미확인(참고 값 유지) | 동일 (변화 없음) |

카드 시험: 수정 전 6 fail / 3 pass → 수정 후 9/9. 344·375·768·1024·1440px 에서 카드·팝업 점수 동일, 가로 범위·잘림 없음(실제 마커 팝업, 지도 이동 애니메이션만 끔). 원자료: `docs/p1-s-implementation/results/r4/`.

### 회귀 (Windows, Python 3.12, 로컬 Chrome)
JS 499 pass(reports-api 178 · weather-proxy 36 · 프런트 13파일 285 — 주간 146, 신규 카드 DOM 9 포함) + Python 74 pass/1 skip → **573 pass / 0 fail / 1 skip** (이전 563/0/1).
Sol 의 실제 함수 행렬 재실행: **182/182 · 특별 21/21 · 팝업 12/12**. 고정 입력(2026-10-08 22:40, 190곳, 176후보, 제보 ON/OFF): 35141c0·1bd2619·현재 전체 후보 signature 와 상위 10 동일(ON 108 112 15 194 126 14 107 48 195 3 / OFF 112 7 8 10 126 14 107 48 3 5), 합성 null 11곳 176→165.
origin/main(38b4529)과 merge-tree 충돌 없음. main 의 자동 JSON(16:28)을 임시 worktree 에서만 덮어 전체 스위트와 두 validator 통과(자동 JSON 수정 없음).

### 범위 분리(미구현, 체크포인트에 유지)
R5(극단 숫자 문자열·JS/Python 입력 집합 차이), 기존 현장소식 늦은 응답으로 삭제 마커 재출현·보호 상태 재노출, S1-P(승인 후 공개 정책·간접 위치 연결).

### 미검증
실기기, 배포 환경, 로컬 합성 API 를 쓴 제보·현장소식 등록/삭제/길안내 E2E, 실제 운영에서 주간 로더 실패가 발생하는 빈도(합성 DOM 재현이며 운영 장애 관측이 아님).
