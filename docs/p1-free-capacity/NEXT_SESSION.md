# 2026-10-13 P1-A/P1-B 숨김·만료 최소 수정 완료 — 여기서 종료

브랜치: `codex/p1-publication-free-capacity`.
기준 체크포인트: `26ad356418bbef61f8a583821ad63353cb85843a`.
수정 제품: `38a616c10f9edd93f1ab389c62b7bcc9b3ca96fd`.
이 문서를 포함한 최종 체크포인트는 `git log -1`로 확인한다. index는 제품 SHA와 동일하다. push하지 않았고 운영 BLOCKED를 유지한다.

먼저 `visibility-expiry-fix-20261013/FINDINGS.md`, `FINAL_MANIFEST.json`, `INVARIANTS.json`, `expiry-review/REVIEW.md`, `server/FINDINGS.md`, `chrome/FINDINGS.md`를 읽는다. 완료 시험·620초 관측·이전 P1 분석을 반복하지 않는다.

완료 결과:
- 숨김 Chrome 5폭: 10/30 → 30/30.
- 독립 visible 만료 DOM: 4/8 → 8/8. GPS/unknown 보충: 0/4 → 4/4.
- 신규 실제-source 시험: 2/11 → 11/11.
- 관련 JS80/80(DTO32 포함), 추천·자정182/182, 서버108/108, native D1 CAS10/10.
- 동시10/20 코호트18/18, 300ms·지터·timeout·복구7/7, Validator8/8.
- 190곳·모든 좌표/필드/순서, 추천 core, 보호파일473개, Worker/CAS/schema 불변.
- MAX_AGE5000/POLL5000/RENEW_MARGIN250/실효4750/TIMEOUT4000/REPORTS_REFRESH600000 불변.

변경은 index의 현재 권한 기준, hidden·generation·anchor 진입/완료 검사, 이전 promise 분리, 만료 감지 시 live layer/store/이름/현장소식 카드·팝업·길찾기 동기 정리다. 새 revision의 fresh 복구와 정상 Kakao/TMAP를 유지했다. 기존 VM에 새 필수 의존성만 보충했고 assertion은 그대로다.

원형 Chrome은237PASS/4FAIL/0SKIP로 그대로 남겼다. 복합 작업 총시간5100ms 기대값과 같은 context의 숨김 첫 탭을 두 visible 기기로 간주한 가정을 실측으로 구분했다. 별도 contract16/compound1/native8/tab3/독립 visible context 철회·재승인5는 통과했다. 원형·초기 fixture 실패를 성공으로 재분류하지 않았다. 과거 hidden-dependent8은 일부 branch 미실행이므로, 별도 동일 visible 하네스의4/8→8/8로 비교한다.

한계: 첫 만료 감지 즉시 정리하며, 브라우저 eventloop 동결 중 정확5000ms 실행을 보장하지 않는다. 물리 GPS·외부 앱·iOS popup·실제 다기기·edge CPU·분산·CI·배포/rollback은 미검증이다. Workers Free20명×8h의5초HEAD 최소115200>100000/동일UTC일 차단은 불변이다. 오래된 today의 현재 날짜 Validator 실패도 유지한다(이번8/8은 원발행 시각 고정 모드).

이번 단계는 완료했다. 새 사용자 승인 전에는 다음 작업을 시작하지 않는다. push·병합·main/PR13·Worker/Pages·운영D1·실사용자·요금제 변경은 금지한다. 기존 미추적·실패 자료를 삭제/덮어쓰지 않는다. 새 관련 증거만 선택해 로컬 체크포인트로 저장한다.

---
아래는 이전 단계 기록이며 최신 완료 판정과 구분한다.

# 2026-10-13 Load·동시성·권한 철회 원인 분석 완료 — 수정 승인 전 종료

현재HEAD/체크포인트26ad356418bbef61f8a583821ad63353cb85843a,제품c060f505ab95e5a3854f0e1be77fd8214de6b126,브랜치codex/p1-publication-free-capacity. 이번단계제품코드수정/commit/push/병합/배포/운영D1·실사용자·요금제변경0. 새증거폴더`docs/p1-free-capacity/load-audit-20261013/`는로컬저장상태다.

먼저새FINDINGS.md/FINAL_MANIFEST.json/LOAD_BUDGET.json/NON_INTERFERENCE.json,server/SERVER_MANIFEST.json,chrome/MANIFEST.json을읽는다. 완료620초·기존P1분석을반복하지않는다.

완료:현행10/20Chrome65초코호트18/18;미완료300ms45초·지터45초·4500timeout11초·75ms복구14초7/7. 서버108/108,CAS10/10,native15조건×cold0/10/20세반복(1800warmHEAD오류0/23행). DTO표적32/32재확인,Validator동일8/8일치.190곳/전체좌표·권한CAS·430파일불변.

실패보존:Chrome원형241=239PASS/2FAIL(공유payload2가정과복합전체시간=단일lease가정의하네스계약),초기서버5PASS/5FAIL(합성중복4/CAS200고정기대1),숨김30=10PASS/20FAIL,expiry8=4PASS/4FAIL,같은375조건개인정보추가2PASS/2FAIL.독립Chrome16/16+compound1/1.20숨김FAIL중실제timer/directloader복귀5와추가요청/rawHEAD가정실패15를구분;15를좌표노출15건으로보고하지않는다.

필수수정차단:L-H1숨김중원본10분timer/직접Fetch·Head·Refresh/asynccompletion이ready/마커를복구한다. L-H2허가age>5000~약5974ms에정확map/store좌표와#길찾기UI가남고,합성제보자명live history·팝업도잔류한다. fresh철회route실행과lateGPS동작은차단됨. 외부URL실행/실제운영유출사고를주장하지않는다. sourcegeneration/visibilitybarrier·숨김entry/completion폐쇄를최소수정권고했지만구현하지않았다.

Free차단:같은UTC quota day20×8h의5초HEAD최소115200>100000.75ms+timer추가HEAD36/h+과거계정baseline모형159845Worker/4277044warmrows;10%cold5545866rows.모형이지하루실측이아님.300ms는45초38요청/4폐쇄·전체4목록복구로약3039/user-hour외삽.5초상한/nonce/primary/postflight/unknown폐쇄완화금지.

미실행:제품수정,전체회귀,CI,운영/분산replica/CPU10ms·DB성장·1/8시간실측·물리GPS/native앱. 현재기본today의과거10월12일fixture/현재날짜FAIL은지난정상거부로유지. 이번작업을그해결이나배포통과로해석하지않는다.

다음 단계는사용자별도승인후에만L-H1/L-H2의index공개권한블록·10분timer최소수정,이번표적/카카오nativepopup·티맵/GPS/190곳비간섭재검증. fresh前about:blank가visibility를바꾸는정상Kakao동작을깨지않도록검증한다.서버CAS/business/D1schema·기상JSON은이번증거에서수정요구없음. 지금은원인분석까지만완료하고운영BLOCKED 유지.

명령/정확SHA/exit는새FINDINGS와각하위문서. 원형raw·실패assertion·기존미추적자료를삭제/덮어쓰기금지. 새output경로를사용하며timer수동콜백관측과620초실제관측을구분한다.

---
아래는이전완료체크포인트의인수인계다.

# 2026-10-13 Validator 최소 수정 완료 — 여기서 종료

제품 커밋: `c060f505ab95e5a3854f0e1be77fd8214de6b126`. 기준 체크포인트: `799ba3c6ba4bd2f62df4666696e0f9e167d02937`. 현재 브랜치 `codex/p1-publication-free-capacity`. 이 파일 포함 문서 체크포인트 SHA는 `git log -1`로 확인한다. push하지 않았다.

완료: today `24:00`·`16:60`·미래 발행 거부, weekly `16:6` 거부. 현재 날짜 검사는 유지하고 발행 시각과 미래 예보 대상 시각은 구분한다. 부적격 참고 기상 보존. 변경은 Validator2개·관련 Python 테스트2개와 새 증거/인수인계뿐이다.

새 증거: `docs/p1-free-capacity/validator-fix-20261013-151500/FINDINGS.md`, `FINAL_MANIFEST.json`, `INVARIANTS.json`, `modes/MODES.json`. 폴더 이름은 증거 식별자이며 실제 평가시각은 MODES.json에 기록됐다.

실행 결과: 동일 입력 Python/JS 일치4/8→8/8; 신규 Python11/11; 기존 Python56/56; 관련 JS182/182, 최종fail0/skip0. 첫 JS 실행181/182(CP949 stdout 환경 실패1)은 원형 로그로 보존했고 UTF-8 환경만 지정해 통과했다. 기존 Chrome 실패2건을 해결했다고 보고하지 않는다. 신규 시험 수정 전11개 중6개 method가 실패(failure6/error4 중첩)한 로그도 보존했다.

현재 모드의 오래된10월12일 today는 여전히 FAIL(Batch date mismatch). 원발행10월12일16:26 고정 today/week PASS, 저장 main07680616의 별도 실제10월13일 배치 현재 구조 검증 PASS. 원본 JSON 날짜 변경0; 위 PASS는 현재 추천 신선도/배포 승인 근거가 아니다.

190곳·전필드·좌표, Worker 권한/CAS/철회·공유 DTO·D1·생성기·원본 JSON 등430개 보호 파일 불변. 기존 표적32/32·Chrome10/10·권한8/8 원장 hash 동일이며 이번에 재실행하지 않았다. 기존 미추적 자료 보존. 새 큰 합성 입력/HTML·Python cache도 미추적 상태로 남겨 삭제하지 않았다.

재현: PYTHONUTF8=1/PYTHONIOENCODING=utf-8/PYTHONDONTWRITEBYTECODE=1, `python .github/scripts/test_validator_time_contract.py`, `python .github/scripts/test_weather.py`, `node --test .github/scripts/test_weekly_recommendation.mjs .github/scripts/test_today_weather_midnight.mjs`. 모드·대조는 새 증거 FINDINGS의 새 output 명령을 따른다. 기존 출력에 덮어쓰기 금지.

이번 단계는 완료. Load·CI·Workers Free 용량·전체 회귀·기존 Chrome2실패는 미완료 상태를 유지하고 자동으로 진행하지 않는다. 운영 BLOCKED. main 병합/push/Worker·Pages 배포/운영 D1·사용자 자료 변경 금지. 다음 사용자 지시에서 남은 단계를 선택한다. 이전 완료 결과를 처음부터 반복하지 않는다.

---
아래는 이전 체크포인트의 인수인계다.

# 2026-10-13 공유 고정 이력 표적 수정 완료

이번 사용자 범위는 공유 승인 응답의 고정 지점 이력 손실 수정·표적검증·로컬 체크포인트까지다. 이 단계는 완료했고 여기서 종료한다.
브랜치 codex/p1-publication-free-capacity. 기준 체크포인트8583890a264d1bc453406d2eb90e1d7b5b38c15f, 수정 제품9b129940ae484f9f9f777eaecc1ce4473e840f05. 이 파일 포함 최종 문서 체크포인트는 git log -1로 확인한다. 원격main 읽기 확인8bf31d3bb6104186a167048eccdb3c44737eb840; main은 수정하지 않았다.

원인: loadApprovedReports의fixedSpots 제자리 변환이 공유DTO를변형해두번째소비자의이력을지웠다. 별도 nextFixedHistory와history.slice()만으로해결했다. 나머지index·서버권한·CAS·철회·terminal·nonce·freshpostflight·5000ms 소스는같다.
신규 재발방지 테스트: .github/scripts/test_approved_shared_history.mjs의4건(겹친mutable/frozenDTO소비,미적격응답복귀차단,승인철회후이력비움). 수정전2pass/2fail,수정후4pass. 관련승인검색/이력cache포함32pass/0fail/0skip.
실제publication 공유재현은payload1회/두loader true/이력[1,1]·최종1. 표적Chrome344/375/768/1024/1440px는10pass/0fail/0skip, 권한집중8/8.190개·id190unique·전필드/좌표불변.

새 증거 폴더: docs/p1-free-capacity/shared-history-fix-20261013-135416. 기존 docs/p1-free-capacity/resume-20261013 및임시자료는삭제·덮어쓰지않았다. 원형Chrome검색 helper가대문자토큰을정규화없이전달한5/5실패도새폴더에보존한다. 실제UI와같은normalizeQuery를입력에만적용한별도복사본은같은assertion으로수정전5pass/5fail→수정후10pass였다. 제품검색정책을바꾸거나assertion을완화하지않았다.

수행하지 않은 작업: 전체회귀·원형Chrome241·부하/숨김DOM/고지연·날짜validator·GitHubCI·Paid비용·서브에이전트·원격push·PR·병합·main·Worker·Pages·운영D1. 이전736/170은과거3d 실행이며새9b의전체검증으로재분류하지않는다.
남은 문제: 기존Chrome2실패·날짜validator·숨김10분조회/약1초DOM잔류와고지연미완료·실제GitHubCI·용량/운영준비. 운영BLOCKED 유지. 이번수정은배포승인이아니다. 별도다음지시없이다른단계로진행하지않는다.
다음세션은이완료단계를반복하지말고새지시범위만진행한다. 필요한재현명령은해당폴더FINDINGS/JSON/log 참조. 기존미추적자료는새관련폴더만선택stage하며git add .금지.

---
아래는기존체크포인트의원형인수인계이며새제품의전체실행결과로해석하지않는다.

# 다음 세션 재개 지침

## 기준과 중단 상태

작업트리: C:/Users/김진호/.codex/worktrees/p1-free-capacity/birdmap
브랜치: codex/p1-publication-free-capacity
마지막 제품 SHA: 3d42910cb0cea8a5e79c2d57d068c91b86b18332
직전 문서 SHA: a0b8543b1a5a71b963357eeac1db5fa5d7fac837. 이 파일을 포함한 최종 체크포인트는 git log -1로 확인한다.
기준 제품c025d75, 최신 확인 main07680616, PR13b12e20c/PR162452989/PR179f9e9be의 제품 head는 변경하지 않았다.

AI_WORK_RULES.md, DESIGN.md, FINDINGS.md, PROGRESS.md, FINAL_MANIFEST.json을 먼저 읽는다. 이전 P1분석과 감사를 반복하지 않는다.
사용량 primary96%/secondary93% 사용으로 최소 잔여4%에 도달했다. 사용자5%중단지시에 따라 새 작업을 중지하고 증거를 저장했다.

## 완료된 작업

SQL HEAD cold103/warm23 실제 workerd 측정. 위치 힌트만 보관하고 매번22 guard를 실제 검증한다. 5c 복구는 새 first-primary session에서 전체 state/payload batch를 재실행한다. publication72/72, native15/15.
3d needsRefresh로 일부 목록만 복구되는 결함을 해결했다. 최종 프런트359/359, fresh HEAD20/20, 복구 계약14/14. 전체 영향 검증736/0/1은 변경 없는124개 기존 실행을 포함하며736 전체 최종SHA 재실행으로 과장하지 않는다.
S2 182/21/12, S1-R171/일반종17, 고정190곳/176후보 ON/OFF 전수 signature 유지. 최신main 임시 결합 충돌0/자동6JSON 보존.
Chrome10/20 부하18/18, 수정전 복구0pass/5fail→수정후5/5, 새 계약16/16, 복합 작업8초여도5초 lease폐쇄1/1, 현재 실제합성API DTO B6 170/170.
원형241의239pass/2fail과 과거 만료DTO70pass/100fail은 삭제·기대값변경하지 않고 별도 계약/현재 생성자료로 대조했다.

## 판정과 남은 불확실성

BLOCKED — 운영 승인 요청 전 중단. 같은UTC quota day의20명8시간은5초HEAD만115200회로Free100000/day 초과. 선택4750ms 공칭121264, warm/timer/계정 합산159840요청/4281012읽기행.
10명8시간 warm 모형78994요청/2136518행도 운영 cold빈도·CPU·모바일RTT/P95·DB성장·상호작용이 미확인이므로 운영승인이 아니다.
과거10/12 고정JSON 현재날짜 validator 실패는 별도 미해결이다. 최신main 실제10/13 정상배치 통과는 다른 입력이다. 기존 활성Worker 보호누락 위험은 실제사고 증거와 구분한다.

## 다음 정확한 작업

1. git status, 최신 원격과 PR head, 사용량부터 확인한다. 최소잔여<=5이면 저장 후 정지한다.
2. 새 사용자 지시가 있는 범위만 진행한다. 현재 로컬 최소 보완·통합 검증·용량 비교는 완료됐다. 20명8시간의 하한은 SQL만으로 해결할 수 없다. 5초상한/primary/nonce/fresh postflight/unknown폐쇄를 임의 완화하지 않는다. 새 구조나 트래픽 정책은 별도 지시 전 구현하지 않는다.
3. 상세 명령과 종료 코드는 server/PRIMARY_RECHECK_5C03.md, FINAL_FREE_BUDGET_RECHECK.md, 독립 budget JSON/Python, integration/INDEPENDENT_RECHECK.md, client/FINAL_CLIENT_RECHECK.md 및 각 manifest/log를 사용한다.
4. 실제Chrome 재현 시 PUBLICATION_TEST_INDEX_REF=정확SHA, PUBLICATION_TEST_ROOT=동일Gitarchive, PUBLICATION_TEST_OUTPUT=새폴더로 지정한다. 기존 증거를 덮어쓰지 않는다. 재현 helper는 docs/p1-publication-final-audit/browser/free_*.mjs, 현재 B6 생성기는 client/browser/3d4291/b6-current-dto/fixture_generator_3d.mjs이다. 옛 expiresAt를 현재로 바꿔 통과시키지 않는다.
5. 운영부하·실제CPU/P95·지역별cold·장기숨김·실물GPS/외부앱·현재활성Worker 재조회·운영배포는 이번에 미실행이다. 운영 날짜검사를 삭제하거나 통과로 재분류하지 않는다.

Node: C:/Program Files/nodejs/node.exe
Python: C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome: C:/Program Files/Google/Chrome/Application/chrome.exe

금지: main 병합, 기존PR 제품 변경, Worker업로드/활성화/롤백, Pages, 운영D1, 실사용자자료, 유료전환. 운영승인 요청 전 정지한다.
자동승인 검토가 기존 예상읽기23 사전 변경을 거절하여 실행되지 않았고 별도 관찰 프로브로 증명했다. .tmp-free로그/.tmp/source.tar/database/node_modules를 stage하지 않는다.
