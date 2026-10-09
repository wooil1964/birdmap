# PR13 PC·모바일 E2E 직접 재실행

root 실행 결과: `pr13_e2e_combined.json`. PR 제품 source7eb6764 + main38b4529 자동 기상 JSON의 merge-tree archive에서 실행했다. 평가시계2026-10-09 16:40 KST, 실제 기상 생성2026-10-09 16:28 KST. 10/08 22:40의 고정176후보 실험과 다른 입력이며 혼용하지 않았다. sourceDigests와 merge_metadata를 대조해 index는PR, JSON은main인 것을 확인했다.

| 폭 | context | 기능분기 pass/total | JS 예외 |
|---:|---|---:|---:|
|344|mobile/touch|8/8|0|
|375|mobile/touch|8/8|0|
|768|desktop/fine pointer|8/8|0|
|1024|desktop/fine pointer|8/8|0|
|1440|desktop/fine pointer|8/8|0|

40개 기능 흐름: 실제 Leaflet1.9.3/CDN bootstrap·190곳 로딩, 추천10카드·실제 popup, 보호 fieldNews 길안내 차단, 일반 길안내 UI, 보호 수량 제보 입력의 pending spot 미공개, 본인 field popup 삭제, field HTTP오류의 상태보존, report HTTP오류의 입력/재시도버튼 보존. 모바일에는 현장소식등록/삭제 실제 터치도 포함했다. PC 등록 버튼은 pointer:fine에서 기존 정책상 숨겨져 있으므로 합성 기존소식/본인 기록을 복원한 뒤 실제 popup 삭제를 클릭했다.

Chrome에서 JS exception0, CDN/Leaflet 로딩 실패0, document overflow0. 루트가375/1440 screenshots도 육안 확인했다. 남은 screenshot5개는 합성 API+공개 지도자료 화면이며 실제 민감 좌표가 아니다. base map tiles는 의도적으로 투명 합성 이미지다. 지도 엔진·마커·popup은 실제 구현이고 물리적 GPS·외부 내비게이션·배포 CAPTCHA·운영 cache 설정은 검증하지 않았다. Chromium viewport는 실제 휴대폰 기기/키보드를 대체하지 않는다.

## 보호 상태 변경 후 늦은 응답: 보존 기대 기준 실패 (기존 결함)

새 GET에 locationHidden=true를 적용한 뒤 이전 GET을 늦게 완료하면 fieldUpdates가 이전false로 복귀하고 fieldNews 길안내가 재활성화됐다. 실제 browser에서 관찰했으며 40개 기능분기 성공 수와 별도로 기록한다. 이를 보호 상태 재노출 방지 통과로 보고하지 않는다.

`pr13_e2e_existing_policy.mjs`는 최신main/PR의 실제8개 field 함수 해시가 동일함을 대조하고, 양쪽의 loadFieldUpdates에 동일 promise 순서를 넣어 각각 같은 역전을 재현했다. 따라서 이번 S1-R에서 새로 도입된 결함은 아니며 S1-P/캐시 안전 설계 후속 항목이다. 현장소식 응답 sequence/version monotonicity 및 보호 상태 갱신 시 현재 marker/popup/guide/cache 폐기 정책을 별도 설계·승인할 필요가 있다.

## 보호 popup 대략 안내: 기존 정책 예외

fieldNewsNavigate의 보호 좌표 길안내 차단은 정상이다. 반면 mobile popup의 fieldGuideStart는 locationHidden=true에 대해서도 서버가 준 대략 공개 좌표로 방향 안내를 시작하며 '위치 보호로 대략적인 지점입니다. 실제 관찰 지점이 아닙니다.'를 표시한다. fine pointer에서는 기존 CSS로 이 버튼/guide를 숨긴다. 실제 main/PR 함수를 각각 호출해 같은 동작과 문구를 확인했다. exact raw coordinate 노출로 주장하지 않으며 전면 길안내 금지는 S1-P 승인 정책으로 구분한다.

baseline 재현4건/4건은 **두 기존 동작을 재현한 시험**의 성공 수이며, 보호상태 보존이 성공했다는 뜻이 아니다. 실제 운영 노출 사례·발생률을 추정하지 않았다.

## 합성/격리

localhost static server와 실제 reports public handler+SQLite memory를 사용했다. 모든 Worker/Turnstile/events는 Fetch interception으로 합성 응답하고 DNS fallback도 막았다. 외부CDN4hosts의 GET/HEAD 정적 읽기만 허용했다. Node외부fetch는 정확Turnstilesiteverify의 로컬mock 외에 전부오류다. 실제 제보/현장소식 POST/삭제, 운영 D1, 위치/GPS 사용은 없다. traffic은 host/path/method/합성 여부만 기록하며 POST body·개인 device/token·좌표를 기록하지 않았다.

```powershell
node docs/p1-s-review/scripts/pr13_e2e_existing_policy.mjs . docs/p1-s-review/results
node docs/p1-s-review/scripts/pr13_e2e.mjs <임시combined-directory> <임시result/profile-directory> 2026-10-09T16:40:00+09:00
```

최초 harness 시험의 Leaflet 객체순환 반환값 오류 및 PC숨김버튼 클릭 실패는 harness 설계 문제였다. Runtime.evaluate mutation의 마지막값을 true로 바꾸고 PC는 기존 본인소식 fixture로 구분한 최종 script를 사용했다. product source는 바꾸지 않았다. 최종 root 직접 실행은40/40이었다.
