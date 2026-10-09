# PR13 C1·C2·C3 최종 — 로더·발행출처 독립 보안 검토

head `2e485079a34fa5aeeef09e82f3b996bf2696d978`, before `352315a57d038687807dbe0044c136a22fb0c9c5`, main `b0975cad9f3112af38cc286a892bf6f06722ce12`.

## 권고: 수정 필요

기존 C3 차단 사유인 후속 요청의 이전 발행자료 적용은 수정됐다. **기존 Node8조건 8/8, Chrome5폭의 기존40조건 40/40**을 정상 안전 기대값으로 확인했다. 결함을 재현하지 못하면 예외를 던지는 이전 시험이나 exit0을 통과로 읽지 않았다.

확장 검증은 **Node28조건 23통과·5실패·예외0**, **Chrome140조건 115통과·25실패·예외0**이다. 같은28조건을5폭 반복한 수이며 일반603 회귀와 별도다. 확장20조건 중15조건이 통과했고5조건이 실패했다. 실패한5조건은 두 종류의 계약 결함이며, 각5폭에서 동일하게 발생했다.

## 1. 미래 발행시각 high-water 고정 — 새 C3 회복 회귀

평가 `2026-10-10 11:00 KST`, generatedAt `12:30 KST`인 today/week는 출처 부적격으로 추천0이 된다. 그러나 실제 loader는 그 자료를 적용하고 high-water로 사용한다. 이후 정상 발행 `10:50 KST`는 `next<=have`로 거부되어 빈 목록이 복구되지 않는다.

최신 정상10:40이 먼저 있어도 미래12:30은 적용되어 추천1→0으로 지우고, 다음 정상10:50을 거부한다. 미래 출처를 적격으로 추천한 것은 아니다. **불적격 발행을 비교 기준으로 고정해 정상 복구를 차단하는 문제**다.

정확 before/head actual 함수 동일 입력 비교(`chronology_comparison.json`):

| 경로·조건 | before352 | head2e485 | 해석 |
|---|---|---|---|
| today 미래 first→정상1050 | 카드0→1 | 카드0→0 | 정상 복구 차단은 새 C3 회귀 |
| today 정상1040→미래1230→정상1050 | 카드1→0→1 | 카드1→0→0 | 미래 입력으로 일시 소실은 기존에도 있으나 이후 복구 차단은 새 회귀 |
| week 미래 first→정상1050 | 카드1→1 | 카드0→0 | before의 미래 잘못 추천은 C1이 해결, 별도로 정상복구를 C3이 차단 |
| week 정상→미래→정상 | 카드1→1→1 | 카드1→0→0 | 전체를 새 안전 회귀라고 하지 않음; C1 제외는 개선, C3 high-water의 복구 불능은 결함 |

코드: `index.html:4540 birdmapDataTime`는 엄격 parser만 적용하고 현재 시각 이전이라는 발행 자격을 확인하지 않는다. `4541 loadBirdmapData`가 이를 have/next 비교에 사용한다. `4564 loadWeatherToday`, `4580 loadWeatherWeek`가 currentData를 제공한다. `3724 weeklyDocVerified`가 미래 발행을 거부하는 선발 조건과 로더의 비교 기준이 불일치한다.

수정 요청: 미래/무효 발행을 **검증된 high-water**로 삼지 않는다. 최초 수신과 이미 정상 자료가 있는 경우 모두 정의하여 known-invalid 발행이 정상 자료를 지우거나 복구를 막지 않게 한다. 단순히 비교를 제거해 이전 발행을 다시 허용해서는 안 된다. 후보/최종 C 정책과 오류 시 정상 자료 유지, 정상1050 복구를 actual loader→DOM으로 확인한다.

## 2. 최신 root·과거 eligible item — 기존 미완결 계약 및 C3 잔여 안전 역전

만조12:00·wind3·wave0.3, 공지/일반종 제보 가점16, raw92/rank108의 동일 입력:

1. root/item10:40·강수1mm 수신 → 실제 안전 관문이 추천0으로 제외.
2. 이후 root10:50이지만 item10:30·강수0·own scoreEligible=true·stale=false인 자료 수신.
3. loader가 새 root라 적용한다. `storedWeatherState`(2066)는 item10:30이 current 창에 있으므로 적격으로 판정한다.
4. 실제 최종 추천과 실제 카드 DOM이0→1로 복귀한다. 다시 root/item10:55 정상 자료는 정상 적용된다.

before352/head2e485 모두0→1→1이므로 새로 추가된 회귀라고 하지 않는다. **root 발행순서 보완만으로 장소별 최신 안전 근거의 rollback을 막지 못한 잔여 계약 결함**이다. 현재 창을 통과한다는 사실과 최신 이미 확인한 item보다 과거라는 사실은 다르다.

수정 요청: 적격 item의 발행 근거가 이미 확인한 newer item보다 과거일 때 안전 추천을 되살리지 못하도록 출처 일관성 또는 item별 버전 정책을 정의한다. 단순 root 시간 최신만으로 older eligible item을 승격하지 않는다. 이전 참고자료·날씨/조석 참고표시를 제거하거나 새 age/B 정책을 임의로 도입할 필요는 없다. 정상 일관된1055 item과 정상 provider component fallback은 유지한다.

### 생성·validator 교차 검토 및 한계

실제 Python 생성기는 배치에서 `now`를 captured `target`으로 사용(`update_weather.py:929~930`), 정상 성공 item generatedAt을 target으로 저장(508~512), root generatedAt을 같은 now로 저장(1048). previous 재사용은 stale=true·scoreEligible=false·saved_reference로 표시(990~993). **이 정상 경로가 older eligible item 충돌을 생성한다는 증거는 없다.** 운영 빈도/사고를 측정하거나 실제 비신뢰 유입을 주장하지 않는다.

다만 실제 `validate_weather.py`에190ID의 합성 계약 배치를 넣으면 정상 root/item1050, root1050/eligibleitem1030, 미래 root/item1230을 모두 수락한다. `validate_weather_week.py`는 미래1230을 거부했다. 고정시계11:00, 결과만 `validator_batch_cases.json`에 저장했고 합성 자료를 운영 예측으로 설명하지 않았다. 따라서 정상 생성 경로의 방어는 존재하지만 불일치 입력을 frontend/validator가 모두 막는다고 승인할 수 없다.

## 통과한 범위 및 시험 격리

- 먼저 보낸 요청의 늦은 응답 차단(today/week).
- newest1040/rain1→old1030/rain0에서0 유지→new1050 정상 복구(today/week).
- newer 정상 뒤 older 위험/참고/부적격에서 정상 유지.
- 같은 발행시각·다른 updated/내용 충돌 차단.
- 결측/비정상 발행자료가 기존 검증 자료를 덮지 않음.
- 무효 first→후속 정상 복구(미래를 제외한 bad-time).
- 자정 절대시각 순서(today/week), root old/item new 차단, today/week 독립 high-water.
- today가 다음 갱신 due 뒤 적격을 잃고 old 자료로 되살아나지 않으며 fresh 자료로 복구. B 지연 예외를 만들지 않음.
- 네트워크 오류에 아직 current인 정상자료 유지, 부적격 today 뒤 정상 week 대안 복구.
- raw92와 rank108 유지.

Chrome 폭344·375·768·1024·1440, 완전한 exact head HTML과 실제 Leaflet·제품 로더·selector·카드 renderer 실행. 최초 실제 toggle 요청 종료 후 reset에서 toggle을 반복하지 않아 이전 fixture 비동기 혼입을 통제했다. URL을 구분하고 actual 기준 상태를 함께 검사했다. 이번 시험은 카드 DOM이며 팝업 DOM/실기기 배포를 했다고 확대하지 않는다. 제품 전체 권한·CI·회귀·고정176후보는 부모 검증 범위다.

## 잔여 보안 과제 변경 범위

- API/shared/admin/canonical persistence·today generator/validator·workflow·배포설정 등 조사13blob 중12개 before/head 동일. 유일한 변경은 C1의 `validate_weather_week.py`. 기존 field 관련8함수 main/head hash 동일. C3가 field 권한/승인 정책을 확대하지 않았다.
- **R5 별도 P2 유지:** actual guard4함수 hash와6조건×2버전 결과 동일. 400자리 형식 문자열의 Infinity 수락과 JS/Python 차이가 남는다. Python today validator가 이를 모두 거부한다고 쓰면 오류다. 정상 생성기 finite 차단과 inf 출력에 대한 validator/workflow 방어의 기존 근거, 비신뢰 weather 쓰기 경로 미확인 범위를 유지한다. 실제 유입 확인 시 선행 차단으로 격상한다.
- **삭제 후 old GET 별도 P1 우선:** actual owner-delete handler·in-memory SQLite·actual loadFieldUpdates로 재현 유지. delete200→fresh 제외→old GET UI/marker-renderer count 재등장, DB deleted·final fresh 제외 유지. renderer는 대역이며 실제 Leaflet 삭제 DOM이라고 하지 않는다. 서버 철회 유지·fresh GET 제외·권한/새경로 확대 없음이 별도 후속 근거다. 실제 개인정보/민감 위치 철회 요구 또는 사고 확인 시 선행 차단으로 격상한다. current `loadFieldUpdates:5243`.
- **보호 상태 old 응답 P1 / 보호 전환 전 필수 차단:** actual old hidden false가 newer true를 되돌려 안내를 복귀하는 기존 현상 유지. 새 field 보호 전환 권한은 추가되지 않았다. backend 재분류·field hide·S1-P 전환 배포 전에는 반드시 요청/자료 버전·marker/popup/guide/cache 회수를 보완한다. `fieldGuideStart:5453`, `fieldPublicPoint:5502`, `fieldNewsNavigate:5644`.
- **S1-P 별도 승인 정책 유지:** S1-R 표현 방어는 승인 후 전면 비공개·site-history/고정점 간접연결 회수 완료가 아니다. 실제 민감행 존재·운영 노출 건수/사고는 조회하지 않았다.

## 산출물·재실행

- `final_cases.mjs` — 두 환경에 공유한28조건, 모든 기대는 안전 통과 기준이다.
- `loader_final_node.mjs TARGET_FINAL_ARCHIVE OUT` — 실제 함수28조건; fail이면 exit1.
- `loader_final_dom.mjs TARGET_FINAL_ARCHIVE OUT` — 실제 Chrome140조건; fail이면 exit1. LOADER_WIDTHS=375면 대표폭만 실행.
- `loader_previous_node.mjs BEFORE352_ARCHIVE OUT 352315a57d038687807dbe0044c136a22fb0c9c5` — 동일 입력 비교. Git 밖 archive는 BIRDMAP_AUDIT_GIT=원 저장소로 canonical blob을 대조한다.
- `chronology_comparison.json`, `validator_batch_cases.py/json`, `source_unchanged.json`, `r5_js.json`, `pr13_c_existing_policy.json`, `actual_delete_race.json`.

Node 네트워크0. Chrome 로컬 합성 API와 정적 CDN GET/HEAD만 허용, Worker는 navigation 이전부터 합성 응답. 운영 POST·DELETE·D1 쓰기0·제품/Git 수정0·민감 원좌표 출력0. 별도 안전정책을 구현하지 않았다.
