import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { handleRequest } from "../src/public.js";
import { FIELD_UPDATE_TTL_HOURS } from "../src/field-updates.js";
import { ORIGIN, fakeDb, publicEnv, withTurnstile } from "./helpers.mjs";

const DEVICE_A = "device-aaaaaaaaaaaaaaaa";
const DEVICE_B = "device-bbbbbbbbbbbbbbbb";
const DEVICE_C = "device-cccccccccccccccc";
let ipSeq = 0;

function setup() {
  return { env: publicEnv(fakeDb([])) };
}

async function call(env, method, path, body, ip) {
  const request = new Request(`https://reports.example${path}`, {
    method,
    headers: { ...ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip || `203.0.113.${(ipSeq++ % 200) + 1}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await withTurnstile(true, () => handleRequest(request, env));
  return { response, body: await response.json() };
}

const valid = (extra = {}) => ({
  species: "검은어깨매", status: "visible", lat: 37.9, lon: 126.7, count: 1, nickname: "행복합니다",
  deviceId: DEVICE_A, turnstileToken: "t", locationSource: "gps", gpsAccuracy: 18, ...extra,
});
const create = (env, extra) => call(env, "POST", "/field-updates", valid(extra));
const list = (env) => call(env, "GET", "/field-updates");

test("1·2·7. 지금 보여요 등록 후 GET 으로 조회된다", async () => {
  const { env } = setup();
  const made = await create(env);
  assert.equal(made.response.status, 201);
  assert.equal(made.body.update.status, "visible");
  assert.equal(made.body.update.species, "검은어깨매");
  assert.equal(made.body.update.count, 1);
  assert.equal(made.body.update.nickname, "행복합니다");
  assert.equal(made.body.update.confirmCount, 0);
  assert.deepEqual(made.body.update.history.map((h) => h.status), ["visible"]);

  const got = await list(env);
  assert.equal(got.response.status, 200);
  assert.equal(got.response.headers.get("Cache-Control"), "no-store");
  assert.equal(got.body.ttlHours, FIELD_UPDATE_TTL_HOURS);
  assert.equal(got.body.updates.length, 1);
  assert.equal(got.body.updates[0].lat, 37.9);
  // 응답에는 사용자 식별값·IP 해시·정확도 같은 내부 값이 없다.
  const text = JSON.stringify(got.body);
  for (const secret of ["user_hash", "ip_hash", "deviceId", DEVICE_A, "gps_accuracy"]) assert.ok(!text.includes(secret), secret);
});

test("8. 찾는 중 등록", async () => {
  const { env } = setup();
  const made = await create(env, { status: "searching", species: "붉은가슴기러기" });
  assert.equal(made.response.status, 201);
  assert.equal(made.body.update.status, "searching");
});

test("3·4. 네 가지 상태만 허용하고, 처음 등록은 두 가지만 된다", async () => {
  const { env } = setup();
  for (const bad of ["", "arrived", "moving", "VISIBLE", undefined]) {
    const r = await create(env, { status: bad });
    assert.equal(r.response.status, 400, String(bad));
    assert.equal(r.body.error.code, "FIELD_STATUS_INVALID");
  }
  for (const status of ["not_visible", "reappeared"]) {
    const r = await create(env, { status });
    assert.equal(r.response.status, 400);
    assert.equal(r.body.error.code, "FIELD_STATUS_NOT_ALLOWED");
  }
});

test("5. 좌표·개체수·종명·메모·기기값 검증", async () => {
  const { env } = setup();
  const cases = [
    [{ lat: 10, lon: 126 }, "COORDINATE_OUT_OF_RANGE"],
    [{ lat: "x", lon: 126 }, "COORDINATE_REQUIRED"],
    [{ count: 0 }, "FIELD_COUNT_INVALID"],
    [{ count: 1.5 }, "FIELD_COUNT_INVALID"],
    [{ species: "" }, "SPECIES_REQUIRED"],
    [{ species: "참새, 박새" }, "SPECIES_INVALID"],
    [{ note: "가".repeat(101) }, "FIELD_TEXT_TOO_LONG"],
    [{ note: "<b>" }, "FIELD_TEXT_INVALID"],
    [{ deviceId: "x" }, "FIELD_DEVICE_REQUIRED"],
  ];
  for (const [extra, code] of cases) {
    const r = await create(env, extra);
    assert.equal(r.response.status, 400, code);
    assert.equal(r.body.error.code, code);
  }
  assert.equal((await create(env, { count: null, note: "전봇대 위", nickname: "" })).body.update.nickname, "익명");
});

test("자동 등록 방지가 없으면 등록되지 않는다", async () => {
  const { env } = setup();
  const request = new Request("https://reports.example/field-updates", {
    method: "POST",
    headers: { ...ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.250" },
    body: JSON.stringify(valid({ turnstileToken: "" })),
  });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 400);
  assert.equal((await list(env)).body.updates.length, 0);
});

test("9~12. 안 보여요·다시 나타남은 새 이벤트로 쌓이고 이전 이력은 남는다", async () => {
  const { env } = setup();
  const made = (await create(env)).body.update;
  const path = `/field-updates/${made.id}/status`;
  const lost = await call(env, "POST", path, { status: "not_visible", deviceId: DEVICE_B, turnstileToken: "t", nickname: "산새" });
  assert.equal(lost.response.status, 201);
  assert.equal(lost.body.update.status, "not_visible");
  assert.deepEqual(lost.body.update.history.map((h) => h.status), ["visible", "not_visible"]);
  assert.equal(lost.body.update.firstSeenAt, made.firstSeenAt, "최초 관찰시간은 그대로");
  assert.equal(lost.body.update.lat, made.lat);

  const back = await call(env, "POST", path, { status: "reappeared", deviceId: DEVICE_C, turnstileToken: "t" });
  assert.equal(back.response.status, 201);
  assert.deepEqual(back.body.update.history.map((h) => h.status), ["visible", "not_visible", "reappeared"]);
  // 현재 상태는 가장 최근 이벤트다.
  assert.equal((await list(env)).body.updates[0].status, "reappeared");
});

test("상태 전환 규칙: 같은 상태·불가능한 전환·알 수 없는 상태는 거절", async () => {
  const { env } = setup();
  const { id } = (await create(env)).body.update;
  const path = `/field-updates/${id}/status`;
  const send = (status) => call(env, "POST", path, { status, deviceId: DEVICE_B, turnstileToken: "t" });
  assert.equal((await send("visible")).body.error.code, "FIELD_STATUS_SAME");
  assert.equal((await send("reappeared")).body.error.code, "FIELD_STATUS_TRANSITION");
  assert.equal((await send("arrived")).body.error.code, "FIELD_STATUS_INVALID");
  assert.equal((await send("not_visible")).response.status, 201);
  assert.equal((await send("visible")).body.error.code, "FIELD_STATUS_TRANSITION");
});

test("찾는 중 → 지금 보여요(찾았어요)로 이어진다", async () => {
  const { env } = setup();
  const { id } = (await create(env, { status: "searching" })).body.update;
  const r = await call(env, "POST", `/field-updates/${id}/status`, { status: "visible", deviceId: DEVICE_B, turnstileToken: "t" });
  assert.equal(r.response.status, 201);
  assert.deepEqual(r.body.update.history.map((h) => h.status), ["searching", "visible"]);
});

test("13~16. 확인: 수 증가, 같은 기기 중복 방지, 최초 시간 유지, 최근 확인 시간 따로 갱신", async () => {
  const { env } = setup();
  const made = (await create(env)).body.update;
  const path = `/field-updates/${made.id}/confirm`;
  const first = await call(env, "POST", path, { deviceId: DEVICE_B });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.update.confirmCount, 1);
  assert.equal(first.body.update.firstSeenAt, made.firstSeenAt);
  assert.equal(first.body.update.updatedAt, made.updatedAt, "확인은 상태 변경시간을 바꾸지 않는다");
  assert.ok(first.body.update.lastConfirmedAt);
  assert.equal(made.lastConfirmedAt, null);

  const again = await call(env, "POST", path, { deviceId: DEVICE_B });
  assert.equal(again.response.status, 409);
  assert.equal(again.body.error.code, "FIELD_ALREADY_CONFIRMED");

  const other = await call(env, "POST", path, { deviceId: DEVICE_C });
  assert.equal(other.body.update.confirmCount, 2);
  assert.equal((await list(env)).body.updates[0].confirmCount, 2);
});

test("직접 올린 소식은 확인할 수 없고, 보이지 않는 상태도 확인할 수 없다", async () => {
  const { env } = setup();
  const { id } = (await create(env)).body.update;
  const own = await call(env, "POST", `/field-updates/${id}/confirm`, { deviceId: DEVICE_A });
  assert.equal(own.body.error.code, "FIELD_CONFIRM_OWN");
  await call(env, "POST", `/field-updates/${id}/status`, { status: "not_visible", deviceId: DEVICE_B, turnstileToken: "t" });
  const gone = await call(env, "POST", `/field-updates/${id}/confirm`, { deviceId: DEVICE_C });
  assert.equal(gone.body.error.code, "FIELD_NOT_CONFIRMABLE");
  const missing = await call(env, "POST", "/field-updates/00000000-0000-0000-0000-000000000000/confirm", { deviceId: DEVICE_C });
  assert.equal(missing.response.status, 404);
});

test("6. TTL: 마지막 활동 3시간 뒤에는 비노출, 확인이 있으면 그 시각부터 다시 센다", async () => {
  const { env } = setup();
  const start = Date.parse("2026-10-10T05:00:00Z");
  mock.timers.enable({ apis: ["Date"], now: start });
  try {
    const made = (await create(env)).body.update;
    assert.equal((await list(env)).body.updates.length, 1);

    mock.timers.setTime(start + 2 * 3600 * 1000 + 30 * 60 * 1000); // 2시간 30분
    const confirmed = await call(env, "POST", `/field-updates/${made.id}/confirm`, { deviceId: DEVICE_B });
    assert.equal(confirmed.response.status, 201);
    assert.equal(confirmed.body.update.firstSeenAt, made.firstSeenAt);

    mock.timers.setTime(start + 3 * 3600 * 1000 + 60 * 1000); // 최초 등록으로부터 3시간 1분
    assert.equal((await list(env)).body.updates.length, 1, "최근 확인이 있으면 아직 유효하다");

    mock.timers.setTime(start + 2 * 3600 * 1000 + 30 * 60 * 1000 + FIELD_UPDATE_TTL_HOURS * 3600 * 1000 + 60 * 1000);
    assert.equal((await list(env)).body.updates.length, 0, "마지막 활동 3시간이 지나면 사라진다");
    const late = await call(env, "POST", `/field-updates/${made.id}/confirm`, { deviceId: DEVICE_C });
    assert.equal(late.response.status, 410);
    assert.equal(late.body.error.code, "FIELD_EXPIRED");
  } finally {
    mock.timers.reset();
  }
});

test("17. 보호종은 실제 좌표를 내보내지 않고 대략 좌표만 쓴다", async () => {
  const { env } = setup();
  const made = await create(env, { species: "저어새", lat: 36.5, lon: 126.5 });
  assert.equal(made.response.status, 201);
  const entry = made.body.update;
  assert.equal(entry.locationHidden, true);
  assert.notEqual(entry.lat, 36.5);
  assert.notEqual(entry.lon, 126.5);
  const listed = (await list(env)).body.updates[0];
  assert.deepEqual([listed.lat, listed.lon], [entry.lat, entry.lon], "공개 좌표는 고정이라 조회할 때마다 같다");
  // 실제 좌표와 1km 넘게 떨어진 대략 좌표다(숫자로 비교한다. 문자열 부분 일치는 우연히 겹칠 수 있다).
  const meters = Math.hypot((listed.lat - 36.5) * 111320, (listed.lon - 126.5) * 111320 * Math.cos((36.5 * Math.PI) / 180));
  assert.ok(meters > 1000, `공개 좌표가 실제 좌표와 너무 가깝다: ${meters}m`);
  assert.equal(JSON.stringify((await list(env)).body).includes("gps_accuracy"), false);
  // 일반 종은 그대로다.
  assert.equal((await create(env, { species: "검은어깨매", lat: 36.5, lon: 126.5 })).body.update.lat, 36.5);
});

test("18. 번식 관련 낱말이 있으면 저장하지 않는다", async () => {
  const { env } = setup();
  for (const extra of [{ note: "둥지 발견" }, { note: "새끼 육추 중" }, { species: "번식중인 참새" }]) {
    const r = await create(env, extra);
    assert.equal(r.response.status, 400, JSON.stringify(extra));
    assert.equal(r.body.error.code, "FIELD_BREEDING_NOT_ALLOWED");
  }
  assert.equal((await list(env)).body.updates.length, 0);
});

test("제출 횟수 제한(같은 IP 해시)", async () => {
  const { env } = setup();
  let last;
  for (let i = 0; i < 11; i += 1) last = await call(env, "POST", "/field-updates", valid({ species: `참새${i}` }), "198.51.100.9");
  assert.equal(last.response.status, 429);
  assert.equal(last.body.error.code, "FIELD_RATE_LIMITED");
});

test("20. 기존 reports API 는 영향이 없다", async () => {
  const { env } = setup();
  await create(env);
  for (const path of ["/reports/approved", "/reports/pending", "/reports/recent-sites"]) {
    const response = await handleRequest(new Request(`https://reports.example${path}`, { headers: ORIGIN }), env);
    assert.equal(response.status, 200, path);
    const body = await response.json();
    assert.ok(!JSON.stringify(body).includes("검은어깨매"), "현장소식이 reports 응답에 섞이지 않는다");
  }
  const unknown = await handleRequest(new Request("https://reports.example/nothing", { headers: ORIGIN }), env);
  assert.equal(unknown.status, 404);
  const put = await call(env, "PUT", "/field-updates", valid());
  assert.equal(put.response.status, 405);
});

// ── 등록자 삭제(소프트 삭제) ─────────────────────────────────────────────
const del = (env, id, body, ip) => call(env, "POST", `/field-updates/${id}/delete`, body, ip);
const fieldRows = (env) => env.REPORTS_DB.prepare("SELECT id, status, user_hash FROM field_updates").all().then((r) => r.results);
const eventRows = (env, id) => env.REPORTS_DB.prepare("SELECT status, user_hash FROM field_update_events WHERE field_update_id = ?1 ORDER BY created_at, rowid").bind(id).all().then((r) => r.results);

test("삭제 1. 등록자 본인은 삭제하고, 공개 목록에서 즉시 사라지며 행과 이력은 소프트 삭제로 남는다", async () => {
  const { env } = setup();
  const made = (await create(env)).body.update;
  const other = (await create(env, { deviceId: DEVICE_B, species: "큰고니" })).body.update;
  assert.equal((await list(env)).body.updates.length, 2);

  const result = await del(env, made.id, { deviceId: DEVICE_A });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.ok, true);
  assert.ok(result.body.deletedAt);

  const after = (await list(env)).body.updates;
  assert.deepEqual(after.map((u) => u.id), [other.id], "삭제한 소식만 빠지고 다른 소식은 그대로");
  assert.ok(!JSON.stringify(after).includes("deleted"));
  const rows = await fieldRows(env);
  assert.equal(rows.length, 2, "행은 지우지 않는다");
  assert.equal(rows.find((r) => r.id === made.id).status, "deleted");
  assert.equal(rows.find((r) => r.id === other.id).status, "visible");
  const events = await eventRows(env, made.id);
  assert.deepEqual(events.map((e) => e.status), ["visible", "deleted"], "이전 이력은 보존하고 삭제 이벤트를 더한다");
  assert.equal(events[1].user_hash, events[0].user_hash, "삭제 이벤트는 소유자 해시로 기록");
  assert.ok(!JSON.stringify(result.body).includes(events[0].user_hash));
});

test("삭제 2·3. 다른 기기·다른 등록자·닉네임만 같은 이용자는 삭제할 수 없다", async () => {
  const { env } = setup();
  const made = (await create(env, { nickname: "행복합니다" })).body.update;
  for (const [name, deviceId] of [["다른 기기", DEVICE_B], ["다른 등록자", DEVICE_C]]) {
    const result = await del(env, made.id, { deviceId, nickname: "행복합니다" });
    assert.equal(result.response.status, 403, name);
    assert.equal(result.body.error.code, "FIELD_DELETE_FORBIDDEN", name);
  }
  // 닉네임만 같은 이용자: 닉네임을 그대로 보내고 다른 기기에서 시도해도 거부된다(닉네임은 소유권 판단에 쓰지 않는다).
  const sameNick = await del(env, made.id, { deviceId: DEVICE_B, nickname: made.nickname, userHash: "anything", isOwner: true, mine: true });
  assert.equal(sameNick.response.status, 403);
  assert.equal((await list(env)).body.updates.length, 1, "거부된 뒤에도 소식은 그대로");
  assert.equal((await fieldRows(env))[0].status, "visible");
  assert.equal((await eventRows(env, made.id)).length, 1, "거부는 이벤트를 남기지 않는다");
});

test("삭제 4. 존재하지 않는 ID·형식이 틀린 ID·기기값 없음은 삭제되지 않는다", async () => {
  const { env } = setup();
  const made = (await create(env)).body.update;
  const missing = await del(env, "00000000-0000-0000-0000-000000000000", { deviceId: DEVICE_A });
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error.code, "FIELD_NOT_FOUND");
  const badId = await call(env, "POST", "/field-updates/not-a-uuid/delete", { deviceId: DEVICE_A });
  assert.equal(badId.response.status, 404);
  const sqlish = await call(env, "POST", "/field-updates/x'%20OR%201=1--/delete", { deviceId: DEVICE_A });
  assert.equal(sqlish.response.status, 404);
  for (const body of [{}, { deviceId: "short" }, { deviceId: "한글한글한글한글한글한글한글한글" }, undefined]) {
    const result = await del(env, made.id, body);
    assert.equal(result.response.status, 400, JSON.stringify(body));
  }
  assert.equal((await list(env)).body.updates.length, 1);
  assert.equal((await fieldRows(env))[0].status, "visible");
});

test("삭제 5. 이미 삭제한 소식: 등록자 재삭제는 성공(멱등), 다른 사람에게는 존재하지 않는 소식", async () => {
  const { env } = setup();
  const made = (await create(env)).body.update;
  assert.equal((await del(env, made.id, { deviceId: DEVICE_A })).response.status, 200);
  const again = await del(env, made.id, { deviceId: DEVICE_A });
  assert.equal(again.response.status, 200);
  assert.equal(again.body.alreadyDeleted, true);
  assert.equal((await eventRows(env, made.id)).filter((e) => e.status === "deleted").length, 1, "삭제 이벤트는 한 번만");
  const stranger = await del(env, made.id, { deviceId: DEVICE_B });
  assert.equal(stranger.response.status, 404);
});

test("삭제 6. 삭제한 소식은 확인·상태 변경도 할 수 없고, 상태 API 로 deleted 를 만들 수 없다", async () => {
  const { env } = setup();
  const made = (await create(env)).body.update;
  const forged = await call(env, "POST", `/field-updates/${made.id}/status`, { status: "deleted", deviceId: DEVICE_A, turnstileToken: "t" });
  assert.equal(forged.response.status, 400);
  assert.equal(forged.body.error.code, "FIELD_STATUS_INVALID");
  assert.equal((await fieldRows(env))[0].status, "visible");

  await del(env, made.id, { deviceId: DEVICE_A });
  const confirm = await call(env, "POST", `/field-updates/${made.id}/confirm`, { deviceId: DEVICE_B });
  assert.equal(confirm.response.status, 404);
  const status = await call(env, "POST", `/field-updates/${made.id}/status`, { status: "not_visible", deviceId: DEVICE_B, turnstileToken: "t" });
  assert.equal(status.response.status, 404);
  assert.equal((await list(env)).body.updates.length, 0);
});

test("삭제 7. 허용되지 않은 Origin·GET·DELETE 메서드로는 삭제할 수 없다", async () => {
  const { env } = setup();
  const made = (await create(env)).body.update;
  const evil = await handleRequest(new Request(`https://reports.example/field-updates/${made.id}/delete`, {
    method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify({ deviceId: DEVICE_A }),
  }), env);
  assert.equal(evil.status, 403);
  assert.equal((await evil.json()).error.code, "ORIGIN_NOT_ALLOWED");
  const getResult = await call(env, "GET", `/field-updates/${made.id}/delete`);
  assert.equal(getResult.response.status, 405);
  const deleteMethod = await call(env, "DELETE", `/field-updates/${made.id}`);
  assert.ok([404, 405].includes(deleteMethod.response.status));
  assert.equal((await fieldRows(env))[0].status, "visible", "어느 경로로도 지워지지 않았다");
});

test("삭제 8. 삭제는 다른 소식의 상태 변경·확인·TTL 에 영향을 주지 않는다", async () => {
  const { env } = setup();
  const keep = (await create(env, { species: "큰고니" })).body.update;
  const gone = (await create(env, { species: "저어새" })).body.update;
  await del(env, gone.id, { deviceId: DEVICE_A });
  const confirm = await call(env, "POST", `/field-updates/${keep.id}/confirm`, { deviceId: DEVICE_B });
  assert.equal(confirm.response.status, 201);
  const status = await call(env, "POST", `/field-updates/${keep.id}/status`, { status: "not_visible", deviceId: DEVICE_B, turnstileToken: "t" });
  assert.equal(status.response.status, 201);
  const now = (await list(env)).body;
  assert.deepEqual(now.updates.map((u) => u.id), [keep.id]);
  assert.equal(now.ttlHours, FIELD_UPDATE_TTL_HOURS);
});
