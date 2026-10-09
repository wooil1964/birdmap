# PR #13 최종 검증 진행

- 전용 브랜치: review/p1-s-pr13. 제품 source는7eb6764 그대로다.
- 최종 판정: **수정 필요**. S1-R는 통과; S2-A today 필수기상 결측(R1) 및 popup 적격provenance(R2) 미완료. optional non-null wave/own flag(R3) 정합성 보완.
- 완료: 규칙·설계·인수인계·14파일 전체diff; actualS1/API before/after; actualS2/표시/Python matrix; 기존회귀547pass/1skip;190곳/176후보 ON/OFF 전수 비교; main 임시결합313pass/1skip와validator2성공; head-only 및 root combined E2E 각각40/40.
- root combined: 5폭344/375/768/1024/1440, 10/9 16:40시계/16:28생성, 실제Leaflet1.9.3, JS예외0. 원본 10/8 22:40 고정추천 실험과 별도 입력이다.
- 보호 상태 변경 뒤 늦은 field 응답은 hidden=false로 복귀해 길안내가 재활성화됐다. 상태보존 기대는 실패이며 최신main 동일함수에서 재현, 기존S1-P/cache 과제로 구분한다. mobile popup의 대략위치안내도 기존main/PR동일정책이며 전면길안내금지는 별도승인사항이다.
- 마지막 remote확인: 2026-10-09 19:47KST. PRhead7eb6764/main38b4529 동일, draft/open/unmerged. 원래 checkout fix/p1-s-safety-guards7eb6764 clean이다.
- 체크포인트1: 0ebd148e96c56ce375f81dfdcf31566d056aab57. 이어 E2E/최종문서 checkpoint를 저장한다.
- 완료: PR13 댓글6079394141 및Issue9 댓글6079396000 게시, API read-back7370자 본문일치 확인. results/github_receipts.json 저장. 검증완료checkpoint d9e5877d7fad792d7fe3ed79485e7d829afbc9da, 이어 게시증빙 최종checkpoint/push 후 사용자 보고.
- 제품·main·자동JSON·Worker·운영D1·실사용자 제보는 수정하지 않음. 최초 기존browser자동telemetry는 미계측이므로 성공/실패를 단정하지 않음. 이후browser검증은격리함.

## 새 SHA 재검증 시작

사용자 지정1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c, main38b4529. 이전ff0d334 체크포인트를 읽고 재개했다. 새로운 결과는 R123_RECHECK.md 및 results/r123에 분리한다. 기존 회귀563pass/0fail/1skip 직접 확인; 독립matrix/정상만조display추가계약/E2E 진행중. 제품수정금지.
