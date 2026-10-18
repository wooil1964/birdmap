"""Publication time and forecast target time are separate contracts.

Use the real validators at a fixed evaluation time, without rewriting saved JSON.
"""
import contextlib
import copy
from datetime import datetime, timedelta
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import validate_weather as today_validator
import validate_weather_week as week_validator
from update_weather import KST
from site_data import load_runtime_sites

ROOT = Path(__file__).resolve().parents[2]
EVALUATION = datetime(2026, 10, 12, 16, 26, tzinfo=KST)


class FixedClock(datetime):
    evaluation = EVALUATION

    @classmethod
    def now(cls, tz=None):
        return cls.evaluation.astimezone(tz) if tz else cls.evaluation.replace(tzinfo=None)


class ValidatorTimeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.today = json.loads((ROOT / "weather_today.json").read_text(encoding="utf-8"))
        cls.week = json.loads((ROOT / "weather_week.json").read_text(encoding="utf-8"))
        # Time-contract fixtures represent the saved batch. Registry completeness is tested separately.
        cls.fixture_runtime = [s for s in load_runtime_sites() if str(s['id']) in cls.today['sites']]

    def run_validator(self, document, weekly=False, now=EVALUATION, runtime=None):
        validator = week_validator if weekly else today_validator
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.json"
            path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            with patch.object(FixedClock, "evaluation", now), patch.object(validator, "datetime", FixedClock), \
                    patch.object(validator, "load_runtime_sites", return_value=self.fixture_runtime if runtime is None else runtime):
                with contextlib.redirect_stdout(io.StringIO()):
                    return validator.validate(path)

    def test_saved_batch_requires_regeneration_for_expanded_registry(self):
        runtime=load_runtime_sites()
        for document,weekly in [(self.document(),False),(copy.deepcopy(self.week),True)]:
            missing={str(s['id']) for s in runtime}-set(document['sites'])
            if missing:
                self.assertEqual(missing,{'206','207'})
                with self.assertRaisesRegex(AssertionError,'IDs mismatch'):
                    self.run_validator(document,weekly=weekly,runtime=runtime)

    def document(self):
        # Align synthetic input and evaluation explicitly; do not edit the source fixture.
        document = copy.deepcopy(self.today)
        document["date"] = "2026-10-12"
        document["generatedAt"] = "2026-10-12 16:26 KST"
        for item in document["sites"].values():
            item["date"] = document["date"]
            item["generatedAt"] = document["generatedAt"]
            item["forecastTime"] = "2026-10-12 18:00 KST"
        return document

    def test_today_rejects_hour_24(self):
        document = self.document()
        next(iter(document["sites"].values()))["forecastTime"] = "2026-10-12 24:00 KST"
        with self.assertRaises(AssertionError):
            self.run_validator(document)

    def test_today_rejects_minute_60(self):
        document = self.document()
        next(iter(document["sites"].values()))["forecastTime"] = "2026-10-12 16:60 KST"
        with self.assertRaises(AssertionError):
            self.run_validator(document)

    def test_today_rejects_future_publication(self):
        document = self.document()
        document["generatedAt"] = "2026-10-12 16:27 KST"
        for item in document["sites"].values():
            item["generatedAt"] = document["generatedAt"]
        with self.assertRaises(AssertionError):
            self.run_validator(document)

    def test_week_rejects_short_minute_publication(self):
        document = copy.deepcopy(self.week)
        document["generatedAt"] = "2026-10-12 16:6 KST"
        with self.assertRaises(AssertionError):
            self.run_validator(document, weekly=True)

    def test_future_forecast_is_not_future_publication(self):
        document = self.document()
        self.assertEqual(self.run_validator(document)["scoreEligibleCount"], len(self.today["sites"]))
        week = copy.deepcopy(self.week)
        week["generatedAt"] = "2026-10-12 16:26 KST"
        self.assertGreater(self.run_validator(week, weekly=True)["sampleCount"], 0)

    def test_current_date_requirement_remains(self):
        with self.assertRaisesRegex(AssertionError, "Batch date mismatch"):
            self.run_validator(self.document(), now=EVALUATION + timedelta(days=1))

    def test_calendar_and_time_boundaries(self):
        valid = ["2026-10-31 23:59 KST", "2026-11-01 00:00 KST",
                 "2026-12-31 23:59 KST", "2027-01-01 00:00 KST",
                 "2024-02-29 00:00 KST", "2026-02-28 23:59 KST"]
        for text in valid:
            with self.subTest(text=text):
                self.assertEqual(week_validator.parse_forecast_time(text, "boundary").strftime("%Y-%m-%d %H:%M KST"), text)
        invalid = ["2026-02-29 00:00 KST", "2026-04-31 12:00 KST",
                   "2026-13-01 12:00 KST", "2026-12-31 24:00 KST",
                   "2026-10-12 16:60 KST", "2026-10-12 16:6 KST"]
        for text in invalid:
            with self.subTest(text=text), self.assertRaises(AssertionError):
                week_validator.parse_forecast_time(text, "boundary")

    def test_today_midnight_month_year_leap_day(self):
        for now in [datetime(2026, 11, 1, 0, 0, tzinfo=KST), datetime(2027, 1, 1, 0, 0, tzinfo=KST),
                    datetime(2024, 2, 29, 0, 0, tzinfo=KST)]:
            document = self.document()
            document["date"] = now.date().isoformat()
            document["generatedAt"] = (now - timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M KST")
            for item in document["sites"].values():
                item.update(date=document["date"], generatedAt=document["generatedAt"],
                            forecastTime=now.strftime("%Y-%m-%d 03:00 KST"))
            with self.subTest(now=now):
                self.assertEqual(self.run_validator(document, now=now)["scoreEligibleCount"], len(self.today["sites"]))

    def test_today_rejects_invalid_calendar_and_non_string(self):
        for value in ["2026-02-29 12:00 KST", "2026-10-12 16:26 KST extra", None,
                      ["2026-10-12 16:26 KST"], {"toString": "not-callable"}, 123, True]:
            document = self.document()
            next(iter(document["sites"].values()))["forecastTime"] = value
            with self.subTest(value=value), self.assertRaises(AssertionError):
                self.run_validator(document)

    def test_week_future_publication_still_rejected(self):
        document = copy.deepcopy(self.week)
        document["generatedAt"] = "2026-10-12 16:27 KST"
        with self.assertRaisesRegex(AssertionError, "in the future"):
            self.run_validator(document, weekly=True)

    def test_reference_weather_is_preserved(self):
        document = self.document()
        for item in document["sites"].values():
            item.update(scoreEligible=False, score=None, stale=True, fallbackSource="previous_saved",
                        generatedAt=None, forecastTime=None, wind=None, rain=None, missingScoreFields=["wind"])
        document.update(scoreEligibleCount=0, staleCount=len(self.today["sites"]))
        result = self.run_validator(document)
        self.assertEqual(result["siteCount"], len(self.today["sites"]))
        self.assertEqual(result["scoreEligibleCount"], 0)
        self.assertTrue(all(item["fallbackSource"] == "previous_saved" for item in result["sites"].values()))


if __name__ == "__main__":
    unittest.main()
