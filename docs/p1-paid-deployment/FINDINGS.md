# 최종 보완 검증 —2026-10-14 현행 판정
제품57184029864139fcf8603f34b39b0089c33ba9c5, 통합main6feac41ae485bf16080324e40104de6d7b1ee8e5. PR17 Draft·미병합.
판정 BLOCKED: 수정·전체 회귀·원격 합성 전환 통과. 민감자료 backup의 정확 범위 승인 및 실제 복구 검증 대기. 아래 이전c756 기록은 역사이며 현재 관문/롤백은 이 절과 FINAL_MANIFEST가 우선한다.

## 직접 수정
- 구 Worker의 지연된 무조건 UPDATE: 별도 atomic prebarrier0004b(12 SQL guards), 현재 writer의 한 raw D1.batch claim/body/delete, 공개 guard34/claim0/primary snapshot, capability v4로 전환 후 old writer·구 peer를 차단했다.
- 새 장벽에서 기존 관리자 CTE 읽기 회귀를 복구하고 native 결과 객체/meta.changes를 보존했다. fake changes()1과 native trigger포함changes2를 구분했다. 비파괴 canonical-only seed/backfill의 자체 freeze/atomic guards는 유지했다.
- 순차 REST purge가 자식삭제 후 reports fence에서 막히는 부분삭제 위험: CLI가 ledger intent/첫 삭제 전 중단한다. actual CLI+mock REST6/6, write0. readonly check와 legacy prepublication 시험은 유지했다. 파괴적 운영 purge는 자동 허용 범위가 아니며 fenced DB에서는 미지원; old privileged 사본/직접D1권한은 별도 통제한다.
- 실제 remote /query에서 중첩CASE trigger가7500 incomplete input으로 거부됐다. 최소remote probe에서 CASE거부/동등WHERE허용을 확인하고6trigger를 SELECT RAISE(...) WHERE NOT EXISTS(...)로 바꿨다. 내부 backend 원인은 추정이며 관찰된 오류와 해결은 사실이다. SQL동등성96/96; actual remote lateCHECK·전체catalog/data/ledger rollback·이전prebarrier유지·정상frozen설치·원본보존·재적용무변경4체크PASS. 최초실패/원형로그보존, 운영DB는고장시험대상아님.

## 정확 SHA 실행
로컬7스위트812PASS/0FAIL/1SKIP(front379/API294/proxy36/weather60/time11/tide21+skip1/share11). skip은 과거공식조석표본이rolling window밖인기존조건이며 assertion삭제0.
실제Chrome242/242,5폭344/375/768/1024/1440, 브라우저오류0/운영요청0/외부변경요청0. 합성API·실제Leaflet; 외부타일/물리GPS/외부앱운영시험대체아님.
독립native fence13/CAS10 모두PASS/0FAIL, 소스해시불변. 실제COMMIT후응답손실·중간/마무리rollback·동시current20/old20·orphan/freeze·삭제terminal과originalCAS원인확인.
exactCI38442910120/job115453799991/merge6b131c37e47eb53d5cff209769d7b04006f1398c. 제품과tree동일, 실제로그·모든step성공 확인:812/0/1+Chrome242+native13+CAS10.
고정Oct8 22:40KST의190/176·ON47c90497…/OFFecd3d28… fullsignature/상위10/점수/가점/시각/좌표불변을CI에서재호출했다. 현재main14일자동JSON 원본/validatorPASS와구분했다.
P0·S1-R·S2-A·F2/F3 회귀포함. 기존 R5JS68/Python14/Chrome35, S2 182/21/12는 동일source비간섭 기록과 새실행을구분한다.

## 실제 보호 롤백
publicnormal f1f24698-8388-4f36-ae31-38f2dd8e9446 /maintenance7e398695-aad7-4e58-962c-034513776960.
adminnormal a7723404-a3c2-4739-91ff-44049e1302cb /maintenance11e97856-990e-4a17-9c28-f18cf92ca46d.
실제uploaded4버전, active변경0/previewoff. upload9f8과제품571의runtime39·source-map/bundle 동일매핑. 적용migration은571SQL. 이전5719/494/16dae/c025Pages로보호후퇴금지.
exactPagesartifact11837076250,388asset전수Gitbyte/해시일치,190좌표hash21c25db5…; ZIP보존/배포0. D1삭제·철회·epoch/revision을backup으로되돌리지않고 보호maintenance/같은보안source로roll-forward.

## Paid·외부 관문
실제인증Cloudflare계정Workersplans: Paid $5/month+usage /Currentplan disabled /FreeDowngrade 확인. 구독API403과구분. 요금제·결제변경0.
warm35/cold109reads·HEADwrite0. 20×8h×30d+다른Worker10k/day 가정:월528만~615만requests·보수2.11억~2.68억D1reads. avgCPU10ms+guard1ms감도약$5.56~$5.75. 실제전체계정CPU/logs/세금등unknown; SQLwaiting≠CPU. 공식Workers/D1pricing 및계산은 PAID_MODEL_5718402_NATIVE_20261014.json.
합성DPAPI CurrentUser 암호화/복구/오염거부4/4. 실제fullD1 export는 자동승인검토가 private정확좌표·제보자정보·관리자메모의반출범위와특정local저장위치명시승인을확인못해거부. 실행0/평문파일0/우회0. 구체범위질문pending.
운영main/Worker활성화/Pages/D1/실사용자변경0. remote합성DB90e6a8a0…만fake0,0으로검증/frozen보존. 실제운영사고를주장하지않는다. 이미전달된old정보/외부앱메모리의원격회수불가는지원client/새response보호와구분한다.

## 다음 운영 전환
구체backup승인→현재remote/main/PR/기상/active재고정→standby/assets해시→사전bookmark/초기암호화export·메모리복구→pairedmaintenance100%/legacy0/previewoff·operator쓰기통제→0004b만dedicateddir에서pinnedWrangler4.149 d1 migrations apply --remote→readback/freeze-boundbackup→0005만별도apply→ledger/원본/epoch/revision/guard34/claim0/FK0→보호normalpair/peer/nonce→안전thaw→검증source만main/Pages→실제운영auth/API/철회/삭제/캐시/추천/자동갱신검증.
수동BEGIN/COMMIT·임의RESTDDL루프·0004_field재실행·epoch초기화·oldweakrollback금지. 승인된수정/배포권한은유지되고해결가능한결함은직접수정·전체관련재검증한다. backup/외부인증관문은완료로허위표시하지않는다.


---
# 이전c756 기록(역사)

# P1 최종 배포 준비 — 수정·검증 완료 범위와 외부 관문

작성일 2026-10-14 KST. 사용자 최신 승인은 보안 수정·통합·병합·배포까지 포함한다. 별도 운영 재승인을 반복 요청하지 않는다. 실제 요금제·백업 반출 범위·필요한 외부 인증을 확인할 수 없으면 강행하지 않는다.

## 정확한 소스와 변경
최종 배포 후보 c75640613d3dad7f6a0e492cecb2ac3232e8a48e.
R5 제품 수정 0107e1419af7bea1d758f35a427db81e06681e28.
현재 원격 main d736eed629210c14766c7708e206d391649befb1.
PR17은 c756, Draft/open/미병합. PR13 b12e20c1·PR16 24529898 기능은 이미 포함되어 있다. 두 PR을 기계적으로 중복 병합하지 않는다.
별도 로컬 codex/p1-publication-paid-deploy 작업트리 사용. 원본 Free/WS 작업트리·기존 미추적 증거 보존.
Paid를 실제 확인한 뒤 기존 HTTP 4750ms 갱신/요청 시작 5000ms 상한/4000ms timeout/primary/nonce/fresh postflight를 유지하는 최소 범위다. 실험 WS/DO는 배포 소스에 포함하거나 활성화하지 않았다.

R5: 400자리 풍속 단위 문자열이 Infinity로 변환되는데 today 일반·섬·갯벌의 실제 최종 카드에 score92/rank108로 들어왔다. Python도 wind/rain/wave overflow를 적격으로 승인했다. 형식 뒤 유한하고 음이 아닌 양을 요구하여 후보·최종·표시 출처를 모두 차단했다. 참고 기상 원자료와 정상 0/92/92.5/100, 가점16/rank108은 유지했다.
변경: index.html weeklyTodayRequiredDataValid(4218), validate_weather.py finite_formatted_number(26), 관련 JS5/Python4 시험, CI에 기존 시간계약11 추가. Worker 비즈니스·CAS·migration·공개 정책·190개 지점은 변경하지 않았다.
수정 전 올바른 동일 입력 JS1PASS/4FAIL, Python1PASS/3FAIL; 수정 후 JS5/5, Python4/4. 원형 실패와 시험 입력/DOM 선택 오류도 삭제하지 않았다.

## 독립 실행과 CI
0107 전체 로컬 자동 771 PASS / 0 FAIL / 1 SKIP: front379, API253, proxy36, weather60, tide21+1skip, share11, validator time11. 원발행 시각 대조8/8는 별도 시험이다.
c756는 실제 정식 생성자료 today/week2JSON만 추가했다. 다른1837 Git entries·Worker64개 파일 및190개 전필드/좌표/순서는0107과 동일하다.
c756 정확 CI run38430161703/job115409935921, merge bb09ba800d33d6813c0665eb956eb710b9bc57a3: 실제 자동771/0/1, Chrome242/0/0, 고정 ON/OFF 전체 signature 및 top10 통과. source 변경 없는 native/migration 시험을 새 SHA에서 재실행했다고 주장하지 않는다.
별도 실제 Chrome R5는344/375/768/1024/1440px에서35/35, 독립 재실행35/35. S2 matrix182/182·special21/21·popup12/12, 보호종171 누락0/일반17 오탐0. 독립 R5 실제 함수/합성DOM68/68, Python14/14.
고정 2026-10-08 22:40 KST ON/OFF190곳·176안전 후보·전체 순위/시각/점수/가점/좌표 동일. 이는 현재 운영 기상자료의 후보 수를 의미하지 않는다.
조석1skip은 공식 표본 날짜가 rollingmonth 밖인 조건이며 PASS로 합산하지 않는다.

5719에서 실제 실행한 Load18/18, native D1 CAS10/10, migration30/30, 추가 integrity3/3, B6 legacy13/13+expanded25/25(171×3표현 subset513cells)을 원장으로 유지한다. 0107/c756의 해당 Worker/CAS/schema/client권한 블록이 같은 Git blob/hash라는 독립 비간섭 증거가 있다.
migration0005 원자 fault rollback과68합성 원본 보존, 초기 write_frozen1·9field barriers·terminal·CAS를 로컬 Wrangler로 검증했다. 실제 운영 migration은 아직 하지 않았다.

## 하네스 실패의 보존
원형 Chrome237/4 및 Load17/1은 그대로 보존했다. 개별 request-start lease와 복합 전체시간, 실제 별도 visible context, 새로운 generation 요청 역전, 실제 hidden 상태의 request start를 검사하도록 수정했다. 기존 요청2·좌표 불노출 assertion은 유지했다.
추가 R5 popup 첫48/20은 풍향·풍속을 분리한 실제 span에 연속 문자열을 찾은 오류였다. 같은 참고 정보 보존을 실제 표시 구성으로 새 실행에서 검증했다.
추가 Chrome 첫15/20은 Leaflet 닫힘 애니메이션 동안 전역 querySelector가 이전 popup을 읽은 오류였다. 현재 열린 Popup 객체 소유권 검사 추가와 같은 점수 기대값으로35/35를 확인했다. 원형 JSON/로그는 보존했다.
로컬 merge-tree/증거 저장의 권한 제한, helper 상대경로 오류는 제품 실패와 구분했다.

## 실제 현재 기상자료
기존 main의10월13일21:45 today를10월14일에 검사한 Batch date mismatch 실패는 정상 거부이며 원장을 보존했다.
전용 codex/p1-paid-weather-check-20261014에서 정식 update-weather workflow38428696303/job115404836753 성공. 운영 main/Pages를 대상으로 실행하지 않았다.
실제14일01:13 생성/01:17 갱신 자료는 current wallclock Validator today/week 모두 PASS, 190곳·적격190·주간10640 적격표본, registry/좌표 불일치0. providerFallback190은 원자료의 실제 정상 대체 경로이며 수동 날짜 수정0. c756에 생성된2JSON만 반영했다.
원격 main의 정규14일 갱신 성공과 이를 혼동하지 않는다. 다음 운영 전환 때 새로 현재 날짜·발행·예정갱신 적격성을 검사해야 한다.

## 실제 보호 유지 롤백 준비
public normal2e8d2d3d-171e-42cf-8467-4d6ed9e7d223 / maintenance e2e826c9-5e37-4d33-b05e-9b40ce428fec.
admin normal249ef904-5b5c-4733-b913-7df21f8dd5e7 / maintenance cc6face1-897e-4a0d-b2e8-f8155a8d0a20.
4개는 실제 versions upload 완료, 활성화0. 업로드 module bytes/hash→source5719→원격 annotation/version/bindings를 확인했다. 역할별 tree shaking을 고려했다. 이 Worker source는0107/c756와 동일하다. secrets 값은 출력/저장하지 않았다. preview URLs off.
현재 활성 public494b97d1/admin0134cd9a는 그대로다. public494b97·직전16dae는 새 보호 유지 롤백 대상으로 사용하지 않는다.
c756 보호 Pages artifact11830209010, ZIP SHA a4b4a07911dbc5d1f4607721d4b76946422774525b57c25b0058928306fb7526. 실제388 assets 모두 CI merge Git bytes/manifest와 일치한다. 실제 ZIP 로컬 저장, artifact expiry2026-11-12. 이는 배포 또는 Pages rollback 실행 결과가 아니다.
D1 backward restore/down migration으로 삭제/철회/epoch/revision을 되돌리지 않는다. 보호 maintenance와 같은 보안 source로 roll forward한다.

## 운영 읽기 전용 상태와 외부 관문
실제 제품 schemaReady를 metadata SELECT에 적용: core true, FK위반0, SELECT4/rows_written0. publication schema와 field row_revision은 아직 미설치다. 현재 reports74/field3은 사전 metadata 집계이며 사용자 payload/좌표를 저장하지 않았다.
Time Travel info는 성공했다. 이는 full encrypted export/복구 검증이나 최종 freeze-bound 백업 완료를 대체하지 않는다.
전체 D1 export를 Git 밖 Windows DPAPI 암호화 저장하고 메모리 복구하려는 작업은 자동 승인 검토에서 정확한 민감 payload/저장 위치 승인이 불명확하다는 이유로 거부됐다. 실행0·원문 저장0. 구체적 승인 질문을 요청했고 답변 전 재시도하거나 다른 방법으로 우회하지 않는다.
Workers subscriptions GET403으로 실제 Paid 활성화는 확인되지 않았다. standard runtime만으로 Paid를 증명하지 않는다. 요금제/결제 변경0. 사용자 확인 질문 pending.
Python UA의 공개API403은 정상 Node UA와 구분했다. Node approved GET200(public max-age60), public-state404는 기존 legacy 활성 소스의 상태다. body는 저장하지 않았다. 현재 Pages는 TMAP 있음/publication-v1 없음. 새 보호 소스 반영 또는 실제 사고를 주장하지 않는다.
writer drain 감사에서 신규 전환 차단을 확인했다. old field-status의 무조건 UPDATE와 제한 없는 Turnstile/JWKS await 때문에 maintenance100%+대기로 drain을 증명할 수 없다. 0005 frozen 구간은 막지만 thaw 뒤 non-deleted not_visible을 old status가 reappeared로 덮을 수 있고, old serializer가 보호 수량 종의 정확 좌표를 응답할 위험이 있다. 합성 반례이며 실제 사고 증거는 아니다. 별도 비파괴적 pre-barrier 및 현재 writer의 transaction claim을 최소 구현·재검증할 예정이다.

## Paid 용량
실제 월 사용량/CPU·Paid 활성화를 검증한 것이 아닌 모형이다. 20명×8h×30일, 다른 Worker10000요청/일 등의 명시 가정에서 정상5283000req/월 및151331400 D1 reads/월. 재접속20회/user/hour에서6147000req/월 및198083400reads/월.
CPU 평균5/10/20ms 민감도에서 $5~$6.86/월 수준, 300ms 지연의 짧은 관측 외삽/추가 timer는13164918req/월·5/10ms $6.67/$7.98 수준이다. 세금·전체 계정 실사용량·storage/writes/logs 등은 미확인. 요청 waiting을 CPU로 계산하지 않는다.
공식 출처와 전체 계산은 PAID_MODEL_20261014_v2.json. Free20×8h의5초 최소115200>100000/day 차단은 그대로이며 Paid 실제 확인 없이 활성화하지 않는다.

## 판정
현재 제품의 검증된 R5 차단은 해결됐다. 정확 소스의 필수 자동/Chrome 검증은 통과했다. 운영 DEPLOYED는 아니다.
미실행: main 병합, Worker 활성화/실제 migration/Pages 배포, 보호 source에 대한 실제 운영 mutation·인증·권한철회·캐시/전환 검증, 최종 freeze-bound 암호화 백업.
남은 외부 관문은 Paid 실제 확인과 구체적 D1 export 승인/복구 증거이며, 신규 writer 전환 차단을 수정·재검증한 뒤 모든 운영 단계를 순서대로 수행한다. 기존 승인 범위에서 해결 가능한 문제는 수정·재검증을 계속한다. 필요한 인간 인증/외부 결제/승인이 없으면 보안 수준을 낮춰 배포하지 않는다.
S1-P 승인 후 공개 정책은 별도 범위이며 이번에 몰래 변경하지 않았다. 이미 전달된 과거 정보·외부 앱 메모리는 원격 회수할 수 없음을 새 응답/지원 클라이언트 보호와 구분한다.
