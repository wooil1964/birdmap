# VWorld 전용 Worker — 1인 운영 경로(solo-local-v1) 실행·복구 절차

> **독립 승인자가 없는 1인 운영 절차다.** 운영자 한 사람(GitHub `wooil1964`)이 승인하고 실행한다.
> 이 경로는 `TRIAL_RUNBOOK.md`의 GitHub 보호 환경·독립 reviewer 경로(`vworld-worker-trial.yml`)를 **대체하거나 그 조건을 충족한 것으로 간주하지 않는다.** 기존 workflow의 독립 승인 검사는 변경하지 않았다.
> 2인 분리 효과는 없다. 운영자의 실수·재실행·실행 컴퓨터 장애를 줄이는 장치이며, 운영자 본인이나 모든 장비를 장악한 공격자를 막지 못한다.

기준일 2026-10-22. 이 문서·코드·CI 통과는 실제 생성·secret 공급·활성화·실키 호출의 승인이 아니다.

## 1. 구조

| 구성 | 역할 | 이 경로가 하지 않는 일 |
|---|---|---|
| GitHub | 고정 SHA의 회귀 CI(`publication-security-ci.yml`)와 Draft PR #40 head 확인 | 승인·credential 보관·원격 실행 |
| 운영 컴퓨터 A | `solo-cli.mjs bootstrap / handoff / trial` 실행 | GitHub Actions 안에서는 실행 거부(`SOLO_NOT_IN_CI`) |
| 별도 컴퓨터 B | 승인서 작성·FIDO 서명, 승인서 사본 보관, `recover`·`drill` | A의 파일·GitHub·VWorld 키·계정 전체 reader 불필요 |
| Cloudflare | 신규 `birdmap-vworld-tiles` 하나 | D1·Pages·기존 Worker 변경 없음 |

## 2. 승인서와 서명

- 형식: 정렬된 키의 한 줄 JSON(`canonical`). 서명 대상 바이트와 정확히 같아야 한다.
- 필드: `schema`, `mode=solo-local-v1`, `independentReviewer=false`, repository·PR 40·branch, **전체 40자리 `sha`**, `target`, `accountSha256`(계정 ID의 SHA-256, 원문 없음), `stage`(bootstrap|handoff|secrets|activate), `operationId`(`solo-<UUIDv4>`), `bootstrapOperationId`, `issuedAt`·`expiresAt`(UTC ms, 최대 30분), 1회용 `nonce`, `recovery=disable-only`.
- activate 추가: `parentOperationId`(secrets 작업), 절대 `windowStart`·`windowEnd`(최대 10분), `lastActivationAt`(창 종료 1분 전까지, `expiresAt`과 같음), `maxTiles=4`, `retries=0`.
- 서명: B에서 OpenSSH `ssh-keygen -Y sign -n birdmap-vworld-solo-approval-v1 -f <FIDO 키>`. 검증은 `solo.mjs`가 SSHSIG를 직접 해석한다(ssh-keygen에 의존하지 않음).
- **실행 정책: 공개키가 `sk-ssh-ed25519@openssh.com`(FIDO2 하드웨어 키)이고 서명에 사용자 존재(터치) 플래그가 있어야 한다.** 소프트웨어 ed25519 키는 시험 코드에서만 허용되며 CLI는 차단한다(`SOLO_SIGNER_NOT_HARDWARE`).
- 확인된 사실: OpenSSH `ssh-keygen -Y verify`는 터치 플래그가 없는 sk 서명도 통과시켰다(로컬 OpenSSH 10.3 관측). 터치 강제는 이 검증기에만 있다.
- 서명 공개키는 검토 소스의 `vworld-tiles/trial/solo-signer.pub`에 **커밋으로 고정**한다. 현재 파일이 없으므로 모든 solo 명령은 `SOLO_SIGNER_NOT_REGISTERED`로 차단된다. 키 등록은 새 SHA·전체 CI·검토가 필요한 별도 승인 단계다.
- 승인 문구 입력은 인증이 아니다. 이 경로는 문구를 받지 않는다.

## 3. 명령

모든 credential은 운영자의 비밀 관리 도구가 **해당 프로세스 환경에만** 주입한다. 명령행·`.env`·셸 기록·파일에 넣지 않는다(명령행에 값이 보이면 `SOLO_CREDENTIAL_IN_ARGV`). `SOLO_STATE_DIR`은 저장소 밖 경로다.

```text
# B: 승인서 작성(서명 전 내용 확인) → FIDO 키로 서명 → 파일과 .sig를 A로 복사, 원본은 B에 보관
node vworld-tiles/trial/solo-cli.mjs approve <stage> --sha <40자리> --out <path> [옵션]
node vworld-tiles/trial/solo-cli.mjs show <path>
```

| 명령(A) | 허용 credential | 거부되는 credential | 동작 |
|---|---|---|---|
| `bootstrap <승인서>` | 생성 Admin, 전체 Content Read | VWorld 키, Editor | CI·HEAD 확인 → 로컬 1회 기록 → 전체 namespace 감사 → 미존재 확인 → secret 없는 false 생성 → 503 |
| `handoff <승인서>` | 실행 Editor, (회수 확인용) 생성 token | VWorld 키, Read | 쓰기 0. Editor 활성·만료 존재, 생성 token 비활성, D1·Pages 읽기 거부, 다른 Worker 미노출, 대상 false·503 |
| `trial <secrets 승인서>` | Editor, Read, VWorld 키 | 생성 token | §4 |
| `recover <승인서>` (B) | B 전용 Editor | 키, 생성, Read | §5 |
| `drill <승인서>` (B) | B 전용 Editor | 키, 생성, Read | 쓰기 0. 대상 접근·소유·false·503 확인 |

활성화(enable)만 하는 명령은 없다.

## 4. 비밀 공급과 제한 시험(같은 프로세스)

1. secrets 승인서 검증(서명·SHA·계정·유효시간) → 로컬 1회 기록 → 원격 이력이 승인된 bootstrap뿐인지 확인.
2. false `consumed` 배포 후 VWORLD_API_KEY, 32바이트 난수 TRIAL_ACCESS_TOKEN을 stdin으로 공급. 매번 false·503 확인.
3. 표준입력으로 **별도 서명된 activate 승인서 경로**를 기다린다. secrets 승인서 만료까지 오지 않으면 false 복구 후 종료.
4. activate 검증: 같은 secrets/bootstrap 작업에 묶임, 로컬 1회 기록, **PR head·CI 재확인**, 전체 namespace 재감사.
5. 승인서의 절대 창으로만 활성화한다. 시작 전·`lastActivationAt` 이후면 거절한다. 늦어도 창을 새로 만들지 않는다.
6. 토큰 없는 403 → 4타일 순차, 재시도 0, 첫 실패 중단 → 성공·실패 모두 같은 SHA false 재배포·503.

모든 비복구 쓰기 직전 검사: UTC와 단조시계 차이 2초 초과(`SOLO_CLOCK_JUMP`), 승인 만료, **원격 이력 fence**(복구 `closed` 기록·다른 작업 기록이 있으면 중단), 같은 작업의 기존 `enabled` 기록(`SOLO_ALREADY_ACTIVATED`).

토큰은 이 프로세스 메모리에만 있다. 재시작하면 토큰이 없고 원격 이력은 이미 소비 상태라 과거 승인으로 재개·활성화할 수 없다.

**4회는 승인된 단일 클라이언트의 요청 예산이며 서버 전역 상한이 아니다.**

## 5. B의 외부 비상 복구

`recover`는 B가 보관한 서명 승인서(만료 무시, 서명·SHA·계정은 검사)와 원격 상태만으로 동작한다.

1. 대상 404 → `absent-confirmed`(생성하지 않음). 그 밖의 읽기 실패 → 실패 보고.
2. 같은 SHA·소유 확인 후 false `closed` 재배포 → 503 확인. 이 기록이 A의 이후 쓰기를 막는 fence다.
3. TRIAL_ACCESS_TOKEN이 있으면 버리는 난수로 덮어쓴다. A의 지연된 활성화가 나중에 도착해도 A의 토큰은 쓸 수 없다.
4. 감시: 재확인 3회. 재활성화가 보이면 다시 false(최대 2회)·`incident:true`. 초과 시 `SOLO_RECOVERY_UNCONFIRMED_REVOKE_EXECUTOR_TOKEN`.
5. 결과의 `executorQuiescence:"unverified"`: 503 확인이 A의 정지를 증명하지 않는다. **A 실행 token을 운영자가 Cloudflare에서 폐기해야 takeover 완료다.** 이 폐기는 자동화하지 않았다.

로컬 파일 잠금이나 fence만으로 분산 실행 충돌을 해결했다고 주장하지 않는다. Cloudflare 배포에는 compare-and-swap이 없으므로 쓰기 직전 검사와 실제 반영 사이의 경쟁은 남는다. 남는 위험은 ① 승인된 절대 창이 끝나면 Worker가 스스로 503, ② 토큰 무력화, ③ B 감시, ④ token 폐기로 줄인다.

## 6. 장애 상황별 시험 결과(합성)

| 상황 | 결과 | 근거 |
|---|---|---|
| A 프로세스 강제 종료(활성 상태로 남음) | B가 false·503·토큰 무력화, A 파일·GitHub·키·reader 없음 | 합성 |
| 로컬 승인·상태 파일 손실 | 원격 이력으로 bootstrap·secrets 재사용 거절 | 합성 |
| 네트워크 중단 | A의 자체 복구 실패를 성공으로 보고하지 않음, B가 이후 복구 | 합성 |
| Cloudflare 응답 지연 | false·503 확인 전 성공 아님 | 합성 |
| 중복 작업(같은 승인서, 다른 ledger) | 이 실행에서 upstream 200 ≤ 4, 최종 false. **원자적 배제 아님** | 합성 |
| 이전 작업의 지연 응답 | B 복구 뒤 도착한 활성화는 무력화된 토큰 때문에 사용 불가, false 복귀 | 합성 |
| 외부 복구와 시험 동시 실행 | A가 fence로 활성화 전 중단 | 합성 |
| 인증 만료 | 복구 실패로 보고, 쓰기 0 | 합성 |
| 복구 배포 후 503 실패 | 복구 완료로 보고하지 않음 | 합성 |

모두 `.github/scripts/test_vworld_solo.mjs`의 가짜 Cloudflare·Wrangler로 검증했다. **실제 별도 컴퓨터, 실제 FIDO 키, 실제 Cloudflare 응답·권한·지연은 검증하지 않았다.**

## 7. 실제 비활성 bootstrap 승인 전 운영자 준비

- [ ] FIDO2 보안키 준비, B에서 `ssh-keygen -t ed25519-sk` 키 생성(가능하면 `-O verify-required`), 공개키를 `solo-signer.pub`로 커밋 → 새 SHA·전체 CI 확인(별도 승인).
- [ ] B: 같은 SHA clean checkout, Node 24.18.0, `npm ci --ignore-scripts`로 Wrangler 4.151.3, `drill` 실행 가능 확인.
- [ ] A/B 시계 동기화(허용 차이 2분).
- [ ] P1 credential: 한시 Workers product Admin(생성), Workers Content Read-Only(감사). 정책을 직접 검토하고 fingerprint·scope 증언 환경값 준비. 값은 비밀 관리 도구로만 주입.
- [ ] P1 동안 B의 복구 수단: 대상이 없어 Editor를 미리 줄 수 없다. bootstrap은 false만 만들므로 사고 시 A의 자체 복구와 운영자의 대시보드 확인에 의존한다는 점을 승인 전에 확인.
- [ ] bootstrap 직후 A용·B용 대상 전용 Editor를 각각 만들고 생성 Admin을 회수, `handoff`(A)·`drill`(B)로 확인.

## 8. 최초 실배포에 필요한 별도 승인 범위

1. 서명키 등록 커밋(새 SHA)과 그 SHA의 전체 CI.
2. 위 SHA로 `bootstrap` 1회: 재감사 → 미존재 → secret 없는 false 생성 → 503 → 종료. 키 공급·활성화 없음.
3. 권한 이관(Editor 2개 발급, Admin 회수)과 `handoff`·`drill`.
4. 별도 승인으로 `trial` 1회(secrets 승인서) 및 그 안의 activate 승인서 1회.

Worker·secret 삭제, 다른 소스 배포, D1·Pages·기존 Worker 변경, main 병합은 어느 승인에도 포함하지 않는다.
