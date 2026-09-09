"""Offline regression tests; never call credentialed services."""
import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import update_weather as weather
from site_data import load_runtime_sites, load_worker_sites, compare_sites


class WeatherTests(unittest.TestCase):
    def setUp(self):
        self.target = datetime(2026, 9, 6, 17, 0, tzinfo=weather.KST)
        self.site = {"id": 188, "name": "이천항", "lat": 35.263447, "lon": 129.239856}
        self.atmosphere = {"ts": [self.target.timestamp() * 1000],
                           "wind_u-surface": [0], "wind_v-surface": [0],
                           "past3hprecip-surface": [0], "temp-surface": [25]}

    def result(self, **site_fields):
        return weather.build_site_result(dict(self.site, **site_fields), weather.load_rules(),
                                         self.atmosphere, None, None, self.target)

    def test_registry_all_ids_coordinates_and_branches(self):
        runtime, worker = load_runtime_sites(), load_worker_sites()
        report = compare_sites(runtime, worker)
        self.assertEqual(report["runtimeSiteCount"], 187)
        self.assertEqual(report["commonIdCount"], 187)
        self.assertFalse(any(v for v in report.values() if isinstance(v, list)))
        self.assertEqual(worker["188"]["lat"], self.site["lat"])
        self.assertEqual(worker["14"]["name"], "걸매리")

    def test_parser_includes_concat_and_rejects_duplicate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "index.html"
            first = json.dumps([self.site])
            path.write_text("var siteData=" + first + ";siteData=siteData.concat(" + first + ");")
            with self.assertRaisesRegex(ValueError, "duplicated"):
                load_runtime_sites(path)

    def test_zero_is_valid_but_missing_rain_cannot_score(self):
        self.assertTrue(self.result()["scoreEligible"])
        self.assertEqual(self.result()["rain"], "강수 없음")
        self.atmosphere["past3hprecip-surface"] = [None]
        self.assertIsNone(self.result()["score"])
        self.assertIsNone(self.result()["rain"])

    def test_missing_wind_is_not_calm(self):
        self.atmosphere["wind_u-surface"] = [None]
        with self.assertRaisesRegex(RuntimeError, "wind"):
            self.result()

    def test_old_forecast_and_missing_required_wave_cannot_score(self):
        self.assertFalse(self.result(showWave=True)["scoreEligible"])
        self.atmosphere["ts"] = [(self.target - timedelta(days=1)).timestamp() * 1000]
        old = self.result()
        self.assertTrue(old["stale"])
        self.assertIsNone(old["score"])

    def test_open_meteo_three_hour_rain_and_timestamp(self):
        data = {"current": {"time": "2026-09-06T17:00", "wind_speed_10m": 0,
                            "wind_direction_10m": 0, "precipitation": 99},
                "hourly": {"time": ["2026-09-06T15:00", "2026-09-06T16:00", "2026-09-06T17:00"],
                           "precipitation": [1, 2, 3]}}
        with patch.object(weather, "request_open_meteo", return_value=data):
            self.assertEqual(weather.open_meteo_atmospheric(35, 129, self.target)["past3hprecip-surface"], [6])
            data["hourly"]["precipitation"][0] = None
            self.assertEqual(weather.open_meteo_atmospheric(35, 129, self.target)["past3hprecip-surface"], [None])
            del data["current"]["time"]
            with self.assertRaisesRegex(RuntimeError, "timestamp"):
                weather.open_meteo_atmospheric(35, 129, self.target)

    def test_total_outage_preserves_reference_without_renewing_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "weather.json"
            path.write_text(json.dumps({"updated": "2026-08-25 18:49 KST", "sites": {
                "188": {"forecastTime": "2026-08-25 18:00 KST", "wind": "1m/s", "score": 90},
                "19": {"dataUnavailable": True, "wind": None}}}), encoding="utf-8")
            week_path = Path(directory) / "weather_week.json"
            with patch.object(weather, "OUTPUT_PATH", path), patch.object(weather, "WEEK_OUTPUT_PATH", week_path), patch.object(weather, "request_forecast", side_effect=RuntimeError("offline")), patch.object(weather, "process_site", side_effect=RuntimeError("offline")), contextlib.redirect_stdout(io.StringIO()):
                weather.main()
            output = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(output["siteCount"], 187)
            self.assertEqual(output["status"], "api_failed_fallback_available")
            self.assertEqual(output["reusedCount"], 1)
            self.assertEqual(output["unavailableSiteCount"], 186)
            self.assertEqual(output["sites"]["188"]["generatedAt"], "2026-08-25 18:49 KST")
            self.assertFalse(output["sites"]["188"]["scoreEligible"])
            self.assertIsNone(output["sites"]["19"]["score"])

    def test_errors_redact_environment_key_and_query(self):
        with patch.dict(weather.os.environ, {"WINDY_API_KEY": "synthetic-secret"}):
            message = weather.safe_error(RuntimeError("synthetic-secret serviceKey=another-secret&x=1"))
            self.assertNotIn("synthetic-secret", message)
            self.assertNotIn("another-secret", message)


class WeatherWeekTests(unittest.TestCase):
    """The weekly dataset reuses the daily responses; it never adds a request of its own."""

    def setUp(self):
        self.now = datetime(2026, 9, 7, 10, 0, tzinfo=weather.KST)
        self.rules = weather.load_rules()
        self.site = {"id": 1, "name": "어청도", "lat": 36.11972, "lon": 125.97962,
                     "weatherRuleKey": "island_migrant"}
        # Matches the measured operational GFS timeline: 80 stamps, 3 hours apart, from 06:00 KST.
        self.first = datetime(2026, 9, 7, 6, 0, tzinfo=weather.KST)
        self.stamps = [(self.first + timedelta(hours=3 * step)) for step in range(80)]
        count = len(self.stamps)
        self.atmosphere = {
            "ts": [moment.timestamp() * 1000 for moment in self.stamps],
            "wind_u-surface": [-3.0] * count, "wind_v-surface": [-4.0] * count,
            "gust-surface": [8.0] * count, "past3hprecip-surface": [0.0] * count,
            "temp-surface": [22.0] * count, "visibility-surface": [20000.0] * count,
            "lclouds-surface": [10.0] * count, "mclouds-surface": [None] * count,
            "hclouds-surface": [None] * count,
        }
        self.wave = {"ts": list(self.atmosphere["ts"]), "waves_height-surface": [0.6] * count}

    def days(self, site_fields=None, wave=None):
        return weather.build_week_days(dict(self.site, **(site_fields or {})), self.rules,
                                       self.atmosphere, wave, self.now)

    def samples(self, days):
        return [sample for day in days.values() for sample in day["samples"]]

    def open_meteo_payload(self):
        hours = [datetime(2026, 9, 6, 0, 0, tzinfo=weather.KST) + timedelta(hours=step) for step in range(24 * 8)]
        return {
            "current": {"time": "2026-09-07T10:00", "temperature_2m": 22.0, "precipitation": 0.0,
                        "cloud_cover": 10, "visibility": 20000.0, "wind_speed_10m": 5.0,
                        "wind_direction_10m": 45.0, "wind_gusts_10m": 8.0},
            "hourly": {"time": [hour.strftime("%Y-%m-%dT%H:%M") for hour in hours],
                       "temperature_2m": [22.0] * len(hours), "precipitation": [0.5] * len(hours),
                       "cloud_cover": [10] * len(hours), "visibility": [20000.0] * len(hours),
                       "wind_speed_10m": [5.0] * len(hours), "wind_direction_10m": [45.0] * len(hours),
                       "wind_gusts_10m": [8.0] * len(hours)},
        }

    def test_one_windy_response_feeds_both_today_and_the_week(self):
        models = []

        def forecast(api_key, lat, lon, parameters, model):
            models.append(model)
            return self.wave if model == "gfsWave" else self.atmosphere

        with patch.object(weather, "request_forecast", side_effect=forecast), \
                patch.object(weather, "request_open_meteo", side_effect=AssertionError("no fallback expected")):
            result, week = weather.process_site("k", self.site, self.rules, self.now, "gfs", ["wind"])
            self.assertEqual(models, ["gfs"])
            self.assertTrue(result["scoreEligible"])
            self.assertTrue(week["days"])
            models.clear()
            _, island_week = weather.process_site("k", dict(self.site, island=True), self.rules,
                                                  self.now, "gfs", ["wind"])
        self.assertEqual(models, ["gfs", "gfsWave"])
        self.assertEqual(island_week["fieldSources"]["wave"], "windy")

    def test_three_hour_cadence_is_preserved(self):
        moments = [datetime.strptime(s["forecastTime"][:16], "%Y-%m-%d %H:%M") for s in self.samples(self.days())]
        self.assertEqual(moments, sorted(moments))
        self.assertEqual({(b - a).total_seconds() / 3600 for a, b in zip(moments, moments[1:])}, {3.0})
        self.assertEqual(len(moments), 54)

    def test_only_today_through_six_days_ahead_is_stored(self):
        days = self.days()
        self.assertEqual(sorted(days), ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10",
                                        "2026-09-11", "2026-09-12", "2026-09-13"])
        self.assertTrue(all(s["forecastTime"] < "2026-09-14" for s in self.samples(days)))

    def test_each_sample_belongs_to_its_day_key(self):
        for day_key, day in self.days().items():
            for sample in day["samples"]:
                self.assertEqual(sample["forecastTime"][:10], day_key)

    def test_past_and_future_samples_are_marked_at_generation_time(self):
        by_time = {s["forecastTime"]: s for s in self.samples(self.days())}
        self.assertTrue(by_time["2026-09-07 06:00 KST"]["isPastAtGeneration"])
        self.assertTrue(by_time["2026-09-07 09:00 KST"]["isPastAtGeneration"])
        self.assertFalse(by_time["2026-09-07 12:00 KST"]["isPastAtGeneration"])
        self.assertFalse(by_time["2026-09-08 06:00 KST"]["isPastAtGeneration"])

    def test_identical_input_scores_the_same_today_and_in_the_week(self):
        target = self.stamps[2]
        today = weather.build_site_result(self.site, self.rules, self.atmosphere, None, None, target)
        weekly = {s["forecastTime"]: s for s in self.samples(
            weather.build_week_days(self.site, self.rules, self.atmosphere, None, target))}
        matching = weekly[target.strftime("%Y-%m-%d %H:%M KST")]
        self.assertEqual(today["score"], matching["score"])
        self.assertEqual(today["grade"], matching["grade"])

    def test_component_fallback_only_asks_for_the_hourly_fields_it_needs(self):
        requests = []

        def meteo(url, parameters):
            requests.append(parameters["hourly"])
            return self.open_meteo_payload()

        windy = dict(self.atmosphere, **{"visibility-surface": [None] * len(self.stamps)})
        with patch.object(weather, "request_forecast", return_value=windy), \
                patch.object(weather, "request_open_meteo", side_effect=meteo):
            _, week = weather.process_site("k", self.site, self.rules, self.now, "gfs", ["wind"])
        self.assertEqual(requests, ["precipitation,visibility"])
        self.assertEqual(week["fieldSources"], {"atmosphere": "windy", "visibility": "open_meteo", "wave": None})
        self.assertTrue(all(s["visibilityKm"] == 20.0 for s in self.samples(week["days"])))

    def test_open_meteo_future_days_are_fallback_but_not_stale(self):
        payload = self.open_meteo_payload()
        with patch.object(weather, "request_forecast", side_effect=RuntimeError("offline")), \
                patch.object(weather, "request_open_meteo", return_value=payload) as fallback:
            result, week = weather.process_site("k", self.site, self.rules, self.now, "gfs", ["wind"])
        self.assertEqual(fallback.call_count, 1)
        self.assertEqual(result["fallbackSource"], "open_meteo")
        self.assertFalse(result["stale"])
        self.assertTrue(result["scoreEligible"])
        self.assertEqual(len(week["days"]), 7)
        samples = self.samples(week["days"])
        self.assertEqual(len(samples), 56)  # Open-Meteo anchors from 00:00, so every day is complete
        self.assertTrue(all(s["scoreEligible"] for s in samples))
        self.assertTrue(all(s["precipitation3h"] == 1.5 for s in samples))

    def test_previous_saved_never_becomes_a_weekly_forecast(self):
        with tempfile.TemporaryDirectory() as directory:
            path, week_path = Path(directory) / "weather.json", Path(directory) / "weather_week.json"
            path.write_text(json.dumps({"updated": "2026-09-06 18:00 KST", "sites": {
                "1": {"forecastTime": "2026-09-06 18:00 KST", "wind": "1m/s", "score": 90}}}), encoding="utf-8")
            with patch.object(weather, "OUTPUT_PATH", path), patch.object(weather, "WEEK_OUTPUT_PATH", week_path), \
                    patch.object(weather, "request_forecast", side_effect=RuntimeError("offline")), \
                    patch.object(weather, "process_site", side_effect=RuntimeError("offline")), \
                    contextlib.redirect_stdout(io.StringIO()):
                weather.main()
            today = json.loads(path.read_text(encoding="utf-8"))
            week = json.loads(week_path.read_text(encoding="utf-8"))
        self.assertEqual(today["sites"]["1"]["fallbackSource"], "previous_saved")
        self.assertEqual(week["siteCount"], 187)
        self.assertEqual(week["sampleCount"], 0)
        self.assertEqual(week["sites"]["1"]["days"], {})
        self.assertTrue(week["sites"]["1"]["dataUnavailable"])

    def test_wave_required_sample_without_wave_cannot_score(self):
        samples = self.samples(self.days({"showWave": True}))
        self.assertTrue(samples)
        self.assertFalse(any(s["scoreEligible"] for s in samples))
        self.assertTrue(all(s["missingScoreFields"] == ["wave"] and s["score"] is None for s in samples))
        scored = self.samples(self.days({"showWave": True}, wave=self.wave))
        self.assertTrue(all(s["scoreEligible"] and s["waveM"] == 0.6 for s in scored))

    def test_wave_is_never_borrowed_from_another_timestamp(self):
        single_day = {"ts": self.atmosphere["ts"][:2], "waves_height-surface": [0.6, 0.6]}
        samples = self.samples(self.days({"showWave": True}, wave=single_day))
        matched = [s for s in samples if s["waveM"] is not None]
        self.assertEqual([s["forecastTime"] for s in matched],
                         ["2026-09-07 06:00 KST", "2026-09-07 09:00 KST"])

    def test_open_meteo_hourly_precipitation_accumulates_over_three_hours(self):
        hours = [datetime(2026, 9, 7, hour, 0, tzinfo=weather.KST) for hour in range(13)]
        hourly = {"time": [hour.strftime("%Y-%m-%dT%H:%M") for hour in hours],
                  "precipitation": [1.0] * 13, "wind_speed_10m": [5.0] * 13,
                  "wind_direction_10m": [45.0] * 13, "wind_gusts_10m": [8.0] * 13,
                  "temperature_2m": [22.0] * 13, "visibility": [20000.0] * 13, "cloud_cover": [10] * 13}
        series = weather.open_meteo_week_atmospheric(hourly, self.now.date(), self.now.date())
        moments = [datetime.fromtimestamp(stamp / 1000, weather.KST).hour for stamp in series["ts"]]
        self.assertEqual(moments, [0, 3, 6, 9, 12])
        # 00:00 has no earlier hours to accumulate; every later anchor sums exactly three.
        self.assertEqual(series["past3hprecip-surface"], [None, 3.0, 3.0, 3.0, 3.0])

    def test_pelagic_samples_keep_raw_values_while_display_stays_rounded(self):
        """선상 안전 판정은 원자료를 봐야 하므로, 표시용 반올림과 별도로 safetyRaw를 남긴다."""
        count = len(self.stamps)
        atmosphere = dict(self.atmosphere, **{
            "wind_u-surface": [0.0] * count, "wind_v-surface": [-6.01] * count,
            "past3hprecip-surface": [0.01] * count,
        })
        wave = {"ts": list(self.atmosphere["ts"]), "waves_height-surface": [0.71] * count}
        pelagic = self.samples(weather.build_week_days(dict(self.site, pelagic=True), self.rules,
                                                       atmosphere, wave, self.now))
        self.assertTrue(pelagic)
        for sample in pelagic:
            self.assertEqual((sample["windSpeed"], sample["waveM"], sample["precipitation3h"]), (6.0, 0.7, 0.0))
            self.assertEqual(sample["safetyRaw"],
                             {"windSpeed": 6.01, "waveM": 0.71, "precipitation3h": 0.01})
        stored = json.loads(weather.week_json_text({"sites": {"1": {"days": {"2026-09-07": {"samples": pelagic}}}}}))
        self.assertEqual(stored["sites"]["1"]["days"]["2026-09-07"]["samples"][0]["safetyRaw"],
                         {"windSpeed": 6.01, "waveM": 0.71, "precipitation3h": 0.01})
        inland = self.samples(weather.build_week_days(self.site, self.rules, atmosphere, wave, self.now))
        self.assertTrue(inland and all("safetyRaw" not in sample for sample in inland))

    def open_meteo_hourly(self, visibility, cloud):
        """Open-Meteo hourly 응답 한 벌. 시정은 미터, 운량은 퍼센트로 온다."""
        hours = [datetime(2026, 9, 7, 0, 0, tzinfo=weather.KST) + timedelta(hours=step) for step in range(24 * 8)]
        return {"time": [hour.strftime("%Y-%m-%dT%H:%M") for hour in hours],
                "temperature_2m": [22.0] * len(hours), "precipitation": [0.0] * len(hours),
                "cloud_cover": [cloud] * len(hours), "visibility": [visibility] * len(hours),
                "wind_speed_10m": [5.0] * len(hours), "wind_direction_10m": [45.0] * len(hours),
                "wind_gusts_10m": [8.0] * len(hours)}

    def open_meteo_sample(self, visibility=20000.0, cloud=10.0):
        series = weather.open_meteo_week_atmospheric(self.open_meteo_hourly(visibility, cloud),
                                                     self.now.date(), self.now.date())
        return weather.extract_atmospheric_sample(series, 0)

    def test_open_meteo_visibility_is_converted_from_meters_exactly_once(self):
        """Open-Meteo 시정은 미터다. 50m가 50km 같은 좋은 시정으로 해석되면 안 된다."""
        for meters, km in [(0, 0.0), (50, 0.05), (100, 0.1), (500, 0.5), (1000, 1.0),
                           (5000, 5.0), (10000, 10.0), (20000, 20.0)]:
            self.assertAlmostEqual(self.open_meteo_sample(visibility=meters)["visibilityKm"], km, places=9,
                                   msg=f"{meters}m")
        self.assertIsNone(self.open_meteo_sample(visibility=None)["visibilityKm"])
        self.assertIsNone(self.open_meteo_sample(visibility=float("nan"))["visibilityKm"])
        self.assertIsNone(self.open_meteo_sample(visibility=float("inf"))["visibilityKm"])

    def test_open_meteo_cloud_cover_stays_percent(self):
        """Open-Meteo cloud_cover는 0~100 %다. 1이 100%로 부풀면 안 된다."""
        for percent in [0, 0.5, 1, 10, 50, 99, 100]:
            self.assertAlmostEqual(self.open_meteo_sample(cloud=percent)["cloudPct"], float(percent), places=9,
                                   msg=f"{percent}%")
        self.assertIsNone(self.open_meteo_sample(cloud=None)["cloudPct"])

    def test_windy_visibility_and_cloud_normalization_are_unchanged(self):
        """Windy 계열 값의 기존 해석은 그대로 둔다(이번 수정 범위는 Open-Meteo뿐)."""
        def windy(visibility=None, clouds=(10.0, None, None)):
            series = dict(self.atmosphere, **{"visibility-surface": [visibility] * len(self.stamps),
                                              "lclouds-surface": [clouds[0]] * len(self.stamps),
                                              "mclouds-surface": [clouds[1]] * len(self.stamps),
                                              "hclouds-surface": [clouds[2]] * len(self.stamps)})
            return weather.extract_atmospheric_sample(series, 0)
        self.assertEqual(windy(visibility=20000.0)["visibilityKm"], 20.0)
        self.assertEqual(windy(visibility=500.0)["visibilityKm"], 0.5)
        self.assertEqual(windy(visibility=50.0)["visibilityKm"], 50.0)
        self.assertEqual(windy(clouds=(1.0, None, None))["cloudPct"], 100.0)
        self.assertEqual(windy(clouds=(0.8, None, None))["cloudPct"], 80.0)
        self.assertEqual(windy(clouds=(10.0, 40.0, None))["cloudPct"], 40.0)

    def test_open_meteo_fallback_feeds_normalized_values_into_today_week_and_score(self):
        """상류 응답 → 실제 생성기 → today/weekly sample → 점수까지 단위가 한 번만 변환된다."""
        def payload(visibility, cloud):
            hourly = self.open_meteo_hourly(visibility, cloud)
            return {"current": {"time": "2026-09-07T10:00", "temperature_2m": 22.0, "precipitation": 0.0,
                                "cloud_cover": cloud, "visibility": visibility, "wind_speed_10m": 5.0,
                                "wind_direction_10m": 45.0, "wind_gusts_10m": 8.0},
                    "hourly": hourly}

        def run(visibility, cloud):
            with patch.object(weather, "request_forecast", side_effect=RuntimeError("offline")), \
                    patch.object(weather, "request_open_meteo", return_value=payload(visibility, cloud)):
                return weather.process_site("k", self.site, self.rules, self.now, "gfs", ["wind"])

        result, week = run(100.0, 1.0)
        samples = self.samples(week["days"])
        self.assertEqual(result["visibility"], "0.1km")
        self.assertEqual(result["cloud"], "1%")
        self.assertTrue(all(s["visibilityKm"] == 0.1 and s["cloudPct"] == 1 for s in samples))
        stored = json.loads(weather.week_json_text({"sites": {"1": {"days": {"2026-09-07": {"samples": samples[:1]}}}}}))
        self.assertEqual(stored["sites"]["1"]["days"]["2026-09-07"]["samples"][0]["visibilityKm"], 0.1)
        clear, clear_week = run(20000.0, 1.0)
        self.assertEqual(clear["visibility"], "20.0km")
        # 시정만 다른 두 입력에서 기존 score_weather 규칙이 그대로 낮은 시정을 감점한다.
        self.assertLess(result["score"], clear["score"])
        def scored(days):
            return {s["forecastTime"]: s for s in self.samples(days) if s["score"] is not None}
        low, high = scored(week["days"]), scored(clear_week["days"])
        stamp = "2026-09-08 09:00 KST"
        self.assertLess(low[stamp]["score"], high[stamp]["score"])

    def test_windy_atmosphere_with_open_meteo_visibility_converts_only_visibility(self):
        """혼합 source: 시정만 Open-Meteo(미터), 나머지는 Windy 해석 그대로."""
        windy = dict(self.atmosphere, **{"visibility-surface": [None] * len(self.stamps),
                                         "lclouds-surface": [1.0] * len(self.stamps)})
        hourly = self.open_meteo_hourly(100.0, 1.0)
        with patch.object(weather, "request_forecast", return_value=windy), \
                patch.object(weather, "request_open_meteo", return_value={"current": {
                    "time": "2026-09-07T10:00", "temperature_2m": 22.0, "precipitation": 0.0, "cloud_cover": 1.0,
                    "visibility": 100.0, "wind_speed_10m": 5.0, "wind_direction_10m": 45.0, "wind_gusts_10m": 8.0},
                    "hourly": hourly}):
            result, week = weather.process_site("k", self.site, self.rules, self.now, "gfs", ["wind"])
        self.assertEqual(result["fieldSources"], {"atmosphere": "windy", "visibility": "open_meteo", "wave": None})
        self.assertEqual(result["visibility"], "0.1km")
        self.assertEqual(result["cloud"], "100%")  # Windy 운량 해석은 그대로
        self.assertTrue(all(s["visibilityKm"] == 0.1 for s in self.samples(week["days"])))

    def test_validator_rejects_safety_raw_that_disagrees_with_the_stored_value(self):
        import validate_weather_week as validator

        document = {
            "startDate": "2026-09-07", "endDate": "2026-09-13", "forecastDayCount": 7,
            "siteCount": 1, "siteWithSamplesCount": 1, "unavailableSiteCount": 0,
            "sampleCount": 1, "scoreEligibleSampleCount": 1, "status": "ok",
            "sites": {"1": {"name": "어청도", "ruleKey": "island_migrant", "days": {"2026-09-07": {"samples": [
                {"forecastTime": "2026-09-07 06:00 KST", "windSpeed": 6.0, "windDirectionDeg": 0,
                 "precipitation3h": 0.0, "waveM": 0.7, "score": 92, "grade": "★★★★★",
                 "scoreEligible": True, "missingScoreFields": [],
                 "safetyRaw": {"windSpeed": 6.4, "waveM": 0.7, "precipitation3h": 0.0}}]}}}},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "weather_week.json"
            path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            with patch.object(validator, "load_runtime_sites", return_value=[dict(self.site)]):
                with self.assertRaisesRegex(AssertionError, "safetyRaw windSpeed"):
                    validator.validate(path)
                document["sites"]["1"]["days"]["2026-09-07"]["samples"][0]["safetyRaw"]["windSpeed"] = 6.04
                path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(validator.validate(path)["sampleCount"], 1)

    def test_validator_rejects_a_sample_stored_under_the_wrong_day(self):
        import validate_weather_week as validator

        document = {
            "startDate": "2026-09-07", "endDate": "2026-09-13", "forecastDayCount": 7,
            "siteCount": 1, "siteWithSamplesCount": 1, "unavailableSiteCount": 0,
            "sampleCount": 1, "scoreEligibleSampleCount": 1, "status": "ok",
            "sites": {"1": {"name": "어청도", "ruleKey": "island_migrant", "days": {"2026-09-08": {"samples": [
                {"forecastTime": "2026-09-09 06:00 KST", "windSpeed": 5.0, "windDirectionDeg": 45,
                 "precipitation3h": 0.0, "waveM": None, "score": 92, "grade": "★★★★★",
                 "scoreEligible": True, "missingScoreFields": []}]}}}},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "weather_week.json"
            path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            with patch.object(validator, "load_runtime_sites", return_value=[dict(self.site)]):
                with self.assertRaisesRegex(AssertionError, "day key"):
                    validator.validate(path)
                document["sites"]["1"]["days"]["2026-09-08"]["samples"][0]["forecastTime"] = "2026-09-08 06:00 KST"
                path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(validator.validate(path)["sampleCount"], 1)

    def test_weekly_file_keeps_one_sample_per_line_and_stays_valid_json(self):
        text = weather.week_json_text({"sites": {"1": {"days": {"2026-09-07": {
            "samples": [{"forecastTime": "2026-09-07 06:00 KST", "score": 92},
                        {"forecastTime": "2026-09-07 09:00 KST", "score": 90}]}}}}})
        self.assertEqual(json.loads(text)["sites"]["1"]["days"]["2026-09-07"]["samples"][1]["score"], 90)
        self.assertIn('{"forecastTime":"2026-09-07 06:00 KST","score":92},\n', text)


class TodayWaveFreshnessTests(unittest.TestCase):
    """M05: today 파고도 weekly와 똑같은 '같은 날짜 + 시계열 간격의 절반 이내' 정책으로만 채택한다.

    정책 자체는 weekly의 wave_value_at()이 원본이며 여기서 새 허용시간을 만들지 않는다.
    """

    def setUp(self):
        self.rules = weather.load_rules()
        self.site = {"id": 188, "name": "이천항", "lat": 35.263447, "lon": 129.239856}
        self.target = datetime(2026, 9, 6, 18, 0, tzinfo=weather.KST)

    def atmosphere_at(self, moment):
        """평가시각 한 점짜리 대기 시계열. 파고 시각만 변수로 남긴다."""
        return {"ts": [moment.timestamp() * 1000], "wind_u-surface": [0], "wind_v-surface": [0],
                "past3hprecip-surface": [0], "temp-surface": [25]}

    def wave_series(self, entries):
        """Windy gfsWave 모양의 (시각, 파고) 시계열."""
        return {"ts": [moment.timestamp() * 1000 for moment, _ in entries],
                "waves_height-surface": [height for _, height in entries]}

    def both(self, wave, target=None, site_fields=None):
        """같은 fixture를 today와 weekly에 각각 통과시켜 (today, weekly sample)을 돌려준다."""
        target = target or self.target
        site = dict(self.site, **({"showWave": True} if site_fields is None else site_fields))
        atmosphere = self.atmosphere_at(target)
        today = weather.build_site_result(site, self.rules, atmosphere, wave, None, target)
        days = weather.build_week_days(site, self.rules, atmosphere, wave, target)
        samples = [sample for day in days.values() for sample in day["samples"]]
        self.assertEqual(len(samples), 1)
        return today, samples[0]

    def assertWave(self, wave, expected, target=None, site_fields=None):
        """today가 기대한 파고를 쓰는지, 그리고 weekly와 판정이 일치하는지 함께 본다."""
        today, sample = self.both(wave, target=target, site_fields=site_fields)
        self.assertEqual(today["wave"], None if expected is None else "%.1fm" % expected)
        self.assertEqual(sample["waveM"], expected)
        self.assertEqual(today["missingScoreFields"], sample["missingScoreFields"])
        self.assertEqual(today["scoreEligible"], sample["scoreEligible"])
        self.assertFalse(today["stale"])
        return today, sample

    def test_exact_timestamp_wave_is_used(self):
        self.assertWave(self.wave_series([(self.target, 0.5)]), 0.5)

    def test_wave_inside_weekly_tolerance_is_used(self):
        """3시간 간격 시계열에서 1시간 떨어진 파고는 기존처럼 그대로 쓴다."""
        base = datetime(2026, 9, 6, 15, 0, tzinfo=weather.KST)
        series = self.wave_series([(base + timedelta(hours=3 * step), 0.5) for step in range(3)])
        self.assertWave(series, 0.5, target=datetime(2026, 9, 6, 19, 0, tzinfo=weather.KST))

    def test_weekly_tolerance_boundary_is_used_and_beyond_is_rejected(self):
        """간격의 절반(1.5시간)까지는 채택, 1분이라도 넘으면 거부한다."""
        series = self.wave_series([(datetime(2026, 9, 6, 6, 0, tzinfo=weather.KST), 0.5),
                                   (datetime(2026, 9, 6, 9, 0, tzinfo=weather.KST), 0.5)])
        self.assertWave(series, 0.5, target=datetime(2026, 9, 6, 10, 30, tzinfo=weather.KST))
        self.assertWave(series, None, target=datetime(2026, 9, 6, 10, 31, tzinfo=weather.KST))

    def test_same_date_twelve_hour_gap_is_rejected(self):
        """M05 CASE A: 같은 날짜라는 이유만으로 12시간 전 파고를 18:00 평가에 쓰지 않는다."""
        today, sample = self.assertWave(
            self.wave_series([(datetime(2026, 9, 6, 6, 0, tzinfo=weather.KST), 0.5)]), None)
        self.assertEqual(today["missingScoreFields"], ["wave"])
        self.assertIsNone(today["score"])
        self.assertFalse(today["scoreEligible"])
        self.assertIsNone(sample["score"])

    def test_date_boundary_follows_weekly_policy(self):
        """허용시간 안이어도 KST 날짜가 다르면 weekly와 똑같이 거부한다."""
        series = self.wave_series([(datetime(2026, 9, 6, 20, 30, tzinfo=weather.KST), 0.5),
                                   (datetime(2026, 9, 6, 23, 30, tzinfo=weather.KST), 0.5)])
        self.assertWave(series, None, target=datetime(2026, 9, 7, 0, 30, tzinfo=weather.KST))

    def test_multiple_samples_use_the_nearest_one(self):
        series = self.wave_series([(datetime(2026, 9, 6, 12, 0, tzinfo=weather.KST), 0.3),
                                   (datetime(2026, 9, 6, 15, 0, tzinfo=weather.KST), 0.6),
                                   (datetime(2026, 9, 6, 18, 0, tzinfo=weather.KST), 0.9)])
        self.assertWave(series, 0.9, target=datetime(2026, 9, 6, 17, 40, tzinfo=weather.KST))

    def test_nearest_sample_invalid_means_wave_missing(self):
        """가장 가까운 sample이 무효면 더 먼 유효 sample을 빌려오지 않는다."""
        for broken in (None, -1.0):
            with self.subTest(nearest=broken):
                series = self.wave_series([(datetime(2026, 9, 6, 15, 0, tzinfo=weather.KST), 0.6),
                                           (self.target, broken)])
                self.assertWave(series, None)

    def test_wave_required_sites_cannot_score_with_stale_wave(self):
        stale = self.wave_series([(datetime(2026, 9, 6, 6, 0, tzinfo=weather.KST), 0.5)])
        for field in ("showWave", "island", "pelagic"):
            with self.subTest(required=field):
                today, sample = self.both(stale, site_fields={field: True})
                self.assertFalse(today["scoreEligible"])
                self.assertEqual(today["missingScoreFields"], ["wave"])
                self.assertIsNone(today["wave"])
                self.assertFalse(sample["scoreEligible"])

    def test_non_wave_site_keeps_scoring(self):
        """파고가 필수가 아닌 곳은 예전처럼 점수가 나오고 결측 목록도 비어 있다."""
        stale = self.wave_series([(datetime(2026, 9, 6, 6, 0, tzinfo=weather.KST), 0.5)])
        fresh = self.wave_series([(self.target, 0.5)])
        none_wave, _ = self.both(None, site_fields={})
        for wave in (stale, fresh):
            today, sample = self.both(wave, site_fields={})
            self.assertTrue(today["scoreEligible"])
            self.assertEqual(today["missingScoreFields"], [])
            self.assertEqual(today["score"], none_wave["score"])
            self.assertTrue(sample["scoreEligible"])

    def test_open_meteo_marine_follows_the_same_policy(self):
        """Open-Meteo marine fallback도 today에서 같은 날짜+간격 검증을 받는다.

        today는 기존대로 current 값을 쓰고 weekly는 hourly를 펼쳐 쓰므로, 여기서는
        두 경로가 같은 시각을 가리키는 실제 응답 모양으로 정책만 비교한다.
        """
        for hour, expected in (("06:00", None), ("18:00", 0.5)):
            with self.subTest(current=hour):
                payload = {"current": {"time": "2026-09-06T" + hour, "wave_height": 0.5},
                           "hourly": {"time": ["2026-09-06T" + hour], "wave_height": [0.5]}}
                with patch.object(weather, "request_open_meteo", return_value=payload):
                    wave = weather.open_meteo_wave(35.26, 129.24, self.target)
                self.assertWave(wave, expected)

    def test_today_and_weekly_never_disagree_on_windy_series(self):
        """같은 Windy 시계열이라면 어떤 시각 차이에서도 두 경로의 파고 판정이 갈리지 않는다."""
        series = self.wave_series([(datetime(2026, 9, 6, 6, 0, tzinfo=weather.KST), 0.5),
                                   (datetime(2026, 9, 6, 9, 0, tzinfo=weather.KST), 0.5)])
        for minutes in range(0, 16 * 60, 17):
            moment = datetime(2026, 9, 6, 6, 0, tzinfo=weather.KST) + timedelta(minutes=minutes)
            with self.subTest(evaluation=moment.strftime("%H:%M")):
                today, sample = self.both(series, target=moment)
                self.assertEqual(today["wave"],
                                 None if sample["waveM"] is None else "%.1fm" % sample["waveM"])
                self.assertEqual(today["missingScoreFields"], sample["missingScoreFields"])


if __name__ == "__main__":
    unittest.main()
