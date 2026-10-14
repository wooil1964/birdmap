## 독립 검증 완료 — 검증 게이트 보강 후 PASS, 운영 승인 대기

- 기준 main: `efe1c1b97b8f2da0e52ce45bedce031c915ed522` (종료 원격 확인 동일).
- 원본 head: `519b4bd18a55bb11ed8e0f6a53e18e691b5afc82`.
- 보강 후 Draft head: **`6195c357e76201fee6625155b29c6148f73feef1`**.
- [독립 보고서](https://github.com/wooil1964/birdmap/blob/f2fdb051a73fa590308b8b9d747ab58800de6d28/docs/pr24-independent-review/FINDINGS.md), [전체 결과 원장](https://github.com/wooil1964/birdmap/blob/f2fdb051a73fa590308b8b9d747ab58800de6d28/docs/pr24-independent-review/FINAL_MANIFEST.json), [입력·함수·좌표 SHA](https://github.com/wooil1964/birdmap/blob/f2fdb051a73fa590308b8b9d747ab58800de6d28/docs/pr24-independent-review/INPUT_SOURCE_MANIFEST.json).
- 검증 브랜치 checkpoint: `f2fdb051a73fa590308b8b9d747ab58800de6d28`.

### 1. 원본 CI의 성공과 검증 공백을 구분
원본 [run38525333687](https://github.com/wooil1964/birdmap/actions/runs/38525333687)은 실제 임시 merge `2edbe6ab22880184ef855c1184aee3330244f734`(main efe1c1b + head519)을 검증했습니다. 프런트400/API322/proxy36/공개위치Chrome242/통계Chrome65/fence13/CAS10 모두 통과했고 Python 포함 **1191 PASS / 0 FAIL / 1 SKIP**입니다.

하지만 완화된 `publication_ci_signatures.mjs`는 날짜2099·시각99:99·미등록ID·중복ID·mandatory변조·공지삭제·조석문구변경·synthetic zeroScore삽입·synthetic미등록ID의 **9개 잘못된 결과를 허용**했습니다. 이것은 검증 게이트의 결함이며 실제 제품에서 이 변조나 민감정보 유출이 발생했다는 증거는 아닙니다. 원본 gate와 반례 원장을 보존했습니다.

### 2. 최소 수정과 계약
Draft 브랜치의 검증 파일4개만 수정했습니다. **제품 index.html은 원본519와 동일**하고 서버·정책·기상 원본·D1은 변경하지 않았습니다.

- 모든 후보의 ID별 점수/표시/rank/bonus/recent/date/time/axes/season/core/priority/mandatory/sortLevel/공지·조석·기상·경고·출처·적격/안전 payload 일치.
- 최종ID 후보 소속·중복 금지·typed원점수·rank산식·eligible/safe 확인.
- 독립 단계별 prefix·정원·혼합계절 보충·지역/규칙군 분산·ID 결정성 oracle과 최종 결과 일치.
- synthetic 제외ID·전체후보·zeroScoreCandidates·최종 projection 검증 복구.
- 기존 전체 후보 signature와 위치별 score/rank/bonus 검사도 유지.
- old accepted/new rejected 9개 반례 등 **35개 새 계약 회귀** 추가. assertion 삭제나 실패의 SKIP 재분류 없음.

**날짜 보존은 동일 ID 기준**입니다. 다른 ID로 교체된 위치의 날짜가 다른 것 자체는 결함이 아닙니다. 예: P1-S OFF의 기타 id5(10/9 18:00)→id51(10/13 15:00)는 기존 other prefix가 날짜를 쓰지 않으므로 허용됩니다. id51 자체의 기존 날짜·시각·안전은 보존됩니다. field에서 id8→15의 mandatory가 달라도 field의 기존 prefix는 priority를 쓰지 않으며, id15의 공지 정보가 바뀐 것은 아닙니다.

### 3. 정확한 새 SHA의 전체 CI
[run38539112245](https://github.com/wooil1964/birdmap/actions/runs/38539112245) **success**, head619, 실제 CI checkout `8d73af5c64b79a0a28c53fec5889f5ec2157d6a7` (main efe + head619).

|범위|PASS|FAIL|SKIP|
|---|---:|---:|---:|
|프런트(새계약35 포함)|435|0|0|
|공개·관리 API|322|0|0|
|proxy|36|0|0|
|공개위치 Chrome|242|0|0|
|통계 Chrome|65|0|0|
|D1 fence|13|0|0|
|CAS|10|0|0|
|Python 기상·시각·조석·공유|103|0|1|
|총계|**1226**|**0**|**1**|

원본 raw job log SHA256 `f4d49a4ad6cd18fe4f2b80fb27e5a558a4e1be99ecb0ac438b05f884646f4ed5`; 새 raw log `8c68dc8fd64fbb667a5cdb36d81decc5ae8254fa332936dc97ef7313fcc3c941`. 로그 원본 byte·메타데이터·줄 근거를 저장했고 Git 변환으로 바뀌지 않도록 별도 속성을 적용했습니다. Artifact ZIP은 미다운로드이며 metadata/digest만 확인했습니다.

### 4. 독립 로컬 재현
- 190곳·좌표·siteData 불변; 고정174/176 및 최신main배치 후보 전후 일치.
- 네 계절(6·7월 분리) ON/OFF 등16케이스, **320배열 순열 / 1024 assertions**, 결과변동0.
- 전190지점+별칭3의 **193 정규화 검사** 통과. sido는 복합 문자열·중국을 포함한 **원문23범주**이며 정규화된17개 행정 시도가 아닙니다.
- 174고정 ON top10 동일; OFF10→20,3→35,5→63 교체와57/9순서변화만 허용. 176고정 OFF8→15,10→20,3→35,5→51 교체도 완전 prefix 및 같은ID payload로 검증.
- 가을4/3/1/2, 겨울3/3/3/1, 봄4/3/1/2, 6월3/3/2/1/1, 7월3/3/2/2·보충·중복금지·선상조건 유지.
- 직접 로컬 API322/proxy36/Chrome242+65/native fence13/CAS10 모두0FAIL. 전체프런트432는 마지막 경고문구3개 추가 전 결과이며 최종35표적 및 정확SHA의freshCI435로 보강 후 결과를 구분했습니다.
- 실제 Chrome/Leaflet **344·375·768·1024·1440px** 추천 ON/OFF·표시점수·기상0 안내 **15/15**. 기존 공개위치15위험 포함242 통과.
- P0 90/91분·안전대체만조·강수1mm·선상6m/s/0.7m·결측 및 P1 nonce/revision/fresh postflight/철회·숨김·만료/CAS 보호 회귀 통과. 보호함수16·서버/proxy71파일·자동JSON hash 불변.

### 5. 결합·남은 승인 경계
최신 main과 임시 merge-tree 충돌0, tree `82e40ae22355075af3092fbbc4e16a0a456e1942`가 최종 CI checkout tree와 일치합니다. 자동 기상·조석 JSON을 덮어쓰지 않습니다.

모든 브라우저 운영요청0·외부POST/DELETE0. 실제 운영API/D1/POP·물리GPS·외부길찾기앱 검증은 **미실행**입니다. 지역 범주 분산을 탐조 성공률·종 다양성 개선으로 주장하지 않습니다. 초기 하네스 추출/CRLF 실패는 보존 후 수정했으며 최종 잔여 FAIL0입니다.

**최종: 독립 검증 PASS(보강 후) / 별도 운영 승인 대기.** Draft 유지, main 병합·Pages/Worker 배포·D1/실사용자 자료 변경을 수행하지 않았습니다.
