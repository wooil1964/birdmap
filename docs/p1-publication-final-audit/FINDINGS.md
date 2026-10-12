# PR #17 최종 독립 보안·배포 준비 검증

2026-10-13 KST. **BLOCKED — 운영 배포 중단.** 보안 보완과 로컬·CI 검증은 진행했지만, Workers Free 용량 관문을 통과하지 못했다. 사용자는 용량 검증 결과를 먼저 보고하라고 지시했다. main 병합, 운영 트래픽 활성화, Pages 반영, 운영 D1 migration 및 실제 사용자 쓰기는 수행하지 않았다.

## 기준과 검증 범위

- 최초 PR17 기준: `71177330fd1d45c64f3bef632cf1f43286c304cd`.
- B1~B5 통합 제품 기준: `d39f1bd16baaea08f1241a3fb528a1953a343692`; main58 통합·CI 환경 보완 후 `6d0f435b89f11a28ec0bef3c258fa141e4161e47`과7f는 같은 제품이었다.
- 최종 보안 수정: **`c025d75f964ab36f6f2eae541a99461f6de59b70`**.
- 최신 main: `b41b03cc717a0154f520a3ab4ace24c990e62b3b`; main58 이후 자동 weather_today/week JSON만 변경.
- PR13: `b12e20c1b6d856a021898a0c1c9221b30393a221`; PR16: `245298981e27f88ac26bad8b46d819a7df899c86`. 두 PR head는 변경하지 않았다. PR13의 추천 안전 코드 전체와 PR16 방어는 PR17 통합 브랜치에 포함되어 별도 중복 병합이 필요하지 않다.
- 구현 트리와 별도 독립 검증 트리를 사용했다. 제품 수정은 root만 수행했다. 모든 새 위치 시험은 합성 좌표·로컬 API/SQLite/workerd를 사용했다. 실제 비공개 제보 좌표는 수집하거나 공개하지 않았다.

## 새 독립 결함과 수정

|결함|재현과 최소 수정|확인|
|---|---|---|
|B1 field 쓰기 통제 누락|field POST에도 maintenance gate 적용. singleton write_frozen과 parent/event/confirmation 9 SQL barrier. migration은 frozen=1로 설치.|실제 local migration/CAS/불변 조건 통과|
|B2 오래된 진행 중 HEAD 공유|fresh HEAD 요청은 앞선 요청 완료 뒤 시작한 새 authority 조회를 사용.|Node20조건·Chrome 공격 통과|
|B3 RTT가 늘린 권한 lease|응답 도착이 아닌 요청 시작부터 5초 상한. 지연·시간 만료는 폐쇄.|지연·네트워크·GPS 시험 통과|
|B4 동적 href 우회|동적 외부 링크는 href="#"로 두고 앱 실행 직전 fresh authority와 현재 대상 확인. 정상 Kakao/Tmap 형식 유지.|Chrome context menu·launch·GPS 시험 통과|
|B5 기여자 동의 cache|현재 권한을 검증한 자료만 사용하고 invalidation 시 cache/열린 modal/늦은 응답도 제거.|동의 철회·탭·복구 시험 통과|
|**B6 과거 저장 현장소식 보호 누락**|과거 location_hidden=0인 저어새1·흰꼬리수리1·매1이 최신 nonce/revision 응답에서도 정확 점/길찾기를 노출했다. publicEntry에서 기존 S1-R로 다시 판정한다. 보호 행은 hidden=true. 같은 SQL snapshot에서 저장 보호표시와 원본과 다른 공개 점을 확인할 수 없으면 lat/lon=null로 보류한다.|수정 전 실제 workerd10pass/3fail → **동일 시험13/13**. 별도 확장25/25|

B6 수정 파일은 `reports-api/src/field-updates.js`와 신규6회귀를 추가한 `reports-api/test/publication-security.test.mjs`뿐이다. private lat/lon은 SQL 비교 안에서만 참조하며 API 필드로 선택하거나 보내지 않는다. 조회로 DB/authority를 수정하지 않는다. 정상 일반종 정확 점과 이미 저장된 대략 점은 유지한다. read마다 새 random 점 생성, 공개 ID 기반 역산 가능한 jitter, 임의 탐조지 좌표 대체는 사용하지 않는다.

171 보호 표현을3가지 DTO 조건(legacy0-exact/hidden1-exact/hidden1-masked)으로 확인한513cell 누락0, 일반17종 오탐0. protected stored flag0와 hidden1-but-exact는 null 좌표, 기존 hidden1-masked는 같은 점이다. 이 비교는 기존 LOCATION_HIDDEN_SQL의 서로 다른 공개 점 계약이며, 새로운 최소 거리 보장을 증명한 것은 아니다.

좌표 보류 행은 API에서 영수증·상태·이력 metadata를 유지하지만 기존 fieldValidUpdate가 좌표 number를 요구하므로 지도 내부 목록·마커·팝업·owner 선택 UI에는 남지 않는다. 해당 과거 행의 owner가 이미 알고 있는 ID로 삭제/상태 변경하는 서버 계약은 유지된다. 새 정상 보호 등록의 대략 마커와 owner UI 삭제·상태 변경은 유지된다. 안전한 대략 점이 저장돼 있지 않은 과거 행을 임의로 DB 수정해 복구하지 않았다. 이것은 현장소식의 기존 S1-R 읽기 방어이며 승인 제보 전체 비공개 **S1-P를 구현한 것이 아니다**.

## 독립 실행 결과

중복 실행·subset을 합산한 새 단일 총계로 표시하지 않는다. 각 원장에는 입력 SHA, 명령, 시각, 종료 코드와 원형 실패가 있다.

|범위|pass|fail|skip|입력/설명|
|---|---:|---:|---:|---|
|프런트 JS15파일|359|0|0|c025|
|reports-api|227|0|0|c025, SQLite 실제 SQL 포함|
|weather-proxy|36|0|0|c025|
|Python weather|56|0|0|c025|
|Python tide|21|0|1|c025, 원래 범위 skip 유지|
|Python shared pages|11|0|0|c025|
|**자동 회귀 합계**|**710**|**0**|**1**|6스위트 모두 exit0|
|S2 matrix / 특별 / popup|182 / 21 / 12|0|0|c025, 별도 계약 시험|
|신규 B6 6시험, 이전7f|2|4|0|같은 새 test파일만 별도 old archive에 복사, 제품은 원본 유지|
|신규 B6 6시험, c025|6|0|0|기대값 변경 없음|
|B6 동일 실제 workerd 재현|13|0|0|이전10/3 원형 유지|
|B6 확장 workerd/읽기 DTO|25|0|0|171표현×3cell, 일반17, owner/CAS/read no-write 포함|
|기존 독립 Node writer / HEAD freshness|11 / 20|0|0|관련 제품 blob 변경 없음, d39 근거 유지|
|기존 실제 workerd D1 보안|22|0|0|B6와 무관한 epoch/CAS/terminal, d39 근거 유지|
|실제 local Wrangler migration|30 + 정합성3|0|0|migration blob 불변, d39 근거 유지|
|실제 Chrome 기본 보안, 5폭|241|0|0|정확 c025 LF source, 기존15위험 unsafe0|
|실제 Chrome 저장 보호 DTO, 5폭|170 / 140|0|0|실제 제품 API DTO로 검증, 원형 harness 실패 별도 보존|
|새 c025 local D1 비용/동시 호출|12|0|0|HEAD600, 동시1/10/20 각각200; rows_written0|
|부하 Chrome10/20 cohorts|18|0|0|6d의 동일 frontend, 원형 timestamps 및 counts 보존|
|Free 예산 독립 재계산|63|0|0|실제 client exposure·새 c025 SQL비용으로 Python 교차 계산|
|최신 main 자정·자동 갱신 관련|48|0|0|b41 + c025 임시 tree|

전체 통합 드라이버의 종료 코드는 **1**이다. 자동6스위트 실패 때문이 아니라 아래 현재 날짜 today validator 거부가 별도 포함됐기 때문이다. 원형 실패를 성공으로 바꾸지 않았다. 독립 원장은 `integration/c025d75f964a/`에 있다. Windows archive의 일부 자동 시험은 CRLF source를 사용했으며 canonical Git LF와 줄끝 정규화 후 동일하다. Chrome/CI/Pages 번들은 canonical LF hash까지 별도 검증했다.

## 정상 추천과 최신 main

고정 시계 **2026-10-08 22:40 KST**, 과거 승인 제보 ON/OFF 같은 고정 입력에서 탐조지190·후보176, 모든 후보 ID/순서/원점수/표시점수/rank/가점/날짜/시각/유형 및 상위10이 PR13과 같다. P0 만조90분/91분, 대체 만조, 강수1mm, 선상 풍속6m/s·파고0.7m, 결측 제외가 유지된다. 추천/P0/S2 75함수와 정상 앱 길찾기4함수의 비간섭 근거도 보존했다.

- ON signature: `47c90497b6995318031b10e85c0750f77f5898c5ce1a75bfb951b820eb5e9afb`
- OFF signature: `ecd3d28b8c3d5f23cfbf00bcc305c2171bff01ea4f81027dc1407ffe1a84a758`
- 전체 siteData hash: `fd50e35a1f1ad828f425918e28bb1632c9acb2e9206806263cd64d18a8513fd8`
- ID/좌표 hash: `21c25db5b1aa0de03a2f037f720715696c3a2c14f016a00e0c0c4acb18e9df89`

b41와 c025의 임시 merge-tree `a69496e76215b7bef4fe205e7b217840a1c8880e`: 충돌0, index/Worker 및190곳 불변, 자동 JSON5종은 최신 main byte-exact. 실제 main ref/index는 변경하지 않았다.

b41 weather_today는 **10/12 발행 자료**다. 실제 **10/13 현재 시계**의 validate_weather.py는 Batch date mismatch로 exit1. 같은 원본 JSON·validator에서 시계만 원발행10/12로 고정한 구조 회귀는 exit0이고, weekly 현재 시계 validator도 exit0이다. 날짜 검사를 삭제하거나 과거 JSON 날짜를 바꾸지 않았다. 현재 fresh 자료·현재 추천176을 입증한 것이 아니다. 자동 기상 workflow를 임의 dispatch하지 않았고, 운영 반영 전 실제 새 배치 성공을 확인해야 한다.

## Workers Free 실제 호출과 한도

사용자 제공 최근24h의1230 D1쿼리/58000읽기/496쓰기/1.44MB와 다음 authenticated read-only 계정 집계는 서로 다른 지표·창이다. D1쿼리 수를 Worker 요청 수로 치환하지 않는다.

실측 rolling24h `2026-10-11T10:45:13.009Z`~`2026-10-12T10:45:13.009Z`: 계정 전체 Worker **1242**, D1 **62111읽기/665쓰기**. public Worker985, admin129, 기타128. birdmap D1은56381읽기/538쓰기, 다른 DB5730읽기/127쓰기. GraphQL runtime error0은 HTTP503이0이었다는 의미가 아니다. UTC 당일 부분 창31388읽기/450쓰기는 ingest/시간 bucket 때문에 확정 남은 한도라고 쓰지 않는다.

[Workers Free](https://developers.cloudflare.com/workers/platform/limits/)는 계정100000요청/day, [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/)는 계정5000000행읽기/100000행쓰기/day이며 UTC00(KST09) 경계다. 한도 초과는 요금이 자동 부과되는 예산이 아니라 요청/쿼리 실패와 서비스 가용성 위험이다.

실제 Chrome의 독립 incognito10/20명, 75ms 합성 RTT, 각 사용자63초 이상 foreground를 측정했다. 초기2초와 steady를 분리했고 raw원장을 보존했다. 요청은 모두 합성 API로 향하며 실제 운영 부하를 발생시키지 않았다.

|항목|10명|20명|
|---|---:|---:|
|초기 요청|130|260|
|steady 요청|570|1140|
|steady HEAD / approved / pending / recent / field|320 / 60 / 60 / 60 / 70|640 / 120 / 120 / 120 / 140|
|사용자별 exposure 합(ms)|644350.200|1292402.600|
|steady 사용자당 요청/시간 모델|3184.60|3175.48|
|steady 사용자당 D1읽기/시간 모델|423943.38|422728.95|

초기는 사용자당13요청(HEAD5+4목록 각2); old main 초기4 대비9증가다. 동일65초 old main은 사용자당 field1만 실제 관측했고10분 report timer는 관측 구간에 없었다. 소스의 장기78요청/시간 추정은 이 단기 baseline과 구분했다. 정상 RTT에서도 raw65초 안에 사용자마다6회 lease 만료가4목록 재조회를 일으켰다. 12초 background 관측은0요청이지만 기존10분 report timer에는 hidden guard가 없어 모든 background 요청 중지를 입증한 것은 아니다.

실제 local workerd의 운영 DDL48종+합성73reports/3field fixture: authority SQL은 catalog102행을 포함해 HEAD당**103읽기**. approved224/pending104/recent224/field140/history285/monthly227. 운영 private rows를 복제하지 않았다. c025에서12/12 및600 HEAD를 새로 실행해 endpoint별 행 비용이 동일함을 확인했다. 실제 Chrome 프런트는6d와 c025의 hash `d3488318be9dc3696946753fc0c18fa26392c3b519c1467552603883641616d3`가 같으므로 원 측정 trace와 새 server 비용을 연결했다. 새 SHA로65초 Chrome 부하 전체를 다시 측정했다고 주장하지 않는다.

새 root local p50/p95(ms): 동시1=7.65/11.22, 10=70.75/81.85, 20=144.71/175.23; 오류0·쓰기0. 이는 Node/Miniflare 왕복 wall-time이고 실제 edge latency·Worker CPU10ms 충족이나 운영 오류율을 입증하지 않는다.

기존 계정24h수요가 반복되고 추가 cohort가 같은 foreground 호출률을 유지한다는 보수적 수요 예산이다. 초기 로딩 포함·소수점 올림이며, 하루 운영 관측이나 실패 이후 실제 과금/소비량이 아니다.

|활성 이용/day|계정 Worker요청|계정 D1읽기|판정|
|---|---:|---:|---|
|10명×1시간|33219|4320535|한도 내이나 읽기 여유 작음|
|20명×1시간|65012|8554671|**D1 초과**|
|10명×8시간|256141|33996572|**둘 다 초과**|
|20명×8시간|509579|67736724|**둘 다 초과**|
|10명×24시간|765677|101827512|**둘 다 초과**|
|20명×24시간|1525733|203009990|**둘 다 초과**|

신규 권한 SQL만으로도20명×1시간은 약6541492행이어서 기존 payload 중복 합산을 제외해도 주요 초과 결론은 유지된다. 같은 호출률의 theoretical D1예산은10명약69.6분,20명약34.8분이지 실제 UTC 소진 시각 예측이 아니다. 정상 API읽기는 신규 D1쓰기0이며 기존665/day는 쓰기 한도 이내; 추가 사용자 제보 쓰기 빈도는 실측하지 않았다. 실제 방문수·활성 시간·추가 reload, history/기여자 상호작용은 알려지지 않아 과거 낮은 사용량만으로 배포 승인할 수 없다.

다음 보완은5초 상한·primary 최신권한·fresh postflight·nonce·unknown폐쇄를 유지하면서 중복 bootstrap/lease경계 재조회를 줄이고 authority SQL비용을 줄이는 범위여야 한다. poll/lease연장·검증되지 않은 권한 cache·fail-open으로 비용을 맞추지 않는다. HEAD-only720요청/사용자시간으로도20명×8시간은115200요청이어서 순수 polling의 Free요청 한계도 남는다. 장기 이용시간 계약 또는 별도 요금/구조 검토가 필요하며 유료 가입·결제는 하지 않았다.

## 롤백 준비와 운영 상태

운영 public **494b97d1-69ab-40f7-bbbf-e8c6e3c5effc**, admin **0134cd9a-afce-4176-acfa-7910fbe4790c** active100%는 재조회에서도 불변이다. actual active bundle 둘 다 Git41650e43f80fadb2bfd9f80b18d958862f673551와 byte-exact. public source에는 새 S1-R/권한 방어가 없어 안전 rollback이 아니다. 이전16dae source도 미증명이므로 승인하지 않는다.

새 **실제 업로드된 대기 버전**(트래픽 미반영):

|역할|버전|소스/용도|
|---|---|---|
|public 정상|`16ab210b-68d5-4066-875c-b2d2c6692425`|c025 B6+S1-R+publication+CAS, canonical dual-write|
|public maintenance|`4862c354-a4c9-4758-bfde-8c35244535de`|같은 보호 코드, 쓰기 READ_ONLY_MAINTENANCE|
|admin 정상|`cf2b8b90-b00d-4356-ad85-78ae1e8bb4c0`|6d 업로드; c025 재빌드와 번들 byte-exact|
|admin maintenance|`9ba936ff-b3a7-4e9f-9c72-440a8a03c50e`|같은 admin 보호 코드, 쓰기 maintenance|

public SHA256 `5460a604afae9bc7ae08eaee7fa168443a892d52a0b3605206699e7c8ef77091`, admin `62d45b94a767d6e1a8a837b5fe6eacc36a749a7ec189ca482b39b3d99ab941b1`. pinned canonical archive→local dry-run→실제 versions upload 출력 번들 동일→remote 해당 version metadata/bindings의 연결이다. 비활성 version 원격 소스를 다시 다운로드한 byte-equality 증거는 아니다. stricttrue/D1/peer/secret이름 유지, preview routingfalse, active불변. 기존 pre-B6 public `1f00aa4e...`/`d403e20b...`는 B6 방어가 없어 **대체된 비승인 버전**이다. maintenance는 쓰기를 닫는 모드일 뿐 모든 읽기를 봉쇄하는 모드라고 주장하지 않는다.

기존 공개 정보/삭제·철회 epoch를 과거 DB백업으로 돌리지 않는다. 장애 시 새 보호 유지 paired maintenance로 쓰기를 닫고 primary 권한 불명 상태는 client가 폐쇄하게 한다. 적용된 migration/삭제terminal/CAS/revision을 보존하고 보호 source를 전진 복구한다. 향후 이미 활성화한 publication reader정책을 바꿀 때는 freeze/drain 중 revision도 전진시켜 이전 유효 응답과 같은 authority로 새 공개 정책을 표시하지 않아야 한다. 이번 운영 DB에는 새 singleton이 없어 초기 coordinated migration/activation이 그 경계를 제공해야 한다.

[버전 override](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/)는 active deployment에0%로 남긴 version도 선택할 수 있다. 보호 전 legacy version을 신규 active deployment에0%로 남기지 않는다. preview가 꺼진 별도 upload와 active deployment에 포함된0%는 다르다.

## CI·Pages와 미완료 운영 조건

c025 읽기 전용 CI [run38272115326](https://github.com/wooil1964/birdmap/actions/runs/38272115326), job114888649072 **success**: 자동710/0/1, Chrome241 및 고정 signature 확인, Pages artifact 생성. Workflow는 pull_request/main과 수동 검증만 정의하고 contents:read이며 Cloudflare/D1/배포 credentials와 배포 step이 없다. root가 운영 JSON workflow를 dispatch하지 않았다. 목적별 checks tool로 검증했으며 job log는 일부 잘려 local complete log와 구분했다. Node20 action deprecation 및10/19 ubuntu-latest migration은 warning/notice로 기록했고 제품 시험 실패로 바꾸거나 숨기지 않았다.

보호 Pages artifact **11757876081**, CImerge **88262001d82643f809690349e2e0a997903a045b**, ZIP SHA256 `90aac4bb9db2ab5fa7db7608d37118b0195d760088b40afdde6130def0e136d8`. 실제 다운로드 후388파일 digest·CImerge Gitbyte 일치와 index의c025byte 일치를 검증했다. 2026-11-11만료 전 별도 보존이 필요하다. 현재 GitHub Pages는mainroot자동 반영이므로 backend준비 전main을병합하면안된다. 실제 보호 Pages 배포/롤백을 수행한 것은 아니다.

운영 D1 schema79objects(51defined/28implicit), coreReadytrue, ledger0001/0002/0003 및0004field기설치 확인. publication singleton/rowrevision은 아직 운영에 없다. migration 전용dir에 **0005만** 사용하고 기설치0004를 재생하지 않는다. 실제 local Wrangler의 중간 CHECK실패에서는 해당 migration schema/data/ledger가 전부 rollback됐고 freeze1·9barrier·CAS·terminal·정상재출현·원값보존을 확인했다. REST 임의 SQL배열의 원자성을 가정하지 않는다.

운영 approved현재 max-age60, field no-store, Worker CacheAPI구현없음/customdomains없음을 읽었다. 전세계 CDNpurge, 이미 전달된 옛탭 정보 회수, 실제 운영 strict nonce계약·D1 migration·public/admin전환·새 Pages 및 자동 새기상배치 성공은 **미실행**이다. source의 nonce/pre/postflight/expiry가 과거 응답·네트워크오류·요청역전에서 폐쇄하는 것은 합성 시험 범위다. 이미 받은 좌표를 원격 삭제하거나0ms철회를 보장하지 않는다. 물리GPS·네이티브 Kakao/Tmap앱·운영 POP/실제 장기 D1부하·CPU는 미검증이다.

배포를 다시 고려하는 순서는 **용량/가용성 보완 재검증 및 사용자 승인 → 최신 head/main/바인딩·schema 재확인 → 보호대기 버전 재확인 → 모든writer통제/drain → 원자0005설치 → 보호유지public/admin서버 → 권한/CAS/cache/옛client전환 확인 → 검증소스main병합·Pages → 자동새기상배치·운영읽기전용 회귀**다. 각 단계 오류·미증명에서는 중단한다. 기존D1좌표·제보·기여자·삭제이력을 임의 수정/초기화하지 않는다.

R5 극단 숫자문자열 JS/Python 계약과 **S1-P 승인후 공개·간접위치 정책**은 별도 과제로 남는다. 이번 PR이 해결했다고 보고하지 않는다. 실제 운영 민감정보 유출 사고의 증거는 없다.

## 재현과 최종 판정

실제 명령은 각 JSON receipts와 README에 있다. 핵심은 `integration/run_integrated.mjs c025... 58e1...`, `integration/b6_before_after.mjs`, `server/field-saved-protection-read/repro.mjs`/`expanded.mjs`, `browser/publication_chrome_final_r4.mjs` 및 B6 DOM, `operations/load-only/publication_local_load.mjs`/`chrome_load.mjs`/`normalize_chrome_load.mjs`/`combine_free_budget.mjs`, 최신main 임시결합 script다. 임시 source/DB는 저장하지 않고 합성 fixture·raw failure·종료코드를 보존했다.

**BLOCKED — 운영 배포 중단.** 현재까지 입증한 보안 통과 범위를 운영 PASS로 승격하지 않는다. 무료 한도·가용성 문제를 해결하고 필수 운영 확인을 완료하기 전 병합·배포하지 않는다.
