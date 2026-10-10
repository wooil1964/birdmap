# PR13 a35b859 F1/F2 독립 로더 검증

판정: 기존 F1과 F2의 안전 역전은 보완됐으나, 사용자가 요청한 F2 동일 root 1050 교정 복구는 미충족이다. 기존 28/140 전부 통과만으로 이 추가 필수 경계를 성공으로 보고할 수 없다. 아래는 합성 계약 자료이며 실제 기상이나 운영 사고를 관측했다는 의미가 아니다.

대상 head `a35b8598d55890e705042e4d6f88621357749d09`, 이전 `2e485079a34fa5aeeef09e82f3b996bf2696d978`, 읽기 기준 main `bf74095adb3bf0b13f1aca31193c8d03cf8ff53f`. 평가 시각은 `2026-10-10 11:00 KST`다. 정확 Git archive의 index를 CRLF→LF만 정규화해 해당 Git blob과 대조했다. review branch의 역사적 index는 제품 시험에 쓰지 않았다.

|검증|조건|pass|fail|예외|
|---|---:|---:|---:|---:|
|새 head 기존 Node 성공 기대|28|28|0|0|
|새 head 기존 Chrome 5폭 성공 기대|140|140|0|0|
|이전 head 기존 Node 같은 기대|28|23|5|0|
|새 head 추가 contractF2 Node|6|3|3|0|
|새 head 추가 contractF2 Chrome 5폭|30|15|15|0|
|이전 head 추가 contractF2 Node|6|2|4|0|
|이전 head 추가 contractF2 Chrome 375|6|2|4|0|

Chrome 폭은 344·375·768·1024·1440px다. 실제 제품 loader·후보·최종 추천 함수, 실제 renderTodayPanel 카드 DOM을 호출했고 실제 Leaflet 로딩을 확인했다. 이 loader harness에서는 Leaflet 팝업 내용은 따로 assertion하지 않았다. fetch fixture와 시계만 메모리로 주입했다. Node의 DOM 가시성 및 redraw counter는 대역이며 actual DOM 결과와 구분했다. 기존 final_cases/loader_final_node/loader_final_dom은 바이트 동일 복사본이다. 추가 경계에서는 import만 별도 contractF_cases로 바꿨고, 제품 함수·candidate·final·DOM source를 패치하지 않았다. source_proof.json과 각 execution_manifest.json에 script·source hashes, CLI, workdir, stdout/stderr hash, exit code를 저장했다.

F1: today/week 모두 미래 12:30 first는 추천0이고 정상10:50은 적용·추천1로 복구한다. 정상10:40→미래12:30에서는 미래를 거부해 현행 추천1을 보존하고10:50을 적용한다. 위험10:40→옛정상10:30은0→0, 동일 발행 충돌·발행누락/무효·request seq·자정·today/week 독립·현행 적격기간 만료도 기존 기대대로 통과했다. 12:30 만료에서는0이고 B 지연 예외를 추가하지 않았다. raw92/rank108 구분도 유지한다. 이전 Node에서 F1 네 시나리오 실패와 F2 한 시나리오 실패를 같은 기대대로 재현했다.

F2: root/item10:40·rain1에서0, root10:50/item10:30·rain0도0으로 제외하므로 옛 적격 item의 추천 안전 역전은 차단한다. 기존28의 control인 일관된10:55/10:55는 적용·추천1로 복구한다.

사용자 필수 exact 경계인 `1040/1040 rain1 → 1050/1030 rain0 → 1050/1050 rain0`는 새 Node와 Chrome 모든 폭에서 적용 결과 `[true,true,false]`, 카드 `[0,0,0]`이다. 마지막에도 저장 item.generatedAt은10:30이다. 비교용 이전 head는 적용 결과 역시 `[true,true,false]`, 카드 `[0,1,1]`이다. 새 guard가 부적격 혼합 배치의 점수를 차단한 것은 개선이지만, 같은1050에서 정상 교정 자료로 복구하지 못한다. 두 버전의 마지막 실제 자료는 교정본이 아니라 혼합 item이다.

추가 세 실패 시나리오는 exact older-item 혼합 후 동일 root 교정, root1050/item1055 혼합 후 동일 root 교정, 최초 root1050/item1030 혼합 후 동일 root 교정이다. 각각 새 Chrome5폭에서 실패했다. oldroot1030/newitem1050을 뒤늦게 받은 역방향은 거부되고 일관된1050/1050은 정상 복구한다. 이미 검증된1050/1050·rain1을 같은발행rain0으로 바꾸려는 충돌은 여전히 거부·0을 유지한다. 일관된 다음 root1055 복구도 새 head에서 통과한다. 이전 head 추가 control의 시나리오 실패에는 preceding 혼합 배치의 추천1이 포함되어 있으며, 그 마지막1055 실제 복구 stage 자체는 적용true·추천1이었다. 이를 복구 단계 실패로 오산하지 않는다.

원인은 새 storedWeatherState가 일관성을 검증해 점수 적격false로 만들지만 loadWeatherToday는 혼합 root를 저장하고, loadBirdmapData의 stamp 동일 검사와 root-only birdmapDataTime 비교가 그 root를 이후 비교 기준으로 사용하는 데 있다. 새 head source_proof의 line은 storedWeatherState2066, birdmapDataStamp4538, birdmapDataTime4545, loadBirdmapData4549, loadWeatherToday4572이다. 같은 발행 충돌의 보수 처리를 안전 우회라고 부르지 않는다. 보완 요청은 검증되지 않은 root/item 혼합 자료와 이미 검증된 동일 발행 충돌을 구분해서 요청된 같은root 정상 교정을 적용하는 것이다. known unsafe의 older/same 발행 차단, request seq, 기간 만료, 정상1055 복구는 유지해야 한다.

새 head와 이전 head 사이 R5 관련 점수·필수값 검사/풍속·강수·파고 변환 및 현장소식 load·find·delete·marker·길안내 등15개 함수와 reports-api6개 source+weather builder1개 파일은 source hash가 동일하다. 새 head는 입력·공개 권한을 확장하지 않았다. 이번 로더 시험이 아래 기존 잔여 문제를 해결했다고 보고하지 않는다.

- R5 극단 숫자 문자열은 별도P2를 유지한다. 실제 비신뢰weather쓰기/유입이나 사고 증거는 이 검증에서 없다. 실제 유입·쓰기 권한을 도입하면 사전필수 검증으로 격상해야 한다.
- owner delete 뒤 늦은oldGET의 UI/marker 복귀는 별도P1 보안PR 우선이다. 기존 actual API 재현의 서버삭제는 유지됐고, 이 검증에서는 재실행하지 않은 기존 재현을 source 동일성으로 연결했다. 실제 개인정보·민감위치 철회가 해당 전환의 요구라면 철회 보장 전 배포 차단이다.
- 보호상태 old응답·길안내 복귀는 별도P1이며 backend재분류/fieldhide/S1-P 전환 전 필수 차단을 유지한다. 기존 새hidden→oldvisible race source가 그대로다. 실제 운영 상태 변화나 사고를 조사하지 않았다.

제품 코드·운영main·Worker·D1·실사용자·Git branch는 수정하지 않았다. 모든 산출물은 지정된 visual temp의 pr13_f123_loader에만 썼다. 초기 기본 shell/node_repl은 sandbox setup refresh 오류로 실행 전에 실패했고, 정식 require_escalated read-only/격리검증 호출로 실행했다. 자동 승인 거부는 없었다. 최신 main 결합·전체 자동 회귀·F3·validator parity는 다른 담당 검증과 별도다.
