# Workers Free 최소 보완 최종 검증

**판정: BLOCKED — 운영 승인 요청 전 중단.** 로컬 최소 보완과 용량 비교는 완료했으나20명×8시간의 Workers Free 수요는 조건을 충족하지 않는다. 제품 기준 `c025d75f964ab36f6f2eae541a99461f6de59b70`, 최종 제품 `3d42910cb0cea8a5e79c2d57d068c91b86b18332`, 전용 브랜치 `codex/p1-publication-free-capacity`.

## 변경 범위와 수정 전 실패

제품 변경은 index.html, reports-api/src/publication.js, reports-api/test/publication-security.test.mjs 세 파일이다. 원자 migration·trigger·CAS·deleted terminal·canonical dual-write·S1-R/B6 공개 projection·기상 추천 함수·190곳 좌표는 수정하지 않았다.

1. f87b9a8: HEAD마다102행 sqlite_schema scan 대신22개의 rowid/name/type를 같은 snapshot에서 직접 검사한다. WeakMap은 native D1 binding별 물리 조회 위치만 보관하며 권한판정/guard존재/epoch/revision을 보관하지 않는다. locator가 변하면 전체 state/payload를 재조회한다.
2. 9b4555a: 동일 endpoint+generation의 진행 중 조회만 합친다. 완료응답 캐시 없음. 최초 pageshow는 이미 시작한 bootstrap에 합류하고 BFCache는 여전히 파괴적 폐쇄다. polling을4750ms로 앞당겼지만 요청 시작 기준5000ms 상한/nonce/fresh postflight/unknown 폐쇄는 유지한다. 새 KST day의 query-window 변경은 전체 폐쇄/재조회한다.
3. 5c03d3b: 독립 감사에서 locator 복구의 두 번째 query를 같은 first-primary session으로 실행하는 불충분한 최신성 근거를 발견했다. 수정 전2시험 fail/수정 후72/72. 복구마다 새 primary session과 새 전체 readPlan/batch를 준비한다. native session621→622 및623→624로 실제 검증했다. 실제 운영 누출이 관찰됐다는 뜻은 아니다.
4. 3d42910: Chrome20명 실험에서 field-only 응답으로 ready=true가 돼 승인목록 복구가 누락됐다. 수정 전5폭0pass/5fail → 수정 후5pass/0fail. 별도 needsRefresh는 같은 generation의 정상4목록을 모두 검증해 완료한 경우에만 해제한다. partial 조회가 전체 복구 요구를 지우지 못한다.

## 실제 비용 비교

동일 synthetic73제보/3현장소식과 실제 local workerd의 측정이다. 운영 D1 데이터의 복제가 아니다.

| API | 기존 c025 읽기행 | 최종 warm 읽기행 |
|---|---:|---:|
| public-state | 103 | 23 |
| approved / recent | 224 | 144 |
| pending | 104 | 24 |
| field | 140 | 60 |
| history | 285 | 205 |
| contributors | 227 | 147 |

HEAD cold는 여전히103행이다. 동일 native Worker isolate에서600 HEAD 동시1/10/20, 오류0·쓰기0·warm23을 관찰했다. fresh-isolate burst10/20은 cold1회+warm9/19회였으나 운영 isolate 수명·지역·cold 비율은 미확인이다. trigger DROP22종은503, rowid 복구는 새 primary에서 state+payload 원자 batch로 재조회하며 첫 payload를 승격하지 않는다. 현재 검사 범위에서23행은 singleton1+필수22 guard 조회다. guard 본문 fingerprint나 schema 변경 권한 자체를 새로 봉쇄했다고 주장하지 않는다.

## 실제 Chrome10명·20명 재측정

동일65초/설정RTT75ms/실제 Chrome/독립 context 조건이다. mock API를 사용하는 Chrome 요청 계측과 실제 workerd endpoint 행 비용을 연결한 모델이며 Chrome의 모든 요청이 D1에 직접 연결됐다고 표현하지 않는다. 초기2초/steady 경계와 각 이용자의 실제 exposure를 독립 재구성했다. nonce/fresh postflight를 임의 삭제해 요청 수를 줄이지 않았다.

| 이용자 | 초기2초 | steady 요청 | steady 내역 | exposure 합계(ms) |
|---|---:|---:|---|---:|
|10|90|164|HEAD154+field10|643998.7999999747|
|20|180|336|HEAD316+field20|1292159.6999999806|

초기9요청/user: HEAD4+approved2+pending1+recent1+field1. 승인목록의 겹치지 않은 두 조회는 남았다. 이전 초기13/user 대비 감소하지만 중복 전부 제거로 보고하지 않는다. 이전 normalized steady10명570/20명1140 대비 같은 실제 노출시간으로 요청률은71.21%/70.52%, weighted D1 읽기율은94.54%/94.42% 감소했다. raw steady 합계·bootstrap 초과분·보조 phase는 그대로 보존하고 정규화로 숨기지 않았다.

최종 부하 안전18/18, runtime error0, operating request0, steady expiry0, 미적격 동적위치 노출표본0. 이는 실제 이용자 네트워크나 모든 가능한 순간의 무노출 보장은 아니다. RTT300ms/지터 조건은 계속 만료·폐쇄·전체조회하므로75ms 조건의 개선율을 운영 지연 분포에 그대로 적용하지 않는다. 숨김12초 요청0을 장시간 숨김 전체 요청0으로 일반화하지 않는다. 기존10분 제보 타이머/사용자 상호작용은 따로 비용을 계산한다.

## 계정 전체 Free 예산

Workers100000요청/day, D1읽기5000000행/day, 쓰기100000행/day. 공식 문서 확인2026-10-13: https://developers.cloudflare.com/workers/platform/limits/ 및 https://developers.cloudflare.com/d1/platform/pricing/ . UTC00:00/KST09:00 갱신이며 표는 한 quota day에 모든 활동이 들어가는 추가 동시이용자 집단 가정이다.

기존 읽기전용24시간 계정 baseline Worker1242/D1read62111/write665를 합산했다. 사용자 제공1230D1쿼리/58000읽기/496쓰기와 기간/단위가 달라 동일 관측으로 취급하지 않는다. D1 query를 Worker 요청으로 바꾸지 않는다. 아래는 측정 steady 외삽+초기+10분 타이머(3목록×6회=18payload/h, HEAD 공유 없음 상단36추가HEAD/h)의 **warm 조건 모형**이다. universal 보수 상한이나 실제1h/8h 관측이 아니다.

| 조건 | 이전 요청 / 읽기(단기 외삽) | 새 요청 | 새 읽기 | 모델 한도 판정 |
|---|---|---:|---:|---|
|10명×1h|33219 / 4320535|11040|326732|조건 내 한도 이하|
|20명×1h|65012 / 8554671|21225|600114|조건 내 한도 이하|
|10명×8h|256141 / 33996572|78994|2136518|조건 내 한도 이하|
|20명×8h|509579 / 67736724|159840|4281012|Worker 초과|

이전열은 기존65초 모형으로 장기 timer 가산 전이므로 새열의 timer상단과 완전히 동일한 수요구성은 아니다. 정확한 before/after steady-only 및 timer/interaction별 분해는 INDEPENDENT_FINAL_FREE_BUDGET_3D4291.json을 기준으로 한다. 가산 HEAD0..36/h는 공유 가정의 범위이며 새로운 request floor 증거가 아니다. field65초 관측률도공칭60/h보다조금낮아 단기외삽 오차가 있다.

20명×8h는5초 HEAD만115200회, 선택4750ms 공칭 약121264회로 request 한도 초과가 독립적으로 확정된다. quota reset을 걸쳐 나눠지는 경우와 한날 집중 시나리오를 혼동하지 않는다. cold 요청의 추가 비용은 baseline fixture에서80행/request다. cold100% timer상단 모델10명8h=8356678행/20명8h=16968852행, cold10%20명8h=5549796행이다. 운영cold비율·처리CPU·모바일RTT/P95·DB성장·사용자상호작용·재복구 빈도는 미확인으로서10명8h도 실제 운영승인으로 해석하지 않는다. 추가 poll쓰기0이며 기존계정쓰기665만모형에포함했다.

## 회귀 원장과 실패를 구분한 판정

- 9b 전체 자동실행734pass/0fail/1skip. 5c 변경 API253/253 새실행. 3d 변경 프런트359/359 새실행. 나머지124개 이전 실행과 source동일성으로 최종 영향 검증736/0/1이다.736전체를 같은최종SHA로 다시 실행했다고 주장하지 않는다.
- publication72/72, 실제Worker primary15/15, freshHEAD/요청시작5초20/20, needsRefresh14/14. native 비용/daily산술 입력검사는 제품 테스트 개수에 더하지 않는다.
- S2 182/182, 특별21/21, popup12/12. S1-R171 누락0, 일반17오탐0. B6/CAS/terminal/동의철회/두길찾기/GPS 지연은 기존 source와 관련자동/Chrome 범위에서 유지한다.
- Chrome 원형241:9b240pass/1fail, 최종3d239pass/2fail을 삭제하지 않았다. 하나는 같은세대에 항상deferred payload2개라는 기존 본수 기대와 in-flight공유의 차이다. 다른375폭 transit은 직접4loader helper가 needsRefresh 완료를 처리하지않아 전체4목록재검증을포함하는recheck시간을단일HEAD시간으로비교했다.8035ms/remaining0에서안전폐쇄됐다. 원형assertion을완화하지않는다.
- 새 독립 Chrome16/16:5폭에서 같은세대공유 뒤freshpostflight 철회폐쇄, 새generation2응답 역순차단, 같은revision KST월말자료폐쇄/복구,375폭 실제checkedMono부터5초상한을실제DOM으로확인했다. 별도복합 recheck1/1도8039ms의전체작업뒤remaining0/allowedfalse/readyfalse/동적DOM없음을확인했다. 현재3d 실제API+합성SQLite가생성한DTO의B6Chrome5폭170/170도통과했다. 과거c025DTO재생70pass/100fail은이미지난expiresAt에따른정상만료제외와후속하네스null참조였다. 옛fixture 날짜나assertion은고치지않고원형실패를보존했으며새currentfixture를별도생성했다.
- 고정2026-10-08 22:40 KST:190곳/176후보, 제보ON/OFF 후보전수·상위10 ID/순서/원점수/표시점수/rank/가점/날짜/시각/유형 동일.75추천/P0/S2함수와4정적길찾기함수 불변.
- ON signature47c90497b6995318031b10e85c0750f77f5898c5ce1a75bfb951b820eb5e9afb; OFF ecd3d28b8c3d5f23cfbf00bcc305c2171bff01ea4f81027dc1407ffe1a84a758.

원형old load cold alias failure, 초기ENOENT·잘못된파일명, oldweather2-only 하네스 전제 실패를 그대로 보존했다. 자동승인 검토에서 기존읽기량assertion을 먼저23으로 바꾸는 작업은 통과값조작위험으로 거절되어 실행되지 않았다. 새observational probe로 수치를 얻었고 원형실패를 성공으로 바꾸지 않았다.

## 최신 main, validator, 기존 활성 Worker

마지막원격확인 main07680616,PR13b12e20c,PR162452989,PR179f9e9be로 이전head와같다. gh 미설치 조회 실패 뒤 읽기전용 git ls-remote로 정확SHA를확인했다.3d+main 임시 merge-tree d899f0bfa6e0861f64a710df5fd2ed9abbd65b4a 충돌0·자동6JSONbyte보존. GitLF/WindowsCRLF의hash차이는 SOURCE_BYTE_VARIANTS.json으로정확한newline-only 변환을증명했다. 실제Chrome는canonicalLF source다.

기존10/12 고정자료의 현재10/13 validator Batch date mismatch exit1은별도미해결이다. latestmain 실제10/13새배치validator today/week0/0·자정/갱신48/48은다른입력의검증이다. 날짜검사삭제/JSON날짜변경/운영자동갱신dispatch없음. 새branch의PR CI통과를보고하지않는다.

과거읽기전용활성소스대조에서public494b97/admin0134cd9a가Git41650e43와같았고새S1-R/B6/publication방어가없었다. 합성보호표현과과거cache의재노출코드위험은남는다. 이번세션은민감운영행을조회하지않았으며현재운영에그자료가있거나누가열람했다는증거가없다. 실제사고나새배포버전으로단정하지않는다. 기존활성버전을보호유지rollback으로승인하지않는다.

## 운영 보류와 다음 작업

main/Worker/Pages/운영D1/실사용자자료/유료전환변경0. PR13/16/17 producthead변경0. 별도브랜치만commit/push한다.20명8h Free조건 불가·운영cold/지연/CPU미측정·현재날짜validator별도미해결을유지한다. 운영승인요청/배포로진행하지않는다. 재개는 NEXT_SESSION.md와각JSON의exactargv/exit/log를사용한다. 실제완료되지않은Chrome추가범위는별도기록한다.


## 사용량5% 중단 체크포인트

2026-10-13 사용량 확인에서 primary96%사용/secondary93%사용으로 가용window최소잔여4%였다. 사용자5%중단지시에따라 추가분석·시험·운영승인요청을정지하고이자료를전용branch에commit/push한다. 완료된로컬검증을미완료로되돌리지않는다. 생산부하/CPU/cold/실제모바일RTT·운영기상신선도·최신공개버전재조회·운영배포는미실행이다.20명8h조건은여전히Free불가다.
