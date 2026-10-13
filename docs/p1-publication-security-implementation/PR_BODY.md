승인 설계 c128666을 구현해 승인 철회·가림·삭제 뒤 과거 응답이나 새로고침이 정확 위치를 다시 공개하는 경로를 서버 권한 epoch/revision과 클라이언트 pre/postflight로 차단합니다. field 삭제는 D1 terminal 불변 조건과 CAS가 늦은 상태 변경·확인을 막고, 앱 길찾기와 지연 GPS도 fresh authority를 재확인합니다.

**독립 검증용 Draft입니다. 운영 승인·main 병합·Worker/Pages 배포·운영 D1 변경을 수행하지 않았습니다.**

### 범위와 기준

- 승인 설계: c128666203bb5c483258b8231d0eb410c38e38f9
- 최신 main: 25e1fbae781c19fad53e770e4396fc625865f3b3
- 제품/시험 checkpoint: f7aee08f8bab6371cdffb8e2099d85b51a76765e
- PR13 head: b12e20c1b6d856a021898a0c1c9221b30393a221, PR16 head: 245298981e27f88ac26bad8b46d819a7df899c86 — 기존 PR은 변경하지 않았습니다.
- PR16 방어와 최소 S1-R 포함. PR13 추천 전체는 임시 tree a599638f3a0b8d95b367b94eaa4eb098127abba3에서만 결합했습니다. 충돌0, 자동 JSON Git blob main과 동일.
- additive D1 migration0005, no-store/nonce/snapshot, field CAS/terminal, canonical dual-write 유지, 5초 lease/poll·4초 timeout 및 동적 DOM/길찾기/GPS 폐쇄.
- 추천 산식·190곳 자료·좌표·자동 JSON 변경 없음. S1-P의 새 공개 정책은 포함하지 않습니다.

### 독립 실행 근거

|범위|pass|fail|skip|
|---|---:|---:|---:|
|구현 branch frontend|281|0|0|
|PR13 결합 frontend|359|0|0|
|reports-api(SQLite40/path3 포함)|221|0|0|
|weather-proxy|36|0|0|
|Python weather/tide/share|56 / 21 / 11|0|0 / 1 / 0|
|결합 자동 합계|704|0|1|
|실제 local workerd D1|18|0|0|
|실제 Chrome 5폭(결합)|165|0|0|
|S2 matrix / 특별 / popup|182 / 21 / 12|0|0|

S1-R171표현 누락0·일반17오탐0. 기존 보안4종×5폭20 및 Chrome 위험15는165의subset으로 unsafe0. two-page/multi-request/cache/refresh/timeout/GPS/삭제경합·정상복구·카카오/티맵을 실행했습니다. 고정2026-10-08 22:40 KST190/176, 제보ON/OFF 전체signature와상위10 상세 불변, PR13추천·점수·P0 관련75함수 동일. 현재10월12일main의today/week validators exit0.

실제 열린 팝업 href 잔존·무효 epoch 쓰기·lease내지연GPS 재확인누락을 발견해 보완하고 원형 실패를 보존했습니다. 기존 main 두 문구/chooser assertion은 정확 두앱URL과 부정조건을 더 엄격하게 검사하도록 갱신했습니다. 원장/명령/미실행은 [FINDINGS](docs/p1-publication-security-implementation/FINDINGS.md), [FINAL_MANIFEST](docs/p1-publication-security-implementation/FINAL_MANIFEST.json), [NEXT_SESSION](docs/p1-publication-security-implementation/NEXT_SESSION.md)에 있습니다.

### 운영 전 필수 조건과 rollback

독립 검증 후 실제 primary D1 schema/trigger 및 원자 migration·모든writer통제, paired public/admin source/version/bindings와 새 보호 유지 rollback version, CDN hard purge/bypass·옛client전환, 5초 lease/poll 비용과 관측 지연을 별도 승인해야 합니다. 물리 GPS·외부앱·운영POP는 미실행입니다. PR 전용CI는 없고 운영JSON workflow를 실행하지 않았습니다. 로컬 증거를CI성공으로보고하지 않습니다.

배포 순서는 보호 baseline/rollback 확보→원자D1설치→S1-R+publication+CAS 서버 선반영→cache처리→새Pages→자동기상갱신확인입니다. 실제 업로드된 보호 유지 rollback version은 아직 없습니다. schema와삭제·철회·epoch를돌리거나 S1-R 이전Worker/legacyflagfalse로복귀하는rollback은승인하지 않습니다. S1-P·R5 과제는별도이며 기존 공개정보 회수·0ms 철회를보장하지않습니다.

**이번 PR은 사용자 별도 운영 승인과 독립 검증까지 Draft로 유지합니다.**
