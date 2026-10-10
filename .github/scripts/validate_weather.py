"""Validate generated data, including truthful fallback accounting."""
import json
import math
import re
from datetime import datetime
from pathlib import Path
from site_data import load_runtime_sites
from update_weather import KST

# today 문서가 실제로 숫자로 저장하는 값은 score 와 파고 좌표뿐이다. 풍속·강수·파고는
# "북동풍 3.6m/s", "강수 없음", "0.5m" 처럼 포맷된 문자열이라 weekly 의 windSpeed·waveM 같은
# 수치 필드가 today 에는 존재하지 않는다.
COORDINATE_FIELDS = ("waveLat", "waveLon")
# 생성기(update_weather.py build_site_result)가 만드는 표시 문자열. 프런트 weeklyTodayRequiredDataValid 와 같은 형식이다.
WIND_PATTERN = re.compile(r"^(?:북|북동|동|남동|남|남서|서|북서)풍\s*\d+(?:\.\d+)?\s*m/s$")
RAIN_PATTERN = re.compile(r"^(?:강수 없음|3시간 강수 \d+(?:\.\d+)?mm)$")
WAVE_PATTERN = re.compile(r"^\d+(?:\.\d+)?m$")


def finite_number(value):
    """유한한 숫자만 인정한다. Python에서 bool은 int의 서브클래스라 명시적으로 제외한다."""
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def reject_constant(name):
    raise AssertionError(f"Weather contains {name}")


def validate(path=Path(__file__).resolve().parents[2] / "weather_today.json"):
    data = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
    sites = data["sites"]
    runtime = {str(s["id"]): s for s in load_runtime_sites()}
    assert set(sites) == set(runtime), "Weather IDs mismatch"
    assert data["date"] == datetime.now(KST).date().isoformat(), "Batch date mismatch"
    assert data["siteCount"] == len(sites)
    assert data["successCount"] + data["failedCount"] == len(sites)
    assert data["staleCount"] == sum(bool(s.get("stale")) for s in sites.values())
    assert data["unavailableSiteCount"] == sum(bool(s.get("dataUnavailable")) for s in sites.values())
    assert data["scoreEligibleCount"] == sum(bool(s.get("scoreEligible")) for s in sites.values())
    for site_id, day in sites.items():
        for field in COORDINATE_FIELDS:
            value = day.get(field)
            assert value is None or finite_number(value), \
                f"{site_id} {field} is not a finite number: {value!r}"
        # P1-S2: 적격 여부는 반드시 bool 이어야 한다(1·"true"·None 같은 truthy/falsy 값으로 추천 적격을 추정하지 않는다).
        assert isinstance(day.get("scoreEligible"), bool),             f"{site_id} scoreEligible is not a boolean: {day.get('scoreEligible')!r}"
        if day["scoreEligible"]:
            assert isinstance(day.get("missingScoreFields"), list),                 f"{site_id} missingScoreFields is not a list: {day.get('missingScoreFields')!r}"
            assert not day.get("stale") and not day.get("dataUnavailable")
            assert day["date"] == data["date"] == day["forecastTime"][:10]
            assert finite_number(day["score"]) and 0 <= day["score"] <= 100,                 f"{site_id} score is not a finite number in 0-100: {day['score']!r}"
            assert not day.get("missingScoreFields")
            # 프런트(storedWeatherState)와 같은 배치 일관성: 적격 항목의 발행 시각은 실제 문자열이어야 하고 배치(root) 발행 시각과 같아야 한다.
            assert isinstance(day.get("generatedAt"), str) and day["generatedAt"] and day["generatedAt"] == data.get("generatedAt"), \
                f"{site_id} eligible item generatedAt differs from the batch: {day.get('generatedAt')!r} vs {data.get('generatedAt')!r}"
            # 적격(true)인 항목은 추천·팝업 점수에 쓰이므로 실제 필수 기상 표시값도 있어야 한다(index.html 의 today 검사와 같은 형식).
            assert isinstance(day.get("wind"), str) and WIND_PATTERN.match(day["wind"]),                 f"{site_id} eligible without a valid wind: {day.get('wind')!r}"
            assert isinstance(day.get("rain"), str) and RAIN_PATTERN.match(day["rain"]),                 f"{site_id} eligible without a valid rain: {day.get('rain')!r}"
            wave = day.get("wave")
            site = runtime[site_id]
            if site.get("showWave") or site.get("island") or site.get("pelagic"):
                assert isinstance(wave, str) and WAVE_PATTERN.match(wave),                     f"{site_id} eligible without a valid required wave: {wave!r}"
            else:
                assert wave is None or (isinstance(wave, str) and WAVE_PATTERN.match(wave)),                     f"{site_id} eligible with an invalid optional wave: {wave!r}"
    print(json.dumps({k: v for k, v in data.items() if k != "sites"}, ensure_ascii=True))
    if data["status"] != "ok":
        print("::warning::Weather contains fallback, stale or incomplete data; inspect counts above")
    return data


if __name__ == "__main__":
    validate()
