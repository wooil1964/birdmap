# PR #13 R6 — 선발 출처 계약 및 잔여 보안 독립 재평가

head **e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6** / before **8ccb248faa2c5c7b5a6019d12e19e21031169460** / main **b0975cad9f3112af38cc286a892bf6f06722ce12**.

## 권고: C — 알려진 무효 예보의 후보·최종 선발은 배포 전 차단

R6가 카드와 팝업의 출처 판정을 통일한 것은 타당하다. 그러나 화면에 미확인을 표시하는 것과 안전 추천의 선발 자격은 별개다. **정상 forecast 날짜/시각이 없는 자료 또는 추천일과 명백히 다른 날짜의 예보가 원점수92·가점16·rank108으로 최종 목록에 남는 실제 함수 경로**를 재현했다. 이 조건을 단순히 현재성 갱신 지연과 같은 참고 허용 정책으로 승인할 수 없다.

단, `_weatherState.scoreEligible=false`인 모든 자료가 물리적으로 위험하다고 단정하지 않는다. 동일한 추천일·정상 예보 시각·유효한 원자료가 있고 생성 예정 갱신만 지연된 경우는 **B — 명확한 별도 신선도/선발 정책 및 사용자 승인**을 논의할 수 있다. known-invalid 날짜/시각은 이 논의에서 제외해야 한다. 현재 구현은 둘을 함께 후보로 남기므로 전체 그대로 유지하는 A는 권고하지 않는다.

## 실제 제품 재현

정확 archive의 index.html을 Git blob과 CRLF 정규화 후 일치 확인. 실제 제품 함수를 추출하여 평가시계를 **2026-10-10 11:00 KST**로 고정했고 guard를 교체하지 않았다. 주간 자료 null, 갯벌site14/합성 일반site501, 공지, 최근 일반종4문자열 가점16, 원점수92/own true/빈목록, 풍속3·강수0·파고0.3을 사용했다. 실제 site14 속성과 weather_rules를 쓰고 좌표는 출력하지 않았다. Chrome DOM 시험이 아니라 실제 추천·표시 함수 시험이며 DOM 검증은 별도다.

9조건×2경로 = **18조합**. before/head 모두 candidate14/final14로 같고, head에서 current 적격2·reference 부적격12가 최종에 남았다. 이 개수는 합성 조건 분류이며 운영 빈도 아니다.

| 조건 | 갯벌 후보/최종 | 일반 후보/최종 | head 출처/표시 | 독립 판단 |
|---|---|---|---|---|
| 정상 생성10:30·예보오늘12:00 | 유지 | 유지 | current true·92점 | 정상 대조군 |
| 예정 갱신 이전 생성06:10·예보오늘12:00 | 유지 | 유지 | today_reference false·미확인 | 시간 대표성은 정상; 신선도 정책 B 논의 가능 |
| 미래 생성12:30 | 유지 | 유지 | today_reference false·미확인 | 생성 시간의 신뢰성 모순; 정상 근거로 승격 금지 |
| 생성 시각 bad-time | 유지 | 유지 | today_reference false·미확인 | 생성 신선도 검증 불능 |
| item/root 생성 시각 모두 없음 | 유지 | 유지 | today_reference false·미확인 | 생성 신선도 검증 불능 |
| raw.date오늘·forecastTime어제12:00 | 유지 | 유지 | previous_saved false·미확인 | **known-invalid 날짜: C** |
| forecastTime bad-time | 제외 | 유지 | previous_saved false·미확인 | **일반은 예보 대표 시각 검증 불능: C** |
| forecastTime 없음 | 제외 | 유지 | previous_saved false·미확인 | **일반은 예보 대표 시각 검증 불능: C** |
| canonical previous_saved/raw false/stale true | 제외 | 제외 | 미확인 참고만 | 기존 false/stale 정상 차단 |

특히 raw.date=2026-10-10, forecastTime=2026-10-09 12:00, 만조=2026-10-10 12:00인 갯벌은 **절대 차이1440분**인데 실제 후보·최종·수치안전=true다. raw.date와 time-of-day minutes만으로 검사해 gap0처럼 통과한다. 후보는 mandatory true·raw92·rank108·bonus16이고 카드/팝업은 모두 미확인이다. **강수/파고의 수치 안전 통과를 유효한 같은 만조 기상 확인으로 해석할 수 없다.** 실제로 강풍/강우였다는 운영 관측이나 사고 발생 주장도 아니다.

이 selector 동작은 before에서도 같았다. R6가 새롭게 후보를 추가한 회귀라고 주장하지 않는다. R6는 출처 무조건true를 교정했으나 **명백히 잘못된/불명 출처의 선발까지 해결하지 않았다는 현재 차단 사유**다. previous_saved raw scoreEligible=false 자체는 차단하므로 모든 이전저장 자료가 우회한다고 확대하지 않았다.

## S2-A 설계와 대조

`docs/recommendation-masterplan/P1_SAFETY_DESIGN.md` §9:
- source sample/raw score와 own eligibility true는 필요한 원자료 계약이다.
- 개념 조건은 rawValid ∧ eligibilityValid ∧ requiredDataValid ∧ 기존 시각/안전/계절 관문이다.
- forecastTime/date/envelope·기존 freshness는 별도 시각/출처 관문이며 점수 유효성으로 덮어쓰지 않는다.
- false 이전자료는 참고 기상·조석을 남기되 추천/현재 적합도와 분리한다.

정확히 구분할 점: 현재 행렬의 raw.scoreEligible은 true이며 false는 adapter의 `_weatherState`에 있다. 이것을 raw false 우회로 잘못 설명하지 않는다. raw 타입·값 검증 통과만으로 **known-invalid forecast 날짜/시각**이 정상 시각 관문을 통과한 것은 아니다. S2-A를 typed raw만으로 축소하여 위 시각/출처 조건을 생략하는 것도 설계와 다르다.

별점 미확인 표시만으로 안전 선발 문제를 해결했다고 할 수 없다. 원점수에 따른 rank와 mandatory/정원이 해당 장소를 최종에 올리므로 참고자료를 유지하더라도 추천 선발의 자격과 사용 사유를 따로 정해야 한다.

## 코드 위치와 보완 요청

정확 head index.html:
- **2066 storedWeatherState**: 날짜·forecast timestamp·generated timestamp·예정 갱신을 판별해 false/reference를 만든다.
- **3872 weeklyTodayRecommendable**: raw own score/eligibility/필수자료는 검사하지만 timestamp 검사를 하지 않는다.
- **3882 weeklyTodayWeather**: stored state를 전달하되 false state도 객체를 반환한다.
- **3894~3906 weeklyTideWeather**: raw.date 및 minutes로 ±90분 검사; 절대 forecast 날짜를 대조하지 않는다.
- **4018 weeklyWeatherEntryForSite**: raw.date가 주간 범위인지만 확인하고 reference 객체를 채택한다.
- **4117**: final entry에 dayScore 숫자 유효성만 확인한다.
- **4183 weeklyRecommendationIsSafe**: 강수/파고 caution만 확인, 출처 부적격은 검증하지 않는다.
- **4190 todayRecommendedSites**: 유효 score 및 caution false만 제외하고 rank/mandatory/fill에 전달한다.

수정 지시(검증자가 구현하지 않음):
1. 최소한 날짜 불일치·invalid/absent forecast timestamp·검증 불능 출처는 후보/최종/rank에 사용하지 않는다. 참고 팝업 기온·풍향·조석은 유지한다.
2. 만조는 raw.date 문구와 minutes만 맞추지 말고 **실제 forecast timestamp와 tide timestamp의 절대 차이±90분**을 같은 timezone 계약으로 확인한다. 실제 미래예보 자체는 유효할 수 있으며 미래 generatedAt와 혼동하지 않는다.
3. 다른 적격 주간 예보/대체 만조를 먼저 찾아 유지한다. 공지/제보16/mandatory/정원보충이 부적격 자료를 되살리지 못함을 actual final로 검사한다.
4. 단순 예정 갱신 지연을 별도로 허용하려면 유효 forecast timestamp/동일 추천 날짜/확인 가능한 생성시각/지연 정책과 표시·내부점수 사용의 조건을 명시하고 사용자 승인 후 적용한다. 검증자가 임의 max age/점수/생태정책을 만들어서는 안 된다.
5. 카드/팝업 일치 검사와 별개로 actual candidate/final/rank 검사에 위 최소18조건 및 90/91 절대시각 경계를 추가한다. unknown score metadata/previous_saved false 등 R1~R3 기존 차단을 유지한다.

## 잔여 보안 과제: 새 차단과 분리

### 불변 확인

before/head의 API/shared/admin/canonical persistence, weather generator/2validator, weather workflow, public/admin/proxy 배포 설정 **13파일 Git blob hash 동일**. main/head 관련 field8함수 hash 동일. 새 diff는 today 출처 adapter와 호출부이며 R5/field 권한/승인 공개 정책을 확대하지 않았다. 이전 R4 보고 전체를 반복하지 않았다.

### R5

before/head 실제 정규식 guard의 hash 동일; 정상/400자리 wind/rain/wave/trim/Arabic digit 6조건×2버전 최소 재실행 결과 같음. 400자리 문자열은 여전히 수락되고 Number는 Infinity. 이전 실제 Python 생성기의 float finite 차단 및 hypot inf에 대한 배치 validator 거절 근거는 함수13파일 불변으로 유지된다. 이번 R6의 선발 출처 결함을 R5로 설명하지 않는다. R5는 현재 확인된 정상 생성/권한 경로에서 별도 P2 방어 과제로 유지한다.

### 삭제 후 old GET — P1 우선 후속, 이 PR의 별도 선행 차단으로 확대할 근거는 아직 없음

새 head의 **actual owner-delete handler+인메모리 SQLite+actual loadFieldUpdates**로 최소 재실행했다. old GET snapshot을 먼저 만든 후 delete200→새 GET에서 제외→old GET 완료 순서에서 fieldUpdates와 marker-renderer count가 재등장한다. 이후 actual DB 상태는 deleted이고 final fresh GET은 계속 제외한다. 렌더러/DOM은 대역이며 실제 Leaflet DOM을 실행한 시험으로 보고하지 않는다.

이 결함은 실제 공개 삭제 권한으로 도달 가능하고 철회된 내용·장소가 UI에서 안내될 수 있으므로 P1 개인정보/상태 보존 과제다. **분리 근거는 단순히 ‘기존 문제’가 아니다:** 서버 삭제 유지, fresh 공개 GET 제외, 삭제 권한 오남용 없음, R6에서 field 데이터/권한/캐시의 확장이 없다는 직접 증거다. 실제 민감 위치 회수 조치가 필요한 릴리스이거나 비동의 정보 공개가 확인되면 즉시 해당 공개를 보류/회수하며 선행 차단으로 격상해야 한다.

후속은 request generation/serverTime monotonicity 및 owner-delete tombstone, marker/popup/news/guide/cache 동시 회수이다. pendingGET→delete200→fresh 제외→old 완료→계속 제외 시험을 필수로 둔다. DB 삭제만 성공한 것을 UI 철회 완료로 보고하지 않는다.

### 보호 상태 전환 및 S1-P

actual late-response hidden 역전/기존 대략 안내는 main/head 각3진단 =6재현으로 확인했다. JSON passed6은 **결함 현상 재현 assertion 성공**이지 보안 기능 통과가 아니다. 공개 field status/confirm/delete는 location_hidden을 수정하지 않고 새 보호 상태 전환도 R6에 추가되지 않았다. 따라서 현재 PR 단독과 분리 가능하지만 **backend 재분류/field hide/S1-P 보호 전환 배포 전에는 반드시 old응답으로 보호/안내가 복귀하지 못하게 차단**해야 한다.

approved/site-history의 기존 위치 연결과 field stored flag 신뢰, 대략 popup 안내는 여전히 별도 S1-P 정책이다. 이번 PR을 승인후 전면 비공개 완료로 승인할 수 없다. 신규표현 방어 통과와 기존 불완전한 flag 행의 소급 보호는 다르다. 운영 민감행 존재·건수/승인 의도/실제 사고는 조회하지 않았다.

## 산출물·정확 실행

`reference_selection.mjs TARGET_E9C_ARCHIVE OUT` — 현재18조합.
`reference_selection.mjs BEFORE8CCB_ARCHIVE OUT 8ccb248faa2c5c7b5a6019d12e19e21031169460` — 동일 이전18조합.
`source_unchanged.mjs REPOSITORY OUT` —13파일 canonical hash.
`r5_independent.mjs REPOSITORY OUT` — 실제12 guard 조건.
`pr13_r6_existing_policy.mjs REPOSITORY OUT` — actual6 기존현상.
`actual_delete_race.mjs TARGET_E9C_ARCHIVE OUT` — actual handler/DB 삭제 상태 및 actual 프런트 지연응답.

모든 시험 네트워크0·운영D1쓰기0·제품 수정0·민감 원좌표 출력0. 운영 빈도나 실제 위험 기상 발생을 추정하지 않는다. root 검증 문서 작성/commit 작업은 별도로 수행하며 본 agent는 temp에만 결과를 저장했다.
