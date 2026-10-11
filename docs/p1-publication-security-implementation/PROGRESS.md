# P1 공개 위치 보안 구현 진행

사용자 승인 설계: `c128666203bb5c483258b8231d0eb410c38e38f9`.
기준 main: `66ff787d848ad9483e8671811cf1b8edb5ab696b`.
별도 브랜치: `codex/p1-publication-security-guards`.
PR13 `b12e20c1b6d856a021898a0c1c9221b30393a221`, PR16 `245298981e27f88ac26bad8b46d819a7df899c86`는 수정하지 않는다.

## 완료된 구현

- PR16 최신 main 위치 방어와 S1-R 최소 보호 표현 방어를 별도 브랜치에 반영.
- singleton epoch/revision, field row_revision, 공개 상태 mutation trigger와 deleted terminal 불변 조건의 additive migration.
- 실제 D1 primary snapshot batch, nonce/contract/epoch/revision 엄격 검증, no-store, 좌표 없는 mutation receipt.
- field 상태/확인/삭제의 CAS와 batch assertion. canonical dual-write 및 shadow 같은 revision 비교 유지.
- 클라이언트 preflight/payload/postflight, 권한 lease, 주기 재검증, unknown 시 store/marker/popup/href/guide 제거.
- 동적 길찾기와 지연 GPS 콜백은 fresh authority 확인 후 최신 대상/owner 재검사.
- 정적190곳의 좌표·기상 추천 산식은 변경하지 않음. S1-P 승인 후 종별 전면 비공개 정책을 구현하지 않음.

## 증거와 진행 중 작업

현재 reports-api 221/221, SQLite 계약40(전체221에 포함), 실제 local workerd D1 18/18, proxy36/36.
GPS 마지막 보강 이전 프런트278/278, Chrome140/140은 원형으로 보존하며 보강 후 재실행 중이다.
Chrome 기존4종×5폭20과 기존위험15는140의 subset이므로 중복 합산하지 않는다.
기존 실패 원장과 보완 근거는 results/browser/README.md와 results/server-audit/FRONT_HARNESS_REVIEW.md에 보존한다.

## 미완료

- 마지막 GPS 보강 후 frontend/Chrome 재실행.
- PR13 임시 merge-tree archive의 전체 회귀, 고정190/176 ON/OFF signature, S1-R171 및 P0 계약 확인.
- 최종 remote main/head 재확인, diff/자동 JSON 보존, 문서 정리·commit/push·Draft PR 작성/재확인.
- 운영 배포는 별도 승인까지 보류. 실제 D1 schema/paired bindings/CDN purge/보호 유지 rollback version 검증은 운영 승인 선행 조건.
