# PR #13 S2-A 독립 검증 결과

대상 head: 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e.
작업 시작 main: 38b45299c832b8ab8ad549762c02979fa8ddfb28.
읽기 전용 review worktree: C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap.

판정: **S2 승인 전 수정 필요**. null→0·score 타입/범위·주간 필수자료·unknown 추천·기상 없는 공지 차단은 구현됐지만, today fallback 실제 필수자료 검사와 점수 표시의 적격 provenance가 미완성이다. 합성 입력의 코드상 결과이며 실제 운영 결측자료 유입이나 사고를 주장하지 않는다.

## 검증 방법

실제 PR Git source에서 함수 본문을 추출했다. 실제 product guard를 수정·교체·wrap하지 않았다. 날짜를 고정하는 Date 대역과 메모리 자료만 주입했다. 기존 P1-S 가상 guard 모형과 다른 검증이다. API·DB·Worker·배포·제품 파일에는 쓰지 않았다.

~~~powershell
node <temp>/pr13_s2_actual_matrix.mjs <review-worktree> <temp-output> <analysis-worktree>
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONIOENCODING='utf-8'
& <python-runtime>/python.exe <temp>/pr13_s2_python_validator_matrix.py <review-worktree> <temp-output>
~~~

산출물:
- pr13_s2_actual_matrix.mjs / pr13_s2_actual_matrix.json
- pr13_s2_python_validator_matrix.py / p1s2_python_validator_matrix.json
- PR13_S2_REVIEW.md

기본 matrix 26값/metadata × 7경로 = 182행. 일반·갯벌·섬·선상 weekly 및 일반·갯벌·섬 today를 실제 candidate→final까지 호출했다. 공지·최근 4종 가점16을 같이 넣었다. 합성 시계 2026-10-10 08:00 KST, 날짜10/10. 정상 생성시각07:00·예보12:00 조건이다.

결과: 175행 계약 일치 / 7행 불일치. 특별 분기21개 중14개 기대 일치 / 7개 추가 계약 차이. Popup12개 중8개 기대 불일치. 같은 원인이 여러 경로에 반복된 수치이며 별개 운영 결함·사고 수가 아니다. 전체 기존 회귀 스위트는 root 검증과 합쳐 보고한다.

## 수정 필요 1 — today 실제 필수자료 검사가 빠짐 [P1]

변경된 index.html:3855~3857 weeklyTodayRecommendable(raw)는 typed score·명시 true·빈 missingScoreFields만 검사한다. 주석으로 wind/rain/wave가 문자열이므로 보지 않는다고 명시했지만, P1-S2 계약은 formatted today adapter로 실제 필수자료 결측도 차단하도록 설계됐다.

검증 입력:
~~~javascript
{
  date:'2026-10-10',
  generatedAt:'2026-10-10 07:00 KST',
  forecastTime:'2026-10-10 12:00 KST',
  score:92, scoreEligible:true, missingScoreFields:[],
  stale:false, dataUnavailable:false,
  wind:'북풍 3m/s', rain:null, wave:'0.3m'
}
~~~

weeklyWeatherEntryForSite(3991/4000)와 weeklyTideWeather(3867/3874)가 이 검사를 신뢰한다. 일반·갯벌(걸매리14)·섬(굴업도3)에 각각 rain:null 또는 wind:null을 넣으면 candidate=true, safe=true, score92/rank108, final top 포함이다. 걸매리 today fallback은 12:00 만조900cm도 선택한다. required wave:null은 굴업도에서도 그대로 추천됐다.

세 필드 wind/rain/wave가 전부 null이면 일반·섬 candidate와final은 여전히 포함되며 safe=null이다. numeric score의 존재가 실제 필수 기상정보를 대신했다.

보완 지시:
1. weeklyTodayRecommendable에 site context를 전달한다. generator의 허용 formatted wind/rain/wave 표현을 검사하는 source-specific adapter를 적용한다.
2. 실제 wind/rain 결측·형식/수치 불명은 metadata가 true/[]여도 부적격이다. 파고는 현행 showWave/island/pelagic에 한해 필수로 검사한다. 비대상 내륙 wave:null은 유지.
3. 같은 today adapter를 weeklyTideWeather와 weeklyWeatherEntryForSite에서 사용한다. popup 적격 판단도 같은 source validity를 사용한다.
4. Python validate_weather.py:40~47도 eligible true의 실제 formatted 필수자료를 검사한다. 현재 validator는 같은 결측문서를 그대로 수용한다.
5. 실제 제품 회귀에 일반·만조·섬 fallback 각각 wind/rain 결측, required wave 결측, 세필드 전체결측, 0/100 정상형, 공지·가점 포함/제외를 추가한다.
6. 참고 날씨·조석 원자료를 삭제하지 않는다. previous_saved false의 이전 숫자 보존과 신규 최소점수 정책은 변경하지 않는다.

현재 수정된 주간 테스트 중 겨울/봄/여름 today fallback은 rain 등이 없는 fixture에 true/[]만 추가해 추천을 유지하도록 기대한다. 그것을 필수자료 계약 준수 증거로 사용하지 말고 실제 필수정보를 제공하는 정상 fixture와 결측 거부 fixture로 나눠야 한다.

## 수정 필요 2 — 팝업은 unknown 적격·필수 결측을 현재 적합도로 표시 [P1/P2]

index.html:2079 storedWeatherState는 여전히 day.scoreEligible!==false를 사용하며 actual required fields / missingScoreFields를 검사하지 않는다. weatherScoreAllowed(2083~2085)는 typed numeric range만 새로 검사하고 파생 _weatherState의 적격을 그대로 믿는다.

검증한 실제 weatherTodayForSite→v251ScoreDisplayText 경로:
- scoreEligible 누락/null
- missingScoreFields 누락/null/비어있지 않은 목록
- wind:null / rain:null / required wave:null

정상 날짜·생성시각의 score92로 모두 “★★★★★ 92점”을 출력했다(8개). 추천 쪽에서는 unknown eligibility를 거부해도 팝업에는 유효점수처럼 보이는 불일치가 남는다.

보완 지시:
1. raw daily의 own scoreEligible===true·빈 list·actual required-data validity를 storedWeatherState에서 보존한다. unknown을 true로 올리지 않는다.
2. converted weekly object와 live popup merge는 raw daily 필드 모양이 다르므로 validated provenance를 adapter에서 전달한다. converted weather object에 raw 필드가 없다는 이유로 정상 weekly-derived 표시를 모두 차단하지 않는다.
3. weatherScoreAllowed의 상태 값은 truthy가 아닌 검증된 boolean true를 사용한다. invalid score는 “미확인”, raw wind/rain/wave/조석 참고 표시는 유지.
4. current stored / todayFromWeek / previous_saved / live merge에서 정상0·100·92.5와 unknown/list/actual required 결측 표시를 모두 회귀한다. mobile/PC 실제 layout·live 네트워크 검증은 root 범위와 별개다.

## 추가 방어/정합성 3 — optional wave와 own property [P2]

weeklySampleRecommendable:3847~3852는 wave가 비필수일 때 값 자체를 검사하지 않는다. inland waveM:'0.3' / -1 / NaN은 actual 후보·final에 포함된다. 실제 Python weekly validator는 각각 type / nonnegative / JSON NaN 검증으로 거부했다. null을 허용하는 것과 non-null invalid를 허용하는 것은 다르다.

또한 sample/rawToday의 own flag를 삭제하고 prototype에 scoreEligible:true를 두면 주간/today 추천이 통과한다. 이 재현은 Object.create/프로토타입을 사용한 메모리 계약 시험이며, JSON만으로 현재 운영 공격이 성립한다고 주장하지 않는다.

보완: optional wave는 null/undefined 허용 범위와 non-null typed finite nonnegative 조건을 명시하고 Python과 맞춘다. own eligibility true 조건도 source object에 적용한다. raw score의 own 여부/타입 검사와 구분한다.

## 선발 경로 직접 방어 참고

4계절 balanced 함수에 score:null인 entry를 직접 넣으면 모두 선택한다. 현재 실제 todayRecommendedSites는 candidate와 numeric guard를 거치므로 이를 새 운영 우회로로 판정하지 않았다. selector가 정상 entry만 받는 내부 계약을 명시하거나 공통 add/input 방어를 추가할 수 있다. 위 today 결측은 정상 candidate 경로 자체에서 통과하므로 이 참고사항보다 우선한다.

## 해결 확인·안전 유지

- 0/100/92.5 허용, null/undefined/NaN/±Inf/empty/numeric-string/bool/음수/>100 차단.
- 주간 required wind/precip/direction 및 required wave 실제 결측은 차단.
- scoreEligible false/누락/null/1/string, missing reason의 malformed/nonempty는 후보에서 차단.
- 공지-only weather 없음·invalid raw-score+report/notice는 후보/최종에서 차단.
- invalid 최고 만조 대신 같은 날 두 번째 870cm / 다른 날짜880cm의 정상80점 만조 선택.
- 90/91/120분, 일반 강수0.999/1·파고2, 선상 6/0.7 경계와 초과·양수강수, invalid score fill 차단 유지.
- score0도 안전 조건을 별도로 통과해야 한다.
- raw92+report16=rank108 유지, max16/quota4312 변경 없음.
- actual PR functions로 기존 35141c0/2026-10-08 22:40 고정 입력의 top 전체 객체와176후보를 원래 P1-C 런타임과 exact compare하여 동일했다. 보고 집계11곳을 그대로 준 동일입력 S2 비교이며, Worker에서 S1-R을 적용한 최근 집계 자체의 변화까지 재현한 증거는 아니다.
- 최종10 ID108,112,15,194,126,14,107,48,195,3.

## Python 독립 matrix

고정 시계10/08 22:40 KST, actual validator에 31개 × today/week =62호출. today11문서, weekly4문서 수용. 문서 수용수는 적격 추천 통과율과 다르다.

최초28개만 비교하면 today9/week4. supplemental optional wave 3개는 weekly에서 전부 거부됐다. today에 supplemental waveM 문자열/음수를 넣는 것은 원래 없는 수치 필드 mutation이라 그 두 today 수용은 별개 결함으로 계산하지 않는다. NaN literal은 전역 JSON parser가 거부한다.

새 bool/list 강화는 기존 1/'true'/0.5·missing reason null/누락을 correctly 차단했다. score integer/float/range 검증도 유지됐다. today required wind/rain/required wave 실제 결측 수용은 남는다. scoreEligible false의 이전숫자 참고자료와 정상 ineligible null은 의도된 호환성으로 유지됐다.

## 최종 제한과 제안

가장 핵심 Number(null) 결함은 해결됐다. 그러나 “모든 fallback·표시에서도 필수자료/명시적 적격 계약 일치”는 달성하지 못했다. 최소한 today adapter와 popup provenance를 보완한 새 head에서 동일 fixture를 다시 실행하고 회귀 테스트 기대값을 계약에 맞춰 검증한 뒤 승인 판단을 다시 하는 것이 타당하다.

운영 문제 발생률·실제 기상 결측 유입을 이번 합성 실험으로 추정하지 않는다. 제품 파일·main·Worker·D1·제보·자동 JSON에 변경하지 않았다.
