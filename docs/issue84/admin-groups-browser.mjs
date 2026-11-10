// Focused PC/phone statistics check: real admin Worker + SQLite + stubbed Access.
// Only the map library/site catalog are synthetic; no external requests or production DB.
// PLAYWRIGHT_MODULE=<playwright-core dir> CHROME_PATH=<chrome> OUT=<dir> node this-file
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {canonicalDb} from '../../reports-api/test/helpers.mjs';
import {environments,installAuthStubs} from '../../reports-api/local-test/helpers.mjs';
import {handleRequest} from '../../reports-api/src/admin.js';
import {confirmedIdentityAction} from '../../reports-api/src/reporter-identity.js';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const out = path.resolve(process.env.OUT || 'work/admin-groups-browser'); fs.mkdirSync(out,{recursive:true});
const migration = fs.readFileSync(new URL('../../reports-api/migrations/0007_reporter_identity.sql',import.meta.url),'utf8');
const auth = await installAuthStubs();
let env;
const server = http.createServer(async(req,res)=>{
  try {
    assert.equal(req.method,'GET','Browser must never mutate data');
    const response = await handleRequest(new Request('https://admin.example'+req.url,{headers:{'Cf-Access-Jwt-Assertion':auth.token}}),env);
    res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch(error) {res.writeHead(500); res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:'+server.address().port;
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const results=[];
const check = (name,actual,expected) => {assert.deepEqual(actual,expected,name); results.push({name,pass:true});};
function insert(db,id,reporter,species) {
  db.sqlite.prepare(`INSERT INTO reports(id,status,species,reporter,name_public,lat,lon,observed_on,received_at,ip_hash,dedupe_hash)
    VALUES(?,'approved',?,?,1,35.123456,126.654321,'2026-10-02',?,'PRIVATE-IP',?)`)
    .run(id,species,reporter,'2026-10-0'+(id.charCodeAt(0)-96)+'T00:00:00Z',id);
}
try {
  for (const [label,viewport,mobile] of [['pc',{width:1280,height:900},false],['mobile',{width:390,height:844},true]]) {
    const db=canonicalDb(); db.sqlite.exec(migration);
    for (const row of [['a','동명','동박새3 까치5'],['b','동 명','저어새2 동박새3'],['c','동명','박새'],['d','동명 ','찌르레기'],['e','동명','참새']]) insert(db,...row);
    const confirm = reportIds=>confirmedIdentityAction(db,{action:'confirm',reportIds,confirmedSamePerson:true,reason:'합성 본인 확인'},'admin@example.test');
    const first=await confirm(['a','b']),second=await confirm(['c','d']);
    env={...environments(db).admin,REPORTS_CONFIRMED_IDENTITIES:'1',REPORTS_PUBLICATION_REQUIRED:'true'};
    const ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
    await ctx.route('**/*',route=>{
      const u=route.request().url();
      if(u.startsWith(base+'/')) return route.continue();
      if(u==='https://wooil1964.github.io/birdmap/index.html') return route.fulfill({contentType:'text/html',body:'var siteData=[];'});
      if(u.endsWith('/leaflet.js')) return route.fulfill({contentType:'text/javascript',body:`var chain={setView(){return this},addTo(){return this},clearLayers(){return this},invalidateSize(){return this}};var L={map:()=>chain,tileLayer:()=>chain,layerGroup:()=>chain};`});
      return route.fulfill({contentType:'text/css',body:''});
    });
    const page=await ctx.newPage(),errors=[]; page.on('pageerror',e=>errors.push(String(e)));
    const act=async(view,action)=>{
      const [response]=await Promise.all([page.waitForResponse(r=>r.url().includes('/admin/api/stats?')&&new URL(r.url()).searchParams.get('view')===view),action()]);
      const body=await response.json();
      await page.waitForFunction(()=>!document.querySelector('#statsBody').textContent.includes('불러오는 중'));
      return {response,body};
    };
    await page.goto(base+'/admin'); await page.waitForFunction(()=>document.querySelector('#pendingCount').textContent==='0');
    await act('species',()=>page.locator('#statsTab').click());
    let listing=(await act('reporters',()=>page.locator('[data-view="reporters"]').click())).body;
    check(label+': separate same-name rows',listing.rows.map(r=>r.total).sort(),[1,2,2]);
    // Use a Map so neither nickname nor row ordering is an expected identity.
    const groups=new Map([['group:'+first.groupId,['a','b']],['group:'+second.groupId,['c','d']],['name:동명',['e']]]);
    for (const [key,wanted] of groups) {
      const index=listing.rows.findIndex(r=>r.reporter_key===key);
      await page.locator('#sfReporter').fill('다른 이름');
      const {response,body}=await act('list',()=>page.locator('[data-row="'+index+'"]').click());
      const params=new URL(response.url()).searchParams;
      check(label+': key '+key,params.get('reporterKey'),key);
      check(label+': no duplicate nickname '+key,params.getAll('reporter'),['동명']);
      check(label+': isolated IDs '+key,body.rows.map(r=>r.id).sort(),wanted);
      check(label+': count matches listing '+key,body.summary.total,listing.rows[index].total);
      check(label+': detail buttons '+key,await page.locator('#statsBody [data-card]').count(),wanted.length);
      const text=await page.locator('#statsBody').innerText();
      check(label+': no locations/hashes '+key,/35\.123456|126\.654321|PRIVATE-IP|@example/.test(text),false);
      if(key==='group:'+first.groupId) await page.screenshot({path:path.join(out,label+'-group.png'),fullPage:true});
      await page.locator('#sfReporter').fill('');
      listing=(await act('reporters',()=>page.locator('#statsBack').click())).body;
    }
    await page.locator('summary').filter({hasText:'동일인 후보'}).click();
    await page.locator('#identityLoad').click();
    await page.waitForFunction(()=>document.querySelector('#identityReviewRows').textContent.includes('충돌:'));
    check(label+': ambiguous candidate fill blocked',await page.locator('#identityReviewRows button:disabled').count()>0,true);
    const auditBefore=db.count('SELECT COUNT(*) n FROM reporter_identity_events');
    await page.locator('#identityConfirm').click();
    check(label+': explicit confirmation required',await page.locator('#identityMessage').innerText(),'관리자 동일인 확인이 필요합니다.');
    check(label+': review performs no writes',db.count('SELECT COUNT(*) n FROM reporter_identity_events'),auditBefore);
    await page.screenshot({path:path.join(out,label+'-identity-candidates.png'),fullPage:true});
    await page.locator('summary').filter({hasText:'동일인 후보'}).click();
    insert(db,'f','동명','고니');
    let index=listing.rows.findIndex(r=>r.reporter_key==='group:'+first.groupId);
    const after=(await act('list',()=>page.locator('[data-row="'+index+'"]').click())).body;
    check(label+': later same-name report excluded',after.rows.map(r=>r.id).sort(),['a','b']);
    listing=(await act('reporters',()=>page.locator('#statsBack').click())).body;
    index=listing.rows.findIndex(r=>r.reporter_key==='group:'+first.groupId);
    await confirmedIdentityAction(db,{action:'revoke',groupId:first.groupId,reason:'합성 철회'},'admin@example.test');
    const stale=await act('list',()=>page.locator('[data-row="'+index+'"]').click());
    check(label+': revoked key fails closed',stale.response.status(),404);
    check(label+': error contains no other group cards',await page.locator('#statsBody [data-card]').count(),0);
    await page.screenshot({path:path.join(out,label+'-stale.png'),fullPage:true});
    check(label+': no page errors',errors,[]);
    check(label+': no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await ctx.close();
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({syntheticOnly:true,checks:results.length,results},null,2));
  console.log(JSON.stringify({checks:results.length,passed:results.length,out}));
} finally {await browser.close(); server.closeAllConnections(); await new Promise(r=>server.close(r)); auth.restore();}
