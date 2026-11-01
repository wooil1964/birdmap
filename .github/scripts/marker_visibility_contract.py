"""Reverse only the four exact reviewed PR #62 index.html marker changes for historical freezes."""

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
    text = text.replace('\r\n', '\n')
    if not any(signature in text for signature in MARKER_VISIBILITY_SIGNATURES):
        return text
    for old, new in MARKER_VISIBILITY_ISLANDS:
        if text.count(new) != 1 or old in text:
            raise ValueError('Each exact PR #62 marker replacement must occur once, without its old copy')
        text = text.replace(new, old, 1)
    if any(signature in text for signature in MARKER_VISIBILITY_SIGNATURES):
        raise ValueError('Unexpected marker visibility fragment outside the reviewed replacements')
    return text
