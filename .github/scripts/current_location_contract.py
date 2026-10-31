"""Normalize exact reviewed additions before the shared historical HTML freeze checks."""
# PR #58: only these three literal replacements may differ for the recent-report message.
# Reconstruct the original text; never discard the surrounding title or style block.
RECENT_REPORTS_MESSAGE_ISLANDS = (
    (
        '  <div id="recentReportsTitle">최근 출현 제보<span id="recentReportsCount"></span><span id="recentReportsHint">글을 클릭하면 지도에 보입니다.</span></div>\n',
        '  <div id="recentReportsTitle"><span id="recentReportsLabel">최근 출현 제보<span id="recentReportsCount"></span></span><span id="recentReportsMessage">당신의 제보가 지도가 됩니다!</span><span id="recentReportsHint">글을 클릭하면 지도에 보입니다.</span></div>\n',
    ),
    (
        '#recentReportsBox{display:none;position:fixed;right:30px;bottom:60px;z-index:9990;width:250px;max-height:48vh;\n'
        '  flex-direction:column;box-sizing:border-box;\n',
        '#recentReportsBox{display:none;position:fixed;right:30px;bottom:60px;z-index:9990;width:360px;max-height:48vh;\n'
        '  flex-direction:column;box-sizing:border-box;\n',
    ),
    (
        '#recentReportsTitle{display:flex;flex-wrap:wrap;align-items:baseline}\n',
        '#recentReportsTitle{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:8px}\n'
        '#recentReportsLabel{white-space:nowrap}\n'
        '#recentReportsMessage{max-width:100%;font-size:12px;font-weight:normal;line-height:1.35;color:#39766f;word-break:keep-all;overflow-wrap:anywhere;cursor:default}\n'
        '/* 모바일 제목의 펼침 영역 위에 놓아 안내 문구에는 클릭 동작이 없다. */\n'
        '@media (max-width:700px), (hover:none) and (pointer:coarse) and (max-width:1023px) and (max-height:500px){\n'
        '  body #recentReportsTitle{flex-wrap:wrap;align-content:center;row-gap:0;line-height:1.35}\n'
        '  body #recentReportsMessage{flex-basis:100%;position:relative;z-index:1}\n'
        '}\n',
    ),
)
RECENT_REPORTS_MESSAGE_SIGNATURES = (
    'recentReportsLabel', 'recentReportsMessage',
    'z-index:9990;width:360px;max-height:48vh;',
)


# A-grade sites (IDs 235-238, 240-245, 247; 239 and 246 reserved): the reviewed records appended to the single concat block and the
# title text. The records are rebuilt from the reviewed source JSON, so any other change still fails the freezes.
A_GRADE_TITLE = (
    '최종 업데이트: 2026.10.19<span class="titleDetail"> · 수도권 21곳 추가</span> · <span id="mapTitleSiteCount">229</span>',
    '최종 업데이트: 2026.10.31<span class="titleDetail"> · 신규 11곳 추가</span> · <span id="mapTitleSiteCount">240</span>',
)


def without_a_grade_sites(text):
    text = text.replace('\r\n', '\n')
    if '"id":"235"' not in text and A_GRADE_TITLE[1] not in text:
        return text
    import json
    from pathlib import Path
    source = json.loads((Path(__file__).resolve().parents[2] / 'data/a-grade-birding-sites-20261031.json').read_text(encoding='utf-8'))
    rows = [json.dumps(r['site'], ensure_ascii=False, separators=(',', ':')) for r in source['records']]
    block = ',\n' + ''.join('  ' + row + (',\n' if i < len(rows) - 1 else '\n') for i, row in enumerate(rows)) + ']);\n'
    if text.count(block) != 1 or text.count(A_GRADE_TITLE[1]) != 1 or A_GRADE_TITLE[0] in text:
        raise ValueError('Exact A-grade site block and title must each occur once')
    text = text.replace(block, ']);\n', 1).replace(A_GRADE_TITLE[1], A_GRADE_TITLE[0], 1)
    if any('"id":"%s"' % r['site']['id'] in text for r in source['records']) or '"id":"239"' in text:
        raise ValueError('Unexpected A-grade site record outside the reviewed block')
    for old, new in A_GRADE_ENGINE_ISLANDS:
        # Each new text contains its old text, so check that exactly one old copy remains after reverting.
        if text.count(new) != 1:
            raise ValueError('Each exact A-grade engine change must occur once')
        text = text.replace(new, old, 1)
        if text.count(old) != 1:
            raise ValueError('A-grade engine change must replace its only original copy')
    if any(value in text for value in A_GRADE_ENGINE_SIGNATURES):
        raise ValueError('Unexpected A-grade engine fragment outside the reviewed changes')
    return text


# Popup engine changes for the A-grade draft: tide notices that never point at missing monthly data, and
# evidence-pending records (speciesEvidence/birdingTypeExplicit) that never name species groups. Existing records
# carry neither field, so their output is unchanged except the monthly hint, now shown only for monthly sites.
A_GRADE_ENGINE_ISLANDS = (
    ("function v25EnvironmentLabel(site){\n",
     "function v25EnvironmentLabel(site){\n"
     "  // 명시 유형을 가진 레코드는 이름·환경 문구 속 낱말(예: 번식섬)로 유형을 추정하지 않는다.\n"
     "  if(site.birdingTypeExplicit===true&&site.environmentBirdingLabel)return String(site.environmentBirdingLabel);\n"),
    ("  if(environment==='갯벌탐조')return '만조 전후 도요·물떼새 탐조에 좋은 조건인지 확인하세요.';\n",
     "  if(environment==='갯벌탐조'&&site.speciesEvidence==='근거 부족')return '만조 전후 갯벌 노출과 물때를 함께 확인하세요.';\n"
     "  if(environment==='갯벌탐조')return '만조 전후 도요·물떼새 탐조에 좋은 조건인지 확인하세요.';\n"),
    ("  if(/저수지탐조|호수탐조|습지탐조/.test(environment))return '수면이 안정적이면 물새 관찰에 유리합니다.';\n",
     "  if(/저수지탐조|호수탐조|습지탐조/.test(environment)&&site.speciesEvidence==='근거 부족')return '수면이 안정적이면 원거리 관찰에 유리합니다.';\n"
     "  if(/저수지탐조|호수탐조|습지탐조/.test(environment))return '수면이 안정적이면 물새 관찰에 유리합니다.';\n"),
    ("  if(environment==='갯벌탐조')return '도요·물떼새와 수변 조류를 중심으로 관찰하는 곳입니다.';\n",
     "  // 날짜 있는 종 기록이 없는 탐조지는 서식지 유형만으로 관찰 조류를 단정하지 않는다.\n"
     "  if(site.speciesEvidence==='근거 부족')return '최근 종 관찰 기록을 확인하는 중인 곳입니다. 출현종은 현장 관찰 기록으로 확인하세요.';\n"
     "  if(environment==='갯벌탐조')return '도요·물떼새와 수변 조류를 중심으로 관찰하는 곳입니다.';\n"),
    ("  var prefix=month+'월 '+season+'철에는 ';\n",
     "  var prefix=month+'월 '+season+'철에는 ';\n"
     "  if(site.speciesEvidence==='근거 부족')return prefix+'서식지 특성만 참고하고, 실제 출현종은 최근 관찰 기록으로 확인하세요.';\n"),
    ("  if(daily)return daily;\n"
     "  return dailyIsToday?null:{staleDaily:true,staleDailyDate:tideTodayDateText(),monthFallbackMissing:true};\n",
     "  if(daily)return daily;\n"
     "  return dailyIsToday?null:{staleDaily:true,staleDailyDate:tideTodayDateText(),monthFallbackMissing:true,siteId:String(site.id)};\n"),
    ("  return '<div class=\"smallText v26TideFallbackMissing\">오늘 조석자료를 불러오지 못했습니다. 월간 조석표를 확인해 주세요.</div>';\n",
     "  // 월간 조석표가 있는 탐조지에만 월간 확인을 안내한다(버튼 표시 기준과 같음).\n"
     "  var month=MONTH_TIDE_SITE_IDS.has(String(tide.siteId))?' 월간 조석표를 확인해 주세요.':'';\n"
     "  return '<div class=\"smallText v26TideFallbackMissing\">오늘 조석자료를 불러오지 못했습니다.'+month+'</div>';\n"),
    ("function v24TideHtml(tide){\n",
     "function v24TideHtml(tide,site){\n"
     "  // 오늘 일별 파일에 이 탐조지 항목 자체가 없으면(등록 직후 첫 생성 전 등) 준비 중/미제공으로 구분한다.\n"
     "  if(!tide&&site&&tideTodayIsCurrent()&&tideToday&&tideToday.sites&&!tideToday.sites[String(site.id)])\n"
     "    return '<div class=\"v24BriefingItem v24ProfileWide\"><b>조석:</b> '+(site.tideUse==='예'?'조석 자료 준비 중':'조석 자료 미제공')+'</div>';\n"),
    ("  if(site.showTide)typeItems+=v24TideHtml(tide)+monthTideButtonHtml(site);\n",
     "  if(site.showTide)typeItems+=v24TideHtml(tide,site)+monthTideButtonHtml(site);\n"),
)
A_GRADE_ENGINE_SIGNATURES = ('birdingTypeExplicit', 'speciesEvidence', 'tide.siteId', '조석 자료 준비 중', 'v24TideHtml(tide,site)')


def without_recent_reports_message(text):
    text = without_a_grade_sites(text)
    if not any(value in text for value in RECENT_REPORTS_MESSAGE_SIGNATURES):
        return text
    for old, new in RECENT_REPORTS_MESSAGE_ISLANDS:
        if text.count(new) != 1 or old in text:
            raise ValueError('Each exact PR #58 HTML/CSS replacement must occur once, without its old copy')
        text = text.replace(new, old, 1)
    if any(value in text for value in RECENT_REPORTS_MESSAGE_SIGNATURES):
        raise ValueError('Unexpected recent-report message fragment outside the reviewed replacements')
    return text


# Each pair includes unchanged context and is unique. No wildcard removes app code.
GPS_ISLANDS = [
    ("        siteSpotLayers[index]=birdmapSpotMarker(fixed.lat,fixed.lon,\n          (site?site.name:'')+' 출현 지점',fixed.species,reportFixedHistory[fixed.id],true);\n",
     "        siteSpotLayers[index]=birdmapSpotMarker(fixed.lat,fixed.lon,\n          (site?site.name:'')+' 출현 지점',fixed.species,reportFixedHistory[fixed.id],true,false,{lat:fixed.lat,lon:fixed.lon,fixedSpotId:fixed.id});\n"),
    ('    <script src="assets/birdmap-species-search.js"></script>\n</head>\n',
     '    <script src="assets/birdmap-species-search.js"></script>\n    <link rel="stylesheet" href="assets/birdmap-location.css"/>\n    <script src="assets/birdmap-location.js"></script>\n</head>\n'),
    ('  var kakao=spotKakaoRouteHtml(dest),tmap=spotTmapRouteHtml(dest);\n  var html=kakao||tmap?\'<div class="spotRouteButtons">\'+kakao+tmap+\'</div>\':\'\';\n  return dest&&dest.publicationReportId?html.replace(/href="[^"]*"/g,\'href="#"\').replace(/onclick="[^"]*"/g,\'\').replace(/class="spotKakaoRoute"/g,\'class="spotKakaoRoute" data-publication-app="kakao"\').replace(/class="spotTmapRoute"/g,\'class="spotTmapRoute" data-publication-app="tmap"\').replace(/<a /g,\'<a data-publication-report="\'+escapeHtml(dest.publicationReportId)+\'" \'):html;\n',
     '  var kakao=spotKakaoRouteHtml(dest),tmap=spotTmapRouteHtml(dest);\n  var gps=dest&&(dest.publicationReportId||dest.fixedSpotId)?\'<button type="button" class="birdmap-location-link" \'+(dest.publicationReportId?\'data-location-report="\'+escapeHtml(dest.publicationReportId):\'data-location-fixed="\'+escapeHtml(dest.fixedSpotId))+\'">내 위치 찾기</button>\':\'\';\n  var html=kakao||tmap?\'<div class="spotRouteButtons">\'+kakao+tmap+gps+\'</div>\':\'\';\n  return dest&&dest.publicationReportId?html.replace(/href="[^"]*"/g,\'href="#"\').replace(/onclick="[^"]*"/g,\'\').replace(/class="spotKakaoRoute"/g,\'class="spotKakaoRoute" data-publication-app="kakao"\').replace(/class="spotTmapRoute"/g,\'class="spotTmapRoute" data-publication-app="tmap"\').replace(/<a /g,\'<a data-publication-report="\'+escapeHtml(dest.publicationReportId)+\'" \'):html;\n'),
    ("      siteSpotLayers[i]=birdmapSpotMarker(spot.lat,spot.lon,site.name+' 출현 지점',spot.species,\n        reportFixedHistory[spot.id],true);\n    }\n",
     "      siteSpotLayers[i]=birdmapSpotMarker(spot.lat,spot.lon,site.name+' 출현 지점',spot.species,\n        reportFixedHistory[spot.id],true,false,{lat:spot.lat,lon:spot.lon,fixedSpotId:spot.id});\n    }\n"),
    ("    layer.setPopupContent(spotPopupHtml((site?site.name:'')+' 출현 지점',spot.species,\n      reportFixedHistory[spot.id],true));\n  });\n",
     "    layer.setPopupContent(spotPopupHtml((site?site.name:'')+' 출현 지점',spot.species,\n      reportFixedHistory[spot.id],true,false,{lat:spot.lat,lon:spot.lon,fixedSpotId:spot.id}));\n  });\n"),
    ("    +(site.country==='대한민국'&&!isGukhwado?tmapNavigationLink(isYubudo?{lat:Number(yubudoDepartureLat),lon:Number(yubudoDepartureLon)}:site,isYubudo?'유부도 출항지':site.name,'btn tmap',isYubudo?'🚙 티맵 출항지':'🚙 티맵 내비'):'')\n    +link('a.ebird','btn ebird',ebirdText,ebirdUrl,SHOW_EBIRD_BUTTON)\n",
     '    +(site.country===\'대한민국\'&&!isGukhwado?tmapNavigationLink(isYubudo?{lat:Number(yubudoDepartureLat),lon:Number(yubudoDepartureLon)}:site,isYubudo?\'유부도 출항지\':site.name,\'btn tmap\',isYubudo?\'🚙 티맵 출항지\':\'🚙 티맵 내비\'):\'\')\n    +\'<button type="button" class="btn birdmap-location-link" data-location-site="\'+escapeHtml(String(site.id))+\'">내 위치 찾기</button>\'\n    +link(\'a.ebird\',\'btn ebird\',ebirdText,ebirdUrl,SHOW_EBIRD_BUTTON)\n'),
]


# Compact report-location panel with place search (assets/birdmap-report-pick-search.*): one exact head island
# right before the base-map head. Stripped here because every index.html freeze check routes through this function.
REPORT_PICK_SEARCH_HEAD = (
    '    <link rel="stylesheet" href="assets/birdmap-report-pick-search.css"/>\n'
    '    <script src="assets/birdmap-report-pick-search.js"></script>\n'
)
REPORT_PICK_SEARCH_NEXT = '    <!-- Optional base-map configuration has no credential in the reviewed source. -->\n'


def without_report_pick_search(text):
    if 'birdmap-report-pick-search' not in text:
        return text
    if text.count(REPORT_PICK_SEARCH_HEAD) != 1 or text.count(REPORT_PICK_SEARCH_HEAD + REPORT_PICK_SEARCH_NEXT) != 1:
        raise ValueError('Exact report-pick search head must occur once, right before the base-map head')
    text = text.replace(REPORT_PICK_SEARCH_HEAD, '', 1)
    if 'birdmap-report-pick-search' in text:
        raise ValueError('Unexpected report-pick search fragment outside the approved head')
    return text


def without_current_location(text):
    # All archive, basemap, site and GPS HTML freeze checks share this entry point.
    text = without_report_pick_search(without_recent_reports_message(text))
    signatures = ('birdmap-location', 'data-location-', 'fixedSpotId')
    if not any(value in text for value in signatures):
        return text
    for old, new in GPS_ISLANDS:
        if text.count(new) != 1:
            raise ValueError('Exact GPS addition must occur once with its original context')
        text = text.replace(new, old, 1)
    if any(value in text for value in signatures):
        raise ValueError('Unexpected GPS fragment outside approved additions')
    return text
