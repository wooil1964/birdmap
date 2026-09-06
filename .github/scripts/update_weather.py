#!/usr/bin/env python3
"""Build weather_today.json from Windy Point Forecast API data."""

from __future__ import annotations

import json
import math
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from site_data import load_runtime_sites, load_worker_sites, compare_sites


ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = ROOT / "index.html"
RULES_PATH = ROOT / "weather_rules.json"
OUTPUT_PATH = ROOT / "weather_today.json"
API_URL = "https://api.windy.com/api/point-forecast/v2"
OPEN_METEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
REQUEST_TIMEOUT_SECONDS = 10
MAX_WORKERS = 3
MIN_REQUEST_INTERVAL_SECONDS = 1.2
MAX_REQUEST_ATTEMPTS = 2
KST = timezone(timedelta(hours=9))
REQUEST_RATE_LOCK = threading.Lock()
LAST_REQUEST_AT = 0.0
WINDY_UNAVAILABLE = threading.Event()
REQUEST_DEADLINE = float("inf")
ATMOSPHERIC_PARAMETERS = [
    "wind",
    "windGust",
    "precip",
    "temp",
    "visibility",
    "lclouds",
    "mclouds",
    "hclouds",
]
WAVE_COORDINATE_OVERRIDES = {
    "9": {"waveLat": 37.59, "waveLon": 126.45},
    "57": {"waveLat": 33.50, "waveLon": 127.02},
    "58": {"waveLat": 33.32, "waveLon": 126.10},
    "59": {"waveLat": 33.55, "waveLon": 126.78},
    "60": {"waveLat": 33.25, "waveLon": 126.60},
    "112": {"waveLat": 33.20, "waveLon": 126.17},
    "125": {"waveLat": 33.46, "waveLon": 127.02},
    "150": {"waveLat": 33.52, "waveLon": 126.49},
}


def load_site_data() -> list[dict[str, Any]]:
    return load_runtime_sites(HTML_PATH)


def safe_error(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"HTTP {exc.code}"
    message = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
    for name in ("WINDY_API_KEY", "KMA_SERVICE_KEY"):
        key = os.environ.get(name, "").strip()
        if key:
            for value in {key, urllib.parse.unquote(key), urllib.parse.quote_plus(urllib.parse.unquote(key))}:
                message = message.replace(value, "[REDACTED]")
    return re.sub(r"(?i)((?:serviceKey|key)\s*[=:]\s*)[^&\s]+", r"\1[REDACTED]", message)


def request_timeout(default: float) -> float:
    remaining = REQUEST_DEADLINE - time.monotonic()
    if remaining <= 0:
        raise RuntimeError("Weather request budget exhausted")
    return min(default, remaining)


def load_rules() -> dict[str, Any]:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def request_forecast(
    api_key: str,
    lat: float,
    lon: float,
    parameters: list[str],
    model: str,
) -> dict[str, Any]:
    global LAST_REQUEST_AT
    if WINDY_UNAVAILABLE.is_set():
        raise RuntimeError("Windy request circuit is open")
    if not api_key:
        raise RuntimeError("WINDY_API_KEY not configured")
    payload = json.dumps(
        {
            "lat": lat,
            "lon": lon,
            "model": model,
            "parameters": parameters,
            "levels": ["surface"],
            "key": api_key,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "birdmap-weather/1.0"},
        method="POST",
    )
    for attempt in range(1, MAX_REQUEST_ATTEMPTS + 1):
        with REQUEST_RATE_LOCK:
            wait_seconds = MIN_REQUEST_INTERVAL_SECONDS - (time.monotonic() - LAST_REQUEST_AT)
            if wait_seconds > 0:
                time.sleep(wait_seconds)
            LAST_REQUEST_AT = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=request_timeout(REQUEST_TIMEOUT_SECONDS)) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403, 429):
                WINDY_UNAVAILABLE.set()
            if attempt < MAX_REQUEST_ATTEMPTS and (exc.code == 429 or exc.code >= 500):
                retry_after = exc.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
                time.sleep(min(10.0, delay))
                continue
            raise RuntimeError(f"HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            if attempt < MAX_REQUEST_ATTEMPTS:
                time.sleep(2**attempt)
                continue
            raise RuntimeError(f"Windy transport error: {type(exc.reason).__name__}") from None
        except TimeoutError as exc:
            if attempt < MAX_REQUEST_ATTEMPTS:
                time.sleep(2**attempt)
                continue
            raise RuntimeError(f"Timeout after {REQUEST_TIMEOUT_SECONDS}s") from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("Windy invalid JSON") from None
    raise RuntimeError("Forecast request failed after retries")


def request_open_meteo(url: str, parameters: dict[str, Any]) -> dict[str, Any]:
    request_url = f"{url}?{urllib.parse.urlencode(parameters)}"
    request = urllib.request.Request(
        request_url, headers={"User-Agent": "birdmap-weather/1.0"}
    )
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=request_timeout(20)) as response:
                if response.status != 200:
                    raise RuntimeError(f"Open-Meteo HTTP {response.status}")
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(attempt * 2)
    raise RuntimeError(f"Open-Meteo request failed: {safe_error(last_error)}") from None


def open_meteo_atmospheric(lat: float, lon: float, target: datetime) -> dict[str, Any]:
    data = request_open_meteo(
        OPEN_METEO_WEATHER_URL,
        {
            "latitude": lat,
            "longitude": lon,
            "current": (
                "temperature_2m,precipitation,cloud_cover,visibility,"
                "wind_speed_10m,wind_direction_10m,wind_gusts_10m"
            ),
            "wind_speed_unit": "ms",
            "hourly": "precipitation",
            "past_days": 1,
            "timezone": "Asia/Seoul",
        },
    )
    current = data.get("current") or {}
    speed = current.get("wind_speed_10m")
    direction = current.get("wind_direction_10m")
    if speed is None or direction is None:
        raise RuntimeError("Open-Meteo wind data missing")
    speed, direction = float(speed), math.radians(float(direction))
    time_text = current.get("time")
    try:
        forecast_time = datetime.fromisoformat(time_text).replace(tzinfo=KST)
    except (TypeError, ValueError):
        raise RuntimeError("Open-Meteo atmospheric timestamp missing") from None
    hourly = data.get("hourly", {})
    hour_end = forecast_time.replace(minute=0, second=0, microsecond=0)
    hourly_rain = dict(zip(hourly.get("time", []), hourly.get("precipitation", [])))
    rain_values = [hourly_rain.get((hour_end - timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M")) for i in range(3)]
    rain_3h = sum(float(v) for v in rain_values) if all(v is not None for v in rain_values) else None
    return {
        "ts": [forecast_time.timestamp() * 1000],
        "wind_u-surface": [-speed * math.sin(direction)],
        "wind_v-surface": [-speed * math.cos(direction)],
        "gust-surface": [current.get("wind_gusts_10m")],
        "past3hprecip-surface": [rain_3h],
        "precipitationValidAt": hour_end.strftime("%Y-%m-%d %H:%M KST"),
        "temp-surface": [current.get("temperature_2m")],
        "visibility-surface": [current.get("visibility")],
        "lclouds-surface": [current.get("cloud_cover")],
        "mclouds-surface": [None],
        "hclouds-surface": [None],
    }


def open_meteo_wave(lat: float, lon: float, target: datetime) -> dict[str, Any]:
    data = request_open_meteo(
        OPEN_METEO_MARINE_URL,
        {
            "latitude": lat,
            "longitude": lon,
            "current": "wave_height",
            "timezone": "Asia/Seoul",
            "cell_selection": "sea",
        },
    )
    current = data.get("current") or {}
    time_text = current.get("time")
    try:
        forecast_time = datetime.fromisoformat(time_text).replace(tzinfo=KST)
    except (TypeError, ValueError):
        raise RuntimeError("Open-Meteo wave timestamp missing") from None
    return {
        "ts": [forecast_time.timestamp() * 1000],
        "waves_height-surface": [current.get("wave_height")],
    }


def nearest_index(timestamps: list[float], target: datetime) -> int:
    if not timestamps:
        raise RuntimeError("Windy 응답에 ts 배열이 없습니다.")
    target_ms = target.timestamp() * 1000
    return min(range(len(timestamps)), key=lambda index: abs(timestamps[index] - target_ms))


def value_at(data: dict[str, Any], key: str, index: int) -> float | None:
    values = data.get(key)
    if not isinstance(values, list) or index >= len(values) or values[index] is None:
        return None
    value = float(values[index])
    return value if math.isfinite(value) else None


def wave_has_data(data: dict[str, Any]) -> bool:
    values = data.get("waves_height-surface")
    return isinstance(values, list) and any(value is not None for value in values)


def wave_coordinate_candidates(site: dict[str, Any]) -> list[tuple[float, float, str]]:
    candidates: list[tuple[float, float, str]] = []
    explicit_lat = site.get("waveLat")
    explicit_lon = site.get("waveLon")
    override = WAVE_COORDINATE_OVERRIDES.get(str(site["id"]))
    if explicit_lat is not None and explicit_lon is not None:
        candidates.append((float(explicit_lat), float(explicit_lon), "site_wave_coordinate"))
    elif override:
        candidates.append(
            (float(override["waveLat"]), float(override["waveLon"]), "marine_override")
        )

    lat = float(site["lat"])
    lon = float(site["lon"])
    candidates.append((lat, lon, "site_coordinate"))
    for lat_offset, lon_offset, label in (
        (0.08, 0.0, "nearest_marine_north"),
        (0.0, 0.08, "nearest_marine_east"),
        (-0.08, 0.0, "nearest_marine_south"),
        (0.0, -0.08, "nearest_marine_west"),
    ):
        candidates.append((lat + lat_offset, lon + lon_offset, label))

    unique: list[tuple[float, float, str]] = []
    seen: set[tuple[float, float]] = set()
    for candidate_lat, candidate_lon, source in candidates:
        key = (round(candidate_lat, 5), round(candidate_lon, 5))
        if key not in seen:
            seen.add(key)
            unique.append((candidate_lat, candidate_lon, source))
    return unique


def merge_rule(config: dict[str, Any], key: str) -> tuple[str, dict[str, Any]]:
    aliases = config.get("aliases", {})
    canonical = aliases.get(key, key)
    defaults = dict(config["default"])
    defaults.update(config.get("rules", {}).get(canonical, {}))
    return canonical, defaults


def wind_from_degrees(u: float, v: float) -> float:
    return (math.degrees(math.atan2(-u, -v)) + 360) % 360


def wind_name(degrees: float) -> str:
    names = ["북풍", "북동풍", "동풍", "남동풍", "남풍", "남서풍", "서풍", "북서풍"]
    return names[int((degrees + 22.5) // 45) % 8]


def normalized_cloud(*values: float | None) -> float | None:
    present = [value for value in values if value is not None]
    if not present:
        return None
    cloud = max(present)
    return min(100.0, cloud * 100 if cloud <= 1.5 else cloud)


def grade_for(score: int) -> str:
    stars = 5 if score >= 90 else 4 if score >= 80 else 3 if score >= 70 else 2 if score >= 60 else 1
    return "★" * stars + "☆" * (5 - stars)


def apply_threshold_penalty(value: float | None, ideal: float, maximum: float, points: int) -> int:
    if value is None or value <= ideal:
        return 0
    if maximum <= ideal:
        return points
    ratio = min(1.0, (value - ideal) / (maximum - ideal))
    return round(points * ratio)


def score_weather(
    rule_key: str,
    rule: dict[str, Any],
    wind_speed: float,
    wind_direction: float,
    gust: float | None,
    precipitation: float,
    visibility_km: float | None,
    cloud_pct: float | None,
    wave_m: float | None,
) -> int:
    score = int(rule.get("baseScore", 92))
    score -= apply_threshold_penalty(
        wind_speed, float(rule["windIdealMax"]), float(rule["windMax"]), 28
    )
    if gust is not None and gust > float(rule["gustMax"]):
        score -= min(18, round((gust - float(rule["gustMax"])) * 2))
    if precipitation > float(rule["precip3hMax"]):
        score -= min(30, round((precipitation - float(rule["precip3hMax"])) * 8 + 8))
    if visibility_km is not None and visibility_km < float(rule["visibilityMinKm"]):
        score -= min(22, round((float(rule["visibilityMinKm"]) - visibility_km) * 3))
    if cloud_pct is not None and cloud_pct > float(rule["cloudMaxPct"]):
        score -= min(12, round((cloud_pct - float(rule["cloudMaxPct"])) / 3))
    if wave_m is not None and wave_m > float(rule["waveMaxM"]):
        score -= min(28, round((wave_m - float(rule["waveMaxM"])) * 15 + 5))
    preferred = rule.get("preferredWindFrom")
    if rule_key == "island_migrant" and isinstance(preferred, list) and len(preferred) == 2:
        if float(preferred[0]) <= wind_direction <= float(preferred[1]) and precipitation <= 2:
            score += 8
    return max(0, min(100, score))


def summary_for(
    rule_key: str,
    rule: dict[str, Any],
    score: int,
    wind_speed: float,
    wind_direction: float,
    precipitation: float,
    visibility_km: float | None,
    wave_m: float | None,
) -> str:
    if precipitation > float(rule["precip3hMax"]):
        return "강수 예보가 있어 관찰성과 이동 안전이 떨어질 수 있습니다. 비가 약해지는 시간을 확인하세요."
    if wind_speed > float(rule["windMax"]):
        return "강한 바람이 예상되어 조류 활동과 관찰 안정성이 낮을 수 있습니다."
    if wave_m is not None and wave_m > float(rule["waveMaxM"]):
        return "파고가 높아 선박 운항과 해안 관찰 안전을 우선 확인해야 합니다."
    if visibility_km is not None and visibility_km < float(rule["visibilityMinKm"]):
        return "시정이 낮아 원거리 탐조에 불리합니다. 안개와 박무가 걷히는 시간을 확인하세요."
    score_summary = (
        "탐조에 매우 좋은 기상 조건입니다."
        if score >= 90
        else "탐조에 좋은 기상 조건입니다."
        if score >= 80
        else "탐조에 무난한 기상 조건입니다."
        if score >= 70
        else "탐조는 가능하지만 기상 변화에 유의하세요."
        if score >= 60
        else "탐조 여건이 좋지 않습니다."
    )
    if rule_key == "mudflat_shorebird":
        return f"{score_summary} 만조 전후 도요·물떼새 탐조 조건과 조석 시간을 함께 확인하세요."
    if rule_key == "pelagic_seabird":
        return f"{score_summary} 풍속과 파고, 출항 여부와 현장 안전 공지를 함께 확인하세요."
    if rule_key == "winter_waterfowl":
        return f"{score_summary} 수면이 안정적이면 물새 관찰에 유리합니다."
    if rule_key == "forest_songbird":
        return f"{score_summary} 바람이 약한 이른 아침 탐조를 권장합니다."
    if rule_key == "raptor_migration":
        return f"{score_summary} 강수와 시정을 확인하며 시야가 트인 곳을 살펴보세요."
    return score_summary


def build_site_result(
    site: dict[str, Any],
    rules_config: dict[str, Any],
    atmospheric: dict[str, Any],
    wave: dict[str, Any] | None,
    wave_coordinate: tuple[float, float, str] | None,
    target: datetime,
) -> dict[str, Any]:
    index = nearest_index(atmospheric.get("ts", []), target)
    u = value_at(atmospheric, "wind_u-surface", index)
    v = value_at(atmospheric, "wind_v-surface", index)
    if u is None or v is None:
        raise RuntimeError("Atmospheric wind values missing")
    wind_speed = math.hypot(u, v)
    wind_direction = wind_from_degrees(u, v)
    gust = value_at(atmospheric, "gust-surface", index)
    precipitation = value_at(atmospheric, "past3hprecip-surface", index)
    if precipitation is not None and precipitation < 0:
        precipitation = None
    temperature = value_at(atmospheric, "temp-surface", index)
    if temperature is not None and temperature > 150:
        temperature -= 273.15
    visibility = value_at(atmospheric, "visibility-surface", index)
    visibility_km = visibility / 1000 if visibility is not None and visibility > 100 else visibility
    cloud_pct = normalized_cloud(
        value_at(atmospheric, "lclouds-surface", index),
        value_at(atmospheric, "mclouds-surface", index),
        value_at(atmospheric, "hclouds-surface", index),
    )
    wave_m = None
    wave_time = None
    if wave:
        wave_index = nearest_index(wave.get("ts", []), target)
        wave_m = value_at(wave, "waves_height-surface", wave_index)
        wave_time = datetime.fromtimestamp(wave["ts"][wave_index] / 1000, KST)
        if wave_time.date() != target.date() or wave_m is not None and wave_m < 0:
            wave_m = None

    rule_key, rule = merge_rule(rules_config, str(site.get("weatherRuleKey") or "general_birding"))
    score = score_weather(
        rule_key,
        rule,
        wind_speed,
        wind_direction,
        gust,
        precipitation if precipitation is not None else 0.0,
        visibility_km,
        cloud_pct,
        wave_m,
    )
    forecast_time = datetime.fromtimestamp(atmospheric["ts"][index] / 1000, KST)
    stamps = sorted(set(atmospheric["ts"]))
    spacing = min((b - a for a, b in zip(stamps, stamps[1:]) if b > a), default=60 * 60 * 1000)
    stale = forecast_time.date() != target.date() or abs((forecast_time - target).total_seconds() * 1000) > spacing
    wave_required = bool(site.get("showWave") or site.get("island") or site.get("pelagic"))
    score_eligible = not stale and precipitation is not None and (not wave_required or wave_m is not None)
    stamp = target.strftime("%Y-%m-%d %H:%M KST")
    result = {
        "name": site["name"],
        "date": forecast_time.date().isoformat(),
        "generatedAt": stamp, "refreshedAt": stamp,
        "sourceType": "saved_forecast", "stale": stale,
        "scoreEligible": score_eligible,
        "missingScoreFields": (["precipitation"] if precipitation is None else []) + (["wave"] if wave_required and wave_m is None else []),
        "score": score,
        "grade": grade_for(score),
        "summary": summary_for(
            rule_key,
            rule,
            score,
            wind_speed,
            wind_direction,
            precipitation if precipitation is not None else 0.0,
            visibility_km,
            wave_m,
        ),
        "wind": f"{wind_name(wind_direction)} {wind_speed:.1f}m/s",
        "rain": None if precipitation is None else "강수 없음" if precipitation < 0.1 else f"3시간 강수 {precipitation:.1f}mm",
        "targetGroup": rule["targetGroup"],
        "forecastTime": forecast_time.strftime("%Y-%m-%d %H:%M KST"),
        "temperature": None if temperature is None else f"{temperature:.1f}°C",
        "visibility": None if visibility_km is None else f"{visibility_km:.1f}km",
        "cloud": None if cloud_pct is None else f"{cloud_pct:.0f}%",
        "wave": None if wave_m is None else f"{wave_m:.1f}m",
        "ruleKey": rule_key,
        "precipitationValidAt": atmospheric.get("precipitationValidAt", forecast_time.strftime("%Y-%m-%d %H:%M KST")),
        "waveForecastTime": wave_time.strftime("%Y-%m-%d %H:%M KST") if wave_time else None,
    }
    if not score_eligible:
        result.update(score=None, grade="", summary="기상 자료의 시각 또는 필수 항목을 확인할 수 없어 오늘 탐조 적합도는 미확인입니다.")
    if wave_coordinate:
        result["waveLat"] = round(wave_coordinate[0], 5)
        result["waveLon"] = round(wave_coordinate[1], 5)
        result["waveSource"] = wave_coordinate[2]
    return result


def load_previous_sites() -> dict[str, Any]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        previous = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Previous weather data unavailable: {exc}", flush=True)
        return {}
    sites = previous.get("sites", {})
    if not isinstance(sites, dict):
        return {}
    return {sid: dict(day, generatedAt=day.get("generatedAt") or ("" if day.get("stale") else previous.get("generatedAt") or previous.get("updated", "")),
                      date=day.get("date") or str(day.get("forecastTime") or "")[:10])
            for sid, day in sites.items() if isinstance(day, dict) and not day.get("dataUnavailable")
            and any(day.get(key) is not None for key in ("temperature", "wind", "rain", "visibility", "wave"))}


def process_site(
    api_key: str,
    site: dict[str, Any],
    rules: dict[str, Any],
    target: datetime,
    atmospheric_model: str,
    atmospheric_parameters: list[str],
) -> dict[str, Any]:
    weather_source = "Windy Point Forecast API"
    atmospheric_source = "windy"
    try:
        atmospheric = request_forecast(
            api_key,
            float(site["lat"]),
            float(site["lon"]),
            atmospheric_parameters,
            atmospheric_model,
        )
    except Exception as exc:
        print(f"{site['name']}: Windy unavailable, using Open-Meteo: {safe_error(exc)}", flush=True)
        atmospheric = open_meteo_atmospheric(
            float(site["lat"]), float(site["lon"]), target
        )
        weather_source = "Open-Meteo fallback"
        atmospheric_source = "open_meteo"
    visibility_source = atmospheric_source
    if not any(
        value is not None for value in atmospheric.get("visibility-surface", [])
    ):
        try:
            visibility_fallback = open_meteo_atmospheric(
                float(site["lat"]), float(site["lon"]), target
            )
            fallback_values = visibility_fallback.get("visibility-surface", [None])
            fallback_value = fallback_values[0] if fallback_values else None
            atmospheric["visibility-surface"] = [fallback_value] * len(
                atmospheric.get("ts", [])
            )
            visibility_source = "open_meteo"
            if weather_source == "Windy Point Forecast API":
                weather_source = "Windy with Open-Meteo visibility"
        except Exception as exc:
            print(f"{site['name']}: visibility fallback unavailable: {safe_error(exc)}", flush=True)
    wave = None
    wave_coordinate = None
    wave_source = None
    if site.get("showWave") or site.get("island") or site.get("pelagic"):
        for candidate in wave_coordinate_candidates(site):
            try:
                if atmospheric_source == "windy":
                    candidate_wave = request_forecast(
                        api_key,
                        candidate[0],
                        candidate[1],
                        ["waves"],
                        "gfsWave",
                    )
                    candidate_source = "windy"
                else:
                    candidate_wave = open_meteo_wave(candidate[0], candidate[1], target)
                    candidate_source = "open_meteo"
            except Exception:
                try:
                    candidate_wave = open_meteo_wave(candidate[0], candidate[1], target)
                    candidate_source = "open_meteo"
                except Exception:
                    continue
            if wave_has_data(candidate_wave):
                wave = candidate_wave
                wave_source = candidate_source
                wave_coordinate = (
                    candidate[0],
                    candidate[1],
                    candidate[2]
                    if candidate_source == "windy"
                    else f"{candidate[2]}_open_meteo",
                )
                break
    result = build_site_result(site, rules, atmospheric, wave, wave_coordinate, target)
    result["fieldSources"] = {"atmosphere": atmospheric_source, "visibility": visibility_source, "wave": wave_source}
    result["fallbackSource"] = "open_meteo" if "open_meteo" in result["fieldSources"].values() else None
    result["weatherSource"] = ("Windy" if atmospheric_source == "windy" else "Open-Meteo") + (" with Open-Meteo component fallback" if atmospheric_source == "windy" and result["fallbackSource"] else "")
    return result


def main() -> None:
    global REQUEST_DEADLINE
    REQUEST_DEADLINE = time.monotonic() + 1200
    WINDY_UNAVAILABLE.clear()
    api_key = os.environ.get("WINDY_API_KEY", "").strip()
    if not api_key:
        WINDY_UNAVAILABLE.set()
        print("::warning::WINDY_API_KEY not configured; existing Open-Meteo fallback will be used", flush=True)

    sites = load_site_data()
    registry = compare_sites(sites, load_worker_sites())
    if any(registry[k] for k in ("missingWorkerIds", "workerOnlyIds", "coordinateMismatchIds", "pelagicMismatchIds", "nameMismatchIds", "environmentMismatchIds")):
        raise RuntimeError("Runtime/Worker registry mismatch; data generation stopped")
    rules = load_rules()
    previous_sites = load_previous_sites()
    now = datetime.now(KST)
    target = now

    atmospheric_model = "icon"
    atmospheric_parameters = ATMOSPHERIC_PARAMETERS
    try:
        request_forecast(
            api_key,
            float(sites[0]["lat"]),
            float(sites[0]["lon"]),
            atmospheric_parameters,
            atmospheric_model,
        )
    except Exception as exc:
        atmospheric_model = "gfs"
        atmospheric_parameters = [
            parameter for parameter in ATMOSPHERIC_PARAMETERS if parameter != "visibility"
        ]
        print(f"ICON visibility unavailable; falling back to GFS: {safe_error(exc)}", flush=True)

    total = len(sites)
    print(f"Loading {total} sites", flush=True)
    print(f"Atmospheric model: {atmospheric_model}", flush=True)
    print(f"Using up to {MAX_WORKERS} concurrent requests", flush=True)

    results: dict[str, Any] = {}
    success_count = 0
    failed_count = 0
    reused_count = 0
    completed_count = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(
                process_site,
                api_key,
                site,
                rules,
                target,
                atmospheric_model,
                atmospheric_parameters,
            ): (position, site)
            for position, site in enumerate(sites, start=1)
        }
        for future in as_completed(futures):
            position, site = futures[future]
            site_id = str(site["id"])
            completed_count += 1
            try:
                result = future.result()
            except Exception as exc:
                failed_count += 1
                error_message = safe_error(exc)
                previous = previous_sites.get(site_id)
                if isinstance(previous, dict):
                    reused = dict(previous)
                    reused["stale"] = True
                    reused["error"] = error_message
                    reused.update(refreshedAt=now.strftime("%Y-%m-%d %H:%M KST"),
                                  fallbackSource="previous_saved", sourceType="saved_reference", scoreEligible=False)
                    results[site_id] = reused
                    reused_count += 1
                    print(
                        f"Site {position}/{total} ({completed_count} completed) "
                        f"{site['name']}: {error_message} - REUSED",
                        flush=True,
                    )
                else:
                    rule_key, _ = merge_rule(
                        rules, str(site.get("weatherRuleKey") or "general_birding")
                    )
                    results[site_id] = {
                        "name": site["name"],
                        "score": None,
                        "grade": "",
                        "summary": "최신 기상 정보를 가져오지 못했습니다. Windy 상세 예보를 확인하세요.",
                        "wind": None,
                        "rain": None,
                        "targetGroup": None,
                        "forecastTime": None,
                        "temperature": None,
                        "visibility": None,
                        "cloud": None,
                        "wave": None,
                        "ruleKey": rule_key,
                        "stale": True,
                        "dataUnavailable": True, "scoreEligible": False,
                        "date": now.date().isoformat(), "generatedAt": "",
                        "refreshedAt": now.strftime("%Y-%m-%d %H:%M KST"),
                        "sourceType": "none", "fallbackSource": "none",
                        "error": error_message,
                    }
                    print(
                        f"Site {position}/{total} ({completed_count} completed) "
                        f"{site['name']}: {error_message} - PLACEHOLDER",
                        flush=True,
                    )
            else:
                result.setdefault("stale", False)
                result.pop("error", None)
                results[site_id] = result
                success_count += 1
                print(
                    f"Site {position}/{total} ({completed_count} completed) "
                    f"{site['name']}: OK",
                    flush=True,
                )

    print(f"Success: {success_count}", flush=True)
    print(f"Failed: {failed_count}", flush=True)
    print(f"Reused: {reused_count}", flush=True)

    stale_count = sum(bool(d.get("stale")) for d in results.values())
    unavailable_count = sum(bool(d.get("dataUnavailable")) for d in results.values())
    output = {
        "date": now.date().isoformat(),
        "generatedAt": now.strftime("%Y-%m-%d %H:%M KST"),
        "refreshedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "source": "Windy Point Forecast API with Open-Meteo fallback",
        "status": "api_failed_fallback_available" if success_count == 0 and reused_count else "api_failed_no_data" if success_count == 0 else "partial" if failed_count or stale_count or any(not d.get("scoreEligible") for d in results.values()) else "ok",
        "siteCount": len(results),
        "successCount": success_count,
        "failedCount": failed_count,
        "reusedCount": reused_count,
        "upstreamSuccessCount": success_count,
        "staleCount": stale_count,
        "unavailableSiteCount": unavailable_count,
        "scoreEligibleCount": sum(bool(d.get("scoreEligible")) for d in results.values()),
        "providerFallbackCount": sum(d.get("fallbackSource") == "open_meteo" for d in results.values()),
        "registry": registry,
        "sites": results,
    }
    temporary_path = OUTPUT_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(OUTPUT_PATH)
    if output["status"] != "ok":
        print(f"::warning::Weather status={output['status']}; upstream={success_count}, reused={reused_count}, unavailable={unavailable_count}", flush=True)
    print(f"{OUTPUT_PATH.name}: {len(results)} sites saved", flush=True)


if __name__ == "__main__":
    main()
