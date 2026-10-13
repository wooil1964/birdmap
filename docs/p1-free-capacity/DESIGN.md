# Workers Free 최소 보완 설계와 시험 계획

기준 제품 c025d75f964ab36f6f2eae541a99461f6de59b70, 문서기준9f9e9be. 별도브랜치 codex/p1-publication-free-capacity. 최신main07680616은자동기상JSON만변경. 운영·요금제 변경금지.

## 서버

HEAD103의102행catalogscan을 매번없애는대신 첫cold primary read에서22필수name→schema rowid 힌트를 얻는다. 이후에도매primary snapshot에서22개scalar rowid/name/type를실제로검증한다(독립actualworkerd23행). 보관하는것은위치힌트뿐이며권한판정·guards존재·epoch/revision을cache하지않는다. fullschemaRowidhint가바뀌면cold query로재판정하고dataendpoint는전체state+payload batch를재실행한다. 이전payload를새guard검사로승격하지않는다. 필수trigger DROP즉시503,복구·hint충돌·다른DBbinding·transaction중변경을검사한다. schema/migration/CAS/terminal/공개projection변경없음. D1에서PRAGMA schema_version/cookie는금지됨을독립확인했으므로채택하지않는다.

## 클라이언트(구현 전 검토)

초기load/pageshow/reportinit/fieldinit의겹친호출은path+generation별진행중data요청만합친다. positive permissioncache가아니므로새networkdata는기존pre/data/freshpostflight를유지한다. 초기pageshow(BFCache아님)에서진행중bootstrap을불필요폐기하지않고 BFCache/visibility복원은기존파괴적폐쇄를유지한다.

단순5초lease만료에서는좌표·popup·길찾기·guide·가점·history·동의DOM을즉시폐쇄한다. 이전에pre/data/freshpostflight검증이끝난DTO만별도seal로보관할수있다. 복구하려면그snapshot을localread한뒤발행한새primarynonceHEAD가같은contract/epoch/revision/projection을입증하고request-start5초잔여가유효해야한다. 오류/unknown/변경/mutation/visibility/BFCache는seal까지폐기한다. 다른세대의진행중응답과GPS는기존generationbarrier로차단한다. sourceDTO와consumerDTO를각각clone해fixedhistory변형을막는다. field cachedserverTime를fresh처럼덮어쓰지않고별도postflight관찰시각으로clock/expiry를검사한다. recentKSTday/contributorsmonth/query/fieldexpiresAt는동일revision만으로불변이아니다.

## 검증과 한계

수정전expiry재현10조건과SQL비용103→23프로브50조건을보존한다. 새제품warmDROP22,stalehint전체rerun/crossbinding,existingB6/CAS/terminal 및sameversionexpiry/권한변경/timeout/nonce/GPS/정확좌표/동의철회/서버시각경계를독립검증한다. 기존Chrome5폭과10/20명65초75msRTT조건을같이측정하고rows_read+계정1242requests62111reads665writes baseline의1h/8h수요를재계산한다. 모형을실제하루관측/한도소진시각으로보고하지않는다.

5초poll만으로20명8h115200요청이므로WorkerFree100000/day는어떤SQL보완만으로도충족하지않는다. 배포승인요청이아니다. 이전현재날짜todayvalidator실패는별도미해결원장에유지하고oldJSON날짜를고치지않는다. 새main의현재배치검사결과는별도입력으로구분한다. 기존active494b97source에서새S1R/B6가없다는잔여위험은사고증거와구분한다.


## 선택한 최소 클라이언트 보완 (2026-10-13)

sealed DTO는 대안으로 기록하되 구현하지 않는다. 미확인 기간에 정확좌표 cache를 새로 유지하는 복잡성과 history변형·field시계·월일경계를 피하기 위해 기존 destructive expiry를 유지한다. path+generation별 진행중 request만 합치고 완료자료는 보관하지 않는다. 초기pageshow는 현재bootstrap을 폐기하지 않으며 BFCache는 종전대로 전부 폐쇄한다. request-start5초 만료보다250ms앞선4750ms마다primary HEAD를 시작한다. 동일anchor일 때만 기존publicationRenew를 사용하고 변경/오류이면 전부 폐기한다.75msRTT에서공칭175ms여유이며 실제네트워크보장은아니다. 늦은응답/timeout/throttle에서는종전처럼만료·폐쇄·전체재조회한다.

permission최대나이는5초그대로이고 실제poll주기는4750ms다.HEAD-only약757.895/user-hour,20명8시간약121264로 원래5초이론하한115200보다많다. 따라서20명8시간WorkersFreePASS를주장하지않는다. 실제Chrome/D1및보안회귀전에는설계가설로구분한다.

자동승인검토가 기존부하harness의cold guard결과/예상23행을먼저바꾸는작업을거절했고 변경은실행되지않았다. 원형계약불일치실패를보존하고 별도측정probe로실제Worker-native/cold/warm 수치를먼저수집한다. 기대값변경으로성공처리하지않는다.


primary HEAD의권한revision은writes를포괄하지만월간기여자/recentquery는KSTday경계에서도달라진다. continuousrenewal이원래불필요expiryrefetch를피하게하므로firstnewKSTday를서버관찰시각에서감지하면기존파괴적invalidation+다시snapshot검증을수행한다. completedDTOcache나scope새값으로옛응답승격을하지않는다. fieldTTL은매renew의freshserverclock으로existingfieldIsActive가검사한다.
