import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/public.js";
import { kstDateString } from "../src/shared.js";
import { ORIGIN, fakeDb, publicEnv } from "./helpers.mjs";

// 관찰일은 오늘(KST)에서 며칠 전으로 만든다. 날짜가 바뀌어도 시험이 그대로 통한다.
const ago = (days) => kstDateString(new Date(Date.now() - days * 86400000));

function recentRequest(query = "", method = "GET") {
  return new Request(`https://reports.example/reports/recent-sites${query}`, { method, headers: ORIGIN });
}

function rows() {
  return [
    // 탐조지 15: 같은 종 5건 + 다른 종 1건 → 고유 2종, 최근 관찰일은 1일 전
    ...[1, 2, 3, 4, 5].map((d) => ({ id: `a${d}`, status: "approved", site_id: "15", species: "캐나다기러기", lat: 36.6, lon: 126.4, observed_on: ago(d) })),
    { id: "a6", status: "approved", site_id: "15", species: "쇠기러기 · 캐나다기러기", lat: 36.6, lon: 126.4, observed_on: ago(6) },
    // 승인 대기·반려는 빠진다.
    { id: "p1", status: "pending", site_id: "15", species: "흰이마기러기", lat: 36.6, lon: 126.4, observed_on: ago(0) },
    { id: "r1", status: "rejected", site_id: "15", species: "개리", lat: 36.6, lon: 126.4, observed_on: ago(0) },
    // 탐조지 미연결은 빠진다.
    { id: "free", status: "approved", species: "쇠제비갈매기", lat: 36.0, lon: 126.6, observed_on: ago(1) },
    // 위치를 가린 제보(공개 좌표가 실제와 다름)는 빠진다.
    { id: "hidden", status: "approved", site_id: "19", species: "흰물떼새", lat: 36.0, lon: 126.6, public_lat: 36.05, public_lon: 126.65, observed_on: ago(1) },
    // 번식 메모·보호종은 빠진다.
    { id: "nest", status: "approved", site_id: "19", species: "쇠제비갈매기", lat: 36.0, lon: 126.6, note: "둥지 확인", observed_on: ago(1) },
    { id: "prot", status: "approved", site_id: "19", species: "저어새", lat: 36.0, lon: 126.6, observed_on: ago(1) },
    // 기간 밖(20일 전)은 기본 14일에서 빠진다.
    { id: "old", status: "approved", site_id: "21", species: "고대갈매기", lat: 35.8, lon: 126.6, observed_on: ago(20) },
  ];
}

test("최근 승인 제보를 탐조지별 최근 관찰일과 고유 종으로 묶는다", async () => {
  const response = await handleRequest(recentRequest(), publicEnv(fakeDb(rows())));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.days, 14);
  assert.deepEqual(body.sites, [{ siteId: "15", latestDate: ago(1), species: ["캐나다기러기", "쇠기러기"] }]);
});

test("좌표·제보자·메모는 응답에 넣지 않는다", async () => {
  const text = await (await handleRequest(recentRequest(), publicEnv(fakeDb(rows())))).text();
  for (const leak of ['"lat"', '"lon"', "public_lat", "reporter", '"note"', "둥지", "흰물떼새", "저어새", "흰이마기러기", "개리"]) {
    assert.equal(text.includes(leak), false, leak);
  }
});

test("days 는 1~30 일로 제한한다", async () => {
  const wide = await (await handleRequest(recentRequest("?days=30"), publicEnv(fakeDb(rows())))).json();
  assert.equal(wide.days, 30);
  assert.deepEqual(wide.sites.map((s) => s.siteId).sort(), ["15", "21"]);
  const capped = await (await handleRequest(recentRequest("?days=999"), publicEnv(fakeDb(rows())))).json();
  assert.equal(capped.days, 30);
  const tight = await (await handleRequest(recentRequest("?days=0"), publicEnv(fakeDb(rows())))).json();
  assert.equal(tight.days, 14);
});

test("GET 외의 메서드는 막고 저장 자료를 바꾸지 않는다", async () => {
  const db = fakeDb(rows());
  const response = await handleRequest(recentRequest("", "POST"), publicEnv(db));
  assert.equal(response.status, 405);
  assert.equal(db.rows.length, rows().length);
});
