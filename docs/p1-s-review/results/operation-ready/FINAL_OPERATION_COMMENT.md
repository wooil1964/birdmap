## PR #13 운영 승인 준비 — 읽기 전용 최종 결과

**판정: 조건부 승인 유지 / 실제 운영 반영은 별도 승인 대기.**

대상 head `b12e20c1b6d856a021898a0c1c9221b30393a221`. 2026-10-11 22:59 KST 최종 조회에서도 head 유지, 원격 main 및 현재 Pages는 `43bff43301d5915a344bf2c20987698597cf8870`입니다.

1. **현재 Worker 소스 연결 확인.** `494b97d1-69ab-40f7-bbbf-e8c6e3c5effc`는 전후 deployment 조회에서 100% 동일했습니다. 실제 public.js(71,439bytes)는 Git `41650e43f80fadb2bfd9f80b18d958862f673551`/동일 서버 소스의 PR parent를 로컬 esbuild로 재현한 결과에 실제 footer를 더했을 때 전체 일치합니다. 소스/빌드 동등성의 근거이며 유일한 업로드 checkout의 서명된 증명은 아닙니다. 실제 함수의 수량·혼합 보호 표현 7조건은 누락되므로 현재 버전에 S1-R가 없습니다.

2. **직전 버전은 안전 rollback 불승인.** `16dae92a-4bd7-4fda-ba90-d5075604d4db`의 version별 content 조회는 source가 아닌 metadata JSON을 반환했습니다. 실제 source/Git/S1-R 유지가 증명되지 않았습니다. 따라서 현재494 및 직전16dae 모두 S1-R 배포 이후의 보호 유지 복귀 대상으로 승인하지 않습니다.

3. **보호 유지 복구 설계.** 첫 S1-R `dc6f0e58a709e82d689e36ce2dc4b857e285821e`와 b12 서버 src16/16은 동일하고, main43에 해당 shared.js를 결합해도 동일합니다. 새 S1-R 서버를 유지하며 다른 변경만 되돌리는 방안을 기본으로 합니다. 별도 승인 후 실제 보호 version/hash/traffic 및 peer·설정·D1 호환을 기록해야 합니다. 로컬 artifact는 실제 배포 version을 대신하지 않습니다. maintenance flag도 전체 공개/field 경로의 안전 폐쇄가 아닙니다.

4. **기존 자료 영향과 보안 조건.** 22:47 공개 GET은 approved54/history54, recent9, active field0이며 공개 payload에서 신규 보호 분류는0입니다. 구·신 판정 모두 보호 대상인 root2건에는 공개 위치가 남아 있습니다. 기존 승인 후 공개 정책의 관측이며 새로운 무단 유출 사고로 단정하지 않습니다. private D1는 감사하지 않았고 원시 ID·종명·좌표·note는 저장/게시하지 않았습니다. S1-R는 과거 approved/field 위치를 자동 철회하지 않으며, 현재 canonical 명시적 비번식 확인 공개 경로의 전면 보호도 구현하지 않습니다. 최근 가점 제외와 S1-P 공개 정책을 구분합니다.

삭제 후 늦은 GET의 마커 복귀, 보호/철회 후 과거 응답 및 지연 GPS의 길안내 재활성화는 기존 결함으로 재현됐습니다. 기존 위치의 가림·철회·S1-P 전환 전에는 cache/navigation 방어가 필수입니다. 순수 S1-R/C 한정 반영은 기존 공개 정책과 잔여 위험을 명시적으로 수용하는 조건입니다. 지속적인 즉시 본인 삭제 UI 철회가 운영 요구라면 삭제 race도 배포 전 차단해야 합니다. R5 숫자 문자열 차이는 기존 별도P2로 유지하며 이번 보완의 해결 범위에 포함하지 않습니다.

5. **Pages 및 CI.** 현재 Pages deployment6994918694 성공과 서비스4파일/raw43 해시 일치를 확인했습니다. 43은 배포 전 기능 복귀 기준이며 새 C/F2/F3 guard를 잃는 전체 rollback을 안전 복귀로 승인하지 않습니다. 새 release SHA와 안전 guard를 유지하는 복귀 기준을 승인 후 기록해야 합니다. PR Actions/status/check-runs는 모두0: PR CI 성공은 없습니다. 기존 exact b12 독립621 pass/0fail/1skip·고정190/176 ON/OFF signature를 local 대체 증거로 채택할지는 운영 승인 항목입니다.

최신 main의 추가 변경은 자동 기상 JSON2개뿐입니다. 임시 merge-tree `deec588e937ed309b11f9739c02b6eae22772c3d`는 충돌0, main 자동 자료 보존, 실제10월11일 validator today/week 통과, 추천112함수 동일, 현재 제보OFF176후보/최종10 전원 적격·안전/예외0입니다. 이를 최신 결합의 전체621 또는 새 Chrome 전체 실행 결과로 확대하지 않았습니다.

승인 후 제안 순서는 **서버 S1-R 및 실제 보호 복구 기준 확정 → Pages 안전 release/복귀 기준 기록 → 자동 기상 갱신·최종 추천 확인**입니다. 위치 보호 전환은 cache 보안 선행 작업과 별도 S1-P 승인 뒤에 수행합니다.

[통합 보고서 및 증거 체크포인트 f806323](https://github.com/wooil1964/birdmap/blob/f80632308d4c88821c8ab54cadcc7f9375751998/docs/p1-s-review/OPERATION_READY.md). 상세 소스·보호정책·Pages/CI 보고, 명령/해시 manifest와 NEXT_SESSION.md를 review/p1-s-pr13에 저장·push했습니다.

제품 코드 수정·main 병합·Worker upload/deploy/rollback·Pages 배포·workflow 실행·D1/실사용자 자료 변경은 하지 않았습니다. 별도 운영 승인을 기다립니다.