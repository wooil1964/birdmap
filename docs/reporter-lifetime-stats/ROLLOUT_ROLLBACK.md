# Issue21 운영 전환·보호 롤백

사용자 후속 승인: Issue21 comment6158233431. 제품 ab7f0504aaf028dd01ffaf28abea0078875a9314; 공개 Worker 선반영, PR22 merge31b5f6d6e0b400ff610ba065d893299c56a12af8, Pages실제반영. 관리자/D1/migration/실사용자자료변경0. Public5338a88a-d26b-450c-9e9b-5095872136ca, deployment4bdd4b3f-7225-4d04-b29c-78914e442b76. 활성관리자a7723404-a3c2-4739-91ff-44049e1302cb 그대로.

## 롤백 순서
1. `rollback/index.html` 원문 SHA256 a2fd8c287f763f16559b69d08a802fd72c849f18c5f39f2ba94d9fb97c7ec05a 검증. 새 이력 DOM 제거·원래P1/S1-R 계약을 유지하고 통계 링크만 비활성화한 소스다. 기존 보안Chrome242PASS. 독립 임시 main기준 브랜치에서 이 파일만 index.html에 복원하고 원격PR/CI/Pages를 반영한다. 그때 최신weather/tide/notices JSON을 그대로 유지한다. 이전 main1bac HTML을 단순복원하면 이번 이력DOM보완을 잃으므로 사용하지 않는다.
2. Pages 실제 HTML·5폭 P1보호 확인 후 공개 Worker만 실제 확보 버전 f1f24698-8388-4f36-ae31-38f2dd8e9446 100%로 전환. 신규 통계API404는 fail-closed이며 개인정보를 복원하지 않는다. 더 엄격한 쓰기 중단이 필요하면 실제 보호maintenance7e398695-aad7-4e58-962c-034513776960 사용. 두 버전 실제메타·바인딩·preview-off·v4 출처 확인 완료.
3. 관리자 Worker·D1·epoch/revision·삭제이력·canonical자료는 되돌리거나 초기화하지 않는다. 이번 기능은 D1비파괴migration조차없어 DB복원이 필요 없다. 미검증 이전494/16dae Worker는 사용하지 않는다.
4. 실제권한head(no-store/nonce), 승인/현장API, sourcewitness부적격제외, 화면 만료·hidden·지연응답·GPS방어를 재확인한다. 오래된 브라우저의 이미 받은 공개정보를 원격으로 지웠다고 주장하지 않는다. 새클라이언트 로드 확인을 운영전환 근거로 삼는다.

## 롤백 확보 증거
CI38494318678 보호Pages artifact11862869364 (30일보존) + 원격감사브랜치의feature-off HTML원문/manifest + 실제Cloudflare 보호Worker2버전. Main제품와자동JSON스냅샷 Git보존. 무단 Workers요금제 변경·개인자료 쓰기·민감좌표 공개 없음.
