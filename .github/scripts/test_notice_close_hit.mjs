/* L01 회귀: PC에서 공지 패널의 닫기 버튼이 다른 버튼에 가려지지 않고 실제로 클릭되는지 검증한다.
   실제 index.html을 Chromium(CDP)으로 띄워 elementFromPoint와 진짜 click 이벤트로 확인한다.
   Playwright/Puppeteer 없이 Node 내장 WebSocket + 사전 설치된 Chromium만 사용한다.
   실행: node --test .github/scripts/test_notice_close_hit.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE_URL = pathToFileURL(join(ROOT, 'index.html')).href;
const BINARIES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  process.env.CHROME_PATH,
].filter(Boolean);
const CHROME = BINARIES.find((path) => existsSync(path));

/* 최소 CDP 클라이언트. 새 의존성 없이 브라우저를 직접 몬다. */
class Browser {
  static async launch() {
    const profile = mkdtempSync(join(tmpdir(), 'birdmap-cdp-'));
    const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--no-sandbox',
      '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
      '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DevTools 미기동:\n' + stderr.slice(0, 500))), 30000);
      proc.stderr.on('data', (chunk) => {
        stderr += chunk;
        const match = stderr.match(/ws:\/\/\S+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const socket = new WebSocket(endpoint);
    await new Promise((resolve) => socket.addEventListener('open', resolve));
    return new Browser(proc, socket, profile);
  }

  constructor(proc, socket, profile) {
    this.proc = proc; this.socket = socket; this.profile = profile;
    this.seq = 0; this.pending = new Map(); this.waiters = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      } else if (message.method) {
        this.waiters = this.waiters.filter((w) => (w.method === message.method ? (w.resolve(message), false) : true));
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  once(method) {
    return new Promise((resolve) => this.waiters.push({ method, resolve }));
  }

  async open({ width, height, mobile = false }) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Page.enable', {}, sessionId);
    await this.send('Runtime.enable', {}, sessionId);
    await this.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    const loaded = this.once('Page.loadEventFired');
    await this.send('Page.navigate', { url: PAGE_URL }, sessionId);
    await loaded;
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await this.send('Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.text + ' ' + (exceptionDetails.exception?.description || ''));
      return result.value;
    };
    /* 지도 CDN이 차단된 환경에서도 상단 UI/패널은 정적으로 렌더된다. 함수 선언은 호이스팅되어 살아 있다. */
    assert.equal(await evaluate('typeof toggleNoticePanel'), 'function', '공지 토글 함수를 찾지 못했다');
    return { evaluate, close: () => this.send('Target.closeTarget', { targetId }) };
  }

  dispose() {
    try { this.socket.close(); } catch { /* 이미 닫힘 */ }
    this.proc.kill();
    try { rmSync(this.profile, { recursive: true, force: true }); } catch { /* 임시 프로필 */ }
  }
}

/* 페이지 안에서 실행할 측정 코드. 실제 rect와 elementFromPoint, 진짜 click을 쓴다. */
const MEASURE = `(function(){
  var panel=document.getElementById('noticePanel');
  var close=panel.querySelector('.panelHeader button');
  var today=document.getElementById('todayToggleBtn');
  var notice=document.getElementById('noticeToggleBtn');
  function rect(el){var r=el.getBoundingClientRect();return {top:Math.round(r.top),left:Math.round(r.left),right:Math.round(r.right),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)};}
  function describe(el){if(!el)return null;var node=el.closest('button,#noticePanel,#todayPanel,#monthTideModal')||el;
    return {id:node.id||'',tag:node.tagName,text:(node.textContent||'').trim().slice(0,18),
      inNoticePanel:!!(el.closest&&el.closest('#noticePanel')),isCloseButton:el===close||el.closest('.panelHeader button')===close};}
  var cr=rect(close);
  var cx=Math.round((cr.left+cr.right)/2), cy=Math.round((cr.top+cr.bottom)/2);
  var hit=document.elementFromPoint(cx,cy);
  var tr=rect(today);
  var overlaps=!(cr.right<tr.left||cr.left>tr.right||cr.bottom<tr.top||cr.top>tr.bottom);
  return {panel:rect(panel),close:cr,today:tr,notice:rect(notice),
    closeCenter:{x:cx,y:cy},hit:describe(hit),closeOverlapsToday:overlaps,
    panelZ:getComputedStyle(panel).zIndex,todayZ:getComputedStyle(today).zIndex,
    panelTop:getComputedStyle(panel).top,todayTop:getComputedStyle(today).top,
    panelDisplay:panel.style.display};
})()`;

const OPEN_NOTICE = "toggleNoticePanel(true); document.getElementById('noticePanel').style.display";

const DESKTOP = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 },
  { width: 1440, height: 900 }, { width: 1536, height: 864 }];
const MOBILE = [{ width: 360, height: 800, mobile: true }, { width: 390, height: 844, mobile: true },
  { width: 412, height: 915, mobile: true }];
/* L01에 실제로 영향을 주는 상태만 조합한다: 공지 본문 길이(패널 높이)와 패널 open/closed. */
const CONTENT_STATES = {
  '실제 notices.json': '',
  '긴 공지 본문': "document.getElementById('noticeList').innerHTML='<div class=\"noticeCard\">'+'<div class=\"noticeContent\">긴 본문 </div>'.repeat(40)+'</div>';",
  '공지 없음': "document.getElementById('noticeList').textContent='현재 게시 중인 기획글이 없습니다.';",
};

let browser;
test.before(async () => {
  assert.ok(CHROME, '사전 설치된 Chromium을 찾지 못했다');
  browser = await Browser.launch();
});
test.after(() => browser && browser.dispose());

test('A/B. PC에서 공지 닫기 버튼 중심의 hit target이 닫기 버튼이다 (1366·1920 필수)', async () => {
  for (const viewport of DESKTOP) {
    for (const [label, setup] of Object.entries(CONTENT_STATES)) {
      const page = await browser.open(viewport);
      try {
        if (setup) await page.evaluate(setup);
        assert.equal(await page.evaluate(OPEN_NOTICE), 'block');
        const m = await page.evaluate(MEASURE);
        const where = viewport.width + 'x' + viewport.height + ' / ' + label;
        assert.equal(m.hit.isCloseButton, true,
          where + ' : 닫기 중심(' + m.closeCenter.x + ',' + m.closeCenter.y + ') 의 hit target이 ' +
          JSON.stringify(m.hit) + ' 이다');
        assert.equal(m.closeOverlapsToday, false, where + ' : 닫기 버튼이 todayToggleBtn과 겹친다');
      } finally { await page.close(); }
    }
  }
});

test('C. 공지 열린 상태에서 닫기 버튼을 실제로 클릭하면 패널이 닫힌다', async () => {
  for (const viewport of DESKTOP.slice(0, 2)) {
    const page = await browser.open(viewport);
    try {
      await page.evaluate(OPEN_NOTICE);
      const clicked = await page.evaluate(`(function(){
        var panel=document.getElementById('noticePanel');
        var close=panel.querySelector('.panelHeader button');
        var r=close.getBoundingClientRect();
        var x=Math.round((r.left+r.right)/2), y=Math.round((r.top+r.bottom)/2);
        var target=document.elementFromPoint(x,y);
        if(!target)return {dispatched:false,display:panel.style.display};
        target.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
        return {dispatched:true,hitWasClose:target===close||target.closest('.panelHeader button')===close,
          display:panel.style.display};
      })()`);
      const where = viewport.width + 'x' + viewport.height;
      assert.equal(clicked.dispatched, true, where);
      assert.equal(clicked.hitWasClose, true, where + ' : 클릭이 닫기 버튼에 닿지 않았다');
      assert.equal(clicked.display, 'none', where + ' : 닫기 클릭 후에도 패널이 열려 있다');
    } finally { await page.close(); }
  }
});

test('D. todayToggleBtn은 공지 열림/닫힘 양쪽에서 정상 클릭된다', async () => {
  for (const viewport of DESKTOP.slice(0, 2)) {
    const page = await browser.open(viewport);
    try {
      const probe = `(function(open){
        var notice=document.getElementById('noticePanel');
        toggleNoticePanel(open);
        var btn=document.getElementById('todayToggleBtn');
        var r=btn.getBoundingClientRect();
        var x=Math.round((r.left+r.right)/2), y=Math.round((r.top+r.bottom)/2);
        var target=document.elementFromPoint(x,y);
        var reachable=!!target&&(target===btn||btn.contains(target));
        var pe=getComputedStyle(btn).pointerEvents;
        if(reachable)target.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
        return {reachable:reachable,pointerEvents:pe,
          todayPanel:document.getElementById('todayPanel').style.display,
          noticePanel:notice.style.display};
      })`;
      const closedState = await page.evaluate(probe + '(false)');
      assert.equal(closedState.reachable, true, viewport.width + ' : 공지 닫힘 상태에서 추천 버튼이 가려졌다');
      assert.notEqual(closedState.pointerEvents, 'none', '추천 버튼에 pointer-events:none 우회를 쓰면 안 된다');
      assert.equal(closedState.todayPanel, 'block', '추천 버튼 클릭이 동작하지 않았다');

      const openState = await page.evaluate(probe + '(true)');
      assert.equal(openState.reachable, true, viewport.width + ' : 공지 열림 상태에서 추천 버튼이 가려졌다');
      assert.equal(openState.todayPanel, 'block', '공지 열림 상태에서 추천 버튼 클릭이 동작하지 않았다');
    } finally { await page.close(); }
  }
});

test('E. 모바일은 기존 배치와 동작을 그대로 유지한다', async () => {
  for (const viewport of MOBILE) {
    const page = await browser.open(viewport);
    try {
      assert.equal(await page.evaluate(OPEN_NOTICE), 'block');
      const m = await page.evaluate(MEASURE);
      const where = viewport.width + 'x' + viewport.height;
      assert.equal(m.hit.isCloseButton, true, where + ' : 모바일 닫기 hit target이 ' + JSON.stringify(m.hit));
      /* 모바일에서는 상단 버튼이 grid(static)이라 패널이 그 아래에 온다. */
      assert.ok(m.panel.top >= m.today.bottom, where + ' : 패널이 상단 버튼 위로 올라왔다');
      assert.ok(m.panel.left <= 10 && m.panel.right >= viewport.width - 10, where + ' : 모바일 패널 폭이 바뀌었다');
      const closed = await page.evaluate(`(function(){
        var p=document.getElementById('noticePanel');
        var c=p.querySelector('.panelHeader button');
        var r=c.getBoundingClientRect();
        document.elementFromPoint(Math.round((r.left+r.right)/2),Math.round((r.top+r.bottom)/2))
          .dispatchEvent(new MouseEvent('click',{bubbles:true}));
        return p.style.display;})()`);
      assert.equal(closed, 'none', where + ' : 모바일 닫기가 동작하지 않았다');
    } finally { await page.close(); }
  }
});

test('F. 다른 overlay(추천 패널·월간 조석 모달)의 stacking 회귀가 없다', async () => {
  for (const viewport of DESKTOP.slice(0, 2)) {
    const page = await browser.open(viewport);
    try {
      const stack = await page.evaluate(`(function(){
        function z(id){return Number(getComputedStyle(document.getElementById(id)).zIndex)||0;}
        toggleTodayPanel(true);
        var todayPanel=document.getElementById('todayPanel');
        var tp=todayPanel.getBoundingClientRect();
        var tHit=document.elementFromPoint(Math.round((tp.left+tp.right)/2),Math.round(tp.top+12));
        var todayClose=todayPanel.querySelector('.panelHeader button');
        var tc=todayClose.getBoundingClientRect();
        var tcHit=document.elementFromPoint(Math.round((tc.left+tc.right)/2),Math.round((tc.top+tc.bottom)/2));
        var closeWorks=!!tcHit&&(tcHit===todayClose||todayClose.contains(tcHit));
        if(closeWorks)tcHit.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        var afterClose=todayPanel.style.display;
        var modal=document.getElementById('monthTideModal');
        modal.style.display='flex';
        var mr=modal.getBoundingClientRect();
        var mHit=document.elementFromPoint(Math.round((mr.left+mr.right)/2),Math.round((mr.top+mr.bottom)/2));
        var modalOnTop=!!mHit&&!!mHit.closest('#monthTideModal');
        modal.style.display='none';
        return {noticeZ:z('noticePanel'),todayPanelZ:z('todayPanel'),todayBtnZ:z('todayToggleBtn'),
          noticeBtnZ:z('noticeToggleBtn'),modalZ:z('monthTideModal'),
          todayPanelReachable:!!tHit&&!!tHit.closest('#todayPanel'),
          todayCloseWorks:closeWorks,todayPanelAfterClose:afterClose,modalOnTop:modalOnTop};
      })()`);
      const where = viewport.width + 'x' + viewport.height;
      assert.equal(stack.todayPanelReachable, true, where + ' : 추천 패널이 다른 요소에 묻혔다');
      assert.equal(stack.todayCloseWorks, true, where + ' : 추천 패널 닫기가 가려졌다');
      assert.equal(stack.todayPanelAfterClose, 'none', where + ' : 추천 패널이 닫히지 않았다');
      assert.equal(stack.modalOnTop, true, where + ' : 월간 조석 모달이 다른 UI 아래로 들어갔다');
      assert.ok(stack.modalZ >= stack.noticeZ, where + ' : 모달이 공지보다 아래다');
      assert.ok(stack.noticeZ <= stack.noticeBtnZ, where + ' : 공지 패널이 상단 버튼보다 위로 올라갔다');
    } finally { await page.close(); }
  }
});
