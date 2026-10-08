import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const DIR=path.dirname(fileURLToPath(import.meta.url));
const PROTO_DIR=path.resolve(process.argv[2]||path.join(DIR,'../_results'));
const PROTO_SCRIPT=path.resolve(process.argv[3]||path.join(DIR,'p1s1_protection_prototype.mjs'));
const protoPath=PROTO_SCRIPT;
const protoText=fs.readFileSync(protoPath,'utf8');
const current=JSON.parse(fs.readFileSync(path.join(PROTO_DIR,'p1s_protection_current.json'),'utf8'));
const defs=protoText.slice(protoText.indexOf('const protectedNames='),protoText.indexOf('const rows=current.inputCases'));
if(!defs || !defs.includes('function assess'))throw Error('Prototype extraction changed.');
const assess=new Function('current',defs+'\nreturn assess;')(current);
const groundtruth=JSON.parse(fs.readFileSync(path.join(DIR,'../_snapshots/p1s_taxon_groundtruth.json'),'utf8'));
const rows=groundtruth.fixtures.map(f=>({...f,prototype:assess(f.species,f.note)}));
const normal=rows.filter(x=>x.expectedClass==='public_normal_current_policy');
const counts={normalN:normal.length,sensitiveRFalsePositiveN:normal.filter(x=>x.prototype.sensitiveR).length,
  prospectiveNormalWithheldN:normal.filter(x=>!x.prototype.proposedP.exactCoordinatesAllowed).length,
  prospectiveNormalAllowedN:normal.filter(x=>x.prototype.proposedP.exactCoordinatesAllowed).length,
  unresolvedCoverageWithheldN:normal.filter(x=>x.prototype.unresolved&&!x.prototype.proposedP.exactCoordinatesAllowed).length,
  resolvedKeywordWithheldN:normal.filter(x=>!x.prototype.unresolved&&!x.prototype.proposedP.exactCoordinatesAllowed).length};
const extras=[
 {label:'normal_zero',species:'울새0',note:'',expected:'review'},
 {label:'normal_max_count',species:'울새100000',note:'',expected:'normal_with_explicit_valid_count'},
 {label:'normal_over_limit',species:'울새100001',note:'',expected:'review'},
 {label:'normal_parenthesis',species:'울새 (1)',note:'',expected:'review_unless_parentheses_approved'},
 {label:'normal_parenthesis_unit',species:'울새 (1마리)',note:'',expected:'review_unless_parentheses_approved'},
 {label:'normal_negative',species:'울새 -1',note:'',expected:'review'},
 {label:'normal_exponent',species:'울새 1e3',note:'',expected:'review'},
 {label:'normal_decimal',species:'울새 1.5',note:'',expected:'review'},
 {label:'normal_zero_pad',species:'울새01',note:'',expected:'policy_choice_do_not_implicitly_assert_confirmed_count'},
 {label:'egg_accusative',species:'울새',note:'알을 품고 있음',expected:'breeding_withheld'},
 {label:'egg_nominative',species:'울새',note:'알이 있음',expected:'breeding_withheld'},
 {label:'not_egg_modal',species:'울새',note:'날씨를 알 수 없음',expected:'normal_current_policy'},
 {label:'egg_explicit_quantity',species:'울새',note:'알 2개 확인',expected:'breeding_withheld'},
 {label:'normal_taxon_egg_name',species:'알락할미새',note:'알락할미새 관찰',expected:'normal_current_policy'},
].map(x=>({...x,prototype:assess(x.species,x.note)}));
const result={schemaVersion:1,scope:'Independent review of standalone design prototype only. No other agent file, worktree, API, Worker, D1 or operating code modified.',
prototypeSHA256:crypto.createHash('sha256').update(protoText).digest('hex'),groundtruthSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR,'../_snapshots/p1s_taxon_groundtruth.json'))).digest('hex'),
counts,normalCases:normal,all70Cases:rows,extraBoundaryCases:extras,
decisions:[
'The current-policy representation repair S1-R creates zero protected false positives in 17 independently grounded ordinary fixtures.',
'Prospective S1-P ordinary withholding must be separated from S1-R protection false positives. The limited five-normal-name registry is not a production taxonomy catalog.',
'Integer syntax and finite integer alone are not valid count range. Embedded quantities need explicit 1..100000 validation, separate from optional row birdCount.',
'Parentheses grammar is an explicit acceptance choice: keep review or approve exact name (integer/unit) grammar with boundary tests; never silently erase parentheses or digits.',
'Standalone egg keyword regex cannot identify Korean meaning: 알 수 없음 is a false withholding and 알을/알이 are missed breeding expressions. Include prospective policy review and adversarial sentence fixtures.',
'No full official taxonomy/alias catalog or licensing validated in this task. Fixture registry coverage must not be presented as complete normal-input compatibility.'
]};
fs.writeFileSync(path.join(PROTO_DIR,'p1s1_prototype_independent_review.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({counts,extraBoundaryCases:extras.map(x=>({label:x.label,expected:x.expected,parsed:x.prototype.parsed,unresolved:x.prototype.unresolved,breedingExtension:x.prototype.breedingPolicyExtension,allow:x.prototype.proposedP.exactCoordinatesAllowed})),withheldNormals:normal.filter(x=>!x.prototype.proposedP.exactCoordinatesAllowed).map(x=>({id:x.id,species:x.species,note:x.note,unresolved:x.prototype.unresolved}))},null,2));