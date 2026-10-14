import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import vm from'node:vm';
const html=readFileSync('index.html','utf8');
const names=['publicationInvalidate','clearRenderedSiteHistories','renderSiteHistory','setSiteHistoryCount','siteHistoryBoxIn','initSiteHistory'];
const sources=names.map(name=>{const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);if(start<0||end<0)throw new Error('source missing');return html.slice(start,end);}).join('\n');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};}
function env(){
 let c;const nodes=[];
 function box(connected=true){const list={_html:'SYNTHETIC_PRIVATE_NAME',className:'siteHistoryList',get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.more=value.includes('siteHistoryMoreBtn')?{disabled:false,addEventListener(name,fn){this.listener=fn;}}:null;},get textContent(){return this._html;},set textContent(value){this._html=value;this.more=null;},querySelector(){return this.more;}};const badge={textContent:'1건'};const box={connected,_birdmapLoaded:[{reporter:'SYNTHETIC_PRIVATE_NAME',species:['SYNTHETIC_SPECIES']}],staticProfile:'STATIC_PROFILE_UNCHANGED',querySelector(name){return name==='.siteHistoryList'?list:badge;}};const root={querySelector(){return box;},querySelectorAll(){return[box];}};const popup={getElement(){return root;},getContent(){return root;},update(){}};nodes.push(box);return{box,list,badge,root,popup};}
 const live=box(),stored=box(false);const requests=[];
 c={document:{hidden:false,body:{contains(node){return node.connected===true;}},querySelectorAll(selector){return selector==='.siteHistoryBox'?[live.box]:[];}},publicationState:{generation:1,ready:true},publicationExpiryTimer:0,reportSpotLayers:{},reportPendingLayers:{},reportSearchIndex:[],reportFixedHistory:{},recentSiteSightings:{},reporterStatsWitnesses:new WeakMap(),WeakMap,markerRegistry:{saved:{getPopup(){return stored.popup;}}},clearSiteHistoryCache(){},clearContributors(){},closeReporterStats(){},publicationNotice(){},clearTimeout(){},publicationAllowed(){return c.publicationState.ready;},publicationDataAllowed(data){return c.publicationState.ready&&data.eligible===true;},siteHistoryEntryHtml(entry){return '<div>'+entry.reporter+'</div>';},fetchSiteHistory(){const d=deferred();requests.push(d);return d.promise;}};
 vm.createContext(c);vm.runInContext(sources,c);return{c,live,stored,requests};
}
const cases=[];function check(id,pass){cases.push({id,pass:!!pass});}
{
 const e=env();e.c.publicationInvalidate('synthetic-expiry');
 check('live-name-and-button-removed',!e.live.list.innerHTML.includes('SYNTHETIC_PRIVATE_NAME'));
 check('live-loaded-reference-cleared',e.live.box._birdmapLoaded.length===0);
 check('stored-popup-name-removed',!e.stored.list.innerHTML.includes('SYNTHETIC_PRIVATE_NAME'));
 check('stored-popup-loaded-reference-cleared',e.stored.box._birdmapLoaded.length===0);
 check('static-profile-preserved',e.live.box.staticProfile==='STATIC_PROFILE_UNCHANGED');
}
{
 const e=env();e.live.box._birdmapLoaded=[];e.c.initSiteHistory({id:'1'},e.live.popup);e.c.publicationInvalidate('synthetic-expiry');e.requests[0].resolve({eligible:true,total:1,history:[{reporter:'SYNTHETIC_LATE_NAME'}]});await new Promise(r=>setImmediate(r));check('late-initial-history-not-restored',!e.live.list.innerHTML.includes('SYNTHETIC_LATE_NAME')&&e.live.box._birdmapLoaded.length===0);
}
{
 const e=env();e.live.box._birdmapLoaded=[];e.c.renderSiteHistory(e.live.box,{id:'1'},{eligible:true,total:2,history:[{reporter:'SYNTHETIC_FIRST_NAME'}]},e.live.popup);e.live.list.more.listener({stopPropagation(){}});e.c.publicationInvalidate('synthetic-expiry');e.requests[0].resolve({eligible:true,total:2,history:[{reporter:'SYNTHETIC_LATE_NAME'}]});await new Promise(r=>setImmediate(r));check('late-more-history-not-restored',!e.live.list.innerHTML.includes('SYNTHETIC_LATE_NAME')&&e.live.box._birdmapLoaded.length===0);
}
{
 const e=env();e.live.box._birdmapLoaded=[];e.c.initSiteHistory({id:'1'},e.live.popup);e.requests[0].resolve({eligible:true,total:1,history:[{reporter:'SYNTHETIC_NORMAL_NAME'}]});await new Promise(r=>setImmediate(r));check('normal-initial-history-maintained',e.live.list.innerHTML.includes('SYNTHETIC_NORMAL_NAME')&&e.live.box._birdmapLoaded.length===1);
}
for(const kind of ['disconnected','wrong-popup','unverified']){const e=env();e.live.box._birdmapLoaded=[];if(kind==='disconnected')e.live.box.connected=false;const popup=kind==='wrong-popup'?e.stored.popup:e.live.popup;e.c.renderSiteHistory(e.live.box,{id:'1'},{eligible:kind!=='unverified',total:1,history:[{reporter:'SYNTHETIC_REJECTED'}]},popup);check(kind+'-render-denied',e.live.box._birdmapLoaded.length===0&&!e.live.list.innerHTML.includes('SYNTHETIC_REJECTED'));}
const pass=cases.filter(x=>x.pass).length,fail=cases.length-pass;console.log(JSON.stringify({method:'Independent actual-function VM probe; synthetic DOM only',indexWorkingSha256:createHash('sha256').update(html).digest('hex'),pass,fail,cases},null,2));process.exitCode=fail?1:0;