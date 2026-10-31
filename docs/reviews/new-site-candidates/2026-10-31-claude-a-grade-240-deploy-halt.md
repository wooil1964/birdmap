# 240곳 확장 — 운영 배포 사전 점검과 중단 보고 (5차)

- 작성: Claude Code (2026-10-31 19:4x KST)
- 작업 위치: 워크트리 `birdmap-a-grade-11`(브랜치 `local/a-grade-11-draft`, 기준 `origin/main` f8f80af). **커밋·Push·PR·배포 모두 하지 않음**
- 판정: **배포 중단(사전 조건 미충족)**. 운영 D1에서 ID 247을 SELECT로 확인하지 못했다. 원인은 Wrangler 로컬 OAuth 접근 토큰 만료다. 승인된 순서에 따라 1단계(배포 전 확인)에서 멈췄고, 2단계(커밋 이후)는 시작하지 않았다

## 1. 배포 전 확인 결과

| 조건 | 결과 | 근거 |
|---|---|---|
| 전체 회귀검사·기반지도 장애 시험 | **통과** | 최종 240곳 초안에서 브라우저 CI 12단계 전부 통과(기반지도 장애 포함, 이번 차수 1회 실행) |
| main 기준 신규 실패 | **0건** | Python 13종·SEO·공유 `--check` 통과, Node 575건 중 542 통과·실패 8(main 기준선과 같은 목록), Worker 36/36 |
| 기존 229곳 ID·좌표·제보 이력 보존 | **통과** | main 대비 전 필드 동일, `index.html` 되돌림이 main과 바이트 동일, 제보 코드·D1 무변경 |
| 신규 11곳 ID·대표점·공유·OG | **통과** | 235~238, 240~245, 247. 공유 HTML 11개·OG 11개. 247 OG 한글 렌더 확인 |
| 239·246 제외, 삽교호 제외 | **통과** | 지도·Worker·공유·SQL 모두 없음. SQL·D1 하네스가 239·246 삽입 거부 |
| **운영 D1 247 충돌·참조 SELECT** | **미완료(BLOCKED)** | 저장소 읽기 전용 도구 1회 시도 → 401 Authentication error. 읽기·쓰기 0 |
| 운영 D1 229행·신규 대상 전체 중복 재확인 | **미완료(BLOCKED)** | 같은 원인. 이전 사용자 웹 콘솔 확인(235~246 충돌 0)은 247을 포함하지 않음 |
| main 최신 SHA·다른 작업자 변경 | **통과** | `origin/main` = f8f80af(초안 기준과 같음). 열린 PR 0건, 오늘 이후 다른 작업 브랜치 변경 없음 |

### 인증 상태

- 로컬 Wrangler 토큰의 `expiration_time`이 **2026-10-31 10:31:43 UTC**로 바뀌어 있었다. 그사이 갱신이 한 번 있었던 것으로 보인다
- 확인 시각 10:38 UTC 기준으로 이미 만료돼 401이다. 접근 토큰은 약 1시간 유효하다
- 지시에 따라 갱신·로그인을 대신 하지 않았다(우회 없음)

## 2. 사전 준비로 추가한 것 (로컬, 미커밋)

D1 등록 단계에 필요한 운영 CLI를 만들었다. 인증이 풀린 뒤 1시간 안에 배포를 끝낼 수 있도록 미리 준비한 것이다.

| 파일 | 내용 | 검증 |
|---|---|---|
| `docs/a-grade-sites-20261031/registry-ops.mjs` | 운영 D1 `plan`(읽기 전용) → `apply` → `rollback`. 수도권 CLI와 같은 구조로, 허용 ID 11개, 기존 229행 해시·generation 고정 | 로컬 Miniflare에서 plan OK → apply 240(239·246 없음) → 재적용 거부 → rollback 229, 기존 제보 변화 없음 |
| `docs/a-grade-sites-20261031/ops-local.mjs` | 위 CLI의 로컬 D1 검증 하네스 | CI에 연결 |
| `docs/reviews/new-site-candidates/2026-10-31-d1-console-check-247.sql` | 웹 Console용 SELECT 1문 | – |

쓰기는 저장소 도구의 운영 쓰기 가드(`PHASE2E_PRODUCTION_WRITE_APPROVED`)를 거친다.

## 3. 해제 조건과 재개 절차

**사용자 조치 (둘 중 하나)**

1. 저장소 폴더 터미널에서 `npx wrangler@4.149.0 whoami`를 실행해 토큰을 갱신하고 바로 알려 주세요. D1 등록(쓰기)도 같은 토큰을 쓰므로 배포에는 이 방법이 필요합니다.
2. Cloudflare 웹 Console에서 `2026-10-31-d1-console-check-247.sql`을 실행하고 결과를 알려 주세요. 기대값: total 229, active 229, site_247 0, new_range_rows 0, 247 참조 3종 0, mode NORMAL. 다만 이후 D1 등록에는 1번이 여전히 필요합니다.

**재개 순서 (승인 범위 그대로)**

1. D1 SELECT로 247·전체 대상 확인. 기대값과 다르면 중단
2. 로컬 변경 최종 검토 → 커밋 → Push → 검토용 PR
3. 필수 CI 통과 확인
4. Worker 현재 버전 ID 기록, `registry-ops plan`으로 D1 229행 스냅샷·generation 확보
5. 기상 Worker 사이트 목록 배포(240곳, 기존 바인딩·secret 보존)
6. `registry-ops apply`로 D1에 11행 원자 추가
7. PR 병합 → Pages 배포 → `build-share-pages.yml`(site_ids 235 236 237 238 240 241 242 243 244 245 247), 조석·기상 workflow 실행
8. 운영 PC·모바일 검증

토큰 유효시간은 약 1시간이다. CI 대기가 길어 D1 단계 전에 만료되면 다시 갱신을 요청하겠다.

## 4. 남은 위험

- **간헐 예외**: 브라우저 수동 점검 중 기존 함수 `syncSiteSpots`(고정 출현 지점 레이어 정리)에서 Leaflet 예외가 초안에서 2회 났다. 모두 새로 연 배경 탭에서 처음 로드한 직후였다
  - 같은 조건으로 main과 초안을 각각 3회 재현했지만 모두 정상이었다
  - CI 실제 Chrome 하네스(GPS 팝업 750건 등)는 모두 통과했다
  - 해당 코드는 이번 변경 범위 밖이다. 운영 배포 뒤 모니터링을 권장한다
- 247 대표점은 차로(대흥사길) 옆이다. 산책로 위의 점이 아니며, 매표소 정확 위치는 추정이다(보고서에 명시)
- 기준선 공통 실패 8건은 원인 미조사
- 최근 제보·제보자 통계·보호종 비공개는 모의 API로만 검증했다. 운영 검증은 배포 후에 한다

## 5. 복구 계획 (변경 없음)

- **배포 전 기록**: main SHA, Pages 배포 식별자, Worker 버전 ID, D1 229행 스냅샷 해시·generation(`registry-ops plan`)
- **문제 시**:
  1. Pages를 배포 전 SHA로 되돌린다
  2. 신규 ID를 참조하는 제보·체크리스트가 있으면 D1 삭제와 Worker 축소를 중단하고 보존한다
  3. 참조가 없을 때만 Worker 이전 버전 복구 → `registry-ops rollback`(11행만, 조건 불일치 시 전체 거부)

## 6. 산출물

- diff: `2026-10-31-a-grade-240-local-draft-r4.diff`, `...-r4-data.diff`(이번 CLI 추가 포함 최종본)
- 시험 로그: 작업 폴더(scratchpad)의 `browser_draft/`, `node_draft_r4.txt`
