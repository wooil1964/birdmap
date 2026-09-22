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

/* ── 탐조지별 출현 이력 ─────────────────────────────────────────────── */

function siteRequest(siteId, query = "") {
  return new Request(`https://reports.example/reports/site/${siteId}${query}`, {
    headers: ORIGIN,
  });
}

function siteRows() {
  return [
    // 같은 탐조지(19), 서로 다른 좌표
    { id: "s19-a", status: "approved", site_id: "19", species: "넓적부리도요", lat: 36.001, lon: 126.601, observed_on: "2026-09-21", received_at: "2026-09-21T01:00:00Z", reporter: "홍길동", name_public: 1, dedupe_hash: "d1" },
    { id: "s19-b", status: "approved", site_id: "19", species: "저어새 · 알락꼬리마도요", lat: 36.050, lon: 126.650, observed_on: "2026-09-20", received_at: "2026-09-20T01:00:00Z", reporter: "비공개희망", name_public: 0, dedupe_hash: "d2" },
    // 같은 날짜 두 건(정렬 안정성 확인)
    { id: "s19-c", status: "approved", site_id: "19", species: "청다리도요사촌", lat: 36.060, lon: 126.660, observed_on: "2026-09-21", received_at: "2026-09-21T00:00:00Z", dedupe_hash: "d3" },
    // 다른 탐조지
    { id: "s21-a", status: "approved", site_id: "21", species: "고대갈매기", lat: 35.85, lon: 126.67, observed_on: "2026-09-19", dedupe_hash: "d4" },
    // 승인 대기 / 반려 / 지역 미연결
    { id: "p19", status: "pending", site_id: "19", species: "흰물떼새", lat: 36.01, lon: 126.61, pending_public: 1, dedupe_hash: "d5" },
    { id: "r19", status: "rejected", site_id: "19", species: "장다리물떼새", lat: 36.02, lon: 126.62, dedupe_hash: "d6" },
    { id: "free", status: "approved", species: "쇠제비갈매기", lat: 36.03, lon: 126.63, observed_on: "2026-09-18", dedupe_hash: "d7" },
  ];
}

test("탐조지별 이력은 그 지역에 연결된 승인 제보만 최신순으로 준다", async () => {
  const db = fakeDb(siteRows());
  const response = await handleRequest(siteRequest("19"), publicEnv(db));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.siteId, "19");
  assert.equal(body.total, 3);
  // 관찰일 최신순, 같은 날짜는 접수 시각 역순으로 고정된다.
  assert.deepEqual(body.history.map((h) => h.id), ["s19-a", "s19-c", "s19-b"]);
  assert.deepEqual(body.history[0].species, ["넓적부리도요"]);
  assert.deepEqual(body.history[2].species, ["저어새", "알락꼬리마도요"]);

  // 다른 지역·대기·반려·미연결 제보는 섞이지 않는다.
  const ids = body.history.map((h) => h.id).join(",");
  for (const excluded of ["s21-a", "p19", "r19", "free"]) {
    assert.equal(ids.includes(excluded), false, excluded);
  }
});

/* ── 과거 관찰 자료 접수 ──────────────────────────────────────────────
   지도가 지난 탐조 자료도 쌓는 곳이라 관찰일에 과거 방향 제한을 두지 않는다.
   미래·없는 날짜는 계속 막고, 관찰일과 접수일은 따로 남는다. */

test("2017년 관찰 자료를 실제 날짜 그대로 접수한다", async () => {
  const db = fakeDb();
  const response = await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody({ observedOn: "2017-05-03" })), publicEnv(db)),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ok, true);
  const row = db.rows[0];
  assert.equal(row.observed_on, "2017-05-03", "관찰일을 오늘로 바꾸면 안 된다");
  // 접수일은 오늘이고 관찰일과 섞이지 않는다.
  assert.equal(String(row.received_at).slice(0, 4), String(new Date().getUTCFullYear()));
  assert.notEqual(String(row.received_at).slice(0, 10), row.observed_on);
  // 승인 전이므로 공개되지 않는다.
  assert.equal(row.status, "pending");
});

test("2020년 관찰 자료도 접수된다", async () => {
  const db = fakeDb();
  const response = await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody({ observedOn: "2020-01-01" })), publicEnv(db)),
  );
  assert.equal(response.status, 201);
  assert.equal(db.rows[0].observed_on, "2020-01-01");
});

test("오늘 관찰 자료도 그대로 접수된다", async () => {
  const db = fakeDb();
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody({ observedOn: today })), publicEnv(db)),
  );
  assert.equal(response.status, 201);
  assert.equal(db.rows[0].observed_on, today);
});

test("미래 날짜는 계속 거부한다", async () => {
  const db = fakeDb();
  const future = new Date(Date.now() + 9 * 60 * 60 * 1000 + 3 * 86400000)
    .toISOString().slice(0, 10);
  const response = await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody({ observedOn: future })), publicEnv(db)),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "OBSERVED_ON_FUTURE");
  assert.equal(db.rows.length, 0, "거부한 제보는 저장되지 않는다");
});

test("없는 날짜는 계속 거부한다", async () => {
  for (const bad of ["2017-02-29", "2017-13-01", "2017-00-10", "2017-5-3"]) {
    const db = fakeDb();
    const response = await withTurnstile(true, () =>
      handleRequest(submitRequest(validBody({ observedOn: bad })), publicEnv(db)),
    );
    assert.equal(response.status, 400, bad);
    assert.equal(db.rows.length, 0, bad);
  }
  // 윤년의 실제 날짜는 받는다.
  const leap = fakeDb();
  const ok = await withTurnstile(true, () =>
    handleRequest(submitRequest(validBody({ observedOn: "2020-02-29" })), publicEnv(leap)),
  );
  assert.equal(ok.status, 201);
  assert.equal(leap.rows[0].observed_on, "2020-02-29");
});

test("과거 자료를 넣어도 최근 출현이 뒤로 밀리지 않는다", async () => {
  // 나중에 접수했지만 관찰일은 2017년인 자료를 섞는다.
  const rows = siteRows().concat([
    {
      id: "old-2017", status: "approved", species: "재두루미",
      lat: 36.0, lon: 126.6, site_id: "19",
      observed_on: "2017-05-03",
      received_at: "2026-09-22T00:00:00.000Z", // 접수는 가장 최근
    },
  ]);
  const db = fakeDb(rows);
  const body = await (await handleRequest(siteRequest("19"), publicEnv(db))).json();
  assert.equal(body.total, 4);
  // 관찰일 최신순이라 과거 자료는 맨 뒤다. 접수일이 최신이어도 앞으로 오지 않는다.
  assert.deepEqual(body.history.map((h) => h.id), ["s19-a", "s19-c", "s19-b", "old-2017"]);
  assert.equal(body.history[body.history.length - 1].date, "2017-05-03");
  // 날짜는 내림차순이다.
  const dates = body.history.map((h) => h.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("과거 자료가 섞여도 '더 보기' 페이지가 어긋나지 않는다", async () => {
  const rows = siteRows().concat([
    { id: "old-2017", status: "approved", species: "재두루미", lat: 36, lon: 126.6,
      site_id: "19", observed_on: "2017-05-03", received_at: "2026-09-22T00:00:00.000Z" },
    { id: "old-2020", status: "approved", species: "흑두루미", lat: 36, lon: 126.6,
      site_id: "19", observed_on: "2020-01-01", received_at: "2026-09-22T00:00:01.000Z" },
  ]);
  const db = fakeDb(rows);
  const page1 = await (await handleRequest(siteRequest("19", "?limit=2&offset=0"), publicEnv(db))).json();
  const page2 = await (await handleRequest(siteRequest("19", "?limit=2&offset=2"), publicEnv(db))).json();
  const page3 = await (await handleRequest(siteRequest("19", "?limit=2&offset=4"), publicEnv(db))).json();
  assert.equal(page1.total, 5);
  assert.equal(page3.total, 5);
  const all = [...page1.history, ...page2.history, ...page3.history].map((h) => h.id);
  assert.equal(new Set(all).size, all.length, "겹치는 항목이 없어야 한다");
  assert.deepEqual(all, ["s19-a", "s19-c", "s19-b", "old-2020", "old-2017"]);
});

// 건수와 목록을 한 질의로 받게 바꾼 뒤에도 total 과 정렬이 예전과 같아야 한다.
test("limit 으로 잘라 받아도 total 은 전체 건수를 준다", async () => {
  const db = fakeDb(siteRows());
  const response = await handleRequest(siteRequest("19", "?limit=2&offset=0"), publicEnv(db));
  const body = await response.json();
  assert.equal(body.total, 3, "잘라 받아도 전체 건수는 3");
  assert.equal(body.limit, 2);
  assert.equal(body.history.length, 2);
  assert.deepEqual(body.history.map((h) => h.id), ["s19-a", "s19-c"]);
});

test("이어받기(offset)도 같은 순서로 나머지를 준다", async () => {
  const db = fakeDb(siteRows());
  const first = await (await handleRequest(siteRequest("19", "?limit=2&offset=0"), publicEnv(db))).json();
  const next = await (await handleRequest(siteRequest("19", "?limit=2&offset=2"), publicEnv(db))).json();
  assert.equal(next.total, 3);
  assert.equal(next.offset, 2);
  assert.deepEqual(next.history.map((h) => h.id), ["s19-b"]);
  // 두 페이지를 이으면 한 번에 받았을 때와 같다(겹치거나 빠지지 않는다).
  const joined = first.history.concat(next.history).map((h) => h.id);
  assert.deepEqual(joined, ["s19-a", "s19-c", "s19-b"]);
});

test("offset 이 끝을 넘어가도 total 은 그대로 준다", async () => {
  const db = fakeDb(siteRows());
  const body = await (await handleRequest(siteRequest("19", "?limit=5&offset=10"), publicEnv(db))).json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.history, []);
  assert.equal(body.total, 3, "빈 페이지에서도 전체 건수를 알려 줘야 '더 보기'가 어긋나지 않는다");
});

test("이력 응답에 내부 집계 열이 새지 않는다", async () => {
  const db = fakeDb(siteRows());
  const body = await (await handleRequest(siteRequest("19"), publicEnv(db))).json();
  assert.equal(JSON.stringify(body).includes("total_count"), false);
  // 각 항목은 예전과 같은 열만 갖는다.
  for (const entry of body.history) {
    const keys = Object.keys(entry).sort();
    assert.deepEqual(
      keys.filter((k) => !["id", "date", "species", "reporter"].includes(k)),
      [],
      `예상 밖 항목: ${keys.join(",")}`,
    );
  }
});

test("이력 응답은 60초 캐시를 그대로 알린다", async () => {
  const db = fakeDb(siteRows());
  const response = await handleRequest(siteRequest("19"), publicEnv(db));
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
});

test("탐조지별 이력에는 좌표와 비공개 항목이 들어가지 않는다", async () => {
  const db = fakeDb(siteRows());
  const response = await handleRequest(siteRequest("19"), publicEnv(db));
  const raw = JSON.stringify(await response.json());
  for (const secret of ["36.001", "126.601", "36.05", "lat", "lon", "ip_hash", "admin_note", "비공개희망"]) {
    assert.equal(raw.includes(secret), false, secret);
  }
  // 원본 행의 좌표는 그대로 남아 있다(지역 연결이 좌표를 바꾸지 않는다).
  const row = db.rows.find((r) => r.id === "s19-a");
  assert.equal(row.lat, 36.001);
  assert.equal(row.lon, 126.601);
});

test("이름 공개 동의만 제보자 이름을 내보낸다", async () => {
  const db = fakeDb(siteRows());
  const body = await (await handleRequest(siteRequest("19"), publicEnv(db))).json();
  const byId = Object.fromEntries(body.history.map((h) => [h.id, h]));
  assert.equal(byId["s19-a"].reporter, "홍길동");
  assert.equal(byId["s19-b"].reporter, undefined);
  assert.equal(byId["s19-c"].reporter, undefined);
});

test("필요한 범위만 조회한다(limit·offset)", async () => {
  const db = fakeDb(siteRows());
  const first = await (await handleRequest(siteRequest("19", "?limit=2"), publicEnv(db))).json();
  assert.equal(first.history.length, 2);
  assert.equal(first.total, 3);
  assert.deepEqual(first.history.map((h) => h.id), ["s19-a", "s19-c"]);

  const second = await (
    await handleRequest(siteRequest("19", "?limit=2&offset=2"), publicEnv(db))
  ).json();
  assert.deepEqual(second.history.map((h) => h.id), ["s19-b"]);

  // 상한을 넘겨도 최대 50건까지만 준다.
  const capped = await (await handleRequest(siteRequest("19", "?limit=999"), publicEnv(db))).json();
  assert.equal(capped.limit, 50);
});

test("이력이 없는 탐조지는 빈 배열을 준다", async () => {
  const db = fakeDb(siteRows());
  const body = await (await handleRequest(siteRequest("999"), publicEnv(db))).json();
  assert.equal(body.total, 0);
  assert.deepEqual(body.history, []);
});

test("탐조지 ID 형식이 아니면 거부한다", async () => {
  const db = fakeDb(siteRows());
  const response = await handleRequest(siteRequest("19%20OR%201=1"), publicEnv(db));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "SITE_ID_INVALID");
});
