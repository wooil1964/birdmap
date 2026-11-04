"""PR-relative site protection and historical public-area evidence."""
import json
import copy
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote
from unittest.mock import patch

from site_data import load_runtime_sites, load_worker_sites, compare_sites
from site_data_contract import (assert_repository_sites, assert_engine_matches_base, baseline_ref,
                                digest, protected, validate_sites, validate_mapping_extension, without_site_data, REVIEWS)

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

    def pr(self):
        event = self.root / 'runner-event.json'
        event.write_text(json.dumps({'pull_request': {'base': {
            'ref': 'main', 'sha': self.ref, 'repo': {'full_name': 'wooil1964/birdmap'}}}}), encoding='utf-8')
        return patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'pull_request',
                                      'GITHUB_EVENT_PATH': str(event), 'GITHUB_REPOSITORY': 'wooil1964/birdmap',
                                      'SITE_DATA_BASE_REF': ''})

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
        with self.pr(), self.assertRaisesRegex(ValueError, 'without trusted base approval'):
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
        event = self.root / 'event.json'
        document = {'pull_request': {'base': {'ref': 'main', 'sha': self.ref,
                                             'repo': {'full_name': 'wooil1964/birdmap'}}}}
        event.write_text(json.dumps(document), encoding='utf-8')
        env = dict(GITHUB_ACTIONS='true', GITHUB_EVENT_NAME='pull_request', GITHUB_EVENT_PATH=str(event),
                   GITHUB_REPOSITORY='wooil1964/birdmap')
        self.assertEqual(baseline_ref(self.root, env), self.ref)
        for extra in ({'SITE_DATA_BASE_REF': 'HEAD'}, {'GITHUB_EVENT_NAME': 'push'}):
            with self.subTest(env=extra), self.assertRaises(ValueError):
                baseline_ref(self.root, dict(env, **extra))
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


# unittest.main() runs these cases through the existing central-sites CI step.
if __name__ == '__main__':
    unittest.main()
