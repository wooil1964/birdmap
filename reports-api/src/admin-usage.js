// 관리자 전용 기능 이용 통계. GET /admin/api/usage (Access 인증 뒤에서만 불린다). 읽기만 한다.
// - 클릭 수: 별도 D1 birdmap-events(daily_usage, KST 날짜별 합계). 바인딩 EVENTS_DB.
// - 실제 제보 제출 수: 운영 제보 D1(reports.received_at). 이벤트를 따로 두지 않는다.
// - 탐조지 이름: 제보 D1 의 sites 테이블. 이벤트 DB 에는 site_id 만 있다.
// 이벤트 수집을 시작하기 전의 제보까지 세면 비율이 부풀려지므로, 제출 수는 첫 이벤트 날짜 이후만 센다.
import { recentCutoff } from "./admin-stats.js";

const kstDate = (iso) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function adminUsage(env, now = new Date()) {
  if (!env.EVENTS_DB) return { ok: true, configured: false };
  const since7 = recentCutoff(now, 7), since30 = recentCutoff(now, 30);
  const day7 = kstDate(since7), day30 = kstDate(since30);
  const rows = (db, sql, ...values) => db.prepare(sql).bind(...values).all().then((r) => r.results || []);

  const [events, sites, first] = await Promise.all([
    rows(env.EVENTS_DB, `SELECT event, SUM(CASE WHEN day >= ?1 THEN count ELSE 0 END) AS d7, SUM(count) AS d30
                           FROM daily_usage WHERE day >= ?2 GROUP BY event ORDER BY d30 DESC, event`, day7, day30),
    rows(env.EVENTS_DB, `SELECT site_id, SUM(CASE WHEN day >= ?1 THEN count ELSE 0 END) AS d7, SUM(count) AS d30,
                                SUM(CASE WHEN device_type = 'mobile' THEN count ELSE 0 END) AS mobile,
                                SUM(CASE WHEN device_type = 'desktop' THEN count ELSE 0 END) AS desktop,
                                SUM(CASE WHEN device_type = 'tablet' THEN count ELSE 0 END) AS tablet,
                                SUM(CASE WHEN device_type = 'other' THEN count ELSE 0 END) AS other
                           FROM daily_usage WHERE day >= ?2 AND event = 'birdsite_popup_open' AND site_id <> ''
                          GROUP BY site_id ORDER BY d30 DESC, d7 DESC, site_id`, day7, day30),
    rows(env.EVENTS_DB, "SELECT MIN(day) AS day FROM daily_usage"),
  ]);
  const trackingSince = first[0]?.day || null;
  const startOf = (day) => new Date(Date.parse(day + "T00:00:00+09:00")).toISOString();
  // 수집 시작 이후만. 수집 전이면 제출 수도 0 으로 본다(비율을 만들지 않는다).
  const from7 = trackingSince ? [since7, startOf(trackingSince)].sort().at(-1) : null;
  const from30 = trackingSince ? [since30, startOf(trackingSince)].sort().at(-1) : null;
  const [submitted] = from30 ? await rows(env.REPORTS_DB,
    "SELECT SUM(received_at >= ?1) AS d7, COUNT(*) AS d30 FROM reports WHERE received_at >= ?2", from7, from30) : [{ d7: 0, d30: 0 }];
  const names = Object.fromEntries((await rows(env.REPORTS_DB, "SELECT site_id, site_name FROM sites")).map((s) => [s.site_id, s.site_name]));

  const sum = (key) => events.reduce((s, e) => s + Number(e[key] || 0), 0);
  const clicks = (key) => Number(events.find((e) => e.event === "report_button_click")?.[key] || 0);
  const ratio = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const sub7 = Number(submitted?.d7 || 0), sub30 = Number(submitted?.d30 || 0);
  return {
    ok: true,
    configured: true,
    trackingSince,
    window: { day7, day30 },
    summary: {
      clicks7: sum("d7"), clicks30: sum("d30"),
      reportClicks7: clicks("d7"), reportClicks30: clicks("d30"),
      submitted7: sub7, submitted30: sub30,
      submitRate7: ratio(sub7, clicks("d7")), submitRate30: ratio(sub30, clicks("d30")),
    },
    events,
    sites: sites.map((s) => ({ ...s, site_name: names[s.site_id] ?? null })),
  };
}
