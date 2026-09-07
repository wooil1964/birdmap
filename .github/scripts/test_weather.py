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


if __name__ == "__main__":
    unittest.main()
