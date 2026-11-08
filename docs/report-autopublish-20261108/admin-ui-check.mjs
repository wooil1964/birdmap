// Local admin UI check for the auto-publish design: real admin + public Worker code in-process,
// synthetic SQLite, stubbed Access JWT, auto-publish switches ON, driven by local Chrome. No network writes.
// Usage: ROOT=<reports-api dir> PW=<playwright-core dir> OUT=<dir> CHROME_PATH=... node admin-ui-check2.mjs
import http from 'node:http';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const R=p=>import(pathToFileURL(process.env.ROOT+'/'+p).href);
const {canonicalDb}=await R('test/helpers.mjs');
const {environments,installAuthStubs,input,post}=await R('local-test/helpers.mjs');
const {handleRequest:pub}=await R('src/public.js');
const admin=(await R('src/admin.js')).default;
const {quickInput,persistQuick}=await R('src/canonical/persistence.js');
const {dedupeHash,sha256Hex,kstDateString}=await R('src/shared.js');
const pw=await import(pathToFileURL(process.env.PW+'/index.js').href);const chromium=pw.chromium||pw.default.chromium;
const OUT=process.env.OUT;fs.mkdirSync(OUT,{recursive:true});
const TODAY=kstDateString(new Date());

const auth=await installAuthStubs();
const db=canonicalDb(),envs=environments(db);
Object.assign(envs.pub,{REPORTS_AUTO_PUBLIC:'1',REPORTS_UNVERIFIED_READS:'1'});
const ids={};
const seed=async(k,n,patch)=>{const b=input(n,{observedOn:TODAY,lat:36.5+n/1e3,lon:126.5+n/1e3,...patch});ids[k]=b.request_id;const r=await post(envs.pub,b);if(r.status!==201)throw Error('seed '+k+' '+r.status);return r.json();};
const u1=await seed('u1',701,{species:'참새'}),u2=await seed('u2',702,{species:'까치',hideLocation:true}),u3=await seed('u3',703,{species:'박새'});
const held=await seed('held',704,{species:'매',note:'비행'}),unk=await seed('unknown',705,{species:'처음보는새'});
const multi=await seed('multi',707,{species:'동박새3, 박새2, 쇠딱다구리'}),dupl=await seed('dupl',708,{species:'동박새3, 동박새5'});
if(multi.publicVisibility!=='public_unverified'||dupl.publicVisibility!=='withheld')throw Error('seed multi receipts');
if(u1.publicVisibility!=='public_unverified'||held.publicVisibility!=='withheld')throw Error('seed receipts');
{const body=input(706,{species:'참새',observedOn:TODAY,lat:37.3,lon:127.3});const {report,input:orig}=quickInput(body);ids.legacy=body.request_id;
 const row={id:body.request_id,status:'pending',species:report.speciesText,lat:report.lat,lon:report.lon,public_lat:null,public_lon:null,approx_lat:report.lat,approx_lon:report.lon,pending_public:1,observed_on:report.observedOn,received_at:new Date().toISOString(),decided_at:null,bird_count:1,reporter:'합성',note:null,admin_note:null,site_id:null,name_public:1,spot_key:null,ip_hash:'s',dedupe_hash:await dedupeHash(report)};
 await persistQuick(db,row,orig,{ok:true,id:row.id,status:'pending',publicVisibility:'approximate'},await sha256Hex('legacy'));}
const pp=id=>db.sqlite.prepare('SELECT status,pending_public,public_lat FROM reports WHERE id=?').get(id);
const lastReason=id=>db.sqlite.prepare('SELECT reason_code FROM reviews WHERE checklist_id=? ORDER BY sequence DESC LIMIT 1').get(id)?.reason_code;
const pendingIds=async()=>{const b=await (await pub(new Request('https://synthetic.invalid/reports/pending',{headers:{Origin:'https://wooil1964.github.io'}}),envs.pub)).json();return b.spots.map(s=>s.id).sort();};

const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(typeof v==='string')headers.set(k,v);
  headers.set('Cf-Access-Jwt-Assertion',auth.token);
  const r=await admin.fetch(new Request('https://admin.example'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),envs.admin);
  res.writeHead(r.status,Object.fromEntries([...r.headers]));res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const results=[];const ok=(name,cond,detail='')=>{results.push({name,pass:!!cond,detail:String(detail)});};
ok('공개 API 초기: 미검증 4건만(과거 플래그·보류 제외)',JSON.stringify(await pendingIds())===JSON.stringify([ids.u1,ids.u2,ids.u3,ids.multi].sort()));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
// 모바일은 화면만 확인하고, 상태를 바꾸는 조작은 마지막 PC 단계에서 한다.
for(const [label,vp,mobile] of [['mobile',{width:390,height:844},true],['pc',{width:1280,height:900},false]]){
  const ctx=await browser.newContext({viewport:vp,isMobile:mobile,hasTouch:mobile});const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
  await page.goto(base+'/admin',{waitUntil:'domcontentloaded'});await page.waitForSelector('.card',{timeout:15000});
  const seen=[];await page.exposeFunction('__seen',m=>seen.push(m));
  await page.evaluate(()=>new MutationObserver(()=>window.__seen(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,characterData:true,subtree:true}));
  const tab=async s=>{await page.locator(`nav button[data-status="${s}"]`).click();await page.waitForTimeout(900);};
  const badge=async id=>(await page.locator(`.card[data-id="${id}"] h2 .badge`).first().innerText());
  await page.waitForTimeout(800);
  ok(label+': 미검증 건수 배지 4',(await page.locator('#unverifiedCount').innerText())==='4');
  ok(label+': 검토 대기 탭 = 보류 3 + 과거 플래그 1',(await page.locator('.card').count())===4);
  {const m=await page.locator(`.card[data-id="${ids.dupl}"] .meta`).first().innerText();ok(label+': 같은 종 중복 카드 종별 표시(1종, 합산 안 함)·보류 사유',m.includes('종별: 동박새 (개체수 확인 필요) · 동박새 (개체수 확인 필요) — 1종')&&!m.includes('개체수 8')&&m.includes('종명·개체수 확인'),m);}
  ok(label+': 공식 국명 미확인 기록은 원문 유지·관리자 검토 안내',/공식 국명 확인 필요.*관리자 검토 대상/.test(await page.locator(`.card[data-id="${ids.unknown}"] .meta`).first().innerText()));
  ok(label+': 보호종 배지 검토 대기 · 비공개',(await badge(ids.held))==='검토 대기 · 비공개');
  ok(label+': 보류 사유 표시',/자동 공개 보류 사유: 보호종/.test(await page.locator(`.card[data-id="${ids.held}"] .meta`).first().innerText()));
  ok(label+': 과거 플래그는 검토 대기(공개 아님)',(await badge(ids.legacy))==='검토 대기 · 비공개');
  ok(label+': 황색·수동 공개 버튼 없음',!/황색/.test(await page.locator('#list').innerText())&&(await page.locator('button[data-public="1"]').count())===0);
  ok(label+': 가로 스크롤 없음',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.screenshot({path:`${OUT}/admin-${label}-review.png`});
  await tab('unverified');
  ok(label+': 미검증 탭 4건, 배지 자동 공개 · 미검증',(await page.locator('.card').count())===4&&(await badge(ids.u1))==='자동 공개 · 미검증');
  ok(label+': 미검증 카드에 확인 완료·공개 중지·반려 사유',await page.locator(`.card[data-id="${ids.u1}"] button[data-act="approve"]`).innerText()==='확인 완료(승인)'
    &&await page.locator(`.card[data-id="${ids.u1}"] button[data-act="visibility"][data-public="0"]`).count()===1&&await page.locator(`.card[data-id="${ids.u1}"] select.f-reason`).count()===1);
  {const m=await page.locator(`.card[data-id="${ids.multi}"] .meta`).first().innerText();ok(label+': 복수 종 카드 종별 표시(3종, 입력분 5개체)',m.includes('종별: 동박새 3개체 · 박새 2개체 · 쇠딱다구리 (개체수 미입력) — 3종, 개체수 5(입력분)'),m);}
  await page.screenshot({path:`${OUT}/admin-${label}-unverified.png`});
  if(label==='pc'){
    const act=async(id,a)=>{await page.locator(`.card[data-id="${id}"] button[data-act="${a}"]`).first().click();await page.waitForTimeout(1200);};
    await act(ids.u1,'approve');ok('확인 완료 → approved, 공개 대기 목록에서 빠짐',pp(ids.u1).status==='approved'&&!(await pendingIds()).includes(ids.u1));
    await act(ids.u2,'visibility');ok('공개 중지 → 즉시 비공개',pp(ids.u2).pending_public===0&&!(await pendingIds()).includes(ids.u2));
    await act(ids.u3,'reject');ok('사유 없이 반려는 막힘',pp(ids.u3).status==='pending'&&seen.some(m=>m.includes('반려 사유를 선택해 주세요')));
    await page.locator(`.card[data-id="${ids.u3}"] select.f-reason`).selectOption('misidentification');await act(ids.u3,'reject');
    ok('반려(오동정) → 비공개, 감사 이력',pp(ids.u3).status==='rejected'&&lastReason(ids.u3)==='reject:misidentification'&&!(await pendingIds()).includes(ids.u3));
    await tab('pending');ok('공개 중지 건 배지 = 공개 취소',(await badge(ids.u2))==='공개 취소');
    await act(ids.held,'hide');ok('검토 대기 위치 가리기',pp(ids.held).public_lat!=null);
    await tab('rejected');ok('반려 탭 배지 = 반려 · 비공개',(await badge(ids.u3))==='반려 · 비공개');
    await act(ids.u3,'approve');ok('반려 후 재승인',pp(ids.u3).status==='approved'&&lastReason(ids.u3)==='reapprove'||pp(ids.u3).status==='approved',lastReason(ids.u3));
    await tab('approved');ok('승인 탭 배지 = 확인 완료',(await badge(ids.u1))==='확인 완료');
    await act(ids.u1,'unpublish');ok('공개 취소(확인 완료분) → 대기·비공개',pp(ids.u1).status==='pending'&&!(await pendingIds()).includes(ids.u1));
    await tab('pending');ok('공개 취소 배지',(await badge(ids.u1))==='공개 취소');
    ok('작업 결과 안내',['승인했습니다','공개를 중지했습니다','반려했습니다','공개를 취소했습니다','위치를 가렸습니다'].every(w=>seen.some(m=>m.includes(w))),seen.join(' | ').slice(0,300));
    await page.screenshot({path:`${OUT}/admin-pc-after.png`});
  }
  ok(label+': 페이지 오류 없음',errors.length===0,errors.join(' | ').slice(0,200));
  await ctx.close();
}
await browser.close();server.close();
ok('최종 공개 API: 처리하지 않은 복수 종 1건만 미검증',JSON.stringify(await pendingIds())===JSON.stringify([ids.multi]));
auth.restore();
const fail=results.filter(r=>!r.pass);
for(const r of results)console.log((r.pass?'PASS ':'FAIL ')+r.name+(!r.pass&&r.detail?' :: '+r.detail:''));
console.log(`checks ${results.length}, failed ${fail.length}`);fs.writeFileSync(OUT+'/result.json',JSON.stringify(results,null,1));
process.exit(fail.length?1:0);
