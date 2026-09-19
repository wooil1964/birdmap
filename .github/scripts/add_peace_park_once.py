"""One-time, assertion-guarded Peace Park addition for a temporary feature branch."""
from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.github' / 'scripts'))
from site_data import compare_sites, load_runtime_sites, load_worker_sites  # noqa: E402

index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
original_sites = load_runtime_sites(index_path)
original_worker = load_worker_sites()
assert len(original_sites) == len(original_worker) == 189, 'unexpected baseline site count'
assert max(int(s['id']) for s in original_sites) == 194, 'unexpected ID range'
assert not any(s['id'] == '195' or s['name'] == '평화의공원' for s in original_sites), 'site already exists'
assert '195' not in original_worker, 'worker ID already exists'

# A park with a forest-songbird weather profile, rather than tidal/island weather.
site = copy.deepcopy(next(s for s in original_sites if s['id'] == '147'))
lat, lon = 37.5642583333, 126.8920861111
species = ['붉은양진이', '흰꼬리딱새', '큰덤불해오라기', '붉은등때까치',
           '동박새', '흰눈썹황색새', '큰유리새', '쇠솔새']
site.update({
    'id': '195', 'name': '평화의공원', 'country': '대한민국',
    'region': '서울 마포', 'sido': '서울', 'sigungu': '마포',
    'env': '도심공원·수목', 'habitatType': '도심공원·수목',
    'birds': '산림성 조류·이동성 조류 ' + ', '.join(species),
    'seasons': ['봄', '여름', '가을', '겨울'],
    'rare': False, 'mijo': False, 'island': False, 'pelagic': False,
    'publicTransitHigh': False, 'recommend5': False, 'overseas': False,
    'lat': lat, 'lon': lon, 'markerVar': 'marker_birdmap_site_195',
    'birdingFeature': '도심공원;산림조류;이동성 조류',
    'mainBirdGroup': '산림성 조류·이동성 조류',
    'bestSeason': '봄·가을 이동기·겨울', 'bestMonth': '봄;가을;겨울',
    'siteGrade': '★★★',
    'oneLineIntro': '공원 숲과 수목대에서 이동성 조류를 관찰',
    'weatherRuleKey': 'forest_songbird', 'windyPriority': 'wind;rain;temp',
    'tideSensitive': '아니오', 'waveSensitive': '아니오',
    'bestTime': '일출~오전', 'carBirding': '제한', 'walkingLevel': '도보 이동',
    'parkingV23': '', 'restroomV23': '', 'difficulty': '',
    'environmentBirdingLabel': '공원탐조',
    'seasonTags': '봄·여름·가을·겨울',
    'tideUse': '아니오', 'tideStationName': '', 'tideStationCode': '',
    'showTide': False, 'showWave': False,
    'localTipUse': False, 'localTipSiteKey': '',
    'localDeparturePoint': '', 'localBirdingTip': '',
    'ebirdHotspotUrl': '',
    'naverMapUrl': 'https://map.naver.com/v5/search/' + quote('서울 마포구 평화의공원'),
    'kakaoMapUrl': f'https://map.kakao.com/link/map/{quote("평화의공원")},{lat},{lon}',
    'windyUrl': f'https://www.windy.com/{lat}/{lon}?{lat},{lon},10',
    'ksaUrl': '',
})
site['searchText'] = ' '.join((site['id'], site['name'], site['country'], site['region'],
                             site['env'], site['birds'], site['birdingFeature'],
                             site['seasonTags'], site['weatherRuleKey']))
new_spots = [
    {'siteId': '195', 'lat': 37.5632527778, 'lon': 126.8969333333,
     'species': ['큰덤불해오라기', '붉은등때까치']},
    {'siteId': '195', 'lat': 37.5675583333, 'lon': 126.8912222222,
     'species': ['동박새', '흰눈썹황색새', '큰유리새', '쇠솔새']},
]
assert index.count('var markerRegistry={};') == 1
index = index.replace('var markerRegistry={};',
                      'siteData=siteData.concat([\n  ' + json.dumps(site, ensure_ascii=False, separators=(',', ':'))
                      + '\n]);\nvar markerRegistry={};', 1)
spot_match = re.search(r'\bvar\s+siteSpotData\s*=\s*', index)
assert spot_match, 'spot data declaration missing'
spot_data, consumed = json.JSONDecoder().raw_decode(index[spot_match.end():])
assert len(spot_data) == 1 and spot_data[0]['siteId'] == '21', 'unexpected existing spot data'
spot_data.extend(new_spots)
spot_literal = '[\n' + ',\n'.join('  ' + json.dumps(s, ensure_ascii=False, separators=(',', ':'))
                                     for s in spot_data) + '\n]'
index = index[:spot_match.end()] + spot_literal + index[spot_match.end() + consumed:]
index_path.write_text(index, encoding='utf-8')

# Derive worker registry fields from the new runtime entry; preserve all prior entries.
worker_path = ROOT / 'weather-proxy' / 'src' / 'sites.js'
worker_text = worker_path.read_text(encoding='utf-8')
worker_match = re.search(r'Object\.freeze\(\s*', worker_text)
assert worker_match, 'worker registry missing'
worker_json, consumed = json.JSONDecoder().raw_decode(worker_text[worker_match.end():])
assert len(worker_json) == 189 and '195' not in worker_json
worker_entry = {'name': site['name'], 'lat': str(site['lat']), 'lon': str(site['lon']),
                'environment': site['env'], 'pelagic': False}
original_literal = worker_text[worker_match.end():worker_match.end() + consumed]
assert original_literal.endswith('}')
new_literal = original_literal[:-1] + ',"195":' + json.dumps(worker_entry, ensure_ascii=False,
                                                             separators=(',', ':')) + '}'
worker_path.write_text(worker_text[:worker_match.end()] + new_literal
                       + worker_text[worker_match.end() + consumed:], encoding='utf-8')

weather_test = ROOT / '.github' / 'scripts' / 'test_weather.py'
tests = weather_test.read_text(encoding='utf-8')
for old, new in (
    ('report["runtimeSiteCount"], 189', 'report["runtimeSiteCount"], 190'),
    ('report["commonIdCount"], 189', 'report["commonIdCount"], 190'),
    ('output["siteCount"], 189', 'output["siteCount"], 190'),
    ('output["unavailableSiteCount"], 188', 'output["unavailableSiteCount"], 189'),
    ('week["siteCount"], 189', 'week["siteCount"], 190'),
):
    assert tests.count(old) == 1, f'unexpected weather-test guard: {old}'
    tests = tests.replace(old, new, 1)
weather_test.write_text(tests, encoding='utf-8')

weekly_test = ROOT / '.github' / 'scripts' / 'test_weekly_recommendation.mjs'
tests = weekly_test.read_text(encoding='utf-8')
for old, new, expected in (
    ('assert.equal(RUNTIME.length,189)', 'assert.equal(RUNTIME.length,190)', 1),
    ('assert.equal(rows.length,189)', 'assert.equal(rows.length,190)', 3),
    ('실데이터 189곳의', '실데이터 190곳의', 1),
    ('실제 189 site', '실제 190 site', 1),
):
    assert tests.count(old) == expected, f'unexpected weekly-test guard: {old}'
    tests = tests.replace(old, new)
weekly_test.write_text(tests, encoding='utf-8')

runtime, worker = load_runtime_sites(), load_worker_sites()
report = compare_sites(runtime, worker)
assert report['runtimeSiteCount'] == report['workerSiteCount'] == report['commonIdCount'] == 190, report
assert all(not value for value in report.values() if isinstance(value, list)), report
assert runtime[-1] == site, 'site appended incorrectly'
assert all(s['id'] != '195' for s in original_sites)
assert json.JSONDecoder().raw_decode(index[spot_match.end():])[0] == spot_data
assert len(spot_data) == 3 and all(s['siteId'] == '195' for s in spot_data[1:])
print('PEACE_PARK_PATCH_OK', report, 'spot_count=', len(spot_data), 'new_id=', site['id'])
