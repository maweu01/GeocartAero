/* ================================================================
   AeroGIS Pro v5 — Application Logic
   All fetch() calls use RELATIVE paths (no leading /)
   Compatible with GitHub Pages subdirectory & local file://
================================================================ */
'use strict';

/* ── STATE ── */
const S = {
  map: null,
  drawCtrl: null,
  drawLayer: null,
  aoiLayer: null,
  flightLinesLayer: null,
  waypointLayer: null,
  nfzLayer: null,
  trafficLayer: null,
  baseTiles: {},
  overlayTiles: {},
  waypoints: [],
  currentShape: 'rectangle',
  currentMod: 'planner',
  currentAssess: 'realEstate',
  currentCD: 'landuse',
  selectedAC: null,
  selectedSensor: null,
  aircraftDB: { manned: [], uav: [] },
  sensorDB: [],
  layersCfg: { basemaps: [], overlays: [] },
  nfzData: [],
  droneLog: [],
  telemTimer: null,
  demoTimer: null,
  telem: { alt:0, spd:0, bat:100, hdg:0, sig:0, dst:0 },
  telemHist: { alt:[], bat:[] },
  wxCache: null,
  mapCenter: { lat:-1.286389, lng:36.817223 },
  activeOverlays: new Set()
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', function() {
  initMap();
  loadDatabases().then(function() {
    initAllModules();
    startClock();
    loadDemoLog();
    setStatus('AeroGIS Pro v5 ready');
    toast('Platform loaded', 'g');
  });
  document.getElementById('log-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('conn-method').addEventListener('change', onConnMethod);
});

/* ─── DATABASE LOADING (relative paths — works everywhere) ─── */
async function loadDatabases() {
  try {
    // All paths RELATIVE — resolve against <base href> tag
    const [acR, snR, lyR] = await Promise.all([
      fetch('aircraft_database.json'),
      fetch('sensor_database.json'),
      fetch('layers_config.json')
    ]);
    if (!acR.ok || !snR.ok || !lyR.ok) throw new Error('Fetch failed');
    const [ac, sn, ly] = await Promise.all([acR.json(), snR.json(), lyR.json()]);
    S.aircraftDB = { manned: ac.manned || [], uav: ac.uav || [] };
    S.sensorDB   = sn.sensors || [];
    S.layersCfg  = ly;
  } catch(e) {
    console.warn('JSON fetch failed (normal on file://), using built-in data:', e.message);
    useBuiltinData();
  }

  // Load NFZ GeoJSON (relative path)
  try {
    const nfzR = await fetch('data/nfz_east_africa.geojson');
    if (nfzR.ok) {
      const nfzGJ = await nfzR.json();
      S.nfzData = (nfzGJ.features || []).map(function(f) {
        return Object.assign({}, f.properties, {
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0]
        });
      });
    } else { throw new Error('NFZ fetch failed'); }
  } catch(e) {
    useBuiltinNFZ();
  }
}

function useBuiltinData() {
  S.aircraftDB = {
    manned: [
      { id:'c208', name:'Cessna 208B Grand Caravan', manufacturer:'Cessna', type:'Single Turboprop', category:'Heavy Survey', service_ceiling_ft:25000, cruise_speed_kts:185, endurance_hrs:8, payload_kg:680, coverage_km2_per_sortie:800, sensors:['Leica ADS100','Riegl LMS-Q780'], rtk:false, recommended_alt_m:2000, pixel_size_um:4.4, image:'✈', notes:'Industry standard for national topographic mapping.' },
      { id:'king_air', name:'Beechcraft King Air B200', manufacturer:'Beechcraft', type:'Twin Turboprop', category:'Heavy Survey', service_ceiling_ft:35000, cruise_speed_kts:289, endurance_hrs:7.5, payload_kg:900, coverage_km2_per_sortie:1800, sensors:['Leica ADS100','Vexcel UltraCam'], rtk:false, recommended_alt_m:3600, pixel_size_um:4.4, image:'✈', notes:'Premier high-altitude survey platform.' },
      { id:'da42', name:'Diamond DA42 MPP', manufacturer:'Diamond Aircraft', type:'Twin Diesel', category:'Medium Survey', service_ceiling_ft:18000, cruise_speed_kts:170, endurance_hrs:9, payload_kg:300, coverage_km2_per_sortie:600, sensors:['EO/IR','SAR','LiDAR'], rtk:false, recommended_alt_m:2400, pixel_size_um:4.4, image:'✈', notes:'Exceptional 9-hour endurance.' }
    ],
    uav: [
      { id:'dji_m350', name:'DJI Matrice 350 RTK', manufacturer:'DJI', type:'Heavy Multirotor', category:'Enterprise', max_altitude_m:7000, max_speed_ms:23, endurance_min:55, coverage_ha_per_flight:320, payload_g:2700, sensors:['Zenmuse P1','Zenmuse L2','Zenmuse H20T'], rtk:true, recommended_alt_m:150, pixel_size_um:4.4, image:'🚁', notes:'Top enterprise platform. Hot-swap batteries.' },
      { id:'dji_p4rtk', name:'DJI Phantom 4 RTK', manufacturer:'DJI', type:'Multirotor', category:'Professional Mapping', max_altitude_m:6000, max_speed_ms:16, endurance_min:30, coverage_ha_per_flight:100, payload_g:0, sensors:['20MP RGB','Multispectral'], rtk:true, recommended_alt_m:100, pixel_size_um:2.74, image:'🚁', notes:'Entry-level RTK mapping drone.' },
      { id:'wingtra', name:'WingtraOne GEN II', manufacturer:'Wingtra AG', type:'VTOL Fixed-Wing', category:'Fixed-Wing VTOL', max_altitude_m:4000, max_speed_ms:16, endurance_min:59, coverage_ha_per_flight:1200, payload_g:800, sensors:['Sony RX1R II 42MP','RedEdge-MX'], rtk:true, recommended_alt_m:200, pixel_size_um:4.51, image:'✈', notes:'1200 ha per flight. Best GSD in VTOL class.' },
      { id:'ebee_x', name:'senseFly eBee X', manufacturer:'senseFly', type:'Fixed-Wing', category:'Fixed-Wing', max_altitude_m:4875, max_speed_ms:25, endurance_min:90, coverage_ha_per_flight:2000, payload_g:300, sensors:['SODA RGB','SODA 3D','Sequoia+'], rtk:false, recommended_alt_m:120, pixel_size_um:2.41, image:'✈', notes:'90-min endurance. 2000 ha per flight.' }
    ]
  };
  S.sensorDB = [
    { id:'dji_p1', name:'DJI Zenmuse P1', type:'RGB Frame', category:'Photogrammetry', manufacturer:'DJI', resolution_mp:45, pixel_size_um:4.4, focal_mm:35, gsd_at_120m:'1.69 cm/px', weight_g:833, spectral:'RGB', sensor_size_mm:'35.9×24.0' },
    { id:'micasense', name:'MicaSense Altum-PT', type:'Multispectral', category:'Multispectral', manufacturer:'AgEagle', resolution_mp:12, pixel_size_um:3.45, focal_mm:8, gsd_at_120m:'2.0 cm/px', weight_g:410, spectral:'5-band MS+LWIR', sensor_size_mm:'7.0×5.3' },
    { id:'dji_l2', name:'DJI Zenmuse L2', type:'LiDAR+RGB', category:'LiDAR', manufacturer:'DJI', pixel_size_um:null, focal_mm:24, gsd_at_120m:'LiDAR 4cm', weight_g:905, spectral:'RGB+LiDAR 905nm' }
  ];
  S.layersCfg = {
    basemaps: [
      { id:'osm',       name:'OpenStreetMap',      icon:'🗺', default:true, url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution:'© OSM', maxZoom:19 },
      { id:'satellite', name:'Esri Satellite',      icon:'🛰', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution:'© Esri', maxZoom:19 },
      { id:'topo',      name:'OpenTopoMap',         icon:'⛰', url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution:'© OpenTopoMap', maxZoom:17 },
      { id:'dark',      name:'CartoDB Dark',         icon:'🌑', url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution:'© CARTO', maxZoom:19 }
    ],
    overlays: [
      { id:'esri_hillshade', name:'Esri World Hillshade', icon:'🏔', category:'Terrain', type:'tile', url:'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', opacity:0.6 },
      { id:'esri_worldcover', name:'ESA WorldCover (10m)', icon:'🌍', category:'Land Cover', type:'tile', url:'https://services.terrascope.be/wmts/v2?layer=WORLDCOVER_2021_MAP&style=default&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}', opacity:0.7 }
    ]
  };
}

function useBuiltinNFZ() {
  S.nfzData = [
    { id:'HKJK', name:'JKIA — Jomo Kenyatta International', icao:'HKJK', type:'Class C CTR', radius_km:8, authority:'KCAA', max_uav_alt_m:0, lat:-1.3192, lng:36.9275, notes:'Full CTR. UAV prohibited within 8km without ATC clearance.' },
    { id:'HKNW', name:'Wilson Airport, Nairobi', icao:'HKNW', type:'Class D Airspace', radius_km:5, authority:'KCAA', max_uav_alt_m:0, lat:-1.3214, lng:36.8147, notes:'High-density GA. UAV prohibited.' },
    { id:'HKMO', name:'Moi International, Mombasa', icao:'HKMO', type:'Class C CTR', radius_km:8, authority:'KCAA', max_uav_alt_m:0, lat:-4.0348, lng:39.5944, notes:'Coastal CTR. KCAA prior permission required.' },
    { id:'NNP',  name:'Nairobi National Park', icao:null, type:'Protected Wildlife Area', radius_km:4, authority:'KWS', max_uav_alt_m:0, lat:-1.3833, lng:36.8667, notes:'Wildlife zone. KWS permit required.' }
  ];
}

/* ── MAP INIT ── */
function initMap() {
  S.map = L.map('map', {
    center: [S.mapCenter.lat, S.mapCenter.lng],
    zoom: 12, zoomControl: true, attributionControl: false
  });
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 });
  osm.addTo(S.map);
  S.baseTiles['osm'] = osm;

  S.drawLayer         = L.featureGroup().addTo(S.map);
  S.aoiLayer          = L.featureGroup().addTo(S.map);
  S.flightLinesLayer  = L.featureGroup().addTo(S.map);
  S.waypointLayer     = L.featureGroup().addTo(S.map);
  S.nfzLayer          = L.featureGroup().addTo(S.map);
  S.trafficLayer      = L.featureGroup().addTo(S.map);

  S.drawCtrl = new L.Control.Draw({
    draw: {
      polygon:   { shapeOptions:{ color:'#00d4ff', fillOpacity:0.08, weight:2 }, showArea:true },
      rectangle: { shapeOptions:{ color:'#00d4ff', fillOpacity:0.08, weight:2 } },
      circle:    { shapeOptions:{ color:'#00d4ff', fillOpacity:0.08, weight:2 } },
      polyline:  { shapeOptions:{ color:'#00d4ff', weight:2 } },
      marker: false, circlemarker: false
    },
    edit: { featureGroup: S.drawLayer }
  });
  S.map.addControl(S.drawCtrl);
  S.map.on(L.Draw.Event.CREATED, onShapeDrawn);
  S.map.on('mousemove', function(e) {
    document.getElementById('sb-lat').textContent = e.latlng.lat.toFixed(6);
    document.getElementById('sb-lng').textContent = e.latlng.lng.toFixed(6);
  });
  S.map.on('zoomend', function() { document.getElementById('sb-zoom').textContent = S.map.getZoom(); });
  S.map.on('moveend', function() { var c = S.map.getCenter(); S.mapCenter = { lat:c.lat, lng:c.lng }; });
  document.getElementById('sb-zoom').textContent = S.map.getZoom();
  // Scale bar
  L.control.scale({ imperial:false, metric:true, position:'bottomleft' }).addTo(S.map);
}

function onShapeDrawn(e) {
  var lyr = e.layer;
  S.aoiLayer.clearLayers();
  S.aoiLayer.addLayer(lyr);
  var area = 0;
  if (lyr.getLatLngs) {
    var lls = lyr.getLatLngs();
    lls = Array.isArray(lls[0]) ? lls[0] : lls;
    area = calcPolyArea(lls);
  } else if (lyr.getRadius) {
    var r = lyr.getRadius(); area = Math.PI * r * r / 10000;
  }
  document.getElementById('sa-area').value = area.toFixed(2);
  document.getElementById('sb-area').textContent = area.toFixed(1) + ' ha';
  setStatus('AOI drawn: ' + area.toFixed(2) + ' ha', 'g');
  calcFlight();
}

function calcPolyArea(lls) {
  if (!lls || lls.length < 3) return 0;
  var area = 0, n = lls.length;
  for (var i = 0; i < n; i++) {
    var j = (i+1) % n;
    var lat1 = lls[i].lat * Math.PI/180, lat2 = lls[j].lat * Math.PI/180;
    var dlng = (lls[j].lng - lls[i].lng) * Math.PI/180;
    area += dlng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * 6371000 * 6371000 / 2) / 10000;
}

/* ── MODULE SWITCHING ── */
var MOD_PANELS = {
  planner:'p-planner', assessment:'p-assessment', change:'p-change',
  nfz:'p-nfz', log:'p-log', connect:'p-connect', export:'p-export'
};
function switchMod(mod) {
  S.currentMod = mod;
  document.querySelectorAll('.tn').forEach(function(t) { t.classList.toggle('on', t.dataset.mod === mod); });
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('on'); });
  var pid = MOD_PANELS[mod]; if (pid) { var el = document.getElementById(pid); if(el) el.classList.add('on'); }
  setStatus('Module: ' + mod);
}

function switchRT(tab) {
  document.querySelectorAll('.rp-tab').forEach(function(t,i) { var ts=['mission','telem','layers','calc']; t.classList.toggle('on', ts[i]===tab); });
  document.querySelectorAll('.rp-panel').forEach(function(p) { p.classList.remove('on'); });
  var el = document.getElementById('rt-'+tab); if(el) el.classList.add('on');
}

function initAllModules() {
  initBasemaps();
  initOverlays();
  populateAircraftDropdown();
  populateSensorDropdown();
  renderNFZList();
  renderNFZ();
  initTelemetry();
  liveGSD(); liveCov();
}

/* ── SURVEY PLANNER ── */
function selectShape(shape) {
  S.currentShape = shape;
  document.querySelectorAll('.shbtn').forEach(function(b) { b.classList.toggle('on', b.dataset.shape === shape); });
  try { S.map.removeControl(S.drawCtrl); } catch(e) {}
  var opts = {
    rectangle: { rectangle:{ shapeOptions:{ color:'#00d4ff', fillOpacity:0.08 } }, polygon:false, circle:false, polyline:false, marker:false, circlemarker:false },
    polygon:   { polygon:{ shapeOptions:{ color:'#00d4ff', fillOpacity:0.08 }, showArea:true }, rectangle:false, circle:false, polyline:false, marker:false, circlemarker:false },
    circle:    { circle:{ shapeOptions:{ color:'#00d4ff', fillOpacity:0.08 } }, polygon:false, rectangle:false, polyline:false, marker:false, circlemarker:false },
    corridor:  { polyline:{ shapeOptions:{ color:'#00d4ff', weight:2 } }, polygon:false, rectangle:false, circle:false, marker:false, circlemarker:false },
    triangle:  { polygon:{ shapeOptions:{ color:'#00d4ff', fillOpacity:0.08 }, showArea:true }, rectangle:false, circle:false, polyline:false, marker:false, circlemarker:false },
    custom:    { polygon:{ shapeOptions:{ color:'#00d4ff', fillOpacity:0.08 }, showArea:true }, rectangle:false, circle:false, polyline:false, marker:false, circlemarker:false }
  };
  S.drawCtrl = new L.Control.Draw({ draw: opts[shape] || opts.polygon, edit:{ featureGroup:S.drawLayer } });
  S.map.addControl(S.drawCtrl);
  setStatus('Shape: ' + shape + ' — use draw tools (top-left of map)');
}

function calcFlight() {
  var alt   = parseFloat(document.getElementById('fp-alt').value)   || 120;
  var sovl  = parseFloat(document.getElementById('fp-sovl').value)  / 100 || 0.7;
  var fovl  = parseFloat(document.getElementById('fp-fovl').value)  / 100 || 0.8;
  var focal = parseFloat(document.getElementById('fp-focal').value) || 35;
  var sensw = parseFloat(document.getElementById('fp-sensw').value) || 35.9;
  var speed = parseFloat(document.getElementById('fp-speed').value) || 10;
  var pxSz  = (S.selectedSensor && S.selectedSensor.pixel_size_um) || 4.4;
  var gsd   = (alt * pxSz) / (focal * 10); // cm/px
  var fw    = (sensw / focal) * alt;        // footprint width m
  var fh    = fw * (23.9 / 35.9);           // footprint height m
  var ss    = fw * (1 - sovl);              // strip spacing m
  var area  = parseFloat(document.getElementById('sa-area').value) || 50;
  var areaM = area * 10000;
  var wid   = Math.sqrt(areaM), hgt = areaM / wid;
  var nStrips = Math.max(1, Math.ceil(hgt / ss));
  var nWPps   = Math.max(1, Math.ceil(wid  / (fh * (1-fovl))));
  var nImgs   = nStrips * nWPps;
  var pathKm  = (nStrips * wid + (nStrips-1)*ss) / 1000;
  var timeMins= (pathKm*1000/speed)/60 + nStrips*0.1;
  var set = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; };
  set('rp-wps',   nStrips*2); set('rp-lines', nStrips);
  set('rp-area',  area.toFixed(1)); set('rp-gsd', gsd.toFixed(1));
  set('rp-sw',    fw.toFixed(0)); set('rp-imgs', nImgs);
  set('rp-time',  timeMins.toFixed(0)+' min'); set('sb-wps', nStrips*2);
  return { alt, gsd, fw, fh, ss, nStrips, nImgs, pathKm, timeMins, area };
}

function generateFlightPlan() {
  var r = calcFlight();
  S.flightLinesLayer.clearLayers(); S.waypointLayer.clearLayers(); S.waypoints = [];
  var bounds = S.aoiLayer.getLayers().length ? S.aoiLayer.getBounds() : S.map.getBounds();
  if (!S.aoiLayer.getLayers().length) alert_show('No AOI drawn — using current map view.','a');
  var N = bounds.getNorth(), S2 = bounds.getSouth(), E = bounds.getEast(), W = bounds.getWest();
  var clat = (N+S2)/2, mDegLat = 111000, mDegLng = 111000*Math.cos(clat*Math.PI/180);
  var hgt = (N-S2)*mDegLat, stripDeg = r.ss/mDegLat, n = Math.max(1,Math.ceil(hgt/r.ss));
  var goE = true;
  for (var i=0; i<n; i++) {
    var lat = S2 + (i+0.5)*stripDeg; if(lat>N) break;
    var sL = goE?W:E, eL = goE?E:W;
    S.waypoints.push({lat,lng:sL},{lat,lng:eL});
    L.polyline([[lat,sL],[lat,eL]],{color:'#34d399',weight:1.5,opacity:0.75}).addTo(S.flightLinesLayer);
    goE=!goE;
  }
  if (S.waypoints.length > 1) L.polyline(S.waypoints.map(function(w){return[w.lat,w.lng];}),{color:'#fbbf24',weight:1,opacity:0.38,dashArray:'5 8'}).addTo(S.flightLinesLayer);
  S.waypoints.forEach(function(wp,i) {
    var isS=i===0, isE=i===S.waypoints.length-1;
    var col = isS?'#00d4ff':isE?'#f87171':'#fbbf24';
    L.circleMarker([wp.lat,wp.lng],{radius:isS||isE?7:4,color:col,fillColor:col,fillOpacity:0.85,weight:2})
    .bindPopup('<div class="pop"><div class="pop-title">WP'+String(i+1).padStart(3,'0')+'</div><div class="pop-type">Survey Waypoint</div><div class="pop-row"><span class="pop-lbl">Lat</span><span class="pop-val">'+wp.lat.toFixed(7)+'</span></div><div class="pop-row"><span class="pop-lbl">Lng</span><span class="pop-val">'+wp.lng.toFixed(7)+'</span></div><div class="pop-row"><span class="pop-lbl">Alt</span><span class="pop-val">'+document.getElementById('fp-alt').value+'m AGL</span></div></div>')
    .addTo(S.waypointLayer);
  });

  // NFZ intersection check
  var violations = checkNFZIntersect();
  var banner = document.getElementById('nfz-banner');
  var msNFZWarn = document.getElementById('ms-nfz-warn');
  if (violations.length) {
    var vtxt = '🚫 NFZ VIOLATION — ' + violations.map(function(v){return v.nfz;}).join(', ');
    banner.textContent = vtxt; banner.classList.add('on');
    msNFZWarn.textContent = vtxt; msNFZWarn.style.display='block';
    document.getElementById('rp-alerts').innerHTML = '<span style="color:var(--red)">'+vtxt+'</span>';
    alert_show('Flight grid intersects ' + violations.length + ' NFZ(s). Review before flying.','r');
  } else {
    banner.classList.remove('on'); msNFZWarn.style.display='none';
    document.getElementById('rp-alerts').textContent='No active alerts.';
  }

  // Mission summary
  var ms = document.getElementById('ms-box'); ms.style.display='block';
  document.getElementById('ms-top').innerHTML = '<div class="dc"><div class="dc-val">'+S.waypoints.length+'</div><div class="dc-lbl">Waypoints</div></div><div class="dc"><div class="dc-val">'+r.nStrips+'</div><div class="dc-lbl">Strips</div></div><div class="dc gn"><div class="dc-val">'+r.area.toFixed(1)+'</div><div class="dc-lbl">Area ha</div></div><div class="dc te"><div class="dc-val">'+r.fw.toFixed(0)+'</div><div class="dc-lbl">Swath m</div></div>';
  document.getElementById('ms-bot').innerHTML = '<div class="dc ne"><div class="dc-val">'+r.gsd.toFixed(1)+'</div><div class="dc-lbl">GSD cm/px</div></div><div class="dc am"><div class="dc-val">'+r.nImgs+'</div><div class="dc-lbl">Images</div></div><div class="dc"><div class="dc-val">'+r.timeMins.toFixed(0)+'</div><div class="dc-lbl">Min</div></div>';
  document.getElementById('ms-note').textContent = (S.selectedSensor?S.selectedSensor.name:'DJI P1 (default)') + ' · ' + document.getElementById('fp-focal').value + 'mm · ' + r.alt + 'm AGL · ' + r.pathKm.toFixed(1) + ' km path';
  document.getElementById('sb-wps').textContent = S.waypoints.length;
  if (S.flightLinesLayer.getLayers().length) S.map.fitBounds(S.flightLinesLayer.getBounds().pad(0.15));
  setStatus('Flight plan: ' + S.waypoints.length + ' WPs, ' + r.nStrips + ' strips', 'g');
  toast('Flight plan generated — ' + S.waypoints.length + ' waypoints', 'g');
}

function checkNFZIntersect() {
  var violations = [];
  S.waypoints.forEach(function(wp) {
    S.nfzData.forEach(function(nfz) {
      var d = S.map.distance([wp.lat,wp.lng],[nfz.lat,nfz.lng]) / 1000;
      if (d <= (nfz.radius_km || 5)) {
        if (!violations.find(function(v){return v.id===nfz.id;}))
          violations.push({ id:nfz.id, nfz:nfz.name, dist:d.toFixed(2) });
      }
    });
  });
  return violations;
}

function clearPlan() {
  S.flightLinesLayer.clearLayers(); S.waypointLayer.clearLayers(); S.aoiLayer.clearLayers();
  S.waypoints = [];
  document.getElementById('ms-box').style.display='none';
  document.getElementById('nfz-banner').classList.remove('on');
  document.getElementById('sb-wps').textContent='0';
  document.getElementById('sb-area').textContent='—';
  setStatus('Plan cleared'); toast('Plan cleared','a');
}

function fetchWeather() {
  var c = S.map.getCenter();
  document.getElementById('wx-lat').value = c.lat.toFixed(4);
  document.getElementById('wx-lng').value = c.lng.toFixed(4);
  openModal('weather');
}

/* ── AIRCRAFT DATABASE ── */
function populateAircraftDropdown() {
  var sel = document.getElementById('fp-aircraft');
  sel.innerHTML = '<option value="">— Select Platform —</option>';
  var addGrp = function(label, list) {
    var og = document.createElement('optgroup'); og.label = label;
    list.forEach(function(ac){ var o=document.createElement('option'); o.value=ac.id; o.textContent=ac.name; og.appendChild(o); });
    sel.appendChild(og);
  };
  addGrp('Manned Aircraft', S.aircraftDB.manned || []);
  addGrp('UAV / Drones',    S.aircraftDB.uav    || []);
}

function populateSensorDropdown() {
  var sel = document.getElementById('fp-sensor');
  sel.innerHTML = '<option value="">— Select Sensor —</option>';
  var cats = {};
  (S.sensorDB || []).forEach(function(s){ if(!cats[s.category]) cats[s.category]=[]; cats[s.category].push(s); });
  Object.entries(cats).forEach(function([cat, list]) {
    var og = document.createElement('optgroup'); og.label = cat;
    list.forEach(function(s){ var o=document.createElement('option'); o.value=s.id; o.textContent=s.name; og.appendChild(o); });
    sel.appendChild(og);
  });
}

function onAircraftChange() {
  var id = document.getElementById('fp-aircraft').value;
  S.selectedAC = [...(S.aircraftDB.manned||[]),...(S.aircraftDB.uav||[])].find(function(a){return a.id===id;}) || null;
  if (S.selectedAC && S.selectedAC.recommended_alt_m) {
    document.getElementById('fp-alt').value = Math.min(S.selectedAC.recommended_alt_m, 500);
    sv('fp-alt','m');
  }
  if (S.selectedAC) {
    var isUAV = !S.selectedAC.service_ceiling_ft;
    document.getElementById('rp-ac').innerHTML =
      '<div style="font-weight:600;color:var(--txt);margin-bottom:3px">'+(S.selectedAC.image||'✈')+' '+S.selectedAC.name+'</div>'+
      '<div style="color:var(--txt3);font-size:10px">'+S.selectedAC.manufacturer+' · '+S.selectedAC.type+'</div>'+
      '<div class="dc-grid" style="margin-top:6px">'+
      (isUAV ? '<div class="dc"><div class="dc-val">'+S.selectedAC.max_altitude_m+'m</div><div class="dc-lbl">Max Alt</div></div><div class="dc"><div class="dc-val">'+S.selectedAC.endurance_min+'min</div><div class="dc-lbl">Endurance</div></div><div class="dc"><div class="dc-val">'+S.selectedAC.coverage_ha_per_flight+'ha</div><div class="dc-lbl">Coverage</div></div><div class="dc"><div class="dc-val">'+(S.selectedAC.rtk?'Yes':'No')+'</div><div class="dc-lbl">RTK</div></div>' :
             '<div class="dc"><div class="dc-val">'+S.selectedAC.service_ceiling_ft+'ft</div><div class="dc-lbl">Ceiling</div></div><div class="dc"><div class="dc-val">'+S.selectedAC.cruise_speed_kts+'kts</div><div class="dc-lbl">Speed</div></div><div class="dc"><div class="dc-val">'+S.selectedAC.payload_kg+'kg</div><div class="dc-lbl">Payload</div></div><div class="dc"><div class="dc-val">'+S.selectedAC.endurance_hrs+'hr</div><div class="dc-lbl">End.</div></div>')+
      '</div><div style="font-size:9.5px;color:var(--txt3);margin-top:5px">'+(S.selectedAC.notes||'')+'</div>';
  }
  calcFlight();
}

function onSensorChange() {
  var id = document.getElementById('fp-sensor').value;
  S.selectedSensor = (S.sensorDB||[]).find(function(s){return s.id===id;}) || null;
  if (!S.selectedSensor) return;
  if (S.selectedSensor.pixel_size_um) document.getElementById('c-px').value = S.selectedSensor.pixel_size_um;
  if (S.selectedSensor.focal_mm) document.getElementById('fp-focal').value = S.selectedSensor.focal_mm;
  if (S.selectedSensor.sensor_size_mm && S.selectedSensor.sensor_size_mm.includes('×')) {
    var w = parseFloat(S.selectedSensor.sensor_size_mm.split('×')[0]);
    if (w) document.getElementById('fp-sensw').value = w;
  }
  document.getElementById('rp-sensor').innerHTML =
    '<div style="font-weight:600;color:var(--txt);margin-bottom:3px">'+S.selectedSensor.name+'</div>'+
    '<div style="color:var(--txt3);font-size:10px">'+S.selectedSensor.manufacturer+' · '+S.selectedSensor.type+'</div>'+
    '<div style="margin-top:4px;font-size:10px;color:var(--txt2)">'+(S.selectedSensor.resolution_mp?S.selectedSensor.resolution_mp+'MP · ':'')+S.selectedSensor.spectral+'</div>'+
    (S.selectedSensor.gsd_at_120m?'<div style="font-size:10px;color:var(--teal)">GSD @ 120m: '+S.selectedSensor.gsd_at_120m+'</div>':'');
  calcFlight();
}

/* ── GIS LAYERS ── */
function initBasemaps() {
  var container = document.getElementById('rp-basemaps'); container.innerHTML = '';
  (S.layersCfg.basemaps || []).forEach(function(bm) {
    if (!S.baseTiles[bm.id]) S.baseTiles[bm.id] = L.tileLayer(bm.url, { maxZoom:bm.maxZoom||19, attribution:bm.attribution||'' });
    var div = document.createElement('div'); div.className='layer-item';
    div.innerHTML = '<span class="layer-ico">'+(bm.icon||'🗺')+'</span><span class="layer-name">'+bm.name+'</span><input type="radio" name="bm" value="'+bm.id+'" '+(bm.default?'checked':'')+'/>';
    div.querySelector('input').addEventListener('change', function(){ switchBasemap(bm.id); });
    container.appendChild(div);
  });
}

function switchBasemap(id) {
  Object.keys(S.baseTiles).forEach(function(k) { if(!S.baseTiles[k]._isOverlay) { try{S.map.removeLayer(S.baseTiles[k]);}catch(e){} } });
  var bm = (S.layersCfg.basemaps||[]).find(function(b){return b.id===id;});
  if (!S.baseTiles[id] && bm) S.baseTiles[id] = L.tileLayer(bm.url, { maxZoom:bm.maxZoom||19 });
  if (S.baseTiles[id]) { S.baseTiles[id].addTo(S.map); S.baseTiles[id].bringToBack(); }
  toast('Basemap: ' + id, 'b');
}

function initOverlays() {
  var container = document.getElementById('rp-overlays'); container.innerHTML = '';
  (S.layersCfg.overlays || []).forEach(function(lyr) {
    var div = document.createElement('div'); div.className='layer-item';
    div.innerHTML = '<span class="layer-ico">'+(lyr.icon||'🗂')+'</span><div style="flex:1"><div class="layer-name">'+lyr.name+'</div><div class="layer-src">'+(lyr.category||'')+'</div></div><div class="tog" id="ov-'+lyr.id+'" onclick="toggleOverlay(\''+lyr.id+'\',this)"></div>';
    container.appendChild(div);
  });
}

function toggleOverlay(id, togEl) {
  togEl.classList.toggle('on');
  var on = togEl.classList.contains('on');
  var lyr = (S.layersCfg.overlays||[]).find(function(l){return l.id===id;});
  if (!lyr) return;
  var key = 'ov_'+id;
  if (on) {
    if (!S.overlayTiles[key] && lyr.type==='tile' && lyr.url) {
      S.overlayTiles[key] = L.tileLayer(lyr.url, { maxZoom:18, opacity:lyr.opacity||0.7 });
      S.overlayTiles[key]._isOverlay = true;
    }
    if (S.overlayTiles[key]) S.overlayTiles[key].addTo(S.map);
    toast('Layer on: ' + lyr.name, 'g');
  } else {
    if (S.overlayTiles[key]) { try{S.map.removeLayer(S.overlayTiles[key]);}catch(e){} }
    toast('Layer off: ' + lyr.name, 'a');
  }
}

/* ── WEATHER ── */
async function doFetchWeather() {
  var lat = parseFloat(document.getElementById('wx-lat').value) || S.mapCenter.lat;
  var lng = parseFloat(document.getElementById('wx-lng').value) || S.mapCenter.lng;
  var key = document.getElementById('wx-key').value.trim();
  setStatus('Fetching weather...','b');

  if (key) {
    try {
      var url = 'https://api.openweathermap.org/data/2.5/weather?lat='+lat+'&lon='+lng+'&appid='+key+'&units=metric';
      var res = await fetch(url); if (!res.ok) throw new Error('API '+res.status);
      var d = await res.json();
      displayWeather({ temp:d.main.temp, cond:d.weather[0].description, icon:wxIcon(d.weather[0].main), wind:d.wind.speed, windDir:d.wind.deg||0, hum:d.main.humidity, vis:(d.visibility||10000)/1000, cloud:d.clouds.all, pressure:d.main.pressure, loc:d.name+', '+d.sys.country });
      return;
    } catch(e) { alert_show('OWM API error: '+e.message+'. Using demo data.','a'); }
  }
  // Demo
  displayWeather({ temp:24+(Math.random()*4-2), cond:'Partly cloudy', icon:'⛅', wind:3.5+Math.random()*2, windDir:220, hum:65, vis:10, cloud:35, pressure:1013, loc:'Nairobi, KE (demo)' });
}

function displayWeather(w) {
  S.wxCache = w;
  var score=100, reasons=[];
  if(w.wind>12){score-=40;reasons.push('Wind >12 m/s — unsafe');}
  else if(w.wind>8){score-=20;reasons.push('Wind 8–12 m/s — check limits');}
  else if(w.wind>5){score-=10;reasons.push('Moderate wind');}
  if(w.vis<3){score-=30;reasons.push('Visibility <3km');}
  else if(w.vis<5){score-=10;reasons.push('Reduced visibility');}
  if(w.cloud>80){score-=15;reasons.push('Heavy cloud cover');}
  score=Math.max(0,Math.min(100,score));
  var cls = score>=70?'g':score>=40?'a':'r';
  var lbl = score>=70?'✅ SUITABLE':score>=40?'⚠ MARGINAL':'🚫 NOT RECOMMENDED';

  // Mini widget
  var wx=document.getElementById('wx-widget'); wx.classList.add('on');
  document.getElementById('wx-ico').textContent=w.icon;
  document.getElementById('wx-temp').textContent=w.temp.toFixed(0)+'°C';
  document.getElementById('wx-cond').textContent=w.cond;
  document.getElementById('wx-wind').textContent=w.wind.toFixed(1);
  document.getElementById('wx-vis').textContent=w.vis;
  document.getElementById('wx-hum').textContent=w.hum+'%';
  document.getElementById('wx-cloud').textContent=w.cloud+'%';
  var suit=document.getElementById('wx-suit');
  suit.textContent=score+'% — '+lbl; suit.className='wx-suit '+cls;

  // Detail panel
  var det=document.getElementById('wx-detail'); det.style.display='block';
  det.innerHTML='<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><span style="font-size:32px">'+w.icon+'</span><div><div style="font-size:28px;font-weight:700;font-family:monospace;color:var(--txt)">'+w.temp.toFixed(1)+'°C</div><div style="color:var(--txt3);font-size:12px">'+w.cond.charAt(0).toUpperCase()+w.cond.slice(1)+'</div><div style="font-size:10px;color:var(--txt3)">📍 '+w.loc+'</div></div></div>'+
    '<div class="dc-grid dc-grid3">'+
    '<div class="dc"><div class="dc-val">'+w.wind.toFixed(1)+'</div><div class="dc-lbl">Wind m/s</div></div>'+
    '<div class="dc"><div class="dc-val">'+w.hum+'%</div><div class="dc-lbl">Humidity</div></div>'+
    '<div class="dc"><div class="dc-val">'+w.vis+'</div><div class="dc-lbl">Vis km</div></div>'+
    '<div class="dc"><div class="dc-val">'+w.cloud+'%</div><div class="dc-lbl">Cloud</div></div>'+
    '<div class="dc"><div class="dc-val">'+w.windDir+'°</div><div class="dc-lbl">Wind Dir</div></div>'+
    '<div class="dc"><div class="dc-val">'+w.pressure+'</div><div class="dc-lbl">hPa</div></div>'+
    '</div>'+
    '<div style="margin-top:10px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:10px;text-align:center">'+
    '<div style="font-size:24px;font-weight:700;color:var(--'+(cls==='g'?'green':cls==='a'?'amber':'red')+');font-family:monospace">'+score+'%</div>'+
    '<div style="font-size:10px;font-weight:600;color:var(--'+(cls==='g'?'green':cls==='a'?'amber':'red')+')">FLIGHT SUITABILITY — '+lbl+'</div>'+
    (reasons.length?'<div style="font-size:9.5px;color:var(--txt3);margin-top:6px">'+reasons.map(function(r){return '→ '+r;}).join('<br>')+'</div>':'<div style="font-size:9.5px;color:var(--green);margin-top:4px">All parameters within acceptable ranges.</div>')+
    '</div>';
  document.getElementById('chip-sat').textContent = score>=70?'FLY ✅':score>=40?'CAUTION':'NO-FLY';
  setStatus('Weather: '+w.temp.toFixed(0)+'°C · '+w.cond+' · Suitability: '+score+'%', cls==='g'?'g':'warn');
}

function wxIcon(main) {
  return ({Clear:'☀',Clouds:'☁',Rain:'🌧',Drizzle:'🌦',Thunderstorm:'⛈',Snow:'❄',Mist:'🌫',Fog:'🌫',Haze:'🌫'})[main]||'🌤';
}

/* ── NO FLIGHT ZONES ── */
function renderNFZList() {
  var c = document.getElementById('nfz-list'); c.innerHTML='';
  S.nfzData.forEach(function(nfz) {
    var div = document.createElement('div'); div.className='nfz-item';
    div.onclick = function(){ S.map.flyTo([nfz.lat,nfz.lng],13,{duration:1.5}); };
    var ico = nfz.icao?'✈':(nfz.type.includes('Military')?'⚔':(nfz.type.includes('Wildlife')?'🦁':'🚫'));
    div.innerHTML='<div class="nfz-ico">'+ico+'</div><div><div class="nfz-name">'+nfz.name+'</div><div class="nfz-det">'+nfz.type+' · '+nfz.radius_km+'km · '+nfz.authority+'</div><div class="nfz-warn">'+nfz.notes+'</div></div>';
    c.appendChild(div);
  });
}

function renderNFZ() {
  S.nfzLayer.clearLayers();
  var buf = parseFloat(document.getElementById('nfz-buf').value) || 8;
  S.nfzData.forEach(function(nfz) {
    var rad = (nfz.radius_km||5)*1000, col = nfz.max_uav_alt_m===0?'#f87171':'#fbbf24';
    L.circle([nfz.lat,nfz.lng],{radius:rad,color:col,weight:1.5,fillColor:col,fillOpacity:0.07,dashArray:'6 4'})
    .bindPopup('<div class="pop"><div class="pop-title">'+nfz.name+'</div><div class="pop-type">'+nfz.type+'</div><div class="pop-row"><span class="pop-lbl">ICAO</span><span class="pop-val">'+(nfz.icao||'N/A')+'</span></div><div class="pop-row"><span class="pop-lbl">Authority</span><span class="pop-val">'+nfz.authority+'</span></div><div class="pop-row"><span class="pop-lbl">Radius</span><span class="pop-val">'+nfz.radius_km+' km</span></div><div class="pop-warn">'+nfz.notes+'</div></div>',{maxWidth:280})
    .addTo(S.nfzLayer);
    L.circleMarker([nfz.lat,nfz.lng],{radius:6,color:col,fillColor:col,fillOpacity:0.9,weight:2}).addTo(S.nfzLayer);
  });
  document.getElementById('chip-nfz').textContent = S.nfzData.length+' NFZ';
}

function toggleNFZ(show) {
  if(show){ if(!S.map.hasLayer(S.nfzLayer)) S.map.addLayer(S.nfzLayer); }
  else { try{S.map.removeLayer(S.nfzLayer);}catch(e){} }
  toast('NFZ layer '+(show?'shown':'hidden'), show?'b':'a');
}

function openFR24() { var c=S.map.getCenter(),z=S.map.getZoom(); window.open('https://www.flightradar24.com/'+c.lat.toFixed(4)+','+c.lng.toFixed(4)+'/'+z,'_blank'); toast('Opening FlightRadar24','b'); }
function openADSB() { var c=S.map.getCenter(); window.open('https://adsb.lol/?lat='+c.lat.toFixed(4)+'&lon='+c.lng.toFixed(4)+'&zoom=10','_blank'); toast('Opening ADSB.lol','b'); }

function loadSimTraffic() {
  S.trafficLayer.clearLayers();
  var c=S.map.getCenter(), traf=[
    {cs:'KQA101',type:'B737',alt:8200,spd:420,hdg:45,lat:c.lat+0.12,lng:c.lng+0.18,op:'Kenya Airways'},
    {cs:'5Y-KZW',type:'C208',alt:3500,spd:180,hdg:225,lat:c.lat-0.08,lng:c.lng-0.12,op:'Survey Flight'},
    {cs:'UAV-G01',type:'DJI',alt:120,spd:15,hdg:90,lat:c.lat+0.02,lng:c.lng+0.04,op:'GeoCart Ops'},
    {cs:'ET-ARS',type:'B787',alt:12000,spd:510,hdg:180,lat:c.lat+0.25,lng:c.lng+0.05,op:'Ethiopian'}
  ];
  var list=document.getElementById('tracker-list'); list.innerHTML='';
  traf.forEach(function(ac){
    var ico=ac.type==='DJI'?'🚁':'✈';
    L.marker([ac.lat,ac.lng],{icon:L.divIcon({html:'<div style="font-size:16px">'+ico+'</div>',className:'',iconAnchor:[8,8]})})
    .bindPopup('<div class="pop"><div class="pop-title">'+ac.cs+'</div><div class="pop-type">'+ac.type+' · '+ac.op+'</div><div class="pop-row"><span class="pop-lbl">Alt</span><span class="pop-val">'+ac.alt.toLocaleString()+' ft</span></div><div class="pop-row"><span class="pop-lbl">Speed</span><span class="pop-val">'+ac.spd+' kts</span></div></div>')
    .addTo(S.trafficLayer);
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(56,189,248,.07);cursor:pointer';
    row.innerHTML='<span style="font-size:14px">'+ico+'</span><div style="flex:1"><div style="font-size:11px;font-weight:600;color:var(--txt)">'+ac.cs+'</div><div style="font-size:9px;color:var(--txt3)">'+ac.type+' · '+ac.op+'</div></div><div style="text-align:right"><div style="font-size:10px;font-family:monospace;color:var(--teal)">'+ac.alt.toLocaleString()+'ft</div><div style="font-size:9px;color:var(--txt3)">'+ac.spd+'kts</div></div>';
    row.onclick=function(){S.map.flyTo([ac.lat,ac.lng],13);};
    list.appendChild(row);
  });
  toast('Demo traffic: '+traf.length+' aircraft','b');
}

/* ── SITE ASSESSMENT ── */
function selAssess(type) {
  S.currentAssess = type;
  document.querySelectorAll('#assess-grid .cd-btn').forEach(function(b){b.classList.toggle('on',b.dataset.type===type);});
}

function runAssessment() {
  var area=parseFloat(document.getElementById('sa-area').value)||50;
  var name=document.getElementById('sa-name').value||'Study Area';
  var region=document.getElementById('sa-region').value;
  var defs={
    realEstate:{title:'🏗 Real Estate',score:78,grade:'B+',metrics:[{l:'Total Area',v:area.toFixed(1)+' ha'},{l:'Buildable (65%)',v:(area*0.65).toFixed(1)+' ha'},{l:'Plot Yield',v:Math.floor(area*3.25)+' plots'},{l:'Infra Cost',v:'KSH '+(area*850000/1e6).toFixed(1)+'M'},{l:'Road Access',v:'✅ Available'},{l:'Zoning',v:'Residential R3'}],recs:['County Spatial Plan approval','NEMA EIA (>0.5 ha)','Drainage study']},
    urban:{title:'🏙 Urban Planning',score:72,grade:'B',metrics:[{l:'Study Area',v:area.toFixed(1)+' ha'},{l:'Pop. Capacity',v:Math.floor(area*120).toLocaleString()},{l:'Road Needed',v:(Math.sqrt(area*10000)*0.012).toFixed(1)+' km'},{l:'Water Demand',v:(Math.floor(area*120)*0.15).toFixed(0)+' m³/day'},{l:'Density',v:'Medium R3'},{l:'Green Space',v:(area*0.15).toFixed(1)+' ha'}],recs:['Physical Planning Act','Traffic Impact Assessment','Utilities masterplan']},
    solar:{title:'☀ Solar Feasibility',score:85,grade:'A-',metrics:[{l:'Capacity',v:(area*80).toFixed(0)+' kWp'},{l:'Annual Gen.',v:(area*80*4.8*365/1000).toFixed(0)+' MWh/yr'},{l:'Revenue',v:'KSH '+(area*80*4.8*365*12/1e6).toFixed(1)+'M/yr'},{l:'Irradiation',v:'5.5–6.2 kWh/m²/d'},{l:'Panel Rows',v:Math.floor(area*8)+' rows'},{l:'CO₂ Offset',v:(area*80*4.8*0.5/1000).toFixed(0)+' t/yr'}],recs:['Solar radiation survey','KPLC grid connection','FiT application to ERC']},
    flood:{title:'🌊 Flood Risk',score:55,grade:'C+',metrics:[{l:'Study Area',v:area.toFixed(1)+' ha'},{l:'10-yr Return',v:'0.8–1.4m depth'},{l:'100-yr Return',v:'1.6–2.9m depth'},{l:'Drainage Coeff.',v:'0.72'},{l:'Risk Class',v:'MEDIUM-HIGH'},{l:'Run-off Est.',v:(area*0.72*25).toFixed(0)+' m³/hr'}],recs:['HEC-RAS hydraulic model','Retention pond (0.5 ha min)','Raise FFL +0.5m','WRMA notification']},
    agri:{title:'🌾 Agriculture',score:82,grade:'A-',metrics:[{l:'Soil Class',v:'Nitisols II'},{l:'Soil pH',v:'5.8–7.2'},{l:'Annual Rain',v:'750–1050mm'},{l:'Irrigable',v:(area*0.7).toFixed(1)+' ha'},{l:'Maize Yield',v:(area*3.5).toFixed(0)+' t/yr'},{l:'Horticulture',v:'HIGH'}],recs:['Soil sampling (1/5ha)','Drip irrigation design','Agronomist consultation']},
    infra:{title:'🏗 Infrastructure',score:69,grade:'B-',metrics:[{l:'Roads',v:(Math.sqrt(area*10000)*0.008).toFixed(1)+' km tarmac'},{l:'Grid Proximity',v:'2.4 km'},{l:'Water Supply',v:'Municipal'},{l:'4G Coverage',v:'95%'},{l:'Ground CBR',v:'>5%'},{l:'Topography',v:'Undulating'}],recs:['Geotechnical survey','Power line easement (KPLC)','KeNHA road approval']}
  };
  var r=defs[S.currentAssess]||defs.realEstate;
  var gc=r.score>=70?'var(--green)':r.score>=50?'var(--amber)':'var(--red)';
  var el=document.getElementById('assess-result'); el.style.display='block';
  el.innerHTML='<div class="rh">'+r.title+'</div>'+
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">'+
    '<div style="text-align:center"><div style="font-size:34px;font-weight:700;color:'+gc+';font-family:monospace">'+r.score+'</div><div style="font-size:9px;color:var(--txt3)">SCORE</div></div>'+
    '<div style="text-align:center"><div style="font-size:34px;font-weight:700;color:'+gc+'">'+r.grade+'</div><div style="font-size:9px;color:var(--txt3)">GRADE</div></div>'+
    '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--txt)">'+name+'</div><div style="font-size:10px;color:var(--txt3)">'+region+' · '+area.toFixed(1)+' ha</div><div class="progress" style="margin-top:5px"><div class="progress-fill '+(r.score>=70?'g':r.score>=50?'a':'r')+'" style="width:'+r.score+'%"></div></div></div></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">'+r.metrics.map(function(m){return '<div style="padding:5px 7px;background:var(--bg4);border-radius:4px;border:1px solid var(--border)"><div style="font-size:8.5px;color:var(--txt3)">'+m.l+'</div><div style="font-size:11px;font-weight:600;color:var(--txt);font-family:monospace">'+m.v+'</div></div>';}).join('')+'</div>'+
    '<div style="font-size:9px;font-weight:700;color:var(--teal);margin-bottom:4px">RECOMMENDATIONS</div>'+
    r.recs.map(function(rc){return '<div style="font-size:10px;color:var(--txt2);padding:2px 0">→ '+rc+'</div>';}).join('');
  setStatus('Assessment: '+r.grade+' ('+r.score+'/100)');
  toast(r.title+' — '+r.grade, r.score>=70?'g':'a');
}

/* ── CHANGE DETECTION ── */
function selCD(type){
  S.currentCD=type;
  document.querySelectorAll('#cd-grid .cd-btn').forEach(function(b){b.classList.toggle('on',b.dataset.type===type);});
}

function runCD(){
  var t1=document.getElementById('cd-t1').value, t2=document.getElementById('cd-t2').value, src=document.getElementById('cd-src').value;
  var el=document.getElementById('cd-result'); el.style.display='block';
  el.innerHTML='<div style="color:var(--blue);text-align:center;padding:12px;font-size:11px">⌛ Processing satellite imagery…</div>';
  setStatus('Running change detection...','b');
  setTimeout(function(){
    var defs={
      landuse:{title:'🗺 Land Use Change',sev:'a',metrics:[{l:'Changed Area',v:'42.3 ha'},{l:'Change Rate',v:'8.2%/yr'},{l:'Confidence',v:'94%'},{l:'Source',v:'Sentinel-2 10m'}],detail:'Significant conversion from grassland to built-up land detected. Urban fringe expansion evident in north-east quadrant.'},
      deforest:{title:'🌳 Deforestation',sev:'a',metrics:[{l:'Canopy Loss',v:'18.7 ha'},{l:'NDVI Δ',v:'-0.34'},{l:'CO₂ Equiv.',v:'3,240 t'},{l:'Alert Class',v:'ORANGE'}],detail:'Forest canopy loss via NDVI differencing. Primary forest edge degradation in south-west extent. NEMA alert triggered.'},
      mining:{title:'⛏ Illegal Mining',sev:'r',metrics:[{l:'Suspect Sites',v:'3 locations'},{l:'Disturbed Area',v:'7.2 ha'},{l:'Active Sites',v:'2'},{l:'NEMA Alert',v:'🔴 SENT'}],detail:'Spectral anomalies consistent with artisanal mining. Bare soil patches and water sedimentation visible in multispectral composite.'},
      flood:{title:'🌊 Flood Mapping',sev:'r',metrics:[{l:'Flood Extent',v:'63.5 ha'},{l:'Max Depth',v:'~2.8m'},{l:'Duration',v:'3–5 days'},{l:'Source',v:'Sentinel-1 SAR'}],detail:'SAR backscatter analysis reveals significant inundation along river corridor. Flood water receding from peak extent.'},
      urban:{title:'🏙 Urban Expansion',sev:'a',metrics:[{l:'New Built-up',v:'28.4 ha'},{l:'Growth Rate',v:'4.7%/yr'},{l:'Footprint Δ',v:'+23%'},{l:'Confidence',v:'91%'}],detail:'NDBI growth analysis shows expansion along primary road corridors. Informal settlement densification in periurban zone.'},
      lidar:{title:'📡 Bathymetric LiDAR',sev:'g',metrics:[{l:'Water Depth',v:'0.5–4.2m'},{l:'Point Density',v:'18 pts/m²'},{l:'Coverage',v:'15.2 ha'},{l:'Wavelengths',v:'532nm+1064nm'}],detail:'Dual-wavelength LiDAR bathymetric survey. Shallow water DEM generated at 0.5m resolution.'}
    };
    var r=defs[S.currentCD]||defs.landuse;
    var col={g:'var(--green)',a:'var(--amber)',r:'var(--red)'}[r.sev];
    el.innerHTML='<div class="rh" style="color:'+col+'">'+r.title+'</div>'+
      '<div style="font-size:9.5px;color:var(--txt3);margin-bottom:8px">📅 '+t1+' → '+t2+' · '+src+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">'+r.metrics.map(function(m){return '<div style="padding:5px 7px;background:var(--bg4);border-radius:4px;border:1px solid var(--border)"><div style="font-size:8.5px;color:var(--txt3)">'+m.l+'</div><div style="font-size:11px;font-weight:600;font-family:monospace;color:'+col+'">'+m.v+'</div></div>';}).join('')+'</div>'+
      '<div style="font-size:10px;color:var(--txt2);line-height:1.5;padding:8px;background:var(--bg4);border-radius:4px;border-left:3px solid '+col+'">'+r.detail+'</div>';
    setStatus('Change detection complete','g'); toast(r.title+' complete',r.sev);
  }, 2000);
}

/* ── DRONE LOG ── */
function loadDemoLog() {
  S.droneLog=[
    {id:'LOG001',date:'2025-03-15',platform:'DJI M350 RTK',site:'Nairobi CBD Block 4A',dur:52,imgs:1240,cov:78.3,batt:82,status:'complete',notes:'Clear. All WPs complete.'},
    {id:'LOG002',date:'2025-02-28',platform:'WingtraOne GEN II',site:'Nakuru Rift Valley Agri',dur:88,imgs:1840,cov:210.4,batt:91,status:'complete',notes:'Light turbulence WP34. Excellent data.'},
    {id:'LOG003',date:'2025-01-10',platform:'Phantom 4 RTK',site:'Mombasa Port Expansion',dur:31,imgs:620,cov:45.2,batt:78,status:'complete',notes:'Sea breeze 7 m/s. Minor vibration.'},
    {id:'LOG004',date:'2025-04-01',platform:'DJI M300 RTK',site:'Kisumu Lakeside Dev.',dur:24,imgs:280,cov:18.7,batt:45,status:'partial',notes:'Battery failure WP22. Re-fly required.'}
  ];
  renderLog();
}

function renderLog() {
  var w=document.getElementById('log-table-wrap');
  if(!S.droneLog.length){w.innerHTML='<div style="font-size:10.5px;color:var(--txt3);padding:8px">No entries.</div>';return;}
  var ico={complete:'✅',partial:'⚠',aborted:'❌'};
  w.innerHTML='<table class="log-tbl"><thead><tr><th>Date</th><th>Platform</th><th>Site</th><th>Dur</th><th>Imgs</th><th>Cov</th><th>St</th></tr></thead><tbody>'+
    S.droneLog.map(function(l){return '<tr title="'+(l.notes||'')+'"><td style="white-space:nowrap">'+l.date+'</td><td>'+l.platform+'</td><td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+l.site+'">'+l.site+'</td><td>'+l.dur+'m</td><td>'+l.imgs+'</td><td>'+l.cov+'ha</td><td>'+(ico[l.status]||'—')+'</td></tr>';}).join('')+
  '</tbody></table>';
}

function addLog() {
  var e={id:'LOG'+String(S.droneLog.length+1).padStart(3,'0'),date:document.getElementById('log-date').value,platform:document.getElementById('log-plat').value,site:document.getElementById('log-site').value||'Unnamed',dur:parseInt(document.getElementById('log-dur').value)||0,imgs:parseInt(document.getElementById('log-imgs').value)||0,cov:parseFloat(document.getElementById('log-cov').value)||0,batt:parseInt(document.getElementById('log-batt').value)||0,status:document.getElementById('log-status').value,notes:document.getElementById('log-notes').value};
  S.droneLog.unshift(e); renderLog(); toast('Log '+e.id+' added','g');
}

function exportLogCSV() {
  if(!S.droneLog.length){toast('No log entries','a');return;}
  var hdr='ID,Date,Platform,Site,Duration_min,Images,Coverage_ha,Battery_pct,Status,Notes';
  var rows=S.droneLog.map(function(l){return[l.id,l.date,l.platform,'"'+l.site+'"',l.dur,l.imgs,l.cov,l.batt,l.status,'"'+(l.notes||'')+'"'].join(',');});
  dl('aerogis_drone_log_'+datestamp()+'.csv',[hdr,...rows].join('\n'),'text/csv');
  toast('Log exported','g');
}

function importLogCSV(){document.getElementById('log-file').click();}
function handleLogImport(e) {
  var f=e.target.files[0]; if(!f)return;
  var r=new FileReader(); r.onload=function(ev){
    var lines=ev.target.result.split('\n').slice(1).filter(function(l){return l.trim();});
    lines.forEach(function(line){var c=line.split(',');if(c.length>=9)S.droneLog.push({id:c[0],date:c[1],platform:c[2],site:c[3].replace(/"/g,''),dur:parseInt(c[4]),imgs:parseInt(c[5]),cov:parseFloat(c[6]),batt:parseInt(c[7]),status:c[8],notes:(c[9]||'').replace(/"/g,'')});});
    renderLog(); toast('Imported '+lines.length+' entries','g');
  }; r.readAsText(f);
}

/* ── CONNECT / TELEMETRY ── */
function onConnMethod() {
  var v=document.getElementById('conn-method').value;
  document.getElementById('conn-ip-row').style.display=['wifi','mavlink'].includes(v)?'grid':'none';
}

function connectAircraft() {
  var m=document.getElementById('conn-method').value;
  var s=document.getElementById('conn-status');
  s.style.color='var(--amber)'; s.innerHTML='⌛ Connecting via '+m+'…';
  setTimeout(function(){
    s.style.color='var(--green)';
    s.innerHTML='✅ Connected — Demo Mode ('+m.toUpperCase()+')<br><span style="font-size:9px;color:var(--txt3)">Real connection requires aircraft + GCS software</span>';
    startTelemDemo(); toast('Connected (demo)','g');
    alert_show('Demo telemetry active. Real MAVLink requires compatible GCS.','b');
  },1800);
}

function disconnectAircraft() {
  stopDemo();
  document.getElementById('conn-status').style.color='var(--txt3)';
  document.getElementById('conn-status').innerHTML='○ Disconnected'; toast('Disconnected','a');
}

function initTelemetry() {
  S.telem={alt:0,spd:0,bat:100,hdg:0,sig:0,dst:0};
  S.telemHist={alt:new Array(60).fill(0),bat:new Array(60).fill(100)};
  updateGauges(); drawChart();
}

function startTelemDemo() {
  if(S.telemTimer) clearInterval(S.telemTimer);
  S.telemTimer=setInterval(function(){
    S.telem.alt=Math.max(0,S.telem.alt+(Math.random()*4-1.5));
    S.telem.spd=Math.max(0,Math.min(25,S.telem.spd+(Math.random()*2-0.8)));
    S.telem.bat=Math.max(0,S.telem.bat-0.05);
    S.telem.hdg=(S.telem.hdg+Math.random()*6-2+360)%360;
    S.telem.sig=85+Math.random()*15; S.telem.dst+=S.telem.spd*0.5;
    S.telemHist.alt.push(Math.round(S.telem.alt)); S.telemHist.bat.push(Math.round(S.telem.bat));
    if(S.telemHist.alt.length>60){S.telemHist.alt.shift();S.telemHist.bat.shift();}
    updateGauges(); drawChart();
  },500);
}

function updateGauges() {
  var pairs=[['g-alt','alt'],['g-spd','spd'],['g-bat','bat'],['g-hdg','hdg'],['g-sig','sig'],['g-dst','dst'],
             ['rp-alt','alt'],['rp-spd','spd'],['rp-bat','bat']];
  pairs.forEach(function(p){var el=document.getElementById(p[0]);if(el)el.textContent=S.telem[p[1]].toFixed(S.telem[p[1]]>=100?0:1);});
  var bat=document.getElementById('g-bat');
  if(bat){bat.parentElement.classList.remove('hi','med','lo');bat.parentElement.classList.add(S.telem.bat>50?'hi':S.telem.bat>25?'med':'lo');}
}

function drawChart() {
  ['telem-chart','rp-chart'].forEach(function(id){
    var c=document.getElementById(id); if(!c)return;
    var ctx=c.getContext('2d'), W=c.offsetWidth||280, H=parseInt(c.getAttribute('height'))||90;
    c.width=W; c.height=H;
    ctx.clearRect(0,0,W,H); ctx.fillStyle='rgba(20,31,58,.6)'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(56,189,248,.06)'; ctx.lineWidth=1;
    for(var i=0;i<=3;i++){ctx.beginPath();ctx.moveTo(0,(H/3)*i);ctx.lineTo(W,(H/3)*i);ctx.stroke();}
    var drawL=function(data,max,col,al){
      if(!data.length)return; ctx.beginPath(); ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.globalAlpha=al;
      data.forEach(function(v,i){var x=(i/(data.length-1))*W,y=H-(v/max)*H*0.85-3; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
      ctx.stroke(); ctx.globalAlpha=1;
    };
    drawL(S.telemHist.alt,200,'#00d4ff',0.85);
    drawL(S.telemHist.bat,100,'#34d399',0.7);
    ctx.fillStyle='rgba(0,212,255,.7)'; ctx.font='7px monospace'; ctx.fillText('ALT',3,10);
    ctx.fillStyle='rgba(52,211,153,.7)'; ctx.fillText('BAT%',22,10);
  });
}

function startDemo() {
  if(!S.waypoints.length){toast('Generate a flight plan first','a');return;}
  var i=0;
  var ico=L.divIcon({html:'<div style="font-size:18px;filter:drop-shadow(0 0 4px #00d4ff)">🚁</div>',className:'',iconAnchor:[9,9]});
  var mk=L.marker([S.waypoints[0].lat,S.waypoints[0].lng],{icon:ico}).addTo(S.map);
  S.demoTimer=setInterval(function(){
    if(i>=S.waypoints.length){clearInterval(S.demoTimer);S.map.removeLayer(mk);toast('Demo complete','g');return;}
    mk.setLatLng([S.waypoints[i].lat,S.waypoints[i].lng]);
    S.telem.alt=parseFloat(document.getElementById('fp-alt').value)||120;
    S.telem.spd=parseFloat(document.getElementById('fp-speed').value)||10;
    S.telem.bat=Math.max(20,S.telem.bat-0.3); S.telem.dst=i*50;
    updateGauges(); i++;
  },600);
  startTelemDemo(); toast('Demo flight started','b');
}

function stopDemo() {
  if(S.demoTimer){clearInterval(S.demoTimer);S.demoTimer=null;}
  if(S.telemTimer){clearInterval(S.telemTimer);S.telemTimer=null;}
  toast('Demo stopped','a');
}

/* ── COORDINATE SYSTEM ── */
function switchCTab(tab) {
  document.querySelectorAll('.ctab').forEach(function(t,i){var tabs=['dd','dms','utm','bbox','wkt','circle'];t.classList.toggle('on',tabs[i]===tab);});
  document.querySelectorAll('.cpanel').forEach(function(p){p.classList.remove('on');});
  var el=document.getElementById('cp-'+tab); if(el) el.classList.add('on');
}

function addDDPt() {
  var c=document.getElementById('dd-pts');
  var d=document.createElement('div'); d.className='fg-row'; d.style.marginBottom='5px';
  d.innerHTML='<div class="fg"><label>Latitude</label><input type="number" class="ddlat" step="0.000001" placeholder="-1.286"/></div><div class="fg"><label>Longitude</label><input type="number" class="ddlng" step="0.000001" placeholder="36.817"/></div>';
  c.appendChild(d);
}

function buildDDPoly() {
  var lats=[].slice.call(document.querySelectorAll('.ddlat')).map(function(i){return parseFloat(i.value);}).filter(function(v){return !isNaN(v);});
  var lngs=[].slice.call(document.querySelectorAll('.ddlng')).map(function(i){return parseFloat(i.value);}).filter(function(v){return !isNaN(v);});
  if(lats.length<3){toast('Need ≥3 points','a');return;}
  buildPolyFromCoords(lats.map(function(lat,i){return{lat,lng:lngs[i]};}));
  closeModal('coord'); toast('Polygon from '+lats.length+' DD points','g');
}

function convDMS() {
  var la=document.getElementById('dms-lat').value, lo=document.getElementById('dms-lng').value;
  var lat=parseDMS(la), lng=parseDMS(lo);
  if(isNaN(lat)||isNaN(lng)){toast('Invalid DMS','a');return;}
  var out=document.getElementById('dms-out'); out.style.display='block';
  out.textContent='DD: '+lat.toFixed(7)+', '+lng.toFixed(7);
  S.map.flyTo([lat,lng],14);
}

function parseDMS(str) {
  var s=str.replace(/[°'"]/g,' ').replace(/[NSEW]/gi,function(d){return ' '+d;}).trim();
  var p=s.split(/\s+/).filter(Boolean);
  if(p.length<3)return NaN;
  var d=parseFloat(p[0])+parseFloat(p[1])/60+parseFloat(p[2])/3600;
  var dir=(p[p.length-1]||'').toUpperCase();
  if(dir==='S'||dir==='W') d=-d; return d;
}

function convUTM() {
  var z=parseInt(document.getElementById('utm-z').value), b=document.getElementById('utm-b').value;
  var E=parseFloat(document.getElementById('utm-e').value), N=parseFloat(document.getElementById('utm-n').value);
  var lon0=(z-1)*6-180+3, k0=0.9996, a=6378137, e2=0.00669438;
  var x=E-500000, y=b==='S'?N-10000000:N;
  var M=y/k0, mu=M/(a*(1-e2/4-3*e2*e2/64));
  var lat=mu+(3*Math.sqrt(e2)/2-27*Math.pow(e2,1.5)/32)*Math.sin(2*mu);
  var C1=e2*Math.cos(lat)*Math.cos(lat)/(1-e2), T1=Math.tan(lat)*Math.tan(lat);
  var N1=a/Math.sqrt(1-e2*Math.sin(lat)*Math.sin(lat)), R1=a*(1-e2)/Math.pow(1-e2*Math.sin(lat)*Math.sin(lat),1.5);
  var D=x/(N1*k0);
  var latD=lat-(N1*Math.tan(lat)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*e2)*D*D*D*D/24);
  var lngD=lon0*Math.PI/180+(D-(1+2*T1+C1)*D*D*D/6)/Math.cos(lat);
  var lo=latD*180/Math.PI, ln=lngD*180/Math.PI;
  var out=document.getElementById('utm-out'); out.style.display='block';
  out.textContent='WGS84: '+lo.toFixed(7)+', '+ln.toFixed(7);
  S.map.flyTo([lo,ln],14); toast('UTM converted','g');
}

function buildBBox() {
  var N=parseFloat(document.getElementById('bb-n').value), S2=parseFloat(document.getElementById('bb-s').value);
  var E=parseFloat(document.getElementById('bb-e').value), W=parseFloat(document.getElementById('bb-w').value);
  if([N,S2,E,W].some(isNaN)){toast('Invalid values','a');return;}
  buildPolyFromCoords([{lat:S2,lng:W},{lat:N,lng:W},{lat:N,lng:E},{lat:S2,lng:E}]);
  S.map.fitBounds([[S2,W],[N,E]],{padding:[40,40]});
  closeModal('coord'); toast('Bounding box AOI created','g');
}

function importWKT() {
  var raw=document.getElementById('wkt-in').value.trim();
  var m=raw.match(/POLYGON\s*\(\s*\(([^)]+)\)/i);
  if(!m){toast('Invalid WKT format','a');return;}
  var pts=m[1].split(',').map(function(pair){var p=pair.trim().split(/\s+/);return{lat:parseFloat(p[1]),lng:parseFloat(p[0])};}).filter(function(c){return !isNaN(c.lat)&&!isNaN(c.lng);});
  if(pts.length<3){toast('Need ≥3 WKT points','a');return;}
  buildPolyFromCoords(pts); closeModal('coord'); toast('WKT imported — '+pts.length+' pts','g');
}

function buildCircle() {
  var lat=parseFloat(document.getElementById('ci-lat').value), lng=parseFloat(document.getElementById('ci-lng').value), r=parseFloat(document.getElementById('ci-r').value)||500;
  if(isNaN(lat)||isNaN(lng)){toast('Invalid coords','a');return;}
  S.aoiLayer.clearLayers();
  L.circle([lat,lng],{radius:r,color:'#00d4ff',fillOpacity:0.08,weight:2}).addTo(S.aoiLayer);
  var ha=(Math.PI*r*r)/10000;
  document.getElementById('sa-area').value=ha.toFixed(2);
  document.getElementById('sb-area').textContent=ha.toFixed(1)+' ha';
  S.map.flyTo([lat,lng],14); closeModal('coord'); toast('Circle AOI: r='+r+'m ('+ha.toFixed(1)+' ha)','g');
}

function buildPolyFromCoords(pts) {
  S.aoiLayer.clearLayers();
  var poly=L.polygon(pts.map(function(p){return[p.lat,p.lng];}),{color:'#00d4ff',fillOpacity:0.08,weight:2});
  S.aoiLayer.addLayer(poly);
  var area=calcPolyArea(pts.map(function(p){return{lat:p.lat,lng:p.lng};}));
  document.getElementById('sa-area').value=area.toFixed(2);
  document.getElementById('sb-area').textContent=area.toFixed(1)+' ha';
  S.map.fitBounds(poly.getBounds().pad(0.2)); calcFlight();
}

/* ── ANALYSIS TOOLS ── */
function liveGSD() {
  var alt=parseFloat(document.getElementById('c-alt').value)||120;
  var px=parseFloat(document.getElementById('c-px').value)||4.4;
  var f=parseFloat(document.getElementById('c-f').value)||35;
  var sw=parseFloat(document.getElementById('c-sw').value)||35.9;
  var g=(alt*px)/(f*10), s=(sw/f)*alt;
  var eg=document.getElementById('c-gsd'); if(eg) eg.textContent=g.toFixed(2);
  var es=document.getElementById('c-sw2'); if(es) es.textContent=s.toFixed(0);
}

function liveConvert() {
  var raw=document.getElementById('cv-dd').value.trim(), p=raw.split(/[\s,]+/);
  if(p.length<2){document.getElementById('cv-out').style.display='none';return;}
  var lat=parseFloat(p[0]),lng=parseFloat(p[1]);
  if(isNaN(lat)||isNaN(lng))return;
  var out=document.getElementById('cv-out'); out.style.display='block';
  out.innerHTML='DD: '+lat.toFixed(7)+', '+lng.toFixed(7)+'<br>DMS: '+dd2dms(lat,'lat')+', '+dd2dms(lng,'lng');
}

function dd2dms(dec,axis) {
  var neg=dec<0, d=Math.floor(Math.abs(dec)), m=Math.floor((Math.abs(dec)-d)*60), s=((Math.abs(dec)-d-m/60)*3600).toFixed(2);
  var dir=axis==='lat'?(neg?'S':'N'):(neg?'W':'E');
  return d+'°'+m+"'"+s+'"'+dir;
}

function liveCov() {
  var a=parseFloat(document.getElementById('cv-area').value)||100;
  var c=parseFloat(document.getElementById('cv-cov').value)||200;
  var fl=Math.ceil(a/c), bt=Math.ceil(fl*45/40);
  var ef=document.getElementById('cv-fl'); if(ef) ef.textContent=fl;
  var eb=document.getElementById('cv-bt'); if(eb) eb.textContent=bt;
}

/* ── EXPORTS ── */
function chkWP() { if(!S.waypoints.length){toast('Generate a flight plan first','a');return false;} return true; }
function dl(name,content,type) { var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function getAlt() { return document.getElementById('fp-alt').value||120; }
function getMission() { return document.getElementById('fp-name').value||'AeroGIS_Mission'; }

function xGeoJSON() {
  if(!chkWP())return;
  var alt=getAlt(), name=getMission();
  var fc={type:'FeatureCollection',name,generator:'AeroGIS Pro v5',crs:{type:'name',properties:{name:'EPSG:4326'}},features:[
    {type:'Feature',properties:{name:'Flight Path',altitude_m:+alt},geometry:{type:'LineString',coordinates:S.waypoints.map(function(w){return[+w.lng.toFixed(7),+w.lat.toFixed(7),+alt];})}},
    ...S.waypoints.map(function(w,i){return{type:'Feature',properties:{seq:i+1,altitude_m:+alt},geometry:{type:'Point',coordinates:[+w.lng.toFixed(7),+w.lat.toFixed(7),+alt]}};})
  ]};
  dl(name+'_'+datestamp()+'.geojson',JSON.stringify(fc,null,2),'application/geo+json');
  toast('GeoJSON exported','g');
}

function xKML() {
  if(!chkWP())return;
  var alt=getAlt(), name=getMission();
  var kml='<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>'+name+'</name>\n<Placemark><name>Flight Path</name><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>'+S.waypoints.map(function(w){return w.lng.toFixed(7)+','+w.lat.toFixed(7)+','+alt;}).join('\n')+'</coordinates></LineString></Placemark>\n'+S.waypoints.map(function(w,i){return '<Placemark><name>WP'+String(i+1).padStart(3,'0')+'</name><Point><altitudeMode>relativeToGround</altitudeMode><coordinates>'+w.lng.toFixed(7)+','+w.lat.toFixed(7)+','+alt+'</coordinates></Point></Placemark>';}).join('\n')+'\n</Document></kml>';
  dl(name+'_'+datestamp()+'.kml',kml,'application/vnd.google-earth.kml+xml');
  toast('KML exported','g');
}

function xCSV() {
  if(!chkWP())return;
  var alt=getAlt();
  var rows=['seq,lat,lng,altitude_m,action',...S.waypoints.map(function(w,i){return (i+1)+','+w.lat.toFixed(7)+','+w.lng.toFixed(7)+','+alt+','+(i===S.waypoints.length-1?'RTH':'WP');})];
  dl(getMission()+'_waypoints_'+datestamp()+'.csv',rows.join('\n'),'text/csv');
  toast('CSV exported','g');
}

function xMissionPlanner() {
  if(!chkWP())return;
  var alt=getAlt();
  var lines=['QGC WPL 110','0\t1\t0\t16\t0\t0\t0\t0\t'+S.waypoints[0].lat+'\t'+S.waypoints[0].lng+'\t'+alt+'\t1'];
  S.waypoints.forEach(function(w,i){lines.push((i+1)+'\t0\t3\t16\t0\t0\t0\t0\t'+w.lat.toFixed(7)+'\t'+w.lng.toFixed(7)+'\t'+alt+'\t1');});
  lines.push((S.waypoints.length+1)+'\t0\t3\t20\t0\t0\t0\t0\t0\t0\t0\t1');
  dl(getMission()+'_'+datestamp()+'.waypoints',lines.join('\n'),'text/plain');
  toast('Mission Planner exported','g');
}

function xDJI() {
  if(!chkWP())return;
  var alt=+getAlt(), spd=+(document.getElementById('fp-speed').value)||10;
  var plan={version:'1.0.0',author:'AeroGIS Pro v5',createTime:Date.now(),missionConfig:{flyToWaylineMode:'safely',finishAction:'goHome',globalTransitionalSpeed:spd,globalRTHHeight:50},waylines:[{waylineId:0,autoFlightSpeed:spd,waypointArray:S.waypoints.map(function(w,i){return{waypointIndex:i,coordinate:[+w.lng.toFixed(7),+w.lat.toFixed(7)],executeHeight:alt,waypointSpeed:spd};})}]};
  dl(getMission()+'_DJIPilot2_'+datestamp()+'.json',JSON.stringify(plan,null,2),'application/json');
  toast('DJI Pilot 2 exported','g');
}

function xGPX() {
  if(!chkWP())return;
  var alt=getAlt(), name=getMission();
  var gpx='<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="AeroGIS Pro v5" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>'+name+'</name><trkseg>'+S.waypoints.map(function(w){return '<trkpt lat="'+w.lat.toFixed(7)+'" lon="'+w.lng.toFixed(7)+'"><ele>'+alt+'</ele></trkpt>';}).join('')+'</trkseg></trk>'+S.waypoints.map(function(w,i){return '<wpt lat="'+w.lat.toFixed(7)+'" lon="'+w.lng.toFixed(7)+'"><ele>'+alt+'</ele><name>WP'+String(i+1).padStart(3,'0')+'</name></wpt>';}).join('')+'</gpx>';
  dl(name+'_'+datestamp()+'.gpx',gpx,'application/gpx+xml');
  toast('GPX exported','g');
}

function exportAssessReport() {
  var res=document.getElementById('assess-result');
  if(!res||res.style.display==='none'){toast('Run a site assessment first','a');return;}
  var name=document.getElementById('sa-name').value||'Site';
  var win=window.open('','_blank');
  if(win){
    win.document.write('<!DOCTYPE html><html><head><title>AeroGIS Assessment — '+name+'</title><style>body{font-family:Georgia,serif;padding:40px;max-width:800px;margin:0 auto;color:#111;}h1{color:#0c4a6e;border-bottom:2px solid #0c4a6e;padding-bottom:8px}@media print{body{padding:20px}}</style></head><body><h1>🗺 AeroGIS Pro v5 — Site Assessment Report</h1><p><strong>Site:</strong> '+name+' &nbsp; <strong>Date:</strong> '+new Date().toLocaleDateString()+'</p>'+res.innerHTML+'<hr><p style="font-size:11px;color:#999">Generated by AeroGIS Pro v5 · For planning purposes only</p><script>window.print();<\/script></body></html>');
    win.document.close();
  }
}

function exportMapPNG() {
  toast('Map PNG: Use browser Print → Save as PDF, or Ctrl+Shift+S for screenshot','a');
}

function exportGeoJSONZones() {
  var b=S.map.getBounds();
  var fc={type:'FeatureCollection',features:[{type:'Feature',properties:{zone:'Study Area',source:'AeroGIS Pro v5',date:new Date().toISOString()},geometry:{type:'Polygon',coordinates:[[[b.getWest(),b.getSouth()],[b.getEast(),b.getSouth()],[b.getEast(),b.getNorth()],[b.getWest(),b.getNorth()],[b.getWest(),b.getSouth()]]]}}]};
  dl('AeroGIS_Zones_'+datestamp()+'.geojson',JSON.stringify(fc,null,2),'application/geo+json');
  toast('GeoJSON zones exported','g');
}

/* ── UI UTILITIES ── */
function sv(id, sfx) { var el=document.getElementById(id+'-v'); if(el) el.textContent=document.getElementById(id).value+sfx; }
function setStatus(msg,type) { var el=document.getElementById('sb-status'); if(!el)return; el.textContent=msg; el.className=type||''; }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('hidden'); }
function toggleSW(el) { el.classList.toggle('on'); }

function openModal(id) { var m=document.getElementById('modal-'+id); if(m)m.classList.add('open'); }
function closeModal(id) { var m=document.getElementById('modal-'+id); if(m)m.classList.remove('open'); }
window.addEventListener('click', function(e){ if(e.target.classList.contains('modal-bg')) e.target.classList.remove('open'); });

function toast(msg, type) {
  var w=document.getElementById('toast-wrap'); if(!w)return;
  var t=document.createElement('div'); t.className='toast '+(type||'');
  t.textContent=({'g':'✅ ','a':'⚠ ','r':'🚫 ','b':'ℹ '}[type]||'')+msg;
  w.appendChild(t); requestAnimationFrame(function(){t.classList.add('on');});
  setTimeout(function(){t.classList.remove('on');setTimeout(function(){t.remove();},400);},3000);
}

function alert_show(msg, type) {
  var bar=document.getElementById('alert-bar'), id='al'+Date.now();
  var d=document.createElement('div'); d.className='alert-item '+(type||'b'); d.id=id;
  var icons={r:'🚫',a:'⚠',g:'✅',b:'ℹ'};
  d.innerHTML='<span>'+(icons[type]||'ℹ')+'</span><div style="flex:1;font-size:11px">'+msg+'</div><span class="alert-x" onclick="document.getElementById(\''+id+'\').remove()">✕</span>';
  bar.appendChild(d); setTimeout(function(){var el=document.getElementById(id);if(el)el.remove();},8000);
}

function startClock() {
  var tick=function(){
    var n=new Date(), h=String(n.getUTCHours()).padStart(2,'0'), m=String(n.getUTCMinutes()).padStart(2,'0'), s=String(n.getUTCSeconds()).padStart(2,'0');
    var el=document.getElementById('utc-clock'); if(el) el.textContent=h+':'+m+':'+s+' UTC';
  };
  tick(); setInterval(tick,1000);
}

function datestamp() { return new Date().toISOString().slice(0,10).replace(/-/g,''); }
