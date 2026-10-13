# P1-A/P1-B 숨김·만료 최소 보안 보완 완료

판정: **두 결함은 표적 범위에서 해결. 운영 배포 BLOCKED 유지.**

브랜치 `codex/p1-publication-free-capacity`, 기준 제품 `c060f505ab95e5a3854f0e1be77fd8214de6b126`, 기준 체크포인트 `26ad356418bbef61f8a583821ad63353cb85843a`, 수정 제품 `38a616c10f9edd93f1ab389c62b7bcc9b3ca96fd`. 실제 Chrome/Node의 index SHA256 `7b9eec9b0203ec3c5ca89bc16cbdcae62adacb03fcb9f00c62079f85fb6e1f47`는 커밋 객체와 일치한다. 최종 문서 체크포인트는 `git log -1`로 확인한다. 최신 원격 main 읽기 확인은 `43ac2b60fee9d0f6c72e283837528a7f88d6568f`; main/PR13/운영 환경은 변경하지 않았다.

## 원인과 최소 수정

P1-A: 숨김 event에서 비운 후 원래 10분 callback/direct loader/늦은 HEAD·payload가 visibility 및 이전 generation을 적용 직전에 검사하지 않아 ready와 마커를 복원했다. 현재 숨김은 `publicationAllowed`를 포함한 단일 권한 기준에서 부적격이다. Head/Fetch/Refresh/Recheck/Route의 진입과 완료에서 visible·현재 generation·anchor를 검사한다. 무효화는 이전 promise/pending 참조를 분리하고, 오래된 성공/실패 모두 새 복구 상태를 덮지 못한다. 새 primary/nonce/postflight와 정상 revision은 계속 허용된다.

P1-B: 기존 Allowed는 만료를 false로 반환만 했다. 정리 callback이 지연되면 정확좌표·제보자명·열린 현장소식 카드가 남았다. 지금 첫 만료 감지에서 ready=false를 먼저 설정하고 동기적으로 live stores, Leaflet layer, 팝업/기여자/이력/최근 DOM, chooser/GPS를 비운다. 현장소식 pickThread/status 카드도 다시 그려 이미 열린 이름을 없앤다. 이후 renderer도 권한을 확인해 이전 데이터를 재삽입하지 않는다. 사용자 작성 중인 새 제보 draft는 임의 삭제하지 않는다.

정상 동적 카카오 길찾기는 fresh 검사 후 창을 열어 자신의 about:blank 전환이 preflight를 무효화하지 않게 했다. Chrome trusted click/native window8/8로 정상 Kakao/TMAP 계약을 확인했으며 실제 iOS popup policy·외부 앱은 미검증이다.

제품 변경은 index.html만이며 두 결함 관련65줄 diff(추가47/삭제18). 함수 위치: renderRecentReports1174, publicationAllowed2959, Invalidate2977, Renew3001, Head3026, Fetch3049, Refresh3074, Recheck3087, RouteCheck3091, 10분callback5031, renderFieldMarkers5655, fieldPopupNode5694, renderFieldNews5937, fieldNavChooser6006, fieldRenderThreads6308, fieldRenderStatus6331. 새 실제-source 회귀11개와 기존 VM fixture의 새 필수 의존성만 보충했다. Worker·CAS·D1·공개 정책 변경0.

## 실제 결과

| 시험 | 수정 전 | 수정 후 | 최종 exit |
|---|---|---|---:|
| 실제-source 신규 Node11 |2PASS/9FAIL|11/11|0|
| 숨김 실제 Chrome5폭30 |10PASS/20FAIL|30/30|0|
| 독립 visible 만료 DOM8 |4PASS/4FAIL|8/8|0|
| 만료 GPS/실패 route 보충4 |0PASS/4FAIL|4/4|0|
| 관련 JS80(DTO32 포함) |최초79/80 fixture오류1 보존|80/80|0|
| 추천·자정 JS |기존182 유지|182/182|0|
| 서버 권한·CAS108 |최초88PASS/20FAIL VM의존성|108/108|0|
| 실제 로컬 native D110 |기존10 유지|10/10|0|
| 동시 Chrome10/20 코호트 |기존18 유지|18/18|0|
| 300ms·지터·timeout·복구 |기존7 유지|7/7|0|
| Python/JS 시각 계약 |기존8 유지|8/8|0|
| 원형 Chrome241 |이전239PASS/2FAIL|237PASS/4FAIL|1|
| 독립 계약/복합/정상 native |이전 계약 유지|16/16·1/1·8/8|0|
| 실제 tab/context 진단 |신규|3/3·5/5|0|

각 수치는 별도 조건/방법이다. DTO32는 JS80 안의 부분집합이며 중복 합산하지 않는다. 모든 최종 표적 시험의 SKIP0. 원형 Chrome4FAIL을 성공으로 바꾸지 않았다. 제품의 보편적 전체 회귀 통과를 주장하지 않는다.

숨김은344·375·768·1024·1440px에서 즉시 정리, 원본600000ms callback/직접loader0요청, lateHEAD/payload/GPS 복구 차단 및 다시 visible fresh 복구를 시험했다. visible 만료는375/1440px에서 실제 lease 경계를 넘는 동기 작업으로 정리 timer보다 먼저 검출한다. DOM-first 표본과 첫 Allowed 호출 뒤 정리를 분리했다. 동일 harness SHA/assertions/fixture로 before4/8→after8/8다. 약5003ms 감지 시 정확좌표/store/layer, 팝업 및 현장소식 카드 이름·chooser/GPS가 제거된다. 새로운 정상 revision 복구는 유지된다.

기존 hidden-dependent expiry8은 hidden 복귀 차단 뒤 일부 branch가 실행되지 않으므로4/4를8/8로 둔갑시키지 않았다. 원형620초 및 원래 실패 원장은 보존했고 재실행하지 않았다. 새8은 독립 visible 자료로 모든8조건을 실행한다. 초기 단위 재현은 이전 promise 대기로 중단했고, 별도 bounded recovery assertion 재현2/9 로그를 보존했다. 최초 independent-expiry preparation2회 오류, 서버 fixture20오류, JS DOM fixture1오류는 새 source 의존성과 합성 bootstrap 문제로 구분했다. assertion 삭제/성공 기대값 완화0.

## 원형 Chrome4 FAIL 분류

1. 복합 4목록 refresh 전체6024ms를 단일 권한5100ms로 간주한 기대값. 별도 compound1에서 경계 뒤 모든 데이터 폐쇄 PASS.
2. 같은 browserContext 두 탭의 첫 탭은 실제 hidden=true인데 둘 다 정상 공개를 요구.
3. 같은 숨김 탭에서 재승인 즉시 정상 공개를 요구.
4. 숨김 첫 탭 loader에 deferred2를 요구(actual0). 이전 공유 응답 actual1과 다른 상황이다.

작은 실제 diagnostic에서 첫 탭hidden/allowedfalse/마커0, 활성화 fresh 복구와 숨김 호출0network를 확인했다. 두 독립 context를 focus-emulation으로 동시에 visible로 만들면 정상→철회→재승인이 모두 통과(5/5). 원형4FAIL은 그대로 보존하고 제품 회귀/정확좌표 재노출 증거와 구분한다. 물리 다기기 시험은 아니다. 세부 증거는 chrome/FINDINGS.md와 MANIFEST.json.

## 데이터·안전·용량 불변

INVARIANTS.json:190곳·ID190unique·배열 순서·전필드·전체좌표 동일. 추천 core 문자열/sha256 동일. 기존 보존 대상473개 Gitblob과 working source 동일(서버 따로64개 대조). 자동 weather/tide JSON·Python validator·생성기·Worker 권한epoch/revision/CAS/철회·terminal·D1schema·공유DTO 비즈니스 소스 변경0. 기존 고정 정상176후보/추천 signature를 새로 전수 실행한 결과라고 과장하지 않으며, 입력과 추천 core 불변으로 비간섭을 확인했다.

MAX_AGE5000/POLL5000/RENEW_MARGIN250/effective4750/TIMEOUT4000/REPORTS_REFRESH600000은 그대로다. hidden callback에서 호출을 막는 것은 승인된 보안 변경이며 별도 용량 최적화나 주기 변경을 하지 않았다. 새300ms45초 관측은30요청(HEAD18+목록12)으로 폐쇄·복구 안전; 이전38요청/4expiry와 다른 짧은 관측이며 하루 비용 개선으로 확대하지 않는다. WorkersFree 20명×8h의5초HEAD최소115200/동일UTC일>100000 한계는 그대로다. 이전159845요청/4277044warm read, cold10%5545866read는 과거 모형이며 새 하루 실측이 아니다. 용량 차단은 해소되지 않았다.

현재 날짜에서 오래된 today fixture의 Batch date mismatch는 여전히 정상 거부이며 이번에 갱신/통과로 바꾸지 않았다. 시각 계약8/8은 원발행 시각 고정 대조다. 운영 Worker·D1·실사용자 자료에 요청/변경0, 외부 non-GET0, 실제 Chrome exception0.

## 재현과 보존

UTF8 환경 PYTHONUTF8=1/PYTHONIOENCODING=utf-8/PYTHONDONTWRITEBYTECODE=1. 모든 browser output은 새 폴더만 사용하고 PUBLICATION_TEST_INDEX_REF=38a616c10f9edd93f1ab389c62b7bcc9b3ca96fd, PUBLICATION_TEST_ROOT=<이 worktree>, 자산 ref는 각 JSON에 기록했다. 서로 다른 asset ref는 정적 의존성 입력이며 index는 항상 exact 제품 SHA.

```text
node --test --test-reporter=tap .github/scripts/test_approved_shared_history.mjs .github/scripts/test_report_search.mjs .github/scripts/test_site_history_cache.mjs .github/scripts/test_field_news.mjs .github/scripts/test_location_popup_guard.mjs .github/scripts/test_location_protection.mjs .github/scripts/test_publication_visibility_expiry.mjs
node --test --test-reporter=tap .github/scripts/test_weekly_recommendation.mjs .github/scripts/test_today_weather_midnight.mjs
node docs/p1-free-capacity/resume-20261013/load/hidden_targeted_browser.mjs
node docs/p1-free-capacity/resume-20261013/load/latency_resume_browser.mjs
node docs/p1-publication-final-audit/operations/chrome_load.mjs
node docs/p1-free-capacity/visibility-expiry-fix-20261013/expiry-review/visible_expiry_review.mjs
```

server/Chrome 세부 문서에 실제 명령·exit·원형 assertion proof가 있다. Validator는 새 빈 output에 actual_js_time_contract.mjs를 복사한 뒤 기존 probe_time_contract.py <root> <output>를 실행(8/8). probe의 inputShaProduct9b는 기존 fixture 식별 metadata이며 이번 실제 제품SHA는 본 원장38이다. check_invariants.py는 Git NUL tree 비교를 사용한다. 첫 일반 ls-tree 방식의 한글 quoted 경로 오류는 검사 하네스 준비 오류로 보존 설명하며 제품 FAIL로 세지 않는다.

기존 미추적/원형 자료 삭제·덮어쓰기0. 원본 before-index.html/큰 합성 validatorJSON은 미추적으로 보존하고 다시 git object에서 생성 가능하다. 이번 새 synthetic logs/JSON/harness/문서만 선택 commit하며 git add .를 하지 않는다.

## 잔여 위험과 종료

첫 **만료 감지 즉시** 정리한다. 브라우저 eventloop가 정지/동결된 동안 정확5000ms에 JavaScript 실행을 보장한다는 뜻은 아니다. 외부로 이미 캡처·복사된 정보의 소급 삭제도 보장하지 않는다. 실제GPS·외부앱/iOS팝업·물리다기기/분산replica·edgeCPU·DB성장·장시간 운영용량·CI·rollback/배포 준비는 미검증/기존 차단으로 남는다. 이 제한을 좌표 재노출 해결과 섞어 PASS로 처리하지 않는다.

두 결함의 승인된 최소 수정과 표적 검증은 완료했다. **운영 BLOCKED.** 현재 단계에서 push/병합/main/PR13/Worker/Pages/운영D1/실사용자/요금제 변경0. 이후 범위는 사용자 새 승인 후 진행한다.
