# 승인 전 제보 좌표 비공개 — Codex 작업 인계·검증 보고 (2026-11-08, Claude)

## 1. 작업 목적

Codex가 사용량 소진으로 중단한 "승인 전 제보 정확좌표 노출 차단" 작업을 이어받아 남은 검증을 마친다. 새로 구현하지 않았다.

## 2. 인계 확인

| 항목 | 확인 결과 |
|---|---|
| Codex 브랜치 | `fix/pending-report-coordinates-20261108` (원격에 푸시됨) |
| 커밋 | `cf5679e` fix, `d6fd5cc` test (base `29e88cb` = 당시 main) |
| Codex 작업 폴더 | `Documents/Codex/2026-11-08/.../work/birdmap` — 미커밋 변경 없음, HEAD 동일 |
| PR | #77 (open, base main), 헤드 `d6fd5cc` |
| PR CI | `regression` success, `gps-browser` success |
| 변경 파일 | 31개 (처리·설정 7개 + 시험·문서 24개), 보고 내용과 일치 |

Codex 변경은 삭제·초기화·재작성하지 않았다. 이 브랜치는 `d6fd5cc` 위에 검증 커밋 1개만 더한다.

## 3. 핵심 수정 내용 (Codex, 코드 검토 완료)

| 파일 | 변경 |
|---|---|
| `reports-api/src/shared.js` | `pendingPayload()`가 항상 `[]`. `receiptPayload()`가 접수증을 `ok/id/status/publicVisibility` 4개 필드로 줄이고 pending이면 `withheld` |
| `reports-api/src/public.js` | 정본·NORMAL 접수 모두 `pending_public=0`, 접수증 spot 제거(모드 무관), legacy `GET /reports/pending` 빈 목록, 상태 조회 pending→`withheld` |
| `reports-api/src/publication.js` | strict `GET /reports/pending` 빈 목록(DB 조회 없음), projection `nonbreeding-location-v2-pending-withheld-v1` |
| `reports-api/src/canonical/persistence.js` | 재전송·재생 접수증을 현재 상태로 재계산, 과거 `accepted.spot` 미반환(원자료는 수정 안 함) |
| `reports-api/src/admin-actions.js` | `visibility(public=true/1)` → `PENDING_PUBLICATION_DISABLED` 400 |
| `reports-api/wrangler.public.toml` | `REPORTS_PENDING_PUBLIC="0"` (보조 장치, 차단은 코드에서) |
| `index.html` | projection 갱신, 대기 마커·팝업 그리기 제거(잘못 온 DTO도 무시·잔존 레이어 제거), 접수 문구 "승인 전 지도 비공개" |

## 4. 경로별 검증

| 경로 | 결과 | 근거 |
|---|---|---|
| `GET /reports/pending` strict·legacy | 항상 `spots: []`, 과거 `pending_public=1`·실제좌표 approx 행 포함 | pending-private 시험, 독립 sweep |
| 신규 접수 응답 (정본 strict/비strict, NORMAL) | spot 없음, `withheld` | pending-private 시험, sweep |
| 접수 상태 조회 | pending→`withheld`, 좌표 없음 | 동일 |
| 같은 UUID 재전송·재생 | 과거 spot이 저장된 원자료라도 응답에 좌표 없음 | 동일 |
| 관리자 visibility 공개 | 400 거절, 행 변경 없음 | 동일 |
| 관리자 위치 가리기/되돌리기·반려·공개 취소 후 | 모든 공개 GET에 좌표 없음 | sweep |
| 관리자 승인·연결 | 기존 v2 그대로 동작(승인 후에만 공개) | 동일 |
| 공개 검색·탐조지 이력·최근·기여자·통계·현장소식 | 승인 자료만 읽음, 대기 좌표 없음 | 코드 검토 + sweep |
| 지도 마커·상세창 | 대기 레이어를 그리지 않음 | front 180·181, publication Chrome |
| 카카오맵·T맵 | 승인 공개점만 사용, 대기 팝업에 버튼 없음 | front 66·304·338·340 |

**독립 sweep 시험** (`reports-api/test/pending-public-sweep.test.mjs`, 이번 추가):
`REPORTS_PENDING_PUBLIC='1'`(구 설정) 상태에서 보호종 `매`+비번식 확인+위치 가리기 해제로 접수한 뒤, 공개 GET 12개 경로 × strict/legacy를 관리자 생명주기(공개 시도 거절→가리기→되돌리기→승인→공개 취소→반려→공개 시도 거절) 각 단계마다 훑어 좌표 숫자(소수 4~5자리 포함)가 없는지 확인한다.

- PR 브랜치: 통과
- 수정 전 main(`4e4e61d`): **실패** — `/reports/pending`이 입력 좌표 그대로 반환. 검출력 확인됨.

**수정 전/후 대조**: Codex의 `pending-private.test.mjs` 3건도 main 소스에서 3건 모두 실패(`approximate:false`·정확좌표 반환, 접수증 `approximate`), PR 소스에서 3건 통과.

## 5. 테스트 결과 (로컬 재실행, Windows · Node 24.18 · Chrome)

| 검사 | 결과 |
|---|---|
| reports-api 서버 (Codex 386 + sweep 1) | 387/387 통과 |
| 프런트 회귀 `test_*.mjs` (실제 Chrome) | 653/653 통과 |
| GPS 팝업 (390×844, 844×390) | 889 checks, 0 errors |
| 제보 위치 선택·카카오 장소 검색 | 296 checks, 0 errors |
| 최근 제보 PC·모바일 | 96 checks, 0 errors |
| PC·모바일 마커 표시 | 562 checks, 0 errors |
| 배경지도 빠른 전환·타일 장애 복구 | 67 통과, 0 실패 |
| 섬 주변 검색 | 38 통과 |
| 공개 권한·동의 Chrome (r4) | 147 통과, 0 실패 |
| 제보자 통계 Chrome | 135 통과 |
| 현장소식 종료·일반 제보 Chrome | 60 통과 |
| 탐조지 자료 계약(Python 8종, 중부 58건 포함) | 전부 OK |
| weather-proxy | 36 통과 |
| `git diff --check` | 통과 |

GPS 작업 4종은 처음에 CI 환경변수(`PLAYWRIGHT_MODULE` 등) 없이 실행해 `Cannot find module 'playwright'`로 멈췄다. 코드 실패가 아닌 실행 환경 문제였고, CI와 같은 변수로 재실행해 전부 통과했다.

실패한 검사: 없음. 이번 수정으로 생긴 회귀: 확인되지 않음.

## 6. 좌표 검증

탐조지 자료·좌표 파일(`siteData` 구간, `weather-proxy/src/sites.js`, `data/`, `share/`, 생성 JSON) 변경 없음. index.html 변경은 제보 표시 코드·문구뿐이다. 탐조지 자료 계약 시험 통과.

## 7. 기존 기능 영향

- 기존 승인 제보(133건, 11/08 감사 기준): 재분류·수정 없음. 승인 후 공개는 기존 v2 그대로.
- 운영 D1·Worker·Pages·설정: 변경 없음. 마이그레이션 없음.
- 일반종 자동 승인·즉시 공개: 추가 없음.
- 사용자에게 보이는 변화: 황색(승인 대기) 마커가 사라지고, 접수 문구가 "관리자 검토 대기(승인 전 지도 비공개)"로 바뀐다.

## 8. 남은 위험·미확인 사항

1. **배포 정합 필수**: projection이 바뀌어 공개 Worker와 Pages를 함께 반영해야 한다. 한쪽만 반영되면 fail closed로 승인 마커까지 공개 표시가 닫힌다(안전 측이지만 서비스 영향).
2. **운영은 아직 취약**: 병합·배포 전까지 운영 코드의 노출 경로는 그대로다. 이미 수신·복제된 좌표는 회수할 수 없다.
3. **관리자 화면 문구**: 관리자 페이지에 "황색 마커로 공개" 버튼과 과거 `pending_public=1` 행의 "황색 마커 공개 중" 표시가 남아 있다. 버튼을 누르면 서버가 거절하므로 노출은 없지만 혼동 소지가 있다(이번 최소 수정 범위 밖, 후속 정리 권장).
4. **D1의 과거 `pending_public=1` 행**은 그대로 남는다. 코드가 무시하므로 노출은 없다.
5. **승인 후 정책**: 비번식 확인 보호종은 승인되면 v2에 따라 정확좌표가 공개된다. 기존 정책이며 이번 범위에서 바꾸지 않았다.
6. **미확인**: 운영 엔드포인트 실측, Android·iOS 실기기, 운영 관리자 화면 조작. 모두 이번에 하지 않았다.

## 9. 롤백

- 지금은 병합·배포 전이므로 되돌릴 운영 변경이 없다. PR을 닫으면 끝난다.
- 병합 후 문제 시: 머지 커밋을 revert한다. 단 그러면 노출 경로가 되살아나므로, Codex README 원칙대로 **취약 버전으로 되돌리지 말고** 먼저 `REPORTS_PUBLIC_READS_CLOSED=true` 긴급 차단(별도 운영 승인 필요, 승인 자료 표시도 잠시 멈춤)으로 닫은 뒤 대기 차단을 유지한 수정본으로 복구한다.
- 데이터 역변환은 필요 없다(마이그레이션·일괄 UPDATE 없음).

## 10. 산출물

- 검증 브랜치: `claude/pending-private-verify-20261108` (Codex 커밋 2개 + 이 검증 커밋)
- 추가 파일: `reports-api/test/pending-public-sweep.test.mjs`, 이 보고서
- main 병합·운영 배포: 하지 않음. 관리자 승인 대기.
