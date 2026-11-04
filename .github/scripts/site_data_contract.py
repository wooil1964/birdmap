"""PR-relative site contracts. Evidence is not a substitute for human approval.

Protected grants are read ONLY from the base main tree: adding a grant to the
candidate cannot approve that candidate. A future grant needs a separate,
user-approved main change and independent review before a data-change PR.
"""
import hashlib
import json
import math
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[2]
REVIEWS = '.github/scripts/fixtures/site_data_change_reviews.json'
PROTECTED = ('lat', 'lon', 'pelagic')
SHA = re.compile(r'[0-9a-f]{40}\Z')
INITIAL = re.compile(r'\bvar\s+siteData\s*=\s*')
CONCAT = re.compile(r'\bsiteData\s*=\s*siteData\.concat\(\s*')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key')
        result[key] = value
    return result


def _constant(value):
    raise ValueError('Non-finite JSON number')


DECODER = json.JSONDecoder(object_pairs_hook=_pairs, parse_constant=_constant)


def json_value(text):
    return json.loads(text, object_pairs_hook=_pairs, parse_constant=_constant)


def git(root, *args):
    try:
        return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.PIPE).decode('utf-8')
    except subprocess.CalledProcessError as error:
        raise ValueError('Required Git baseline/object unavailable') from error


def baseline_ref(root=ROOT, environ=None):
    """Runner event is authoritative in CI; local bases must belong to main."""
    env = os.environ if environ is None else environ
    if env.get('GITHUB_ACTIONS') == 'true':
        require(not env.get('SITE_DATA_BASE_REF'), 'CI baseline overrides are forbidden')
        name = env.get('GITHUB_EVENT_NAME')
        if name == 'pull_request':
            event = json_value(Path(env['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
            pr = event.get('pull_request', {})
            base = pr.get('base', {})
            require(base.get('ref') == 'main', 'PR base must be main')
            ref = base.get('sha', '')
            require(isinstance(ref, str) and SHA.fullmatch(ref), 'Missing exact PR base SHA')
            require(git(root, 'cat-file', '-t', ref).strip() == 'commit', 'PR base snapshot must name a commit')
            expected_repo = env.get('GITHUB_REPOSITORY')
            if expected_repo:
                require(base.get('repo', {}).get('full_name') == expected_repo, 'Wrong base repository')
            number, candidate = event.get('number'), pr.get('head', {}).get('sha')
            require(type(number) is int and number > 0 and env.get('GITHUB_REF') == f'refs/pull/{number}/merge',
                    'PR requires the runner merge-ref context')
            require(isinstance(candidate, str) and SHA.fullmatch(candidate), 'Missing PR head SHA')
            parents = git(root, 'rev-list', '--parents', '-n', '1', 'HEAD').split()
            require(len(parents) == 3 and env.get('GITHUB_SHA') == parents[0] and parents[2] == candidate,
                    'Checkout is not the runner PR merge commit')
            # The event's base snapshot may predate a bot update. The checked-out
            # merge's main parent is the actual data/approval baseline under test.
            git(root, 'merge-base', '--is-ancestor', ref, parents[1])
            ref = parents[1]
        else:
            require(name == 'workflow_dispatch' and env.get('GITHUB_REF') == 'refs/heads/main',
                    'CI requires a PR event or an explicit main dispatch')
            ref = git(root, 'rev-parse', '--verify', 'origin/main^{commit}').strip()
            require(ref == env.get('GITHUB_SHA'), 'Dispatch must check current main')
    else:
        requested = env.get('SITE_DATA_BASE_REF')
        ref = (git(root, 'rev-parse', '--verify', requested + '^{commit}').strip() if requested
               else git(root, 'merge-base', 'HEAD', 'origin/main').strip())
        git(root, 'merge-base', '--is-ancestor', ref, 'origin/main')
    require(isinstance(ref, str) and SHA.fullmatch(ref), 'Invalid baseline SHA')
    git(root, 'cat-file', '-e', ref + '^{commit}')
    git(root, 'merge-base', '--is-ancestor', ref, 'origin/main')
    git(root, 'merge-base', '--is-ancestor', ref, 'HEAD')
    return ref


def baseline_bytes(root, ref, name):
    try:
        return subprocess.check_output(['git', 'show', ref + ':' + name], cwd=root,
                                       stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as error:
        raise ValueError('Required baseline file unavailable: ' + name) from error


def _arrays(text):
    initial = INITIAL.search(text)
    require(initial is not None, 'Runtime siteData declaration missing')
    parts = []
    previous_end = -1
    for match in [initial, *CONCAT.finditer(text)]:
        if match.start() < previous_end:  # A literal string can mention concat syntax.
            continue
        value, length = DECODER.raw_decode(text[match.end():])
        require(isinstance(value, list), 'siteData must contain literal arrays')
        end = match.end() + length
        parts.append((match, end, value))
        previous_end = end
    return parts


def runtime_from_text(text):
    return [record for _, _, records in _arrays(text) for record in records]


def historical_sites(root, ref):
    """Only for isolated historical SQL fixtures, never the current-data gate."""
    return runtime_from_text(baseline_bytes(root, ref, 'index.html').decode('utf-8'))


# The whole-page comparison with the PR base (assert_engine_matches_base) was retired in C-2.
# Its protections now live in the data contracts below, the runtime guard in the browser
# harnesses (docs/site-data-guard/guard.cjs) and assert_external_resources().


def _id(value):
    require(isinstance(value, str) and re.fullmatch(r'[1-9][0-9]*', value), 'Noncanonical site ID')
    return value


def _number(value, limit):
    require(type(value) in (int, float) and math.isfinite(value) and abs(value) <= limit,
            'Invalid/non-finite coordinate')
    return value


def protected(record):
    require(type(record.get('pelagic')) is bool, 'pelagic must be a boolean')
    return dict(lat=_number(record.get('lat'), 90), lon=_number(record.get('lon'), 180),
                pelagic=record['pelagic'])


def _worker_protected(record):
    # The existing Worker registry contains both JSON numbers and decimal strings.
    # Accept that representation, but not bools, whitespace, NaN or arbitrary coercions.
    normalized = dict(record)
    for field in ('lat', 'lon'):
        value = normalized.get(field)
        if isinstance(value, str):
            require(re.fullmatch(r'-?(0|[1-9][0-9]*)(\.[0-9]+)?', value), 'Invalid Worker coordinate string')
            normalized[field] = float(value)
    return protected(normalized)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def _runtime_index(records):
    require(isinstance(records, list) and records, 'Empty/invalid runtime registry')
    result = {}
    for record in records:
        require(isinstance(record, dict), 'Invalid runtime record')
        sid = _id(record.get('id'))
        require(sid not in result, 'Duplicate runtime ID')
        require(isinstance(record.get('name'), str) and record['name'].strip(), 'Missing site name')
        require(isinstance(record.get('birds'), str), 'Invalid species list')
        protected(record)
        result[sid] = record
    return result


def assert_parity(runtime, worker):
    sites = _runtime_index(runtime)
    require(isinstance(worker, dict) and set(sites) == set(worker), 'Runtime/Worker ID mismatch')
    for sid, site in sites.items():
        _id(sid)
        other = worker[sid]
        require(isinstance(other, dict), 'Invalid Worker record')
        require(protected(site) == _worker_protected(other), 'Runtime/Worker coordinate or pelagic mismatch: ' + sid)
        require(site['name'] == other.get('name'), 'Runtime/Worker name mismatch: ' + sid)
        require(site.get('env') == other.get('environment'), 'Runtime/Worker environment mismatch: ' + sid)
    return sites


def _sources(values):
    require(isinstance(values, list) and values, 'Missing evidence sources')
    for value in values:
        require(isinstance(value, str), 'Invalid evidence source')
        url = urlsplit(value)
        require(url.scheme == 'https' and url.hostname and not url.username and not url.password,
                'Evidence must identify a public HTTPS source')


def _reason(record):
    require(isinstance(record.get('reason'), str) and record['reason'].strip(), 'Missing review reason')


def _species(value):
    return {name.strip() for name in value.split(',') if name.strip()}


def _species_sources(record, species):
    evidence = record.get('speciesSources')
    require(isinstance(evidence, dict) and set(evidence) == species, 'Species evidence coverage mismatch')
    for sources in evidence.values():
        _sources(sources)


def _verified_evidence_bases(root, ref, changes):
    """Only repository ancestry can grant this capability, never the manifest."""
    verified = {ref}
    for record in changes:
        require(isinstance(record, dict), 'Invalid change review')
        origin = record.get('baseCommit')
        require(isinstance(origin, str) and SHA.fullmatch(origin), 'Invalid evidence commit SHA')
        if origin in verified:
            continue
        try:
            require(git(root, 'cat-file', '-t', origin).strip() == 'commit', 'Evidence must name a commit')
            git(root, 'merge-base', '--is-ancestor', origin, ref)
        except ValueError as error:
            raise ValueError('Evidence commit is not in verified main ancestry') from error
        verified.add(origin)
    return frozenset(verified)


def _review(changes, kind, sid, ref, verified_evidence_bases=()):
    matches = [r for r in changes if r.get('kind') == kind and r.get('id') == sid]
    require(len(matches) == 1, 'Missing/duplicate change evidence: ' + sid)
    record = matches[0]
    origin = record.get('baseCommit')
    require(isinstance(origin, str) and SHA.fullmatch(origin)
            and (origin == ref or origin in verified_evidence_bases), 'Unverified evidence main ancestry')
    _reason(record)
    _sources(record.get('sources'))
    return record


def _schema(before, current):
    kinds = {}
    for site in before:
        for field, value in site.items():
            kinds.setdefault(field, set()).add(type(value))
    for site in current:
        for field, value in site.items():
            if field in ('lat', 'lon'):  # Both finite JSON integer/float coordinates are valid.
                continue
            require(field in kinds and type(value) in kinds[field], 'Invalid data field type/schema: ' + field)
            if isinstance(value, list):
                require(all(isinstance(item, str) and item.strip() for item in value),
                        'Invalid list field element: ' + field)
            if isinstance(value, float):
                require(math.isfinite(value), 'Non-finite data field')
        for field in ('env', 'weatherRuleKey'):
            if field in site:
                require(isinstance(site[field], str) and site[field].strip(), 'Missing data field: ' + field)


def _map_links(site):
    def coordinates(parts):
        require(len(parts) >= 2, 'Map link lacks coordinates')
        require(all(re.fullmatch(r'-?(0|[1-9][0-9]*)(\.[0-9]+)?', p) for p in parts[:2]),
                'Invalid map link coordinates')
        require(tuple(map(float, parts[:2])) == (site['lat'], site['lon']), 'Map link coordinate mismatch')
    for field in ('kakaoMapUrl', 'windyUrl'):
        require(isinstance(site.get(field), str), 'Missing coordinate map link')
    kakao, windy = urlsplit(site['kakaoMapUrl']), urlsplit(site['windyUrl'])
    require(kakao.scheme == windy.scheme == 'https' and kakao.hostname == 'map.kakao.com'
            and windy.hostname in ('windy.com', 'www.windy.com'), 'Invalid coordinate map link')
    require(not any((kakao.username, kakao.password, windy.username, windy.password)), 'Invalid map link authority')
    coordinates(unquote(kakao.path).split(',')[-2:])
    coordinates(windy.path.strip('/').split('/')[-2:])
    coordinates(windy.query.split(','))


def _grants(approvals):
    require(isinstance(approvals, list), 'Invalid trusted approval ledger')
    grants = {}
    for approval in approvals:
        require(isinstance(approval, dict) and approval.get('action') == 'update_protected',
                'Invalid protected approval action')
        require(set(approval) == {'action', 'id', 'before', 'after', 'beforeDigest', 'reason', 'sources', 'userApproval'},
                'Unknown/incomplete protected approval fields')
        sid = _id(approval.get('id'))
        before, after = approval.get('before'), approval.get('after')
        require(isinstance(before, dict) and isinstance(after, dict)
                and set(before) == set(after) == set(PROTECTED), 'Approval must specify exact old/new fields')
        protected(before)
        protected(after)
        require(before != after and approval.get('beforeDigest') == digest(dict(id=sid, **before)),
                'Invalid protected approval binding')
        _reason(approval)
        _sources(approval.get('sources'))
        reference = approval.get('userApproval')
        require(isinstance(reference, str) and re.fullmatch(
            r'https://github\.com/wooil1964/birdmap/(pull|issues)/[1-9][0-9]*(#[\w-]+)?', reference),
            'Missing user approval reference; ledger content alone is not approval')
        key = (sid, digest(before))
        require(key not in grants, 'Duplicate/conflicting protected approval')
        grants[key] = after
    return grants


def validate_sites(before, current, worker, *, base_commit, changes=(), trusted_approvals=(), weather_rule_keys=None,
                   verified_evidence_bases=()):
    """Pure validation for isolated fixtures; caller must establish grant trust."""
    old, new = _runtime_index(before), assert_parity(current, worker)
    require(not (old.keys() - new.keys()), 'Existing site ID deleted/renamed')
    require([s['id'] for s in current if s['id'] in old] == [s['id'] for s in before],
            'Existing site relative order changed')
    _schema(before, current)
    require(isinstance(changes, (list, tuple)) and all(isinstance(r, dict) for r in changes),
            'Invalid change reviews')
    for review in changes:
        require(review.get('kind') in ('species', 'new_site'), 'Unknown change review kind')
        _id(review.get('id'))
    review_keys = [(r.get('kind'), r.get('id')) for r in changes]
    require(len(set(review_keys)) == len(review_keys), 'Duplicate/conflicting change reviews')
    grants = _grants(list(trusted_approvals))
    rules = set(weather_rule_keys) if weather_rule_keys is not None else {s.get('weatherRuleKey') for s in before}
    required_fields = set.intersection(*(set(record) for record in before))
    for sid, site in new.items():
        if sid not in old or site.get('weatherRuleKey') != old[sid].get('weatherRuleKey'):
            require(site.get('weatherRuleKey') in rules, 'Unknown weather rule in changed data')
        if sid in old:
            previous = old[sid]
            require(set(previous) <= set(site), 'Existing data fields removed')
            require(set(site) == set(previous), 'Existing field schema changes need separate review')
            for field in set(previous) - set(PROTECTED):
                require(type(previous[field]) is type(site[field]), 'Data field type changed: ' + field)
            if protected(previous) != protected(site):
                require(grants.get((sid, digest(protected(previous)))) == protected(site),
                        'Protected fields changed without trusted base approval: ' + sid)
                if any(previous[field] != site[field] for field in ('lat', 'lon')):
                    _map_links(site)
            if _species(previous['birds']) != _species(site['birds']):
                review = _review(changes, 'species', sid, base_commit, verified_evidence_bases)
                require(review.get('before') == previous['birds'] and review.get('after') == site['birds'],
                        'Species evidence does not match exact old/new values')
                _species_sources(review, _species(previous['birds']) ^ _species(site['birds']))
        else:
            require(required_fields <= set(site), 'New site schema incomplete')
            _map_links(site)
            review = _review(changes, 'new_site', sid, base_commit, verified_evidence_bases)
            require(review.get('recordDigest') == digest(site), 'New site evidence payload mismatch')
            checks = review.get('coordinateChecks')
            require(isinstance(checks, dict) and set(checks) == {'source', 'excel', 'kakao', 'windy', 'worker'},
                    'Missing coordinate cross-checks')
            for value in checks.values():
                require(isinstance(value, list) and len(value) == 2, 'Invalid coordinate cross-check')
                require((_number(value[0], 90), _number(value[1], 180)) == (site['lat'], site['lon']),
                        'Coordinate cross-check mismatch')
            require(isinstance(review.get('excelReference'), str) and review['excelReference'].strip(),
                    'Missing designated Excel reference')
            _species_sources(review, _species(site['birds']))
            if not site['birds'].strip():
                require(review.get('speciesStatus') == 'unconfirmed', 'Unknown species must stay explicit')
            if site.get('showTide'):
                _sources(review.get('tideSources'))
                require(isinstance(review.get('tideMappingDigest'), str)
                        and re.fullmatch(r'[0-9a-f]{64}', review['tideMappingDigest']), 'Missing reviewed tide mapping digest')
    return {'baseSiteCount': len(old), 'siteCount': len(new), 'addedIds': sorted(new.keys() - old.keys())}


def validate_mapping_extension(before, current, old_sites, new_sites, *, changes=(), base_commit=None,
                               verified_evidence_bases=()):
    """Keep old tide links exact; admit complete links only for reviewed additions."""
    old_ids, new_ids = {s['id'] for s in old_sites}, {s['id']: s for s in new_sites}
    old, new = before['sites'], current['sites']
    require(set(old) <= set(new), 'Existing tide mapping deleted')
    for sid in old:
        require(old[sid] == new[sid], 'Existing tide mapping changed: ' + sid)
    added = set(new) - set(old)
    require(added <= (set(new_ids) - old_ids), 'Tide mapping is not a reviewed new site')
    expected = {sid for sid in set(new_ids) - old_ids if new_ids[sid].get('showTide') is True}
    require(added == expected, 'Missing/unreviewed new tide mapping')
    for sid in added:
        row, site = new[sid], new_ids[sid]
        review = _review(changes, 'new_site', sid, base_commit, verified_evidence_bases)
        _sources(review.get('tideSources'))
        require(review.get('tideMappingDigest') == digest(row), 'Tide mapping evidence payload mismatch')
        require(site.get('showTide') is True and row.get('name') == site['name'], 'Tide mapping site mismatch')
        require((_number(row.get('lat'), 90), _number(row.get('lon'), 180)) == (site['lat'], site['lon']),
                'Tide mapping coordinate mismatch')
        require(isinstance(row.get('tideStationCode'), str) and re.fullmatch(r'(DT|SO)_[0-9]{4}', row['tideStationCode'])
                and type(row.get('mappingVersion')) is int and row['mappingVersion'] == 2
                and row.get('codeVerified') is True and type(row.get('needsReview')) is bool,
                'New tide mapping lacks verified station metadata')
        _sources([row.get('codeSourceUrl')])
    counts = {'siteCount': len(new), 'mappedCount': sum(bool(r.get('tideStationCode')) for r in new.values()),
              'reviewCount': sum(r.get('needsReview') is True for r in new.values())}
    require(set(before) == set(current), 'Tide metadata schema changed')
    for key, value in current.items():
        if key in counts:
            require(type(value) is int and value == counts[key], 'Incorrect derived tide count: ' + key)
        elif key == 'sites':
            continue
        elif key == 'updated' and added:
            from datetime import datetime
            datetime.strptime(value, '%Y-%m-%d %H:%M KST')
        else:
            require(value == before[key], 'Unrelated tide metadata changed: ' + key)


def assert_mapping_extension(root=ROOT):
    root, ref = Path(root), baseline_ref(root)
    assert_repository_sites(root)  # Establish new-site evidence before admitting any mapping.
    changes = _manifest((root / REVIEWS).read_text(encoding='utf-8'))['changes']
    validate_mapping_extension(json_value(baseline_bytes(root, ref, 'tide_station_mapping.json')),
                               json_value((root / 'tide_station_mapping.json').read_text(encoding='utf-8')),
                               historical_sites(root, ref),
                               runtime_from_text((root / 'index.html').read_text(encoding='utf-8')),
                               changes=changes, base_commit=ref,
                               verified_evidence_bases=_verified_evidence_bases(root, ref, changes))


def _manifest(text):
    value = json_value(text)
    require(isinstance(value, dict) and set(value) == {'version', 'changes', 'protectedApprovals'}
            and type(value['version']) is int and value['version'] == 1
            and isinstance(value['changes'], list) and isinstance(value['protectedApprovals'], list),
            'Invalid site-change review manifest')
    return value


def assert_repository_sites(root=ROOT):
    root, ref = Path(root), baseline_ref(root)
    before = runtime_from_text(baseline_bytes(root, ref, 'index.html').decode('utf-8'))
    current = runtime_from_text((root / 'index.html').read_text(encoding='utf-8'))
    def worker(text):
        marker = re.search(r'Object\.freeze\(\s*', text)
        require(marker is not None, 'Worker registry missing')
        return DECODER.raw_decode(text[marker.end():])[0]
    old_worker = worker(baseline_bytes(root, ref, 'weather-proxy/src/sites.js').decode('utf-8'))
    assert_parity(before, old_worker)
    reviews = _manifest((root / REVIEWS).read_text(encoding='utf-8'))
    verified_bases = _verified_evidence_bases(root, ref, reviews['changes'])
    _grants(reviews['protectedApprovals'])  # Validate candidate syntax without granting authority.
    exists = git(root, 'ls-tree', '--name-only', ref, '--', REVIEWS).strip()
    trusted = _manifest(baseline_bytes(root, ref, REVIEWS).decode('utf-8')) if exists else {'protectedApprovals': []}
    # Candidate protectedApprovals deliberately never enter the authority input.
    result = validate_sites(before, current, worker((root / 'weather-proxy/src/sites.js').read_text(encoding='utf-8')),
                            base_commit=ref, changes=reviews['changes'],
                            trusted_approvals=trusted['protectedApprovals'],
                            weather_rule_keys=json_value(baseline_bytes(root, ref, 'weather_rules.json'))['rules'],
                            verified_evidence_bases=verified_bases)
    if any(s['id'] in result['addedIds'] and s.get('showTide') for s in current):
        validate_mapping_extension(json_value(baseline_bytes(root, ref, 'tide_station_mapping.json')),
                                   json_value((root / 'tide_station_mapping.json').read_text(encoding='utf-8')),
                                   before, current, changes=reviews['changes'], base_commit=ref,
                                   verified_evidence_bases=verified_bases)
    return result


# ---------------------------------------------------------------------------
# Strict extraction of the runtime data block, fixed observation spots and the
# validated expectation handed to browser harnesses.
#
# The data must be the first statements of one classic inline <script>:
#   var siteData=<JSON array>;  (siteData=siteData.concat(<JSON array>);)*
#   (comment | var <name>=<JSON value>;)*  var siteSpotData=<JSON array>;
# Every token up to the end of the siteSpotData declaration is consumed, so both
# declarations are proven to be code, not comment or string text. Separately, the
# whole page may not contain any other declaration/assignment text for either
# name (comments included), so a decoy or a second writer fails closed.
# Static text checks cannot see every JavaScript write path; browser harnesses
# also compare the values actually assigned at runtime with this expectation.
# ---------------------------------------------------------------------------
SPOT_REVIEWS = '.github/scripts/fixtures/site_spot_reviews.json'
ADMIN_PAGE = 'reports-api/src/admin-page.js'
SPOT_FIELDS = ('id', 'siteId', 'lat', 'lon', 'species')
SPOT_ID = re.compile(r'fixed:([1-9][0-9]*):(0|[1-9][0-9]*)\Z')
_ASSIGN = r'\s*(?:=(?!=)|\+=|\|\|=|&&=|\?\?=)'
_DATA_TEXT = {  # name -> pattern; parse_protected_data() states how often the grammar itself contains each
    'siteData declaration': re.compile(r'\b(?:var|let|const)\s+siteData\b'),
    'siteData assignment': re.compile(r'\bsiteData' + _ASSIGN),
    'siteSpotData declaration': re.compile(r'\b(?:var|let|const)\s+siteSpotData\b'),
    'siteSpotData assignment': re.compile(r'\bsiteSpotData' + _ASSIGN),
    # Any quoted occurrence of either name (window['siteData'], defineProperty(window,"siteData",…),
    # Reflect.set(globalThis,`siteSpotData`,…)) is a dynamic access path the grammar cannot vouch for.
    'quoted global name': re.compile(r"""['"`](?:siteData|siteSpotData)['"`]"""),
}
# Scripts inside these elements are not executed (or not with JavaScript enabled).
_INERT = frozenset({'template', 'textarea', 'noscript', 'xmp', 'iframe', 'noembed', 'noframes', 'title', 'select', 'option'})


def _inline_classic_scripts(text):
    """Inline classic scripts the browser would execute, read with the stdlib HTML tokenizer."""
    from html.parser import HTMLParser
    found, state = [], {'open': None, 'inert': 0}

    class Parser(HTMLParser):
        def handle_starttag(self, tag, attrs):
            if tag in _INERT:
                state['inert'] += 1
            elif tag == 'script':
                state['open'] = (dict(attrs), [], state['inert'] > 0)

        def handle_data(self, data):
            if state['open'] is not None:
                state['open'][1].append(data)

        def handle_endtag(self, tag):
            if tag in _INERT and state['inert']:
                state['inert'] -= 1
            elif tag == 'script' and state['open'] is not None:
                found.append(state['open'])
                state['open'] = None

    parser = Parser(convert_charrefs=False)
    parser.feed(text)
    parser.close()
    return [''.join(parts) for attrs, parts, inert in found
            if not inert and 'src' not in attrs and 'nomodule' not in attrs
            and (attrs.get('type') or 'text/javascript').lower() == 'text/javascript']


def _json_at(body, index, message):
    try:
        return DECODER.raw_decode(body, index)
    except ValueError as error:
        raise ValueError(message) from error


def parse_protected_data(text):
    """Return {'initial', 'sites', 'spots'} or raise; never returns partial or empty-on-error data."""
    require(isinstance(text, str) and text, 'index.html is empty')
    text = text.replace('\r\n', '\n')
    starts = [body for body in _inline_classic_scripts(text) if re.match(r'\s*var\s+siteData\s*=', body)]
    require(len(starts) == 1, 'Exactly one inline script must start with the siteData declaration')
    body = starts[0]
    semicolon, close_concat = re.compile(r'\s*;'), re.compile(r'\s*\)\s*;')
    index = re.match(r'\s*var\s+siteData\s*=\s*', body).end()
    initial, index = _json_at(body, index, 'siteData is not a JSON array literal')
    require(isinstance(initial, list), 'siteData is not a JSON array literal')
    step = semicolon.match(body, index)
    require(step is not None, 'siteData declaration must end with ;')
    index, sites, concats = step.end(), list(initial), 0
    concat = re.compile(r'\s*siteData\s*=\s*siteData\.concat\(\s*')
    while (match := concat.match(body, index)) is not None:
        extra, index = _json_at(body, match.end(), 'siteData concat is not a JSON array literal')
        require(isinstance(extra, list), 'siteData concat is not a JSON array literal')
        end = close_concat.match(body, index)
        require(end is not None, 'siteData concat must end with );')
        index, concats = end.end(), concats + 1
        sites.extend(extra)
    spot_head = re.compile(r'\s*var\s+siteSpotData\s*=\s*')
    block_comment, line_comment = re.compile(r'\s*/\*'), re.compile(r'\s*//[^\n]*')
    plain_var = re.compile(r'\s*var\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*')
    while True:
        if (match := spot_head.match(body, index)) is not None:
            spots, index = _json_at(body, match.end(), 'siteSpotData is not a JSON array literal')
            require(isinstance(spots, list), 'siteSpotData is not a JSON array literal')
            require(semicolon.match(body, index) is not None, 'siteSpotData declaration must end with ;')
            break
        if (match := block_comment.match(body, index)) is not None:
            close = body.find('*/', match.end())
            require(close >= 0, 'Unterminated comment before siteSpotData')
            index = close + 2
        elif (match := line_comment.match(body, index)) is not None:
            index = match.end()
        elif (match := plain_var.match(body, index)) is not None:
            _, index = _json_at(body, match.end(), 'Unsupported expression before siteSpotData')
            end = semicolon.match(body, index)
            require(end is not None, 'Unsupported statement before siteSpotData')
            index = end.end()
        else:
            raise ValueError('Unsupported statement before siteSpotData')
    allowed = {'siteData declaration': 1, 'siteData assignment': 1 + concats,
               'siteSpotData declaration': 1, 'siteSpotData assignment': 1, 'quoted global name': 0}
    for name, pattern in _DATA_TEXT.items():
        require(len(pattern.findall(text)) == allowed[name], 'Unexpected ' + name + ' text outside the data block')
    for record in sites + spots:
        require(isinstance(record, dict), 'Data records must be JSON objects')
    return {'initial': initial, 'sites': sites, 'spots': spots}


def assert_assets_do_not_write_data(root=ROOT):
    """Asset scripts may read the data but never declare or assign it (text check only)."""
    for path in sorted((Path(root) / 'assets').glob('*.js')):
        text = path.read_text(encoding='utf-8')
        for name, pattern in _DATA_TEXT.items():
            require(not pattern.search(text), name + ' in assets/' + path.name)


def _spot_record(record, site_ids):
    require(isinstance(record, dict) and set(record) == set(SPOT_FIELDS),
            'Fixed spot fields must be exactly ' + ', '.join(SPOT_FIELDS))
    match = SPOT_ID.fullmatch(record['id']) if isinstance(record['id'], str) else None
    require(match is not None, 'Invalid fixed spot ID')
    require(isinstance(record['siteId'], str) and record['siteId'] == match.group(1), 'Fixed spot ID must name its parent site')
    require(record['siteId'] in site_ids, 'Fixed spot parent site missing: ' + record['id'])
    lat, lon = _number(record['lat'], 90), _number(record['lon'], 180)
    require((lat, lon) != (0, 0), 'Invalid fixed spot coordinate: ' + record['id'])
    species = record['species']
    require(isinstance(species, list) and species and all(isinstance(s, str) and s.strip() for s in species)
            and len(set(species)) == len(species), 'Invalid fixed spot species: ' + record['id'])
    return record


def _spot_grants(approvals, site_ids):
    require(isinstance(approvals, list), 'Invalid fixed spot approval ledger')
    grants = {}
    for approval in approvals:
        require(isinstance(approval, dict) and approval.get('action') == 'update_spot'
                and set(approval) == {'action', 'id', 'before', 'after', 'beforeDigest', 'reason', 'sources', 'userApproval'},
                'Unknown/incomplete fixed spot approval')
        before, after = approval['before'], approval['after']
        _spot_record(before, site_ids)
        _spot_record(after, site_ids)
        require(approval['id'] == before['id'] == after['id'], 'Fixed spot approvals cannot change an ID')
        require(before != after and approval['beforeDigest'] == digest(before), 'Invalid fixed spot approval binding')
        _reason(approval)
        _sources(approval['sources'])
        require(isinstance(approval['userApproval'], str) and re.fullmatch(
            r'https://github\.com/wooil1964/birdmap/(pull|issues)/[1-9][0-9]*(#[\w-]+)?', approval['userApproval']),
            'Missing user approval reference; ledger content alone is not approval')
        key = (approval['id'], approval['beforeDigest'])
        require(key not in grants, 'Duplicate/conflicting fixed spot approval')
        grants[key] = after
    return grants


def validate_spots(before, current, site_ids, trusted_approvals=()):
    """Existing spots keep ID and order; parent, coordinates and species change only with a trusted
    base grant. New spots stay disabled until a parent-distance and public-location standard exists."""
    site_ids = set(site_ids)

    def index(spots):
        require(isinstance(spots, list), 'siteSpotData must be a list')
        result = {}
        for record in spots:
            _spot_record(record, site_ids)
            require(record['id'] not in result, 'Duplicate fixed spot ID: ' + record['id'])
            result[record['id']] = record
        return result
    old, new = index(before), index(current)
    require(not (old.keys() - new.keys()), 'Existing fixed spot deleted/renamed')
    require(not (new.keys() - old.keys()), 'New fixed spots are not enabled until a review standard is approved')
    require([s['id'] for s in current] == [s['id'] for s in before], 'Existing fixed spot order changed')
    grants = _spot_grants(list(trusted_approvals), site_ids)
    for sid, record in new.items():
        if record != old[sid]:
            require(grants.get((sid, digest(old[sid]))) == record, 'Fixed spot changed without trusted base approval: ' + sid)
    return new


_ADMIN_SPOT = re.compile(r"\s*\{key:'(fixed:[0-9]+:[0-9]+)',label:'([^'\\\n]*) \((-?[0-9]+\.[0-9]+), (-?[0-9]+\.[0-9]+)\)'\},?\s*")


def admin_fixed_spots(text):
    """Parse the Worker admin page's FIXED_SPOTS list; any other shape fails closed."""
    text = text.replace('\r\n', '\n')
    require(text.count('var FIXED_SPOTS=[') == 1, 'Admin FIXED_SPOTS declaration must occur once')
    body = text.split('var FIXED_SPOTS=[', 1)[1]
    require('\n];' in body, 'Admin FIXED_SPOTS must end with ];')
    rows = []
    for line in body.split('\n];', 1)[0].split('\n'):
        if not line.strip():
            continue
        match = _ADMIN_SPOT.fullmatch(line)
        require(match is not None, 'Unsupported admin FIXED_SPOTS entry')
        rows.append({'key': match.group(1), 'label': match.group(2), 'lat': float(match.group(3)), 'lon': float(match.group(4))})
    return rows


def assert_admin_spot_parity(spots, admin_rows):
    require([r['key'] for r in admin_rows] == [s['id'] for s in spots], 'Admin FIXED_SPOTS keys/order differ from siteSpotData')
    for spot, row in zip(spots, admin_rows):
        require(abs(row['lat'] - spot['lat']) <= 5e-6 and abs(row['lon'] - spot['lon']) <= 5e-6,
                'Admin FIXED_SPOTS label coordinate differs: ' + spot['id'])


def _spot_ledger(text):
    value = json_value(text)
    require(isinstance(value, dict) and set(value) == {'version', 'approvals'} and type(value['version']) is int
            and value['version'] == 1 and isinstance(value['approvals'], list), 'Invalid fixed spot review ledger')
    return value


def assert_repository_spots(root=ROOT):
    """Strict data block, parser agreement, fixed spot contract and Worker admin parity against the PR base."""
    root, ref = Path(root), baseline_ref(root)
    current_text = (root / 'index.html').read_text(encoding='utf-8')
    base = parse_protected_data(baseline_bytes(root, ref, 'index.html').decode('utf-8'))
    current = parse_protected_data(current_text)
    require(current['sites'] == runtime_from_text(current_text), 'Strict and legacy siteData parsers disagree')
    assert_assets_do_not_write_data(root)
    site_ids = {_id(s.get('id')) for s in current['sites']}
    _spot_grants(_spot_ledger((root / SPOT_REVIEWS).read_text(encoding='utf-8'))['approvals'], site_ids)  # Syntax only.
    exists = git(root, 'ls-tree', '--name-only', ref, '--', SPOT_REVIEWS).strip()
    trusted = _spot_ledger(baseline_bytes(root, ref, SPOT_REVIEWS).decode('utf-8'))['approvals'] if exists else []
    validate_spots(base['spots'], current['spots'], site_ids, trusted)
    assert_admin_spot_parity(current['spots'], admin_fixed_spots((root / ADMIN_PAGE).read_text(encoding='utf-8')))
    return current


# ---------------------------------------------------------------------------
# External origins. With the whole-page freeze gone, a PR could otherwise make the page load code
# from, or send data to, a new origin with no review. Every host named by an absolute or
# protocol-relative URL in the code the page runs (index.html outside the data block, every text
# file under assets/, and every other local file index.html loads) must be on the host allowlist
# read from the PR BASE (fixtures/external_resources.json); a candidate's own allowlist edit only
# takes effect after it reaches main, like the approval ledgers. Before the ledger exists on main,
# the base's own host set is the trusted list. <base>, data:/blob:/javascript: code sources and
# hosts built from template expressions fail outright.
# Residual: a host spelt by string concatenation is not visible to this text check.
# The data block is excluded: site links are data, validated by the data contracts.
# ---------------------------------------------------------------------------
EXTERNAL_RESOURCES = '.github/scripts/fixtures/external_resources.json'
_SLASHES = r'(?:\\?[\\/]){2}'  # //, \\, /\, \/ and JSON-escaped \/\/
_ABSOLUTE = re.compile(r'(?i)\bhttps?:' + _SLASHES + r"""([^\s'"`<>()\\/?#:]*)""")
_RELATIVE = re.compile(r"""(?i)['"`=(]\s*""" + _SLASHES + r"""([^\s'"`<>()\\/?#:]+)""")
_HOSTNAME = re.compile(r'[a-z0-9-]+(?:\.[a-z0-9-]+)+')
_TEXT_SUFFIXES = {'.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.json', '.svg', '.txt', '.webmanifest', '.xml'}
_CODE_SOURCES = {'script': 'src', 'iframe': 'src', 'frame': 'src', 'embed': 'src', 'object': 'data', 'link': 'href'}


def _page_tags(text):
    """(tag, attrs) for every start tag, via the stdlib HTML tokenizer."""
    from html.parser import HTMLParser
    found = []

    class Parser(HTMLParser):
        def handle_starttag(self, tag, attrs):
            found.append((tag, dict(attrs)))

        handle_startendtag = handle_starttag

    parser = Parser(convert_charrefs=True)
    parser.feed(text)
    parser.close()
    return found


def _without_data_block(text):
    text = text.replace('\r\n', '\n')
    start, spots = re.search(r'\bvar\s+siteData\s*=', text), re.search(r'\bvar\s+siteSpotData\s*=\s*', text)
    if not start or not spots:
        return text  # No data block (synthetic pages); the strict data contract governs real pages.
    _, end = _json_at(text, spots.end(), 'siteSpotData is not a JSON array literal')
    return text[:start.start()] + text[end:]


def _local_code_paths(index_text):
    """Repository paths of the local scripts, stylesheets and frames index.html loads."""
    paths = set()
    for tag, attrs in _page_tags(index_text):
        value = (attrs.get(_CODE_SOURCES.get(tag, '')) or '').strip()
        if value and not urlsplit(value).scheme and not re.match(r'[\\/]{2}', value):
            paths.add(urlsplit(value).path.lstrip('/'))
    return paths


def external_hosts(index_text, other_texts=()):
    """Sorted lower-case hosts named by the page code. Raises on forms that cannot be allowlisted."""
    for tag, attrs in _page_tags(index_text):
        require(tag != 'base', '<base> is not allowed: it would re-home every relative script')
        value = (attrs.get(_CODE_SOURCES.get(tag, '')) or '').strip().lower()
        require(not value.startswith(('data:', 'blob:', 'javascript:', 'http:')),
                'Code must not load from data:, blob:, javascript: or http: (' + tag + ')')
    hosts = set()
    for text in (_without_data_block(index_text), *other_texts):
        text = text.replace('\\.', '.').replace('\\/', '/')  # Hosts spelt inside regex literals count too.
        for pattern in (_ABSOLUTE, _RELATIVE):
            for host in pattern.findall(text):
                host = host.lower().rstrip('.')
                if pattern is _RELATIVE and not _HOSTNAME.fullmatch(host):
                    continue  # '//' + non-host text (e.g. a regex) is not a URL.
                if not host:
                    continue  # A bare 'https://' prefix names no origin.
                require(_HOSTNAME.fullmatch(host), 'URL host is not a literal hostname: ' + host[:40])
                hosts.add(host)
    return sorted(hosts)


def _code_texts(read, list_assets, index_text):
    """Text of every asset file and every other local file the page loads, via the given readers."""
    names = {n for n in list_assets() if Path(n).suffix.lower() in _TEXT_SUFFIXES}
    names |= {p for p in _local_code_paths(index_text) if p and p != 'index.html'}
    texts = []
    for name in sorted(names):
        data = read(name)
        if data is not None:
            texts.append(data.decode('utf-8', errors='replace'))
    return texts


def _external_ledger(text):
    value = json_value(text)
    require(isinstance(value, dict) and set(value) == {'version', 'hosts'} and type(value['version']) is int
            and value['version'] == 1 and isinstance(value['hosts'], list)
            and all(isinstance(h, str) and _HOSTNAME.fullmatch(h) and h == h.lower() for h in value['hosts'])
            and len(set(value['hosts'])) == len(value['hosts']), 'Invalid external host allowlist')
    return value


def assert_external_resources(root=ROOT):
    root, ref = Path(root), baseline_ref(root)
    index_text = (root / 'index.html').read_text(encoding='utf-8')
    def read_current(name):
        path = root / name
        return path.read_bytes() if path.is_file() else None
    def list_current():
        return [p.relative_to(root).as_posix() for p in (root / 'assets').rglob('*') if p.is_file()]
    current = external_hosts(index_text, _code_texts(read_current, list_current, index_text))
    _external_ledger((root / EXTERNAL_RESOURCES).read_text(encoding='utf-8'))  # Syntax only; no authority.
    if git(root, 'ls-tree', '--name-only', ref, '--', EXTERNAL_RESOURCES).strip():
        trusted = set(_external_ledger(baseline_bytes(root, ref, EXTERNAL_RESOURCES).decode('utf-8'))['hosts'])
    else:
        base_index = baseline_bytes(root, ref, 'index.html').decode('utf-8')
        tree = set(git(root, 'ls-tree', '-r', '--name-only', ref).split('\n'))
        def read_base(name):
            return baseline_bytes(root, ref, name) if name in tree else None
        def list_base():
            return [n for n in tree if n.startswith('assets/')]
        trusted = set(external_hosts(base_index, _code_texts(read_base, list_base, base_index)))
    unknown = sorted(set(current) - trusted)
    require(not unknown, 'External host not on the base allowlist: ' + ', '.join(unknown))
    return current


def expected_site_data(root=ROOT):
    """Validated expectation for browser harnesses, built only after every data contract passes."""
    assert_repository_sites(root)
    data = assert_repository_spots(root)
    return {'version': 1, 'baseCommit': baseline_ref(root), 'initialCount': len(data['initial']),
            'siteData': data['sites'], 'siteSpotData': data['spots']}


if __name__ == '__main__':
    import argparse
    import sys
    parser = argparse.ArgumentParser(description='Validate site data against the PR base and export the browser expectation.')
    parser.add_argument('--export', required=True, help="output JSON path, or '-' for stdout")
    target = parser.parse_args().export
    payload = json.dumps(expected_site_data(ROOT), ensure_ascii=False, allow_nan=False)
    if target == '-':
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdout.write(payload)
    else:
        Path(target).write_text(payload, encoding='utf-8')
