## PR #13 — 배포 승인 전 최종 보완 C1·C2·C3 · 마지막 독립 검증 요청

대상 head: (이 파일을 포함한 최신 커밋). 이전 검증 SHA `352315a`. 상세 수정 전후·배포 순서·되돌리기 계획은 `docs/p1-s-implementation/NEXT_SESSION.md`, 증거는 `docs/p1-s-implementation/results/final/`.

- **C1** 주간 `generatedAt` 누락/null/빈/무효/미래·`dataUnavailable` → 일반·갯벌·섬 후보·최종 제외(`weeklyDocVerified`/`weeklyWeekSite`), Python 주간 validator 동일 계약. 정상 미래 예보 허용.
- **C2** 예보 시각을 점수 비교 전에 엄격 parser 로 확인(`weeklyDaylightCandidates`, today `storedWeatherState`): 12:60·시간대 없음·UTC·꼬리 문자열·24:00 제외 → 무효 99점 대신 정상 80점(rank 96=80+16)이 카드·팝업에 표시.
- **C3** today/week 로더: 요청 순번 + 엄격 KST 발행 시각 순서(오래됨·동일 시각 충돌·누락/무효는 미적용, 최신은 적용). 10:40 위험 → 나중 10:30 정상 무시(0 유지), 10:50 정상 복구, 최신 정상 뒤 옛 위험은 정상 추천을 지우지 못함(5폭 Chrome).
- Sol 도구 재실행: 시간 source core 74/74(4행 startDate schema 진단 별도), C DOM 245/245·lifecycle 45/45·diagnostics 2/2, loader Chrome 위험 역전·가용성 퇴행 모두 재현 불가, S2 182/182·21/21·12/12, 일반 E2E 55/55, S1-R 171/오탐 0, 정책 38조건 변화 없음.
- 고정 입력(2026-10-08 22:40, 190곳, 176후보, ON/OFF) 35141c0·352315a·현재 전체 signature·상위 10 동일.
- 회귀 **603 pass / 0 fail / 1 skip**. origin/main(b0975ca) merge-tree 충돌 없음, 자동 JSON 임시 결합 JS 527 통과(병합·자동 JSON 수정 없음).
- 유지·분리: R5, 현장소식 삭제 캐시, 보호 상태 전환, S1-P, B 정책. main 병합·Pages/Worker 배포·D1 변경 없음. `gh`/토큰이 없어 댓글은 게시하지 못함(본문 저장).
