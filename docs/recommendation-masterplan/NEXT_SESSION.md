# 재개 체크포인트 — P1-A 첫 측정 완료

## 마지막 완료

브랜치 `analysis/recommendation-masterplan`에서 전체 데이터 흐름과 P1-A 단일 시점의 190곳 집계를 완료했다. 기본 체크포인트 `89449c3`은 push됐다. 이 문서를 포함한 최신 체크포인트 SHA는 Git 이력과 Issue #9의 세션 결과 댓글로 확인한다.

P1-B/C/D 정량 분석, 개선안 비교, P2~P4 설계는 미완료다. P2/P3/P4 문서는 아직 만들지 않았다. 기존 P0 체크아웃과 운영 파일을 수정하지 않았다.

## 확정된 결과

- 저장 원점수 92: 183/190. 저장 적격 중에서는 182/189.
- 주간 sample 92: 7680/10584. 유효 장소별 주간 최고: 92점 150곳, 100점 39곳.
- 추천 후보 175곳: 원점수 92점 150곳, 100점 25곳.
- 현행 기상 주의 관문은 true 175, false/unknown 0. 현장 전체 안전을 보증하는 수치가 아니다.
- 후보 표시 점수는 75점 3곳·92점 149곳·100점 23곳.
- 제보 포함 top10:108,112,15,194,126,14,107,48,195,3.
- 제보 없음 대조:112,7,8,10,126,14,107,48,3,5. 공통 6곳, 교체 4곳.
- 고정 19:30에서 팝업은 190곳 모두 참고/미확인이다. 생성 18:10이 due 18:17보다 앞선 조건을 독립 재현했다. 최신 21:04 자료의 상태와 구분한다.
- JS 126/126, 기상 48/48, 조석 21 통과·1 skip(총22).

## 코드와 입력

- 분석 PIN: `1f0b0b5ca9d3ef887fc0bd2a159ef73429466a25`.
- 재개 후 확인한 main: `35141c04d4fd152982b1f4683d5b7a6f4f7514e5`. weather_today/week만 갱신됐다. 생성21:04/갱신21:08, 모든190곳 자료 복구. 추천 코드 변화 없음.
- [manifest](_snapshots/input_manifest.json): Git 입력 16개. 기상18:10 생성/18:19 갱신, 주간10/08~14, 월간조석08:02 생성.
- [공개 승인 집계](_snapshots/recent_sites_20261008_193204.json):19:32:04 취득11곳. 해시 `af77014b5430d7b15d42dd77de8e4ec2a841e48b5151298a7013e3875c4757b6`.
- [190곳 결과](_results/p1a_1f0b0b5_1930.json), [분석 도구](_scripts/analyze_p1a.mjs).

평가 시계와 별도 취득 공개 집계를 고정한 통제 재생이다. 실제 당시 화면 관측이나 SHA 시점 DB 복원으로 해석하지 않는다.

## 바로 실행할 재개 절차

1. `git status --short`로 다른 AI·미커밋 변경을 확인한다. reset/clean하지 않는다.
2. 원격 main과 분석 브랜치의 최신 commit을 확인한다.
3. README/PROGRESS/NEXT_SESSION/DECISIONS를 읽고 원격 체크포인트와 파일 상태를 대조한다.
4. 기존 고정 입력을 재생해 저장 결과와 비교한다.
5. main 변경을 코드/자료로 구분한다. 기존 manifest·fixture를 새 자료로 덮어쓰지 않는다.

```sh
git fetch origin main
git log -1 origin/main
git log -3 analysis/recommendation-masterplan
node docs/recommendation-masterplan/_scripts/analyze_p1a.mjs
git diff --name-status 1f0b0b5 origin/main
```

## 다음 분석 단위 — 아직 실행하지 않음

**P1-A 다중 시점 보강 → P1-B 배열 편향 정량화.**

1. 새 main의 기상 자료와 유효 평가 시계를 별도 manifest로 고정한다. 최초 입력은 보존하며 자료·시계 변화의 효과를 알고리즘 변화와 구분한다.
2. 새 입력의 제보 on/off 및 적격·결측·표시 분포를 재집계한다. 신규 자료를 같은 코드에 넣은 결과부터 비교한다.
3. docs/_scripts에 별도 shuffle 도구를 작성한다. 초기 계획은 고정 seed의 Fisher-Yates 1000회다. 실험 횟수이며 생태 점수나 확률이 아니다. siteData 순서만 바꾸고 시계·날씨·조석·공지·제보는 유지한다.
4. 두 제보 시나리오에서 선발 집합 교체율, 순서 변동, 장소별 포함 빈도, 유형·지역 구성을 각각 기록한다. 지역 분모는 등록190과 국내188/중국2를 구분한다.
5. 안전 false/unknown, 만조·선상 관문과 민감 보호가 동일하게 유지되는지 검사한다.
6. 현행 stableOrder/core/id와 설명 가능한 안정 동점 규칙을 설계·비교한다. 정책 도입 승인은 아직 없다.
7. 결과·가설·한계·다음 작업을 갱신하고 전용 브랜치에 commit/push한다. 이후 P1-C 자료 계약과 P1-D 정원 대조로 진행한다.

## 이어서 읽을 코드

- index.html: weeklyDaylightCandidates, weeklySeasonalBestWeatherDay, weeklyDatePolicy, weeklyTideWeather, weeklyTideNearestSample, weeklyUsableHighTides, weeklyRecommendationForSite.
- 순위/설명: weeklyRecentReportBonus, weeklyRankScore, weeklyRecentTieBreak, autumnFieldRank, autumnBalancedRecommendations, todayRecommendedSites, weeklyPanelRecommendations, v251EffectiveScore.
- 신선도: storedWeatherState, weatherLatestDue, weatherTodayForSite.
- 생성기: update_weather.py의 score_weather/build_week_days.
- 공개 집계: public.js의 handleRecentSites, shared.js의 isSensitiveReport/splitSpecies.
- 데이터 요구: canonical/data.js의 checklistFromReport와 long-term-db 스키마.

기존 compare_p0 스크립트는 ffd6506/10:12/옛 fixture를 고정한다. 이번 최신 자료용 도구와 혼동하지 않는다.

## 미해결 질문과 미검증 가설

같은92를 방문 시간창·환경·목적으로 구분할 수 있는지, 배열 편향이 얼마나 큰지, 어떤 동점 규칙이 적절한지는 아직 검증하지 않았다. 종명 문자열과 종별 관찰일, 독립 관찰자·노력량 부재가 최대16점 정책에 미치는 영향도 남았다. 생성 시각/due 조건은 재현했지만 실행 원인·갱신 계약 개선은 후속 조사 대상이다. 새 배점·정원·API·생태 예측력·개발 범위는 미확정이다.

## 보호와 승인 경계

운영 추천/자동JSON/좌표 수정, main 병합, Pages/Worker 배포, D1 쓰기, 실제 제보·현장소식 등록을 하지 않는다. 민감 원위치와 개인정보를 외부 공개하지 않는다. 연구·분석 문서는 단계별 재승인 없이 진행하며 제품 변경은 구체적 설계와 검증 후 별도 승인 대상이다. 자동 재개·충전은 보장하지 않는다.


## 재개 우선순위 변경 — P1-B 기상 비교 단위 완료

새 고정 자료는 _snapshots/input_manifest_35141c0_2240.json과 두 gzip이다. 기존 _snapshots/input_manifest.json 및 P1-A 결과는 보존됐다. 최신 측정 시계는2026-10-08T22:40:00+09:00, 제보는기존19:32 집계그대로다.

완료: 최신main/동일코드해시, 과거P1-A 핵심결과검사, 동일시계 신·구기상 ON/OFF 비교. 마지막 완료커밋은 이 단위 commit/push 후 git log -1로 확인한다(이전 c968c6c).

다음: 실제 todayRecommendedSites에서190 siteData Fisher-Yates1000회×ON/OFF, 독립tuple선발대조, prefix동점경계통계, 세 대안 비교. P1-B 완료 후P1-C/D를 설계하며 운영파일을 수정하지 않는다.