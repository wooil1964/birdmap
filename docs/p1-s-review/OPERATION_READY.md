# PR #13 운영 승인 준비 — 읽기 전용 최종 보고

작성: 2026-10-11. Worker/공개자료 관측 22:44–22:47 KST, PR/main/Pages/CI 최종 재조회 22:59 KST; 오전 관측은 별도 원장으로 보존.

## 판정

**조건부 승인 유지 — 실제 운영 반영은 별도 승인 대기.** b12의 기존 코드 차단 결함은 독립 검증에서 해결됐다. 이번 운영 준비에서는 현재 소스 연결과 Pages 기준을 확인했지만, 이번 검증에서 S1-R를 유지하는 실제 Worker rollback 버전과 C 정책을 유지하는 Pages 복귀 release를 아직 확보·입증하지 못했다. 현재·직전 Worker로 되돌리는 계획은 승인하지 않는다.

- 검증 PR head: `b12e20c1b6d856a021898a0c1c9221b30393a221`.
- 최신 원격 main 및 현재 Pages: `43bff43301d5915a344bf2c20987698597cf8870`.
- 임시 결합 tree: `deec588e937ed309b11f9739c02b6eae22772c3d`, merge-tree exit 0/충돌 0. 실제 merge commit이 아니다.
- 제품 변경·main 병합·Worker upload/deploy/rollback·Pages 배포·D1 및 실제 사용자 자료 변경·workflow dispatch/rerun: 모두 0.

## 1. 운영 Worker 소스와 Git 연결

|대상|읽기 확인 및 코드 근거|안전 rollback 판정|
|---|---|---|
|현재 `494b97d1-69ab-40f7-bbbf-e8c6e3c5effc`|deployment `cfe309b7-3dad-4844-bbd7-4943b0f78238`, 100%. 실제 public.js 71,439 bytes의 SHA256 `045b544db305deb73a5e745550a613ee10078c918e001045a16549e522e936c4`. 전후 deployment 동일.|**불가:** 실제 함수에서 보호종 수량·혼합 표현 7조건을 놓치며 S1-R가 없다.|
|직전 `16dae92a-4bd7-4fda-ba90-d5075604d4db`|버전·바인딩·배포 이력 확인. version content/content-v2 시도는 source가 아니라 동일 메타데이터 JSON을 반환했다.|**불가:** 실제 소스 및 S1-R 유지 증명 실패. 날짜·동일 바인딩으로 대체하지 않는다.|

현재 모듈은 esbuild 0.28.2/keepNames true로 `41650e43f80fadb2bfd9f80b18d958862f673551`를 in-memory bundle한 결과에 실제 source-map footer를 붙였을 때 전체 문자열이 일치한다. PR parent `18171613923ae5cf0a72512eae805c0005037115`도 같은 서버 소스로 같은 결과다. **소스/빌드 동등성은 입증했으나, 유일한 업로드 Git checkout이나 서명된 Git provenance를 입증한 것은 아니다.** footer 없는 byteEqual=false도 증거에 보존했다. Worker etag를 단일 모듈 SHA256과 같다고 가정하지 않았다.

실제 배포 모듈의 13개 합성 판정에서 정확 종명은 보호되지만 수량 표현 5개와 줄바꿈·슬래시 혼합 2개는 false였다. 일반종 5개는 false. 이는 운영 제보 등록 시험이 아니라 메모리에 받은 실제 함수를 실행한 결과다. 원본 소스·token·secret 값은 저장/출력하지 않았다.

상세: [소스 연결 및 rollback 설계](OPERATION_SOURCE_DESIGN.md), [원본을 제외한 소스 비교 결과](results/operation-ready/worker_git_source_comparison_latest.json).

## 2. 보호 기능을 유지하는 rollback 설계

첫 S1-R commit `dc6f0e58a709e82d689e36ce2dc4b857e285821e`와 b12의 reports-api/src 16개 파일은 동일하다. 최신 main의 서버 소스에 이 commit의 shared.js만 결합해도 b12와 16/16 동일하다. PR의 서버 제품 변경은 shared.js 보호 표현 처리이며 public/admin/field/canonical 및 schema/config의 별도 변경은 없다.

안전한 기본 경로는 **새 S1-R 서버를 유지하고 다른 변경만 되돌리는 것**이다. 미래 서버 회복 artifact도 이 shared.js와 호환 설정·D1 schema/peer/dual-write 상태를 유지해야 한다. 별도 승인을 받은 첫 S1-R 배포 후 실제 version ID, 모듈 hash, traffic, 설정/peer 호환, 보호 합성 결과를 기록하여 보호 baseline을 확정한다. 지금은 검증된 새 S1-R version을 등록하지 않았으며 로컬 bundle hash를 배포된 version으로 취급하지 않는다.

기존 494/16dae 전체 rollback은 금지 대상이다. READ_ONLY_MAINTENANCE도 field 경로 및 공개 읽기 전체를 닫는 전면 안전 모드가 아니므로 fallback으로 승인하지 않는다. Worker version 복귀는 D1 자료 복귀를 의미하지 않는다. [Cloudflare 버전·배포 문서](https://developers.cloudflare.com/workers/versions-and-deployments/)에서 version에 연결 자원의 상태가 포함되지 않는다고 설명한다. 설정·secret 이름 동일성은 값 동일성을 증명하지 않는다.

## 3. 기존 공개 자료와 보안 범위

22:47 KST 공개 GET 관측은 approved 54 spot/54 history/fixed 0, recent-sites 9곳, active field 0이다. 이전 07:33 관측 52/8과 섞지 않는다. 공개 payload의 종명 기준으로 구·신 판정 모두 보호 대상 2건, 신규 보호 분류 0건이며 root spot 2건은 locationHidden 없이 공개 위치가 남아 있다. history 자체에는 좌표가 없으므로 위치 관측값은 null이다.

이 2건은 **기존 승인 후 공개 정책의 관측**이며 새로운 무단 유출 사고라고 단정하지 않는다. 원래 좌표와의 동일성, 사적 note, 관리자의 승인 판단, 비공개·삭제·만료 D1 행은 감사하지 않았다. 원시 ID·종명·좌표·note·제보자 정보를 저장하거나 댓글에 노출하지 않았다.

S1-R만 배포해도 기존 approved/field 행의 저장 공개 상태는 자동 변경되지 않는다. recent-sites는 새 판정으로 읽기 제외가 가능하지만 이는 공개 좌표 철회와 다르다. 현재 CANONICAL_DUAL_WRITE/pendingPublic1의 명시적 비번식 확인·hidefalse 경로는 legacy isSensitiveReport를 쓰지 않으며, 보호종 자체로 pending 위치를 자동 보류하지 않는다. 실제 parent/b12 10개 in-memory 합성에서 이 기존 정책은 동일했다. 원설계의 S1-R 표현 방어와 S1-P 승인 후 전면 보호를 구분한다.

**잔여 보안 판단:** 본인 삭제 후 늦은 GET의 마커 복귀, 가림/철회 후 늦은 응답의 공개 상태 복귀, 이미 선택된 지점의 지연 GPS callback으로 길안내 가능한 상태는 재현된 기존 결함이다. 삭제 서버 상태는 유지되지만 브라우저 표시가 되살아날 수 있다. 실제 운영 사고가 발생했다고 확인한 것은 아니다.

- 이번 순수 S1-R/C 배포에 backfill·가림·철회·S1-P 전환을 포함하지 않고 기존 공개 정책 및 잔여 위험을 운영자가 명시적으로 수용하면 별도 P1 보안 작업으로 추적할 수 있다.
- **기존 위치의 가림/철회 또는 S1-P 전환 전에는 응답 세대/삭제 tombstone/최신 보호 상태를 확인하는 길안내 guard와 지연 callback 방어가 필수 선행 조건**이다.
- 즉시·지속적인 본인 삭제 UI 철회가 운영 승인 요구사항이면 삭제 응답 race도 배포 전 차단 사항이다. 그렇지 않으면 신속한 별도 보안 PR을 예약해야 한다. S1-R가 이를 해결했다고 보고하지 않는다.

상세 및 기존/신규 구분: [보호 정책과 stale-response 평가](OPERATION_PROTECTION_DESIGN.md), [정제 공개 GET 집계](results/operation-ready/public_read_impact_latest.json).

R5 극단 숫자 문자열의 JS/Python 차이는 기존 별도 P2로 남는다. 이번 시각 자료형 방어가 R5까지 해결했다고 보지 않는다. 신뢰된 생성 경로 및 최종 추천 차단 시험에서는 새로운 점수 우회 증거가 확인되지 않았으며, 순수 S1-R/C 한정 반영의 추가 차단 사항으로 판정하지 않았다.

## 4. Pages 복귀 기준

현재 Pages deployment 6994918694/status 19598183495 success, run 38135965715 success이며 SHA는 `43bff43301d5915a344bf2c20987698597cf8870`이다. 실제 Pages index/notices/today/week GET의 LF 해시가 exact43 raw와 일치했다.

**43은 현재 기능의 배포 전 복귀 기준이지, 새 C/F2/F3 안전 계약을 유지하는 무조건 안전 rollback SHA가 아니다.** 전체 43으로 복귀하면 새 프런트 guard를 잃는다. 새 Worker 유지만으로 기상 출처/loader 적격성 손실이 보완되지는 않는다. 별도 승인된 첫 Pages 반영 시 새 보호 release SHA를 기록하고, 그 이후 복귀는 eligibility/loader/90분/강수/선상/팝업 안전 계약을 유지하며 비안전 변경만 되돌려야 한다. 자동 기상·조석 JSON을 과거 값으로 되돌리지 않는다.

## 5. CI 대체와 최신 main 결합 근거

22:59 최종 읽기에서도 PR head b12의 Actions/status/check-runs는 모두 0이다. head/main/Pages SHA도 동일했다. PR 전용 CI 성공은 없다. 최신 main의 기상 자동 갱신 및 Pages run 성공은 운영 workflow 증거이며 b12 CI 성공이 아니다. 운영 commit/push·배포를 수행하는 workflow를 임의 실행하지 않았다.

CI 대체 근거는 기존 exact b12 독립 자동 621 pass/0 fail/1 skip, S2 182·특별21·팝업12, F1/F2/F3/DOM 및 고정10월8일 22:40의190곳/176후보 ON/OFF 전체 signature·상위10 보존이다. 실행 명령·hash·성공/실패 원장은 F23_RECHECK.md와 results/f23-b12e20c에 있다. 이전 lifecycle35/45·선상40/65는 원형 실패와 실제 정책 계약 검토를 남겼으며 임의 성공 처리하지 않았다.

89e7e339 이후 최신43의 변경은 weather_today/week 두 파일뿐이다. 제품·공지·조석·workflow는 동일하다. 최신 결합은 충돌0, main의 자동 자료 보존, validator today/week 통과, 추천 관련112함수 동일, 실제22:47KST의176후보/최종10 모두 적격·안전, 예외0을 확인했다. 현재 today 저장 validator의190개 적격 metadata와 현재 JS 적합도 관문 scoreAllowed0은 서로 다른 시간 계약이며 혼동하지 않았다. 정상 주간 자료로176후보가 유지됐다.

기존 고정 입력 ON/OFF 결과와 최신 기상·recent9 운영 관측은 별개다. 최신 추천 실험은 제보 OFF이며 실제 recent9를 과거 제보 스냅샷과 섞지 않았다. 최신43+PR 결합의 전체621나 새 Chrome 전체 재실행으로 확대하지 않는다. 동일 index에 대한 기존5화면폭 Chrome 검증은 코드 회귀 근거로 유지한다.

상세: [Pages·workflow·CI 관측](OPERATION_PAGES_CI.md), [실제 날짜 validator](results/operation-ready/latest-main/latest_main_validator.json), [현재 추천](results/operation-ready/latest-main/js_current190.json), [재현/증거 manifest](results/operation-ready/execution_manifest.json).

## 6. 완료 항목과 남은 운영 승인 조건

|항목|상태|
|---|---|
|현재 version·실제 source·Git build 연결|완료; unique signed Git provenance는 아님|
|직전 S1-R 보호 유지 검증|증명 실패; 안전 rollback으로 승인 불가|
|새 S1-R를 유지하는 source 복구 설계|완료; 실제 보호 version 등록은 미완료|
|기존 공개 영향·cache 위험 평가|완료; 전면 비공개 보장 및 D1 감사는 범위 밖|
|Pages 현재 SHA/서비스 일치|완료; C 정책 유지 release/복귀 artifact는 미완료|
|PR CI|미구축; 운영자의 독립 local 증거 채택 필요|

운영 승인은 다음을 명시해야 한다: 정확 b12 및 갱신된 main 결합 범위, 위 local 검증을 CI 대체로 채택, canonical/approved 기존 공개 정책 유지, 기존 위치 보호 전환은 분리, 삭제 race의 선행 차단 여부와 별도 보안 작업 시점, 보호 guard를 유지하는 release/rollback 계획.

## 7. 별도 승인 후 제안 실행 순서

1. 바로 직전 head/main/version을 재조회하고 변경 범위가 늘면 해당 회귀를 재검증한다.
2. S1-R shared.js를 유지하는 서버 배포 범위·설정·peer/D1 호환 및 복구 artifact를 고정한다. 승인 후 서버 S1-R를 먼저 반영하고 실제 version/hash/traffic/read-only 보호 증거를 기록한다.
3. 서버 보호를 유지한 채 C/F2/F3 Pages를 반영한다. 실제 release SHA 및 안전 guard를 유지하는 복귀 기준을 기록한다.
4. 자동 기상 갱신과 validator·최종 추천·미확인/빈목록/복구를 확인한다. 기존 위치 보호 전환은 cache 보안 선행 작업 및 별도 S1-P 승인 뒤 수행한다.

이 문서는 실행 지시나 운영 승인 완료를 의미하지 않는다. 위 절차를 수행하지 않았으며 사용자의 별도 운영 승인을 기다린다.
