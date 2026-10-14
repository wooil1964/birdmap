# 완료 상태와 재개 지침

## 기준·저장 자료

- 브랜치: codex/issue9-weather-migration-research-20261014
- 고정 분석 main: ae8d9ad42fa11300837645618bc8e91ba5474414
- 첫 증거 체크포인트: 2c531236ed0cb8cf407793b72d36c2a7802a5e57
- clock: 2026-10-14 19:00:44.048 KST / today·week18:32 / 월조석07:39
- 종료 확인 main:0d96fd65c835814822fc2ac841a1ca257de4c0f4. 새 자동기상19:17 발행,19:20 반영. 변경은 today/week뿐, 제품 소스 동일. 새 자료를 이번 고정 분석에 혼용하지 않았다.
- INPUT_MANIFEST/PROTECTED_SOURCE_MANIFEST/RESULTS/CASE_REPLAY/FINAL_MAIN_OBSERVATION이 재현 기준이다.
- 실제 제보는ID/날짜/종수만 보존. 민감 위치/제보자 정보 저장0.

## 완료

필수5문서와20개 원논문 원장, 실제190곳·174후보·92점156, ON/OFF, 각각100회 순열/독립선발, 오전·저녁 입력만 교체한 통제, 기존P1-S190/176, 태풍173행 부분 재현을 완료했다.
최종 고유 관련411건: 연구53+선발35+주간175+API88+Python60. 최초261PASS/1FAIL의C01 인코딩은 같은 assertion UTF8재실행1PASS로 해결, 원로그 보존. today/week validator각종료0. Python 잘못된 파일 경로는 미실행, 연구 import는 하네스 오류로 별도 보존했다.
독립 문서검토가 찾은 연구 시제품eventVerified 누락은 before1/after0 종료코드로 보존 후 수정했다. 연구53시험/ONOFF signature 대조 통과. 제품 수정0.

## 실행

- node docs/issue9-weather-migration-research-20261014/analyze.mjs
- node --test docs/issue9-weather-migration-research-20261014/test_models.mjs
- node docs/issue9-weather-migration-research-20261014/case_replay.mjs
- node .github/scripts/compare_p1s_recommendation.mjs ae8d9ad42fa11300837645618bc8e91ba5474414
- PYTHONUTF8=1/PYTHONIOENCODING=utf-8/PYTHONDONTWRITEBYTECODE=1에서 .github/scripts/test_weather.py 및 두validator 실행

캡처/fetch_jma는 기존 고정 입력을 덮어쓰지 않도록 재실행하지 않는다. 새 분석은 별도 날짜/폴더/clock/manifest로 시작한다. 보고서 생성 스크립트는 초안 작성 원장이며 정리된 최종md를 덮어쓰는 명령으로 사용하지 않는다. 기존 P1-A~D/PR24 분석을 반복하지 않는다.

## 미검증·다음 승인

관측24/48h·기압·고층풍·정확한rain-end·공식너울/접근매핑·관찰노력·비검출 자료가 없다. 출현확률/새 생태점수/오탐률/미탐률/상용API비용 미검증이다. 이번 연구에서 Chrome 제품E2E·운영/원자D1 재시험을 하지 않았다. 기존 소스/관련 합성API 시험과 구분한다.
사용자 승인 후 M1 연구 설명필드부터 구현 계획을 구체화한다. M2는 자료/QC/공식위험 매핑 후 offline shadow, M3는 노력자료·독립 검증 후 배점 검토다. 권한epoch/revision/nonce/fresh postflight/CAS/terminal/5초만료·좌표·기존B/정원/네계절/P0는 유지한다.
main 병합/push, Worker/Pages 배포, D1 및 실제 이용자 자료 변경 금지. 이번 단계에서 허용된 연구 브랜치push 및Issue9 기록만 수행한다. 테스트가 만든 미추적 .github/scripts/__pycache__/는 보존하고 커밋하지 않는다.

## 게시 완료

연구 보고서 커밋29e4ab9a21bf46f7795bc2d0e9360dab5627d0f6. Issue9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6166455896
COMMENT_RECEIPT의bodyExactMatch=true. 현 연구 작업은 완료이며 제품 구현은 다음 사용자 승인 전 수행하지 않는다. 마지막 영수증 체크포인트는 git log 제목 `record verified Issue9 research publication`로 확인한다.
