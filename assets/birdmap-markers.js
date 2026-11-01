(function(global){
  'use strict';
  var selected=null, installed=false;
  var colors={red:'#c83232',orange:'#be590d',green:'#218039',blue:'#176eab',purple:'#7642a0',darkred:'#963333',darkblue:'#214a80',darkgreen:'#23613a',darkpurple:'#57336d',cadetblue:'#376b7d',gray:'#5b6470'};
  function map(){return global.map_7010a44f6ac2025090f0fe07508ed485;}
  function clear(){
    var old=selected; selected=null;
    if(!old)return;
    if(old.element)old.element.classList.remove('birdmap-report-emphasized');
    if(old.radius!==undefined)old.layer.setRadius(old.radius);
    old.rings.forEach(function(ring){if(map().hasLayer(ring))map().removeLayer(ring);});
  }
  function select(popup){
    var layer=popup&&popup._source,kind=layer&&layer.options.birdmapMarkerKind;
    if(selected&&selected.popup===popup)return;
    clear();
    if(!kind||!map().hasLayer(layer))return;
    var report=kind==='report',element=layer.getElement&&layer.getElement();
    selected={popup:popup,layer:layer,element:element,rings:[]};
    if(report){
      selected.radius=layer.getRadius(); layer.setRadius(selected.radius*1.1);
      if(element)element.classList.add('birdmap-report-emphasized');
      if(layer.bringToFront)layer.bringToFront();
    }
    var radius=report?selected.radius*1.1+6:15;
    function ring(className,opacity){
      var ring=global.L.circleMarker(layer.getLatLng(),{radius:radius,color:'#fff3a0',weight:2.5,opacity:opacity,fill:false,interactive:false,bubblingMouseEvents:false,className:className}).addTo(map());
      selected.rings.push(ring); return ring;
    }
    ring('birdmap-marker-ring',1);
    if(report&&!global.matchMedia('(prefers-reduced-motion:reduce)').matches){
      // CSS animates element opacity; the SVG stroke must remain paintable.
      var pulse=ring('birdmap-marker-pulse',1);
      var node=pulse.getElement();
      if(node){
        function removePulse(){if(map().hasLayer(pulse))map().removeLayer(pulse);}
        // animationiteration marks the first cycle; animationend follows both.
        node.addEventListener('animationend',removePulse,{once:true});
        node.addEventListener('animationcancel',removePulse,{once:true});
      }
    }
  }
  function install(){
    if(!map()||typeof map().getPane!=='function')return;
    // Report dots must stay clickable inside a site's generous transparent target.
    var pane=map().getPane('birdmap-report-markers')||map().createPane('birdmap-report-markers');
    pane.style.zIndex='610';
    if(installed)return;
    installed=true;
    map().on('popupopen',function(event){select(event.popup);});
    map().on('popupclose',function(event){if(selected&&selected.popup===event.popup)clear();});
    map().on('layerremove',function(event){if(selected&&selected.layer===event.layer)clear();});
  }
  function refreshSites(){
    install();
    (global.siteData||[]).forEach(function(site){
      var marker=(global.markerRegistry||{})[global.markerKey(site)];
      if(!marker||marker.options.birdmapMarkerKind==='site')return;
      var original=marker.options.icon.options,color=colors[original.markerColor]||'#176eab';
      marker.options.birdmapMarkerKind='site';
      marker.setIcon(global.L.divIcon({className:'birdmap-site-marker',html:'<span class="birdmap-site-symbol" style="--birdmap-marker-color:'+color+'"></span>',iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-12],tooltipAnchor:[12,0]}));
    });
  }
  global.birdmapMarkers={refreshSites:refreshSites,prepare:install};
})(window);
