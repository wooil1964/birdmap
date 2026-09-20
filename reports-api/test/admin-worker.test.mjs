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

test("기존 지점에 합쳐도 기존 출현종은 남는다", async () => {
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
        body: JSON.stringify({ action: "merge", targetId: target.id }),
      }),
      adminEnv(db),
    ),
  );
  // 기존 종은 그대로 두고 없는 종만 덧붙인다.
  assert.equal(db.rows[0].species, "동박새 · 큰유리새 · 쇠솔새");
  assert.equal(db.rows[1].merged_into, target.id);
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
