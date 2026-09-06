import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKER_CONFIG,
  createCacheKey,
  fetchJsonWithTimeout,
  hasCompleteTomorrow,
  handleRequest,
  kmaBaseTimes,
  latestVillageForecastBase,
  latLonToKmaGrid,
  normalizeForecast,
  normalizeObservation,
  normalizeTomorrowForecast,
  weatherNumber,
} from "../src/index.js";

const productionOrigin = { Origin: "https://wooil1964.github.io" };

test("converts the official Seoul reference coordinate", () => {
  assert.deepEqual(latLonToKmaGrid(37.579871128849334, 126.98935225645432), {
    nx: 60,
    ny: 127,
  });
});

test("creates a stable cache key", () => {
  const grid = { nx: 60, ny: 127 };
  const bases = {
    observation: { date: "20260703", time: "1800" },
    forecast: { date: "20260703", time: "1830" },
    village: { date: "20260703", time: "1700" },
  };
  assert.equal(
    createCacheKey("19", grid, bases),
    "kma-v4:19:60x127:202607031800:202607031830:202607031700",
  );
});

test("selects separate observation and forecast base times", () => {
  const bases = kmaBaseTimes(new Date("2026-07-03T10:20:00Z"));
  assert.deepEqual(bases.observation, { date: "20260703", time: "1800" });
  assert.deepEqual(bases.forecast, { date: "20260703", time: "1830" });
  assert.deepEqual(bases.village, { date: "20260703", time: "1700" });
});

test("selects the latest available village forecast base across midnight", () => {
  assert.deepEqual(
    latestVillageForecastBase(new Date("2026-07-03T15:05:00Z")),
    { date: "20260703", time: "2300" },
  );
  assert.deepEqual(
    latestVillageForecastBase(new Date("2026-07-03T17:15:00Z")),
    { date: "20260704", time: "0200" },
  );
});

test("handles CORS preflight for the production origin", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/weather?siteId=19", {
      method: "OPTIONS",
      headers: productionOrigin,
    }),
    { ENVIRONMENT: "production" },
  );
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://wooil1964.github.io",
  );
});

test("rejects an unapproved browser origin", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/weather?siteId=19", {
      headers: { Origin: "https://example.com" },
    }),
    { ENVIRONMENT: "production" },
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects unsupported methods", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/weather?siteId=19", {
      method: "POST",
      headers: productionOrigin,
    }),
    { ENVIRONMENT: "production" },
  );
  assert.equal(response.status, 405);
});

test("rejects missing and invalid site IDs", async () => {
  const missing = await handleRequest(
    new Request("https://worker.example/weather", { headers: productionOrigin }),
    { ENVIRONMENT: "production" },
  );
  const invalid = await handleRequest(
    new Request("https://worker.example/weather?siteId=999", {
      headers: productionOrigin,
    }),
    { ENVIRONMENT: "production" },
  );
  assert.equal(missing.status, 400);
  assert.equal(invalid.status, 404);
});

test("keeps pelagic sites on marine-first weather", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/weather?siteId=74", {
      headers: productionOrigin,
    }),
    { ENVIRONMENT: "production" },
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "MARINE_PRIMARY_REQUIRED");
});

test("reports a missing secret without exposing a key", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/weather?siteId=19", {
      headers: productionOrigin,
    }),
    { ENVIRONMENT: "production" },
  );
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "MISSING_KMA_SERVICE_KEY");
  assert.equal(JSON.stringify(body).includes("serviceKey="), false);
});

test("converts an aborted upstream request to a timeout error", async () => {
  const never = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  await assert.rejects(
    fetchJsonWithTimeout("https://example.invalid", 5, never),
    (error) => error.code === "KMA_TIMEOUT" && error.status === 504,
  );
});

test("keeps observation and forecast timestamps separate", () => {
  const observation = normalizeObservation([
    { category: "T1H", obsrValue: "24.1", baseDate: "20260703", baseTime: "1800" },
    { category: "WSD", obsrValue: "3.4", baseDate: "20260703", baseTime: "1800" },
    { category: "VEC", obsrValue: "225", baseDate: "20260703", baseTime: "1800" },
    { category: "RN1", obsrValue: "0", baseDate: "20260703", baseTime: "1800" },
    { category: "REH", obsrValue: "72", baseDate: "20260703", baseTime: "1800" },
  ]);
  const forecast = normalizeForecast(
    [
      { category: "SKY", fcstValue: "3", baseDate: "20260703", baseTime: "1730", fcstDate: "20260703", fcstTime: "1900" },
      { category: "T1H", fcstValue: "24", baseDate: "20260703", baseTime: "1730", fcstDate: "20260703", fcstTime: "1900" },
    ],
    new Date("2026-07-03T09:50:00Z"),
  );
  assert.equal(observation.dataTime, "2026-07-03 18:00 KST");
  assert.equal(forecast.issuedAt, "2026-07-03 17:30 KST");
  assert.equal(forecast.forecastTime, "2026-07-03 19:00 KST");
  assert.equal(forecast.sky, "구름 많음");
});

test("prioritizes observed precipitation over cloudy sky", () => {
  const rainy = normalizeForecast(
    [
      { category: "PTY", fcstValue: "1", fcstDate: "20260703", fcstTime: "1900" },
      { category: "RN1", fcstValue: "1.0", fcstDate: "20260703", fcstTime: "1900" },
      { category: "SKY", fcstValue: "4", fcstDate: "20260703", fcstTime: "1900" },
    ],
    new Date("2026-07-03T09:50:00Z"),
  );
  const snow = normalizeObservation([
    { category: "PTY", obsrValue: "3", baseDate: "20260703", baseTime: "1800" },
    { category: "RN1", obsrValue: "0", baseDate: "20260703", baseTime: "1800" },
  ]);
  const rainWithoutType = normalizeObservation([
    { category: "PTY", obsrValue: "0", baseDate: "20260703", baseTime: "1800" },
    { category: "RN1", obsrValue: "0.5", baseDate: "20260703", baseTime: "1800" },
  ]);
  assert.equal(rainy.weatherText, "비");
  assert.equal(snow.weatherText, "눈");
  assert.equal(rainWithoutType.weatherText, "강수");
});

test("prioritizes tomorrow precipitation and uses a 60 percent POP threshold", () => {
  const items = [
    { category: "PTY", fcstValue: "4", fcstDate: "20260704", fcstTime: "0900" },
    { category: "PCP", fcstValue: "강수없음", fcstDate: "20260704", fcstTime: "0900" },
    { category: "POP", fcstValue: "20", fcstDate: "20260704", fcstTime: "0900" },
    { category: "SKY", fcstValue: "4", fcstDate: "20260704", fcstTime: "0900" },
    { category: "PTY", fcstValue: "0", fcstDate: "20260704", fcstTime: "1500" },
    { category: "PCP", fcstValue: "강수없음", fcstDate: "20260704", fcstTime: "1500" },
    { category: "POP", fcstValue: "60", fcstDate: "20260704", fcstTime: "1500" },
    { category: "SKY", fcstValue: "1", fcstDate: "20260704", fcstTime: "1500" },
  ];
  const tomorrow = normalizeTomorrowForecast(items, new Date("2026-07-03T12:00:00Z"));
  assert.equal(tomorrow.morning.weatherText, "소나기");
  assert.equal(tomorrow.afternoon.weatherText, "비 가능성");

  const pcp = normalizeTomorrowForecast(
    [
      { category: "PTY", fcstValue: "0", fcstDate: "20260704", fcstTime: "0900" },
      { category: "PCP", fcstValue: "1.0mm 미만", fcstDate: "20260704", fcstTime: "0900" },
      { category: "POP", fcstValue: "20", fcstDate: "20260704", fcstTime: "0900" },
      { category: "SKY", fcstValue: "4", fcstDate: "20260704", fcstTime: "0900" },
    ],
    new Date("2026-07-03T12:00:00Z"),
  );
  assert.equal(pcp.morning.weatherText, "비 가능성");

  const dry = normalizeTomorrowForecast(
    [
      { category: "PTY", fcstValue: "0", fcstDate: "20260704", fcstTime: "0900" },
      { category: "PCP", fcstValue: "강수없음", fcstDate: "20260704", fcstTime: "0900" },
      { category: "POP", fcstValue: "50", fcstDate: "20260704", fcstTime: "0900" },
      { category: "SKY", fcstValue: "3", fcstDate: "20260704", fcstTime: "0900" },
    ],
    new Date("2026-07-03T12:00:00Z"),
  );
  assert.equal(dry.morning.weatherText, "흐림");
});

test("rejects missing, non-finite, sentinel, and out-of-range weather values", () => {
  const invalidValues = [
    999,
    999.0,
    -999,
    998,
    998.0,
    -998,
    998.9,
    -998.9,
    null,
    undefined,
    "",
    "   ",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const field of [
    "temperature",
    "windSpeed",
    "rain",
    "humidity",
    "windDirection",
    "rainProbability",
  ]) {
    for (const value of invalidValues) {
      assert.equal(weatherNumber(value, field), null, `${field}: ${String(value)}`);
    }
  }

  const rangeCases = {
    temperature: { valid: [-60, -12.5, 0, 24.1, 60], invalid: [-60.1, 60.1] },
    windSpeed: { valid: [0, 3.4, 100], invalid: [-0.1, 100.1] },
    rain: { valid: [0, 1.2, 500], invalid: [-0.1, 500.1] },
    humidity: { valid: [0, 72, 100], invalid: [-0.1, 100.1] },
    windDirection: { valid: [0, 225, 360], invalid: [-0.1, 360.1] },
    rainProbability: { valid: [0, 30, 100], invalid: [-0.1, 100.1] },
  };
  for (const [field, cases] of Object.entries(rangeCases)) {
    for (const value of cases.valid) assert.equal(weatherNumber(value, field), value);
    for (const value of cases.invalid) assert.equal(weatherNumber(value, field), null);
  }
});

test("normalizes invalid observation sentinels without changing real zero values", () => {
  const observation = normalizeObservation([
    { category: "T1H", obsrValue: "-999", baseDate: "20260704", baseTime: "0800" },
    { category: "WSD", obsrValue: "-998.9", baseDate: "20260704", baseTime: "0800" },
    { category: "RN1", obsrValue: "-998.9", baseDate: "20260704", baseTime: "0800" },
    { category: "REH", obsrValue: "-998", baseDate: "20260704", baseTime: "0800" },
    { category: "VEC", obsrValue: "-998", baseDate: "20260704", baseTime: "0800" },
  ]);
  assert.equal(observation.temperature, null);
  assert.equal(observation.windSpeed, null);
  assert.equal(observation.rain, null);
  assert.equal(observation.humidity, null);
  assert.equal(observation.windDirectionDegrees, null);
  assert.equal(observation.windDirection, null);

  const zeroObservation = normalizeObservation([
    { category: "T1H", obsrValue: "0", baseDate: "20260704", baseTime: "0800" },
    { category: "WSD", obsrValue: "0", baseDate: "20260704", baseTime: "0800" },
    { category: "RN1", obsrValue: "0", baseDate: "20260704", baseTime: "0800" },
    { category: "REH", obsrValue: "0", baseDate: "20260704", baseTime: "0800" },
    { category: "VEC", obsrValue: "0", baseDate: "20260704", baseTime: "0800" },
  ]);
  assert.equal(zeroObservation.temperature, 0);
  assert.equal(zeroObservation.windSpeed, 0);
  assert.equal(zeroObservation.rain, 0);
  assert.equal(zeroObservation.humidity, 0);
  assert.equal(zeroObservation.windDirectionDegrees, 0);
  assert.equal(zeroObservation.windDirection, "북풍");
});

test("applies range validation to current and tomorrow forecasts", () => {
  const forecast = normalizeForecast(
    [
      { category: "T1H", fcstValue: "998.9", baseDate: "20260704", baseTime: "1230", fcstDate: "20260704", fcstTime: "1300" },
      { category: "WSD", fcstValue: "-998.9", baseDate: "20260704", baseTime: "1230", fcstDate: "20260704", fcstTime: "1300" },
      { category: "RN1", fcstValue: "-998.9", baseDate: "20260704", baseTime: "1230", fcstDate: "20260704", fcstTime: "1300" },
      { category: "REH", fcstValue: "-998", baseDate: "20260704", baseTime: "1230", fcstDate: "20260704", fcstTime: "1300" },
      { category: "VEC", fcstValue: "-998", baseDate: "20260704", baseTime: "1230", fcstDate: "20260704", fcstTime: "1300" },
      { category: "SKY", fcstValue: "2", baseDate: "20260704", baseTime: "1230", fcstDate: "20260704", fcstTime: "1300" },
    ],
    new Date("2026-07-04T04:00:00Z"),
  );
  assert.equal(forecast.temperature, null);
  assert.equal(forecast.windSpeed, null);
  assert.equal(forecast.rain, null);
  assert.equal(forecast.humidity, null);
  assert.equal(forecast.windDirectionDegrees, null);
  assert.equal(forecast.windDirection, null);
  assert.equal(forecast.sky, null);

  const tomorrow = normalizeTomorrowForecast(
    [
      { category: "TMP", fcstValue: "999.0", fcstDate: "20260705", fcstTime: "0900" },
      { category: "WSD", fcstValue: "-998.9", fcstDate: "20260705", fcstTime: "0900" },
      { category: "VEC", fcstValue: "-998", fcstDate: "20260705", fcstTime: "0900" },
      { category: "POP", fcstValue: "998", fcstDate: "20260705", fcstTime: "0900" },
      { category: "SKY", fcstValue: "2", fcstDate: "20260705", fcstTime: "0900" },
      { category: "TMP", fcstValue: "26", fcstDate: "20260705", fcstTime: "1500" },
    ],
    new Date("2026-07-04T00:00:00Z"),
  );
  assert.equal(tomorrow.morning.temperature, null);
  assert.equal(tomorrow.morning.windSpeed, null);
  assert.equal(tomorrow.morning.windDirectionDegrees, null);
  assert.equal(tomorrow.morning.windDirection, null);
  assert.equal(tomorrow.morning.rainProbability, null);
  assert.equal(tomorrow.morning.sky, null);
  assert.equal(tomorrow.afternoon.temperature, 26);
});

test("selects tomorrow 09:00 and 15:00 KST forecasts", () => {
  const items = [
    { category: "TMP", fcstValue: "24", fcstDate: "20260704", fcstTime: "0900" },
    { category: "WSD", fcstValue: "2.0", fcstDate: "20260704", fcstTime: "0900" },
    { category: "VEC", fcstValue: "270", fcstDate: "20260704", fcstTime: "0900" },
    { category: "POP", fcstValue: "10", fcstDate: "20260704", fcstTime: "0900" },
    { category: "SKY", fcstValue: "3", fcstDate: "20260704", fcstTime: "0900" },
    { category: "TMP", fcstValue: "27", fcstDate: "20260704", fcstTime: "1500" },
    { category: "WSD", fcstValue: "3.1", fcstDate: "20260704", fcstTime: "1500" },
    { category: "VEC", fcstValue: "225", fcstDate: "20260704", fcstTime: "1500" },
    { category: "POP", fcstValue: "30", fcstDate: "20260704", fcstTime: "1500" },
    { category: "SKY", fcstValue: "4", fcstDate: "20260704", fcstTime: "1500" },
  ];
  const tomorrow = normalizeTomorrowForecast(
    items,
    new Date("2026-07-03T12:00:00Z"),
  );
  assert.deepEqual(tomorrow.morning, {
    label: "내일 오전",
    forecastTime: "2026-07-04 09:00 KST",
    temperature: 24,
    windSpeed: 2,
    windDirectionDegrees: 270,
    windDirection: "서풍",
    rainProbability: 10,
    precipitationAmount: null,
    sky: "구름 많음",
    precipitationType: null,
    weatherText: "흐림",
  });
  assert.deepEqual(tomorrow.afternoon, {
    label: "내일 오후",
    forecastTime: "2026-07-04 15:00 KST",
    temperature: 27,
    windSpeed: 3.1,
    windDirectionDegrees: 225,
    windDirection: "남서풍",
    rainProbability: 30,
    precipitationAmount: null,
    sky: "흐림",
    precipitationType: null,
    weatherText: "흐림",
  });
});

test("keeps missing tomorrow periods and fields nullable", () => {
  const tomorrow = normalizeTomorrowForecast(
    [
      { category: "TMP", fcstValue: "24", fcstDate: "20260704", fcstTime: "0900" },
    ],
    new Date("2026-07-03T12:00:00Z"),
  );
  assert.equal(tomorrow.morning.temperature, 24);
  assert.equal(tomorrow.morning.rainProbability, null);
  assert.equal(tomorrow.afternoon, null);
});

test("only caches responses with both tomorrow periods", () => {
  assert.equal(
    hasCompleteTomorrow({ tomorrow: { morning: {}, afternoon: {} } }),
    false,
  );
  assert.equal(hasCompleteTomorrow({ tomorrow: null }), false);
  assert.equal(
    hasCompleteTomorrow({ tomorrow: { morning: {}, afternoon: null } }),
    false,
  );
});

test("keeps the configured cache and timeout bounds", () => {
  assert.equal(WORKER_CONFIG.cacheTtlSeconds, 900);
  assert.equal(WORKER_CONFIG.upstreamTimeoutMs, 8000);
  assert.equal(WORKER_CONFIG.tomorrowTimeoutMs, 8000);
});
