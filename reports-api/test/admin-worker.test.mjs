import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/admin.js";
import { verifyAccessJwt } from "../src/shared.js";
import { fakeDb } from "./helpers.mjs";

const TEAM = "birdmap";
const AUD = "aud-tag";
const ADMIN = "owner@example.com";

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

// 실제 RS256 키로 서명한 JWT 를 만들어 Worker 의 검증 경로를 그대로 지나가게 한다.
async function accessFixture() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = "test-kid";

  async function sign(payload, header = {}) {
    const head = base64Url(JSON.stringify({ alg: "RS256", kid, ...header }));
    const body = base64Url(JSON.stringify(payload));
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(`${head}.${body}`),
    );
    return `${head}.${body}.${base64Url(new Uint8Array(signature))}`;
  }

  const jwksFetch = async () =>
    new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256" }] }));

  function claims(overrides = {}) {
    return {
      iss: `https://${TEAM}.cloudflareaccess.com`,
      aud: [AUD],
      email: ADMIN,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...overrides,
    };
  }

  return { sign, jwksFetch, claims };
}

function adminEnv(db, overrides = {}) {
  return {
    ENVIRONMENT: "production",
    REPORTS_DB: db,
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ADMIN_EMAILS: ADMIN,
    ...overrides,
  };
}

function adminRequest(path, token, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (token) headers["Cf-Access-Jwt-Assertion"] = token;
  return new Request(`https://admin.example${path}`, { ...init, headers });
}

function pendingRow(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "pending",
    species: "동박새",
    lat: 37.5,
    lon: 126.8,
    public_lat: null,
    public_lon: null,
    observed_on: "2026-09-19",
    received_at: "2026-09-19T00:00:00Z",
    decided_at: null,
    bird_count: null,
    reporter: null,
    note: null,
    admin_note: null,
    site_id: null,
    merged_into: null,
    ip_hash: "hash",
    dedupe_hash: "dedupe-1",
    ...overrides,
  };
}

async function withJwks(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("토큰이 없으면 관리자 화면도 API 도 열리지 않는다", async () => {
  const db = fakeDb([pendingRow()]);
  for (const path of ["/", "/admin", "/admin/api/reports"]) {
    const response = await handleRequest(adminRequest(path), adminEnv(db));
    assert.equal(response.status, 403, path);
    assert.equal((await response.json()).error.code, "ADMIN_FORBIDDEN");
  }
});

test("일반 사용자가 승인 API 를 불러도 상태가 바뀌지 않는다", async () => {
  const db = fakeDb([pendingRow()]);
  const response = await handleRequest(
    adminRequest(`/admin/api/reports/${db.rows[0].id}`, null, {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    }),
    adminEnv(db),
  );
  assert.equal(response.status, 403);
  assert.equal(db.rows[0].status, "pending");
});

test("설정이 비어 있으면 열리지 않고 503 으로 닫힌다", async () => {
  const db = fakeDb([pendingRow()]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, async () => {
    for (const missing of [{ ACCESS_AUD: "" }, { ACCESS_TEAM_DOMAIN: "" }, { ADMIN_EMAILS: "" }]) {
      const response = await handleRequest(
        adminRequest("/admin/api/reports", token),
        adminEnv(db, missing),
      );
      assert.equal(response.status, 503, JSON.stringify(missing));
      assert.equal((await response.json()).error.code, "NOT_CONFIGURED");
    }
  });
});

test("서명·발급자·대상·만료·허용 이메일을 모두 검사한다", async () => {
  const { sign, claims, jwksFetch } = await accessFixture();
  const options = { teamDomain: TEAM, aud: AUD, adminEmails: [ADMIN], fetchImpl: jwksFetch };

  await assert.doesNotReject(verifyAccessJwt(await sign(claims()), options));

  const rejects = { code: "ADMIN_FORBIDDEN" };
  await assert.rejects(verifyAccessJwt(await sign(claims({ aud: ["다른-앱"] })), options), rejects);
  await assert.rejects(
    verifyAccessJwt(await sign(claims({ iss: "https://evil.cloudflareaccess.com" })), options),
    rejects,
  );
  await assert.rejects(
    verifyAccessJwt(await sign(claims({ exp: Math.floor(Date.now() / 1000) - 10 })), options),
    rejects,
  );
  await assert.rejects(
    verifyAccessJwt(await sign(claims({ email: "stranger@example.com" })), options),
    rejects,
  );
  await assert.rejects(verifyAccessJwt("not.a.jwt", options), rejects);

  // 서명만 바꿔치기한 토큰도 통과하지 못한다.
  const parts = (await sign(claims())).split(".");
  const forged = `${parts[0]}.${parts[1]}.${base64Url(new Uint8Array(256))}`;
  await assert.rejects(verifyAccessJwt(forged, options), rejects);
});

test("관리자는 종명과 좌표를 고쳐 승인할 수 있다", async () => {
  const db = fakeDb([pendingRow()]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, async () => {
    const response = await handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({
          action: "approve",
          species: "동박새, 쇠솔새",
          lat: 37.51,
          lon: 126.81,
          publicLat: 37.52,
          publicLon: 126.82,
          adminNote: "번식지라 좌표를 옮김",
        }),
      }),
      adminEnv(db),
    );
    assert.equal(response.status, 200);
  });
  assert.equal(db.rows[0].status, "approved");
  assert.equal(db.rows[0].species, "동박새 · 쇠솔새");
  assert.equal(db.rows[0].public_lat, 37.52);
  assert.equal(db.rows[0].admin_note, "번식지라 좌표를 옮김");
});

// 과거 관찰 자료도 관리자 승인과 공개가 평소처럼 되어야 한다.
test("과거 관찰 자료도 관찰일 그대로 승인·공개된다", async () => {
  const db = fakeDb([pendingRow({ observed_on: "2017-05-03" })]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, async () => {
    const response = await handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "approve", siteId: "19" }),
      }),
      adminEnv(db),
    );
    assert.equal(response.status, 200);
  });
  assert.equal(db.rows[0].status, "approved");
  // 승인이 관찰일을 오늘로 덮지 않는다. 접수일도 그대로 남는다.
  assert.equal(db.rows[0].observed_on, "2017-05-03");
  assert.equal(db.rows[0].received_at, "2026-09-19T00:00:00Z");
  assert.equal(db.rows[0].site_id, "19");
  // 결정 시각만 새로 찍힌다(관찰일과 별개).
  assert.ok(db.rows[0].decided_at, "승인 시각은 기록된다");
  assert.notEqual(String(db.rows[0].decided_at).slice(0, 10), db.rows[0].observed_on);
});

test("관리자가 관찰일을 과거로 고쳐 승인할 수 있다", async () => {
  const db = fakeDb([pendingRow()]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, async () => {
    const response = await handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "approve", observedOn: "2020-01-01" }),
      }),
      adminEnv(db),
    );
    assert.equal(response.status, 200);
  });
  assert.equal(db.rows[0].observed_on, "2020-01-01");

  // 미래 날짜는 관리자도 넣을 수 없다.
  const future = fakeDb([pendingRow()]);
  await withJwks(jwksFetch, async () => {
    const response = await handleRequest(
      adminRequest(`/admin/api/reports/${future.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "approve", observedOn: "2099-01-01" }),
      }),
      adminEnv(future),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "OBSERVED_ON_FUTURE");
  });
  assert.equal(future.rows[0].status, "pending", "거부되면 상태도 그대로다");
});

test("공개 취소는 그 제보만 대기로 되돌린다", async () => {
  const other = pendingRow({ id: "22222222-2222-4222-8222-222222222222", status: "approved", species: "개개비", dedupe_hash: "dedupe-2" });
  const db = fakeDb([pendingRow({ status: "approved" }), other]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, () =>
    handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "unpublish" }),
      }),
      adminEnv(db),
    ),
  );
  assert.equal(db.rows[0].status, "pending");
  assert.equal(db.rows[1].status, "approved");
  assert.equal(db.rows[1].species, "개개비");
});

test("기존 지점에 연결해도 원본 종 목록을 고쳐 쓰지 않는다", async () => {
  const target = pendingRow({
    id: "33333333-3333-4333-8333-333333333333",
    status: "approved",
    species: "동박새 · 큰유리새",
    dedupe_hash: "dedupe-3",
  });
  const incoming = pendingRow({
    id: "44444444-4444-4444-8444-444444444444",
    species: "쇠솔새 · 동박새",
    dedupe_hash: "dedupe-4",
  });
  const db = fakeDb([target, incoming]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, () =>
    handleRequest(
      adminRequest(`/admin/api/reports/${incoming.id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "link", spotKey: target.id }),
      }),
      adminEnv(db),
    ),
  );
  const rows = db.rows;
  const saved = rows.find((r) => r.id === target.id);
  const linked = rows.find((r) => r.id === incoming.id);
  // 대상 지점의 종 목록은 한 글자도 바뀌지 않는다.
  assert.equal(saved.species, "동박새 · 큰유리새");
  // 연결된 제보도 자기 종을 그대로 유지하고 고유 ID 로 남는다.
  assert.equal(linked.species, "쇠솔새 · 동박새");
  assert.equal(linked.spot_key, target.id);
  assert.equal(linked.status, "approved");
});

test("수동 붉은 점 키에도 연결할 수 있고 형식을 검사한다", async () => {
  const db = fakeDb([pendingRow()]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, async () => {
    const bad = await handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "link", spotKey: "아무거나" }),
      }),
      adminEnv(db),
    );
    assert.equal(bad.status, 400);
    const good = await handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "link", spotKey: "fixed:21:0" }),
      }),
      adminEnv(db),
    );
    assert.equal(good.status, 200);
  });
  assert.equal(db.rows[0].spot_key, "fixed:21:0");
});

test("이름 공개 철회는 제보를 지우지 않고 공개만 거둔다", async () => {
  const db = fakeDb([pendingRow({ status: "approved", reporter: "홍길동", name_public: 1 })]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  await withJwks(jwksFetch, () =>
    handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "consent", namePublic: false }),
      }),
      adminEnv(db),
    ),
  );
  assert.equal(db.rows[0].name_public, 0);
  assert.equal(db.rows[0].reporter, "홍길동", "이름은 비공개로 보존된다");
  assert.equal(db.rows[0].status, "approved");
});

test("종별 이력 조회는 부분 일치로 다른 종을 끌어오지 않는다", async () => {
  const db = fakeDb([
    pendingRow({ id: "55555555-5555-4555-8555-555555555555", species: "동박새 · 쇠솔새", dedupe_hash: "d5" }),
    pendingRow({ id: "66666666-6666-4666-8666-666666666666", species: "한국동박새", dedupe_hash: "d6" }),
  ]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  const response = await withJwks(jwksFetch, () =>
    handleRequest(
      adminRequest("/admin/api/reports?species=" + encodeURIComponent("동박새"), token),
      adminEnv(db),
    ),
  );
  const body = await response.json();
  assert.equal(body.reports.length, 1);
  assert.equal(body.reports[0].species, "동박새 · 쇠솔새");
});

test("모르는 처리 이름은 거부한다", async () => {
  const db = fakeDb([pendingRow()]);
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  const response = await withJwks(jwksFetch, () =>
    handleRequest(
      adminRequest(`/admin/api/reports/${db.rows[0].id}`, token, {
        method: "POST",
        body: JSON.stringify({ action: "delete-everything" }),
      }),
      adminEnv(db),
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(db.rows[0].status, "pending");
});

/* ── 승인 전 황색 마커 공개 ─────────────────────────────────────────── */

async function actAsAdmin(db, id, payload) {
  const { sign, claims, jwksFetch } = await accessFixture();
  const token = await sign(claims());
  return withJwks(jwksFetch, () =>
    handleRequest(
      adminRequest(`/admin/api/reports/${id}`, token, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      adminEnv(db),
    ),
  );
}

test("공개 취소하면 황색 마커로도 다시 올라오지 않는다", async () => {
  const db = fakeDb([pendingRow({ status: "approved", pending_public: 1 })]);
  const response = await actAsAdmin(db, db.rows[0].id, { action: "unpublish" });
  assert.equal(response.status, 200);
  assert.equal(db.rows[0].status, "pending");
  // 대기로 돌아가도 공개 플래그가 내려가 있어야 황색 마커로 되살아나지 않는다.
  assert.equal(db.rows[0].pending_public, 0);
});

test("반려하면 황색 마커 공개도 함께 꺼진다", async () => {
  const db = fakeDb([pendingRow({ pending_public: 1 })]);
  const response = await actAsAdmin(db, db.rows[0].id, { action: "reject" });
  assert.equal(response.status, 200);
  assert.equal(db.rows[0].status, "rejected");
  assert.equal(db.rows[0].pending_public, 0);
});

test("관리자는 대기 제보의 황색 공개를 켜고 끌 수 있다", async () => {
  const db = fakeDb([pendingRow()]);
  const id = db.rows[0].id;

  const open = await actAsAdmin(db, id, { action: "visibility", public: true });
  assert.equal(open.status, 200);
  assert.equal(db.rows[0].pending_public, 1);
  assert.equal(db.rows[0].status, "pending");
  // 대략 좌표가 없던 기존 자료라도 켤 때 한 번 만들어 둔다.
  assert.ok(Number.isFinite(db.rows[0].approx_lat));
  assert.notEqual(db.rows[0].approx_lat, db.rows[0].lat);

  const close = await actAsAdmin(db, id, { action: "visibility", public: false });
  assert.equal(close.status, 200);
  assert.equal(db.rows[0].pending_public, 0);
});

test("승인된 제보는 황색 마커로 되돌릴 수 없다", async () => {
  const db = fakeDb([pendingRow({ status: "approved" })]);
  const response = await actAsAdmin(db, db.rows[0].id, {
    action: "visibility",
    public: true,
  });
  assert.equal(response.status, 400);
  assert.equal(db.rows[0].pending_public, 0);
});

test("관리자가 아니면 황색 공개도 바꿀 수 없다", async () => {
  const db = fakeDb([pendingRow()]);
  const response = await handleRequest(
    adminRequest(`/admin/api/reports/${db.rows[0].id}`, null, {
      method: "POST",
      body: JSON.stringify({ action: "visibility", public: true }),
    }),
    adminEnv(db),
  );
  assert.equal(response.status, 403);
  assert.equal(db.rows[0].pending_public, 0);
});

/* ── 탐조 지역 지정 ─────────────────────────────────────────────────── */

test("관리자는 승인된 제보의 탐조 지역만 따로 지정·해제한다", async () => {
  const db = fakeDb([pendingRow({ status: "approved", lat: 37.5, lon: 126.8 })]);
  const id = db.rows[0].id;

  const set = await actAsAdmin(db, id, { action: "site", siteId: "19" });
  assert.equal(set.status, 200);
  assert.equal(db.rows[0].site_id, "19");
  // 승인 상태·좌표·종·spot_key 는 그대로다.
  assert.equal(db.rows[0].status, "approved");
  assert.equal(db.rows[0].lat, 37.5);
  assert.equal(db.rows[0].lon, 126.8);
  assert.equal(db.rows[0].species, "동박새");
  assert.equal(db.rows[0].spot_key, null);

  const clear = await actAsAdmin(db, id, { action: "site", siteId: "" });
  assert.equal(clear.status, 200);
  assert.equal(db.rows[0].site_id, null);
  assert.equal(db.rows[0].status, "approved");
});

test("탐조 지역 ID 형식이 아니면 저장하지 않는다", async () => {
  const db = fakeDb([pendingRow({ status: "approved" })]);
  const response = await actAsAdmin(db, db.rows[0].id, {
    action: "site",
    siteId: "19; DROP TABLE reports",
  });
  assert.equal(response.status, 400);
  assert.equal(db.rows[0].site_id, null);
});

test("관리자가 아니면 탐조 지역도 바꿀 수 없다", async () => {
  const db = fakeDb([pendingRow({ status: "approved" })]);
  const response = await handleRequest(
    adminRequest(`/admin/api/reports/${db.rows[0].id}`, null, {
      method: "POST",
      body: JSON.stringify({ action: "site", siteId: "19" }),
    }),
    adminEnv(db),
  );
  assert.equal(response.status, 403);
  assert.equal(db.rows[0].site_id, null);
});
