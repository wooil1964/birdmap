// 테스트용 D1 대역. 실제 SQL 엔진이 아니라 이 Worker 가 쓰는 질의 모양만 흉내 낸다.
// 질의를 추가하면 여기에도 분기를 추가해야 한다.

export function fakeDb(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  function select(sql, params) {
    if (sql.includes("SUM(CASE WHEN")) {
      const [hash, windowStart, dayStart] = params;
      const mine = rows.filter(
        (row) => row.ip_hash === hash && row.received_at >= dayStart,
      );
      return [
        {
          recent: mine.filter((row) => row.received_at >= windowStart).length,
          daily: mine.length,
        },
      ];
    }
    if (sql.includes("status = 'approved' AND merged_into IS NULL")) {
      return rows.filter(
        (row) => row.status === "approved" && !row.merged_into,
      );
    }
    if (sql.includes("WHERE id = ?1")) {
      return rows.filter((row) => row.id === params[0]);
    }
    if (sql.includes("WHERE status = ?1")) {
      return rows.filter((row) => row.status === params[0]);
    }
    if (sql.includes("FROM reports ORDER BY")) return rows.slice();
    throw new Error("대역이 모르는 SELECT: " + sql);
  }

  function mutate(sql, params) {
    if (sql.startsWith("INSERT")) {
      const [
        id,
        species,
        lat,
        lon,
        observed_on,
        received_at,
        bird_count,
        reporter,
        note,
        ip_hash,
        dedupe_hash,
      ] = params;
      if (rows.some((row) => row.dedupe_hash === dedupe_hash)) {
        throw new Error("UNIQUE constraint failed: reports.dedupe_hash");
      }
      rows.push({
        id,
        status: "pending",
        species,
        lat,
        lon,
        public_lat: null,
        public_lon: null,
        observed_on,
        received_at,
        decided_at: null,
        bird_count,
        reporter,
        note,
        admin_note: null,
        site_id: null,
        merged_into: null,
        ip_hash,
        dedupe_hash,
      });
      return;
    }
    if (sql.includes("SET status='rejected'")) {
      assign(params[0], { status: "rejected", decided_at: params[1], admin_note: params[2] });
      return;
    }
    if (sql.includes("SET status='pending'")) {
      assign(params[0], { status: "pending", decided_at: params[1], admin_note: params[2] });
      return;
    }
    if (sql.includes("SET species=?2, decided_at=?3")) {
      assign(params[0], { species: params[1], decided_at: params[2] });
      return;
    }
    if (sql.includes("SET status='approved', merged_into=?2")) {
      assign(params[0], {
        status: "approved",
        merged_into: params[1],
        decided_at: params[2],
        admin_note: params[3],
      });
      return;
    }
    if (sql.includes("SET status='approved', species=?2")) {
      assign(params[0], {
        status: "approved",
        species: params[1],
        lat: params[2],
        lon: params[3],
        public_lat: params[4],
        public_lon: params[5],
        site_id: params[6],
        merged_into: null,
        decided_at: params[7],
        admin_note: params[8],
      });
      return;
    }
    throw new Error("대역이 모르는 UPDATE: " + sql);
  }

  function assign(id, patch) {
    const row = rows.find((entry) => entry.id === id);
    if (row) Object.assign(row, patch);
  }

  function prepare(sql) {
    let params = [];
    const statement = {
      bind(...values) {
        params = values;
        return statement;
      },
      async all() {
        return { results: select(sql, params) };
      },
      async first() {
        return select(sql, params)[0] ?? null;
      },
      async run() {
        mutate(sql, params);
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
    rows,
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
