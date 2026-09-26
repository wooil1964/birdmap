// Artificial observations only. Existing public site IDs are read without copying their coordinates.
import { readFileSync } from 'node:fs';
import { SITE_PICKER_JS } from '../../../reports-api/src/site-picker.js';
export const NOW = '2026-09-25T00:00:00.000Z';
const parse = new Function(SITE_PICKER_JS + '\nreturn parseSiteData;')();
export const siteIds = parse(readFileSync(new URL('../../../index.html', import.meta.url), 'utf8')).map(s => String(s.id));
export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function row(n, overrides = {}) {
  return {
    id: uuid(n), status: n <= 17 ? 'approved' : 'rejected',
    species: n === 1 ? '  합성종01  ' : `합성종${n}`,
    lat: 10 + n / 1000, lon: 20 + n / 1000,
    public_lat: null, public_lon: null,
    approx_lat: n <= 19 ? 10.5 : null, approx_lon: n <= 19 ? 20.5 : null,
    pending_public: n <= 15 ? 1 : 0,
    observed_on: '2026-09-20', received_at: `2026-09-21T00:00:${String(n % 60).padStart(2, '0')}.000Z`,
    decided_at: NOW, bird_count: n <= 13 ? 1 : null,
    reporter: n % 2 ? `합성제보자${n}` : null, note: `합성메모${n}`, admin_note: null,
    site_id: n <= 16 ? siteIds[(n - 1) % siteIds.length] : null,
    name_public: n % 2, spot_key: null,
    ip_hash: `synthetic-ip-${n}`, dedupe_hash: `synthetic-dedupe-${n}`, ...overrides,
  };
}
export const baseline = Array.from({ length: 21 }, (_, i) => row(i + 1));
export const corners = [
  row(101, { status: 'approved', species: '합성A · 합성B', bird_count: 7, site_id: siteIds[0], name_public: 0 }),
  row(102, { status: 'approved', spot_key: uuid(101), species: '합성C', public_lat: 11, public_lon: 21, site_id: siteIds[0], reporter: '합성이름', name_public: 1 }),
  row(103, { status: 'approved', spot_key: 'fixed:21:0', species: '합성D', site_id: siteIds[0] }),
  row(104, { status: 'pending', pending_public: 1, approx_lat: 10.5, approx_lon: 20.5 }),
  row(105, { status: 'pending', pending_public: 1 }),
  row(106, { status: 'pending', pending_public: 0, approx_lat: 10.5, approx_lon: 20.5 }),
  row(107, { status: 'approved', public_lat: 12, public_lon: null, species: '합성E, 합성F', bird_count: 0 }),
  row(108, { status: 'approved', spot_key: uuid(104), species: '합성G' }),
  row(109, { status: 'approved', reporter: '', name_public: 1, site_id: siteIds[0], public_lat: 11, public_lon: 21 }),
];
