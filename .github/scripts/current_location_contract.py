"""Normalize only the exact GPS additions approved for the 2026-10-28 feature."""
# Each pair includes unchanged context and is unique. No wildcard removes app code.
GPS_ISLANDS = [
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


def without_current_location(text):
    text = text.replace('\r\n', '\n')
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
