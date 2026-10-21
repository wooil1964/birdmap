import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function source(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const stop=html.indexOf('\nfunction ',start+1),candidate=html.slice(start,stop<0?undefined:stop),end=candidate.indexOf('\n}');return end<0?candidate:candidate.slice(0,end+2);}
const anchor={contract:'publication-v1',epoch:'a'.repeat(32),revision:'1',projection:'legacy-public-v1'};
const row=(id,extra={})=>({id,species:['까치'],date:'2020-01-01',locationHidden:false,target:{kind:'spot',spotId:id},...extra});
function page(reports,total=reports.length,offset=0,publication=anchor){return {ok:true,reports,total,offset,limit:20,hasMore:offset+reports.length<total,publication};}
function fixture(){
  let c;
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attributes={};this.isConnected=true;this.value='';this.scrollTop=0;this.classList={add(){}};}
    set textContent(x){this.text=String(x);this.children.forEach(n=>n.isConnected=false);this.children=[];}
    get textContent(){return (this.text||'')+this.children.map(x=>x.textContent).join('');}
    appendChild(n){this.children.push(n);n.parent=this;return n;}
    insertBefore(n,before){const i=before?this.children.indexOf(before):-1;if(i<0)return this.appendChild(n);this.children.splice(i,0,n);n.parent=this;return n;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false;}
    setAttribute(k,v){this.attributes[k]=v;}
    focus(){c.document.activeElement=this;}
    contains(node){return this===node||this.children.some(child=>child.contains(node));}
    querySelectorAll(){return this.controls||this.children.filter(n=>n.tagName==='BUTTON'&&!n.disabled);}
  }
  const nodes=Object.fromEntries(['reportArchiveModal','reportArchiveContent','reportArchiveSearch','reportArchiveMeta'].map(id=>[id,new Node()]));
  const owner=new Node('button'),classes=new Set(),calls=[],timers=new Map(),routes=[];let timer=0;
  c={Number,Set,Array,Promise,encodeURIComponent,REPORT_ARCHIVE_PAGE:20,reportArchiveData:null,reportArchivePublication:null,reportArchiveRequest:0,reportArchiveTimer:0,
    reportArchiveState:'idle',reportArchiveQuery:'',reportArchiveReturnFocus:null,reportArchiveMessage:'',reportSearchIndex:[],reporterStatsWitnesses:new WeakMap(),reportPublicSpots:{},permission:true,
    document:{activeElement:owner,getElementById:id=>nodes[id],createElement:tag=>new Node(tag),body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}},
    publicationSame:(a,b)=>!!a&&!!b&&a.epoch===b.epoch&&a.revision===b.revision,
    publicationDataAllowed:b=>c.permission&&c.publicationSame(b.publication,anchor),publicationRouteCheck:fn=>Promise.resolve(fn()),openReportEntry:(...args)=>routes.push(args),
    publicationFetch:path=>new Promise((resolve,reject)=>calls.push({path,resolve,reject})),
    clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++timer,fn);return timer;},
  };
  vm.createContext(c);vm.runInContext(['reportArchiveCurrent','reportArchivePayload','clearReportArchive','loadReportArchive','searchReportArchive','resetReportArchiveSearch','renderReportArchive','openReportArchive','closeReportArchive','reportArchiveKeydown','openReportArchiveEntry'].map(source).join('\n'),c);
  const flush=()=>new Promise(r=>setImmediate(r));
  return {c,nodes,calls,classes,owner,routes,Node,flush,timers};
}
test('modal fetches all-time page and appends exactly 20 without changing recent limits',async()=>{
  const f=fixture();f.c.openReportArchive();assert.equal(f.nodes.reportArchiveModal.style.display,'flex');assert.equal(f.c.document.activeElement,f.nodes.reportArchiveSearch);assert.match(f.nodes.reportArchiveMeta.textContent,/불러오는/);
  f.calls[0].resolve(page(Array.from({length:20},(_,i)=>row('r'+i)),21));await f.flush();
  assert.equal(f.c.reportArchiveData.reports.length,20);assert.match(f.nodes.reportArchiveMeta.textContent,/21건/);
  const p=f.c.loadReportArchive(true);assert.match(f.calls[1].path,/offset=20/);f.calls[1].resolve(page([row('r20')],21,20));assert.equal(await p,true);assert.equal(f.c.reportArchiveData.reports.length,21);
  assert.match(html,/var RECENT_REPORT_LIMIT=15;/);assert.match(html,/var RECENT_REPORT_DAYS=60;/);
});
test('search covers the server query and late A never overwrites B',async()=>{
  const f=fixture();f.c.openReportArchive();f.nodes.reportArchiveSearch.value='참새';f.c.searchReportArchive(false);
  assert.equal(new URL('https://test'+f.calls[1].path).searchParams.get('q'),'참새');
  f.calls[1].resolve(page([row('B',{species:['참새']})]));await f.flush();f.calls[0].resolve(page([row('A')]));await f.flush();
  assert.equal(f.c.reportArchiveData.reports[0].id,'B');assert.ok(!f.nodes.reportArchiveContent.textContent.includes('까치'));
});
test('input debounce cancels in-flight query immediately and reset requests page zero',async()=>{
  const f=fixture();f.c.openReportArchive();f.nodes.reportArchiveSearch.value='이전검색';f.c.searchReportArchive(true);
  f.calls[0].resolve(page([row('old')]));await f.flush();assert.equal(f.c.reportArchiveData,null);
  f.c.resetReportArchiveSearch();assert.equal(f.timers.size,0);assert.equal(f.nodes.reportArchiveSearch.value,'');assert.match(f.calls[1].path,/offset=0&q=$/);
  f.calls[1].resolve(page([]));await f.flush();assert.match(f.nodes.reportArchiveContent.textContent,/승인된 제보가 없습니다/);
});
test('close and ESC clear pending references, preserve other modal scroll lock, and restore focus',async()=>{
  const f=fixture();f.classes.add('monthTideOpen');f.c.openReportArchive();let stopped=false;
  f.c.reportArchiveKeydown({key:'Escape',preventDefault(){},stopPropagation(){stopped=true;}});
  assert.equal(stopped,true);assert.equal(f.nodes.reportArchiveModal.style.display,'none');assert.equal(f.c.document.activeElement,f.owner);assert.ok(f.classes.has('monthTideOpen'));assert.ok(!f.classes.has('reportArchiveOpen'));
  f.calls[0].resolve(page([row('late')]));await f.flush();assert.equal(f.c.reportArchiveData,null);assert.equal(f.nodes.reportArchiveContent.textContent,'');
});
test('Tab cycles within modal in both directions',()=>{
  const f=fixture(),first=new f.Node('button'),last=new f.Node('button');f.nodes.reportArchiveModal.controls=[first,last];let count=0;
  first.focus();f.c.reportArchiveKeydown({key:'Tab',shiftKey:true,preventDefault(){count++;}});assert.equal(f.c.document.activeElement,last);
  f.c.reportArchiveKeydown({key:'Tab',shiftKey:false,preventDefault(){count++;}});assert.equal(f.c.document.activeElement,first);assert.equal(count,2);
});
test('empty/error/retry has feedback and never exposes transport errors',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].reject(new Error('private transport sentinel'));await f.flush();assert.equal(f.c.reportArchiveState,'failed');assert.match(f.nodes.reportArchiveContent.textContent,/다시 시도/);assert.ok(!f.nodes.reportArchiveContent.textContent.includes('sentinel'));
  f.nodes.reportArchiveSearch.value='없는종';f.c.searchReportArchive(false);f.calls[1].resolve(page([]));await f.flush();assert.match(f.nodes.reportArchiveContent.textContent,/검색 결과가 없습니다/);
});
test('publication barrier discards loaded and pending pages synchronously',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page(Array.from({length:20},(_,i)=>row('r'+i)),21));await f.flush();
  const p=f.c.loadReportArchive(true);f.c.clearReportArchive();assert.equal(f.c.reportArchiveData,null);assert.equal(f.c.reportArchivePublication,null);assert.ok(!f.nodes.reportArchiveContent.textContent.includes('까치'));
  f.calls[1].resolve(page([row('late')],21,20));assert.equal(await p,false);assert.equal(f.c.reportArchiveData,null);
  assert.match(source('publicationInvalidate'),/clearReportArchive\(\)/);
});
test('page from a different revision is never appended',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page(Array.from({length:20},(_,i)=>row('r'+i)),21));await f.flush();
  const p=f.c.loadReportArchive(true);f.calls[1].resolve(page([row('late')],21,20,{...anchor,revision:'2'}));assert.equal(await p,false);assert.equal(f.c.reportArchiveData.reports.length,20);
});
test('hidden rows ignore hostile location fields, render no map controls and cannot navigate',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page([row('private',{locationHidden:true,siteName:'secret-site',region:'secret-region',lat:37})]));await f.flush();
  assert.equal(f.c.reportArchiveData.reports[0].target,undefined);assert.ok(!f.nodes.reportArchiveContent.textContent.includes('secret'));assert.match(f.nodes.reportArchiveContent.textContent,/위치 비공개/);
  await f.c.openReportArchiveEntry('private');assert.equal(f.routes.length,0);
  const item=f.nodes.reportArchiveContent.children[0];assert.equal(item.children[0].tagName,'DIV');
});
test('current row reuses original approved marker entry only after fresh route gate',async()=>{
  const f=fixture(),entry={kind:'spot',spotId:'public',date:'2020-01-01',lat:37,lon:127};f.c.reportSearchIndex=[entry];f.c.reporterStatsWitnesses.set(entry,'public');f.c.reportPublicSpots.public={};
  f.c.openReportArchive();f.calls[0].resolve(page([row('public')]));await f.flush();assert.equal(await f.c.openReportArchiveEntry('public'),true);assert.equal(f.routes[0][0],entry);assert.equal(f.routes[0][1],true);
});
test('permission withdrawal during route check never moves or reopens old marker',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page([row('public')]));await f.flush();
  f.c.publicationRouteCheck=fn=>{f.c.clearReportArchive();return Promise.resolve(fn());};assert.equal(await f.c.openReportArchiveEntry('public'),false);assert.equal(f.routes.length,0);
});
test('invalid payload and duplicate page cannot restore or append data',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page([row('bad')],22));await f.flush();assert.equal(f.c.reportArchiveData,null);assert.equal(f.c.reportArchiveState,'failed');
  const p=f.c.loadReportArchive(false);f.calls[1].resolve(page(Array.from({length:20},(_,i)=>row('r'+i)),21));await p;
  const more=f.c.loadReportArchive(true);f.calls[2].resolve(page([row('r0')],21,20));assert.equal(await more,false);assert.equal(f.c.reportArchiveData,null);
});

test('more preserves scroller, query, existing nodes and focused button during loading and append',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page(Array.from({length:20},(_,i)=>row('r'+i)),41));await f.flush();
  const content=f.nodes.reportArchiveContent,first=content.children[0],more=content.children.at(-1);
  content.scrollTop=720;more.focus();const p=f.c.loadReportArchive(true);
  assert.equal(content.children[0],first);assert.equal(content.children.at(-1),more);assert.equal(f.c.document.activeElement,more);assert.equal(content.scrollTop,720);assert.equal(more.attributes['aria-disabled'],'true');assert.notEqual(more.disabled,true);
  assert.equal(await f.c.loadReportArchive(true),false);assert.equal(f.calls.length,2);
  f.calls[1].resolve(page(Array.from({length:20},(_,i)=>row('r'+(i+20))),41,20));assert.equal(await p,true);
  assert.equal(content.children[0],first);assert.equal(content.children.at(-1),more);assert.equal(f.c.document.activeElement,more);assert.equal(content.scrollTop,720);assert.equal(more.attributes['aria-disabled'],'false');
  const final=f.c.loadReportArchive(true);f.calls[2].resolve(page([row('last',{locationHidden:true})],41,40));await final;
  assert.equal(content.children.at(-1),more);assert.equal(more.textContent,'모두 불러왔습니다.');assert.equal(more.attributes['aria-disabled'],'true');assert.equal(f.c.document.activeElement,more);assert.equal(content.scrollTop,720);
  assert.equal(await f.c.loadReportArchive(true),false);assert.equal(f.calls.length,3);
});
test('new search supersedes a pending appended page without changing its query',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page(Array.from({length:20},(_,i)=>row('r'+i)),21));await f.flush();
  const pending=f.c.loadReportArchive(true);f.nodes.reportArchiveSearch.value='새검색';f.c.searchReportArchive(false);
  f.calls[2].resolve(page([row('new')]));await f.flush();f.calls[1].resolve(page([row('old')],21,20));assert.equal(await pending,false);
  assert.equal(f.c.reportArchiveQuery,'새검색');assert.equal(f.nodes.reportArchiveSearch.value,'새검색');assert.equal(f.c.reportArchiveData.reports[0].id,'new');
});
test('permission barrier clears incremental DOM/cache and keeps keyboard inside visible dialog',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page(Array.from({length:20},(_,i)=>row('r'+i)),21));await f.flush();
  const content=f.nodes.reportArchiveContent;content.children.at(-1).focus();assert.ok(content._reportArchiveView);
  f.c.clearReportArchive();assert.equal(content._reportArchiveView,null);assert.ok(!content.textContent.includes('까치'));assert.equal(f.c.document.activeElement,f.nodes.reportArchiveSearch);
});
test('closed modal has no retained incremental cache or rows',async()=>{
  const f=fixture();f.c.openReportArchive();f.calls[0].resolve(page([row('private')]));await f.flush();f.c.closeReportArchive();
  assert.equal(f.nodes.reportArchiveContent._reportArchiveView,null);assert.equal(f.nodes.reportArchiveContent.children.length,0);assert.equal(f.c.document.activeElement,f.owner);
});
