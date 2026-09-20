import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/public.js";
import {
  ORIGIN,
  fakeDb,
  publicEnv,
  submitRequest,
  validBody,
  withTurnstile,
} from "./helpers.mjs";

function approvedRequest() {
  return new Request("https://reports.example/reports/approved", {
    headers: ORIGIN,
  });
}

test("허용하지 않은 Origin 은 거부한다", async () => {
  const response = await handleRequest(
    new Request("https://reports.example/reports/approved", {
      headers: { Origin: "https://evil.example" },
    }),
    publicEnv(fakeDb()),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ORIGIN_NOT_ALLOWED");
});

test("preflight 는 POST 를 허용한다", async () => {
  const response = await handleRequest(
    new Request("https://reports.example/reports", { method: "OPTIONS", headers: ORIGIN }),
    publicEnv(fakeDb()),
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Methods"), /POST/);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://wooil1964.github.io",
  );
});

test("로그인 없이 제보하면 승인 대기로 저장된다", async () => {
  const db = fakeDb();
  const response = await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody()), publicEnv(db)),
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "pending");
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].status, "pending");
  assert.equal(db.rows[0].species, "붉은양진이 · 흰꼬리딱새");
  // 원본 IP 는 저장하지 않는다.
  assert.equal(db.rows[0].ip_hash.includes("203.0.113.7"), false);
  assert.match(db.rows[0].ip_hash, /^[0-9a-f]{64}$/);
});

test("승인 전 제보는 공개 목록에 나오지 않는다", async () => {
  const db = fakeDb();
  await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody()), publicEnv(db)),
  );
  const response = await handleRequest(approvedRequest(), publicEnv(db));
  assert.deepEqual((await response.json()).spots, []);
});

test("자동 등록 방지 토큰이 없으면 저장하지 않는다", async () => {
  const db = fakeDb();
  const response = await handleRequest(
    submitRequest(validBody({ turnstileToken: undefined })),
    publicEnv(db),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "CAPTCHA_REQUIRED");
  assert.equal(db.rows.length, 0);
});

test("자동 등록 방지 검증에 실패하면 저장하지 않는다", async () => {
  const db = fakeDb();
  const response = await withTurnstile(false, () =>
    handleRequest(submitRequest(validBody()), publicEnv(db)),
  );
  assert.equal(response.status, 403);
  assert.equal(db.rows.length, 0);
});

test("시크릿이 없으면 접수를 열지 않고 닫는다", async () => {
  const db = fakeDb();
  const response = await handleRequest(
    submitRequest(validBody()),
    publicEnv(db, { TURNSTILE_SECRET_KEY: "", REPORT_IP_SALT: "" }),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "NOT_CONFIGURED_SALT");
  assert.equal(db.rows.length, 0);

  // 어느 설정이 빠졌는지 코드로 구분된다(운영 중 진단용).
  const captchaOnly = await handleRequest(
    submitRequest(validBody()),
    publicEnv(db, { TURNSTILE_SECRET_KEY: "" }),
  );
  assert.equal(captchaOnly.status, 503);
  assert.equal((await captchaOnly.json()).error.code, "NOT_CONFIGURED_CAPTCHA");
  assert.equal(db.rows.length, 0);
});

test("같은 IP 의 잦은 제보를 서버에서 막는다", async () => {
  const db = fakeDb();
  const env = publicEnv(db);
  await withTurnstile(true, async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await handleRequest(
        submitRequest(validBody({ species: `동박새${index}` })),
        env,
      );
      assert.equal(response.status, 201);
    }
    const blocked = await handleRequest(
      submitRequest(validBody({ species: "쇠솔새" })),
      env,
    );
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error.code, "RATE_LIMITED");
  });
  assert.equal(db.rows.length, 5);
});

test("같은 종·좌표·관찰일의 중복 제보를 막는다", async () => {
  const db = fakeDb();
  const env = publicEnv(db);
  await withTurnstile(true, async () => {
    await handleRequest(submitRequest(validBody()), env);
    const duplicate = await handleRequest(submitRequest(validBody()), env);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error.code, "DUPLICATE_REPORT");
  });
  assert.equal(db.rows.length, 1);
});

test("제보할 때 이름 공개 동의를 함께 저장한다", async () => {
  const db = fakeDb();
  await withTurnstile(true, async () => {
    await handleRequest(submitRequest(validBody({ reporter: "홍길동", namePublic: true })), publicEnv(db));
    await handleRequest(
      submitRequest(validBody({ species: "쇠솔새", reporter: "김철수" })),
      publicEnv(db),
    );
  });
  const agreed = db.rows.find((r) => r.reporter === "홍길동");
  const notAgreed = db.rows.find((r) => r.reporter === "김철수");
  assert.equal(agreed.name_public, 1);
  // 동의 항목을 보내지 않으면 비공개가 기본값이다.
  assert.equal(notAgreed.name_public, 0);
});

test("승인된 제보만, 종과 공개 좌표만 내보낸다", async () => {
  const db = fakeDb([
    {
      id: "a",
      status: "approved",
      species: "큰덤불해오라기 · 붉은등때까치",
      lat: 37.56,
      lon: 126.89,
      public_lat: null,
      public_lon: null,
      spot_key: null,
      received_at: "2026-09-19T00:00:00Z",
      reporter: "홍길동",
      name_public: 0,
      note: "메모",
      observed_on: "2026-09-19",
    },
    {
      id: "b",
      status: "pending",
      species: "동박새",
      lat: 37.5,
      lon: 126.8,
      spot_key: null,
      received_at: "2026-09-19T01:00:00Z",
    },
    {
      id: "c",
      status: "approved",
      species: "쇠솔새",
      lat: 37.4,
      lon: 126.7,
      spot_key: "a",
      observed_on: "2026-09-18",
      received_at: "2026-09-19T02:00:00Z",
    },
  ]);
  const response = await handleRequest(approvedRequest(), publicEnv(db));
  const body = await response.json();
  assert.equal(body.spots.length, 1);
  assert.equal(body.spots[0].id, "a");
  assert.equal(body.spots[0].lat, 37.56);
  assert.equal(body.spots[0].lon, 126.89);
  // 연결된 제보의 종이 더해지되 기존 종은 그대로다.
  assert.deepEqual(body.spots[0].species, ["큰덤불해오라기", "붉은등때까치", "쇠솔새"]);
  // 승인 대기 건은 이력에도 들어가지 않는다.
  assert.deepEqual(body.spots[0].history.map((h) => h.id), ["a", "c"]);
  // 이름 미동의·설명·관리자 메모는 어디에도 없다.
  assert.equal(JSON.stringify(body).includes("홍길동"), false);
  assert.equal(JSON.stringify(body).includes("메모"), false);
});

test("공개 Worker 에는 승인 기능이 없다", async () => {
  const db = fakeDb([
    { id: "a", status: "pending", species: "동박새", lat: 37.5, lon: 126.8, merged_into: null, received_at: "2026-09-19T00:00:00Z" },
  ]);
  for (const path of ["/admin", "/admin/api/reports", "/reports/a/approve"]) {
    const response = await handleRequest(
      new Request(`https://reports.example${path}`, { method: "POST", headers: ORIGIN, body: "{}" }),
      publicEnv(db),
    );
    assert.equal(response.status, 404, path);
  }
  assert.equal(db.rows[0].status, "pending");
});

test("허용하지 않은 메서드를 막는다", async () => {
  const response = await handleRequest(
    new Request("https://reports.example/reports", { method: "DELETE", headers: ORIGIN }),
    publicEnv(fakeDb()),
  );
  assert.equal(response.status, 405);
});

test("본문이 너무 크면 거부한다", async () => {
  const response = await handleRequest(
    submitRequest(validBody({ note: "가".repeat(5000) })),
    publicEnv(fakeDb()),
  );
  assert.equal(response.status, 413);
});

/* ── 승인 전 황색 마커 ──────────────────────────────────────────────── */

function pendingListRequest() {
  return new Request("https://reports.example/reports/pending", { headers: ORIGIN });
}

test("접수하면 대략 좌표를 만들어 저장하고 실제 좌표는 공개하지 않는다", async () => {
  const db = fakeDb();
  const response = await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody()), publicEnv(db)),
  );
  const body = await response.json();
  assert.equal(body.publicVisibility, "approximate");
  assert.equal(body.spot.approximate, true);

  const row = db.rows[0];
  assert.equal(row.pending_public, 1);
  assert.notEqual(row.approx_lat, row.lat);
  assert.notEqual(row.approx_lon, row.lon);
  // 응답에도 실제 좌표는 들어가지 않는다.
  assert.equal(body.spot.lat, row.approx_lat);
  assert.equal(body.spot.lon, row.approx_lon);
  assert.equal(JSON.stringify(body).includes(String(row.lat)), false);

  // 실제 지점에서 1.5km 이상 떨어져 있다.
  const meters = Math.hypot(
    (row.approx_lat - row.lat) * 111320,
    (row.approx_lon - row.lon) * 111320 * Math.cos((row.lat * Math.PI) / 180),
  );
  assert.ok(meters >= 1400 && meters <= 4700, `거리 ${meters}m`);
});

test("둥지·번식 제보와 보호종은 승인 전 공개를 보류한다", async () => {
  for (const body of [
    validBody({ note: "둥지를 확인했습니다" }),
    validBody({ species: "저어새" }),
  ]) {
    const db = fakeDb();
    const response = await withTurnstile(true, () =>
      handleRequest(submitRequest(body), publicEnv(db)),
    );
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.publicVisibility, "withheld");
    assert.equal(payload.spot, undefined);
    assert.equal(db.rows[0].pending_public, 0);
  }
});

test("대기 목록은 공개가 허용된 대기 제보만 내보낸다", async () => {
  const db = fakeDb([
    // 이 기능 이전에 쌓인 대기 제보. pending_public 기본값 0 이라 공개되지 않는다.
    { id: "old-pending", species: "흰물떼새", lat: 37.1, lon: 126.4 },
    // 공개가 허용된 대기 제보.
    {
      id: "new-pending",
      species: "넓적부리도요",
      lat: 37.2,
      lon: 126.5,
      approx_lat: 37.23,
      approx_lon: 126.53,
      pending_public: 1,
      reporter: "홍길동",
      note: "관찰 메모",
      bird_count: 3,
    },
    // 승인된 제보는 대기 목록에 섞이지 않는다.
    {
      id: "approved-one",
      status: "approved",
      species: "저어새",
      lat: 37.3,
      lon: 126.6,
      pending_public: 1,
    },
  ]);
  const response = await handleRequest(pendingListRequest(), publicEnv(db));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.spots.map((spot) => spot.id), ["new-pending"]);

  const spot = body.spots[0];
  assert.equal(spot.status, "pending");
  assert.equal(spot.approximate, true);
  assert.equal(spot.lat, 37.23);
  assert.deepEqual(spot.species, ["넓적부리도요"]);

  // 실제 좌표·제보자·개체수·메모는 어떤 경우에도 나가지 않는다.
  const raw = JSON.stringify(body);
  for (const secret of ["37.2,", "126.5,", "홍길동", "관찰 메모", "3"]) {
    if (secret === "3") continue;
    assert.equal(raw.includes(secret), false, secret);
  }
  assert.equal(raw.includes("bird_count"), false);
});

test("승인된 제보 목록에는 대기 제보가 섞이지 않는다", async () => {
  const db = fakeDb([
    { id: "new-pending", species: "넓적부리도요", lat: 37.2, lon: 126.5, approx_lat: 37.23, approx_lon: 126.53, pending_public: 1 },
    { id: "approved-one", status: "approved", species: "저어새", lat: 37.3, lon: 126.6 },
  ]);
  const response = await handleRequest(approvedRequest(), publicEnv(db));
  const body = await response.json();
  assert.deepEqual(body.spots.map((spot) => spot.id), ["approved-one"]);
});

test("제보자는 접수 번호로 상태만 확인한다", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = fakeDb([
    { id, species: "넓적부리도요", lat: 37.2, lon: 126.5, reporter: "홍길동", pending_public: 0 },
  ]);
  const response = await handleRequest(
    new Request(`https://reports.example/reports/${id}/status`, { headers: ORIGIN }),
    publicEnv(db),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "pending");
  assert.equal(body.publicVisibility, "withheld");
  const raw = JSON.stringify(body);
  assert.equal(raw.includes("홍길동"), false);
  assert.equal(raw.includes("넓적부리도요"), false);
  assert.equal(raw.includes("37.2"), false);

  const missing = await handleRequest(
    new Request("https://reports.example/reports/22222222-2222-4222-8222-222222222222/status", { headers: ORIGIN }),
    publicEnv(fakeDb()),
  );
  assert.equal(missing.status, 404);
});

test("공개 Worker 에는 승인 기능이 없다", async () => {
  const db = fakeDb([{ id: "new-pending", species: "저어새", lat: 37.2, lon: 126.5, pending_public: 1 }]);
  const response = await handleRequest(
    new Request("https://reports.example/reports/pending", {
      method: "POST",
      headers: { ...ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    }),
    publicEnv(db),
  );
  assert.equal(response.status, 405);
  assert.equal(db.rows[0].status, "pending");
});
