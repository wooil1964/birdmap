# 구현 승인 후 필수 검증 계획

아래 구현 시험은 **현재 미실행**이다. 이번에 수행한 작업은 공개 API GET6건의 헤더 확인, 정적 소스 대조, 합성 메모리 SQLite의 SQL 순서 모델뿐이다. 기존 PR16 시험을 새 권한 계약의 통과 결과로 보고하지 않는다.

## 기준과 시험 원칙

구현 SHA·최신 main·PR13 b12·PR16 245를 정확히 고정한다. 원형 자료와 수정 후 자료는 별도 저장한다. local D1 및 합성 API에서만 상태 변경을 수행하며, 실제 민감종 좌표·운영 사용자 payload는 저장하지 않는다. 기존 실패 assertion을 삭제하거나 기대값을 약화하지 않는다.

PR16 원장은 원형349통과, 최신 main 통합270통과/2실패, PR13 결합639통과/2실패/1skip, Chrome 정상75통과, 별도 보안4실패/Chrome15unsafe다. 보고된351/기존9의 범위 미확인은 유지한다. 새 구현에서는 발견된 파일·명령·실제 수치를 별도로 집계한다.

## 배포 차단 시험

|ID|입력·경합|필수 기대 결과|
|---|---|---|
|SEC01 / V03|승인 가림 rev2 뒤 후속GET의 과거 public rev1|원 정확좌표 마커·검색·팝업·카카오/티맵 링크가 없고 내부 현재 store에서 이전 공개 좌표 제거|
|SEC02 / V04|승인 철회 rev2 뒤 후속 과거 목록|철회 마커·동적 이력 연결·길찾기 복귀0|
|SEC03 / V05|다른 기기 삭제 → 현재 snapshot 관측 → 과거 field 목록|본인 삭제 tombstone 없이도 삭제 마커·GPS 안내 복귀0|
|SEC04 / V06|새 페이지·새 기기·storage 없음 → 첫 응답이 과거 자료|fresh head·nonce·postflight 확인 전 정확위치0, 과거 응답 거부|
|SEC05|기존 Chrome 위험3종×344/375/768/1024/1440px|15건 각각 unsafe0. 기존 보안 기대를 유지하고 새 계약 검사 추가|
|SEC06|revision/epoch/projection/nonce 누락·null·배열·객체·무효 문자열|예외0, 정확위치·길찾기0, strict 계약에 따라 안전 폐쇄|
|SEC07|2^53 근처·SQLite 정수 상한·overflow|반올림 없는 비교, overflow에서 mutation 전체 중지|
|SEC08|새 head와 과거 payload, head의 과거 캐시 nonce 불일치, 구 Worker의 계약 없는 응답|새로고침 포함 모두 거부. 과거 payload를 새 버전으로 승격하지 않음|
|SEC09|headA → data → 다른 기기 철회 → postheadB|B가 바뀌면 data 폐기·재조회, 과거 자료 표시0|
|SEC10|snapshot 읽기 중 변경, field parent/event/count 경합, 빈 목록|새 revision+과거 rows 혼합0. 정상 빈200과 권한 미확인503 구분|
|SEC11|요청 순번 역전·동일 revision의 다른 query/date/만료|generation/revision/nonce/view 엄격 검사, 자연 만료는 재조회하며 영구 삭제로 오인하지 않음|
|SEC12|field 상태 사전 읽기 → owner 삭제 commit → 늦은 status write|deleted 유지, 이벤트·본행·revision 모두 원자적으로 처리. 실제 handler 경합까지 확장|
|SEC13|field confirm 사전 읽기 → 삭제 → 늦은 confirm|확인 event/count/activity/revision 변경0|
|SEC14|동시 delete2·status2·confirm2·동일 millisecond/ABA|CAS 충돌 정확 처리, 멱등 삭제 event1, 정상 확인 재시도 허용|
|SEC15|batch 중 실패·captcha 재사용·request replay·admin expected_revision 충돌|reports/canonical/audit와 공개 revision 함께 rollback, 멱등 receipt도 현재 공개 상태와 정합|
|SEC16|INSERT/UPDATE/DELETE·hide/unhide·consent·link/site/species·purge|관련 변경 coverage 완전. revision이 정확+1이어야 한다고 오인하지 않음|
|SEC17|구 Worker의 unconditional deleted UPDATE·다른 기기·replica 지연|DB terminal 방어로 복구 불가. fresh primary anchor 확인|
|SEC18|field TTL3시간 cutoff 동일/초과, KST 자정·월·목록100 제한|기존 >= 경계 유지, 만료 항목 길찾기 없음, 만료와 삭제 구분|
|SEC19|timeout/offline/500/미설정 state → 정상 복구|동적 정확위치·안내 폐쇄 후 새 bootstrap으로 정상 복구, 정적190곳 유지|
|SEC20|hide→관리자 unhide, unpublish→reapprove, not_visible→reappeared|더 새 명시 권한에서 정상 복구. 영구 sticky 보호·누락 ID 영구 삭제 없음|

## Chrome 및 사용자 기능

5폭의 실제 Chrome·Leaflet/DOM과 합성 API로 approved/pending/field/search/site-history/recent bonus, 열린 팝업, 내부 공개좌표 store, 앱 선택창, 두 길찾기 href를 함께 확인한다. 정상 URL 좌표 순서와 버튼 구성은 최신 main을 유지한다. 보호·권한 미확인 상태에서는 양쪽 href·GPS 안내·watch·polyline가 없다.

지연 GPS 성공/error/watch, 선택창이 열린 동안 가림/삭제, 재확인 중 권한 변경, 백그라운드 타이머, visibility/BFCache pageshow, 재승인 복구, 먼저 시작한 요청의 늦은 도착과 더 늦은 요청의 과거 서버 응답을 구분하여 시험한다. 합성 DOM 클릭으로 승인·철회·현장 등록·상태 변경·본인 삭제를 시험한다. 실기기 센서·외부 지도 앱을 실행하지 못하면 미실행 범위를 명시한다.

## API·D1·canonical·캐시

1. local D1에서 additive migration 전후 core schema fingerprint와 실제 schemaReady/dual peer ready를 확인한다. public_state/field 추가가 기존 core 정의를 깨뜨리지 않아야 한다. partial/missing row/무효 자료형에서 공개 및 쓰기가 안전하게 닫히는지도 검사한다.
2. 새 revision trigger를 포함한 실제 batch에서 기존 transaction_assertions의 changes() 의미를 검사한다. CAS 바로 뒤 assertion이 부모 UPDATE의 결과를 정확히 검사해야 한다. 무변경 UPDATE·복수 trigger·row revision·rollback을 포함한다.
3. state+rows+field children의 실제 원자 snapshot을 local D1에서 검사한다. 분리 read의 새 revision/과거 payload 함정을 주입해 거부를 확인한다. mock 시험을 실제 D1 transaction 계약의 증명으로 대체하지 않는다.
4. public/admin peer, captcha redemption, append-only raw/reviews/audit, purge/safety ledger 기존 스위트를 실행한다. S1-R171 표현 및 일반종 오탐 회귀를 유지한다. S1-P 필터를 새로 도입하지 않는다. shadow 비교는 같은 snapshot과 비교 불가능한 snapshot을 구분한다.
5. browser memory/disk/HTTP/CDN/Workers Cache/서비스워커가 있다면 각 layer의 과거 응답을 주입한다. no-store, cache rule bypass, nonce echo를 증명한다. cache.delete 하나로 전역 purge가 됐다고 보고하지 않는다. 304/ETag 재사용은 동일 권한 확인 없이는 허용하지 않는다.
6. 승인 후 staging에서 다기기·다른 POP·서로 다른 발행 버전의 응답을 검증한다. 운영은 읽기 전용 preflight와 별도 승인된 배포 smoke로 제한한다.

## 추천·자료 비간섭과 합격 기준

PR13 고정2026-10-08 22:40KST 입력에서190곳·176후보, 제보 ON/OFF 전체 signature와 top10의ID/순서/원점수/표시/rank/bonus/date/time/type/P0 상태를 비교한다. 정상 검증 입력은 불변이어야 한다. 철회·미검증 API 가점 자료의 배제로 인한 변화는 의도된 데이터 변화로 별도 기록한다. 가점 산식·정원·동점·강수1mm·선상6m/s/0.7m·만조90분은 변경하지 않는다.

siteData JSON/좌표 hash·기상/조석/notices/자동 JSON·기상 생성기/validator/proxy·workflow의 무변경을 검사한다. 네 실패와 Chrome15·서버 삭제 경합 차단, 정상 복구·두 앱 길찾기 유지, 핵심 계약 회귀를 모두 충족해야 한다. 필수 시험 실패·skip·미실행이 남으면 성공에 합산하지 않는다. 정확 SHA·명령·시계·입력 hash·로그·실제 발견 수와 브라우저 운영 쓰기0 증거를 저장한다.
