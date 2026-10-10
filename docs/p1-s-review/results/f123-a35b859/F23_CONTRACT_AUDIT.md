# PR13 F2/F3 독립 계약 감사

판정: **수정 필요**. 대상 a35b8598d55890e705042e4d6f88621357749d09, 이전 2e485079a34fa5aeeef09e82f3b996bf2696d978, main bf74095adb3bf0b13f1aca31193c8d03cf8ff53f. 두 원인은 이전 버전에도 존재하는 미완결 계약이며 새 회귀로 단정하지 않는다.

1. F2: index.html2071은 누락/null/빈 item 생성시각에 root를 대신 쓰고, 2081–2082는 root가 parse 가능하고 item이 존재할 때만 동일성 검사를 한다. 따라서 일반/갯벌/섬 최종 후보는 missing/null/빈 item과 invalid root를 적격으로 인정한다. 실제 loader에서도 root/item10:40·강수1로 추천0인 뒤 root10:50·item 누락/null/빈·강수0가 모두 추천1/raw92/rank108로 돌아왔다. Python validator54은 이 비정상 입력을 거부하므로 frontend와 계약이 다르다. 정상10:55 control은 복구한다.

2. F3: strict parser의 문자열 guard와 기존 weekly 타입 우회는 해결됐다. 하지만 today forecastTime={"toString":"not-callable"}는 storedWeatherState2074의 String(day.forecastTime||'')에서 TypeError를 낸다. candidate와 final을 각각 직접 호출해 확인했다. parser 호출만으로 TypeError0라고 보고할 수 없다. 전체 Chrome 사고 여부는 이 검사 범위에 없다.

F2 60=30pass/30fail은 반복 조건의 수이며 서로 다른 결함30개를 뜻하지 않는다. Python190×20은20/20(정상2수락,비정상18거부). F3 요청 core60=58/60(weekly48/48, today10/12); 추가today root6=1/6; ISO11/11; 총77=70/77, TypeError가 나는 입력1종(candidate와final 각각). null publication과 invalid root 실패는 F2 원인과 겹친다.

실제 live merge6=3/6: 정상/stale/불일치는 기대대로 처리하며, missing/null/빈 item은 저장 적격성이 이미 true라 merged scoreEligible도 true·92점을 유지한다. 원본 저장 item은 불변이다. UI sink와 interpretation capture만 mock이고 merge/freshness/helpers는 원문이다.

actual process_site/build_site_result/main은190 정상 item과 root를1050로같게 생성했다. 1055 배치의 ID14 이전자료 재사용은item1050/stale=true/eligible=false이며 나머지189 적격item은1055다. 두 배치의 today/week actual validators 모두 통과했다. 합성 상류 배열과 합성 wave 좌표0만 사용했으며 실제 운영 malformed 입력이 관측됐다는 주장은 없다.

기존회귀 matrix182/182·특별21/21·팝업12/12, source74/74·helper23/23, 추가80/80·수치92/92·Python92/92·weekly10/10, loader기존28/28 통과. startDate schema진단4는 기존 별도 범위로 유지한다. loader확장10=4/10. Python F3 35/35는 기존 ISO허용집합별도 기대를 포함한다.

최신main 결합은 실제21:19KST validators today190/week10640 통과했고, JS 현재평가의190 item도 root20:13와같고 적격이다. 새 지연유예 B나 다른 배점/정원 정책을 만들지 않았다.

근거: contract_matrix.json, loader_extended_node.json, python_contract.json, historical_contract.json, contract_summary.json. 정확 CLI·workdir·초회 하네스 오류 보존은 execution_manifest.json. 제품/운영/main/D1/사용자데이터/검증브랜치 git 변경0. 원본 좌표 결과저장0.
