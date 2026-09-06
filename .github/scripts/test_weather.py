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
            with patch.object(weather, "OUTPUT_PATH", path), patch.object(weather, "request_forecast", side_effect=RuntimeError("offline")), patch.object(weather, "process_site", side_effect=RuntimeError("offline")), contextlib.redirect_stdout(io.StringIO()):
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


if __name__ == "__main__":
    unittest.main()
