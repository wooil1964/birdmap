# Phase 2E rollback-evidence

Rollback과 Time Travel restore는 **실행하지 않았다**. 모든 단계가 통과 기준을 만족했다.

준비된 복구 수단:
- 앱 오류: 즉시 `freeze.mjs --freeze` → maintenance build(public 254cc69f…, admin 1e069df3…)로 `wrangler rollback`.
- legacy 복귀가 필요한 경우(운영자 판단): public 57849940…, admin 1eebcf4e…로 rollback. 이 경우 guard 없는 legacy 경로가 다시 열리므로 운영자 결정이 필요하다.
- 데이터 손상 의심: freeze를 유지하고 `TIME TRAVEL RESTORE RECOMMENDED`로 보고한다. 별도 승인 뒤 B0(000001da-00000000-000050f2-ba7f25c789083d4b7affe640fa82a1b9)로 restore하고 [forbidden-restore-runbook](../long-term-db-phase2d1/forbidden-restore-runbook.md) §5를 따른다.
- B0는 migration 이전 시점이다. 되돌리면 canonical 테이블·system_state·captcha_redemptions가 모두 사라진다. restore 뒤에는 dual Worker가 스키마 부재로 쓰기를 거부하고(ready false), legacy 복귀를 판단해야 한다.
