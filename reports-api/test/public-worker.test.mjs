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
      merged_into: null,
      received_at: "2026-09-19T00:00:00Z",
      reporter: "홍길동",
      note: "메모",
      observed_on: "2026-09-19",
    },
    {
      id: "b",
      status: "pending",
      species: "동박새",
      lat: 37.5,
      lon: 126.8,
      merged_into: null,
      received_at: "2026-09-19T01:00:00Z",
    },
    {
      id: "c",
      status: "approved",
      species: "쇠솔새",
      lat: 37.4,
      lon: 126.7,
      merged_into: "a",
      received_at: "2026-09-19T02:00:00Z",
    },
  ]);
  const response = await handleRequest(approvedRequest(), publicEnv(db));
  const body = await response.json();
  assert.deepEqual(body.spots, [
    {
      id: "a",
      lat: 37.56,
      lon: 126.89,
      species: ["큰덤불해오라기", "붉은등때까치"],
    },
  ]);
  assert.equal(JSON.stringify(body).includes("홍길동"), false);
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
