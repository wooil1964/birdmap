# 전국탐조지도 추천 개선 마스터플랜

연구·분석·설계 전용 프로젝트. 운영 알고리즘 구현·배포는 별도 승인 대상이다.

- 저장소: [wooil1964/birdmap](https://github.com/wooil1964/birdmap)
- 분석 브랜치: `analysis/recommendation-masterplan`
- 운영 기준: `1f0b0b5ca9d3ef887fc0bd2a159ef73429466a25` (2026-10-08 확인)
- 기존 근거: [Issue #9](https://github.com/wooil1964/birdmap/issues/9), [P0 최종 독립 검증](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6056552946)
- P0 병합: `eb36d1e` (PR #12), 최종 보완 `e0fc103`는 위 운영 기준의 조상이다.
- 세션 재개 후 확인한 main: `35141c04d4fd152982b1f4683d5b7a6f4f7514e5`. 차이는 기상 JSON 두 개이며 추천 코드는 위 고정 기준과 동일하다.
- 첫 세션 범위: 운영 기준·데이터 흐름 확정, 우선순위, 재개 문서, P1-A 점수 분포 분석 착수.

## 문서와 상태

|문서|역할|현재 상태|
|---|---|---|
|[PROGRESS.md](PROGRESS.md)|단계별 완료/미완료|P1-B 완료 체크포인트|
|[FINDINGS.md](FINDINGS.md)|확인 사실·데이터 흐름·근거|P1-A 및 P1-B 검증 사실|
|[P1_DESIGN.md](P1_DESIGN.md)|점수·순위 분석과 대안|P1-A 측정·P1-B 1000회×2/동점3대안 완료|
|P2_DESIGN.md|생태·계절·조석 근거|미착수, 아직 미작성|
|P3_DESIGN.md|맞춤 추천·모바일·개인정보|미착수, 아직 미작성|
|P4_VALIDATION.md|비교 실험·품질 관리·롤백|미착수, 아직 미작성|
|[DECISIONS.md](DECISIONS.md)|사용자 확정 조건과 미승인 선택|작성|
|[NEXT_SESSION.md](NEXT_SESSION.md)|정확한 재개 위치·명령|작성|

빈 문서를 형식상 완료 처리하지 않는다. 주요 분석 단위마다 이 폴더의 문서·입력 이력·재개 지침을 함께 commit/push한다.

## 유지할 조건

P0 안전 관문 및 기존 물높이 기준을 유지한다. 관찰 가능성·탐조 편의·자료 신뢰도를 구분하며 점수나 제보 건수를 출현 확률로 해석하지 않는다. 둥지·번식·민감 위치와 개인정보를 공개하지 않는다. 운영 파일·자동 생성 JSON·좌표·Worker·D1을 수정하지 않는다.

위치는 명시적인 허용 뒤 이용하며 불필요한 서버 GPS 저장을 설계하지 않는다. 전국 공통 추천은 개인화 없이도 작동해야 한다.

## 진행 순서

P1-A 측정 → P1-B 동점 반복 실험 → P1-C 제보·자료 품질 → P1-D 유형 균형 → P1 동일 입력 대안 비교. P2 문헌·현장자료·계절/서식환경 요구를 별도로 구축한 뒤 P3 필터·UX와 연결한다. P4의 재현·안전·보호 검증 기준은 각 단계 비교에 먼저 적용하고 장기 운영 설계는 후속 세션에서 확정한다.

점수 분산 증가만으로 개선을 주장하지 않는다. 현 시점에는 새로운 배점·출현 확률·개선율이 확정되지 않았다.

## 재현 가능한 분석 자료

- [입력 manifest](_snapshots/input_manifest.json): Git blob SHA/SHA256와 제보 취득 시각·해시.
- [190곳 전체 분석](_results/p1a_1f0b0b5_1930.json) / [요약](_results/p1a_1f0b0b5_1930_summary.json).
- [분석 도구](_scripts/analyze_p1a.mjs): 원문 함수 추출, 고정 시계, 제보 있음/없음 대조.
- [검증 기록](_results/validation_session1.json).

```sh
node docs/recommendation-masterplan/_scripts/analyze_p1a.mjs
```

위 명령은 최신 JSON을 재다운로드하지 않고 manifest의 Git object와 고정 공개 집계를 사용한다. `--write`는 이 분석 폴더의 결과 파일만 다시 생성한다. clone이 shallow하여 기준 커밋이 없다면 기준 SHA를 먼저 fetch해야 한다.

## 첫 세션 결과의 범위

현재 저장 원점수는 183/190곳이 92점이다. 저장 적격189곳에서는182곳, 추천 후보175곳에서는150곳이다. 팝업의 신선도 판정·강수 표시 보정·내부 순위 점수는 별도로 계산했다. P1-A는 단일 시점의 1차 측정이며 P1 전체 설계, 계절 예측력, 새로운 배점은 아직 완료되지 않았다.


## P1-B 최신 완료 결과

배열만 바꾼1000회×2 실험에서 상위 10 구성 변동은 제보 ON99.8%/OFF100%, 평균교체는1.795/3.863곳이었다. 독립 계산과2,000개 목록·각190곳 빈도가 일치했다. A1 안정ID, A2 관찰여건, A3 동점내다양성의세대안은 배열 변동0이지만정책효과와한계가다르다.

- [새 입력 manifest](_snapshots/input_manifest_35141c0_2240.json)
- [기상 비교](_results/weather_comparison_p1b_2240.json)
- [ON 1000회](_results/p1b_permutations_on.json) / [OFF 1000회](_results/p1b_permutations_off.json)
- [동점3대안](_results/p1b_alternatives.json)
- [전체 독립 대조](_results/p1b_validation.json) / [안전·보호 회귀](_results/p1b_safety_regression.json)
- [후속 P1-C/D 재개](NEXT_SESSION.md)

P1-B 분석은완료됐고운영구현은하지않았다. P1-C/D와P1전체정책·계절/장기성능검증은미완료다.

## P1-C 완료

[12정책](_results/p1c_reports.json), [독립 대조](_results/p1c_independent.json), [보호 표현](_results/p1c_recent_species_contract.json), [집계 시간·문자열](_results/p1c_aggregation_contract.json). 기존보호입력 결함을우선설계보완으로기록했다. 가점최적값·종별확률은미확정. 다음P1-D.

## P1-C/D 완료

[정원5정책](_results/p1d_quotas.json), [독립선발·수치상한](_results/p1d_independent.json), [실제축/제외/부족분 계약](_results/p1d_contract_audit.json), [최종정책설계](P1_DESIGN.md), [후속명세](NEXT_SESSION.md). P1정량대조와우선순위초안완료,생태최적배점/연중성능·운영구현은미완료.
