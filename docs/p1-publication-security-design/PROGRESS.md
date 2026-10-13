# 진행 상태

2026-10-12 KST, 설계 단계 완료. 기준2452989와 새 main66ff787의 코드 경로는 동일하고 새 main 변경은 weather_today/week 및 tide_today/month/health JSON뿐이다. 기존 자료를 덮어쓰지 않았다.

PR13 b12와 PR16 245의 head/body/updatedAt은 시작과 종료 connector 조회에서 동일했다. 제품·migrations·기상/좌표·두PR·운영 데이터 변경0. 운영GET6건 헤더만 기록, D1 조회0. 문서와 합성 메모리 SQL 모델만 작성했다.

- 기존4fail/Chrome15를 해결하기 위한 state+nonce+atomic snapshot+postflight+no-store 설계 완료.
- 추가 field delete/status 경합을 실제 제품 SQL 순서의 in-memory 모델로 확인. 현재 제품 deleted→reappeared 복원이 재현됐으며 제안 guard 모델에서는 중지됐다. 제품 구현/인증 handler/Chrome/D1 검증 통과로 해석하지 않는다.
- 별도 state table1 + field row_revision1 + 안전 triggers 권고. 기존 core fingerprint/system_state/canonical row CAS는 재사용하지 않음.
- S1-R와 canonical dual-write/legacy 공개+shadow 유지, S1-P는 미구현.
- 정상 만료/재승인/재출현, 두 지도 앱, fail closed 복구, 추천/190좌표 비간섭 시험을 계획에 포함.
- 서버 선배포·새 client·엄격 contract 전환·캐시 처리·보호 baseline rollback 및 oldtab 한계 명시.

미완료: 사용자 설계/구현 승인, 표시 확인 유효시간·poll/timeout/retry 운영값, 실제 D1/캐시/배포 artifact preflight, 구현·새시험·CI·안전rollback SHA/version·운영승인. 이 사항을 현재 통과/완료로 보고하지 않는다.

문서 전용 브랜치 codex/p1-publication-security-design에 체크포인트를 저장한다. 정확 문서 commit은 git log -1로 확인한다. 원격 push/새 PR/기존 PR 댓글·본문 수정은 이번 작업에서 수행하지 않는다. 사용자는 로컬 문서와 최종 보고로 설계를 먼저 검토한다.
