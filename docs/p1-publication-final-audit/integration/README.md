# 독립 통합 감사 — 진행 상태

감사 기준 PR17 `71177330fd1d45c64f3bef632cf1f43286c304cd`, 최신 main `ec31325f0e1012dc238317d9340406206696f184`, PR13 `b12e20c1b6d856a021898a0c1c9221b30393a221`, PR16 `245298981e27f88ac26bad8b46d819a7df899c86`.
제품을 수정하거나 PR을 변경하지 않는 독립 작업 트리 `p1-publication-final-audit/birdmap`에서 실행한다. 수정·최종 통합은 root만 수행하며 최종 정확 SHA를 받아 archive로 다시 검사한다. 기존 704 보고값은 기준일 뿐 새 실행 결과가 아니다.

## 현재 읽기 전용 근거

- GitHub main metadata는 protected=false, protection.enabled=false, required checks off. rulesets=[]다. 상세 protection endpoint는 integration administration 권한이 없어 403을 반환했으며 그 오류를 부재의 증명으로 사용하지 않았다.
- PR17 기준 SHA의 statuses=[], PR-trigger workflow_runs=[], check_runs total=0, reviews=[]다. CI 성공으로 표시하지 않는다.
- 기존 4 workflow는 main push/schedule/dispatch로 운영 JSON·share artifact를 생성하고 contents:write와 commit/push를 사용한다. 독립 검증을 위해 dispatch하지 않았다.
- main의 최신 변화는 공지 직접 제공 관찰 포인트의 카카오/티맵 경로와 notices.json이다. siteData 변경이 없다. 새 정적 공지 위치와 동적 제보 권한은 별도 경로이며 이번 보안 구현이 S1-P 간접 위치 정책을 해결한 것으로 보고하지 않는다.
- 기준 PR17 reports-api는 독립 221/221(exit0)이다. `baseline-7117733/reports.json`, `.tap`에 정확 명령/시간/종료코드를 보존했다.
- main 통합 준비 checkpoint2e4cfc96에서 정적 공지 source와 합성 DOM 17/17이다. 원래 5개 point의 두 링크, desktop Tmap 차단, 비정상 point11종, textContent-only 처리를 확인했다. 실제 물리 앱 실행 결과가 아니다.

## 재현

`node docs/p1-publication-final-audit/integration/run_integrated.mjs <FINAL_INTEGRATED_SHA> <LATEST_MAIN_SHA> b12e20c1b6d856a021898a0c1c9221b30393a221`

명령은 Git object의 정확 archive를 `.tmp` 아래 새 경로에 만들고 Node front/reports/proxy, Python weather/tide/share, 현재 날짜 validator, 고정 추천, S2/S1-R source 계약, 190 siteData와 좌표·최신 main 자동 JSON byte 보존을 실제 실행한다. 각 suite의 command/cwd/start/end/exit/sourceSHA와 원 로그를 별도 저장한다. 날짜 검사를 삭제하거나 자동 JSON 날짜를 조작하지 않는다. contract script가 JSON에 실패를 기록하고 exit0을 반환할 가능성을 고려하여 runner가 182/21/12 및 171/오탐0을 다시 명시 assert한다.

`node docs/p1-publication-final-audit/integration/static_notice.mjs <FINAL_INTEGRATED_SHA> <LATEST_MAIN_SHA>`

최종 통합 source에서 최신 main 정적 공지 기능을 다시 검사한다. 공개 좌표 숫자는 결과에 저장하지 않는다.

## 비용 및 잔여 조건

foreground visible tab의 기본 public-state polling은 0.2 request/s=720/hour, 연속24h이면 17,280/day다. 초기 bootstrap, field60초, reports/pending/recent10분, history/contributors/길찾기/GPS 재확인이 별도로 추가된다. concurrent in-flight head 공유는 감소 요인이나 그 최대 감소를 보장하지 않는다. 정확 billable rows/CPU/errors/cost는 운영 metrics와 플랜을 확인해야 한다.

이미 구 client·외부 앱에 전달된 좌표의 원격 회수는 불가능하다. 새 요청의 nonce/no-store/primary/postflight 방어와 기존 cache purge, 열린 구 탭 전환을 구분한다. 5초 lease와 최대4초 head 응답 지연은 0ms 철회 탐지의 보장이 아니다. 안전한 실제 업로드 Worker/Pages rollback, cache rule/purge, paired binding, writer drain/원자 D1 설치는 이 독립 통합 시험만으로 완료되지 않는다.
