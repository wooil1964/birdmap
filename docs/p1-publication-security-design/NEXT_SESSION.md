# 설계 재개 기록

2026-10-12 KST. 독립설계branch codex/p1-publication-security-design, 기준PR16=245298981e27f88ac26bad8b46d819a7df899c86, PR13=b12e20c1b6d856a021898a0c1c9221b30393a221. 두PR의head/body/branch를변경하지않는다.

완료: 원경로/캐시/dual-write/freeze조사, 실제운영GET6건헤더만확인, 네실패/Chrome15계승, field status/delete서버경합발견. DESIGN/TEST_PLAN/ROLLOUT_ROLLBACK에서제안·미확인을확인한다. 코드구현·자동회귀전체재실행·배포는하지않았다.

다음: 설계검토후사용자가별도승인한경우에만새제품branch에서API권한계약/DB migration/client gate/CAS를구현한다. 권한확인표시유효시간·poll interval·동작전재확인과최종변경범위를승인받는다. S1-P정책은별도범위다. 구현자는기존네실패와Chrome15를기대assertion유지하여먼저재현해야한다.

운영검증전: 현재public/admin버전/소스artifact·bindings와실제DBschema/trigger/freeze/canonicalprojection을읽기전용으로확인한다. 과거494b97/16dae버전을S1-R+새권한보호의rollback대상으로임의승인하지않는다. 기존core schemaReady fingerprint및기록형safetyledger계약을보존한다.

본세션의 HTTPbody/실제좌표/비밀정보는저장하지않는다. local synthetic SQL모델은제품/API시험통과가아니다. 새로고침/다른기기의즉시동시철회보장은finite network로완전해질수없다는한계를설계문서와최종승인에서명시한다.

main병합·Worker/Pages업로드/배포/rollback·D1/실사용자변경금지. 현재문서의검토·별도승인전제품수정금지.
