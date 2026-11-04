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
            base = event.get('pull_request', {}).get('base', {})
            require(base.get('ref') == 'main', 'PR base must be main')
            ref = base.get('sha', '')
            require(isinstance(ref, str) and SHA.fullmatch(ref), 'Missing exact PR base SHA')
            expected_repo = env.get('GITHUB_REPOSITORY')
            if expected_repo:
                require(base.get('repo', {}).get('full_name') == expected_repo, 'Wrong base repository')
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


def without_site_data(text):
    """Mask only decoded siteData payloads; keep UI and siteSpotData visible."""
    text = text.replace('\r\n', '\n')
    replacements = []
    for number, (match, end, _) in enumerate(_arrays(text)):
        if number == 0:
            replacements.append((match.end(), end, '[]'))
            continue
        tail = re.match(r'\s*\)\s*;', text[end:])
        require(tail is not None, 'Incomplete siteData concat statement')
        start, finish = match.start(), end + tail.end()
        line_start, line_end = text.rfind('\n', 0, start) + 1, text.find('\n', finish)
        if not text[line_start:start].strip() and (line_end < 0 or not text[finish:line_end].strip()):
            start, finish = line_start, len(text) if line_end < 0 else line_end + 1
        replacements.append((start, finish, ''))
    for start, end, replacement in reversed(replacements):
        text = text[:start] + replacement + text[end:]
    return text


def assert_engine_matches_base(root=ROOT, normalize=lambda text: text):
    ref = baseline_ref(root)
    before = baseline_bytes(root, ref, 'index.html').decode('utf-8')
    current = (Path(root) / 'index.html').read_text(encoding='utf-8')
    require(without_site_data(normalize(current)) == without_site_data(normalize(before)),
            'Code/fixed-point changes outside siteData need their own review')


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
