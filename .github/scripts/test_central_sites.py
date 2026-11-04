"""PR-relative site protection and historical public-area evidence."""
import json
import copy
import contextlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote
from unittest.mock import patch

from site_data import load_runtime_sites, load_worker_sites, compare_sites
from site_data_contract import (assert_repository_sites, assert_engine_matches_base, baseline_ref,
                                baseline_bytes, digest, protected, validate_sites,
                                validate_mapping_extension, without_site_data, REVIEWS)

ROOT = Path(__file__).resolve().parents[2]
SOURCE = json.loads((ROOT / 'data/central-birding-sites-20261018.json').read_text(encoding='utf-8'))


class CentralSitesTests(unittest.TestCase):
    def test_pr_base_protection_and_reviewed_registration_ids(self):
        assert_repository_sites(ROOT)
        # These IDs describe the historical reviewed batch, not today's total.
        self.assertEqual([r['site']['id'] for r in SOURCE['records']], [str(i) for i in range(196, 206)])
        self.assertTrue(all('삽교' not in s['name'] for s in load_runtime_sites()))

    def test_coordinate_links_and_weather_match_reviewed_source(self):
        report = compare_sites(load_runtime_sites(), load_worker_sites())
        self.assertFalse(any(v for v in report.values() if isinstance(v, list)), report)
        rules = json.loads((ROOT / 'weather_rules.json').read_text(encoding='utf-8'))['rules']
        for record in SOURCE['records']:
            s = record['site']
            with self.subTest(site=s['name']):
                self.assertTrue(record['coordinateSource'].startswith('https://'))
                self.assertEqual(len(record['speciesSources']), 2)
                self.assertEqual(s['kakaoMapUrl'].split(',')[-2:], [str(s['lat']), str(s['lon'])])
                self.assertIn(f"/{s['lat']}/{s['lon']}?{s['lat']},{s['lon']},10", s['windyUrl'])
                self.assertIn(record['pointLabel'], unquote(s['naverMapUrl']))
                self.assertIn(s['name'], s['searchText'])
                self.assertTrue(all(b.strip() in s['searchText'] for b in s['birds'].split(',')))
                self.assertIn(s['weatherRuleKey'], rules)
                self.assertFalse(s['showTide'] or s['showWave'] or s['pelagic'])
                self.assertIn('현재 출현을 뜻하지 않습니다', s['localBirdingTip'])
                self.assertIn('대표 탐조 위치', s['localBirdingTip'])
                self.assertNotIn('호사비오리', s['birds'])
                self.assertTrue(all(b.strip() for b in s['birds'].split(',')))


class _SiteDataFixture:
    """All mutations affect synthetic copies, never production files."""
    def setUp(self):
        self.ref = 'a' * 40
        self.before = [dict(id='901', name='Synthetic wetland', lat=36.5, lon=127.5,
                            pelagic=False, env='습지', birds='청둥오리',
                            localBirdingTip='Synthetic guidance', seasons=['겨울'],
                            weatherRuleKey='general_birding', showTide=False)]
        self.update_links(self.before[0])
        self.current = copy.deepcopy(self.before)

    @staticmethod
    def update_links(site):
        site.update(kakaoMapUrl=f"https://map.kakao.com/link/map/test,{site['lat']},{site['lon']}",
                    windyUrl=f"https://www.windy.com/{site['lat']}/{site['lon']}?{site['lat']},{site['lon']},10")

    @staticmethod
    def worker(records):
        return {s['id']: dict(name=s['name'], lat=s['lat'], lon=s['lon'], pelagic=s['pelagic'],
                              environment=s['env']) for s in records}

    def validate(self, changes=(), grants=(), worker=None):
        return validate_sites(self.before, self.current, self.worker(self.current) if worker is None else worker,
                              base_commit=self.ref, changes=changes, trusted_approvals=grants)

    def species_review(self):
        return dict(kind='species', id='901', baseCommit=self.ref, before=self.before[0]['birds'],
                    after=self.current[0]['birds'], reason='Synthetic observed-species evidence',
                    sources=['https://evidence.example.test/observation'],
                    speciesSources={'쇠오리': ['https://evidence.example.test/species']})

    def new_site(self):
        site = dict(self.before[0], id='902', name='Synthetic second wetland', lat=35.5, lon=126.5)
        self.update_links(site)
        self.current.append(site)
        return dict(kind='new_site', id='902', baseCommit=self.ref, recordDigest=digest(site),
                    reason='Synthetic reviewed public observation point', sources=['https://evidence.example.test/site'],
                    coordinateChecks={key: [site['lat'], site['lon']] for key in ('source', 'excel', 'kakao', 'windy', 'worker')},
                    excelReference='synthetic-fixture.xlsx#Sheet1!A1',
                    speciesSources={'청둥오리': ['https://evidence.example.test/species']})

    def grant(self):
        self.update_links(self.current[0])
        before, after = protected(self.before[0]), protected(self.current[0])
        return dict(action='update_protected', id='901', before=before, after=after,
                    beforeDigest=digest(dict(id='901', **before)), reason='Synthetic prior approval',
                    sources=['https://evidence.example.test/coordinate'],
                    userApproval='https://github.com/wooil1964/birdmap/pull/901#issuecomment-1')

class SiteDataChangeContractTests(_SiteDataFixture, unittest.TestCase):
    def test_01_unchanged_data_passes(self):
        self.assertEqual(self.validate()['addedIds'], [])

    def test_02_guidance_and_general_field_edits_pass(self):
        self.current[0]['localBirdingTip'] = 'Revised guidance; no geographic/species claim changed'
        self.current[0]['seasons'] = ['봄', '겨울']
        self.validate()

    def test_03_species_addition_with_exact_evidence_passes(self):
        self.current[0]['birds'] += ',쇠오리'
        self.validate(changes=[self.species_review()])

    def test_04_new_site_with_all_cross_checks_and_evidence_passes(self):
        review = self.new_site()
        self.assertEqual(self.validate(changes=[review])['addedIds'], ['902'])

    def test_05_deleted_or_renamed_id_fails(self):
        self.before.append(dict(self.before[0], id='902', name='Second existing site'))
        self.current = copy.deepcopy(self.before[1:])
        with self.assertRaisesRegex(ValueError, 'deleted/renamed'):
            self.validate()
        self.current = copy.deepcopy(self.before)
        self.current[0]['id'] = '999'
        with self.assertRaisesRegex(ValueError, 'deleted/renamed'):
            self.validate()

    def test_06_duplicate_id_fails(self):
        self.current.append(copy.deepcopy(self.current[0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate runtime ID'):
            self.validate()

    def test_07_synchronized_but_unapproved_coordinate_change_fails(self):
        self.current[0]['lat'] += 0.00000000001
        with self.assertRaisesRegex(ValueError, 'without trusted base approval'):
            self.validate()

    def test_08_pelagic_mismatch_and_synchronized_unapproved_change_fail(self):
        worker = self.worker(self.current)
        self.current[0]['pelagic'] = True
        for value in (worker, self.worker(self.current)):
            with self.subTest(worker=value), self.assertRaises(ValueError):
                self.validate(worker=value)

    def test_09_runtime_worker_id_coordinate_name_and_environment_mismatches_fail(self):
        variants = [{}, self.worker(self.current), self.worker(self.current), self.worker(self.current)]
        variants[1]['901']['lon'] += 0.00000000001
        variants[2]['901']['name'] = 'Wrong name'
        variants[3]['901']['environment'] = 'Wrong branch'
        for value in variants:
            with self.subTest(worker=value), self.assertRaisesRegex(ValueError, 'mismatch'):
                self.validate(worker=value)

    def test_evidence_is_required_and_bound_to_exact_payload(self):
        review = self.new_site()
        for bad in ([], [dict(review, recordDigest='0' * 64)],
                    [dict(review, baseCommit='b' * 40)], [review, copy.deepcopy(review)]):
            with self.subTest(reviews=bad), self.assertRaises(ValueError):
                self.validate(changes=bad)
        self.current[-1]['localBirdingTip'] = 'Not the reviewed payload'
        with self.assertRaisesRegex(ValueError, 'payload mismatch'):
            self.validate(changes=[review])

    def test_new_site_missing_provenance_and_cross_checks_fail(self):
        review = self.new_site()
        variants = [dict(review, sources=[]), dict(review, sources=['http://evidence.example.test/site']),
                    dict(review, coordinateChecks={}), dict(review, excelReference=''),
                    dict(review, speciesSources={})]
        bad = copy.deepcopy(review)
        bad['coordinateChecks']['windy'][0] += 0.1
        variants.append(bad)
        for value in variants:
            with self.subTest(review=value), self.assertRaises(ValueError):
                self.validate(changes=[value])

    def test_unknown_species_new_site_must_remain_explicit(self):
        review = self.new_site()
        self.current[-1]['birds'] = ''
        review.update(recordDigest=digest(self.current[-1]), speciesSources={})
        with self.assertRaisesRegex(ValueError, 'Unknown species'):
            self.validate(changes=[review])
        self.validate(changes=[dict(review, speciesStatus='unconfirmed')])

    def test_missing_or_stale_species_evidence_fails(self):
        self.current[0]['birds'] += ',쇠오리'
        review = self.species_review()
        for value in ([], [dict(review, before='다른 종')], [dict(review, after='다른 종')],
                      [dict(review, speciesSources={})], [dict(review, baseCommit='b' * 40)]):
            with self.subTest(reviews=value), self.assertRaises(ValueError):
                self.validate(changes=value)

    def test_noncanonical_ids_coordinates_and_pelagic_types_fail(self):
        for field, values in [('id', [901, '0901', True]), ('lat', [True, float('nan'), float('inf'), 91]),
                              ('lon', [False, float('-inf'), 181]), ('pelagic', [1, 'false', None])]:
            for value in values:
                self.current = copy.deepcopy(self.before)
                self.current[0][field] = value
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    self.validate()

    def test_existing_worker_decimal_representation_is_strictly_validated(self):
        worker = self.worker(self.current)
        worker['901'].update(lat='36.5', lon='127.5')
        self.validate(worker=worker)
        for value in (' 36.5 ', 'NaN', 'Infinity', '36.5garbage', True):
            bad = copy.deepcopy(worker)
            bad['901']['lat'] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.validate(worker=bad)

    def test_trusted_protected_grant_requires_exact_id_old_new_and_evidence(self):
        self.current[0]['lat'] += 0.1
        grant = self.grant()
        self.validate(grants=[grant])
        variants = [[dict(grant, id='999')], [dict(grant, beforeDigest='0' * 64)],
                    [dict(grant, sources=[])], [dict(grant, userApproval='approved')],
                    [dict(grant, after=dict(grant['after'], lon=127.6))], [grant, copy.deepcopy(grant)]]
        for value in variants:
            with self.subTest(grants=value), self.assertRaises(ValueError):
                self.validate(grants=value)

    def test_approved_finite_integer_coordinate_is_valid(self):
        self.current[0]['lat'] = 36
        self.validate(grants=[self.grant()])

    def test_removed_fields_and_incomplete_new_schema_fail(self):
        self.current[0].pop('localBirdingTip')
        with self.assertRaisesRegex(ValueError, 'fields removed'):
            self.validate()
        self.current = copy.deepcopy(self.before)
        review = self.new_site()
        self.current[-1].pop('seasons')
        review['recordDigest'] = digest(self.current[-1])
        with self.assertRaisesRegex(ValueError, 'schema incomplete'):
            self.validate(changes=[review])

    def test_literal_mask_is_lossless_outside_all_runtime_arrays(self):
        self.new_site()
        before = 'var siteData=' + json.dumps(self.before) + ';\nvar siteSpotData=[1];\nrun();'
        after = 'var siteData=' + json.dumps(self.current[:1]) + ';\nsiteData=siteData.concat(' + json.dumps(self.current[1:]) + ');\nvar siteSpotData=[1];\nrun();'
        self.assertEqual(without_site_data(before), without_site_data(after))
        self.assertEqual(without_site_data(after), without_site_data(after.replace('\n', '\r\n')))
        self.assertNotEqual(without_site_data(after.replace('siteSpotData=[1]', 'siteSpotData=[2]')),
                            without_site_data(before))
        self.assertNotEqual(without_site_data(after.replace('run();', 'other();')), without_site_data(before))
        tricky = copy.deepcopy(self.before)
        tricky[0]['localBirdingTip'] = 'siteData=siteData.concat([ strings ]); ] }'
        self.assertEqual(without_site_data('var siteData=' + json.dumps(tricky) + ';'), 'var siteData=[];')

    def test_new_site_field_types_and_existing_list_elements_fail_closed(self):
        review = self.new_site()
        original = copy.deepcopy(self.current)
        for field, value in [('seasons', True), ('weatherRuleKey', None), ('env', {}), ('seasons', [{}])]:
            self.current = copy.deepcopy(original)
            self.current[-1][field] = value
            candidate = dict(review, recordDigest=digest(self.current[-1]))
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.validate(changes=[candidate])
        self.current = copy.deepcopy(self.before)
        self.current[0]['seasons'] = [{}]
        with self.assertRaisesRegex(ValueError, 'list field element'):
            self.validate()

    def test_new_weather_rule_must_be_defined_in_trusted_rules(self):
        review = self.new_site()
        self.current[-1]['weatherRuleKey'] = 'existing_but_unused'
        review['recordDigest'] = digest(self.current[-1])
        with self.assertRaisesRegex(ValueError, 'Unknown weather rule'):
            self.validate(changes=[review])
        validate_sites(self.before, self.current, self.worker(self.current), base_commit=self.ref,
                       changes=[review], weather_rule_keys={'general_birding', 'existing_but_unused'})

    def test_new_and_approved_coordinate_changes_require_actual_map_links(self):
        review = self.new_site()
        self.current[-1]['kakaoMapUrl'] = self.before[0]['kakaoMapUrl']
        review['recordDigest'] = digest(self.current[-1])
        with self.assertRaisesRegex(ValueError, 'Map link coordinate mismatch'):
            self.validate(changes=[review])
        self.current = copy.deepcopy(self.before)
        self.current[0]['lat'] += 0.1
        grant = self.grant()
        self.current[0]['windyUrl'] = self.before[0]['windyUrl']
        with self.assertRaisesRegex(ValueError, 'Map link coordinate mismatch'):
            self.validate(grants=[grant])

    def test_existing_relative_order_is_protected(self):
        self.before.append(dict(self.before[0], id='902', name='Another existing site'))
        self.current = list(reversed(copy.deepcopy(self.before)))
        with self.assertRaisesRegex(ValueError, 'relative order'):
            self.validate()

    def test_reviewed_new_tidal_link_passes_and_old_links_counts_are_protected(self):
        review = self.new_site()
        self.current[-1]['showTide'] = True
        review.update(recordDigest=digest(self.current[-1]), tideSources=['https://evidence.example.test/tides'])
        row = dict(name=self.current[-1]['name'], lat=35.5, lon=126.5, tideStationCode='DT_0001',
                   mappingVersion=2, codeVerified=True, codeSourceUrl=review['tideSources'][0], needsReview=True)
        review['tideMappingDigest'] = digest(row)
        self.validate(changes=[review])
        old = dict(sites={}, siteCount=0, mappedCount=0, reviewCount=0, mappingVersion=2)
        new = dict(old, sites={'902': row}, siteCount=1, mappedCount=1, reviewCount=1)
        validate_mapping_extension(old, new, self.before, self.current, changes=[review], base_commit=self.ref)
        for bad in (dict(new, siteCount=2), dict(new, mappingVersion=1),
                    dict(new, sites={}, siteCount=0, mappedCount=0, reviewCount=0),
                    dict(new, sites={'902': dict(row, lon=126.6)}),
                    dict(new, sites={'902': dict(row, tideStationCode='DT_0002')}),
                    dict(new, sites={'902': dict(row, codeSourceUrl='https://unreviewed.example.test/station')})):
            with self.subTest(mapping=bad), self.assertRaises(ValueError):
                validate_mapping_extension(old, bad, self.before, self.current, changes=[review], base_commit=self.ref)
        for bad in (dict(new, sites={}), dict(new, sites={'902': dict(row, tideStationCode='DT_0002')})):
            with self.subTest(mapping=bad), self.assertRaises(ValueError):
                validate_mapping_extension(new, bad, self.current, self.current)


class SiteDataBaselineTrustTests(_SiteDataFixture, unittest.TestCase):
    """Real temporary Git trees exercise the approval and event trust boundary."""
    def setUp(self):
        super().setUp()
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.command('init', '--quiet', '-b', 'main')
        self.command('config', 'core.autocrlf', 'false')
        self.command('config', 'commit.gpgsign', 'false')
        self.command('config', 'core.hooksPath', str(self.root / 'no-hooks'))
        self.command('config', 'user.name', 'Contract fixture')
        self.command('config', 'user.email', 'fixture@example.invalid')
        self.write_candidate([])
        self.commit_base()

    def command(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.PIPE).decode().strip()

    def write_candidate(self, grants, changes=()):
        for site in self.current:
            self.update_links(site)
        files = {'index.html': 'var siteData=' + json.dumps(self.current) + ';\nvar siteSpotData=[1];\nrun();',
                 'weather-proxy/src/sites.js': 'export const SITES=Object.freeze(' + json.dumps(self.worker(self.current)) + ');',
                 'weather_rules.json': json.dumps({'rules': {'general_birding': {}}}),
                 REVIEWS: json.dumps(dict(version=1, changes=list(changes), protectedApprovals=grants))}
        for name, content in files.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding='utf-8')

    def commit_base(self):
        self.command('add', '.')
        self.command('commit', '--quiet', '-m', 'Synthetic baseline')
        self.ref = self.command('rev-parse', 'HEAD')
        self.command('update-ref', 'refs/remotes/origin/main', self.ref)

    def local(self):
        return patch.dict(os.environ, {'GITHUB_ACTIONS': 'false', 'SITE_DATA_BASE_REF': ''})

    @contextlib.contextmanager
    def pr(self, snapshot=None, main_parent=None, candidate=None):
        original = self.command('rev-parse', 'HEAD')
        tree = self.command('rev-parse', 'HEAD^{tree}')
        if candidate is None:
            candidate = (original if original != self.ref else
                         self.command('commit-tree', tree, '-p', self.ref, '-m', 'Synthetic PR head'))
        merge = self.command('commit-tree', tree, '-p', main_parent or self.ref,
                             '-p', candidate, '-m', 'Synthetic runner merge')
        event = self.root / 'runner-event.json'
        event.write_text(json.dumps({'number': 1, 'pull_request': {'base': {
            'ref': 'main', 'sha': snapshot or self.ref, 'repo': {'full_name': 'wooil1964/birdmap'}},
            'head': {'sha': candidate}}}), encoding='utf-8')
        # commit-tree never stages candidate data. Detach/restore HEAD directly so
        # neither the main branch nor the fixture index is changed by this context.
        branch = self.command('symbolic-ref', 'HEAD')
        self.command('update-ref', '--no-deref', 'HEAD', merge, original)
        try:
            with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'pull_request',
                                        'GITHUB_EVENT_PATH': str(event), 'GITHUB_REPOSITORY': 'wooil1964/birdmap',
                                        'GITHUB_REF': 'refs/pull/1/merge', 'GITHUB_SHA': merge,
                                        'SITE_DATA_BASE_REF': ''}):
                yield
        finally:
            self.command('update-ref', '--no-deref', 'HEAD', original, merge)
            self.command('symbolic-ref', 'HEAD', branch)

    def advance_automatic_main(self, name):
        (self.root / name).write_text(json.dumps({'syntheticAutomaticUpdate': name}), encoding='utf-8')
        self.command('add', '--', name)  # Candidate data and the runner event stay outside this main commit.
        self.command('commit', '--quiet', '-m', 'Synthetic automatic main update')
        self.ref = self.command('rev-parse', 'HEAD')
        self.command('update-ref', 'refs/remotes/origin/main', self.ref)

    def test_evidence_survives_weather_and_tide_main_advances(self):
        origin = self.ref
        self.current[0]['birds'] += ',쇠오리'
        changes = [self.species_review(), self.new_site()]
        self.write_candidate([], changes)
        with self.pr():
            assert_repository_sites(self.root)
        for name in ('weather_today.json', 'tide_today.json'):
            self.advance_automatic_main(name)
            self.assertTrue(all(review['baseCommit'] == origin for review in changes))
            self.assertNotEqual(self.ref, origin)
            with self.pr():
                self.assertEqual(assert_repository_sites(self.root)['addedIds'], ['902'])

    def test_stale_event_snapshot_uses_verified_tested_main_parent(self):
        snapshot = self.ref
        candidate = self.command('commit-tree', self.command('rev-parse', 'HEAD^{tree}'),
                                 '-p', self.ref, '-m', 'Candidate before bot advance')
        self.current[0]['birds'] += ',쇠오리'
        changes = [self.species_review(), self.new_site()]
        self.write_candidate([], changes)
        self.advance_automatic_main('weather_today.json')
        with self.pr(snapshot=snapshot, candidate=candidate):
            self.assertEqual(baseline_ref(self.root), self.ref)
            self.assertEqual(baseline_bytes(self.root, baseline_ref(self.root), 'weather_today.json'),
                             (self.root / 'weather_today.json').read_bytes())
            self.assertEqual(assert_repository_sites(self.root)['addedIds'], ['902'])

    def test_candidate_cannot_pose_as_merge_main_parent(self):
        candidate = self.command('commit-tree', self.command('rev-parse', 'HEAD^{tree}'),
                                 '-p', self.ref, '-m', 'Untrusted main parent')
        with self.pr(main_parent=candidate), self.assertRaises(ValueError):
            baseline_ref(self.root)

    def test_unrelated_candidate_and_noncommit_evidence_bases_fail(self):
        self.current[0]['birds'] += ',쇠오리'
        review = self.species_review()
        self.write_candidate([], [review])
        self.command('checkout', '--quiet', '-b', 'synthetic-candidate')
        self.command('add', '--', 'index.html', 'weather-proxy/src/sites.js', REVIEWS)
        self.command('commit', '--quiet', '-m', 'Synthetic candidate data')
        candidate = self.command('rev-parse', 'HEAD')
        unrelated = self.command('commit-tree', self.command('rev-parse', 'HEAD^{tree}'), '-m', 'Unrelated identical tree')
        blob = self.command('rev-parse', 'HEAD:index.html')
        for origin in (candidate, unrelated, blob, 'f' * 40, 'not-a-sha'):
            self.write_candidate([], [dict(review, baseCommit=origin)])
            with self.subTest(origin=origin), self.pr(), self.assertRaisesRegex(ValueError, 'Evidence|evidence'):
                assert_repository_sites(self.root)

    def test_ancestor_proof_does_not_accept_tampered_species_or_record_hash(self):
        self.current[0]['birds'] += ',쇠오리'
        species, new_site = self.species_review(), self.new_site()
        self.write_candidate([], [species, new_site])
        self.advance_automatic_main('weather_week.json')
        for reviews in ([dict(species, before='다른 종'), new_site],
                        [dict(species, after='다른 종'), new_site],
                        [species, dict(new_site, recordDigest='0' * 64)]):
            self.write_candidate([], reviews)
            with self.subTest(reviews=reviews), self.pr(), self.assertRaisesRegex(ValueError, 'exact old/new|payload mismatch'):
                assert_repository_sites(self.root)

    def test_actual_main_species_drift_invalidates_old_evidence(self):
        self.current[0]['birds'] += ',쇠오리'
        review, candidate = self.species_review(), copy.deepcopy(self.current)
        self.current = copy.deepcopy(self.before)
        self.current[0]['birds'] = '흰뺨검둥오리'
        self.write_candidate([])
        self.commit_base()  # A genuine data change, not an automatic weather-only commit.
        self.current = candidate
        self.write_candidate([], [review])
        with self.pr(), self.assertRaisesRegex(ValueError, 'exact old/new'):
            assert_repository_sites(self.root)

    def test_old_evidence_cannot_revive_revoked_main_approval(self):
        self.current[0]['lat'] += 0.1
        grant = self.grant()
        self.current = copy.deepcopy(self.before)
        self.write_candidate([grant])
        self.commit_base()
        self.current[0]['birds'] += ',쇠오리'
        review = self.species_review()
        self.current = copy.deepcopy(self.before)
        self.write_candidate([])
        self.commit_base()  # The latest trusted main has revoked the older grant.
        self.current[0]['lat'] += 0.1
        self.current[0]['birds'] += ',쇠오리'
        self.write_candidate([grant], [review])
        with self.pr(snapshot=review['baseCommit']), self.assertRaisesRegex(ValueError, 'without trusted base approval'):
            assert_repository_sites(self.root)

    def test_pr_gate_keeps_id_coordinate_and_pelagic_protection_after_main_advance(self):
        self.advance_automatic_main('weather_today.json')
        for change in ('delete', 'duplicate', 'coordinate', 'pelagic', 'worker'):
            self.current = copy.deepcopy(self.before)
            if change == 'delete':
                self.current = []
            elif change == 'duplicate':
                self.current.append(copy.deepcopy(self.current[0]))
            elif change == 'coordinate':
                self.current[0]['lat'] += 0.1
            elif change == 'pelagic':
                self.current[0]['pelagic'] = True
            self.write_candidate([])
            if change == 'worker':
                target = self.root / 'weather-proxy/src/sites.js'
                target.write_text('Object.freeze({});', encoding='utf-8')
            with self.subTest(change=change), self.pr(), self.assertRaises(ValueError):
                assert_repository_sites(self.root)

    def test_same_pr_approval_file_cannot_authorize_protected_changes(self):
        self.current[0]['lat'] += 0.1
        self.write_candidate([self.grant()])
        with self.local(), self.assertRaisesRegex(ValueError, 'without trusted base approval'):
            assert_repository_sites(self.root)

    def test_prior_base_approval_works_and_candidate_edits_do_not_change_authority(self):
        self.current[0]['lat'] += 0.1
        grant = self.grant()
        self.current = copy.deepcopy(self.before)
        self.write_candidate([grant])
        self.commit_base()  # A separate prior main change, not a candidate grant.
        self.current[0]['lat'] += 0.1
        self.write_candidate([])
        with self.local():
            assert_repository_sites(self.root)

    def test_missing_base_ledger_does_not_grant_authority(self):
        self.command('rm', REVIEWS)
        self.commit_base()
        self.current[0]['lat'] += 0.1
        self.write_candidate([self.grant()])
        with self.local(), self.assertRaisesRegex(ValueError, 'without trusted base approval'):
            assert_repository_sites(self.root)

    def test_current_base_engine_comparison_allows_data_edits_but_blocks_code(self):
        self.current[0]['localBirdingTip'] = 'Updated guidance'
        self.write_candidate([])
        with self.local():
            assert_repository_sites(self.root)
            assert_engine_matches_base(self.root)
        target = self.root / 'index.html'
        target.write_text(target.read_text(encoding='utf-8').replace('run();', 'other();'), encoding='utf-8')
        with self.local(), self.assertRaisesRegex(ValueError, 'outside siteData'):
            assert_engine_matches_base(self.root)

    def test_duplicate_worker_json_keys_fail(self):
        target = self.root / 'weather-proxy/src/sites.js'
        record = json.dumps(self.worker(self.before)['901'])
        target.write_text('Object.freeze({"901":' + record + ',"901":' + record + '});', encoding='utf-8')
        with self.local(), self.assertRaisesRegex(ValueError, 'Duplicate JSON key'):
            assert_repository_sites(self.root)

    def test_ci_event_baseline_is_main_and_overrides_fail_closed(self):
        with self.pr():
            env = dict(os.environ)
            self.assertEqual(baseline_ref(self.root, env), self.ref)
            for extra in ({'SITE_DATA_BASE_REF': 'HEAD'}, {'GITHUB_EVENT_NAME': 'push'},
                          {'GITHUB_SHA': self.ref}, {'GITHUB_REF': 'refs/pull/1/head'},
                          {'GITHUB_REF': 'refs/pull/2/merge'}):
                with self.subTest(env=extra), self.assertRaises(ValueError):
                    baseline_ref(self.root, dict(env, **extra))
            event = self.root / 'runner-event.json'
            document = json.loads(event.read_text(encoding='utf-8'))
            candidate = document['pull_request']['head']['sha']
            document['pull_request']['head']['sha'] = self.ref
            event.write_text(json.dumps(document), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'runner PR merge commit'):
                baseline_ref(self.root, env)
            document['pull_request']['head']['sha'] = candidate
            document['pull_request']['base']['ref'] = 'feature'
            event.write_text(json.dumps(document), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'base must be main'):
                baseline_ref(self.root, env)

    def test_local_candidate_cannot_be_selected_as_its_own_main_baseline(self):
        self.current[0]['localBirdingTip'] = 'Candidate edit'
        self.write_candidate([])
        self.command('add', '.')
        self.command('commit', '--quiet', '-m', 'Synthetic candidate')
        self.assertEqual(baseline_ref(self.root, {}), self.ref)
        with self.assertRaises(ValueError):
            baseline_ref(self.root, {'SITE_DATA_BASE_REF': 'HEAD'})


class WeatherEventBoundaryTests(unittest.TestCase):
    def test_scheduled_and_push_weather_registry_checks_do_not_consult_pr_state(self):
        import test_weather
        for event in ('schedule', 'push'):
            env = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': event,
                   'GITHUB_EVENT_PATH': 'missing-synthetic-event.json', 'SITE_DATA_BASE_REF': 'invalid'}
            with self.subTest(event=event), patch.dict(os.environ, env), patch(
                    'site_data_contract.baseline_ref', side_effect=AssertionError('Weather consulted PR state')):
                result = unittest.TestResult()
                test_weather.WeatherTests('test_registry_all_ids_coordinates_and_branches').run(result)
                self.assertTrue(result.wasSuccessful(), result.errors + result.failures)


# ---------------------------------------------------------------------------
# Strict data block, fixed spots, Worker admin parity and the browser expectation.
# ---------------------------------------------------------------------------
import site_data_contract as contract

SITE_A = {'id': '1', 'name': '시험 갯벌', 'lat': 37.1, 'lon': 126.7}
SITE_B = {'id': '2', 'name': '시험 섬', 'lat': 36.5, 'lon': 126.1}
SPOTS = [{'id': 'fixed:1:0', 'siteId': '1', 'lat': 37.11, 'lon': 126.71, 'species': ['도요']},
         {'id': 'fixed:1:1', 'siteId': '1', 'lat': 37.12, 'lon': 126.72, 'species': ['물떼새', '저어새']},
         {'id': 'fixed:2:0', 'siteId': '2', 'lat': 36.51, 'lon': 126.11, 'species': ['직박구리']}]
UI_CODE = "function pick(id){return siteData.find(function(s){return s.id===id;});}\n/* 탐조지(siteData) 설명 */\n"


def data_page(spots=SPOTS, before_spots='var markerRegistry={};\n/* 수동 점 */\n', after=UI_CODE, head='', initial=None):
    initial = [SITE_A] if initial is None else initial
    return (head + '<script type="application/ld+json">{"@type":"Map"}</script>\n<script>\n'
            + 'var siteData=' + json.dumps(initial, ensure_ascii=False) + ';\n'
            + 'siteData=siteData.concat([\n  ' + json.dumps(SITE_B, ensure_ascii=False) + '\n]);\n'
            + before_spots + 'var siteSpotData=' + json.dumps(spots, ensure_ascii=False) + ';\n' + after + '</script>\n')


class StrictDataBlockTests(unittest.TestCase):
    def test_live_page_agrees_with_legacy_and_worker_parsers(self):
        text = (ROOT / 'index.html').read_text(encoding='utf-8')
        data = contract.parse_protected_data(text)
        self.assertEqual(data['sites'], contract.runtime_from_text(text))
        self.assertEqual(data['sites'], load_runtime_sites())
        self.assertEqual(len({s['id'] for s in data['sites']}), len(data['sites']))
        script = ("import {SITE_PICKER_JS} from './reports-api/src/site-picker.js';import {readFileSync} from 'node:fs';"
                  "const arrays=new Function(SITE_PICKER_JS+'\\nreturn siteDataArrays;')()(readFileSync('index.html','utf8'));"
                  "process.stdout.write(JSON.stringify(arrays.flatMap(a=>JSON.parse(a))));")
        worker = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))
        self.assertEqual(worker, data['sites'])  # The reports Worker reads the same records.

    def test_valid_block_with_comments_and_ordinary_ui_code_passes(self):
        data = contract.parse_protected_data(data_page())
        self.assertEqual((data['initial'], data['sites'], data['spots']), ([SITE_A], [SITE_A, SITE_B], SPOTS))
        contract.parse_protected_data(data_page(before_spots='// 한 줄 주석\nvar a={"x":[1,2]};\n', after=''))
        contract.parse_protected_data(data_page().replace('\n', '\r\n'))

    def test_decoys_duplicates_and_unsupported_forms_fail_closed(self):
        page = data_page()
        cases = {
            'html comment decoy': (data_page(head='<!-- var siteData=[] -->\n'), 'Unexpected siteData declaration'),
            'js comment decoy': (data_page(after='/* var siteData=[{"id":"9"}]; */\n'), 'Unexpected siteData declaration'),
            'string decoy': (data_page(after='var s="siteData=[1]";\n'), 'Unexpected siteData assignment'),
            'commented-out real block': (page.replace('<script>\nvar siteData=', '<script>\n/* */var siteData=', 1),
                                         'Exactly one inline script'),
            'second declaration script': (page + '<script>\nvar siteData=[];\n</script>', 'Exactly one inline script'),
            'later reassignment': (data_page(after='siteData=siteData.filter(Boolean);\n'), 'Unexpected siteData assignment'),
            'compound assignment': (data_page(after='siteSpotData+=1;\n'), 'Unexpected siteSpotData assignment'),
            'window property write': (data_page(after='window.siteSpotData=[];\n'), 'Unexpected siteSpotData assignment'),
            'quoted global access': (data_page(after="window['siteData'].push(1);\n"), 'quoted global name'),
            'defineProperty by name': (data_page(after='Object.defineProperty(window,"siteData",{value:[]});\n'), 'quoted global name'),
            'Reflect.set by name': (data_page(after='Reflect.set(globalThis,`siteSpotData`,[]);\n'), 'quoted global name'),
            'nomodule data block': (data_page().replace('<script>\nvar siteData=', '<script nomodule>\nvar siteData=', 1),
                                    'Exactly one inline script'),
            'template data block': ('<template>' + data_page() + '</template>', 'Exactly one inline script'),
            'textarea data block': ('<textarea>' + data_page() + '</textarea>', 'Exactly one inline script'),
            'noscript data block': ('<noscript>' + data_page() + '</noscript>', 'Exactly one inline script'),
            'let redeclaration': (data_page(after='{let siteData=[];}\n'), 'Unexpected siteData declaration'),
            'expression initializer': (page.replace(';\nsiteData=siteData.concat', '.map(f);\nsiteData=siteData.concat', 1),
                                       'siteData declaration must end with ;'),
            'non-literal concat': (page.replace('siteData=siteData.concat([', 'siteData=siteData.concat(extra,[', 1),
                                   'concat is not a JSON array literal'),
            'code before spots': (data_page(before_spots='run();\n'), 'Unsupported statement before siteSpotData'),
            'missing spots': (page.replace('var siteSpotData=', 'var siteSpotDatum=', 1), 'Unsupported statement before siteSpotData'),
            'duplicate JSON key': (page.replace('"name": "시험 갯벌"', '"name": "시험 갯벌", "name": "x"', 1), 'not a JSON array literal'),
            'NaN coordinate': (page.replace('"lat": 37.1,', '"lat": NaN,', 1), 'not a JSON array literal'),
            'non-object record': (data_page(spots=[1]), 'JSON objects'),
        }
        for name, (text, message) in cases.items():
            with self.subTest(case=name), self.assertRaisesRegex(ValueError, message):
                contract.parse_protected_data(text)

    def test_asset_scripts_may_read_but_not_write_data(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory) / 'assets'
            assets.mkdir()
            (assets / 'ok.js').write_text('(global.siteData||[]).forEach(f);var x=global.siteSpotData;', encoding='utf-8')
            contract.assert_assets_do_not_write_data(directory)
            for code in ('global.siteData=[];', 'siteSpotData.length=0;siteSpotData=[];', "self['siteData']=[]"):
                (assets / 'bad.js').write_text(code, encoding='utf-8')
                with self.subTest(code=code), self.assertRaises(ValueError):
                    contract.assert_assets_do_not_write_data(directory)
        contract.assert_assets_do_not_write_data(ROOT)


def spot_grant(before, after, **extra):
    grant = {'action': 'update_spot', 'id': before['id'], 'before': before, 'after': after,
             'beforeDigest': digest(before), 'reason': '현장 재측정', 'sources': ['https://example.org/evidence'],
             'userApproval': 'https://github.com/wooil1964/birdmap/issues/1'}
    grant.update(extra)
    return grant


class FixedSpotContractTests(unittest.TestCase):
    SITES = {'1', '2'}

    def changed(self, index, **fields):
        spots = copy.deepcopy(SPOTS)
        spots[index].update(fields)
        return spots

    def test_unchanged_and_approved_updates_pass(self):
        contract.validate_spots(SPOTS, copy.deepcopy(SPOTS), self.SITES)
        moved = self.changed(1, lat=37.125, species=['물떼새'])
        contract.validate_spots(SPOTS, moved, self.SITES, [spot_grant(SPOTS[1], moved[1])])

    def test_unapproved_changes_deletion_order_and_new_spots_fail(self):
        cases = {
            'coordinate': (self.changed(0, lat=37.2), [], 'without trusted base approval'),
            'species': (self.changed(2, species=['직박구리', '동박새']), [], 'without trusted base approval'),
            'parent': (self.changed(2, siteId='1'), [], 'must name its parent'),
            'delete': (SPOTS[:2], [], 'deleted/renamed'),
            'rename': (self.changed(2, id='fixed:2:1'), [], 'deleted/renamed'),
            'reorder': ([SPOTS[1], SPOTS[0], SPOTS[2]], [], 'order changed'),
            'new spot': (SPOTS + [{'id': 'fixed:2:1', 'siteId': '2', 'lat': 36.52, 'lon': 126.12, 'species': ['A']}], [],
                         'not enabled'),
            'duplicate id': (SPOTS + [SPOTS[0]], [], 'Duplicate fixed spot'),
            'wrong grant target': (self.changed(0, lat=37.2), [spot_grant(SPOTS[0], self.changed(0, lat=37.3)[0])],
                                   'without trusted base approval'),
            'stale grant': (self.changed(0, lat=37.2), [spot_grant(SPOTS[0], self.changed(0, lat=37.2)[0], beforeDigest='0' * 64)],
                            'approval binding'),
            'grant without user link': (self.changed(0, lat=37.2),
                                        [spot_grant(SPOTS[0], self.changed(0, lat=37.2)[0], userApproval='https://example.org')],
                                        'user approval reference'),
            'grant changes id': (self.changed(0, lat=37.2), [spot_grant(SPOTS[0], {**self.changed(0, lat=37.2)[0], 'id': 'fixed:1:5'})],
                                 'cannot change an ID'),
        }
        for name, (current, grants, message) in cases.items():
            with self.subTest(case=name), self.assertRaisesRegex(ValueError, message):
                contract.validate_spots(SPOTS, current, self.SITES, grants)

    def test_invalid_spot_records_fail(self):
        for name, fields, message in (('latitude', {'lat': 91}, 'coordinate'), ('zero', {'lat': 0, 'lon': 0}, 'coordinate'),
                                      ('text latitude', {'lat': '37.1'}, 'coordinate'), ('no species', {'species': []}, 'species'),
                                      ('repeat species', {'species': ['A', 'A']}, 'species'), ('extra field', {'note': 'x'}, 'fields'),
                                      ('missing parent', {'id': 'fixed:9:0', 'siteId': '9'}, 'parent site missing')):
            spots = self.changed(0, **fields)
            with self.subTest(case=name), self.assertRaisesRegex(ValueError, message):
                contract.validate_spots(spots, spots, self.SITES)


class AdminSpotParityTests(unittest.TestCase):
    def test_live_admin_page_matches_live_spots(self):
        rows = contract.admin_fixed_spots((ROOT / contract.ADMIN_PAGE).read_text(encoding='utf-8'))
        spots = contract.parse_protected_data((ROOT / 'index.html').read_text(encoding='utf-8'))['spots']
        contract.assert_admin_spot_parity(spots, rows)

    def test_admin_drift_and_unsupported_shapes_fail(self):
        page = ("var FIXED_SPOTS=[\n  {key:'fixed:1:0',label:'A (37.11000, 126.71000)'},\n"
                "  {key:'fixed:1:1',label:'B (37.12000, 126.72000)'},\n  {key:'fixed:2:0',label:'C (36.51000, 126.11000)'}\n];\n")
        contract.assert_admin_spot_parity(SPOTS, contract.admin_fixed_spots(page))
        for name, text, message in (
                ('order', page.replace("fixed:1:0','label:'A", "x", 0).replace('fixed:1:0', 'fixed:Z').replace('fixed:1:1', 'fixed:1:0')
                 .replace('fixed:Z', 'fixed:1:1'), 'keys/order'),
                ('coordinate', page.replace('37.11000', '37.11100'), 'label coordinate'),
                ('missing', page.replace("  {key:'fixed:2:0',label:'C (36.51000, 126.11000)'}\n", ''), 'keys/order'),
                ('shape', page.replace("{key:'fixed:1:0'", "{key:`fixed:1:0`"), 'Unsupported admin'),
                ('declaration', page.replace('var FIXED_SPOTS=[', 'var FIXED=['), 'declaration')):
            with self.subTest(case=name), self.assertRaisesRegex(ValueError, message):
                contract.assert_admin_spot_parity(SPOTS, contract.admin_fixed_spots(text))


class FixedSpotLedgerTrustTests(unittest.TestCase):
    """A grant inside the candidate PR never authorises that PR; a grant already on main does."""
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.git('init', '--quiet')
        self.git('config', 'user.email', 'ci@example.invalid')
        self.git('config', 'user.name', 'CI')
        (self.root / 'reports-api/src').mkdir(parents=True)
        (self.root / '.github/scripts/fixtures').mkdir(parents=True)
        self.admin = "var FIXED_SPOTS=[\n" + ",\n".join(
            "  {key:'%s',label:'x (%.5f, %.5f)'}" % (s['id'], s['lat'], s['lon']) for s in SPOTS) + "\n];\n"
        self.write(SPOTS, [])
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'base')
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        self.local = patch.dict(os.environ, {'GITHUB_ACTIONS': 'false', 'SITE_DATA_BASE_REF': ''})

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True).strip()

    def write(self, spots, approvals, admin=None):
        (self.root / 'index.html').write_text(data_page(spots=spots), encoding='utf-8')
        (self.root / contract.SPOT_REVIEWS).write_text(json.dumps({'version': 1, 'approvals': approvals}), encoding='utf-8')
        (self.root / contract.ADMIN_PAGE).write_text(admin or self.admin, encoding='utf-8')

    def test_same_pr_grant_is_ignored_and_prior_main_grant_works(self):
        moved = copy.deepcopy(SPOTS)
        moved[0]['lat'] = 37.111
        admin = self.admin.replace('37.11000', '37.11100')
        self.write(moved, [spot_grant(SPOTS[0], moved[0])], admin)
        with self.local, self.assertRaisesRegex(ValueError, 'without trusted base approval'):
            contract.assert_repository_spots(self.root)
        self.write(SPOTS, [spot_grant(SPOTS[0], moved[0])])
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'approved grant lands on main first')
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        self.write(moved, [], admin)
        with self.local:
            self.assertEqual(contract.assert_repository_spots(self.root)['spots'], moved)

    def test_admin_page_must_follow_an_approved_move(self):
        moved = copy.deepcopy(SPOTS)
        moved[0]['lat'] = 37.111
        self.write(SPOTS, [spot_grant(SPOTS[0], moved[0])])
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'grant')
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        self.write(moved, [])
        with self.local, self.assertRaisesRegex(ValueError, 'label coordinate'):
            contract.assert_repository_spots(self.root)


class ExpectedSiteDataTests(unittest.TestCase):
    def test_live_expectation_is_built_from_validated_data(self):
        expected = contract.expected_site_data(ROOT)
        data = contract.parse_protected_data((ROOT / 'index.html').read_text(encoding='utf-8'))
        self.assertEqual(expected['siteData'], data['sites'])
        self.assertEqual(expected['siteSpotData'], data['spots'])
        self.assertEqual(expected['initialCount'], len(data['initial']))
        self.assertEqual(expected['baseCommit'], baseline_ref(ROOT))

    def test_export_fails_instead_of_writing_unvalidated_data(self):
        with patch.object(contract, 'assert_repository_spots', side_effect=ValueError('spot contract failed')), \
                self.assertRaisesRegex(ValueError, 'spot contract failed'):
            contract.expected_site_data(ROOT)


# unittest.main() runs these cases through the existing central-sites CI step.
if __name__ == '__main__':
    unittest.main()
