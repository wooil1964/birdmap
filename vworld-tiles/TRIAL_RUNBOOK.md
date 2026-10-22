# VWorld 전용 Worker 제한 시험 — 구현 검토안·원격 미승인

기준일: 2026-10-22 KST. PR #40의 검토 브랜치에서 자동화와 비활성 복구를 구현·합성 검증한다. **이 문서·코드·CI의 승인은 실제 생성·secret 공급·활성화·실키 호출의 승인이 아니다.** 최종 검토·전체 CI 통과 후의 전체 40자리 SHA를 실행 입력과 보호 환경에 다시 확정한다. 소스에 자기 자신의 최종 commit SHA를 넣지 않는다. 파일을 더 수정하면 새 SHA와 CI를 다시 검토한다. 운영 지도는 OSM이며 main/Pages/기존 Worker/D1 변경은 범위 밖이다.

공개 PR·로그·채팅·아티팩트에는 실제 계정 구조, 원본 설정, 키, 토큰, 호스트 식별정보, 토큰 fingerprint를 싣지 않는다. 키 없는 로컬·합성 성공을 원격 성공으로 표현하지 않는다.

## 1. 실행 전 차단 조건과 현재 상태

| 조건 | 실행 전 필요한 근거 |
|---|---|
| 최종 소스·CI | `expected_sha`, `github.sha`, `github.workflow_sha`, checkout HEAD, 현재 Draft PR #40 head가 모두 같고 최신 해당 SHA의 전체 회귀 CI가 성공해야 한다. 재실행 `run_attempt != 1`은 차단한다. |
| 전체 namespace | 사용자는 앞선 전체 감사를 완료했다고 보고했다. 이 보고를 재사용하여 원격 실행 gate를 생략하지 않는다. bootstrap 직전 및 활성화 직전에 전체 current/active/retained version·legacy 환경·Preview를 다시 GET 전수 검사한다. 누락·403·401·pagination 불명·지원되지 않는 이력 범위는 차단한다. |
| 새 대상 | 최초 생성은 `birdmap-vworld-tiles` 미존재를 API로 확인한 경우만 허용한다. run은 승인된 별도 bootstrap SHA/run ID·secret 없음·false·격리를 확인한 기존 대상만 사용한다. 동명 기존 대상을 추정하여 덮어쓰지 않는다. |
| 보호 환경 | `vworld-trial-bootstrap`, `vworld-trial-execution`, `vworld-trial-recovery`를 별도로 준비하고 독립 reviewer·자기 승인 금지·관리자 우회 금지·정확한 검토 branch 1개 제한을 읽어 검증해야 한다. 현재 이 세 환경은 없으므로 실행은 차단된다. 이번 작업에서는 환경을 만들지 않는다. |
| 최소 권한 | 생성 후 해당 Worker Editor로 전환하려면 실제 bootstrap 후 별도 운영자가 권한을 준비·검토해야 한다. 실제 자격증명 생성·권한 변경은 이번 승인에 포함하지 않는다. |
| 별도 승인 | 아래 bootstrap과 실키 시험은 서로 다른 승인 단계다. 승인 phrase 문자열 자체는 인간의 실행 승인을 대체하지 않는다. |

namespace 감사는 읽기 전용이며 결과 원문·계정별 목록을 출력하지 않는다. 같은 계정의 namespace/key는 카운터를 공유한다. `196440`·`196441`이 다른 대상에서 쓰이거나 범위가 미확인이면 활성화하지 않는다. 생성 후 감사에서는 정확히 소유를 검증한 새 대상만 예외로 허용한다. KV namespace 생성은 필요하지 않다. [Rate-limit 범위](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [버전 상세](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/)

trial 설정에는 D1/KV/R2/service/DO/마이그레이션/routes/cron/관리자 secret이 없다. D1 권한이 없어도 Workers 배포 권한으로 기존 D1 binding을 추가할 수 있으므로 **binding 부재를 소스와 원격에서 별도로 검증**한다. 예상 밖 binding은 수정하여 맞추지 않고 중단한다.


## 2. 시간창과 로컬 검증 범위

`src/trial-worker.mjs`는 활성 상태에서 `TRIAL_STARTS_AT`·`TRIAL_EXPIRES_AT`와 `X-Birdmap-Trial-Token`을 검사한다. 두 시간은 밀리초를 포함한 정확한 UTC 형식 `YYYY-MM-DDTHH:mm:ss.sssZ`여야 하며 존재하지 않는 날짜·누락·다른 표기·역전·동일 시각·10분을 넘는 창은 거절한다. 시작 시각은 포함하고 종료 시각은 제외한다: **`start <= now < end`**. 유효하지 않은 시각과 토큰은 upstream 호출 없이 거절한다.

trial의 시간창은 최초 진입 때와 **두 비동기 limiter 등 모든 사전검사가 끝난 뒤 upstream fetch 바로 직전**에 각각 새 시각으로 검사한다. limiter 대기 중 종료 경계에 도달한 요청도 새 fetch를 시작하지 않는다. 검사 사이에 비동기 대기를 추가하는 후속 변경은 같은 경계 검증을 다시 받아야 한다.

기존 Origin/Referer 검사는 보조 통제이며 페이지 경로나 호출자 신원을 인증하지 않는다. 시험 토큰은 일반 지도 클라이언트에 제공하지 않는다.

최종 검토 SHA에서 다음 로컬 검사를 실행한다. 고정된 과거 검사 개수 대신 실제 명령 결과와 해당 SHA를 기록한다.

```text
node --test --test-reporter=tap .github/scripts/test_vworld_trial.mjs .github/scripts/test_vworld_worker.mjs
node --test --test-reporter=tap .github/scripts/test_*.mjs
```

적대적 검사는 응답 상태뿐 아니라 **실제 합성 fetch 호출 수와 호출 시각**을 확인해야 한다. 시작 직전·정확한 시작·종료 직전·정확한 종료, 각 limiter 대기 중 만료, 잘못된 토큰·시간·시계 값, limiter 거절·예외, 유효시간 안의 정확한 1회 fetch, 타임아웃·오류 후 재시도 0회를 포함한다. 별도로 현재 CI의 합성 브라우저·로컬 workerd·전체 회귀를 통과해야 한다. 로컬 시험에서 실제 VWorld 요청이나 원격 쓰기를 수행하지 않는다.

upstream fetch와 본문 읽기에는 기존 **8초 타임아웃**이 적용되고 자동 재시도는 없다. 타이머는 limiter 대기 뒤에 시작하므로 전체 요청을 진입부터 8초로 제한하는 기능은 아니다. 유효시간 안에 이미 시작한 fetch는 창이 끝난 뒤에도 응답을 마치거나 타임아웃으로 중단될 수 있다. 이 동작을 Cloudflare 실행 환경의 엄격한 벽시계 종료 보장이나 만료 즉시 모든 요청·비용이 사라지는 보장으로 표현하지 않는다.

## 3. 구현된 실행 경로와 GitHub 승인

- `.github/workflows/publication-security-ci.yml`: 이미 default branch에 등록된 workflow의 **검토 브랜치 버전**에만 `vworld_trial_mode=none|bootstrap|run|recover`, `expected_sha`, `approval_phrase` launcher를 추가한다. local reusable workflow는 caller와 같은 commit에서 해석된다. trial 선택 시 일반 회귀·직접 VWorld 진단·그 artifact job을 실행하지 않는다. 직접 진단과 trial을 동시에 선택하면 service secret을 읽기 전에 거절한다.
- `.github/workflows/vworld-worker-trial.yml`: 별도 수동·재사용 workflow. service secret 없는 preflight가 환경의 존재·보호 규칙·Draft PR·최신 exact-SHA CI·현재 run을 읽는다. 통과한 뒤에만 보호 환경을 참조하는 job으로 진행한다. 따라서 없는 환경을 job 참조로 자동 생성하는 경로를 막는다.
- `.github/scripts/vworld_workflow_gate.mjs`: public GitHub API의 GET만 사용하며 인증 token을 요구하지 않는다. 보호 환경 job의 첫 검증 단계에서 보호 규칙과 승인 이력을 다시 읽는다. API 거절·필드 부재·pagination 불명은 우회하지 않는다. bootstrap/run CLI도 같은 승인 gate를 다시 호출한다.
- `vworld-tiles/trial/cli.mjs`: 명시적 `check`, `bootstrap`, `run`, `recover` 명령. `bootstrap-recover`는 이번 run이 원격 쓰기 직전에 만든 외부 marker가 일치하는 경우에만 동작하는 내부 cleanup 명령이다. import와 `check`에는 원격 호출이 없다.

새 standalone workflow는 main 미등록 상태라 단독 `workflow_dispatch`를 사용할 수 없다. 이를 활성화하려고 main에 파일을 넣거나 병합하지 않는다. 이미 등록된 `publication-security-ci.yml`에 검토 브랜치를 지정하는 launcher를 준비했으며 **실제 dispatch는 하지 않는다**. 공식 문서는 등록 workflow에서 다른 branch를 선택할 수 있다고 설명한다. 실제 dispatch/API 입력 수용의 원격 실행 확인은 별도 승인 이후의 단계다. [GitHub 수동 실행·branch 선택](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [같은 commit의 local reusable workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses)

권한은 `contents:read`이며 service secret을 PR 회귀 job에 전달하지 않는다. caller는 실키 `run` 모드에만 기존 `VWORLD_API_KEY` 하나를 명시적으로 전달하며 `secrets:inherit`는 쓰지 않는다. Cloudflare 식별정보·인증정보는 각 보호 환경의 secret으로만 공급한다. `actions/checkout` v6.1.0과 `actions/setup-node` v6.5.0은 확인한 전체 immutable SHA로 고정하며 checkout 인증 저장·npm cache를 끈다. Node는 `24.18.0`, Wrangler는 `4.151.3`, transitive dependency는 integrity가 있는 lockfile로 고정하고 lifecycle script 없이 설치한다. 설치 단계에는 service credential이 없다.

재사용 workflow는 환경 secret도 caller가 이름을 전달해야 한다는 공식 규칙에 맞춰 CF 이름을 유한 목록으로 선언한다. caller는 이 CF 이름들에 **빈 문자열만** 전달하며 repository CF secret을 읽지 않는다. 보호 job의 환경 값으로 공급하는 설계다. 공식 문서의 환경 secret 우선순위·이름 전달 규칙으로부터 이 경로를 구성했으나, 빈 값 전달 후 환경 값의 실제 공급은 dispatch 금지 때문에 아직 원격 검증하지 않았다. 빈 값이 유지되면 fingerprint/credential gate에서 원격 변경 전에 차단된다. 이를 실행 성공으로 보고하지 않는다. [재사용 workflow의 환경 secret 규칙](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#using-inputs-and-secrets-in-a-reusable-workflow)

모든 원격 단계는 고정 concurrency `birdmap-vworld-tiles-trial`, `cancel-in-progress:false`를 공유한다. 등록 launcher에는 다른 고정 group을 써 재사용 호출의 자기 대기를 막는다. GitHub는 동시에 pending run 하나만 유지할 수 있으므로 이것만으로 1회성을 주장하지 않는다. 보호 환경의 `APPROVED_RUN_ID`, `run_attempt=1`, 원격 bootstrap 소비 metadata·기존 secret 검사도 함께 확인한다. 대기 중 중복·취소 후 새 실행은 원격 상태를 검토하고 새 승인을 받아야 한다. [Concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)

보호 환경은 직접 지정한 User reviewer만 지원한다. Team membership을 추정하지 않는다. `required_reviewers.prevent_self_review=true`, `can_admins_bypass=false`, custom branch policy의 정확한 branch 이름과 `type=branch`를 모두 읽어 확인한다. `can_admins_bypass` 또는 branch 유형이 API 표현에 없으면 차단한다. 승인자는 run을 시작한 사람·triggering actor와 달라야 하며 환경 승인 comment에 다음 비밀 없는 문자열을 정확히 남겨야 한다.

```text
APPROVE_VWORLD_BOOTSTRAP <최종40자리SHA> <이번runID>
APPROVE_VWORLD_RUN <최종40자리SHA> <이번runID>
APPROVE_VWORLD_RECOVER <최종40자리SHA> <이번runID>
```

보호 환경의 변수 `APPROVED_SHA`, `APPROVED_RUN_ID`, `CF_SCOPE_REVIEWED_SHA`는 해당 run/소스에 고정한다. run에는 `APPROVED_BOOTSTRAP_RUN_ID`도 필요하다. run ID는 dispatch 후 생성되므로 환경 승인 대기 중 운영자가 독립 검토를 마친 뒤 해당 값을 확정한다. 환경을 만들거나 값을 설정하는 작업은 현재 수행하지 않는다. [보호 환경과 우회 금지](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [환경 readback](https://docs.github.com/en/rest/deployments/environments), [승인 이력](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run)

## 4. 최소 권한과 별도 비활성 bootstrap

Cloudflare 공식 모델에서 **아직 없는 Worker에는 per-Worker 권한을 부여할 수 없다**. 최초 생성에는 Workers product Admin이 필요하고, 생성된 대상의 deploy·secret 관리는 Individual Worker Editor로 제한할 수 있다. 따라서 넓은 생성 자격증명을 계속 사용하는 단일 run 대신 다음 단계를 분리했다. granular Wrangler 인증은 account-owned API token을 사용하며 OAuth login으로 대체하지 않는다. [Workers 권한과 생성 제약](https://developers.cloudflare.com/workers/authorization/workers/), [granular Wrangler 인증](https://developers.cloudflare.com/workers/authorization/)

| 단계 | 공급 자격증명 | 동작 |
|---|---|---|
| `bootstrap` | 별도로 승인·검토한 `CF_CREATE_TOKEN`, 전체 Workers Content Read-Only `CF_READ_TOKEN` | 미존재와 전체 namespace를 확인한 뒤 secret required 목록만 빈 것으로 파생한 config로 새 대상 false 생성. 빈 시간창·secret 없음·격리·503 확인. 키 공급·활성화 없음. |
| 운영자 전환 | bootstrap 후 대상 하나의 Editor를 별도로 준비·검토 | 자동화는 token을 생성·변경·폐기하지 않는다. 생성 token을 시험 단계에 전달하지 않는다. |
| `run` | 대상 하나의 `CF_EDIT_TOKEN`, 전수 감사용 `CF_READ_TOKEN`, 기존 `VWORLD_API_KEY` | 승인된 bootstrap provenance 확인 후 한 번의 제한 시험과 false 복구. Worker 생성 권한 없음. |
| `recover` | 대상 하나의 `CF_EDIT_TOKEN`만 | 같은 소스의 기존 대상 false 재배포와 503 확인. 키·전체 namespace 감사·GitHub API·생성 token에 의존하지 않는다. |

권한에 Pages/D1/KV/R2/Zone Routes 쓰기·token 관리 쓰기는 필요하지 않다. 생성 token은 product 수준이므로 다른 Worker에 대한 잠재 영향이 있고, 소스의 고정 대상·계정 검사로 보완한다. 보유한 광범위 관리자 token으로 조용히 대체하지 않는다.

token verify 성공은 유효성·만료 확인이며 권한 범위의 증명이 아니다. verify 응답에는 policy가 없다. policy 상세 조회에는 별도 `Account API Tokens Read`가 필요하므로 배포 credential에 이를 추가하지 않는다. 독립 운영자가 실제 policy·정확한 계정/대상·추가 허용 권한 부재를 비공개로 검토하고, 보호 변수 `CF_CREATE_SCOPE=workers-product-admin`, `CF_EDIT_SCOPE=individual-worker-editor`, `CF_EDIT_WORKER=birdmap-vworld-tiles`, `CF_READ_SCOPE=workers-product-content-read-only`로 해당 SHA의 검토를 증언한다. 전체 감사 token이 개별 Worker 목록만 보도록 필터링되어서는 안 된다. 이는 **사람의 policy 검토 증언이며 프로그램의 권한 증명은 아니다**. 실제 승인 전에 이 검토가 미완료면 진행하지 않는다. [Verify 응답](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/), [Policy 상세 조회 권한](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/get/)

검토한 실제 credential과 공급값이 같도록 SHA-256 fingerprint를 메모리에서 비교한다. `CF_CREATE_TOKEN_SHA256`, `CF_EDIT_TOKEN_SHA256`, `CF_READ_TOKEN_SHA256`도 보호 **secret**으로 관리하고 값을 출력하지 않는다. 계정 ID 2개 `CF_ACCOUNT_ID`·`CF_EXPECTED_ACCOUNT_ID` 및 `TRIAL_HOST`도 보호 secret이다. host는 정확히 `https://birdmap-vworld-tiles.<검토한-subdomain>.workers.dev` 형태여야 한다. 로그에 보이는 step env에 계정 구조가 남지 않도록 일반 변수로 전달하지 않는다. 해당 secret을 지금 만들거나 업로드하지 않는다.

## 5. 별도 승인 후 제한 시험 순서

아래는 아직 실행하지 않은 구현 순서다. 각각의 원격 변경 직전에 소스·대상·원격 binding을 확인한다. bootstrap/run 모두 source clean 검사에 실패하면 중단한다.

1. `bootstrap`: 승인 phrase `APPROVE_DISABLED_VWORLD_BOOTSTRAP`. 전체 namespace·대상 미존재를 다시 확인하고 mutation marker를 쓰기 전에 남긴다. secret 없는 false bootstrap을 생성한다. 정확한 SHA·bootstrap run ID를 tag/message에 남기고 실제 `/tiles/8/218/100.png`의 503을 확인한다. 성공하면 여기서 종료한다.
2. bootstrap 이후 별도 운영자가 per-Worker Editor와 독립 복구 환경을 준비한다. 대상·정책·fingerprint를 비공개로 검토한 뒤 실키 시험의 별도 승인을 요청한다. 최초 bootstrap 승인이 이 권한 변경이나 실키 시험을 승인한 것은 아니다.
3. `run`: 승인 phrase `APPROVE_ONE_VWORLD_TRIAL`. 별도로 승인한 bootstrap run ID·동일 SHA·false·빈 시간창·secret 없음과 모든 retained version의 미소비 상태를 확인한다. 다른 프로세스가 이미 소비·활성화·종료한 흔적이 있으면 재사용하지 않는다. 먼저 false 소비 버전을 배포한 뒤에만 secret을 공급한다.
4. `VWORLD_API_KEY`와 암호학적 난수 **32바이트**로 만든 일회성 `TRIAL_ACCESS_TOKEN`을 각각 Wrangler stdin으로 공급한다. `secret put` 자체가 즉시 배포하므로 매번 false·빈 시간창·binding 격리와 실제 타일 503을 확인한다. 토큰은 메모리에만 보관하고 `GITHUB_ENV`, `GITHUB_OUTPUT`, 파일·cache·artifact에 넘기지 않는다.
5. required secret 두 개를 갖춘 정규 trial config를 false로 배포·확인한다. 활성화 직전에 namespace를 다시 전수 감사한다. 그 후 밀리초 포함 UTC의 최대 **10분** 시간창과 `TILES_ENABLED=true`를 한 번 배포한다. 토큰 없는 valid tile 403 검사를 하고, 아래 네 타일만 허가된 단일 클라이언트가 순차 요청한다. 첫 실패 시 나머지를 생략하고 자동 재시도는 0회다.

```text
Base PNG: (8,218,100), (8,219,100), (8,220,100), (8,221,100)
```

6. 성공·실패와 관계없이 동일 검토 SHA를 false·빈 시간창으로 다시 배포하고 원격 binding/metadata·실제 valid tile 503을 확인한다. 키/secret 삭제·Worker 삭제·운영 Pages 변경은 자동으로 하지 않는다. 시험 토큰은 재사용하지 않는다.

네 요청은 **허가한 단일 클라이언트의 실행 예산이며 서버 전역 hard cap이 아니다**. IP당 20/60초·위치별 합계 40/60초는 Cloudflare 위치별 근사 제한이다. 토큰·시간창은 외부 사용을 줄여도 거절 invocation 비용을 없애지 않는다.

클라이언트는 12초 제한, redirect 금지, 요청별 재시도 0회다. HTTP 200·`image/png`·2MiB 이하·PNG CRC/구조/256×256·no-store·비밀 응답 헤더 부재를 메모리에서 검사한다. 원본 PNG·원문 오류·HAR·upstream URL·응답 body를 저장하지 않는다. 성공은 CF→VWorld 서버 경로 관측이며 실제 브라우저·모바일·지도 내용 육안 확인은 아니다. Origin/Referer는 보조 통제이며 시험 토큰을 일반 Pages에 공급하지 않는다.

소스/로컬 Worker는 세 cache-control 헤더를 모두 검사하지만 외부 probe는 `Cache-Control:no-store`를 필수로 검사한다. Cloudflare가 자체 CDN 헤더를 downstream에서 제거할 수 있으므로 두 CDN 헤더는 관측된 경우에만 no-store를 요구한다. `CF-Cache-Status`가 있으면 DYNAMIC/BYPASS만 허용하고 캐시된 응답은 거절한다. [Cloudflare의 CDN 헤더 처리](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/)

모든 원격 프로세스는 `WRANGLER_WRITE_LOGS=false`, `WRANGLER_LOG_SANITIZE=true`, `WRANGLER_SEND_METRICS=false`를 고정한다. full log/debug/env dump/`wrangler tail`/HAR·shell tracing을 금지한다. child 프로세스에는 필요한 credential만 전달하고 stdout/stderr/예외 원문을 버린다. 출력은 유한한 상태 결과만 허용한다. 환경 secret 마스킹만으로 보안을 보장한다고 표현하지 않는다. [Secret의 즉시 배포 성질](https://developers.cloudflare.com/workers/configuration/secrets/)

## 6. 자동 복구와 runner 외부 수동 복구

orchestrator는 `finally`와 SIGINT/SIGTERM 취소 처리로 false 복구를 시도하고 workflow는 `always()`로 별도 복구를 시도한다. marker는 원격 쓰기 **직전** runner 임시 경로에 mode 0600으로 만들고 SHA/run ID/단계/완료 여부만 보관한다. secret은 없다. bootstrap 복구는 일치하는 미완료 marker가 없으면 새 대상을 만들지 않는다. 일반 복구도 없는 대상·다른 소스/소유·예상 밖 binding을 덮어쓰지 않는다. `rollback --yes`나 추정한 직전 버전을 쓰지 않는다.

CI 강제 취소·runner 소실·자격증명/제어 API 장애에서는 자동 cleanup을 보장하지 않는다. 운영자는 **시험 전에** 별도 컴퓨터의 최종 SHA checkout·고정 도구·검토한 대상/계정/host·대상 하나의 Editor·비공개 fingerprint/정책 증언을 확보한다. workflow concurrency가 막히거나 GitHub API가 중단되어도 독립 recovery를 사용할 수 있어야 한다.

```text
node vworld-tiles/trial/cli.mjs recover
```

이 명령은 복구 전용이며 활성화하지 않는다. 보호된 비공개 credential 공급 수단이 실행 프로세스 환경에만 `APPROVED_SHA`, 기존 승인 run ID, `APPROVAL_PHRASE=DISABLE_VWORLD_TRIAL`, 검토된 계정/host, `CF_SCOPE_REVIEWED_SHA`, 해당 Editor의 정책 증언·fingerprint·credential을 공급한다. 값은 명령행·.env·설정 파일·shell history에 넣지 않는다. `CF_READ_TOKEN`은 공급하지 않아 계정 전체 조회 의존을 없앤다. VWorld 키와 trial token은 필요 없다. bootstrap/run의 GitHub 승인 gate를 로컬 실행으로 우회하는 경로는 제공하지 않는다.

수동 recovery는 source clean·동일 SHA·대상 소유/tag·binding 검사를 거쳐 false 배포 및 valid tile 503을 확인해야 완료다. 복구 실패나 503 미확인은 미완료 사고 상태로 다룬다. 시간창은 신규 fetch 차단 수단이며 복구 성공의 증거가 아니다. 이미 시작한 fetch의 한계는 2절과 같다. 삭제·호스트 차단·권한 변경은 별도 승인 대상이다.

## 7. 별도 실제 실행 승인을 받을 정확한 범위와 중단 조건

현재는 코드·합성·CI 검토만 수행한다. 생성, Cloudflare 배포, remote secret put/versions secret put, 활성화, 실키 호출, 시험 dispatch, 환경/credential 생성, 병합, 운영 Pages/기존 Worker/D1 변경을 실행하지 않는다.

실제 승인 요청은 먼저 **확정 SHA의 secret 없는 false bootstrap 1회**만 대상으로 한다. 이후 per-Worker Editor 공급·policy 검토와 독립 복구 준비를 별도로 마친 뒤 **그 bootstrap을 소비하는 단일 trial run 1회**에 대해 다시 승인받는다. trial 범위는 기존 키+32-byte 임시 token 공급, 최대 10분 활성화, 단일 클라이언트 최대 네 타일 순차·무재시도, 성공/실패 모두 동일 SHA false 재배포와 503 확인이다.

인증·범위·승인·SHA·CI·대상·namespace·binding이 미확인이거나 달라지면 변경/활성화 전에 중단한다. 원격 변경 이후 배포/secret/검사 오류, 503/403/429/502/timeout/3xx/XML/HTML/PNG 검증 실패, UTC 창 종료·시계 오류, runner 취소 시 남은 타일을 취소하고 false 복구한다. 자동 복구 실패·runner 소실은 독립 수동 recovery로 전환하며 503 확인 전에는 완료로 보고하지 않는다. 일부 secret 공급이나 실패한 run은 같은 bootstrap을 다시 쓰지 않고 별도 상태 검토·승인을 받는다.

직접 WMTS와 비캐시 중계를 허용받았다는 기존 상담 맥락은 서버 인증/송신 경로의 검증을 대체하지 않는다. 공식 Base PNG 조건과 키 등록 조건을 별도로 확인한다. 고정 국내 egress를 가정하지 않는다. [공식 WMTS](https://www.vworld.kr/dev/v4dv_wmtsguide_s001.do), [전용 Egress](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/)
