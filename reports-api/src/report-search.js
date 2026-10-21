import { WorkerError, historyEntry, splitSpecies, isSensitiveReport, isLocationHidden } from './shared.js';

export const REPORT_SEARCH_PAGE = 20;
const normalize = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
function input(url) {
  const one = name => {
    const values = url.searchParams.getAll(name);
    if (values.length > 1) invalid();
    return values[0] ?? null;
  };
  const q = one('q') ?? '', rawOffset = one('offset') ?? '0', limit = one('limit');
  if (q.length > 100 || /[\u0000-\u001f\u007f]/.test(q) || !/^(0|[1-9][0-9]*)$/.test(rawOffset) ||
      !Number.isSafeInteger(Number(rawOffset)) || (limit !== null && limit !== '20')) invalid();
  return { q: normalize(q), offset: Number(rawOffset) };
}
function invalid() { throw new WorkerError('REPORT_SEARCH_INVALID', '검색 요청 형식이 유효하지 않습니다.', 400); }
const restricted = row => !row || isLocationHidden(row) || isSensitiveReport({ note: row.note, speciesText: row.species, species: splitSpecies(row.species) });

// Project before searching/counting/paging: private fields must not become a match oracle.
// The approved rows, registry and publication anchor all come from the same primary batch.
export function reportSearchPayload(rows, sites, { q, offset }) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const registry = new Map(sites.map(site => [String(site.site_id), site]));
  const reports = rows.map(row => {
    const entry = historyEntry(row);
    const fixed = /^fixed:([0-9A-Za-z_-]{1,16}):[0-9]+$/.exec(row.spot_key || '');
    const root = row.spot_key && !fixed ? byId.get(row.spot_key) : row;
    // The existing marker projection supports direct attachments only, not chains.
    entry.locationHidden = restricted(row) || restricted(root) || !!(!fixed && row.spot_key && root?.spot_key);
    if (!entry.locationHidden) {
      const site = registry.get(String(row.site_id || (fixed && fixed[1]) || root.site_id || ''));
      if (site) {
        if (typeof site.site_name === 'string') entry.siteName = site.site_name;
        if (typeof site.region === 'string' && site.region.trim()) entry.region = site.region;
      }
      entry.target = { kind: fixed ? 'fixed' : 'spot', spotId: fixed ? row.spot_key : root.id };
    }
    return entry;
  }).filter(entry => !q || [...entry.species, entry.reporter, entry.siteName, entry.region].some(value => value && normalize(value).includes(q)));
  return { ok: true, total: reports.length, offset, limit: REPORT_SEARCH_PAGE,
    hasMore: offset + REPORT_SEARCH_PAGE < reports.length, reports: reports.slice(offset, offset + REPORT_SEARCH_PAGE) };
}

export function reportSearchPlan(db, url) {
  const request = input(url);
  return { statements: [
    db.prepare("SELECT id,species,note,lat,lon,public_lat,public_lon,observed_on,reporter,name_public,site_id,spot_key FROM reports WHERE status='approved' ORDER BY observed_on DESC,received_at DESC,id DESC"),
    db.prepare("SELECT site_id,site_name,COALESCE(NULLIF(json_extract(source_record_json,'$.region'),''),TRIM(COALESCE(json_extract(source_record_json,'$.sido'),'')||' '||COALESCE(json_extract(source_record_json,'$.sigungu'),''))) AS region FROM sites WHERE retired_at IS NULL AND registry_source='index.html:siteData'"),
  ], build: sets => reportSearchPayload(sets[0].results || [], sets[1].results || [], request) };
}
