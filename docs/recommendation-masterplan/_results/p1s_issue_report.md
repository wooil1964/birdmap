## P1-S 독립 분석·안전 계약 설계 완료 — 구현 승인 대기

요청 체크포인트 `bee1359`에서 이어받아 P1-A~D를 반복하지 않고 보호종·유효점수 두 계약을 분석했습니다. **운영 코드 수정·병합·배포 승인이 아닙니다.**

- S1 체크포인트: [`0a67229`](https://github.com/wooil1964/birdmap/commit/0a67229127306a2daba19013f895f0f95b2d4ef2).
- S2 통합 설계: [`e03f686`](https://github.com/wooil1964/birdmap/commit/e03f686d24d758dccf1dd640bc439139e529acf0).
- [P1_SAFETY_DESIGN.md 전체 설계·인수 명세](https://github.com/wooil1964/birdmap/blob/e03f686d24d758dccf1dd640bc439139e529acf0/docs/recommendation-masterplan/P1_SAFETY_DESIGN.md).
- [통합 검증 JSON](https://github.com/wooil1964/birdmap/blob/e03f686d24d758dccf1dd640bc439139e529acf0/docs/recommendation-masterplan/_results/p1s_validation.json), [재개 지침](https://github.com/wooil1964/birdmap/blob/e03f686d24d758dccf1dd640bc439139e529acf0/docs/recommendation-masterplan/NEXT_SESSION.md).

### 1. 코드·자료 기준

시작 main `4fc14b3`, 최종 원격 main `18171613923ae5cf0a72512eae805c0005037115`를 확인했습니다. P1-C/D 코드 `35141c0` 대비 자동 기상·조석 JSON5개만 달라졌으며 보호·추천 관련 소스10개와190곳 등록부는 그대로입니다. 원래 P0 checkout `e0fc103`도 변경하지 않았습니다.

기존 manifest16파일 SHA,190곳, 승인 집계11곳을 유지하고 고정 비교는 **2026-10-08 22:40 KST**로 실행했습니다. 최신 자료는 별도 감사에만 사용했습니다. 새 합성 입력·공식 종명 근거·재현 스크립트·결과를 분석 경로에 저장했으며 기존 스냅샷을 덮어쓰지 않았습니다.

### 2. S1 보호 표현·공개 경로

**확인된 표현 결함:** 현행19종 exact 판정은 `저어새1`, `저어새 1`, `저어새 2마리`, `흰꼬리수리1`, `매1`을 놓칩니다. LF/CRLF는 토큰 분리 전에 지워 `저어새울새`처럼 붙습니다. slash 신규 입력은 거부되지만 legacy 저장 읽기에서는 보호종 분리를 못 할 수 있습니다.

실제 GET handler+memory SQLite로 **48입력: legacy literal48 + 정리저장44 =92관찰**(신규정리거부4), 연결2·pending6·과거현장소식3·status3을 재현했습니다. POST/운영DB는 호출하지 않았습니다. protected/hidden 자식이 일반 부모/fixed 지점 종·이력에 합쳐져 부모 좌표와 연결되는 경로도 합성 재현했습니다.

**정책 변경과 구분:** 승인 이후 공개 API의 관리자 신뢰, canonical 명시 비번식 확인 뒤 정확 위치 공개는 기존 정책입니다. `docs/long-term-db-phase2a/README.md:13`이 이 원칙을 명시합니다. 승인 후에도 모든 protected/review 행을 비공개로 바꾸는 것은 **S1-P 공개 정책 전환**이며, 기존19/6 표현 방어 **S1-R**과 별도 승인 항목입니다. 실제 운영 유출이 있었다고 주장하지 않습니다.

권장 계약은 원문 불변 → 구분자 먼저 → NFC → 검증 표준명 전체 일치 → 명확한 수량 접미 문법 → protected/breeding/review → 공개 권한입니다. 모든 숫자를 지우거나 짧은 `매` substring으로 갈매기류를 차단하지 않습니다. 종별 수량과 행 전체 birdCount를 합산하지 않습니다. report1..100000/field1..999 제한을 구분하고 별도 canonical birdCount0 계약은 유지합니다.

S1-P 승인 시 보호/미해석 행은 public union·latestDate·total·페이지·parent/fixed 연결 **전에** 제외하여 좌표뿐 아니라 siteId/이력/관찰일/count/가점/동점/길안내 신호를 막아야 합니다. recent-sites만 수정하면 전체 목표를 충족하지 않습니다. field의 대략 좌표·랜드마크 메모·소유자 삭제 영수증·receipt/replay와 public status도 함께 명세했습니다. 원자료·관리자 승인·감사는 보존합니다.

### 3. 종명·오탐 독립 대조와 미확정 정책

독립70 fixture에서 exact 보호종19/19은 현행 민감이며, 정상 반례17/17은 현행 비민감입니다. 표현 방어 시제품 S1-R의 정상17 오탐은0입니다. 반면 시험용 S1-P는 정상17 중12개 공개 보류(작은 사전coverage11 + ‘알 수 없음’ 의미 오탐1), ‘알을 품고 있음’/‘알이 있음’은2개 누락했습니다.

**시험용 알 정규식과5종 일반 사전은 운영에 채택하지 않습니다.** 기존6번식 단어 보호를 유지하고 알·산란 확장은 문맥/조사/부정·인용/알락 종명 반례와 승인 조건으로 분리했습니다. 작은 fixture 결과는 운영 오탐률이 아닙니다.

[국립생태원 저어새](https://www.nie.re.kr/nie/pgm/edSpecies/view.do?menuNo=200121&speciesSn=27), [흰꼬리수리](https://www.nie.re.kr/nie/pgm/edSpecies/view.do?menuNo=200121&speciesSn=34), [매](https://www.nie.re.kr/nie/pgm/edSpecies/view.do?menuNo=200121&speciesSn=25)를 직접 대조했습니다. [NIBR 연구 목록](https://www.nibr.go.kr/aiibook/access/ecatalogt.jsp?Dir=1007&callmode=admin&catimage=&eclang=ko&start=92&um=s)은 한국동박새/동박새를 별도 기재하며 임의 alias 병합 근거가 아닙니다. 현행19종은 법정 전체 보호 목록과 다릅니다. 최신 전체 조류 사전·alias/ID·이용허락은 미확보이며 도입 전 검증해야 합니다.

legacy는 정규화 전 원문이 없어 과거 LF 소실을 복원할 수 없습니다. D1 변경 없는 read 방어와 모든 신규 legacy 원문 영구보존은 별도 저장 계약입니다.

### 4. S2 유효점수 계약·전 경로 실험

weekly `score:null, scoreEligible:true` → 일반/갯벌/섬의 `Number(null)=0` 후보를 재현했습니다. 선상은 null을 차단하지만 raw 음수/101 범위 오류는 별도입니다. 일반 today는 null 기상 entry를 거부해도 공지 사유가 있으면 `score:null, safe:null` 후보가 final top에 남을 수 있습니다. 공지 없는 일반 today와 갯벌 today null은 현행도 제외합니다.

계약: raw score는 **number·finite·0..100**, 원본 sample/today의 **own scoreEligible===true**, 명시 빈 missingScoreFields 배열과 실제 필수 기상 자료를 모두 확인합니다. 0/100/소수는 유효하고 null/undefined/비유한/빈·숫자문자열/bool/범위 오류는 거부합니다. 필수wave와 비대상 내륙 null을 구분합니다. raw<=100 조건을 기존 raw+16 내부 rank에 적용하지 않습니다.

26입력/metadata×6경로=**156행**, 특별 분기**32건**을 실제 함수로 재실행했습니다. 현행 후보 계약 차이80행은 coercion·필수값·명시적 계약 강화가 섞인 합성 행이며 운영 사고80건이 아닙니다. 임시 guard 모형은156/156·32/32 기대값과 일치했습니다. 최고 sample/만조 선택 전과 최종 candidate/4계절/fill 모두 검사해 같은날·다른날 대체 안전만조를 선택했습니다. 공지·제보·mandatory 우회와90/91/120분·강수1mm·선상풍속6/파고0.7·파고2 조건도 재현했습니다. **운영 구현 통과 결과가 아닙니다.**

Python validator는 고정 시계로28×2=56회 실행했습니다. today16/weekly8문서를 수용했으며 문서 수용과 추천 적격을 구분했습니다. bool eligibility·reason list 타입 강화가 필요합니다. today previous_saved는 false/stale로 강등하면서 이전 숫자·날씨를 참고로 보존하므로 일괄 false→score:null 변환은 하지 않습니다.

기상 없는 공지-only/unknown eligibility 추천 차단은 단순 Number 교정과 별개의 **계약 강화 승인 항목**입니다. 정상 기상·조석 정보는 유지하고 invalid 점수/별점은 미확인·참고로 표시합니다.

### 5. 고정 추천 결과 — S2 점수 관문만 비교

후보176→176, 전체top객체(순서/ID/raw/표시/rank/가점/추천일·시각/유형축) 불변입니다.

|순서|장소|raw/표시|rank|가점|
|---:|---|---:|---:|---:|
|1|호곡리108|92/92|103|11|
|2|알뜨르비행장112|100/100|100|0|
|3|천수만 사기리15|92/92|94|2|
|4|천수만 강당리194|92/92|94|2|
|5|해리천습지126|92/92|94|2|
|6|걸매리14|92/92|92|0|
|7|매향리107|92/92|92|0|
|8|대진항48|92/92|92|0|
|9|평화의공원195|92/92|108|16|
|10|굴업도3|100/100|100|0|

고정10640sample과최신main10136sample에서 eligible raw 타입/범위 오류는각각0입니다. 모든 metadata/필수자료·미래 운영 입력의 안전 보증은 아닙니다. **S1-P+S2 공동 영향은 집계11곳만으로 검증할 수 없으며 raw 제보를 조회하지 않았습니다.**

### 6. 현행 회귀·제한

직접 실행: 주간추천126/126, reports-api170/170, 관련프런트57/57, Python기상48/48, 조석22건 중21통과/1skip. API에는 현장소식 등록/조회/등록자삭제·제보/관리자승인 회귀가 포함됩니다.190ID/좌표유효·manifest16SHA도 확인했습니다.

실제PC/모바일 브라우저E2E는 이번에 실행하지 않았습니다. 미구현 정책에 대한UI 통과를 주장하지 않으며, 구현 후 local 합성API/정상네트워크/오류·옛캐시/지도·팝업·추천·길안내를 배포 인수 조건으로 명시했습니다.

### 7. 권장 구현·승인 조건

최소안 **S1-A 공유 read classifier + S2-A typed predicate/source adapter/Python parity**를 권고합니다. 각각 구조화 taxon/projection 대안과8축(안전·호환·오탐·변경범위·Worker/D1·API·시험·롤백)으로 비교했습니다. 구체 함수와 S1T01~16/S2T01~09 인수 조건은 설계서에 있습니다.

1. 우선 기존19/6 표현·LF와 score 타입/필수값 방어. S2 공지-only/unknown 차단의 정책 영향을 승인 문장에 포함합니다.
2. S1-P의 approved/canonical/uncertain/field 공개 범위, 전체taxonomy·알문맥·대략위치/메모·월간집계·legacy원문 저장을 따로 확정합니다. 표현 수정만으로 전체 보호 완료라고 보고하지 않습니다.
3. 실제 구현 뒤 수정 전 실패/수정 후 통과·전체회귀·고정재현·PC/모바일·pagination·cache를 검사합니다. 서버 read 보호 먼저, 프런트 이후이며 반복 jitter/원본 재작성은 금지합니다.
4. 롤백은 보호 유지 버전 또는 해당 공개 제보/추천 보류 안전모드입니다. 취약 공개·coercion을 재개방하는 예전 버전으로 돌아가는 것을 안전 롤백으로 승인하지 않습니다.

기본92 집중·배열동점·max16·정원4/3/1/2·장기생태는 기존 P1 별도과제입니다. 이번에 운영 코드·main·Pages·Worker·D1·자동JSON·원본제보·좌표·배점·정원·P0를 변경하지 않았습니다. **설계 완료, 실제 구현 및 배포는 사용자 별도 승인 대기입니다.**