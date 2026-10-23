# VWorld 전용 Worker — 1인·PC 1대 운영 절차(solo-local-v1)

> **독립 승인자가 없는 1인 운영 절차다.** 운영자 한 사람(GitHub `wooil1964`)이 Windows PC 한 대로 승인·실행하고, 장애 시 스마트폰의 Cloudflare 관리 화면으로 복구한다.
> 이 경로는 `TRIAL_RUNBOOK.md`의 GitHub 보호 환경·독립 reviewer 경로(`vworld-worker-trial.yml`)를 **대체하거나 그 조건을 충족한 것으로 간주하지 않는다.** 기존 workflow는 변경하지 않았다.
> 2인 분리 효과는 없다. 실수·재실행·PC 장애를 줄이는 장치이며, 운영자 본인이나 PC를 장악한 악성코드를 막지 못한다.

기준일 2026-10-22. 이 문서·코드·CI 통과는 실제 생성·secret 공급·활성화·실키 호출의 승인이 아니다.

## 1. 구조

| 구성 | 역할 |
|---|---|
| GitHub | 고정 SHA의 회귀 CI와 Draft PR #40 head 확인(승인·credential 보관 없음) |
| 운영 PC 1대 | 승인서 작성·서명, `bootstrap`·`handoff`·`trial`, 재시작 후 `recover`·`drill` |
| 스마트폰 | Cloudflare 관리 화면(2단계 인증 로그인)으로 **PC 토큰 폐기 → 비활성화 → 503 확인** |
| Cloudflare | 신규 `birdmap-vworld-tiles` 하나. D1·Pages·기존 Worker 변경 없음 |

### PC 1대에서 안전이 성립하는 이유
1. **시험 토큰은 PC 프로세스 메모리에만 있다.** PC가 꺼지거나 프로세스가 죽으면 인가된 타일 요청을 할 수 있는 클라이언트가 사라진다(타인은 403).
2. **활성 창은 승인서의 절대 UTC 시각으로 고정(최대 10분)되며 Worker 자체가 창 밖에서 503을 낸다.** PC와 스마트폰이 모두 응답하지 않아도 창 종료 후 upstream 경로는 닫힌다.
3. 스마트폰 복구는 1·2가 보장하는 상태를 **깨끗한 false 상태로 되돌리고 PC 권한을 끊는 위생 절차**다.

## 2. 승인서와 서명(하드웨어 키 미보유 전제)

승인서 필드·정규형(SHA 40자리, 단계, `solo-<UUID>` 작업 ID, 계정 해시, 유효시간 ≤30분, nonce, activate의 절대 창·4타일·재시도 0)은 그대로다. 같은 PC에서 `approve` → 내용 확인 → `ssh-keygen -Y sign -n birdmap-vworld-solo-approval-v1 -f <키>` → 실행한다.

서명 정책은 커밋된 `vworld-tiles/trial/solo-signer.json`(`publicKey`, `assurance`)으로 명시한다. 파일이 없으면 모든 명령이 `SOLO_SIGNER_NOT_REGISTERED`로 차단된다. 등록·변경은 새 SHA·전체 CI가 필요한 별도 승인 단계다.

**등록 상태(2026-10-23):** 운영자가 FIDO2 대신 암호문 보호 소프트웨어 키를 명시적으로 선택했다. `ssh-ed25519`, 지문 `SHA256:79CPkn79g+rjRsujSY/0HjQSbkAdkSULkyLQ/izDYdI`, `assurance: software-passphrase`. 개인키는 BitLocker 암호화 PC의 사용자 프로필에만 둔다. ssh-agent에 등록하지 않는다(Windows ssh-agent는 등록 키를 재부팅 후에도 보관해 암호문 확인을 건너뛰게 한다). 이 수준에서 실제 보안은 서명보다 4장의 짧은 수명·좁은 범위 토큰과 스마트폰 복구가 담당한다.

| 대안 | assurance | 얻는 것 | 얻지 못하는 것 | 준비 |
|---|---|---|---|---|
| FIDO2 보안키(`ed25519-sk`/`ecdsa-sk`) | `hardware-presence` | 서명마다 물리 터치, 키 복제 불가 | 같은 PC 악성코드가 터치 순간을 악용하는 것은 막지 못함 | 보안키 구입 |
| Windows Hello(`ecdsa-sk`, Windows OpenSSH) | `hardware-presence` | PIN/생체 확인, TPM 보관 | 위와 같음 | **이 PC에서 작동 여부 미확인.** 운영자가 `ssh-keygen -t ecdsa-sk`로 직접 시험해야 함 |
| 암호문 보호 소프트웨어 키(`ssh-ed25519`) | `software-passphrase` | 승인서 변조 검출, SHA·단계·시간 결속, 승인 의도 표시 | 사람 확인 증명, 같은 PC 악성코드 방어. 암호문 설정 여부는 검증기가 확인할 수 없음 | 즉시 가능 |
| 서명 없이 문구 입력만 | (지원 안 함) | 실수 방지 | 변조 검출·결속 | — |

- 검증기는 하드웨어 키의 사용자 존재 플래그를 직접 강제한다. OpenSSH `ssh-keygen -Y verify`는 이 플래그 없이도 통과시키는 것을 관측했다.
- 소프트웨어 키를 하드웨어로 선언하거나, 하드웨어 키를 소프트웨어로 선언하면 `SOLO_SIGNER_POLICY_MISMATCH`로 거부한다. 수준이 조용히 내려가지 않는다.
- **권고:** 보안키가 확인되기 전에는 `software-passphrase`를 운영자가 명시적으로 승인하는 경우에만 쓴다. 이때 실제 보안은 서명보다 아래 4장의 짧은 수명·좁은 범위 토큰과 스마트폰 복구가 담당한다는 점을 승인 기록에 남긴다.

## 3. 명령(모두 같은 PC)

credential은 비밀 관리 도구가 **해당 프로세스 환경에만** 주입한다. 명령행·`.env`·셸 기록·파일 금지. `SOLO_STATE_DIR`은 저장소 밖.

| 명령 | 허용 credential | 동작 |
|---|---|---|
| `approve <stage> --sha … --out …` / `show <파일>` | 없음 | 승인서 작성·검증(서명 전 내용 확인) |
| `bootstrap <승인서>` | 생성 Admin, 전체 Read | secret 없는 false 생성 → 503 |
| `handoff <승인서>` | PC Editor, 회수 확인용 생성 token | 쓰기 0. Editor 활성·**만료 7일 이내**, 생성 token 비활성, D1·Pages 읽기 거부, 다른 Worker 미노출, false·503 |
| `trial <secrets 승인서>` | PC Editor, Read, VWorld 키 | secret 공급(false 유지) → activate 승인서 경로 입력 대기 → **스마트폰 복구 카드 출력** → 절대 창 4타일 → false·503 |
| `recover <승인서>` | PC Editor | 재시작 후 false·503, 토큰 무력화, 재확인 감시 |
| `drill <승인서>` | PC Editor | 쓰기 0 상태 점검 |

- `trial` 대기 중 Ctrl+C를 누르면 즉시 대기를 끝내고 false·503 복구로 간다.
- 활성화만 하는 명령은 없다.

## 4. 스마트폰 비상 복구 절차

미리 준비: Cloudflare 계정 2단계 인증, 백업 코드 오프라인 보관, 스마트폰 브라우저 로그인 확인, PC Editor 토큰 이름 기록(예: `birdmap-vworld-tiles-pc-YYYYMMDD`).

**순서가 중요하다. 토큰을 먼저 끊는다.** 대시보드에서 workers.dev를 끄거나 값을 바꿔도, PC에서 이미 출발한 `wrangler deploy`가 나중에 도착하면 다시 켜질 수 있다. Cloudflare 문서도 workers.dev 경로가 다음 Wrangler 배포 때 다시 켜진다고 안내한다. 합성 시험에서 이 재활성화를 재현했다.

보조 장치: 살아 있는 PC 실행기는 매 쓰기 직전에 "직전 자기 쓰기 이후 새 버전이 1개 이하이고 활성 배포가 그 최신 버전인지"를 확인하고, 정리(cleanup) 직전에도 같은 확인을 한다. 외부 변경(대시보드 Rollback·변수 변경, `recover` 실행, 중복 프로세스)이 보이면 PC는 **그 뒤로 아무 쓰기도 하지 않고** `SOLO_OPERATOR_TOOK_OVER_NO_PC_WRITE`로 끝난다. 자기 false 정리 배포도 하지 않는다. Wrangler 배포가 스마트폰 조치를 덮어쓰거나 꺼 둔 workers.dev를 다시 켜는 것을 막기 위해서다. 그 뒤 상태 확인은 스마트폰(3단계)으로 한다. **이미 출발한 요청은 막지 못하므로 토큰 폐기가 여전히 먼저다.** 네트워크 오류처럼 판정할 수 없는 경우에는 기존대로 false 정리를 시도한다.

토큰을 폐기해도 남는 위험:
- 폐기 전에 Cloudflare가 이미 받은 요청이 나중에 반영되는지는 미확인이다. 그래서 4단계의 재확인이 필요하다.
- 실행 중이던 프로세스가 메모리에 갖고 있던 시험 토큰은 폐기와 무관하다. 그 프로세스가 보내는 타일 요청은 Worker가 꺼지거나 창이 끝나면 503이 된다.
- Worker에 저장된 VWorld 키 secret은 그대로 남는다. 삭제는 별도 승인 대상이다.

1. **PC 토큰 폐기**: Manage account → Account API tokens(사용자 토큰이면 My Profile → API Tokens)에서 PC Editor 토큰을 삭제하거나 Roll. Roll하면 이전 값은 무효가 된다.
2. **비활성화**(하나 선택)
   - 권장: Workers & Pages → `birdmap-vworld-tiles` → Deployments → 메시지가 `bm:<SHA>:bootstrap:` 또는 `bm:<SHA>:consumed:`인 버전의 ⋯ → **Rollback**. 이 버전들은 항상 존재하며 `TILES_ENABLED=false`다(`closed`는 장애 시점에 따라 없을 수 있다). `enabled`가 들어간 버전으로는 되돌리지 않는다. 대시보드에 버전 메시지가 표시되는지는 미확인이다.
   - 대안: Settings → Variables and Secrets에서 `TILES_ENABLED`를 `false`로 바꾸고 **Deploy**.
   - 추가 차단(선택): Settings → Domains & Routes → workers.dev **Disable**. 이후 확인 URL은 Cloudflare 오류 화면이 된다.
3. **확인**: 스마트폰 브라우저로 `https://birdmap-vworld-tiles.<서브도메인>.workers.dev/tiles/8/218/100.png`를 연다.
   - `trial_disabled` → 비활성(503) 확인.
   - `tiles_unavailable` → 아직 활성(403). 2단계를 다시 한다.
   - Cloudflare 오류 화면 → workers.dev 차단 상태.
   - 확인 결과는 캐시되지 않는다(`no-store`).
4. 5분 뒤 3을 다시 확인하고 시각을 기록한다.

접근 경로별 판단:
- workers.dev 주소: 3의 결과로 판단한다. **workers.dev 스위치를 끈 것만으로 모든 경로가 닫혔다고 판단하지 않는다.**
- Preview·버전별 URL: 이 Worker는 `preview_urls=false`로 배포되고, PC의 모든 확인(`drill`·`recover`·`trial`)은 `previews_enabled=false`가 아니면 실패로 끝난다. 대시보드 조작이 이 설정을 바꾸는지는 미확인이다. 스마트폰에서 Settings → Domains & Routes에 Preview URL이 꺼져 있는지 함께 본다.
- 어떤 버전의 코드도 정확한 시험 토큰과 열린 시간창 없이는 upstream을 호출하지 않는다. 버전 URL이 열려 있어도 창이 지난 `enabled` 버전은 `trial_disabled`를 낸다(합성 시험).
- workers.dev를 끈 뒤에는 PC의 `drill`·`recover`가 503을 확인할 수 없어 실패로 보고한다. 의도된 동작이다.
- 일반 사용자 화면(OSM 운영 지도)은 이 Worker를 호출하지 않는다. 같은 주소에 일반 브라우저로 접근하면 스마트폰과 같은 응답을 받는다(비활성 503 `trial_disabled`, 창 안의 토큰 없는 요청 403).
5. 이후 PC 작업은 새 토큰·새 승인서로만 한다. 같은 bootstrap은 소비되어 재사용되지 않는다.

**미검증:**
- 스마트폰 화면에서 위 메뉴가 모두 조작 가능한지는 Cloudflare 문서에 없다. 실제 시험 전 운영자가 스마트폰으로 **읽기만 하는 연습**(메뉴 위치 확인, 확인 URL 열기)을 해야 한다.
- Rollback 시 secret이 어떻게 처리되는지 문서에 없다. 비활성 판정은 `TILES_ENABLED`와 URL 결과로만 한다.

## 5. 장애 상황(합성 시험)

| 상황 | 결과 | 시험 |
|---|---|---|
| PC 강제 종료(활성 직후) | 토큰 보유자 소멸 → 403, 창 종료 시 자동 `trial_disabled` | 합성 |
| 실행 중단(Ctrl+C) | 즉시 대기 종료 → false·503 | 합성 |
| 네트워크 장애 | 자체 복구 실패를 성공으로 보고하지 않음, 재연결 후 `recover` | 합성 |
| 승인·상태 파일 손실 | 원격 이력이 재사용 거절 | 합성 |
| 복구 실패(토큰 만료·폐기) | 성공으로 보고하지 않음 → 스마트폰 절차 | 합성 |
| 복구 배포 후 503 실패 | 복구 완료로 보고하지 않음 | 합성 |
| 지연 도착 배포 | 토큰 폐기 먼저면 무효, 폐기 없이 비활성화만 하면 재활성화 가능(재현됨) | 합성 |

실제 Cloudflare·스마트폰·서명키로는 검증하지 않았다.

## 6. 실제 비활성 bootstrap 승인 전 준비

- [x] 서명 대안 결정(2장): `software-passphrase` 명시 승인, `solo-signer.json` 작성. 커밋·새 SHA·전체 CI는 별도 승인.
- [ ] Cloudflare 2단계 인증·백업 코드, 스마트폰 로그인과 읽기 전용 연습(4장).
- [ ] P1 credential: 한시 Workers Admin(생성)·Content Read-Only(감사), 짧은 만료. 가능하면 집 IP로 제한.
- [ ] bootstrap 직후 PC Editor 1개(대상 Worker 전용, 만료 7일 이내) 발급, Admin 회수, `handoff`·`drill`.
- [ ] 시험 시간은 PC 앞에 있고 스마트폰을 손에 둔 상태로 정한다. 창은 기본 2분.

## 7. 별도 승인 범위

1. 서명 정책 커밋(새 SHA)과 CI.
2. `bootstrap` 1회(false 생성·503·종료).
3. 토큰 이관과 `handoff`·`drill`.
4. `trial` 1회와 그 안의 activate 승인서 1회.

Worker·secret 삭제, 다른 소스 배포, D1·Pages·기존 Worker 변경, main 병합은 어느 승인에도 포함하지 않는다.
