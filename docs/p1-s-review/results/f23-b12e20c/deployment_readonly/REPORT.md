# b12 최종 재개: 배포 준비 읽기 진단

제품 검증 대상은 b12e20c1b6d856a021898a0c1c9221b30393a221 그대로다. 로더 자동시험은 재실행하지 않았고 기존 성공/실패 원장을 유지했다. 10/11 main의 새 기상·조석 자료를 과거 고정 제품 시험에 섞지 않았다.

현재 Worker version 및 실제 S1-R 보호를 유지하는 rollback version은 **미확인**이다. 기존 Wrangler OAuth를 값 출력·저장 없이 메모리에서만 사용해 Cloudflare Worker settings/deployments/versions/content의 GET만 시도했다. 공개 birdmap-reports의4GET은401(error10000), 관리자 birdmap-reports-admin의4GET은429(error10429)로 metadata/source를 받지 못했다. 인증 refresh/로그인·권한변경·추가재시도·POST·D1·배포0이다. raw설정/source·토큰은 저장하지 않았다. 과거 phase2e 문서 version ID나 local Wrangler config는 현재 활성/보호유지 rollback 증거로 쓰지 않았다. HTTP 권한/제한 오류 원장은 worker_metadata_readonly.json, 정확 CLI와 script hash는 worker_execution_manifest.json이다. 버전목록이 있었다 해도 S1-R 보호함수 포함 검증 없는 버전을 안전 rollback이라고 부를 수 없다.

GitHub read-only metadata 확인(2026-10-11 06:52:18KST):

- 현재 main은 b596cdc8ede83fe25e64ec10b2dc88d4141673b2, monthly tide bot commit10/11 06:37:17KST다. repository branch GET으로 확인했다.
- 정확 b12 all-event Actions head_sha GET의total_count0이다. PR 전용 CI 성공은 없다. main schedule/Pages 성공과 b12 PR CI를 구분한다.
- main 최신기상 schedule run38079151621은completed/success. 입력head13ea9ecbe367854d62b1e9870ae957dc69b6c1b8, 시작10/11 04:16:36KST, 종료업데이트04:18:24KST. job114292288482의 syntax/build weather_today+week/validate/commit 각step success를 읽었다.
- 월간조석 schedule run38088304953은completed/success. 입력head429067d51438d8736e168f13903ff21bc85d1209, 시작10/11 06:37:00KST, 종료06:37:20KST. job114319346508의 reliability/mapping/targets/build/validate/commit 각step success를 읽었다.
- main b596의Pages run38088325736도success지만 b12가 병합·배포됐다는 뜻은 아니다. b12제품코드와main자료를혼용하지 않는다.
- workflow 파일명 runs URL은 connector allowlist400으로 거부돼 허용된repository actions/runs?branch=main GET으로 대체했다. API 응답에서 선택한metadata/jobs만 github_metadata_readonly.json에 저장했다. dispatch/rerun0이다.

독립 우선순위·단독 승인 판단:

1. b12의 F1/F2/typed 계약 검증 통과와 실운영 준비는 구분한다. 현재 Worker와 보호유지 rollback 증거, 실제 운영설정/보호효과 smoke가 없으므로 **배포준비완료로 표시하지 않는다**. 이 오류가 b12 제품시험 실패라는 의미는 아니다.
2. 삭제 후 oldGET 마커 복귀는 P1 보안PR 우선이다. 기존 source와 실제 재현에서 서버삭제는 유지되지만 클라이언트 철회가 미완결이다. 사용자에게 실제 개인정보·민감위치 철회 완료를 보장하는 전환이면 tombstone/version·inflight 응답·marker/popup/길안내/cache 철회를 먼저 해결해야 한다. 제한된 C 추천 규칙/S1-R 표현검사 검증만으로 삭제를 해결했다고 보고하지 않는다.
3. 보호상태 old응답/길안내 역전은 P1이며 backend재분류·fieldhide·S1-P 보호전환의 선행 차단이다. **S1-R 서버 배포로 과거 공개자료가 새 보호 상태로 재분류되는 경우도 포함**한다. 서버 fresh응답이 제외한다고 이미 도착한old응답의 늦은 재적용까지 막을 수는 없다. b12의 field load는 seq/tombstone/보호version 없이 통째로 덮어쓰고, recent-site load도 성공 시 통째로 덮어쓴다. 실제 전환 영향을 이 작업에서 D1/운영 원자료로 조사하지 않았으므로 영향없음으로 추정하지 않는다. 전환범위가 이런철회를 포함하는지 확인되지 않은 상태에서 무조건배포승인으로넘기지 않는다.
4. b12 S1-R helper는 과거의 종명+수량 표현도 recent-sites 읽기에서 보호 판정에 사용한다. 반면 기존 승인 공개·현장소식의 저장 location_hidden/공개좌표 정책은 별도이며 전면 재분류/철회가 완료됐다는 보장은 아니다. 제한된 표현 방어와 S1-P 전체비공개를 구분한다. 캐시 fix가 필요할 때는 권한/자료버전·삭제·동시/지연응답·fresh복구·actual DOM/서버조회까지 검증해야 하며 단순no-cache만으로 철회가 보장되지 않는다.
5. R5 극단 숫자 문자열은 기존 source/권한범위 그대로인 별도P2다. 실제 비신뢰weather쓰기나 유입을 새로 허용하면 사전필수 검증으로 격상한다. 현 PR에 그러한 입력권한 확대 증거는 없다.
6. 선상 팝업의 대표 일반 기상점수/기존green 출항안내와 최종 안전추천의 다른 시각·6m/s/0.7m/무강수 기준은 **P1 안내품질/안전표시 과제**다. 실제 최종 추천은 unsafe대표 표본을 제외하고 안전한13시 대안을 선택했고, before 동일 의미차이와 source미변경 증거가 있어 이 사실만으로 제한된 C/S1-R 코드검증의 새로운 단독 차단으로 판단하지 않는다. 다만 일반별점/green안내를 출항승인으로 홍보하거나 팝업의 동일시각 안전판정을 배포요건으로 삼는다면 그 요구는 현재 만족하지 않는다. 그 경우 용도·자료시각·문턱 설명 또는 표시정합을 운영승인 전에 보완해야 한다. 실제 출항·민감정보 사고를 관측했다고 주장하지 않는다.

따라서 제한된 b12제품 검증 통과를 유지하면서, 운영 준비미완료와 실제 보호/철회 전환의 P1선행 조건은 별도로 남긴다. 검증자가 무단S1-P 정책이나 배포를 구현하지 않았다. 변경 파일은 이 지정 temp의metadata/script/문서뿐이며 제품/Git/운영main/Worker/D1/실사용자 변경0이다.
