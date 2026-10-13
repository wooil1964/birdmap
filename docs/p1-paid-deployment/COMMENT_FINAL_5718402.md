P1 최종 보안 수정·독립 검증 체크포인트 (2026-10-14 KST)

**판정: BLOCKED — 제품 수정과 검증은 완료했으나, 운영 비공개 D1 암호화 백업의 구체적 반출 범위 승인 및 실제 복구 검증이 대기 중입니다. DEPLOYED가 아닙니다.** 사용자가 위임한 병합·배포 권한은 유지하며, 수정 가능한 결함을 방치한 종료가 아닙니다.

- 제품: 57184029864139fcf8603f34b39b0089c33ba9c5
- 문서·증거 체크포인트: b36cd773069e59d46866c325a4a218b6364341ce
- 최신 확인 main: 6feac41ae485bf16080324e40104de6d7b1ee8e5
- PR17: 해당 제품 SHA, Draft/open/미병합. 최신 main 임시 merge-tree 충돌 0. PR13 b12e20c1 및 PR16 24529898은 변경하지 않았고 포함 기능을 중복 병합하지 않습니다.

### 직접 수정한 차단 결함
1. 구 Worker의 지연된 무조건 쓰기가 보호 전환 후 복귀할 수 있는 경로: 별도 0004b 원자 pre-barrier의 12개 SQL guard, 현재 writer의 한 raw D1.batch claim/body/release, primary 공개 snapshot의 claim0 검사, capability v4로 차단합니다. native 결과·CAS의 meta.changes를 보존하고 비파괴 canonical seed/backfill 경로도 검증했습니다.
2. 순차 purge CLI가 자식 행 일부를 먼저 삭제한 뒤 새 fence에 막히는 부분 삭제 위험: ledger intent와 첫 삭제 전에 중단합니다. 실제 CLI entry 6/6, 모의 API write0. 운영 파괴적 purge는 허용하지 않으며, fenced DB에서 미지원입니다.
3. 실제 원격 D1에서 기존 중첩 CASE trigger가 7500 incomplete input으로 실패: 관찰된 최소 반례에 따라 동일 조건의 SELECT RAISE(...) WHERE NOT EXISTS(...)로 6개 trigger를 수정했습니다. SQL 의미 비교 96/96. 내부 parser 구현 원인은 추정이며, 관찰된 실패와 수정 후 성공을 구분합니다.

### 실제 실행 결과
| 범위 | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| 자동 7스위트 | 812 | 0 | 1 |
| 실제 Chrome·Leaflet, 344/375/768/1024/1440px | 242 | 0 | 0 |
| 독립 native writer-fence | 13 | 0 | 0 |
| 독립 actual-handler D1 CAS | 10 | 0 | 0 |
| 실제 원격 합성 D1 migration | 4 | 0 | 0 |
| SQL 의미 동등성 | 96 | 0 | 0 |
| purge CLI entry | 6 | 0 | 0 |

자동 세부: front379, reports-api294, weather-proxy36, Python weather60, time contract11, tide21+skip1, shared pages11. skip은 과거 공식 조석 표본이 rolling monthly window 밖인 기존 조건입니다. 실패 assertion 삭제/날짜 검사 약화는 없습니다. 최초 원격 parser 실패 1PASS/1FAIL 원장과 종료 코드1 로그도 보존했고, 수정 후 late CHECK 도달·전체 catalog/data/ledger rollback·기존 장벽 유지·정상 frozen 설치·재적용 무변경을 각각 확인했습니다.

[정확 CI run38442910120](https://github.com/wooil1964/birdmap/actions/runs/38442910120), job115453799991의 실제 로그와 모든 step 성공을 확인했습니다. CI merge6b131c37e47eb53d5cff209769d7b04006f1398c는 제품과 tree가 동일합니다. 보호 Pages artifact11837076250의 388개 runtime asset이 Git bytes/hash와 일치합니다. artifact 확보는 Pages 배포가 아닙니다.

고정 2026-10-08 22:40 KST의 190곳·176 안전 후보, 제보 ON/OFF의 후보 전체 signature·상위10·점수·가점·날짜·시각·좌표가 유지됩니다. P0·S1-R·S2-A·F2/F3를 포함한 관련 회귀를 확인했습니다. 현재 main의 14일 자동 기상 JSON 원본과 current-date validator PASS는 별도 기록입니다.

### 실제 보호 롤백과 Paid
실제 업로드되고 버전·바인딩·소스가 연결된 보호 standby:
- public normal: f1f24698-8388-4f36-ae31-38f2dd8e9446
- public maintenance: 7e398695-aad7-4e58-962c-034513776960
- admin normal: a7723404-a3c2-4739-91ff-44049e1302cb
- admin maintenance: 11e97856-990e-4a17-9c28-f18cf92ca46d

업로드 source9f8과 최종571의 runtime 39개 blob/bundle/source-map 동일성이 독립 검증됐습니다. migration은 최종571 SQL을 적용해야 합니다. 활성 버전·운영 트래픽은 변경하지 않았습니다. old494/16dae, 이전 fence 없는 standby, c025 Pages를 보호 유지 rollback으로 사용하지 않습니다.

인증된 Cloudflare 실제 계정의 Paid Current plan을 확인했습니다. 요금제/결제 변경은 하지 않았습니다. warm HEAD35/cold109 rows_read, HEAD write0. 20명×8h×30일+다른 Worker10,000/day의 명시 가정에서 월528만~615만 요청·보수적 D1 읽기2.11억~2.68억 행, 평균 CPU10ms+guard1ms 감도 약 $5.56~$5.75입니다. 실제 전체 계정 CPU·logs·세금 등은 미확인이고 SQL 대기시간을 CPU로 치환하지 않았습니다. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

### 남은 운영 관문·순서
운영 D1 전체 백업에는 비공개 정확좌표·제보자정보·관리자 메모가 포함됩니다. 자동 승인 검토가 이 자료의 구체적 local 반출/저장 범위 승인을 확인하지 못해 export를 거부했습니다. 실행0, 원문 저장0, 우회0입니다. 사용자에게 Git 밖 CurrentUser DPAPI 암호화 저장 및 평문 메모리 복구의 정확 범위 승인을 요청했고 응답을 기다립니다. 합성 DPAPI 4/4와 Time Travel bookmark는 실제 freeze-bound backup/복구 완료를 대체하지 않습니다.

구체 백업 승인 후: 최신 소스·운영 버전 재확인 → 초기 암호화 백업/복구 → paired protective maintenance/legacy0%/previewoff 및 operator 쓰기 통제 → pinned Wrangler4.149의 원자 d1 migrations apply --remote로 dedicated 0004b만 적용 → readback/freeze-bound backup → 별도 0005만 적용 → 원본·ledger·epoch/revision·guard34·claim0·FK0 → 보호 normal pair/peer/nonce와 안전 thaw → 검증 소스만 main/Pages → 실제 운영 보안·정상 기능·캐시·자동 기상/조석 검증.

원격 실험은 독립 합성 DB의 가짜 0,0 자료만 사용했고 운영 D1 writes0입니다. 운영 main 병합·Worker 활성화·Pages 배포·실사용자 변경 모두0입니다. 실제 GPS/native 앱·운영 권한 철회/삭제/POP 검증은 아직 미실행이며 PASS로 합산하지 않습니다. 이미 전달된 과거 자료를 원격 삭제할 수 없는 경계와 실제 사고 증거가 없다는 점을 구분합니다. S1-P의 승인 후 공개 정책은 이번에 변경하지 않았습니다.

[최종 FINDINGS](https://github.com/wooil1964/birdmap/blob/b36cd773069e59d46866c325a4a218b6364341ce/docs/p1-paid-deployment/FINDINGS.md) · [FINAL_MANIFEST](https://github.com/wooil1964/birdmap/blob/b36cd773069e59d46866c325a4a218b6364341ce/docs/p1-paid-deployment/FINAL_MANIFEST.json) · [NEXT_SESSION](https://github.com/wooil1964/birdmap/blob/b36cd773069e59d46866c325a4a218b6364341ce/docs/p1-paid-deployment/NEXT_SESSION.md)
