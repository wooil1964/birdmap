// 관리자 이용 통계. 이벤트 DB(events-worker/schema.sql)와 제보 DB(정본 스키마)를 각각 메모리에 올려 확인한다.
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { environments, installAuthStubs } from "../local-test/helpers.mjs";
import { handleRequest as adminHandler } from "../src/admin.js";
import { adminUsage } from "../src/admin-usage.js";
import { canonicalDb } from "./helpers.mjs";

const NOW = new Date("2026-09-27T03:00:00.000Z"); // KST 09-27 12:00 → 7일 창 09-21~, 30일 창 08-29~

function eventsDb(rows) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../events-worker/schema.sql", import.meta.url), "utf8"));
  const ins = db.prepare("INSERT INTO daily_usage (day, event, site_id, source, device_type, link_type, result_bucket, count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const r of rows) ins.run(...r);
  return {
    prepare(sql) {
      let params = [];
      const s = { bind(...v) { params = v; return s; }, async all() { return { results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }; } };
      return s;
    },
  };
}

function reportsDb(received) {
  const db = canonicalDb();
  const site = db.sqlite.prepare("INSERT INTO sites (site_id, site_name, lat, lon, registry_source, registry_revision, source_record_json, created_at) VALUES (?, ?, 36, 127, 't', 'r', '{}', 'x')");
  site.run("19", "유부도"); site.run("107", "매향리");
  const ins = db.sqlite.prepare("INSERT INTO reports (id, status, species, observed_on, received_at, lat, lon, ip_hash, dedupe_hash) VALUES (?, ?, '도요', '2026-09-01', ?, 35.123456, 126.654321, 'IPHASH', ?1)");
  received.forEach(([status, at], i) => ins.run("r" + i, status, at));
  return db;
}

const EVENTS = [
  ["2026-09-27", "report_button_click", "", "", "mobile", "", "", 3],
  ["2026-09-20", "report_button_click", "", "", "desktop", "", "", 2],     // 30일 안, 7일 밖
  ["2026-08-28", "report_button_click", "", "", "desktop", "", "", 100],   // 30일 밖(수집 시작일)
  ["2026-09-25", "birdsite_popup_open", "19", "marker", "mobile", "", "", 4],
  ["2026-09-25", "birdsite_popup_open", "19", "search", "desktop", "", "", 1],
  ["2026-09-10", "birdsite_popup_open", "107", "marker", "tablet", "", "", 2],
  ["2026-09-26", "search_use", "", "", "desktop", "", "2_5", 1],
];
const REPORTS = [
  ["approved", "2026-09-26T00:00:00.000Z"],   // 7일
  ["rejected", "2026-09-22T00:00:00.000Z"],   // 7일(상태와 무관하게 제출은 제출)
  ["pending", "2026-09-01T00:00:00.000Z"],    // 30일
  ["approved", "2026-08-20T00:00:00.000Z"],   // 창 밖
];

test("요약·기능별·탐조지별 합계와 클릭 대비 제출 비율", async () => {
  const r = await adminUsage({ EVENTS_DB: eventsDb(EVENTS), REPORTS_DB: reportsDb(REPORTS) }, NOW);
  assert.equal(r.configured, true);
  assert.deepEqual(r.window, { day7: "2026-09-21", day30: "2026-08-29" });
  assert.equal(r.trackingSince, "2026-08-28");
  assert.deepEqual(r.summary, { clicks7: 9, clicks30: 13, reportClicks7: 3, reportClicks30: 5, submitted7: 2, submitted30: 3, submitRate7: 66.7, submitRate30: 60 });
  assert.deepEqual(Object.fromEntries(r.events.map((e) => [e.event, [e.d7, e.d30]])),
    { birdsite_popup_open: [5, 7], report_button_click: [3, 5], search_use: [1, 1] });
  assert.deepEqual(r.sites, [
    { site_id: "19", site_name: "유부도", d7: 5, d30: 5, mobile: 4, desktop: 1, tablet: 0, other: 0 },
    { site_id: "107", site_name: "매향리", d7: 0, d30: 2, mobile: 0, desktop: 0, tablet: 2, other: 0 },
  ]);
});

test("수집 시작 전 제보는 제출 수에 넣지 않는다(비율 부풀림 방지)", async () => {
  const late = EVENTS.filter((e) => e[0] >= "2026-09-25");
  const r = await adminUsage({ EVENTS_DB: eventsDb(late), REPORTS_DB: reportsDb(REPORTS) }, NOW);
  assert.equal(r.trackingSince, "2026-09-25");
  assert.equal(r.summary.submitted7, 1);   // 09-26 만. 09-22 는 수집 전
  assert.equal(r.summary.submitted30, 1);
  const empty = await adminUsage({ EVENTS_DB: eventsDb([]), REPORTS_DB: reportsDb(REPORTS) }, NOW);
  assert.deepEqual(empty.summary, { clicks7: 0, clicks30: 0, reportClicks7: 0, reportClicks30: 0, submitted7: 0, submitted30: 0, submitRate7: null, submitRate30: null });
});

test("이벤트 DB 가 연결되지 않았으면 configured:false 만 돌려준다", async () => {
  assert.deepEqual(await adminUsage({ REPORTS_DB: reportsDb([]) }, NOW), { ok: true, configured: false });
});

test("관리자 인증 뒤에서만 열리고, 응답에 좌표·해시·UA 원문이 없다", async (t) => {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = reportsDb(REPORTS), { admin } = environments(db);
  admin.EVENTS_DB = eventsDb(EVENTS);
  const get = (token) => adminHandler(new Request("https://admin.example/admin/api/usage", { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} }), admin);
  const ok = await get(auth.token);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  const text = await ok.text();
  for (const banned of ["35.12", "126.65", "IPHASH", "lat", "lon", "Mozilla", "@example"]) assert.ok(!text.includes(banned), banned);
  const anonymous = await get(null);
  assert.ok([401, 403].includes(anonymous.status));
  assert.ok(!(await anonymous.text()).includes("유부도"));
});
