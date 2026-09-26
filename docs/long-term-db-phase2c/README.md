# Phase 2C — 원격 staging 검증 결과

STATUS: PHASE 2C COMPLETE (검증 범위와 제한 명시)

95개 원격 검증/단계가 통과했다. 실제 결함2개를 수정했고 필수 로컬 재시험도 모두 통과했다. **Production 적용은 NO-GO**, Phase2D는 시작하지 않았다. 두 staging Worker는 maintenance 상태다.

| 구분 | 항목 | 결과 |
|---|---|---|
| A | 시작 상태와 remote main | main / HEAD d39bf4bf2d7e147b246f867f56567f814eddd4b9. 최신 remote main 15c9b192d2b24faaffb9f44a625dcd43d0e30710; 날씨·조석 JSON 5개만 차이. fetch/pull/merge 없음. |
| B | staging 격리 | D1 f2c65357-47fc-4f09-82c6-ad0d28f8314f; birdmap-reports-staging-public / birdmap-reports-staging-admin. 실제 DB/peer binding 고정 검증. production D1 b48201cc-0abd-4a64-bb61-9dd2a7813d21와 다름. staging Access만 생성·사용. |
| C | remote migration | 공식 Wrangler 0000_legacy + Phase2A 0001_core만 staging에 적용. 재적용과 cutover 재연은 no-op. 별도 schema ledger 추가 없음. |
| D | schemaReady | A_MATCH; remote/local/hash 동일 76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0. 9테이블·114컬럼 및 reports22컬럼, DDL/PRAGMA/인덱스/FK/trigger 비교 일치. |
| E | batch rollback | 실제 D1 quick 중간·후반 실패, admin 실패, purge 중간·tombstone 이후 실패에서 전체 rollback. 독립 run으로 분할하지 않음. |
| F | changes / CAS | 실제 UPDATE → SELECT changes() → assertion: 정상1, stale실패, 동시 revision 경쟁1commit. 다른 DML 삽입 없음. 최종 assertions0. |
| G | idempotency | 동일 quick/admin request replay는 중복0. 다른 payload/action/event 의미는 conflict. 실제 동시 quick 요청도1저장+replay. |
| H | confirmation | 누락·false·문자열 true 거부 및 쓰기0. 명시 true만4테이블 원자 저장. 종·월·지역 기반 번식 추정 없음. |
| I | admin 8 actions | 실제 Cloudflare Access JWT로 approve/reject/unpublish/link/unlink/consent/visibility/site 모두 기존 의미·projection·revision·replay 확인. |
| J | multi-review | 하나 request에3 review events, sequence1/2/3·event_index0/1/2. compound UNIQUE 두 종류와 replay 의미 확인. count0 exact·1 unknown 보존. |
| K | canonical / shadow | approved/pending/site/status/pagination/total/순서/응답 shape·헤더·공개 규칙 동등. shadow mismatch0. 사용자 read는 legacy 유지. |
| L | maintenance | 실제 public POST 및 Access admin mutation503 + Retry-After60, public/admin GET200. 시험 후 두 staging Worker maintenance 유지. |
| M | mixed-version / peer | 최종 v3 행렬14/14: 양방향 release·기대값·build·activation·schema·binding 불일치 차단. NORMAL 구 writer는 external freeze 필수임을 실제 확인. |
| N | concurrency | 실제 HTTP 동일 quick2개→1저장; 다른 quick→2저장; 동일 admin revision→200/409, 한 audit/revision만 증가. 직접 원격 CAS 경쟁도1commit. |
| O | Turnstile | 공식 테스트 설정의 실제 Siteverify: fail/spent403 쓰기0; pass/spent 동시201/201, 저장1, retry201. 브라우저 실토큰·특정 catch분기 실행을 입증한 것은 아님. |
| P | sites | 190 IDs 및 registry checksum/좌표 그대로 seed. 단일 D1.batch190 성공, replay0, invalid FK거부. 이름 병합·ID재발급 없음. |
| Q | synthetic backfill | 사용자 별도 승인 후21source→raw/checklist/sighting 각21, batch64. approved17/rejected4/siteNULL5/count1=13/countNULL8; count_accuracy unknown. 동일 manifest0/changed·partial 거부, 전체값 검증. |
| R | remote limits | fixture max38parameters/SQL570bytes/text516bytes. 성공 batch64/190. 미래3N+1+검증쿼리 예산 및 chunk 검증 필요; 계정 플랜·대규모 부하는 미확정. |
| S | append-only | 일반 application UPDATE/DELETE(raw/reviews/audit) 모두 거부. 원격 UPDATE trigger 고유 오류 확인. 관리자 직접 DB권한과 구분. |
| T | synthetic purge | 13/13. native만 실제 제거. 원본PK잔존0, 전체 application marker0, 타행 불변, 비민감 tombstone1. 원 quick재요청410, legacy는 decision required. |
| U | Time Travel / restore | purge 이후 bookmark → synthetic assertion1 → 실제 staging restore. 모든 application10테이블·schema·migration ledger 동등, FK0/assertions0, purge tombstone 및410 유지. 계정 최대 보존일수 미확정. |
| V | Worker rollback | 두 staging Worker의 신규 maintenance 버전을 실제 배포 후 이전 검증 maintenance 버전으로 각각 rollback. 실제 활성version/binding/Access GET200/쓰기503 확인, DB불변. |
| W | cutover rehearsal | 14/14 순서 재연. 기존 schema migration/seed no-op, legacy21 cohort동등성, freeze/peer/shadow/내부smoke/실제 HTTP재개 검증. 최종maintenance. production drain시험 아님. |
| X | 코드 수정 / 재시험 | 원격 결함2개(역방향 release 미확인, binding없는 peer의 ready)를 먼저 재현. control.js/purge.js 최소수정, BUILD v3. 최종 local32·legacy106·2A17·protocol5·추가gate13 전부PASS. |
| Y | 남은 위험 | 실제 production freeze/drain, 실토큰 특정분기, 계정 최대retention, purge이전복구, legacy purge결정, 미래chunk/backfill은 별도 검토 필요. 아래 상세 위험 참조. |
| Z | production go / no-go | NO-GO. Phase2C 검증 산출물 완료이며 운영 적용 승인이 아니다. 별도 검토·명시 지시 전 Phase2D/production 작업을 시작하지 않는다. |

세부 실행 근거는 [execution-evidence.md](execution-evidence.md), 기계 판독 결과는 [test-results.json](test-results.json), 재개/종료 상태는 [CHECKPOINT.md](CHECKPOINT.md)에 있다.

- Production 적용은 승인되지 않았으며 NO-GO. 실제 외부 writer freeze·구 Worker drain·배포 책임자/중단 기준을 별도로 확정해야 한다. staging wrapper freeze는 production 방화벽 설정 검증이 아니다.
- Turnstile 공식 pass/fail/already-spent Siteverify와 동시 멱등성은 통과했다. 실제 브라우저 발급 single-use token 및 CAPTCHA 실패 직후 concurrent commit 재조회 분기 실행은 원격에서 특정하지 않았다(해당 분기는 로컬 시험 통과).
- 새 staging DB의 생성 직후 요청 시점 bookmark와 실제 복구는 확인했다. 계정 구독에 따른 최대 7일/30일 보존 한도는 계정 수준에서 확정하지 않았다.
- Time Travel의 purge 이전 이력에는 제거 자료가 남을 수 있다. 이번 복구는 purge 이후 bookmark로만 수행했다. 운영 복구 시 금지 자료 재유입 방지 절차가 필요하다.
- legacy purge는 PURGE_LEGACY_DECISION_REQUIRED를 유지한다. 운영자가 보존 정책과 금지자료 삭제 예외를 결정해야 한다. 현재 purge는 권한 있는 내부 함수이며 운영용 인증 진입점을 새로 공개하지 않았다.
- 64/190 statement batch의 성공은 대규모 부하 증명이 아니다. 미래 chunk backfill은 현재 partial-state 거부·manifest 원칙을 유지하는 별도 설계와 한도 검증이 필요하다.
- 일반 DELETE 금지는 application 경계이고 직접 D1 관리자 권한에는 적용되지 않는다. Worker rollback은 DB를 되돌리지 않으며, 이번에는 안전한 maintenance 버전만 복귀했다.
- 이번 14단계 cutover 재연은 기설치 staging에서 migration/seed no-op 및 backfill cohort 검증으로 수행했다. 최초 빈 DB migration/backfill 성공 증거와 구분한다. production 데이터·트래픽·배포 drain을 시험한 것은 아니다.

Production D1 writes = 0; Production migrations = 0; Production Worker deploys = 0; Production route changes = 0; Production secret changes = 0; commit = 0; push = 0.
