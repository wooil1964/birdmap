// 테스트용 D1 대역. Node 내장 SQLite 로 실제 schema.sql 을 올려 두고,
// D1 의 prepare/bind/all/first/run/batch 모양만 맞춘다.
// 손으로 만든 질의 분기 대신 진짜 SQL 이 돌기 때문에 UNIQUE 인덱스와 LIKE 조건까지 그대로 검증된다.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

function insertRow(db, row) {
  const full = {
    id: row.id,
    status: row.status ?? "pending",
    species: row.species,
    lat: row.lat,
    lon: row.lon,
    public_lat: row.public_lat ?? null,
    public_lon: row.public_lon ?? null,
    observed_on: row.observed_on ?? "2026-09-19",
    received_at: row.received_at ?? new Date().toISOString(),
    decided_at: row.decided_at ?? null,
    bird_count: row.bird_count ?? null,
    reporter: row.reporter ?? null,
    note: row.note ?? null,
    admin_note: row.admin_note ?? null,
    site_id: row.site_id ?? null,
    name_public: row.name_public ?? 0,
    spot_key: row.spot_key ?? null,
    ip_hash: row.ip_hash ?? "hash",
    dedupe_hash: row.dedupe_hash ?? "dedupe-" + row.id,
  };
  const cols = Object.keys(full);
  const marks = cols.map((_, i) => "?" + (i + 1)).join(", ");
  db.prepare(
    `INSERT INTO reports (${cols.join(", ")}) VALUES (${marks})`,
  ).run(...cols.map((c) => full[c]));
}

export function fakeDb(initialRows = []) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  for (const row of initialRows) insertRow(db, row);

  function prepare(sql) {
    let params = [];
    const statement = {
      bind(...values) {
        params = values;
        return statement;
      },
      async all() {
        return { results: db.prepare(sql).all(...params) };
      },
      async first() {
        return db.prepare(sql).get(...params) ?? null;
      },
      async run() {
        db.prepare(sql).run(...params);
        return { success: true };
      },
    };
    return statement;
  }

  return {
    prepare,
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return [];
    },
    // 테스트에서 저장 결과를 확인할 때 쓴다. 매번 현재 상태를 읽어 온다.
    get rows() {
      return db.prepare("SELECT * FROM reports ORDER BY received_at").all();
    },
  };
}

export const ORIGIN = { Origin: "https://wooil1964.github.io" };

export function publicEnv(db, overrides = {}) {
  return {
    ENVIRONMENT: "production",
    REPORTS_DB: db,
    REPORT_IP_SALT: "test-salt",
    TURNSTILE_SECRET_KEY: "test-secret",
    ...overrides,
  };
}

// Turnstile 을 항상 통과시키는 fetch 대역은 쓰지 않는다.
// 실제 코드가 env 의 시크릿으로 siteverify 를 부르므로 globalThis.fetch 를 잠시 바꾼다.
export function withTurnstile(success, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success }));
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = original;
  });
}

export function submitRequest(body) {
  return new Request("https://reports.example/reports", {
    method: "POST",
    headers: { ...ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
    body: JSON.stringify(body),
  });
}

// 관찰일은 실행 시점 기준 어제로 잡는다. 날짜를 고정하면 시간이 지나 테스트가 저절로 깨진다.
export function yesterdayKst() {
  const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

export function validBody(overrides = {}) {
  return {
    species: "붉은양진이, 흰꼬리딱새",
    lat: 37.5642583333,
    lon: 126.8920861111,
    observedOn: yesterdayKst(),
    turnstileToken: "token",
    ...overrides,
  };
}
