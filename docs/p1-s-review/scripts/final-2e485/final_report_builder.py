from pathlib import Path
import json
import sys
base=Path(sys.argv[1]); docs=base/'docs/p1-s-review'; out=docs/'results/final-2e485'
read=lambda f:json.loads((out/f).read_text(encoding='utf-8-sig'))
head='2e485079a34fa5aeeef09e82f3b996bf2696d978'; before='352315a57d038687807dbe0044c136a22fb0c9c5'; main='4b164ffe74efa5cadad9e686bd628a8915527e77'
r=read('independent_replay.json'); final=next(v for v in r['normal'] if v['rev']==head)
assert len(r['differences'])==6 and all(d['full190SignatureEqual'] and not d['topChanged'] for d in r['differences'])
assert final['reportsOn']['siteCount']==190 and final['reportsOn']['candidateCount']==176
add=read('root-additional/final_c1_c2_additional.json'); assert add['passed']==80 and add['total']==80 and add['numericPassed']==92
src=read('c_temporal_source_actual.json'); assert src['timePass']==23
policy=read('c_policy_before_after.json'); assert policy['conditions']==38 and all(x['fullTopMatchesApprovedStrict'] for x in policy['comparison'])
tests=read('test_summary.json'); assert tests['summary']=={'pass':603,'fail':0,'skip':1}
rows='\n'.join('|'+v['name']+'|'+str(v['pass'])+'|'+str(v['fail'])+'|'+str(v['skip'])+'|' for v in tests['rows'])
axes={'field':'들판','mudflat':'갯벌','pelagic':'선상','island':'섬'}
def table(condition):
    records=final[condition]['top']; assert len(records)==10
    lines=['|순위|ID·탐조지|원점수=표시|가점|내부 rank|추천일·시각|추천 유형|','|---:|---|---:|---:|---:|---|---|']
    for e in records:lines.append(f"|{e['position']}|{e['id']} {e['name']}|{e['raw']}|{e['bonus']}|{e['rank']}|{e['date']} {e['time']}|{axes.get(e['axis'],e['axis'])}|")
    return '\n'.join(lines)
report='''# PR #13 배포 승인 전 최종 독립 검증

## 1. 종합 판정 — 수정 필요

정확 대상 `2e485079a34fa5aeeef09e82f3b996bf2696d978`의 이전 C1/C2 문자열 반례와 C3의 기존 발행 역행 반례는 해결됐다. 독립 자동 회귀 **603 pass / 0 fail / 1 skip**, 정상 고정 **190곳·176후보**와 제보 ON/OFF 전수 결과도 유지됐다. 그러나 **미래 발행시각의 비교 기준 고착, 최신 root에 섞인 과거 적격 item의 안전 역전, 시각 원본 자료형 우회**가 실제 제품 호출·Chrome에서 확인돼 배포 승인으로 진행할 수 없다.

사용자가 승인한 정책은 “검증된 현재 자료만 추천” C이며 B 지연 예외는 승인되지 않았다. 시험 기대를 안전한 성공 기준으로 다시 정의했고, 실패 assertion을 삭제하지 않았다. 아래 반례는 합성 계약 자료다. 운영 발생 빈도, 실제 당시 기상 또는 민감정보 유출 사고가 관측됐다고 주장하지 않는다. 과거부터 존재한 결함과 새 회복 회귀를 구분한다.

## 2. 코드·자료·독립 실행 범위

- head: `2e485079a34fa5aeeef09e82f3b996bf2696d978`; before: `352315a57d038687807dbe0044c136a22fb0c9c5`.
- 최종 원격 main: `4b164ffe74efa5cadad9e686bd628a8915527e77`. 검증 도중 main `b0975cad...`에서 자동 JSON 4개만 갱신됐다. 제품 소스 변경은 없었다.
- 최신 임시 merge-tree: `75df87adfe7e82d3e12290d73a4e670b2112c59c`, 충돌0. 이전 main 임시 tree `a7ae4970e4a5880145f6a028aed49ebb70ab5f1f` 결과도 보존했다. 실제 main 병합은 아니다.
- 독립 브랜치: `review/p1-s-pr13`. AI_WORK_RULES·C_POLICY_RECHECK·FINDINGS·NEXT_SESSION·새 diff·구현 보고6083632426·실제 workflow를 먼저 읽었다. P1-A~D 분석은 반복하지 않았다.
- 정상 고정 시계 `2026-10-08 22:40 KST`, manifest16파일과 공개 승인 제보11곳 snapshot의 hash 검증. 후보·상위10·전체190 signature·좌표 벡터 hash를 비교했다. 실제 보호 좌표는 출력하지 않았다.
- 시간·loader·Chrome 반례는 별도 `2026-10-10 11:00 KST`; 새 main의 실제 validator는 `10/10 05:38 KST`, Chrome는 `10/10 05:43 KST`였다. 과거 고정 추천과 새 운영 배치의 기상 변화를 혼용하지 않았다.
- 실제 함수 추출, 실제 Chrome/Leaflet 카드·팝업, 실제 Python 생성기·validator를 호출했다. 제품 guard를 통과시키는 패치는 없다. 외부 API는 탐색 전에 합성 응답으로 격리했고 일반 E2E POST/DELETE는 메모리 SQL/API만 사용했다.
- 검증 브랜치의 기존 제품 파일은 역사적 버전이므로 제품 시험에 사용하지 않았다. 정확한 Git archive와 blob을 사용했고, archive의 CRLF는 LF 정규화만 한 뒤 원본과 대조했다.

## 3. C1·C2·기존 C3 해결 범위와 P0

C1: 주간 generatedAt 누락/null/빈값/비정상/미래 발행 및 site.dataUnavailable을 일반·갯벌·섬·선상 실제 후보/최종 경로에서 차단했다. Python 주간 validator도 위 canonical 반례를 거부한다. 정상 미래 **예보**와 미래 **발행**을 구분해 정상 예보를 유지한다. unverified 주간 문서나 unavailable 장소는 정상 today가 있을 때 일반·갯벌·섬 fallback을 사용할 수 있다. 선상 today-only 추천은 기존 pelagic 조건대로 제외되며 기상 팝업 참고정보는 유지한다. 적격 false인 주간 표본을 정상 출처로 임의 승격하지 않는다.

C2: 시각이 12:60·24:00·UTC·timezone 누락·잘못된 날짜·접미 문자열인 최고99점은 선택 전에 제외되고 정상13:00/80점 대안은 bonus16/rank96으로 유지된다. **구현자가 별도 검사하지 못한 실제 선상 ID48도 독립 확인**했다. 추가 80조건/80, JS 주간 sample 자료형92/92 및 Python 교차92/92. 실제 Python 주간 기존10반례도10/10 기대 충족이다. 정상0·92·92.5·100과 rank108 등 100을 넘는 내부 순위점수는 유지했다. 기존 source core74/74·절대 helper23/23, 별도 startDate 누락 schema4 진단은 그대로 분리했다.

C3: 이전 “10:40 위험→후속10:30 정상”은0→0을 유지하고10:50 정상은 복구한다. 최신 정상 뒤 오래된 위험, 동일 발행시각 충돌, 누락/무효 발행, 자정, 요청 순서 역전, today/week 독립 적용, 현행 적격기간 만료 후 제외도 기존8 Node/40 Chrome 조건에서 안전 기대대로 통과했다. 단순히 옛 결함 재현 assertion이 더 이상 예외를 던지지 않는 것으로 승인하지 않았다. 다음 절의 확장 반례는 이 성공 범위와 별개다.

P0/S2: 만조90분 허용·91분 제외·6/24시간 표본의90분 절대상한·1440분 제외·정상 차선·다른 안전한 만조, 강수1mm와 반올림/결측, 선상 풍속6m/s·파고0.7m·강수0의 원자료 조건은 유지됐다. 공지/mandatory/가점/정원은 검증된 부적격 자료를 되살리지 않았다. 문제는 아래에서 잘못 적격으로 해석된 출처에 있다.

## 4. 배포 전 필수 보완 — 실제 재현·코드 위치

### F1. 미래 발행시각이 정상 복구를 막음 — 새 C3 회복 회귀

평가10/10 11:00, 정상 forecast12:00/score92/bonus16를 사용한다. root/item 발행12:30을 최초 수신하면 C 정책은 추천0으로 제외하지만 로더가12:30을 비교 기준(have)으로 저장한다. 후속 정상10:50은 next<=have로 거부되고 추천0이 유지된다. 정상10:40으로 카드1인 뒤 미래12:30을 받는 경우도 정상 자료가 사라져0이 되고 후속10:50이 복구하지 못한다. today와 week 모두 actual loader→후보→최종→카드에서 재현했다.

- 코드: index.html **4540 birdmapDataTime**, **4541 loadBirdmapData**, **4564 loadWeatherToday / 4580 loadWeatherWeek**. 시각 형식만 확인하고 미래 발행 자격을 확인하지 않은 채 have/next 비교에 사용한다. **3724 weeklyDocVerified**의 발행 적격과 비교 기준이 다르다.
- before352의 today 미래 first→10:50은 카드0→1, head는0→0. 정상→미래→정상도 before1→0→1, head1→0→0. 따라서 정상 복구 불능은 새 C3 회귀다. week의 before 미래자료 잘못 추천은 C1이 개선한 별도 사실이며 전체 week 차이를 새 안전 퇴행으로 부르지 않는다.
- 수정 요청: **검증되지 않은 미래/무효 발행을 검증된 비교 기준으로 삼지 않는다.** 첫 수신과 이미 정상 자료가 있는 상황을 함께 정의해 known-invalid 자료가 정상 자료를 지우거나 회복을 고착시키지 않게 한다. 기존 older/same 발행 차단과 seq 차단은 유지한다. 보존한 정상 자료도 기간이 지나면 C에 따라 제외하며 B 유예를 추가하지 않는다.
- 필수 시험: today/week 미래-first와 정상→미래→정상,0/1·적합도 미확인·최종 후보·DOM·회복까지. 정상10:50을 적용하는 성공 assertion이 있어야 한다.

### F2. 새 root의 과거 적격 item이 최신 안전 제외를 뒤집음 — 기존 미완결 계약

동일 만조12:00/풍속3/파고0.3/raw92/제보16/공지 입력에서 root/item10:40·강수1mm를 적용하면 추천0이다. 후속 root10:50에 **item.generatedAt10:30·강수0·scoreEligible=true·stale=false**를 실으면 새 root라 적용되어 추천1/raw92/rank108로 돌아온다. root/item10:55 정상 control은 다시 정상 적용된다. 5폭 actual Chrome에서도0→1이다.

- 코드: **4541 loadBirdmapData**는 root만 비교하고, **2066 storedWeatherState**는 item10:30이 현재 창 안이라는 이유로 승인한다. 최신 이미 확인한 item보다 오래됐다는 사실을 검사하지 않는다.
- before352와 head 모두0→1이므로 새 회귀가 아니다. C3 root 순서 보완 뒤에도 남은 **장소별 안전 근거의 역행**이다.
- 정상 Python builder는 root/item에 같은 now를 사용하고 previous 재사용은 stale=true/scoreEligible=false로 만든다. 이 정상 생성 경로가 불일치 eligible item을 만든다는 증거는 없다. 그러나 실제 today validator는190ID 합성 root1050/item1030을 수락한다. 따라서 입력 계약이 frontend/validator 모두에서 보장된다고 승인할 수 없다.
- 수정 요청: 현재 적격 item의 **배치 출처 일관성 또는 item별 발행 순서**를 명시하고 이전 안전 근거보다 과거인 item이 위험 제외를 복구하지 못하게 한다. 새 root라는 이유만으로 older eligible item을 승격하지 않는다. 정상 component provider 시각과 저장 배치의 생성시각은 구분하고, 기존 stale/false 재사용과 정상1055 control을 유지한다. 새 age cutoff나 B 예외를 도입할 필요는 없다.
- 필수 시험: root/item 충돌 양방향, 일부 item만 오래된 혼합 배치, 동일시각 충돌, 위험0→0, 정상 새로운item 복구, validator parity. raw92와 rank108 자체는 금지하지 않는다.

### F3. 시각 배열의 암묵 문자열 승격·객체 TypeError — 기존 parser 자료형 누락

JSON으로 왕복 가능한 `generatedAt:["2026-10-10 10:30 KST"]` 또는 최고99점 `forecastTime:["2026-10-10 12:00 KST"]`를 넣는다. 후자는 정상13:00/80점 차선이 함께 있다. **3902 weeklyForecastTimestamp**의 `String(text||'').trim()`이 배열을 정상 문자열로 바꾼다. 일반·갯벌·섬·선상×2변형8경로 모두 후보·최종 raw99/bonus16/rank115, 적격 출처true로 통과한다. 실제 Chrome375 두조건도 카드·Leaflet 팝업★★★★★99점이며 차선80을 가린다.

같은 필드에 JSON 객체 `{"toString":"not-callable"}`를 넣으면 helper뿐 아니라 실제 후보·최종 함수8경로에서 TypeError를 낸다. 객체의 실제 전체 Chrome 화면 잔류는 검사하지 않았으므로 화면 사고로 확대하지 않는다. 실제 Python 주간 validator는 배열/객체 발행·예보4건을 모두 거부한다.

- 수정 요청: **원본 typeof text==='string' 확인을 parser의 암묵 변환보다 먼저 적용**하고 배열/객체/비문자열은 null로 안전하게 거부한다. 무효 최고99는 정상80 대안 선택 전에 제외하고 공지/제보/mandatory/정원을 거쳐도 복귀하지 않아야 한다. 필수 필드·참고정보·정상0/100/92.5 및 rank108 계약을 유지한다.
- 필수 시험: JSON 배열/객체/null/number/boolean 등 발행/예보 원본 타입×모든 경로, actual 최종/카드/팝업/예외 없음, Python 교차. ISO+09/padding 없는 KST의 기존 허용집합 차이는 canonical builder가 정상 KST를 출력한다는 별도 P2 정합 과제이며 이번 자료형 우회와 혼동하지 않는다.
- 원래 parser에도 있던 결함이며 정상 builder는 문자열을 낸다. 운영 malformed 자료 유입은 관측하지 않았다. 무효자료 제외 C 계약을 명시적으로 강화하는 PR의 배포 전 필수 보완으로 판단한다.

C3 성공 기대28조건은 **Node23pass/5fail/예외0**, 실제 Chrome5폭 **115pass/25fail/예외0**다. 기존8/40은 전부 통과, 추가 실패5종은 F1 네조건과 F2 한조건이 각5폭에서 반복된 것이다. root도 Node28과 Chrome375의28을 직접 재실행해23/5를 확인했다. F3는8함수 우회·8객체 예외·Chrome2차단 실패·Python4거부로 별도 원장이다. 서로 다른 시험을 합산해 하나의 전체 성공률을 만들지 않았다.

## 5. 전체 자동 회귀·Chrome·보호 정책

|스위트|pass|fail|skip|
|---|---:|---:|---:|
__TEST_ROWS__
|합계|603|0|1|

실제 실행 명령·workdir는 results/final-2e485/execution_manifest.json, 발견 스위트/TAP hash는 test_summary.json에 저장했다. reports178에는 Node helper 모듈1개가 포함된다. frontend는9파일118, Chromium20은 notice-close-hit7+월간조석13, 카드DOM16이다. 기존 Chromium 환경 실패7도 실제 Chrome에서 통과했다. 조석 skip1은 rolling 공식 오래된 표본 조건이다. 구현 보고603은 이8범위로 독립 확인했으며 이를 GitHub CI 성공이라고 부르지 않는다.

추가 독립 통과: S2 matrix182/182·특별21/21·팝업12/12; source74/74·helper23/23; 추가80/80·sample92/92·Python92/92·주간validator10/10; 정책19×ON/OFF38조건의 저장된 strict 결과와 완전 일치. 확장103 중100통과/기존 R5 3불일치는 유지했다.

Chrome344·375·768·1024·1440px: 기본49×5=245/245, actual loader 정상/오류/복구45/45, C2 잘못된 문자열2×5=10/10(구현자의2개 scenario를5폭으로 확장). 정상 점수·팝업 참고정보·빈 안내문·자료 복구·P0 경계가 유지된다. 일반 E2E는 target55/55와 기존 main결합55/55에 이어 **최신 main 결합55/55**도 별도 실행했다. 제보·현장소식·본인삭제·일반/보호 길안내·캐시·네트워크 오류를 actual memory API와 Chrome에서 확인했다.

S1-R actual 보호표현171개 누락0·일반종17개 오탐0. LF/CRLF/구분자/수량/기존slash·일반종/보호종혼합, 최근 가점 제외, 번식6/최근18/legacy9/현장소식10+번식6/관리자인증5/본인삭제4 실제 assertions 통과다. 관리자 승인·감사/권한 경로를 임의 변경하지 않았다. S1-P 승인 후 전면 비공개와 다르다.

선상 별도13×5=65의 **초기 카드·팝업 동일 기대는40일치/25불일치**로 보존했다. 그25는 raw 풍속·파고·강수가 추천 안전을 넘는5조건에서 카드가13:00 안전80을 선택하지만 장소 팝업은12:00 대표99를 표시하는 기존 의미 차이다. before352 actual375에서도 같은5조건·시각·표현이 동일했다. 같은 DOM의 안전 선발/결측 차단 assertions는65/65 충족하며 “카드·팝업65일치”로 재계산하지 않았다. invalid시간/필수기상결측 선상6조건은 두표시80으로 일치한다. 합성99는 실제 generator의99 관측이 아니다. 실제 생성 산식은 해당 일부수치에서85/92를 만들므로 높은 일반 적합도와 엄격 선상불가의 차이는 기존 정책에서도 가능하다. 팝업 출항 안내의 기존7m/s·1.5m와 추천6·0.7·무강수 문턱 차이는 별도 설명/안전표시 개선 과제이며 F3의 무효시각99와 구분한다.

환경/한계: PC·모바일 폭 에뮬레이션이지 실기기GPS/키보드·배포 설정·실제 바다 출항 검증은 아니다. 가로 점수 경계를 검사했으며 지도 고정버튼의 일부 팝업 라벨 가림 등 기존 세로겹침은 완전 검증하지 않았다. root 첫 추가 실행에서 출력폴더/생성fixture 누락은 하네스 준비 오류로 분리해 마련 후 재실행했다. 기존 결합 JS 초회 UTF8미설정으로 Python 풍향 문자열 깨짐1실패도 보존했고 bundled Python/UTF8 지정 후277/277 통과했다. 제품 실패를 환경 문제로 숨긴 것이 아니다.

## 6. 고정 정상190곳·176후보·추천10 전수 보존

35141c0, 최신main4b164, 이전352, 현재2e485를 동일16파일/제보11/시계10월8일22:40에 호출했다. 후보ID·순서·원점수·표시·rank·bonus·추천일/시각·추천유형·P0 상태·전체190 signature 및 좌표 벡터 hash가 ON/OFF 모두 같다. 독립 선발 계산도 실제 selector와 일치한다. 합성 참고자료 제외 실험38은 별도이며 정상 입력 변화로 오산하지 않는다.

제보 ON — 네 버전 동일:

__TOP_ON__

제보 OFF — 네 버전 동일:

__TOP_OFF__

원점수/표시는 실제0~100 계약이고 rank는 제보 가점이 들어간 내부 수다. 유형은 추천 axis이며 실제 서식환경 분류와 같다고 해석하지 않는다.

## 7. 최신 main 결합·기상 validator·Actions

최신main4b164까지 변경한 것은 tide_health/tide_today/weather_today/weather_week 자동4JSON이다. merge-tree75df87ad는 충돌0이며 weather_today/week·tide_today/month/health **5자동파일은 main Git blob과 바이트 단위 동일**, index/서버보호/validator8제품파일은 head blob과 동일하다. archive는 CRLF 때문에 rawSHA가 다르며 LF 정규화 후 정확히 일치한다. verification_summary.json에 양쪽 hash와 비교 방법을 기록했다. 자동 JSON을 수동 고치거나 운영 branch를 병합하지 않았다.

이전main b097의10월9일 today를 **같은 hash 그대로** 실제10월10일에 validator로 읽으면 Batch date mismatch이고 생성일10월9일21:10에 시계를 고정하면190곳 통과한다. 실제builder로 합성 상류자료의190곳 **새10월10일 배치**를 만들어 현재 시계의 today/week validator 모두 통과했다. 이후 실제 자동 갱신된 최신main의10월10일05:06발행/05:10refresh 자료를 새 head validator로 실제05:38에 읽어 today190/190·week10640/10640 검증도 통과했다. 날짜 assertion 삭제·옛JSON 날짜만 교체는 하지 않았다. 과거 배치 날짜 오류와 새 validator 결함을 구분했다.

최신결합 Chrome55는10월10일05:43으로 고정했다. 그 시점은 기존 storedWeatherState가 사용하는05:35갱신+30분 판정구간 안이며 새 지연유예 정책 B를 구현한 것은 아니다. 이후 시각 전부 current라거나 실제 live기상이 안전하다는 결론은 아니다. 이전결합277 JS도 통과했으며 최신main은4자동자료만 바뀌어 제품소스 동일성이 입증됐다. 최신자료는 validator2 및 별도5폭E2E55로 추가 검증했다. 구현자의 “결합527”을 그대로 독립 재현했다고 보고하지 않는다.

Actions4개(update-weather/update-tide/update-tide-month/build-share-pages)를 실제 읽었다. PR trigger/test-only workflow가 없고 dispatch/schedule은 자료 생성·commit/push를 포함하므로 임의 실행하지 않았다. exacthead2e485 **전체 event REST head filter 실행0**, PR필터connector 실행0·status0다. **PR CI 성공 결과 없음**은 미확인 항목이지 성공으로 처리하지 않는다.

읽기 전용으로 확인한 최신 실제 update-weather **run37984742517**, schedule,10월10일05:06KST, 실행headf982e882, completed/success. job114003793454의 syntax/build/validate/commit 각step이 성공했고 최신main 자료를 생성했다. 이는 운영main workflow·기존 validator 성공이며 **새PR SHA CI 성공은 아니다**. 별도 검증 CI가 필요하면 운영을 쓰지 않는 workflow를 별도 승인 범위에서 준비해야 한다. 본 검증은 이를 실행하거나 운영배포workflow를 rerun하지 않았다.

## 8. 잔여 보안 위험·PR 단독 배포 적격성

현재 F1~F3로 PR13 자체 배포는 차단이다. 아래 평가는 이3건 수정 후의 별도 후속 여부이며 C가 해결했다고 보고하지 않는다.

|과제|검증된 범위·위험|우선순위/배포 관계|
|---|---|---|
|R5 극단 숫자 문자열|형식기상 문자열의 Infinity 변환 및 JS/Python 허용차이, 확장3불일치 유지. 정상builder finite 방어 존재·운영 비신뢰weather쓰기/유입 미관측|별도P2. PR13 범위가 새 입력권한을 추가하지 않아 이 단독근거로 추가 선행차단으로 격상하지 않음. 실제 유입/비신뢰 weather쓰기 제공 시 사전필수로 격상|
|삭제 후 old GET 마커복귀|actual ownerdelete200·DBdeleted·fresh제외 후 늦은oldGET이 UI/marker-renderer에 복귀. 서버삭제는 유지, 지리renderer는 대역이므로 실제 Leaflet 사고라고 확대하지 않음|별도P1 보안PR 최우선. 서버 철회는 유지되고 새공개권한이 없어 제한된 S1-R/S2배포의 추가차단으로 단독지정하지 않음. 개인정보/민감위치 철회가 실제 요구되면 철회 보장 전 해당운영전환 선행차단|
|보호상태 old응답·길안내복귀|새hiddentrue 뒤 oldfalse가 보호 UI를 되돌리는 기존 actual 함수 결과. 권한·공개scope 신규확대 없음|별도P1. backend재분류/fieldhide/S1-P 보호전환 배포 **전 필수 차단**. 요청/자료버전·마커/팝업/길안내/캐시 철회를 같이 처리|
|S1-P 승인 후 공개/간접위치|S1-R 표현 방어로 전면비공개/기존승인·sitehistory고정점 간접연결 회수가 완료되지 않음|별도사용자정책승인·데이터감사·서버차단·캐시철회 설계. S1-P 운영전환 전 필수 검증. 이번PR에서 몰래정책구현하지 않음|
|선상 팝업 일반적합도와 안전추천 의미|12:00 높은 대표점수·greenferry와13:00 안전추천이 구분되지 않고 읽힐 여지. before동일, 최종안전선발유지|별도P1 안내품질/안전표시 검토. 출항승인으로 일반별점을 해석하지 않게 용도·시각·문턱설명 필요. 무효점수우회와별도|

실제 민감정보 노출 건수·사고는 조사하지 않았고 발생으로 단정하지 않는다. 기존 결함이라는 이유로 무시하지 않는다. 다음 별도보안PR에는 삭제 tombstone/version·보호상태 monotonic 처리와 fresh응답 복구·캐시무효화·동시/지연응답·actual DOM·서버조회 회귀를 포함한다. 개인정보 철회 요구가 확인되면 다른기능 우선순위보다 앞서 차단한다.

## 9. 보완 지시·승인 후 배포 순서·rollback 준비

**현재 보완 요청:** 구현자는 F1 미래발행 비교기준, F2 item출처 역행, F3 원본 시각string 계약을 별도 정확SHA에 보완한다. C/B·점수·최근가점16·정원·S1-P를 무단변경하지 않는다. 본 검증자는 제품코드를 고치지 않았다. 새SHA에서 실패28/140·타입8/객체8/Chrome2를 안전 성공 기대대로 전부 확인하고603회귀·source74·fixed176·245/45·최신main 결합·validator를 영향범위에 맞게 다시 실행한다.

보완 통과 후에만 사용자 별도 승인 대상으로 아래 순서를 제안한다(실행하지 않음).

1. head/main 다시 고정, merge-tree와 운영데이터 보존 확인; PR검증CI 부재 해결방식 명시(안전한 test-only CI 또는 명시한 로컬 증빙 승인). 배포현재Pagescommit·공개reportsWorker version·설정 식별자와 보호를 유지하는 rollback대상을 기록한다.
2. S1-R 서버보호 **reports-api 공개Worker 먼저**, 읽기전용 recent/field/history스모크. 실제 보호좌표·실사용자 입력을 테스트에 쓰지 않는다. D1스키마/원자료/승인기록 변경 없음.
3. 그후 사용자승인main병합에 따른 Pages, 기상자동갱신의 새validator 첫 실행을 관찰. 현재검증자료 없는 경우 빈안내를 정상 취급하고 last-safe/Bfallback으로 우회하지 않는다.
4. rollback은 프런트만 이전정상 상태로 되돌리면서 강화서버보호를 먼저 유지하는 방향을 우선한다. 이전Worker로 단순복귀해 S1-R을 약화시키지 않는다. validator를 되돌릴 때도 동일 생성계약/안전검사를 평가하고 정상JSON 날짜·D1을 고쳐서 우회하지 않는다.
5. 배포후 current/unknown·빈목록·90/91·보호표현·길안내·삭제·기상갱신을 읽기전용 확인한다. 별도보안PR과 S1-P전환 차단조건을 유지한다.

구현 인수인계의 서버먼저/프런트뒤 순서는 설계와 맞지만 “PR CI 성공 확인”은 현 workflow로 아직 충족되지 않았다. **배포된 Worker 실제 version·rollback 안전version과 실행 리허설은 이번 검증에서 고정/수행하지 않았다.** rollback은 계획 단계이며 준비완료로 보고하지 않는다. 현재main4b164는 검증한 repository SHA이지 배포Worker version을 대신하지 않는다.

검증 문서·합성 재현자료만 전용브랜치에 commit/push한다. 최종 PR13/Issue9 댓글 본문과 exactreadback hash는 results/final-2e485/github_receipts.json에 게시후 보존한다. main병합·Pages/Worker배포·운영D1·실사용자등록/삭제 없음. **새보완SHA와 사용자 별도 승인을 기다린다.**

## 재현 명령 및 산출물

review=`C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap`, analysis=`C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap`. 결과 results/final-2e485, 코드 scripts/final-2e485. 제품 archive는 정확SHA에서 재생성한다. 전용브랜치제품파일로 시험하지 않는다.

```powershell
$rootReview='C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap'
$rootAnalysis='C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap'
$rootOut="$rootReview/docs/p1-s-review/results/final-2e485"
$rootScripts="$rootReview/docs/p1-s-review/scripts/final-2e485"
$target="$rootReview/docs/p1-s-review/.scratch/targetFinal"
$env:PYTHONDONTWRITEBYTECODE='1'; $env:PYTHONUTF8='1'; $env:PYTHONIOENCODING='utf-8'
node "$rootScripts/independent_replay.mjs" $rootReview $rootAnalysis $rootOut
node "$rootScripts/c_reference_policy.mjs" $rootReview $rootAnalysis $rootOut "$rootReview/docs/p1-s-review/results/c/c_reference_policy.json"
node "$rootScripts/c_temporal_source_actual.mjs" $target $rootOut $rootAnalysis
node "$rootScripts/pr13_r123_actual_matrix.mjs" $target $rootOut $rootAnalysis
node "$rootScripts/pr13_r123_extended.mjs" $target $rootOut $rootAnalysis "$rootReview/docs/p1-s-review/results/r123/baseline7eb_actual_matrix.json"
node "$rootScripts/loader_final_node.mjs" $target $rootOut 2e485079a34fa5aeeef09e82f3b996bf2696d978
$env:LOADER_WIDTHS='344,375,768,1024,1440'
node "$rootScripts/loader_final_dom.mjs" $target $rootOut 2e485079a34fa5aeeef09e82f3b996bf2696d978
$env:C_GENERATOR_FIXTURE="$rootOut/sparse6h_generated_today.json"
$env:C_WIDTHS='344,375,768,1024,1440'
node "$rootScripts/independent_final_dom.mjs" $target $rootOut 2e485079a34fa5aeeef09e82f3b996bf2696d978
$env:FINAL_TYPED_ONLY='1'; $env:C_WIDTHS='375'
node "$rootScripts/independent_final_dom.mjs" $target $rootOut 2e485079a34fa5aeeef09e82f3b996bf2696d978
Remove-Item Env:FINAL_TYPED_ONLY
node "$rootScripts/timestamp_type_diagnostics.mjs" $target $rootOut
& 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' "$rootScripts/timestamp_type_python.py" $target $rootOut
```

発行日の取り違えを防ぐため batch_date_recheck.py と latest_main_validate.py は別結果・別時刻で再実行する。全8スイートの正確なcmd/workdirは execution_manifest.json、必要な実生成fixtureは normal_current_builder.py → final_c1_c2_additional.mjs の順。出力directoryを先に作る。失敗をsuccess期待に置換せず保存し、新しいSHAの結果は別directoryへ置く。
'''
report=report.replace('__TEST_ROWS__',rows).replace('__TOP_ON__',table('reportsOn')).replace('__TOP_OFF__',table('reportsOff'))
report=report.replace('発行日の取り違えを防ぐため batch_date_recheck.py と latest_main_validate.py は別結果・別時刻で再実行する。全8スイートの正確なcmd/workdirは execution_manifest.json、必要な実生成fixtureは normal_current_builder.py → final_c1_c2_additional.mjs の順。出力directoryを先に作る。失敗をsuccess期待に置換せず保存し、新しいSHAの結果は別directoryへ置く。','발행일을 혼동하지 않도록 batch_date_recheck.py와 latest_main_validate.py는 별도 결과·시각으로 재실행한다. 전체8스위트의 정확 cmd/workdir는 execution_manifest.json, 필요한 실생성fixture는 normal_current_builder.py → final_c1_c2_additional.mjs 순서다. 출력directory를 먼저 만든다. 실패를 성공기대 대신 삭제하지 않으며 새SHA 결과는 별도directory에 저장한다.')
(docs/'FINAL_DEPLOY_RECHECK.md').write_text(report,encoding='utf-8')
header=f'''# 최신 완료 — PR #13 배포 전 / 2e485079

**수정 필요.** target `{head}`, before `{before}`, 최종 main `{main}`. 이전 C1/C2 canonical 및 C3 base8/40 해결; 회귀603/0/1·S2182/21/12·source74·helper23·고정190/176·Chrome245/45·최신결합55/validator2 통과. 새 C3 미래 비교기준 회복차단, root/item 안전역행 및 시각자료형 우회는 배포전 필수보완이다. [최종 보고서](FINAL_DEPLOY_RECHECK.md), [교차증빙](results/final-2e485/verification_summary.json).

- C3 Node28=23pass5fail·Chrome140=115pass25fail/예외0; root도 Node28/Chrome37528을 직접 재현. before 비교로 today 복구차단은 새회귀, item역행은 기존 미완결 계약으로 분리.
- 시각 배열8경로 raw99/rank115 최종, 객체8후보/최종 TypeError, 실제Chrome375 배열2실패·Python4거부. 운영유입/사고 미관측.
- 자동603 성공과 추가계약 실패를 분리. 선상65 안전선발은 유지, 초기카드/팝업동일40/65+의미차이25 보존/before동일.
- 최신main 자동4JSON 변경만·tree75df87ad 충돌0·자동5blob main 보존/제품8blob head 일치. 최신batch10/10 actualvalidator2통과. 옛9일JSON을10일검사한 Batch date mismatch 별도입증·정상newbuilder190통과.
- exacthead Actions0/status0, test-only PRworkflow없음·dispatch0. 운영weather37984742517 success는 main의기존workflow이며 PRCI가 아님.
- S1-R171/일반17·관리자/삭제 actual 회귀통과. R5P2/삭제oldGET P1/보호전환·S1-P 선행차단/선상안내별도 추적. 제품·main·운영배포/D1/실사용자쓰기 없음.
- 최종체크포인트는 git log와 github_receipts.json의 reportCommit·bodyhash로 확인한다. PR13/Issue9 exact본문readback후receipt를별도commit한다. 새보완SHA/사용자승인대기.

이하 이전 검증 이력(현재 판정과 구분):

---
'''
for name in ('FINDINGS.md','PROGRESS.md'):
    file=docs/name; previous=file.read_text(encoding='utf-8-sig');file.write_text(header+previous,encoding='utf-8')
nextdoc=f'''# PR #13 배포 전 검증 완료 — 다음 세션

최종판정 **수정 필요**, target `{head}`, before `{before}`, 최종검증main `{main}`. 먼저 FINAL_DEPLOY_RECHECK.md·FINDINGS최신머리·results/final-2e485/verification_summary.json·github_receipts.json을 읽는다. P1-A~D 및 통과한 R1~R6를 처음부터 반복하지 않는다. 사용자는 C만승인/B불승인. main병합·Pages/Worker배포·D1·실사용자수정 금지.

## 완료

603/0/1, matrix182/21/12, source74/helper23, 추가80/92·Python92/10, 고정190/176·ONOFF전체190 signature불변, 정책38, Chrome245/45·C2strings10, 일반55 및 최신결합55. S1-R171/일반17·관리자/현장소식/삭제 회귀통과. latestmain4자동JSON변경·merge-tree75df87ad충돌0·자동5blob/제품8blob 보존·latestvalidator2 통과. headCI0/未실행, main자동weather37984742517success를 별도확인. old9daydate문제같은hash로입증/currentbuilder190pass.

추가차단: C3 Node28=23/5, Chrome140=115/25(예외0), 기존8/40전부성공. 미래발행highwater회복차단(새today회귀)·root/item과거eligible안전역행(기존미완결). 배열time8 raw99/rank115·object8TypeError·Chrome2우회/Python4거부. 실패원장/수정요청을 보존했다. 선상별도65의25popup차이는기존다른시각/안내의미며 신규C2실패로오산하지 않는다.

중간체크포인트 `ee9d12771f985480a9797ee6c63ea6c4280212b9`. 최종보고commit 및 게시receiptcommit은 git log -3와 results/final-2e485/github_receipts.json에서 확인한다. 자기commitSHA를 같은commit문서에 순환삽입하지 않는다.

## 다음 정확한 작업

1. PR13 head/원격main 읽기전용확인. 새보완SHA가없으면 반복분석/제품수정 없이 사용자·구현자보완을 기다린다.
2. 새diff에서 F1 검증된 비교기준(미래고착 금지), F2 root/item발행일관성/장소별역행차단, F3 원본string검사/비정상타입null·예외0를 확인한다. B·배점·정원·S1-P무단정책변경이없는지 검사한다.
3. 새SHA별 archive/결과directory를 만들고 actual loader→후보→최종→Chrome 안전 성공기대28/140·시각형식/자료형8·객체8·typedChrome2를 실행한다. assertion삭제로 통과시키지 않는다. 정상1050복구와 knownrain1→oldrain0이0유지를 반드시검사한다.
4. source74·normal0/100/92.5·rank108·safealternative/tide90/91/강수1/선상6/.7/0·matrix182/21/12·fixed190/176/ONOFF·영향회귀603·DOM245/45·latestmain결합/자동JSON보존·validatoractualdate를 재검증한다. 코드/자료가변하지않은 범위를 반복확장할필요는없다.
5. R5P2·삭제oldGET P1우선·보호상태/S1-P전환前필수차단·선상팝업설명과제는 별도보안PR에 유지한다. 실제사고로단정하지않는다.
6. final문서/브랜치commitpush/PR13Issue9게시·본문exact대조receipt 후 사용자승인대기. 조건통과하더라도 운영변경하지 않는다.

## 재현 자료·환경

review=C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap
analysis=C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
Python=C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome=C:/Program Files/Google/Chrome/Application/chrome.exe
結果=docs/p1-s-review/results/final-2e485、実行=scripts/final-2e485。

제품archive는 보관하지 않는다. review branch 제품은 역사적7eb이므로 시험하지 않는다. `git archive --format=zip --output=<검증.scratch.zip> <정확SHA>` 후Expand-Archive. sourceproof의refs/시계는 새검증별 별도scriptcopy에서 고정한다. 자동JSON 날짜/점수를 수동수정하지 않는다. 최종 보고서 “재현 명령” 및 execution_manifest에 정확cmd가 있다.

실제생성fixture의존: normal_current_builder.py 후final_c1_c2_additional.mjs; 출력directory미리생성. sparse6h_generated_today.json은 이전실제builder의보존합성자료로생성timestamp를위조하지않는다. `C_GENERATOR_FIXTURE`를설정해야기본DOM6참고조건이보존된다. 새Chrome추가타입은 FINAL_TYPED_ONLY=1/C_WIDTHS=375; 원래기본245를재실행할때는FINAL_TYPED_ONLY/FINAL_BOAT_ONLY해제. loader기존8·확장28은성공기대로정의된final_cases를공유하며 실패는exit1이다.

GitHubActions: 현4workflow는출력commit/push포함/PRtrigger없음. 무단dispatch/rerun금지. 최신mainrun성공을PRCI성공으로오인하지않는다. 배포현재Workerversion/보호유지rollbackversion은아직준비완료아님. 새검증통과와사용자별도승인 후배포순서/rollback을구체적으로고정한다.
'''
nextdoc=nextdoc.replace('未실행','미실행').replace('전환前','전환 전').replace('結果=docs/p1-s-review/results/final-2e485、実行=scripts/final-2e485。','결과=docs/p1-s-review/results/final-2e485, 실행=docs/p1-s-review/scripts/final-2e485.')
(docs/'NEXT_SESSION.md').write_text(nextdoc,encoding='utf-8')
print(json.dumps({'report':str(docs/'FINAL_DEPLOY_RECHECK.md'),'verdict':'수정 필요','normalCandidates':176,'suites':tests['summary'],'additional':add['passed']},ensure_ascii=False))