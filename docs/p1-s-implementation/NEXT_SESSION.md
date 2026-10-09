# P1-S 1단계 구현 체크포인트

브랜치 `fix/p1-s-safety-guards` (기준 `origin/main` 1817161). **main 병합·운영 배포·Worker 배포·D1 변경은 승인되지 않았다.**
설계: 분석 브랜치 `analysis/recommendation-masterplan` 의 `P1_SAFETY_DESIGN.md`(60bfbdb). 분석 브랜치는 변경하지 않았다.

## 완료
- **S1-R** (`reports-api/src/shared.js`, 커밋 dc6f0e5): `isSensitiveReport` 가 종명 전체 일치 → "보호종명 + 숫자(+마리/개체)" 순으로 판정. 구분자(`, ; · / CR LF`)로 다시 나눠 읽는다.
  `normalizeSpecies` 는 줄바꿈을 제어문자 삭제 전에 구분자로 쓴다. 19종 목록·번식 6단어·알/산란·슬래시 신규 입력 허용은 변경 없음.
- **S2-A** (`index.html`, 커밋 b0cd662): `weeklyScoreValid`·`weeklySampleRecommendable`·`weeklyTodayRecommendable` 추가.
  표본 선택 전(`weeklyDaylightCandidates`), 만조 today fallback, 일반 today fallback, 선상 안전, entry 생성(`weeklyRecommendationForSite`), 최종 선발(`todayRecommendedSites`)에 적용.
  점수 없는 공지·물때·동풍 전용 후보는 추천하지 않는다. 표시용 `storedWeatherState`/`weatherScoreAllowed` 의 숫자 판정만 엄격화(점수식 무변경).
- **Python validator**: `validate_weather.py`(scoreEligible bool, 적격이면 missingScoreFields list), `validate_weather_week.py`(scoreEligible bool, missingScoreFields list). 생성기·점수식 무변경.

## 테스트 (2026-10-09, Windows, Python 3.12 있음, `PYTHONUTF8=1 PYTHONIOENCODING=utf-8` 필요)
| 스위트 | 결과 |
|---|---|
| reports-api `node --test` | 178/178 (기존 171 + 신규 7) |
| `.github/scripts/test_weekly_recommendation.mjs` | 136/136 (기존 126 + 신규 10 S2-A1~10) |
| 기타 프런트 `.mjs` (midnight 13, history cache 16, field news 9, report search 11, kst 9/5, contributors 8, tide fallback 21, autorefresh 14) | 전부 통과 |
| `test_weather.py` | 50/50 (기존 48 + 신규 2) |
| `test_tide.py` | 22 중 21 통과, 1 skip |
| weather-proxy | 36/36 |
| `test_notice_close_hit.mjs` 7건 | Chromium 없음 — main 에서도 동일 실패(환경) |
| `test_month_tide_button.mjs` | 6 통과·7 skip(main 동일) |

UTF-8 환경변수 없이 실행하면 C01 이 Python 출력 인코딩(cp949) 때문에 실패한다 — 제품 결함 아님.

## 기대값을 바꾼 기존 테스트 (승인된 계약 강화)
- M02: scoreEligible 누락/null 인 today 저장값은 더 이상 추천하지 않음(2행 expected true→false), 공지 전용 후보는 추천 entry 가 되지 않음.
- today 기상 fixture 들에 실제 `weather_today.json` 과 같은 `scoreEligible:true, missingScoreFields:[]` 추가.
- `test_today_weather_midnight.mjs` 함수 목록에 새 헬퍼 3개 추가.

## 비교 결과 (`docs/p1-s-implementation/results/compare_normal_and_synthetic.json`)
`node .github/scripts/compare_p1s_recommendation.mjs 35141c04d4fd152982b1f4683d5b7a6f4f7514e5 worktree`
- 정상 입력(35141c0, 2026-10-08 22:40): 후보 176→176, 상위 10곳(ID·점수·순위·날짜·시각·가점) 완전 동일 — 제보 스냅샷 있음/없음 모두.
- 합성 오류(최근 출현 11곳의 모든 점수를 null, scoreEligible=true 유지): 기존 코드는 176 후보·0점 후보 11곳·상위 10에 126(0점) 포함, 수정 후 165 후보·0점 후보 0.

## 미검증
- 로컬 합성 API 를 쓴 PC·모바일 E2E(제보·현장소식·삭제·길안내·팝업·캐시 오류). 확인한 것은 로컬 정적 서버에서 실제 JSON 으로 페이지 로드, 추천 패널 10곳 렌더, 스크립트 오류 0 뿐이다.
- Cloudflare Worker 배포 후 실제 공개 API 동작(배포하지 않음).

## 다음 명령
```
git checkout fix/p1-s-safety-guards
cd reports-api && node --test
cd .. && PYTHONUTF8=1 PYTHONIOENCODING=utf-8 node --test .github/scripts/test_weekly_recommendation.mjs
cd .github/scripts && PYTHONUTF8=1 python -B -m unittest test_weather test_tide
```

## 미해결 정책 (S1-P, 이번 범위 아님)
승인된 보호종 제보의 전면 비공개, 숨긴 자식의 부모/고정 지점 연결, site-history·approved·pending·status·월간 집계의 읽기 시 재검증, 알/산란 문맥 판정, 전체 조류 사전, field 대략 좌표 공개 여부, legacy 원문 영구 보존.

## 운영 반영 금지 범위
main 병합, Pages 배포, `reports-api` Worker 배포, D1 쓰기/스키마, 운영 제보·현장소식 변경, 기상 JSON 수정.
