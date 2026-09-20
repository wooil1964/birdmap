// 관리자 승인 화면. 이 Worker 가 직접 서빙하므로 Cloudflare Access 뒤에 놓인다.
// 공개 지도(index.html)에는 이 화면으로 가는 링크를 두지 않는다.
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
.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.actions button{padding:7px 12px;border-radius:6px;border:1px solid transparent;cursor:pointer;font-size:13px}
.approve{background:#2f7d4f;color:#fff}
.reject{background:#fff;border-color:#c0392b;color:#c0392b}
.unpublish{background:#fff;border-color:#8a5f00;color:#8a5f00}
.merge{background:#fff;border-color:#37618a;color:#37618a}
#status{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);padding:9px 16px;border-radius:8px;background:#1c2226;color:#fff;font-size:13px;display:none;z-index:9999;max-width:90vw}
.empty{padding:22px;text-align:center;color:#5a666e}
</style>
</head>
<body>
<header>
  <h1>출현종 제보 승인</h1>
  <span class="who" id="who"></span>
</header>
<nav>
  <button type="button" data-status="pending" aria-pressed="true">승인 대기</button>
  <button type="button" data-status="approved" aria-pressed="false">승인됨</button>
  <button type="button" data-status="rejected" aria-pressed="false">반려됨</button>
  <button type="button" data-status="all" aria-pressed="false">전체</button>
  <input id="speciesQuery" placeholder="종명으로 이력 검색" style="max-width:190px;min-height:36px">
  <button type="button" id="speciesSearchBtn">종별 이력</button>
</nav>
<main>
  <div id="list"><div class="empty">불러오는 중입니다.</div></div>
  <div id="map"></div>
</main>
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
      +(Number(r.pending_public)===1?'황색 마커 공개 중':'공개 보류')+'</span>':'')+'</h2>'
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
    +'<label>기존 지점에 이력 연결</label><select class="f-target"><option value="">— 연결하지 않고 자기 점으로 —</option>'
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
  try{
    var approvedResponse=await fetch('/admin/api/reports?status=approved',{cache:'no-store'});
    var approvedBody=await approvedResponse.json();
    approved=approvedBody.ok?approvedBody.reports:[];
    var response=await fetch('/admin/api/reports?status='+encodeURIComponent(currentStatus),{cache:'no-store'});
    var body=await response.json();
    if(!body.ok)throw new Error(body.error&&body.error.message||'불러오지 못했습니다.');
    reports=body.reports;
    render();
  }catch(error){
    document.getElementById('list').innerHTML='<div class="empty">'+esc(error.message)+'</div>';
  }
}

function numberOrNull(value){var text=String(value||'').trim();return text===''?null:Number(text);}

document.getElementById('list').addEventListener('click',async function(event){
  var button=event.target.closest('button[data-act]');
  var card=event.target.closest('.card');
  if(!card)return;
  if(!button){select(card.dataset.id);return;}
  var act=button.dataset.act;
  var payload={action:act,adminNote:card.querySelector('.f-note').value};
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
  button.disabled=true;
  try{
    var response=await fetch('/admin/api/reports/'+encodeURIComponent(card.dataset.id),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var body=await response.json();
    if(!body.ok)throw new Error(body.error&&body.error.message||'처리하지 못했습니다.');
    toast('처리했습니다: '+act,true);
    await load();
  }catch(error){
    toast(error.message,false);
    button.disabled=false;
  }
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

load();
</script>
</body>
</html>`;
