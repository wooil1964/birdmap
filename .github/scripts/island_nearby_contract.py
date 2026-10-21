"""Remove only the reviewed pilot additions from historical whole-HTML freezes."""
import hashlib

HASHES = {
    'styles': 'df2c8b0f53ddeaae0adf7caa9b6facefcaead40390081d38ddc3358ec9da0731',
    'script': '3ba2e577cc3e42eb6697bb2f17c5f6e38bb24a3f49993f03ccbff3edc24aea3d',
}
HOOK = '    islandNearbySearchHtml(site)+\n'
FOLLOWING = '    v23ButtonsFromLegacy(source,site)+\n'
SIGNATURES = ('island-nearby:', 'island-nearby-search', 'islandNearbySearchHtml', 'ISLAND_NEARBY_PILOT')


def without_island_nearby(text):
    text = text.replace('\r\n', '\n')
    if not any(value in text for value in SIGNATURES):
        return text
    for kind, expected in HASHES.items():
        start = f'/* island-nearby:{kind}:start */\n'
        end = f'/* island-nearby:{kind}:end */\n' + ('\n' if kind == 'script' else '')
        if text.count(start) != 1 or text.count(end) != 1:
            raise ValueError('Pilot boundaries must occur exactly once')
        before, rest = text.split(start, 1)
        content, after = rest.split(end, 1)
        if hashlib.sha256((start + content + end).encode()).hexdigest() != expected:
            raise ValueError('Pilot addition differs from the reviewed exact content')
        text = before + after
    if text.count(HOOK) != 1 or text.count(HOOK + FOLLOWING) != 1:
        raise ValueError('Pilot popup hook must occur exactly once in its reviewed position')
    text = text.replace(HOOK, '', 1)
    if any(value in text for value in SIGNATURES):
        raise ValueError('Unexpected pilot fragment outside reviewed additions')
    return text
