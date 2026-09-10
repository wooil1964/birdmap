# HANDOVER.md — AI 작업 인수인계 문서

이 문서는 여러 AI(ChatGPT, Codex, Claude Code, Gemini)가 이 저장소에서 순차적으로 작업할 때
현재 상태와 최근 완료 작업을 공유하기 위한 인수인계 문서입니다.

> 작업 규칙은 `AI_WORK_RULES.md`가 최우선이며, 이 문서와 충돌하면 `AI_WORK_RULES.md`를 따릅니다.

## 현재 서비스 기준

- 실제 서비스 파일: main 브랜치의 `index.html` (GitHub Pages 배포)
- 실시간 기상: Cloudflare Worker (`weather-proxy/`) 연동
- 기상·조석 데이터: GitHub Actions가 `weather_today.json`, `tide_today.json`, `tide_month.json` 자동 갱신
- 오프라인 원본 DB: `data/` 폴더의 엑셀 파일 (기준 엑셀은 사용자가 지정)

## 최근 완료 작업

- L03 후속 — today validator numeric validation(2026-09-10, 시작·기준 main `5dde254`): **root cause** — `.github/scripts/validate_weather.py`가 적격 site의 점수를 `isinstance(day["score"], (int, float)) and 0 <= day["score"] <= 100`으로만 확인했다. **Python에서 bool은 int의 서브클래스**라 `score=True`가 그대로 통과했다. 또 파고 좌표 `waveLat`/`waveLon`에는 검증이 아예 없어 문자열·bool·`inf`가 모두 통과했고, weekly와 달리 `parse_constant`도 없었다.
  - **중요한 사실 확인**: 지시서가 지목한 `windSpeed`·`windDirectionDeg`·`precipitation3h`·`waveM`은 **today 문서에 존재하지 않는다**(187곳 전수 확인 결과 0곳). weekly 전용 필드이며 today는 `build_site_result()`가 `wind:"북동풍 3.6m/s"`, `rain:"강수 없음"`, `wave:"0.7m"`, `temperature:"22.0°C"`처럼 **포맷된 문자열**로 저장한다. today가 실제로 숫자로 저장하는 값은 `score`(int)와 `waveLat`/`waveLon`(float, 파고 대상 66곳)뿐이다. 따라서 weekly 계약을 복사하지 않고 실제 존재하는 수치만 검증했다.
  - 수정 전 재현(원본은 그대로 두고 임시 복사본의 적격 site 1곳만 변조해 실제 `validate()` 호출): `score=true` **PASS**, `waveLat="x"` **PASS**, `waveLat=1e999`(→`inf`) **PASS**. 반면 `score=1e999`·`score=NaN`·`score=Infinity`·`score="90"`은 기존 range/isinstance 비교가 이미 **REJECT**하고 있었고, today에 없는 `windSpeed`/`precipitation3h`/`waveM`을 억지로 넣은 case는 검사 대상이 아니라 PASS였다(감사 재현 결과를 억지로 맞추지 않았다).
  - 수정은 validator 한 파일뿐이다. `finite_number()` helper(“bool 제외 + int/float + `math.isfinite`”)를 로컬로 정의하고, ① 적격 site의 `score`를 `finite_number(...) and 0 <= score <= 100`으로 좁히고 ② `COORDINATE_FIELDS = ("waveLat","waveLon")`에 대해 **값이 있을 때만** 유한한 숫자인지 검사하며 ③ weekly와 같은 `parse_constant=reject_constant`를 추가해 `NaN`/`Infinity` 리터럴을 문서 어디에서든 막는다. 상한값은 임의로 만들지 않았고 위경도 범위 제한도 추가하지 않았다. 부적격 site의 정상 결측(`score=None`)은 그대로 통과한다.
  - 수정 후: `score=true` **REJECT**, `waveLat="x"`·`waveLat=1e999` **REJECT**, `NaN`/`Infinity` 리터럴은 `parse_constant`가 먼저 **REJECT**, 정상 `weather_today.json`은 **PASS** 유지.
  - 실데이터 검사: 현재 `weather_today.json` 187곳(적격 187) 전수에서 **malformed numeric 0건**(score 0·waveLat 0·waveLon 0). 운영 데이터 손상이 아니라 validator 사각지대를 메운 것이다.
  - 검증: 신규 4개(`test_today_validator_rejects_malformed_numbers`·`test_today_validator_rejects_json_special_numbers`·`test_today_validator_accepts_valid_numbers`·`test_today_validator_keeps_ineligible_sites_valid`)를 기존 `test_weather.py`에 추가해 기상 44 → **48**이 됐다. **수정 전 이 4개는 16 failures로 실패**하고 수정 후 통과한다. 전체 회귀: 기상 48·주간 추천 83·L01 5·M07 9·월간 버튼 5·M06 19·조석 생성기 20·Worker 33으로 **총 222** 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0.
  - **weekly validator(`validate_weather_week.py`)는 무변경**이다(L03에서 이미 완료). helper를 공유하려고 새 공용 모듈을 만들지 않고 today 쪽에 독립적으로 3줄을 정의했다. 프로덕션도 전부 무변경: `index.html`·`update_weather.py`·`weather_today.json`·`weather_week.json`·`weather_rules.json`·score·recommendation·season engine·pelagic·safetyRaw 생성·조석·station mapping·siteData·좌표·`notices.json`. 변경 파일은 `.github/scripts/validate_weather.py`·`.github/scripts/test_weather.py`·`HANDOVER.md`뿐이다.
  - 이번에 확인만 하고 넓히지 않은 것: today validator는 부적격 site에 대해 `score is None`을 강제하지 않고(적격 site만 검사) `wind`/`rain`/`wave` 문자열의 형식도 검증하지 않는다. 수치 검증 범위 밖이라 손대지 않았다. L04~L06과 `v24BriefingInterpretation()` timezone 건도 이번 범위가 아니다.

- weekly validator 수치 검증 보완(L03, 2026-09-10, 시작·기준 main `67405aa`): **root cause** — `.github/scripts/validate_weather_week.py`가 적격 sample의 `SCORE_FIELDS`(windSpeed·windDirectionDeg·precipitation3h)를 `assert sample[field] is not None`으로 **존재 여부만** 확인하고 타입·부호·유한성을 보지 않았다. `waveM`도 wave 필수 지역에서 `is not None`만 확인했고, `score`는 `0 <= score <= 100` 비교뿐이라 **Python에서 bool이 int의 서브클래스**인 탓에 `True`가 통과했다. 또 JSON 숫자 `1e999`는 `parse_constant` 경로가 아니라 `float('inf')`로 파싱되므로 기존 NaN/Infinity 리터럴 차단과 무관하게 빠져나갔다. `safetyRaw`에는 이미 `isinstance(...) and math.isfinite(...)` 검사가 있었지만 같은 bool 구멍이 있었다.
  - 수정 전 재현(원본 JSON은 건드리지 않고 임시 복사본을 변조해 실제 `validate()` 호출): `precipitation3h=-1` **PASS**, `windSpeed="NaN"` **PASS**, `windSpeed=false` **PASS**, JSON 숫자 리터럴 `windSpeed=1e999`(→`inf`) **PASS**. 원본 그대로는 PASS. `NaN` 리터럴은 기존 `parse_constant`가 이미 REJECT하고 있어 두 경로를 구분해 확인했다.
  - 수정은 validator에만 했다. `finite_number(value)` helper(“bool 제외 + int/float + `math.isfinite`”)를 추가하고, `NUMERIC_FIELDS = SCORE_FIELDS + ("waveM",)`에 대해 **값이 있을 때만** 유한한 숫자이고 0 이상인지 검사한다(결측 None의 허용 여부는 기존 eligible/ineligible 규칙이 그대로 판단하므로 ineligible sample의 정상 결측은 계속 통과한다). `score`도 같은 helper로 `None 또는 bool 아닌 유한 수치 0~100`으로 좁혔고, `safetyRaw`의 기존 검사도 같은 helper로 바꿔 bool 구멍만 막았다(반올림 일치 검사와 C01 raw precision gate는 **무변경**). 상한값을 임의로 만들지 않았고, `windDirectionDeg`에만 `< 360`을 더했는데 이는 생성기가 `round(...) % 360`으로 저장한다는 **명시적 계약**이며 현재 실데이터도 0~359(360은 0건)로 확인했다.
  - 수정 후: 위 네 case 모두 **REJECT**, 정상 `weather_week.json`은 그대로 **PASS**. 신규 malformed 회귀로 windSpeed/precipitation3h/windDirectionDeg/waveM의 문자열·bool·음수·`1e999`, `windDirectionDeg=360`, `score=true`·`score="92"`를 거부하고, 정상 경계(windSpeed 0·precipitation3h 0·windDirectionDeg 0·359·int 수치·waveM 0·score 0·score 100·비파고 지역 waveM None)와 ineligible sample의 정상 결측은 통과함을 확인한다.
  - 실데이터 검사: 현재 `weather_week.json` 10,472 sample(적격 10,472) 전수에서 **invalid numeric 0건**(windSpeed·windDirectionDeg·precipitation3h·waveM·score 모두 0). 즉 운영 JSON 손상이 아니라 validator 사각지대를 메운 것이다.
  - 검증: 신규 4개(`test_validator_rejects_malformed_weekly_numbers`·`test_validator_rejects_json_number_overflow`·`test_validator_accepts_valid_weekly_numbers`·`test_validator_keeps_ineligible_sample_gaps_valid`)를 기존 `test_weather.py`에 추가해 기상 40 → **44**가 됐다. **수정 전 이 4개는 19 failures + 1 error로 실패**하고 수정 후 통과한다. 전체 회귀: 기상 44·주간 추천 83·L01 공지 닫기 hit 5·M07 공지 KST 9·월간 버튼 5·M06 조석 fallback 19·조석 생성기 20·Worker 33으로 **총 218** 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0.
  - **프로덕션 생성·추천 로직 무변경**: `index.html`·`update_weather.py`·score·recommendation·season engine·pelagic gate·safetyRaw 생성·조석·station mapping·siteData·좌표·`weather_rules.json`·생성 JSON 전부 손대지 않았다. 변경 파일은 `.github/scripts/validate_weather_week.py`·`.github/scripts/test_weather.py`·`HANDOVER.md`뿐이다.
  - 별도 발견(이번 commit에 포함하지 않음): `validate_weather.py`(today)에도 같은 계열의 약점이 있다. 적격 site의 `score`를 `isinstance(day["score"], (int, float))`로만 확인해 **bool을 배제하지 않고 `math.isfinite`도 검사하지 않으며**, `windSpeed`·`waveM` 등 다른 저장 수치는 타입·부호 검증이 아예 없다. L03 원문이 `validate_weather_week.py`를 대상으로 하므로 자동 확대하지 않고 미해결 항목으로만 보고한다. L04~L06과 `v24BriefingInterpretation()` timezone 건도 이번 범위가 아니며 손대지 않았다.

- 9월 동풍·선상 테스트의 실행시각 의존성 제거(L02 후속, 2026-09-10, 시작·기준 main `618d93d`): L02 작업 중 발견한 별건이며 **Ultra 감사의 L03이 아니고 프로덕션 기능 수정도 아니다**. **root cause** — `.github/scripts/test_weekly_recommendation.mjs`의 '9월 동남해안 동풍 mandatory 는 8.0m/s 부터 충족', '동풍과 선상 gate는 지역·풍향·풍속에서 독립', '강한 동풍 이슈는 안전 선상 날짜·사유로 섞이지 않으며 전부 위험하면 0' 세 테스트가 `date='2026-09-10'`(세 번째는 09-10과 09-11)을 하드코딩하면서 테스트 시계는 실제 현재 시각을 그대로 썼다. 실행일이 그 날짜와 겹치고 09:00을 넘기면 프로덕션의 정상적인 '오늘 이미 지난 시각 제외'가 09:00 sample을 지워 세 테스트가 함께 실패했다. 동풍 정책·선상 gate의 오류가 아니라 fixture의 시계 미고정 문제다.
  - 수정 전 재현: KST **05:00 3 pass · 08:00 3 pass · 09:30 3 fail**. L02 commit(`618d93d`) 이전 원본(`2b23994`)의 같은 파일에서도 05:00·08:00 통과, 09:30 실패로 동일해 **L02의 부작용이 아님**을 다시 확인했다.
  - 수정은 fixture 시계 고정뿐이다. 모듈 상수 `SEPTEMBER_FIXTURE_NOW = '2026-09-09T12:00:00+09:00'`를 두고 세 테스트의 `loadApi()` 호출에만 `now`로 주입했다(실질 3줄 + 상수·주석 4줄). 대상 날짜 2026-09-10/11보다 앞선 시각이라 09:00 sample이 항상 미래로 남고, 9월을 벗어나지 않아 동풍 mandatory의 9월 조건 검증이 그대로 성립한다. `futureDate()`로 바꾸지 않았다(9월 밖으로 이동할 수 있어 정책 검증이 깨진다).
  - **assertion diff는 0줄**이다. 동풍 8.0m/s inclusive·7.9 false, 포항/울산/부산 지역 조건, E/NE/SE 충족과 W/NW/SW 제외, 동풍 mandatory와 선상 gate의 독립, 원자료 기준 선상 안전판정, 강한 동풍 unsafe sample이 안전 선상 추천으로 섞이지 않음, 전부 위험하면 선상 0 — 기존 검증 의미는 전부 그대로다. unsafe/safe sample의 score·wave·wind 값도 무변경이다.
  - **프로덕션 코드 변경 0**: `index.html` diff 0줄이며 `weeklyDaylightCandidates()`·`weeklyEastWindFromWeek()`·`weeklyPelagicSafety()`·`todayRecommendedSites()`·동풍 mandatory 정책·선상 gate·9월 계절 조건·score·과거시간 제외 로직은 손대지 않았다. 오늘 지난 시각을 추천하지 않는 현재 동작은 정상 정책이라 그대로 유지한다.
  - 안정성 검증: 세 테스트를 2026-09-10 05:00 / 09:30 / 15:00, 2026-09-11 09:30, 2027-01-15, 2027-06-21 여섯 외부 시계와 `Asia/Seoul` / `UTC` / `America/Los_Angeles` 세 시스템 timezone에서 실행해 **전부 3 pass / 0 fail**이다.
  - 전체 회귀: **주간 추천 83/83 복구**, L01 공지 닫기 hit 5·M07 공지 KST 9·월간 버튼 5·M06 조석 fallback 19·기상 40·조석 생성기 20·Worker 33으로 **총 214/214** 통과. validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0. L02의 새 일출·일몰 관계 테스트와 C01 3·H01 6·M01 1·M02 1도 그대로 통과한다.
  - 변경 파일은 `.github/scripts/test_weekly_recommendation.mjs`·`HANDOVER.md`뿐이다. `index.html`·`notices.json`·`tide_station_mapping.json`·`weather_rules.json`·`weather-proxy/src/sites.js`·조석/기상 생성 JSON과 다른 테스트 파일은 무변경이다. L03~L06과 `v24BriefingInterpretation()` timezone 건은 이번 범위가 아니며 손대지 않았다.

- 일출·일몰 경계 테스트의 계절 의존성 제거(L02, 2026-09-10, 시작·기준 main `2b23994`): **root cause** — `.github/scripts/test_weekly_recommendation.mjs`의 '일출~일몰 경계' 테스트가 `futureDate()`(오늘+3일)로 대상 날짜를 만들면서 `sun.riseMin > 6*60 && < 9*60`, `sun.setMin > 18*60 && < 21*60`이라는 **고정 계절 가정**을 걸고, 표본 시각도 06:00/09:00/18:00/21:00으로 못박아 `['09:00','18:00']`만 남는다고 단언했다. 실행 시점이 그 창을 벗어나는 계절이면 정상 천문값에도 테스트가 깨졌다.
  - 수정 전 재현(대상 site 유부도 lat 36.0 / lon 126.6, 좌표 그대로): 실제 `weeklySunTimes()` 출력이 **겨울 2027-01-15 일출 07:44 · 일몰 17:41**(일몰 가정 실패), **여름 2027-06-21 일출 05:17 · 일몰 19:53**(일출 가정 실패), 동지 2027-12-21 17:23, 가을 2027-10-15 17:59로 모두 기존 가정을 벗어난다. 감사 원문의 '겨울 일몰 약 17:37 / 여름 일출 약 05:17'과 일치한다. 가짜 시계로 suite 전체를 돌리면 이 테스트는 **겨울·여름 clock 양쪽에서 FAIL**했다(수정 전 겨울 7 fail / 여름 10 fail 중 1건).
  - **프로덕션 천문 계산은 전혀 건드리지 않았다.** `index.html` diff는 0줄이고 `weeklySunTimes()`·좌표·timezone·daylight 판정·추천 정책도 무변경이다. clamp·계절 보정·공식 변경은 하지 않았다. 바뀐 것은 테스트의 날짜와 기대값뿐이다.
  - 수정 내용: 그 테스트 하나만 관계 기반으로 바꿨다. 테스트 시계(`loadApi({now})`)와 대상 날짜를 **함께 고정**해 실행 날짜·시스템 timezone과 무관하게 만들고, 표본 시각을 실제 계산된 `riseMin`/`setMin`에서 파생시켜 **일출 −1분 제외 · 일출 정각 포함 · 일출 +1분 포함 · 일몰 −1분 포함 · 일몰 정각 포함 · 일몰 +1분 제외**를 검증한다. 경계 의미는 기존 구현(`minutes < riseMin || minutes > setMin` 만 제외 = 양끝 inclusive) 그대로이며 새 inclusive/exclusive 정책을 만들지 않았다. 겨울·여름·봄·가을 4개 대표일을 모두 같은 관계로 확인한다. 값 존재 확인 같은 약한 단언으로 바꾸지 않았고 오히려 3시간 단위 4점 → ±1분 6점 × 4계절로 강화됐다.
  - `futureDate()` 헬퍼는 삭제하지 않았다. 이 테스트에서만 호출을 없애 사용처가 18곳 → 17곳이 됐고 다른 테스트의 날짜 흐름은 그대로다. 절대 정확도를 확인하는 기존 '공표된 서울 하지/동지 값과 일치한다' 테스트(고정 날짜)는 손대지 않았다.
  - 실행 날짜 독립성: 수정한 테스트를 2027-01-15 / 2027-06-21 / 2027-12-21 / 2027-03-20 / 2027-10-15 / 윤년 2028-02-29 여섯 시계와 `TZ=UTC` / `America/Los_Angeles` / `Pacific/Honolulu` / `Asia/Seoul` 네 시스템 timezone에서 돌려 전부 통과했다. 가짜 시계로 suite 전체를 돌린 결과도 겨울 7→6, 여름 10→9로 **정확히 이 테스트 1건만 줄었다**.
  - 전체 회귀: L01 공지 닫기 hit 5·M07 공지 KST 9·월간 버튼 5·M06 조석 fallback 19·기상 40·조석 생성기 20·Worker 33은 전부 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0. C01 3·H01 6·M01 1·M02 1·물때 6·일출일몰 공표값 1도 통과한다.
  - **주간 추천 suite는 현재 80 pass / 3 fail이며 이 3건은 L02와 무관하고 이번 변경 이전부터 실패한다**(변경을 stash한 원본에서도 동일하게 실패 확인). 원인은 '9월 동남해안 동풍 mandatory 는 8.0m/s 부터 충족', '동풍과 선상 gate는 지역·풍향·풍속에서 독립', '강한 동풍 이슈는 안전 선상 날짜·사유로 섞이지 않으며 전부 위험하면 0' 세 테스트가 `date='2026-09-10'`을 하드코딩해 **그 날짜가 실행일과 같아지면** 09:00 표본이 '오늘 이미 지난 시각' 필터에 걸리는 것이다(KST 05:00·08:00에는 통과, 09:30에는 실패, 실제 현재 09:19). L02와 같은 '실행 시점 의존' 계열이지만 일출·일몰 경계 테스트가 아니고 동풍·선상 gate 테스트 수정은 이번 지시에서 금지돼 있어 **고치지 않고 별도 항목으로 보고**한다.
  - 변경 파일은 `.github/scripts/test_weekly_recommendation.mjs`·`HANDOVER.md`뿐이다. `index.html`·`notices.json`·`tide_station_mapping.json`·`weather_rules.json`·`weather-proxy/src/sites.js`·좌표·siteData·기상/조석 생성기와 다른 테스트 파일(L01·M07·M06·월간 버튼·기상·조석)은 무변경이다. L03~L06과 `v24BriefingInterpretation()` timezone 건은 이번 범위가 아니며 손대지 않았다.

- PC 공지 닫기 버튼 클릭 가림 수정(L01, 2026-09-10, 시작·기준 main `a987a29`): **root cause** — 데스크톱 CSS에서 `#noticePanel{top:126px;z-index:10000}`이 `#todayToggleBtn{top:131px;z-index:10001}`과 같은 오른쪽 열에서 겹쳐 열렸다. 패널 헤더의 '닫기' 버튼(1366 기준 rect top 140~164, x 1255~1298)이 추천 버튼 rect(top 131~169, x 1170~1314) **안에 완전히 포함**되는데 추천 버튼의 z-index가 더 높아 클릭을 가로챘다. 닫기 버튼은 `z-index:10000`인 패널의 stacking context 안에 있어 자식 z-index로는 절대 위로 올라갈 수 없다. 반면 `#todayPanel`은 이미 `top:206px`로 버튼 아래에 열려 같은 문제가 없었다.
  - 수정 전 실제 Chromium 재현(1366×768 / 1920×1080): 닫기 중심 (1277,152) / (1831,232→수정전 152)에서 `document.elementFromPoint()`가 **`todayToggleBtn`** 을 돌려줬고 `close ∩ today = true`였다. 두 해상도 모두 재현됐다.
  - 최소 수정은 데스크톱 `#noticePanel`의 `top:126px` → `top:206px` **한 속성값 하나**뿐이다(index.html 실질 1줄). 저장소가 이미 쓰던 '패널은 상단 버튼 아래에서 연다'는 `#todayPanel`의 배치 규칙을 그대로 따랐다. **z-index는 어느 요소도 바꾸지 않았고** 폭·색·글꼴·아이콘·문구·여백·모바일 배치도 그대로다. 모바일은 `@media(max-width:700px)`가 `top:var(--birdmapTopUiH,178px)`로 이미 덮어쓰므로 영향이 없다.
  - 수정 후: 두 해상도 모두 닫기 중심 (1277,232)/(1831,232)에서 `elementFromPoint`가 **닫기 BUTTON**을 돌려주고 `close ∩ today = false`이며, 실제 click 이벤트로 `noticePanel.style.display`가 `none`이 된다. 추천 버튼은 공지 열림/닫힘 양쪽에서 그대로 클릭되고(`pointer-events` 우회 없음) 클릭 시 추천 패널이 열린다. 패널 최대 높이 68vh 기준 206+522=728px로 768 화면에서도 잘리지 않는다.
  - 검증: 신규 `.github/scripts/test_notice_close_hit.mjs` **5개**. Playwright/Puppeteer 등 새 의존성 없이 Node 내장 WebSocket + 사전 설치 Chromium을 CDP로 직접 몰아 실제 `index.html`을 렌더하고 rect·`elementFromPoint`·진짜 `click`으로 검증한다. A/B(1366·1920 필수 + 1440×900·1536×864, 공지 본문 3상태), C(실제 클릭으로 닫힘), D(추천 버튼 양쪽 상태 클릭 가능), E(모바일 360×800·390×844·412×915 배치·닫기 유지), F(추천 패널·월간 조석 모달 stacking 회귀 없음)를 포함한다. **수정 전 A/B와 C가 실패**하고(D·E·F는 수정 전에도 통과 — 추천 버튼·모바일·다른 overlay는 원래 정상) 수정 후 5/5 통과한다.
  - L01에 실제로 영향을 주는 상태만 조합했다: 공지 패널 open/closed, 공지 본문 길이(실제 `notices.json` / 긴 본문 / 공지 없음 → 패널 높이 변화), 추천 패널 open, 데스크톱 4해상도 × 모바일 3해상도. **계절(봄·여름·가을·겨울)은 이 CSS 배치에 관여하지 않는다**(패널 좌표는 정적 CSS, 추천 버튼 문구도 정적 텍스트, 공지 본문은 notices.json에서만 온다). 감사 원문의 '6개 조합'이 저장소에 명시돼 있지 않아 임의로 계절 조합을 만들지 않고 실제 영향 인자로 구성했다.
  - 전체 회귀: 공지 닫기 hit 5(신규)·공지 KST 9·월간 버튼 5·조석 fallback 19·기상 40·주간 추천 83·조석 생성기 20·Worker 33(총 **214**) 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0. C01 3·H01 6·M01 1·M02 1·물때 6·공지 8과 M03/M04·M05·M06(19)·M07(9)·이천항 버튼(5) 모두 통과한다.
  - 실데이터: 오늘(2026-09-10 KST) `notices.json` 3건이 모두 활성이라 데스크톱 fixture의 '실제 notices.json' 상태는 합성이 아니라 실제 표시 상황이다.
  - 변경 파일은 `index.html`·`.github/scripts/test_notice_close_hit.mjs`(신규)·`HANDOVER.md`뿐이다. `notices.json`·공지 내용/날짜(M07)/priority/structured linkage·추천 계산·추천 후보·패널 open/close 로직·조석/기상 생성기·station mapping·좌표·siteData·`weather_rules.json`은 **무변경**이다. L02(sunrise/sunset 테스트)·L03·L04·L05·L06과 `v24BriefingInterpretation()` timezone 건은 이번 범위가 아니며 손대지 않았다.

- 공지 활성 날짜를 KST 기준으로 통일(M07, 2026-09-10, 시작·기준 main `91bee40`): **root cause** — `todayString()`이 브라우저 현지시간의 `getFullYear()/getMonth()/getDate()`로 오늘 날짜를 만들고 `activeNotice()`가 그 값으로 `start`/`end`를 비교했다. 그래서 같은 실제 순간이라도 브라우저 timezone이 KST가 아니면 날짜가 하루 어긋났다.
  - 수정 전 재현(동일 순간 `2027-05-31T15:30:00Z` = 2027-06-01 00:30 KST): Asia/Seoul은 `2027-06-01`인데 UTC·America/Los_Angeles·Europe/London·Pacific/Honolulu는 모두 `2027-05-31`이었다. 그 결과 `{start:'2027-06-01',end:'2027-06-10'}` 공지가 비KST 브라우저에서 **비활성**, `{start:'2027-05-20',end:'2027-05-31'}` 공지가 **계속 활성**이었다. 같은 순간에 `kstDateText()`는 모든 timezone에서 이미 `2027-06-01`을 반환했다.
  - 최소 수정은 `index.html`의 `todayString()` 본문 2줄을 **기존 `kstDateText()` 호출 1줄로 바꾼 것**뿐이다(주석 1줄 포함). 새 날짜 helper를 만들지 않았고 `kstDateText()`·`weeklyTodayDateText()`·`todayKstMonth()`는 손대지 않았다. `todayString()`의 호출부는 저장소 전체에서 `activeNotice()` 하나뿐이라(grep 전수 확인) 공지 외 기능의 날짜 의미는 바뀌지 않는다. 두 함수는 같은 inline script 블록에 있어 함수 선언 호이스팅으로 정의 순서와 무관하게 안전하다. `.github/scripts/test_weekly_recommendation.mjs`의 추출 목록에는 새 의존 함수 `kstDateText`를 한 단어 추가했다.
  - 정책 무변경: `start`/`end`의 inclusive 경계, `published!==false`, `start` 미기재 시 `0000-01-01`·`end` 미기재 시 `9999-12-31` 기본값, 공지 우선순위, structured linkage(`siteIds`/`siteId`/`sites`), 문구·노출 방식은 전부 그대로다. 자연어 파싱은 추가하지 않았다. 이번 수정은 '오늘 날짜를 KST로 계산'하는 것뿐이다.
  - 수정 후: 위 다섯 timezone 전부 `todayString()`이 `2027-06-01`이고 6/1 시작 공지 활성·5/31 종료 공지 비활성으로 결과가 일치한다. **Asia/Seoul 결과는 수정 전과 완전히 동일**하며 비KST 기기의 하루 차이만 교정된다.
  - 검증: 신규 `.github/scripts/test_notice_kst_date.mjs` **9개**(index.html 실제 함수 사용, 같은 실제 순간을 유지한 채 local getter만 해당 timezone으로 답하는 Date를 주입). 다섯 timezone 날짜 일치, 감사 원문 CASE A·B, C~F start/end 경계 inclusive, KST 자정 23:59/00:00/00:01, 연말 2026-12-31→2027-01-01·윤년 2028-02-29·2028-03-01, 실제 `activeNotice()`/`activeNoticeItems()` fixture 검증, `published:false`·기본값 정책 유지, 서울 무변화를 포함한다. **수정 전 9개 중 8개가 실패**하고 수정 후 9/9 통과한다. 전체 회귀: 공지 KST 9(신규)·월간 버튼 5·조석 fallback 19·기상 40·주간 추천 83·조석 생성기 20·Worker 33(총 **209**) 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0. C01 3·H01 6·M01 1·M02 1·물때 6·공지 8개와 M03/M04·M05·M06(19)·이천항 버튼(5) 모두 통과한다.
  - 실데이터 영향: 현재 `notices.json`은 3건(배열, `start` 2건·`end` 2건·`published:false` 0건)이고 오늘(2026-09-10 KST) 기준 경계일에 걸린 공지가 **0건**이라 활성 목록은 수정 전후·모든 timezone에서 3건으로 동일하다. 다만 **수정 전에는 UTC·LA·Honolulu의 오늘 날짜 자체가 2026-09-09로 하루 어긋나 있었다**(잠재 결함). 즉 현재 표시 차이는 0이며 KST 자정 부근이나 경계일 공지에서만 드러났을 문제를 선제 교정한 것이다. 실제 사용자 브라우저의 timezone 분포는 알 수 없으므로 추정하지 않는다.
  - 변경 파일은 `index.html`·`.github/scripts/test_notice_kst_date.mjs`(신규)·`.github/scripts/test_weekly_recommendation.mjs`(추출 목록 1단어)·`HANDOVER.md`뿐이다. `notices.json`은 **무변경**(start/end/문구/siteIds/우선순위/순서 전부 그대로)이고 조석·기상 생성기·계절 엔진·pelagic·score_weather·조석 threshold·siteData·좌표·station mapping·CSS/레이아웃·모바일 UI도 무변경이다. L01~L06(L02 sunrise/sunset 테스트 포함)은 이번 범위가 아니며 손대지 않았다.
  - 이번에 확인만 하고 고치지 않은 것: `v24BriefingInterpretation()`(index.html)이 팝업 해설 문장용 월을 `new Date().getMonth()+1`로 브라우저 현지시간에서 얻는다. 공지 활성 판정 경로가 아니므로 M07 범위 밖이라 손대지 않았고, 계절 추천 엔진이 쓰는 `todayKstMonth()`는 이미 Intl KST 기반이라 무관하다. 별도 항목으로 보고한다.

- 이천항 '한 달 조석 보기' 버튼 노출(2026-09-10, 시작·기준 main `376da74`): **root cause** — `index.html`의 `MONTH_TIDE_SITE_IDS`가 27개인데 `tide_month.json`의 월간 대상은 28곳이라 **ID 188 이천항 하나만** Set에 없었다. `monthTideButtonHtml()`과 `openMonthTideModal()`이 둘 다 이 Set으로 게이트하므로 버튼이 렌더되지 않았다. 수정 전 실제 함수로 재현했다: ID 188은 `showTide:true`이고 `tide_month.json`에 31일치 자료도 있는데 `monthTideButtonHtml()`이 빈 문자열을 반환했고, 월간 대상 28곳 중 버튼이 나오는 곳은 27곳이었다. 양방향 차집합도 `[188]` 하나뿐이라(Set에만 있고 월간에 없는 ID는 0개) 다른 원인은 없었다.
  - 수정은 그 Set에 `'188'` 하나를 더한 **1줄·토큰 1개**다. 기존 27개 ID·순서·버튼 문구·위치·CSS·모달 로직은 그대로이고, 월간 대상 목록 자체(`tide_month.json`)는 손대지 않았다. API 호출 수 변화 0(버튼은 기존 `loadTideMonth()` 캐시를 그대로 쓴다).
  - 검증: 신규 `.github/scripts/test_month_tide_button.mjs` 5개(Set ≡ `tide_month.json` ID 집합 완전 일치, ID 188 버튼 표시·`openMonthTideModal('188')` 연결, 기존 27곳 전부 유지, 비대상 site 누출 0곳, 버튼 노출 수 = 월간 대상 수 28). **수정 전 이 중 3개가 실패**하고 수정 후 5/5 통과한다. 전체 회귀: 월간 버튼 5(신규)·조석 fallback 19·기상 40·주간 추천 83·조석 생성기 20·Worker 33(총 **200**) 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0.
  - 무변경: `tide_station_mapping.json`·관측소 코드·좌표·`tide_month.json`·`tide_today.json`·`tide_health.json`·`weather_rules.json`·`notices.json`·`weather-proxy/src/sites.js`·`test_tide_fallback.mjs`. M06 fallback 로직(`tideTodayForSite()`/`monthTideDayForSite()`/`loadTideToday()`)은 한 줄도 건드리지 않았고 19개 테스트 그대로 통과한다. 물때 mandatory(유부도 700·매향리 850·걸매리 850cm)는 `TODAY_MUDFLAT_TIDE_RULES` diff 0이며 ID 188은 애초에 물때 규칙 대상이 아니다. M07 이후·L01~L06은 수정하지 않았다.

- 오늘 조석의 exact-date 월간 fallback 누락 수정(M06, 2026-09-10, 시작·기준 main `ee470db`): **root cause** — `index.html`에 exact-date 월간 fallback(`monthTideDayForSite()`)이 이미 있었지만 **`tideTodayForSite()`의 '`tide_today.json` root date가 오늘이 아닌' 분기에서만 도달**했다. 그래서 ① daily HTTP 자체가 실패하면 `loadTideToday()`의 catch가 `tideToday`만 비우고 **월간 endpoint를 아예 요청하지 않아** 메모리에 월간이 없으면 fallback이 불가능했고, ② daily root date가 오늘로 정상이면 `sites[id]||null`이 **즉시 null을 반환**해 메모리에 있는 그 site의 오늘 exact-date 월간 값을 확인조차 하지 않았다. 결과적으로 월간 모달을 먼저 열었는지 여부가 오늘 조석 가용성을 좌우하는 비일관성이 있었다.
  - 수정 전 실제 함수로 두 경로를 재현했다. **CASE A**(평가일 2026-09-10, daily fetch reject, 월간에 9/10 만조 711.0/863.0cm 존재): fetch 호출은 `./tide_today.json` 하나뿐이고 월간 미적재, `tideTodayForSite()`는 `{staleDaily:true,staleDailyDate:"",monthFallbackMissing:true}`로 오늘 조석 사용 불가. **CASE B**(daily root date=2026-09-10 정상, site 19만 누락, 메모리 월간에 9/10 유효값 존재): `monthTideDayForSite()`는 exact-date row를 찾을 수 있는데도 `tideTodayForSite()`가 `null`을 반환.
  - 최소 수정은 `index.html` 3곳(실질 15줄)이다. ① `tideTodayForSite()`를 '사용 가능한 오늘 daily → 같은 site의 exact-date 월간 → 기존 표시 유지'順으로 바꿨다(반환 shape·호출부 무변경). ② `monthTideDayForSite()`는 `days[i].date===today`에 더해 기존 `v24TideDayEvents()`로 실제 조석값이 있는 row만 채택하고(row 존재 ≠ 사용 가능), `staleDaily`를 `!tideTodayIsCurrent()`로 사실대로 표시한다(기존 wrong-date 경로에서는 항상 true라 동작 무변경, daily가 정상인 새 경로에서만 거짓 '갱신 지연' 경고가 붙지 않는다). ③ `loadTideToday()`의 catch에서 **기존 `loadTideMonth()`를 그대로 재사용**해 한 번만 확인한다(wrong-date 성공 분기가 이미 하던 것과 동일). 새 endpoint·새 retry/timeout·새 badge·새 날짜 정책은 만들지 않았다.
  - 정책: **exact date만** 오늘로 쓴다(전날·다음날·최근접·같은 달 첫 값·stale 사유의 다른 날짜 차용 전부 금지). 정상 daily가 있으면 월간이 더 새로워 보여도 덮어쓰지 않는다. 월간은 `monthTideForSite(site.id)`로 **같은 site만** 보며 `stationCode`/`stationName`/`source`는 기존처럼 월간 site 값을 승계한다. exact-date이면서 stale인 row는 기존 `monthFallbackStale` 의미 그대로 사용·경고하고, stale 정의 자체는 바꾸지 않았다. 월간이 이미 메모리에 있으면 network 재요청 0회이고, 없을 때만 기존 loader가 promise cache(`tideMonth`/`tideMonthPending`)로 1회만 요청한다. 월간 fetch까지 실패하면 기존처럼 미확인으로 끝나며 성공처럼 표시하지 않는다.
  - 검증: 신규 `.github/scripts/test_tide_fallback.mjs` **19개**(index.html 실제 함수 소스 사용). CASE A~L과 §25 모달 선행/비선행 일치, 월 경계 9/30·10/1·12/31·1/1·2/28·윤년 2/29·3/1 7종, 다른 site row 차용 금지, 실제 `tide_month.json` 구조에서 stationCode 일치까지 포함한다. **수정 전 이 중 9개가 실패**(CASE A·C 포함)하고 수정 후 19/19 통과한다. 전체 회귀: 조석 fallback 19(신규)·기상 40·주간 추천 83·조석 생성기 20·Worker 33(총 **195**) 통과, `validate_weather_week.py` 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·siteData 187개 완전 동일·좌표 변경 0. C01 3·H01 6·M01 1·M02 1·물때 6개와 M03/M04·M05 테스트 모두 통과한다. `weeklyBestMudflatTide()`는 `monthTideForSite()`를 직접 읽어 `tideTodayForSite()`를 거치지 않으므로 유부도 700·매향리 850·걸매리 850cm mandatory 경로는 구조적으로 무관하며 회귀 0이다.
  - 실데이터 영향: **0곳**. 오늘(2026-09-10) `tide_today.json`은 date 일치·99곳 전부 유효·사용불가 0·unavailable 0이고, `tide_month.json`은 28곳 전부 오늘 exact row 보유·no-data row 0·daily와 stationCode 불일치 0이다. 실제 187곳에 대해 수정 전후 `tideTodayForSite()` 결과를 비교했을 때 **차이 0곳**(조석 결과가 있는 99곳 포함). 즉 장애·부분 누락 상황에 대비한 가용성 보완이며 현재 장애가 발생 중인 것은 아니다.
  - 변경 파일은 `index.html`·`.github/scripts/test_tide_fallback.mjs`(신규)·`HANDOVER.md`뿐이다. `tide_station_mapping.json`·관측소 코드·좌표·대표 관측소 선택·`update_tide.py`·`update_tide_month.py`·KHOA 로직·timeout/retry·`tide_today.json`·`tide_month.json`·`weather_rules.json`·siteData·notices는 **무변경**이다. 조석 관측소 대표성 검토 항목(외해 기준 내부 갯벌 등)은 M06로 해결된 것이 **아니며** 그대로 남아 있다. M07 및 L01~L06 등 이후 항목은 이번 범위가 아니며 해결하지 않았다.
  - 이번 M06 작업에서는 확인만 하고 고치지 않았던 `MONTH_TIDE_SITE_IDS`의 ID 188 누락은 **아래 별도 항목에서 후속 수정했다**(M06 로직 자체는 그때도 지금도 무관하다).

- today 파고 신선도 검증을 weekly 정책으로 통일(M05, 2026-09-09, 시작·기준 main `61d5d9e`): **root cause** — `build_site_result()`가 파고 sample을 `nearest_index()`로 고른 뒤 **같은 KST 날짜인지와 음수인지만** 검사하고, 평가시각과 파고 sample 사이의 시간 간격은 전혀 보지 않았다. 그래서 부분·절단 응답으로 같은 날 06:00 파고 하나만 들어오면 18:00 평가가 그 12시간 전 값을 현재값처럼 썼다. weekly(`wave_value_at()`)는 이미 '같은 날짜 + 시계열 간격의 절반 이내'를 검사해 같은 fixture를 거부하고 있었으므로, 두 경로의 정책이 갈려 있던 것이 문제였다.
  - 수정 전 실제 생성기 경로로 CASE A를 재현했다(평가 18:00 KST / 파고 06:00 KST 0.5m, 같은 날짜·12시간 차): today는 `wave='0.5m'`·`score=92`·`grade='★★★★★'`·`scoreEligible=true`·`stale=false`·`missingScoreFields=[]`, 동일 fixture의 weekly는 `waveM=null`·`score=null`·`scoreEligible=false`·`missingScoreFields=['wave']`. Windy gfsWave 모양과 Open-Meteo marine(`open_meteo_wave()`) 응답 양쪽에서 똑같이 재현됐다.
  - 최소 수정은 today의 인라인 검사 3줄을 지우고 **weekly가 이미 쓰는 `wave_value_at(wave, target)`을 그대로 호출**한 것이다(`update_weather.py` 실질 변경 2줄 + 주석 1줄). 새 허용시간 threshold를 만들지 않았고 `wave_value_at()` 본문·`build_week_days()`·weekly 매칭 정책은 **변경 0줄**이다(docstring에 today와 공유한다는 설명만 추가). today가 보는 시계열도 기존 그대로라서(Windy는 gfsWave 시계열, Open-Meteo는 `current` 값) 유효한 가까운 파고는 예전과 동일하게 쓰인다. `waveForecastTime`은 종전처럼 가장 가까운 sample 시각을 그대로 남겨 부분 응답 진단이 가능하다. API 호출은 추가·변경 0건이고 `score_weather`·`weather_rules.json`·`siteData`·좌표·조석·추천 계절정책·`index.html`은 손대지 않았다.
  - C01 연계: `index.html`의 `weeklyRecommendationIsSafe()`가 `entry.today.wave`를 `todayWeatherCautionNote()`에 넘기므로, 오래된 0.5m가 today에 남으면 선상 안전판정에 '안전한 파고'로 들어갈 수 있었다. 이제 timestamp가 무효면 생성 단계에서 `wave=null`이 되어 그 경로가 막힌다. weekly의 `safetyRaw`(선상 9곳) 생성 로직은 무변경이다.
  - 검증: 신규 `TodayWaveFreshnessTests` 11개(정확 일치·허용범위 안·경계 1.5시간 채택·경계 초과 1분 거부·같은 날짜 12시간 차 거부·날짜 경계·복수 sample 중 최근접·최근접이 무효면 결측·`showWave`/`island`/`pelagic` 필수 3종·비파고 지역 무영향·Open-Meteo marine 동일 정책·Windy 시계열 16시간 구간 전수에서 today와 weekly 판정 불일치 0). **수정 전 코드에서 이 테스트들은 47건 실패하고 수정 후 전부 통과**한다. 전체 회귀: 기상 40(기존 29+11)·주간 추천 83·조석 20·Worker 33(총 176) 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·중복 ID 0·siteData/좌표 완전 동일. C01·H01·M01~M04 테스트 모두 그대로 통과한다.
  - 실데이터 영향: 현재 `weather_today.json` 187곳 중 파고가 표시된 66곳 전부가 새 정책에서도 동일하게 유지되고 **빠지는 곳은 0곳**이다(파고 시각과 생성 시각이 같은 날짜·1.5시간 이내). 즉 상시 발현하던 결함이 아니라 부분·절단 응답에 대비한 방어 로직 보완이다. `weather-proxy/`에는 파고 관련 코드가 없어 이중 관리 대상이 아니다.
  - 변경 파일은 `.github/scripts/update_weather.py`·`.github/scripts/test_weather.py`·`HANDOVER.md`뿐이다. M06 이후 Ultra 항목은 이번 범위가 아니며 해결하지 않았다.

- Open-Meteo 시정·운량 단위 정규화(M03·M04, 2026-09-08, 시작·기준 main `19491a9`): **M03 root cause** — `extract_atmospheric_sample()`이 시정을 `value/1000 if value>100 else value`로 *값 크기를 보고 단위를 추정*했다. Open-Meteo `visibility`는 미터(요청에 `visibility_unit`이 없어 API 기본값 m, 저장소 fixture도 20000→20km)인데 100m 이하 raw가 그대로 km로 남아 **50m가 50km(아주 좋은 시정)로 해석**됐다. **M04 root cause** — `normalized_cloud()`가 `cloud*100 if cloud<=1.5 else cloud`로 fraction을 추정해, 퍼센트로 오는 Open-Meteo `cloud_cover=1`(1%)이 **100%(완전 흐림)로 부풀었다**. 두 문제 모두 수정 전 실제 생성기 경로로 재현했다.
  - 수정은 source별 단위 표시다. Open-Meteo 시계열을 만드는 곳(`open_meteo_atmospheric()`, `open_meteo_week_atmospheric()`)에 `visibilityUnit="m"`·`cloudUnit="percent"`를 싣고, Windy 대기에 Open-Meteo 시정만 얹는 두 혼합 경로(`apply_hourly_visibility()`, `process_site()`의 시정 component fallback)에는 `visibilityUnit="m"`만 싣는다. `normalized_visibility_km()`은 `unit=="m"`이면 정확히 한 번 1000으로 나누고, `normalized_cloud(..., unit="percent")`는 값을 그대로 쓴다. **단위를 알리지 않는 Windy 계열 값의 기존 추정은 그대로 유지**한다(회귀 테스트로 고정: Windy 20000→20km, 500→0.5km, 50→50km, cloud 1.0→100%, 0.8→80%).
  - `weather_rules.json`·`score_weather()` 공식·임계값·cap은 변경하지 않았다. 입력 단위만 바로잡아 기존 시정 감점(`visibilityMinKm`)과 운량 감점(`cloudMaxPct`)이 정상 작동한다. today(`build_site_result`)와 week(`build_week_days`)가 같은 `extract_atmospheric_sample()`을 쓰므로 두 경로의 단위가 항상 일치하며, `fieldSources`/`fallbackSource` 의미는 무변경이다.
  - 신규 테스트 5개: Open-Meteo 시정 경계(0/50/100/500/1000/5000/10000/20000m → 0/0.05/0.1/0.5/1/5/10/20km, null·NaN·Infinity는 기존 결측 정책대로 None), Open-Meteo 운량(0/0.5/1/10/50/99/100 → 그대로, **1→100 금지**), Windy 무변경 회귀, 상류 응답→`process_site()`→today·weekly sample→JSON 직렬화→score까지 잇는 통합테스트(시정 100m→0.1km·운량 1→1%·저시정 감점 확인), 혼합 source(Windy 대기 + Open-Meteo 시정) 테스트.
  - 실데이터 현황(생성 JSON은 이번 commit에서 손대지 않음): 현재 저장본은 187곳 모두 `atmosphere=open_meteo·visibility=open_meteo`다. 시정은 저장 week 10,472 sample 중 **2,797건(159곳)**, today **13곳**이 Open-Meteo 실측 상한(약 24km)을 넘는 값(최대 100km·44.6km)이라 100m 이하 raw의 오해석으로 보이며, 같은 upstream을 새 generator로 처리하면 이 sample들의 점수가 평균 18.1점(최대 22점) 낮아진다(저장값이 반올림돼 있어 추정치). 운량은 저장값만으로 raw 1%와 실제 100%를 구분할 수 없어 정확한 건수는 알 수 없고, `cloudPct=100`인 1,779건 중 앞뒤 sample이 모두 5% 이하인 **66건(59곳)**이 raw 1%의 확대로 추정된다(교정 시 평균 +2.5점). 저장 JSON을 바꾸지 않았으므로 현재 추천 결과는 수정 전후 동일하며(봄·가을·겨울 실데이터 비교 동일), 실제 값 교정은 다음 Actions 생성분부터 반영된다.
  - validator에는 이번에 range guard를 넣지 않았다. 시정 범위 guard는 아직 교정 전인 현재 `weather_week.json`에서 실패하고, 운량 0~100 guard는 M04(1→100)를 잡지 못하기 때문이다(L03 일반 강화는 이번 범위 아님).
  - 검증: 기상 29(기존 24+5)·주간 추천 83·조석 20·Worker 33(총 165) 통과, validator 2종 통과, inline JS 3개 정상, runtime/Worker 187/187·불일치 0·중복 ID 0·siteData/좌표 완전 동일. C01 전용 3개(safetyRaw 생성 로직 diff 0줄)·H01 전용 6개·M01/M02 전용 2개 통과. 변경 파일은 `.github/scripts/update_weather.py`·`.github/scripts/test_weather.py`·`HANDOVER.md`뿐이고 `index.html`은 건드리지 않았다. M05~M07 등 다른 Ultra 항목은 이번 범위가 아니며 해결하지 않았다.

- 추천 fallback 적격성 일관화(M01·M02, 2026-09-08, 시작·기준 main `00e9d17`): **M01 root cause** — `weeklyRecommendationForSite()`가 '주간 자료는 있는데 그 계절 정책의 유효 sample이 0'인 상태를 봄·여름에서만 차단해, 가을·겨울에서는 활성 공지(또는 물때·동풍 mandatory)가 있으면 `today=null·score=null·isMandatory=true·근거 '탐조 이슈 기준'` 후보가 만들어져 최종 Top10에 복귀했다. **M02 root cause** — `weeklyWeatherEntryForSite()`의 today fallback이 원본 `scoreEligible`을 보지 않고 내부 `_weatherState.scoreEligible`을 항상 `true`로 만들었고, 명시적 부적격 차단도 봄·여름에만 있어 가을·겨울에서는 `scoreEligible=false`인 99점 저장 기상이 공지 없이도 추천됐다(두 문제 모두 수정 전 실제 함수 경로로 재현 확인).
  - 수정은 `index.html` 3줄이다. ① `if((pelagic||weeklyWeekSite(site))&&!bestWeather)return null;` — 주간 자료가 있는 탐조지는 유효 sample 0이면 공지·물때·동풍으로 되살리지 않는다(계절 무관). ② `if(weatherEntry&&weatherEntry.weather.scoreEligible===false)return null;` — 원본이 명시적 부적격이면 계절·공지·mandatory·core·점수와 무관하게 hard reject. ③ today fallback의 `_weatherState.scoreEligible`을 `raw.scoreEligible!==false`로 두어 기존 `storedWeatherState()`와 같은 의미로 원본을 보존한다.
  - **tri-state 보존**: `false`=hard reject, `true`=기존 정상, `missing`/`null`=기존 unknown 의미 그대로(자동 탈락도, 자동 승격도 없음). `!!value` 같은 boolean 강제 변환은 쓰지 않았다. 주간·오늘 자료가 모두 없는 **공지 전용 unknown fallback은 기존 정책 그대로 유지**한다(근거 '탐조 이슈 기준' 후보 유지).
  - 8가지 fallback 상황을 수정 전후로 비교해 바뀐 것은 **'week 존재 + 유효 sample 0 + 공지'(M01)와 'today.scoreEligible=false'(M02) 두 경우뿐**이며, week 유효 sample 있음·week site 없음+today·week 없음+today·공지 전용 fallback·`scoreEligible=true`·미확인(없음/null)은 전부 동일하다. mandatory 수치(유부도 700·매향리 850·걸매리 850·9월 동풍·겨울 core), notice 정책, `weeklyRecommendationIsSafe()`의 false/null 의미, score_weather는 변경하지 않았다.
  - 검증: 신규 테스트 2개(가을·겨울 M01 8종 변형 + 물때 mandatory 우회 금지, 가을·겨울 M02 explicit false/true/missing/null + 공지·mandatory·core 조합 + 공지 전용 fallback 유지) 추가. 주간 추천 83·기상 24·조석 20·Worker 33(총 160) 통과, validator 2종 통과, inline JS 3개 정상, runtime/Worker 187/187·불일치 0·중복 ID 0·siteData/좌표 완전 동일. C01 전용 3개·H01 전용 6개 통과하고 `safetyRaw`는 선상 9곳에 그대로 있으며 `update_weather.py`는 무변경이다. 실데이터 회귀는 봄·여름·가을·겨울 주간과 경계 주간 2종 모두 수정 전후 추천 10곳이 완전 동일했다. **현재 실데이터에서 M01/M02 발현 건수는 0**(유효 sample 0인 주간 site 0곳, `dataUnavailable` 0곳, `scoreEligible=false`인 저장 기상 0곳, week에 없는 today site 0곳)이며 API 장애·부분 결측 시에 대비한 수정이다. 변경 파일은 `index.html`·`.github/scripts/test_weekly_recommendation.mjs`·`HANDOVER.md`뿐이고 M03~M07 등 다른 Ultra 항목은 이번 범위가 아니며 해결하지 않았다.

- 추천 계절 정책을 추천 날짜 기준으로 적용(H01, 2026-09-08, 시작·기준 main `b566149`): root cause는 `weeklyRecommendationForSite()`가 화면을 연 **현재 KST 월**로 계절·환경·선상 정책을 먼저 정한 뒤 rolling 7일 sample을 고른 것이다. 그래서 5/31에 열면 6/1 sample까지 봄 정책으로, 10/31에 열면 11/1 sample까지 가을 정책으로 판정됐다(수정 전 재현: 3/1 제주 남방62가 겨울 선상으로 통과, 11/1 주문진항53이 가을 선상으로 통과, 9/1 천수만 간월호15가 8월 농경지 제외로 탈락, 어청도1은 여름 부적격인 6/1 100점이 선택돼 유효한 5/31 90점까지 사라짐).
  - 수정: `weeklySeasonForDate()`/`weeklyDatePolicy()`/`weeklySeasonalBestWeatherDay()`를 추가해 **날짜별로 계절 정책을 먼저 적용**하고, 그 날짜의 환경·제외·allowlist·선상 안전필터를 통과한 sample만 기존 daily/weekly 최고점 비교에 넣는다. 다음 계절에서 부적격인 고득점 sample 때문에 site 전체가 탈락하지 않고, 반대로 다음 계절에서만 유효한 후보도 현재 계절 exclusion으로 사라지지 않는다. 계절 범위(봄 3~5·여름 6~8·가을 9~10·겨울 11~2)와 각 계절의 정책 내용·비율·ID·임계값은 전혀 바꾸지 않았고, `autumnRecommendationSeason`·`weeklyPelagicRecommendationSeason`·`todayIsAutumnRemoteIsland`·`todaySpringIslandReason`에는 기존 계절 함수와 같은 방식으로 month 인자만 추가했다(인자 없으면 종전대로 오늘 기준).
  - 사유·mandatory도 추천 날짜 기준이다. 물때 mandatory는 가을 정책일 때만, 9월 동풍은 가을·비선상일 때만 붙인다(두 규칙의 내부 9·10월 조건과 수치는 무변경이라 계절 내부 동작은 동일하다). 봄 도서 사유와 `todaySpringIslandReason`도 추천 날짜의 월을 쓴다. 카드의 축 라벨과 겨울 '해안·항구 육상탐조' 표기는 `entry.season`을 따르도록 `weeklyAxisLabel()`/`weeklyEntrySeason()`으로 정리했다.
  - **혼합 계절 주간 quota는 새 정책을 만들지 않았다.** 화면의 계절(오늘 기준) soft target은 그 계절 날짜의 후보에만 배정하고, 다른 계절 날짜의 후보는 기존 fill 단계에서만 채운다(`weeklySeasonQuotaEntries()`). 비율 합성·비례배분·다음 계절 우선 같은 규칙은 도입하지 않았다. 경계 주간에서 다른 계절 후보를 어떤 비율로 넣을지는 사용자 결정이 필요한 미결 사항이다.
  - 검증: 계절 경계 8곳(2/28→3/1, 윤년 2/29→3/1, 5/31→6/1, 6/30→7/1, 7/31→8/1, 8/31→9/1, 10/31→11/1, 12/31→1/1)과 CASE A~G, 현재계절 유효 90/다음계절 부적격 100 선택 테스트를 신규 6개로 추가했다. 계절 내부 회귀는 실제 187곳 `weather_week.json`을 봄·여름·가을·겨울 주간으로 각각 돌려 수정 전후 추천 10곳의 ID·날짜·시각·점수·축·사유·물때·mandatory가 **완전히 동일**함을 확인했다. C01의 `safetyRaw` 구조와 `weeklyPelagicSafety()`(풍속 ≤6.0·파고 ≤0.7·강수 ==0)는 그대로이며 H01 테스트도 safetyRaw fixture를 사용한다. 주간 추천 81·기상 24·조석 20·Worker 33(총 158) 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·중복 ID 0·siteData와 좌표 완전 동일. `update_weather.py`·`weather_rules.json`·score_weather·조석·notices·자동 생성 JSON은 변경하지 않았다. 변경 파일은 `index.html`, `.github/scripts/test_weekly_recommendation.mjs`, `HANDOVER.md`뿐이다. Ultra 감사의 M01~M07 등 다른 항목은 이번 작업 범위가 아니며 해결하지 않았다.

- 선상 안전판정 원자료 precision 보존(C01, 2026-09-08, 시작·기준 main `6f58e8b`): root cause는 `build_week_days()`가 windSpeed·waveM·precipitation3h를 소수점 한 자리로 반올림해 저장하고 `weeklyPelagicSafety()`가 그 표시용 값을 검사한 것이다. 그래서 원자료 6.01/0.7/0, 6.0/0.71/0, 6.0/0.7/0.01, 6.04/0.74/0.04이 모두 6.0/0.7/0.0으로 저장되어 안전 gate를 통과했다(수정 전 실제 생성기 → 추천 경로에서 재현 확인). 수정은 생성 단계에서 `pelagic=true` 탐조지 sample에만 `safetyRaw`(windSpeed·waveM·precipitation3h 원자료)를 추가하고, `weeklyPelagicSafety()`가 safetyRaw가 있으면 그 원자료로만 판정하도록 한 것이다(없는 기존 저장본은 종전처럼 표시값 사용, safetyRaw 안의 결측·비수치는 fail). 표시·점수용 필드와 UI formatting은 그대로라 화면은 계속 `북풍 6.0m/s`·`0.7m`·`강수 없음`으로 보인다. 사용자 확정 안전기준은 불변이며(평균풍속 ≤6.0, 파고 ≤0.7, 3시간 강수 ==0) epsilon 완화나 임계값 변경은 없다. `validate_weather_week.py`에는 safetyRaw가 있을 때 표시값과 같은 측정인지(round(raw,1) 일치) 확인하는 검사만 추가했다.
  - 신규 통합테스트: `.github/scripts/pelagic_safety_fixture.py`가 실제 `build_week_days()`·`week_json_text()`로 대진항 ID48 주간 문서를 만들고, `test_weekly_recommendation.mjs`가 그 텍스트를 그대로 JSON.parse 해 `weeklyPelagicSafety()` → `weeklyRecommendationForSite()` → `todayRecommendedSites()`까지 확인한다. 6.01/0.7/0·6.0/0.71/0·6.0/0.7/0.01·6.04/0.74/0.04은 최종 추천에서 제외되고 6.0/0.7/0만 추천된다. precision 경계(풍속 5.999·6.0 통과, 6.000001 실패 / 파고 0.699·0.7 통과, 0.700001 실패 / 강수 0 통과, 0.000001 실패)와 봄 5월·여름 6월 대진항·가을 9월·겨울 12월 선상 회귀도 같은 생성 경로로 확인했다. 계절 allowlist와 축 비율은 변경하지 않았다.
  - 회귀 검증: 동일 합성 상류 입력으로 187곳 10,472 sample을 수정 전후 비교해 score를 포함한 기존 필드 차이 0, safetyRaw는 선상 9곳 504 sample에만 추가(파일 증가 약 0.9% 예상). 주간 추천 75·기상 24·조석 20·Worker 33(총 152, 기존 147+5) 통과, weather_today·weather_week validator 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·중복 ID 0·siteData와 좌표 완전 동일. weather_rules·score_weather 수식·조석·notices·자동 생성 JSON은 변경하지 않았다. 변경 파일은 `index.html`, `.github/scripts/update_weather.py`, `.github/scripts/validate_weather_week.py`, `.github/scripts/test_weather.py`, `.github/scripts/test_weekly_recommendation.mjs`, 신규 `.github/scripts/pelagic_safety_fixture.py`, `HANDOVER.md`뿐이다. Ultra 감사의 다른 항목은 이번 작업 범위가 아니며 해결하지 않았다.

- 여름 추천 엔진(2026-09-08, local 시작 `1103e02190ce175e14ee16c31b95edc34b57511e`, 최신 main `d9cd2a943787707566413b9ace4adc259a690431` fast-forward 후 구현): `weeklySummerRecommendationSeason()`으로 KST 6·7·8월의 추천만 분기한다. 전역 계절/지도 필터는 그대로다. 6월 forest3/water3/coast2/other1/대진항 선상 최대1, 7~8월 forest3/water3/coast2/other2 soft target. 부족분은 허용된 육상 축만 기존 score → 가까운 날짜 → stableOrder → ID 순서로 보충한다. 전역 ID dedupe·최대10·복합 환경 1카드, 선상0 허용. 고정 forest core나 점수 보너스는 없다.
  - 환경: 실제 env를 ·/쉼표/구분자/공백으로 분리한다. 농경지/간척지/목초지/초지는 다른 환경과 복합이어도 먼저 제외한다. 이어서 island=true 또는 도서/섬/해양도서 token을 제외한다. 지명의 '도'·'산'·'릉'이나 weatherRuleKey로 추정하지 않는다. 봄 핵심 6개 도서의 19개 ID도 모두 여름 제외하며 지도와 다른 계절 원본은 보존한다.
  - forest: 산림/고산/도심산림/숲/휴양림/수목원/곶자왈 실제 token. 월악산77·소백산78·오대산 월정사79·설악산80·지리산81·태백산82·북한산85·광릉숲86 포함 확인. water: 습지/습지생태공원/하천/강/강변/호수/저수지/간척호/석호/유수지 및 갈대습지/내륙습지/하천습지/연안습지/습지공원/도심하천/한강변 직접 token. 공원 단독은 water가 아니고, 용현유수지139의 '공원 유수지'는 유수지로 water. coast: 해안/갯벌/해변/하구/항구. 주요 세 축은 사용자가 지정한 여름 환경 정책을 근거로 하며 별도 seasons 필터를 추가하지 않는다. 가을 조석 700/850/850cm는 여름 적용하지 않는다.
  - other: 실제 env='릉'인 파주삼릉109 허용, '여름 릉·수림 탐조' 표시. 현재 왕릉 token과 파주 장릉 등록은 없으므로 가상 token/장소를 추가하지 않았다. 나머지는 forest/water/coast 밖에서 실제 환경과 seasons/seasonTags/bestSeason의 명시적 '여름' token이 있어야 한다. 현 runtime은 공원6곳(136 대왕암공원,143 강서습지생태공원,144 송도,147 맥도생태공원,148 태종대,151 관곡지)만 해당한다. 모든 공원/사찰/유적지를 일괄 포함하지 않는다.
  - 선상: runtime48 대진항 pelagic=true 확인. 여름 선상은 현재월6월 + 실제 추천 sample 날짜6월에만 허용한다. 6/30 rolling week에 들어온 7월 고득점 sample도 제외한다. 7~8월 선상0, 나머지 pelagic 장소는 여름 후보에서 제외한다(주문진항53·어달항54·후포항55도 이번 여름 요청에는 육상 항구로 재해석하지 않음; 겨울의 육상 항구 예외는 그대로). 기존 weeklyPelagicSafety 평균풍속<=6.0m/s·파고<=0.7m·3시간 강수0mm, 필수값 비수치/결측/음수 탈락과 scoreEligible·daylight·오늘 과거시각 제외를 그대로 쓴다. 돌풍/시정 참고표시, '6월 슴새 선상탐조 시기로 주목' 및 선사 출항 공지 확인 문구 유지. 출현·출항을 확정하지 않는다.
  - 대표 날짜/시간: 기존 dailyBest 최고점 → 오전 우선 → 이른 시각, weeklyBest 최고점 → 가까운 날짜를 재사용한다. 기존 caution false는 선발 전 제외하고, null(기상 미확인) today fallback은 기존 의미를 유지한다. 주간 자료가 있으나 유효 sample이 없거나 today scoreEligible=false이면 공지로 승격하지 않는다. 공지 정보와 연결 기능은 보존한다.
  - 실데이터 분류(기상 선발 전, 복합 축은 중복 집계): forest16/water56/coast44/other7(릉1 포함)/6월pelagic1. 고유 허용6월107, 7·8월106. 원시 field token26, 실제 island=true43, island flag 또는 섬 token46, field∩island1(112 알뜨르비행장). 중복 없는 제외 우선순위 집계는 field26/island45/pelagic7/unclassified2=80(6월), 7~8월 pelagic8로 제외81. 26+46을 단순 합산하지 말 것.
  - unresolved: 현등사113(env 사찰), 연천 숭의전187(env 유적지)은 여름 계절 근거가 없어 미분류 제외. 농경지 복합22곳도 정책 확정 없이는 수계/해안으로 재포함하지 않는다: 7교동도(간척지·갯벌),8석모도(간척지·갯벌),10강화도(갯벌·농경지),15천수만 간월호(간척호·농경지),20새만금(간척지·갯벌),21동진강 만경강(하구·간척지),23고천암철새도래지(간척호·농경지),28주남저수지(저수지·농경지),30화포천습지(하천습지·농경지),37공릉천(하구·농경지),38임진강 연천(하천·농경지),39한탄강두루미탐조대(농경지·하천),40석탄리철새조망지(농경지·하천),93구미 강정습지(하천습지·농경지),112알뜨르비행장(농경지·관광지),162남양주 물의정원·북한강변(강변 습지·농경지),168곡교천 은행나무길·현충사 일대(하천·농경지),173원주 흥양천·섬강 합류부(하천·농경지),176금호강 하중도(강변 초지·습지),179승촌보공원(하천·보·농경지),185사천 광포만(갯벌·하구·농경지),186갑천 불무교(내륙 하천·자갈톱·농경지). 그 외 unknown 환경을 임의로 여름 생태 근거로 해석하지 말 것.
  - 검증: 주간72(기존61+여름11)·기상22·조석20·Worker33 총147개 및 두 weather validator 통과. inline JS 문법/diff check 정상. 기준 main과 가을 실제 예보·봄/겨울 합성 fixture의 추천 entry 전체가 완전히 동일하다. runtime/Worker187/187·ID 중복0·좌표/이름/pelagic/env 불일치0, siteData187개 전체 비교 동일. 변경 파일은 index.html·.github/scripts/test_weekly_recommendation.mjs·HANDOVER.md뿐이며 weather_rules/점수/좌표/생성JSON/updater/Worker/Actions/엑셀은 무변경.
  - 화면 검증은 2027-06/07/08-10 테스트 clock과 메모리 내 합성 예보로 수행하며 실제 9월 JSON을 덮어쓰지 않았다. 각 월 PC1366x768/모바일390x844 추천10·가로/카드 넘침0, 6월 대진항1 및 출항 확인 문구, 7·8월 선상0, 파주삼릉 릉 표시 확인. 6월 파주삼릉 실제 지도 popup·패널 재열기·공지 내용 연결 정상, console error/warn0. 임시 진단 파일/서버 코드는 repository에 남기지 않는다.

분류 재현: PowerShell `$env:SUMMER_REPORT='1'; node --test --test-name-pattern='여름 실제 환경 전수' .github/scripts/test_weekly_recommendation.mjs`.


- 봄 추천 엔진(2026-09-08, local 시작 `9d55a96`, 자동 기상1개 반영 후 구현 기준 `d37895f`): 추천 전용 `weeklySpringRecommendationSeason()`으로 3~5월 적용. 도서4/갯벌·하구3/선상최대1/기타2 soft target, 부족분은 봄 후보군에서 점수순 보충, 전역 site ID dedupe. 도서축은 score 우선 → 핵심 도서 동점 우선 → 날짜 → 기존 순서 → ID. 걸매리는 실제 추천 sample 날짜 5/1~10에 갯벌축의 일반 후보보다 먼저 평가하며 score는 그대로. 전역 계절/score_weather/weather_rules/가을·겨울 정책은 무변경.
  - 핵심 도서6개 정확 이름은 runtime19개 ID: 어청도1·101·102·103 / 외연도2·104·105·106 / 백령도4·117·118·119 / 흑산도63·127·128·129·130 / 홍도64 / 가거도65. 모두 원본 island=true,pelagic=false,seasons=[봄,가을], 이동성 조류/섬탐조 feature 확인. 이름 유사 장소를 확대하지 않았으며 ID별 후보를 보장하되 최종 고정 포함/점수 보너스 없음. 현재 원본에 같은 이름의 여러 ID가 있어 이름 기준 통합은 하지 않는다(사용자 지정 ID dedupe).
  - 분류는 env 정확 token + 실제 seasons/seasonTags/bestSeason(봄 또는 연중) + birdingFeature만 사용하고 weatherRuleKey를 환경으로 쓰지 않는다. core 또는 도서·섬·해양도서 token, island=true이면서 이동성/섬탐조 feature는 island. 갯벌·하구는 mudflat. 농경지·간척지·목초지·초지·습지/호수/저수지/간척호 및 직접 대응 token·하천/강/강변은 other, 산림/공원/해안 등은 봄 계절 근거와 이동성/통과 feature가 함께 있을 때만 other. 복합환경 보존. 겨울 섬 제외와 가을 원거리 섬 제외를 봄에 적용하지 않는다.
  - 도서 유입조건은 카드에 표시할 sample T의 KST timestamp를 기준으로 [T-24h,T) 안에 유한한 숫자 강수>0 sample이 있는지 확인하고, T의 풍향이 W/NW/서풍/북서풍이면 사유를 추가한다. 정확히24h는 포함,24h 초과·T 자신·미래 강수·결측/비수치·다른 방향은 제외. 야간/오늘 과거 강수는 근거로 읽되 추천 시간은 기존 daylight/오늘 과거시간 제외/dailyBest/weeklyBest를 사용한다. windName이 없고 degree가 있으면 기존 update_weather.wind_name/Worker.windDirectionName의8방위 체계로 동일 판정(Worker와 경계 대조 테스트). 새 풍속 임계값 없음. '봄 도서 이동기', '비 뒤 서풍·북서풍 전환으로 이동성 조류 유입 가능성에 주목'만 표시하며 점수 가산/출현 단정 없음. week에 이전24h 자료가 없으면 강수를 추정하지 않아 false이며, 이전 풍향과의 변화량을 별도 조건으로 추가하지 않는다(사용자가 정한 선행 강수+현재W/NW 정의).
  - 유부도19는 봄 추천 layer에서만 제외, 지도/원본/가을·겨울 유지. 걸매리14(env 갯벌·간척호)는 실제 추천일 5/1~10에 '5월 초 긴부리흑꼬리도요 이동 시기로 최우선 검토'를 표시한다(사용자 현장 관찰 기준). 4/30·5/11에는 특별 우선 없음. 현재가5/10이어도 최고점 추천일이5/11이면 우선 없음. 가을의 유부도700·매향리850·걸매리850cm mandatory를 봄에 복사하지 않는다. caution false 후보 제외는 기존 함수 재사용. 봄 weekSite가 있는데 유효sample0이면 공지로 승격하지 않으며, today fallback은 기존 null 안전 의미를 유지하되 scoreEligible=false는 제외한다. 걸매리 특별 우선은 실제 dayBest가 있어야 한다.
  - 선상은 기존4~5월만(3월0), pelagic=true/독도제외, 기존 weeklyPelagicSafety wind<=6.0·wave<=0.7·3시간강수0 및 결측탈락 그대로. caution도 통과해야 함. 선사 확인 문구 유지. 도서 유입/걸매리/선상 어느 경로도 점수 가산 없음.
  - 실분류(기상 선발 전, 복합축 중복): island45/mudflat41/pelagic8/other99, 고유162. 3월에는 선상8을 제외하여 고유154. 제외25는 유부도·독도2, 봄 계절 근거 없음3(태화강56·송도144·이천항188), 보수적 환경/이동성 분류 미충족20. 실제9월 예보를 봄으로 해석하지 않았으며 2027-05-05 합성 fixture와 고정clock으로 검증했다.
  - 검증: 주간61·기상22·조석20·Worker33 총136개 테스트 및2종 validator 통과. 24h/25h/미래/결측/W·NW/degree경계/표시시각일치/caution, 걸매리5/1~10·60점우선·부적격/결측탈락·가을물때미적용, 3월선상제외,4/3/1/2·부족보충·중복0 회귀 통과. 현재9월 추천entry와 겨울fixture entry 전체가 `d37895f`와 동일. runtime/Worker187/187·mismatch/duplicate0·siteData 전체동일·좌표변경0·inline JS/diff check 정상. 합성 봄 PC1366x768/모바일390x844 카드10·가로/카드 넘침0·도서 보수적 사유·걸매리60점표시·선상안내 정상, notice연계/재열기/걸매리 지도popup 정상·console error/warn0.
  - 완료 직전 자동 기상 `8a54fd8`(15:00 생성)이 추가되어 봄 커밋을 rebase하고 전체136개/두 validator를 재검증했다. 기존 실데이터 테스트의 청림운동장 동풍 상시충족 가정이 새 예보에서 깨져 실제 동풍 판정과 사유가 일치하는지 검사하도록 보정했다. 동풍 경계/지역/월/caution 합성 테스트는 유지했다.
  - 변경 파일: index.html·.github/scripts/test_weekly_recommendation.mjs·HANDOVER.md. siteData/좌표/weather_rules/score/생성JSON/updater/Worker/Actions/Excel 무변경.

봄 핵심 도서의 실제 등록 정보:

|ID|이름|env|island/pelagic|seasons|birdingFeature|
|---|---|---|---|---|---|
|1|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|2|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|4|백령도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|63|흑산도|서남해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|64|홍도|서남해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|65|가거도|서남해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|101|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|102|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|103|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|104|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|105|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|106|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|117|백령도|습지생태공원|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|118|백령도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|119|백령도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|127|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|128|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|129|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|130|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|

보류/제외 근거(명시 제외인 유부도·독도 외23곳; 아래 환경을 다른 축으로 임의 확장하지 않음):

|ID|이름|env|근거|
|---|---|---|---|
|47|아야진해변|해변|허용 환경/이동성 근거 미충족|
|49|호미곶|해안|허용 환경/이동성 근거 미충족|
|56|태화강|하구·도심하천|봄 계절 근거 없음|
|77|월악산|산림|허용 환경/이동성 근거 미충족|
|78|소백산|산림·고산|허용 환경/이동성 근거 미충족|
|79|오대산 월정사|산림|허용 환경/이동성 근거 미충족|
|80|설악산|산림·고산|허용 환경/이동성 근거 미충족|
|81|지리산|산림·고산|허용 환경/이동성 근거 미충족|
|82|태백산|산림·고산|허용 환경/이동성 근거 미충족|
|83|덕유산|산림·고산|허용 환경/이동성 근거 미충족|
|84|치악산|산림|허용 환경/이동성 근거 미충족|
|85|북한산|도심산림|허용 환경/이동성 근거 미충족|
|86|광릉숲|산림|허용 환경/이동성 근거 미충족|
|97|여수 돌산 향일암 해안|해안|허용 환경/이동성 근거 미충족|
|109|파주삼릉|릉|허용 환경/이동성 근거 미충족|
|113|현등사|사찰|허용 환경/이동성 근거 미충족|
|143|강서습지생태공원|공원|허용 환경/이동성 근거 미충족|
|144|송도|공원|봄 계절 근거 없음|
|154|매봉산 바람의 언덕|산림·고산|허용 환경/이동성 근거 미충족|
|187|연천 숭의전|유적지|허용 환경/이동성 근거 미충족|
|188|이천항|항구·해안|봄 계절 근거 없음|
|189|도구해수욕장|해안·외해|허용 환경/이동성 근거 미충족|
|190|임곡항|해안·외해|허용 환경/이동성 근거 미충족|

분류 재현: PowerShell `$env:SPRING_REPORT='1'; node --test --test-name-pattern='봄 실제 환경 분류' .github/scripts/test_weekly_recommendation.mjs`. 동일 이름의 복수ID는 원본 그대로이므로 이름중복과 ID중복을 혼동하지 말 것.

- 겨울 추천 엔진(2026-09-08, local 시작 `945a89c`, 자동 갱신3개를 반영한 구현 기준 `0cfeffc`): 추천 전용 `weeklyWinterRecommendationSeason()`을 11·12·1·2월에 적용한다. 전역 계절 표시는 무변경, 9~10월 가을 경로와 기존 4·5·9·10월 선상 함수 정의도 그대로다. 겨울은 들판3/습지·호수·저수지·간척호3/해안·갯벌·항구3/선상최대1 soft target, 부족분은 같은 겨울 후보군의 점수순 보충, 전역 ID dedupe, 안전한 선상 sample이 없으면 선상0. 점수 desc → 겨울 core → 가까운 날짜 → 기존 순서 → ID이며 점수 가산·강제 최종 포함 없음. 선발 전 기존 `weeklyRecommendationIsSafe()` false만 제외하고 null fallback 의미는 유지한다. 날짜/시간은 기존 daylight·scoreEligible·오늘 과거시각 제외·daily/weeklyBest 재사용.
  - 핵심 들판: ID39 한탄강두루미탐조대(농경지·하천), 15 천수만 간월호(간척호·농경지), 10 강화도(갯벌·농경지), 7 교동도(간척지·갯벌), 20 새만금(간척지·갯벌). ID39는 git `b46ce3f^`의 철원평야가 `b46ce3f`에서 현 명칭으로 바뀐 이력을 확인했다. 경안천 습지생태공원은 runtime31 경안천(습지생태공원·하천)으로 water에 포함. 천수만은 field를 먼저 선발하며 water 복합속성 보존.
  - 환경: `env`를 ·/쉼표/구분자/공백의 정확 token으로 나눈다. 농경지·간척지·목초지·초지는 field, 습지·호수·저수지·간척호 및 직접 대응 습지 token/석호는 water, 해안·갯벌·항구·해변·하구는 coast. 도서/섬 token 또는 실제 island=true는 일반 후보에서 제외하고, 산·산림·숲·고산·도심산림·휴양림·수목원·곶자왈도 제외한다. 지명의 '도'나 '산'으로 판단하지 않는다. 교동도7/강화도10/유부도19와 사용자가 coast로 명시한 동검도9는 섬 제외 예외. 연근해/육상 coast token 없는 외해·선상은 일반 제외하되 pelagic 허용5곳은 별도 평가. `항구·외해`는 육상 항구로 평가하며 원본 pelagic 값은 바꾸지 않는다.
  - 명시 제외: runtime23 고천암철새도래지,30 화포천습지,68 증도 지도갯벌(전남 신안)을 정확 ID로 제외. 대저생태공원/해평습지/담양습지/영광 불갑저수지/태평염전/백수해안도로/봉암갯벌 7곳은 현재187곳에 없고 정확 이름 Set으로만 기록했다. 담양 죽녹원178·구미 강정습지93 등 비슷한 장소를 대체 제외하지 않는다. 신규 장소나 좌표는 생성하지 않았다.
  - 겨울 선상 허용: 대진항48,제주 남방62,강사리 선상탐조191,장생포 고래선상탐조192,울산 앞바다 선상74(모두 원본 pelagic=true). 주문진항53·어달항54·후포항55(원본 pelagic=true)는 겨울 선상 제외하되 실제 항구 token으로 coast 허용, 카드에 '해안·항구 육상탐조' 표시. 독도52(pelagic=true)는 전체 제외 유지. 기존 `weeklyPelagicSafety` 평균풍속<=6.0m/s·파고<=0.7m·3시간 강수0mm 및 결측/비수치 탈락 그대로, 돌풍/시정은 참고정보. 기존 caution도 통과해야 하며 '선상탐조 추천 조건 충족'·선사 확인 안내 유지.
  - 실데이터 분류(기상 선발 전, 복합 축 중복 집계): field23/water39/coast54/pelagic5, 고유 허용100곳. 제외87곳은 명시3/독도1/섬44/산림16/일반해양0/허용축 미분류23으로 중복 없이 집계. 현재 연근해 단독 token은 없으며 해양 후보는 허용 선상·육상 항구·독도로 처리된다. 9월 실제 예보를 겨울 예보로 바꾸지 않았다. 겨울은 2026-12-10 합성 fixture와 테스트 clock으로 검증. 실제 9월 추천 entry 전체는 `0cfeffc`와 동일했다.
  - 검증: 주간50·기상22·조석20·Worker33 총125개 테스트 및 weather/weekly validator 통과. runtime/Worker187/187·mismatch/duplicate0, siteData 전체가 기준 commit과 동일·좌표 변경0. inline JS 문법/diff check 통과. 겨울 합성 화면 PC1366x768/모바일390x844에서 카드10·가로/카드 넘침0·항구 육상 표시/선상 안내 정상·notice 연계/재열기/주문진항 실제 지도 popup 정상·console error/warn0. 현재9월 실제 화면도10카드·가로 넘침/콘솔 오류0. 변경 파일은 index.html·test_weekly_recommendation.mjs·HANDOVER.md뿐이며 weather_rules/점수/원본data/생성JSON/updater/Worker/Actions/엑셀은 무변경.
  - 미해결 데이터 분류: 강·하천·강변·공원·유수지 단독은 사용자가 확정한 water/coast/field token으로 확장하지 않았다. 이름에 습지가 있어도 env가 공원이면 보류한다. 아래23곳은 임의 포함하지 않았으며, 겨울 포함을 원하면 환경 또는 정책을 명시적으로 확정할 것.

|ID|겨울 허용 축 미분류 장소|실제 env|
|---|---|---|
|32|팔당|강|
|33|팔당고니|강|
|41|굴포천|하천|
|92|공주 금강|하천|
|109|파주삼릉|릉|
|113|현등사|사찰|
|131|을숙도철새공원|생태공원·강|
|136|대왕암공원|공원|
|137|산청|강변|
|139|용현유수지|공원 유수지|
|141|연천군 두루미 관람대|강변|
|142|미호천|강변|
|143|강서습지생태공원|공원|
|144|송도|공원|
|147|맥도생태공원|공원|
|148|태종대|공원|
|149|둔치도|강변|
|151|관곡지|공원|
|153|강릉남대천|강변|
|158|중랑천 하류·살곶이체육공원|도심 하천|
|159|안양천 하류·오목교 일대|도심 하천·갈대|
|160|탄천 한강합류부|도심 하천 합류부|
|187|연천 숭의전|유적지|

분류 재현: PowerShell `$env:WINTER_REPORT='1'; node --test --test-name-pattern='겨울 실제 환경' .github/scripts/test_weekly_recommendation.mjs` (fixture 결과는 실제 겨울 예보가 아님).

- 동풍/선상 추천 분리(2026-09-08, 시작 local `31c9c37`, 최신 자동 갱신 main `35641bc` fast-forward 후 작업): 기존 9월 포항·울산·부산 동풍 8.0m/s inclusive mandatory 판정 함수·추정형 문구는 무변경. 선상 카드에서는 육상 동풍 사유를 섞지 않고, `weeklyPelagicSafety`를 추천 전용 평균풍속 <=6.0m/s·파고 <=0.7m·3시간 강수 0mm로 변경했다(필수값 결측/비수치/음수 탈락). 돌풍/시정은 값이 있으면 참고 표시하며 기존 score rule의 gust/visibility gate를 강제하지 않는다. `weeklyPelagicRecommendationSeason()`은 현재 KST 월 4·5·9·10에만 활성화하며 seasons/bestSeason을 읽거나 수정하지 않는다. pelagic=true·독도 제외, 낮·scoreEligible·오늘 과거시간 제외 후 기존 daily/weeklyBest와 tie-break 재사용. 안전 sample이 없으면 공지/동풍/today fallback으로 승격하지 않는다. 선상 추천은 기존 caution filter도 통과해야 한다. 가을 4/3/최대1/2 및 보충/dedupe 유지, 봄도 선상 최대1. 카드에 '선상탐조 추천 조건 충족'과 선사 확인 문구를 사용하며 출항 가능을 단정하지 않는다. 기존 v24FerryStatus 함수와 다른 사용처는 그대로 유지.
  - 점수/가산점/weather_rules·siteData·좌표·자동 JSON·updater·notices·Worker·Actions 무변경. 기존 핵심 들판5곳·들판 tie-break·갯벌 물때 threshold·caution 회귀 통과.
  - 검증: 주간39·기상22·조석20·Worker33 총114개 및 두 validator 통과. runtime/Worker187/187·mismatch/duplicate0·siteData 전체 비교 동일·좌표 변경0·inline JS 문법/diff check 통과. PC1366x768/1920x1080·모바일390x844/360x800에서 추천10·가로/카드 넘침0, 동풍 추정 문구와 선상 3조건 표시 정상, notice 연계/패널 재열기/대진항 지도 popup 정상·console error/warn0.
  - 실자료: weather_week 생성 2026-09-08 00:01 KST · 9/8~9/14 · 187곳·10472 sample. 선상 후보 독도 제외8곳 중7곳에 안전 sample 존재. 최종 선상 대진항 9/11 09:00·92점·평균풍속0.2m/s·파고0.6m·강수0mm·돌풍3.1m/s·시정26.7km. 최종10곳 배분4/3/1/2, 중복0. 울산 앞바다 선상은 동풍 근거 true라도 선상 안전 sample0으로 제외.

동풍 실자료 전수 결과(충족은 주간 최초 충족 시각, 미충족은 비교용 최고점 시각이며 추천/출현 확정이 아님; 선상 장소의 동풍 조건은 선상 카드에 사용하지 않음):

|장소|시각 KST|풍향|풍속 m/s|동풍 조건|
|---|---|---|---:|---|
|낙동강|2026-09-09 09:00 KST|북동풍|8.9|충족|
|호미곶|2026-09-09 06:00 KST|북동풍|15|충족|
|청림운동장|2026-09-09 06:00 KST|북동풍|11|충족|
|태화강|2026-09-09 09:00 KST|북동풍|9|충족|
|울산 앞바다 선상|2026-09-09 06:00 KST|북동풍|16.3|충족|
|부산 오륙도 이기대|2026-09-08 12:00 KST|북동풍|8|충족|
|다대포 몰운대|2026-09-09 09:00 KST|북동풍|10.6|충족|
|을숙도철새공원|2026-09-09 09:00 KST|북동풍|8.9|충족|
|솔개공원|2026-09-08 15:00 KST|북동풍|10.9|충족|
|남창들녁|2026-09-08 09:00 KST|북풍|5.5|미충족|
|대왕암공원|2026-09-09 06:00 KST|북동풍|13.7|충족|
|맥도생태공원|2026-09-09 09:00 KST|북동풍|8|충족|
|태종대|2026-09-08 15:00 KST|북동풍|8.8|충족|
|둔치도|2026-09-08 09:00 KST|북풍|4.3|미충족|
|회야댐·회야강 하류|2026-09-08 09:00 KST|북풍|3.3|미충족|
|포항 형산강 하구|2026-09-09 06:00 KST|북동풍|8.6|충족|
|이천항|2026-09-08 12:00 KST|북동풍|8.3|충족|
|도구해수욕장|2026-09-09 06:00 KST|북동풍|11|충족|
|임곡항|2026-09-09 06:00 KST|북동풍|11|충족|
|강사리 선상탐조|2026-09-09 06:00 KST|북동풍|13.6|충족|
|장생포 고래선상탐조|2026-09-09 09:00 KST|북동풍|11.7|충족|

선상 실자료 전수 결과(탈락 행의 시각은 비교용이며 추천 시각이 아님):

|장소|시각 KST|평균풍속 m/s|파고 m|강수 mm/3h|판정|통과 sample 수|
|---|---|---:|---:|---:|---|---:|
|대진항|2026-09-11 09:00 KST|0.2|0.6|0|통과|16|
|독도|2026-09-11 18:00 KST|5.5|0.7|0|독도 제외|0|
|주문진항|2026-09-11 09:00 KST|1|0.6|0|통과|12|
|어달항|2026-09-11 09:00 KST|1|0.7|0|통과|12|
|후포항|2026-09-12 12:00 KST|2.3|0.6|0|통과|8|
|제주 남방|2026-09-13 15:00 KST|4.9|0.7|0|통과|2|
|울산 앞바다 선상|2026-09-11 15:00 KST|5|1|0|안전 sample 없음|0|
|강사리 선상탐조|2026-09-13 15:00 KST|4.6|0.7|0|통과|4|
|장생포 고래선상탐조|2026-09-13 15:00 KST|4.9|0.7|0|통과|4|

울산 앞바다 선상은 낮 후보 중 풍속 초과12·파고 초과25·강수6개(중복 집계)이며 세 조건 동시 통과0이다. 재현: `PELAGIC_REPORT=1 node --test --test-name-pattern=실제 .github/scripts/test_weekly_recommendation.mjs` (PowerShell에서는 `$env:PELAGIC_REPORT='1'`로 설정).

- 추천 현장주의 제외(2026-09-07, 시작 main `bc4f1f7`): `weeklyRecommendationIsSafe(entry)`가 카드에 표시할 동일 날짜/시각의 `entry.today`를 기존 `todayWeatherCautionNote()`에 전달한다. 기존 파고/강수 임계값 및 score는 변경하지 않는다. `todayRecommendedSites()`에서 유형별 선발 전에 false 후보만 제외해 같은 축의 다음 후보와 기존 soft-target 보충이 작동한다. 기상 없음/파고·강수 정보 없음은 null(미확인)로 반환하고 기존 fallback 선발 의미를 유지하며 안전하다고 표시하지 않는다. 다른 시각의 동풍 근거·조석 주의인 `entry.cautionText`로 제외하지 않는다. 후보 생성·isMandatory·reasons·notice 연계·UI는 그대로 보존한다.
  - 최신 weather_week 생성 22:14 KST 기준: 청림운동장 후보는 9/9 18:00·58점·현장 탐조 주의·mandatory이며, 변경 전에도 순위 때문에 최종 10곳 밖(selectedAxis 없음)이었다. 변경 후에는 caution 필터에서 명시적으로 제외된다. 따라서 최신 데이터의 전후 최종 목록은 동일하고 신규 대체 site는 없다. 갯벌 슬롯에는 이미 솔개공원(9/8 09:00·80점)이 포함되어 있었다. 최종 목록: 알뜨르비행장(9/13 09:00,100), 교동도/석모도/강화도(9/8 09:00,92), 매향리/유부도(9/12 09:00,92), 솔개공원(9/8 09:00,80), 대진항(9/8 09:00,92), 이천항(9/8 06:00,91), 태종대(9/8 09:00,89). 4/3/1/2·mandatory 5/10·caution 0·중복 0. 이전 19:24 생성 데이터의 청림운동장 65점 사례와 혼동하지 말 것.
  - 검증: 주간 추천 34·기상 22·조석 20·Worker 33개(총 109) 및 두 validator 통과. 60/65점 caution 없음 허용·95점 caution 제외·물때/동풍 mandatory 정보 보존·같은 축 보충·대표 시각 일치·fallback 미확인 테스트 추가. 핵심 들판 5곳·정렬·pelagic gate 회귀 없음. runtime/Worker 187/187·불일치/중복 0·siteData 완전 동일·좌표 변경 0, inline JS 문법 및 diff check 통과. PC 1366x768/1920x1080·모바일 390x844/360x800에서 카드 10·현장주의 카드 0·가로 넘침 0, 패널 닫기/재열기·공지 내용 유지·추천 클릭과 솔개공원 지도 popup 정상, 신규 콘솔 오류 없음. 변경 파일은 index.html·test_weekly_recommendation.mjs·HANDOVER.md뿐이다.

- 가을 추천 균형 구현(2026-09-07, 시작 main `add9d8b`): `index.html`의 추천 선발만 9~10월 들판 4·갯벌 3·안전한 선상 최대 1·기타 2 soft target으로 변경했다. 부족분은 전체 점수순으로 보충하고 전역 site ID dedupe를 적용한다. `autumnBirdingAxes`는 env 실제 token과 핵심 들판 Set(7·8·10·15·20)을 사용한다. 핵심 5곳 모두 field이며 7·8·10·20은 mudflat도 유지, 15는 field만이다. 간척호/하구/염전 단독은 확대 해석하지 않는다. 들판 순서는 주간 최고 sample score → core → 가까운 날짜 → 기존 siteData 순서 → ID이며 점수·계절 bonus·mandatory 승격은 없다. 갯벌/기타 축 내부에서는 기존 공지·물때·동풍 우선순위와 이유를 보존한다. 선상은 pelagic=true(독도 제외)만 평가하며 seasons를 변경하지 않는다. `weather_rules.json`을 읽어 기존 pelagic_seabird의 풍속 9·돌풍 13·3시간 강수 1·시정 8 이상·파고 1.5 기준을 모두 만족하는 낮 sample만 기존 daily/weeklyBest 함수에 전달한다(결측/규칙 로드 실패는 선상 제외). 카드에 축·돌풍·시정·기존 v24FerryStatus와 출항 확인 문구를 추가했다. 추천 날짜와 물때/동풍 근거 날짜가 다르면 구분하고, 기상이 없는 물때 날짜에 다른 날짜 sample을 붙이지 않는다. 기존 rolling 7일·오늘 과거시간 제외·물때 threshold·9월 동풍 8.0 inclusive·원거리 섬 제외·봄 정책·structured notice 연계·today fallback 유지. 영어 NE/SE 표기도 기존 한국어 북동풍/남동풍과 동일하게 인식한다.
  - 실데이터 검증 기준: weather_week 생성 2026-09-07 19:24 KST, 확인 22:09 KST. 핵심 들판 5곳 모두 9/8 09:00·92점, field 순위 교동도 2·석모도 3·강화도 4·천수만 간월호 5·새만금 6. 1위 알뜨르비행장 100점이 core보다 앞선다. 최종 10곳: 알뜨르비행장(들판,9/11 18:00,100), 교동도/석모도/강화도(들판+갯벌,9/8 09:00,92), 유부도(갯벌,9/12 15:00,92,공지+물때), 매향리(갯벌,9/12 09:00,90,공지+물때), 청림운동장(갯벌,9/9 06:00,65,공지+동풍·현장주의), 대진항(선상,9/8 09:00,92), 이천항(기타,9/8 09:00,91,동풍), 태종대(기타,9/8 09:00,90,동풍). 실제 배정 슬롯 4/3/1/2, mandatory 5/10, 중복 0. 선상 8곳 평가·8곳 통과·낮 안전 sample 108개, 선정 대진항 파고 1.0m·평균풍속 1.4m/s·돌풍 2.7m/s·강수 0mm/3h·시정 26.7km.
  - 검증: 주간 추천 28개·기상 22개·조석 20개·Worker 33개 통과, 두 weather validator 통과, inline JS 3개 문법 정상, runtime/Worker 187·불일치 0·siteData 전체 동일·좌표 변경 0. PC 1366x768/1920x1080, 모바일 390x844/360x800에서 카드 10개·축 표시·가로 넘침 0 확인. 닫기/재열기·공지 연결·대진항/교동도 추천 클릭과 실제 지도 팝업 정상, 변경 전 main/변경 후 콘솔 오류 0. week/rules HTTP 실패 모의 화면에서도 today fallback 10개·선상 0·패널 정상. 자동 생성 JSON, updater, 규칙 값, 조석, notices, Worker, Actions는 수정하지 않았다.

- '이번주 어디 갈까' weather_week 연결(2026-09-07): 추천 판단을 `weather_today.json` 단일 저장값에서 `weather_week.json`의 실제 7일 3시간 sample로 확장했다. 기존 함수명·카드 구조·최대 10곳·mandatory 우선 병합은 그대로 두고 최소 변경으로 연결했다. 하루 대표 sample은 ① 해당 site/date의 실제 일출~일몰 사이 ② `scoreEligible == true` ③ 오늘은 `isPastAtGeneration == true` 및 현재 시각 이전 제외 ④ 남은 후보 중 최고 score ⑤ 동점이면 오전 우선, 오전 안에서는 더 이른 시각 순으로 고른다(`weeklyDailyBestSample`). 주간 대표 날짜는 7일 dailyBest 중 최고점, 동점이면 더 가까운 날짜다(`weeklyBestWeatherDay`). 일출·일몰은 NOAA sunrise equation을 `weeklySunTimes`로 최소 추가했고 좌표는 기존 site 좌표를 그대로 쓴다(서울 하지 05:11/19:57·동지 07:43/17:17 공표값 일치, 추분 낮 길이 12시간 09분으로 검증). 9월 포항·울산·부산 동풍 mandatory는 `weeklyEastWindFromWeek`가 주간 낮 sample에서 E/NE/SE·8.0m/s 이상을 찾아 판정하며(대상 지역/서식 필터는 기존 조건 유지, 10월 비활성), 근거 sample의 시각을 별도 줄로 표기해 추천 시각과 섞이지 않게 했다. 물때 mandatory(유부도 700·매향리 850·걸매리 850cm)는 기존 `weeklyBestMudflatTide`의 exact-date 판정을 그대로 쓰고 기상 점수와 별도 축으로 카드에 함께 표시한다. **새 점수 가산·감점 규칙은 추가하지 않았다.** 판단 창은 `weeklyInfo()`를 KST 월~일에서 weather_week과 같은 rolling 7일(오늘~오늘+6)로 맞춰 기상·조석이 같은 기간을 보게 했고, 과거 날짜를 추천하지 않는다(패널 상단 문구도 '이번 주:' → '추천 기간:'). `weather_week.json` 로드 실패 시에는 `weatherWeek=null`로 두고 기존 weather_today 경로로 자동 fallback한다(패널 정상 렌더 확인). 시정 정책(today=current broadcast, weekly=hourly)은 이번 작업에서 변경하지 않았다. 검증: 신규 `.github/scripts/test_weekly_recommendation.mjs` 14개(index.html 실제 함수 소스를 추출해 검증) 통과, 기존 기상 22·조석 20·Worker 33개 및 두 validator 통과, siteData 187개 완전 동일·좌표 변경 0·중복 ID 0, inline script 3개 문법 정상. Chromium 실측 UI 회귀(1366/1920/390/360): 버튼·패널 open/close/재열기 정상, 카드 10개 유지, 날짜+시간 표기 정상, 가로 스크롤 0·카드 overflow 0, 공지 패널 연동 정상, 콘솔/페이지 오류는 변경 전 origin/main과 동일(샌드박스가 Leaflet CDN을 차단해 발생하는 `L is not defined`뿐이며 지도 pan/zoom은 이 환경에서 검증 불가). notices 연동은 기존 structured linkage(siteIds/siteId/sites)만 사용하고 자연어 파싱은 하지 않는다.

- weather_week.json 주간 데이터셋 추가(2026-09-07): `update_weather.py` 한 번 실행으로 `weather_today.json`과 `weather_week.json`을 함께 생성한다. site별로 이미 받은 Windy atmospheric·gfsWave 시계열과 Open-Meteo 응답을 그대로 재사용하므로 Windy atmospheric/wave 요청 수와 Open-Meteo 요청 수는 기존과 동일하다(오프라인 전체 시뮬레이션 기준 atmospheric 187·wave 66·Open-Meteo weather 187·marine 0로 변경 전후 일치). 범위는 KST rolling 7일(오늘~오늘+6일), Windy GFS 실측 cadence인 3시간 sample을 그대로 보존하고 축약하지 않는다. sample에는 forecastTime·windSpeed·windDirectionDeg·windName·gust·precipitation3h·temperature·visibilityKm·cloudPct·waveM·score·grade·scoreEligible·missingScoreFields·isPastAtGeneration을 저장하며, 점수는 기존 `score_weather()`를 그대로 재사용해 동일 원시 입력이면 today와 값이 같다. wave는 실제 시계열 간격의 절반 이내·같은 KST 날짜일 때만 매칭해 다른 날짜/슬롯의 값을 복사하지 않고, visibility는 site당 Open-Meteo hourly 응답 1개를 7일에 재사용한다(sample 단위 호출 없음). Windy atmospheric 자체가 실패한 site는 Open-Meteo hourly(past_days=1, forecast_days=7)에서 3시간 anchor만 골라 실제 미래 예보를 구성하고 precipitation3h는 해당 시각 기준 최근 3시간 hourly 합으로 계산한다. weekly는 `previous_saved`를 신규 예보로 승격하지 않으며 실패 site는 `dataUnavailable`과 빈 `days`로 남는다. 주간 생성 실패는 try/except로 격리해 today 결과를 절대 깨뜨리지 않는다. 검증기 `.github/scripts/validate_weather_week.py`(ID 집합·중복·날짜 범위·day key 일치·오름차순·NaN·score 범위·wave 적격성)를 추가하고 workflow에 실행·commit 대상을 추가했으며 schedule(06/10/14/18 KST)은 변경하지 않았다. 회귀 검증: 동일 합성 상류 응답으로 변경 전후 `weather_today.json` 내용 완전 일치(사이트 삽입 순서만 기존부터 존재하던 thread 완료 순서 차이), 기상 21개·조석 20개·Worker 33개 테스트 통과. 파일 크기는 187곳×7일×3시간 기준 약 3.4MB(gzip 약 230KB), sample 10,098개. 알려진 차이: GFS 운영 경로에서 today는 기존대로 Open-Meteo `current` 시정 1개 값을 시계열 전체에 broadcast하고 weekly는 각 3시간 anchor의 hourly 시정을 쓰므로, 겹치는 시각의 점수가 시정 항목만큼 다를 수 있다(11항 요구사항에 따른 의도된 동작, today 로직은 무변경). `index.html`·추천 로직·좌표·조석·notices는 변경하지 않았고 weather_week.json은 아직 UI에 연결하지 않았다. 실제 Actions 전체 실행 [34076121681](https://github.com/wooil1964/birdmap/actions/runs/34076121681) 성공(build 6분 48초, timeout 없음, 자동 commit `662b1cf`): weather_today 187 성공·실패 0·재사용 0·stale 0·점수 적격 187, weather_week 187곳·7일(9/7~9/13)·sample 10,098개·전 구간 3시간 간격·점수 적격 100%, atmospheric 전부 Windy·visibility 전부 Open-Meteo component fallback·wave는 대상 66곳 모두 Windy(sample 3,564개), 두 validator 통과, API 오류·경고·키 노출 0. 파일 크기 3,386,577바이트(gzip 약 208KB). today와 weekly의 동일 시각 sample 점수는 187곳 중 186곳 일치하며, 차이가 난 1곳(ID 140 학저수지 90 vs 92)은 위 시정 소스 차이(today=current broadcast, weekly=hourly anchor) 때문이다. 직전 실행 [34075887795](https://github.com/wooil1964/birdmap/actions/runs/34075887795)은 정상 진행 중이었으나 작업자가 경과 시간을 오판해 취소한 것이며 코드 문제가 아니다.

- Windy 주간 범위 사전 조사(2026-09-07): Actions [34074742903](https://github.com/wooil1964/birdmap/actions/runs/34074742903)의 `inspect-windy` 성공, 기존 `update-weather` job은 skipped. 대표 runtime ID 1 어청도에 운영 GFS fallback과 동일 parameter(visibility 제외), 기존 request_forecast 재사용·재시도 0으로 atmospheric 1회만 호출했다(wave/Open-Meteo 0회, API 오류 없음). ts 80개, 첫 timestamp 1788728400000(2026-09-07 06:00 KST), 마지막 1789581600000(2026-09-17 03:00 KST), 전 구간 3시간 간격·237시간 범위. KST 달력 날짜 11개(양 끝 날짜는 부분일), 오늘부터 7일 범위인 9/7~9/13 모두 실자료 존재. 이 값은 대표 1곳의 해당 실행 결과이며 전체 187곳·wave 범위를 검증한 것은 아니다. 키/요청 payload/raw 응답은 출력·저장하지 않았다. 진단 commit `4f49bbd` 후 임시 스크립트/job을 제거하고 workflow를 원복했다. `weather_week.json` 구현 및 UI 연결은 아직 하지 않았다.

- '이번주 어디 갈까' 탐조 이슈/필터 정리(2026-09-07): 활성 `notices.json`에는 기존 문구 유지 후 `siteIds`만 추가하고, weekly 패널에서는 공지 전문 중복 렌더링을 제거해 연결 탐조지를 추천 10곳 안에 우선 병합하도록 조정했다. 검색 필터에서는 해외탐조·들뫼추천·대중교통 좋은 곳·맹금·갈매기 선택지를 제거했다.
- '이번주 어디 갈까' 전환(2026-09-07): UI 표시를 주간 추천으로 바꾸고, KST 월~일 범위에서 월간 조석은 주간 전체를 평가하되 기상은 현재 저장소의 실제 단일 저장 예보 날짜만 사용하도록 `index.html`을 확장했다. 추천은 필수조건과 일반 기상 추천 합산 최대 10곳이며, 오늘 기상값을 미래 날짜에 복제하지 않는다.
- '오늘 어디 갈까' 계절 추천 보정(2026-09-07): 9~10월 물때 필수추천은 사용자 확정 대상인 유부도(700cm)·매향리(850cm)·걸매리(850cm)만 siteId 기준으로 적용하고, 가을 원거리 섬 제외는 확정 대표명(백령도·외연도·어청도)만 추천 후보에서 제외하도록 `index.html`을 보정했다. 동남해안 9월 강한 동풍 mandatory 규칙은 유지했다.
- '오늘 어디 갈까' 필수 포함 규칙(2026-09-06): 기존 `v251EffectiveScore` 점수는 올리지 않고, 9~10월 갯벌 조석 조건과 9월 동남해안 동풍 조건을 `mandatoryReason`으로 추천 목록에 추가 표시하도록 `index.html`만 최소 확장했다.
- '오늘 어디 갈까' 패널 + 탐조 이슈 연동(2026-09-06): 상단에 `🧭 오늘 어디 갈까` 버튼과 `#todayPanel` 추가. ① Top 5는 기존 `v251EffectiveScore`(저장 기상)만으로 정렬하며 새 점수·가산점 없음, 카드에 기존 별점/점수·조석 고저조(`v24TideDayEvents` 재사용, stale 시 '※ 이전 자료')·기상 자료 신선도(`storedWeatherLabel`)를 표시하고 클릭 시 `moveToSite` 재사용. ② `📢 지금 볼 만한 탐조 이슈` 섹션은 기존 noticePanel과 동일한 `activeNotice` 필터·동일 데이터(`loadedNotices` 공유)를 사용해 활성 공지의 제목·요약을 그대로 표시(자연어 재해석·자동 점수화·탐조지 추론 금지). 현재 notices.json에는 siteId류 구조 필드가 없어 연계 배지·지도 이동은 비활성이며, 향후 공지에 `siteIds`/`siteId`/`sites`(id 또는 정확한 이름)가 추가되면 `noticeLinkedSites`가 자동으로 '📢 현재 탐조 이슈 연계' 태그와 '지도에서 보기' 버튼을 붙인다. notices.json·추천 점수·조석/기상 로직은 무변경.
- 모바일 popup 겹침·가로 스크롤 안정화(2026-09-06): 원인은 ① Leaflet popup autoPan 기본 패딩(5px)이 모바일 상단 고정 UI(`#topUiWrap`, z-index 10001)를 고려하지 않음, ② `moveToSite`의 `setView` 애니메이션이 popup autoPan 결과를 되돌림, ③ 모바일 패널 고정 `top:178px`이 버튼 줄바꿈 시 실제 상단 UI 높이(약 198px)보다 작아 겹침. 수정: 상단 UI 실제 높이를 CSS 변수(`--birdmapTopUiH`, `--birdmapPopupMaxH`)로 계산해 패널 top·popup 최대 높이에 반영, popupopen 시 `autoPanPaddingTopLeft/BottomRight` 동적 설정, 이동/애니메이션 안정화 후 `popup.update()` 재보정, 열린 검색 패널 아래 popup 최소 공간(180px)이 있으면 패널 유지·없으면 기존 패턴대로 자동 닫기. `#birdmapPanel`·입력창·`#noticePanel`에 box-sizing 보정, 모바일 한정 `html,body{overflow-x:hidden}` 안전장치. 390x844/360x800/412x915 및 1366/1920 데스크톱 회귀 검증(187개·중복 ID 0·조석/기상/버튼 정상). 조석·기상·좌표·데이터 변경 없음.
- 기상 최종 원격 검증: 코드 `842a8d1` 및 `959ee96` main push, Actions `34022709060`/`34023132421` 성공. 최종 자동 JSON `a1233ee`: 2026-09-06 17:54 생성/18:00 갱신, 187 성공, 실패·stale·재사용·없음 0, 점수 적격 187. Windy GFS + Open-Meteo 시정 보완. 회귀 총 61개 통과. KMA 외부 timeout과 모바일 팝업 겹침은 미해결이며 신규 추천 기능은 구현하지 않았다.

- 기상 안정화(2026-09-06, Worker 배포 완료): runtime/Worker 코드 187개 전수 일치, ID 188 추가 및 ID 14 이름 일치. 저장 기상 concat 파서 오류 수정, 원 시각·출처·stale·점수 적격 상태 분리, 일부 KMA 요청 실패 시 유효 응답 보존. 실제 Open-Meteo 저장 기상 187개 성공, 이전 자료는 오늘 점수에서 제외. 상세 `.github/scripts/weather_system_review.md` 참조. Worker version 0c8fbbb2-728d-4dfd-8d3b-2ed0fb5d8e05 배포 완료. 대표 실제 호출은 7곳 KMA_TIMEOUT, 독도 해양 우선 분기였다. 코드 배포와 외부 API 정상화를 구분할 것.

- 조석 안정화(2026-09-06): 공식 코드 99개 탐조지/38개 관측소 검증, 필수 8곳 및 전체 today/tomorrow 인증 API 실호출 확인. 명시적 매핑, fallback 출처·원 생성/현재 갱신 시각, 실제 HTTP·live·timeout 진단, 월간 캐시, 회귀 검사와 Actions 진단을 보강했다. 상세 증거와 반복 비교 결과는 `.github/scripts/tide_system_review.md`, `tide_api_verification.json`, `tide_api_benchmark.json` 참조. 외해 기준의 내부 갯벌 대표성 등 31개 검토 표시는 보존했다.
- 탐조 의사결정 2단계는 `.github/scripts/birding_decision_design.md`에 설계만 작성. 기존 점수 중복, 추천 시간 승인 규칙, 관측/추정 분리, 모바일 및 단일 원본 후보를 정리했으며 새 기능은 구현하지 않았다.
- 현재 런타임/Worker 코드는 187개(중복 ID 0), ID 188 이천항 포함. 공통 좌표와 조석 매핑 좌표는 일치한다. production Worker에도 188 반영 완료. 외부 KMA timeout은 남아 있다. 아래 과거 162개/반영 보류 기록을 현재 상태로 오인하지 말 것.
- 기상 표시 개선 및 Worker 배포 완료
- 한 달 조석 데이터·모달 기능 완료
- P1 품질 개선 완료
- 모바일 상단 UI 정리 완료
- 186개 엑셀 정제본 생성, 신규 30개는 지도 반영 보류
- 강수 우선 탐조 해석 수정(PR #2) 및 강수 시 별점·점수 보정(PR #3) 완료
- 수도권 하천계 6곳(ID 157·158·159·160·162·163) 1차 지도 반영 — 권역 수 156→162, ID 161은 보류 유지
- eBird 링크 버튼 비노출 실험(2026-07-08): 비멤버 유입 감소 원인 확인을 위해 팝업의 eBird 버튼만 임시로 숨김.
  데이터(`ebirdHotspotUrl`, Hotspot ID, 정적 팝업 HTML)는 모두 보존.
  복원 방법: `index.html`에서 ① `var SHOW_EBIRD_BUTTON=false;`를 `true`로 변경,
  ② CSS의 `a.ebird,.btn.ebird{display:none !important}` 한 줄(및 그 위 주석) 삭제 — 두 가지 모두 되돌려야 함.

## 진행 중 / 보류 사항

- 신규 탐조지 후보 중 24개(ID 161, 164~186): 엑셀 정제본에는 포함되었으나 지도 반영은 보류 상태.
  반영 시 `AI_WORK_RULES.md` 5항(좌표 검증)과 7항(기상 이중 관리)을 반드시 준수할 것.
- 반영된 6곳의 eBird Hotspot ID는 미확정으로 공백 유지 중(후보 ID는 보완표 참조). 공식 확인 후 입력할 것.
- 조석 매핑 검증기는 이제 HTML의 고정 개수/정규식 대신 조석 대상 ID 집합 및 공식 코드를 검증한다. mappingVersion 2가 실행 기준이며 유부도 DT_0018, 매향리 SO_1268은 보호한다. Excel·HTML 전체를 덮어써 매핑을 되돌리지 말 것.

## 다음 작업자를 위한 주의사항

1. 작업 시작 전 `git status`와 최신 main 상태를 확인한다.
2. `AI_WORK_RULES.md` 전문을 읽고 준수한다.
3. `index.html`의 `siteData`와 `weather-proxy/src/sites.js`는 수동 이중 관리 상태이므로
   탐조지·좌표 변경 시 양쪽을 모두 확인한다.
4. 자동 생성 파일(`weather_today.json`, `tide_today.json`, `notices.json` 등)은
   직접 수정해도 다음 자동 실행에서 사라질 수 있다.
5. 작업 완료 후 `AI_WORK_RULES.md` 12항 형식으로 보고하고, 이 문서의
   "최근 완료 작업"을 갱신한다.
