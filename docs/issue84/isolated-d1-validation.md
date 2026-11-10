# PR #85 — 운영과 격리된 D1 마이그레이션·통합 검증

검증일: 2026-11-10 KST. 기능 코드 기준: `7aef53e82ec6b460bfd7858f8ba4871d74d2b167`.
시작 시 PR #85는 open/draft/unmerged였고 해당 HEAD의 CI #160 (`42730247997`)는 성공이었다.
최신 main `1fa87b0f6ebf1308ec4345c92855b4203ab9b06a`과 기존 기준 main `884c4d5`의 차이는 자동 생성 `tide_month.json` 하나였다. rebase나 데이터 변경은 하지 않았다.

## 범위와 환경

- Node 24.18.0에서 실제 public/admin Worker 처리 코드를 호출하고, SQL은 CI와 같은 `miniflare@5.20261006.1-alpha` / workerd의 로컬 D1 바인딩에서 실행했다. Node SQLite 대역만으로 얻은 결과가 아니다.
- 기존 `local-test/helpers.mjs`의 SQL 분리기, 합성 Access JWT/인증 대역, 두 Worker 환경, 접수·승인 도구와 실제 writer-fence 코드를 재사용했다.
- DB 식별값은 `issue84-local-only`, 메모리 저장(`d1Persist:false`), 127.0.0.1, Cloudflare 환경 조회 OFF다. Wrangler 설정·계정·운영 DB·실제 제보·운영 인증정보를 읽지 않았다. 인증/Turnstile fetch는 합성 응답만 허용하고 예상 밖 URL은 오류로 거절한다.
- 모든 데이터는 합성이다. 첫 fixture에서 접수→승인으로 raw/checklist/sightings/reviews를 만들고, 나머지 경계 조건은 명시적 fixture INSERT로 구성했다. 확인 후 같은 닉네임으로 실제 POST→승인하는 경로도 별도로 실행했다.
- 변경은 이 검증 도구, 결과 JSON, 이 문서, CI 2줄뿐이다. 기능 코드·0007·배포 설정은 수정하지 않았다.

## 결과

`isolated-d1.mjs`의 **23/23 시나리오 통과**. [기계 판독 결과](isolated-d1-results.json)에 시간, 소스 HEAD, 엔진 버전, 검사명, 전후 SHA-256을 기록했다.

| 영역 | 실제 확인한 결과 |
|---|---|
| 선행 조건 | publication state/빈 claim/기존 writer guards 준비 확인. fresh schema와 보존된 pre-publication schema + 실제 0004b→0005→0006→0007 양쪽 경로 통과. 후자는 동결 유지 후 로컬 운영자 thaw를 거쳤다. |
| 0007 적용 | 새 테이블 정확히 2개, 트리거 정확히 8개. 기존 모든 테이블·인덱스·트리거 SQL 정의 및 기존 행·publication revision 보존. |
| 재실행·실패 | 두 번째 적용은 `already exists`로 거절되고 스키마·모든 데이터 불변. D1.batch 중간 오류는 새 DDL 전체 롤백, 깨끗한 재시도 성공. |
| writer claim·보호 | claim 없는 reports 변경·그룹 생성·이벤트 삽입 거절. 기존 writer guard 누락·orphan claim 시 쓰기 거절, orphan 자동 삭제 없음. confirm/revoke 늦은 실패에서 그룹·이벤트·revision·claim 모두 롤백. |
| OFF/ON | 기본 OFF에서 migration 없는 구형 스키마 조회 및 원래 정확 닉네임 집계 정상, 확인 API 404. ON인데 0007 또는 publication-required 설정 누락 시 503. OFF 복귀 시 정확 닉네임 집계 복원. |
| 연결·해제·이력 | 선택 ID만 연결, received_at 기준 최초 제보 선택, 원문/정본 불변, confirm/revoke마다 revision +1. 잘못된 ID·중복·익명·겹친 그룹·본인 확인 누락 거절. 이력 조회, 그룹/이벤트 불변성, 반복 revoke 시 이력·revision 추가 없음 확인. |
| 동명 관리자 상세 | 확인 그룹 2개와 미연결 이름 그룹이 동명이어도 키별 상세 ID 분리. 이름만으로 모호하면 400, 위조·해제된 키 404, 무인증 거절, no-store. 새 동명 fixture와 실제 신규 접수 모두 기존 확인 그룹에 편입되지 않음. |
| 동의·승인·삭제 | 비대표 제보 동의 철회 시 해당 행만 제외. 대표 이름 동의 철회/승인 취소/삭제 시 그 이름을 다른 연결 행으로 공개하지 않고 각 원래 이름으로 복귀. 각 변경 뒤 기존 revision 응답은 409. |
| 공개 보안 | 민감종의 상세 종 목록/지도 위치 제외, 위치 가림 제보는 지정 공개 좌표만 사용, 비공개 이름·정확 좌표·메모·해시·확인 근거·관리자·그룹 ID는 해당 통계 DTO에 없음. count-only DTO 필드 제한 확인. |
| 복구·불변성 | freeze가 confirm/revoke를 차단하고 정상 공개 읽기는 유지. 명시적 로컬 thaw 후 복구, claim 잔류 0. 8개 identity trigger를 각각 제거하면 공개 payload 503, 원래 정의 복원 후 정상. FK 검사 정상. 복구 전후 모든 raw/정본/관련 행 및 의도적으로 삭제한 대표 제보 외의 reports 값이 정확히 동일. |

관련 선별 회귀: API/SQLite **179/179**, 프런트 종 검색·제보 검색·누적종수·기여자 **64/64**. 전체 로컬 회귀는 실행하지 않고 PR CI를 유지한다. 검사 중 잘못 세운 하네스 기대값(미연결 동명끼리의 기존 정확 이름 집계, freeze 중 읽기 허용, 민감종 지도 행 완전 제외)을 현재 계약과 대조해 바로잡았으며 기능 코드 변경은 없었다.

## 적용·복구에 필요한 조건

1. **0007은 자체 preflight 도구가 아니고 반복 적용 가능한 SQL도 아니다.** 빈 DB에서도 SQLite는 다른 테이블을 참조하는 trigger DDL을 받아들였다. 그러나 실제 확인 쓰기는 선행 스키마 부재로 거절됐다. 따라서 운영 적용 승인 전에 reports 필수 컬럼, publication state와 기존 보호 정의, writer claim 0건, 기존 0007 객체의 부재 또는 정확한 설치 상태를 별도로 확인해야 한다. DDL 성공만으로 준비 완료라고 판정하면 안 된다.
2. 동일 DB에 무조건 재적용하지 않는다. 이 검증은 **D1.batch**의 원자적 적용·롤백을 검증했다. 실제 운영에서 사용할 migration 실행기의 이력 관리·실패 복구·원자성은 별도 확인 대상이다. 부분 설치가 보이면 임의 DROP/역 UPDATE로 수정하지 않고 승인된 스냅샷·실행 이력과 대조한다.
3. 잘못 확인한 그룹은 해제하고 새 ID 집합으로 재확인한다. OFF는 원래 정확 닉네임 집계로 복귀시키며 감사 이력은 보존한다. 원문 역 UPDATE는 필요 없다.
4. writer freeze 중 일반 Worker writer wrapper는 thaw할 수 없다. 로컬에서는 raw D1에 대한 명시적 운영자 state 전이(revision +1)로 thaw했다. 운영의 freeze/thaw·백업/복원 절차는 별도 승인 대상이다. 보호 trigger와 writer fence를 제거하지 않는다.

## 미확인·실시하지 않은 항목

- **운영 D1 읽기/쓰기 0, Worker/Pages 배포 0, main 병합 0, PR ready 전환 0.**
- 원격 스테이징 D1, Cloudflare 계정의 실제 migration 실행기, 실제 Access/Turnstile·서비스 바인딩/배포 롤아웃, 복제 지연·분산 동시성·부하·장기 장애, 원격 스냅샷/PITR 복원은 미확인이다.
- 로컬 Worker 처리 코드는 Node에서 호출했고 D1은 workerd에서 실행했다. 배포된 Worker 전체 HTTP 환경을 검증한 것으로 표현하지 않는다.
- 실제 휴대폰 검사는 미실시. 관리자 PC/모바일 브라우저의 기존 48개 결과는 이전 단계 기록이며 이번 재실행 수치에 합산하지 않는다.
- 좌표·탐조지·고정점·index.html·기상/조석 데이터는 변경하지 않았다. 새 좌표 입력/보정이 없으므로 외부 지도·엑셀 좌표 전수 대조는 이번 범위 밖이다.

## 재현

운영 설정이 없는 별도 디렉터리에 CI와 같은 Miniflare를 설치한 뒤 저장소 루트에서 실행한다.

```sh
npm install --prefix <test-toolchain> --no-save --package-lock=false --no-audit --no-fund miniflare@5.20261006.1-alpha
node docs/issue84/isolated-d1.mjs <test-toolchain>/node_modules <test-output>/isolated-d1-results.json
node --test reports-api/test/issue84.test.mjs reports-api/test/admin-reporter-groups.test.mjs reports-api/test/writer-fence.test.mjs reports-api/test/publication-security.test.mjs reports-api/test/reporter-lifetime-stats.test.mjs reports-api/test/protection.test.mjs reports-api/test/species-split.test.mjs reports-api/test/legacy-species-read.test.mjs
node --test .github/scripts/test_species_search.mjs .github/scripts/test_report_search.mjs .github/scripts/test_reporter_lifetime_stats.mjs .github/scripts/test_recent_contributors.mjs
```

기존 CI의 Miniflare 검사 마지막에도 같은 검증을 추가했고 결과 JSON을 진단 artifact에 포함한다. CI 실행 결과 JSON은 해당 runner가 checkout한 SHA를 기록한다.
