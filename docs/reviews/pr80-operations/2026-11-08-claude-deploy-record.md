# PR #80 운영 배포 기록 (2026-11-08)

> 작성: Claude. 배포 실행은 Codex가 했다.
> 출처: Cloudflare 배포 이력(`wrangler deployments list`, 읽기 전용), GitHub API, Codex 배포 산출물 `Documents/Codex/2026-11-08/claude-code-wooil1964-birdmap-1-claude/work/deployment80/`(비밀값 제외)와 `outputs/PR80-최종-CI-보고서.md`, Claude 인계 점검(`2026-11-08-claude-handover-check.md`).
> 추정한 내용은 넣지 않았다. 확인되지 않은 항목은 "미확인"으로 표시했다.

## 1. 대상

| 항목 | 값 |
|---|---|
| PR | #80 "출현종 제보 통합 개편: 조건부 공개·관리자 검토·종별 개체수·기존 자료 보존" |
| PR head | `7fefd0059a8e705947a20c248a781abd6c3283d1` (8커밋, 48파일) |
| 병합 | `d774e2610a6a71ec3d52afc48c73565d40254562` (부모 `87594cd`·`7fefd00`), 2026-11-08 05:51:55Z |
| 병합 전 CI | Publication security regression run `42449750801` 성공(gps-browser·regression 모두) |
| 마이그레이션 | 없음 |

## 2. 실제 순서 (UTC, Cloudflare 이력과 GitHub 기준)

| 시각 | 동작 | 근거 |
|---|---|---|
| 05:48:29 | 공개 Worker 버전 업로드 `6a805ded`(tag `pr80-7fefd-public-closed`, 공개 읽기 차단판) | 버전 메타데이터 |
| 05:48:32 | 공개 Worker 버전 업로드 `227a6942`(tag `pr80-7fefd-public-open`) | 버전 메타데이터 |
| 05:48:34 | 관리자 Worker 버전 업로드 `8a8f1668`(tag `pr80-7fefd-admin`) | 버전 메타데이터 |
| **05:49:36** | 공개 Worker **`6a805ded` 100%** — 공개 읽기 차단, 두 스위치 OFF, D1 쓰기 없음 | 배포 이력 메시지 |
| 05:50:09 | 관리자 Worker `8a8f1668` 100% (이전: `a7723404`, 2026-10-13) | 배포 이력 |
| 05:51:45 | 병합 직전 확인: head `7fefd00`, CI 성공, mergeable clean | Codex `premerge.json` |
| 05:51:55 | main 병합 `d774e26` | GitHub API |
| 05:52:41 | Pages 빌드·배포 성공(`d774e26`) | Actions "pages build and deployment" |
| **05:57:36** | 공개 Worker **`227a6942` 100%**, `6a805ded` 0% 대기 — 공개 읽기 재개 | 배포 이력·`deploy-public-open.log` |
| 05:58:04 | Codex 최종 화면 점검(1440·375px) | `browser-final.json` |
| 05:59:00 | Pages 재배포 성공(`8597868`, 기상 자동 갱신 커밋) | Actions |

공개 읽기 차단 시간은 05:49:36부터 05:57:36까지 약 8분이다. 그동안 접수(POST)와 상태 조회만 열려 있었다(차단판 설계).

차단판 전환 직전의 공개 Worker는 `ce1a9af3`(PR #78판) 100%였다. 배포 이력에서 01:29:14 배포 다음 기록이 05:49:36이다. 05:49:36 배포에 0% 쪽 버전이 있었는지는 이력 요약에 나오지 않아 **미확인**이다.

## 3. 운영 설정 (05:57 이후, 평문 변수만)

| 항목 | 공개 `227a6942` | 차단판 `6a805ded` | 관리자 `8a8f1668` |
|---|---|---|---|
| `REPORTS_AUTO_PUBLIC` | 0 | 0 | 0 |
| `REPORTS_UNVERIFIED_READS` | 0 | 0 | 0 |
| `REPORTS_PUBLIC_READS_CLOSED` | false | **true** | — |
| release / peer | public-phase2e-1 / admin-phase2e-1 | 같음 | admin-phase2e-1 / public-phase2e-1 |
| schema / activation | phase2a-0001 / phase2e-cutover-1 | 같음 | 같음 |
| D1 | `b48201cc…` | 같음 | 같음(+ EVENTS_DB) |

공개 정상판과 차단판의 차이는 `REPORTS_PUBLIC_READS_CLOSED` 하나뿐이다(Claude가 버전 바인딩을 비교해 확인).

## 4. 운영 검증 결과

| 항목 | 결과 | 근거 |
|---|---|---|
| 승인 / 반려 / 대기 | 133 / 22 / 0 | Claude D1 SELECT(15:0x KST), changes 0 |
| 승인 개체수 저장 합 | 2,263 | Codex `data-summary.json` 및 Claude D1 SELECT |
| 공개 마커 / 위치 가림 | 131 / 4 | Codex 화면 점검, Claude API 스냅샷 |
| 공개 좌표 집합 | 배포 전후 동일(`coordinateSetUnchanged`), PR #78 직전 스냅샷과도 동일 | Codex, Claude |
| D1 업무 테이블 18개 | 차단 상태와 배포 후 해시 18/18 동일 | Codex `db-hashes-closed/after.json` |
| 종명 집계 | 118 = 공식 99 + 미확인 원문 19(21건) | Codex, Claude 재계산 |
| 화면(1440·375) | 마커 131, 대기 0, 검색 색인 131, '매' 15건, 가림 4·가림 지점 길찾기 없음, 카카오맵·T맵 좌표 일치, 개체수 표시, GPS 모의 안내 | Codex `browser-final.json` |
| Pages | 운영 `index.html` = main 바이트 동일, projection `nonbreeding-location-v2-autopublic-v1` | Claude |

## 5. 공개 읽기 차단과 복구 절차 (이번에 쓴 방식)

1. 정상판·차단판·관리자 버전을 0% 트래픽으로 미리 업로드한다.
2. 공개 Worker를 **차단판 100%**로 전환한다. 공개 읽기는 503, 접수와 상태 조회는 유지된다.
3. 관리자 Worker를 새 버전으로 전환한다.
4. main 병합 → Pages 배포 성공을 확인한다.
5. 운영 자료(D1 해시, 좌표 집합)와 화면을 확인한다.
6. 공개 Worker를 **정상판 100% + 차단판 0%**로 전환해 공개 읽기를 재개한다.

PR #78의 "Worker 먼저, Pages 나중" 방식과 달리, 계약 전환 중 화면 불일치 시간을 "공개 읽기 차단" 상태로 덮었다. 그동안 승인 마커도 보이지 않는다.

## 6. 안전한 롤백 기준

| 상황 | 조치 |
|---|---|
| 공개 응답에 이상(노출 의심 포함) | `wrangler versions deploy 6a805ded-8cc3-40fe-8c17-0530a5a0b986@100%`로 즉시 차단(공개 읽기 503) 후 원인 조사 |
| 차단 해제 | `227a6942…@100%` 또는 고친 새 버전 |
| 코드 되돌리기 | **Worker와 Pages를 함께** 되돌린다. PR #78판 `ce1a9af3`는 projection `…pending-withheld-v1`이라 현재 Pages(`…autopublic-v1`)와 맞지 않는다. Worker만 되돌리면 승인 마커가 닫힌다(누출은 없음). 순서: 차단판 → main revert(Pages) → `ce1a9af3` → 확인 후 차단 해제 |
| 관리자 Worker | 이전 `a7723404`는 예전 화면(황색 마커 버튼)이다. 대기 수동 공개를 시도해도 현재 공개 Worker가 무시하므로 노출은 없다. 그래도 새 기능(반려 사유·표시 상태)이 없어지므로 필요할 때만 쓴다 |
| 금지 | `b81169aa` 이하(대기 좌표 노출), 인자 없는 `wrangler rollback`, `wrangler deploy` 직접 실행 |
| D1 | 이번 배포는 D1에 쓰지 않았으므로 데이터 되돌리기는 필요 없다 |

## 7. 남은 확인 사항

- 05:49:36 배포의 0% 쪽 버전(미확인)
- 실기기 GPS·카카오맵·T맵 앱 실행, 운영 관리자 화면(Access 로그인 필요)
- 배포 후 첫 실제 신규 제보의 전 과정(점검표: `2026-11-08-claude-first-report-checklist.md`)
