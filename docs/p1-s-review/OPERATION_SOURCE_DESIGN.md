# PR13 S1-R 소스 기준과 보호 유지 복귀 설계

작성/최종 읽기 확인: 2026-10-11 22:51:01 KST. PR head `b12e20c1b6d856a021898a0c1c9221b30393a221`. 이 문서는 소스 및 기존 로컬 시험을 근거로 한 운영 설계이며, 배포·rollback 실행 준비 완료 또는 운영 실행 승인으로 해석하지 않는다. 이번 재개에서는 제품 파일·브랜치·운영 설정·D1·실사용자 자료를 변경하지 않았고 새로 쓴 파일은 이 문서뿐이다.

## 결론과 관측 시점

보호를 유지하는 서버 소스 기준은 S1-R 첫 commit `dc6f0e58a709e82d689e36ce2dc4b857e285821e`로 고정할 수 있다. 이 commit과 PR head의 `reports-api/src` 전체 16파일은 Git blob이 모두 같다. 읽은 최신 로컬 `origin/main`의 서버 소스에 이 commit의 shared.js만 적용하는 구성도 PR head와 16/16 동일하므로 별도 제품 수정이나 새 기능을 만들 필요가 없다.

현재 확인된 운영 public Worker는 S1-R 이전 코드다. 따라서 “현재 Worker를 그대로 두면 S1-R 보호가 유지된다”는 설명은 성립하지 않는다. 사용자 별도 승인 후 S1-R Worker를 배포하고 새 version을 검증·기록한 뒤, 프런트 문제가 생기면 그 새 서버를 유지하면서 Pages만 확정된 SHA로 복귀시키는 방안이 우선이다. 과거 version `16dae92a`는 실제 실행 소스가 입증되지 않아 보호 유지 rollback 대상으로 채택하지 않는다.

| 증거 | 실제 시각(KST, 2026-10-11) | 범위 |
|---|---|---|
| root Worker 메타데이터/content 비교 | 07:28:28~29 및 최종 07:31:24~28 | 그 시각의 current public Worker와 전후 deployment 일치. 이 문서 작성 시점의 새 운영 조회가 아님 |
| root 직전 version source 경로 확인 | 07:31:56~57 | GET200이지만 version metadata JSON을 반환; 실행 source 확인 실패 |
| 독립 기존 서버 시험 99개 | 07:32:10.742 | 실제 로컬 모듈 및 메모리 SQLite 시험, 운영 Worker/D1 아님 |
| 독립 canonical 합성 10사례 | 07:35:01.208 | parent와 b12의 실제 handler 비교; 공개/승인/최근가점 경계 |
| 이번 재개 Git blob 재확인 | 22:45:26 및 22:46:22.876 | 로컬 Git 객체 읽기만. 새로운 운영 GET/fetch 없음 |

오전 최신 main 감사는 `89e7e339812fbd9c096008cb5631c88fd8765c03`이었다. 22:46에 읽은 로컬 remote ref는 `43bff43301d5915a344bf2c20987698597cf8870`이다. 이는 별도 네트워크 재확인 결과가 아니며, 자동 JSON·추천·브라우저 증거 시각을 오늘 밤으로 갱신하지 않는다. 두 main의 서버 소스 구성에서 S1-R 차이는 shared.js 하나다.

## S1-R 첫 변경의 정확한 범위

첫 commit은 `dc6f0e58a709e82d689e36ce2dc4b857e285821e`(2026-10-09 09:00:06 +09:00), parent는 `18171613923ae5cf0a72512eae805c0005037115`다. Git 이력상 이 commit 전체는 아래 3파일, 91줄 추가·4줄 삭제다.

| 파일 | 변경 |
|---|---|
| reports-api/src/shared.js | 19줄 추가·4줄 삭제. 종 정규화와 민감종 판정만 변경 |
| reports-api/test/protection.test.mjs | 신규 57줄. 보호 수량·구분자 및 일반종 오탐 회귀 |
| reports-api/test/field-updates.test.mjs | 15줄 추가. 보호 수량 표현의 신규 현장소식 공개점 가림 회귀 |

[normalizeSpecies](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/shared.js:136)는 newline을 먼저 구분자로 처리한 뒤 토큰별 control 문자를 제거한다. 실제 위치는 source checkout의 shared.js:136이다. [isSensitiveReport](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/shared.js:326)는 shared.js:317~331에서 NFC 정규화·정확 종명 일치 이후 `보호종명 + 숫자(+마리/개체)`를 판정하고 comma/semicolon/가운뎃점/slash/CR/LF로 기존 토큰을 다시 나눈다. 기존 보호종 19종과 번식 키워드 6개는 유지되며 부분 문자열 판정으로 바꾸지 않는다.

public.js·admin.js·admin-actions.js·field-updates.js·canonical 모듈·notify·저장 스키마·설정·package는 이 commit에서 변경되지 않았다. 공유 함수를 호출하는 기존 경로의 결과가 달라지는 것이 변경 효과다.

| 실제 호출 경로 | S1-R 효과와 범위 |
|---|---|
| public.js:135 handleSubmit, :153 | NORMAL legacy 신규 제보의 pending_public 판정 개선 |
| public.js:367 handleRecentSites, :390 | approved/최근/site 연결 SQL을 통과한 자료도 새 민감 판정이면 최근 가점 집계에서 제외 |
| field-updates.js:97 protection, :219~250 신규 접수 | 신규 보호 표현의 공개점을 대략 좌표로 저장. 번식 키워드 접수 거부 정책 유지 |
| admin-actions.js의 입력 종 정규화 | 관리자 입력에서 공유 normalizeSpecies 사용. 승인 종 전체를 자동 비공개로 바꾸는 정책은 없음 |
| public.js:97 handleCanonicalSubmit, :117 | 운영 pending flag와 hideLocation에 따른 기존 canonical 공개 계약. legacy :153 보호종 pending 분기를 실행하지 않음 |

S1-R는 기존 approved/pending/field 행의 공개점·status·pending_public을 일괄 재작성하지 않는다. approved/history 전면 비공개와 기존 연결 관계의 간접 위치, 과거 자료 정리는 S1-P 별도 정책 범위다. 최근 가점의 읽기 제외와 지도 공개 상태 전환을 같은 변경으로 표시하지 않는다.

## 고정할 소스와 빌드 지문

22:46:22.876 KST, `git ls-tree`와 각 파일의 `git rev-parse <SHA>:<path>`로 확인했다. 전체 서버 16파일의 dc6/b12 blob은 동일하다. main43과 b12의 서버 차이는 shared.js 하나이며 main43 서버 + dc6 shared 구성은 b12와 완전히 같다. package.json, wrangler.public.toml, wrangler.admin.toml, schema.sql도 main43/dc6/b12의 blob이 모두 같다. 새main의 비서버 변경을 과거 서버 build에 섞어 추정하지 않는다.

| 주요 소스 | Git blob ID: parent/main → dc6/b12 |
|---|---|
| shared.js | `4e7194cfa089f9070ef597fd94674c3dfc4dcb92` → `cd078609d3396c63c4e609d999bfd8d1c4aea009` |
| public.js | `e20694e6f83251672c44699af8032ce56b0b8c7c` → 동일 |
| admin.js | `e6b40f4c6ff12dd01bbb9f3e288f8f1ca07b9c09` → 동일 |
| admin-actions.js | `3db5f82edd3adebccd47a543a256d818874ba98e` → 동일 |
| field-updates.js | `bd0fb673d15a1ac76282a9fef7e8489dc23f130b` → 동일 |
| canonical/control.js | `23077260845f76bfe6cb5a3505f23a9a0f40d056` → 동일 |
| canonical/data.js | `d7d17814de9762a004d95c828df51f78401994c2` → 동일 |
| canonical/persistence.js | `d0139c31f73e3fdd334618ebf1b2dc84a39badf0` → 동일 |

root의 [최종 Worker source 비교](results/operation-ready/worker_git_source_comparison_final.json)는 public entry point를 esbuild 0.28.2, bundle/ESM/neutral/es2022, workerd·worker·browser conditions, external source map, legalComments:none, keepNames:true로 메모리 빌드했다. root가 실제 실행 소스를 읽고 대조한 증거이며, 이 독립 작업에서 운영 source를 다시 요청하지 않았다.

| 대상 | SHA256 / 비교 결과 |
|---|---|
| 당시 current public content의 JS | `045b544db305deb73a5e745550a613ee10078c918e001045a16549e522e936c4`, 71439 bytes |
| 41650e43f80fadb2bfd9f80b18d958862f673551 및 S1-R parent 로컬 build | `f43ea89c49aa16dc7dc7de7bac962fe99d0eb5228601c075ba50639b97783822`, 71404 bytes |
| current와 위 build의 동일성 | build에 실제 sourceMap footer 35bytes를 붙이면 byte 동일(sourceMapFooterEqual=true). footer 없는 build 자체의 byteEqual=false도 원장에 보존 |
| current/parent 정규화 지문 | `6fbef4039afc25b9a5141124a24ff6eae2c9d24d4d7899b141bb08bd41e28694` |
| dc6/b12 S1-R public build, footer 제외 | 양쪽 동일 `6dcff1f13a1701ff5cb6b0461ac322462bb868689a25dc21dbe7338b28298b52`, 71883 bytes |
| dc6/b12 S1-R 정규화 지문 | 양쪽 동일 `ed9aa1fd6de34aa6e6dd3b5cefd0f480f78b2ce0ab852e4f9b1d63fba516a7bc` |

따라서 현재 public Worker에 S1-R가 이미 배포됐다는 판정은 하지 않는다. root의 실제 compiled classifier 합성 13조건도 bare 보호명 1개만 판정되고 수량·혼합 7개는 누락, 일반 5개 오탐0이었다. 이는 현재 소스와 parent 비교를 보조하며, 13조건을 운영 제보 접수 시험으로 합산하지 않는다.

현재 version `494b97d1-69ab-40f7-bbbf-e8c6e3c5effc`의 100% deployment와 source 비교 전후 동일성은 위 오전 시각에 확인됐다. 직전 `16dae92a-4bd7-4fda-ba90-d5075604d4db`의 두 source 경로는 metadata JSON hash `863ab5178b85af561f98429603765b762f95f0bf71c36b009b8a0aa4b863f22a`를 반환했다. [직전 version 시도 원장](results/operation-ready/previous_version_source_attempt.json)의 sourceConfirmed=false를 유지한다. GET200·version 존재·같은 binding 이름으로 보호 구현을 입증할 수 없다.

## 서버 유지와 소스 복귀 설계

| 상황 | 설계 |
|---|---|
| 승인 전 현재 상태 | 현재494를 보호 복귀 대상이라고 기록하지 않는다. dc6 소스 및 위 S1-R bundle 지문을 보존 가능한 기준으로 고정하되 새 운영 version을 만들었다고 주장하지 않는다 |
| 승인 후 S1-R 서버 배포, Pages에서 문제 발생 | 실제 검증된 새 S1-R Worker를 유지하고 Pages만 확정된 pre-PR SHA/배포 artifact로 복귀. main 전체 revert가 자동으로 서버까지 구버전으로 되돌린다고 가정하지 않는다 |
| 나중 서버 변경 후 복귀 필요 | 고정된 dc6/b12 서버 소스와 검증된 빌드 조건으로 S1-R를 유지하는 artifact를 재사용/재구축. 실제 version·config·peer 조건 확인 후 별도 승인 범위에서만 실행 |
| S1-R 자체에 서버 문제가 발생 | 동일한 dc6 artifact는 그 변경 자체를 취소하는 대안이 아니다. 보호가 약한 parent/현재494/소스 불명16dae로 즉시 회귀하는 것을 보호 유지 복귀라고 부르지 않는다 |
| 기상 validator만 문제 | 서버 및 D1 복귀와 구분해 해당 validator/Pages 변경 범위를 확정. 자동 JSON을 수동 과거 파일로 덮지 않는다 |

향후 승인된 배포에서 반드시 새 version ID를 실행 후 기록한다. 아직 없는 ID를 예약하거나 지어내지 않는다. 최소 원장은 public/admin 중 실제 대상, source SHA와 모듈 blob 목록, entry point별 bundle hash와 footer 처리, 정확한 Node/esbuild/Wrangler 버전·빌드 옵션, 적용 config의 비밀 제외 지문, deployment ID·시각·percentage, 배포 전후 version 연결, 실제 읽기 보호 판정 결과, Pages 복귀 SHA/배포 ID, DB 무변경 범위다.

저장소 package script는 wrangler@latest를 쓰므로 같은 소스 SHA만으로 향후 동일 bytes가 보장되지 않는다. 배포를 수행하는 쪽에서 tool 버전과 artifact를 고정해 남겨야 한다. 이번 작업은 새 build/deploy/rollback 명령을 실행하지 않았으며 기존 root public build 지문을 독립 admin 운영 소스 증거로 확대하지 않는다. public만 배포할지 admin도 같은 shared 판정을 적용할지는 실제 배포 범위로 명시해야 한다.

Pages 복귀 SHA와 그 시각 최신 main 결합/CI/자동 데이터는 별도 운영 원장 대상이다. 오전 최종 main89·기상/추천/Chrome 결과를 오늘 밤 새로운 main에 그대로 적용됐다고 표시하지 않는다. 기존 보호/철회 전환의 old-response 및 지연 길안내 조건은 [독립 보호 전환 설계](OPERATION_PROTECTION_DESIGN.md)에 귀속한다.

## D1·설정·dual write·Peer 호환 조건

canonical control은 [control.js](/C:/Users/김진호/Documents/GitHub/birdmap/reports-api/src/canonical/control.js:17)의 capability와 :32 assertWriteGate를 사용한다. S1-R는 이 계약을 변경하지 않는다.

| 조건 | 소스 기준과 운영 확인의 한계 |
|---|---|
| 저장소/DB | 동일 REPORTS_DB identity와 기존 schema 유지. Worker 복귀는 DB를 복구하지 않음. migration/backfill/seed/purge/restore/행 재작성·승인기록 보상 변경을 포함하지 않음 |
| schema | SCHEMA_VERSION=phase2a-0001. 실제 9테이블의 DDL/index/trigger fingerprint `76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0`가 일치해야 ready. 설정 문자열만 같아도 실제 DB 준비를 입증하지 못함 |
| canonical flags | REPORTS_WRITE_MODE=CANONICAL_DUAL_WRITE, REPORTS_DUAL_WRITE_ENABLED=true, REPORTS_CONFIRMATION_REQUIRED=true와 production의 REPORTS_REMOTE_VERIFIED=true 등 기존 계약 유지. pending flag는 0/1의 운영 정책이며 임의 변경하지 않음 |
| release/peer | nonempty activation/release/peerRelease, service REPORTS_PEER, gate token, 반대 역할 ready가 필요. mode/build/schema/activation 및 양방향 release 기대값이 일치해야 쓰기 허용 |
| mixed version | BUILD_CAPABILITY=phase2c-dual-v3 유지. 한쪽만 release 기대값을 바꾸거나 호환되지 않는 peer가 섞이면503 ROLLOUT_NOT_READY. 버전 교체 순서와 실제 target scope를 정해야 함 |
| NORMAL fallback | dual flag가 true인 NORMAL은 닫힘. dual flag false의 구 writer는 Peer gate를 거치지 않을 수 있어 external freeze 필요. “구버전이라 자동 fail closed”라고 추정하지 않음 |
| READ_ONLY_MAINTENANCE | reports POST와 admin mutation은503/Retry-After60, GET 유지. 전면 비공개 또는 전체 쓰기 동결을 뜻하지 않음 |
| field 경로 | public.js:476은 field handler를 reports gate(:517)보다 먼저 실행. field-updates.js:382~388의 create/status/confirm/delete는 이 gate를 호출하지 않는다. maintenance flag 하나로 field 쓰기까지 중단됐다고 주장하지 않음 |
| 원자료/감사/멱등 | canonical/data.js:37 applicationDb의 raw/reviews/audit update/delete 제한과 persistence.js:33의 실제 batch/요청 fingerprint/replay 계약 유지. 오래된 소스 복귀로 tombstone·revision·replay 의미를 약화하지 않음 |
| 인증·비밀 | 기존 binding/Access/Turnstile/salt/peer 인증 기능 유지. 이름·비밀 제외 지문을 확인하며 secret 값/원 설정을 결과로 저장하지 않음 |

현재 metadata에서 mode와 pending1 및 binding 이름 일치는 root가 확인했다. 이것을 두 Worker의 모든 실행 코드·실제 peer readiness·DB schema·모든 비밀값 동일성의 증거로 확대하지 않는다. [Phase2C 기존 정책](../long-term-db-phase2c/README.md:16)의 명시 확인, :20 maintenance, :21 mixed-version, :30 staging rollback 결과는 당시 staging 범위이며 현재 production S1-R 복귀를 이미 검증했다는 뜻이 아니다.

## 실제 canonical 합성 시험과 기존 정책 경계

오전07:35:01.208 KST에 parent1817161과 b12를 각5사례 실행했다. git show로 읽은 실제 모듈을 vm.SourceTextModule로 연결하고 기존 reports-api/test/helpers.mjs의 canonicalDb() 및 reports-api/local-test/helpers.mjs의 environments()/installAuthStubs()/input()/uuid() 구조를 재사용했다. SQLite는 :memory:이고 실제 schema.sql + 기존 canonical migrations를 사용했다. synthetic peer는 실제 public/admin handler를 직접 호출했다. 운영 HTTP POST·실 D1·실제 Access 인증·메일 발송은 없었다.

각 사례는 명시 non_breeding_confirmed=true, hideLocation=false, pending1, 합성 좌표·합성 request ID·등록한 합성 site19를 사용했다. 실제 local submit→pending GET→인증 대역 local approve→approved GET→recent-sites GET을 실행하고, b12 index의 실제 weeklyRecentReportBonus 함수로 가점 결과를 확인했다. 좌표 값은 결과/문서에 쓰지 않았고 합성 입력과 동일 여부 boolean만 비교했다. production 모드/remote-verified 및 peer 설정도 합성 값이므로 운영 readiness의 증거는 아니다.

| 합성 사례 | parent와 b12의 접수/공개/승인 | parent 최근 가점 | b12 최근 가점 |
|---|---|---:|---:|
| bare 보호명 | 양쪽 submit201, stored pending_public1, pending공개, approve200, approved공개 | 제외/null | 제외/null |
| 보호명+숫자 | 위와 동일 | 포함/12 | 제외/null |
| 일반명 newline 보호명+숫자 | 위와 동일 | 포함/12 | 제외/null |
| 일반명+수량 | 위와 동일 | 포함/12 | 포함/12 |
| 일반명 + 번식 note, 명시 확인true | 위와 동일 | 제외/null | 제외/null |

10사례 모두 hide=false의 receipt/pending/approved 공개점은 합성 입력과 같았다. receipt의 publicVisibility 문자열 approximate만으로 offset을 보장할 수 없다. 실제 spot.approximate는 hide와 연결된다.

이 결과는 기존 canonical 계약이다. quickInput(:5)은 명시 true를 요구하며 종·월·지역으로 번식 여부를 추론하지 않는다. canonical submit(:117)은 운영 pending flag와 hideLocation을 사용하고 legacy 민감 판정을 호출하지 않는다. 따라서 pending1에서 보호종 자체로 pending 자동 보류가 되지 않는 점을 S1-R 신규 결함으로 분류하지 않는다. 번식 note와 명시 확인true의 모순 입력도 이번 변경 전부터 같은 경로로 허용됐으며 새 정책을 설계하거나 변경하지 않았다.

S1-R 회귀의 legacy 보호 보류 및 신규 field 가림 통과를 이 canonical 공개 경로 전체의 전면 비공개 보장으로 확대할 수 없다. 사용자 운영 승인에는 현재 명시 확인/pending1 계약과 S1-P 별도 범위를 정확히 설명해야 한다. 보호 상태를 새로 가리거나 철회하는 별도 작업이 포함된다면 앞서 확인된 기존 캐시/old-response 전환 조건도 별도로 적용한다.

## 명령·하네스 오류·검증 한계

기존 독립 서버 실행 명령은 아래와 같았다. source checkout에서 Node24.18을 사용했으며 exit0, 99tests/99pass/0fail/0skip이다. PR 전체 자동621 또는 다른 범위와 합산하지 않는다.

```powershell
& 'C:/Program Files/nodejs/node.exe' --test reports-api/test/protection.test.mjs reports-api/test/field-updates.test.mjs reports-api/test/public-worker.test.mjs reports-api/test/admin-worker.test.mjs reports-api/test/recent-sites.test.mjs reports-api/test/notify.test.mjs
```

| 독립 도구 원장 | 결과 |
|---|---|
| chunk71db88, 07:32:10.742 | 위99 시험 exit0 |
| chunkd44fb0, 07:33:33 | 초기 inline VM exit1. VM Webglobal에서 URLSearchParams가 누락되어 actual shared.verifyTurnstile 실행시 ReferenceError; 제품 결함으로 분류하지 않음 |
| chunka4b1a0, 07:35:01.208 | Webglobal URLSearchParams/FormData/Blob를 제공하고 unmodified 실제 모듈/guard로 실행. canonical10사례 exit0 |
| chunk49c7ee, 22:44 무렵 | git diff --name-only dc6 b12 -- reports-api/src 출력 없음, 첫 commit stat 3파일91+/4- 확인 |
| chunk093a53, 22:45:26 | 전체16 source의 dc6/b12 동일 및 main89+shared recipe 동일, exit0 |
| chunkff002d, 22:46:22.876 | 현재 로컬 main43 recipe16/16 및 config/package/schema blob 동일, exit0 |

canonical 시험은 Node의 --experimental-vm-modules --input-type=module -로 inline 실행했다. 하네스 script/output 파일은 쓰지 않았으며 도구 출력의 boolean·status·가점 결과를 이 문서에 귀속한다. 초기 실패를 삭제하거나 제품 assertion을 완화하지 않았다. 실제 worker runtime·Cloudflare D1 batch semantics·현재 운영 관리자/peer 상태·Leaflet DOM을 검증한 것은 아니다.

22:46 재확인은 Git 객체 읽기와 기존 operation-ready 결과 읽기뿐이다. 최신 main 네트워크 확인과 merge/CI/Pages artifact 검증, 운영 설정/peer readiness, 승인 후 새 Worker version/source 연결은 실제 실행 담당자의 다음 단계 조건이다. 이 문서만으로 배포나 롤백 준비 완료를 선언하지 않는다.

## 별도 보존 원장

- 현재 source·활성 deployment: [worker_git_source_comparison_final.json](results/operation-ready/worker_git_source_comparison_final.json), [worker_source_metadata.json](results/operation-ready/worker_source_metadata.json).
- 구 source 미입증: [previous_version_source_attempt.json](results/operation-ready/previous_version_source_attempt.json).
- root 오전 공개 읽기: [public_read_impact_final.json](results/operation-ready/public_read_impact_final.json). approved52, old/new sensitive2/2, 신규 추가0, 해당2의 비가림 flag라는 공개 snapshot 집계이며 실제 원좌표 비교나 private DB 전수 보장 아님.
- 현재 운영 조건과 보호 전환 영향: [F23_RECHECK.md](F23_RECHECK.md), [OPERATION_PROTECTION_DESIGN.md](OPERATION_PROTECTION_DESIGN.md), [구현 NEXT_SESSION](../p1-s-implementation/NEXT_SESSION.md:106).

비밀값·운영 원문·원좌표·DB export·raw Worker source를 이 문서에 저장하지 않았다. 새 제품 파일/branch 수정0, 운영 쓰기0, 배포0, rollback0, commit/push0이다. commit/push와 최종 운영 승인 판단은 root가 담당한다.
