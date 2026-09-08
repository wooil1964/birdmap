# HANDOVER.md — AI 작업 인수인계 문서

이 문서는 여러 AI(ChatGPT, Codex, Claude Code, Gemini)가 이 저장소에서 순차적으로 작업할 때
현재 상태와 최근 완료 작업을 공유하기 위한 인수인계 문서입니다.

> 작업 규칙은 `AI_WORK_RULES.md`가 최우선이며, 이 문서와 충돌하면 `AI_WORK_RULES.md`를 따릅니다.

## 현재 서비스 기준

- 실제 서비스 파일: main 브랜치의 `index.html` (GitHub Pages 배포)
- 실시간 기상: Cloudflare Worker (`weather-proxy/`) 연동
- 기상·조석 데이터: GitHub Actions가 `weather_today.json`, `tide_today.json`, `tide_month.json` 자동 갱신
- 오프라인 원본 DB: `data/` 폴더의 엑셀 파일 (기준 엑셀은 사용자가 지정)

## 최근 완료 작업

- 추천 계절 정책을 추천 날짜 기준으로 적용(H01, 2026-09-08, 시작·기준 main `b566149`): root cause는 `weeklyRecommendationForSite()`가 화면을 연 **현재 KST 월**로 계절·환경·선상 정책을 먼저 정한 뒤 rolling 7일 sample을 고른 것이다. 그래서 5/31에 열면 6/1 sample까지 봄 정책으로, 10/31에 열면 11/1 sample까지 가을 정책으로 판정됐다(수정 전 재현: 3/1 제주 남방62가 겨울 선상으로 통과, 11/1 주문진항53이 가을 선상으로 통과, 9/1 천수만 간월호15가 8월 농경지 제외로 탈락, 어청도1은 여름 부적격인 6/1 100점이 선택돼 유효한 5/31 90점까지 사라짐).
  - 수정: `weeklySeasonForDate()`/`weeklyDatePolicy()`/`weeklySeasonalBestWeatherDay()`를 추가해 **날짜별로 계절 정책을 먼저 적용**하고, 그 날짜의 환경·제외·allowlist·선상 안전필터를 통과한 sample만 기존 daily/weekly 최고점 비교에 넣는다. 다음 계절에서 부적격인 고득점 sample 때문에 site 전체가 탈락하지 않고, 반대로 다음 계절에서만 유효한 후보도 현재 계절 exclusion으로 사라지지 않는다. 계절 범위(봄 3~5·여름 6~8·가을 9~10·겨울 11~2)와 각 계절의 정책 내용·비율·ID·임계값은 전혀 바꾸지 않았고, `autumnRecommendationSeason`·`weeklyPelagicRecommendationSeason`·`todayIsAutumnRemoteIsland`·`todaySpringIslandReason`에는 기존 계절 함수와 같은 방식으로 month 인자만 추가했다(인자 없으면 종전대로 오늘 기준).
  - 사유·mandatory도 추천 날짜 기준이다. 물때 mandatory는 가을 정책일 때만, 9월 동풍은 가을·비선상일 때만 붙인다(두 규칙의 내부 9·10월 조건과 수치는 무변경이라 계절 내부 동작은 동일하다). 봄 도서 사유와 `todaySpringIslandReason`도 추천 날짜의 월을 쓴다. 카드의 축 라벨과 겨울 '해안·항구 육상탐조' 표기는 `entry.season`을 따르도록 `weeklyAxisLabel()`/`weeklyEntrySeason()`으로 정리했다.
  - **혼합 계절 주간 quota는 새 정책을 만들지 않았다.** 화면의 계절(오늘 기준) soft target은 그 계절 날짜의 후보에만 배정하고, 다른 계절 날짜의 후보는 기존 fill 단계에서만 채운다(`weeklySeasonQuotaEntries()`). 비율 합성·비례배분·다음 계절 우선 같은 규칙은 도입하지 않았다. 경계 주간에서 다른 계절 후보를 어떤 비율로 넣을지는 사용자 결정이 필요한 미결 사항이다.
  - 검증: 계절 경계 8곳(2/28→3/1, 윤년 2/29→3/1, 5/31→6/1, 6/30→7/1, 7/31→8/1, 8/31→9/1, 10/31→11/1, 12/31→1/1)과 CASE A~G, 현재계절 유효 90/다음계절 부적격 100 선택 테스트를 신규 6개로 추가했다. 계절 내부 회귀는 실제 187곳 `weather_week.json`을 봄·여름·가을·겨울 주간으로 각각 돌려 수정 전후 추천 10곳의 ID·날짜·시각·점수·축·사유·물때·mandatory가 **완전히 동일**함을 확인했다. C01의 `safetyRaw` 구조와 `weeklyPelagicSafety()`(풍속 ≤6.0·파고 ≤0.7·강수 ==0)는 그대로이며 H01 테스트도 safetyRaw fixture를 사용한다. 주간 추천 81·기상 24·조석 20·Worker 33(총 158) 통과, validator 2종 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·중복 ID 0·siteData와 좌표 완전 동일. `update_weather.py`·`weather_rules.json`·score_weather·조석·notices·자동 생성 JSON은 변경하지 않았다. 변경 파일은 `index.html`, `.github/scripts/test_weekly_recommendation.mjs`, `HANDOVER.md`뿐이다. Ultra 감사의 M01~M07 등 다른 항목은 이번 작업 범위가 아니며 해결하지 않았다.

- 선상 안전판정 원자료 precision 보존(C01, 2026-09-08, 시작·기준 main `6f58e8b`): root cause는 `build_week_days()`가 windSpeed·waveM·precipitation3h를 소수점 한 자리로 반올림해 저장하고 `weeklyPelagicSafety()`가 그 표시용 값을 검사한 것이다. 그래서 원자료 6.01/0.7/0, 6.0/0.71/0, 6.0/0.7/0.01, 6.04/0.74/0.04이 모두 6.0/0.7/0.0으로 저장되어 안전 gate를 통과했다(수정 전 실제 생성기 → 추천 경로에서 재현 확인). 수정은 생성 단계에서 `pelagic=true` 탐조지 sample에만 `safetyRaw`(windSpeed·waveM·precipitation3h 원자료)를 추가하고, `weeklyPelagicSafety()`가 safetyRaw가 있으면 그 원자료로만 판정하도록 한 것이다(없는 기존 저장본은 종전처럼 표시값 사용, safetyRaw 안의 결측·비수치는 fail). 표시·점수용 필드와 UI formatting은 그대로라 화면은 계속 `북풍 6.0m/s`·`0.7m`·`강수 없음`으로 보인다. 사용자 확정 안전기준은 불변이며(평균풍속 ≤6.0, 파고 ≤0.7, 3시간 강수 ==0) epsilon 완화나 임계값 변경은 없다. `validate_weather_week.py`에는 safetyRaw가 있을 때 표시값과 같은 측정인지(round(raw,1) 일치) 확인하는 검사만 추가했다.
  - 신규 통합테스트: `.github/scripts/pelagic_safety_fixture.py`가 실제 `build_week_days()`·`week_json_text()`로 대진항 ID48 주간 문서를 만들고, `test_weekly_recommendation.mjs`가 그 텍스트를 그대로 JSON.parse 해 `weeklyPelagicSafety()` → `weeklyRecommendationForSite()` → `todayRecommendedSites()`까지 확인한다. 6.01/0.7/0·6.0/0.71/0·6.0/0.7/0.01·6.04/0.74/0.04은 최종 추천에서 제외되고 6.0/0.7/0만 추천된다. precision 경계(풍속 5.999·6.0 통과, 6.000001 실패 / 파고 0.699·0.7 통과, 0.700001 실패 / 강수 0 통과, 0.000001 실패)와 봄 5월·여름 6월 대진항·가을 9월·겨울 12월 선상 회귀도 같은 생성 경로로 확인했다. 계절 allowlist와 축 비율은 변경하지 않았다.
  - 회귀 검증: 동일 합성 상류 입력으로 187곳 10,472 sample을 수정 전후 비교해 score를 포함한 기존 필드 차이 0, safetyRaw는 선상 9곳 504 sample에만 추가(파일 증가 약 0.9% 예상). 주간 추천 75·기상 24·조석 20·Worker 33(총 152, 기존 147+5) 통과, weather_today·weather_week validator 통과, inline JS 3개 문법 정상, runtime/Worker 187/187·불일치 0·중복 ID 0·siteData와 좌표 완전 동일. weather_rules·score_weather 수식·조석·notices·자동 생성 JSON은 변경하지 않았다. 변경 파일은 `index.html`, `.github/scripts/update_weather.py`, `.github/scripts/validate_weather_week.py`, `.github/scripts/test_weather.py`, `.github/scripts/test_weekly_recommendation.mjs`, 신규 `.github/scripts/pelagic_safety_fixture.py`, `HANDOVER.md`뿐이다. Ultra 감사의 다른 항목은 이번 작업 범위가 아니며 해결하지 않았다.

- 여름 추천 엔진(2026-09-08, local 시작 `1103e02190ce175e14ee16c31b95edc34b57511e`, 최신 main `d9cd2a943787707566413b9ace4adc259a690431` fast-forward 후 구현): `weeklySummerRecommendationSeason()`으로 KST 6·7·8월의 추천만 분기한다. 전역 계절/지도 필터는 그대로다. 6월 forest3/water3/coast2/other1/대진항 선상 최대1, 7~8월 forest3/water3/coast2/other2 soft target. 부족분은 허용된 육상 축만 기존 score → 가까운 날짜 → stableOrder → ID 순서로 보충한다. 전역 ID dedupe·최대10·복합 환경 1카드, 선상0 허용. 고정 forest core나 점수 보너스는 없다.
  - 환경: 실제 env를 ·/쉼표/구분자/공백으로 분리한다. 농경지/간척지/목초지/초지는 다른 환경과 복합이어도 먼저 제외한다. 이어서 island=true 또는 도서/섬/해양도서 token을 제외한다. 지명의 '도'·'산'·'릉'이나 weatherRuleKey로 추정하지 않는다. 봄 핵심 6개 도서의 19개 ID도 모두 여름 제외하며 지도와 다른 계절 원본은 보존한다.
  - forest: 산림/고산/도심산림/숲/휴양림/수목원/곶자왈 실제 token. 월악산77·소백산78·오대산 월정사79·설악산80·지리산81·태백산82·북한산85·광릉숲86 포함 확인. water: 습지/습지생태공원/하천/강/강변/호수/저수지/간척호/석호/유수지 및 갈대습지/내륙습지/하천습지/연안습지/습지공원/도심하천/한강변 직접 token. 공원 단독은 water가 아니고, 용현유수지139의 '공원 유수지'는 유수지로 water. coast: 해안/갯벌/해변/하구/항구. 주요 세 축은 사용자가 지정한 여름 환경 정책을 근거로 하며 별도 seasons 필터를 추가하지 않는다. 가을 조석 700/850/850cm는 여름 적용하지 않는다.
  - other: 실제 env='릉'인 파주삼릉109 허용, '여름 릉·수림 탐조' 표시. 현재 왕릉 token과 파주 장릉 등록은 없으므로 가상 token/장소를 추가하지 않았다. 나머지는 forest/water/coast 밖에서 실제 환경과 seasons/seasonTags/bestSeason의 명시적 '여름' token이 있어야 한다. 현 runtime은 공원6곳(136 대왕암공원,143 강서습지생태공원,144 송도,147 맥도생태공원,148 태종대,151 관곡지)만 해당한다. 모든 공원/사찰/유적지를 일괄 포함하지 않는다.
  - 선상: runtime48 대진항 pelagic=true 확인. 여름 선상은 현재월6월 + 실제 추천 sample 날짜6월에만 허용한다. 6/30 rolling week에 들어온 7월 고득점 sample도 제외한다. 7~8월 선상0, 나머지 pelagic 장소는 여름 후보에서 제외한다(주문진항53·어달항54·후포항55도 이번 여름 요청에는 육상 항구로 재해석하지 않음; 겨울의 육상 항구 예외는 그대로). 기존 weeklyPelagicSafety 평균풍속<=6.0m/s·파고<=0.7m·3시간 강수0mm, 필수값 비수치/결측/음수 탈락과 scoreEligible·daylight·오늘 과거시각 제외를 그대로 쓴다. 돌풍/시정 참고표시, '6월 슴새 선상탐조 시기로 주목' 및 선사 출항 공지 확인 문구 유지. 출현·출항을 확정하지 않는다.
  - 대표 날짜/시간: 기존 dailyBest 최고점 → 오전 우선 → 이른 시각, weeklyBest 최고점 → 가까운 날짜를 재사용한다. 기존 caution false는 선발 전 제외하고, null(기상 미확인) today fallback은 기존 의미를 유지한다. 주간 자료가 있으나 유효 sample이 없거나 today scoreEligible=false이면 공지로 승격하지 않는다. 공지 정보와 연결 기능은 보존한다.
  - 실데이터 분류(기상 선발 전, 복합 축은 중복 집계): forest16/water56/coast44/other7(릉1 포함)/6월pelagic1. 고유 허용6월107, 7·8월106. 원시 field token26, 실제 island=true43, island flag 또는 섬 token46, field∩island1(112 알뜨르비행장). 중복 없는 제외 우선순위 집계는 field26/island45/pelagic7/unclassified2=80(6월), 7~8월 pelagic8로 제외81. 26+46을 단순 합산하지 말 것.
  - unresolved: 현등사113(env 사찰), 연천 숭의전187(env 유적지)은 여름 계절 근거가 없어 미분류 제외. 농경지 복합22곳도 정책 확정 없이는 수계/해안으로 재포함하지 않는다: 7교동도(간척지·갯벌),8석모도(간척지·갯벌),10강화도(갯벌·농경지),15천수만 간월호(간척호·농경지),20새만금(간척지·갯벌),21동진강 만경강(하구·간척지),23고천암철새도래지(간척호·농경지),28주남저수지(저수지·농경지),30화포천습지(하천습지·농경지),37공릉천(하구·농경지),38임진강 연천(하천·농경지),39한탄강두루미탐조대(농경지·하천),40석탄리철새조망지(농경지·하천),93구미 강정습지(하천습지·농경지),112알뜨르비행장(농경지·관광지),162남양주 물의정원·북한강변(강변 습지·농경지),168곡교천 은행나무길·현충사 일대(하천·농경지),173원주 흥양천·섬강 합류부(하천·농경지),176금호강 하중도(강변 초지·습지),179승촌보공원(하천·보·농경지),185사천 광포만(갯벌·하구·농경지),186갑천 불무교(내륙 하천·자갈톱·농경지). 그 외 unknown 환경을 임의로 여름 생태 근거로 해석하지 말 것.
  - 검증: 주간72(기존61+여름11)·기상22·조석20·Worker33 총147개 및 두 weather validator 통과. inline JS 문법/diff check 정상. 기준 main과 가을 실제 예보·봄/겨울 합성 fixture의 추천 entry 전체가 완전히 동일하다. runtime/Worker187/187·ID 중복0·좌표/이름/pelagic/env 불일치0, siteData187개 전체 비교 동일. 변경 파일은 index.html·.github/scripts/test_weekly_recommendation.mjs·HANDOVER.md뿐이며 weather_rules/점수/좌표/생성JSON/updater/Worker/Actions/엑셀은 무변경.
  - 화면 검증은 2027-06/07/08-10 테스트 clock과 메모리 내 합성 예보로 수행하며 실제 9월 JSON을 덮어쓰지 않았다. 각 월 PC1366x768/모바일390x844 추천10·가로/카드 넘침0, 6월 대진항1 및 출항 확인 문구, 7·8월 선상0, 파주삼릉 릉 표시 확인. 6월 파주삼릉 실제 지도 popup·패널 재열기·공지 내용 연결 정상, console error/warn0. 임시 진단 파일/서버 코드는 repository에 남기지 않는다.

분류 재현: PowerShell `$env:SUMMER_REPORT='1'; node --test --test-name-pattern='여름 실제 환경 전수' .github/scripts/test_weekly_recommendation.mjs`.


- 봄 추천 엔진(2026-09-08, local 시작 `9d55a96`, 자동 기상1개 반영 후 구현 기준 `d37895f`): 추천 전용 `weeklySpringRecommendationSeason()`으로 3~5월 적용. 도서4/갯벌·하구3/선상최대1/기타2 soft target, 부족분은 봄 후보군에서 점수순 보충, 전역 site ID dedupe. 도서축은 score 우선 → 핵심 도서 동점 우선 → 날짜 → 기존 순서 → ID. 걸매리는 실제 추천 sample 날짜 5/1~10에 갯벌축의 일반 후보보다 먼저 평가하며 score는 그대로. 전역 계절/score_weather/weather_rules/가을·겨울 정책은 무변경.
  - 핵심 도서6개 정확 이름은 runtime19개 ID: 어청도1·101·102·103 / 외연도2·104·105·106 / 백령도4·117·118·119 / 흑산도63·127·128·129·130 / 홍도64 / 가거도65. 모두 원본 island=true,pelagic=false,seasons=[봄,가을], 이동성 조류/섬탐조 feature 확인. 이름 유사 장소를 확대하지 않았으며 ID별 후보를 보장하되 최종 고정 포함/점수 보너스 없음. 현재 원본에 같은 이름의 여러 ID가 있어 이름 기준 통합은 하지 않는다(사용자 지정 ID dedupe).
  - 분류는 env 정확 token + 실제 seasons/seasonTags/bestSeason(봄 또는 연중) + birdingFeature만 사용하고 weatherRuleKey를 환경으로 쓰지 않는다. core 또는 도서·섬·해양도서 token, island=true이면서 이동성/섬탐조 feature는 island. 갯벌·하구는 mudflat. 농경지·간척지·목초지·초지·습지/호수/저수지/간척호 및 직접 대응 token·하천/강/강변은 other, 산림/공원/해안 등은 봄 계절 근거와 이동성/통과 feature가 함께 있을 때만 other. 복합환경 보존. 겨울 섬 제외와 가을 원거리 섬 제외를 봄에 적용하지 않는다.
  - 도서 유입조건은 카드에 표시할 sample T의 KST timestamp를 기준으로 [T-24h,T) 안에 유한한 숫자 강수>0 sample이 있는지 확인하고, T의 풍향이 W/NW/서풍/북서풍이면 사유를 추가한다. 정확히24h는 포함,24h 초과·T 자신·미래 강수·결측/비수치·다른 방향은 제외. 야간/오늘 과거 강수는 근거로 읽되 추천 시간은 기존 daylight/오늘 과거시간 제외/dailyBest/weeklyBest를 사용한다. windName이 없고 degree가 있으면 기존 update_weather.wind_name/Worker.windDirectionName의8방위 체계로 동일 판정(Worker와 경계 대조 테스트). 새 풍속 임계값 없음. '봄 도서 이동기', '비 뒤 서풍·북서풍 전환으로 이동성 조류 유입 가능성에 주목'만 표시하며 점수 가산/출현 단정 없음. week에 이전24h 자료가 없으면 강수를 추정하지 않아 false이며, 이전 풍향과의 변화량을 별도 조건으로 추가하지 않는다(사용자가 정한 선행 강수+현재W/NW 정의).
  - 유부도19는 봄 추천 layer에서만 제외, 지도/원본/가을·겨울 유지. 걸매리14(env 갯벌·간척호)는 실제 추천일 5/1~10에 '5월 초 긴부리흑꼬리도요 이동 시기로 최우선 검토'를 표시한다(사용자 현장 관찰 기준). 4/30·5/11에는 특별 우선 없음. 현재가5/10이어도 최고점 추천일이5/11이면 우선 없음. 가을의 유부도700·매향리850·걸매리850cm mandatory를 봄에 복사하지 않는다. caution false 후보 제외는 기존 함수 재사용. 봄 weekSite가 있는데 유효sample0이면 공지로 승격하지 않으며, today fallback은 기존 null 안전 의미를 유지하되 scoreEligible=false는 제외한다. 걸매리 특별 우선은 실제 dayBest가 있어야 한다.
  - 선상은 기존4~5월만(3월0), pelagic=true/독도제외, 기존 weeklyPelagicSafety wind<=6.0·wave<=0.7·3시간강수0 및 결측탈락 그대로. caution도 통과해야 함. 선사 확인 문구 유지. 도서 유입/걸매리/선상 어느 경로도 점수 가산 없음.
  - 실분류(기상 선발 전, 복합축 중복): island45/mudflat41/pelagic8/other99, 고유162. 3월에는 선상8을 제외하여 고유154. 제외25는 유부도·독도2, 봄 계절 근거 없음3(태화강56·송도144·이천항188), 보수적 환경/이동성 분류 미충족20. 실제9월 예보를 봄으로 해석하지 않았으며 2027-05-05 합성 fixture와 고정clock으로 검증했다.
  - 검증: 주간61·기상22·조석20·Worker33 총136개 테스트 및2종 validator 통과. 24h/25h/미래/결측/W·NW/degree경계/표시시각일치/caution, 걸매리5/1~10·60점우선·부적격/결측탈락·가을물때미적용, 3월선상제외,4/3/1/2·부족보충·중복0 회귀 통과. 현재9월 추천entry와 겨울fixture entry 전체가 `d37895f`와 동일. runtime/Worker187/187·mismatch/duplicate0·siteData 전체동일·좌표변경0·inline JS/diff check 정상. 합성 봄 PC1366x768/모바일390x844 카드10·가로/카드 넘침0·도서 보수적 사유·걸매리60점표시·선상안내 정상, notice연계/재열기/걸매리 지도popup 정상·console error/warn0.
  - 완료 직전 자동 기상 `8a54fd8`(15:00 생성)이 추가되어 봄 커밋을 rebase하고 전체136개/두 validator를 재검증했다. 기존 실데이터 테스트의 청림운동장 동풍 상시충족 가정이 새 예보에서 깨져 실제 동풍 판정과 사유가 일치하는지 검사하도록 보정했다. 동풍 경계/지역/월/caution 합성 테스트는 유지했다.
  - 변경 파일: index.html·.github/scripts/test_weekly_recommendation.mjs·HANDOVER.md. siteData/좌표/weather_rules/score/생성JSON/updater/Worker/Actions/Excel 무변경.

봄 핵심 도서의 실제 등록 정보:

|ID|이름|env|island/pelagic|seasons|birdingFeature|
|---|---|---|---|---|---|
|1|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|2|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|4|백령도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|63|흑산도|서남해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|64|홍도|서남해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|65|가거도|서남해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|101|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|102|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|103|어청도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|104|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|105|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|106|외연도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|117|백령도|습지생태공원|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|118|백령도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|119|백령도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성;들뫼추천|
|127|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|128|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|129|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|
|130|흑산도|서해 도서|true/false|봄·가을|이동성 조류;희귀조;섬탐조;미조 가능성|

보류/제외 근거(명시 제외인 유부도·독도 외23곳; 아래 환경을 다른 축으로 임의 확장하지 않음):

|ID|이름|env|근거|
|---|---|---|---|
|47|아야진해변|해변|허용 환경/이동성 근거 미충족|
|49|호미곶|해안|허용 환경/이동성 근거 미충족|
|56|태화강|하구·도심하천|봄 계절 근거 없음|
|77|월악산|산림|허용 환경/이동성 근거 미충족|
|78|소백산|산림·고산|허용 환경/이동성 근거 미충족|
|79|오대산 월정사|산림|허용 환경/이동성 근거 미충족|
|80|설악산|산림·고산|허용 환경/이동성 근거 미충족|
|81|지리산|산림·고산|허용 환경/이동성 근거 미충족|
|82|태백산|산림·고산|허용 환경/이동성 근거 미충족|
|83|덕유산|산림·고산|허용 환경/이동성 근거 미충족|
|84|치악산|산림|허용 환경/이동성 근거 미충족|
|85|북한산|도심산림|허용 환경/이동성 근거 미충족|
|86|광릉숲|산림|허용 환경/이동성 근거 미충족|
|97|여수 돌산 향일암 해안|해안|허용 환경/이동성 근거 미충족|
|109|파주삼릉|릉|허용 환경/이동성 근거 미충족|
|113|현등사|사찰|허용 환경/이동성 근거 미충족|
|143|강서습지생태공원|공원|허용 환경/이동성 근거 미충족|
|144|송도|공원|봄 계절 근거 없음|
|154|매봉산 바람의 언덕|산림·고산|허용 환경/이동성 근거 미충족|
|187|연천 숭의전|유적지|허용 환경/이동성 근거 미충족|
|188|이천항|항구·해안|봄 계절 근거 없음|
|189|도구해수욕장|해안·외해|허용 환경/이동성 근거 미충족|
|190|임곡항|해안·외해|허용 환경/이동성 근거 미충족|

분류 재현: PowerShell `$env:SPRING_REPORT='1'; node --test --test-name-pattern='봄 실제 환경 분류' .github/scripts/test_weekly_recommendation.mjs`. 동일 이름의 복수ID는 원본 그대로이므로 이름중복과 ID중복을 혼동하지 말 것.

- 겨울 추천 엔진(2026-09-08, local 시작 `945a89c`, 자동 갱신3개를 반영한 구현 기준 `0cfeffc`): 추천 전용 `weeklyWinterRecommendationSeason()`을 11·12·1·2월에 적용한다. 전역 계절 표시는 무변경, 9~10월 가을 경로와 기존 4·5·9·10월 선상 함수 정의도 그대로다. 겨울은 들판3/습지·호수·저수지·간척호3/해안·갯벌·항구3/선상최대1 soft target, 부족분은 같은 겨울 후보군의 점수순 보충, 전역 ID dedupe, 안전한 선상 sample이 없으면 선상0. 점수 desc → 겨울 core → 가까운 날짜 → 기존 순서 → ID이며 점수 가산·강제 최종 포함 없음. 선발 전 기존 `weeklyRecommendationIsSafe()` false만 제외하고 null fallback 의미는 유지한다. 날짜/시간은 기존 daylight·scoreEligible·오늘 과거시각 제외·daily/weeklyBest 재사용.
  - 핵심 들판: ID39 한탄강두루미탐조대(농경지·하천), 15 천수만 간월호(간척호·농경지), 10 강화도(갯벌·농경지), 7 교동도(간척지·갯벌), 20 새만금(간척지·갯벌). ID39는 git `b46ce3f^`의 철원평야가 `b46ce3f`에서 현 명칭으로 바뀐 이력을 확인했다. 경안천 습지생태공원은 runtime31 경안천(습지생태공원·하천)으로 water에 포함. 천수만은 field를 먼저 선발하며 water 복합속성 보존.
  - 환경: `env`를 ·/쉼표/구분자/공백의 정확 token으로 나눈다. 농경지·간척지·목초지·초지는 field, 습지·호수·저수지·간척호 및 직접 대응 습지 token/석호는 water, 해안·갯벌·항구·해변·하구는 coast. 도서/섬 token 또는 실제 island=true는 일반 후보에서 제외하고, 산·산림·숲·고산·도심산림·휴양림·수목원·곶자왈도 제외한다. 지명의 '도'나 '산'으로 판단하지 않는다. 교동도7/강화도10/유부도19와 사용자가 coast로 명시한 동검도9는 섬 제외 예외. 연근해/육상 coast token 없는 외해·선상은 일반 제외하되 pelagic 허용5곳은 별도 평가. `항구·외해`는 육상 항구로 평가하며 원본 pelagic 값은 바꾸지 않는다.
  - 명시 제외: runtime23 고천암철새도래지,30 화포천습지,68 증도 지도갯벌(전남 신안)을 정확 ID로 제외. 대저생태공원/해평습지/담양습지/영광 불갑저수지/태평염전/백수해안도로/봉암갯벌 7곳은 현재187곳에 없고 정확 이름 Set으로만 기록했다. 담양 죽녹원178·구미 강정습지93 등 비슷한 장소를 대체 제외하지 않는다. 신규 장소나 좌표는 생성하지 않았다.
  - 겨울 선상 허용: 대진항48,제주 남방62,강사리 선상탐조191,장생포 고래선상탐조192,울산 앞바다 선상74(모두 원본 pelagic=true). 주문진항53·어달항54·후포항55(원본 pelagic=true)는 겨울 선상 제외하되 실제 항구 token으로 coast 허용, 카드에 '해안·항구 육상탐조' 표시. 독도52(pelagic=true)는 전체 제외 유지. 기존 `weeklyPelagicSafety` 평균풍속<=6.0m/s·파고<=0.7m·3시간 강수0mm 및 결측/비수치 탈락 그대로, 돌풍/시정은 참고정보. 기존 caution도 통과해야 하며 '선상탐조 추천 조건 충족'·선사 확인 안내 유지.
  - 실데이터 분류(기상 선발 전, 복합 축 중복 집계): field23/water39/coast54/pelagic5, 고유 허용100곳. 제외87곳은 명시3/독도1/섬44/산림16/일반해양0/허용축 미분류23으로 중복 없이 집계. 현재 연근해 단독 token은 없으며 해양 후보는 허용 선상·육상 항구·독도로 처리된다. 9월 실제 예보를 겨울 예보로 바꾸지 않았다. 겨울은 2026-12-10 합성 fixture와 테스트 clock으로 검증. 실제 9월 추천 entry 전체는 `0cfeffc`와 동일했다.
  - 검증: 주간50·기상22·조석20·Worker33 총125개 테스트 및 weather/weekly validator 통과. runtime/Worker187/187·mismatch/duplicate0, siteData 전체가 기준 commit과 동일·좌표 변경0. inline JS 문법/diff check 통과. 겨울 합성 화면 PC1366x768/모바일390x844에서 카드10·가로/카드 넘침0·항구 육상 표시/선상 안내 정상·notice 연계/재열기/주문진항 실제 지도 popup 정상·console error/warn0. 현재9월 실제 화면도10카드·가로 넘침/콘솔 오류0. 변경 파일은 index.html·test_weekly_recommendation.mjs·HANDOVER.md뿐이며 weather_rules/점수/원본data/생성JSON/updater/Worker/Actions/엑셀은 무변경.
  - 미해결 데이터 분류: 강·하천·강변·공원·유수지 단독은 사용자가 확정한 water/coast/field token으로 확장하지 않았다. 이름에 습지가 있어도 env가 공원이면 보류한다. 아래23곳은 임의 포함하지 않았으며, 겨울 포함을 원하면 환경 또는 정책을 명시적으로 확정할 것.

|ID|겨울 허용 축 미분류 장소|실제 env|
|---|---|---|
|32|팔당|강|
|33|팔당고니|강|
|41|굴포천|하천|
|92|공주 금강|하천|
|109|파주삼릉|릉|
|113|현등사|사찰|
|131|을숙도철새공원|생태공원·강|
|136|대왕암공원|공원|
|137|산청|강변|
|139|용현유수지|공원 유수지|
|141|연천군 두루미 관람대|강변|
|142|미호천|강변|
|143|강서습지생태공원|공원|
|144|송도|공원|
|147|맥도생태공원|공원|
|148|태종대|공원|
|149|둔치도|강변|
|151|관곡지|공원|
|153|강릉남대천|강변|
|158|중랑천 하류·살곶이체육공원|도심 하천|
|159|안양천 하류·오목교 일대|도심 하천·갈대|
|160|탄천 한강합류부|도심 하천 합류부|
|187|연천 숭의전|유적지|

분류 재현: PowerShell `$env:WINTER_REPORT='1'; node --test --test-name-pattern='겨울 실제 환경' .github/scripts/test_weekly_recommendation.mjs` (fixture 결과는 실제 겨울 예보가 아님).

- 동풍/선상 추천 분리(2026-09-08, 시작 local `31c9c37`, 최신 자동 갱신 main `35641bc` fast-forward 후 작업): 기존 9월 포항·울산·부산 동풍 8.0m/s inclusive mandatory 판정 함수·추정형 문구는 무변경. 선상 카드에서는 육상 동풍 사유를 섞지 않고, `weeklyPelagicSafety`를 추천 전용 평균풍속 <=6.0m/s·파고 <=0.7m·3시간 강수 0mm로 변경했다(필수값 결측/비수치/음수 탈락). 돌풍/시정은 값이 있으면 참고 표시하며 기존 score rule의 gust/visibility gate를 강제하지 않는다. `weeklyPelagicRecommendationSeason()`은 현재 KST 월 4·5·9·10에만 활성화하며 seasons/bestSeason을 읽거나 수정하지 않는다. pelagic=true·독도 제외, 낮·scoreEligible·오늘 과거시간 제외 후 기존 daily/weeklyBest와 tie-break 재사용. 안전 sample이 없으면 공지/동풍/today fallback으로 승격하지 않는다. 선상 추천은 기존 caution filter도 통과해야 한다. 가을 4/3/최대1/2 및 보충/dedupe 유지, 봄도 선상 최대1. 카드에 '선상탐조 추천 조건 충족'과 선사 확인 문구를 사용하며 출항 가능을 단정하지 않는다. 기존 v24FerryStatus 함수와 다른 사용처는 그대로 유지.
  - 점수/가산점/weather_rules·siteData·좌표·자동 JSON·updater·notices·Worker·Actions 무변경. 기존 핵심 들판5곳·들판 tie-break·갯벌 물때 threshold·caution 회귀 통과.
  - 검증: 주간39·기상22·조석20·Worker33 총114개 및 두 validator 통과. runtime/Worker187/187·mismatch/duplicate0·siteData 전체 비교 동일·좌표 변경0·inline JS 문법/diff check 통과. PC1366x768/1920x1080·모바일390x844/360x800에서 추천10·가로/카드 넘침0, 동풍 추정 문구와 선상 3조건 표시 정상, notice 연계/패널 재열기/대진항 지도 popup 정상·console error/warn0.
  - 실자료: weather_week 생성 2026-09-08 00:01 KST · 9/8~9/14 · 187곳·10472 sample. 선상 후보 독도 제외8곳 중7곳에 안전 sample 존재. 최종 선상 대진항 9/11 09:00·92점·평균풍속0.2m/s·파고0.6m·강수0mm·돌풍3.1m/s·시정26.7km. 최종10곳 배분4/3/1/2, 중복0. 울산 앞바다 선상은 동풍 근거 true라도 선상 안전 sample0으로 제외.

동풍 실자료 전수 결과(충족은 주간 최초 충족 시각, 미충족은 비교용 최고점 시각이며 추천/출현 확정이 아님; 선상 장소의 동풍 조건은 선상 카드에 사용하지 않음):

|장소|시각 KST|풍향|풍속 m/s|동풍 조건|
|---|---|---|---:|---|
|낙동강|2026-09-09 09:00 KST|북동풍|8.9|충족|
|호미곶|2026-09-09 06:00 KST|북동풍|15|충족|
|청림운동장|2026-09-09 06:00 KST|북동풍|11|충족|
|태화강|2026-09-09 09:00 KST|북동풍|9|충족|
|울산 앞바다 선상|2026-09-09 06:00 KST|북동풍|16.3|충족|
|부산 오륙도 이기대|2026-09-08 12:00 KST|북동풍|8|충족|
|다대포 몰운대|2026-09-09 09:00 KST|북동풍|10.6|충족|
|을숙도철새공원|2026-09-09 09:00 KST|북동풍|8.9|충족|
|솔개공원|2026-09-08 15:00 KST|북동풍|10.9|충족|
|남창들녁|2026-09-08 09:00 KST|북풍|5.5|미충족|
|대왕암공원|2026-09-09 06:00 KST|북동풍|13.7|충족|
|맥도생태공원|2026-09-09 09:00 KST|북동풍|8|충족|
|태종대|2026-09-08 15:00 KST|북동풍|8.8|충족|
|둔치도|2026-09-08 09:00 KST|북풍|4.3|미충족|
|회야댐·회야강 하류|2026-09-08 09:00 KST|북풍|3.3|미충족|
|포항 형산강 하구|2026-09-09 06:00 KST|북동풍|8.6|충족|
|이천항|2026-09-08 12:00 KST|북동풍|8.3|충족|
|도구해수욕장|2026-09-09 06:00 KST|북동풍|11|충족|
|임곡항|2026-09-09 06:00 KST|북동풍|11|충족|
|강사리 선상탐조|2026-09-09 06:00 KST|북동풍|13.6|충족|
|장생포 고래선상탐조|2026-09-09 09:00 KST|북동풍|11.7|충족|

선상 실자료 전수 결과(탈락 행의 시각은 비교용이며 추천 시각이 아님):

|장소|시각 KST|평균풍속 m/s|파고 m|강수 mm/3h|판정|통과 sample 수|
|---|---|---:|---:|---:|---|---:|
|대진항|2026-09-11 09:00 KST|0.2|0.6|0|통과|16|
|독도|2026-09-11 18:00 KST|5.5|0.7|0|독도 제외|0|
|주문진항|2026-09-11 09:00 KST|1|0.6|0|통과|12|
|어달항|2026-09-11 09:00 KST|1|0.7|0|통과|12|
|후포항|2026-09-12 12:00 KST|2.3|0.6|0|통과|8|
|제주 남방|2026-09-13 15:00 KST|4.9|0.7|0|통과|2|
|울산 앞바다 선상|2026-09-11 15:00 KST|5|1|0|안전 sample 없음|0|
|강사리 선상탐조|2026-09-13 15:00 KST|4.6|0.7|0|통과|4|
|장생포 고래선상탐조|2026-09-13 15:00 KST|4.9|0.7|0|통과|4|

울산 앞바다 선상은 낮 후보 중 풍속 초과12·파고 초과25·강수6개(중복 집계)이며 세 조건 동시 통과0이다. 재현: `PELAGIC_REPORT=1 node --test --test-name-pattern=실제 .github/scripts/test_weekly_recommendation.mjs` (PowerShell에서는 `$env:PELAGIC_REPORT='1'`로 설정).

- 추천 현장주의 제외(2026-09-07, 시작 main `bc4f1f7`): `weeklyRecommendationIsSafe(entry)`가 카드에 표시할 동일 날짜/시각의 `entry.today`를 기존 `todayWeatherCautionNote()`에 전달한다. 기존 파고/강수 임계값 및 score는 변경하지 않는다. `todayRecommendedSites()`에서 유형별 선발 전에 false 후보만 제외해 같은 축의 다음 후보와 기존 soft-target 보충이 작동한다. 기상 없음/파고·강수 정보 없음은 null(미확인)로 반환하고 기존 fallback 선발 의미를 유지하며 안전하다고 표시하지 않는다. 다른 시각의 동풍 근거·조석 주의인 `entry.cautionText`로 제외하지 않는다. 후보 생성·isMandatory·reasons·notice 연계·UI는 그대로 보존한다.
  - 최신 weather_week 생성 22:14 KST 기준: 청림운동장 후보는 9/9 18:00·58점·현장 탐조 주의·mandatory이며, 변경 전에도 순위 때문에 최종 10곳 밖(selectedAxis 없음)이었다. 변경 후에는 caution 필터에서 명시적으로 제외된다. 따라서 최신 데이터의 전후 최종 목록은 동일하고 신규 대체 site는 없다. 갯벌 슬롯에는 이미 솔개공원(9/8 09:00·80점)이 포함되어 있었다. 최종 목록: 알뜨르비행장(9/13 09:00,100), 교동도/석모도/강화도(9/8 09:00,92), 매향리/유부도(9/12 09:00,92), 솔개공원(9/8 09:00,80), 대진항(9/8 09:00,92), 이천항(9/8 06:00,91), 태종대(9/8 09:00,89). 4/3/1/2·mandatory 5/10·caution 0·중복 0. 이전 19:24 생성 데이터의 청림운동장 65점 사례와 혼동하지 말 것.
  - 검증: 주간 추천 34·기상 22·조석 20·Worker 33개(총 109) 및 두 validator 통과. 60/65점 caution 없음 허용·95점 caution 제외·물때/동풍 mandatory 정보 보존·같은 축 보충·대표 시각 일치·fallback 미확인 테스트 추가. 핵심 들판 5곳·정렬·pelagic gate 회귀 없음. runtime/Worker 187/187·불일치/중복 0·siteData 완전 동일·좌표 변경 0, inline JS 문법 및 diff check 통과. PC 1366x768/1920x1080·모바일 390x844/360x800에서 카드 10·현장주의 카드 0·가로 넘침 0, 패널 닫기/재열기·공지 내용 유지·추천 클릭과 솔개공원 지도 popup 정상, 신규 콘솔 오류 없음. 변경 파일은 index.html·test_weekly_recommendation.mjs·HANDOVER.md뿐이다.

- 가을 추천 균형 구현(2026-09-07, 시작 main `add9d8b`): `index.html`의 추천 선발만 9~10월 들판 4·갯벌 3·안전한 선상 최대 1·기타 2 soft target으로 변경했다. 부족분은 전체 점수순으로 보충하고 전역 site ID dedupe를 적용한다. `autumnBirdingAxes`는 env 실제 token과 핵심 들판 Set(7·8·10·15·20)을 사용한다. 핵심 5곳 모두 field이며 7·8·10·20은 mudflat도 유지, 15는 field만이다. 간척호/하구/염전 단독은 확대 해석하지 않는다. 들판 순서는 주간 최고 sample score → core → 가까운 날짜 → 기존 siteData 순서 → ID이며 점수·계절 bonus·mandatory 승격은 없다. 갯벌/기타 축 내부에서는 기존 공지·물때·동풍 우선순위와 이유를 보존한다. 선상은 pelagic=true(독도 제외)만 평가하며 seasons를 변경하지 않는다. `weather_rules.json`을 읽어 기존 pelagic_seabird의 풍속 9·돌풍 13·3시간 강수 1·시정 8 이상·파고 1.5 기준을 모두 만족하는 낮 sample만 기존 daily/weeklyBest 함수에 전달한다(결측/규칙 로드 실패는 선상 제외). 카드에 축·돌풍·시정·기존 v24FerryStatus와 출항 확인 문구를 추가했다. 추천 날짜와 물때/동풍 근거 날짜가 다르면 구분하고, 기상이 없는 물때 날짜에 다른 날짜 sample을 붙이지 않는다. 기존 rolling 7일·오늘 과거시간 제외·물때 threshold·9월 동풍 8.0 inclusive·원거리 섬 제외·봄 정책·structured notice 연계·today fallback 유지. 영어 NE/SE 표기도 기존 한국어 북동풍/남동풍과 동일하게 인식한다.
  - 실데이터 검증 기준: weather_week 생성 2026-09-07 19:24 KST, 확인 22:09 KST. 핵심 들판 5곳 모두 9/8 09:00·92점, field 순위 교동도 2·석모도 3·강화도 4·천수만 간월호 5·새만금 6. 1위 알뜨르비행장 100점이 core보다 앞선다. 최종 10곳: 알뜨르비행장(들판,9/11 18:00,100), 교동도/석모도/강화도(들판+갯벌,9/8 09:00,92), 유부도(갯벌,9/12 15:00,92,공지+물때), 매향리(갯벌,9/12 09:00,90,공지+물때), 청림운동장(갯벌,9/9 06:00,65,공지+동풍·현장주의), 대진항(선상,9/8 09:00,92), 이천항(기타,9/8 09:00,91,동풍), 태종대(기타,9/8 09:00,90,동풍). 실제 배정 슬롯 4/3/1/2, mandatory 5/10, 중복 0. 선상 8곳 평가·8곳 통과·낮 안전 sample 108개, 선정 대진항 파고 1.0m·평균풍속 1.4m/s·돌풍 2.7m/s·강수 0mm/3h·시정 26.7km.
  - 검증: 주간 추천 28개·기상 22개·조석 20개·Worker 33개 통과, 두 weather validator 통과, inline JS 3개 문법 정상, runtime/Worker 187·불일치 0·siteData 전체 동일·좌표 변경 0. PC 1366x768/1920x1080, 모바일 390x844/360x800에서 카드 10개·축 표시·가로 넘침 0 확인. 닫기/재열기·공지 연결·대진항/교동도 추천 클릭과 실제 지도 팝업 정상, 변경 전 main/변경 후 콘솔 오류 0. week/rules HTTP 실패 모의 화면에서도 today fallback 10개·선상 0·패널 정상. 자동 생성 JSON, updater, 규칙 값, 조석, notices, Worker, Actions는 수정하지 않았다.

- '이번주 어디 갈까' weather_week 연결(2026-09-07): 추천 판단을 `weather_today.json` 단일 저장값에서 `weather_week.json`의 실제 7일 3시간 sample로 확장했다. 기존 함수명·카드 구조·최대 10곳·mandatory 우선 병합은 그대로 두고 최소 변경으로 연결했다. 하루 대표 sample은 ① 해당 site/date의 실제 일출~일몰 사이 ② `scoreEligible == true` ③ 오늘은 `isPastAtGeneration == true` 및 현재 시각 이전 제외 ④ 남은 후보 중 최고 score ⑤ 동점이면 오전 우선, 오전 안에서는 더 이른 시각 순으로 고른다(`weeklyDailyBestSample`). 주간 대표 날짜는 7일 dailyBest 중 최고점, 동점이면 더 가까운 날짜다(`weeklyBestWeatherDay`). 일출·일몰은 NOAA sunrise equation을 `weeklySunTimes`로 최소 추가했고 좌표는 기존 site 좌표를 그대로 쓴다(서울 하지 05:11/19:57·동지 07:43/17:17 공표값 일치, 추분 낮 길이 12시간 09분으로 검증). 9월 포항·울산·부산 동풍 mandatory는 `weeklyEastWindFromWeek`가 주간 낮 sample에서 E/NE/SE·8.0m/s 이상을 찾아 판정하며(대상 지역/서식 필터는 기존 조건 유지, 10월 비활성), 근거 sample의 시각을 별도 줄로 표기해 추천 시각과 섞이지 않게 했다. 물때 mandatory(유부도 700·매향리 850·걸매리 850cm)는 기존 `weeklyBestMudflatTide`의 exact-date 판정을 그대로 쓰고 기상 점수와 별도 축으로 카드에 함께 표시한다. **새 점수 가산·감점 규칙은 추가하지 않았다.** 판단 창은 `weeklyInfo()`를 KST 월~일에서 weather_week과 같은 rolling 7일(오늘~오늘+6)로 맞춰 기상·조석이 같은 기간을 보게 했고, 과거 날짜를 추천하지 않는다(패널 상단 문구도 '이번 주:' → '추천 기간:'). `weather_week.json` 로드 실패 시에는 `weatherWeek=null`로 두고 기존 weather_today 경로로 자동 fallback한다(패널 정상 렌더 확인). 시정 정책(today=current broadcast, weekly=hourly)은 이번 작업에서 변경하지 않았다. 검증: 신규 `.github/scripts/test_weekly_recommendation.mjs` 14개(index.html 실제 함수 소스를 추출해 검증) 통과, 기존 기상 22·조석 20·Worker 33개 및 두 validator 통과, siteData 187개 완전 동일·좌표 변경 0·중복 ID 0, inline script 3개 문법 정상. Chromium 실측 UI 회귀(1366/1920/390/360): 버튼·패널 open/close/재열기 정상, 카드 10개 유지, 날짜+시간 표기 정상, 가로 스크롤 0·카드 overflow 0, 공지 패널 연동 정상, 콘솔/페이지 오류는 변경 전 origin/main과 동일(샌드박스가 Leaflet CDN을 차단해 발생하는 `L is not defined`뿐이며 지도 pan/zoom은 이 환경에서 검증 불가). notices 연동은 기존 structured linkage(siteIds/siteId/sites)만 사용하고 자연어 파싱은 하지 않는다.

- weather_week.json 주간 데이터셋 추가(2026-09-07): `update_weather.py` 한 번 실행으로 `weather_today.json`과 `weather_week.json`을 함께 생성한다. site별로 이미 받은 Windy atmospheric·gfsWave 시계열과 Open-Meteo 응답을 그대로 재사용하므로 Windy atmospheric/wave 요청 수와 Open-Meteo 요청 수는 기존과 동일하다(오프라인 전체 시뮬레이션 기준 atmospheric 187·wave 66·Open-Meteo weather 187·marine 0로 변경 전후 일치). 범위는 KST rolling 7일(오늘~오늘+6일), Windy GFS 실측 cadence인 3시간 sample을 그대로 보존하고 축약하지 않는다. sample에는 forecastTime·windSpeed·windDirectionDeg·windName·gust·precipitation3h·temperature·visibilityKm·cloudPct·waveM·score·grade·scoreEligible·missingScoreFields·isPastAtGeneration을 저장하며, 점수는 기존 `score_weather()`를 그대로 재사용해 동일 원시 입력이면 today와 값이 같다. wave는 실제 시계열 간격의 절반 이내·같은 KST 날짜일 때만 매칭해 다른 날짜/슬롯의 값을 복사하지 않고, visibility는 site당 Open-Meteo hourly 응답 1개를 7일에 재사용한다(sample 단위 호출 없음). Windy atmospheric 자체가 실패한 site는 Open-Meteo hourly(past_days=1, forecast_days=7)에서 3시간 anchor만 골라 실제 미래 예보를 구성하고 precipitation3h는 해당 시각 기준 최근 3시간 hourly 합으로 계산한다. weekly는 `previous_saved`를 신규 예보로 승격하지 않으며 실패 site는 `dataUnavailable`과 빈 `days`로 남는다. 주간 생성 실패는 try/except로 격리해 today 결과를 절대 깨뜨리지 않는다. 검증기 `.github/scripts/validate_weather_week.py`(ID 집합·중복·날짜 범위·day key 일치·오름차순·NaN·score 범위·wave 적격성)를 추가하고 workflow에 실행·commit 대상을 추가했으며 schedule(06/10/14/18 KST)은 변경하지 않았다. 회귀 검증: 동일 합성 상류 응답으로 변경 전후 `weather_today.json` 내용 완전 일치(사이트 삽입 순서만 기존부터 존재하던 thread 완료 순서 차이), 기상 21개·조석 20개·Worker 33개 테스트 통과. 파일 크기는 187곳×7일×3시간 기준 약 3.4MB(gzip 약 230KB), sample 10,098개. 알려진 차이: GFS 운영 경로에서 today는 기존대로 Open-Meteo `current` 시정 1개 값을 시계열 전체에 broadcast하고 weekly는 각 3시간 anchor의 hourly 시정을 쓰므로, 겹치는 시각의 점수가 시정 항목만큼 다를 수 있다(11항 요구사항에 따른 의도된 동작, today 로직은 무변경). `index.html`·추천 로직·좌표·조석·notices는 변경하지 않았고 weather_week.json은 아직 UI에 연결하지 않았다. 실제 Actions 전체 실행 [34076121681](https://github.com/wooil1964/birdmap/actions/runs/34076121681) 성공(build 6분 48초, timeout 없음, 자동 commit `662b1cf`): weather_today 187 성공·실패 0·재사용 0·stale 0·점수 적격 187, weather_week 187곳·7일(9/7~9/13)·sample 10,098개·전 구간 3시간 간격·점수 적격 100%, atmospheric 전부 Windy·visibility 전부 Open-Meteo component fallback·wave는 대상 66곳 모두 Windy(sample 3,564개), 두 validator 통과, API 오류·경고·키 노출 0. 파일 크기 3,386,577바이트(gzip 약 208KB). today와 weekly의 동일 시각 sample 점수는 187곳 중 186곳 일치하며, 차이가 난 1곳(ID 140 학저수지 90 vs 92)은 위 시정 소스 차이(today=current broadcast, weekly=hourly anchor) 때문이다. 직전 실행 [34075887795](https://github.com/wooil1964/birdmap/actions/runs/34075887795)은 정상 진행 중이었으나 작업자가 경과 시간을 오판해 취소한 것이며 코드 문제가 아니다.

- Windy 주간 범위 사전 조사(2026-09-07): Actions [34074742903](https://github.com/wooil1964/birdmap/actions/runs/34074742903)의 `inspect-windy` 성공, 기존 `update-weather` job은 skipped. 대표 runtime ID 1 어청도에 운영 GFS fallback과 동일 parameter(visibility 제외), 기존 request_forecast 재사용·재시도 0으로 atmospheric 1회만 호출했다(wave/Open-Meteo 0회, API 오류 없음). ts 80개, 첫 timestamp 1788728400000(2026-09-07 06:00 KST), 마지막 1789581600000(2026-09-17 03:00 KST), 전 구간 3시간 간격·237시간 범위. KST 달력 날짜 11개(양 끝 날짜는 부분일), 오늘부터 7일 범위인 9/7~9/13 모두 실자료 존재. 이 값은 대표 1곳의 해당 실행 결과이며 전체 187곳·wave 범위를 검증한 것은 아니다. 키/요청 payload/raw 응답은 출력·저장하지 않았다. 진단 commit `4f49bbd` 후 임시 스크립트/job을 제거하고 workflow를 원복했다. `weather_week.json` 구현 및 UI 연결은 아직 하지 않았다.

- '이번주 어디 갈까' 탐조 이슈/필터 정리(2026-09-07): 활성 `notices.json`에는 기존 문구 유지 후 `siteIds`만 추가하고, weekly 패널에서는 공지 전문 중복 렌더링을 제거해 연결 탐조지를 추천 10곳 안에 우선 병합하도록 조정했다. 검색 필터에서는 해외탐조·들뫼추천·대중교통 좋은 곳·맹금·갈매기 선택지를 제거했다.
- '이번주 어디 갈까' 전환(2026-09-07): UI 표시를 주간 추천으로 바꾸고, KST 월~일 범위에서 월간 조석은 주간 전체를 평가하되 기상은 현재 저장소의 실제 단일 저장 예보 날짜만 사용하도록 `index.html`을 확장했다. 추천은 필수조건과 일반 기상 추천 합산 최대 10곳이며, 오늘 기상값을 미래 날짜에 복제하지 않는다.
- '오늘 어디 갈까' 계절 추천 보정(2026-09-07): 9~10월 물때 필수추천은 사용자 확정 대상인 유부도(700cm)·매향리(850cm)·걸매리(850cm)만 siteId 기준으로 적용하고, 가을 원거리 섬 제외는 확정 대표명(백령도·외연도·어청도)만 추천 후보에서 제외하도록 `index.html`을 보정했다. 동남해안 9월 강한 동풍 mandatory 규칙은 유지했다.
- '오늘 어디 갈까' 필수 포함 규칙(2026-09-06): 기존 `v251EffectiveScore` 점수는 올리지 않고, 9~10월 갯벌 조석 조건과 9월 동남해안 동풍 조건을 `mandatoryReason`으로 추천 목록에 추가 표시하도록 `index.html`만 최소 확장했다.
- '오늘 어디 갈까' 패널 + 탐조 이슈 연동(2026-09-06): 상단에 `🧭 오늘 어디 갈까` 버튼과 `#todayPanel` 추가. ① Top 5는 기존 `v251EffectiveScore`(저장 기상)만으로 정렬하며 새 점수·가산점 없음, 카드에 기존 별점/점수·조석 고저조(`v24TideDayEvents` 재사용, stale 시 '※ 이전 자료')·기상 자료 신선도(`storedWeatherLabel`)를 표시하고 클릭 시 `moveToSite` 재사용. ② `📢 지금 볼 만한 탐조 이슈` 섹션은 기존 noticePanel과 동일한 `activeNotice` 필터·동일 데이터(`loadedNotices` 공유)를 사용해 활성 공지의 제목·요약을 그대로 표시(자연어 재해석·자동 점수화·탐조지 추론 금지). 현재 notices.json에는 siteId류 구조 필드가 없어 연계 배지·지도 이동은 비활성이며, 향후 공지에 `siteIds`/`siteId`/`sites`(id 또는 정확한 이름)가 추가되면 `noticeLinkedSites`가 자동으로 '📢 현재 탐조 이슈 연계' 태그와 '지도에서 보기' 버튼을 붙인다. notices.json·추천 점수·조석/기상 로직은 무변경.
- 모바일 popup 겹침·가로 스크롤 안정화(2026-09-06): 원인은 ① Leaflet popup autoPan 기본 패딩(5px)이 모바일 상단 고정 UI(`#topUiWrap`, z-index 10001)를 고려하지 않음, ② `moveToSite`의 `setView` 애니메이션이 popup autoPan 결과를 되돌림, ③ 모바일 패널 고정 `top:178px`이 버튼 줄바꿈 시 실제 상단 UI 높이(약 198px)보다 작아 겹침. 수정: 상단 UI 실제 높이를 CSS 변수(`--birdmapTopUiH`, `--birdmapPopupMaxH`)로 계산해 패널 top·popup 최대 높이에 반영, popupopen 시 `autoPanPaddingTopLeft/BottomRight` 동적 설정, 이동/애니메이션 안정화 후 `popup.update()` 재보정, 열린 검색 패널 아래 popup 최소 공간(180px)이 있으면 패널 유지·없으면 기존 패턴대로 자동 닫기. `#birdmapPanel`·입력창·`#noticePanel`에 box-sizing 보정, 모바일 한정 `html,body{overflow-x:hidden}` 안전장치. 390x844/360x800/412x915 및 1366/1920 데스크톱 회귀 검증(187개·중복 ID 0·조석/기상/버튼 정상). 조석·기상·좌표·데이터 변경 없음.
- 기상 최종 원격 검증: 코드 `842a8d1` 및 `959ee96` main push, Actions `34022709060`/`34023132421` 성공. 최종 자동 JSON `a1233ee`: 2026-09-06 17:54 생성/18:00 갱신, 187 성공, 실패·stale·재사용·없음 0, 점수 적격 187. Windy GFS + Open-Meteo 시정 보완. 회귀 총 61개 통과. KMA 외부 timeout과 모바일 팝업 겹침은 미해결이며 신규 추천 기능은 구현하지 않았다.

- 기상 안정화(2026-09-06, Worker 배포 완료): runtime/Worker 코드 187개 전수 일치, ID 188 추가 및 ID 14 이름 일치. 저장 기상 concat 파서 오류 수정, 원 시각·출처·stale·점수 적격 상태 분리, 일부 KMA 요청 실패 시 유효 응답 보존. 실제 Open-Meteo 저장 기상 187개 성공, 이전 자료는 오늘 점수에서 제외. 상세 `.github/scripts/weather_system_review.md` 참조. Worker version 0c8fbbb2-728d-4dfd-8d3b-2ed0fb5d8e05 배포 완료. 대표 실제 호출은 7곳 KMA_TIMEOUT, 독도 해양 우선 분기였다. 코드 배포와 외부 API 정상화를 구분할 것.

- 조석 안정화(2026-09-06): 공식 코드 99개 탐조지/38개 관측소 검증, 필수 8곳 및 전체 today/tomorrow 인증 API 실호출 확인. 명시적 매핑, fallback 출처·원 생성/현재 갱신 시각, 실제 HTTP·live·timeout 진단, 월간 캐시, 회귀 검사와 Actions 진단을 보강했다. 상세 증거와 반복 비교 결과는 `.github/scripts/tide_system_review.md`, `tide_api_verification.json`, `tide_api_benchmark.json` 참조. 외해 기준의 내부 갯벌 대표성 등 31개 검토 표시는 보존했다.
- 탐조 의사결정 2단계는 `.github/scripts/birding_decision_design.md`에 설계만 작성. 기존 점수 중복, 추천 시간 승인 규칙, 관측/추정 분리, 모바일 및 단일 원본 후보를 정리했으며 새 기능은 구현하지 않았다.
- 현재 런타임/Worker 코드는 187개(중복 ID 0), ID 188 이천항 포함. 공통 좌표와 조석 매핑 좌표는 일치한다. production Worker에도 188 반영 완료. 외부 KMA timeout은 남아 있다. 아래 과거 162개/반영 보류 기록을 현재 상태로 오인하지 말 것.
- 기상 표시 개선 및 Worker 배포 완료
- 한 달 조석 데이터·모달 기능 완료
- P1 품질 개선 완료
- 모바일 상단 UI 정리 완료
- 186개 엑셀 정제본 생성, 신규 30개는 지도 반영 보류
- 강수 우선 탐조 해석 수정(PR #2) 및 강수 시 별점·점수 보정(PR #3) 완료
- 수도권 하천계 6곳(ID 157·158·159·160·162·163) 1차 지도 반영 — 권역 수 156→162, ID 161은 보류 유지
- eBird 링크 버튼 비노출 실험(2026-07-08): 비멤버 유입 감소 원인 확인을 위해 팝업의 eBird 버튼만 임시로 숨김.
  데이터(`ebirdHotspotUrl`, Hotspot ID, 정적 팝업 HTML)는 모두 보존.
  복원 방법: `index.html`에서 ① `var SHOW_EBIRD_BUTTON=false;`를 `true`로 변경,
  ② CSS의 `a.ebird,.btn.ebird{display:none !important}` 한 줄(및 그 위 주석) 삭제 — 두 가지 모두 되돌려야 함.

## 진행 중 / 보류 사항

- 신규 탐조지 후보 중 24개(ID 161, 164~186): 엑셀 정제본에는 포함되었으나 지도 반영은 보류 상태.
  반영 시 `AI_WORK_RULES.md` 5항(좌표 검증)과 7항(기상 이중 관리)을 반드시 준수할 것.
- 반영된 6곳의 eBird Hotspot ID는 미확정으로 공백 유지 중(후보 ID는 보완표 참조). 공식 확인 후 입력할 것.
- 조석 매핑 검증기는 이제 HTML의 고정 개수/정규식 대신 조석 대상 ID 집합 및 공식 코드를 검증한다. mappingVersion 2가 실행 기준이며 유부도 DT_0018, 매향리 SO_1268은 보호한다. Excel·HTML 전체를 덮어써 매핑을 되돌리지 말 것.

## 다음 작업자를 위한 주의사항

1. 작업 시작 전 `git status`와 최신 main 상태를 확인한다.
2. `AI_WORK_RULES.md` 전문을 읽고 준수한다.
3. `index.html`의 `siteData`와 `weather-proxy/src/sites.js`는 수동 이중 관리 상태이므로
   탐조지·좌표 변경 시 양쪽을 모두 확인한다.
4. 자동 생성 파일(`weather_today.json`, `tide_today.json`, `notices.json` 등)은
   직접 수정해도 다음 자동 실행에서 사라질 수 있다.
5. 작업 완료 후 `AI_WORK_RULES.md` 12항 형식으로 보고하고, 이 문서의
   "최근 완료 작업"을 갱신한다.
