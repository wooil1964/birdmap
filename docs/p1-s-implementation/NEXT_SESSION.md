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
| 증거·문서 | (마지막 커밋) | 재현 전후 matrix, 비교 결과, 이 문서 |

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

수정 전 실패 확인: 주간 신규 7건 실패, 자정(R2) 신규 3건 실패, Python 신규 16 subtest 실패 → 수정 후 전부 통과.
Sol Ultra 의 실제 함수 matrix(`results/r123/review_matrix_adapted.mjs`, 원본 스크립트에서 소스 선택만 working tree 로 바꿈):
7eb6764 = matrix 175/182, 특별분기 14/21, 팝업 4/12 → 현재 **182/182, 21/21, 12/12**.

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
