// 종명 식별: 공식 국명·학명·영명으로 같은 종을 알아본다. 제보 원문은 바꾸지 않고, 비교용 키만 만든다.
// 이 판정은 "공개 여부"가 아니라 "식별 가능한 이름인지"만 본다. 희귀·미조·미기록 가능종이라는 이유로 거르지 않으며,
// 어떤 이름도 "국내 미기록종"으로 확정하지 않는다.
import { OFFICIAL_BIRD_NAMES } from './official-bird-names.js';
import { BIRD_NAME_TABLE } from './official-bird-aliases.js';

const official = new Set(OFFICIAL_BIRD_NAMES);
const byScientific = new Map(BIRD_NAME_TABLE.map(([ko, sci]) => [sci.toLowerCase(), ko]));
const byEnglish = new Map(BIRD_NAME_TABLE.map(([ko, , eng]) => [eng.toLowerCase(), ko]));
const aliasesByKorean = new Map(BIRD_NAME_TABLE.map(([ko, sci, eng]) => [ko, [ko, sci, eng]]));
// 2025 목록에 없는 종의 학명: 속명은 대문자로 시작, 종소명(·아종명)은 소문자 1~2개(예: Calidris pygmaea, Anser fabalis middendorffii).
const UNLISTED_SCIENTIFIC = /^[A-Z][a-z]{2,}(?: [a-z]{2,}){1,2}$/;
const clean = name => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ');

// 반환: { key, kind, aliases } 또는 null(식별 불가).
// kind: official(공식 국명) | scientific / english(2025 목록의 학명·영명) | scientific_unlisted(목록에 없는 학명 꼴, 원문 보존)
// 영명은 2025 목록에 있는 것만 식별한다(목록 밖 영명은 전 세계 명단이 없어 식별할 수 없으므로 관리자 검토로 보낸다).
export function identifyBird(rawName) {
  const name = clean(rawName);
  if (!name) return null;
  if (official.has(name)) return { key: name, kind: 'official', aliases: aliasesByKorean.get(name).map(a => a.toLowerCase()) };
  const lower = name.toLowerCase();
  const sci = byScientific.get(lower);
  if (sci) return { key: sci, kind: 'scientific', aliases: aliasesByKorean.get(sci).map(a => a.toLowerCase()) };
  const eng = byEnglish.get(lower);
  if (eng) return { key: eng, kind: 'english', aliases: aliasesByKorean.get(eng).map(a => a.toLowerCase()) };
  if (UNLISTED_SCIENTIFIC.test(name)) return { key: lower, kind: 'scientific_unlisted', aliases: [lower] };
  return null;
}
// 목록(2025 한국조류목록)에서 확인되는 이름인지(국명·학명·영명). 목록 밖 학명 꼴은 false.
export const isListedBirdName = name => { const id = identifyBird(name); return !!id && id.kind !== 'scientific_unlisted'; };
