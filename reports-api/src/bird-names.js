// 종명 식별: 공식 국명·학명·영명으로 같은 종을 알아본다. 제보 원문은 바꾸지 않고, 비교용 키만 만든다.
// 이 판정은 "공개 여부"가 아니라 "식별 가능한 이름인지"만 본다. 희귀·미조·미기록 가능종이라는 이유로 거르지 않으며,
// 어떤 이름도 "국내 미기록종"으로 확정하지 않는다.
import { OFFICIAL_BIRD_NAMES } from './official-bird-names.js';
import { BIRD_NAME_TABLE } from './official-bird-aliases.js';
import { IOC_SPECIES, IOC_ENGLISH } from './ioc-taxa.js';

const official = new Set(OFFICIAL_BIRD_NAMES);
const byScientific = new Map(BIRD_NAME_TABLE.map(([ko, sci]) => [sci.toLowerCase(), ko]));
const byEnglish = new Map(BIRD_NAME_TABLE.map(([ko, , eng]) => [eng.toLowerCase(), ko]));
const aliasesByKorean = new Map(BIRD_NAME_TABLE.map(([ko, sci, eng]) => [ko, [ko, sci, eng]]));
// 2025 목록 밖 이름은 국제 분류목록(IOC World Bird List)과 대조한다. 형식만 맞는다고 실존 종으로 확정하지 않는다.
const IOC = new Map(); // 속명(소문자) → 종소명 Set
for (const part of IOC_SPECIES.split(';')) { const [g, e] = part.split(':'); IOC.set(g.toLowerCase(), new Set(e.split(','))); }
const IOC_BY_ENGLISH = new Map(IOC_ENGLISH.split(String.fromCharCode(10)).map(l => l.split('|')).map(([eng, bin]) => [eng.toLowerCase(), bin]));
const IOC_ENGLISH_OF = new Map([...IOC_BY_ENGLISH].map(([eng, bin]) => [bin.toLowerCase(), eng]));
const BINOMIAL = /^([A-Za-z][a-z]{2,}) ([a-z]{2,})(?: [a-z]{2,})?$/; // 속 종소명 [아종명]
const clean = name => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ');

// 반환: { key, kind, aliases } 또는 null(식별 불가). 같은 종의 국명·학명·영명은 같은 key 를 가진다.
// kind: official | scientific | english(2025 한국 목록) | ioc_scientific | ioc_english(IOC 15.2 에서 확인) |
//       scientific_genus_only(속은 IOC 에 있으나 종소명이 없음: 오기·신종·분류 변경 가능, 원문 보존·공개·관리자 확인)
// 속명이 IOC 에도 없거나 형식이 아니면 null → 관리자 검토. 어떤 이름도 "국내 미기록종"으로 확정하지 않는다.
// 한국 목록과 IOC 는 속·학명이 다른 종이 있다(예: Charadrius dubius ↔ Thinornis dubius). 영명이 같으면 같은 종으로 이어, 두 학명을 모두 별칭으로 둔다.
const iocBinomialsOfKorean = new Map();
for (const [eng, bin] of IOC_BY_ENGLISH) { const ko = byEnglish.get(eng); if (ko) iocBinomialsOfKorean.set(ko, [...(iocBinomialsOfKorean.get(ko) || []), bin.toLowerCase()]); }
const fromKorean = ko => ({ key: ko, aliases: [...new Set([...aliasesByKorean.get(ko).map(a => a.toLowerCase()), ...(iocBinomialsOfKorean.get(ko) || [])])] });
function fromBinomial(bin, lower, kind) {
  const eng = IOC_ENGLISH_OF.get(bin);
  const ko = byScientific.get(bin) || (eng && byEnglish.get(eng));
  if (ko) return { ...fromKorean(ko), kind };
  return { key: bin, kind, aliases: eng ? [bin, eng] : [bin] };
}
export function identifyBird(rawName) {
  const name = clean(rawName);
  if (!name) return null;
  if (official.has(name)) return { ...fromKorean(name), kind: 'official' };
  const lower = name.toLowerCase();
  const sci = byScientific.get(lower);
  if (sci) return { ...fromKorean(sci), kind: 'scientific' };
  const eng = byEnglish.get(lower);
  if (eng) return { ...fromKorean(eng), kind: 'english' };
  const iocEng = IOC_BY_ENGLISH.get(lower);
  if (iocEng) return fromBinomial(iocEng.toLowerCase(), lower, 'ioc_english');
  const m = BINOMIAL.exec(name);
  if (!m) return null;
  const bin = (m[1] + ' ' + m[2]).toLowerCase(), epithets = IOC.get(m[1].toLowerCase());
  if (!epithets) return null;
  if (epithets.has(m[2])) return fromBinomial(bin, lower, 'ioc_scientific');
  return { key: lower, kind: 'scientific_genus_only', aliases: [lower] };
}
// 2025 한국조류목록에서 확인되는 이름인지(국명·학명·영명). IOC 에서만 확인되거나 속만 맞는 이름은 false(관리자 화면에 확인 표시).
export const isListedBirdName = name => { const id = identifyBird(name); return !!id && ['official', 'scientific', 'english'].includes(id.kind); };
