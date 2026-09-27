// 관리자 승인 화면. 이 Worker 가 직접 서빙하므로 Cloudflare Access 뒤에 놓인다.
// 공개 지도(index.html)에는 이 화면으로 가는 링크를 두지 않는다.
import { SITE_PICKER_JS } from "./site-picker.js";

export const ADMIN_PAGE = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>출현종 제보 승인</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
:root{color-scheme:light}
body{margin:0;font-family:system-ui,'Malgun Gothic',sans-serif;background:#f6f7f8;color:#1c2226}
header{padding:12px 16px;background:#2f7d4f;color:#fff;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header h1{margin:0;font-size:16px}
header .who{font-size:12px;opacity:.9}
nav{display:flex;gap:6px;padding:10px 16px;background:#fff;border-bottom:1px solid #dde2e6;flex-wrap:wrap}
nav button{padding:6px 12px;border:1px solid #bcc6cc;background:#fff;border-radius:6px;cursor:pointer;font-size:13px}
nav button[aria-pressed="true"]{background:#2f7d4f;color:#fff;border-color:#2f7d4f}
main{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;padding:14px 16px;align-items:start}
@media(max-width:860px){main{grid-template-columns:1fr}#map{height:260px;position:static}}
/* 폰 폭에서는 PC 화면을 줄이지 않고 세로로 다시 배치한다. */
@media(max-width:560px){
  header{padding:10px 12px}
  header h1{font-size:15px}
  nav{padding:8px 12px;gap:5px;overflow-x:auto;flex-wrap:nowrap}
  nav button{flex:0 0 auto;min-height:40px}
  main{padding:10px 12px;gap:10px}
  #map{height:220px}
  .card{padding:10px}
  .row{grid-template-columns:1fr}
  input,textarea,select{font-size:16px;min-height:42px}
  .actions{gap:8px}
  .actions button{flex:1 1 calc(50% - 4px);min-height:44px}
}
.histBox{margin-top:8px;padding:8px 10px;background:#f6f7f8;border:1px solid #e3e8eb;border-radius:6px}
.histBox h3{margin:0 0 5px;font-size:12px;color:#5a666e}
.histBox ul{list-style:none;margin:0;padding:0;font-size:12px;line-height:1.6}
.histBox li{padding:4px 0;border-bottom:1px dotted #e3e8eb}
.histBox li:last-child{border-bottom:0}
.consentRow{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:13px;min-height:44px}
.consentRow input{width:20px;height:20px}
.dupWarn{margin-top:7px;padding:6px 9px;border-radius:6px;background:#fff7e6;border:1px solid #d99b16;color:#8a5f00;font-size:12px}
#map{height:420px;border:1px solid #dde2e6;border-radius:8px;position:sticky;top:14px}
.card{background:#fff;border:1px solid #dde2e6;border-radius:8px;padding:12px;margin-bottom:10px}
.card.selected{border-color:#2f7d4f;box-shadow:0 0 0 2px rgba(47,125,79,.15)}
.card h2{margin:0 0 6px;font-size:15px}
.meta{font-size:12px;color:#5a666e;line-height:1.7}
.badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;border:1px solid}
.badge.pending{background:#fff7e6;border-color:#d99b16;color:#8a5f00}
.badge.approved{background:#eefbf1;border-color:#2f7d4f;color:#1d5c37}
.badge.rejected{background:#fdecec;border-color:#c0392b;color:#8d2418}
label{display:block;font-size:12px;color:#5a666e;margin:8px 0 2px}
input,textarea,select{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #bcc6cc;border-radius:6px;font:inherit;font-size:13px}
textarea{min-height:52px;resize:vertical}
.f-siteq{margin-bottom:4px}
.sitePick{margin-top:6px;padding:7px 9px;border-radius:6px;background:#f6f7f8;border:1px solid #e3e8eb;font-size:13px;line-height:1.5}
.sitePick b{color:#1c2226}
.pickSaved{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;border:1px solid #2f7d4f;background:#eefbf1;color:#1d5c37}
.pickDirty{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;border:1px solid #d99b16;background:#fff7e6;color:#8a5f00}
select.f-site option{padding:3px 2px}
select.f-site optgroup{font-size:12px;color:#5a666e}
.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.actions button{padding:7px 12px;border-radius:6px;border:1px solid transparent;cursor:pointer;font-size:13px}
.approve{background:#2f7d4f;color:#fff}
.reject{background:#fff;border-color:#c0392b;color:#c0392b}
.unpublish{background:#fff;border-color:#8a5f00;color:#8a5f00}
.merge{background:#fff;border-color:#37618a;color:#37618a}
#status{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);padding:9px 16px;border-radius:8px;background:#1c2226;color:#fff;font-size:13px;display:none;z-index:9999;max-width:90vw}
.empty{padding:22px;text-align:center;color:#5a666e}
/* 통계 탭 */
#stats{padding:14px 16px}
.sfilters{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;background:#fff;border:1px solid #dde2e6;border-radius:8px;padding:10px}
.sfilters label{margin:0 0 2px}
.sfilters input,.sfilters select{width:auto;min-width:120px}
.sfilters button,.stabs button,.sback{padding:6px 12px;border:1px solid #bcc6cc;background:#fff;border-radius:6px;cursor:pointer;font-size:13px}
.sfilters button.primary,.stabs button[aria-pressed="true"]{background:#2f7d4f;color:#fff;border-color:#2f7d4f}
.scards{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin:10px 0}
.scard{background:#fff;border:1px solid #dde2e6;border-radius:8px;padding:8px 10px}
.scard b{display:block;font-size:20px}
.scard span{font-size:11px;color:#5a666e}
.stabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.snote{font-size:12px;color:#5a666e;margin:6px 0}
.swrap{overflow-x:auto;background:#fff;border:1px solid #dde2e6;border-radius:8px}
.stable{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}
.stable th,.stable td{padding:6px 10px;border-bottom:1px solid #eef1f3;text-align:left}
.stable th{background:#f6f7f8;font-weight:600}
.stable td.n{text-align:right}
.linkbtn{background:none;border:0;color:#37618a;text-decoration:underline;cursor:pointer;font:inherit;padding:0;text-align:left}
@media(max-width:560px){
  #stats{padding:10px 12px}
  .sfilters>div{flex:1 1 calc(50% - 8px)}
  .sfilters input,.sfilters select{width:100%;min-width:0}
}
</style>
</head>
<body>
<header>
  <h1>출현종 제보 승인</h1>
  <span class="who" id="who"></span>
</header>
<nav>
  <button type="button" data-status="pending" aria-pressed="true">승인 대기 <b id="pendingCount">-</b>건</button>
  <button type="button" data-status="approved" aria-pressed="false">승인됨</button>
  <button type="button" data-status="rejected" aria-pressed="false">반려됨</button>
  <button type="button" data-status="all" aria-pressed="false">전체</button>
  <button type="button" id="statsTab" aria-pressed="false">통계</button>
  <input id="speciesQuery" placeholder="종명으로 이력 검색" style="max-width:190px;min-height:36px">
  <button type="button" id="speciesSearchBtn">종별 이력</button>
</nav>
<main>
  <div id="list"><div class="empty">불러오는 중입니다.</div></div>
  <div id="map"></div>
</main>
<section id="stats" style="display:none">
  <form class="sfilters" id="statsForm">
    <div><label>종명</label><input id="sfSpecies" placeholder="정확한 종명"></div>
    <div><label>제보자</label><input id="sfReporter" placeholder="저장된 이름 그대로"></div>
    <div><label>탐조지역</label><select id="sfSite"><option value="">전체</option></select></div>
    <div><label>상태</label><select id="sfStatus">
      <option value="">기본 (생태 통계는 승인만)</option><option value="approved">승인</option>
      <option value="rejected">반려</option><option value="pending">승인 대기</option></select></div>
    <div><label>관찰일 시작</label><input id="sfFrom" type="date"></div>
    <div><label>관찰일 끝</label><input id="sfTo" type="date"></div>
    <div><label>연도</label><input id="sfYear" type="number" min="1900" max="2100" placeholder="YYYY"></div>
    <div><label>월</label><select id="sfMonth"><option value="">전체</option></select></div>
    <div><button type="submit" class="primary">적용</button> <button type="button" id="statsReset">초기화</button></div>
  </form>
  <div class="scards" id="statsCards"></div>
  <div id="statsBody"></div>
</section>
<div id="status" role="status" aria-live="polite"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map').setView([36.5,127.8],7);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var markerLayer=L.layerGroup().addTo(map);
var currentStatus='pending', reports=[], approved=[];
// index.html 의 수동 붉은 점. 좌표·출현종은 그쪽이 정본이고 여기서는 연결 키로만 쓴다.
var FIXED_SPOTS=[
  {key:'fixed:21:0',label:'김제새만금 출현 지점 (35.85129, 126.67617)'},
  {key:'fixed:195:0',label:'평화의공원 출현 지점 1 (37.56325, 126.89693)'},
  {key:'fixed:195:1',label:'평화의공원 출현 지점 2 (37.56756, 126.89122)'}
];

// 탐조 지역 목록. index.html 의 siteData 가 정본이라 여기에 복사해 두지 않고 읽어 온다.
// ponytail: 지도 페이지를 한 번 받아 siteData 줄만 파싱한다. 실패하면 ID 직접 입력으로 넘어간다.
var SITE_LIST_URL='https://wooil1964.github.io/birdmap/index.html';
var siteList=[];

async function loadSiteList(){
  try{
    var response=await fetch(SITE_LIST_URL,{cache:'no-cache'});
    var text=await response.text();
    // 최초 선언과 뒤에 이어 붙는 concat 블록을 모두 읽는다(임곡항 같은 추가 탐조지 누락 방지).
    var parsed=parseSiteData(text);
    if(!parsed.length)throw new Error('siteData 를 찾지 못했습니다.');
    // 좌표는 가까운 탐조지 계산에만 쓰고, 행정구역은 검색과 표시에 쓴다. 정본은 siteData 그대로다.
    siteList=parsed.map(function(site){return {
      id:String(site.id),name:site.name,region:site.region||'',
      sido:site.sido||'',sigungu:site.sigungu||'',lat:site.lat,lon:site.lon
    };});
  }catch(error){
    siteList=[];
  }
}

${SITE_PICKER_JS}

function siteLabel(id){
  var found=siteList.find(function(site){return site.id===String(id);});
  if(!found)return String(id);
  var region=siteRegion(found);
  return found.name+(region?' ('+region+')':'');
}

function siteSelectHtml(r){
  if(!siteList.length){
    return '<label>탐조 지역 ID (목록을 불러오지 못해 직접 입력)</label>'
      +'<input class="f-site" value="'+esc(r.site_id==null?'':r.site_id)+'" placeholder="예: 19">';
  }
  var saved=r.site_id==null?'':String(r.site_id);
  return '<label>탐조 지역 (이 제보를 어느 탐조지의 출현 이력으로 볼지)</label>'
    +'<input class="f-siteq" placeholder="지역명·행정구역으로 검색 (예: 유부도, 서천)" autocomplete="off">'
    +'<select class="f-site" size="6">'
    +siteOptionsHtml(r,'',saved)
    +'</select>'
    // 검색어와 따로 지금 무엇을 골랐는지 보여 준다. data-saved 는 서버에 저장된 값이다.
    +'<div class="sitePick" data-saved="'+esc(saved)+'">'+sitePickText(saved,saved)+'</div>';
}

// 고른 값이 바뀔 때마다 '선택된 탐조지역' 표시를 다시 쓴다.
function refreshSitePick(card){
  var select=card.querySelector('select.f-site');
  var box=card.querySelector('.sitePick');
  if(!select||!box)return;
  box.innerHTML=sitePickText(select.value,box.getAttribute('data-saved'));
}

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function toast(message,ok){var el=document.getElementById('status');el.textContent=message;el.style.background=ok?'#1d5c37':'#8d2418';el.style.display='block';setTimeout(function(){el.style.display='none';},3200);}
function coords(r){return [r.public_lat==null?r.lat:r.public_lat, r.public_lon==null?r.lon:r.public_lon];}

function drawMarkers(){
  markerLayer.clearLayers();
  reports.forEach(function(r){
    var ll=coords(r);
    L.circleMarker(ll,{radius:6,color:r.status==='approved'?'#d32f2f':'#d99b16',weight:2,fillOpacity:.8})
      .bindTooltip(esc(r.species),{sticky:true})
      .on('click',function(){select(r.id);})
      .addTo(markerLayer);
  });
}

function select(id){
  document.querySelectorAll('.card').forEach(function(card){card.classList.toggle('selected',card.dataset.id===id);});
  var r=reports.find(function(x){return x.id===id;});
  if(r){map.setView(coords(r),14);}
  var card=document.querySelector('.card[data-id="'+id+'"]');
  if(card)card.scrollIntoView({block:'nearest',behavior:'smooth'});
}

// 같은 종·같은 관찰일이 이미 있으면 중복일 수 있다고 알린다. 자동으로 지우거나 합치지 않는다.
function duplicateHint(r){
  var mine=String(r.species||'').split(' · ').filter(Boolean);
  var hits=reports.concat(approved).filter(function(o){
    if(o.id===r.id)return false;
    if(String(o.observed_on)!==String(r.observed_on))return false;
    return String(o.species||'').split(' · ').some(function(n){return mine.indexOf(n)>=0;});
  });
  var ids={};hits=hits.filter(function(o){if(ids[o.id])return false;ids[o.id]=1;return true;});
  return hits.length?'<div class="dupWarn">같은 관찰일·같은 종의 다른 제보가 '+hits.length+'건 있습니다. 중복인지 직접 확인하세요.</div>':'';
}

function historyHtml(r){
  var key=r.spot_key||r.id;
  var list=reports.concat(approved).filter(function(o){
    return o.id===key||o.spot_key===key;
  });
  var ids={};list=list.filter(function(o){if(ids[o.id])return false;ids[o.id]=1;return true;});
  list.sort(function(a,b){return String(b.observed_on).localeCompare(String(a.observed_on));});
  if(list.length<2)return '';
  var items=list.map(function(o){
    var who=Number(o.name_public)===1&&o.reporter?esc(o.reporter):'익명 제보';
    return '<li>'+esc(o.observed_on)+' · '+esc(o.species)+' · 제보자: '+who
      +(o.id===r.id?' <b>(이 제보)</b>':'')+' · '+esc(o.status)+'</li>';
  }).join('');
  return '<div class="histBox"><h3>이 지점의 출현 이력 '+list.length+'건 (최근순)</h3><ul>'+items+'</ul></div>';
}

function cardHtml(r){
  var linkOptions=approved.filter(function(a){return a.id!==r.id&&!a.spot_key;})
    .map(function(a){return '<option value="'+esc(a.id)+'">'+esc(a.species)+' ('+Number(a.lat).toFixed(4)+', '+Number(a.lon).toFixed(4)+')</option>';}).join('');
  var fixedOptions=FIXED_SPOTS.map(function(f){return '<option value="'+esc(f.key)+'">'+esc(f.label)+'</option>';}).join('');
  return '<div class="card" data-id="'+esc(r.id)+'">'
    +'<h2>'+esc(r.species)+' <span class="badge '+esc(r.status)+'">'+esc(r.status)+'</span>'
    +(r.merged_into?' <span class="badge approved">다른 지점에 합침</span>':'')
    +(r.status==='pending'?' <span class="badge '+(Number(r.pending_public)===1?'approved':'rejected')+'">'
      +(Number(r.pending_public)===1?'황색 마커 공개 중':'공개 보류')+'</span>':'')
    +' <span class="badge '+(r.site_id?'approved':'rejected')+'">'
      +(r.site_id?'탐조 지역: '+esc(siteLabel(r.site_id)):'탐조 지역 미연결')+'</span></h2>'
    +'<div class="meta">관찰일 '+esc(r.observed_on)+' · 접수 '+esc(String(r.received_at).slice(0,16).replace('T',' '))+' UTC'
    +'<br>좌표 '+Number(r.lat).toFixed(6)+', '+Number(r.lon).toFixed(6)
    +(r.approx_lat!=null?'<br>승인 전 공개 좌표(대략) '+Number(r.approx_lat).toFixed(5)+', '+Number(r.approx_lon).toFixed(5):'')
    +(r.bird_count?'<br>개체수 '+esc(r.bird_count):'')
    +(r.reporter?'<br>제보자 '+esc(r.reporter):'')
    +(r.note?'<br>설명 '+esc(r.note):'')+'</div>'
    +'<label>출현종 (쉼표 또는 · 로 구분)</label><input class="f-species" value="'+esc(r.species)+'">'
    +'<label>관찰일 (YYYY-MM-DD)</label><input class="f-observed" value="'+esc(r.observed_on)+'">'
    +'<div class="row"><div><label>위도</label><input class="f-lat" value="'+esc(r.lat)+'"></div>'
    +'<div><label>경도</label><input class="f-lon" value="'+esc(r.lon)+'"></div></div>'
    +'<div class="row"><div><label>공개 위도 (민감지는 조정)</label><input class="f-plat" value="'+esc(r.public_lat==null?'':r.public_lat)+'"></div>'
    +'<div><label>공개 경도</label><input class="f-plon" value="'+esc(r.public_lon==null?'':r.public_lon)+'"></div></div>'
    +'<label>관리자 메모 (공개되지 않음)</label><textarea class="f-note">'+esc(r.admin_note||'')+'</textarea>'
    +'<label class="consentRow"><input type="checkbox" class="f-consent"'+(Number(r.name_public)===1?' checked':'')+'> 제보자 이름 공개 동의</label>'
    +siteSelectHtml(r)
    +'<label>기존 지점에 이력 연결 (같은 붉은 점으로 묶을 때만)</label><select class="f-target"><option value="">— 연결하지 않고 자기 점으로 —</option>'
    +'<optgroup label="지도에 고정된 붉은 점">'+fixedOptions+'</optgroup>'
    +(linkOptions?'<optgroup label="승인된 제보 지점">'+linkOptions+'</optgroup>':'')+'</select>'
    +(r.spot_key?'<div class="meta">현재 연결: '+esc(r.spot_key)+'</div>':'')
    +duplicateHint(r)
    +historyHtml(r)
    +'<div class="actions">'
    +'<button type="button" class="approve" data-act="approve">승인</button>'
    +'<button type="button" class="reject" data-act="reject">반려</button>'
    +(r.status==='approved'?'<button type="button" class="unpublish" data-act="unpublish">공개 취소</button>':'')
    +'<button type="button" class="merge" data-act="link">선택 지점에 연결</button>'
    +(r.spot_key?'<button type="button" class="merge" data-act="unlink">연결 해제</button>':'')
    +(r.status==='pending'?(Number(r.pending_public)===1
      ?'<button type="button" class="unpublish" data-act="visibility" data-public="0">황색 마커 내리기</button>'
      :'<button type="button" class="merge" data-act="visibility" data-public="1">황색 마커로 공개</button>'):'')
    +'<button type="button" class="merge" data-act="site">탐조 지역 저장</button>'
    +'<button type="button" class="unpublish" data-act="consent">이름 공개 반영</button>'
    +'</div></div>';
}

function render(){
  var list=document.getElementById('list');
  if(!reports.length){list.innerHTML='<div class="empty">해당 상태의 제보가 없습니다.</div>';markerLayer.clearLayers();return;}
  list.innerHTML=reports.map(cardHtml).join('');
  drawMarkers();
}

async function load(){
  document.getElementById('list').innerHTML='<div class="empty">불러오는 중입니다.</div>';
  if(!siteList.length)await loadSiteList();
  try{
    var approvedResponse=await fetch('/admin/api/reports?status=approved',{cache:'no-store'});
    var approvedBody=await approvedResponse.json();
    approved=approvedBody.ok?approvedBody.reports:[];
    var response=await fetch('/admin/api/reports?status='+encodeURIComponent(currentStatus),{cache:'no-store'});
    var body=await response.json();
    if(!body.ok)throw new Error(body.error&&body.error.message||'불러오지 못했습니다.');
    reports=body.reports;
    render();
    // 승인 대기 건수. 승인·반려 뒤에도 load() 가 다시 불리므로 그때마다 새로 센다.
    // 건수 조회가 실패해도 이미 그린 목록은 그대로 둔다(배지만 이전 값 유지).
    var pending=reports;
    if(currentStatus!=='pending'){
      try{
        var pendingBody=await (await fetch('/admin/api/reports?status=pending',{cache:'no-store'})).json();
        pending=pendingBody.ok?pendingBody.reports:null;
      }catch(e){pending=null;}
    }
    if(pending)document.getElementById('pendingCount').textContent=pending.length;
  }catch(error){
    document.getElementById('list').innerHTML='<div class="empty">'+esc(error.message)+'</div>';
  }
}

function numberOrNull(value){var text=String(value||'').trim();return text===''?null:Number(text);}

// 무엇이 처리됐는지 이름으로 알린다. 탐조 지역 저장은 어느 탐조지인지까지 적는다.
function doneMessage(act,payload){
  if(act==='site'||act==='approve'){
    var picked=String(payload.siteId||'');
    var where=picked?(siteChoiceLabel(picked)||('ID '+picked)):'지정하지 않음(독립 출현 지점)';
    return act==='site'
      ? '탐조 지역을 저장했습니다 — '+where
      : '승인했습니다 · 탐조 지역 '+where;
  }
  var labels={reject:'반려했습니다.',unpublish:'공개를 취소했습니다.',
    link:'선택한 지점에 연결했습니다.',unlink:'연결을 해제했습니다.',
    consent:'이름 공개 설정을 반영했습니다.',visibility:'황색 마커 공개 설정을 반영했습니다.'};
  return labels[act]||('처리했습니다: '+act);
}

var adminMutationAttempts={};
document.getElementById('list').addEventListener('click',async function(event){
  var button=event.target.closest('button[data-act]');
  var card=event.target.closest('.card');
  if(!card)return;
  if(!button){select(card.dataset.id);return;}
  var act=button.dataset.act;
  var payload={action:act,adminNote:card.querySelector('.f-note').value};
  if(act==='approve'||act==='site'){
    var siteField=card.querySelector('.f-site');
    payload.siteId=siteField?siteField.value.trim():'';
  }
  if(act==='approve'){
    payload.species=card.querySelector('.f-species').value;
    payload.observedOn=card.querySelector('.f-observed').value;
    payload.lat=Number(card.querySelector('.f-lat').value);
    payload.lon=Number(card.querySelector('.f-lon').value);
    payload.publicLat=numberOrNull(card.querySelector('.f-plat').value);
    payload.publicLon=numberOrNull(card.querySelector('.f-plon').value);
    payload.namePublic=card.querySelector('.f-consent').checked;
  }
  if(act==='consent'){
    payload.namePublic=card.querySelector('.f-consent').checked;
  }
  if(act==='visibility'){
    payload.public=button.dataset.public==='1';
  }
  if(act==='link'){
    var target=card.querySelector('.f-target');
    payload.spotKey=target?target.value:'';
    if(!payload.spotKey){toast('연결할 지점을 먼저 고르세요.',false);return;}
  }
  var loaded=reports.find(function(r){return r.id===card.dataset.id;});
  var attemptKey=card.dataset.id+':'+act;
  if(loaded&&Object.prototype.hasOwnProperty.call(loaded,'revision')){
    if(!Number.isSafeInteger(loaded.revision)){toast('정본이 준비되지 않았습니다. 관리자에게 확인해 주세요.',false);return;}
    payload.expected_revision=loaded.revision;
    var signature=JSON.stringify(payload);
    var previous=adminMutationAttempts[attemptKey];
    if(!previous||previous.signature!==signature)previous=adminMutationAttempts[attemptKey]={signature:signature,id:crypto.randomUUID()};
    payload.request_id=previous.id;
  }
  button.disabled=true;
  try{
    var response=await fetch('/admin/api/reports/'+encodeURIComponent(card.dataset.id),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var body=await response.json();
    if(!body.ok)throw new Error(body.error&&body.error.message||'처리하지 못했습니다.');
    delete adminMutationAttempts[attemptKey];
    toast(doneMessage(act,payload),true);
    await load();
  }catch(error){
    toast(error.message,false);
    button.disabled=false;
  }
});

// 탐조 지역 검색. 고른 값(탐조지 ID)은 그대로 두고 보이는 목록만 다시 만든다.
document.getElementById('list').addEventListener('input',function(event){
  var field=event.target;
  if(!field.classList||!field.classList.contains('f-siteq'))return;
  var card=field.closest('.card');
  if(!card)return;
  var select=card.querySelector('select.f-site');
  if(!select)return;
  var report=reports.find(function(x){return x.id===card.dataset.id;});
  if(!report)return;
  select.innerHTML=siteOptionsHtml(report,field.value,select.value);
  refreshSitePick(card);
});

// 목록에서 탐조지를 고르는 즉시 선택 표시를 갱신한다(마우스 클릭·키보드 모두).
document.getElementById('list').addEventListener('change',function(event){
  var select=event.target;
  if(select.tagName!=='SELECT'||!select.classList||!select.classList.contains('f-site'))return;
  var card=select.closest('.card');
  if(card)refreshSitePick(card);
});

document.getElementById('speciesSearchBtn').addEventListener('click',async function(){
  var name=document.getElementById('speciesQuery').value.trim();
  if(!name){toast('종명을 입력하세요.',false);return;}
  document.getElementById('list').innerHTML='<div class="empty">불러오는 중입니다.</div>';
  try{
    var response=await fetch('/admin/api/reports?species='+encodeURIComponent(name),{cache:'no-store'});
    var body=await response.json();
    if(!body.ok)throw new Error((body.error&&body.error.message)||'불러오지 못했습니다.');
    reports=body.reports;
    render();
    toast(name+' 이력 '+reports.length+'건',true);
  }catch(error){ toast(error.message,false); }
});

document.querySelector('nav').addEventListener('click',function(event){
  var button=event.target.closest('button[data-status]');
  if(!button)return;
  currentStatus=button.dataset.status;
  document.querySelectorAll('nav button').forEach(function(b){b.setAttribute('aria-pressed',String(b===button));});
  load();
});

// ---- 통계 탭 ----
// 상태 탭(data-status)·승인 대기 배지·카드 목록과 별개로 동작한다. 이 화면은 읽기만 한다.
var statsView='species', statsRows=[], statsDrill=null;
var STATS_COLS={
  species:[['species','종명',1],['total','제보'],['approved','승인'],['first_observed','최초 관찰일'],['last_observed','최근 관찰일'],['sites','지역 수'],['reporters','제보자 수']],
  sites:[['site_name','탐조지역',1],['total','제보'],['species','종수'],['last_observed','최근 관찰일'],['reporters','제보자 수']],
  reporters:[['reporter','제보자',1],['total','총 제보'],['approved','승인'],['rejected','반려'],['pending','대기'],['species','종수'],['sites','지역 수'],['last_observed','최근 관찰일']],
  monthly:[['month','월'],['total','제보'],['approved','승인'],['species','종수'],['reporters','제보자 수']],
  yearly:[['year','연도'],['total','제보'],['species','종수'],['reporters','제보자 수'],['sites','지역 수']]
};
var STATUS_LABEL={approved:'승인',rejected:'반려',pending:'승인 대기'};

(function(){
  var month=document.getElementById('sfMonth');
  for(var m=1;m<=12;m++){var v=(m<10?'0':'')+m;month.insertAdjacentHTML('beforeend','<option value="'+v+'">'+m+'월</option>');}
})();

function showStats(on){
  document.querySelector('main').style.display=on?'none':'';
  document.getElementById('stats').style.display=on?'block':'none';
  document.getElementById('statsTab').setAttribute('aria-pressed',String(on));
  if(on){document.querySelectorAll('nav button[data-status]').forEach(function(b){b.setAttribute('aria-pressed','false');});}
  else map.invalidateSize();
}

function fillSiteFilter(){
  var select=document.getElementById('sfSite');
  if(select.dataset.count===String(siteList.length))return;
  select.dataset.count=String(siteList.length);
  var html='<option value="">전체</option><option value="__none__">미연결 지역</option>';
  siteList.slice().sort(function(a,b){return a.name.localeCompare(b.name,'ko');}).forEach(function(s){
    html+='<option value="'+esc(s.id)+'">'+esc(siteLabel(s.id))+'</option>';
  });
  select.innerHTML=html;
}

function statsQuery(view,drill){
  var p=new URLSearchParams();p.set('view',view);
  var fields={species:'sfSpecies',reporter:'sfReporter',status:'sfStatus',from:'sfFrom',to:'sfTo',year:'sfYear',month:'sfMonth'};
  Object.keys(fields).forEach(function(k){var v=document.getElementById(fields[k]).value;if(k!=='reporter')v=v.trim();if(v)p.set(k,v);});
  var site=document.getElementById('sfSite').value;
  if(site==='__none__')p.set('noSite','1');else if(site)p.set('siteId',site);
  Object.keys(drill||{}).forEach(function(k){
    if(k==='noSite'||k==='siteId'){p.delete('noSite');p.delete('siteId');}
    if(k==='noReporter'||k==='reporter'){p.delete('noReporter');p.delete('reporter');}
    p.set(k,drill[k]);
  });
  return '/admin/api/stats?'+p.toString();
}

function kstTime(iso){return new Date(Date.parse(iso)+9*3600*1000).toISOString().slice(0,16).replace('T',' ');}

function statsName(view,r){
  if(view==='sites')return r.site_id==null?'미연결 지역':(r.site_name||('ID '+r.site_id));
  // 앞뒤 공백만 다른 이름은 합치지 않으므로, 화면에서도 구분되게 따옴표로 보여 준다.
  if(view==='reporters')return r.reporter==null?'(이름 미입력)':r.reporter!==r.reporter.trim()?'"'+r.reporter+'" (앞뒤 공백 포함)':r.reporter;
  return r.species;
}

function drillFor(view,r){
  if(view==='species')return {species:r.species};
  if(view==='sites')return r.site_id==null?{noSite:'1'}:{siteId:r.site_id};
  return r.reporter==null?{noReporter:'1'}:{reporter:r.reporter};
}

function renderCards(s,basis){
  var cards=[['총 제보',s.total],['승인',s.approved],['반려',s.rejected],['승인 대기',s.pending],
    ['등록 종수 ('+basis+')',s.species],['참여 제보자 수',s.reporters,'이름 미입력 '+s.anonymous_reports+'건 별도'],['최근 30일 접수',s.recent30,'KST 기준']];
  document.getElementById('statsCards').innerHTML=cards.map(function(c){
    return '<div class="scard"><span>'+esc(c[0])+'</span><b>'+esc(c[1])+'</b>'+(c[2]?'<span>'+esc(c[2])+'</span>':'')+'</div>';
  }).join('');
}

function renderTable(body){
  var cols=STATS_COLS[statsView];
  var basis=body.filters.status?'상태 필터: '+STATUS_LABEL[body.filters.status]:'생태 통계: 승인 제보 기준';
  var tabs=[['species','종별'],['sites','지역별'],['reporters','제보자별'],['monthly','월별'],['yearly','연도별']].map(function(t){
    return '<button type="button" data-view="'+t[0]+'" aria-pressed="'+(t[0]===statsView)+'">'+t[1]+'</button>';
  }).join('');
  var note='<div class="snote">'+esc(basis)+' · 날짜는 관찰일(observed_on) 기준'
    +(statsView==='sites'?' · 지역 통계는 관리자 연결 탐조지역 기준':'')
    +(statsView==='reporters'?(body.filters.status?' · 모든 수치는 선택한 상태 기준':' · 총/승인/반려/대기는 전체 제보, 종수·지역 수는 승인 제보 기준')+'. 이름은 입력값 그대로 묶음':'')+'</div>';
  var head='<tr>'+cols.map(function(c){return '<th>'+esc(c[1])+'</th>';}).join('')+'</tr>';
  var rows=body.rows.map(function(r,i){
    return '<tr>'+cols.map(function(c){
      if(c[2])return '<td><button type="button" class="linkbtn" data-row="'+i+'">'+esc(statsName(statsView,r))+'</button></td>';
      var v=r[c[0]];return '<td'+(typeof v==='number'?' class="n"':'')+'>'+esc(v==null?'':v)+'</td>';
    }).join('')+'</tr>';
  }).join('');
  document.getElementById('statsBody').innerHTML='<div class="stabs">'+tabs+'</div>'+note
    +'<div class="swrap"><table class="stable"><thead>'+head+'</thead><tbody>'
    +(rows||'<tr><td colspan="'+cols.length+'">해당 조건의 자료가 없습니다.</td></tr>')+'</tbody></table></div>';
}

function renderDetail(body,title){
  var rows=body.rows.map(function(r){
    return '<tr><td>'+esc(r.observed_on)+'</td><td>'+esc(r.species)+'</td>'
      +'<td><span class="badge '+esc(r.status)+'">'+esc(STATUS_LABEL[r.status]||r.status)+'</span></td>'
      +'<td>'+esc(r.site_id==null?'미연결 지역':(r.site_name||('ID '+r.site_id)))+'</td>'
      +'<td>'+esc(r.reporter==null?'(이름 미입력)':r.reporter)+'</td><td>'+esc(kstTime(r.received_at))+'</td>'
      +'<td><button type="button" class="linkbtn" data-card="'+esc(r.id)+'" data-rstatus="'+esc(r.status)+'">카드 열기</button></td></tr>';
  }).join('');
  document.getElementById('statsBody').innerHTML='<button type="button" class="sback" id="statsBack">← 통계로</button>'
    +'<div class="snote"><b>'+esc(title)+'</b> — '+body.rows.length+'건 ('+(body.filters.status?STATUS_LABEL[body.filters.status]:'모든 상태')+', 관찰일 최신순)'
    +(body.truncated?' · 최근 '+body.rows.length+'건까지만 표시':'')+'</div>'
    +'<div class="swrap"><table class="stable"><thead><tr><th>관찰일</th><th>종명</th><th>상태</th><th>탐조지역</th><th>제보자</th><th>접수(KST)</th><th></th></tr></thead><tbody>'
    +(rows||'<tr><td colspan="7">해당 조건의 제보가 없습니다.</td></tr>')+'</tbody></table></div>';
}

async function loadStats(){
  document.getElementById('statsBody').innerHTML='<div class="empty">불러오는 중입니다.</div>';
  try{
    var response=await fetch(statsQuery(statsDrill?'list':statsView,statsDrill&&statsDrill.filter),{cache:'no-store'});
    var body=await response.json();
    if(!body.ok)throw new Error(body.error&&body.error.message||'통계를 불러오지 못했습니다.');
    renderCards(body.summary,body.filters.status?STATUS_LABEL[body.filters.status]:'승인');
    if(statsDrill)renderDetail(body,statsDrill.title);else{statsRows=body.rows;renderTable(body);}
  }catch(error){
    document.getElementById('statsBody').innerHTML='<div class="empty">'+esc(error.message)+'</div>';
  }
}

document.getElementById('statsTab').addEventListener('click',async function(){
  showStats(true);
  if(!siteList.length)await loadSiteList();
  fillSiteFilter();
  loadStats();
});
// 다른 탭·종별 이력 검색을 누르면 통계 화면을 닫고 원래 목록으로 돌아간다(그쪽 처리는 기존 핸들러가 한다).
document.querySelector('nav').addEventListener('click',function(event){
  var button=event.target.closest('button');
  if(button&&button.id!=='statsTab')showStats(false);
});
document.getElementById('statsForm').addEventListener('submit',function(event){event.preventDefault();statsDrill=null;loadStats();});
document.getElementById('statsReset').addEventListener('click',function(){document.getElementById('statsForm').reset();statsDrill=null;loadStats();});
document.getElementById('statsBody').addEventListener('click',async function(event){
  var tab=event.target.closest('button[data-view]');
  if(tab){statsView=tab.dataset.view;loadStats();return;}
  var row=event.target.closest('button[data-row]');
  if(row){var r=statsRows[Number(row.dataset.row)];statsDrill={filter:drillFor(statsView,r),title:statsName(statsView,r)};loadStats();return;}
  if(event.target.closest('#statsBack')){statsDrill=null;loadStats();return;}
  var card=event.target.closest('button[data-card]');
  if(card){
    // 기존 상태 탭으로 돌아가 그 제보 카드를 연다.
    showStats(false);
    currentStatus=card.dataset.rstatus;
    document.querySelectorAll('nav button[data-status]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.status===currentStatus));});
    await load();
    select(card.dataset.card);
  }
});

load();
</script>
</body>
</html>`;
