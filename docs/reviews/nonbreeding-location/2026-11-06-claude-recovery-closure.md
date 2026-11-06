# PR #76 v2 복구본·긴급 공개 읽기 차단 준비 (Claude Code)

- 작성: 2026-11-06, Claude Code (Opus 5.5)
- 코드 기준: `94115bdc2633a75e119b8b47d26211c3fe7ae727` (차단 스위치 추가)
- 앞선 보고서: [2026-11-06-claude-predeploy-final.md](2026-11-06-claude-predeploy-final.md)
- 실행하지 않은 것(3.2의 승인된 비활성 업로드 2건 제외): 운영 트래픽 변경, Draft 해제, main 병합, Pages 배포, D1·좌표·스키마 변경

사용자 지시에 따라 **트래픽 0% 업로드도 운영 계정 변경이므로 하지 않았다.** 그래서 Cloudflare 버전 ID는 아직 없다. 대신 업로드될 번들을 로컬 dry-run으로 만들어 해시로 고정했다.

## 1. 긴급 공개 읽기 차단 설계

`reports-api/wrangler.public.toml`에 `REPORTS_PUBLIC_READS_CLOSED = "false"`를 두고, 값이 정확히 `"true"`인 버전만 차단판이 된다.

| 요청 | 차단판 동작 |
|---|---|
| `/reports/public-state`(공개 권한 확인) | 503 `PUBLIC_READS_CLOSED` |
| 승인·대기 마커, 탐조지 이력, 검색, 최근 제보 탐조지, 기여자·제보자 통계 | 503 `PUBLIC_READS_CLOSED` |
| `POST /reports`(제보 접수) | 정상. 접수 응답에 마커 좌표(`spot`)를 넣지 않음 |
| `GET /reports/<id>/status`(접수 상태) | 정상. 좌표 없음 |
| `GET /reports/capabilities` | 정상(제보 양식이 사용) |
| `/_internal/reports-capability`(관리자 peer 확인) | 정상. 관리자 승인·반려 유지 |
| 관리자 Worker | 변경 없음 |

모든 차단 응답은 `Cache-Control: no-store`, `Retry-After: 60`이며 본문에 종·좌표·이름이 없다.

화면 동작(구·신 화면 공통): 공개 권한 확인이 실패하면 기존 `publicationInvalidate`가 승인·대기 마커, 검색, 고정점·연결 이력, 최근 제보, 탐조지 이력 캐시와 그려진 이력을 지운다. 5초마다 다시 확인해도 계속 실패하므로 차단 동안 다시 그려지지 않는다. 이미 열린 화면은 마지막 권한의 남은 시간(최대 5초) 동안만 기존 값을 유지한다.

차단 해제 뒤에는 새 공개 권한(preflight→payload→postflight 일치)을 받아야만 자료를 다시 그린다. 차단 전 캐시는 되살리지 않고, 서버는 v2 비번식 정책을 그대로 적용한다.

`SITE_HISTORY_UNAVAILABLE` 예외(이력 칸만 실패)는 `PUBLIC_READS_CLOSED`에 적용되지 않는다(검사로 확인).

## 2. 합성 검증 결과

| # | 검증 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 차단 시 공개 위치 API 차단 | PASS | `public-reads-closed.test.mjs`: 10개 공개 읽기 경로 × 일반/strict = 20회 모두 503 `PUBLIC_READS_CLOSED`, no-store, Retry-After 60, 본문에 좌표·종·이름 없음 |
| 2 | 구·신 화면의 마커·위치 캐시 제거 | PASS | `test_publication_rollout.mjs`: 실제 이전 `e05f725` 화면과 새 화면 모두 차단 응답에서 마커·검색·이력 캐시·그린 이력 삭제, 재확인 중에도 닫힘 유지 |
| 3 | 제보 접수·관리자 기능 유지 | PASS | 차단 중 접수 201(응답에 좌표 없음), 접수 상태 200(좌표 없음), capability 200, 관리자 승인 200(peer가 차단판을 보는 상태) |
| 4 | 해제 후 v2 권한으로만 복구 | PASS | 서버: 해제 뒤 차단 중 승인된 기록까지 v2 정책으로 공개, 증빙 없는 보호종은 계속 숨김(양성 대조 포함). `""`, `"1"`, `"TRUE"` 등은 차단하지 않음. 화면: 새 권한을 받은 뒤에만 자료 허용, 차단 전 캐시 미복원 |
| 5 | 버전·번들 식별값과 절차 | 기록(아래 3·4절) | 업로드 금지로 버전 ID는 미발급 |

CI(`94115bd`): regression 성공(12:27~12:45Z), gps-browser 성공(12:27~12:35Z) — [run 42217722184](https://github.com/wooil1964/birdmap/actions/runs/42217722184). 이 문서만 더한 다음 커밋의 CI는 PR Checks에서 따로 확인한다.

시험 수: 서버 `reports-api/test` 381/381(신규 3), 공개 권한 전환 22/22(신규 3). `.github/scripts` 전체 로컬은 610 통과·7 실패이며, 7건은 PR 이전부터 실패하는 같은 로컬 환경 의존 검사다.

한계: 모두 합성 검사다. 실제 Cloudflare에서 차단판으로 전환하는 리허설은 업로드가 금지되어 하지 않았다. `preview_urls=false`라 업로드한 버전을 트래픽 없이 호출해 볼 수도 없다.

## 3. 버전·번들 식별값

Wrangler 4.149.0 `versions upload --dry-run`, 소스 `94115bd`:

| 구분 | 명령 차이 | 번들 `public.js` SHA-256 | Cloudflare 버전 ID |
|---|---|---|---|
| 정상 v2 | 없음(`REPORTS_PUBLIC_READS_CLOSED="false"`) | `56a8f3fddd525b8c0520d5a16d8b89ecb8aa5764076cfac6b8cc1c548f70a88a` | 미발급 |
| 차단판 | `--var REPORTS_PUBLIC_READS_CLOSED:true` | 같음(변수는 번들 밖 메타데이터) | 미발급 |

- 크기 115.81 KiB(gzip 29.52 KiB). 업로드 대상은 `public.js` 하나다(`upload_source_maps` 미설정이라 map은 올라가지 않음).
- 작업 폴더(CRLF)와 `git archive 94115bd`(LF)에서 각각 두 번씩 같은 해시가 나와 재현 가능하다.
- 두 버전은 같은 번들이고 공개 읽기 변수 하나만 다르다. 업로드한 뒤에는 `versions view <id> --json`으로 그 변수 값과 바인딩을 확인한다.
- compatibility_date `2026-07-03`, `workers_dev=true`, `preview_urls=false`(운영 `a174e570`과 같음).

바인딩(두 버전 같음, 운영 `a174e570`과 같음):

| 바인딩 | 종류 | 대상 |
|---|---|---|
| `REPORTS_DB` | D1 | `birdmap-reports` (`b48201cc-0abd-4a64-bb61-9dd2a7813d21`) |
| `REPORTS_PEER` | 서비스 | `birdmap-reports-admin` |
| `REPORT_IP_SALT`, `REPORTS_GATE_TOKEN`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` | 시크릿 | 기존 버전에서 승계(값 미확인·미출력) |

환경변수:

| 이름 | 정상 v2 | 차단판 | 운영 `a174e570` |
|---|---|---|---|
| `REPORTS_PUBLIC_READS_CLOSED` | `false` | `true` | (없음) |
| `FIELD_NEWS_RETIRED` | `true` | `true` | `true` |
| `REPORTS_PUBLICATION_REQUIRED` | `true` | `true` | `true` |
| `ENVIRONMENT` | `production` | `production` | `production` |
| `REPORTS_WRITE_MODE` | `CANONICAL_DUAL_WRITE` | 같음 | 같음 |
| `REPORTS_DUAL_WRITE_ENABLED` | `true` | 같음 | 같음 |
| `REPORTS_CONFIRMATION_REQUIRED` | `true` | 같음 | 같음 |
| `REPORTS_SCHEMA_VERSION` | `phase2a-0001` | 같음 | 같음 |
| `REPORTS_ACTIVATION_ID` | `phase2e-cutover-1` | 같음 | 같음 |
| `REPORTS_RELEASE_ID` | `public-phase2e-1` | 같음 | 같음 |
| `REPORTS_PEER_RELEASE_ID` | `admin-phase2e-1` | 같음 | 같음 |
| `REPORTS_PENDING_PUBLIC` | `1` | 같음 | 같음 |
| `REPORTS_REMOTE_VERIFIED` | `true` | 같음 | 같음 |
| `NOTIFY_EMAIL_TO`, `NOTIFY_EMAIL_FROM` | toml 값 | 같음 | 같음 |
| `ADMIN_PAGE_URL` | toml 값(관리자 Worker `/admin`) | 같음 | 같음 |

`REPORTS_RELEASE_ID`·`REPORTS_PEER_RELEASE_ID`가 같으므로 관리자 Worker와의 peer 확인 조건은 바뀌지 않는다.

## 3.1 트래픽 0% 등록 절차 검토

- `wrangler versions upload`는 새 버전만 만들고 배포(deployment)를 만들지 않는다. 트래픽 비율은 `versions deploy` 또는 `deploy`를 실행할 때만 바뀐다. 이 저장소의 과거 배포도 이 두 단계로 했다(10/14·10/21 기록).
- `preview_urls=false`이므로 업로드한 버전에 별도 미리보기 주소가 생기지 않는다. 트래픽 0% 버전에 외부에서 닿는 경로가 없다.
- 시크릿은 새 버전으로 자동 승계되고, 업로드로 기존 버전의 vars·시크릿은 바뀌지 않는다.
- 주의: 업로드 뒤 대시보드나 `versions deploy` 대화형 선택에서 새 버전이 "최신"으로 먼저 보인다. 반드시 ID를 지정하고 `-y` 자동 선택에 기대지 않는다. `wrangler deploy`(업로드+즉시 배포)는 쓰지 않는다.
- 등록 전후 확인: `deployments status`가 `a174e570` 100%로 같아야 한다. `versions view a174e570… --json`의 vars가 위 표와 같아야 한다.

## 3.2 비활성 버전 등록 결과 (2026-11-06 13:13~13:14Z, 사용자 승인)

승인 범위는 `versions upload`뿐이다. `versions deploy`·`deploy`·`rollback`은 실행하지 않았다. 업로드 원본은 `git archive 86e3b7b89ee61976016f8959d89a5193d7e60e1c`(LF)이고, 업로드 직전 dry-run 해시가 3절과 같았다.

| 구분 | 버전 ID | 태그 | Cloudflare etag | 모듈 SHA-256(내려받아 확인) |
|---|---|---|---|---|
| 정상 v2 (`V2_ID`) | `b81169aa-9af6-4c21-9bc4-b994ddf305af` | `nbl-v2-86e3b7b` | `c14a870ab82b814990d1e14722b3c976fea5fb21c8fe672ceed5e43c256355a0` | `56a8f3fddd525b8c0520d5a16d8b89ecb8aa5764076cfac6b8cc1c548f70a88a` |
| 차단판 (`CLOSED_ID`) | `04448faf-2885-4205-92b6-025c99042ea0` | `nbl-closed-86e3b7b` | 같음 | 같음 |
| 운영(참고) | `a174e570-7fb4-48cd-954a-086fa469f703` | `search-4a76b41` | `ff9952d6…764f` | (v1, 비교 대상 아님) |

비교 검증(`versions view --json`, 시크릿은 이름만, 이메일 값은 해시로만 비교):

| 항목 | 결과 |
|---|---|
| 모듈 | 두 버전 모두 Cloudflare에서 내려받은 `public.js`가 로컬 dry-run 번들과 바이트 단위로 같음. 차단 스위치와 `nonbreeding-location-v2` 포함 |
| 환경변수 | 두 버전 차이는 `REPORTS_PUBLIC_READS_CLOSED`(`false`/`true`)뿐. 운영 `a174e570`과의 차이도 이 변수 추가뿐(이메일 2개 포함 나머지 15개 값 일치) |
| D1 | 세 버전 모두 `REPORTS_DB` = `b48201cc-0abd-4a64-bb61-9dd2a7813d21` |
| 서비스 | 세 버전 모두 `REPORTS_PEER` = `birdmap-reports-admin` |
| 시크릿 이름 | 세 버전 모두 `REPORTS_GATE_TOKEN`, `REPORT_IP_SALT`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` |
| 런타임 | compatibility_date `2026-07-03`, 플래그·사용자 CPU 상한 없음, usage_model `standard`, handler `fetch` — 세 버전 같음 |

트래픽·노출 확인:

| 시점 | 결과 |
|---|---|
| 업로드 전 | `a174e570` 100% (배포 2026-10-21T01:23:06Z) |
| 정상 v2 업로드 직후 | `a174e570` 100% |
| 차단판 업로드 직후 | `a174e570` 100%. 최신 배포도 10/21 그대로(새 배포 없음) |
| Preview URL | `workers.dev` 사용 `enabled: true`, `previews_enabled: false` — 두 버전에 외부에서 닿는 미리보기 주소 없음 |
| 실서비스 응답 | 허용 Origin으로 `/reports/public-state` 1회: 200, projection `legacy-public-v1`(운영 v1 그대로) |

`versions list`는 최근 10개만 보여 준다. 새 두 버전이 목록 끝에 있다.

## 4. 승인 후 절차 (실행하지 않음)

아래의 `V2_ID`는 `b81169aa-9af6-4c21-9bc4-b994ddf305af`, `CLOSED_ID`는 `04448faf-2885-4205-92b6-025c99042ea0`이다. 4.1은 3.2에서 완료했다.

공통: `cd reports-api`, `CLOUDFLARE_ACCOUNT_ID`는 `docs/long-term-db-phase2e/targets/production.json`에서 넣는다. Wrangler 4.149.0만 쓴다.

### 4.1 사전 준비 (업로드 승인 필요, 트래픽 0%)

1. 최종 SHA로 다시 dry-run해 번들 해시가 3절과 같은지 확인한다(코드가 바뀌었으면 새 해시를 기록한다).
2. 정상 v2: `versions upload -c wrangler.public.toml --tag nbl-v2-<sha7> --message "PR76 v2 <sha>"` → `V2_ID` 기록.
3. 차단판: `versions upload -c wrangler.public.toml --var REPORTS_PUBLIC_READS_CLOSED:true --tag nbl-closed-<sha7> --message "PR76 closed <sha>"` → `CLOSED_ID` 기록.
4. `versions view`로 두 버전의 바인딩·vars를 확인한다. `deployments status`가 여전히 `a174e570` 100%인지 확인한다(트래픽 변경 없음).

### 4.2 전환 (배포 승인 필요)

1. `versions deploy <V2_ID>@100% -y`. `/reports/public-state`가 `nonbreeding-location-v2`, no-store인지 확인한다.
2. main 병합 → Pages 빌드 확인. 병합 전까지 구 화면은 위치 기능이 꺼진 상태다.

### 4.3 긴급 차단

1. `versions deploy <CLOSED_ID>@100% -y`.
2. 허용 Origin으로 `/reports/public-state`를 1회 호출해 503 `PUBLIC_READS_CLOSED`, no-store를 확인한다. 열린 화면은 최대 5초 안에 위치 자료를 지운다.
3. 제보 접수는 계속된다. 관리자 승인도 가능하지만 차단 중에는 공개되지 않는다.

### 4.4 복구

1. 원인을 고친 버전이 있으면 그 v2 버전, 없으면 `V2_ID`를 `versions deploy <id>@100% -y`로 배포한다.
2. `/reports/public-state`가 200 `nonbreeding-location-v2`인지 확인한다. 화면은 새 권한을 받은 뒤에만 다시 그린다.

### 4.5 금지

- `a174e570` 이하 v1 버전으로 `versions deploy`하지 않는다.
- 인자 없는 `wrangler rollback`을 쓰지 않는다(직전 버전이 v1일 수 있음).
- `READ_ONLY_MAINTENANCE`를 공개 읽기 차단으로 쓰지 않는다(쓰기만 막음).
- D1 복원, epoch/revision 수동 변경, 캐시 삭제는 이 절차에 필요 없다.
