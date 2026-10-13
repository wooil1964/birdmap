# P1 Paid 배포 준비 — 진행 체크포인트

2026-10-14 KST. 사용자는 보안수정·재검증·통합·병합·운영 배포를 승인했다. 인증/외부결제/파괴적복구 예외는 유지한다. 아직 운영 변경0. root만 코드편집; 에이전트는 읽기감사/동결시험/새 증거저장만.

별도 branch codex/p1-publication-paid-deploy. 기반99965992 + origin/main d736eed의 정상통합79a5d866e8efcc8a8c1ce50ce4d6947a686d14f2. 자동JSON5종만 main을 반영, 충돌0. 실험 WS/DO는 통합하지 않았다. Paid에서 기존4750ms HTTP 갱신/5000ms 권한 만료/primary/nonce/freshpostflight를 유지하는 최소범위다.

원격 PR13 b12e20c1, PR16 24529898, PR17 9f9e9be49a4ddf2651e930d5fa9033df865d998d 모두Draft/open. 13/16기능은17/현재후속source에 포함; 중복병합금지. 원본Free/WS 작업트리·미추적 원장 보존.

새 root하네스수정: 개별request-start lease와 compoundduration 분리(만료DOM폐쇄 assertion추가), 실제 별도visibleContext2개 전제추가, 같은generation 공유요청을 두개로 가정하던 시험에 실제authoritygenerationbarrier/fullrefresh 추가. deferredexpected2 및 기존좌표불노출 assertion 유지. ChromeLoad는 실제hidden 상태의 요청start를 검사; global phase는 실제숨김 전에부여됨. 원형237/4와17/1 보존. package rollback은 현재숨김/만료 guard와190/unique/좌표hash를 요구.

자동6스위트79a5 baseline 실행중: reports253/253,proxy36/36,weather56/56,tide21/1skip,share11/11,front374/374,시간계약8/8. exactmanifest는automatic-baseline-79a5/를 참조. currenttoday/week PASS는10/13 23:57KST시점의10/13batch이며10/14현재검증으로사용금지. 실제날짜validator 삭제/변조없음; 새10/14자동배치 별도관문(00:20KST정규workflow예정).

CloudflareRO PREFLIGHT: publicactive494b97d1/admin0134cd9a, production publication schema아직없음, reports74/field3,ledger0001~0003,0004field기설치. D1 SELECT만. OAuthWorker/D1/Pages scopes가능, subscriptionGET403. 실제Workers Paid확인 질문asyncpending, 결제/요금제전환자동실행금지. WorkersAccountSettings standard만으로Paid증명불가.

다음: 새하네스 Chrome +수정된Load+native/migration source회귀, fixed190/176·S2/S1, safe최신Pagesartifact, 최종sourceCI확보. rollback c025Pages는숨김/만료수정전이므로사용금지. 보호standby c025Worker는B6있으나최신소스버전업로드/바인딩 재검증필요. 모든필수조건/실제Paid확인 전 운영migration/maintenance 활성화/mainmerge금지.
