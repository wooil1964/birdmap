# 재개 체크포인트 — 기준 확정

## 마지막 완료

운영 main `1f0b0b5ca9d3ef887fc0bd2a159ef73429466a25`, P0 최종 커밋 조상 관계와 규칙/Issue를 확인했다. 원래 P0 체크아웃은 clean이며 분석은 별도 작업 트리에서 진행한다.

## 진행 중

추천 데이터 흐름 및 P1-A 190곳 점수 분포. 이번 첫 체크포인트 이후 실제 집계 결과·재현 도구·상세 근거를 다음 commit으로 저장할 예정이다.

## 입력

- 저장 코드/JSON: 위 SHA. today/week 생성18:10, 갱신18:19 KST.
- 공개 승인 집계: `_snapshots/recent_sites_20261008_193204.json`, 취득19:32:04 KST. 좌표/개인정보 없음.
- 고정 평가시계:2026-10-08T19:30:00+09:00. 이 시계는 재생 조건이며 실시간 관측 시각과 구분한다.

## 재개 순서

1. 최신 원격 main SHA와 분석 브랜치 최신 commit을 읽기 전용 확인.
2. README/PROGRESS/NEXT_SESSION/DECISIONS 및 해당 checkpoint commit 읽기.
3. 다른 AI 변경 여부와 Git status 확인. 기존 미커밋 변경을 초기화하지 않는다.
4. 저장된 입력 해시와 실제 Git object 대조. main 이동은 별도 영향 조사하고 고정 입력을 몰래 교체하지 않는다.
5. 최신 checkpoint에 P1-A 결과가 없으면 실제 Python score_weather / JS weeklyRecommendationForSite / todayRecommendedSites를 추출해 전체190을 집계한다.
6. 결과가 이미 저장됐다면 그 미완료 항목부터 계속한다.

## 이어서 읽을 코드

`index.html`: weeklyDaylightCandidates, weeklySeasonalBestWeatherDay, weeklyDatePolicy, weeklyTideWeather, weeklyTideNearestSample, weeklyUsableHighTides, weeklyRecommendationForSite, weeklyRecentReportBonus, autumnBalancedRecommendations, weeklyPanelRecommendations, v251EffectiveScore.
`.github/scripts/update_weather.py`: score_weather/build_week_days.
`reports-api/src/public.js`: handleRecentSites.

## 위험과 금지

main 병합·Pages·Worker·D1 변경·실제 제보 등록 금지. 민감 위치/개인정보를 저장하지 않는다. 과거 P0 fixture와 최신 입력 혼용 금지. 노력을 통제하지 않은 제보 건수는 출현 확률이 아니다. 자동 재개나 사용량 충전을 보장하지 않는다.
