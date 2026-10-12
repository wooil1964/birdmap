# PR17 최종 독립 감사 체크포인트

2026-10-12. 검증 제품 소스 cf5767b / 6d0f435(동일 제품blob), 통합main58e1a22. 사용자의 최신 지시로 Workers Free의10·20명 실제 호출·하루한도를 먼저 보고하며 운영 반영은 보류한다.

완료: 새 독립결함 B1 field maintenance/writefreeze, B2 stale HEAD 공유, B3 RTT가 늘린lease, B4 동적href 우회, B5 기여자 동의cache를 보완했다. 회귀704/0/1skip, Chrome241/241 5폭, actualworkerd22, 실제localWrangler migration30+정합성3 통과. 전체시험 과거실패 로그는 그대로 보존했다.190/176 고정2026-10-08 22:40KST ON/OFF signature 불변; 최신main curated route21 통과와자동JSON/좌표보존 확인.

읽기전용 CI: cf5767b run38236007580 실패(Pillow누락2), 환경만보완한6d0f435 run38236592619 성공(704+Chrome241). 테스트 삭제/판정 완화 없음. 보호Pages artifact11741316486 388파일 Gitblob과같음, ZIPsha f6e161e7e07757491de859991572f68ea1ebf4092b97f8203e419e7fef626167. CItestmerge7b136fc이고main배포아님.

실제업로드된 보호유지standby: public1f00aa4e-cdff-4f79-aab1-3d76e62669b0/admincf2b8b90-b00d-4356-ad85-78ae1e8bb4c0. 같은보호소스의maintenance: publicd403e20b-f2f7-4024-b702-b756d17a924a/admin9ba936ff-b3a7-4e9f-9c72-440a8a03c50e. stricttrue,D1/peer/secret바인딩유지,previewroutingfalse검증. trafficactivation0/D1writes0. 현운영494b97/0134cd9a 그대로이며 둘 다 Git41650e43 exactbundle. S1R/권한guard없는 기존버전은 안전rollback으로 승인불가. 이전16dae 미증명.

운영 D1 metadata:79objects(51defined28implicit), coreReadytrue, ledger0001/0002/0003, publicationstate없음. field3; reports는오후55approved에서60으로자연변경됐으나 우리쓰기는0. 실제68개원본을복제했다거나운영자료모두불변을검증했다고주장하지말 것. migration전용dir0005만사용,0004등기설치SQL재생금지.

현재진행: 실제Chrome10·20명65초 이상 foreground/background/복구호출 측정 + localD1endpoint costmap. 사용자제공Free1230queries58000reads496writes1.44MB와 GraphQL24h전체계정Worker1242/D1reads62111자료를별도표기. D1query수≠Workerreq. Free5mreads/100krequests는계정전체한도다. physicalGPS/native앱/운영POP/실제migration/traffic배포/Pages신규반영은미실행.

다음: 최신head/main확인→부하실험완료근거수집→endpoint실측과Chromecounts로일별증분/10·20명/활성이용시간분석→최종FINDINGS/NEXT_SESSION/원장→PR17/Issue9게시본문재확인. 최신사용자는현재수치로배포승인금지,결과먼저요청했다. 용량관문을통과하지못하면BLOCKED로보고한다. polling/lease연장,private좌표cache,failopen으로비용을줄이지않는다.