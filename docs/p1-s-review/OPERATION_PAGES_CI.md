# PR13 운영 승인 준비 — Pages 기준과 CI 대체 증빙

작성 범위: 읽기 전용 Pages/GitHub 메타데이터와 기존 독립 검증 원장 대조. 기준 PR head는 b12e20c1b6d856a021898a0c1c9221b30393a221이다. 이 확인에서 제품 테스트를 다시 실행하거나 main 병합·Pages/Worker 배포·rollback·workflow dispatch·D1·실사용자 데이터를 변경하지 않았다. 인증 없이 공개 GET만 사용했으며 secret·Auth 설정·원문 HTML/좌표를 저장하지 않았다. 아래 시각은 2026-10-11 KST다.

## 1. 현재 Pages 배포 SHA 확인

**현재 Pages 기준 SHA를 89e7e339812fbd9c096008cb5631c88fd8765c03으로 확인했다.** GitHub 배포의 성공 상태뿐 아니라 실제 Pages index.html 및 notices.json 응답을 exact SHA의 raw 파일과 LF 정규화 SHA256으로 대조했다.

|대상|읽은 근거|결과 및 읽기 시각|
|---|---|---|
|remote main|[branch GET](https://api.github.com/repos/wooil1964/birdmap/branches/main)|89e7e339812fbd9c096008cb5631c88fd8765c03; tree 6bf06209efa7fdf9216752e0845a3ec1ea9e58e1; 07:27:20|
|최신 Pages deployment|[deployments GET](https://api.github.com/repos/wooil1964/birdmap/deployments?environment=github-pages&per_page=5)|deployment 6987391011; ref main; SHA 89e7e339812fbd9c096008cb5631c88fd8765c03; 07:27:44.252|
|배포 성공 상태|[deployment statuses GET](https://api.github.com/repos/wooil1964/birdmap/deployments/6987391011/statuses)|status 19580447278 success; 성공 시각 06:53:13; 07:28:02.761 읽기|
|Pages 빌드·배포|[Actions run 38089286718](https://github.com/wooil1964/birdmap/actions/runs/38089286718)|06:52:33–06:53:13 completed/success; build·report-build-status·deploy 각 job와 모든 step success|
|서비스 URL|[현재 Pages](https://wooil1964.github.io/birdmap/)|deployment 환경 URL과 일치; GET 200; 07:29:07.387|
|직전 Pages 배포|[deployment 6987232564 statuses GET](https://api.github.com/repos/wooil1964/birdmap/deployments/6987232564/statuses)|b596cdc8ede83fe25e64ec10b2dc88d4141673b2; status 19580073086 success; 성공 06:38:06; 07:28:03.022 읽기|

Pages 성공은 Pages 빌드·배포 성공의 증거다. 추천 계약·보호 서버 배포·b12 PR 전용 CI 통과를 대신하지 않는다.

GitHub connector의 pages/builds/deployments 직접 경로는 allowlist에 없어 HTTP 400으로 거부됐다. 이어 인증 없는 공개 GitHub GET을 사용했다. pages와 pages/builds/latest는 각각 404였으나 deployments 및 위 두 statuses 경로는 200이었다. 404를 Pages 미배포로 해석하지 않았으며 성공 deployment와 실제 서비스 응답으로 현재 기준을 확인했다. gh 명령은 설치되어 있지 않아 사용하지 않았다.

### 실제 서비스와 exact SHA 해시

원문은 출력·저장하지 않고 UTF-8 텍스트의 CRLF만 LF로 정규화하여 SHA256을 계산했다. 저장 내용·좌표를 수정하지 않았다.

|파일·대조|LF SHA256|GET 시각|
|---|---|---|
|Pages 루트 index와 [89e7e339 exact index](https://raw.githubusercontent.com/wooil1964/birdmap/89e7e339812fbd9c096008cb5631c88fd8765c03/index.html)|d937ae11f4f5f6b7ccd70d060c909c567948f18733582b4f1afbb0bd6d5bfa53|07:29:07.387 / 07:29:07.803|
|[b596cdc8 exact index](https://raw.githubusercontent.com/wooil1964/birdmap/b596cdc8ede83fe25e64ec10b2dc88d4141673b2/index.html)|동일: d937ae11f4f5f6b7ccd70d060c909c567948f18733582b4f1afbb0bd6d5bfa53|07:29:08.462|
|[Pages notices](https://wooil1964.github.io/birdmap/notices.json)와 [89e7e339 exact notices](https://raw.githubusercontent.com/wooil1964/birdmap/89e7e339812fbd9c096008cb5631c88fd8765c03/notices.json)|b91d7e9b35da9d38e78cd1f0fe36a98187fb4ac620662be58ce5cc8d5b44caba|07:29:08.681 / 07:29:08.906|

현재 HTML과 공지는 배포 메타데이터의 exact 89e7e339와 일치한다. index 자체는 직전 b596과 동일하므로 HTML 해시만으로 두 커밋을 구분하지 않았다. 공지와 deployment SHA를 함께 사용했다. Pages 응답 Last-Modified는 2026-10-11 06:53:07 KST다. 이 결과는 조회 시점의 확인이며 모든 CDN edge나 미래 예약 갱신을 보증하지 않는다.

## 2. 최신 main 변경과 기존 합성 검증 범위

[89e7e339 commit GET](https://api.github.com/repos/wooil1964/birdmap/commits/89e7e339812fbd9c096008cb5631c88fd8765c03)을 읽었다. parent는 b596cdc8ede83fe25e64ec10b2dc88d4141673b2이며 변경 파일은 notices.json 한 개, 추가 24줄·삭제 0줄이다. index·기상/조석 5자동 JSON·서버 코드가 이 커밋에서 변경됐다는 근거는 없다.

기존 최종 원장은 이미 89e7e339까지 결합했다. 이 분석에서 재실행한 것으로 수치를 올리지 않는다.

|증빙|정확 범위|
|---|---|
|[execution_manifest](results/f23-b12e20c/execution_manifest.json) / [test_summary](results/f23-b12e20c/test_summary.json)|exact b12 archive, 이전 a35, 당시 main bf74095 및 임시 tree1065b16f; 자동 8suite 621 pass / 0 fail / 1 skip|
|[independent_replay](results/f23-b12e20c/independent_replay.json)|2026-10-08 22:40 KST의 고정 입력; 190곳·176후보, 제보 ON/OFF 전체 signature·top10 보존. 현재 실시간 입력에서도 항상176이라고 확대하지 않음|
|[main source_manifest](results/f23-b12e20c/finalmain/source_manifest.json) / [main_delta_impact](results/f23-b12e20c/finalmain/main_delta_impact.json)|main b596, 합성 tree2c3703e7234f9f0ab02786f03d03a2314bf5cfcf; 추천·loader·live·parser137 동일, siteData/좌표190 동일, main navigation12 보존, 자동5 JSON main blob 동일|
|[최종 notices summary](results/f23-b12e20c/finalmain/final_notice/current_summary.json)|main89e7e339, 합성 treee02191c1ca4cc00e0faedab2ffd4e10b14c537e2; notices main blob 보존; 직전 대비 공지 외 제품8·자동5 불변; 137/site190 비교 재사용|
|[최종 Chrome manifest](results/f23-b12e20c/finaldom/final89_execution_manifest.json)|exact e02191c1의 Chrome 5폭 E2E 55/55·예외0; 직전 빈목록/복구10·scoped navigation20은 소스 불변에 근거한 재사용이며 신규 성공에 합산하지 않음|

제품 파일 head 동일성은 7/8이다. index는 main의 TMAP/navigation 변경을 함께 보존하므로 strict 8/8 assertion 실패를 원장에 유지했다. 자동621은 exact b12 결과이며 최종 합성 tree 전체의621 재실행 결과라고 부르지 않는다. 최신 main 영향 unit71/73의 field2 실패도 exact main에 있는 기대 문구·chooser 차이로 별도 보존했다. 보고서 [F23_RECHECK](F23_RECHECK.md)의 한계와 원형 실패 원장을 그대로 적용한다.

현재 candidate/score 적격 판정은 기존07:00 KST 캡처 결과다. 위07:29 Pages 해시 GET은 기상 점수 재평가나 새 브라우저 검증이 아니다.

## 3. PR 전용 CI와 exact SHA 로컬 증빙 대체

07:27:20 KST [PR GET](https://api.github.com/repos/wooil1964/birdmap/pulls/13)에서 PR13은 draft/open·merged=false, head b12e20c1b6d856a021898a0c1c9221b30393a221로 확인했다. PR 응답 base.sha는38b45299c832b8ab8ad549762c02979fa8ddfb28이므로 이를 현재 remote main 또는 검증 합성 tree로 대신 쓰지 않았다.

다음 exact head 조회 결과는 각각0이다.

- [Actions all-event head_sha GET](https://api.github.com/repos/wooil1964/birdmap/actions/runs?head_sha=b12e20c1b6d856a021898a0c1c9221b30393a221&per_page=10): total_count0, 07:27:20.
- [combined commit status GET](https://api.github.com/repos/wooil1964/birdmap/commits/b12e20c1b6d856a021898a0c1c9221b30393a221/status): total_count0/statuses 빈 배열; state pending은 상태 항목이 없는 응답이며 실행 중인 PR CI의 증거가 아니다, UTC 2026-10-10 22:31:36–22:31:36 UTC 재조회.
- [commit check-runs GET](https://api.github.com/repos/wooil1964/birdmap/commits/b12e20c1b6d856a021898a0c1c9221b30393a221/check-runs): total_count0/check_runs 빈 배열, UTC 2026-10-10 22:31:36–22:31:36 UTC 재조회.

exact b12의4 workflow 원문을 git show로 읽었다. build-share-pages는 workflow_dispatch, weather와 daily tide는 main path-filter push/schedule/workflow_dispatch, monthly tide는 schedule/workflow_dispatch다. pull_request 전용 검증 트리거는 없다. 현재 main의 weather/tide schedule와 Pages 성공을 b12 CI 성공으로 옮겨 적지 않는다. workflow dispatch/rerun은 수행하지 않았다.

**대체 경로:** 운영 승인자가 CI 부재를 알고 위 exact b12 로컬 원장과 최신 합성 tree 증빙을 명시적으로 채택해야 한다. 이 문서는 그 채택이 이미 이뤄졌다고 주장하지 않는다. 검증 코드를 CI로 새 작성하거나 운영 갱신 workflow를 수동 실행하는 것은 이번 읽기 확인에 포함하지 않았다.

재사용 조건은 다음과 같다.

1. 승인할 PR head가 exact b12로 유지되고, 제출 코드·테스트·불변 fixture와 원장 해시가 일치한다. 다른 head에621/176/F2 통과를 전용하지 않는다.
2. 실제 병합 대상 main이89e7e339라면 최종 검증된 합성 treee02191c1과 병합 산출물의 tree 및 포함 파일을 대조한다. 임시 tree는 실제 main 병합·Pages 배포 commit이 아니다.
3. main이 다시 진행하면 실제 diff를 분류한다. 추천/loader/보호/validator/좌표/정책/테스트가 바뀌면 해당 결과를 재검증한다. 자동 JSON 갱신이면 최신 canonical 자료·현재 시간·validator/적격성·비정상 제외와 정상 복구를 확인한다. 공지 변경도 렌더·공지 영향·적격성 대조가 필요하며 미래 변경을 미리 통과시킬 수 없다.
4. 최종 Pages 성공·생성기 정상 배치는 승인 후 관찰할 별도 사실이다. 고정10/8 입력 결과, 현재 저장 today 참고상태, 정상week 대안 결과를 섞지 않는다.
5. 위 local 증빙 채택은 Worker 실제 보호·rollback·운영 재분류 영향 및 필요한 cache 선행 조치의 확인을 대체하지 않는다.

### 기존 증빙 파일 SHA256

|파일 (results/f23-b12e20c 아래)|SHA256|
|---|---|
|test_summary.json|77cb97d4357766abe9ee8820bdbf0a82501823118d9ad71e7288269b42ebd34a|
|execution_manifest.json|483bebf887806bd689f668737b465509c797c0e106b9485f66db631e2b418f2e|
|independent_replay.json|3f8ab25dc0dc7a3fd58d1dffa15d34261f4de32c988167c9f8af351898b19c33|
|finalmain/source_manifest.json|a97b54ea62ca8c93954df4a4b5f9e7f8c93aca98675aa882bf9a36fdac3f2e0b|
|finalmain/main_delta_impact.json|596917a8b22ec3413b582fa46a7b1b2dd915b07f3254646a16f3e3fb512dd900|
|finalmain/final_notice/current_summary.json|ac65603d4cb4105ff825afc7eaf6c07cab281153293f68f69e3dc90d9b4faaec|
|finaldom/final89_execution_manifest.json|19b42ccf9a4bcea3106cecb12c65309b03d8f646da6da67f742c77fb9725a4e4|

## 4. Pages rollback 후보와 서버 S1R 유지 조건

**정확 Pages 복귀 기준 후보는 현재 배포된89e7e339812fbd9c096008cb5631c88fd8765c03이다.** 직전b596도 성공 배포 이력이 있고 index가 동일하지만 최신 공지를 잃는 차이가 있으므로 현재 정상 기준89를 우선 식별한다. SHA와 현재 서비스 일치는 확인됐으며 rollback 실행 리허설은 하지 않았다.

이 SHA는 **새 b12의 모든 안전 관문을 유지하는 무조건 안전 rollback**으로 승인할 수 없다. PR은 아직 미배포이고89에는 새 b12 C/F2/F3 프런트 guard가 없다. 운영 문제가 생겨 현재 Pages로 복귀하면 추천 적격/발행 복구 방어도 이전 상태로 돌아간다. 따라서89는 기능 복귀 기준이며, 새 추천 안전 계약을 그대로 유지하는 별도 rollback 산출물의 검증이 필요하면 그 SHA는 아직 미확정이다.

Pages 복귀와 reports Worker 복귀를 분리해야 한다. S1R 선배포 후에는 실제 source에서 b12 보호 함수와 공개 집계/입력 경로가 검증된 Worker 버전을 Pages rollback 중에도 유지해야 한다. 기존07:23 metadata의 현재 Worker494b97d1-69ab-40f7-bbbf-e8c6e3c5effc 또는 직전16dae92a-4bd7-4fda-ba90-d5075604d4db의 존재·같은 binding만으로 새 S1R 보호 유지 여부를 입증하지 못한다. 실제 source/영향 확인은 별도 운영 Worker 검증과 함께 확정한다.

Pages만 복귀한다고 Worker를 이전 버전으로 자동 되돌리지 않는다. main 전체 reset/revert를 통해 서버 소스·validator·자동 자료까지 함께 되돌리는 계획도 이 후보의 근거에 포함하지 않는다. 프런트 복귀 산출물·자동자료 보존·기상 validator 유지 범위를 승인 시 명시해야 한다. 이미 재분류/철회된 공개 정보와 늦은 GET·cache 경합은 Pages 복귀로 해결되지 않으며 보호 전환에 필요한 기존P1 cache 조치는 계속 적용해야 한다.

**현재 판정:** Pages 현재 SHA와 정확 복귀 기준은 확인됐다. b12 local 증빙은 위 조건으로 CI 대체 채택을 검토할 수 있다. 서버 S1R 보호를 유지하는 실제 rollback 버전·전환 영향·모든 새 프런트 안전 계약을 유지하는 rollback 준비까지 완료됐다는 판정은 이 문서에서 하지 않는다.

마지막 원격 main 재조회: 2026-10-10 22:31:36–22:31:36 UTC; SHA 89e7e339812fbd9c096008cb5631c88fd8765c03. 현재 기준과 동일하며 status/check-runs 재조회 모두0이다.


## 5. 후속 관측 — 2026-10-11 22:43 KST 재개

앞선 1~4절은 07:31까지의 관측 원장이다. 원문을 변경하지 않고 이 절을 추가했다. 추가 직전 원문 SHA256은 5a62be0e66b91bf25ee687802b45a99ab0f043096cd19233b2a13c7d29b0518f였다. 이후 현재 Pages 복귀 기준은 아래43bff433 관측을 사용한다. 이 관측에서 새 제품 테스트를 실행하지 않았으며621/176/137 수치를 새 실행 결과로 바꾸거나623 등으로 늘리지 않았다.

### 현재 head·Pages 배포·CI

|항목|결과|공개 GET 읽기 시각 KST|
|---|---|---|
|[remote main](https://api.github.com/repos/wooil1964/birdmap/branches/main)|43bff43301d5915a344bf2c20987698597cf8870; tree841a9fcbeaeba4b3c3cd9ffbf979eda5c9f2e0cb; commit20:32:53|22:44:53.677, 마지막22:47:12.068|
|[PR13](https://api.github.com/repos/wooil1964/birdmap/pulls/13)|head b12e20c1b6d856a021898a0c1c9221b30393a221 유지; draft/open; merged=false|22:44:54.071|
|[b12 all-event Actions](https://api.github.com/repos/wooil1964/birdmap/actions/runs?head_sha=b12e20c1b6d856a021898a0c1c9221b30393a221&per_page=10)|total_count0/runs 빈 배열|22:44:54.355|
|[b12 combined status](https://api.github.com/repos/wooil1964/birdmap/commits/b12e20c1b6d856a021898a0c1c9221b30393a221/status)|total_count0/statuses 빈 배열; state pending을 실행 중 CI로 해석하지 않음|22:44:54.634|
|[b12 check-runs](https://api.github.com/repos/wooil1964/birdmap/commits/b12e20c1b6d856a021898a0c1c9221b30393a221/check-runs)|total_count0/checks 빈 배열|22:44:54.917|
|[최신 Pages deployments](https://api.github.com/repos/wooil1964/birdmap/deployments?environment=github-pages&per_page=5)|deployment6994918694, ref main, SHA43bff43301d5915a344bf2c20987698597cf8870|22:44:55.692; [per_page=1 마지막 GET](https://api.github.com/repos/wooil1964/birdmap/deployments?environment=github-pages&per_page=1)22:47:12.343에도 동일|
|[현재 Pages status](https://api.github.com/repos/wooil1964/birdmap/deployments/6994918694/statuses)|19598183495 success, 성공20:33:42; 환경 URL https://wooil1964.github.io/birdmap/|22:45:40.434|
|[현재 Pages Actions38135965715](https://github.com/wooil1964/birdmap/actions/runs/38135965715)|dynamic/completed/success,20:32:56–20:33:41; [jobs GET](https://api.github.com/repos/wooil1964/birdmap/actions/runs/38135965715/jobs)에서 build114459775419/deploy114459861694/report114459861732 및 모든 step success|main runs22:44:55.419; jobs22:45:41.848|
|[직전 Pages status](https://api.github.com/repos/wooil1964/birdmap/deployments/6992430506/statuses)|SHA46e3391f656adc2171ec712924022b46ce8ec78d; deployment6992430506/status19592380406 success,16:25:46|22:45:40.699|

위 API는 모두 인증 없는 공개 HTTP GET 200으로 확인했다. 최신 main의 weather schedule [38135551642](https://github.com/wooil1964/birdmap/actions/runs/38135551642)도20:26:16–20:32:57 success이지만 입력 head는46e3391f이며 그 실행 후 결과 commit43bff433이 발행됐다. 이 bot 성공이나 Pages 성공을 b12 CI 성공으로 바꾸지 않는다.

### 89e7e339 이후 파일 범위

[compare GET](https://api.github.com/repos/wooil1964/birdmap/compare/89e7e339812fbd9c096008cb5631c88fd8765c03...43bff43301d5915a344bf2c20987698597cf8870)을22:45:41.225에 읽었다. main은 ahead3/behind0이다. 세 commit은89c2bc8742345dfe1dd674a2ce8c60deed5dc054,46e3391f656adc2171ec712924022b46ce8ec78d,43bff43301d5915a344bf2c20987698597cf8870이며 메시지는 모두 chore: update birding weather다.

|분류|89e7e339→43bff433의 net 변경|
|---|---|
|자동 JSON|weather_today.json·weather_week.json 두 파일 modified|
|공지|notices.json 변경0|
|제품·테스트·설정|index·서버·validator·workflow·test 변경0|
|조석 자동자료|tide_today/month/health 변경0|

현재 today blob은98d378443376e35f1024d203d4ccabce956798a6, week blob은738f4fd49b756c1abd6f89e8d20ce58600f3cfc7이다. diff 본문·좌표는 출력하거나 저장하지 않았다. Git fetch와 임시 merge-tree 작성은 이 Pages 담당 범위에서 수행하지 않았다.

### 실제 Pages와 raw exact43 SHA 해시 연결

아래 서비스 URL과 raw exact43 파일을 GET하여 원문을 출력·저장하지 않고 UTF-8/CRLF→LF SHA256만 계산했다. 모두200이고 각 쌍의 해시가 일치했다. Pages Last-Modified는2026-10-11 20:33:35 KST다.

|파일|현재 Pages/raw43 LF SHA256|Pages/raw 읽기 KST|
|---|---|---|
|[index](https://wooil1964.github.io/birdmap/) / [raw43 index](https://raw.githubusercontent.com/wooil1964/birdmap/43bff43301d5915a344bf2c20987698597cf8870/index.html)|d937ae11f4f5f6b7ccd70d060c909c567948f18733582b4f1afbb0bd6d5bfa53|22:46:30.615 / 22:46:31.010|
|[notices](https://wooil1964.github.io/birdmap/notices.json) / [raw43 notices](https://raw.githubusercontent.com/wooil1964/birdmap/43bff43301d5915a344bf2c20987698597cf8870/notices.json)|b91d7e9b35da9d38e78cd1f0fe36a98187fb4ac620662be58ce5cc8d5b44caba|22:46:31.232 / 22:46:31.477|
|[today](https://wooil1964.github.io/birdmap/weather_today.json) / [raw43 today](https://raw.githubusercontent.com/wooil1964/birdmap/43bff43301d5915a344bf2c20987698597cf8870/weather_today.json)|8fab7c41761713a689269e49546138daa56b661d521841adc9c3f7a0c8d4e3c7|22:46:31.498 / 22:46:31.743|
|[week](https://wooil1964.github.io/birdmap/weather_week.json) / [raw43 week](https://raw.githubusercontent.com/wooil1964/birdmap/43bff43301d5915a344bf2c20987698597cf8870/weather_week.json)|ad9d8398ac1b1bcd4f6e91e2c54058888ec3976e83872cee9b8ef4591a394e36|22:46:31.836 / 22:46:32.403|

index와 notices는 오전89 기준과 해시가 같다. 따라서 index만으로 새commit을 구별하지 않았으며, 최신deployment43 SHA와 변경된 today/week의 exact43 응답 일치를 함께 확인했다. 읽기 시점의 공개 Pages 확인이며 모든 edge나 미래 자동 갱신을 보증하지 않는다.

### 기존 증빙 재사용과 현재 복귀 기준

현재 배포된 Pages 복귀 기준 후보를 **43bff43301d5915a344bf2c20987698597cf8870**으로 갱신한다. 오전89는 이력으로 보존한다.43은 현재 배포 메타데이터와 실제 서비스 index·공지·기상2파일 해시가 연결된 기능 복귀 기준이다. 새 b12 C/F2/F3 guard를 유지하는 무조건 안전 rollback이라는 뜻은 아니다. 앞선4절의 한계와 Pages 복귀 동안 실제 보호가 확인된 서버 S1R 버전을 유지해야 하는 조건은 그대로다. 본 확인에서 Worker 버전·실제 보호 함수·운영 영향 조건을 다시 판정하지 않았다.

exact PR head는b12로 유지되고89→43의 제품 변경은0이므로 기존 exact b12의621 자동·고정190/176·F2/F3 시험 증빙은 해당 코드와 불변 입력의 근거로 보존할 수 있다. 그러나 새 운영 기상2JSON을 쓴 최종 결합 tree의 전체 검증 결과로 확장하지 않는다. 최신 main과 PR의 결합은 새로운 tree를 고정하고 제품 함수/좌표/자동5blob 보존을 읽기 비교해야 하며, 새 기상자료는 exact 현재 validator·canonical 출처·현재 시각의 적격/제외·정상 복구를 재확인해야 한다. 오전07:00의 current/reference/top10이나 고정10/8의176을22:46 현재 데이터 평가 결과로 옮겨 적지 않는다. 해당 결합·현재자료 검증은 별도 담당 증빙과 연결한다.

b12 PR CI는 여전히0이고 운영 승인자의 명시적인 local 증빙 채택 조건은 미완료 상태로 유지한다. 이 후속 관측이 새 CI·제품 회귀·운영 배포 승인 완료의 증거는 아니다. 읽기 명령은 공개 Invoke-WebRequest -Method Get과 SHA256 계산뿐이다. main 병합·Pages/Worker 배포·rollback·workflow dispatch/rerun·D1·실사용자 데이터·Auth 설정 변경은 모두0이다.
