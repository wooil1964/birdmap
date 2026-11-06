import { WorkerError, siteHistoryPayload } from './shared.js';
import { locationEvidenceColumns } from './location-evidence.js';

// Exact safe totals require evaluating every approved candidate in one snapshot.
// Bound the candidates, including restricted/hidden rows, before D1 serializes
// private evidence. Never return a truncated total or a partly filtered page.
export const SITE_HISTORY_SCAN_MAX = 1000;
export function siteHistoryStatement(db, env, siteId) {
  return db.prepare(`SELECT id,species,note,lat,lon,public_lat,public_lon,
    ${locationEvidenceColumns(env)},observed_on,reporter,name_public FROM reports
    WHERE status='approved' AND site_id=?1
    ORDER BY observed_on DESC,received_at DESC,id DESC LIMIT ${SITE_HISTORY_SCAN_MAX + 1}`).bind(siteId);
}
export function boundedSiteHistoryPayload(rows, limit, offset) {
  if ((rows || []).length > SITE_HISTORY_SCAN_MAX) {
    throw new WorkerError('SITE_HISTORY_UNAVAILABLE', '출현 이력을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
  return siteHistoryPayload(rows, limit, offset);
}
