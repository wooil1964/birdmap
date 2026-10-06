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
