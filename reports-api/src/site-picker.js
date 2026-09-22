// 관리자 승인 화면의 탐조 지역 선택 목록을 만드는 코드다.
// 화면(admin-page.js)과 테스트가 같은 원본을 쓰도록 문자열로 내보내고,
// admin-page.js 는 이 문자열을 <script> 안에 그대로 끼워 넣는다.
// 바깥에서 esc() 와 siteList 를 준다(화면은 전역으로, 테스트는 인자로 준다).
//
// 탐조지 정본은 index.html 의 siteData 다. 여기서는 읽어 오기만 하고 이름·좌표를 만들지 않는다.
export const SITE_PICKER_JS = `
// index.html 은 탐조지를 한 번에 선언하지 않는다. 최초 배열 뒤에
// siteData=siteData.concat([...]) 블록이 이어 붙고, 그 블록은 여러 줄에 걸쳐 있다.
// 선언과 concat 을 모두 찾아 합치므로 앞으로 블록이 늘어도 그대로 따라온다.
// 대괄호 짝을 직접 세는 이유는 블록이 한 줄이 아니라 줄 단위로는 자를 수 없기 때문이다.
function matchingBracket(text,open){
  var depth=0, inString=false;
  for(var i=open;i<text.length;i++){
    var c=text.charAt(i);
    if(inString){
      // 역슬래시(92)는 다음 글자를 묶어 읽는다. 문자열 안의 따옴표를 끝으로 착각하지 않게 한다.
      if(c.charCodeAt(0)===92){i++;continue;}
      if(c==='"')inString=false;
      continue;
    }
    if(c==='"'){inString=true;continue;}
    if(c==='[')depth++;
    else if(c===']'){depth--;if(depth===0)return i;}
  }
  return -1;
}

function siteDataArrays(text){
  var found=[];
  var re=/(?:var\\s+siteData\\s*=\\s*|siteData\\s*=\\s*siteData[.]concat[(]\\s*)[[]/g;
  var match;
  while((match=re.exec(text))!==null){
    var open=re.lastIndex-1;
    var close=matchingBracket(text,open);
    if(close<0)continue;
    found.push(text.slice(open,close+1));
    re.lastIndex=close+1;
  }
  return found;
}

// 같은 id 가 두 번 나오면 뒤에 온 것을 버린다(지도의 siteData 순서를 그대로 따른다).
function parseSiteData(text){
  var sites=[], seen={};
  siteDataArrays(text).forEach(function(source){
    JSON.parse(source).forEach(function(site){
      var id=String(site.id);
      if(seen[id])return;
      seen[id]=1;
      sites.push(site);
    });
  });
  return sites;
}

function siteRegion(site){
  return site.region||[site.sido,site.sigungu].filter(Boolean).join(' ');
}

// 검색창과 따로 두는 '선택된 탐조지역' 표시용 이름. 목록의 option 과 같은 형식이다.
function siteChoiceLabel(id){
  var wanted=String(id||'');
  if(!wanted)return '';
  var found=siteList.find(function(site){return String(site.id)===wanted;});
  if(!found)return '';
  var region=siteRegion(found);
  return found.name+(region?' — '+region:'');
}

// 고른 값과 서버에 저장된 값을 함께 보여 준다.
// 검색어만 남고 무엇을 골랐는지 알 수 없던 문제를 여기서 드러낸다.
function sitePickText(selectedId,savedId){
  var selected=String(selectedId||''), saved=String(savedId||'');
  var name=siteChoiceLabel(selected);
  var body=selected?(name||selected):'지정하지 않음(독립 출현 지점)';
  var mark=selected===saved
    ? '<span class="pickSaved">저장됨</span>'
    : '<span class="pickDirty">저장 전 · [탐조 지역 저장]을 누르세요</span>';
  return '선택된 탐조지역: <b>'+esc(body)+'</b> '+mark;
}

// index.html 의 haversineKm 과 같은 식이다. 별도 문서라 함수를 그대로 가져다 쓸 수 없어 같은 계산을 둔다.
function haversineKm(a,b){
  var rad=Math.PI/180, dLat=(b.lat-a.lat)*rad, dLon=(b.lon-a.lon)*rad;
  var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

// null·빈 문자열은 Number() 가 0 으로 바꿔 적도 앞바다로 보내므로 따로 걸러낸다.
function coordinateNumber(value){
  return value===null||value===undefined||value===''?NaN:Number(value);
}

function siteHasCoordinate(site){
  return Number.isFinite(coordinateNumber(site.lat))&&Number.isFinite(coordinateNumber(site.lon));
}

// 관리자만 보는 실제 제보 좌표로 계산한다(공개용 대략 좌표가 아니다).
// 좌표가 없는 탐조지는 거리 계산에서만 빠지고 검색으로는 그대로 찾을 수 있다.
function nearestSites(report,count){
  var from={lat:coordinateNumber(report&&report.lat),lon:coordinateNumber(report&&report.lon)};
  if(!Number.isFinite(from.lat)||!Number.isFinite(from.lon))return [];
  return siteList.filter(siteHasCoordinate)
    .map(function(site){
      return {site:site,km:haversineKm(from,{lat:coordinateNumber(site.lat),lon:coordinateNumber(site.lon)})};
    })
    .sort(function(a,b){return a.km-b.km;})
    .slice(0,count);
}

// 탐조지 이름과 행정구역(시·도, 시·군·구) 어느 쪽을 넣어도 걸리게 한다.
function siteMatches(site,query){
  return (site.name+' '+siteRegion(site)+' '+(site.sido||'')+' '+(site.sigungu||''))
    .toLowerCase().indexOf(query)>=0;
}

// 화면에는 지역명을 앞세운다. 탐조지 ID 는 option 의 value 로만 남아 연결에 쓰인다.
function siteOptionHtml(site,selectedId,km){
  var region=siteRegion(site);
  var label=site.name+(region?' — '+region:'')+(km==null?'':' · 약 '+km.toFixed(1)+'km');
  return '<option value="'+esc(site.id)+'"'+(String(selectedId||'')===String(site.id)?' selected':'')
    +'>'+esc(label)+'</option>';
}

function siteGroupHtml(label,sites,selectedId){
  if(!sites.length)return '';
  return '<optgroup label="'+esc(label)+'">'
    +sites.map(function(site){return siteOptionHtml(site,selectedId,null);}).join('')
    +'</optgroup>';
}

// 검색어가 없으면 제보 위치에서 가까운 5곳을 위에 두고 나머지를 이어 붙인다.
// 검색어가 있으면 맞는 곳만 보여 주고, 지우면 다시 전체 목록이 된다.
// 이미 고른 탐조지는 검색 결과에서 밀려나도 목록에 남긴다. 검색 때문에 연결이 풀리면 안 된다.
function siteOptionsHtml(report,query,selectedId){
  var q=String(query||'').trim().toLowerCase();
  var selected=String(selectedId||'');
  var matched=q?siteList.filter(function(site){return siteMatches(site,q);}):siteList;
  var html='<option value="">— 지정하지 않음(독립 출현 지점) —</option>';
  if(selected&&!matched.some(function(site){return String(site.id)===selected;})){
    html+=siteGroupHtml('현재 선택',siteList.filter(function(site){return String(site.id)===selected;}),selected);
  }
  if(q){
    if(!matched.length){
      return html+'<option value="" disabled>검색 결과가 없습니다. 검색어를 지우면 전체 목록이 나옵니다.</option>';
    }
    return html+siteGroupHtml('검색 결과 '+matched.length+'곳',matched,selected);
  }
  var near=nearestSites(report,5);
  var nearIds={};
  near.forEach(function(hit){nearIds[String(hit.site.id)]=1;});
  if(near.length){
    html+='<optgroup label="제보 위치에서 가까운 탐조지">'
      +near.map(function(hit){return siteOptionHtml(hit.site,selected,hit.km);}).join('')
      +'</optgroup>';
  }
  return html+siteGroupHtml('전체 탐조지',matched.filter(function(site){return !nearIds[String(site.id)];}),selected);
}
`;
