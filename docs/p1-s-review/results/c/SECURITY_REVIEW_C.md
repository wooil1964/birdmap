# PR13 C 정책 — 기상 응답 역전 및 잔여 보안 독립 검토

- 검증 head: `352315a57d038687807dbe0044c136a22fb0c9c5`
- 비교 before: `e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6`
- main: `b0975cad9f3112af38cc286a892bf6f06722ce12`
- 이번 agent는 제품·운영·Git·검증 문서를 수정하지 않았다. 이 파일 및 합성 시험 결과만 temp에 저장했다.

## 독립 권고: 수정 필요 — 더 늦은 요청의 이전 발행자료에 의한 안전 추천 복귀

C의 reference/known-invalid 선발 차단과 절대 만조 시각 비교를 이 결함과 혼동하지 않는다. 그 변경은 별도 검증 대상이다. 여기서 확인한 문제는 **이미 받아서 강수 안전 관문으로 제외했던 장소가, 이후 요청에 실린 이전 발행자료로 다시 추천되는 것**이다.

실제 `loadBirdmapData`(index.html:4524)는 요청 번호의 최신 여부와 발행 stamp의 동일 여부만 검사한다. `birdmapDataStamp`(4518)는 generatedAt/updated/date/startDate를 합친 문자열이며 신구 순서 판단을 하지 않는다. 따라서 먼저 발송된 요청의 늦은 응답은 차단하지만, 나중 발송된 요청의 더 오래된 자료는 덮어쓴다. `loadWeatherToday`(4541), `loadWeatherWeek`(4557), `refreshBirdmapData`(4585)에 이 처리가 그대로 사용된다. 이 함수들의 소스는 기존에도 같은 동작이며, 이번 C 변경으로 새로 추가된 로더 회귀라고 주장하지 않는다. 그러나 사용자가 이번 재검증에 명시한 캐시/이전 발행자료 역전 검증에서는 안전 영향이 있는 결함이다.

### 실제 재현

시계 `2026-10-10 11:00 KST`, 정상 today/주간 원자료 계약, 공지 및 일반종 제보4문자열 가점16, 실제190곳 중 공개 site14 속성, 합성 오늘12:00 만조를 사용했다. 좌표는 출력하지 않았다. 예보/만조는 같은 날12:00로 ±90분 이내이고 wind3·wave0.3이다.

1. 새 발행10:40 자료의 강수1mm를 실제 로더로 수신한다. 실제 안전 관문은 추천 카드0으로 제외한다.
2. 이후 **새 요청**이 이전 발행10:30 자료(강수0)를 받는다.
3. 실제 로더가 `true`로 적용하여 최신10:40 자료를 교체한다.
4. 실제 최종 추천과 실제 Chrome 카드가0→1로 복귀한다. 원점수92, 가점16, rank108, sourceEligible=true이다.

10:30과10:40은 모두 같은 갱신 신선도 창 안의 입력이다. 따라서 '이전 발행자료는 참고 상태로만 남으므로 안전하다'는 해석으로 반례가 해소되지 않는다. **지난날/오래된 참고를 current로 잘못 승격한 주장도 아니다.** current freshness 창 통과와 최신 이미 관측한 자료의 순서 보존은 별도 조건이다. 강수1mm에서도 생성기의 score_weather는 유형의 precip3hMax 초과가 아니면92를 생성할 수 있고, 점수와 안전 관문이 별도라는 기존 계약에 부합한다.

이 시험은 합성 응답의 가능 경로 재현이다. 운영 CDN이 실제로 이런 응답을 준 횟수, 해당 시간의 실제 강수, 사고 발생을 관측하거나 추정하지 않았다. 실제 물리적 위험을 단정하지 않으며, **이미 확인한 불리한 최신 예보보다 오래된 유리한 자료를 근거로 추천 복귀할 수 있다는 정보·안전 회귀 위험**을 판단한다.

## 수치와 실행 범위

`loader_replay.mjs`는 실제 소스 함수를 추출해 guard를 바꾸지 않고 실행했다. archive index를 정확 head Git blob과 CRLF 정규화 후 일치 확인했다. 8조건: 불변성4통과·4실패.

| 조건 | 실제 결과 | 불변성 판정 |
|---|---|---|
| first 요청의 old 응답이 second 응답 뒤 도착 — today | first false, new 유지 | 통과 |
| 동일 — week | first false, new 유지 | 통과 |
| later 요청의 old 발행으로 강수 제외를 뒤집음 — today | 새 제외0→old 추천1 | 실패, 안전 영향 |
| 동일 — week | 새 제외0→old 추천1 | 실패, 안전 영향 |
| later 요청의 old 참고로 정상 today를 무효화 | 추천1→0 | 실패, 가용성 영향 |
| later 요청의 old 부적격 week로 정상 week를 무효화 | 추천1→0 | 실패, 가용성 영향 |
| 네트워크 실패 뒤 정상 today 유지 | 최신 stamp 및 추천 유지 | 통과 |
| today 부적격·정상 week 도착 | 추천0→1 week_forecast | 통과 |

`loader_dom_corrected.mjs`는 완전한 제품 HTML/실제 Chrome/Leaflet 로딩/실제 로더/실제 최종 selector/실제 카드 renderer로 같은8조건을 344·375·768·1024·1440px에서 실행했다. **40조건: 불변성20통과·20실패·예외0**. 이는 제품 자동 테스트 실패 건수가 아니라 독립 시험의 요청/발행 순서 불변성 assertion 결과다.

위험 역전10조건(today/week×5폭)은 모두 `afterNew.cardCount=0`, `afterOld.cardCount=1`, `baselineValid=true`, `actualBehaviorReproduced=true`를 필수 확인했다. today 경로의 afterNew.weekStamp는 전부null로 주간 대안이 섞이지 않았고, 복귀 출처는 today_saved였다. 주간 경로의 복귀 출처는 week_forecast였다. 이 시험은 추천 카드 DOM이며 팝업 DOM 시험을 했다고 확대하지 않는다.

### 초기 브라우저 harness 오류 및 정정

초기 loader_dom.mjs/json은 reset이 매번 실제 toggleTodayPanel(true)를 실행해 추가 loadWeatherWeek를 시작했다. URL을 구별하지 않는 직전 fixture가 그 비동기 요청에 들어가 일부 today 기준에 week 자료가 섞였다. 초기의20불변성 실패를 모든 위험 역전0→1 DOM 재현이라고 표현한 것은 정확하지 않았다.

초기 자료는 `loader_dom_initial.mjs/json`으로 보존했고 최종 증거에서 제외한다. corrected에서는 패널을 최초 한 번만 실제 toggle로 열고 그 요청의 microtask 종료를 기다린 뒤 reset은 합성 자료와 실제 renderer만 갱신한다. URL별 응답을 검사하고, 기대하지 않은 요청 및 기준 상태 오염을 예외로 처리하며, 위0→1/assertion을 제거하지 않고 강제했다. corrected_full 별도 폴더의 결과가 최종 증거다.

## 배포 전 수정 지시

1. 요청 generation 차단을 유지하면서 **수신 자료의 발행 metadata가 이미 반영된 자료보다 과거인지** 별도로 판단한다. stamp 문자열의 단순 사전순 비교를 정책으로 만들지 말고 명시된 날짜·시각·출처 계약에 맞춰 비교한다.
2. 같은 발행·잘못된/결측 발행시각·발행시각 충돌·일자 변경·유효 창 만료의 처리를 정의한다. 비교 불능 자료가 기존 최신 근거를 조용히 덮어쓰지 않게 한다.
3. 최신 자료가 위험해서 목록이 빈 경우에도 그 최신 정보를 보존한다. 단지 '이전의 마지막 정상 추천'을 붙잡아 위험 관문을 우회하면 안 된다.
4. 해당 자료가 시간이 지나 current 자격을 잃으면 C에 따라 제외한다. 오류 시 자료를 무기한 적격으로 유지하는 예외 B를 만들지 않는다.
5. actual loader→candidate→final→DOM으로 위8조건, 특히 위험1mm10:40→이전0mm10:30의 today/week0→0 기대를 추가한다. 정상 대안/복구 및 먼저 보낸 늦은 응답 차단도 유지한다.

P0 강수/풍속/파고 임계값은 old 입력에도 여전히 작동한다. 문제는 안전 관문 수치가 느슨해진 것이 아니라 입력의 버전이 뒤로 바뀌는 것이다. 공지/가점16/mandatory가 이미 위험으로 판정한 새 입력을 직접 되살리는 것도 아니며, old 입력이 정상으로 대체되어 최종 추천되는 경로다.

## 남은 별도 보안 — 이번 C로 해결됐다고 보고하지 않는다

### 소스 불변

before/head API/shared/admin/canonical persistence, 기상 생성기·2validator, weather workflow, 공개/관리/proxy 배포 설정13파일 canonical Git blob hash가 동일하다. main/head field 관련8함수도 동일하다. currentness C는 field 권한·승인 공개정책을 바꾸지 않았다. `source_unchanged.json`, `pr13_c_existing_policy.json` 참조.

### R5 — 별도 P2, 실제 생성·배포 유입 근거 변화 없음

실제 JS guard4함수의 before/head hash 동일. 정상·400자리 wind/rain/wave·trim·Arabic 숫자6조건×2버전 최소 실행도 같다. 400자리 형식 문자열을 수락하고 Number는Infinity가 된다. **Python validator도 그 형식 문자열을 수락하는 기존 문제를 'validator가 모두 막음'으로 설명하지 않는다.** 실제 정상 생성기의 큰 수 변환 finite 차단, finite 극단 벡터 hypot overflow의 inf 표시에 대한 validator 차단과 workflow의 commit 전 검증 순서는 기존 소스 불변으로 유지된다. 공개 제보자가 weather JSON을 쓰는 권한 경로는 확인되지 않았다. 형식 입력 방어/JS-Python 숫자 일관성은 별도 P2이며 실제 비신뢰 유입이나 정상 생성 위험이 확인되면 선행 차단으로 격상한다.

### 현장소식 삭제 후 old GET — 실제 P1 후속

새 head의 actual owner-delete handler·인메모리 SQLite·actual loadFieldUpdates로 재실행: old GET snapshot 확보→owner delete200→fresh GET 제외→old GET 완료에서 프런트 항목/marker-renderer count가 재등장한다. 이후 actual DB deleted 유지, final fresh GET 제외도 확인했다. 실제 Leaflet DOM은 실행하지 않고 marker renderer count를 대역으로 사용했음을 JSON에 명시했다.

실제 공개 삭제 권한으로 도달 가능하고 철회한 내용의 UI 복귀가 있으므로 P1 우선 후속이다. 이번 PR의 별도 선행 차단으로 확대하지 않는 근거는 단순히 기존이라는 사실이 아니라 서버 삭제 유지·fresh 공개 GET 제외·삭제 권한 확대 없음·새 데이터/캐시 경로 없음이다. 실제 개인정보/민감 위치 철회 요구 또는 공개 사고가 확인되면 해당 공개를 즉시 보류/회수하고 배포 선행 조건으로 격상해야 한다. request generation/serverTime 순서·삭제 tombstone·marker/popup/안내/cache 동시 회수 시험이 필요하다.

### 보호 상태 역전·S1-P — 정책 전환 전 필수 차단

actual 함수 main/head에서 hidden true 새 응답→hidden false old 응답→일반 길안내 복귀, 기존 protected popup의 대략 안내 경고를 최소 재현했다. JSON passed6은 기존 결함 재현 assertion 성공이지 보안 통과가 아니다. 공개 field status/confirm/delete는 location_hidden을 바꾸지 않으며 report 관리자 hide는 별도 테이블이다. 이 PR에는 새 field 보호 전환 권한이 없다.

별도 P1로 추적하되 backend 보호 재분류/field hide/S1-P 정책 전환 배포 전에는 old 응답이 보호·안내를 되돌리지 못하도록 필수 수정해야 한다. S1-R 표현 방어는 기존 승인 report/site-history 위치 연결·stored flag 신뢰·대략 안내를 승인 후 전면 비공개로 바꾼 것이 아니다. 실제 민감행 존재/건수/승인 의도/노출 사고는 조회하지 않았다.

## 재실행

```
node loader_replay.mjs TARGET_C_ARCHIVE OUT_DIRECTORY
node loader_dom_corrected.mjs TARGET_C_ARCHIVE OUT_DIRECTORY
node source_unchanged.mjs REPOSITORY OUT_DIRECTORY
node r5_independent.mjs REPOSITORY OUT_DIRECTORY
node pr13_c_existing_policy.mjs REPOSITORY OUT_DIRECTORY
node actual_delete_race.mjs TARGET_C_ARCHIVE OUT_DIRECTORY
```

Node 시험의 외부 네트워크0. Chrome은 로컬 API 합성 응답과 기존 정적 CDN GET/HEAD만 허용하고 외부 Worker 요청은 navigation 이전부터 합성 응답으로 처리했다. 운영 POST·DELETE·D1 쓰기0, 제품 수정0, 민감 원좌표 출력0.
