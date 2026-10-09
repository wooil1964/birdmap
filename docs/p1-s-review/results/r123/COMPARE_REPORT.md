# PR #13 1bd2619 재검증 — 동일 입력 추천·표시 계약 독립 재현

## 판정 범위

**고정 정상 자료의 추천 회귀 항목은 통과했다.** 이 결과는 전체 PR의 공개 정보 보호·모든 점수 오류·브라우저·병합 승인 판정을 대신하지 않는다. 제품 코드/Worker/D1/운영 API/원본 제보는 변경하거나 조회하지 않았다.

- 이전 코드: `35141c04d4fd152982b1f4683d5b7a6f4f7514e5`
- 검증 시 최신 main: `38b45299c832b8ab8ad549762c02979fa8ddfb28`
- 이전 PR head: `7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e`
- 새 PR head: `1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c`
- 평가시계: **2026-10-08 22:40 KST**
- 입력: 35141c0 고정 기상 week/today·조석·공지·규칙·190곳, 과거 공개 승인 제보 11곳(24개 종명 문자열).
- `input_manifest_35141c0_2240.json`의 16파일 원본 SHA256 및 공개 제보 SHA256 `af77014b5430d7b15d42dd77de8e4ec2a841e48b5151298a7013e3875c4757b6`를 모두 검증했다. PR fixture도 동일 bytes였다.

## 독립 실행 방법과 결과

PR 제공 compare 스크립트의 결과를 전제로 쓰지 않고 별도 harness에서 actual `index.html` 함수를 추출·실행했다. 실제 `monthTideForSite`, `todayKstMonth`, 표시 점수와 기상 상태 함수를 포함하며 고정 `weather_today.json`도 주입했다. 네 버전의 190곳 전체 siteData와 좌표 벡터를 대조하고, ON/OFF 각각 모든 후보 객체(좌표 포함)의 정렬된 JSON signature를 비교했다. 좌표 벡터 자체는 산출물에 출력하지 않았다.

| 조건 | 이전351 | 최신main38 | 이전PR7eb | 새PR1bd |
|---|---:|---:|---:|---:|
| 전체 탐조지 | 190 | 190 | 190 | 190 |
| 제보 ON 후보/제품 안전조건 통과 후보 | 176/176 | 176/176 | 176/176 | 176/176 |
| 제보 OFF 후보/제품 안전조건 통과 후보 | 176/176 | 176/176 | 176/176 | 176/176 |
| 정상 입력 후보·탈락·점수·날짜·유형 객체 변경 | 기준 | 0 | 0 | 0 |
| 정상 상위10 위치·점수·가점·표시·순서 변경 | 기준 | 0 | 0 | 0 |
| 독립 tuple/정원 선발과 제품 선발 일치 | ON/OFF | ON/OFF | ON/OFF | ON/OFF |

원점수·표시점수·내부 순위점수·가점·관찰 최신일/나이/문자열 수·추천 날짜/시간·axes/season/rule/region·mandatory/priority·추천 근거가 같았다. 후보의 gate 값은 모두 true였으며 14곳은 모든 버전에서 동일하게 후보가 없었다. “기상적으로 항상 안전”을 뜻하는 것이 아니라 이번 입력의 제품 safety predicate가 같다는 검증이다.

## 제보 ON 상위10 — 네 버전 동일

| 순위 | ID / 탐조지 | raw | display | rank | bonus | 추천 날짜·시각 | 추천 축 |
|---:|---|---:|---:|---:|---:|---|---|
| 1 | 108 호곡리 | 92 | 92 | 103 | 11 | 10-09 09:00 | field |
| 2 | 112 알뜨르비행장 | 100 | 100 | 100 | 0 | 10-13 09:00 | field |
| 3 | 15 천수만 사기리 | 92 | 92 | 94 | 2 | 10-09 09:00 | field |
| 4 | 194 천수만 강당리 | 92 | 92 | 94 | 2 | 10-09 09:00 | field |
| 5 | 126 해리천습지 | 92 | 92 | 94 | 2 | 10-09 09:00 | mudflat |
| 6 | 14 걸매리 | 92 | 92 | 92 | 0 | 10-11 18:00 | mudflat |
| 7 | 107 매향리 | 92 | 92 | 92 | 0 | 10-11 18:00 | mudflat |
| 8 | 48 대진항 | 92 | 92 | 92 | 0 | 10-09 09:00 | pelagic |
| 9 | 195 평화의공원 | 92 | 92 | 108 | 16 | 10-09 09:00 | other |
| 10 | 3 굴업도 | 100 | 100 | 100 | 0 | 10-09 18:00 | other |

추천 축은 서식환경 또는 canonical weather rule과 같은 분류가 아니다. 내부 rank108은 bonus를 더한 점수이며 원점수0~100 계약에 제한되어서는 안 된다.

## 제보 OFF 상위10 — 네 버전 동일

| 순위 | ID / 탐조지 | raw/display/rank | bonus | 추천 날짜·시각 | 추천 축 |
|---:|---|---|---:|---|---|
| 1 | 112 알뜨르비행장 | 100/100/100 | 0 | 10-13 09:00 | field |
| 2 | 7 교동도 | 92/92/92 | 0 | 10-09 12:00 | field |
| 3 | 8 석모도 | 92/92/92 | 0 | 10-09 18:00 | field |
| 4 | 10 강화도 | 92/92/92 | 0 | 10-09 09:00 | field |
| 5 | 126 해리천습지 | 92/92/92 | 0 | 10-09 09:00 | mudflat |
| 6 | 14 걸매리 | 92/92/92 | 0 | 10-11 18:00 | mudflat |
| 7 | 107 매향리 | 92/92/92 | 0 | 10-11 18:00 | mudflat |
| 8 | 48 대진항 | 92/92/92 | 0 | 10-09 09:00 | pelagic |
| 9 | 3 굴업도 | 100/100/100 | 0 | 10-09 18:00 | other |
| 10 | 5 대청도 | 100/100/100 | 0 | 10-09 18:00 | other |

ID별 실제 명칭은 결과JSON을 기준으로 하며, 수량 문자열 정규화나 제보16점/정원4·3·1·2 정책을 새로 적용하지 않았다.

## S2 결함 합성 재현은 별도 입력으로 분리

동일 week를 복제한 후 공개 제보가 있는 11곳의 scoreEligible=true 표본에만 score=null을 넣었다. 정상 입력 실험과 혼용하지 않았다.

- 이전351/main38: 후보176, 결측을 0점으로 해석한 후보 **11곳(10,15,16,34,37,108,126,136,164,194,195)**.
- 이전PR7eb/새PR1bd: 후보165, 해당11곳 후보 제외, 가짜0점 후보 **0곳**.
- 합성 입력에서 이전 top은 `112,7,8,20,126,14,107,48,3,5`, 두 PR top은 `112,7,8,20,14,107,9,48,3,5`다. 이 변화는 결측 후보 차단이라는 의도된 S2 변화이다.
- 모든 12회 선발(정상8 + 합성4)은 별도 tuple/정원 계산과 일치했다. 정상 0점 허용 및 모든 fallback·만조·공지 우회 검증은 다른 안전 회귀와 합쳐 판정해야 한다.

## S1-R와 S2 영향 구분

이미 공개된 11곳 집계의 24 문자열을 old/이전head/새head 실제 `isSensitiveReport`에 적용하면 세 코드 모두 민감 판정0곳이다. 이 고정 제보 입력에서 정상 top 변화가 없는 이유와 일치한다. 동박새2 같은 일반종 숫자 문자열은 재작성되지 않았고, 평화의공원의 speciesCount12/bonus16/rank108도 유지됐다.

단, 공개 집계에는 원본행별 메모·관찰일·승인/위치가리기 flag·행→탐조지 연결 이력이 없다. 이를 임의로 생성해서 실제 운영 집계가 완전히 같다고 주장할 수 없다. S1-R 적용으로 새 API 집계에서 기존 보호종 변형이 제외되어 추천 입력/순위가 바뀌는 것은 **보호를 적용한 데이터 변화**이며, 같은 공개 스냅샷의 S2 정상 회귀와 구분해야 한다. 이 검증은 운영 민감정보 유출의 증거가 아니다.

## 1bd 보완 함수와 표시 계약 독립 확인

코드 diff와 실제 호출에서 다음 변경을 확인했다.

- `weeklyOwn`(index.html 3849행)을 도입하여 `scoreEligible`, `score`, `missingScoreFields`의 상속 속성을 승인 근거로 쓰지 않는다.
- `weeklySampleRecommendable`(3853행)은 own metadata, 유효한 숫자·0~100 점수, 빈 결측 필드 목록을 요구한다. 필수가 아닌 파고라도 값이 있으면 유효한 숫자로 검사한다.
- `weeklyTodayRequiredDataValid`(3865행)은 wind/rain 문자열의 생성 형식을 검증한다. 파고 필수 장소에는 유효한 파고 문자열이 필요하며, 선택 항목도 값이 있으면 형식을 검사한다.
- `weeklyTodayRecommendable`(3872행)이 동일 metadata·필수자료 계약을 사용한다. `storedWeatherState`(2066행)는 현행성 조건과 이 장소별 검사 결과로 표시 허용 여부를 계산한다.
- `weatherScoreAllowed`(2086행)는 이미 검증된 `_weatherState.scoreEligible===true`를 요구한다. 검증 상태가 없는 객체를 별도 임의 허용하지 않는다.

이는 코드 관찰이다. 숫자형 weekly 자료와 문자열형 today 자료의 **모든** 안전 경계 검증은 별도 전체 안전 harness 결과와 합쳐 판단해야 한다.

추가로 이전PR7eb/새PR1bd를 actual `weatherTodayForSite → weatherScoreAllowed/v251ScoreDisplayText/v251EffectiveScore` 경로로 실행했다. 고정 today를 복제하고 합성 시각을 2026-10-08 22:40에 맞춘 **15개 독립 표본 × 2코드=30회 호출**이다. 정상 추천 실험의 입력은 바꾸지 않았다.

| 합성 표시 표본 | 이전PR7eb | 새PR1bd | 새 기대조건 |
|---|---|---|---|
| 정상 0점/92.5점/100점 | 점수 표시 | 점수 표시 | 통과 |
| scoreEligible missing/null/inherited | 92점 표시 | 오늘 적합도 미확인 | 통과 |
| missingScoreFields missing/null/nonempty | 92점 표시 | 오늘 적합도 미확인 | 통과 |
| wind/rain null | 92점 표시 | 오늘 적합도 미확인 | 통과 |
| 선택 wave null | 92점 표시 | 92점 표시 | 통과 |
| 선택 wave malformed | 92점 표시 | 오늘 적합도 미확인 | 통과 |
| 필수 wave null | 92점 표시 | 오늘 적합도 미확인 | 통과 |
| 검증 상태 없는 직접 raw 객체 | 92점 표시 | 오늘 적합도 미확인 | 통과 |

정상 0점·소수·100점이 허용되고 참조용 기상 객체/남은 wind/rain은 유지되는 것을 확인했다. 별 개수는 입력에 기존 grade가 있으면 그 grade를 사용하므로, 이 합성 검사는 별도 점수→grade 산식 재설계를 주장하지 않는다. 새 표시 기대조건 15개는 모두 통과했다. 결과와 전체 실행 경로는 `display_provenance_spotcheck.json/mjs`에 보존했다.

## 새 PR 제공 스크립트 독립 검토

새 제공 `.github/scripts/compare_p1s_recommendation.mjs`를 네 코드로 별도 실행했다. 4버전 × ON/OFF 정상8조건 및 합성4조건의 후보 수·안전 후보 수·ID/순서/raw/rank/bonus/date/time/mandatory/basis가 독립 결과와 모두 일치했다.

이번 보완은 **111/114행 전체 후보 signature**를 추가했다. 정상8조건 모두 이 signature가 독립 harness의 같은 필드 subset SHA256과 일치했다. 이전 검토의 “top10만 출력” 범위는 넓어졌다. 남은 범위 차이는 다음과 같다.

- **108행/126행** state에 weatherToday를 주입하지 않는다(79행 기본 null). 고정 today fallback 검증을 이 스크립트만으로 완료했다고 말할 수 없다.
- **111행** signature는 원점수·rank·날짜/시각·mandatory/priority·근거·bonus·기상 문자열의 subset이다. 표시 점수·좌표·axes·관찰일 등 전체 객체의 비교는 본 독립 결과가 추가로 확인한다.
- **86~87행** monthTideForSite/todayKstMonth는 stub이다. 본 독립 harness는 실제 제품 함수를 실행했다.
- **115행** top 출력에는 display 점수가 없다. 본 harness에서 표시 점수를 별도로 비교했다.

위 항목은 고정 정상 재현이 틀렸다는 결함이 아니다. 범위를 명시하고 독립 산출물을 승인 근거에 함께 보존하면 된다.

## 산출물과 재현

```powershell
node independent_replay.mjs <읽기전용 Git 저장소> <분석 스냅샷이 있는 분석 저장소> <결과 저장 폴더>
node .github/scripts/compare_p1s_recommendation.mjs 35141c04d4fd152982b1f4683d5b7a6f4f7514e5 38b45299c832b8ab8ad549762c02979fa8ddfb28 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c
node verify_provided_compare.mjs <결과 저장 폴더>
node display_provenance_spotcheck.mjs <읽기전용 Git 저장소> <분석 스냅샷이 있는 분석 저장소> <결과 저장 폴더>
```

Git 저장소에 위 네 객체가 있어야 한다. 스냅샷 경로는 `docs/recommendation-masterplan/_snapshots`이며 manifest가 참조하는 gzip 자료와 공개 제보 fixture를 읽는다. 탐조지190곳과 제품 함수는 각 커밋의 `index.html` Git blob에서 직접 추출한다. 제공 compare는 새 head checkout 또는 제품 사본에서 실행하고 stdout을 `provided_compare_output.json`으로 저장한다.

- `independent_replay.json`: 4버전×ON/OFF 전체190 결과와 full entry hashes, 4버전 합성 결과, 입력 SHA, S1 집계 판정/한계.
- `provided_compare_output.json`, `provided_crosscheck.json`: 제공 스크립트 별도 출력, 정상8/합성4 대조 통과. 출력 SHA256 `fbef6de85a28567354bdcb98a2d4374cd99b794da25ab6dfa1e71046413d283e`.
- `display_provenance_spotcheck.json`: 합성 표시 15개 기대조건 통과/30호출, 이전/새 코드 대조.

**이 담당 항목의 결론:** 정상 고정 자료 추천·정원·제보 가점·좌표 회귀는 통과했고, 기존 null→0 차단이 유지되며, 이번 독립 표시 표본에서 own metadata·today 필수자료·검증 상태 계약 보완을 확인했다. 전체 PR 승인에는 다른 담당자의 안전 전수·API·브라우저·최신 main 병합 검증을 결합해야 한다.
