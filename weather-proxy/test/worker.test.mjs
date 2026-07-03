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
    "kma-v3:19:60x127:202607031800:202607031830:202607031700",
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
    windDirection: "서풍",
    rainProbability: 10,
    sky: "구름 많음",
  });
  assert.deepEqual(tomorrow.afternoon, {
    label: "내일 오후",
    forecastTime: "2026-07-04 15:00 KST",
    temperature: 27,
    windSpeed: 3.1,
    windDirection: "남서풍",
    rainProbability: 30,
    sky: "흐림",
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
    true,
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
