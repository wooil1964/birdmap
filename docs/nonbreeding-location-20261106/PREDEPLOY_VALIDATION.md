# PR #76 배포 전 성능·전환 검증

검증일: 2026-11-06 (Asia/Seoul). 시작 HEAD: 2a2a9ca6320b57dd040b2de4c9828fa7c2c6a7df, main: e05f725557986934aea8fe167b766f7e82f6a948.

## 판단

코드·합성 회귀는 통과했다. 큰 이력 조회에는 최소 자원 상한을 추가했다. **Draft를 유지하며 병합·운영 배포는 보류한다.** 최종 승인과 아래 운영 건수·인덱스·CPU/요금제·복구본 확인을 충족한 뒤에만 배포를 권고한다. 후보 1,000건 초과 탐조지는 이력 조회가 503이 되고 기존 화면의 공통 오류 처리로 다른 공개 마커·검색·캐시까지 일시 무효화되는 가용성 제약이 있으므로 실제 규모 확인 없이 무조건 배포 가능하다고 판단하지 않는다.

운영 D1의 제보·원자료·좌표·개인정보·스키마를 변경하지 않았다. 실제 제보 목록이나 개별 레코드를 조회하지 않았다. 민감 좌표를 로그·보고서에 포함하지 않았다. Draft 해제, main 병합, Worker/Pages 배포, 캐시 삭제도 실행하지 않았다.

## 최소 변경

- reports-api/src/site-history.js: 기존 탐조지 인덱스 순서로 승인 후보를 최대 1,001개 읽는다. 후보가 1,000개를 넘으면 SITE_HISTORY_UNAVAILABLE / 503 / no-store로 종료한다. 부분 history, total, 공개 권한은 반환하지 않는다.
- public.js의 legacy 경로와 publication.js의 primary snapshot 경로가 같은 쿼리·상한을 사용한다. 위치 보호를 JS에서 판정하는 기존 의미와 단일 snapshot을 유지한다.
- 1,000개 이하에서는 민감·위치 가림 행을 제외한 뒤 정확한 total과 정렬·페이지를 계산한다. 상한에는 비공개 후보도 포함하므로 제한을 피하려고 먼저 잘라서 잘못된 공개 건수를 만들지 않는다.
- 기존 publicationFetch는 이력 503도 공개 권한 실패로 처리하므로 해당 이력뿐 아니라 전체 공개 위치 자료를 지우고 재확인을 요구한다. 이는 보수적 기존 오류 처리이며 상한 초과 때 화면 영향이 더 넓어진다. 503 여부 자체로 비공개 후보를 포함한 임계 초과 여부라는 1비트 정보가 추론될 수 있다. 정확한 total·종·좌표는 반환하지 않지만 정보가 전혀 없는 응답은 아니다. 이 한계를 배포 판단에 포함한다.
- 인덱스·DB migration·운영 설정·index.html·탐조지 ID/종/좌표는 변경하지 않는다. 상한은 대용량 이력을 계속 제공하는 기능을 구현한 것이 아니다.
- reports-api/test/site-history-bounds.test.mjs와 .github/scripts/test_publication_rollout.mjs를 추가했다. 후자는 실제 이전 e05f725의 index.html을 git show로 읽는다. CI는 기존 full-history checkout 및 test_*.mjs 실행에 자동 포함된다.

## 큰 이력 성능과 D1 비용

재현: Node 24.18.0에서 node --expose-gc docs/nonbreeding-location-20261106/benchmark-site-history.mjs. 실제 SQLite 스키마, 합성 보호종 자료 두 종류, 각 3회 중앙값이다. 전체 수치는 [history-benchmark-results.json](history-benchmark-results.json)에 있다. 다음 표는 현재 입력 형식 안의 긴 메모/원자료 증빙 자료다. MB는 10진 바이트 기준이다.

| 승인 후보 | 기존 SQLite 조회 ms | 기존 JS 판정 ms | 기존 내부 결과 MB | 상한 적용 내부 결과 MB | 상한 적용 결과 |
|---:|---:|---:|---:|---:|---|
| 1,000 | 14.250 | 13.732 | 3.245 | 3.245 | 정확한 공개 이력 |
| 10,000 | 147.566 | 151.213 | 32.450 | 3.248 | 1,001개에서 503 |
| 100,000 | 1,693.924 | 1,355.778 | 324.500 | 3.248 | 1,001개에서 503 |

10만 개 기존 heap 증가 관측치는 약 586MB, 상한 적용은 약 6.1MB다. heap 수치는 JSON 크기 측정 작업까지 포함하며 peak/Worker isolate 측정값이 아니다. 원자료가 없는 legacy 합성 10만 개도 22.0MB 및 약 171.7MB heap 증가에서 0.220MB 및 약 1.72MB로 줄었다. 로컬 계획은 reports_site_history 검색과 증빙 PK/unique 인덱스 검색을 사용하며 전체 reports scan이나 임시 정렬을 하지 않았다.

로컬 시간·heap·SQLite 반환 행 수는 실제 D1 지연·rows_read·Worker CPU가 아니다. 상한은 행 수를 제한하지만 임의로 큰 과거 payload_json의 바이트 크기까지 보장하지 않는다. 운영 인덱스가 없다면 LIMIT만으로 scan/정렬 비용을 제한하지 못한다. 병렬 요청의 isolate 메모리도 별도 관측이 필요하다.

2026-11-06 확인한 [D1 제한](https://developers.cloudflare.com/d1/platform/limits/)은 쿼리 결과 50MB, 쿼리 30초다. 따라서 기존 긴 원자료 10만 개 사례는 결과 크기 한도도 넘는다. [Workers 제한](https://developers.cloudflare.com/workers/platform/limits/)은 isolate 128MB이며 Free CPU는 요청당 10ms다. 로컬 1,000개 JS 판정만 약 13.6ms이므로 Free 적합성을 증명하지 못한다. 요금제·설정된 CPU 상한을 확인하고 별도 격리 환경의 같은 합성 입력으로 CPU/메모리 여유를 확인해야 한다.

[D1 과금](https://developers.cloudflare.com/d1/platform/pricing/)은 반환 건수가 아닌 실제 읽은 행 기준이다. 증빙 서브쿼리·인덱스·공개 권한 검사의 비용도 있다. Free 읽기 500만 행/일, Paid 250억 행/월 포함 후 100만 행당 USD 0.001이다. 실제 호출당 R=meta.rows_read를 관측해야 한다. 월 예상 초과 읽기 비용은 max(0, 전체 endpoint의 월 읽기 합계 - 25,000,000,000) / 1,000,000 × USD 0.001이다. 1,001개 반환을 1,001개 과금으로 단정하지 않는다. 5초 권한 확인 등 다른 경로의 사용량도 합산한다. 이번 작업은 실제 과금액을 측정하지 않았다.

### 운영 규모 확인 관문 (미실행)

현재 Cloudflare 관리 연결/운영 통계 증거가 없어 실제 최대 건수·인덱스 존재·요금제를 확인하지 못했다. 아래 SELECT는 좌표·종·이름·탐조지 ID를 반환하지 않는 1회 집계 예시이며 실행하지 않았다. 전체 승인 이력을 훑을 수 있으므로 반복하지 않고 조용한 시간에 읽기 전용으로 확인한다.

~~~sql
SELECT COALESCE(SUM(n),0) AS approved_linked_rows,
       COUNT(*) AS sites_with_history,
       COALESCE(MAX(n),0) AS max_approved_per_site,
       COALESCE(SUM(CASE WHEN n>1000 THEN 1 ELSE 0 END),0) AS over_budget_sites
FROM (
  SELECT COUNT(*) AS n FROM reports
  WHERE status='approved' AND site_id IS NOT NULL AND site_id<>''
  GROUP BY site_id
);
SELECT sql FROM sqlite_schema
WHERE type='index' AND name='reports_site_history';
~~~

over_budget_sites=0이고 기존 인덱스의 열 순서가 site_id,status,observed_on DESC,received_at DESC,id DESC인지 확인한다. 초과 탐조지가 있으면 이 PR의 503 제한을 묵인하지 말고 배포를 멈추고 별도 확장 설계를 검토한다. 운영 스키마 변경이나 상한 증가는 이번 검증에 포함하지 않는다. 정상 범위에서 일부 쿼리의 duration/rows_read/Worker CPU는 행 값 없이 집계로 관측한다.

## 화면/API 버전과 캐시

| 화면 | API | 검증된 동작 |
|---|---|---|
| 실제 이전 e05f725 (legacy-public-v1) | v1 | 기존 공개 권한 계약 허용. 새 보호 정책이 적용되었다는 뜻은 아님 |
| 실제 이전 e05f725 | v2 | 같은 epoch/revision이어도 거부·저장 위치 및 이력 제거 |
| 새 v2 화면 | v1 | 거부·저장 위치 및 이력 제거 |
| 새 v2 화면 | v2 | preflight/payload/postflight 일치 때만 허용 |

신규 16개 검사는 위 네 조합, preflight→payload 전환, payload→postflight 전환, 숨김/복귀 뒤 늦은 payload와 예전 HEAD의 HTTP 실패, 캐시·표시된 이력 제거 및 5초 상한을 확인한다. DOM을 대역으로 사용하는 VM 검사이며 모든 물리 브라우저/저장 파일을 검증한 것은 아니다. 실제 Chrome 일반 회귀는 PR CI에서 별도로 확인한다.

구/신 화면은 contract와 projection을 엄격히 검증한다. publicationInvalidate는 승인·대기 마커, 검색, 고정/연결 이력, recent, siteHistoryCache, 관련 DOM과 이름을 지운다. generation 및 pre/postflight 검사로 늦게 도착한 응답을 재사용하지 않는다. 요청은 cache:no-store, 공개 응답과 오류는 Cache-Control:no-store다. 검토한 index/assets/Worker에 Service Worker나 Cache API 사용은 없다.

화면 요청 query에는 projection이 없으므로 직접/custom 구 클라이언트가 v2 payload를 요청할 수 있다. 보안 경계는 새 서버의 v2 필터다. REPORTS_PUBLICATION_REQUIRED=true이면 nonce/contract 없는 legacy GET은 400이고, false인 비운영 fallback도 새 위치 판정을 사용한다. 배포 때 실제 활성 flag가 true인지 확인한다.

이미 열린 이전 화면은 다음 권한 확인 또는 남은 최대 5초 lease까지 이전 값을 보유할 수 있다. 숨김·만료 감지 때 파기하지만 브라우저 타이머 정지, 이미 전달된 값, pre-v1 클라이언트, 저장한 HTML/사진/파일의 원격 회수는 보장할 수 없다. 모든 클라이언트에서 순간적으로 0초 노출로 바뀐다고 설명하지 않는다.

### 최소 운영 읽기 확인

2026-11-06 20:00:46 KST에 공개 GitHub Pages URL의 HEAD만 1회 호출했다. HTTP 200, server GitHub.com, Cache-Control:max-age=600, Age:0, X-Cache:HIT를 확인했다. 응답 본문은 읽지 않았다. 이는 해당 응답의 관측이며 모든 지역/사용자 캐시의 상태를 증명하지 않는다.

20:01:26 KST에 허용 Origin을 보낸 /reports/public-state 1회에서 HTTP 200, no-store, publication-v1 / legacy-public-v1과 anchor 형식만 확인했다. epoch/revision 원값·제보·좌표는 보관하지 않았다. 앞선 Origin 없는 1회는 HTTP 403/no-store였다. 이외 운영 레코드/집계 조회는 하지 않았다. 실제 Worker 트래픽 배분·설정·계정 요금제·D1 인덱스를 조회한 결과가 아니다.

정적 HTML의 600초 캐시는 API no-store와 별개다. GitHub Pages는 Cloudflare Worker 배포/캐시 삭제로 갱신되었다고 간주할 수 없다. 승인 후 호스팅 주체의 지원 수단으로 재검증/삭제하고 새 ETag·새 projection을 확인한다. 소유자에게 purge 수단이 없다면 600초는 관측된 캐시 지연 예산으로 두고 여러 경로에서 재검증한다. 대기만으로 모든 캐시 삭제 완료를 보증하지 않는다. 구 HTML이 남아도 새 v2 API와 불일치하면 위치 기능은 닫혀야 한다.

## 승인 후 전환 순서 (실행하지 않음)

1. 최종 검증 SHA의 CI regression/gps-browser 성공을 확인하고, 사용자에게 병합 및 Worker/Pages 운영 전환의 명시적 최종 승인을 받는다. 승인 전 Draft 유지. 현재 main/작업 HEAD 변화 및 Pages 배포 설정을 다시 확인한다. 과거 기록상 main root 자동 반영이므로 backend 준비 전에 main을 병합하지 않는다.
2. 위 익명 집계·인덱스·요금제/CPU 여유·배포 flag와 바인딩·기존 캐시 규칙을 확인한다. 같은 SHA의 보호 Pages artifact 및 검증된 v2 Worker 복구본을 확보하고 해시·만료·권한을 기록한다. 첫 v2 배포 전에 안전한 공개 읽기 차단 대안도 증명한다. 이 준비 없이 전환하지 않는다.
3. 승인된 SHA의 public Worker를 v2로 전환한다. 이전 Worker 버전 트래픽 0%, 새 버전 100%, preview/대체 경로와 REPORTS_PUBLICATION_REQUIRED=true를 확인한다. v1/v2 트래픽을 섞는 점진 전환은 권고하지 않는다. admin 소스/DB 구조를 이 PR 때문에 변경할 필요는 없다.
4. 제보 목록을 덤프하지 않고 public-state projection/no-store/strict 및 legacy GET 오류를 확인한다. 합성 전환 검증과 열린 구 탭의 삭제 동작을 확인한다. 필요한 운영 확인은 비식별 통계만 기록한다. 새 서버에서 오류/성능 초과가 있으면 다음 단계로 가지 않는다.
5. 이후 검증 SHA를 main에 병합하고 GitHub Pages 반영을 확인한다. 별도 Pages 배포 설정이면 승인된 해당 경로로만 진행한다. 정적 HTML 캐시를 재검증하고 새 v2 화면, 구 탭, 오프라인 복귀, BFCache, 지연 응답에서 재노출이 없는지 확인한다. 버전 불일치 중 위치 기능이 닫히는 짧은 가용성 공백은 예상한다.
6. 민감 좌표를 기록하지 않는 errors/duration/CPU/rows_read 집계를 관측한다. 상한 초과 503, 데이터 권한 불일치, 재노출 또는 resource 오류가 있으면 즉시 중단하고 아래 절차를 따른다.

## 롤백 절차 (실행하지 않음)

- 배포 중 문제를 발견하면 추가 전환과 병합을 중단하고 v2 보호를 유지한다. 기존 v1 Worker/화면을 함께 되돌리면 이 PR이 막은 공개 경로가 다시 열릴 수 있으므로 이를 안전한 롤백으로 사용하지 않는다.
- 화면만 문제이면 v2 Worker를 유지하면서 사전 검증·보관한 v2 보호 Pages artifact를 복원하고 정적 HTML을 재검증한다. 공개 기능을 닫는 화면만으로 직접 API 요청까지 막힌다고 가정하지 않는다.
- Worker 문제이면 검증된 v2 보호 Worker 복구본으로 100% 전환하고 public-state/거부 응답/no-store를 확인한다. 안전한 복구본이 없으면 사전에 검증한 공개 읽기 503 차단판 또는 트래픽 차단 수단으로 해당 공개 payload를 닫고 v2로 forward fix한다. 현재 READ_ONLY_MAINTENANCE는 쓰기 gate이며 공개 GET 차단을 보장하지 않으므로 대체재가 아니다.
- 1,000건 상한에 걸린 장애를 해결하려고 v1이나 무제한 쿼리를 즉흥 복원하지 않는다. 규모 확인 뒤 별도 확장 설계로 해결한다.
- D1 백업 복원, 기록 삭제/수정, migration 역적용, epoch/revision 수동 초기화/증가는 이 코드 전환 롤백에 필요하지 않다. 기존 삭제·철회 이력을 보존한다.
- 복구 후 동일한 구/신 조합·지연 응답·캐시 재노출 검사를 반복하고, 위치 자료·개인정보 없이 결과를 기록한다. 실제 복구본 배포 리허설 및 운영 배분 확인은 아직 수행하지 않았다.

## 검사와 잔여 조건

- reports-api/test/*.test.mjs 23개 파일: 378/378 통과 (새 경계·초과·쿼리 계획 검사 포함).
- 전환/만료/갱신/탐조지 캐시 4개 파일: 54/54 통과 (실제 구 소스 전환 16개 포함).
- 기존 승인 이력·공유 DTO·위치 팝업 등 6개 파일: 별도 검토자 47/47 통과. 위 54개와 일부 중복이므로 합산하지 않는다.
- site_data_contract.py --export 통과. 데이터 산출물은 작업 폴더에만 보관한다. 탐조지/고정점 좌표·종·ID 변경 없음.
- 이전 2a2a9ca CI [42198889597](https://github.com/wooil1964/birdmap/actions/runs/42198889597)의 regression/gps-browser 성공을 재확인했다. 이번 보완 commit의 전체 CI는 PR Checks에서 정확한 HEAD로 별도 확인해야 한다. 보고서가 포함된 commit 작성 전에는 CI 성공으로 간주하지 않는다.
- git diff --check 및 최종 변경 목록은 commit 전에 확인한다. 전체 저장소 로컬 회귀는 실행하지 않았으며 PR CI가 담당한다.

실제 운영 최대 건수·인덱스·CPU/요금제·배포 flag·전체 캐시 규칙·복구본 배포 리허설은 미확인이다. 소스/합성 검증 통과와 운영 전환 승인은 구분한다. 이 문서는 배포 승인이나 실행 기록이 아니다.
