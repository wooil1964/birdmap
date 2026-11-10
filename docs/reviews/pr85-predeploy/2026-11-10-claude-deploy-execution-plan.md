# PR #85 운영 배포 실행계획서

- 작성: Claude Code, 2026-11-10 (조회 시각 02:40–03:12 UTC)
- 대상: `wooil1964/birdmap` PR #85, 기능 코드 검증 HEAD `9d8bc3b050f4245bd5b07d5c4a6222f78756955c`
- 이 문서와 점검 도구는 그 위에 **문서만 추가하는 커밋**으로 PR 브랜치에 올렸다. 기능 코드·migration·설정은 `9d8bc3b`와 같다(`git diff --stat 9d8bc3b <PR head>`가 `docs/reviews/pr85-predeploy/`만 표시해야 함).
- 선행 문서: [2026-11-10-claude-final-safety-check.md](2026-11-10-claude-final-safety-check.md)
- 이번 단계에서 한 일: 문서 작성, 운영 **읽기 전용** 조회(D1 SELECT/PRAGMA, Cloudflare API GET, 공개 API GET), 로컬 전용 리허설
- 하지 않은 일: 운영 D1 쓰기·마이그레이션, 환경변수 변경, Worker·Pages 배포, PR ready 전환, main 병합, 닉네임 연결 — **모두 0건**

## 0. 표기

| 표시 | 뜻 |
|---|---|
| **[실행 확인]** | 이번에 운영에 실제 실행해 결과를 확인한 읽기 전용 명령 |
| **[로컬 확인]** | 운영 DDL 복제본(합성 데이터)에서 실제 Wrangler 4.149.0으로 실행해 확인 |
| **[문법 확인]** | `--help` 또는 `--dry-run`으로 옵션만 확인. 운영 실행 결과는 모름 |
| **[미검증]** | 실행·검증하지 않음. 실행 가능한 것으로 간주하지 말 것 |

## 1. 공통 준비 (Git Bash)

PowerShell 리디렉션은 인코딩·줄바꿈을 바꾸므로 **모든 명령은 Git Bash에서** 실행한다.

```bash
REPO="<저장소 경로>"            # 예: /c/Users/<사용자>/Documents/GitHub/birdmap
OPS="/c/birdmap-ops/pr85"            # 저장소 밖 작업 폴더
T="$REPO/docs/reviews/pr85-predeploy" # 점검 도구
export CLOUDFLARE_ACCOUNT_ID=1d697c22a32447b386b9fac6a3538597
export WRANGLER_SEND_METRICS=false
W="npx --yes wrangler@4.149.0"
```

- Wrangler 로그인은 `%APPDATA%\xdg.config\.wrangler\config\default.toml`을 쓴다(내용 출력 금지). 만료 시 `$W whoami`로 갱신한다. **[실행 확인]**
- `package.json`의 `deploy:*` 스크립트(`wrangler@latest deploy`)는 **쓰지 않는다**. 버전 고정과 무트래픽 업로드가 안 된다.

### 이번에 만든 읽기 전용 도구 (모두 [실행 확인])

| 도구 | 하는 일 | 쓰기 |
|---|---|---|
| `compare-worker-version.mjs <worker> <후보ID> [KEY=값…]` | 100% 운영 버전과 후보 버전의 vars·바인딩·시크릿 이름·호환일 비교. 지정한 KEY만 차이 허용. MATCH면 exit 0 | API GET |
| `public-smoke.mjs <out> [baseline]` | 지도 방문자와 같은 공개 GET으로 마커 수·위치 가림 수·좌표 지문·종 목록·개체수·기여자·금지 필드 기록/비교 | 공개 GET |
| `d1-readonly-check.mjs <out> [baseline]` | 스키마 해시, writer fence, 0007 객체, ledger, revision, freeze, claim, 건수, FK 비교 | SELECT/PRAGMA, rows_written=0 검사 |
| `expected-public-diff.mjs <repo> <A> <B>` | 운영 행 1회 SELECT → 두 코드의 공개 payload를 로컬 계산해 예상 변화 산출 | SELECT |
| `rehearse-0007-local.mjs` | 0007 전용 폴더 적용을 로컬 복제본에서 리허설 | 로컬 전용 |
| `reports-api/tools/freeze.mjs --status --target docs/long-term-db-phase2e/targets/production.json` | system_state·gate·reports digest | SELECT |

검증: 도구 두 번 연속 실행 시 모든 값 SAME, D1 `rowsWrittenByReads=0`. `compare`에 없는 KEY를 기대값으로 주면 MISMATCH/exit 1.

## 2. 운영 설정 보존

### 2-1. 현재 운영값 vs 배포 예정값 (2026-11-10 03:05 UTC, [실행 확인])

공개 Worker `birdmap-reports` — 현재 `d0bc7b88-ed2b-4b19-b691-fb5f907d1f9f` 100% (source 490b533 = 현재 main의 `reports-api/src`와 동일)

| 변수 | 운영 | toml(PR #85) | 계획 2단계 | 계획 6단계 |
|---|---|---|---|---|
| REPORTS_AUTO_PUBLIC | **1** | **0** | `--var :1` → 1 | 1 |
| REPORTS_UNVERIFIED_READS | **1** | **0** | `--var :1` → 1 | 1 |
| REPORTS_CONFIRMED_IDENTITIES | 없음(OFF) | 없음 | 없음 | `--var :1` |
| REPORTS_PUBLICATION_REQUIRED | true | true | true | true |
| REPORTS_PENDING_PUBLIC | 0 | 0 | 0 | 0 |
| REPORTS_AUTO_PUBLIC_DAILY_MAX | 50 | 50 | 50 | 50 |
| REPORTS_PUBLIC_READS_CLOSED | false | false | false | false |
| WRITE_MODE / DUAL_WRITE / CONFIRMATION_REQUIRED | CANONICAL_DUAL_WRITE / true / true | 동일 | 동일 | 동일 |
| SCHEMA_VERSION / ACTIVATION_ID / RELEASE_ID / PEER_RELEASE_ID | phase2a-0001 / phase2e-cutover-1 / public-phase2e-1 / admin-phase2e-1 | 동일 | 동일 | 동일 |
| ENVIRONMENT / FIELD_NEWS_RETIRED / REMOTE_VERIFIED | production / true / true | 동일 | 동일 | 동일 |
| ADMIN_PAGE_URL, NOTIFY_EMAIL_FROM/TO | 설정됨 | toml에 있음 | 2단계 비교로 동일 확인 | 동일 |
| 시크릿 4개(REPORT_IP_SALT, REPORTS_GATE_TOKEN, RESEND_API_KEY, TURNSTILE_SECRET_KEY) | 이름만 확인 | — | 자동 승계(기존 절차) | 동일 |
| D1 / service | REPORTS_DB=b48201cc… / REPORTS_PEER→birdmap-reports-admin | 동일 | 동일 | 동일 |
| compatibility_date | 2026-07-03 | 2026-07-03 | 동일 | 동일 |

관리자 Worker `birdmap-reports-admin` — 현재 `2640e2eb-3fd1-4ea2-a937-7f2318daf14e` 100% (source 0126392; 현재 main과 `autopublic.js` 1곳 차이: PR #83의 미확인 대기 응답 이름 필드)

| 변수 | 운영 | toml | 계획 3단계 | 계획 6단계 |
|---|---|---|---|---|
| REPORTS_AUTO_PUBLIC | 0 | **없음** | `--var :0` → 0 | 0 |
| REPORTS_UNVERIFIED_READS | 0 | **없음** | `--var :0` → 0 | 0 |
| REPORTS_CONFIRMED_IDENTITIES | 없음 | 없음 | 없음 | `--var :1` |
| REPORTS_PENDING_PUBLIC | 1 | 1 | 1 | 1 |
| 나머지 REPORTS_*·ACCESS_*·ADMIN_EMAILS | — | 운영과 동일 | 동일 | 동일 |
| 시크릿 | REPORTS_GATE_TOKEN | — | 자동 승계 | 동일 |
| D1 / service | REPORTS_DB, EVENTS_DB / REPORTS_PEER→birdmap-reports | 동일 | 동일 | 동일 |

### 2-2. 확정한 배포 방법

1. `wrangler versions upload`는 `--keep-vars`가 없으면 **기존 vars를 지우고 toml 값으로 다시 쓴다**(4.149.0 help 문구). toml 그대로 올리면 공개 Worker의 자동 공개·미확인 대기 읽기가 꺼진다. **[문법 확인]**
2. 그러므로 `--var KEY:값`으로 운영값을 명시한다. `--dry-run`에서 두 변수가 CLI 값으로 덮어써짐(`(hidden)` 표시)과 나머지 vars·바인딩 목록을 확인했다. **[문법 확인·드라이런 실행]** 값 자체는 dry-run에 표시되지 않으므로 **업로드 후(트래픽 0%) `compare-worker-version.mjs`가 MATCH일 때만 deploy**한다.
3. 관리자 Worker는 toml에 두 변수가 없어 지워진다. 코드상 없음=OFF(`=== '1'`)라 동작은 같지만, 비교를 단순하게 하려고 `--var ...:0`으로 운영과 똑같이 유지한다.
4. toml 자체를 운영값으로 맞추는 것은 별도 PR 대상이다(이번 범위 밖).

### 2-3. 보호 정책 유지 근거

| 정책 | 근거 |
|---|---|
| 보호종 좌표 차단 | `isSensitiveReport`가 공백 복수 종도 다시 나눠 판정(강화). 운영 행 계산: 공개 마커 138, 위치 가림 4, **공개 좌표 전부 동일**(`publicCoordinatesIdentical=true`) [실행 확인] |
| 승인 전 공개 제한 | vars 동일(PENDING_PUBLIC 0, UNVERIFIED_READS 1, AUTO_PUBLIC 1 유지). 현재 공개 대기 마커 0 [실행 확인] |
| 개인정보 | 공개 응답 금지 필드(admin_note, ip_hash, dedupe_hash, 근거·관리자·그룹 필드) 0건 [실행 확인]. 확인 그룹 정보는 공개 DTO에 없음(PR CI·격리 23개) |
| **바뀌는 점** | 자동 공개 판정(`contentReasons`)도 공백 복수 종을 나눈다. 지금까지 `동박새3 찌르레기2`처럼 한 덩어리라 보류되던 입력이, 공식 국명으로 유일하게 나뉘고 다른 조건을 통과하면 **자동 공개 대상이 될 수 있다.** 번식 판정·보호종 검사는 나눈 종 기준으로 한다. 관리자 인지 필요 |

### 2-4. 배포 예정 버전 비교 절차 (확정)

모든 Worker 배포(2·3·6단계)는 아래 순서만 따른다. 비교는 Cloudflare API GET만 쓴다.

1. `versions upload … --var …`로 새 버전을 올린다. 트래픽은 0%이고 운영 영향이 없다.
2. `node "$T/compare-worker-version.mjs" <worker> <새 버전 ID> [의도한 변경 KEY=값 …]`
3. `RESULT MATCH`(exit 0)일 때만 `versions deploy <새 ID>@100%`. MISMATCH면 배포하지 않고, 올린 버전은 0%로 둔다.
4. 배포 후 같은 명령을 다시 실행한다(그때는 새 버전이 운영이므로 자기 자신과 MATCH여야 한다).

| 비교 항목 | 기준 | 비교 방법 |
|---|---|---|
| 환경변수 전체(plain_text) | 의도한 KEY만 다르고 나머지 값이 운영과 같아야 함. 없어진 변수도 DIFF | REPORTS_*·ENVIRONMENT·FIELD_*는 값 표시, 그 밖(ADMIN_PAGE_URL, NOTIFY_EMAIL_*, ACCESS_*, ADMIN_EMAILS)은 값 대신 같음/바뀜만 표시 |
| D1 바인딩 | `REPORTS_DB=b48201cc-0abd-4a64-bb61-9dd2a7813d21`(공개·관리자), `EVENTS_DB=0d308139-…`(관리자) | type:이름:DB id 목록이 같아야 함 |
| 서비스 바인딩 | 공개 `REPORTS_PEER→birdmap-reports-admin`, 관리자 `REPORTS_PEER→birdmap-reports` | type:이름:대상 서비스 목록이 같아야 함 |
| 그 밖의 바인딩 | 운영에 없는 종류가 생기면 DIFF | 같은 목록에 포함 |
| 시크릿 | 이름 목록이 같아야 함(공개 4개, 관리자 1개). 값은 요청·출력하지 않음 | `versions upload`로 만든 현재 운영 버전 `d0bc7b88`에서도 시크릿이 승계되어 같은 이름으로 보임을 확인 |
| 호환일·플래그 | `2026-07-03`, 플래그 없음 | 같아야 함 |
| workers.dev·preview | workers.dev 켜짐, preview URL 꺼짐 | 스크립트 수준 설정, 다르면 DIFF |

비교 도구 검증 [실행 확인, GET만]:

| 비교 | 결과 | 뜻 |
|---|---|---|
| 공개 운영 vs 자기 자신, 관리자 운영 vs 자기 자신 | MATCH, exit 0 | 정상 판정 |
| 공개 운영 vs 직전 `b71dbdd6` | MATCH | 설정이 같은 버전 |
| 공개 운영 vs `4303d49e` | MISMATCH: `REPORTS_AUTO_PUBLIC live=1 candidate=0` | toml 그대로 올린 경우와 같은 차이를 잡음 |
| 관리자 운영 vs 10월 `a7723404` | MISMATCH: AUTO_PUBLIC·UNVERIFIED_READS `(none)` | 변수가 사라진 경우를 잡음 |
| 운영 vs 자기 자신 + `REPORTS_CONFIRMED_IDENTITIES=1` 기대 | MISMATCH, exit 1 | 의도한 변경이 빠진 업로드를 잡음 |

## 3. 종 분리 통계 변경 검증

방법: 운영 승인 제보를 1회 SELECT로 읽고, 현재 운영 코드(main `reports-api/src`)와 PR #85 코드의 `speciesNamesOf`/`publicSightingsOf`/`publicPayload`로 각각 계산했다. **[실행 확인, rows_written=0]** main 코드 계산값이 실제 공개 API 응답(마커 138, 고유종 118, 개체 33)과 정확히 일치해 방법을 검증했다.

### 3-1. 변경 제보 5건

개인정보 보호를 위해 제보 ID(또는 그 해시)와 제보자 이름은 적지 않는다. 원문 종 문자열은 현재 공개 지도 응답에 그대로 노출되는 값이다(공개 GET으로 5개 모두 확인). 이름 비공개 제보는 어느 제보자의 것인지 표시하지 않는다. 관리자는 원문으로 관리자 화면을 검색해 대조한다.

| # | 이름 공개 | 원문(reports.species) | 양식 개체수 | 현재 해석 | PR #85 해석 | 종 항목 | 확인 개체수 | 공식 국명 |
|---|---|---|---|---|---|---|---|---|
| 1 | 공개(R1) | `혹부리오리2␣␣검은머리흰죽지1` | 없음 | 1개 문자열(미확인), 수량 없음 | 혹부리오리 2 / 검은머리흰죽지 1 | 1→2 | 0→3 | 2/2 일치 |
| 2 | 공개(R2) | `흰꼬리딱새1 울새1` | 없음 | 1개 문자열, 수량 없음 | 흰꼬리딱새 1 / 울새 1 | 1→2 | 0→2 | 2/2 일치 |
| 3 | 비공개(표시 안 함) | `촉새7마리 노랑턱멧새2` | 없음 | 1개 문자열, 수량 없음 | 촉새 7 / 노랑턱멧새 2 | 1→2 | 0→9 | 2/2 일치 |
| 4 | 공개(R3) | `흰배멧새 휘파람새` | 없음 | 1개 문자열 | 흰배멧새 / 휘파람새 (**미기록**) | 1→2 | 0→0 | 2/2 일치 |
| 5 | 공개(R4) | `쇠검은머리쑥새 흰눈썹울새 북방검은머리쑥새 스윈호오목눈이` | 10 | 1개 문자열 | 4종 모두 **미기록** | 1→4 | 0→0 | 4/4 일치 |

- 종 항목은 2+2+2+2+4 = **12개**이고 5건 사이에 겹치는 종이 없어 서로 다른 종명도 **12개**다. 12개 모두 PR #85의 공식 국명 목록(598종)에 있다(스크립트로 확인). 선행 채팅 요약의 "공식 국명 11개"는 집계 착오였고 문서에는 그 값을 쓰지 않았다.
- 합계: 확인 개체수 33 → **47 (+14 = 3+2+9)**. 보호종 판정: 5건 모두 전후 비민감.
- 5번의 양식 개체수 10은 종별로 나누지 않는다(미기록 유지). 4번도 0이나 1로 채우지 않는다.
- 원문·DB 값은 바뀌지 않는다(읽을 때만 해석). 미확인 16건과 공백 이름 후보 1그룹은 손대지 않는다.
- 나뉘지 않는 예: `붉은가슴발종다리2 촉새5`는 `붉은가슴발종다리`가 공식 국명 목록에 없어 **그대로 미확인으로 남는다**(오타로 보이지만 임의 보정하지 않음). `가창오리 군무`, `큰유리2 암 수`, `흰눈썹황금새2 암수`, `비둘기 조롱이 수컷`도 유일한 공식 국명 분해가 아니므로 그대로다.

### 3-2. 집계 전후

| 지표 | 범위 | 현재 | PR #85 | 변화 |
|---|---|---|---|---|
| 고유종 표시 키 | 승인 140건 전체(관리자·preflight 기준) | 120 | 118 | −5 덩어리 +3 신규 |
| 공식 국명 고유종 | 승인 140건 전체 | 101 | 104 | +3 |
| 고유종 표시 키 | **공개 지도 응답**(마커 138) | 118 | **116** | −2 |
| 확인 개체수 | 공개 지도 응답 | 33 | **47** | +14 |
| 마커 / 위치 가림 / 좌표 | 공개 | 138 / 4 / 지문 `b8c42637…` | 동일 | 없음 |
| 기여자 목록(이름·건수) | 공개 | 33명 | 동일 | 없음(건수 기준) |

사라지는 키 5개: 위 원문 5개. 새로 생기는 키 3개: `혹부리오리`, `검은머리흰죽지`, `흰꼬리딱새`(나머지 울새·촉새·노랑턱멧새·흰배멧새·휘파람새·쇠검은머리쑥새·흰눈썹울새·북방검은머리쑥새·스윈호오목눈이는 이미 다른 제보에 있음).

### 3-3. 누적종수 영향 제보자 4명 (공개 기준만)

공개 회원 통계는 이름 공개에 동의한 승인 제보만 센다. 이름 비공개 제보를 특정인과 연결하지 않도록 비공개분을 포함한 수치는 적지 않는다.

| 제보자 | 공개 누적종수 | 바뀐 키(이름 공개 제보 기준) |
|---|---|---|
| R1 | 23 → 24 | 덩어리 1 → 혹부리오리·검은머리흰죽지 |
| R2 | 7 → 8 | 덩어리 1 → 흰꼬리딱새·울새 |
| R3 | 2 → 3 | 덩어리 1 → 흰배멧새·휘파람새 |
| R4 | 5 → 6 | 덩어리 1 → 쇠검은머리쑥새·스윈호오목눈이(나머지 2종은 기존) |

관리자 화면(관리자 기준 통계)에는 이름 비공개 제보까지 반영된 다른 값이 보일 수 있다.

## 4. 운영 D1 0007 적용 계획

### 4-1. 현재 상태 [실행 확인]

- ledger(`d1_migrations`) 7건: `0001_core`, `0002_system_state`, `0003_captcha_redemptions`, `0004b_publication_writer_fence`, `0005_publication_security`, `0005c_publication_enable`, `0006_field_visibility`
- 저장소 `reports-api/migrations`의 `0002_pending_public`, `0003_site_history_index`, `0004_field_updates`는 ledger에 이름이 없다. 기본 폴더로 apply하면 이것들을 다시 실행하려 한다 → **금지**.
- 기존 객체 86개, 스키마 해시 `50eb758c60c9c4bfb9fce095a4be2ba5cce068d31b23f734fa0aad79589abf49`, writer fence 12/12, revision 295, write_frozen 0, claim 0, FK 위반 0, system_state NORMAL(generation 4), 0007 객체 0.

### 4-2. 파일과 SHA-256 (정정 포함)

| 항목 | 값 |
|---|---|
| Git blob | `c532fe4bac7ef6adbb15f73a2b8f8dc338083747` |
| **SHA-256 (저장소 원본, LF)** | **`7b7c4f9c767d79244cbb05484b20bcde9c3bdad237f239f49c32b025320a6bdc`** |
| 추출 명령 | `git cat-file blob <SHA>:reports-api/migrations/0007_reporter_identity.sql` **[실행 확인]** |

> 정정: 선행 보고서의 `d589c4c4…`는 `git archive`가 `core.autocrlf=true`로 CRLF 변환한 사본의 해시다. 운영 적용에는 LF 원본 `7b7c4f9c…`를 쓴다. `git archive`·PowerShell 리디렉션으로 만든 파일을 쓰지 않는다.

### 4-3. 로컬 리허설 결과 [로컬 확인]

운영 DDL 86개를 그대로 재현(로컬 기존 객체 해시가 운영 `50eb758c…`와 **일치**)하고 합성 제보 5건, 운영과 같은 ledger 이름 7건을 넣었다. 가짜 DB UUID, Cloudflare 인증 변수 제거.

| 시나리오 | 결과 |
|---|---|
| 전용 폴더 `migrations list` | 0007 하나만 표시 |
| `migrations apply` | exit 0, 새 객체 10개(테이블 2 + 트리거 8), 기존 객체 변경·삭제 0, 데이터 해시 동일, revision 295 유지, claim 0, ledger 8건(0007 추가), FK 0 |
| 재실행 | `No migrations to apply`, ledger 8 유지 |
| 설치 직후 claim 없는 그룹 INSERT | `publication_writer_required`로 거절 |
| 마지막 문장 이름 충돌 주입(부분 실패 유도) | exit 1, 새 객체 0개, ledger 7 유지, 데이터·revision 불변(**로컬은 전체 롤백**) |
| 적용 후 기대 해시 | 기존 객체 해시 `50eb758c…` 유지, 0007 객체 해시 **`4c7af4cf01d0e0872177ed51b4bcc18564e2ad62e92684917e595638fe2707ab`** |

**원격 `--remote` 실행기의 원자성·확인 프롬프트·자동 백업 동작은 미검증이다.** 로컬 결과를 원격에 그대로 가정하지 않는다.

### 4-4. 적용 중 쓰기 동결

필요 없다고 판단한다. 0007은 새 테이블 2개와 그 테이블의 트리거만 만들고 기존 테이블·트리거를 바꾸지 않는다(리허설로 확인). 플래그가 OFF인 동안 Worker는 새 객체를 읽지 않는다. 동결은 제보 접수까지 멈추고 해제에도 운영 쓰기가 필요하므로 위험이 더 크다. 관리자가 원하면 승인 아래 `freeze.mjs`를 쓴다 **[미검증]**.

### 4-5. PITR 북마크와 데이터 보존

- `$W d1 time-travel info birdmap-reports -c wrangler.public.toml --json` → 북마크 반환 **[실행 확인]**. 0007 직전에 다시 받아 `bookmark-before.json`에 저장한다.
- 북마크는 다른 쓰기(접수·Turnstile 기록 등)로 계속 바뀐다(이번 조회 중에도 `0000122b…`→`0000122f…`).
- 복원 명령 `$W d1 time-travel restore birdmap-reports --bookmark=<값>`은 **[문법 확인]**만 했다. help 문구상 보존 범위는 최근 30일이다. 실제 계정 요금제의 보존 기간은 **미확인**이다.
- 복원은 DB 전체를 덮어쓴다. 북마크 뒤의 제보·심사·revision이 사라지고, revision이 되돌아가 열려 있던 지도 화면은 `publication regressed`로 제보 표시를 막는다(`index.html` 검사). 따라서 0007 문제에는 쓰지 않는다(6장).

## 5. 단계별 실행 계획

각 단계 시작 직전에 **공통 사전 점검**을 실행하고 결과를 남긴다.

```bash
cd "$REPO/reports-api"
$W deployments list -c wrangler.public.toml --json | tail -20   # [실행 확인] 공개 = d0bc7b88… 100%?
$W deployments list -c wrangler.admin.toml  --json | tail -20   # [실행 확인] 관리자 = 2640e2eb… 100%?
cd "$REPO"
node "$T/d1-readonly-check.mjs" "$OPS/d1-<단계>.json"            # [실행 확인]
node "$T/public-smoke.mjs" "$OPS/smoke-<단계>.json"              # [실행 확인]
node reports-api/tools/freeze.mjs --status --target docs/long-term-db-phase2e/targets/production.json   # [실행 확인]
```

공통 NO-GO: 운영 버전이 위 ID와 다름 / write_frozen≠0 / claim≠0 / FK≠0 / 공개 응답 200 아님 / 금지 필드 발견 / 다른 AI가 같은 파일·운영 작업 중.

### 1단계 — PR ready 전환과 main 병합

| 구분 | 내용 |
|---|---|
| 사전 조건 | PR head = 이 문서 커밋 이후의 head이고 `git diff --stat 9d8bc3b <head>`가 `docs/reviews/pr85-predeploy/`만 표시, 그 head의 CI regression·gps-browser 성공, 관리자 승인. `git fetch origin && git log --oneline 1fa87b0..origin/main` 결과가 자동 생성 커밋(날씨·조석 JSON)뿐 |
| 실행(권장) | 관리자가 GitHub 웹에서 **Ready for review → Create a merge commit**. 병합 SHA를 `M`으로 기록 |
| 실행(대안) | REST `PUT /repos/wooil1964/birdmap/pulls/85/merge` 본문 `{"sha":"<확인한 PR head 전체 SHA>","merge_method":"merge"}` (ready 전환은 GraphQL `markPullRequestReadyForReview`) **[미검증]** |
| 성공 기준 | `git diff 9d8bc3b $M -- reports-api .github` 출력 없음, `git diff <병합 전 main> $M -- index.html` 출력 없음, GitHub Pages 빌드 성공 |
| 실패 시 | 병합 충돌·CI 실패: 중단, Codex에 보고. Pages 실패: 프런트 변경이 없으므로 원인 조사, 필요하면 GitHub "Revert". 병합만으로 Worker·D1은 바뀌지 않는다 |

### 2단계 — 공개 Worker 배포 (닉네임 통합 OFF)

| 구분 | 내용 |
|---|---|
| 사전 조건 | 1단계 GO, 공통 점검 통과, 공개 운영 = `d0bc7b88`, 기준 스냅샷 `smoke-pre.json`·`d1-pre.json` 저장, 관리자 승인(2-3의 자동 공개 범위 변화 포함) |
| 예상값 재계산 | 기준 이후 승인 제보가 바뀌었으면 `git archive 490b533 reports-api/src`와 `git archive $M reports-api/src`를 각각 풀고 `node "$T/expected-public-diff.mjs" "$REPO" <A> <B>`로 다시 계산 **[실행 확인]** |

```bash
rm -rf "$OPS/src" && mkdir -p "$OPS/src" && git -C "$REPO" archive "$M" reports-api | tar -x -C "$OPS/src"
cd "$OPS/src/reports-api"
$W versions upload -c wrangler.public.toml --dry-run --outdir "$OPS/dry-public" \
  --var REPORTS_AUTO_PUBLIC:1 --var REPORTS_UNVERIFIED_READS:1                       # [문법 확인·드라이런 실행]
$W versions upload -c wrangler.public.toml --tag "pr85-${M:0:7}" \
  --message "PR85 main $M; identity OFF; AUTO_PUBLIC=1 UNVERIFIED_READS=1 kept; rollback d0bc7b88" \
  --var REPORTS_AUTO_PUBLIC:1 --var REPORTS_UNVERIFIED_READS:1                       # [미검증] → 새 버전 P1 (트래픽 0%)
node "$T/compare-worker-version.mjs" birdmap-reports <P1>                             # [실행 확인] 반드시 RESULT MATCH
$W versions deploy <P1>@100% -c wrangler.public.toml --message "PR85 public, identity OFF" -y   # [미검증]
$W deployments list -c wrangler.public.toml --json | tail -12
node "$T/public-smoke.mjs" "$OPS/smoke-post-public.json" "$OPS/smoke-pre.json"
```

| GO | NO-GO → 조치 |
|---|---|
| compare MATCH | MISMATCH → **deploy하지 않음**(P1은 0%로 남아 무해), 원인 수정 후 다시 업로드 |
| 공개 GET 3종 200, revision 형식 정상 | 503·400 → 즉시 롤백 |
| removedSpecies = 3-1의 원문 5개, addedSpecies = 혹부리오리·검은머리흰죽지·흰꼬리딱새 | 다른 키 변화 → 롤백 후 분석 |
| distinctSpecies 118→116, knownIndividuals 33→47 | 다르면 롤백(그 사이 승인 변화는 재계산값과 비교) |
| spots·historyEntries·locationHidden·pendingSpots·coordHash·contributors 동일 | 하나라도 다르면 **즉시 롤백**(좌표·공개 범위 변화) |
| forbiddenKeysFound = [] | 발견 시 즉시 롤백 |

롤백(데이터 손실 없음): `$W versions deploy d0bc7b88-ed2b-4b19-b691-fb5f907d1f9f@100% -c wrangler.public.toml -y` **[미검증, 기존 운영 절차와 같은 형식]**. 인자 없는 `wrangler rollback` 금지. 새 코드가 그 사이 접수한 제보(`종 · 종` 형식으로 저장)는 이전 코드도 같은 종으로 읽는다(함수 수준 확인: `동박새3 찌르레기2 까치5` → 이전 코드 3종·3/2/5개체).

### 3단계 — 관리자 Worker 배포 (닉네임 통합 OFF)

| 구분 | 내용 |
|---|---|
| 사전 조건 | 2단계 GO, 관리자 운영 = `2640e2eb`, 승인 |

```bash
cd "$OPS/src/reports-api"
$W versions upload -c wrangler.admin.toml --tag "pr85-admin-${M:0:7}" \
  --message "PR85 main $M admin; identity OFF; AUTO_PUBLIC=0 UNVERIFIED_READS=0 kept; rollback 2640e2eb" \
  --var REPORTS_AUTO_PUBLIC:0 --var REPORTS_UNVERIFIED_READS:0                       # [미검증] → A1
node "$T/compare-worker-version.mjs" birdmap-reports-admin <A1>                       # RESULT MATCH
$W versions deploy <A1>@100% -c wrangler.admin.toml --message "PR85 admin, identity OFF" -y    # [미검증]
```

| GO | NO-GO → 조치 |
|---|---|
| compare MATCH, 배포 목록 A1 100% | MISMATCH → deploy하지 않음 |
| Access 로그인 후 관리자 화면·제보 목록·통계 정상 | 오류 → `$W versions deploy 2640e2eb-3fd1-4ea2-a937-7f2318daf14e@100% -c wrangler.admin.toml -y` **[미검증]** |
| `GET /admin/api/reporter-identities` 404 (OFF) | 200이면 설정 오류 → 롤백 |

참고: 이 배포에는 PR #83의 `autopublic.js` 변경(미확인 대기 응답의 이름 필드)도 함께 들어간다. 관리자 Worker는 `UNVERIFIED_READS=0`이라 그 경로를 쓰지 않는 것으로 본다(코드 판독, 추정).

### 4단계 — 공개 API·관리자 기능·종별 통계 검증

| 확인 | 방법 | 기준 |
|---|---|---|
| 공개 지도 | `public-smoke.mjs` 2단계 비교 + 실제 Chrome PC·모바일 지도 | 2단계 GO 기준 유지, 마커·팝업·검색 정상 |
| 종 검색 | 지도에서 `혹부리오리`·`흰꼬리딱새` 검색 | 해당 제보가 검색됨 |
| 회원 통계 | 공개 화면에서 R1–R4 누적종수 확인(관리자가 원문으로 대조) | 3-3 표의 공개 누적 값 |
| 관리자 | 종별 통계·제보자 목록·동명 상세 | 118키/104 공식 국명, 오류 없음 |
| D1 | `d1-readonly-check.mjs` 기준 비교 | 스키마 해시 SAME, claim 0, FK 0. revision·건수 변화는 실제 접수·심사로만 설명 가능 |
| 관찰 | 오류율·D1 오류(기존 GraphQL 지표) | 관리자가 정한 관찰 기간 동안 이상 없음 |

NO-GO → 해당 Worker를 2·3단계 롤백 명령으로 되돌린다.

### 5단계 — 운영 D1 0007 적용

| 구분 | 내용 |
|---|---|
| 사전 조건 | 4단계 GO, 두 Worker 플래그 OFF, `d1-readonly-check`: identityObjects [], ledger 정확히 4-1의 7개, existingSchemaHash `50eb758c…`, claim 0, frozen 0, FK 0, system_state NORMAL. 적용 중 관리자 승인·반려 작업 없음. 관리자 승인 |

```bash
rm -rf "$OPS/m0007" && mkdir -p "$OPS/m0007/migrations-0007" && cd "$OPS/m0007"
git -C "$REPO" cat-file blob "$M:reports-api/migrations/0007_reporter_identity.sql" > migrations-0007/0007_reporter_identity.sql   # [실행 확인]
sha256sum migrations-0007/0007_reporter_identity.sql      # 7b7c4f9c767d79244cbb05484b20bcde9c3bdad237f239f49c32b025320a6bdc 이어야 함
ls migrations-0007                                         # 파일 정확히 1개
cat > wrangler.migrate-0007.json <<'EOF'
{"name":"birdmap-migrate-0007","compatibility_date":"2026-07-03",
 "d1_databases":[{"binding":"REPORTS_DB","database_name":"birdmap-reports",
  "database_id":"b48201cc-0abd-4a64-bb61-9dd2a7813d21","migrations_dir":"migrations-0007"}]}
EOF
node "$T/d1-readonly-check.mjs" "$OPS/d1-pre-0007.json"
$W d1 time-travel info birdmap-reports -c wrangler.migrate-0007.json --json > bookmark-before.json   # [실행 확인(공개 toml로)]
$W d1 migrations list  birdmap-reports --remote -c wrangler.migrate-0007.json    # [로컬 확인, 원격 미검증] 0007만 나와야 함
$W d1 migrations apply birdmap-reports --remote -c wrangler.migrate-0007.json    # [로컬 확인, 원격 미검증]
node "$T/d1-readonly-check.mjs" "$OPS/d1-post-0007.json" "$OPS/d1-pre-0007.json"
node "$T/public-smoke.mjs" "$OPS/smoke-post-0007.json" "$OPS/smoke-post-public.json"
```

`migrations list --remote`도 Wrangler가 ledger 테이블을 준비하며 원격에 접근하므로 승인된 적용 시간 안에서만 실행한다.

| GO | NO-GO → 조치 |
|---|---|
| SHA 일치, 폴더에 파일 1개 | 불일치 → 중단 |
| list에 0007만 | 다른 파일 표시 → 중단(config 오류) |
| apply exit 0 | 아래 실패 처리 |
| existingSchemaHash SAME(`50eb758c…`), writerFence 12 | CHANGED → **중대**: 플래그 OFF 유지, 쓰기 동결 승인 요청, 6장 D1 복원 검토 |
| identityObjects 10개, identitySchemaHash `4c7af4cf…` | 개수·해시 불일치 → 플래그 켜지 않음, 보고 |
| ledger 추가 = `["0007_reporter_identity.sql"]` | 다른 이름 → 중단·보고 |
| claim 0, frozen 0, FK 0, identityGroups n=0 | 아니면 중단·보고 |
| 공개 스모크 직전과 동일 | 다르면 조사(플래그 OFF라 바뀌면 안 됨) |

실패 처리:

1. **깨끗한 실패**(exit≠0, identityObjects [], ledger 7): 로컬과 같은 전체 롤백. 서비스 영향 없음. 원인 분석 전 재시도 금지.
2. **부분 설치**(객체 1–9개 또는 ledger 불일치): 즉시 중단. 플래그는 계속 OFF(OFF에서는 새 객체를 읽지 않음, ON이면 트리거 수 검사로 503이 나므로 켜지 않음). DROP·임의 수정 금지. 로그·`d1-post-0007.json` 보존. 관리자 승인 후 선택지: (a) 그대로 둠, (b) **이번에 새로 생긴 빈 객체만** 승인된 SQL로 제거 후 재적용. 기존 자료에 영향이 없으므로 D1 전체 복원은 쓰지 않는다.
3. 원격 확인 프롬프트가 뜨면 내용을 읽고 `y`. 다른 동작(백업 안내 등)이 나오면 중단·기록 **[미확인]**.

### 6단계 — 두 Worker 닉네임 통합 활성화 (확인 그룹 0개 상태)

| 구분 | 내용 |
|---|---|
| 사전 조건 | 5단계 GO, identityGroups n=0, 관리자 승인 |

```bash
cd "$OPS/src/reports-api"
# 공개 먼저
$W versions upload -c wrangler.public.toml --tag "pr85-id-on-${M:0:7}" \
  --message "PR85 identity ON; AUTO_PUBLIC=1 UNVERIFIED_READS=1 kept; rollback <P1>" \
  --var REPORTS_AUTO_PUBLIC:1 --var REPORTS_UNVERIFIED_READS:1 --var REPORTS_CONFIRMED_IDENTITIES:1      # [미검증] → P2
node "$T/compare-worker-version.mjs" birdmap-reports <P2> REPORTS_CONFIRMED_IDENTITIES=1                   # MATCH
$W versions deploy <P2>@100% -c wrangler.public.toml --message "PR85 identity ON (0 groups)" -y            # [미검증]
node "$T/public-smoke.mjs" "$OPS/smoke-post-on.json" "$OPS/smoke-post-0007.json"
# 관리자
$W versions upload -c wrangler.admin.toml --tag "pr85-admin-id-on-${M:0:7}" \
  --message "PR85 admin identity ON; rollback <A1>" \
  --var REPORTS_AUTO_PUBLIC:0 --var REPORTS_UNVERIFIED_READS:0 --var REPORTS_CONFIRMED_IDENTITIES:1      # [미검증] → A2
node "$T/compare-worker-version.mjs" birdmap-reports-admin <A2> REPORTS_CONFIRMED_IDENTITIES=1
$W versions deploy <A2>@100% -c wrangler.admin.toml --message "PR85 admin identity ON (0 groups)" -y
```

| GO | NO-GO → 조치 |
|---|---|
| compare MATCH(차이는 CONFIRMED_IDENTITIES=1뿐) | 다른 차이 → deploy하지 않음 |
| 공개 스모크: 200, 모든 값 직전과 동일(그룹 0개라 결과 같아야 함) | 503 → 즉시 `versions deploy <P1>@100%`(OFF) |
| 관리자 `GET /admin/api/reporter-identities` → `ok:true, groups:[]` | 503·오류 → `versions deploy <A1>@100%` |
| D1: revision·스키마 SAME | 변화 시 조사 |

### 7단계 — 확인된 제보 ID 개별 연결

- **자동 연결 없음.** 이름 유사·공백 제거·IP로 묶지 않는다. 공백 이름 후보 1그룹도 관리자의 본인 확인 근거가 있을 때만.
- 1건(1그룹)씩: 관리자가 본인 확인 → 제보 ID 목록과 근거 기록 → Access 로그인된 관리자 화면에서 `POST /admin/api/reporter-identities` 본문 `{"action":"confirm","reportIds":[…],"confirmedSamePerson":true,"reason":"…"}`. 관리자 화면에 버튼이 없어 API 호출 방법(브라우저 개발자 도구의 같은 출처 fetch 등)은 **[미검증]**.
- 성공 기준: 응답 `ok:true, groupId`, GET 목록에 그룹·이벤트 1건, revision +1, 해당 이름의 공개 누적종수가 예상과 같음, 다른 이름 무변화.
- 실패·오연결: `{"action":"revoke","groupId":"…","reason":"…"}`. 이력은 남고 집계는 원래 이름 기준으로 돌아간다. 그룹은 수정·삭제할 수 없다.

## 6. 장애 복구 — 수단 구분

| 수단 | 쓰는 경우 | 새 제보 손실 | 명령 |
|---|---|---|---|
| Worker 버전 되돌리기 | 2·3·6단계 이상 | **없음** | `versions deploy <이전ID>@100% -y` [미검증, 기존 절차 형식] |
| 플래그 OFF | 닉네임 통합 문제 | 없음 | 6단계 이전 버전(P1/A1)으로 되돌리기 |
| 그룹 해제 | 잘못 연결 | 없음(이력 보존) | `revoke` API |
| 0007 객체 방치 | 0007 부분 설치 | 없음 | 플래그 OFF 유지 |
| **D1 전체 복원(PITR)** | 기존 자료·스키마가 실제로 손상됐을 때만 | **북마크 뒤 모든 쓰기 손실** | 아래 |

D1 전체 복원 절차(모두 관리자 별도 승인, 대부분 **[미검증]**):

1. 원인 단계의 Worker를 이전 버전으로 되돌리고 손상 범위를 `d1-readonly-check`·`freeze.mjs --status`로 기록.
2. 쓰기 동결: `PHASE2E_PRODUCTION_WRITE_APPROVED=<DB id> node reports-api/tools/freeze.mjs --freeze --target docs/long-term-db-phase2e/targets/production.json --reason "<사유>" --confirm FREEZE_WRITES` [미검증].
3. 북마크 이후 접수·심사 자료를 읽기 전용 SELECT로 **저장소 밖 보호 폴더**에 보관(개인정보 포함, 커밋 금지).
4. `$W d1 time-travel restore birdmap-reports --bookmark=<bookmark-before> -c <config>` [문법 확인]. 응답의 되돌리기용 북마크 기록.
5. 복원 후 점검, 3번 자료의 재반영(별도 설계·승인 필요, 현재 절차 없음), 동결 해제 `--unfreeze … --confirm UNFREEZE_WRITES` [미검증].
6. revision이 되돌아가므로 열린 지도 화면은 새로고침 전까지 제보를 표시하지 않을 수 있음을 공지.

## 7. 관리자가 승인해야 할 작업

1. 공개 Worker 자동 공개·미확인 대기 읽기 유지(`--var …:1`) 방식 확정
2. 종 분리에 따른 공개 집계 변화(3장)와 자동 공개 판정 범위 변화(2-3)
3. PR #85 ready 전환과 main 병합(1단계)
4. 공개 Worker 배포(2단계), 관리자 Worker 배포(3단계) — 각각
5. 4단계 관찰 기간과 GO 판단
6. 운영 D1 0007 적용(5단계)
7. 닉네임 통합 활성화(6단계, Worker별)
8. 동일인 연결·해제 각 건(7단계)
9. 비상 시: 쓰기 동결·해제, D1 전체 복원, 0007 부분 설치 정리

## 8. 미확인 사항

- `versions upload`·`versions deploy`의 실제 운영 실행(무트래픽 업로드 후 값 확인으로 보완)
- 원격 `d1 migrations list/apply --remote`의 원자성, 확인 프롬프트, 자동 백업 여부
- D1 Time Travel 실제 보존 기간(요금제), 복원 소요 시간
- GitHub API로 ready 전환·병합(웹 UI 권장)
- 관리자 identity API의 실제 호출 방법(화면 버튼 없음)
- 실제 Access·Turnstile 경유 전체 HTTP, 실제 휴대폰, 원격 스테이징
- 새 코드가 쓴 자료를 이전 코드가 읽는 호환성은 함수 수준만 확인(통합 시험 아님)
- 관리자 Worker에 함께 들어가는 PR #83 `autopublic.js` 변경의 영향(코드 판독상 미사용)

## 9. 이번 점검의 운영 영향

- D1 읽기만 수행: 매 응답 `rows_written=0`, `changed_db=false` 검사 통과. 마지막 확인 revision 295, claim 0, frozen 0, 승인 140/총 162.
- Cloudflare API는 GET만, 공개 API는 방문자와 같은 GET만 호출.
- Wrangler 명령은 `whoami`(로그인 갱신), `deployments list`, `d1 time-travel info`, `--help`, `--dry-run`, 그리고 가짜 UUID의 `--local` 리허설만 실행.
- 저장소: 이 문서, 선행 보고서, 점검 도구 5개를 PR #85 브랜치에 문서 커밋으로 추가. 기능 코드·설정·자동 생성 파일 변경 없음.
