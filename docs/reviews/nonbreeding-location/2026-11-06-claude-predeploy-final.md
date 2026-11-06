# PR #76 운영 배포 전 최종 검증 (Claude Code)

- 작성: 2026-11-06, Claude Code (Opus 5.5)
- 기준: PR #76 HEAD `60128122de552700166a397d2c007cba31224d9f` (Codex), main `e05f725`
- 보완 커밋: `e74e9fc` (이 검증의 유일한 코드 수정)
- 이전 보고서: [PREDEPLOY_VALIDATION.md](../../nonbreeding-location-20261106/PREDEPLOY_VALIDATION.md) (수정하지 않음)
- 실행하지 않은 것: Draft 해제, main 병합, Worker·Pages 배포, Worker 버전 업로드, D1 데이터·스키마 변경, 캐시 삭제

운영 확인은 Wrangler 4.149.0 OAuth(기존 로그인, 재로그인 없음)로 읽기 전용 SELECT/EXPLAIN과 집계 지표만 사용했다. 종명·제보자·좌표·탐조지 ID·개별 기록은 출력하거나 저장하지 않았다.

## 1. 결론

**조건부 보류.** 코드와 합성 검사는 통과했고, 운영 규모(탐조지당 최대 21건)는 1,000건 상한보다 훨씬 작다. 요금제는 Workers Paid로 확인되었다(7절). 남은 조건은 두 가지다.

1. 운영 D1에 `reports_site_history` 인덱스가 **없다**. 이전 보고서는 이 인덱스를 쓴다고 적었지만, 실제 운영 계획은 `reports_status` 인덱스 검색 + 임시 B-tree 정렬이다. 지금 규모에서는 문제없지만 LIMIT 1001이 읽는 행 수를 제한하지 못한다. 배포를 막는 결함은 아니고, 적용 여부는 별도 승인 사항이다(7.3).
2. 복구용 v2 Worker 버전과 v2 Pages 복구본이 아직 없다. 지금 있는 Worker 롤백 대상은 모두 v1이라 롤백에 쓸 수 없다(7.4). 첫 배포 전에 긴급 차단 수단을 정하고 승인받아야 한다.

## 2. 항목별 결과

### A. 운영 D1 (실제 운영에서 확인)

| 항목 | 결과 | 근거 |
|---|---|---|
| 인증·계정·바인딩 | PASS | Wrangler OAuth 정상. 운영 버전 `a174e570`(100%, 2026-10-21 배포)의 `REPORTS_DB` = `birdmap-reports` `b48201cc…`, toml과 같음. vars도 toml과 같음(`CANONICAL_DUAL_WRITE`, `REPORTS_PUBLICATION_REQUIRED=true`) |
| 전체 승인 제보 수 | PASS | 129건(탐조지 연결 113건). 공개 대기 마커 0건 |
| 탐조지별 최대 승인 제보 수 | PASS | 21건(이력 있는 탐조지 38곳, 100건 넘는 곳 0) |
| 1,000건 초과 탐조지 | PASS | 0곳 |
| `reports_site_history` 인덱스 | **FAIL** | `reports` 테이블에 없음. 있는 인덱스: `reports_dedupe`, `reports_ip_recent`, `reports_pending_public`, `reports_spot_key`, `reports_status`, 자동 PK. `checklists_site_history`는 `checklists` 테이블에 있어 이 쿼리와 무관 |
| EXPLAIN QUERY PLAN | 확인(인덱스 미사용) | `SEARCH reports USING INDEX reports_status (status=?)` → `USE TEMP B-TREE FOR ORDER BY`. 증빙 부질의 2개는 `raw_submissions` 자동 인덱스(source_type, source_id)와 `checklists` PK를 사용. `reports` 전체 훑기는 아니지만 승인 행 전부를 읽는다 |

행 수 실측(운영 D1 `meta.rows_read`, 결과는 집계만):

| 쿼리 | rows_read | 비고 |
|---|---:|---|
| 탐조지 이력, 없는 탐조지 | 131 | 승인 행 전체를 읽고 버림 |
| 탐조지 이력, 최대 탐조지(21건) | 516 | 탐조지 선택용 GROUP BY 포함 |
| 승인 전체 + 증빙(`/reports/approved`·검색과 같은 모양) | 699 | 129행, 증빙 있는 행 110, 증빙 JSON 19.6KB |

### B. 성능

| 항목 | 결과 | 구분 |
|---|---|---|
| 1,000건 상한의 적절성 | PASS(현 규모) | 운영 최대 21건 대비 약 48배 여유. 인덱스가 없어 상한은 읽기 비용이 아니라 반환·JS 처리량만 제한한다 |
| 1,000건 초과 시 503 | PASS | 합성: `site-history-bounds.test.mjs`. 운영에는 초과 탐조지가 없어 실제 발생 안 함 |
| 503 때 다른 공개 마커 소실 | `6012812`에서 FAIL → `e74e9fc`에서 수정, 합성 PASS | 아래 3절 |
| D1 rows_read | 운영 측정 | 지난 7일 하루 18.8만~38.3만 행(합계 219만). 승인 전체 조회는 v1 약 130행 → v2 699행(약 5.4배). 모든 읽기가 같은 비율로 는다고 가정한 최악 추정도 하루 약 210만 행(무료 한도 500만/일 이내) — **추정**, 배포 후 실측 필요 |
| Worker CPU(현재 v1) | 운영 측정 | 30일 성공 136,422건, 오류 0, `exceededCpu` 상태 없음. 7일 p50 0.81ms, p99 6.4ms, p99.9 11.4ms, 최대 32ms(30일 최대 40.6ms) |
| Worker CPU·메모리(v2) | **미확인** | 배포 전에는 운영 측정 불가. 합성: 129행에서 승인+이력+검색 필터 JS 합계 중앙값 약 2.0ms, 1,000행 약 10.3ms(Node 24, 로컬) |
| 요금제 | PASS(소유자 확인) | 소유자가 대시보드에서 Workers Paid(Standard) 확인: 월 요청 1,000만 건·CPU 3,000만 ms 포함, 현재 추가 요금 $0.00. Free 10ms 제한 우려는 해소. API로는 조회 불가(인증 오류) |
| 개별 Worker CPU 상한 설정 | 확인 | `birdmap-reports` usage_model `standard`, `user_limits` 없음(사용자 지정 상한 미설정 → 요금제 기본값 적용). 기본값 수치는 Cloudflare 문서 기준이며 이번에 실측하지 않음 |

### C. 배포·복구

| 항목 | 결과 | 근거 |
|---|---|---|
| v2 Worker → Pages 순서 | PASS(절차) | GitHub Pages는 legacy 빌드, 출처 `main` `/` (API 확인). main 병합 = Pages 배포이므로 Worker가 먼저여야 함. 운영 Worker 소스는 main과 차이 없음(`4a76b41` 이후 `reports-api/src` 변경 없음) → 배포되는 Worker 변경은 PR 범위뿐 |
| projection 일치 | PASS | `publication.js`와 `index.html` 모두 `nonbreeding-location-v2`. 운영은 현재 `legacy-public-v1` |
| 구 화면 + 신 API 혼재 | PASS(합성) | `test_publication_rollout.mjs`가 실제 이전 `e05f725` 화면을 git에서 읽어 검사. 구 화면은 v2 응답을 거부하고 위치·이력·캐시를 지운다 |
| 오래된 캐시 재노출 방지 | PASS(합성) / 실브라우저 미확인 | 요청 `cache:no-store`, 응답 `no-store`, 5초 lease. Pages HTML `max-age=600`은 Codex의 1회 관측. 실제 브라우저·CDN 전 경로는 미확인 |
| v2 Worker 복구본 | **FAIL(미준비)** | v2 버전이 업로드된 적 없음. 기존 버전(`a174e570`, `eb0edf4d` 등)은 전부 v1이라 롤백 금지. `preview_urls=false`라 업로드 버전을 트래픽 없이 시험할 경로도 없음 |
| Pages 복구본 | **미준비** | legacy 빌드라 별도 artifact가 없고 복구 = main 커밋 되돌리기. v2 병합 커밋이 생겨야 v2 복구 기준이 생김 |
| 공개 읽기 긴급 차단 수단 | **미확인** | 공개 GET을 닫는 변수·스위치가 코드에 없음. `READ_ONLY_MAINTENANCE`는 쓰기 차단. 남은 수단은 `workers_dev` 비활성화 같은 전체 차단뿐이며 시험하지 않음 |

### 검사 기준 1~6

| 기준 | 결과 | 구분 |
|---|---|---|
| 1. 비번식 확인 보호종 위치 표시 | PASS | 합성(`nonbreeding-location.test.mjs`). 운영 승인 129건 중 확인 증빙 110건, 증빙 없는 19건은 v2에서 '미확인'으로 분류 |
| 2. 번식·둥지·새끼 보호종 비공개 | PASS | 합성 |
| 3. 번식 미확인 보호종 비공개 | PASS | 합성 |
| 4. 위치 가리기·이름 공개 동의 유지 | PASS | 합성 |
| 5. 검색·최근 제보·이력·연결 마커 유출 방지 | PASS | 합성. `/reports/recent-sites`는 기존처럼 보호종 전체를 빼는 보수적 규칙 유지 |
| 6. regression·gps-browser CI | PASS | `6012812`, `e74e9fc` 모두 두 건 성공 |

## 3. 코드 수정 (`e74e9fc`)

문제: 탐조지 이력이 1,000건을 넘어 서버가 `SITE_HISTORY_UNAVAILABLE`/503을 주면 `publicationFetch`가 모든 오류를 같은 방식으로 처리해 `publicationInvalidate`를 불렀다. 그 탐조지 팝업 하나 때문에 승인·대기 마커, 검색, 최근 제보, 이력 캐시가 모두 지워졌다가 다음 재확인(최대 5초) 때 다시 그려졌다.

수정(`index.html` 13줄, 테스트 16줄):

- `publicationJson`: HTTP 오류일 때 응답 본문의 `error.code`만 오류 객체에 남긴다. 본문을 못 읽으면 예전과 같다.
- `publicationFetch`: 오류 코드가 `SITE_HISTORY_UNAVAILABLE`이고 경로가 `/reports/site/`일 때만 전체 무효화를 건너뛴다. 그 이력 칸만 실패(`null`)로 처리된다.

보호가 약해지지 않는 이유:

- 서버는 `validateState`(요청한 epoch·revision·projection 확인)를 마친 뒤에야 이력 상한 오류를 던지고, 이 응답에는 이력·건수·좌표가 없다.
- 5초 lease는 갱신하지 않는다. 기존 표시 자료는 원래 만료 시각에 그대로 닫힌다(테스트로 확인).
- 다른 오류 코드, 다른 경로의 같은 코드, 권한 변경(revision 변경)은 예전처럼 전체를 닫는다(테스트로 확인).
- 503 자체가 '비공개 포함 1,000건 초과'라는 1비트를 알려 주는 한계는 전과 같다. 현재 운영에는 해당 탐조지가 없다.

검사: 새 테스트 3개 추가. 수정 전 `index.html`로 돌리면 첫 테스트가 실패하는 것을 확인했다.

## 4. 시험 결과

| 범위 | 결과 |
|---|---|
| `reports-api/test/*.test.mjs` | 378/378 통과 |
| 공개 권한 전환·만료·갱신·이력 캐시 4개 파일 | 57/57 통과(기존 54 + 신규 3) |
| `.github/scripts/test_*.mjs` 전체(로컬) | 607 통과, 7 실패, 나머지 건너뜀. 실패 7건(공지 닫기 hit target 5건, 공지 연계 장소 1건, 주간 편집 목록 1건)은 수정 전 `6012812`에서도 같은 7건이 실패하는 로컬 환경 의존 검사이며 이번 변경과 무관. 같은 검사를 돌리는 `6012812` CI는 성공 |
| `git diff --check` | 통과 |
| PR CI (`e74e9fc`) | regression 성공(18분 48초), gps-browser 성공(8분 12초) — [run 42212747122](https://github.com/wooil1964/birdmap/actions/runs/42212747122). 이 보고서만 더한 다음 커밋의 CI는 PR Checks에서 따로 확인 |

좌표 검증: 해당 없음(탐조지·고정점 좌표, `siteData`, `sites.js` 변경 없음).

## 5. 배포 전 남은 위험과 조건

1. **인덱스 부재**: 이력 조회는 승인 행 전부를 읽는다. 지금(129행)은 무시할 수준이지만 제보가 늘면 rows_read와 지연이 늘어난다. `migrations/0003_site_history_index.sql`이 운영에 적용되지 않은 상태다. 적용은 운영 스키마 변경이라 이번 범위 밖이며 별도 승인이 필요하다.
2. **요금제**: Paid 확인으로 해소. v2의 실제 CPU·rows_read는 배포 뒤 관측 대상으로 남는다.
3. **복구본 없음**: 첫 v2 배포 뒤에는 그 v2 버전 ID가 첫 복구 기준이 된다. 그 전에 문제가 생기면 v1으로 되돌릴 수 없으므로, 유일한 안전 대안은 v2 앞으로 고치기 또는 전체 트래픽 차단이다. 전체 차단 절차는 시험하지 않았다.
4. **v2 운영 CPU·rows_read**: 배포 직후 집계 지표로 확인해야 한다.
5. 승인 목록·검색은 여전히 상한 없이 승인 전체를 읽는다(v1과 같음, 증빙 부질의만 추가). 지금 규모는 문제없다.

## 6. 안전한 배포·롤백 절차 (승인 후, 실행하지 않음)

배포:

1. 최종 SHA의 CI 두 건 성공과 사용자 최종 승인을 확인한다.
2. `npx -y wrangler@4.149.0 versions upload -c wrangler.public.toml --tag nbl-v2-<sha7> --message "PR76 <sha>"`로 v2를 트래픽 없이 올린다. `versions view <id> --json`으로 vars·D1·service 바인딩이 `a174e570`과 같은지 확인한다.
3. `versions deploy <v2id>@100%`. v1 0%, 새 버전 100%를 `deployments status`로 확인한다. 이 v2 버전 ID를 복구 기준으로 기록한다.
4. 허용 Origin으로 `/reports/public-state`를 1회 호출해 `nonbreeding-location-v2`, `no-store`를 확인한다. 열린 구 화면은 이때부터 위치 기능을 닫는다(예상된 짧은 공백).
5. 이상 없으면 PR을 main에 병합한다(= Pages 배포). Pages 빌드 성공과 새 HTML의 projection을 확인한다.
6. 15~60분 동안 Worker 오류·CPU p99·최대값, D1 rows_read를 집계로만 확인한다.

롤백:

- **v1 Worker(`a174e570` 등)로 되돌리지 않는다.** 보호종 위치가 다시 공개될 수 있다.
- 화면 문제: main에서 PR 병합을 되돌린다(revert). 구 화면은 v2 API를 거부하므로 위치 기능이 닫힌 채로 안전하게 남는다. v2 Worker는 그대로 둔다.
- Worker 문제: 3단계에서 기록한 v2 버전으로 되돌리거나(두 번째 배포부터 가능), 고친 v2를 새로 올린다. 첫 v2에서 바로 문제가 나면 v1 대신 공개 읽기를 닫는 수정판을 앞으로 배포한다.
- D1 복원, 기록 삭제, epoch/revision 수동 변경은 필요 없다.

## 7. 추가 검증 (요금제 확인 뒤, 2026-11-06)

### 7.1 요금제

소유자가 Cloudflare 대시보드에서 `birdmap-reports`가 있는 계정이 **Workers Paid(Standard)** 임을 확인했다. 월 기본 제공량은 요청 1,000만 건·CPU 3,000만 ms이고 현재 추가 요금은 $0.00이다. 이에 따라 Free 요금제의 요청당 10ms CPU 제한 우려는 해소로 처리한다.

따로 판단한 것:

- 개별 Worker 설정: `birdmap-reports`는 usage_model `standard`, `user_limits` 없음. 사용자 지정 CPU 상한이 없어 요금제 기본값이 적용된다.
- 실제 운영 성능: 현재 v1의 CPU는 7일 p99 6.4ms, 30일 최대 40.6ms이고 CPU 초과는 0건이다. 지난 30일 요청 약 13.6만 건으로 월 포함량(1,000만 건)의 약 1.4%다. v2의 CPU는 배포 전에는 측정할 수 없어 **미확인**으로 남긴다(합성 추정: 승인 129행 기준 필터 JS 약 2ms 추가).

### 7.2 운영 D1 익명 집계 (추가)

읽기 전용 SELECT로 건수만 얻었다(`changed_db=false`). 보호종 일치는 SQL 부분 문자열 검사라 실제 판정(토큰 일치)보다 넓게 잡힌 **상한값**이다.

| 항목 | 값 |
|---|---:|
| 상태별 제보 | 승인 129, 반려 22, 대기 0 |
| 승인 중 비번식 확인 증빙 없음 | 19 |
| 승인 중 보호종 이름 포함(상한) | 19 |
| 그중 증빙 없음(상한) → v2에서 위치 숨김 | 9 |
| 승인 중 번식 표현 포함(상한) → v2에서 위치 숨김 | 1(보호종 아님) |
| 다른 지점에 연결된 승인 제보(spot_key) | 0 |

해석: v2를 배포하면 지금 v1에서 위치가 보이는 승인 마커 중 **최대 10건**이 숨겨진다(증빙 없는 보호종 최대 9 + 번식 표현 1). 증빙 있는 보호종 최대 10건은 원자료와 일치하면 계속 보이고, 검색에도 새로 나타난다. 연결 이력은 0건이라 연결 마커 경로의 실제 영향은 없다.

### 7.3 인덱스

| 항목 | 결과 |
|---|---|
| 운영 `reports_site_history` | 없음(재확인). Phase 2D 기록(`docs/long-term-db-phase2d/execution-evidence.md`)에도 운영에 없다고 적혀 있어 오래된 상태다. `migrations/0003`이 운영에 적용된 적이 없다 |
| 현재 영향 | 이력 조회는 승인 행 전체(현재 129행)를 `reports_status`로 읽고 정렬한다. 1회 131~516 rows_read |
| 적용 시 Worker 영향 | 쓰기 게이트의 `schemaReady` 지문은 정본 9개 테이블만 대상이고 `reports`는 포함하지 않는다. 공개 권한 검사는 트리거 수만 센다. 따라서 `reports` 인덱스 추가가 쓰기·공개 게이트를 닫지는 않는다(소스 확인) |
| 적용 시 다른 영향 | `canonical/ops.js`의 manifest `schema_fingerprint`(전체 객체 대상)는 바뀐다. 백필·동결 도구가 예전 지문과 비교하는 경우 재기준화가 필요하다 |
| 판단 | 배포 차단 조건은 아님. 적용은 운영 스키마 변경이므로 이번에 하지 않았고, 하려면 별도 승인과 `docs/long-term-db-phase1/sql/1002_legacy_history_index.draft.sql` 기준(같은 이름·다른 정의면 중단)의 절차가 필요하다 |

### 7.4 복구본

| 항목 | 결과 |
|---|---|
| 공개 Worker 버전 | 10개 모두 PR 이전 코드(v1). 최신 `a174e570`(100%). **v2 버전 없음** |
| 관리자 Worker | `a7723404`(100%, 2026-10-13)로 그대로. PR이 바꾼 `shared.js`·`persistence.js`는 관리자 번들에도 들어가지만, 관리자는 이번 배포 대상이 아니고 공개 위치를 내보내지 않는다 |
| Pages | legacy 빌드, main `/`. 최근 빌드 3건 성공(`e05f725` 등). 자동 기상·조석 커밋마다 다시 빌드된다 |
| v2 Pages 복구 기준 | 병합 전에는 없다. 병합 뒤에는 그 병합 커밋이 기준이고, 되돌리기는 main revert 커밋이다 |
| 공개 읽기 긴급 차단 | 전용 스위치 없음. 코드상 `REPORTS_DB` 바인딩이 없으면 공개 읽기가 `PUBLICATION_UNAVAILABLE`로 닫힌다. v2 코드에 바인딩만 뺀 버전을 차단판으로 쓸 수 있으나 제보 쓰기도 함께 멈춘다. 만들거나 시험하지 않았다 |

배포 사이 공백: Worker를 v2로 바꾼 뒤 main 병합 전까지는 Pages가 구 화면을 내보낸다(자동 커밋으로 재빌드돼도 같다). 구 화면은 v2 응답을 거부하므로 그동안 모든 사용자의 제보 위치 기능이 꺼진다. 안전한 방향이지만 공백을 짧게 잡아야 한다.

### 7.5 첫 배포 전에 정할 것

1. 긴급 차단판을 쓸지 정한다. 쓴다면 v2 배포 전에 `versions upload`(트래픽 0)로 올려 ID를 기록한다. 업로드 자체도 운영 Worker 변경이므로 승인이 필요하다.
2. v2 배포 뒤 v1(`a174e570` 이하)은 어떤 경우에도 `versions deploy`·`rollback`에 쓰지 않는다. Wrangler `rollback`의 기본 대상이 직전 버전(v1)이므로 인자 없는 `rollback`도 쓰지 않는다.
3. 인덱스 적용 여부는 배포와 분리해 결정한다.
