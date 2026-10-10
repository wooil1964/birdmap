# PR13 b12e20c F1/F2 독립 로더 검증

판정: 요청된 F1 및 F2 root/item 혼합 배치 교정 복구는 새 b12에서 통과한다. 사용자가 지정한 exact 순서의 실제 적용은 `[true,false,true]`, 실제 카드 수는 `[0,0,1]`이다. 기존 검증된 동일 발행 충돌 차단은 유지한다. 이는 로더 범위 판정이며 전체 PR 또는 실운영 전환 승인과는 별도다.

정확 대상 `b12e20c1b6d856a021898a0c1c9221b30393a221`, before `a35b8598d55890e705042e4d6f88621357749d09`, main `bf74095adb3bf0b13f1aca31193c8d03cf8ff53f`다. targetB/beforeB archive를 정확 Git blob과 CRLF→LF 정규화 후 대조했다. 기본 시계는2026-10-10 11:00 KST, Chrome 폭은344·375·768·1024·1440px다. 제품 함수·candidate·final·DOM source는 패치하지 않았으며 기존28/6 cases와 loader harness는 그대로 복사했다. 새 verify callback은 loadWeatherToday의 실제 inline source로 실행되고 신규 harness dependency가 없다.

|원장|조건|pass|fail|예외|
|---|---:|---:|---:|---:|
|새 b12 기존 loader Node|28|28|0|0|
|새 b12 기존 loader Chrome5폭|140|140|0|0|
|새 b12 same-root Node 원래6조건|6|6|0|0|
|새 b12 same-root Chrome5폭 원래6조건|30|30|0|0|
|a35 before same-root Node 재실행|6|3|3|0|
|새 exact 적용/카드 부가 assertions(Node+Chrome5폭 관측치)|6|6|0|0|
|a35 exact 동일 부가 assertions(Node+기존Chrome5폭 관측치)|6|0|6|0|

exact_F2_assertions.json은 기존 조건을 바꾸지 않고 실제 제품 실행 JSON에 `[true,false,true]`, `[0,0,1]`, 마지막 root/item10:50 assertions를 추가한다. 새로운6개 exact assertions 원장은 Node1+폭5의 같은 요청 관측치이므로 기존6/30의 독립 추가제품스위트처럼 합산하지 않는다. a35 Chrome는 이전 원장(pr13_f123_loader/target-contractF-dom)의 정확 SHA·input hash와 함께 보존·연결했고, beforeB Node는 다시 실행했다.

사용자 exact F2:1040/1040 rain1→1050/1030 rain0→1050/1050 rain0. 새 b12는 위험1040 추천0, 혼합1050을false로 거부해1040/1040을 유지·추천0, 정상1050/1050을true로 적용·추천1/raw92/rank108이다. a35는 적용true/true/false·카드0/0/0으로 마지막에도item1030이 남았다. 새 verify가 혼합 배치를 정상 비교 기준으로 저장하지 않으므로 이 요청의 실패가 해결됐다.

원래6조건의 역방향 oldroot1030/item1050 거부 뒤1050/1050 정상복구, root1050/item1055 불일치 뒤 같은1050 교정, 최초 혼합 배치를 참고용으로 받았다가 같은1050 교정, 이미 검증된1050/1050 rain1의 같은 발행 rain0 충돌 차단, 다음1055/1055 복구 모두 actual Node·Chrome5폭에서 통과했다. 최초 혼합은applytrue/추천0로 보존되지만 verify(current)=false라 교정본의 비교 기준을 선점하지 않는다. 기존28의 F1 미래first·정상→미래→정상, unsafe1040→old1030, same/missing/bad publication, request seq, 자정, today/week 독립도 전부 통과했다.

새 verify callback 추가 계약 검토는 별도 target-verify 원장이다. Node7과Chrome375의7 모두4pass/3fail·예외0이며, 이 중 필수 안전·복구 관문4조건은4/4다.

- 정상1040 추천1→일관된1050 rain1 적용true/추천0→1055 정상 적용true/추천1. 새 callback이 최신 검증된 위험 자료를 버리지 않는다.
- 정상1040 추천1→불일치1050 거부false/추천1→같은1050의 일관된 rain1 교정 적용true/추천0. 거부한 혼합이 위험 교정을 막지 않는다.
- 만조와 forecast15:30을 고정한1040 배치의 추천1이 실제14:17 작업시각+30분 이후14:48에0으로 만료된다. 불일치1440/1435는false·0, 정상1440/1440은true·1로 복구한다. B 지연 예외는 없다.
- 일관된root의 명시적 scoreEligible=false 배치를 같은 발행true로 바꾸는 충돌은false·0으로 보존된다.

나머지3fail은 generatedAt은 일관되지만 첫 item의 forecastTime이 배열, date가 배열, scoreEligible이문자열인 일반 malformed 자료를 같은root1050에서 정상 교정하는 별도 가용성 진단이다. 각각 추천0→0·적용true/false이며 금지된 자료가 추천되거나 예외가 발생하지 않았다. callback은 발행 일관성만 검사하므로 이런 자료는 root 비교 기준이 될 수 있다. 이번 요청의 root/item 불일치 교정과 일반 동일 발행 내용 변경을 구분한다. 이 가용성 기대 실패만으로 새 안전 배포 차단을 선언하지 않고, 독립 후속 가용성/검증버전 정의 과제로 남긴다. 이3건을 신규 안전 통과에 합산하지 않았다.

최초 추가 만료fixture는12:30을 마감으로 가정해7조건3pass/4fail이었다. 그러나 실제 weatherLatestDue는12:30에도10:17이며1040 배치는현행이다. 기존28의12:30 카드0은만조12:00이과거가된 결과로, 실제기상배치만료의 증거로 해석할 수 없다. 추가fixture에서 만조를13:00으로 바꾸자 현행1040 카드1로 돌아왔으므로 해당 추가assert1실패는 부정확한 fixture 기대였다. 최초 Node/Chrome JSON·CLI·exit1·stdout·script hash는 target-verify-*-initial와 verify_cases_initial.mjs에 보존했다. 원래28은 변경하지 않았다. 이를14:48·미래만조15:30고정으로 고쳐 실제 정책 기간 만료를 분리해 확인했다.

새 b12와 a35 사이 R5 변환·필수값 검사와 field load/find/delete/marker/길안내15개 함수, reports-api6개 source 및 weather builder1개 파일은 정확 source hash가 같다. source_proof.json에 저장했다. 새 loader가 현장소식 oldGET 요청 순서나 삭제 tombstone, 보호 상태를 처리한다고 주장하지 않는다.

R5 극단숫자문자열은 별도P2를 유지한다. 기존 owner delete 후 oldGET UI/marker 복귀는 별도P1 보안PR 우선이며, 보호상태 old응답·길안내 복귀는 P1 및 backend재분류/fieldhide/S1-P 전환 전 필수 차단을 유지한다. 실제 민감정보 사고나 비신뢰weather쓰기 유입은 검사·관측하지 않았다.

S1-R의 실제 운영 전환에는 공개Worker의 서버표현 방어를 먼저 반영하고 최근제보/현장소식/history의 읽기전용 smoke 및 보호를 유지하는 rollback version을 확인해야 한다. 새 frontend 검증만으로 서버보호 배포를 대체할 수 없다. 현재 Worker version·rollback 준비·실제배포스모크는 이 담당 범위에서 확인하지 않았으므로 완료라고 표시하지 않는다. 전환이 기존 공개자료 철회·보호 상태 재분류·fieldhide를 포함한다면 old응답/marker/popup/길안내/cache 철회 보장을 운영 전환 전에 해결해야 한다. 일반 삭제 철회가 그 전환의 필수 요구라면 owner-delete oldGET race도 선행 차단이다. 제한된 S1-R 표현검사/S2 추천 규칙 보완만으로 S1-P 전면비공개나 개인정보철회가 완료됐다고 보고하지 않는다.

실제 Chrome·renderTodayPanel·Leaflet 엔진을 사용하고 외부 API는 탐색 전에 합성응답으로 격리했다. 이 loader harness는 카드 DOM을 검증하며 Leaflet 팝업 내용은 별도assertion하지 않았다. Node DOM visibility/redraw counter는 대역이다. 제품·Git·운영main·Worker·D1·실사용자 변경0. 모든 새 산출물은 pr13_f23_b12_loader에만 저장했다. 실행명령·cwd·args·SHA·stdout/stderr hashes·exit code는 각 execution_manifest 및 exact_F2_execution_manifest에 있다. 전체자동회귀·F3·validator parity·main결합은 다른 담당 원장과 별도다.
