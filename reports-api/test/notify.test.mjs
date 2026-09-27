// 새 제보 관리자 메일 알림. 정본(dual-write) 접수 경로를 실제 스키마(schema.sql + 0001 + 0003)로 돌린다.
// 외부 호출은 모두 가짜다(Resend·Turnstile·Access). 운영 D1·메일은 건드리지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { environments, installAuthStubs, input, post, adminPost } from "../local-test/helpers.mjs";
import { emailText } from "../src/notify.js";

const DDL = ["../schema.sql", "../../docs/long-term-db-phase2a/migrations/0001_core.sql", "../../docs/long-term-db-phase2d1/migrations/0003_captcha_redemptions.sql"]
  .map((p) => readFileSync(new URL(p, import.meta.url), "utf8")).join("\n");

// D1 모양의 SQLite 대역. batch 는 D1 처럼 한 트랜잭션으로 묶는다.
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  const prepare = (sql) => {
    let params = [];
    const s = {
      bind(...v) { params = v; return s; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async first() { return db.prepare(sql).get(...params) ?? null; },
      async run() { db.prepare(sql).run(...params); return { success: true }; },
    };
    return s;
  };
  return {
    prepare,
    async batch(list) {
      db.exec("BEGIN");
      try { for (const s of list) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      return [];
    },
    count: (sql) => db.prepare(sql).get().n,
  };
}

const RESEND = "https://api.resend.com/emails";
async function setup(resendResponse = () => Response.json({ id: "email-1" })) {
  const auth = await installAuthStubs();
  const authFetch = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => {
    if (String(url) === RESEND) { sent.push({ headers: options.headers, body: JSON.parse(options.body) }); return resendResponse(); }
    return authFetch(url, options);
  };
  const db = d1(), { pub, admin } = environments(db);
  Object.assign(pub, { RESEND_API_KEY: "test-key", NOTIFY_EMAIL_TO: "admin@example.test", NOTIFY_EMAIL_FROM: "bot@example.test", ADMIN_PAGE_URL: "https://admin.example/admin" });
  return { db, pub, admin, sent, token: auth.token, restore: auth.restore };
}
const pendingCount = (db) => db.count("SELECT COUNT(*) AS n FROM reports WHERE status='pending'");

test("신규 제보는 저장 뒤 관리자 메일을 1회 보내고, 같은 요청 재전송은 다시 보내지 않는다", async (t) => {
  const s = await setup(); t.after(s.restore);
  const body = input(1, { species: "큰노랑발도요", note: "갯벌 가장자리" });
  const first = await post(s.pub, body);
  assert.equal(first.status, 201);
  assert.equal(pendingCount(s.db), 1);
  assert.equal(s.sent.length, 1);
  const mail = s.sent[0];
  assert.equal(mail.body.subject, "[들뫼 탐조지도] 새 출현종 제보가 접수되었습니다");
  assert.deepEqual(mail.body.to, ["admin@example.test"]);
  assert.equal(mail.headers["Idempotency-Key"], "new-report/" + body.request_id);
  for (const part of ["종명: 큰노랑발도요", "관찰일: 2026-09-20", "제보자: 합성테스터", "설명: 갯벌 가장자리", "상태: 승인 대기", "[제보 확인하기] https://admin.example/admin"])
    assert.ok(mail.body.text.includes(part), part);

  const again = await post(s.pub, body); // 네트워크 재시도: 같은 request_id
  assert.equal(again.status, 201);
  assert.equal(pendingCount(s.db), 1);
  assert.equal(s.sent.length, 1);
});

test("같은 제보가 동시에 두 번 들어와도(중복 호출) 저장 1건·메일 1회다", async (t) => {
  const s = await setup(); t.after(s.restore);
  const body = input(9);
  const results = await Promise.all([post(s.pub, body), post(s.pub, body)]);
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
  assert.equal(pendingCount(s.db), 1);
  assert.equal(s.sent.length, 1);
});

test("승인·반려는 메일을 보내지 않고 승인 대기 건수만 줄어든다", async (t) => {
  const s = await setup(); t.after(s.restore);
  const a = input(2), b = input(3, { lat: 37.2 });
  await post(s.pub, a); await post(s.pub, b);
  assert.equal(pendingCount(s.db), 2);
  assert.equal(s.sent.length, 2);
  for (const [n, target, action] of [[4, a, "approve"], [5, b, "reject"]]) {
    const res = await adminPost(s.admin, s.token, target.request_id, { action, request_id: input(n).request_id, expected_revision: 1 });
    assert.equal(res.status, 200, await res.clone().text());
  }
  assert.equal(pendingCount(s.db), 0);
  assert.equal(s.sent.length, 2);
});

test("메일 서비스가 실패해도 제보는 저장되고 접수 완료로 응답한다", async (t) => {
  for (const failure of [() => new Response("down", { status: 500 }), () => { throw new Error("network down"); }]) {
    const s = await setup(failure); t.after(s.restore);
    const logged = [], original = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
      const res = await post(s.pub, input(6));
      assert.equal(res.status, 201);
      assert.equal((await res.json()).status, "pending");
    } finally { console.error = original; }
    assert.equal(pendingCount(s.db), 1);
    assert.equal(s.sent.length, 1);
    assert.ok(logged.some((l) => l.startsWith("notify: email failed")));
    assert.ok(!logged.some((l) => l.includes("test-key")), "API 키를 로그에 남기지 않는다");
  }
});

test("메일 설정이 없으면 메일 호출 없이 접수만 한다", async (t) => {
  const s = await setup(); t.after(s.restore);
  delete s.pub.RESEND_API_KEY;
  const warn = console.warn; console.warn = () => {};
  try { assert.equal((await post(s.pub, input(7))).status, 201); } finally { console.warn = warn; }
  assert.equal(pendingCount(s.db), 1);
  assert.equal(s.sent.length, 0);
});

test("거부된 제보(번식 확인 누락)는 저장도 알림도 없다", async (t) => {
  const s = await setup(); t.after(s.restore);
  const res = await post(s.pub, input(8, { non_breeding_confirmed: false }));
  assert.equal(res.status, 400);
  assert.equal(pendingCount(s.db), 0);
  assert.equal(s.sent.length, 0);
});

test("메일 본문의 접수일시는 한국 시간이다", () => {
  const text = emailText({ id: "x", species: "도요", observed_on: "2026-09-27", received_at: "2026-09-27T12:55:00.000Z", lat: 35.5, lon: 126.5, reporter: null, note: null, bird_count: null }, {});
  assert.ok(text.includes("접수일시: 2026-09-27 21:55 (KST)"));
  assert.ok(text.includes("제보자: (미입력)"));
});
