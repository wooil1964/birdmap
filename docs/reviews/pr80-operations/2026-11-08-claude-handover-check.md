# PR #80 운영 배포 후 Claude Code 인계 점검 (2026-11-08 15:0x KST, 읽기 전용)

> 범위: GitHub·Cloudflare·D1·운영 사이트 **읽기 전용** 점검. 코드·D1·Worker·Pages·설정 변경 없음.
> 비밀키 값과 비공개 위치 좌표는 이 문서에 넣지 않았다.

## 1. Git

| 항목 | 확인 결과 |
|---|---|
| main HEAD | `8597868` (기상 자동 갱신). 바로 앞이 `d774e26` = PR #80 merge commit |
| PR #80 | 병합 2026-11-08 05:51:55Z, head `7fefd00`, 8커밋·48파일. Claude 통합 브랜치 `e9ffcf1` 위에 Codex 3커밋(`488bf93` 공개 개체수·공식 국명 읽기 정규화, `47f2a8d` 미확인 종명 검토 표시, `7fefd00` 문서) |
| PR #77·#78 | 병합(#78 경유) / PR #79 닫힘(미병합, #80에 흡수) |
| Claude 작업 폴더 | scratchpad worktree `ap`(e9ffcf1)·`admin`(f112b5f)·`pr77`(ebec12a)·`main`(분리 HEAD) — 미커밋 변경 없음 |
| Codex 작업 폴더 | `Documents/Codex/2026-11-08/claude-code-wooil1964-birdmap-1-claude/work/birdmap` (7fefd00) — 미커밋 변경 없음(.ci-results·.wrangler만) |
| 사용자 기본 작업 폴더 | `Documents/GitHub/birdmap`는 예전 브랜치 `feat/recent-reports-minimize-sanimyeon`(8bd2d81) + 미추적 파일 24개(과거 보고서·diff). 이번에 건드리지 않음. 이후 작업은 main 기준 새 worktree에서 시작 권장 |
| 원격 잔여 브랜치 | `claude/admin-pending-ui-20261108`, `claude/pending-private-verify-20261108`, `codex/public-counts-legacy-species-20261108`, `fix/pending-report-coordinates-20261108` — 모두 main에 포함됨. 정리 후보(삭제는 승인 후) |

## 2. Worker (현재 배포)

| Worker | 100% | 0% 대기 | 비고 |
|---|---|---|---|
| 공개 `birdmap-reports` | `227a6942`(pr80-7fefd-public-open) | `6a805ded`(pr80-7fefd-public-closed, `REPORTS_PUBLIC_READS_CLOSED=true`만 다름) | 05:57:36Z 공개 읽기 재개 |
| 관리자 `birdmap-reports-admin` | `8a8f1668`(pr80-7fefd-admin) | — | 05:50:09Z |

설정 대조(평문 변수·바인딩 이름만):
- `REPORTS_AUTO_PUBLIC=0`, `REPORTS_UNVERIFIED_READS=0` — 공개 정상판·차단판·관리자 모두 **꺼짐**. `REPORTS_AUTO_PUBLIC_DAILY_MAX=50`
- release·peer 계약 일치: public `public-phase2e-1` ↔ admin `admin-phase2e-1`. schema `phase2a-0001`, activation `phase2e-cutover-1`, write mode `CANONICAL_DUAL_WRITE`, D1 `b48201cc…` 공통, 호환일 2026-07-03
- 비밀(이름만): public 4개, admin 1개 + Access 설정
- 참고: 관리자 Worker에는 예전 변수 `REPORTS_PENDING_PUBLIC=1`이 남아 있다. 코드가 대기 수동 공개를 거절하고(PENDING_PUBLICATION_DISABLED) 공개 Worker는 이 값을 읽지 않아 영향은 없다(정리 후보)

## 3. Pages

- `d774e26`, `8597868` 모두 "pages build and deployment" 성공
- 운영 `index.html`이 `origin/main`과 바이트 단위로 같음. projection `nonbreeding-location-v2-autopublic-v1`

## 4. 자료 검증

| 항목 | 현재 | Codex 배포 기준 | 판정 |
|---|---|---|---|
| 승인 / 반려 / 대기 | 133 / 22 / 0 | 133 / – / – | 같음 |
| 승인 개체수 합(`bird_count`) | 2,263 | 2,263 | 같음 |
| 공개 마커 / 위치 가림 | 131 / 4 | 131 / 4 | 같음 |
| 공개 좌표 집합(id·좌표·가림) | PR #78 직전(01:27Z) 스냅샷과 **완전 동일** | 동일 | 같음 |
| 업무 테이블 | 18 (`d1_migrations` 포함, `_cf_KV`·`sqlite_sequence` 제외) | 18 | 같음 |
| 종명 집계 | 118개 = 공식 99 + 미확인 원문 19(제보 21건) — main 코드로 재계산 | 118/99/19/21 | 같음 |
| 자동 공개 기록 / 구조화 종별 행 | 0 / 0 | — | 배포 후 신규 제보 없음(마지막 접수 2026-11-07 11:46Z) |
| system_state | NORMAL | — | |

모든 D1 조회는 SELECT만 실행했고 changes 0이었다.

## 5. 공개 API·화면

- 공개 권한: 계약 없는 대기 요청 400, 외부 Origin 403, 상태 조회 미존재 404, capabilities 200(maintenance false)
- `/reports/pending` 0건, 좌표 없음. 검색 '매' 15건(대상 15, PR #78 전과 같은 서명)
- 최근 탐조지 응답 서명은 PR #78 전과 다르다. 원인은 Codex의 공식 국명 읽기 정규화(`고니3`→`고니` 같은 표시 분리)이며, DB 원문은 그대로다
- 사이트(내장 브라우저, PC 1280): 승인 마커 131, 대기 마커 0, 검색 색인 131, 가림 4. 카카오맵·T맵 주소는 공개 좌표와 같음. 상세창에 종별 개체수 표시 확인("고니 3개체 1종 · 입력된 개체수 3개체")
- 미확인: 실기기 GPS·앱 호출, 운영 관리자 화면(Access 로그인 필요)

## 6. 미반영 문서·작업

- **PR #80 운영 배포 기록이 저장소에 없다.** Worker 버전 `227a6942`/`6a805ded`/`8a8f1668`, 공개 읽기 차단→재개 순서, 배포 후 검증 결과는 Codex 폴더(`outputs/인계-보고서.md`, `work/deployment80/`)에만 있다. 저장소의 `2026-11-08-codex-final.md`와 `-pr-readiness.md`는 배포 전 문서다.
- 사용자 기본 작업 폴더의 `docs/reviews/report-autopublish-design/` 미추적 사본 3개는 main 파일과 같아 정리해도 된다(이번에는 그대로 둠).

## 7. 남은 결함·위험

1. **복구 기준이 바뀌었다.** 현재 공개 Worker는 `227a6942`, 차단판은 `6a805ded`이다. PR #78 판 `ce1a9af3`로 Worker만 되돌리면 projection이 Pages와 달라져 승인 마커까지 닫힌다(누출은 없음). Worker를 되돌리려면 Pages도 함께 되돌려야 한다. `b81169aa` 이하는 계속 금지.
2. **자동 공개 하루 한도의 동시성.** 판정 시점의 COUNT 조회라 동시 접수 시 1~2건 넘을 수 있다(코드에 표시됨). 스위치가 꺼져 있는 동안은 영향이 없다.
3. **시범 18종·보호종 목록 미확정.** 보호종 목록은 잠정본이다. 안전성은 허용 목록이 보장한다.
4. **실사용 미검증.** 휴대폰 GPS, 카카오맵·T맵 앱 실행, 운영 관리자 화면, 배포 후 첫 실제 제보의 전 과정.
5. 관리자 Worker의 예전 변수 `REPORTS_PENDING_PUBLIC=1`(영향 없음).

## 8. 향후 과제 우선순위(제안)

| 순위 | 과제 | 이유 |
|---|---|---|
| 1 | 첫 실제 신규 제보 확인 절차 | 운영 D1에 시험 자료를 넣지 않고 새 구조(종별 sightings·관리자 표시)를 처음 검증하는 기회. 접수 직후 D1 읽기(reports·sightings·reviews), 관리자 화면, 승인 후 지도·검색·통계를 순서대로 확인하는 점검표 |
| 2 | PR #80 배포 기록 저장소 반영 | 다음 복구가 정확한 버전을 기준으로 하도록 |
| 3 | 실기기 점검(GPS·카카오맵·T맵·관리자) | 로컬·내장 브라우저로 확인할 수 없는 부분 |
| 4 | 시범 18종·보호종 목록 검토(2025 한국조류목록 대조) | 자동 공개를 켜기 전 필수 |
| 5 | 미확인 원문 19개(21건) 관리자 검토 후보 | 읽기 전용 표시로만 관리, 임의 수정 금지 |
| 6 | 하루 한도 동시성 보강 | 같은 batch 안 조건부 assertion(초과 시 batch 실패 → 보류로 재판정). 자동 공개를 켜기 전에 반영 |
| 7 | 잔여 원격 브랜치·관리자 예전 변수 정리 | 위생 |

## 9. 후속 개발 준비

준비 완료. 기준은 main `8597868`(코드 기준 `d774e26`), 공개 `227a6942`, 차단판 `6a805ded`, 관리자 `8a8f1668`이다. 새 작업은 main에서 새 worktree·브랜치로 시작하고, 로컬 검증 → PR 1개 → CI 1회 → 승인 후 병합·배포 순서로 진행한다.
