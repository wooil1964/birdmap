# VWorld 전용 Worker 제한 시험 실행안 — 아직 미승인·미실행

기준일: 2026-10-22 KST. 원래 검토 head `3c98bac7d768654ba1ae2715170ab529a065bfb3`에 시험 준비만 보완한다. 실제 실행은 이 문서와 시험 진입점을 포함하는 **최종 검토 SHA**를 다시 확인하고 고정한다. main/Pages/기존 Worker/D1 변경은 이번 승인 범위에서 제외한다.

## 1. 확인한 값과 아직 확인할 값

| 항목 | 현재 근거 / 실행 전 조건 |
|---|---|
| 신규 Worker 이름 | `birdmap-vworld-tiles`. 계정에서 미존재를 확인해야 한다. 동명 Worker가 있으면 소유/용도를 추정하거나 덮어쓰지 않고 중단한다. |
| 예상 호스트 | `birdmap-vworld-tiles.wooil-birdmap.workers.dev`. subdomain은 기존 저장소의 reports URL에서 관찰한 후보이며 계정 소유·실생성 확인이 아니다. 실제 subdomain이 다르면 이름/프런트 allowlist 변경을 별도 검토한다. 계정 subdomain 자체를 바꾸지 않는다. |
| 계정 ID·플랜·여유량 | 대시보드 로그인과 로컬 CF 인증이 없어 미확인. ID를 추정해 넣지 않는다. |
| 허용 페이지 출처 | 코드상 `https://wooil1964.github.io`. origin 단위라 `/birdmap/` 경로만 인증하는 것은 아니다. 헤더 검사는 보조 통제다. |
| rate-limit namespace | `196440`/`196441`은 형식상 유효하고 저장소의 다른 서비스와 중복이 없다. 일반 설정과 시험 설정은 **같은 새 Worker의 대안 설정**이어서 두 곳에 동일 ID를 의도적으로 사용한다. 계정 전체 중복은 미확인. |
| 격리 | trial config에 D1/KV/R2/서비스/DO/마이그레이션/routes/cron/관리자 secret 없음. 계정 비용·Free 한도는 공유한다. |
| 사용자 상담 확인 | 직접 WMTS와 Cloudflare 비캐시 중계 허용을 전제로 한다. 같은 허가를 다시 요청하는 절차가 아니다. 실제 서버 인증·송신 경로는 별도 미검증이다. |

승인 후에도 첫 원격 **변경 전에** 다음 읽기 전용 감사를 통과해야 한다.

1. 정확한 계정 ID/명칭/계정 subdomain/Free 또는 Paid/현재 사용량을 확인하고, 실행 대상 계정을 명시적으로 고정한다.
2. Workers 목록을 끝까지 조회하여 신규 이름이 미사용인지 확인한다. `404`와 `403`/인증 실패를 구분한다. 호스트의 DNS/HTTP 실패만으로 미사용을 판정하지 않는다.
3. 계정 전체 Worker의 active settings/config와 보존 버전 중 재사용될 설정에서 ratelimit binding의 namespace를 확인한다. 같은 계정의 같은 namespace/key는 카운터를 공유한다. 조회 불가능하면 충돌 없음으로 간주하지 않는다. KV namespace 생성 작업은 필요하지 않다.
4. 필요한 설정만 읽어 `binding type/name/namespace`로 요약한다. 원본 설정 전체·환경 변수·secret 값·계정 token·메일은 출력/저장하지 않는다. 기존 reports/admin/weather/events를 변경하지 않는다.
5. 원격 inventory에 이번 namespace가 이미 쓰이면 새 미사용 ID를 선정해 두 config와 문서를 다시 검토한다. 사용 중 ID를 탈취하지 않는다.

[Rate-limit namespace와 범위](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## 2. 최소 권한·키 공급 경로

현행 권한 모델에서 신규 생성은 해당 계정의 **Workers product Admin**이 필요하다. 생성 후에는 **`birdmap-vworld-tiles` 하나의 Editor**로 secret/배포/rollback을 수행한다. 생성용 권한은 기존 Worker도 변경할 수 있으므로 계정 하나·짧은 만료로 제한하고 bootstrap 후 폐기한다. 기존 관리자 token을 가져와 재사용하지 않는다. workers.dev만 사용하므로 Pages/D1/KV/R2/Zone Routes 쓰기 권한을 추가하지 않는다. 신규 역할을 아직 쓸 수 없는 계정이라면 legacy `Workers Scripts Edit`의 계정 전체 범위를 명시하고 별도 확인한다. [공식 역할·명령별 권한](https://developers.cloudflare.com/workers/authorization/workers/)

Repository Secret `VWORLD_API_KEY`의 평문은 GitHub API로 읽을 수 없다. 승인 후 아래 둘 중 확정된 경로로 공급한다.

- 기본안: 검토한 SHA만 checkout하는 승인된 GitHub Actions 작업에서 `secrets.VWORLD_API_KEY`를 그 단계의 메모리 환경에만 전달하고 Wrangler stdin으로 공급한다. `TRIAL_ACCESS_TOKEN`은 같은 일회성 작업에서 암호학적 난수 32바이트/base64url 43자로 생성해 마스킹하며 메모리에서만 보관한다. 실행 이후 같은 작업이 probe와 비활성 복귀를 마친다.
- Actions 실행 경로를 확보할 수 없으면 기존 키 보유자가 로컬 stdin을 통해 직접 공급하는 방안을 별도로 고른다. 키를 채팅/파일/PR로 전달하지 않는다. GitHub Secret을 추출하려고 우회하지 않는다.

**현재 전용 배포 job은 없다.** 이번에는 실행 workflow를 추가하거나 dispatch하지 않는다. 향후 job은 `contents:read`, `persist-credentials:false`, 정확한 SHA/branch 확인, 제3자 action immutable SHA·Wrangler 4.151.3 고정, 사용자 승인, 고유 concurrency, 취소 중복 실행 방지, `always()` 비활성 복귀를 포함해야 한다. 새 workflow의 `workflow_dispatch`를 브랜치에만 추가하면 바로 실행할 수 있다고 가정하지 않는다. default branch의 등록 여부를 먼저 확인하고, 필요한 경우 이미 등록된 workflow의 **검토 브랜치 버전**에 분리된 수동 job을 준비한다. main 파일은 바꾸지 않는다. [GitHub 수동 실행 조건](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

secret은 CLI 인자/vars/.env/.dev.vars/임시 파일/캐시/아티팩트에 쓰지 않는다. shell tracing/debug/full env 출력과 `wrangler tail`을 사용하지 않는다. secret 단계의 stdout/stderr·전체 예외도 남기지 않고 성공 여부만 기록한다. Wrangler Action의 `secrets` 옵션은 deploy보다 먼저 원격 secret 변경을 할 수 있으므로 `--dry-run`과 결합해 무변경이라고 해석하지 않는다. [Action 구현](https://github.com/cloudflare/wrangler-action/blob/v4/src/wranglerAction.ts), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

아래 명령은 **승인 후 실행할 형태**다. 이번에는 원격 명령을 실행하지 않았다. 모든 명령은 동일한 검토 checkout 루트, 검증된 `CLOUDFLARE_ACCOUNT_ID`/전용 token, 고정 Wrangler 바이너리를 사용한다. `npx wrangler@4.151.3`은 버전 표기이며 실제 승인 작업에서는 검증된 의존성을 사전 설치한다.

## 3. 비활성 bootstrap — 최초 1회, secret 없음

정규 trial config의 `required` 두 항목 때문에 secret 없는 첫 deploy는 실패한다. 첫 생성에만 **같은 폴더의 임시 `wrangler.trial-bootstrap.toml`**을 만들고 required 목록을 `[]`로 바꾼다. entrypoint/이름/나머지 설정은 trial config와 동일해야 한다. `TILES_ENABLED=false`, 빈 두 시간값, `preview_urls=false`, observability off를 육안/구조 검사한다. 임시 설정을 public artifact에 포함하지 않는다.

```text
npx wrangler@4.151.3 deploy --config vworld-tiles/wrangler.trial-bootstrap.toml --name birdmap-vworld-tiles --var TILES_ENABLED:false
```

검증된 새 호스트의 `/tiles/8/218/100.png`에 허용 출처를 붙인 시험 클라이언트 GET 1회가 `503`이어야 한다. 이는 브라우저 출처 증명이 아니라 서버 경로 차단 검사다. key 미공급이고 코드도 비활성이라 upstream 호출이 발생할 수 없는 경로인지 소스/remote bindings/버전과 함께 확인한다. bootstrap 배포 ID와 버전 ID를 기록한다. 예상외 상태면 중단한다.

## 4. 두 secret 공급 후 다시 비활성 배포

secret 공급 직전에 Worker 이름/배포 버전/false를 재확인한다. `secret put`은 대상이 없으면 CI에서 stub Worker를 생성할 수도 있으므로 존재 확인을 생략하지 않는다.

```text
npx wrangler@4.151.3 secret put VWORLD_API_KEY --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles
npx wrangler@4.151.3 secret put TRIAL_ACCESS_TOKEN --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles
npx wrangler@4.151.3 deploy --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles --var TILES_ENABLED:false
```

앞의 두 명령은 승인된 작업이 값을 stdin으로 보내며 명령행/화면 입력 예시에 값을 넣지 않는다. `secret put` 자체가 즉시 새 버전을 배포한다. 각 단계의 false 보존을 검사하고, 정규 설정의 required secrets 검증까지 통과한 **최종 비활성 버전 ID**를 `DISABLED_VERSION_ID`로 기록한다. valid tile GET 1회가 다시 503이어야 한다. 값 대신 secret 이름·false·entrypoint·namespace·storage/service binding 부재만 확인한다. [required secrets](https://developers.cloudflare.com/workers/wrangler/configuration/#secrets), [secret 즉시 배포](https://developers.cloudflare.com/workers/configuration/secrets/)

## 5. 1차 CF→VWorld 제한 시험

승인 범위 제안은 **최대 10분의 시간창, 신뢰한 시험 클라이언트 하나, 실제 upstream 시도 최대 4회, 순차 요청, 자동 재시도 0회**다. 성공/실패 모두 즉시 비활성화한다. 일반 Pages·실기기에서의 지도 사용은 이 단계에 포함하지 않는다.

실행 시점의 UTC `START_ISO`와 `END_ISO`를 밀리초 포함 `YYYY-MM-DDTHH:mm:ss.sssZ`로 만들고 차이를 10분 이하로 확인한다. 다음은 변수 자리에 실제 값을 넣을 명령 형태다. 두 시간은 credential이 아니다.

```text
npx wrangler@4.151.3 deploy --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles --var TILES_ENABLED:true --var TRIAL_STARTS_AT:<START_ISO> --var TRIAL_EXPIRES_AT:<END_ISO>
```

새 trial entrypoint는 유효시간과 `X-Birdmap-Trial-Token`이 모두 맞을 때만 기존 relay로 넘긴다. 토큰은 HTTPS 요청 헤더에만 넣고 URL/브라우저/Pages 설정에는 넣지 않는다. 유효 token 없이 active trial의 유효 타일 요청이 403인지 먼저 1회 확인한다. 이후 Base 타일 `(z,x,y)`의 고정 목록 `(8,218,100)`, `(8,219,100)`, `(8,220,100)`, `(8,221,100)`을 최대 4회만 순차 요청한다. 첫 실패면 남은 요청을 생략한다. 각 클라이언트 요청 제한은 12초, Worker upstream+본문 제한은 기존 8초다. 실제 VWorld에서 rate-limit을 유발하는 부하 시험은 하지 않는다.

성공 판정: `HTTP 200`, `image/png`, 2MiB 이하, PNG 구조/CRC/256×256, no-store, 리디렉션·비밀 응답 헤더 부재. 원본 이미지/원문 오류/Network dump/HAR/upstream URL/키/토큰은 저장하지 않는다. 요약에는 순번·상태·종류·바이트 수·PNG 판정·소요시간·키 없는 CF 응답 식별정보만 남긴다. 성공은 CF→VWorld 서버 경로 증거이며 실제 브라우저·육안 지리 내용·휴대전화 성공 증거로 확대하지 않는다.

503/403/429/502/timeout/3xx/XML/HTML/잘못된 PNG이면 즉시 6단계로 간다. relay가 upstream 원문을 502로 숨기므로 클라이언트만으로 인증·DNS·TLS·지역 차단 중 정확한 원인을 확정할 수 없다는 한계도 기록한다. Pages Referer/Origin을 VWorld로 위조하거나 `domain`을 임의 추가하지 않는다.

시험 rate-limit은 IP당 20/60초, Cloudflare 위치별 합계 40/60초다. **위치별 근사 제한이며 전역 총 4회 hard cap은 아니다.** 4회는 신뢰한 단일 시험 클라이언트의 실행 예산이고, 임시 토큰과 만료가 외부 사용을 줄인다. 거절 요청도 CF invocation 비용에 포함된다. 만료는 신규 upstream 진입을 차단하지만 이미 시작한 요청은 최대 약 8초 더 완료될 수 있다. [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## 6. 정상 종료·오류·중단 복구

성공해도 즉시 **검증된 비활성 버전**으로 복귀한다. 버전 ID를 생략해 직전 버전을 추정하지 않는다.

```text
npx wrangler@4.151.3 rollback <DISABLED_VERSION_ID> --config vworld-tiles/wrangler.trial.toml --name birdmap-vworld-tiles --yes
```

rollback 불가 시 같은 검토 SHA의 정규 trial config로 `--var TILES_ENABLED:false` 재배포한다. secret 변경 버전 사이 rollback이 추가 확인을 요구하면 확인을 우회하지 않고 false 재배포를 사용한다. 원격 false/빈 시간값, 최종 deployment/version ID와 유효 타일 503을 확인한다. 종료 후 token은 폐기하고 다시 시험할 때 재사용하지 않는다. Worker secret 삭제는 또 다른 즉시 배포이므로 별도 승인 없이 실행하지 않는다. [Rollback 동작](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

CI 취소·runner 소실 시 cleanup이 실행된다고 보장하지 않는다. 서버 시간창이 새로운 upstream 진입을 차단하며 운영자는 복구 명령과 새 Worker만 대상으로 삼는 계정 접근 수단을 별도로 가지고 있어야 한다. 만료는 완전한 CF 요청비용 차단이 아니므로 추후 Worker 삭제/호스트 차단은 추가 승인 대상이다. main/Pages는 처음부터 OSM이므로 이번 시험 때문에 Pages rollback이 필요하지 않다.

## 7. 비용·연결 조건·미확인

2026-10-22 공식 표 기준 Free는 계정 합산 100,000요청/일이며 KST 09:00 초기화, Paid는 계정 최소 US$5/월, 10,000,000요청/월·30,000,000 CPU-ms 포함, 초과 US$0.30/백만 요청·US$0.02/백만 CPU-ms다. 전송량 추가 요금은 없다. 별도 Worker여도 기존 reports와 포함량을 공유하므로 실제 계정 여유량 확인이 선행된다. binding 별도 단가·계정 제공 여부는 실제 계약/계정에서 확인해야 한다. 과금 알림은 강제 중단 장치가 아니다. [가격](https://developers.cloudflare.com/workers/platform/pricing/), [플랫폼 한도](https://developers.cloudflare.com/workers/platform/limits/)

[공식 WMTS](https://www.vworld.kr/dev/v4dv_wmtsguide_s001.do)는 Base 줌6–19/PNG/키 경로를 정의하지만 CF 서버 호출의 Referer/Origin/IP 조건을 명시하지 않는다. [공식 FAQ](https://www.vworld.kr/v4po_brdfaq_s001.do)는 지오코더 외 별도 일일 제한은 없다고 안내하면서 과도한 호출의 일시 차단 가능성을 설명한다. 이를 해당 키의 무제한 허용으로 해석하지 않는다. [인증키관리](https://www.vworld.kr/dev/apiKey_s001.do)의 해당 키 상태·등록 URL·만료·개별 제한은 미확인이다.

일반 Workers에 고정 국내 송신 IP가 있다고 가정하지 않는다. ICN ingress 또는 국내 시험 클라이언트는 VWorld로의 실제 egress를 증명하지 않는다. [전용 Egress](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/)는 별도 기능이다. [국외 클라우드 접속 공지](https://www.vworld.kr/v4po_brdnotice_s002.do?brdIde=23353)와 상담 허용은 실제 CF 연결 시험으로 기술적 불확실성을 좁히되, 우회 요청을 허용하는 근거로 삼지 않는다.

[2026-10-30 약관 개정·재동의 공지](https://www.vworld.kr/v4po_brdnotice_s002.do?brdIde=34515)를 재확인했다. 이번에는 약관 동의나 계정 변경을 수행하지 않았다. 실제 Pages end-to-end·Android/iPhone·장기 성능·지도 내용 육안 확인은 다음 단계의 별도 검증이다.

## 8. 한 번에 받을 실행 승인 범위

계정·호스트·namespace·잔여량 확인을 통과한다는 조건으로, 최종 검토 SHA의 **새 `birdmap-vworld-tiles`만** (1) false 상태 생성, (2) GitHub `VWORLD_API_KEY`와 일회성 `TRIAL_ACCESS_TOKEN`을 해당 Worker에만 공급, (3) 최대 10분/클라이언트 최대 4 upstream 요청 시험, (4) 성공·실패 모두 검증한 false 버전 복귀를 승인받는다. 필요한 **검토 브랜치 전용 수동 secret 공급 job**의 구성·1회 실행도 승인 범위에 포함하되 main/Pages/기존 Worker/D1/약관 동의/유료 플랜 변경/다른 자격증명 권한 변경은 포함하지 않는다.

승인만으로 미확인 계정 정보를 추정하거나 검사 실패를 무시하지 않는다. 토큰 생성·권한 부여는 실제 UI/API의 허용 모델에 맞게 계정 소유자가 보안 채널에서 수행하며 값은 채팅에 보내지 않는다.
