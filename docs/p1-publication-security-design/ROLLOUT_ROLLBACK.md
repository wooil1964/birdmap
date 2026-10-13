# 승인 후 단계별 배포 및 보호 유지 롤백 설계

현재 문서는 실행 계획이다. migration·업로드·배포·rollback·purge·운영 쓰기를 실행하지 않았다. 정확 구현 SHA와 새 Worker version은 아직 존재하지 않으므로 임의로 만들어 승인 대상으로 기록하지 않는다.

## 1. 배포 전 선행 조건

- 사용자가 DESIGN의 변경 범위와 권한 확인의 표시 유효시간·재검증 간격·fail closed 동작을 검토하고 별도 구현 승인을 한다. 구현과 독립 검증 승인 뒤 운영 반영 승인을 다시 받는다.
- latest main과 PR13/16을 읽기 전용으로 고정하고, 새 제품 branch의 정확 artifact를 검증한다. 두 기존 PR을 이번 설계 제출을 위해 수정하지 않는다.
- 운영 public/admin Worker의 version→빌드 산출물/source hash→Git SHA 연결, service/D1/peer bindings, preview off, Access 인증, dual-write/captcha/확인 정책을 확인한다. 이번 HTTP 헤더 GET으로 이 연결을 확인했다고 하지 않는다.
- 실제 D1 schema/trigger/system_state/canonical projection을 읽기 전용으로 조사한다. DB 권한자만 수행하고 SELECT 결과에 사용자 좌표·종·메모를 담아 저장하지 않는다. 기존 migration 적용 여부와 core schemaReady를 먼저 확인한다.
- 새 singleton/terminal guard의 원자 설치 및 field를 포함한 모든 writer의 drain 방법을 검증한다. 기존 reports freeze가 field까지 막는다고 가정하지 않는다.
- 캐시 layer별 정책을 확인한다. 새 nonce 계약 endpoint는 CDN/Worker 캐시 우회가 필요하다. 기존 공개 응답의 purge 가능 범위·완료 증거·남은 browser/inflight cache를 구분한다.
- 안전 baseline 서버/Pages artifact를 **먼저** 준비한다. baseline에는 S1-R, publication 검증, no-store, field terminal/CAS, canonical dual-write, 기존 인증·captcha를 포함한다. 최신 추천 기능이 문제여도 보호 기능만은 유지한다.

## 2. 단계와 중지 조건

|단계|승인 후 실행|완료 증거·중지 조건|
|---|---|---|
|A. local/staging|synthetic DB/API의 migration·4실패·15Chrome·서버 경합·회귀 및 paired build|필수 시험 실패/미실행이면 중지. 정확 version/source/SHA/로그 저장|
|B. 원자 DB 추가|모든 writer가 통제된 구간에서 새 state+field revision+triggers 설치, 기존 행·좌표는 변경하지 않음|schemaReady/core fingerprint, 새 state 검증, partial 설치 방지. 실제 운영DDL은 별도 승인 필수|
|C. 서버 선반영|public/admin에 S1-R와 새 공개 계약·CAS를 포함한 검증 버전 배포, 기존 dual peer 협상 유지|새 head endpoint가 primary를 읽고 nonce/no-store 계약을 충족. binding/peer mismatch는 쓰기 폐쇄; protection mismatch는 좌표 공개 폐쇄|
|D. 이전 캐시 처리|실제 저장 layer의 기존 위치 API cache를 hard purge/bypass, 새 계약 query/URL로 이전 응답과 분리|purge 성공과 cache 우회 확인. 단순 cache header 변경/TTL60초 대기만으로 모든 과거 응답 제거됐다고 하지 않음|
|E. Pages|PR16 client guard+publication bootstrap/postflight/route gate를 포함한 검증 SHA 배포|5폭 정상/보호/삭제/오류/복구 및190/P0 추천 확인. 기존 데이터 가점 산식은 유지|
|F. strict 전환|구 계약의 위치 API 요청을 미확인 상태로 취급, 계약 없는 응답에 정확 좌표를 제공하지 않는 호환 실패 처리|현재 지원 client가 새 계약을 사용한다는 증거. 구 client와 과거 열린 탭의 한계 명시|
|G. 관찰|읽기 전용 현재 state/headers/paired capability 확인, 오류율·권한 불일치·복구·projection 차이 관찰|좌표·payload·nonce·device hash를 로그에 남기지 않음. 보호 역행 시 즉시 fail closed/baseline으로 복귀|

S1-R 선반영만으로 기존 승인 자료의 공개 상태를 일괄 변경하지 않는다. 신규 field 보호 표현의 분류와 recent-sites 읽기 필터 변화, 명시 hide/철회/삭제 상태 변화를 구분한다. 승인 후 전면 비공개인 S1-P 전환은 이번 단계에 끼워 넣지 않는다.

### 구 client 호환의 안전 경계

서버 선반영 중 기존 URL에 metadata/no-store를 추가해 기존 client와 잠시 호환할 수 있지만, 구 client는 nonce/postflight를 검사하지 않는다. 이 기간을 전면 보호 완료라고 판정하지 않는다. 엄격 전환 때는 계약 없는 위치 응답을 닫고, 지원 client는 새로운 bootstrap만 사용한다. 기존 공개 scope 자체를 종별로 재분류하는 정책 변경은 아니다.

서버가 새 응답을 닫아도 구 탭이 이미 저장한 정확좌표·외부 앱 기록을 원격 삭제하지 못한다. 구 cache의 위치 노출을0으로 만들었다는 주장은 금지한다. 현재 지원 버전/새로고침/다기기의 재노출 방어와 이미 공개된 정보의 회수 불가능성을 분리하여 운영자가 승인한다. nonce/contract 없는 새 데이터 요청을 계속 공개하면서 전체 보안 실패 해결을 선언하지 않는다.

## 3. 캐시 정책

위치·공개 상태에 연결되는 approved/pending/field/site-history/recent-sites, 신규state와mutation receipt/error 응답은 `Cache-Control: no-store`를 권고한다. CDN 응답 정책도 no-store/bypass로 고정하고 browser fetch는cache:no-store, 매요청새 nonce를사용한다. CORS Origin/Vary를 유지하며 nonce는query로전달하여기존privategate header를공개하지않는다. 동적권한payload에stale-while-revalidate/stale-if-error를사용하지않는다. 월간기여자처럼이름동의가변하는집계도최소단계에서는no-store로정리하거나동일revision검증을적용한다.

현재src에 caches.default/cache.put 사용은 확인되지 않았다. 배포의CDN/신규WorkersCaching/브라우저cache설정은 별도 확인 대상이다. [no-store 공식 설명](https://developers.cloudflare.com/cache/concepts/cache-control/)에 따라 저장을 막되, 새 header가 이미 저장된 복사본을 지우는 작업을 대체하지 않는다고 취급한다.

실제 cache가 있다면 승인된 hard purge를 원본 변경 후 수행한다. [Cloudflare purge와 invalidation](https://developers.cloudflare.com/cache/guides/invalidate-cache/)은 soft invalidation이 과거 내용을 재검증 중/오류 때 제공할 수 있다는 점에서 구분된다. [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)의cache.delete는호출POP에한정되므로전역제거증명이아니다. 각cache구현의공식purge방법/권한/대상URL/query/Vary/완료증거를먼저확인한다. 그작업은본세션미실행이다.

## 4. 보호 기능 유지 롤백

|문제|안전한 대응|금지|
|---|---|---|
|추천/UI/Pages 회귀|publication client guard·S1-R 호환·TMAP/Kakao를 유지한 사전 검증 Pages baseline으로 복귀. 새 서버·state·triggers 유지|기존 원 main으로 단순 복귀해 client 권한 검증 제거|
|새 서버 부가 기능 회귀|S1-R+publication+no-store+field terminal/CAS+dual-write를 유지한 최소 서버 baseline으로 paired public/admin 복귀|S1-R 이전의494b97/소스 불명16dae를 보호 유지 rollback으로 임의 지정|
|API/DB state 불확실|동적 정확좌표·길찾기 폐쇄, 검증된 read/write maintenance build 사용, 원인 조사|fail open 또는 dual NORMAL legacy 모드로 전환|
|스키마/쓰기 오류|새 테이블·trigger를 유지하고 쓰기 중지. 원자성/자료 정합 확인 후 새 corrective migration을 별도 승인|migration down/D1 과거 backup 복구로 철회·삭제·counter를 되돌림|
|DB 복구가 불가피|기존 forbidden-restore/safety-ledger 절차와 공개 epoch 교체·철회/삭제 재적용·private 검증을 별도 승인하고 공개는 닫아 둠|과거 DB+같은epoch를 현재권한으로 재노출|

2026-10-11 이전 운영 준비 문서상494b97은S1-R 이전 코드와연결됐고16dae는실행source를증명하지못했다. 이번세션에서두버전을다시조회하거나현운영버전이라고재확정하지않았다. 현재/직전version이라는사실만으로새보호기능을유지한다고승인할수없다. rollback대상은기능시험+실제build/source/version/bindings가증명된새baseline이어야한다.

새소스가shared BUILD_CAPABILITY/peer releaseid와기존schemaReady를호환하는지검증한다. 불가피하게이값을바꾸면pairedmaintenance전환으로두worker를맞춘다. 한쪽버전만되돌려peer capability/설정을어긋나게하지않는다. public 보호코드만있고admin mutation이새counter/CAS를우회하는조합도승인하지않는다.

## 5. 현재 미완료 승인 항목

구현 SHA·전용 CI 또는 대체 독립 실행 결과·안전 Pages rollback SHA·안전 public/admin rollback version·원자 migration rehearsal·실제 cache rule/purge 계획·허용 관측 지연이 아직 확정되지 않았다. 이는 설계 미구현 상태의 선행 조건이며 실제 배포 준비 완료로 보고하지 않는다. PR13의전용CI미구축은이번문서만으로해소되지않는다.
