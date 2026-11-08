// 일반종 자동 공개(미검증) 판정. 설계: docs/reviews/report-autopublish-design/2026-11-08-claude-design.md
// 원칙: 허용 목록에 정확히 있는 종만 자동 공개한다. 모르는 것은 전부 보류(fail-closed).
// 상태값은 새로 만들지 않는다: pending + pending_public=1 + reviews(submitted, system:auto-public, auto_public:<정책>)
// 세 가지를 모두 갖추고, 읽는 시점에 아래 판정을 다시 통과해야만 공개된다.
import { hasBreedingEvidence, isLocationRestricted, isLocationHidden, splitSpecies, kstDateString, parseSpeciesItems, speciesNamesOf, publicSightingsOf, identifiedSpeciesSql } from './shared.js';

export const AUTO_PUBLIC_POLICY = 'auto-public-v1';
export const AUTO_PUBLIC_ACTOR = 'system:auto-public';
export const AUTO_PUBLIC_REASON = 'auto_public:' + AUTO_PUBLIC_POLICY;
export const UNVERIFIED_MAX_DAYS = 14;   // 이 기간 안에 관리자가 확인하지 않으면 읽기에서 내린다(쓰기 없음).
export const STALE_DAYS = 7;             // 관찰일이 이보다 오래되면 접수 때 보류
export const MAX_SPECIES = 5;
export const DUPLICATE_METERS = 200;
export const IP_DAILY_MAX = 5;
export const GLOBAL_DAILY_MAX_DEFAULT = 50;
const DEFAULT_COUNT_MAX = 300;

// 시범 허용 일반종 18종(관리자 승인 2026-11-08 "권장안으로 착수"). 이름은 한국 조류 목록 국명과 정확히 일치해야 한다.
export const COMMON_SPECIES = Object.freeze({
  '참새': {}, '까치': {}, '직박구리': {}, '멧비둘기': {}, '집비둘기': {}, '박새': {},
  '붉은머리오목눈이': {}, '물까치': {}, '큰부리까마귀': {}, '노랑턱멧새': {}, '딱새': {}, '동박새': {},
  '청둥오리': { countMax: 3000 }, '흰뺨검둥오리': { countMax: 3000 }, '쇠오리': { countMax: 3000 },
  '왜가리': {}, '민물가마우지': {}, '쇠딱다구리': {},
});

// 법정 보호종(멸종위기 I·II급, 천연기념물 조류) + 위치 정책 v2의 19종. 자동 공개 관문 전용이며 v2 판정은 바꾸지 않는다.
// ponytail: 잠정 목록이다. 공식 고시와 대조가 끝나지 않았다. 안전성은 허용 목록이 보장하고 이 목록은 사유 표시·겹침 검사용이다.
export const PROTECTED_SPECIES = new Set([
  '저어새', '노랑부리저어새', '노랑부리백로', '황새', '먹황새', '따오기', '두루미', '재두루미', '흑두루미', '검은목두루미',
  '검독수리', '참수리', '흰꼬리수리', '독수리', '흰죽지수리', '항라머리검독수리', '매', '참매', '새매', '붉은배새매', '조롱이',
  '솔개', '벌매', '잿빛개구리매', '알락개구리매', '개구리매', '큰말똥가리', '털발말똥가리', '황조롱이',
  '수리부엉이', '올빼미', '긴점박이올빼미', '소쩍새', '큰소쩍새', '솔부엉이', '쇠부엉이',
  '팔색조', '뿔쇠오리', '넓적부리도요', '청다리도요사촌', '알락꼬리마도요', '붉은어깨도요', '검은머리물떼새', '흰목물떼새',
  '고니', '큰고니', '혹고니', '개리', '큰기러기', '흑기러기', '흰이마기러기', '원앙', '호사비오리',
  '크낙새', '까막딱다구리', '흑비둘기', '검은머리갈매기', '고대갈매기', '쇠검은머리쑥새', '큰덤불해오라기', '섬개개비', '긴꼬리딱새', '느시',
]);

// 희귀종·혼동종 검토 목록: 허용 종과 이름·외형이 헷갈리거나 동정 확인이 필요한 종.
export const RARE_REVIEW_SPECIES = new Set([
  '말똥가리', '쇠백로', '중대백로', '넓적부리', '양비둘기', '염주비둘기', '떼까마귀', '갈까마귀', '까마귀',
  '검은머리쑥새', '청다리도요', '흰뺨오리', '가창오리', '아메리카홍머리오리', '쇠가마우지', '가마우지',
]);

export const SYNONYMS = Object.freeze({}); // 관습명 → 국명. 지정한 것만 인정한다(부분·유사 일치 없음).

export const HOLD_REASONS = ['auto_public_disabled', 'breeding', 'protected', 'rare_review', 'name_unconfirmed', 'species_parse', 'count_anomaly',
  'stale_observation', 'possible_duplicate', 'rate_review', 'global_cap', 'note_review'];

const QUANTITY = /^(.+?)\s*(\d+)\s*(?:마리|개체)?$/;
const UNCERTAIN = /[?？]|추정|미확인|아마|같음|비슷|류$|\bsp\.?$|\bspp\.?$|또는|\bor\b/i;
const CONTACT = /https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+|\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/i;

export function speciesName(token) {
  const text = String(token || '').normalize('NFC').trim();
  const m = QUANTITY.exec(text);
  const name = (m ? m[1] : text).trim();
  return SYNONYMS[name] || name;
}

// 저장·접수와 무관하게 내용만으로 판정한다(읽을 때 다시 쓰는 부분).
export function contentReasons(report) {
  const reasons = new Set();
  const tokens = (report.species || []).map(t => String(t || '').normalize('NFC').trim()).filter(Boolean);
  if (hasBreedingEvidence({ note: report.note, speciesText: report.speciesText || tokens.join(' · ') })) reasons.add('breeding');
  if (!tokens.length || tokens.length > MAX_SPECIES) reasons.add('name_unconfirmed');
  // 종명·개체수를 확실히 나눌 수 없거나(꼴 불일치), 같은 종이 두 번이거나, 양식 개체수와 다르면 보류.
  const parsed = parseSpeciesItems(tokens);
  if (!parsed.clean || parsed.duplicates.length) reasons.add('species_parse');
  const count = report.birdCount;
  if (parsed.items.length === 1 && parsed.items[0].count !== null && count !== null && count !== undefined && parsed.items[0].count !== count) reasons.add('species_parse');
  let countMax = Infinity;
  for (const [i, token] of tokens.entries()) {
    if (UNCERTAIN.test(token)) { reasons.add('name_unconfirmed'); continue; }
    const item = parsed.items[i], name = item?.name || speciesName(token);
    if (PROTECTED_SPECIES.has(name)) reasons.add('protected');
    if (RARE_REVIEW_SPECIES.has(name)) reasons.add('rare_review');
    const common = item?.name && Object.hasOwn(COMMON_SPECIES, name) ? COMMON_SPECIES[name] : null;
    if (!common) { reasons.add('name_unconfirmed'); continue; }
    const limit = common.countMax || DEFAULT_COUNT_MAX;
    countMax = Math.min(countMax, limit);
    // 종명 뒤 수량 표기("참새 5000마리")도 그 종의 상한을 넘으면 보류한다.
    if (item.count !== null && item.count > limit) reasons.add('count_anomaly');
  }
  if (count !== null && count !== undefined && !(Number.isSafeInteger(count) && count >= 0 && count <= countMax)) reasons.add('count_anomaly');
  if (report.note && CONTACT.test(String(report.note))) reasons.add('note_review');
  return reasons;
}

export const autoPublicEnabled = env => env?.REPORTS_AUTO_PUBLIC === '1' && env?.REPORTS_WRITE_MODE === 'CANONICAL_DUAL_WRITE';
export const unverifiedReadsEnabled = env => env?.REPORTS_UNVERIFIED_READS === '1' && env?.REPORTS_WRITE_MODE === 'CANONICAL_DUAL_WRITE';

function kstDayStartIso(now) { return new Date(Date.parse(kstDateString(now) + 'T00:00:00+09:00')).toISOString(); }
function daysBetween(a, b) { return Math.floor((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function meters(a, b) {
  const r = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// 접수 판정. 내용 판정 + 접수 시점에만 의미 있는 판정(관찰일, 중복, 상한).
// ponytail: 상한은 판정 시점의 개수 조회라 동시 접수로 1~2건 넘을 수 있다. 문제가 되면 batch assertion으로 묶는다.
export async function classifySubmission(db, env, report, ipHash, now = new Date()) {
  if (!autoPublicEnabled(env)) return { eligible: false, reasons: ['auto_public_disabled'] };
  const reasons = contentReasons(report);
  if (daysBetween(report.observedOn, kstDateString(now)) > STALE_DAYS) reasons.add('stale_observation');
  const names = new Set((report.species || []).map(speciesName));
  const sameDay = (await db.prepare("SELECT species,lat,lon FROM reports WHERE observed_on=?1 AND status<>'rejected'").bind(report.observedOn).all()).results || [];
  if (sameDay.some(r => splitSpecies(r.species).some(t => names.has(speciesName(t))) && meters(r, report) <= DUPLICATE_METERS)) reasons.add('possible_duplicate');
  const dayStart = kstDayStartIso(now);
  const counts = await db.prepare('SELECT SUM(CASE WHEN ip_hash=?1 THEN 1 ELSE 0 END) AS ip, COUNT(*) AS total FROM reports WHERE received_at>=?2 AND pending_public=1').bind(ipHash, dayStart).first();
  if (Number(counts?.ip || 0) >= IP_DAILY_MAX) reasons.add('rate_review');
  const cap = Number(env.REPORTS_AUTO_PUBLIC_DAILY_MAX);
  if (Number(counts?.total || 0) >= (Number.isSafeInteger(cap) && cap >= 0 ? cap : GLOBAL_DAILY_MAX_DEFAULT)) reasons.add('global_cap');
  const ordered = HOLD_REASONS.filter(r => reasons.has(r));
  return { eligible: ordered.length === 0, reasons: ordered };
}

// 접수 묶음에 함께 넣는 자동 판정 기록(reviews). 스위치가 꺼져 있으면 기록하지 않는다(현행과 동일).
export function submissionReview(id, now, result) {
  return {
    review_id: `review:submit:${id}`, checklist_id: id, sequence: 1, decision: 'submitted', sighting_id: null,
    validated_taxon_id: null, validated_count: null, validated_count_accuracy: null, from_status: null, to_status: 'pending',
    actor_id: AUTO_PUBLIC_ACTOR, request_id: id, event_index: 0,
    reason_code: result.eligible ? AUTO_PUBLIC_REASON : 'hold:' + result.reasons.join(','), note: null, created_at: now,
  };
}

// 행에 붙여 읽는 자동 판정 기록. reports 와 같은 스냅샷에서 읽는다.
export const AUTO_DECISION_SQL = `(SELECT reason_code FROM reviews WHERE checklist_id=reports.id AND sequence=1 AND decision='submitted' AND actor_id='${AUTO_PUBLIC_ACTOR}') AS auto_decision`;

// 공개 읽기 후보: 자동 공개 표시가 남은 대기 행만. 최종 판정은 unverifiedPayload 가 한다.
export function unverifiedStatement(db, evidence) {
  return db.prepare(`SELECT id,status,species,note,lat,lon,public_lat,public_lon,observed_on,bird_count,received_at,pending_public,${evidence},${AUTO_DECISION_SQL},${identifiedSpeciesSql({REPORTS_WRITE_MODE:'CANONICAL_DUAL_WRITE'}, true)}
    FROM reports WHERE status='pending' AND pending_public=1 ORDER BY observed_on DESC,received_at DESC,id DESC`);
}

// 기록 자체가 자동 공개 상태인지(읽기 스위치와 무관). 관리자 표시에도 쓴다.
export function unverifiedState(row, now = new Date()) {
  if (row?.status !== 'pending' || row.auto_decision !== AUTO_PUBLIC_REASON) return null;
  if (Number(row.pending_public) !== 1) return 'withdrawn';
  const report = { species: splitSpecies(row.species), speciesText: row.species, birdCount: row.bird_count ?? null, note: row.note };
  const ageDays = (now.getTime() - Date.parse(row.received_at)) / 86400000;
  if (!(ageDays <= UNVERIFIED_MAX_DAYS) || contentReasons(report).size || isLocationRestricted(row)) return 'stopped';
  return 'public';
}

// 공개 응답: 스위치 + 기록 + 재판정을 모두 통과한 대기 제보만. 실제 좌표 대신 공개 좌표 규칙(가림이면 가림 점)을 쓴다.
export function unverifiedPayload(rows, env, now = new Date()) {
  if (!unverifiedReadsEnabled(env)) return [];
  return (rows || []).filter(row => unverifiedState(row, now) === 'public').map(row => {
    const spot = { id: row.id, status: 'pending', verified: false, lat: row.public_lat ?? row.lat, lon: row.public_lon ?? row.lon,
      species: speciesNamesOf(row), date: row.observed_on };
    const sightings = publicSightingsOf(row);
    if (sightings.length) spot.sightings = sightings;
    if (isLocationHidden(row)) { spot.locationHidden = true; spot.approximate = true; }
    return spot;
  });
}

export function holdReasonsOf(autoDecision) {
  const text = String(autoDecision || '');
  return text.startsWith('hold:') ? text.slice(5).split(',').filter(r => HOLD_REASONS.includes(r)) : [];
}
