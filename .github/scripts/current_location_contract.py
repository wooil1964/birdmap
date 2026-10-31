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


def without_recent_reports_message(text):
    text = text.replace('\r\n', '\n')
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
