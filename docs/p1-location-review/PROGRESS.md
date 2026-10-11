# 진행 체크포인트

2026-10-11 KST. 운영 승인 전 독립 검증 준비 단계.

- 최신 main `43bff43301d5915a344bf2c20987698597cf8870`에 원 수정 `f27e661c3762d7787f976196ed84eeb8d255c3c7`의 단일 diff를 재적용했다. 충돌0, 티맵/카카오 기능 보존.
- 제품/테스트 체크포인트 `d3efe218ad99f97d8ae6d494031b42e4bdac7ec8`, 전용 브랜치 `codex/p1-location-protection-main-20261011`.
- 동일 좌표에서 가림 상태만 바뀐 열린 팝업의 갱신을 추가 보완했다. 기존 assertions 유지, 별도1건 수정 전 실패→후 통과.
- 정상 Chrome 75/75, 독립 mutation7/7 탐지. 독립 보안7종 3통과/4실패 및 Chrome 위험15건을 별도로 보존했다.
- 원 f27 349/349; main 통합272 중270통과/기존2실패; PR13 임시결합642 중639통과/기존2실패/1skip. 보고351/기존9의 정확한 범위는 미확인.
- PR13 b12 임시결합 tree `a5808cb647759bdd10726318c061d68545c7c63a`: 충돌0, 자동JSON·190곳·176후보 및 제보 ON/OFF 추천 signature 동일.
- 서버 과거 payload와 새로고침에 의한 공개 상태 역행은 미해결. 전면 위치 보호 운영 판정은 **수정 필요**이며 부분 방어를 독립 검토용 Draft로 제출한다.
- 원 branch/main/PR13/운영 데이터는 변경하지 않았다. 업로드·배포·D1·실사용자 쓰기0.

PR 게시와 원격 head 확인은 제출 receipt에 기록한다. 마지막 문서 commit은 `git log -1 --format=%H` 및 원격 PR head로 확인한다. NEXT_SESSION.md에서 다음 작업을 이어간다.

제출 완료: Draft PR #16 (https://github.com/wooil1964/birdmap/pull/16). 초기 head2556a20를 원격에서 확인하고 본문 일치·Draft·mergeable=true를 재확인했다. 이 제출 receipt commit은 문서만 추가하며 제품 d3는 그대로다.
