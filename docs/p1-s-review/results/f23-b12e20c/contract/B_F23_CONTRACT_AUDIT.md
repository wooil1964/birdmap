# PR13 b12 F2/F3 독립 재검증

**이전 F2-a/F3 차단 반례는 해결됨.** 대상 b12e20c1b6d856a021898a0c1c9221b30393a221, 이전 a35b8598d55890e705042e4d6f88621357749d09, main bf74095adb3bf0b13f1aca31193c8d03cf8ff53f, combined tree 1065b16fcba94eeeb1a300d9b1e1953be9bfc65e. 전체 PR 배포 승인 판정은 root의 다른 검증·배포 준비와 별개다.

## 동일 assertion 재실행

|범위|이전 a35|새 b12|
|---|---:|---:|
|root/item F2 matrix|30/60|60/60|
|F3 typed|70/77|77/77|
|live merge|3/6|6/6|
|actual loader 추가|4/10|10/10|
|actual loader 기존|28/28|28/28|
|Python190 F2/F3|20/20·35/35|20/20·35/35|

기존회귀 S2 182/182·특별21/21·팝업12/12, source74/74·helper23/23, 추가80/80·JS numeric92/92·Python numeric92/92·weekly10/10도exit0이다. startDate schema진단4는기존별도범위로유지한다.

새 TypeError는 candidate/final/source/live에서0. F3 요청core60/60·extra today root6/6·ISO11/11·parser7/7. 무효 forecast 최고99는 주간 일반/갯벌/섬/선상에서 정상80+bonus16=rank96을 유지한다. 정상0/92/92.5/100 및92/rank108 대조는 별도 C1C2추가80과S2행렬에서 기존 assertion 그대로 통과했다.

복사된10개 스크립트는SHA/tree 메타데이터만 갱신했고 원본expected변환과byte-exact 일치한다. 제품 guard·실패 assertion·입력 shape를 완화하지 않았다. 새 제품 test loadApi의root 자동보정 adapter를 사용하지 않고 함수명 목록만 읽어 실제 Git index 함수들을 추출했다. source proof와 script provenance는 contract_summary.json.

## 실제 계약

index.html2071/2072/2077은 원본 시각을string일 때만 읽는다. 2085/2086은root와item 양쪽strict parser 결과가null이 아니고 같은instant이며root가미래아닌 경우에만적격을유지한다. 따라서 missing/null/빈item과무효root의적격승격은차단됐고today forecastobject도정상부적격으로끝난다. live2528/2553/2554는같은출처적격성을이어받아missing/null/빈item도미확인으로표시하고원본을변경하지않는다.

actual process_site/build_site_result/main은합성provider의190정상root=item10:50을생성하며today/week validators통과. 10:55재사용배치의ID14는item10:50/stale=true/eligible=false, 다른189는root=item10:55이고두validators통과. 최신main20:13발행을실제22:16KST에today190/week10640검사통과,JS190도root=item/current/eligible이다. 과거고정시계와실제현재검사는분리했다.

## 별도 입력집합·시간범위 차이

|입력(평가11:00)|Python 저장validator|JS 실제 후보/최종|해석|
|---|---|---|---|
|root=item canonical KST10:50|수락|92/rank108|정상대조|
|KSTroot/ISOitem 또는 역방향 동일instant|거부(raw문자열동일성)|92/rank108|동일순간의표현차이|
|root=item ISO+09 또는공백KST|거부(strictKST)|92/rank108|기존JS허용집합/정규화차이|
|root=item KST12:30 미래|수락|부적격·최종0|오프라인저장검증과실시간C시간판정차이|
|root=item KST05:41 오래된자료|수락|부적격·최종0|기존갱신일정/저장범위차이|
|미래ISO 또는잘못된달력|거부|최종0|거부대조|

같은9입력을이전a35 actual Python에재생했을때양측ISO/공백/잘못된달력은수락됐고새strictKST에서거부된다. 따라서이부분은새저장형식강화이며기존ISO전체차이로뭉뚱그리지않는다. mixedKST/ISO raw동일성거부와미래KST수락은이전에도같다. before/new각inputSHA가같아JSON교체차이로오산하지않았다.

Python validate_weather.py54는nonemptystr+raw동일,56은strictKST/달력형식만검사한다. 미래발행을datetime.now와비교하지않는다. JS3910parser는기존ISO+09/trim을허용하고2086및onSchedule은현재시계로판정한다. 정상generator는canonical KST를출력해현재main190모두이부분에일치한다.

위차이는자동회귀통과와분리하며“Python/JS전체동일계약”으로보고하지않는다. 미래/오래된자료는실제최종추천0이므로현재증거에서새안전우회차단사유로판정하지않는다. 오프라인validator도현재C적격을보증해야하는지또는생성스키마의저장적합성을보증하는지는의도미확인이다. 전자라면미래발행과허용시각표현의parity가추가조건이다.

## 재현·제한

정확명령/exit/stdio/session은execution_manifest.json과tool_execution_receipts.json,원본hash/metadata-only검증은contract_summary.json. 새하네스오류0. 모든요구재실행exit0이며별도9차이조건은pass율을꾸미지않는관찰원장이다.

actual DOM는이검사의범위가아니며Chrome/Leaflet와exactsame-root6조건은다른독립agent범위다. 실제운영malformed발생·실제해상안전을주장하지않는다. 원좌표저장0,제품/운영/main/D1/실사용자/리뷰Git변경0.
