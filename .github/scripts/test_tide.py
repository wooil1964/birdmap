"""Regression tests for tide identity, date, cache and outage handling."""
import copy
import io
import json
import tempfile
import unittest
import urllib.error
from argparse import Namespace
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import update_tide as daily
import update_tide_month as monthly
import build_tide_station_mapping as mapping
import audit_tide_health as health


NOW = datetime(2026, 9, 6, 10, 0, tzinfo=daily.KST)
SITE = {"id": "19", "name": "유부도", "stationName": "군산외항", "stationCode": "DT_0018", "ruleKey": "mudflat_high_tide", "mappingMethod": "reviewed_site_mapping"}


def payload(date="2026-09-06", name="군산", level=0):
    return {"response": {"header": {"resultCode": "00"}, "body": {"items": {"item": [
        {"obsvtrNm": name, "predcDt": date + " 04:10:00", "predcTdlvVl": level, "extrSe": 2},
        {"obsvtrNm": name, "predcDt": date + " 10:20:00", "predcTdlvVl": 712, "extrSe": 1},
    ]}}}}


def result(date="2026-09-06"):
    return daily.build_site_result(SITE, payload(date), NOW, date)


class TideTests(unittest.TestCase):
    def test_diagnostics_never_include_secret_or_arbitrary_transport_url(self):
        key = "synthetic/secret+value="
        with patch.dict(daily.os.environ, {"KHOA_API_KEY": key}):
            self.assertEqual(daily.safe_error(RuntimeError("https://example.test/?serviceKey=" + key)), "RuntimeError")
            self.assertNotIn(key, daily.safe_error(daily.PredictionError(key)))
            self.assertNotIn("synthetic", daily.safe_error(daily.PredictionError("serviceKey=synthetic%2Fsecret%2Bvalue%3D&obsCode=DT_0018")))

    def test_health_distinguishes_live_fallback_and_unavailable(self):
        self.assertEqual(health.api_health_status(True, 99, 0, 0), "ok")
        self.assertEqual(health.api_health_status(True, 0, 99, 0), "api_failed_fallback_available")
        self.assertEqual(health.api_health_status(True, 0, 0, 99), "api_failed_no_data")
        self.assertEqual(health.api_health_status(True, 98, 1, 0), "partial_api_success")
        self.assertEqual(health.api_health_status(False, 99, 0, 0), "stale_daily_data")

    def test_tomorrow_failure_warns_even_when_today_is_live(self):
        day = result()
        day["tomorrow"] = daily.no_data(SITE, "2026-09-07", "timeout")
        data = {"date": "2026-09-06", "tomorrowDate": "2026-09-07", "sites": {"19": day}}
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "health.json"
            with patch.object(health, "read_json", side_effect=lambda p: data if p == health.TIDE_TODAY_PATH else {}), \
                 patch.object(health, "load_tide_sites", return_value=[SITE]), \
                 patch.object(health, "resolve_tide_sites", return_value=([SITE], 0)), \
                 patch.object(health, "datetime") as clock, patch.object(health, "OUTPUT_PATH", output), redirect_stdout(io.StringIO()):
                clock.now.return_value = NOW
                health.main()
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "partial_api_success")
            self.assertEqual(report["liveSuccessCount"], 1)
            self.assertEqual(report["tomorrowLiveSuccessCount"], 0)
            self.assertEqual(report["tomorrowUnavailableSiteCount"], 1)

    def test_official_field_zero_and_negative_levels(self):
        for level in (0, -8.5):
            self.assertEqual(daily.build_site_result(SITE, payload(level=level), NOW)["lowTideLevel"], str(level))

    def test_reject_wrong_date_station_and_invalid_values(self):
        for data in (payload("2026-09-05"), payload(name="부산"), payload(level="NaN"), payload(level="")):
            with self.assertRaises(daily.PredictionError):
                daily.build_site_result(SITE, data, NOW)

    def test_do_not_shift_levels_when_one_is_missing(self):
        data = payload()
        del data["response"]["body"]["items"]["item"][0]["predcTdlvVl"]
        with self.assertRaises(daily.PredictionError):
            daily.build_site_result(SITE, data, NOW)

    def test_previous_tomorrow_precedes_month_and_keeps_generation(self):
        old = {"tomorrowDate": "2026-09-06", "sites": {"19": {**SITE, "tomorrow": result()}}}
        old["sites"]["19"]["tomorrow"]["generatedAt"] = "2026-09-05 06:00 KST"
        month = {"generatedAt": "2026-09-06 03:00 KST", "sites": {"19": {**SITE, "days": [result()]}}}
        reused = daily.fallback_for_date([SITE], "2026-09-06", old, month)["19"]
        self.assertEqual(reused["fallbackSource"], "previous_tomorrow")
        self.assertEqual(reused["generatedAt"], "2026-09-05 06:00 KST")
        self.assertTrue(reused["stale"])
        self.assertTrue(reused["staleDaily"])

    def test_month_fallback_shared_only_by_identical_code_date(self):
        month = {"generatedAt": "2026-09-05 03:00 KST", "sites": {"other": {**SITE, "days": [result()]}}}
        other = dict(SITE, id="20", name="새만금")
        wrong = dict(SITE, id="21", stationCode="DT_0024")
        values = daily.fallback_for_date([SITE, other, wrong], "2026-09-06", {}, month)
        self.assertEqual(set(values), {"19", "20"})
        self.assertEqual(values["20"]["name"], "새만금")
        self.assertFalse(daily.fallback_for_date([SITE], "2026-09-07", {}, month))

    def test_legacy_month_provenance_and_unknown_stale_generation(self):
        day = result()
        for key in ("stationCode", "stationName", "generatedAt", "updated"):
            day.pop(key, None)
        month = {"generatedAt": "2026-09-04 03:00 KST", "sites": {"19": {**SITE, "days": [day]}}}
        value = daily.fallback_for_date([SITE], "2026-09-06", {}, month)["19"]
        self.assertEqual(value["generatedAt"], month["generatedAt"])
        day["stale"] = True
        value = daily.fallback_for_date([SITE], "2026-09-06", {}, month)["19"]
        self.assertEqual(value["generatedAt"], "")
        self.assertTrue(value["generationTimeUnknown"])

    def test_mapping_change_rejects_old_forecast(self):
        old = {"date": "2026-09-06", "sites": {"19": result()}}
        self.assertFalse(daily.fallback_for_date([dict(SITE, stationCode="SO_0564")], "2026-09-06", old, {}))

    def test_empty_placeholder_cannot_mask_month_fallback(self):
        old = {"date": "2026-09-06", "sites": {"19": daily.no_data(SITE, "2026-09-06", "timeout")}}
        month = {"sites": {"19": {**SITE, "days": [result()]}}}
        self.assertEqual(daily.fallback_for_date([SITE], "2026-09-06", old, month)["19"]["fallbackSource"], "tide_month")

    def test_full_run_exact_station_date_dedup_and_dates(self):
        calls = []
        def request(key, code, date, diagnostic=False, stats=None):
            calls.append((code, date))
            stats.record(code, date)
            p = payload(datetime.strptime(date, "%Y%m%d").date().isoformat())
            for row in p["response"]["body"]["items"]["item"]:
                row.pop("obsvtrNm")
            return p
        with patch.object(daily, "request_prediction", side_effect=request), redirect_stdout(io.StringIO()):
            data = daily.build_daily_output("test", NOW)
        self.assertEqual(len(calls), len(set(calls)))
        self.assertEqual(len(calls), 2 * data["uniqueStationCount"])
        self.assertEqual(data["liveSuccessCount"], data["linkedSiteCount"])
        self.assertEqual(data["apiRequestCount"], len(calls))
        self.assertEqual(data["siteCount"], data["targetSiteCount"])
        for day in data["sites"].values():
            self.assertEqual(day["date"], "2026-09-06")
            self.assertEqual(day["tomorrow"]["date"], "2026-09-07")
            if not day["tomorrow"].get("dataUnavailable"):
                self.assertEqual(day["tomorrow"]["generatedAt"], "2026-09-06 10:00 KST")

    def test_all_api_failures_keep_every_site_and_true_counters(self):
        month = {"sites": {"19": {**SITE, "days": [result(), result("2026-09-07")]}}}
        for day in month["sites"]["19"]["days"]:
            day["generatedAt"] = "2026-09-05 06:00 KST"
        def saved(path):
            return month if path == daily.TIDE_MONTH_PATH else {}
        with patch.object(daily, "read_optional_json", side_effect=saved), \
             patch.object(daily, "request_prediction", side_effect=daily.PredictionError("timeout")), redirect_stdout(io.StringIO()):
            data = daily.build_daily_output("test", NOW)
        self.assertEqual(data["liveSuccessCount"], 0)
        self.assertEqual(data["failedCount"], data["targetSiteCount"])
        self.assertEqual(data["siteCount"], data["targetSiteCount"])
        self.assertGreater(data["monthFallbackCount"], 0)
        self.assertEqual(data["fallbackCount"], sum(daily.has_tide_data(d) for d in data["sites"].values()))
        self.assertTrue(all(d["stale"] for d in data["sites"].values()))
        self.assertEqual(data["sites"]["19"]["generatedAt"], "2026-09-05 06:00 KST")
        self.assertEqual(data["sites"]["19"]["refreshedAt"], "2026-09-06 10:00 KST")
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "health.json"
            with patch.object(health, "read_json", side_effect=lambda p: data if p == health.TIDE_TODAY_PATH else month), \
                 patch.object(health, "datetime") as clock, patch.object(health, "OUTPUT_PATH", output), redirect_stdout(io.StringIO()):
                clock.now.return_value = NOW
                health.main()
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "api_failed_fallback_available")
            self.assertTrue(report["apiLiveWarning"])
            self.assertEqual(report["liveSuccessCount"], 0)
            self.assertEqual(report["reusedCount"], data["reusedCount"])
            self.assertEqual(report["siteCount"], 99)

    def test_timeout_retry_counts_actual_attempts(self):
        stats = daily.RequestStats()
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload()).encode()
        with patch.object(daily.urllib.request, "urlopen", side_effect=[TimeoutError(), response]), patch.object(daily.time, "sleep"):
            daily.request_prediction("not-a-real-key", "DT_0018", "20260906", stats=stats)
        self.assertEqual(stats.snapshot()["apiRequestCount"], 2)
        self.assertEqual(stats.snapshot()["timeoutCount"], 1)
        self.assertEqual(stats.snapshot()["retryCount"], 1)

    def test_gateway_timeout_retries_and_permanent_auth_does_not(self):
        for code, attempts in (("05", 2), ("30", 1)):
            stats = daily.RequestStats()
            response = unittest.mock.MagicMock()
            response.__enter__.return_value.read.return_value = json.dumps({"response": {"header": {"resultCode": code}}}).encode()
            with patch.object(daily.urllib.request, "urlopen", return_value=response), patch.object(daily.time, "sleep"):
                with self.assertRaises(daily.PredictionError):
                    daily.request_prediction("test", "DT_0018", "20260906", stats=stats)
            self.assertEqual(stats.snapshot()["apiRequestCount"], attempts)
            self.assertEqual(stats.snapshot()["timeoutCount"], attempts if code == "05" else 0)

    def test_budget_exhaustion_makes_no_network_calls(self):
        stats = daily.RequestStats(-1)
        with patch.object(daily.urllib.request, "urlopen") as call:
            with self.assertRaises(daily.PredictionError):
                daily.request_prediction("test", "DT_0018", "20260906", stats=stats)
        call.assert_not_called()
        self.assertEqual(stats.snapshot()["apiRequestCount"], 0)

    def test_month_cache_expires_and_rejects_different_station(self):
        day = result()
        self.assertTrue(monthly.reusable_month_day(day, "DT_0018", NOW))
        self.assertFalse(monthly.reusable_month_day(day, "DT_0024", NOW))
        self.assertFalse(monthly.reusable_month_day(day, "DT_0018", NOW + timedelta(days=7)))
        self.assertFalse(monthly.reusable_month_day(dict(day, stale=True), "DT_0018", NOW))
        self.assertTrue(monthly.reusable_month_day(dict(day, stale=True, fallbackSource="monthly_cache"), "DT_0018", NOW))

    def test_official_mapping_and_protected_sites(self):
        data = json.loads(daily.MAPPING_PATH.read_text(encoding="utf-8"))
        mapping.validate_mapping(data, daily.load_tide_sites(), mapping.load_catalog())
        self.assertEqual(data["sites"]["107"]["tideStationCode"], "SO_1268")
        self.assertEqual(data["sites"]["19"]["tideStationCode"], "DT_0018")
        altered = copy.deepcopy(data)
        altered["sites"]["19"]["tideStationCode"] = "DT_9999"
        with self.assertRaises(RuntimeError):
            mapping.validate_mapping(altered, daily.load_tide_sites(), mapping.load_catalog())

    def test_monthly_main_deduplicates_shared_station_and_reuses_cache(self):
        second = dict(SITE, id="20", name="새만금")
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "month.json"
            args = Namespace(days=2, list_targets=False, target_site_ids="19,20", output=str(output))
            def request(key, code, date, diagnostic=False, stats=None):
                stats.record(code, date)
                return payload(datetime.strptime(date, "%Y%m%d").date().isoformat())
            with patch.object(monthly, "parse_args", return_value=args), patch.object(monthly, "resolve_targets", return_value=[SITE, second]), \
                 patch.dict(monthly.os.environ, {"KHOA_API_KEY": "test"}), patch.object(monthly, "datetime") as clock, \
                 patch.object(monthly, "request_prediction", side_effect=request) as call, redirect_stdout(io.StringIO()):
                clock.now.return_value = NOW
                clock.strptime.side_effect = datetime.strptime
                monthly.main()
                self.assertEqual(call.call_count, 2)
                first = json.loads(output.read_text(encoding="utf-8"))
                self.assertEqual(first["apiRequestCount"], 2)
                call.reset_mock()
                monthly.main()
                call.assert_not_called()
                cached = json.loads(output.read_text(encoding="utf-8"))
                self.assertEqual(cached["cachedDataCount"], 4)
                self.assertEqual(cached["apiRequestCount"], 0)
                self.assertEqual(cached["sites"]["19"]["days"][0]["generatedAt"], first["sites"]["19"]["days"][0]["generatedAt"])
                for site in cached["sites"].values():
                    for day in site["days"]:
                        day["generatedAt"] = "2026-08-25 06:00 KST"
                output.write_text(json.dumps(cached), encoding="utf-8")
                call.side_effect = daily.PredictionError("timeout")
                monthly.main()
                reused = json.loads(output.read_text(encoding="utf-8"))
                self.assertEqual(reused["reusedDataCount"], 4)
                self.assertEqual(reused["sites"]["19"]["days"][0]["generatedAt"], "2026-08-25 06:00 KST")
                self.assertEqual(reused["sites"]["19"]["days"][0]["fallbackSource"], "previous_month")
                # Expired cache plus API failure retains original dates/values.
                clock.now.return_value = NOW + timedelta(days=7)
                call.side_effect = daily.PredictionError("timeout")
                monthly.main()
                unavailable = json.loads(output.read_text(encoding="utf-8"))
                self.assertEqual(len(unavailable["sites"]["19"]["days"]), 2)
                self.assertTrue(unavailable["sites"]["19"]["days"][0]["dataUnavailable"])

    def test_official_sample_values_match_saved_unchanged_station_forecasts(self):
        official = json.loads(Path(__file__).with_name("tide_official_samples.json").read_text(encoding="utf-8"))["stations"]
        stored = json.loads(daily.TIDE_MONTH_PATH.read_text(encoding="utf-8"))
        checked = 0
        for site in stored["sites"].values():
            sample = official.get(site["stationCode"], {})
            by_date = {day["searchDate"]: day for day in sample.get("days", [])}
            for day in site["days"]:
                expected = by_date.get(day["date"])
                if not expected or not daily.has_tide_data(day):
                    continue
                for kind in ("low", "high"):
                    events = [expected.get("lvl" + str(i), "").split("/") for i in range(1, 5)]
                    events = [event for event in events if len(event) == 4 and event[1] == kind]
                    self.assertEqual(day[kind + "Tide"], ", ".join(e[0] for e in events) or "정보 없음")
                    if events:
                        self.assertEqual([float(x) for x in day[kind + "TideLevel"].split(",")], [float(e[3]) for e in events])
                checked += 1
        # Snapshot overlap expires as the production monthly window advances;
        # the downloaded official samples remain available for manual review.
        if not checked:
            self.skipTest("Official sample dates are outside the rolling monthly window")


if __name__ == "__main__":
    unittest.main()
