## PR #13 F2·F3 재보완 (head 확인: 아래 SHA)

Sol Ultra `a35b859` 재검증(F2-a 누락 item 승격, F2-b 동일 root 교정 복구, F3 parser 밖 객체 시각 예외)을 사용자 승인 C 정책 안에서 수정했습니다. F1·다른 정책은 변경하지 않았습니다.

- F2-a: 적격 today 는 root·item 양쪽 문자열 generatedAt 이 엄격 형식·미래 아님·동일해야 함. 한쪽으로 대체 금지. Python validator 동일 계약.
- F2-b: 검증되지 않은 혼합 배치는 로더 기준을 선점하지 못함(exact `1040/1040 → 1050/1030 → 1050/1050` = 적용 `[true,false,true]`, 추천 `[0,0,1]`). 검증된 동일 발행 충돌·옛 발행·순번 역전 차단 유지.
- F3: 모든 소비 경로에서 비문자열 시각 암묵 변환 제거. 후보·최종·카드·Leaflet 예외 0.
- 시험: JS 544 + Python 77 pass/1 skip = 621 pass / 0 fail / 1 skip. Sol 도구: loader 확장 10/10, 동일 root Node 6/6·Chrome 30/30, 기존 loader 28/28·140/140, root/item 60/60, F3 확장 77/77, live merge 6/6, DOM core 245/245. 고정 190곳·176후보 ON/OFF 동일.
- main 병합·배포·D1·실사용자 데이터 변경 없음. Sol Ultra 재검증을 요청합니다.
