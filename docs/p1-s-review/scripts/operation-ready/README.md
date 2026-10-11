# 운영 승인 준비 재현

GET 및 로컬 제품 함수만 사용한 검증이다. 기존 결과를 덮어쓰지 말고 새 출력 폴더를 지정한다. 실제 사용자 POST/DELETE, Worker upload/deploy/rollback, workflow dispatch는 명령에 없다.

## Worker 및 공개자료

로컬 Wrangler cache의 account ID와 기존 OAuth 인증을 메모리에 읽는다. token·원본 설정·실 Worker 원문은 출력/저장하지 않는다. esbuild는 기록된 npm-cache 설치 경로를 사용하므로 재현 전 Wrangler/esbuild 버전을 확인한다.

```powershell
node docs/p1-s-review/scripts/operation-ready/worker_git_compare_latest.mjs docs/p1-s-review/results/operation-ready-new 'C:/Users/김진호/Documents/GitHub/birdmap'
node docs/p1-s-review/scripts/operation-ready/previous_source_attempt.mjs docs/p1-s-review/results/operation-ready-new 'C:/Users/김진호/Documents/GitHub/birdmap'
node docs/p1-s-review/scripts/operation-ready/public_read_impact_latest.mjs docs/p1-s-review/results/operation-ready-new 'C:/Users/김진호/Documents/GitHub/birdmap'
node docs/p1-s-review/scripts/operation-ready/github_final_read.mjs docs/p1-s-review/results/operation-ready-new
```

초기 소스 비교의 ReferenceError/TypeError는 합성 harness의 단계별 오류이며 제품 실패가 아니다. final/latest가 최종 판정이다. 초기 결과를 성공으로 덮어쓰지 않았다.

## 최신 main 임시 결합

실행한 명령: `git merge-tree --write-tree 43bff43301d5915a344bf2c20987698597cf8870 b12e20c1b6d856a021898a0c1c9221b30393a221`. tree는 `deec588e937ed309b11f9739c02b6eae22772c3d`이며 main을 merge/checkout하지 않았다.

이 tree를 새 workspace scratch에 `git archive --format=tar --output=<scratch>/combined.tar deec588e937ed309b11f9739c02b6eae22772c3d`로 기록하고 tar를 풀어 읽기용 복사본을 만든다. scratch를 증거 저장 대상에 포함하지 않고 자동 JSON 내용은 변경하지 않는다.

```powershell
& 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/p1-s-review/scripts/operation-ready/latest_main_validate.py <결합tree복사본> <새출력폴더>
node docs/p1-s-review/scripts/operation-ready/latest_current.mjs <결합tree복사본> <새출력폴더> <Git저장소>
```

validator와 JS는 실제 현재 시계를 사용한다. 미래 재실행 시 생성일·갱신 시각에 따른 결과가 22:47 관측과 같을 필요는 없다. 고정10월8일 ON/OFF 비교는 기존 F23 스크립트와 분리한다.

## 증거와 범위

- execution_manifest.json: 명령·범위·해시·기존621 결과의 귀속 및 미확인 항목.
- worker_git_source_comparison_latest.json: 실제 source/build 비교, 실제 함수13합성, 전후 deployment.
- previous_version_source_attempt.json: metadata-only200을 source 성공으로 보지 않음.
- public_read_impact_latest.json: 공개 GET 집계. 원시 좌표·행ID·종명·이름·note 제외.
- latest-main/: exact 결합 tree validator와 현재 JS 추천 함수. 새 Chrome 전체 실행 결과가 아님.
- final_github_read.json: PR/main/Pages/CI 최종 공개 GET. 운영 workflow와 PR CI 구분.

계정 ID를 로컬 cache에서 읽도록 정제한 변경은 assertion을 바꾸지 않았다. 모든 .mjs에 node --check를 실행했다. 원본 결과는 보존했다.
