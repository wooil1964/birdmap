# VWorld 전용 Worker 제한 시험 실행안 — 원격 시험 미승인·미실행

기준일: 2026-10-22 KST. 이 문서는 PR #40 검토 브랜치의 제한 시험 준비안이다. 코드·합성 검사·문서 수정의 승인과 실제 원격 시험의 승인은 별개다. 실제 실행은 아래 진입조건을 모두 통과하고 별도 승인을 받은 **최종 검토 SHA**를 고정한 뒤에만 수행한다. 운영 지도는 OSM이며 main/Pages/기존 서비스/D1 변경은 이 실행안에 포함하지 않는다.

이 공개 문서에는 실제 계정 운영정보·식별정보·인증 상태·감사 원문을 기록하지 않는다. 비밀값, 원본 설정, 전체 환경 변수, 민감한 URL은 채팅·PR·로그·아티팩트에 출력하거나 저장하지 않는다. 로컬 검증의 성공을 원격 배포·연결 시험·namespace 감사의 성공으로 확대하지 않는다.

## 1. 실행 전 차단 조건

| 진입조건 | 필요한 근거 |
|---|---|
| 최종 코드·CI | 최종 검토 SHA에서 아래 합성 검사와 전체 회귀 CI가 통과해야 한다. 결과는 SHA와 함께 별도 검토 기록에 남긴다. |
| 계정 전체 namespace 감사 | 전체 Worker의 current/active/retained version, 환경 및 Preview까지 빠짐없이 읽어 rate-limit namespace 충돌 여부를 확정해야 한다. **미확인은 통과가 아니다.** |
| 새 대상의 격리 | `birdmap-vworld-tiles`가 첫 변경 직전에도 미사용인지 확인한다. 동명 대상이 있으면 소유·용도를 추정하거나 덮어쓰지 않는다. 검토한 설정과 원격 binding에서 storage/service 연결 부재를 확인한다. |
| 실행 경로 | 검토한 수동 trial job, 대상만으로 제한한 권한 공급·전환·폐기 경로, 비활성 복구 수단을 먼저 확정해야 한다. 현재 전용 배포 job은 없다. |
| 실제 연결 | VWorld 키 상태와 서버 호출 허용 조건은 실제 시험에서 별도 확인한다. 합성 upstream 검사는 실키·실제 Cloudflare 송신 경로의 증거가 아니다. |
| 실행 승인 | 생성·secret 공급·일시 활성화·제한 호출·비활성 복귀를 포함한 구체적 실행안에 별도 승인이 필요하다. 이 문서 수정만으로 실행을 승인한 것으로 해석하지 않는다. |

namespace 감사는 **읽기 전용**으로 수행한다. 목록 조회를 끝까지 마치고 각 버전·환경·Preview의 필요한 `binding type/name/namespace`만 메모리에서 검사한다. 인증 실패·권한 부족·누락된 버전·조회 실패를 충돌 없음으로 바꾸지 않는다. 공개 결과에는 충돌 여부와 누락 여부만 남기고 실제 계정 구조나 원문 설정은 싣지 않는다. 대시보드 목록이나 호스트의 DNS/HTTP 실패만으로 namespace 비충돌·대상 미사용을 판정하지 않는다. 같은 계정의 같은 namespace/key는 카운터를 공유하므로 충돌이 있으면 두 설정의 미사용 ID 선정을 별도 검토한다. KV namespace 생성은 필요하지 않다. [Rate-limit namespace와 범위](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [버전 상세 조회](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/)

감사를 위한 인증 갱신이나 읽기 권한이 필요하면 별도 보안 절차로 해결한다. 자격증명을 임의로 생성하거나 권한을 변경하지 않는다. 실제 인증 절차·계정별 감사 결과는 이 공개 문서와 분리한다.

trial config에는 D1/KV/R2/서비스/DO/마이그레이션/routes/cron/관리자 secret이 없다. 일반 설정과 시험 설정은 같은 새 Worker의 대안 설정이다. D1 권한을 주지 않았다는 이유만으로 배포 권한에 따른 모든 영향을 배제하지 않으며 검토한 대상과 binding 부재를 함께 확인한다.

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

## 3. 최소 권한·키 공급 경로

향후 생성 단계와 생성 후 단계는 가능한 한 새 대상 하나로 제한한 권한을 사용한다. 생성 권한이 더 넓다면 공급·전환·폐기 순서와 영향 범위를 실행 전에 검토한다. 넓은 기존 관리자 자격증명 하나로 모든 단계를 조용히 대체하지 않는다. 권한 생성·변경 자체는 시험 실행 승인에 포함하지 않는다. Pages/D1/KV/R2/Zone Routes 쓰기 권한은 이 실행안에 필요하지 않다. [공식 권한 안내](https://developers.cloudflare.com/workers/authorization/workers/)

Repository Secret `VWORLD_API_KEY`의 평문은 GitHub API로 읽을 수 없다. 향후 승인된 job은 검토한 SHA를 checkout하고 그 단계의 메모리 환경으로만 `secrets.VWORLD_API_KEY`를 받아 Wrangler stdin으로 공급한다. `TRIAL_ACCESS_TOKEN`은 같은 일회성 프로세스에서 암호학적 난수 32바이트의 base64url 43자로 생성·마스킹하고 메모리에만 보관하며 probe와 비활성 복귀까지 수행한다. Actions 경로를 확보할 수 없다면 기존 키 보유자의 로컬 stdin 공급 경로를 별도로 검토한다. 키를 채팅·파일·PR로 전달하거나 GitHub Secret을 추출하려고 우회하지 않는다.

현재 `.github/workflows/publication-security-ci.yml`의 `vworld_live_check`는 직접 VWorld 진단용이며 Worker 배포 job이 아니다. 이 문서는 해당 workflow를 변경하거나 실행하지 않는다. 향후 검토 브랜치의 분리된 수동 trial job을 마련하더라도 default branch의 수동 실행 등록 조건을 먼저 확인한다. [GitHub 수동 실행 조건](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

향후 수동 job에는 다음 조건이 필요하다.

1. 승인된 전체 40자리 `expected_sha`를 받고 repository·이벤트·검토 branch·`github.sha`·실제 checkout HEAD 일치를 자격증명 사용 전에 확인한다. 입력을 shell 코드에 직접 삽입하지 않는다. `contents:read`, `persist-credentials:false`, action immutable SHA와 검토한 Wrangler 버전을 고정한다.
2. 직접 VWorld 진단과 trial의 동시 선택을 거절한다. trial 실행에서는 직접 진단·일반 regression·그 artifact 업로드를 실행하지 않는다.
3. 새 대상을 나타내는 고정 concurrency 그룹으로 중복 배포를 막고 trial에 workflow 수준 `cancel-in-progress:false`를 적용한다. run ID별 그룹이나 job 수준 설정만으로 충분하다고 가정하지 않는다. 대기 중 중복 실행과 재실행도 별도 차단한다. [GitHub concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
4. 승인된 run 1개를 식별하고 `github.run_attempt == 1` 및 첫 생성 전 미사용 검사를 확인한다. 취소·실패·부분 생성 뒤의 재실행은 원격 비활성 상태와 기존 결과를 검토한 뒤 별도 승인받는다.
5. 검증·도구 설치 뒤 하나의 검토한 orchestration 프로세스에만 자격증명을 공급한다. 제3자 action이나 설치 단계에 키를 전달하지 않는다. 시험 토큰을 `GITHUB_ENV`·`GITHUB_OUTPUT`·파일·artifact로 넘기지 않는다. 마스킹만으로 유출 방지를 보장하지 않는다. [GitHub secret 취급](https://docs.github.com/en/actions/concepts/security/secrets)
6. 정상·실패 시 finally/trap과 `always()` 복구로 동일 검토 소스의 false 재배포 및 503 확인을 수행한다. 취소·runner 소실에 대한 자동 복구는 보장하지 않으므로 별도 운영자 복구 수단을 먼저 확보한다. 출력은 유한한 상태·성공 여부·안전한 배포 식별정보만 허용한다.

secret은 CLI 인자/vars/.env/.dev.vars/임시 파일/캐시/아티팩트에 쓰지 않는다. 전체 실행 작업에 `WRANGLER_WRITE_LOGS=false`, `WRANGLER_LOG_SANITIZE=true`, `WRANGLER_SEND_METRICS=false`를 고정한다. stdout/stderr 억제만으로 기본 디스크 debug 로그가 꺼지는 것은 아니다. shell tracing/debug/full env 출력과 `wrangler tail`을 사용하지 않는다. secret 단계의 stdout/stderr·전체 예외도 남기지 않고 성공 여부만 기록한다. Wrangler Action의 `secrets` 옵션은 deploy보다 먼저 원격 변경을 할 수 있으므로 `--dry-run`과 결합해 무변경이라고 해석하지 않는다. [Action 구현](https://github.com/cloudflare/wrangler-action/blob/v4/src/wranglerAction.ts), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 4. 향후 비활성 생성·secret 공급

이 절 이하의 명령은 **별도 승인 후 실행할 형태**이며 이번 수정에서 실행하지 않는다. 동일한 최종 검토 checkout과 검토한 고정 Wrangler 바이너리만 사용한다. 아래 `4.151.3`은 준비안의 고정 버전이며 실제 실행 전에 도구 검증을 마친다.

정규 trial config의 required secrets 때문에 secret 없는 첫 deploy는 실패한다. 첫 생성에만 같은 폴더의 임시 `wrangler.trial-bootstrap.toml`을 만들고 required 목록을 `[]`로 바꾼다. entrypoint·새 이름·나머지 설정은 trial config와 동일해야 한다. `TILES_ENABLED=false`, 빈 두 시간값, `preview_urls=false`, observability off와 격리를 구조 검사한다. 임시 설정을 public artifact에 넣지 않는다.

```text
npx wrangler@4.151.3 deploy --config vworld-tiles/wrangler.trial-bootstrap.toml --name birdmap-vworld-tiles --var TILES_ENABLED:false
```

검증한 새 호스트의 `/tiles/8/218/100.png`에 허용 출처를 붙인 시험 클라이언트 GET 1회가 503이어야 한다. 이는 서버 경로 차단 검사이며 브라우저 인증 증거가 아니다. key 미공급·비활성 코드·검토 버전·원격 binding을 함께 확인하고 안전한 배포/버전 식별정보만 기록한다. 예상외 상태면 중단한다.

secret 공급 직전에 새 대상의 존재·배포 버전·false를 재확인한다. `secret put`은 대상이 없으면 stub을 생성할 수도 있으므로 존재 확인을 생략하지 않는다.

```text
npx wrangler@4.151.3 secret put VWORLD_API_KEY --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles
npx wrangler@4.151.3 secret put TRIAL_ACCESS_TOKEN --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles
npx wrangler@4.151.3 deploy --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles --var TILES_ENABLED:false
```

승인한 프로세스가 값을 stdin으로 보내며 명령행·화면 입력 예시에 값을 넣지 않는다. `secret put` 자체가 즉시 새 버전을 배포하므로 각 단계에서 false 보존을 검사한다. required secrets 검증을 통과한 최종 비활성 버전을 `DISABLED_VERSION_ID`로 기록하고 valid tile GET 1회의 503을 다시 확인한다. 값 대신 필요한 secret 이름·false·entrypoint·binding 격리 여부만 검사한다. [required secrets](https://developers.cloudflare.com/workers/wrangler/configuration/#secrets)

## 5. 향후 CF→VWorld 제한 시험

제안 범위는 **최대 10분의 시간창, 신뢰한 시험 클라이언트 하나, 실제 upstream 시도 최대 4회, 순차 요청, 자동 재시도 0회**다. 모든 진입조건과 별도 승인을 충족한 뒤에만 진행한다. 성공·실패 모두 즉시 비활성화한다. 일반 Pages·실기기 지도 사용은 이 단계에 포함하지 않는다.

실행 시 UTC `START_ISO`와 `END_ISO`를 정확한 밀리초 포함 ISO 형식으로 만들고 `0 < END_ISO - START_ISO <= 10분`을 확인한다. 다음은 실제 값을 넣을 명령 형태이며 두 시간은 credential이 아니다.

```text
npx wrangler@4.151.3 deploy --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles --var TILES_ENABLED:true --var TRIAL_STARTS_AT:<START_ISO> --var TRIAL_EXPIRES_AT:<END_ISO>
```

시험 토큰은 HTTPS 요청 헤더에만 넣고 URL·브라우저·Pages 설정에는 넣지 않는다. 유효 토큰 없이 유효시간 안의 유효 타일 요청이 403인지 1회 확인한다. 이후 Base 타일 `(z,x,y)`의 고정 목록 `(8,218,100)`, `(8,219,100)`, `(8,220,100)`, `(8,221,100)`을 최대 4회만 순차 요청한다. 첫 실패면 남은 요청을 생략한다. 클라이언트 요청 제한은 12초, Worker upstream+본문 타임아웃은 8초다. 실제 VWorld에 rate-limit을 유발하는 부하 시험은 하지 않는다.

성공 판정은 HTTP 200, `image/png`, 2MiB 이하, PNG 구조/CRC/256×256, no-store, 리디렉션·비밀 응답 헤더 부재다. 원본 이미지·원문 오류·Network dump/HAR·upstream URL·키·토큰은 저장하지 않는다. 요약에는 순번·상태·종류·바이트 수·PNG 판정·소요시간·키 없는 응답 식별정보만 남긴다. 성공은 서버 경로의 관측이며 실제 브라우저·지리 내용 육안·휴대전화 성공 증거로 확대하지 않는다.

503/403/429/502/timeout/3xx/XML/HTML/잘못된 PNG이면 즉시 비활성 복귀한다. relay는 upstream 원문을 502로 숨기므로 클라이언트만으로 인증·DNS·TLS·지역 차단 중 원인을 확정하지 않는다. Pages Referer/Origin을 VWorld로 위조하거나 `domain`을 임의 추가하지 않는다.

시험 rate-limit은 IP당 20/60초, Cloudflare 위치별 합계 40/60초의 **위치별 근사 제한**이다. 4회는 신뢰한 단일 클라이언트의 실행 예산이며 전역 hard cap이 아니다. 임시 토큰과 시간창이 외부 사용을 줄여도 거절 요청의 invocation 비용까지 차단하지는 않는다. [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## 6. 정상 종료·오류·중단 복구

성공해도 즉시 동일 검토 SHA의 정규 trial config를 false로 재배포한다. 이 config의 빈 두 시간값도 함께 적용한다.

```text
npx wrangler@4.151.3 deploy --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles --var TILES_ENABLED:false
```

원격 false·빈 시간값·최종 배포/버전과 valid tile GET 1회의 503을 확인한다. 비상시 rollback은 기록한 `DISABLED_VERSION_ID`를 지정하는 대화형 수동 복구에만 사용한다. 비대화형 secret 변경 확인을 자동 수락할 수 있으므로 CI에서 `rollback --yes`를 쓰지 않는다. 추가 확인이 나오면 현재 secret 상태를 검토하거나 false 재배포로 돌아간다. 직전 버전을 추정하지 않는다. 시험 토큰은 다시 쓰지 않는다. secret 삭제도 별도 원격 변경이므로 이 실행안에서 자동 수행하지 않는다. [Rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

CI 취소·runner 소실 시 cleanup 실행을 보장하지 않는다. 시간창은 fetch 직전 신규 진입을 거절하는 통제이며 운영자의 비활성 복구 수단을 대체하지 않는다. 이미 시작한 요청과 타임아웃의 범위는 2절과 같다. 추후 Worker 삭제·호스트 차단은 별도 승인 대상이다. 운영 지도는 OSM이므로 이 제한 시험의 종료에 Pages 변경은 필요하지 않다.

## 7. 연결 조건과 다음 단계

직접 WMTS와 비캐시 중계를 허용받았다는 기존 사용자 상담 맥락은 유지하되 실제 서버 인증·송신 경로의 검증을 대체하지 않는다. [공식 WMTS](https://www.vworld.kr/dev/v4dv_wmtsguide_s001.do)의 Base 경로·줌·PNG 조건과 해당 키 상태·등록 조건은 실행 전에 확인한다. 일반 Worker에 고정 국내 송신 IP가 있다고 가정하지 않으며 국내 ingress나 클라이언트 위치만으로 실제 egress를 입증하지 않는다. [전용 Egress 안내](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/)

namespace 감사, 실행 경로, 최소 권한 전환, 비활성 복구, 최종 SHA·CI 중 하나라도 미확인이면 원격 시험으로 진행하지 않는다. 그 뒤 별도 실행 승인을 받더라도 main 병합·운영 Pages 변경·기존 서비스/D1 변경·약관 동의·권한 변경까지 승인한 것으로 해석하지 않는다. 실제 Pages end-to-end, Android/iPhone, 장기 성능과 지도 내용 육안 확인은 제한 시험 이후의 별도 단계다.
