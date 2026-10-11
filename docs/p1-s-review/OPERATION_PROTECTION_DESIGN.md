# PR13 운영 보호 전환 승인 조건 — 독립 읽기 감사

작성: 2026-10-11. 마지막 합성 확인 시각: 07:31:31 KST. PR head는 `b12e20c1b6d856a021898a0c1c9221b30393a221`이며 실제 제품 checkout HEAD를 확인했다. 기존 07시 결합 증빙 source는 main `89e7e339812fbd9c096008cb5631c88fd8765c03` + head, tree `e02191c1ca4cc00e0faedab2ffd4e10b14c537e2`이다. 정리된 임시 archive 대신 이 tree의 index blob을 메모리에서 읽었다.

이 문서는 **소스와 합성 local 근거**를 기록한다. 실 Worker 버전·설정·공개 GET 결과의 운영 확인은 root 담당이며 이 문서에서 수행했다고 주장하지 않는다. 운영 제보 원문/원좌표/관리자 토큰/DB export를 저장하지 않았다. 실제 POST/DELETE, 실제 D1 접근, 제품 수정, Git 변경은 모두 0이다. 이번 요청에서 작성한 파일은 이 문서뿐이다.

## 승인에 필요한 결론

1. **S1-R 코드 배포 자체에는 기존 approved 지도점/이력 또는 기존 field_updates 공개 좌표를 일괄 재분류·가리기·철회하는 경로가 없다.** legacy 신규 reports/field의 판정과 기존 recent-sites 가점용 읽기 제외가 개선된다. canonical 신규 접수에 같은 보호종 pending 보류가 적용된다는 주장은 하지 않는다. 과거 승인 보호종이 approved/history에 남는 기존 S1-P 정책은 이번 코드로 해소되지 않는다.
2. S1-R만 배포하고 보호 좌표/공개 상태 전환을 함께 하지 않는 범위는 아래 운영 증거와 기존 P1 위험의 명시적 수용을 전제로 **조건부 승인 판단 대상**이다. 이것은 운영 최종 승인 또는 모든 과거 자료가 안전하다는 판정이 아니다.
3. 기존 정확 공개점→가림, approved→철회, field 공개점→가림/철회를 배포 또는 관리자 정리와 함께 수행한다면 **old-response 보호 역전 및 지연 길안내를 그 전환 전에 차단해야 한다.** 공개 GET의 현재 안전 스냅샷 한 번이나 cache TTL만으로 이 조건을 통과했다고 할 수 없다.
4. 본인 field 삭제 성공 후 old GET가 UI 마커를 되살리는 기존 P1도 실제 API로 도달 가능하다. 서버 삭제가 취소되는 것은 아니다. 즉시·지속적인 UI 철회를 운영 승인 요건으로 삼으면 이 P1은 승인 전 해결 대상이며, 과거 위험 수용을 전제로 하는 한정 배포라면 별도 후속으로 기록해야 한다.

## 원설계로 고정한 S1-R / S1-P 범위

2026-10-11 22:44 이후 문서 마무리에서 원설계를 직접 읽고 Git blob과 대조했다. 원설계 checkout은 `analysis/recommendation-masterplan`, HEAD `60bfbdb9308fef5e7441c7627ba20102f4a10901`이다. [P1_SAFETY_DESIGN.md](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md:3)의 전체 파일이 해당 commit blob과 일치하며 SHA256은 `03d13e01887610efd77d7cf850e0d6fd41fa6491399d757a12d7e8b4a809d155`이다. 원설계 자체의 상태는 분석·설계/인수 명세이며 운영 구현·배포 승인이 아니다.

- [§1 기존 정책](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md:12)은 승인 이후 공개 API가 관리자 승인/공개 좌표를 신뢰하고, canonical 간편 제보가 명시적 비번식 확인을 기준으로 정확 위치 공개를 허용한다고 구분한다. 승인 후 모든 보호종을 비공개로 바꾸는 일은 별도 공개 정책 전환이다.
- [§2 canonical 경로](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md:35)는 `non_breeding_confirmed=true`, 공개 설정, hide 요청으로 pending 좌표가 결정되며 protected read 차단 확대를 현행 정책 변경으로 정의한다. [§2 선행 정책 출처](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md:45)가 연결한 [Phase2A README:13](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/long-term-db-phase2a/README.md:13)도 직접 확인했다. 종명·희귀도·보호등급·월로 번식 여부를 추정하지 않고 명시적 비번식 확인을 요구하는 기존 계약이다.
- [§5 S1-R/S1-P 경계](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md:96)는 R을 현행19종/6키워드의 표현 방어, P를 모든 공개 경로에서 sensitive/review 행의 위치 연결을 보류하는 정책으로 나눈다. approved/canonical·field 대략 좌표·자유 note 등은 각각 승인 항목이며 R만으로 P의 전체 보장이 성립하지 않는다.

따라서 canonical pendingPublic1/hidefalse 분기는 **그 자체가 새로운 S1-R 차단 회귀가 아니다**. 같은 함수 body는 before `b0975cad9f3112af38cc286a892bf6f06722ce12`와 b12에서 SHA256 `1cc6dfde480d5a7df804c50c8bba2cf3caccbb277868f304a5de0cd7e6918fd7`로 동일했고 원설계의 기존 정책과 일치한다. 한정 운영 승인은 이 정책의 적용 범위를 명시적으로 수용하는 조건으로 판단해야 하며 S1-R 배포가 모든 신규/기존 보호 위치를 비공개로 만든다고 보고하지 않는다.

캐시/전환과 rollback 조건도 [§12 캐시 인수](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md:291), [§12 보호 유지 rollback](C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md:293)에 연결한다. 과거 보호대상 가점/이력이 부활하지 않는 성질과 보호를 유지하는 rollback 확인을 요구하는 근거이며, 이 문서가 새 기능을 승인하는 것은 아니다.

## S1-R가 적용되는 경로와 적용되지 않는 경로

| 경로 | 실제 코드/현재 동작 | 기존 행 전환 여부 |
|---|---|---|
| 신규 legacy reports 접수 | NORMAL의 handleSubmit에서 shared.isSensitiveReport로 pending_public 결정 | 새 보호 수량·구분자 표현의 pending 공개 보류. 기존 reports 행 재작성 없음 |
| 신규 canonical reports 접수 | CANONICAL_DUAL_WRITE는 handleCanonicalSubmit으로 분기. pendingPublic=Number(env.REPORTS_PENDING_PUBLIC); hideLocation만 공개점 offset을 결정. legacy의 isSensitiveReport 분기 미호출 | **S1-R 보호종 판정에 따른 canonical pending 자동 보류/offset은 없음.** non_breeding_confirmed 및 운영 pending flag 계약으로 결정 |
| 신규 field 접수 | field-updates.protection → 보호종은 공개점을 접수 시 한 번 대략 좌표로 저장, location_hidden=1. 번식 키워드는 접수 거부 | 신규 행만 적용. 기존 행 backfill 없음 |
| GET /reports/recent-sites | approved/최근/site_id/비가림 SQL을 통과한 기존 행에 새 isSensitiveReport를 읽기에서 적용하여 행 전체 제외 | **집계/추천 가점 자격의 읽기 재판정은 있음.** DB·approved 지도점·원좌표는 변경하지 않음 |
| GET /reports/approved | approved 행을 publicPayload로 묶음. public_lat/public_lon이 없으면 기존 lat/lon fallback. isSensitiveReport 호출 없음 | 과거 보호 표현을 자동 가림/철회하지 않음 |
| GET /reports/site/:id | approved 이력의 종·날짜 및 동의한 이름. 민감종/번식 classifier 필터 없음 | 이력 자동 철회 없음 |
| GET /reports/pending | 저장된 pending_public=1 및 approx 좌표를 사용. 읽기 시 새 classifier로 재검사하지 않음 | 과거 pending_public 원값 그대로 |
| GET /field-updates | 활성/비삭제 행의 저장된 public_lat/public_lon/location_hidden을 내보냄. 새 classifier를 읽기에서 재실행하지 않음 | 과거 잘못 공개된 보호 표현을 자동 고치지 않음 |
| 관리자 approve/link/hide/unpublish/reject | approve는 입력 종명 normalize를 공유하지만 자동 민감종 가림은 없음. hide는 public/approx 좌표, unpublish/reject는 status/pending_public를 바꿈 | **명시적 관리자 action이 있을 때** 기존 행의 공개 상태 전환 가능 |

**canonical source 확인에 따른 정정:** 앞선 초안의 “canonical 신규 쓰기도 같은 shared 보호 판정/저장 경로 사용”은 잘못된 일반화였고 제거했다. public.js97의 handleCanonicalSubmit은 quickInput/명시적 비번식 확인을 통과한 후,117에서 운영 pending flag와 hideLocation만 사용한다.136의 dual 분기는153의 legacy isSensitiveReport를 실행하지 않는다. root가 07시 운영 읽기에서 전달한 당시 mode는 CANONICAL_DUAL_WRITE/pendingPublic1이다. 이 조합에서 hideLocation=false이면 코드상 accepted pending spot은 clicked point이고 approximate=false이다. protected species 자체로 withheld가 되는 경로가 아니다. 기존 S1-R legacy 메모리 보호 회귀171을 이 현재 canonical 경로의 보호 보장으로 확대할 수 없다. contract agent가 수행한 별도 canonical 합성 결과는 아래에 귀속과 범위를 분리해 기록한다. 운영 POST/DELETE로 확인하지 않는다.
현재 public.handleRequest는 legacy 공개 응답을 반환하고 shadow-read가 켜져 있어도 비교만 수행한다. canonical 읽기 전환 또는 별도 backfill을 S1-R 배포에 자동 포함한다고 추정하지 않는다. 배포 계획에 별도 SQL/운영 action/flag 변경이 있다면 위의 “순수 S1-R” 조건과 분리해 확인해야 한다.

approved 자식이 부모/fixed 지점에 연결된 경우 publicPayload는 자식 종·이력을 부모 공개점 또는 fixed 이력에 붙인다. 부모의 locationHidden만 자기 spot에 반영한다. 자식 hide만으로 부모/fixed 공개 위치와의 연관이 사라진다고 보장하지 않는다. 기존 연결 관계까지 포함한 과거 자료 정리는 S1-P 정책과 운영 영향 범위의 별도 확인 대상이다.

## 합성 근거와 기존/새 변경 구분

### 실제 서버 소스의 기존 행 읽기

07:30:16 KST, b12 실제 handleLegacyRequest + fakeDb :memory:로 확인했다. fetch는 전부 오류로 차단했고 운영 요청은 없었다.

- 합성 approved `저어새1`: approved200에서 종·원래 공개점 유지, site-history200에서 종 유지, recent-sites200에서는 제외. 읽기 전후 reports 행이 같았다.
- 합성 legacy field `저어새1`/저장 hidden0: GET200에서도 hiddenfalse와 저장된 원래 공개점이 유지됐다. 이는 **운영 자료에 그러한 행이 있다는 증거가 아니라 기존 행 자동 재분류가 없다는 코드 확인**이다.
- e9c 보호 회귀의 shared/public/field-updates/admin-actions 네 소스는 b12와 LF 정규화 후 동일했다. 따라서 기존 protection_regression의171 보호/일반17 오탐0·신규 쓰기·승인/집계 범위는 재사용할 수 있으나 운영 자료의 안전성까지 확대할 수 없다.

### Contract agent의 별도 canonical 합성 근거

이 실험은 `/root/f123_contract`가 수행해 전달한 결과이며 본 DOM 담당자가 새로 실행한 시험이 아니다. 실행 시각은 **2026-10-11 07:35:01.208 KST**, 최종 도구 출력 `a4b1a0`/exit0이고 원본 응답 파일은 저장하지 않았다. 초기 `d44fb0`/exit1은 VM의 URLSearchParams 누락이었으며 제품 변경 없이 Web global을 추가하여 완료했다.

비교는 parent main `1817161`과 b12, 각5조건 총10건이었다. `CANONICAL_DUAL_WRITE`, pendingPublic1, hidefalse, 명시적 nonbreeding=true 조건에서 exact 보호종/수량 보호 표현/실제 newline 혼합/일반종/번식 note 조건 모두 submit201 → pending 공개 → approve200 → approved 공개였다. 합성 point와 같은지는 boolean만 출력했다. exact 및 번식 note는 양쪽 recent 집계 제외, quantity/newline은 이전 가점12에서 b12 제외/null, 일반종은 양쪽12였다.

방법은 실제 Git 모듈 VM·canonicalDb SQL in-memory·기존 environments/installAuthStubs·프런트 actual bonus 함수이며 DOM/실 Worker/D1 시험은 아니다. 이 결과는 **기존 canonical 명시확인 공개 정책과 S1-R recent 표현 방어의 경로별 차이**를 확인한다. 실제 신규 운영 제보 누출이나 S1-R에 의한 canonical 공개 회귀를 입증하지 않는다. 기존171 NORMAL/legacy 보호 기대를 canonical pending 자동 보호로 확대하지 않는다.

### 본인 field 삭제 뒤 old GET

기존 `scripts/r6/actual_delete_race.mjs`를 실제 b12 소스로 재실행했다. 결과 파일 쓰기를 메모리에서 제거하고 결과를 도구 출력으로만 읽었다. 하네스의 과거 sha 라벨만 실제 b12로 바꿨으며 assertions와 함수는 유지했다.

- 실제 합성 owner-delete API200 → 새 GET에서 제거 → 먼저 시작했던 old GET 도착 뒤 프런트 마커 카운트1로 재등장.
- 서버 status는 deleted 유지, 다음 새 GET에서 제외. 외부 network0/운영 D1쓰기0.
- actual frontend functions: fieldValidUpdate, fieldFind, loadFieldUpdates. DOM/마커 renderer는 카운트 stub이므로 **이번 추가 실행은 actual Leaflet DOM 시험이 아니다**.
- 기존 b12/최종 브라우저 결과의 lateFieldDeleteResponse도 actual local handler + 실제 Leaflet에서 삭제 후 old-response UI 재등장을 별도로 기록했다. 새 기능 회귀 pass/fail에 섞지 않았다.

### 승인 지도점 가림/철회 뒤 old GET

07:31:31 KST, 실제 loadApprovedReports 함수를 VM에서 실행했다. fetch/검색/마커 renderer만 합성 stub이며 실제 Leaflet DOM 시험은 아니다.

| 합성 전환 | 새 응답 적용 | 뒤늦은 old 응답 적용 |
|---|---|---|
| approved 공개→가림 | 가림 상태 적용 | 이전 public spot을 다시 renderer에 전달 |
| approved→철회 | spots0 적용 | 이전 spot1을 다시 renderer에 전달 |

loadApprovedReports에는 응답 순서/세대/최신 보호 상태 비교가 없다. approved/history/current GET가 안전해 보여도 이전 응답을 수락하는 클라이언트 경합의 부재를 증명하지 못한다. approved 및 recent-sites의 public max-age60과 field no-store는 응답 도착 순서를 보장하지 않는다.

### GPS 콜백이 보호 전환/삭제보다 늦는 경우

07:30:16 KST, actual fieldFind/fieldPublicPoint/fieldNewsNavigate/fieldNavExternal를 b12와 최종89 tree에서 각각 실행했다. GPS콜백·거리분기(외부 길안내)·window.open·chooser renderer는 stub이며 실제 외부 앱/좌표는 사용하지 않았다.

1. 공개 상태에서 길안내를 누르고 GPS success callback을 보류한다.
2. 프런트 최신 목록을 hidden 상태 또는 삭제 상태로 바꾼다. 최신 fieldPublicPoint는 null이다.
3. 보류한 callback을 반환하면 최초 captured update/point로 여전히 길안내를 시도한다.

두 전환×두 버전4건 모두 재현됐다. b12는 window.open stub1 + fallback chooser1, 최종 TMAP 소스는 자동 open0이지만 오래된 객체로 chooser1이었다. **TMAP 변경이 기존 캡처 경합을 없앴다고 할 수 없다.** 정상 protected 상태에서 처음부터 길안내를 누르면 차단되는 기존20/20 정적 검증과 이 전환 경합은 다른 계약이다.

## 보호 전환별 승인 분류

| 배포/운영 조건 | 분류 | 승인 판단에 필요한 근거 |
|---|---|---|
| 코드만 S1-R로 갱신; approved/public 좌표·pending_public·기존 field 숨김/삭제·read projection 전환 없음 | 조건부 | 실제 배포 source/flag와 rollback의 보호 유지 확인. canonical 신규 pending 공개 계약 확인/수용. “과거 자료 전면 보호 완료” 및 “S1-R171로 canonical 보호 보장” 주장 제외. 기존 삭제/UI/GPS P1 명시적 위험 수용 |
| S1-R recent-sites의 기존 보호 표현 가점 제외만 반영 | 조건부, 범위 제한 | 새 server read에서 제외됨을 확인. old worker/cache/inflight로 예전 site 연관/가점이 잠시 재등장할 수 있어 즉시 전면 철회를 보장하지 않음. 기상 후보 안전 관문을 우회하는 문제로 확대하지 않음 |
| 기존 보호 approved를 hide/unpublish/reject하거나 공개 응답에서 자동 제거/가림하도록 바꾸는 전환 | 전환 전 차단 필요 | approved/pending/history/linked/fixed 파급 확인 및 old response가 새 보호·철회 상태를 역전시키지 않는 근거 |
| 기존 active field 공개점→hidden 또는 철회/삭제/보호 backfill | 전환 전 차단 필요 | old field GET/UI + 지연 GPS/chooser가 새 보호/삭제 상태를 복구하지 않는 근거. 이 코드 배포만으로 해결됐다고 표시 금지 |
| 현 사용자 owner-delete만 그대로 사용 | 기존 P1 후속, 운영 요건에 따라 승인 차단 | backend deleted 유지와 UI 재등장을 분리. “삭제 후 UI 계속 제거”가 필수 승인 기준이면 해결 전 승인 불가. 한정 배포의 기존 위험 수용이면 별도 후속 기록 |
| 관리자/운영자 읽기로 과거 공개 보호 행이 확인됐지만 이번 배포에서 정리하지 않음 | S1-P 기존 위험, 범위 승인과 분리 | 일반 공개 승인 원칙/민감 자료 공개 수용 여부를 운영자가 결정. 신규 개선만으로 기존 노출을 해결했다고 선언 금지 |
| 보호 판정 없는 구 Worker 또는 rollback source 불명 | 승인 조건 미충족 | tag/message/build명만으로 대체하지 말고 실제 source/보호 모듈 및 쓰기 모드 확인. 보호를 약화하는 rollback을 안전 대안으로 승인하지 않음 |

차단 조건은 새 기능 요청이 아니라 **전환 뒤에 확인된 보호/삭제 상태가 과거 응답이나 보류 콜백으로 다시 공개되지 않아야 한다는 승인 성질**이다. 단순 기다림, cache purge, write-maintenance만으로 이미 열린 클라이언트의 in-flight GET/GPS/팝업을 무효화했다고 가정하지 않는다.

## 공개 GET으로 확인 가능한 것과 추가 읽기가 필요한 것

| 확인하려는 사실 | public GET만으로 가능한 범위 | D1 SELECT/인증 admin 읽기가 필요한 범위 |
|---|---|---|
| 지금 공개 중인 지도점/이력 | approved/pending/site-history의 그 시각 응답 shape·종·locationHidden·현재 공개 좌표가 존재하는지 | raw row 전체/비공개 note/site_id/spot_key 상태, 누락·철회 행, 연결그룹 전체 |
| 지금 active field의 공개 보호 상태 | field-updates의 그 시각 목록·locationHidden·표시 상태. 보호 표현이 hiddenfalse이면 외부 공개 경로 문제를 확인할 수 있음 | 저장 원좌표와 공개점의 차이 boolean, 과거·만료·deleted 포함 여부, hidden flag/공개점 정합성 |
| 공개점이 실제 원좌표와 다른지 | 원좌표가 없는 public GET으로 증명 불가. flag true는 주장일 뿐 비교 검증 아님 | 승인된 private 읽기에서 좌표 값 대신 비교 boolean/집계만 반환 |
| 번식 키워드/보호 표현 대상의 과거 누락이0인지 | public approved/history에 note가 없고 집계/연결 때문에 전체 row도 보이지 않음. 빈 active 목록은 그 snapshot에 한정 | private species/note/상태를 현재 classifier로 읽기 평가. 결과는 대상/오류/hidden/노출 수 집계만 저장; 원문 export 금지 |
| 배포가 과거 데이터를 재분류/가림/철회하는지 | 배포 전후 공개 snapshot 변화 관찰까지만 가능. 변화없음은 모든 과거 영향없음 증명 아님 | 배포 계획의 migration/backfill/flag/action 검토와 private 행/상태 집계, 필요 시 운영 관리자의 전환 계획 확인 |
| 실제 S1-R 코드가 Worker/rollback에 있는지 | capabilities/version 표식이나 정상 GET만으로 classifier implementation 증명 불가 | 실제 Worker version source/배포 manifest의 실행 코드와 release/peer/write-mode 확인. root 담당 |
| old-response/GPS 경합이 없거나 실 서비스에서 발생했는지 | 순차적인 GET만으로 증명 불가 | 합성 제어 재현이 승인 근거. 실제 발생 빈도는 별도 비민감 운영 telemetry/기존 이슈 근거가 필요하며 이번 조사에서 주장하지 않음 |

추가 private 읽기는 현재 조사에서 실행하지 않았다. 운영자가 승인한 SELECT/admin 조회를 수행하더라도 원좌표/종 원문/note를 결과 파일로 내보낼 필요는 없다. 승인용 최소 결과는 표본시각·조회 범위·전체/활성/분류대상/현재 hidden/노출/연결·불완전 공개좌표 쌍의 집계와 비교 boolean이다. note/구분자/NFC/수량 판정은 SQLite의 확인되지 않은 REGEXP로 대체하지 말고 exact shared classifier와 일치하는 읽기 평가를 사용해야 한다.

“활성 field0” 또는 “공개 approved에서 문제0”은 전체 과거 DB, 비공개 행, linked/fixed 자식, 이후 승인/삭제, 이전 응답 경합까지0이라는 결론을 제공하지 않는다.

## Root의 별도 운영 공개 읽기 집계

아래는 root가 **07:33 당시** 수행하여 전달한 별도 aggregate다. **22:44 문서 마무리에서 현재 공개 자료 또는 전체 DB를 다시 확인한 결과가 아니다.** 이 독립 작업에서 운영 요청을 수행하거나 원본 응답을 저장하지 않았으며 source/local 결과와 합쳐 새 실행 수로 집계하지 않는다.

최종 공개 읽기 시각: **2026-10-11 07:33:45 KST**. 앞선07:32:51 집계 중 history의 unhidden은 좌표가 없는 history 행에 적용할 수 없어 null로 정정된 결과를 사용한다.

| 공개 snapshot 집계 | Root 전달 결과 | 한계 |
|---|---:|---|
| approved root spots | 52 | 공개 응답의 root spot 수; private DB 전체/철회/대기 행 수 아님 |
| unique history | 52 | history에는 좌표가 없음. history-unhidden=0으로 해석하지 않음 |
| fixed groups | 0 | 이 snapshot 범위 |
| root spot species로 old/new classifier가 sensitive로 판정 | 2 / 2 | note를 받지 못하므로 species view 판정 범위 |
| 새 classifier에서만 추가된 sensitive root spot | 0 | 이 공개 species snapshot 범위. private notes/과거 pending/만료 field까지0 아님 |
| sensitive root spot 중 locationHidden flag 없는 것 | 2 / 2 | **종 표현과 비가림 flag의 공개 위치가 함께 존재**. 공개점이 실제 원좌표인지 비교 검증은 아님 |
| recent-sites14 groups / old/new/newly-sensitive | 8 / 0 / 0 / 0 | 좌표·private note를 포함하지 않는 최근 집계 |
| active field-updates | 0 | 현재 활성 목록만0. 전체 과거 field DB나 이후 전환 경합0 증명 아님 |

이2 approved spot은 양 classifier에서 이미 sensitive인 기존 승인 이후 공개 정책/S1-P의 실제 잔여 사례다. S1-R는 approved 읽기 가림을 바꾸지 않으므로 코드만 배포하면 이 공개 표현/위치 상태를 유지한다. 무권한 유출 사고, 실제 원좌표 노출, 실제 조류 발생 확률로 단정하지 않는다.

따라서 최종 운영 조건에는 **기존 approved2의 공개 유지 위험을 범위 내에서 수용할지**, 또는 가림/철회 전환을 하여 위 old-response 조건을 먼저 충족할지 명시해야 한다. “현재 새 classifier 추가 대상0”만으로 이2 기존 사례의 보호 완료를 선언하면 안 된다. root는 ID·종 원문·좌표·note를 저장/공개하지 않고 aggregate만 보존했다고 전달했다.

root의 별도 Worker source 읽기는 당시 content/v2를 메모리에서 local build와 비교하여 현재 실행 코드와 과거 quantity 누락 판정을 확인했다. 구 version source 경로는 version metadata를 반환하여 **보호 유지 rollback source를 인증하지 못했다**고 전달했다. 이 문서는 미제공 전체 content hash를 만들어 쓰지 않는다. rollback의 승인 조건 미충족은 현재 공개 집계와 별도로 유지한다.

## 소스와 재현 출처

- 실제 승인 읽기: [public.js](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/public.js:339), recent 제외: [public.js](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/public.js:366).
- 보호/approved grouping: [shared.js](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/shared.js:326), [publicPayload](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/shared.js:591).
- 기존 field 읽기/신규 쓰기: [field-updates.js](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/field-updates.js:201), [신규 공개점](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/field-updates.js:250).
- 관리자 전환: [admin-actions.js](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/admin-actions.js:10).
- frontend: [approved load](/C:/Users/김진호/Documents/GitHub/birdmap/index.html:4704), [field load](/C:/Users/김진호/Documents/GitHub/birdmap/index.html:5265), [public point](/C:/Users/김진호/Documents/GitHub/birdmap/index.html:5524), [GPS callback](/C:/Users/김진호/Documents/GitHub/birdmap/index.html:5666), [owner-delete](/C:/Users/김진호/Documents/GitHub/birdmap/index.html:5722).
- 기존 증빙: `scripts/r6/actual_delete_race.mjs`, `results/r6/actual_delete_race.json`, `scripts/r6/protection_regression.mjs`, `results/S1_REVIEW.md`; 최종 DOM source별 clock와 ledgers는 `results/f23-b12e20c/dom` 및 finaldom 패키지에 따로 기록됨.

### SHA256

아래 frontend 네 함수는 before `b0975cad9f3112af38cc286a892bf6f06722ce12`, e9c, b12에서 모두 동일했다. 기존 위험과 새 S1-R 회귀를 구분하는 직접 source 근거다.

| 함수 | LF 정규화 추출 body SHA256 |
|---|---|
| loadFieldUpdates | `541be4a10f25982ecedf1e3fed9eace060989d943f8c9ddd14590d435e15dea1` |
| loadApprovedReports | `cdea822500158716be9597ff47f9a8de266ef9e801063c96093b22c0b3ba70a9` |
| fieldPublicPoint | `00a6f261128cc4f28087c670c539ff8db18a04e6dd0acdb178a52b4d139d8e27` |
| fieldNewsNavigate | `cffb30307a332965a5163e6d9b66d01ec5b19f127d6cfb11295648b9f2d336a7` |

최종89 tree의 fieldFind/publicPoint/newsNavigate도 b12와 같으며 fieldNavExternal만 TMAP chooser 변경으로 다르다. b12 external hash는 `3736e2a7906e345f82f64e7b37ee1a4d12ade25863124d34d066b0b2a3a249c6`, 최종89는 `fce895c4c9865d184b1467e5239fe84dd3afe4d4660b2ca974caccba1e7ddd71`이다.

실제 b12 파일 raw SHA256: shared `35710f2353ad8a0b6c99f111cb384ce1133c53724775f8f1e9e7108e23a62f5b`; public `6cd83da2cae4cbed2c685ad111411d3b38813dff047b65550c0f848dc7486cbe`; field-updates `1e23ded487f91485794a60a8d359eae6945a3acad41685a1e6313d5658973c84`; admin-actions `97b4f9c7a4311d025844094bc83c3b81c020f8145c79592dde916928b6194fe9`. 네 파일 모두 e9c source와 LF 정규화 후 동일했다.

추가 VM 실험은 호출되는 실제 함수 body를 위 source에서 그대로 추출했다. 외부 연결/원좌표 output/운영 자료 저장을 피하려고 렌더러와 GPS/route 의존성을 stub으로 두었으며, 이를 실제 Leaflet/실 앱 통과로 집계하지 않았다. 첫 보조 실행은 정리된 `.scratch/combinedFinal` 경로가 없어 종료했고, 그전 완료된 b12 memory delete200 결과를 보존했다. 이후 final tree blob으로 읽기 경로를 바꿔 위4 GPS 사례와 정책 확인을 완료했다. 제품 source나 assertion을 완화하지 않았다.
