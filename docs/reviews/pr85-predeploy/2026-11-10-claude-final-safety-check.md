# PR #85 운영 반영 전 최종 안전점검 (읽기 전용)

- 작성: Claude Code, 2026-11-10 (점검 시각 약 02:40–02:50 UTC)
- 기준: PR #85 HEAD `9d8bc3b`, 최신 main `1fa87b0`
- 성격: **읽기 전용 점검**. 운영 D1 쓰기·migration·PR 병합/ready·Worker/Pages 배포·환경변수 변경 **0건**. 저장소 코드 수정 없음(이 보고서 파일만 추가, 미커밋).

## 1. 확인 완료 항목

### 1-1. PR·CI 대조 (확정)
| 항목 | 결과 |
|---|---|
| PR #85 상태 | open, **draft**, unmerged, mergeable=clean, head `9d8bc3b` |
| main 대비 | PR 기준 `884c4d5`. 이후 main은 `1fa87b0`(자동 생성 `tide_month.json` 1파일)만 추가 |
| CI | run 42741899044, `pull_request` 병합 ref `7764a5e`(부모 `1fa87b0`+`9d8bc3b`) → **regression success, gps-browser success**. regression job 18단계(로컬 D1, isolated-d1 포함) success |
| 변경 범위 | `reports-api/src` 6파일, `0007_reporter_identity.sql`, 테스트·문서·CI 2줄. `index.html`·탐조지·좌표·`wrangler.*.toml` **변경 없음** |
| 0007 SHA-256 | ~~`d589c4c4…`~~ **정정(같은 날 실행계획서 작성 중 발견)**: 이 값은 `git archive`의 CRLF 변환 사본 해시다. 저장소 원본(LF, blob `c532fe4b`)은 `7b7c4f9c767d79244cbb05484b20bcde9c3bdad237f239f49c32b025320a6bdc` |

격리 D1 23/23은 PR 문서·CI 단계 성공으로 확인했고, 결과 JSON 아티팩트 자체는 내려받지 않았다(미확인).

### 1-2. 운영 D1 읽기 전용 점검 (확정)
도구: 저장소 `reports-api/tools/d1-rest.mjs`의 `read()`(SELECT/PRAGMA만 허용, 매 응답 `rows_written=0`·`changed_db=false` 검사). 만료된 기존 Wrangler 로그인을 `wrangler whoami`로 갱신(refresh token)한 뒤 실행.

| 항목 | 결과 |
|---|---|
| 테이블 | 19개(기존 그대로). `reporter_identity_groups/events` **없음** |
| 트리거·인덱스 | 트리거 47, 인덱스 22. identity 트리거 **0** |
| writer fence | 12/12 존재, 누락 0 |
| publication guard | `publication_*` 8개 존재 |
| `public_publication_state` | 1행, epoch 32자 hex 정상, revision **295**, write_frozen **0** |
| `publication_writer_claim` | **0행**(잔류 없음) |
| 0007 필요 열 | reports에 id/reporter/received_at/status/name_public 모두 존재 |
| 제보 | 총 162 = approved **140** + rejected 22. id 중복·NULL 0 |
| 승인 140건 | name_public 100, 익명 35, 공개 이름 33종 |
| 정본 | raw_submissions 162, checklists 162, sightings 162, reviews 273. raw 없는 승인 0, orphan sightings 0, `PRAGMA foreign_key_check` 0건 |
| `d1_migrations` | 7건: 0001_core, 0002_system_state, 0003_captcha_redemptions, 0004b, 0005, 0005c, 0006 (0007 없음) |
| PR preflight 재실행 | PR HEAD 코드로 재실행, `docs/issue84/preflight.json`과 **checkedAt 외 완전 일치** (구조화 7 / 안전 과거 117 / 불확실 16, 고유종 120→118, 개체 33→47, 변경 5건, 공백 후보 1그룹, 확인 병합 0) |
| 쓰기 | 본 점검 D1 조회 19회 전부 `rows_written=0`, writes 0. 종료 시 재조회 revision 295·claim 0·approved 140 불변 |

### 1-3. Worker 현재 배포 (확정)
| | 공개 `birdmap-reports` | 관리자 `birdmap-reports-admin` |
|---|---|---|
| 현재 버전 | `d0bc7b88` 100% (11/08 14:12Z, tag name-field-490b533) | `2640e2eb` 100% (11/08 09:47Z, tag pr82-0126392-admin) |
| 직전(롤백 후보) | `b71dbdd6` | `d0252b73` |
| REPORTS_PUBLICATION_REQUIRED | true | true |
| REPORTS_CONFIRMED_IDENTITIES | **없음(OFF)** | **없음(OFF)** |
| REPORTS_AUTO_PUBLIC | **1** | 0 |
| REPORTS_UNVERIFIED_READS | **1** | 0 |
| REPORTS_PENDING_PUBLIC | 0 | 1 |
| D1 | REPORTS_DB=b48201cc… | REPORTS_DB=b48201cc…, EVENTS_DB |
| workers.dev / preview | on / off | on / off |

시크릿은 이름만 확인(값 미조회).

### 1-4. 닉네임 통합 기본 OFF·활성화 선행 조건 (확정)
- 코드: `identityEnabled = env.REPORTS_CONFIRMED_IDENTITIES === '1'`. 두 Worker 모두 변수 없음 → OFF. OFF에서는 구형 스키마(0007 없음)로 정상 동작(PR 격리 검증).
- ON 선행 조건: ① 운영 D1에 0007 정확 설치(테이블 2 + 트리거 8) ② 두 Worker `REPORTS_PUBLICATION_REQUIRED=true`(현재 충족) ③ 두 Worker에 `REPORTS_CONFIRMED_IDENTITIES=1`.
- ON인데 0007 없음 → 공개 읽기 전부 **503**(트리거 8개 검사). ON인데 publication-required 아님 → 503.

### 1-5. 미확인 종·닉네임 후보
불확실 16건, 공백 이름 후보 1그룹은 **건수만** 확인했다. 원문·이름·ID 조회, 수정, 연결은 하지 않았다.

## 2. 발견된 위험과 미확인 사항

**R1 (높음) 공개 Worker toml과 운영 변수 불일치.** `wrangler.public.toml`은 `REPORTS_AUTO_PUBLIC="0"`, `REPORTS_UNVERIFIED_READS="0"`이지만 운영은 둘 다 `1`(11/08 14:12 배포 메시지 "UNVERIFIED_READS=1 AUTO_PUBLIC=1"). toml 그대로 배포하면 **자동 공개와 미확인 대기 읽기가 꺼진다.** 배포 시 `--var REPORTS_AUTO_PUBLIC:1 --var REPORTS_UNVERIFIED_READS:1`로 현 상태를 유지할지, 끌지 관리자가 정해야 한다. 업로드 후 `versions view`로 vars를 운영과 대조한다. (관리자 Worker는 toml에 두 변수가 없고 운영은 `0` → 코드상 없음=OFF라 동일 동작.)

**R2 (높음) migration ledger와 저장소 폴더 불일치.** 운영 `d1_migrations` 이름(0001_core 등)은 `reports-api/migrations` 파일명과 다르다. 기본 폴더로 `wrangler d1 migrations apply --remote`를 실행하면 0002_pending_public·0003·0004_field_updates를 미적용으로 보고 재실행을 시도한다. 기존 관례대로 **0007 한 파일만 둔 전용 migrations_dir·전용 config**로 적용하고 SHA-256을 대조해야 한다(docs/issue28, p1-publication-final-audit 방식).

**R3 (중간) 종 분리는 기능 스위치 밖.** 공백 복수 종 분리는 `shared.js`에 무조건 적용된다. Worker 배포 즉시 공개·관리자 집계가 바뀐다: 해석 변경 5건, 고유종 표시 120→118, 확인 개체 33→47, 누적종수 바뀌는 제보자 4명. DB는 바뀌지 않으며 Worker 롤백으로 되돌릴 수 있다. 관리자가 이 변화를 인지·승인해야 한다.

**R4 (중간) 순서 위반 시 공개 장애.** 0007 전에 플래그를 켜면 공개 제보 읽기가 503이 된다. 반드시 0007 검증 → 플래그 ON.

**R5 (중간) 운영 migration 실행기 원자성 미검증.** PR은 D1.batch 원자성만 검증. Wrangler `--remote` 실행기의 부분 실패 동작은 미확인. 0007은 `IF NOT EXISTS`가 없어 재실행 시 실패(안전한 실패). 부분 설치되더라도 OFF에서는 새 테이블을 쓰지 않고, ON 시도 시 트리거 수 검사로 503 → 플래그를 켜지 않으면 서비스 영향 없음.

**R6 (중간) PITR.** 운영 D1 Time Travel bookmark GET 성공(`0000122b-…`) → 기능 사용 가능 확인. 다만 계정 요금제별 보존 기간(Cloudflare 문서상 유료 30일/무료 7일)은 **미확인**. 복원은 DB 전체 덮어쓰기라 bookmark 이후 들어온 제보·심사·revision이 함께 사라진다(publication revision 역행). `wrangler d1 export --remote`는 실행 중 DB 요청을 막는다(Cloudflare 문서 기준, 이번에 실행 안 함). 따라서 PITR은 데이터 손상 시 최후 수단이고 0007 문제의 1차 복구는 플래그 OFF·그룹 해제다.

**미확인**: 원격 스테이징 D1, 실제 Access/Turnstile 경유 HTTP 전체, 배포 롤아웃 중 두 Worker 버전 차이(OFF 상태에선 종 분리 해석만 잠시 다를 수 있음), 실제 휴대폰, 격리 결과 JSON 원본.

## 3. 운영 적용 가능 여부

**조건부 가능.** 운영 D1은 0007 적용 선행 조건(필수 열, publication state 정상, freeze 0, claim 0, writer fence 12/12, FK 0, 0007 객체 부재)을 모두 충족한다. 코드·CI·preflight 수치도 일치한다. 단, R1(배포 변수)과 R2(migration 적용 방식)를 해결한 절차로만 진행해야 하며, R3 집계 변화에 대한 관리자 승인이 필요하다.

## 4. 단계별 배포·복구 계획 (권장 순서)

| 단계 | 작업 | 확인 | 복구 |
|---|---|---|---|
| 0 | 관리자 승인 | R1 결정(자동 공개 유지 여부), R3 집계 변화 승인 | — |
| 1 | PR ready → main 병합 | main CI 성공. 프런트 변경 없음 | revert PR |
| 2 | 사전 읽기 점검 | 본 보고서 1-2 항목 재조회(claim 0, frozen 0, 0007 객체 0, revision 기록) + `wrangler d1 time-travel info`로 bookmark 기록 | — |
| 3 | 두 Worker 배포(플래그 OFF) | `versions upload` → vars를 현 운영과 대조(R1) → `versions deploy @100%`. 공개 지도·검색·회원 통계·관리자 통계 확인, 수치가 preflight 예상치와 일치 | 공개 `d0bc7b88`, 관리자 `2640e2eb`로 `versions deploy` (인자 없는 rollback 금지) |
| 4 | 관찰 | 오류율·D1 오류, 공개 응답 정상 | 3단계 롤백 |
| 5 | 0007 운영 적용: 전용 migrations_dir에 0007만, SHA-256 `d589c4c4…` 대조, Wrangler 4.149.0 `d1 migrations apply --remote -c <전용 config>` | 적용 후: 새 테이블 2·트리거 8, 기존 47 트리거 해시 불변, ledger +1, revision 불변, FK 0, claim 0 | 부분/실패: DROP·임의 수정 금지, 플래그 OFF 유지(서비스 영향 없음), 기록 대조 후 별도 승인으로 처리. 데이터 손상 시에만 승인 후 bookmark PITR |
| 6 | 플래그 ON(그룹 0개): 두 Worker에 `REPORTS_CONFIRMED_IDENTITIES=1`(나머지 vars 유지) 새 버전 배포 | 공개 읽기 503 없음, 집계가 OFF 때와 동일(그룹 0개) | 직전 버전으로 `versions deploy`(OFF 복귀) |
| 7 | 동일인 확인: 관리자가 본인 확인 후 `POST /admin/api/reporter-identities` 1건씩 | revision +1, 공개 이름·통계 | `revoke` |

## 5. 관리자의 별도 승인이 필요한 작업
1. PR #85 ready 전환과 main 병합
2. R1: 공개 Worker 배포 시 `REPORTS_AUTO_PUBLIC`/`REPORTS_UNVERIFIED_READS` 유지(1) 또는 변경
3. R3: 종 분리로 인한 공개 집계 변화(5건, 120→118, 33→47)
4. 공개·관리자 Worker 배포(각각)
5. 운영 D1 0007 적용(전용 migrations_dir 방식)
6. `REPORTS_CONFIRMED_IDENTITIES=1` 설정
7. 동일인 확인/해제 각 건(공백 후보 1그룹 포함, 자동 연결 금지)
8. PITR 복원·export·freeze/thaw (필요 시)

## 6. 남은 상태
- 운영 쓰기·배포·병합·환경변수 변경: 0
- 로컬: 임시 점검 스크립트·결과는 세션 scratchpad에만 저장. 이 보고서는 미커밋.
