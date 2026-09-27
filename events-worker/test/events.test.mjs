// birdmap-events Worker. 실제 schema.sql 을 메모리 SQLite 에 올려 저장 결과까지 확인한다.
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleRequest, deviceType, kstDay } from "../src/index.js";

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const ORIGIN = "https://wooil1964.github.io";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
const NOW = new Date("2026-09-27T03:00:00.000Z"); // KST 2026-09-27 12:00

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const prepare = (sql) => {
    let params = [];
    const s = { bind(...v) { params = v; return s; }, async run() { db.prepare(sql).run(...params); return { success: true }; } };
    return s;
  };
  return {
    prepare,
    async batch(list) {
      db.exec("BEGIN");
      try { for (const s of list) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      return [];
    },
    rows: () => db.prepare("SELECT * FROM daily_usage ORDER BY event, site_id, source, device_type, link_type, result_bucket").all().map((r) => ({ ...r })),
    columns: () => db.prepare("SELECT name FROM pragma_table_info('daily_usage')").all().map((r) => r.name),
  };
}

const env = (db) => ({ EVENTS_DB: db, ALLOWED_ORIGINS: ORIGIN });
function post(db, body, { origin = ORIGIN, ua = PC, method = "POST", path = "/events", now = NOW, raw } = {}) {
  const headers = { "Content-Type": "text/plain;charset=UTF-8" };
  if (origin) headers.Origin = origin;
  if (ua) headers["User-Agent"] = ua;
  const init = { method, headers };
  if (method === "POST") init.body = raw ?? JSON.stringify(body);
  return handleRequest(new Request("https://birdmap-events.example" + path, init), env(db), now);
}
const one = (item) => ({ events: [{ n: 1, ...item }] });

test("허용된 이벤트는 KST 날짜·기기 유형으로 일별 합계에 더해진다", async () => {
  const db = fakeD1();
  const res = await post(db, one({ event: "birdsite_popup_open", site_id: "19", source: "marker" }), { ua: PHONE });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.deepEqual(db.rows(), [{ day: "2026-09-27", event: "birdsite_popup_open", site_id: "19", source: "marker", device_type: "mobile", link_type: "", result_bucket: "", count: 1 }]);
});

test("같은 조합은 요청을 넘어 count 만 늘고, 다른 조합은 따로 쌓인다", async () => {
  const db = fakeD1();
  await post(db, { events: [{ event: "route_toggle", n: 2 }, { event: "route_toggle", n: 3 }] });
  await post(db, one({ event: "route_toggle" }));
  await post(db, one({ event: "route_toggle" }), { ua: PHONE });
  await post(db, one({ event: "search_use", result_count: "0" }));
  await post(db, one({ event: "search_use", result_count: "2_5" }));
  await post(db, { events: [{ event: "search_use", result_count: "2_5", n: 4 }] });
  const rows = db.rows().map((r) => [r.event, r.device_type, r.result_bucket, r.count]);
  assert.deepEqual(rows, [
    ["route_toggle", "desktop", "", 6],
    ["route_toggle", "mobile", "", 1],
    ["search_use", "desktop", "0", 1],
    ["search_use", "desktop", "2_5", 5],
  ]);
});

test("여러 이벤트를 한 번에 받는다", async () => {
  const db = fakeD1();
  const res = await post(db, { events: [
    { event: "report_button_click", n: 1 }, { event: "recent_report_click", n: 2 },
    { event: "report_spot_popup_open", source: "recent", n: 2 }, { event: "weekly_panel_open", n: 1 },
    { event: "weekly_recommendation_click", site_id: "107", n: 1 }, { event: "notice_panel_open", n: 1 },
    { event: "external_link_click", link_type: "windy", site_id: "19", n: 1 }, { event: "external_link_click", link_type: "other", n: 1 },
  ] });
  assert.equal(res.status, 204);
  assert.equal(db.rows().length, 8);
  assert.equal(db.rows().reduce((s, r) => s + r.count, 0), 10);
});

test("KST 날짜: UTC 15:00 이후는 다음 날로 집계된다", async () => {
  assert.equal(kstDay(new Date("2026-09-27T14:59:59.999Z")), "2026-09-27");
  assert.equal(kstDay(new Date("2026-09-27T15:00:00.000Z")), "2026-09-28");
  const db = fakeD1();
  await post(db, one({ event: "route_toggle" }), { now: new Date("2026-09-27T15:30:00.000Z") });
  assert.equal(db.rows()[0].day, "2026-09-28");
});

test("허용 목록 밖의 이벤트·자유 문자열은 거절하고 아무것도 저장하지 않는다", async () => {
  const db = fakeD1();
  for (const event of ["page_view", "birdsite_click_유부도", "report_submit_success", "__proto__", "constructor", "", 42, null])
    assert.equal((await post(db, one({ event }))).status, 400, String(event));
  assert.deepEqual(db.rows(), []);
});

test("금지 필드(좌표·검색어·이름·식별자·UA·referrer 등)가 하나라도 있으면 전체를 거절한다", async () => {
  const db = fakeD1();
  const forbidden = { lat: 36.0, lon: 126.6, latitude: "36", q: "유부도", query: "x", term: "x", reporter: "홍길동", name: "x", email: "a@b.c",
    ip: "1.2.3.4", ip_hash: "x", ua: "x", user_agent: "x", referrer: "x", url: "x", session_id: "x", user_id: "x", uuid: "x", fingerprint: "x", species: "x" };
  for (const [key, value] of Object.entries(forbidden)) {
    const res = await post(db, { events: [{ event: "route_toggle", n: 1 }, { event: "birdsite_popup_open", site_id: "19", n: 1, [key]: value }] });
    assert.equal(res.status, 400, key);
  }
  // 이벤트에 맞지 않는 허용 필드도 거절(route_toggle 에 site_id 없음).
  assert.equal((await post(db, one({ event: "route_toggle", site_id: "19" }))).status, 400);
  // 최상위에 다른 키가 있어도 거절.
  assert.equal((await post(db, { events: [{ event: "route_toggle", n: 1 }], lat: 36 })).status, 400);
  assert.deepEqual(db.rows(), []);
});

test("site_id·source·link_type·result_count·n 값 검증", async () => {
  const db = fakeD1();
  const bad = [
    { event: "birdsite_popup_open" },                                   // site_id 필수
    { event: "birdsite_popup_open", site_id: "9999" },                  // 없는 탐조지
    { event: "birdsite_popup_open", site_id: "19 OR 1=1" },
    { event: "birdsite_popup_open", site_id: 19 },                      // 문자열만
    { event: "birdsite_popup_open", site_id: "__proto__" },
    { event: "birdsite_popup_open", site_id: "19", source: "recent" },  // 탐조지 팝업 출처 목록 밖
    { event: "external_link_click", link_type: "https://map.kakao.com/x" },
    { event: "external_link_click" },
    { event: "search_use", result_count: "3" },
    { event: "search_use", result_count: 3 },
  ];
  for (const item of bad) assert.equal((await post(db, one(item))).status, 400, JSON.stringify(item));
  for (const n of [0, -1, 51, 1.5, "2", null]) assert.equal((await post(db, { events: [{ event: "route_toggle", n }] })).status, 400, String(n));
  assert.deepEqual(db.rows(), []);
  assert.equal((await post(db, one({ event: "birdsite_popup_open", site_id: "195", source: "share" }))).status, 204);
});

test("User-Agent 원문은 저장하지 않고 기기 유형 4가지만 남는다", async () => {
  assert.equal(deviceType(PHONE), "mobile");
  assert.equal(deviceType(PC), "desktop");
  assert.equal(deviceType("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/140.0 Safari/537.36"), "tablet");
  assert.equal(deviceType("Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"), "mobile");
  assert.equal(deviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(deviceType("SomeTV/1.0"), "other");
  const db = fakeD1();
  await post(db, one({ event: "route_toggle" }), { ua: PHONE });
  assert.deepEqual(db.columns(), ["day", "event", "site_id", "source", "device_type", "link_type", "result_bucket", "count"]);
  assert.ok(!JSON.stringify(db.rows()).includes("iPhone"));
});

test("봇 UA·UA 없음은 저장하지 않고 조용히 끝낸다", async () => {
  const db = fakeD1();
  for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)", "curl/8.4.0", "python-requests/2.32", "Mozilla/5.0 HeadlessChrome/140.0", ""])
    assert.equal((await post(db, one({ event: "route_toggle" }), { ua })).status, 204, ua);
  assert.deepEqual(db.rows(), []);
});

test("Origin·메서드·경로·크기·개수 제한", async () => {
  const db = fakeD1();
  assert.equal((await post(db, one({ event: "route_toggle" }), { origin: "https://evil.example" })).status, 403);
  assert.equal((await post(db, one({ event: "route_toggle" }), { origin: "" })).status, 403);
  assert.equal((await post(db, one({ event: "route_toggle" }), { origin: "null" })).status, 403);
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) assert.equal((await post(db, null, { method })).status, 405, method);
  assert.equal((await post(db, one({ event: "route_toggle" }), { path: "/" })).status, 404);
  assert.equal((await post(db, null, { raw: "{" })).status, 400);
  assert.equal((await post(db, null, { raw: JSON.stringify({ events: [] }) })).status, 400);
  assert.equal((await post(db, { events: Array.from({ length: 21 }, () => ({ event: "route_toggle", n: 1 })) })).status, 400);
  const big = JSON.stringify({ events: [{ event: "route_toggle", n: 1 }] }) + " ".repeat(4096);
  assert.equal((await post(db, null, { raw: big })).status, 413);
  assert.deepEqual(db.rows(), []);
});

test("DB 가 없거나 쓰기에 실패하면 503 이고 예외를 밖으로 던지지 않는다", async () => {
  const res = await handleRequest(new Request("https://x.example/events", { method: "POST", headers: { Origin: ORIGIN, "User-Agent": PC }, body: JSON.stringify(one({ event: "route_toggle" })) }), { ALLOWED_ORIGINS: ORIGIN });
  assert.equal(res.status, 503);
  const broken = { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw new Error("D1 down"); } };
  const logged = [], original = console.error; console.error = (...a) => logged.push(a.join(" "));
  try {
    const r = await handleRequest(new Request("https://x.example/events", { method: "POST", headers: { Origin: ORIGIN, "User-Agent": PC }, body: JSON.stringify(one({ event: "route_toggle" })) }), { EVENTS_DB: broken, ALLOWED_ORIGINS: ORIGIN });
    assert.equal(r.status, 503);
  } finally { console.error = original; }
  assert.ok(logged.some((l) => l.startsWith("events: write failed")));
});
