// 출현종 제보 「위치 가리기」. 정본(dual-write) 접수·승인 경로를 실제 스키마(schema.sql + 0001 + 0003)로 돌린다.
// 외부 호출은 모두 가짜다(Turnstile·Access). 운영 D1 은 건드리지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { environments, installAuthStubs, input, post, adminPost, ORIGIN } from "../local-test/helpers.mjs";
import { handleRequest as publicHandler } from "../src/public.js";
import { handleRequest as adminHandler } from "../src/admin.js";
import { APPROX_MIN_METERS, APPROX_MAX_METERS } from "../src/shared.js";
import { canonicalDb } from "./helpers.mjs";

const CLICK = { lat: 37.512345, lon: 127.054321 };
const get = async (env, path) => {
  const res = await publicHandler(new Request("https://r" + path, { headers: { Origin: ORIGIN } }), env);
  return { text: await res.clone().text(), body: await res.json() };
};
const row = (db, id) => db.sqlite.prepare("SELECT * FROM reports WHERE id=?").get(id);
const checklist = (db, id) => db.sqlite.prepare("SELECT * FROM checklists WHERE checklist_id=?").get(id);
const revisionOf = (db, id) => checklist(db, id).revision;
function meters(a, b) {
  const dy = (a.lat - b.lat) * 111320, dx = (a.lon - b.lon) * 111320 * Math.cos((b.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
// 실제 좌표 문자열이 응답 어디에도 없어야 한다(개발자도구 Network 에서 보이는 원문 기준).
function assertNoActual(text) {
  assert.ok(!text.includes(String(CLICK.lat)) && !text.includes(String(CLICK.lon)), "실제 좌표가 공개 응답에 있다");
}
async function setup() {
  const auth = await installAuthStubs();
  const db = canonicalDb(), { pub, admin } = environments(db);
  return { db, pub, admin, token: auth.token, restore: auth.restore };
}
async function approve(s, id, n) {
  const res = await adminPost(s.admin, s.token, id, { action: "approve", request_id: input(n).request_id, expected_revision: revisionOf(s.db, id) });
  assert.equal(res.status, 200, await res.clone().text());
}
async function adminList(s) {
  const res = await adminHandler(new Request("https://admin.example/admin/api/reports?status=all", { headers: { "Cf-Access-Jwt-Assertion": s.token } }), s.admin);
  return (await res.json()).reports;
}

test("A. 위치 공개(기본): 클릭 = DB 실제 = 황색 = 승인 후 붉은 마커", async (t) => {
  const s = await setup(); t.after(s.restore);
  const body = input(101, CLICK);
  const res = await post(s.pub, body), accepted = await res.json();
  assert.equal(res.status, 201);
  const r = row(s.db, body.request_id);
  assert.deepEqual([r.lat, r.lon, r.public_lat, r.public_lon], [CLICK.lat, CLICK.lon, null, null]);
  assert.equal(checklist(s.db, body.request_id).coordinate_policy, "actual");
  assert.deepEqual([accepted.spot.lat, accepted.spot.lon, accepted.spot.approximate, "locationHidden" in accepted.spot], [CLICK.lat, CLICK.lon, false, false]);
  const yellow = (await get(s.pub, "/reports/pending")).body.spots.find((x) => x.id === body.request_id);
  assert.deepEqual([yellow.lat, yellow.lon, "locationHidden" in yellow], [CLICK.lat, CLICK.lon, false]);
  await approve(s, body.request_id, 102);
  const red = (await get(s.pub, "/reports/approved")).body.spots.find((x) => x.id === body.request_id);
  assert.deepEqual([red.lat, red.lon, "locationHidden" in red], [CLICK.lat, CLICK.lon, false]);
});

test("B·C·D. 위치 가리기: 실제 좌표 보존, 승인 전·후 모두 같은 대략 좌표만 공개, 공개 API 에 실제 좌표 없음", async (t) => {
  const s = await setup(); t.after(s.restore);
  const body = input(111, { ...CLICK, hideLocation: true });
  const res = await post(s.pub, body), receiptText = await res.clone().text(), accepted = await res.json();
  assert.equal(res.status, 201);
  assertNoActual(receiptText);

  // B. DB: 실제 좌표는 그대로, 공개 좌표는 1.5~4.5km 떨어진 한 점(황색·붉은 마커 공통)
  const r = row(s.db, body.request_id);
  assert.deepEqual([r.lat, r.lon], [CLICK.lat, CLICK.lon]);
  assert.notDeepEqual([r.public_lat, r.public_lon], [r.lat, r.lon]);
  assert.deepEqual([r.approx_lat, r.approx_lon], [r.public_lat, r.public_lon]);
  const d = meters({ lat: r.public_lat, lon: r.public_lon }, CLICK);
  assert.ok(d >= APPROX_MIN_METERS - 5 && d <= APPROX_MAX_METERS + 5, `offset ${d}m`);
  const c = checklist(s.db, body.request_id);
  assert.deepEqual([c.actual_lat, c.actual_lon, c.public_lat, c.public_lon, c.coordinate_policy], [CLICK.lat, CLICK.lon, r.public_lat, r.public_lon, "explicit"]);
  const raw = JSON.parse(s.db.sqlite.prepare("SELECT payload_json FROM raw_submissions WHERE request_id=?").get(body.request_id).payload_json);
  assert.equal(raw.input.hideLocation, true);

  // 접수 응답과 황색 마커: 대략 좌표 + locationHidden
  assert.deepEqual([accepted.spot.lat, accepted.spot.lon, accepted.spot.approximate, accepted.spot.locationHidden], [r.public_lat, r.public_lon, true, true]);
  const pending = await get(s.pub, "/reports/pending");
  assertNoActual(pending.text);
  const yellow = pending.body.spots.find((x) => x.id === body.request_id);
  assert.deepEqual([yellow.lat, yellow.lon, yellow.locationHidden], [r.public_lat, r.public_lon, true]);
  assert.deepEqual(Object.keys(yellow).sort(), ["approximate", "date", "id", "lat", "locationHidden", "lon", "species", "status"]);

  // 같은 요청 재전송: 같은 대략 좌표(새 점을 만들지 않는다)
  const again = await (await post(s.pub, body)).json();
  assert.deepEqual([again.spot.lat, again.spot.lon, again.spot.locationHidden], [r.public_lat, r.public_lon, true]);

  // C. 승인 후에도 붉은 마커는 같은 대략 좌표
  await approve(s, body.request_id, 112);
  const after = row(s.db, body.request_id);
  assert.deepEqual([after.status, after.lat, after.lon, after.public_lat, after.public_lon], ["approved", CLICK.lat, CLICK.lon, r.public_lat, r.public_lon]);
  const approved = await get(s.pub, "/reports/approved");
  assertNoActual(approved.text);
  const red = approved.body.spots.find((x) => x.id === body.request_id);
  assert.deepEqual([red.lat, red.lon, red.locationHidden], [r.public_lat, r.public_lon, true]);
  assert.ok(!("public_lat" in red) && !("public_lon" in red));
  assert.equal((await get(s.pub, "/reports/pending")).body.spots.some((x) => x.id === body.request_id), false);
});

test("E. 관리자 API: 실제 좌표·공개 좌표·제보자 가림 요청 여부를 모두 본다", async (t) => {
  const s = await setup(); t.after(s.restore);
  const hidden = input(121, { ...CLICK, hideLocation: true }), open = input(122, { lat: 37.3, lon: 127.3 });
  await post(s.pub, hidden); await post(s.pub, open);
  const list = await adminList(s);
  const h = list.find((x) => x.id === hidden.request_id), o = list.find((x) => x.id === open.request_id);
  assert.deepEqual([h.lat, h.lon, h.hide_requested], [CLICK.lat, CLICK.lon, 1]);
  assert.ok(h.public_lat !== null && h.public_lat !== h.lat);
  assert.deepEqual([o.public_lat, o.hide_requested], [null, null]);
});

test("관리자 강제 위치 보호: 가리기·해제는 실제 좌표와 승인 상태를 바꾸지 않고, 다시 가려도 같은 점을 쓴다", async (t) => {
  const s = await setup(); t.after(s.restore);
  const body = input(131, CLICK);
  await post(s.pub, body);
  await approve(s, body.request_id, 132);

  const hide = await adminPost(s.admin, s.token, body.request_id, { action: "hide", hide: true, request_id: input(133).request_id, expected_revision: revisionOf(s.db, body.request_id) });
  assert.equal(hide.status, 200, await hide.clone().text());
  const r = row(s.db, body.request_id);
  assert.deepEqual([r.status, r.lat, r.lon], ["approved", CLICK.lat, CLICK.lon]);
  assert.ok(meters({ lat: r.public_lat, lon: r.public_lon }, CLICK) >= APPROX_MIN_METERS - 5);
  assert.deepEqual([r.approx_lat, r.approx_lon], [r.public_lat, r.public_lon]);
  assert.equal(checklist(s.db, body.request_id).coordinate_policy, "explicit");
  const approved = await get(s.pub, "/reports/approved");
  assertNoActual(approved.text);
  assert.equal(approved.body.spots.find((x) => x.id === body.request_id).locationHidden, true);
  const listed = (await adminList(s)).find((x) => x.id === body.request_id);
  assert.equal(listed.hide_requested, null); // 제보자 요청이 아니라 관리자 지정

  const unhide = await adminPost(s.admin, s.token, body.request_id, { action: "hide", hide: false, request_id: input(134).request_id, expected_revision: revisionOf(s.db, body.request_id) });
  assert.equal(unhide.status, 200, await unhide.clone().text());
  const u = row(s.db, body.request_id);
  assert.deepEqual([u.status, u.lat, u.lon, u.public_lat, u.public_lon], ["approved", CLICK.lat, CLICK.lon, null, null]);
  assert.equal(checklist(s.db, body.request_id).coordinate_policy, "actual");
  const red = (await get(s.pub, "/reports/approved")).body.spots.find((x) => x.id === body.request_id);
  assert.deepEqual([red.lat, red.lon, "locationHidden" in red], [CLICK.lat, CLICK.lon, false]);

  // 제보자가 가린 제보를 관리자가 한 번 더 가려도 공개 좌표는 그대로다(새 점을 만들지 않는다).
  const other = input(135, { lat: 37.4, lon: 127.4, hideLocation: true });
  await post(s.pub, other);
  const before = row(s.db, other.request_id);
  const again = await adminPost(s.admin, s.token, other.request_id, { action: "hide", hide: true, request_id: input(136).request_id, expected_revision: revisionOf(s.db, other.request_id) });
  assert.equal(again.status, 200, await again.clone().text());
  const same = row(s.db, other.request_id);
  assert.deepEqual([same.public_lat, same.public_lon, same.approx_lat, same.approx_lon], [before.public_lat, before.public_lon, before.approx_lat, before.approx_lon]);
});

test("잘못된 위치 가리기 값은 저장하지 않고 400, 공개 capability 에 hideLocation 이 켜져 있다", async (t) => {
  const s = await setup(); t.after(s.restore);
  const bad = await post(s.pub, input(141, { hideLocation: "yes" }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, "HIDE_LOCATION_INVALID");
  assert.equal(s.db.count("SELECT COUNT(*) AS n FROM reports"), 0);
  const cap = (await get(s.pub, "/reports/capabilities")).body;
  assert.equal(cap.quickReport.hideLocation, true);
});
