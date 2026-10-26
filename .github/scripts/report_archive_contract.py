"""Exclude the exact approved archive and basemap additions from HTML freeze checks."""
import subprocess

BASEMAP_HEAD = (
    '    <!-- Optional base-map configuration has no credential in the reviewed source. -->\n'
    '    <link rel="stylesheet" href="assets/birdmap-basemap.css">\n'
    '    <script src="assets/map-runtime-config.js"></script>\n'
    '    <script src="assets/birdmap-basemap.js"></script>\n'
    '    <script src="assets/birdmap-basemap-init.js"></script>\n'
)
BASEMAP_INITIALIZATION = (
    '            // Frame the existing map before requesting either base layer.\n'
    '            fitKoreaView();\n'
    '            var birdmapBasemap = null;\n'
    "            if (typeof initializeBirdmapBasemap === 'function') {\n"
    '                birdmapBasemap = initializeBirdmapBasemap(\n'
    '                    map_7010a44f6ac2025090f0fe07508ed485,\n'
    '                    tile_layer_62315ff8219cb818078bbef8d2f68bcb\n'
    '                );\n'
    '            } else {\n'
    '                tile_layer_62315ff8219cb818078bbef8d2f68bcb.addTo(map_7010a44f6ac2025090f0fe07508ed485);\n'
    '            }\n'
)
BASEMAP_ORIGINAL_INITIALIZATION = (
    '            tile_layer_62315ff8219cb818078bbef8d2f68bcb.addTo(map_7010a44f6ac2025090f0fe07508ed485);\n'
    '        \n'
    '    \n'
    '            fitKoreaView();\n'
)
BASEMAP_FOLLOWING_CONTEXT = '        \n    \n            L.control.fullscreen(\n'
BASEMAP_SIGNATURES = (
    'Optional base-map configuration',
    'assets/birdmap-basemap',
    'assets/map-runtime-config',
    'Frame the existing map before requesting either base layer.',
    'birdmapBasemap',
    'initializeBirdmapBasemap',
)


# Species names in the site history link to the archive search (assets/birdmap-species-search.*). Exact island right
# after the base-map head; stripped first so every freeze check that composes the base-map islands ignores it.
SPECIES_SEARCH_HEAD = (
    '    <link rel="stylesheet" href="assets/birdmap-species-search.css">\n'
    '    <script src="assets/birdmap-species-search.js"></script>\n'
)


def without_species_search(text):
    if 'birdmap-species-search' not in text:
        return text
    if text.count(SPECIES_SEARCH_HEAD) != 1 or text.count(BASEMAP_HEAD + SPECIES_SEARCH_HEAD) != 1:
        raise ValueError('Exact approved species-search head must occur once, right after the base-map head')
    text = text.replace(SPECIES_SEARCH_HEAD, '', 1)
    if 'birdmap-species-search' in text:
        raise ValueError('Unexpected species-search fragment outside the approved head')
    return text


def without_approved_basemap(text):
    text = without_species_search(text.replace('\r\n', '\n'))
    if not any(signature in text for signature in BASEMAP_SIGNATURES):
        return text
    # These are two exact approved text islands, not open-ended marker regions.
    # Partial, duplicated or edited islands must never widen the freeze scope.
    if (text.count(BASEMAP_HEAD) != 1 or text.count(BASEMAP_INITIALIZATION) != 1
            or text.count(BASEMAP_INITIALIZATION + BASEMAP_FOLLOWING_CONTEXT) != 1):
        raise ValueError('Exact approved basemap head and initialization must each occur once')
    text = text.replace(BASEMAP_HEAD, '', 1)
    text = text.replace(BASEMAP_INITIALIZATION, BASEMAP_ORIGINAL_INITIALIZATION, 1)
    if any(signature in text for signature in BASEMAP_SIGNATURES):
        raise ValueError('Unexpected basemap fragment outside approved additions')
    return text


BUTTON = '  <button id="reportArchiveOpen" class="contribMore" type="button" onclick="openReportArchive()">전체 보기</button>\n'
HOOK = " if(typeof clearReportArchive==='function')clearReportArchive();\n"
BLOCKS = [
    ('<!-- report-archive:modal:start -->\n', '<!-- report-archive:modal:end -->\n'),
    ('/* report-archive:styles:start */\n', '/* report-archive:styles:end */\n'),
    ('/* report-archive:script:start */\n', '/* report-archive:script:end */\n\n'),
]


def without_report_archive(text):
    text = without_approved_basemap(text.replace('\r\n', '\n'))
    if 'report-archive:' not in text and 'id="reportArchiveOpen"' not in text:
        return text
    from island_nearby_contract import without_island_nearby
    text = without_island_nearby(text)
    for literal in (BUTTON, HOOK):
        if text.count(literal) != 1:
            raise ValueError('Archive entry/hook must occur exactly once')
        text = text.replace(literal, '', 1)
    for start, end in BLOCKS:
        if text.count(start) != 1 or text.count(end) != 1:
            raise ValueError('Archive boundaries must occur exactly once')
        before, remainder = text.split(start, 1)
        block, after = remainder.split(end, 1)
        if not block.strip():
            raise ValueError('Archive block must not be empty')
        text = before + after
    return text


def automatic_data_base(root):
    # PR merge CI uses the main parent. Local feature branches use their main base.
    parents = subprocess.check_output(['git', 'rev-list', '--parents', '-n', '1', 'HEAD'], cwd=root).split()
    if len(parents) > 2:
        return 'HEAD^1'
    return subprocess.check_output(['git', 'merge-base', 'HEAD', 'origin/main'], cwd=root, text=True).strip()
