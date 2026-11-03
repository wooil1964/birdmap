"""Reverse only the four exact reviewed PR #62 index.html marker changes for historical freezes."""
from hashlib import sha256

GA4_HEAD = (
    '    <link rel="stylesheet" href="./assets/birdmap-ga4-consent.css">\n'
    '    <script src="./assets/birdmap-ga4-consent.js" defer></script>\n'
)
GA4_HEAD_NEXT = '    <link rel="stylesheet" href="assets/birdmap-report-pick-search.css"/>\n'
GA4_PANEL_START = '<details class="birdmap-ga4-settings" data-ga4-settings hidden>\n'
GA4_PANEL_NEXT = '<!-- Cloudflare Web Analytics -->'
GA4_PANEL_SHA256 = 'bb0dc2cf1cd969491cadc099e856f006f532ac5ef3c5bedff000d0ea3751b3fc'
GA4_SIGNATURES = ('birdmap-ga4-', 'data-ga4-')


def without_ga4(text):
    # Historical HTML comparisons may ignore only these two GA4 additions.
    if not any(signature in text for signature in GA4_SIGNATURES):
        return text
    if (text.count(GA4_HEAD) != 1 or text.count(GA4_HEAD + GA4_HEAD_NEXT) != 1
            or text.count(GA4_PANEL_START) != 1):
        raise ValueError('Exact GA4 head and consent panel must each occur once')
    before, panel_start = text.split(GA4_PANEL_START, 1)
    panel_body, boundary, after = panel_start.partition(GA4_PANEL_NEXT)
    panel = GA4_PANEL_START + panel_body
    if not boundary or sha256(panel.encode('utf-8')).hexdigest() != GA4_PANEL_SHA256:
        raise ValueError('GA4 consent panel must match its reviewed markup')
    text = (before + boundary + after).replace(GA4_HEAD, '', 1)
    if any(signature in text for signature in GA4_SIGNATURES):
        raise ValueError('Unexpected GA4 fragment outside the reviewed additions')
    return text

MARKER_VISIBILITY_ISLANDS = (
    (
        '    <script src="assets/birdmap-location.js"></script>\n'
        '</head>\n',
        '    <script src="assets/birdmap-location.js"></script>\n'
        '    <link rel="stylesheet" href="assets/birdmap-markers.css">\n'
        '    <script src="assets/birdmap-markers.js"></script>\n'
        '</head>\n'
    ),
    (
        'function birdmapSpotMarker(lat,lon,title,species,history,undatedNote,locationHidden,kakaoDest){\n'
        "  var names=(species||[]).map(escapeHtml).join(' · ');\n"
        "  return L.circleMarker([lat,lon],{radius:5,color:'#d32f2f',weight:2,fillColor:'#d32f2f',fillOpacity:.85})\n"
        '    .bindPopup(spotPopupHtml(title,species,history,undatedNote,locationHidden,kakaoDest),{maxWidth:300})\n'
        '    .bindTooltip(names,{sticky:true});\n'
        '}\n',
        'function birdmapSpotMarker(lat,lon,title,species,history,undatedNote,locationHidden,kakaoDest){\n'
        "  if(typeof birdmapMarkers!=='undefined')birdmapMarkers.prepare();\n"
        "  var names=(species||[]).map(escapeHtml).join(' · ');\n"
        "  return L.circleMarker([lat,lon],{radius:5,color:'#d32f2f',weight:2,fillColor:'#d32f2f',fillOpacity:.85,birdmapMarkerKind:'report',pane:typeof birdmapMarkers!=='undefined'?'birdmap-report-markers':'overlayPane'})\n"
        '    .bindPopup(spotPopupHtml(title,species,history,undatedNote,locationHidden,kakaoDest),{maxWidth:300})\n'
        '    .bindTooltip(names,{sticky:true});\n'
        '}\n'
    ),
    (
        'function birdmapPendingMarker(spot){\n'
        "  var names=(spot.species||[]).map(escapeHtml).join(' · ');\n"
        '  return L.circleMarker([spot.lat,spot.lon],\n'
        "    {radius:5,color:'#a4700a',weight:2,fillColor:'#f7c948',fillOpacity:.9})\n"
        '    .bindPopup(pendingPopupHtml(spot),{maxWidth:300})\n'
        "    .bindTooltip(names+' · 승인 대기',{sticky:true});\n"
        '}\n',
        'function birdmapPendingMarker(spot){\n'
        "  if(typeof birdmapMarkers!=='undefined')birdmapMarkers.prepare();\n"
        "  var names=(spot.species||[]).map(escapeHtml).join(' · ');\n"
        '  return L.circleMarker([spot.lat,spot.lon],\n'
        "    {radius:5,color:'#a4700a',weight:2,fillColor:'#f7c948',fillOpacity:.9,birdmapMarkerKind:'report',pane:typeof birdmapMarkers!=='undefined'?'birdmap-report-markers':'overlayPane'})\n"
        '    .bindPopup(pendingPopupHtml(spot),{maxWidth:300})\n'
        "    .bindTooltip(names+' · 승인 대기',{sticky:true});\n"
        '}\n'
    ),
    (
        'function applyResponsiveMarkerSizes(){\n'
        "  var mobile=window.matchMedia('(max-width: 700px)').matches;\n"
        '  siteData.forEach(function(site){\n'
        '    var marker=markerRegistry[markerKey(site)],icon=marker&&marker.options.icon;\n'
        '    if(!icon)return;\n'
        '    if(!icon._birdmapDesktopMetrics){\n'
        '      icon._birdmapDesktopMetrics={\n'
        '        iconSize:markerPoint(icon.options.iconSize),\n'
        '        iconAnchor:markerPoint(icon.options.iconAnchor),\n'
        '        popupAnchor:markerPoint(icon.options.popupAnchor)\n'
        '      };\n'
        '    }\n'
        '    var original=icon._birdmapDesktopMetrics;\n'
        '    icon.options.iconSize=mobile?scaledMarkerPoint(original.iconSize,.74):markerPoint(original.iconSize);\n'
        '    icon.options.iconAnchor=mobile?scaledMarkerPoint(original.iconAnchor,.74):markerPoint(original.iconAnchor);\n'
        '    icon.options.popupAnchor=mobile?scaledMarkerPoint(original.popupAnchor,.74):markerPoint(original.popupAnchor);\n'
        '    marker.setIcon(icon);\n'
        '  });\n'
        '}\n',
        'function applyResponsiveMarkerSizes(){\n'
        '  birdmapMarkers.refreshSites();\n'
        '}\n'
    ),
)
MARKER_VISIBILITY_SIGNATURES = ('birdmapMarkers', 'birdmap-markers', 'birdmapMarkerKind', 'birdmap-report-markers')


def without_marker_visibility(text):
    text = without_ga4(text.replace('\r\n', '\n'))
    if not any(signature in text for signature in MARKER_VISIBILITY_SIGNATURES):
        return text
    for old, new in MARKER_VISIBILITY_ISLANDS:
        if text.count(new) != 1 or old in text:
            raise ValueError('Each exact PR #62 marker replacement must occur once, without its old copy')
        text = text.replace(new, old, 1)
    if any(signature in text for signature in MARKER_VISIBILITY_SIGNATURES):
        raise ValueError('Unexpected marker visibility fragment outside the reviewed replacements')
    return text
