# Workers Free 최종 용량 독립 대조 — 3d42910

최종 Chrome 제품 SHA: 3d42910cb0cea8a5e79c2d57d068c91b86b18332. 실제 서버 측정 SHA:5c03d3b125260c883e9133102ac64129f11ca9da. 두 SHA의 publication.js Git 본문은 같다. 비교 제품:c025d75f964ab36f6f2eae541a99461f6de59b70. 옛 Chrome 자료의6d0f435b index는 c025와 같은 바이트임을 독립 확인했다. 예비9b Chrome 실패 자료는 사용하지 않았다.

독립 Python 계산을 실행했고 exit0이다. raw Chrome 요청 시각을 다시 읽어 초기2초/steady/outside를 분리하고, 각 이용자의 실제 foreground 노출시간을 합산했다. 정규화 결과와 원본 보존·수량·시각이 일치한다. 4904개 입력/회계 assertion은 자동 제품 테스트 수치에 더하지 않는다.

- 10명: 초기90요청, steady164(권한154/현장소식10), 실제 노출 합643998.7999999747ms.
- 20명: 초기180요청, steady336(권한316/현장소식20), 실제 노출 합1292159.6999999806ms.
- 초기 사용자당9요청: 권한4/승인2/대기1/최근1/현장소식1.
- 원래 대비 측정 요청률 감소:71.21% /70.52%.
- warm SQL을 결합한 측정 읽기률 감소:94.54% /94.42%.
- 실제 호출의 초기와steady를 중복 합산하지 않았다.

기존 계정 rolling24h Worker1242회, D1 read62111/write665행을 추가했다. 이는 현재 UTC 일일 잔여량이 아니다. 사용자가 제공한 별도24h D1 쿼리1230회/read58000/write496은 Worker 요청 수로 대체하지 않았다.

## 같은 UTC quota day의 용량 모델

10분 timer는 시간당6번×3목록=18 payload 호출이다. 기존 poll과 겹칠 수 있는 fresh HEAD의 **추가분**을0~36/h의 넓은 민감도 범위로 두었다.0은 가능한 중복 계산 하한이고 운영 예산에서 무료라고 가정한 것이 아니다. 아래 표는 timer 추가 HEAD36/h를 적용한 상단 모델이다. 짧은75ms trace의 warm 동작이 계속된다는 가정이며, 보편적인 최대 비용이 아니다.

| 코호트 | 보완 전 요청 | 보완 후 요청 | 보완 전 D1 읽기 | 보완 후 D1 읽기 |
|---|---:|---:|---:|---:|
|10명×1h|33759|11040|4390735|326732|
|20명×1h|66092|21225|8695071|600114|
|10명×8h|260461|78994|34558172|2136518|
|20명×8h|518219|159840|68859924|4281012|

보완 전후 모두 같은 장기 timer 상단과 같은 계정 baseline을 적용했다. 따라서 이전 최종 보고의 “장기 timer를 따로 더하지 않은65초 연장표”와 수치가 다르다. 표의 모든 활동은 같은 UTC quota day에 들어간다는 조건이다. UTC00/KST09 reset을 걸치면 총 요청이 여러 날짜에 나뉠 수 있다.

Workers Free100000요청/일 기준으로20명×8h는 여전히 초과한다. **5초 권한 polling만으로115200회**이며 현재4750ms cadence nominal은121264회다. SQL 최적화가 이 요청 한계를 해결했다고 주장하지 않는다.

## cold 및 느린 응답의 불확실성

103행 cold /23행 warm 차이80행을 매 권한 query에 적용하는 민감도를 별도로 계산했다.

- timer상단,10명×8h: 모두 warm이면2136518행; 모든 권한 query가 cold이면8356678행.
- timer상단,20명×8h: 모두 warm이면4281012행; cold10%이면5549796행; 전부 cold이면16968852행.
- 같은 하루의20명×8h는 warm 상태에서도 Worker 요청부터 차단된다.
- isolate/POP 수와 재생성, 실제 catalog/report/field 양, 운영 CPU/RTT는 미측정이다.
- field의65초 관찰은 사용자당약55.9회/h로 환산된다. nominal60회/h와 차이가 있어 짧은 윈도 모델을 전체 최대량으로 부르면 안 된다.
- 타임아웃·느린 응답·timer jitter가5초 상한을 넘으면 기존 fail-closed와 목록 복구가 작동해야 한다. 추가 full-refresh6/60회/h의 가상 민감도를 JSON에 별도 기록했다. 이 숫자는 실제 발생 빈도가 아니다.
- history/contributors/GPS/길찾기 등 추가 이용의5.1회/client interaction phase는 관찰된 별도 일회성이다. 이를 시간당5.1회로 임의 변환하지 않는다.

## 바이트 차이와 실패 보존

첫 계산은 “Git LF 바이트 해시가 measured archive CRLF 해시와 같아야 한다”는 과도한 raw hash assertion에서 exit1이었다. 원본 로그를 보존했다. 실제 파일을 대조해 Git LF→CRLF 변환만으로 측정 archive가 **정확하게** 재구성됨을 확인했다. 단순히 기대 SHA를 바꿔 통과시키지 않았다.

서버 canonical Git LF hash:365a475b611dcf4db2982f724dec80f2f81fb94e4e2dd752b46c51dd319d4cb9.
실제 native 측정 archive hash:1aeed3da733db0154b80e17297e0f56473952be2d992fabf33d7775caaaadad9.
두 raw hash를 각각 원장에 유지하고 exactLF-to-CRLF proof를 기록했다.

증거:
- INDEPENDENT_FINAL_FREE_BUDGET_3D4291.json
- independent_final_budget.py
- independent_final_budget_3d4291_variant.log (exit0)
- independent_final_budget_3d4291.log (보존한 raw hash assertion 실패)

## 판정

**BLOCKED — 운영 승인 요청 전 중단.** 최소 보완으로 권한 SQL과 정상 동작의 읽기량은 크게 줄었다. 하지만20명×8h를 한 UTC quota day에 서비스하는 Workers Free 조건은 충족하지 못한다. cold/jitter/운영CPU·현재 날짜 기상 validator의 미확인도 남는다. main 병합, Worker 활성화, Pages, D1, 실제 자료, 유료 전환은 수행하지 않았다.

