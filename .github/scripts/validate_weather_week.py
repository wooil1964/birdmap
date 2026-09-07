"""Validate the rolling seven-day, three-hour weather dataset."""
import json
from datetime import date, datetime
from pathlib import Path
from site_data import load_runtime_sites
from update_weather import KST, WEEK_FORECAST_DAYS

SCORE_FIELDS = ("windSpeed", "windDirectionDeg", "precipitation3h")


def reject_constant(name):
    raise AssertionError(f"Weekly weather contains {name}")


def parse_date(text, label):
    try:
        return date.fromisoformat(text)
    except (TypeError, ValueError):
        raise AssertionError(f"{label} is not an ISO date: {text!r}") from None


def parse_forecast_time(text, label):
    assert isinstance(text, str) and text.endswith(" KST"), f"{label} must be a KST stamp: {text!r}"
    try:
        return datetime.strptime(text[: -len(" KST")], "%Y-%m-%d %H:%M").replace(tzinfo=KST)
    except ValueError:
        raise AssertionError(f"{label} is not a KST stamp: {text!r}") from None


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f"Duplicate key in weekly weather: {key}"
        result[key] = value
    return result


def validate(path=Path(__file__).resolve().parents[2] / "weather_week.json"):
    data = json.loads(
        path.read_text(encoding="utf-8"),
        parse_constant=reject_constant,
        object_pairs_hook=unique_keys,
    )
    runtime = {str(site["id"]): site for site in load_runtime_sites()}
    sites = data["sites"]
    assert set(sites) == set(runtime), "Weekly weather IDs mismatch"
    assert data["siteCount"] == len(sites) == len(runtime), "Weekly siteCount mismatch"

    start = parse_date(data["startDate"], "startDate")
    end = parse_date(data["endDate"], "endDate")
    assert start <= end, "Weekly startDate is after endDate"
    assert (end - start).days + 1 <= WEEK_FORECAST_DAYS, "Weekly range exceeds the forecast window"
    assert data["forecastDayCount"] == WEEK_FORECAST_DAYS, "forecastDayCount mismatch"
    limit = datetime.combine(end, datetime.max.time()).replace(tzinfo=KST)

    sample_count = 0
    eligible_count = 0
    for site_id, site in sites.items():
        wave_required = bool(
            runtime[site_id].get("showWave") or runtime[site_id].get("island") or runtime[site_id].get("pelagic")
        )
        for day_key, day in site["days"].items():
            day_date = parse_date(day_key, f"{site_id} day key")
            assert start <= day_date <= end, f"{site_id} day {day_key} is outside the weekly range"
            previous = None
            for sample in day["samples"]:
                sample_count += 1
                label = f"{site_id} {day_key} {sample.get('forecastTime')}"
                moment = parse_forecast_time(sample["forecastTime"], label)
                assert moment.date() == day_date, f"{label} does not belong to its day key"
                assert moment <= limit, f"{label} is beyond the weekly range"
                assert previous is None or previous < moment, f"{label} is out of order or duplicated"
                previous = moment
                score = sample["score"]
                assert score is None or 0 <= score <= 100, f"{label} score out of range"
                if sample["scoreEligible"]:
                    eligible_count += 1
                    assert not sample["missingScoreFields"], f"{label} is eligible with missing fields"
                    assert score is not None and sample["grade"], f"{label} is eligible without a score"
                    for field in SCORE_FIELDS:
                        assert sample[field] is not None, f"{label} is eligible without {field}"
                    assert not wave_required or sample["waveM"] is not None, f"{label} is eligible without wave"
                else:
                    assert score is None, f"{label} carries a score while ineligible"
                    assert sample["missingScoreFields"], f"{label} is ineligible without a reason"
                if wave_required and sample["waveM"] is None:
                    assert "wave" in sample["missingScoreFields"], f"{label} ignores its missing wave"
        if site.get("dataUnavailable"):
            assert not site["days"], f"{site_id} keeps samples while marked unavailable"

    assert data["sampleCount"] == sample_count, "Weekly sampleCount mismatch"
    assert data["scoreEligibleSampleCount"] == eligible_count, "Weekly scoreEligibleSampleCount mismatch"
    assert data["unavailableSiteCount"] == sum(bool(s.get("dataUnavailable")) for s in sites.values())
    assert data["siteWithSamplesCount"] == sum(bool(s["days"]) for s in sites.values())
    print(json.dumps({k: v for k, v in data.items() if k != "sites"}, ensure_ascii=True))
    if data["status"] != "ok":
        print("::warning::Weekly weather contains unavailable sites; inspect counts above")
    return data


if __name__ == "__main__":
    validate()
