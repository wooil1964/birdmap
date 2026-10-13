# P1 공개 위치 보안 구현 및 통합검증 결과

**구현·로컬 통합검증 완료, 독립 검증 및 별도 운영 승인 대기. 운영 배포는 보류한다.**

설계 승인은 `c128666203bb5c483258b8231d0eb410c38e38f9`이다. 제품 변경과 독립 테스트를 수행했으며 운영 API/D1에 쓰지 않았다. 이전 실패·하네스 오류를 삭제하지 않았다.

## 정확한 기준

- 제품·시험 checkpoint: `f7aee08f8bab6371cdffb8e2099d85b51a76765e`. 이후 커밋은 검증 문서·증거만 추가한다. 최종 branch head는 `git log -1` 또는 Draft PR head로 확인한다.
- 최신 main: `25e1fbae781c19fad53e770e4396fc625865f3b3` (2026-10-12 13:36 KST 최종 fetch/원격 조회).
- PR13: `b12e20c1b6d856a021898a0c1c9221b30393a221`, PR16: `245298981e27f88ac26bad8b46d819a7df899c86`.
- 임시 결합 tree: `a599638f3a0b8d95b367b94eaa4eb098127abba3`, merge-tree 충돌0. 실제 merge/main 변경은 수행하지 않았다.
- 초기 기준66ff787에서 main 자동 기상 commit25e1fba가 추가되어 미공개 별도 브랜치만 rebase했다. 자동 JSON을 편집하지 않았다.
- 기존 PR13·PR16의 head/body/draft를 바꾸지 않았다. PR16 방어와 PR13의 최소 S1-R만 별도 브랜치에 반영했으며 PR13의 추천 전체 변경은 임시 결합에서만 검증했다.

## 구현 범위

1. `reports-api/migrations/0005_publication_security.sql` 및 fresh schema: singleton32hex epoch, 문자열 전송되는64bit revision, field row_revision, reports/field INSERT·UPDATE·DELETE 공개 revision trigger, 삭제 terminal/childevent/confirmation 불변 조건.
2. `src/publication.js`, `src/public.js`: primary D1의 상태+payload 단일 batch snapshot. `publication-v1`/`legacy-public-v1`, fresh nonce, expectedEpoch/Revision 검증. 미확인503·변경409·무계약400에는 좌표가 없다. 공개목록·현장이력·최근집계·월간동의이름·mutation/error 모두 no-store. encoded history 경로도 계약을 우회하지 못한다.
3. `src/field-updates.js`: 상태·확인·본인 삭제 CAS 바로 뒤 transaction assertion, 동일 batch에서 event/count/revision 처리. 삭제 뒤 늦은 상태변경/확인 차단, 중복 본인삭제 멱등. fresh SQLite TTL까지 검사한다. strict mutation은 좌표 없는 receipt만 반환한다.
4. `src/canonical/data.js`/`shadow.js`: 기존 dual-write 유지, 새 상태 조회 지원. 같은 권한의 projection만 비교하며 권한 변동은 inconclusive로 남긴다. core schemaReady fingerprint는 보존한다.
5. `index.html`: preflight→snapshot→postflight, 5초 lease/5초 poll/4초 timeout, monotonic clock 기한. 권한 미확인/변경/만료/visibility/pageshow에서 동적 store·마커·검색·팝업 소스·href·chooser·GPS guide를 폐기한다. 모든 동적 앱 실행과 GPS 시작·성공·오류·watch callback이 fresh authority 뒤 최신 대상/owner를 재검사한다. 정적190곳과 두 지도 앱은 유지한다.
6. public/admin config는 `REPORTS_PUBLICATION_REQUIRED=true`로 엄격 계약을 지정한다. 배포되었다는 뜻이 아니다. flag를 false로 바꿔 옛 공개 경로를 다시 여는 것을 안전한 운영 rollback으로 승인하지 않는다.

기존 승인 자료의 종별 전면 비공개인 S1-P는 구현하지 않았다. 신규/저장 표현의 S1-R 판정, 기존 명시적 가림·철회·삭제 권한 갱신을 구분한다.

## 보안 실패 해결

|이전 실패|실제 검증|결과|
|---|---|---|
|승인 가림 뒤 후속 과거 목록의 정확위치 복귀|V03·fresh nonce/state·marker/search/popup/store/href|차단|
|승인 철회 뒤 과거 목록 복귀|V04·latest authority·지연응답/요청역전|차단|
|다른 기기 삭제 뒤 과거 현장목록 복귀|V05·현재 snapshot·memory tombstone 없는 경우|차단|
|새로고침/새기기의 과거 첫 응답 공개|V06·bootstrap/postflight|차단|
|삭제 이후 지연 상태 변경/확인|실제 local workerd D1 CAS/batch rollback + old unconditional writer terminal trigger|deleted 유지|
|다른 기기의 보호 전환 중 지연 GPS|local store가 아직 옛 좌표이고 lease 유효한 상태에서 authority만 변경 후 callback|안내·chooser·watch 재활성화0|

기존4종×5폭20검사와 기존 Chrome 위험15건은 Chrome165에 포함된다. 15건의 unsafe0, 전역 browser exception0, 운영 requests0, 외부 non-GET0. 정상 재승인·가림 해제·재출현은 새 명시 권한에서 복구되며, 자연 만료와 terminal 삭제를 혼동하지 않는다.

## 실제 실행 결과

|범위|pass|fail|skip|
|---|---:|---:|---:|
|별도 구현 브랜치 기존 frontend14파일|281|0|0|
|PR13 임시 결합 frontend15파일|359|0|0|
|결합 reports-api(독립 SQLite40·path3 포함)|221|0|0|
|weather-proxy|36|0|0|
|Python 기상|56|0|0|
|Python 조석|21|0|1|
|Python share pages|11|0|0|
|결합 자동 회귀 합계|704|0|1|
|실제 local Miniflare/workerd D1 별도 증명|18|0|0|
|별도 브랜치 실제 Chrome 5폭|165|0|0|
|PR13 결합 실제 Chrome 같은 5폭|165|0|0|
|S2 실제함수 matrix / 특별분기 / popup|182 / 21 / 12|0|0|
|S1-R 보호표현 / 일반종 control|171 / 17|누락0 / 오탐0|0|

같은 cohort를 합산하지 않는다. SQLite40은 reports221의 subset, Chrome165 두 번은 동일 시험의 서로 다른 입력이다. S2/S1 source proofs는 별도 계약 검증이다. today/week validator는 실제10월12일 main JSON에서 각각 exit0이며 테스트 개수로 부풀리지 않는다. 조석의1skip은 기존 선택적 live check이며 synthetic 시험 성공으로 대체하지 않았다.

5폭344·375·768·1024·1440px, 실제 Chrome/Leaflet/DOM 및 local mock API를 사용했다. 두 독립 페이지의 정상→가림→삭제→명시복구, 요청역전·nonce/type/overflow·postflight·캐시·오류·timeout·BFCache·OS clock rollback·GPS·본인삭제·상태전환·두 앱 URL을 검사했다. 실제 지도 타일은 차단했으며 물리 GPS·외부앱·운영 POP는 미실행이다.

## 정상 추천과 비간섭

고정2026-10-08 22:40 KST, 동일35141c0 기상·조석·공지 및 공개제보 스냅샷을 사용했다. 양 버전 모두190곳·176후보, unsafe0, 제보ON/OFF 전체 후보 signature와 상위10의 ID/순서/원점수/내부점수/가점/날짜/시각/이유가 동일하다. 합성 null 점수 결과도 동일하다. 상세는 `results/integration/f7aee08/fixed-summary.json`.

- ON: `47c90497b6995318031b10e85c0750f77f5898c5ce1a75bfb951b820eb5e9afb`
- OFF: `ecd3d28b8c3d5f23cfbf00bcc305c2171bff01ea4f81027dc1407ffe1a84a758`
- 탐조지 전체자료/좌표 hash는 main과 동일,190개 ID유일. 추천·점수·표시·P0 관련75함수는 PR13과 본문 동일.
- P0 만조90/91분·대체만조·강수1mm·선상풍속6m/s/파고0.7m은 기존 실제 함수/회귀로 유지된다.
- 5개 자동 JSON(weather today/week, tide today/month, notices)은 main과 **Git blob 정확 동일**. Windows archive의 CRLF는 별도 정규화 비교로 확인했다.

## 실패 보존과 교정

초기 서버207/210(cache header 옛 기대3), front238/272, 기존 main 문구/chooser 계약2실패, 추가 mono/GPS fixture 오류를 원장에 보존했다. 정확 카카오 URL과 티맵 goalx/goaly·두앱 chooser·미확인 부정 조건으로 시험을 강화했으며 assertion을 삭제하지 않았다.

실제 제품 결함은 무효 epoch state에서도 쓰기가 가능한 초기 방어, 권한 실패 뒤 열린 팝업 href 잔존, lease 안의 지연 GPS callback의 서버 재확인 누락이었다. 구현 보완 후 동일 보안 기대를 통과했다. 초기 Chrome106/31·106/36·36/5·138/1과 정확旧Git188b의375px40/11(GPS7+기존DOM4)을 보존한다. 이전140 원장의 sourceSha는 당시Git HEAD 기록이며 실제 입력은 raw index hash인 working tree였음을 명시한다. 최종 Chrome은 정확 sourceInput `a599638f3a0b8d95b367b94eaa4eb098127abba3`이며 branch 원장64478의 index는 rebase 후 f7aee08 blob과 동일하다.

임시 archive에 합성 pre-schema fixture가 없어 reports181/182로 끝난 시도, matrix output folder ENOENT, Git archive LF/CRLF 집계 오류도 보존했다. 해당 시도를 성공으로 보고하지 않았다. 최종 exact Git blob 비교와 source proof182/21/12·171·17이 통과했다.

## 잔여 위험과 운영 승인 선행 조건

- 현재 해결하지 못한 로컬 배포 차단 결함은 확인되지 않았다. 독립 검증자는 Draft PR의 정확 SHA로 재시험해야 한다.
- 서버 확인 직후 새 철회가 생기는 순간의0ms 탐지와 이미 전달된 좌표 회수는 보장하지 않는다. 5초 lease/poll 및4초 timeout의 비용·허용 관측 지연은 운영 승인을 받는다. 앱 실행/GPS callback은 매번 최신 head를 확인한다.
- 운영 D1 실제 core schema/13trigger 정의/primary 접근, 모든 writer drain과 원자적 migration 설치를 아직 운영에서 검증·실행하지 않았다. trigger 이름 개수 검사는 권한 있는 악성 DDL까지 검출하는 해시 검증이 아니다.
- 실제 CDN bypass/hard purge·옛 URL·옛 열린 탭·여러 운영 POP를 검증하지 않았다. no-store 추가만으로 과거 저장본을 회수했다고 하지 않는다. 새 strict 계약에서 구 client의 동적 데이터 요청은 실패 폐쇄된다.
- PR 전용 CI는 구축하지 않았다. 저장소 workflow는 운영 JSON commit/push가 있어 실행하지 않았다. 로컬 재현 명령/원장을 CI 통과로 표시하지 않는다.
- S1-P 승인 후 공개 정책과 R5 극단 숫자 문자열은 이번 구현의 해결 범위가 아니다. PR13의 별도 운영 판정과 정책 선행조건을 유지한다.
- 현재/직전 운영 Worker version을 이 작업에서 재조회·승인하지 않았다. 새 보호 기능을 유지하는 실제 paired rollback version/bindings/source 연결 증거는 미완료다.

## 보호 유지 rollout/rollback

별도 운영 승인 후 순서는 독립 검증→paired artifact/rollback 확보→모든 writer 통제·원자 additive D1 설치→S1-R+publication+CAS public/admin 서버 선반영→기존 cache purge/bypass→새 Pages→자동 기상 갱신·읽기 전용 관찰이다. 서버 strict 선반영 시 구 client 동적자료가 닫히는 전환 시간을 운영자에게 명시한다. PR13은 별도 승인된 정확 소스를 안전하게 결합해야 한다.

source baseline은 `f7aee08f8bab6371cdffb8e2099d85b51a76765e`와 검증된 결합 tree다. 이를 **실제 업로드된 rollback version이라고 부르지 않는다**. 추천/UI 회귀는 새 보호 gate를 유지한 Pages baseline, 서버 회귀는 S1-R·publication/no-store·terminal/CAS·canonical·인증/captcha를 유지한 paired baseline을 별도 준비한다. DB state와 삭제/철회 기록을 되돌리지 않는다. schema/down migration·과거 DB 복구·옛 Worker494b97/16dae·legacy NORMAL/flagfalse 복귀는 안전한 rollback으로 승인하지 않는다. 불확실한 경우 동적 위치 공개와 쓰기를 닫는다.

## 재현

- `node docs/p1-publication-security-implementation/scripts/integration.mjs f7aee08f8bab6371cdffb8e2099d85b51a76765e 25e1fbae781c19fad53e770e4396fc625865f3b3` (임시 archive와 로컬 시험만).
- `node docs/p1-publication-security-implementation/scripts/source_proofs.mjs` (위 archive 후182/21/12·171·17 및 exact JSON/signature 확인).
- `node docs/p1-publication-security-implementation/scripts/noninterference.mjs`.
- `PUBLICATION_TEST_INDEX_REF=a599638f3a0b8d95b367b94eaa4eb098127abba3`와 CHROME_PATH를 설정한 뒤 `node docs/p1-publication-security-implementation/scripts/publication_chrome.mjs`.
- `node docs/p1-publication-security-implementation/results/server-audit/local-d1-publication.mjs <existing local node_modules>` (Miniflare5.20261006.1-alpha, 운영 연결 없음).

원장: FINAL_MANIFEST.json, results/browser/README.md, results/server-audit/README.md, FRONT_HARNESS_REVIEW.md, results/integration/f7aee08/summary.json. 변경 파일은 `git diff --name-only 25e1fbae781c19fad53e770e4396fc625865f3b3 HEAD`로 확인한다.

## 제출 완료

Draft PR #17: https://github.com/wooil1964/birdmap/pull/17 . 생성 문서 SHA f63b52a7c56ed3c7b2bec6dffb541ca46571712a, 본문/head/draft readback 일치. 이후 제출 원장 커밋은 docs-only다. PR13·16 head/body/updatedAt 불변, 원래 작업 트리는 clean이다. main×PR13 직접 merge-tree도 exit0/treeba57ba3062870ef45af66836466fae024045a37b로 확인했다. 초기 GitHub mergeable=false는 transient 값으로 실제 충돌이라고 단정하지 않았다.

자동 승인 검토가 이전 검증 증거 디렉터리 삭제를 거부하여 폴더를 보존하고 새 문서만 명시적으로 stage했다. 해당 보존 폴더와 임시 archive/pycache는 로컬 untracked로 남아 있으며 PR에는 포함하지 않았다.
