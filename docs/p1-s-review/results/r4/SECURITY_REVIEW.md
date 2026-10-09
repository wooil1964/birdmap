# PR #13 R4 잔여 보안 과제 독립 평가

검증 head: **8ccb248faa2c5c7b5a6019d12e19e21031169460**
이전 head: **1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c**
최신 main: **b0975cad9f3112af38cc286a892bf6f06722ce12**

## 판정 범위

남은 네 과제는 실제 결함 또는 정책 공백이다. 이번 R4는 검증된 today 객체에 공통 출처 상태를 연결하는 index.html 변경이며, 아래 API·생성기·공개 정책·배포 설정·field cache 동작은 변경하지 않았다. 이 잔여 과제만으로 **현재 제한된 S1-R + S2-A + R4 PR을 다시 차단할 새 운영 유입/권한 우회 근거는 확인하지 못했다**. 단, PR #13을 보호종의 승인 후 전면 비공개가 완료된 배포로 승인해서는 안 된다.

필수 전제는 기존 승인·공개 정책/운영 모드와 field 보호 상태를 이번 배포에서 변경하지 않는 것이다. S1-P 공개 권한 전환·field 보호flag 재판정/마이그레이션을 함께 추진하면 보호 상태 역전 방어는 해당 배포의 선행 차단 조건이 된다. 실제 비동의 민감 좌표의 공개가 확인되면 현재 PR의 선후관계와 무관하게 해당 공개 경로를 즉시 회수/보류해야 한다.

## 재실행 및 증거

1. 실제 최신 main/head의 field 함수8개 hash가 동일하다. 두 버전에서 actual 함수의 late-response 보호 역전, 삭제 후 재출현, 기존 대략 위치 안내를 각각 실행했다(6진단). JSON의 passed6은 **기존 실패 현상의 재현 assertion 6개가 맞았다는 의미**이며 보안 기능 6개 통과가 아니다. 네트워크0·운영D1쓰기0·제품 변경0.
2. 이전/new head의 weeklyScoreValid/weeklyOwn/weeklyTodayRequiredDataValid/weeklyTodayRecommendable hash가 모두 같고 6문자열 조건×2버전을 실행했다. 정상·400자리 wind/rain/wave·trim은 두 JS 계약에서 수락, Arabic 숫자는 거절했다.
3. 새 head Python 실제 validator를 실제190곳 문서의 복사본에 적용했다. 정상/400자리 wind/rain/wave/Arabic 숫자는 수락, trim은 거절했다. 출력은 bool만 저장하고 임시 문서 자동 삭제. 검사 시계는 배치일2026-10-09 12:00 KST 고정.
4. 실제 생성기의 value_at/hourly_value는 400자리 문자열을 float로 변환한 후 finite 검사를 하여 None으로 차단했다. 별도 finite1.7e308 두 wind 성분은 hypot overflow를 만들어 생성 결과에 inf 문자열/scoreEligible true를 만들 수 있지만, **실제 validator가 거절했다**. update-weather.yml 63~66행의 validator가 68행 이후 commit보다 앞서므로 이 정상 배치 경로는 운영 publish되지 않는다. 생성기가 내부 모든 단계에서 finite를 보장한다고 과장하지 않았다.
5. actual GET handler + 인메모리 SQLite + 합성 저어새1 행: approved는 종명/합성 실제좌표를 반환, site-history는 종명/건수를 반환, recent-sites는 제외했다. 기존 field 행의 location_hidden=0/public=실제 합성값도 read에서 유지됐다. **운영에 이런 row가 존재하는지는 조회하지 않았다.** 좌표 원자료는 출력하지 않고 bool만 저장.

## R5 — P2 계약 방어, 이번 PR 선행 코드 차단 아님

위치: index.html **3865~3870**; validate_weather.py **15~17,54~61**.

400자리 숫자 문자열의 형식은 수락되며 Number/float 파싱은 Infinity다. 최근 제보/공지 등으로 새로 만들어지는 문자열이 아니고 공개 제보 사용자는 weather_today 저장 JSON을 쓰는 권한이 없다. 정상 생성기는 수치 변환 및 finite 검사와 .1f 출력으로 400자리 수 문자열을 생산하는 확인된 경로가 없다. hypot overflow의 inf 표시는 validator가 배치 publish 전 거절한다. 저장파일 수동변조·비canonical 외부 삽입은 별도 전제다. 실제 운영 데이터에 극값이 발견되었다고 주장하지 않는다.

후속: 양쪽 정규식 캡처 수치의 finite/nonnegative 검사; ASCII/Unicode·trim 허용·optional wave key 계약을 명시하고 동일 행렬로 대조. 임의 풍속 상한/새 점수 정책은 넣지 않는다. 생성된 운영 today 문서에서 400자리/NaN 등 비canonical 입력이 실제 발견되거나 외부 직접 저장 경로를 추가하면 더 높은 우선순위/배포 차단으로 승격한다.

## 삭제 marker 재출현 — 실제 도달 가능한 P1 개인정보/상태 보존 결함

위치: index.html **5177~5190 loadFieldUpdates**, **5634~5658 fieldDelete/fieldRemoveLocal**; field-updates.js **350~376**.

owner-delete는 user_hash가 같은 브라우저만 허용하며 DB에 deleted 상태를 남긴다. 성공 시 UI에서 제거해도 이미 진행 중인 old GET이 늦게 완료되면 loadFieldUpdates가 전체 배열을 무조건 덮어쓰므로 marker가 일시 재출현한다. 일반 사용자의 정상 삭제로 도달 가능하다. API fresh GET은 deleted를 제외하고 서버 DB 행이 다시 approved/visible가 되는 문제는 아니다. 이미 받은 공개 응답을 클라이언트가 다시 사용하는 문제이므로 새 무권한 조회/원좌표 공개와 구분한다. 일반 삭제 후 불편만으로 축소하지 않는다: 사용자가 철회한 내용·장소를 안내하는 위험이며 P1으로 우선 수정한다.

이번 PR은 삭제/cache/field source를 바꾸지 않고 이 문제를 확장하는 연결 변경도 없으므로 별도 작은 보안 PR로 처리할 수 있다. 삭제된 항목의 확실한 회수가 반드시 필요한 공개 보안 조치나 실제 민감 정보 사고 대응이 이번 릴리스에 포함되면 선행 차단으로 승격해야 한다.

후속 필수 시험: pending GET→owner-delete200→fresh GET 제외→old GET 완료 후에도 배열/marker/뉴스/팝업/guide가 계속 제외; tombstone·request generation 또는 serverTime monotonicity; 페이지 갱신/fresh GET에서는 서버 삭제 유지. 단순 AbortController만으로 캐시·다른 pending source를 모두 보장했다고 가정하지 않는다. 운영 개인자료/좌표를 시험용 fixture로 저장하지 않는다.

## 보호flag 역전 — S1-P/상태 전환 배포의 선행 차단

위치: index.html **5177 loadFieldUpdates,5196 fieldMarkerSignature,5387 fieldGuideStart,5436 fieldPublicPoint**.

actual 함수에서 새 hidden=true 이후 oldfalse GET이 늦게 도착하면 locationHidden이 false로 돌아가 fieldPublicPoint가 안내용 좌표를 허용한다. 정확 원좌표 유출이 항상 일어나는지는 old 응답 좌표 내용에 달려 있지만, 보호 상태를 되돌리는 현상은 실패다. marker signature는 hidden을 포함하지 않으므로 숨김 상태만 바뀌는 경우 popup/안내 closure도 함께 회수되는지 별도 설계해야 한다.

현재 field API의 status/confirm/delete UPDATE3개는 location_hidden을 수정하지 않는다(field-updates.js **299,334,374**). field용 관리자 보호 전환 API도 없다. 따라서 일반사용자가 공개 액션으로 flag를 바꾸는 공격으로 주장하지 않는다. **reports 관리자 hide API는 다른 reports 테이블에 적용되며 field row 권한과 혼동하면 안 된다.** 보호flag는 field create에서 결정되어 저장된다.

기존 보호 정책과 field 상태를 유지하는 PR13 단독 배포에서는 새로운 전환 이벤트가 추가되지 않으므로 별도 P1 방어 가능. backend 정책·사전 재분류·관리자 field hide 등으로 보호flag를 바꾸기 전에는 최신 보호 상태 유지, old응답 무효화, marker/popup/guide/cache 동시 회수 테스트를 반드시 통과해야 한다. 알려진 실운영 민감행을 숨기는 긴급조치가 있으면 “기존 문제” 이유로 미루지 않는다.

## S1-P — 고위험 공개 정책 과제, S1-R 완료와 구분

위치: reports-api/src/public.js **251~298 site-history,340~356 approved,367~402 recent-sites**; shared.js **596~626 publicPayload**; field-updates.js **132~148 publicEntry**.

승인된 legacy/연결 행은 관리자 승인 및 공개좌표를 신뢰한다. approved/root/fixed/site-history는 종명·관찰일·site 연결을 공개할 수 있고 public_lat가 없으면 실제 row 좌표를 쓴다. recent-sites는 민감 행을 제외한다. canonical은 별도 기존 명시적 비번식 확인/위치 가리기 정책을 쓴다. S1-R 수량/구분자 표현 방어 성공이 S1-P 승인후 전면 비공개 성공을 뜻하지 않는다.

또한 과거 field row의 protection flag는 read에서 다시 판정하지 않는다. 기존 표현 누락 시 생성된 location_hidden=0 행이 현재 TTL 안에 존재하면 새 detector가 해당 이름을 보호로 알아도 stored public point를 반환한다. 현재 운영 존재/건수는 미확인이다. field TTL3시간은 무제한 역사공개와 다르지만 status/confirm은 last_activity를 갱신하므로 자동 만료만 믿어 회수 완료를 주장할 수 없다.

보호 news 외부 길안내는 막지만 터치 popup 방향 안내는 대략 좌표를 허용하고 명시적으로 대략 위치 경고를 보인다. 이는 기존 정책이며 “원좌표 길안내가 전부 허용된다”는 주장이 아니다. 대략 안내 자체의 생태 위험과 간접 위치 연결은 S1-P 승인 범위에서 판단한다.

현재 설계의12/45/87/96행과 우선순위284~285행은 기존 승인 후 공개 정책을 별도 전환으로 명시한다. 이 권한/공개 범위를 몰래 바꾸지 않고 PR13을 제한된 표현·점수 계약 개선으로 승인할 수 있다. **PR13 배포 전 필수 확인은 S1-P/운영 모드/재분류를 동시 도입하지 않는 것, 잔여 공개 정책이 실제로 유지됨을 최종 승인자에게 명시하는 것**이다. 읽기전용 운영 감사가 별도로 허용되면 원좌표를 밖으로 출력하지 않고 active field 중 detector 보호=true & hidden=0, approved 민감 표현/위치 정책 수량을 내부 집계하는 과제를 우선 수립한다. 실제 비동의 보호 위치 공개가 확인되면 즉시 해당 노출을 회수/보류하고 공개 연결/receipt/replay/cache 경로를 모두 검증한다.

## 근거의 한계 및 반론

- 실제 운영 D1의 민감 row 존재/분포, 관리자의 승인 의도/진행 중 보호 조치, production canonical mode는 이번 독립 검증에서 조회하지 않았다. 합성 bool을 실제 사고 발생률이나 운영 공개건수로 바꾸지 않는다.
- “기존 결함이라서 허용”이 결론의 근거가 아니다. (1) 이번 수정의 권한/데이터 생성/상태 전환에 변화가 없음, (2) 현재 사용자/배치 유입 경로에서 잔여 위험이 작동하는 정확 조건, (3) 서버 삭제/신선 GET 보존, (4) 기존 설계상 명시된 공개 정책 범위에 근거해 분리했다.
- 위험을 전부 없앤 제품 승인 조건이라면 S1-P 및 cache 후속을 마칠 때까지 그 **전체 보호 주장**은 조건부/보류해야 한다. PR13의 한정된 S1-R/S2-A 변경을 이 전체 보장과 혼동하지 않는다.

## 재현 명령과 산출물

- node pr13_r4_existing_policy.mjs REPOSITORY OUTPUT_DIRECTORY
- node r5_independent.mjs REPOSITORY OUTPUT_DIRECTORY
- PYTHONDONTWRITEBYTECODE=1 python r5_independent.py EXACT_8CCB_ARCHIVE OUTPUT_DIRECTORY
- node s1p_policy.mjs EXACT_8CCB_ARCHIVE OUTPUT_DIRECTORY

결과: pr13_r4_existing_policy.json, r5_js.json, r5_python.json, s1p_policy.json. 실제 민감 좌표/비밀정보가 없고 합성 좌표 값은 결과JSON에도 저장하지 않았다. 운영 POST/DELETE/D1/배포/제품 수정 없음.
