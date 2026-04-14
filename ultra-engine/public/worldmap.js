(function(){
'use strict';

const API = '/api/wm/map';
const NEWS_API = '/api/wm/news';
const WM_API = '/api/wm';

// ═══════════════════════════════════════════════════════════
// TIMING CONSTANTS (milliseconds) — all in one place for tuning
// ═══════════════════════════════════════════════════════════
const TIMING = {
  LAYER_REFRESH:     90 * 1000,       // 90s — re-fetch active map layers
  NEWS_REFRESH:      3 * 60 * 1000,   // 3m — re-fetch news feed
  FULL_REFRESH:      5 * 60 * 1000,   // 5m — full data refresh (brief, markets, etc.)
  FRESHNESS_TICK:    30 * 1000,       // 30s — update "X min ago" text
  RELATIVE_TIME_TICK: 5 * 1000,       // 5s — update "last-update" in status bar
  ACTIVITY_CACHE_TTL: 2 * 60 * 1000,  // 2m — activity data cache
  TOAST_DEFAULT_MS:  6 * 1000,        // 6s — toast auto-dismiss
  ONLINE_BANNER_MS:  3 * 1000,        // 3s — "back online" banner
  SUMMARY_FLASH_MS:  1200,            // 1.2s — highlight new summary
  SEARCH_DEBOUNCE:   400,             // 400ms — wait after typing before searching
  SUGGEST_DEBOUNCE:  200,             // 200ms — wait before fetching suggestions
};
const LIMITS = {
  NEWS_PAGE_SIZE:    80,
  SEARCH_RESULTS:    80,
  SIBLING_ARTICLES:  5,
  TRANSLATE_MAX_CHARS: 7500,
};

const abort = {};
const staticCache = {};
let map, geoHierarchy = null, geojsonData = null;
let lastUpdateTime = Date.now();
const CC = {};
const FLAG = {};
function isoToFlag(iso) {
  if (FLAG[iso]) return FLAG[iso];
  if (!iso || iso.length !== 2) return '';
  const cp = [...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return FLAG[iso] = String.fromCodePoint(...cp);
}

// Global intel data
let activityData = {};
let summaryData = null;
let countryMapData = null; // sentiment, gdelt, scores, alerts
let choroplethMode = 'risk'; // 'risk', 'density', 'sentiment'
let newsSort = 'date'; // 'date', 'relevance', 'sentiment'

// === LAYOUT CUSTOMIZATION ===
const LAYOUT_KEY = 'wm_layout_v1';
const DEFAULT_LAYOUT = {
  density: 'comfortable',
  workspace: 'everything',
  toggles: {
    'show-mkt-strip': true,
    'show-pulse-strip': true,
    'show-intel-brief': true,
    'show-narrative-brief': true,
    'show-news-toolbar': true,
    'show-pred-overlay': true,
    'show-conv-zones': true,
    'show-choro-legend': true,
    'show-topic-legend': true,
    'show-status-bar': true,
    'show-coords': true,
    'show-counts': true,
    'auto-collapse-briefs': false,
    'reduce-motion': false,
  }
};
// Workspaces: each defines UI toggles + content filters (topics/layers/sort/time/persona)
// `topics: 'all'` = show all topics, `topics: []` = no filter, `topics: [...]` = whitelist
// `geoFocus: 'africa'` optionally zooms to a region on apply
const LIGHT_TOGGLES = { 'show-mkt-strip':false, 'show-pulse-strip':false, 'show-intel-brief':false, 'show-narrative-brief':false, 'show-news-toolbar':true, 'show-pred-overlay':false, 'show-conv-zones':false, 'show-choro-legend':true, 'show-topic-legend':false, 'show-status-bar':true, 'show-coords':false, 'show-counts':false, 'auto-collapse-briefs':true, 'reduce-motion':false };
const FULL_TOGGLES = { 'show-mkt-strip':true, 'show-pulse-strip':true, 'show-intel-brief':true, 'show-narrative-brief':true, 'show-news-toolbar':true, 'show-pred-overlay':true, 'show-conv-zones':true, 'show-choro-legend':true, 'show-topic-legend':true, 'show-status-bar':true, 'show-coords':true, 'show-counts':true, 'auto-collapse-briefs':false, 'reduce-motion':false };
const NEWS_TOGGLES = { 'show-mkt-strip':false, 'show-pulse-strip':true, 'show-intel-brief':true, 'show-narrative-brief':false, 'show-news-toolbar':true, 'show-pred-overlay':false, 'show-conv-zones':true, 'show-choro-legend':true, 'show-topic-legend':true, 'show-status-bar':true, 'show-coords':false, 'show-counts':true, 'auto-collapse-briefs':false, 'reduce-motion':false };

const WORKSPACES = {
  everything: {
    icon:'&#127760;', label:'Everything', category:'General',
    desc:'Show all data, no filtering',
    toggles: FULL_TOGGLES,
    topics: 'all', layers: null, sort: 'date', timeRange: 48, choroplethMode: 'risk',
  },
  my_country: {
    icon:'&#127968;', label:'My Country', category:'Personal',
    desc:'Focus on your home country (set in Settings)',
    toggles: LIGHT_TOGGLES,
    topics: 'all', layers: [], sort: 'date', timeRange: 24, choroplethMode: 'density',
    geoFocus: 'home',
  },
  retiree: {
    icon:'&#127822;', label:'Easy Reading', category:'Personal',
    desc:'General news, minimal alerts, calm design',
    toggles: Object.assign({}, LIGHT_TOGGLES, {'reduce-motion':true}),
    topics: ['general_world_news','elections_governance','health_medicine','climate_environment','culture_entertainment','sports'],
    layers: [], sort: 'date', timeRange: 24, choroplethMode: 'density',
    calmMode: true,
  },
  traveler_africa: {
    icon:'&#128506;', label:'Travel · Africa', category:'Travel',
    desc:'Safety, health, tourism news across Africa',
    toggles: LIGHT_TOGGLES,
    topics: ['general_world_news','conflict','geopolitics','disaster_natural','health_medicine','tourism_travel','migration_refugees'],
    layers: ['events','hotspots','disasters','outages'], sort: 'date', timeRange: 48, choroplethMode: 'risk',
    geoFocus: 'Africa',
  },
  traveler_asia: {
    icon:'&#128506;', label:'Travel · Asia', category:'Travel',
    desc:'Asia-focused travel, safety, tourism',
    toggles: LIGHT_TOGGLES,
    topics: ['general_world_news','geopolitics','disaster_natural','health_medicine','tourism_travel','gastronomy_food_culture','culture_entertainment'],
    layers: ['events','disasters','hotspots'], sort: 'date', timeRange: 48, choroplethMode: 'risk',
    geoFocus: 'Asia',
  },
  traveler_europe: {
    icon:'&#128506;', label:'Travel · Europe', category:'Travel',
    desc:'Europe travel, culture, tourism',
    toggles: LIGHT_TOGGLES,
    topics: ['general_world_news','tourism_travel','gastronomy_food_culture','culture_entertainment','disaster_natural','elections_governance'],
    layers: ['events','disasters'], sort: 'date', timeRange: 48, choroplethMode: 'density',
    geoFocus: 'Europe',
  },
  young_tech: {
    icon:'&#128187;', label:'Tech Enthusiast', category:'Tech & Science',
    desc:'AI, startups, tech innovations, space',
    toggles: NEWS_TOGGLES,
    topics: ['technology','science_research','space_astronomy','startups_venture','cybersecurity','gaming_esports'],
    layers: ['countries'], sort: 'date', timeRange: 24, choroplethMode: 'density',
  },
  crypto: {
    icon:'&#8383;', label:'Crypto', category:'Tech & Science',
    desc:'Crypto markets, blockchain news, regulation',
    toggles: FULL_TOGGLES,
    topics: ['technology','startups_venture','economy_finance','cybersecurity','legal_justice'],
    layers: ['economic','cables'], sort: 'date', timeRange: 12, choroplethMode: 'density',
  },
  cyber_pro: {
    icon:'&#128272;', label:'Cybersecurity', category:'Tech & Science',
    desc:'Cyber threats, breaches, infrastructure attacks',
    toggles: FULL_TOGGLES,
    topics: ['cybersecurity','technology','crime_organized','geopolitics'],
    layers: ['outages','cables','nuclear','events'], sort: 'relevance', timeRange: 48, choroplethMode: 'risk',
  },
  space: {
    icon:'&#128640;', label:'Space', category:'Tech & Science',
    desc:'Space missions, astronomy, aerospace',
    toggles: NEWS_TOGGLES,
    topics: ['space_astronomy','science_research','technology','military_defense'],
    layers: ['nuclear','bases'], sort: 'date', timeRange: 72, choroplethMode: 'density',
  },
  war_watcher: {
    icon:'&#9888;', label:'War Watch', category:'News & Analysis',
    desc:'Conflicts, military movements, geopolitics',
    toggles: FULL_TOGGLES,
    topics: ['conflict','geopolitics','military_defense','nuclear_proliferation','crime_organized'],
    layers: ['mil-flights','mil-vessels','bases','hotspots','events','countries'], sort: 'relevance', timeRange: 48, choroplethMode: 'risk',
  },
  peace_activist: {
    icon:'&#9774;', label:'Peace Watch', category:'Causes',
    desc:'Human rights, migration, ceasefires, diplomacy',
    toggles: NEWS_TOGGLES,
    topics: ['human_rights','migration_refugees','elections_governance','united_nations','legal_justice','media_journalism','general_world_news'],
    layers: ['events','hotspots'], sort: 'date', timeRange: 48, choroplethMode: 'sentiment',
    calmMode: true,
  },
  climate_activist: {
    icon:'&#127757;', label:'Climate', category:'Causes',
    desc:'Climate change, natural disasters, biodiversity',
    toggles: NEWS_TOGGLES,
    topics: ['climate_environment','disaster_natural','biodiversity_wildlife','agriculture_farming','science_research','elections_governance'],
    layers: ['fires','quakes','disasters','hotspots','countries'], sort: 'relevance', timeRange: 48, choroplethMode: 'density',
  },
  humanitarian: {
    icon:'&#129309;', label:'Humanitarian', category:'Causes',
    desc:'Aid crises, refugees, disease outbreaks',
    toggles: NEWS_TOGGLES,
    topics: ['migration_refugees','human_rights','disaster_natural','medicine_pharma','conflict','united_nations'],
    layers: ['disasters','events','hotspots','outages'], sort: 'date', timeRange: 72, choroplethMode: 'risk',
  },
  trader: {
    icon:'&#128200;', label:'Trader', category:'Finance',
    desc:'Markets, commodities, supply chains',
    toggles: Object.assign({}, FULL_TOGGLES, {'show-intel-brief':false,'show-conv-zones':false,'show-topic-legend':false,'show-coords':false,'show-counts':false}),
    topics: ['economy_finance','supply_chain','real_estate','startups_venture','maritime','technology','agriculture_farming','geopolitics'],
    layers: ['com-flights','com-vessels','pipelines','ports','cables','economic'], sort: 'relevance', timeRange: 24, choroplethMode: 'density',
  },
  economist: {
    icon:'&#127970;', label:'Economist', category:'Finance',
    desc:'Macro indicators, monetary policy, markets',
    toggles: FULL_TOGGLES,
    topics: ['economy_finance','supply_chain','elections_governance','geopolitics','real_estate','agriculture_farming'],
    layers: ['pipelines','ports','cables','economic','countries'], sort: 'relevance', timeRange: 48, choroplethMode: 'density',
  },
  energy: {
    icon:'&#9889;', label:'Energy', category:'Finance',
    desc:'Oil, gas, power, pipelines, chokepoints',
    toggles: FULL_TOGGLES,
    topics: ['economy_finance','supply_chain','climate_environment','geopolitics','conflict'],
    layers: ['pipelines','ports','nuclear','com-vessels','outages'], sort: 'relevance', timeRange: 48, choroplethMode: 'density',
  },
  agri: {
    icon:'&#127806;', label:'Agriculture', category:'Finance',
    desc:'Commodity crops, weather, food chains',
    toggles: NEWS_TOGGLES,
    topics: ['agriculture_farming','economy_finance','supply_chain','climate_environment','disaster_natural'],
    layers: ['ports','pipelines','com-vessels','fires'], sort: 'date', timeRange: 72, choroplethMode: 'density',
  },
  maritime: {
    icon:'&#9875;', label:'Maritime', category:'Industry',
    desc:'Shipping, ports, vessel tracking, chokepoints',
    toggles: FULL_TOGGLES,
    topics: ['maritime','supply_chain','economy_finance','geopolitics','conflict'],
    layers: ['com-vessels','mil-vessels','ports','pipelines','cables','hotspots'], sort: 'date', timeRange: 24, choroplethMode: 'density',
  },
  aviation: {
    icon:'&#9992;', label:'Aviation', category:'Industry',
    desc:'Commercial flights, aviation incidents',
    toggles: NEWS_TOGGLES,
    topics: ['supply_chain','economy_finance','geopolitics','technology','conflict'],
    layers: ['com-flights','mil-flights','bases'], sort: 'date', timeRange: 12, choroplethMode: 'density',
  },
  politics: {
    icon:'&#127891;', label:'Politics', category:'News & Analysis',
    desc:'Elections, policy, governance, law',
    toggles: NEWS_TOGGLES,
    topics: ['elections_governance','legal_justice','human_rights','geopolitics','crime_organized','media_journalism'],
    layers: ['events','countries'], sort: 'date', timeRange: 48, choroplethMode: 'sentiment',
  },
  health: {
    icon:'&#129658;', label:'Health', category:'News & Analysis',
    desc:'Outbreaks, medicine, public health',
    toggles: NEWS_TOGGLES,
    topics: ['medicine_pharma','science_research','disaster_natural','human_rights','general_world_news'],
    layers: ['disasters','events'], sort: 'date', timeRange: 72, choroplethMode: 'risk',
  },
  sports_fan: {
    icon:'&#9917;', label:'Sports', category:'Personal',
    desc:'Football, F1, NBA, combat sports',
    toggles: LIGHT_TOGGLES,
    topics: ['football_soccer','basketball_nba','motorsport_f1','combat_sports','athletics_other','gaming_esports'],
    layers: [], sort: 'date', timeRange: 24, choroplethMode: 'density',
  },
  journalist: {
    icon:'&#9997;', label:'Journalist', category:'News & Analysis',
    desc:'Breaking news, focal points, narratives',
    toggles: NEWS_TOGGLES,
    topics: ['geopolitics','conflict','elections_governance','human_rights','crime_organized','migration_refugees','legal_justice','general_world_news','media_journalism'],
    layers: ['events','hotspots','outages','countries','disasters'], sort: 'date', timeRange: 24, choroplethMode: 'sentiment',
  },
  analyst: {
    icon:'&#128270;', label:'Intel Analyst', category:'News & Analysis',
    desc:'Signals, military, convergence zones',
    toggles: FULL_TOGGLES,
    topics: ['geopolitics','conflict','military_defense','cybersecurity','nuclear_proliferation','maritime','space_astronomy','crime_organized'],
    layers: ['mil-flights','mil-vessels','bases','hotspots','nuclear','events','countries'], sort: 'relevance', timeRange: 48, choroplethMode: 'risk',
  },
  minimal: {
    icon:'&#10066;', label:'Minimal', category:'General',
    desc:'Just the map + top stories',
    toggles: { 'show-mkt-strip':false, 'show-pulse-strip':false, 'show-intel-brief':false, 'show-narrative-brief':false, 'show-news-toolbar':true, 'show-pred-overlay':false, 'show-conv-zones':false, 'show-choro-legend':false, 'show-topic-legend':false, 'show-status-bar':false, 'show-coords':false, 'show-counts':false, 'auto-collapse-briefs':true, 'reduce-motion':false },
    topics: ['geopolitics','conflict','general_world_news'],
    layers: [], sort: 'relevance', timeRange: 6, choroplethMode: 'risk',
  },
};

// === END WORKSPACES ===

function getLayout(){ try { return Object.assign({}, DEFAULT_LAYOUT, JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}'), {toggles: Object.assign({}, DEFAULT_LAYOUT.toggles, (JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')).toggles||{})}) } catch { return DEFAULT_LAYOUT } }
function saveLayout(l){ localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); }

function applyLayout(layout){
  const body = document.body;
  // Reset density classes
  body.classList.remove('density-comfortable','density-compact','density-dense');
  body.classList.add('density-'+(layout.density||'comfortable'));
  // Apply toggles (hide-X classes when toggle is false)
  Object.entries(layout.toggles).forEach(([k,v])=>{
    const cls='hide-'+k.replace(/^show-/,'');
    if(k.startsWith('show-')){ body.classList.toggle(cls, !v); }
    else { body.classList.toggle(k, v); }
  });
  // Update settings panel UI to reflect state
  document.querySelectorAll('.sd-toggle input[type="checkbox"]').forEach(cb=>{
    const k = cb.dataset.toggle;
    if(layout.toggles[k] !== undefined) cb.checked = layout.toggles[k];
  });
  document.querySelectorAll('.sd-d').forEach(b=> b.classList.toggle('active', b.dataset.density===layout.density));
  document.querySelectorAll('.sd-ws').forEach(b=> b.classList.toggle('active', b.dataset.ws===layout.workspace));
  // Trigger map resize if needed
  if(typeof map!=='undefined' && map) setTimeout(()=>map.invalidateSize(), 50);
  // Apply auto-collapse briefs if enabled
  if(layout.toggles['auto-collapse-briefs']){
    document.getElementById('intel-toggle')?.classList.add('collapsed');
    document.getElementById('intel-brief')?.classList.remove('open');
    document.getElementById('narrative-toggle')?.classList.add('collapsed');
    document.getElementById('narrative-brief')?.classList.remove('open');
  }
}

function setWorkspace(name){
  const layout = getLayout();
  layout.workspace = name;
  const ws = WORKSPACES[name];
  if(!ws){ saveLayout(layout); applyLayout(layout); return; }

  // 1. Apply UI toggles
  layout.toggles = Object.assign({}, layout.toggles, ws.toggles);
  saveLayout(layout);
  applyLayout(layout);

  // 2. Apply topic filter
  if(ws.topics === 'all'){
    // Activate all topic pills
    document.querySelectorAll('.topic-pill').forEach(p=>{ p.classList.add('active'); state.topics.add(p.dataset.topic); });
  } else if(Array.isArray(ws.topics)){
    state.topics.clear();
    document.querySelectorAll('.topic-pill').forEach(p=>{
      const t = p.dataset.topic;
      if(ws.topics.includes(t)){ p.classList.add('active'); state.topics.add(t); }
      else { p.classList.remove('active'); }
    });
  }
  saveActiveFilters();

  // 3. Apply map layers
  if(ws.layers !== null){
    const target = new Set(ws.layers);
    document.querySelectorAll('.layer-btn').forEach(btn=>{
      const ly = btn.dataset.layer;
      const shouldBeActive = target.has(ly);
      const isActive = btn.classList.contains('active');
      if(shouldBeActive && !isActive){
        btn.classList.add('active');
        if(LD[ly]){ LD[ly].g.addTo(map); load(ly); }
      } else if(!shouldBeActive && isActive){
        btn.classList.remove('active');
        if(LD[ly]){ map.removeLayer(LD[ly].g); LD[ly].n=0; updateCount(ly); }
      }
    });
    saveActiveLayers();
  }

  // 4. Apply sort
  if(ws.sort){
    newsSort = ws.sort;
    document.querySelectorAll('#sort-pills .time-pill').forEach(b=>{
      b.classList.toggle('active', b.dataset.sort === ws.sort);
    });
  }

  // 5. Apply time range
  if(ws.timeRange){
    newsHours = ws.timeRange;
    document.querySelectorAll('.news-toolbar .time-pills:not(#sort-pills) .time-pill').forEach(b=>{
      b.classList.toggle('active', parseInt(b.dataset.hours) === ws.timeRange);
    });
  }

  // 6. Apply choropleth mode
  if(ws.choroplethMode){
    choroplethMode = ws.choroplethMode;
    document.querySelectorAll('.mode-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.mode === ws.choroplethMode);
    });
    const countryBtn = document.querySelector('.layer-btn[data-layer="countries"]');
    if(countryBtn?.classList.contains('active')) load('countries');
    renderChoroplethLegend();
  }

  // 7. Update status bar + refresh news
  updateStatus();
  refreshNews();

  // 7b. Apply calm mode from workspace
  if(ws.calmMode !== undefined){
    const a = getA11y();
    a.calmMode = !!ws.calmMode;
    saveA11y(a);
    applyA11y(a);
  }

  // 7c. Geo focus — navigate to region/country
  if(ws.geoFocus){
    setTimeout(()=>{
      if(ws.geoFocus === 'home'){
        const home = getHomeCountry();
        if(home && CC[home]) navigateTo('country', home);
      } else {
        // Continent name
        const cont = geoHierarchy?.continents?.find(c => c.name === ws.geoFocus);
        if(cont) navigateTo('continent', cont.name);
      }
    }, 400);
  }

  // 8. Show what was applied
  const desc = document.getElementById('sd-ws-desc');
  if(desc){
    const topicCount = ws.topics === 'all' ? 'all topics' : (Array.isArray(ws.topics) ? ws.topics.length + ' topics' : '0 topics');
    const layerCount = ws.layers === null ? 'kept current' : (ws.layers.length === 0 ? 'all OFF' : ws.layers.length + ' active');
    desc.innerHTML = `<strong>${name.charAt(0).toUpperCase()+name.slice(1)} workspace applied:</strong><br>
      <span class="ws-tag">${topicCount}</span>
      <span class="ws-tag">${layerCount} layers</span>
      <span class="ws-tag">${ws.timeRange}h window</span>
      <span class="ws-tag">sort: ${ws.sort}</span>
      <span class="ws-tag">map: ${ws.choroplethMode}</span>`;
  }
}

function setDensity(d){
  const layout = getLayout();
  layout.density = d;
  saveLayout(layout);
  applyLayout(layout);
}

function setToggle(key, val){
  const layout = getLayout();
  layout.toggles[key] = val;
  layout.workspace = 'custom'; // mark as custom when manually toggled
  saveLayout(layout);
  applyLayout(layout);
}

// ═══════════════════════════════════════════════════════════
// HOME COUNTRY
// ═══════════════════════════════════════════════════════════
const HOME_KEY = 'wm_home_country';
function getHomeCountry(){ return localStorage.getItem(HOME_KEY) || null; }
function setHomeCountry(iso){
  iso = (iso||'').toUpperCase().trim();
  if(!iso || !/^[A-Z]{2}$/.test(iso)) { localStorage.removeItem(HOME_KEY); document.getElementById('home-btn').style.display='none'; return; }
  localStorage.setItem(HOME_KEY, iso);
  const btn = document.getElementById('home-btn');
  if(btn){ btn.innerHTML = isoToFlag(iso); btn.style.display='inline-flex'; btn.title = `Home: ${CC[iso]?.name||iso} (H)`; }
  const sdInp = document.getElementById('sd-home-country');
  if(sdInp) sdInp.value = iso;
}
function detectHomeCountry(){
  // Try browser locale (e.g., "en-US", "es-ES", "ar-DZ", "fr-NZ")
  const loc = navigator.language || 'en-US';
  const match = loc.match(/-([A-Z]{2})$/i);
  return match ? match[1].toUpperCase() : null;
}

// ═══════════════════════════════════════════════════════════
// ACCESSIBILITY
// ═══════════════════════════════════════════════════════════
const A11Y_KEY = 'wm_a11y_v1';
function getA11y(){ try { return Object.assign({fontSize:100, colorblind:'none', dyslexiaFont:false, calmMode:false}, JSON.parse(localStorage.getItem(A11Y_KEY)||'{}')) } catch { return {fontSize:100,colorblind:'none',dyslexiaFont:false,calmMode:false} } }
function saveA11y(a){ localStorage.setItem(A11Y_KEY, JSON.stringify(a)); }
function applyA11y(a){
  const body = document.body;
  ['font-80','font-100','font-120','font-150'].forEach(c => body.classList.remove(c));
  body.classList.add('font-'+(a.fontSize||100));
  ['cb-protanopia','cb-deuteranopia','cb-tritanopia'].forEach(c => body.classList.remove(c));
  if(a.colorblind && a.colorblind !== 'none') body.classList.add('cb-'+a.colorblind);
  body.classList.toggle('dyslexia-font', !!a.dyslexiaFont);
  body.classList.toggle('calm-mode', !!a.calmMode);
  // Update UI
  document.querySelectorAll('.sd-fs').forEach(b=>b.classList.toggle('active', parseInt(b.dataset.fs)===(a.fontSize||100)));
  document.querySelectorAll('.sd-cb').forEach(b=>b.classList.toggle('active', b.dataset.cb===(a.colorblind||'none')));
  const dysCb = document.querySelector('input[data-toggle="dyslexia-font"]');
  if(dysCb) dysCb.checked = !!a.dyslexiaFont;
  const calmCb = document.querySelector('input[data-toggle="calm-mode"]');
  if(calmCb) calmCb.checked = !!a.calmMode;
}

// ═══════════════════════════════════════════════════════════
// SHARE URL STATE
// ═══════════════════════════════════════════════════════════
function buildShareUrl(){
  const layout = getLayout();
  const params = new URLSearchParams();
  if(layout.workspace && layout.workspace !== 'custom') params.set('ws', layout.workspace);
  if(state.level.type === 'country' && state.level.value) params.set('c', state.level.value);
  else if(state.level.type === 'continent' && state.level.value) params.set('cont', state.level.value);
  if(state.topics.size > 0 && state.topics.size < getAllTopicCount()) params.set('t', [...state.topics].join(','));
  if(newsSort !== 'date') params.set('sort', newsSort);
  if(newsHours !== 48) params.set('h', newsHours);
  if(choroplethMode !== 'risk') params.set('mode', choroplethMode);
  const base = window.location.origin + window.location.pathname;
  return params.toString() ? `${base}?${params}` : base;
}
function applyUrlState(){
  const params = new URLSearchParams(window.location.search);
  if(!params.toString()) return false;
  let applied = false;
  if(params.has('ws') && WORKSPACES[params.get('ws')]){ setWorkspace(params.get('ws')); applied=true; }
  if(params.has('c') && CC[params.get('c').toUpperCase()]){ setTimeout(()=>navigateTo('country', params.get('c').toUpperCase()), 500); applied=true; }
  else if(params.has('cont')){ setTimeout(()=>navigateTo('continent', params.get('cont')), 500); applied=true; }
  if(params.has('mode')){ choroplethMode = params.get('mode'); }
  if(params.has('h')){ newsHours = parseInt(params.get('h')) || 48; }
  if(params.has('sort')){ newsSort = params.get('sort'); }
  return applied;
}

// ═══════════════════════════════════════════════════════════
// COUNTRY COMPARISON — side-by-side view of 2-4 countries
// ═══════════════════════════════════════════════════════════
const COMPARE_STATE = { selected: [] };

function openCompare(){
  document.getElementById('compare-overlay').classList.add('open');
  document.getElementById('compare-input').focus();
  renderCompareChips();
}
function closeCompare(){
  document.getElementById('compare-overlay').classList.remove('open');
}

function addCompareCountry(iso){
  if(!iso || !CC[iso]) return;
  if(COMPARE_STATE.selected.includes(iso)) return;
  if(COMPARE_STATE.selected.length >= 4){ toast('warn','Max 4 countries','Remove one to add another'); return; }
  COMPARE_STATE.selected.push(iso);
  renderCompareChips();
  fetchAndRenderCompare();
}
function removeCompareCountry(iso){
  COMPARE_STATE.selected = COMPARE_STATE.selected.filter(i => i !== iso);
  renderCompareChips();
  if(COMPARE_STATE.selected.length > 0) fetchAndRenderCompare();
  else document.getElementById('compare-content').innerHTML = '<div class="compare-empty">Pick countries above to see side-by-side comparison.</div>';
}

function renderCompareChips(){
  const el = document.getElementById('compare-chips');
  if(!el) return;
  el.innerHTML = COMPARE_STATE.selected.map(iso => `<span class="compare-chip">
    ${isoToFlag(iso)} ${escHtml(CC[iso]?.name || iso)}
    <button class="compare-chip-x" data-cmp-rm="${iso}">&times;</button>
  </span>`).join('') || '<span style="font-size:10px;color:var(--text3)">No countries selected</span>';
  el.querySelectorAll('[data-cmp-rm]').forEach(b => b.addEventListener('click', () => removeCompareCountry(b.dataset.cmpRm)));
}

async function fetchAndRenderCompare(){
  if(!COMPARE_STATE.selected.length) return;
  const content = document.getElementById('compare-content');
  content.innerHTML = '<div class="compare-loading"><div class="reader-loading-spinner"></div> Loading country data...</div>';
  try {
    const r = await fetch(`${WM_API}/compare?isos=${COMPARE_STATE.selected.join(',')}&hours=48`, {credentials:'same-origin'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'failed');
    renderCompareGrid(j.data);
  } catch(err){
    content.innerHTML = errorPanel('Failed to load comparison', err.message, fetchAndRenderCompare);
  }
}

function renderCompareGrid(countries){
  const content = document.getElementById('compare-content');
  const cols = countries.length;
  let html = `<div class="compare-grid" style="grid-template-columns:repeat(${cols},1fr)">`;
  countries.forEach(c => {
    const name = c.name || CC[c.iso]?.name || c.iso;
    const act = c.activity || {};
    const risk = c.risk;
    const sent = c.sentiment;
    const posPct = sent?.positive_pct || 0;
    const negPct = sent?.negative_pct || 0;
    const neuPct = sent?.neutral_pct || (100 - posPct - negPct);
    const riskColor = risk?.score >= 7 ? '#ef4444' : risk?.score >= 5 ? '#f97316' : risk?.score >= 3 ? '#eab308' : risk?.score > 0 ? '#22c55e' : '#555';
    const spark = c.timeline?.length ? makeSparkline(c.timeline.map(t => ({day:t.day, articles:t.articles, negative:0})), 7) : '';
    html += `<div class="compare-col">
      <div class="compare-col-header">
        <span style="font-size:22px">${isoToFlag(c.iso)}</span>
        <div>
          <div class="compare-col-name">${escHtml(name)}</div>
          <div class="compare-col-iso">${c.iso}</div>
        </div>
        <button class="compare-goto" data-iso="${c.iso}" title="Open country view">&#10140;</button>
      </div>
      <div class="compare-metric">
        <div class="compare-metric-label">Articles (48h)</div>
        <div class="compare-metric-val">${act.article_count || 0}</div>
      </div>
      <div class="compare-metric">
        <div class="compare-metric-label">High Relevance</div>
        <div class="compare-metric-val" style="color:#f59e0b">${act.high_score || 0}</div>
      </div>
      <div class="compare-metric">
        <div class="compare-metric-label">Risk Score</div>
        <div class="compare-metric-val" style="color:${riskColor}">${risk?.score?.toFixed(0) || '-'}</div>
        ${risk?.level ? `<div class="compare-metric-sub">${risk.level}${risk.change_24h ? ' · '+(risk.change_24h>0?'+':'')+risk.change_24h+' 24h' : ''}</div>` : ''}
      </div>
      <div class="compare-sentiment">
        <div class="compare-metric-label">Sentiment</div>
        <div class="compare-sent-bar">
          <div style="width:${posPct}%;background:var(--pos)"></div>
          <div style="width:${neuPct}%;background:var(--neu);opacity:0.4"></div>
          <div style="width:${negPct}%;background:var(--neg)"></div>
        </div>
        <div class="compare-sent-legend">
          <span style="color:var(--pos)">${posPct.toFixed(0)}%</span> ·
          <span>${neuPct.toFixed(0)}%</span> ·
          <span style="color:var(--neg)">${negPct.toFixed(0)}%</span>
        </div>
      </div>
      ${spark ? `<div class="compare-metric">
        <div class="compare-metric-label">7-day trend</div>
        ${spark}
      </div>` : ''}
      ${c.alert ? `<div class="compare-alert">
        <span class="tag tag-spike">SPIKE</span> z=${parseFloat(c.alert.z_score).toFixed(1)}
        ${c.alert.top_title ? `<div style="font-size:10px;color:var(--text2);margin-top:4px;line-height:1.4">${escHtml(c.alert.top_title.slice(0,100))}</div>` : ''}
      </div>` : ''}
      ${c.top_article ? `<div class="compare-top-article">
        <div class="compare-metric-label">Top story</div>
        <div class="compare-top-title" data-article-id="${c.top_article.article_id||''}">${escHtml(c.top_article.title.slice(0,120))}</div>
        <div class="compare-top-src">${escHtml(c.top_article.source_name||'')}</div>
      </div>` : ''}
    </div>`;
  });
  html += '</div>';
  content.innerHTML = html;
  content.querySelectorAll('[data-iso]').forEach(b => b.addEventListener('click', () => {
    const iso = b.dataset.iso;
    closeCompare();
    navigateTo('country', iso);
  }));
  content.querySelectorAll('.compare-top-title[data-article-id]').forEach(el => el.addEventListener('click', () => {
    const aid = el.dataset.articleId;
    if(aid) openArticleReader(aid);
  }));
}

// ═══════════════════════════════════════════════════════════
// ARTICLE READER (in-place news reading)
// ═══════════════════════════════════════════════════════════
const articleCache = {}; // aid → data

async function openArticleReader(aid){
  const overlay = document.getElementById('reader-overlay');
  const content = document.getElementById('reader-content');
  const loading = document.getElementById('reader-loading');
  overlay.classList.add('open');
  content.innerHTML = '';
  loading.style.display = 'block';

  try {
    let data = articleCache[aid];
    if(!data){
      const r = await fetch(`${WM_API}/article/${aid}`, {credentials:'same-origin'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      if(!j.ok) throw new Error(j.error||'fetch failed');
      data = j.data;
      articleCache[aid] = data;
    }
    loading.style.display = 'none';
    renderReaderContent(data);
  } catch (err) {
    loading.style.display = 'none';
    content.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text3)">Failed to load article: ${escHtml(err.message)}</div>`;
  }
}

function closeReader(){
  document.getElementById('reader-overlay').classList.remove('open');
}

function renderReaderContent(data){
  const a = data.article;
  const cluster = data.cluster;
  const iso = (a.country_iso||'').toUpperCase();
  const flag = iso && iso.length===2 ? isoToFlag(iso) : '';
  const sentClass = a.sentiment_label === 'positive' ? 'reader-sent-pos' : a.sentiment_label === 'negative' ? 'reader-sent-neg' : 'reader-sent-neu';
  const sentLabel = a.sentiment_label || 'neutral';
  const published = a.published_at ? new Date(a.published_at).toLocaleString() : '';
  const timeAgo = a.published_at ? getTimeAgo(a.published_at) : '';
  const watched = isWatched('country', iso);

  // Build entities — handle both JSON array of strings and JSON array of objects
  let entitiesHtml = '';
  if(a.entities){
    try {
      const ents = typeof a.entities === 'string' ? JSON.parse(a.entities) : a.entities;
      if(Array.isArray(ents) && ents.length){
        const items = ents.slice(0,15).map(e => {
          if(typeof e === 'string') return `<span class="reader-entity">${escHtml(e)}</span>`;
          const txt = e.text || e.name || e.entity || JSON.stringify(e);
          const type = (e.type||e.label||'').toLowerCase();
          const cls = type.includes('per')||type==='person' ? 'person' : type.includes('org') ? 'org' : type.includes('loc')||type.includes('gpe') ? 'location' : '';
          return `<span class="reader-entity ${cls}">${escHtml(txt)}</span>`;
        });
        entitiesHtml = `<div class="reader-section"><div class="reader-section-title">Key Entities</div><div class="reader-entities">${items.join('')}</div></div>`;
      }
    } catch {}
  }

  // Classify topics
  let topicsHtml = '';
  if(a.classify_topics){
    try {
      const topics = typeof a.classify_topics === 'string' ? JSON.parse(a.classify_topics) : a.classify_topics;
      if(Array.isArray(topics) && topics.length){
        const items = topics.slice(0,6).map(t => {
          const label = typeof t === 'string' ? t : (t.label || t.name || JSON.stringify(t));
          return `<span class="reader-topic">${escHtml(label.replace(/_/g,' '))}</span>`;
        });
        topicsHtml = `<div class="reader-section"><div class="reader-section-title">Topics</div><div class="reader-topics">${items.join('')}</div></div>`;
      }
    } catch {}
  }

  // Cluster siblings
  let clusterHtml = '';
  if(cluster?.siblings?.length){
    const items = cluster.siblings.map(s => `<div class="reader-sibling" data-sibling-id="${s.id}">
      <div class="reader-sibling-title">${escHtml(s.title||'')}</div>
      <div class="reader-sibling-meta">${escHtml(s.source_name||'')} · ${getTimeAgo(s.published_at)}</div>
    </div>`).join('');
    clusterHtml = `<div class="reader-section"><div class="reader-section-title">&#128279; Same story from ${cluster.sibling_count} other source${cluster.sibling_count>1?'s':''}</div>${items}</div>`;
  }

  // Choose best summary text
  const longSummary = a.nlp_summary || a.auto_summary || '';
  const shortSummary = a.summary && a.summary !== longSummary ? a.summary : '';

  const html = `
    <div class="reader-meta-top">
      <span class="reader-source-badge">${escHtml(a.source_name||'Unknown')}</span>
      ${flag ? `<span class="reader-flag">${flag}</span>` : ''}
      ${iso ? `<span>${escHtml(iso)}</span>` : ''}
      ${a.source_category ? `<span>· ${escHtml(a.source_category)}</span>` : ''}
      ${a.lang ? `<span>· ${escHtml(a.lang)}</span>` : ''}
    </div>
    <div class="reader-title">${escHtml(a.title||'Untitled')}</div>
    <div class="reader-sub-meta">
      <span class="reader-sentiment-badge ${sentClass}">${escHtml(sentLabel)}${a.sentiment_score?' '+parseFloat(a.sentiment_score).toFixed(2):''}</span>
      <span>&#128197; ${escHtml(timeAgo)}</span>
      <span>&#9201; ${a.reading_time_min} min read</span>
      <span>&#9734; Relevance ${a.relevance_score||0}</span>
      ${a.word_count ? `<span>&#128196; ${a.word_count} words</span>` : ''}
    </div>
    <!-- Summary block — always rendered; filled with RSS summary initially,
         then replaced by AI-generated summary once fulltext is scraped -->
    <div class="reader-summary" id="reader-summary-text" data-orig-lang="${escHtml(a.lang||'')}">${escHtml(longSummary || shortSummary || 'Generating summary...')}</div>

    <!-- Action bar -->
    <div class="reader-toolbar">
      <button class="reader-tool-btn" id="reader-fetch-full" data-aid="${a.id}">&#128214; Full article</button>
      <button class="reader-tool-btn" id="reader-translate" data-aid="${a.id}">&#127760; Translate</button>
      ${a.lang && a.lang !== 'en' ? `<span style="font-size:9px;color:var(--text3);align-self:center">Original in <b>${escHtml(a.lang).toUpperCase()}</b></span>` : ''}
    </div>
    <div class="reader-fulltext" id="reader-fulltext"></div>

    ${topicsHtml}
    ${entitiesHtml}
    ${clusterHtml}
    <div class="reader-actions">
      <a href="${a.url}" target="_blank" rel="noopener" class="reader-btn primary">Open Source &rarr;</a>
      ${iso && CC[iso] ? `<button class="reader-btn" id="reader-goto-country" data-iso="${iso}">&#128205; Country view</button>` : ''}
      ${iso ? `<button class="reader-btn watch ${watched?'active':''}" id="reader-watch" data-iso="${iso}">${watched?'&#9733; Watched':'&#9734; Watch'}</button>` : ''}
    </div>
  `;
  document.getElementById('reader-content').innerHTML = html;

  // Bind sibling clicks
  document.querySelectorAll('.reader-sibling').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.dataset.siblingId;
      if(sid) openArticleReader(sid);
    });
  });
  document.getElementById('reader-goto-country')?.addEventListener('click', e => {
    const iso = e.currentTarget.dataset.iso;
    closeReader();
    if(CC[iso]) navigateTo('country', iso);
  });
  document.getElementById('reader-watch')?.addEventListener('click', e => {
    const iso = e.currentTarget.dataset.iso;
    toggleWatch('country', iso);
    renderReaderContent(data); // re-render to update button state
  });

  // === Fetch full article text on demand ===
  document.getElementById('reader-fetch-full')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    const aid = btn.dataset.aid;
    const container = document.getElementById('reader-fulltext');
    btn.disabled = true; btn.innerHTML = '&#8987; Generating summary...';
    container.innerHTML = `<div class="reader-loading-state">
      <div class="reader-loading-spinner"></div>
      <div class="reader-loading-text">Fetching full article...<br><small>Extracting content and generating AI summary (may take a few seconds)</small></div>
    </div>`;
    try {
      const r = await fetch(`${WM_API}/article/${aid}/fulltext`, {credentials:'same-origin'});
      const j = await r.json();
      if(!j.ok || !j.data.paragraphs?.length){
        // Fallback: if we have ANY summary at all, show it
        const errMsg = j.data?.error || j.error || 'Could not extract article content';
        container.innerHTML = `<div class="reader-ft-fail">
          <div style="font-size:11px;color:#fcd34d;margin-bottom:6px">&#9888; ${escHtml(errMsg)}</div>
          <div style="font-size:10px;color:var(--text3)">The article URL may block scrapers (e.g., paywalled, social media, login-required). Try opening the source directly.</div>
        </div>`;
        btn.innerHTML = '&#128214; Couldn\'t extract';
        btn.disabled = true;
        return;
      }
      // If backend returned a better summary, REPLACE the short one prominently
      if(j.data.summary && j.data.summary.length > 40){
        const sumEl = document.getElementById('reader-summary-text');
        if(sumEl) {
          sumEl.textContent = j.data.summary;
          // Flash highlight to draw attention
          sumEl.style.transition = 'background 0.6s';
          sumEl.style.background = 'rgba(167,139,250,0.15)';
          setTimeout(()=> sumEl.style.background = '', TIMING.SUMMARY_FLASH_MS);
        } else {
          // No existing summary block — add one at top
          const newSum = document.createElement('div');
          newSum.className = 'reader-summary';
          newSum.id = 'reader-summary-text';
          newSum.textContent = j.data.summary;
          container.parentNode.insertBefore(newSum, container.parentNode.querySelector('.reader-toolbar'));
        }
      }
      // Render paragraphs with clear "Full article" header
      const metaBits = [];
      if(j.data.author) metaBits.push('&#9997; '+escHtml(j.data.author));
      if(j.data.sitename) metaBits.push(escHtml(j.data.sitename));
      if(j.data.word_count) metaBits.push(j.data.word_count+' words');
      if(j.data.language) metaBits.push('lang: '+escHtml(j.data.language));
      const metaHtml = metaBits.length ? `<div class="reader-ft-meta">${metaBits.join(' · ')}</div>` : '';
      const paraHtml = j.data.paragraphs.map(p => `<p class="reader-ft-para">${escHtml(p)}</p>`).join('');
      container.innerHTML = `<div class="reader-ft-header">&#128214; Full article</div>` + metaHtml + '<div class="reader-ft-body">' + paraHtml + '</div>';
      btn.innerHTML = '&#10004; Article loaded';
      btn.classList.add('done');
      // Cache
      if(articleCache[aid]) articleCache[aid]._fulltext = j.data;
    } catch (err) {
      container.innerHTML = `<div class="reader-ft-fail"><div style="font-size:11px;color:#fca5a5">Network error: ${escHtml(err.message)}</div></div>`;
      btn.disabled = false; btn.innerHTML = '&#128214; Retry';
    }
  });

  // === Translate article ===
  document.getElementById('reader-translate')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    if(btn.dataset.translated === '1'){
      // Toggle back to original
      const sumEl = document.getElementById('reader-summary-text');
      if(sumEl && sumEl.dataset.origText) sumEl.textContent = sumEl.dataset.origText;
      document.querySelectorAll('.reader-ft-para').forEach(p=>{
        if(p.dataset.origText) p.textContent = p.dataset.origText;
      });
      btn.innerHTML = '&#127760; Translate';
      btn.dataset.translated = '0';
      return;
    }
    btn.disabled = true; btn.innerHTML = '&#8987; Translating...';
    // Get target language — browser UI language or default EN
    const target = (navigator.language||'en').slice(0,2);
    try {
      // Collect all translatable text nodes
      const sumEl = document.getElementById('reader-summary-text');
      const paraEls = document.querySelectorAll('.reader-ft-para');
      const items = [];
      if(sumEl && sumEl.textContent.trim()){ items.push({el: sumEl, text: sumEl.textContent}); sumEl.dataset.origText = sumEl.textContent; }
      paraEls.forEach(p => { items.push({el: p, text: p.textContent}); p.dataset.origText = p.textContent; });
      if(!items.length){ btn.disabled=false; btn.innerHTML='&#127760; Translate'; toast('info','Nothing to translate','Fetch the full article first'); return; }
      // Join with separator, translate in chunks
      const separator = '\n===PARA===\n';
      const joined = items.map(i => i.text).join(separator);
      const resp = await fetch(`${WM_API}/translate`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body: JSON.stringify({ text: joined.slice(0,7500), target })
      });
      const j = await resp.json();
      if(!j.ok || !j.data?.translated) throw new Error(j.error||'translation failed');
      const parts = j.data.translated.split(/={3}PARA={3}|===PARA===/);
      items.forEach((item, i) => {
        if(parts[i]) item.el.textContent = parts[i].trim();
      });
      btn.innerHTML = `&#10004; Translated to ${target.toUpperCase()} · click to revert`;
      btn.classList.add('done');
      btn.dataset.translated = '1';
      btn.disabled = false;
    } catch (err) {
      btn.innerHTML = '&#127760; Translate (failed)';
      btn.disabled = false;
      toast('alert','Translation failed', err.message, 5000);
    }
  });

  // Always auto-fetch the full article on open — the short nlp_summary from the
  // classifier is often just a single sentence. Users want the full read.
  // This generates an AI summary of the full scraped content via ultra_nlp.
  setTimeout(()=> document.getElementById('reader-fetch-full')?.click(), 200);
}

// ═══════════════════════════════════════════════════════════
// ONBOARDING WIZARD
// ═══════════════════════════════════════════════════════════
const ONBOARD_KEY = 'wm_onboarded_v1';
function buildOnboardingUI(){
  const container = document.getElementById('onboard-categories');
  const byCategory = {};
  Object.entries(WORKSPACES).forEach(([key, ws])=>{
    const cat = ws.category || 'Other';
    if(!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push([key, ws]);
  });
  // Category display order
  const order = ['Personal','Travel','News & Analysis','Tech & Science','Finance','Industry','Causes','General'];
  let html = '';
  order.forEach(cat=>{
    if(!byCategory[cat]) return;
    html += `<div class="onboard-category">
      <div class="onboard-cat-label">${cat}</div>
      <div class="onboard-grid">`;
    byCategory[cat].forEach(([key, ws])=>{
      html += `<button class="onboard-card" data-ws="${key}">
        <span class="onboard-card-icon">${ws.icon||'&#127760;'}</span>
        <span class="onboard-card-label">${ws.label||key}</span>
        <span class="onboard-card-desc">${ws.desc||''}</span>
      </button>`;
    });
    html += '</div></div>';
  });
  container.innerHTML = html;
  container.querySelectorAll('.onboard-card').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const ws = btn.dataset.ws;
      const country = document.getElementById('onboard-country').value.toUpperCase().trim();
      if(country && /^[A-Z]{2}$/.test(country)) setHomeCountry(country);
      setWorkspace(ws);
      closeOnboarding();
      toast('success','Welcome!',`${WORKSPACES[ws].label} workspace applied${country?' · Home: '+country:''}`);
    });
  });
}
function openOnboarding(){
  buildOnboardingUI();
  const detected = detectHomeCountry();
  const home = getHomeCountry() || detected;
  if(home) document.getElementById('onboard-country').value = home;
  document.getElementById('onboard-overlay').classList.add('open');
}
function closeOnboarding(){
  document.getElementById('onboard-overlay').classList.remove('open');
  localStorage.setItem(ONBOARD_KEY, '1');
}

function renderChoroplethLegend(){
  const el=document.getElementById('choropleth-legend');
  const countryBtn=document.querySelector('.layer-btn[data-layer="countries"]');
  if(!countryBtn?.classList.contains('active')){el.classList.remove('visible');return}
  let title,items;
  if(choroplethMode==='risk'){title='Risk Score';items=[{c:'#ef4444',l:'7+ Critical'},{c:'#f97316',l:'5-6 High'},{c:'#eab308',l:'3-4 Medium'},{c:'#22c55e',l:'1-2 Low'}]}
  else if(choroplethMode==='density'){title='News Volume (48h)';items=[{c:'#3b82f6',l:'100+ articles'},{c:'#6366f1',l:'30-99'},{c:'#8b5cf6',l:'10-29'},{c:'#a78bfa',l:'1-9'}]}
  else{title='Sentiment';items=[{c:'#ef4444',l:'>60% Negative'},{c:'#f97316',l:'>30% Negative'},{c:'#22c55e',l:'>30% Positive'},{c:'#94a3b8',l:'Neutral/Mixed'}]}
  el.innerHTML=`<div class="cl-title">${title}</div>`+items.map(i=>`<div class="cl-row"><span class="cl-swatch" style="background:${i.c}"></span>${i.l}</div>`).join('');
  el.classList.add('visible');
}

function sortArticles(articles){
  const sorted=[...articles];
  if(newsSort==='relevance')sorted.sort((a,b)=>(b.relevance_score||0)-(a.relevance_score||0));
  else if(newsSort==='sentiment')sorted.sort((a,b)=>{const o={negative:0,neutral:1,positive:2};return(o[a.sentiment_label]||1)-(o[b.sentiment_label]||1)});
  else sorted.sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));
  return sorted;
}

const state = {
  level: { type: 'world', value: null },
  layers: new Set(),
  topics: new Set(),
  tile: 'dark',
  newsPanelOpen: true,
  newsData: [],
  newsView: 'grouped',
  intelOpen: true,
  countryDetail: null, // ISO when showing country detail
};

let debounceTimer = null;
let prevLevelKey = 'world:null';

const tiles = {
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution:'CARTO', subdomains:'abcd', maxZoom:19 }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution:'Esri', maxZoom:18 }),
  terrain: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { attribution:'CARTO', subdomains:'abcd', maxZoom:19 }),
};

const LD = {
  'mil-flights':{g:null,c:'#ef4444',n:0,cluster:true},'mil-vessels':{g:null,c:'#dc2626',n:0,cluster:true},
  'com-flights':{g:null,c:'#3b82f6',n:0,cluster:true},'com-vessels':{g:null,c:'#60a5fa',n:0,cluster:true},
  'bases':{g:null,c:'#f43f5e',n:0,cluster:false,static:true},'hotspots':{g:null,c:'#ff6b6b',n:0,cluster:false,static:true},
  'pipelines':{g:null,c:'#f59e0b',n:0,cluster:false,static:true},'ports':{g:null,c:'#06b6d4',n:0,cluster:false,static:true},
  'cables':{g:null,c:'#818cf8',n:0,cluster:false,static:true},'quakes':{g:null,c:'#a855f7',n:0,cluster:false},
  'fires':{g:null,c:'#f97316',n:0,cluster:true},'disasters':{g:null,c:'#ec4899',n:0,cluster:false},
  'events':{g:null,c:'#eab308',n:0,cluster:true},'outages':{g:null,c:'#6366f1',n:0,cluster:false},
  'nuclear':{g:null,c:'#84cc16',n:0,cluster:true,static:true},'economic':{g:null,c:'#22d3ee',n:0,cluster:false,static:true},
  'countries':{g:null,c:'#14b8a6',n:0,cluster:false},
};

let newsLayerGroup = L.layerGroup();
let spikeLayerGroup = L.layerGroup();

const SK='wm_layers_v5',FK='wm_news_filters_v2';
function getActiveLayers(){try{const s=localStorage.getItem(SK);if(s)return JSON.parse(s)}catch{}return['mil-flights','mil-vessels','bases','hotspots','quakes','events','countries']}
function saveActiveLayers(){const a=[];document.querySelectorAll('.layer-btn.active').forEach(b=>a.push(b.dataset.layer));localStorage.setItem(SK,JSON.stringify(a))}
function getActiveFilters(){try{const s=localStorage.getItem(FK);if(s)return JSON.parse(s)}catch{}return null}
function saveActiveFilters(){localStorage.setItem(FK,JSON.stringify([...state.topics]))}

async function get(path,key){if(abort[key])abort[key].abort();abort[key]=new AbortController();const r=await fetch(API+path,{credentials:'same-origin',signal:abort[key].signal});if(!r.ok)throw new Error(r.status);return r.json()}
async function getStatic(path,key){if(staticCache[key])return staticCache[key];const r=await fetch(API+path,{credentials:'same-origin'});if(!r.ok)throw new Error(r.status);return staticCache[key]=await r.json()}
async function getWm(path){const r=await fetch(WM_API+path,{credentials:'same-origin'});if(!r.ok)throw new Error(r.status);return r.json()}

const newsCache={};
async function fetchNews(level,value,topics){
  const topicStr=topics.length?topics.sort().join(','):'';
  const cacheKey=`${level}:${value}:${topicStr}`;
  const cached=newsCache[cacheKey];
  if(cached&&Date.now()-cached.ts<120000)return cached.data;
  const params=new URLSearchParams({level,limit:60,hours:48});
  if(value)params.set('value',value);
  if(topicStr)params.set('topics',topicStr);
  const r=await fetch(`${NEWS_API}/filtered?${params}`,{credentials:'same-origin'});
  if(!r.ok)throw new Error(r.status);
  const json=await r.json();
  newsCache[cacheKey]={data:json,ts:Date.now()};
  return json;
}

// Track last-successful-fetch timestamps for each data source.
// Used by freshnessBadge() to show "Updated X min ago" per panel.
const dataFreshness = {
  activity: null, summary: null, countryMap: null, timeline: null,
  pulse: null, markets: null, brief: null, sparklines: null,
};
// Track last-error state for error UI
const dataErrors = {};

let activityCache={data:null,ts:0};
async function fetchActivity(){
  if(activityCache.data&&Date.now()-activityCache.ts<TIMING.ACTIVITY_CACHE_TTL)return activityCache.data;
  try{const r=await fetch(`${NEWS_API}/activity?hours=48`,{credentials:'same-origin'});if(!r.ok)throw new Error('HTTP '+r.status);const json=await r.json();const m={};(json.data||[]).forEach(d=>{m[d.country_iso]=d});activityCache={data:m,ts:Date.now()};dataFreshness.activity=new Date().toISOString();delete dataErrors.activity;return m}catch(e){dataErrors.activity=e.message;return{}}
}

async function fetchSummary(){
  try{const r=await getWm('/summary?limit=10&clusterHours=12');summaryData=r;dataFreshness.summary=new Date().toISOString();delete dataErrors.summary;return r}catch(e){dataErrors.summary=e.message;return null}
}

async function fetchCountryMapData(){
  try{const r=await get('/countries','cmap');countryMapData=r?.ok?r.data:null;dataFreshness.countryMap=new Date().toISOString();delete dataErrors.countryMap;return countryMapData}catch(e){dataErrors.countryMap=e.message;return null}
}

// Timeline data for sparklines (7 days, per country)
let timelineData = {};
async function fetchTimeline(){
  try{const r=await fetch(`${NEWS_API}/timeline?days=7`,{credentials:'same-origin'});if(!r.ok)throw new Error('HTTP '+r.status);const json=await r.json();timelineData=json.data||{};dataFreshness.timeline=new Date().toISOString();delete dataErrors.timeline;return timelineData}catch(e){dataErrors.timeline=e.message;return{}}
}

// Global pulse data
let pulseData = null;
async function fetchPulse(){
  try{const r=await fetch(`${NEWS_API}/pulse`,{credentials:'same-origin'});if(!r.ok)throw new Error('HTTP '+r.status);pulseData=await r.json();dataFreshness.pulse=new Date().toISOString();delete dataErrors.pulse;return pulseData}catch(e){dataErrors.pulse=e.message;return null}
}

// Markets data
let marketsData = null;
async function fetchMarkets(){
  try{const r=await fetch(`${WM_API}/markets/snapshot`,{credentials:'same-origin'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();marketsData=j.ok?j.data:null;dataFreshness.markets=new Date().toISOString();delete dataErrors.markets;return marketsData}catch(e){dataErrors.markets=e.message;return null}
}

// Intelligence brief + sparklines
let briefData = null;
let sparklineData = null;
async function fetchBrief(){
  try{const r=await fetch(`${WM_API}/intelligence-brief`,{credentials:'same-origin'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();briefData=j.ok?j.data:null;dataFreshness.brief=new Date().toISOString();delete dataErrors.brief;return briefData}catch(e){dataErrors.brief=e.message;return null}
}
async function fetchSparklines(){
  try{const r=await fetch(`${WM_API}/markets/sparklines`,{credentials:'same-origin'});if(!r.ok)return null;const j=await r.json();sparklineData=j.ok?j.data:null;return sparklineData}catch{return null}
}

// State for time filter and search
let newsHours = 48;
let newsSearchTerm = '';
let searchDebounce = null;

// === MARKETS TICKER (top strip) ===
function renderMarketsTicker(){
  if(!marketsData)return;
  const el=document.getElementById('mkt-ticker');
  const items=[];
  function mkItem(sym, price, chg, prefix, statusDot){
    const cls=chg>0?'up':chg<0?'down':'flat';
    const arrow=chg>0?'\u25B2':chg<0?'\u25BC':'\u25CF';
    const dot=statusDot?`<span class="mkt-status ${statusDot}"></span>`:'';
    items.push(`<span class="mkt-item">${dot}<span class="mkt-sym">${sym}</span><span class="mkt-price">${prefix}${fmtPrice(price)}</span><span class="mkt-chg ${cls}">${arrow} ${chg>=0?'+':''}${chg.toFixed(2)}%</span></span>`);
  }
  (marketsData.indices||[]).forEach(i=>{
    const chg=parseFloat(i.change_pct)||0;
    const st=i.market_state==='REGULAR'||i.market_state==='regular'?'open':'closed';
    mkItem(i.display||i.symbol, i.price, chg, '', st);
  });
  (marketsData.commodities||[]).forEach(c=>mkItem(c.display||c.symbol, c.price, parseFloat(c.change_pct)||0, '$'));
  (marketsData.crypto||[]).slice(0,4).forEach(c=>mkItem(c.symbol, c.price_usd, parseFloat(c.change_24h_pct)||0, '$'));
  (marketsData.fx||[]).slice(0,5).forEach(f=>{
    const r=parseFloat(f.rate);
    mkItem(`${f.base}/${f.quote}`, r, parseFloat(f.change_pct)||0, '');
  });
  const html=items.join('<span class="mkt-sep">|</span>');
  el.innerHTML=`<div class="mkt-ticker-inner">${html}${html}</div>`;
}

function fmtPrice(v){const n=parseFloat(v)||0;if(n>=10000)return n.toLocaleString(undefined,{maximumFractionDigits:0});if(n>=100)return n.toFixed(2);if(n>=1)return n.toFixed(2);return n.toFixed(4)}
function fmtVol(v){const n=parseFloat(v)||0;if(n>=1e9)return '$'+(n/1e9).toFixed(1)+'B';if(n>=1e6)return '$'+(n/1e6).toFixed(1)+'M';if(n>=1e3)return '$'+(n/1e3).toFixed(0)+'K';return '$'+n.toFixed(0)}

function chgHtml(chg, decimals){
  decimals=decimals||2;
  const cls=chg>0?'up':chg<0?'down':'flat';
  const arrow=chg>0?'\u25B2':chg<0?'\u25BC':'';
  return `<span class="mkt-row-chg ${cls}">${arrow} ${chg>=0?'+':''}${chg.toFixed(decimals)}%</span>`;
}

function chgBarHtml(chg, maxPct){
  maxPct=maxPct||15;
  const abs=Math.abs(chg);
  const w=Math.min(100, abs/maxPct*100);
  const c=chg>0?'#22c55e':'#ef4444';
  return `<span class="mkt-chg-bar"><span class="mkt-chg-bar-fill" style="width:${w}%;background:${c}"></span></span>`;
}

// === MARKETS KPI HEADER ===
function renderMarketsKPIs(){
  if(!marketsData?.kpis)return;
  const k=marketsData.kpis;
  const el=document.getElementById('mkt-kpis');
  let html='';
  function kpi(label, val, chg, prefix){
    prefix=prefix||'';
    const cls=chg>0?'up':chg<0?'down':'flat';
    const arrow=chg>0?'\u25B2':chg<0?'\u25BC':'';
    html+=`<div class="mkt-kpi"><div class="mkt-kpi-label">${label}</div><div class="mkt-kpi-val">${prefix}${fmtPrice(val)}</div><div class="mkt-kpi-chg ${cls}">${arrow} ${chg>=0?'+':''}${parseFloat(chg).toFixed(2)}%</div></div>`;
  }
  if(k.spx) kpi('S&P 500', k.spx.value, k.spx.change);
  if(k.btc) kpi('Bitcoin', k.btc.value, k.btc.change, '$');
  if(k.vix){
    const vixVal=parseFloat(k.vix.value)||0;
    const vixLabel=vixVal>=30?'VIX (FEAR)':vixVal>=20?'VIX (CAUTION)':'VIX (CALM)';
    kpi(vixLabel, k.vix.value, k.vix.change);
  }
  if(k.gold) kpi('Gold', k.gold.value, k.gold.change, '$');
  if(k.oil) kpi('Crude Oil', k.oil.value, k.oil.change, '$');
  if(k.btc?.dominance) kpi('BTC Dom.', k.btc.dominance, 0, '');
  else if(k.dxy) kpi('DXY', k.dxy.value, k.dxy.change);
  el.innerHTML=html;
  // Freshness bar
  const mf = document.getElementById('mkt-fresh');
  if(mf) mf.innerHTML = freshnessBadge(dataFreshness.markets, 'Markets');
}

// === FEAR/GREED GAUGE ===
function renderFearGreedGauge(){
  if(!marketsData?.kpis?.vix) return;
  const vix=parseFloat(marketsData.kpis.vix.value)||0;
  // VIX-based fear/greed: 10=extreme greed, 40+=extreme fear
  const pct=Math.max(0, Math.min(100, 100-((vix-10)/30*100)));
  const label=pct>=80?'Extreme Greed':pct>=60?'Greed':pct>=40?'Neutral':pct>=20?'Fear':'Extreme Fear';
  const color=pct>=60?'#22c55e':pct>=40?'#eab308':'#ef4444';
  const el=document.getElementById('mkt-gauge');
  el.style.display='block';
  el.innerHTML=`<div class="mkt-section-title" style="padding:0;margin-bottom:2px"><span class="mkt-dot" style="background:${color}"></span> Market Sentiment</div>
    <div style="display:flex;align-items:center;gap:8px"><span style="font-family:var(--mono);font-size:16px;font-weight:700;color:${color}">${Math.round(pct)}</span><span style="font-size:10px;color:${color};font-weight:600">${label}</span></div>
    <div class="mkt-gauge-bar"><div class="mkt-gauge-needle" style="left:${pct}%"></div></div>
    <div class="mkt-gauge-labels"><span>Fear</span><span>Neutral</span><span>Greed</span></div>`;
}

// === MARKETS PANEL (sidebar tab) ===
function renderMarketsPanel(){
  if(!marketsData)return;
  const panel=document.getElementById('markets-panel');
  let html='';

  function sectionOpen(id, color, title, count, collapsed){
    const cls=collapsed?'collapsed':'';
    html+=`<div class="mkt-section"><div class="mkt-section-header ${cls}" data-mkt-section="${id}"><span class="mkt-section-chevron">\u25BC</span><div class="mkt-section-title"><span class="mkt-dot" style="background:${color}"></span>${title}</div><span class="mkt-section-count">${count}</span></div><div class="mkt-section-body">`;
  }
  function sectionClose(){ html+='</div></div>'; }

  // Top Movers (capped at 5)
  if(marketsData.topMovers?.length){
    const movers=marketsData.topMovers.slice(0,5);
    sectionOpen('movers','#f59e0b','Top Movers',movers.length);
    movers.forEach((m,i)=>{
      const chg=parseFloat(m.change_pct)||0;const cls=chg>0?'up':chg<0?'down':'flat';
      html+=`<div class="mkt-mover"><span class="mkt-mover-rank">${i+1}</span><div class="mkt-mover-info"><div class="mkt-mover-sym">${m.display||m.symbol}</div><div class="mkt-mover-cat">${m.category||''}</div></div><span class="mkt-row-price">${fmtPrice(m.price)}</span><span class="mkt-mover-chg ${cls}">${chg>=0?'+':''}${chg.toFixed(2)}%</span></div>`;
    });
    sectionClose();
  }

  // Indices (with sparklines)
  sectionOpen('indices','#3b82f6','Indices',(marketsData.indices||[]).length);
  (marketsData.indices||[]).forEach(i=>{
    const chg=parseFloat(i.change_pct)||0;
    const st=i.market_state==='REGULAR'||i.market_state==='regular'?'open':'closed';
    const spark=sparklineData?.[i.symbol]?buildMktSparkline(sparklineData[i.symbol],chg>=0?'#22c55e':'#ef4444'):'';
    html+=`<div class="mkt-row"><span class="mkt-status ${st}"></span><span class="mkt-row-sym">${i.display||i.symbol}</span><span class="mkt-row-name">${spark}</span><span class="mkt-row-price">${fmtPrice(i.price)}</span>${chgBarHtml(chg)}${chgHtml(chg)}</div>`;
  });
  sectionClose();

  // Commodities (with sparklines)
  sectionOpen('commodities','#f59e0b','Commodities',(marketsData.commodities||[]).length);
  (marketsData.commodities||[]).forEach(c=>{
    const chg=parseFloat(c.change_pct)||0;
    const spark=sparklineData?.[c.symbol]?buildMktSparkline(sparklineData[c.symbol],chg>=0?'#22c55e':'#ef4444'):'';
    html+=`<div class="mkt-row"><span class="mkt-row-sym">${c.display||c.symbol}</span><span class="mkt-row-name">${spark}</span><span class="mkt-row-price">$${fmtPrice(c.price)}</span>${chgBarHtml(chg)}${chgHtml(chg)}</div>`;
  });
  sectionClose();

  // Crypto (with sparklines)
  sectionOpen('crypto','#f97316','Crypto',(marketsData.crypto||[]).length);
  (marketsData.crypto||[]).forEach(c=>{
    const chg=parseFloat(c.change_24h_pct)||0;
    const mcap=parseFloat(c.market_cap_usd)||0;
    const mcapStr=mcap>0?fmtVol(mcap):'';
    const spark=sparklineData?.[c.symbol]?buildMktSparkline(sparklineData[c.symbol],chg>=0?'#22c55e':'#ef4444'):'';
    html+=`<div class="mkt-row"><span class="mkt-row-sym">${c.symbol}</span><span class="mkt-row-name">${spark} <span style="font-size:8px;color:var(--text3)">${mcapStr}</span></span><span class="mkt-row-price">$${fmtPrice(c.price_usd)}</span>${chgBarHtml(chg)}${chgHtml(chg,1)}</div>`;
  });
  sectionClose();

  // FX (collapsed by default - 11 rows)
  sectionOpen('fx','#06b6d4','FX Rates (USD)',(marketsData.fx||[]).length, true);
  (marketsData.fx||[]).forEach(f=>{
    const chg=parseFloat(f.change_pct)||0;
    const r=parseFloat(f.rate);
    html+=`<div class="mkt-row"><span class="mkt-row-sym">${f.quote}</span><span class="mkt-row-name">${f.base}/${f.quote}</span><span class="mkt-row-price">${r.toFixed(r>100?2:4)}</span>${chgBarHtml(chg)}${chgHtml(chg)}</div>`;
  });
  sectionClose();

  // Prediction Markets (collapsed by default - 12 rows)
  if(marketsData.predictions?.length){
    sectionOpen('predictions','#8b5cf6','Prediction Markets',marketsData.predictions.length, true);
    marketsData.predictions.forEach(p=>{
      const prob=parseFloat(p.probability)||0;
      const pct=Math.round(prob*100);
      const color=pct>=70?'#22c55e':pct>=40?'#eab308':'#ef4444';
      const vol=parseFloat(p.volume)||0;
      html+=`<div class="mkt-pred"><div class="mkt-pred-q"><a href="${p.url||'#'}" target="_blank" rel="noopener">${escHtml((p.question||'').slice(0,120))}</a></div><div class="mkt-pred-meta"><span class="mkt-pred-prob"><span class="mkt-pred-prob-bar"><span class="mkt-pred-prob-fill" style="width:${pct}%;background:${color}"></span></span><span class="mkt-pred-prob-val" style="color:${color}">${pct}%</span></span>${vol>0?`<span class="mkt-pred-vol">${fmtVol(vol)}</span>`:''}<span class="mkt-pred-src">${p.source||''}</span></div></div>`;
    });
    sectionClose();
  }

  // Energy
  if(marketsData.energy?.length){
    sectionOpen('energy','#84cc16','Energy Inventories',marketsData.energy.length, true);
    marketsData.energy.forEach(e=>{
      const chg=parseFloat(e.change_pct)||0;
      html+=`<div class="mkt-row"><span class="mkt-row-sym" style="min-width:auto;font-size:10px">${e.display}</span><span class="mkt-row-name"></span><span class="mkt-row-price">${fmtPrice(e.value)} ${e.unit||''}</span>${chgHtml(chg,1)}</div>`;
    });
    sectionClose();
  }

  // Macro
  if(marketsData.macro?.length){
    sectionOpen('macro','#a855f7','Macro Indicators',marketsData.macro.length, true);
    marketsData.macro.forEach(m=>{
      const chg=parseFloat(m.change_pct)||0;
      html+=`<div class="mkt-row"><span class="mkt-row-sym" style="min-width:auto;font-size:10px">${m.display}</span><span class="mkt-row-name">${m.area||''}</span><span class="mkt-row-price">${fmtPrice(m.value)} ${m.unit||''}</span>${chgHtml(chg,1)}</div>`;
    });
    sectionClose();
  }

  // Correlation signals
  if(marketsData.signals?.length){
    sectionOpen('signals','#ec4899','Signals',marketsData.signals.length);
    marketsData.signals.forEach(s=>{
      html+=`<div class="mkt-signal"><div class="mkt-signal-title">${escHtml(s.title)}</div><span style="font-size:9px;color:var(--text3)">Confidence: ${parseFloat(s.confidence).toFixed(2)} &middot; ${getTimeAgo(s.fired_at)}</span></div>`;
    });
    sectionClose();
  }

  panel.innerHTML=html;

  // Bind collapsible sections (persist state)
  const mktState = JSON.parse(localStorage.getItem('wm_mkt_sections') || '{}');
  panel.querySelectorAll('.mkt-section-header').forEach(h=>{
    const sid = h.dataset.mktSection;
    if (sid && mktState[sid]) h.classList.add('collapsed');
    h.addEventListener('click',()=>{
      h.classList.toggle('collapsed');
      const s = JSON.parse(localStorage.getItem('wm_mkt_sections') || '{}');
      s[sid] = h.classList.contains('collapsed');
      localStorage.setItem('wm_mkt_sections', JSON.stringify(s));
    });
  });
}

// === SPARKLINE BUILDER (for market rows) ===
function buildMktSparkline(points, color){
  if(!points||points.length<3)return'';
  const min=Math.min(...points), max=Math.max(...points);
  const range=max-min||1;
  return '<span class="mkt-spark">'+points.map(p=>{
    const h=Math.max(1,(p-min)/range*16);
    return `<span class="mkt-spark-bar" style="height:${h}px;background:${color||'#3b82f6'}"></span>`;
  }).join('')+'</span>';
}

// === INTELLIGENCE NARRATIVE ===
function renderNarrativeBrief(){
  if(!briefData)return;
  const container=document.getElementById('narrative-brief');
  if(!container)return;
  let narrativeHtml='';

  // 0. Situation Summary (AI-generated signal context)
  if(briefData.signal_context){
    const lines=briefData.signal_context.split('\n').filter(l=>l.trim());
    const formatted=lines.map(l=>{
      let line=escHtml(l);
      // Highlight section headers
      if(line.startsWith('['))return `<div style="font-weight:700;color:var(--text);margin:6px 0 2px;font-size:10px">${line}</div>`;
      // Highlight country names and numbers
      line=line.replace(/\b(\d+)\s+signals?\b/g,'<span class="narrative-highlight narrative-warn">$1 signals</span>');
      line=line.replace(/convergence score:\s*(\d+)/g,'convergence score: <span class="narrative-highlight narrative-neg">$1</span>');
      line=line.replace(/^-\s*/,'<span style="color:#a78bfa;margin-right:4px">&#9656;</span>');
      return `<div style="padding:1px 0;line-height:1.5">${line}</div>`;
    }).join('');
    narrativeHtml+=`<div class="narrative-section" style="border-left:3px solid #a78bfa"><div class="ib-section-title"><span class="ib-dot" style="background:#a78bfa;box-shadow:0 0 6px #a78bfa"></span> Situation Summary</div><div class="narrative-text">${formatted}</div></div>`;
  }

  // 1. Nexus: Market-News connections
  if(briefData.nexus?.length){
    narrativeHtml+='<div class="narrative-section"><div class="ib-section-title"><span class="ib-dot" style="background:#f59e0b;box-shadow:0 0 4px #f59e0b"></span> Market-News Nexus</div>';
    briefData.nexus.forEach(n=>{
      const chg=parseFloat(n.change_pct)||0;
      const cls=chg>0?'up':'down';
      const color=chg>0?'#22c55e':'#ef4444';
      const arrow=chg>0?'\u25B2':'\u25BC';
      narrativeHtml+=`<div class="nexus-card"><div class="nexus-header"><span class="nexus-sym">${n.symbol}</span><span class="nexus-move" style="color:${color}">${arrow} ${chg>=0?'+':''}${chg.toFixed(2)}%</span><span style="font-size:10px;color:var(--text3)">$${fmtPrice(n.price)}</span><span class="nexus-label" style="background:rgba(255,255,255,0.06)">${n.category||''}</span></div>`;
      if(n.likely_drivers?.length){
        narrativeHtml+='<div class="nexus-drivers">';
        n.likely_drivers.forEach(d=>{
          narrativeHtml+=`<div class="nexus-driver"><span>${escHtml(d.title?.slice(0,120))}</span><span class="nexus-driver-src">${d.sources} sources</span></div>`;
        });
        narrativeHtml+='</div>';
      }
      narrativeHtml+='</div>';
    });
    narrativeHtml+='</div>';
  }

  // 2. Convergence zones - military/intel convergence
  if(briefData.convergence_zones?.length){
    narrativeHtml+='<div class="narrative-section"><div class="ib-section-title"><span class="ib-dot" style="background:#ef4444;box-shadow:0 0 6px #ef4444;animation:livePulse 2s infinite"></span> Convergence Zones</div>';
    briefData.convergence_zones.forEach(z=>{
      const signals=z.signalTypes||[];
      const sigColors={military_flight:'#ef4444',military_vessel:'#dc2626',satellite_fire:'#f97316',naval_presence:'#3b82f6'};
      narrativeHtml+=`<div class="conv-zone"><div class="conv-zone-header"><span class="conv-zone-name">${escHtml(z.region||'')}</span><span class="conv-zone-badge" style="background:rgba(239,68,68,0.2);color:#fca5a5">${(z.countries||[]).length} countries</span></div><div class="conv-zone-desc">${escHtml(z.description||'')}</div><div class="conv-zone-signals">${signals.map(s=>`<span class="conv-zone-signal" style="background:${sigColors[s]||'#555'}22;color:${sigColors[s]||'#888'}">${s.replace(/_/g,' ')}</span>`).join('')}</div></div>`;
    });
    narrativeHtml+='</div>';
  }

  // 3. Geo prediction markets
  if(briefData.geo_predictions?.length){
    narrativeHtml+='<div class="narrative-section"><div class="ib-section-title"><span class="ib-dot" style="background:#8b5cf6"></span> Geopolitical Prediction Markets</div>';
    briefData.geo_predictions.forEach(p=>{
      const prob=Math.round((parseFloat(p.probability)||0)*100);
      const color=prob>=60?'#22c55e':prob>=30?'#eab308':'#ef4444';
      const vol=parseFloat(p.volume)||0;
      narrativeHtml+=`<div class="mkt-pred"><div class="mkt-pred-q">${escHtml((p.question||'').slice(0,120))}</div><div class="mkt-pred-meta"><span class="mkt-pred-prob"><span class="mkt-pred-prob-bar"><span class="mkt-pred-prob-fill" style="width:${prob}%;background:${color}"></span></span><span class="mkt-pred-prob-val" style="color:${color}">${prob}%</span></span>${vol>0?`<span class="mkt-pred-vol">${fmtVol(vol)}</span>`:''}<span class="mkt-pred-src">${p.source||''}</span></div></div>`;
    });
    narrativeHtml+='</div>';
  }

  // 4. Topic velocity spikes
  if(briefData.topic_spikes?.length){
    narrativeHtml+='<div class="narrative-section"><div class="ib-section-title"><span class="ib-dot" style="background:#f97316;box-shadow:0 0 4px #f97316"></span> Topic Surges</div>';
    briefData.topic_spikes.forEach(s=>{
      const vel=parseFloat(s.velocity)||0;
      narrativeHtml+=`<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:10px"><span style="font-weight:600;color:var(--text)">${(s.topic||'').replace(/_/g,' ')}</span><span style="color:#f97316;font-weight:700;font-size:9px">\u25B2 ${vel.toFixed(0)}x</span><span style="color:var(--text3);font-size:9px">${s.prev_count}\u2192${s.article_count} articles</span></div>`;
    });
    narrativeHtml+='</div>';
  }

  container.innerHTML=narrativeHtml;
  // Update badge count
  const badgeN = (briefData.nexus?.length||0) + (briefData.convergence_zones?.length||0) + (briefData.geo_predictions?.length||0) + (briefData.topic_spikes?.length||0);
  const nb = document.getElementById('narrative-badge');
  if(nb) nb.textContent = badgeN;
  // Freshness badge
  const nf = document.getElementById('narrative-fresh');
  if(nf) nf.innerHTML = freshnessBadge(briefData.generated_at || dataFreshness.brief, 'Signals');
}

// === PREDICTION OVERLAY ON MAP ===
function renderPredictionOverlay(){
  if(!briefData?.geo_predictions?.length)return;
  const el=document.getElementById('pred-overlay');
  let html='<div class="pred-overlay-title">Geopolitical Predictions</div>';
  briefData.geo_predictions.slice(0,5).forEach(p=>{
    const prob=Math.round((parseFloat(p.probability)||0)*100);
    const color=prob>=60?'#22c55e':prob>=30?'#eab308':'#ef4444';
    html+=`<div class="pred-item"><span class="pred-item-prob" style="color:${color}">${prob}%</span><span class="pred-item-q" title="${escHtml(p.question)}">${escHtml((p.question||'').slice(0,60))}</span></div>`;
  });
  el.innerHTML=html;
  el.classList.add('visible');
}

// === CONVERGENCE ZONE MAP OVERLAY ===
let convergenceLayerGroup = L.layerGroup();
let connectionLayerGroup = L.layerGroup();

// === CONNECTION LINES ===
// Draws curved animated lines between focal point countries (showing regional clusters)
function renderConnectionLines(){
  connectionLayerGroup.clearLayers();
  const layout = getLayout();
  if(layout.toggles['show-conv-zones']===false) return; // respect user toggle
  if(!briefData?.focal_points?.length) return;

  // Group focal points by shared signals → draw lines within groups
  const points = briefData.focal_points
    .filter(f => f.entity_id && CC[f.entity_id])
    .slice(0, 8)
    .map(f => ({
      iso: f.entity_id,
      lat: CC[f.entity_id].lat,
      lon: CC[f.entity_id].lon,
      urgency: f.urgency,
      score: parseFloat(f.focal_score)||0,
      evidence: f.correlation_evidence || []
    }));

  // Connect points that share a signal type (parsed from evidence)
  function extractSignals(evidence){
    const sigs = new Set();
    evidence.forEach(e => {
      const s = (e||'').toLowerCase();
      if(s.includes('military flight'))sigs.add('military');
      if(s.includes('satellite fire')||s.includes('thermal'))sigs.add('thermal');
      if(s.includes('naval')||s.includes('vessel'))sigs.add('naval');
    });
    return sigs;
  }

  const pointSigs = points.map(p => ({...p, sigs: extractSignals(p.evidence)}));
  const drawn = new Set();

  for(let i=0; i<pointSigs.length; i++){
    for(let j=i+1; j<pointSigs.length; j++){
      const a = pointSigs[i], b = pointSigs[j];
      const shared = [...a.sigs].filter(s => b.sigs.has(s));
      if(shared.length === 0) continue;
      const key = [a.iso,b.iso].sort().join('-');
      if(drawn.has(key)) continue;
      drawn.add(key);

      // Curve color based on severity
      const critBoth = a.urgency === 'critical' && b.urgency === 'critical';
      const color = critBoth ? '#ef4444' : '#f97316';
      const weight = critBoth ? 2 : 1.5;

      // Draw great-circle curve via midpoint raised latitude
      const midLat = (a.lat + b.lat) / 2 + Math.abs(b.lon - a.lon) * 0.1;
      const midLon = (a.lon + b.lon) / 2;
      const pts = [];
      for(let t=0; t<=1; t+=0.05){
        const u = 1-t;
        const lat = u*u*a.lat + 2*u*t*midLat + t*t*b.lat;
        const lon = u*u*a.lon + 2*u*t*midLon + t*t*b.lon;
        pts.push([lat, lon]);
      }
      const line = L.polyline(pts, {
        color: color, weight: weight, opacity: 0.4,
        dashArray: '6, 6', className: 'conn-line'
      });
      line.bindTooltip(`${a.iso} &harr; ${b.iso}: shared signals (${shared.join(', ')})`, {sticky:true, className:'country-tooltip'});
      connectionLayerGroup.addLayer(line);
    }
  }
  connectionLayerGroup.addTo(map);
}
function renderConvergenceZones(){
  convergenceLayerGroup.clearLayers();
  if(!briefData?.convergence_zones?.length)return;
  // Map convergence zone regions to approximate coords
  const regionCoords = {
    'Middle East': {lat:30,lon:45,r:12}, 'Eastern Europe': {lat:50,lon:35,r:10},
    'East Asia': {lat:35,lon:120,r:10}, 'South Asia': {lat:25,lon:78,r:8},
    'Central Asia': {lat:42,lon:65,r:8}, 'Southeast Asia': {lat:10,lon:110,r:8},
    'Horn of Africa': {lat:8,lon:45,r:6}, 'North Africa': {lat:30,lon:15,r:8},
    'West Africa': {lat:10,lon:-5,r:6}, 'Central Africa': {lat:2,lon:22,r:6},
    'Southern Africa': {lat:-25,lon:28,r:6}, 'Caucasus': {lat:42,lon:44,r:5},
    'Arctic': {lat:72,lon:30,r:10}, 'South China Sea': {lat:15,lon:115,r:6},
    'Taiwan Strait': {lat:24,lon:120,r:4}, 'Baltic': {lat:58,lon:22,r:5},
    'Caribbean': {lat:18,lon:-72,r:6}, 'Pacific': {lat:0,lon:-150,r:12}
  };
  briefData.convergence_zones.forEach(z=>{
    const region=z.region||'';
    const coords=regionCoords[region];
    if(!coords){
      // Try partial match
      const match=Object.entries(regionCoords).find(([k])=>region.toLowerCase().includes(k.toLowerCase()));
      if(!match)return;
      const [,c]=match;
      renderConvZone(c, z);
    } else {
      renderConvZone(coords, z);
    }
  });
  convergenceLayerGroup.addTo(map);
}

function renderConvZone(coords, zone){
  const signals=zone.signalTypes||[];
  const severity=signals.length>=3?'critical':signals.length>=2?'high':'medium';
  const color=severity==='critical'?'#ef4444':severity==='high'?'#f97316':'#eab308';
  // Outer pulsing ring
  L.circle([coords.lat,coords.lon],{radius:coords.r*60000,fillColor:color,color:color,weight:1,fillOpacity:0.03,opacity:0.15,className:'hotspot-ring-outer'}).addTo(convergenceLayerGroup);
  // Inner ring
  L.circle([coords.lat,coords.lon],{radius:coords.r*40000,fillColor:color,color:color,weight:1.5,fillOpacity:0.05,opacity:0.25,className:'hotspot-ring',dashArray:'8,4'}).addTo(convergenceLayerGroup);
  // Center marker with popup
  const cm=L.circleMarker([coords.lat,coords.lon],{radius:4,fillColor:color,color:'#000',weight:1,fillOpacity:0.9});
  const signalBadges=signals.map(s=>{
    const sc={military_flight:'#ef4444',military_vessel:'#dc2626',satellite_fire:'#f97316',naval_presence:'#3b82f6'};
    return `<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:600;background:${sc[s]||'#555'}22;color:${sc[s]||'#888'};margin:1px">${s.replace(/_/g,' ')}</span>`;
  }).join('');
  cm.bindPopup(`<div class="popup-accent" style="background:${color}"></div><span class="tag" style="background:${color}22;color:${color}">CONVERGENCE</span> <b>${escHtml(zone.region||'')}</b><br><div style="margin:6px 0;font-size:10px;color:var(--text2);line-height:1.4">${escHtml(zone.description||'')}</div><div style="margin:4px 0">${signalBadges}</div><div style="font-size:9px;color:var(--text3)">Countries: ${(zone.countries||[]).join(', ')}</div>`,{maxWidth:360});
  convergenceLayerGroup.addLayer(cm);
}

// === GLOBAL PULSE STRIP ===
function renderPulseStrip(){
  if(!pulseData)return;
  const v=pulseData.volume||{};
  document.getElementById('ps-1h').textContent=(parseInt(v.h1)||0).toLocaleString();
  document.getElementById('ps-6h').textContent=(parseInt(v.h6)||0).toLocaleString();
  document.getElementById('ps-24h').textContent=(parseInt(v.h24)||0).toLocaleString();

  // Spark bars from daily volume (use activity data grouped by continent approximation)
  const sparkEl=document.getElementById('ps-spark');
  const vals=[v.h1,v.h6,v.h24,v.h48].map(x=>parseInt(x)||0);
  const max=Math.max(...vals,1);
  sparkEl.innerHTML=vals.map(v=>`<div class="ps-spark-bar" style="height:${Math.max(2,v/max*16)}px"></div>`).join('');

  // Ticker with top stories per continent
  const tickerEl=document.getElementById('ps-ticker');
  const stories=(pulseData.top_by_continent||[]).filter(s=>s.title);
  if(stories.length>0){
    const items=stories.map(s=>`<span class="ps-ticker-item"><b>${s.continent||''}:</b> ${escHtml(s.title?.slice(0,80))} <span class="ps-src">${s.source_name||''}</span></span>`).join('');
    tickerEl.innerHTML=`<div class="ps-ticker-inner">${items}${items}</div>`;
  }
}

// === CSS SPARKLINE HELPER ===
function makeSparkline(data, maxDays){
  if(!data||!data.length)return'<span style="color:var(--text3);font-size:9px">no data</span>';
  const max=Math.max(...data.map(d=>d.articles),1);
  return'<span class="sparkline">'+data.slice(-maxDays).map(d=>{
    const h=Math.max(1,d.articles/max*18);
    const negPct=d.articles>0?(d.negative/d.articles):0;
    const color=negPct>0.5?'#ef4444':negPct>0.2?'#f59e0b':'#3b82f6';
    return`<span class="spark-bar" style="height:${h}px;background:${color}"></span>`;
  }).join('')+'</span>';
}

// === ICON FACTORIES ===
const ico=(html,w,h)=>L.divIcon({className:'',html,iconSize:[w,h],iconAnchor:[w/2,h/2]});
function planeIco(c,hdg){return ico(`<svg width="18" height="18" viewBox="0 0 32 32" style="transform:rotate(${hdg||0}deg);filter:drop-shadow(0 0 3px ${c})"><path d="M16 2 L14 10 L4 14 L4 16 L14 14 L14 22 L10 25 L10 27 L16 25 L22 27 L22 25 L18 22 L18 14 L28 16 L28 14 L18 10 Z" fill="${c}" stroke="#000" stroke-width="0.5" opacity="0.9"/></svg>`,18,18)}
function shipIco(c){return ico(`<svg width="12" height="12" viewBox="0 0 24 24" style="filter:drop-shadow(0 0 3px ${c})"><path d="M12 2 L8 8 L6 18 L8 22 L16 22 L18 18 L16 8 Z" fill="${c}" stroke="#000" stroke-width="0.5" opacity="0.9"/></svg>`,12,12)}
function baseIco(type){const cc={usa:'#3b82f6',china:'#ef4444',russia:'#a855f7',france:'#60a5fa',uk:'#f59e0b',india:'#22c55e',japan:'#ec4899',turkey:'#f97316'};const c=cc[type]||'#94a3b8';return ico(`<svg width="14" height="14" viewBox="0 0 24 24" style="filter:drop-shadow(0 0 3px ${c})"><polygon points="12,2 22,22 2,22" fill="${c}" stroke="#000" stroke-width="1" opacity="0.85"/><polygon points="12,8 16,18 8,18" fill="#000" opacity="0.25"/><circle cx="12" cy="15" r="2" fill="#fff" opacity="0.6"/></svg>`,14,14)}
function diamondIco(c,sz){return ico(`<svg width="${sz}" height="${sz}" viewBox="0 0 24 24"><polygon points="12,2 22,12 12,22 2,12" fill="${c}" stroke="#000" stroke-width="1" opacity=".85"/></svg>`,sz,sz)}
function accentPopup(color,content){return`<div class="popup-accent" style="background:${color}"></div>${content}`}

function mkCluster(color){return L.markerClusterGroup({maxClusterRadius:45,spiderfyOnMaxZoom:true,disableClusteringAtZoom:10,chunkedLoading:true,chunkInterval:80,chunkDelay:5,iconCreateFunction:cl=>{const n=cl.getChildCount();return L.divIcon({html:`<div style="background:${color};opacity:.8;box-shadow:0 0 12px ${color}"><span>${n>999?(n/1000).toFixed(1)+'k':n}</span></div>`,className:`marker-cluster marker-cluster-${n<50?'small':n<200?'medium':'large'}`,iconSize:L.point(36,36)})}})}

function setLoading(key,v){const btn=document.querySelector(`.layer-btn[data-layer="${key}"]`);if(btn)btn.classList.toggle('loading',v)}
function updateCount(key){const el=document.getElementById('n-'+key);if(el){const v=el.querySelector('.layer-count-val');if(v)v.textContent=LD[key].n>0?LD[key].n.toLocaleString():'-'}updateStatus()}
function updateStatus(){let t=0,a=0;document.querySelectorAll('.layer-btn.active').forEach(b=>{t+=LD[b.dataset.layer].n;a++});document.getElementById('total-count').textContent=t.toLocaleString();document.getElementById('active-layers').textContent=a;document.getElementById('active-filters').textContent=state.topics.size;lastUpdateTime=Date.now();updateRelativeTime()}
function updateRelativeTime(){const d=Math.round((Date.now()-lastUpdateTime)/1000);const el=document.getElementById('last-update');if(d<5)el.textContent='Updated just now';else if(d<60)el.textContent=`Updated ${d}s ago`;else el.textContent=`Updated ${Math.floor(d/60)}m ago`}
setInterval(updateRelativeTime, TIMING.RELATIVE_TIME_TICK);

// === CHOROPLETH MODES ===
function getCountryStyle(iso) {
  const sm = {};
  if (countryMapData?.scores) countryMapData.scores.forEach(s => { sm[(s.code||'').toUpperCase()] = s; });

  const s = sm[iso];
  const sc = s ? parseFloat(s.score) || 0 : 0;
  const act = activityData[iso];
  const vol = act ? parseInt(act.article_count) || 0 : 0;

  if (choroplethMode === 'density') {
    if (vol === 0) return { fillColor: 'rgba(255,255,255,0.03)', fillOpacity: 0.05 };
    const fill = vol >= 100 ? '#3b82f6' : vol >= 30 ? '#6366f1' : vol >= 10 ? '#8b5cf6' : '#a78bfa';
    return { fillColor: fill, fillOpacity: Math.min(0.55, 0.08 + vol * 0.003) };
  }
  if (choroplethMode === 'sentiment') {
    const sent = countryMapData?.sentiment?.find(s => s.country_iso2 === iso);
    if (!sent) return { fillColor: 'rgba(255,255,255,0.03)', fillOpacity: 0.05 };
    const neg = parseFloat(sent.negative_pct) || 0;
    const pos = parseFloat(sent.positive_pct) || 0;
    if (neg > 60) return { fillColor: '#ef4444', fillOpacity: 0.35 };
    if (neg > 30) return { fillColor: '#f97316', fillOpacity: 0.25 };
    if (pos > 30) return { fillColor: '#22c55e', fillOpacity: 0.25 };
    return { fillColor: '#94a3b8', fillOpacity: 0.12 };
  }
  // default: risk
  const fill = sc >= 7 ? '#ef4444' : sc >= 5 ? '#f97316' : sc >= 3 ? '#eab308' : sc > 0 ? '#22c55e' : 'rgba(255,255,255,0.03)';
  return { fillColor: fill, fillOpacity: sc > 0 ? 0.25 : 0.05 };
}

// === DATA LAYER LOADERS ===
async function load(key) {
  setLoading(key, true);
  const d = LD[key], grp = d.g;
  try {
    switch (key) {
      case 'mil-flights': case 'com-flights': {
        const type = key === 'mil-flights' ? 'military' : 'commercial';
        const res = await get(`/flights?type=${type}`, key);
        if (!res?.ok) break;
        const items = res.data[type] || [];
        d.n = items.length; grp.clearLayers();
        items.forEach(f => { if (!f.lat || !f.lon) return;
          const m = L.marker([f.lat, f.lon], { icon: planeIco(d.c, f.heading_deg) });
          m.bindPopup(accentPopup(d.c, `<span class="tag tag-${type==='military'?'mil':'com'}">${type==='military'?'MIL':'COM'}</span> <b>${f.callsign||f.icao24}</b><br>${f.aircraft_type||f.origin_country||''}<br>Alt: ${f.altitude_ft||'?'}ft &middot; ${f.speed_kt||'?'}kt<br>${f.operator||''} ${f.operator_country||''}`));
          grp.addLayer(m);
        }); break;
      }
      case 'mil-vessels': case 'com-vessels': {
        const type = key === 'mil-vessels' ? 'military' : 'commercial';
        const res = await get(`/vessels?type=${type}`, key);
        if (!res?.ok) break;
        const items = res.data[type] || [];
        d.n = items.length; grp.clearLayers();
        items.forEach(v => { if (!v.lat || !v.lon) return;
          const m = L.marker([v.lat, v.lon], { icon: shipIco(d.c) });
          const choke = v.near_chokepoint ? '<br><b style="color:#f59e0b">NEAR CHOKEPOINT</b>' : '';
          m.bindPopup(accentPopup(d.c, `<span class="tag tag-${type==='military'?'mil':'com'}">${type.toUpperCase().slice(0,3)}</span> <b>${v.vessel_name||v.mmsi}</b><br>${v.vessel_type||v.category||''}<br>${v.speed_kt||'?'}kt &middot; ${v.operator||v.flag_country||''}${choke}`));
          grp.addLayer(m);
        }); break;
      }
      case 'bases': { const res=await getStatic('/bases','bases');grp.clearLayers();d.n=res.data.length;res.data.forEach(b=>{if(!b.lat||!b.lon)return;const m=L.marker([b.lat,b.lon],{icon:baseIco(b.type)});m.bindPopup(accentPopup('#f43f5e',`<span class="tag tag-base">${(b.type||'').toUpperCase()}</span> <b>${b.name}</b><br>${b.country}<br>${b.arm||''}<br><small>${b.status||''} &middot; ${b.description||''}</small>`));grp.addLayer(m)});break; }
      case 'hotspots': {
        const res = await getStatic('/hotspots', 'hotspots');
        grp.clearLayers(); d.n = res.data.length;
        res.data.forEach(h => { if (!h.lat || !h.lon) return;
          const esc = h.escalationScore || 1;
          const c = esc >= 4 ? '#ef4444' : esc >= 3 ? '#f97316' : '#eab308';
          L.circleMarker([h.lat, h.lon], { radius: 20 + esc * 3, fillColor: c, color: c, weight: 1, fillOpacity: 0.05, className: 'hotspot-ring-outer' }).addTo(grp);
          L.circleMarker([h.lat, h.lon], { radius: 16 + esc * 3, fillColor: c, color: c, weight: 1.5, fillOpacity: 0.08, className: 'hotspot-ring' }).addTo(grp);
          const cm = L.circleMarker([h.lat, h.lon], { radius: 7, fillColor: c, color: '#000', weight: 1, fillOpacity: 0.9 });
          // Enriched hotspot popup with why-it-matters and escalation indicators
          let popupHtml = `<span class="tag tag-hot">HOTSPOT ${esc}/5</span> <b>${h.name}</b><br><i>${h.subtext || ''}</i><br>`;
          if (h.whyItMatters) popupHtml += `<div style="margin:6px 0;padding:6px;background:rgba(255,255,255,0.04);border-radius:4px;border-left:2px solid ${c}"><b style="font-size:9px;color:var(--text3)">WHY IT MATTERS</b><br><span style="font-size:10px">${h.whyItMatters}</span></div>`;
          if (h.escalationIndicators?.length) popupHtml += `<div style="margin-top:4px"><b style="font-size:9px;color:var(--text3)">ESCALATION SIGNALS</b><ul style="margin:2px 0 0 12px;padding:0;font-size:10px;color:var(--text2)">${h.escalationIndicators.map(i=>`<li>${i}</li>`).join('')}</ul></div>`;
          if (h.history) popupHtml += `<div style="margin-top:4px;font-size:9px;color:var(--text3)">Last: ${h.history.lastMajorEvent || ''} (${h.history.lastMajorEventDate || ''})<br>Cyclical: ${h.history.cyclicalRisk || 'N/A'}</div>`;
          popupHtml += `<br>Trend: <b style="color:${h.escalationTrend==='escalating'?'#ef4444':h.escalationTrend==='de-escalating'?'#22c55e':'#94a3b8'}">${h.escalationTrend || '?'}</b>`;
          cm.bindPopup(accentPopup(c, popupHtml), { maxWidth: 320 });
          grp.addLayer(cm);
        }); break;
      }
      case 'pipelines': { const res=await getStatic('/pipelines','pipelines');grp.clearLayers();d.n=res.data.length;const pc={oil:'#f59e0b',gas:'#3b82f6',lng:'#06b6d4',products:'#a855f7'};res.data.forEach(p=>{if(!p.points||p.points.length<2)return;const ll=p.points.map(pt=>[pt[1],pt[0]]);const line=L.polyline(ll,{color:pc[p.type]||'#94a3b8',weight:2,opacity:0.65,dashArray:p.status==='operating'?null:'5,5'});line.bindPopup(accentPopup(pc[p.type]||'#f59e0b',`<span class="tag tag-pipe">${(p.type||'').toUpperCase()}</span> <b>${p.name}</b><br>${p.capacity||''}<br>${p.operator||''}<br>${(p.countries||[]).join(', ')}`));grp.addLayer(line)});break; }
      case 'ports': { const res=await getStatic('/ports','ports');grp.clearLayers();d.n=res.data.length;const tc={container:'#06b6d4',oil:'#f59e0b',lng:'#3b82f6',naval:'#ef4444',mixed:'#a855f7',bulk:'#94a3b8'};res.data.forEach(p=>{if(!p.lat||!p.lon)return;const c=L.circleMarker([p.lat,p.lon],{radius:5,fillColor:tc[p.type]||'#06b6d4',color:'#000',weight:1,fillOpacity:0.8});c.bindPopup(accentPopup(tc[p.type]||'#06b6d4',`<span class="tag tag-port">${(p.type||'').toUpperCase()}</span> <b>${p.name}</b>${p.rank?' #'+p.rank:''}<br>${p.country}<br><small>${p.note||''}</small>`));grp.addLayer(c)});break; }
      case 'cables': { const res=await getStatic('/cables','cables');grp.clearLayers();d.n=res.data.length;res.data.forEach(cb=>{if(!cb.points||cb.points.length<2)return;const ll=cb.points.map(pt=>[pt[1],pt[0]]);const line=L.polyline(ll,{color:cb.major?'#818cf8':'#4b5563',weight:cb.major?2.5:1.5,opacity:0.5,smoothFactor:2});line.bindPopup(accentPopup('#818cf8',`<b>${cb.name}</b><br>${cb.capacityTbps?cb.capacityTbps+' Tbps':''}<br>${(cb.owners||[]).join(', ')}`));grp.addLayer(line)});break; }
      case 'quakes': { const res=await get('/quakes?hours=168',key);if(!res?.ok)break;grp.clearLayers();d.n=res.data.length;res.data.forEach(q=>{if(!q.lat||!q.lon)return;const mag=parseFloat(q.magnitude)||0;const r=Math.max(4,mag*3.5);const fc=mag>=6?'#ef4444':mag>=5?'#f97316':'#a855f7';const c=L.circleMarker([q.lat,q.lon],{radius:r,fillColor:fc,color:'#000',weight:1,fillOpacity:0.7});c.bindPopup(accentPopup(fc,`<span class="tag tag-quake">M${mag.toFixed(1)}</span> <b>${q.place}</b><br>Depth: ${q.depth_km}km<br>${new Date(q.event_time).toLocaleString()}${q.tsunami?'<br><b style="color:#ef4444">TSUNAMI</b>':''}`));grp.addLayer(c)});break; }
      case 'fires': { const res=await get('/fires?hours=24',key);if(!res?.ok)break;grp.clearLayers();d.n=res.data.length;res.data.forEach(f=>{if(!f.lat||!f.lon)return;const frp=parseFloat(f.frp)||0;const r=Math.max(2,Math.min(7,frp/60));const c=L.circleMarker([f.lat,f.lon],{radius:r,fillColor:'#f97316',color:'#7c2d12',weight:0.3,fillOpacity:Math.min(0.75,0.25+frp/250)});c.bindPopup(accentPopup('#f97316',`<span class="tag tag-fire">FIRE</span> FRP ${frp.toFixed(0)}MW<br>${f.confidence} conf &middot; ${f.satellite||''}`));grp.addLayer(c)});break; }
      case 'disasters': { const res=await get('/disasters',key);if(!res?.ok)break;grp.clearLayers();d.n=res.data.length;res.data.forEach(e=>{if(!e.lat||!e.lon)return;const c=L.circleMarker([e.lat,e.lon],{radius:8,fillColor:'#ec4899',color:'#831843',weight:1.5,fillOpacity:0.7});c.bindPopup(accentPopup('#ec4899',`<span class="tag tag-disaster">${(e.category||'').toUpperCase()}</span> <b>${e.title}</b><br>${e.magnitude?e.magnitude+' '+(e.magnitude_unit||''):''}<br>${e.alert_level?'Alert: '+e.alert_level:''}`));grp.addLayer(c)});break; }
      case 'events': { const res=await get('/events',key);if(!res?.ok)break;grp.clearLayers();d.n=res.data.length;res.data.forEach(e=>{const geo=e.location_geo;if(!geo)return;let lat,lon;if(typeof geo==='string'&&geo.includes(','))[lat,lon]=geo.split(',').map(Number);else if(geo.lat){lat=geo.lat;lon=geo.lon}if(!lat||!lon)return;const c=L.circleMarker([lat,lon],{radius:5,fillColor:'#eab308',color:'#713f12',weight:1,fillOpacity:0.75});c.bindPopup(accentPopup('#eab308',`<span class="tag tag-event">${e.event_type||'EVENT'}</span> <b>${e.action||''}</b><br>Actors: ${e.actors||'?'}<br>${e.location||''}`));grp.addLayer(c)});break; }
      case 'outages': { const res=await get('/outages',key);if(!res?.ok)break;grp.clearLayers();d.n=res.data.length;res.data.forEach(o=>{const pos=CC[(o.location_code||'').toUpperCase()];if(!pos)return;const c=L.circleMarker([pos.lat,pos.lon],{radius:10,fillColor:'#6366f1',color:'#312e81',weight:2,fillOpacity:0.7});c.bindPopup(accentPopup('#6366f1',`<span class="tag tag-outage">${o.outage_type||'OUTAGE'}</span>${o.is_ongoing?' <b style="color:#ef4444">ONGOING</b>':''}<br><b>${o.location_name||o.scope||''}</b><br>${o.description||''}`));grp.addLayer(c)});break; }
      case 'nuclear': { const res=await getStatic('/nuclear','nuclear');grp.clearLayers();d.n=res.data.length;res.data.forEach(n=>{if(!n.lat||!n.lon)return;const m=L.marker([n.lat,n.lon],{icon:diamondIco('#84cc16',8)});m.bindPopup(accentPopup('#84cc16',`<span class="tag tag-nuke">NUCLEAR</span> <b>${n.city||n.name||''}</b><br>${n.country||''}`));grp.addLayer(m)});break; }
      case 'economic': { const res=await getStatic('/economic','economic');grp.clearLayers();d.n=res.data.length;res.data.forEach(e=>{if(!e.lat||!e.lon)return;const c=L.circleMarker([e.lat,e.lon],{radius:6,fillColor:'#22d3ee',color:'#083344',weight:1,fillOpacity:0.7});c.bindPopup(accentPopup('#22d3ee',`<span class="tag tag-econ">${(e.type||'').toUpperCase()}</span> <b>${e.name}</b><br>${e.country||''}<br><small>${e.description||''}</small>`));grp.addLayer(c)});break; }
      case 'countries': {
        const geoRes = await getStatic('/geojson', 'geojson');
        if (!countryMapData) await fetchCountryMapData();
        grp.clearLayers();
        const scores = countryMapData?.scores || [];
        d.n = scores.length;
        const sm = {}; scores.forEach(s => { sm[(s.code || '').toUpperCase()] = s; });
        geojsonData = geoRes;
        if (geoRes?.features) {
          L.geoJSON(geoRes, {
            style: feat => {
              const iso = (feat.properties.ISO_A2 || feat.properties.ADM0_A3 || '').substring(0, 2).toUpperCase();
              const cs = getCountryStyle(iso);
              return { fillColor: cs.fillColor, fillOpacity: cs.fillOpacity, color: '#444', weight: 0.5, opacity: 0.4 };
            },
            onEachFeature: (feat, layer) => {
              const iso = (feat.properties.ISO_A2 || feat.properties.ADM0_A3 || '').substring(0, 2).toUpperCase();
              const s = sm[iso];
              const name = (s && s.name) || feat.properties.NAME || iso;
              layer.bindTooltip(`${isoToFlag(iso)} ${name}`, { sticky: true, className: 'country-tooltip' });
              layer.on('mouseover', e => { layer.setStyle({ fillOpacity: 0.4, weight: 2, color: '#c4b5fd' }); showCountryHoverCard(iso, name, s, e.originalEvent); });
              layer.on('mousemove', e => { moveCountryHoverCard(e.originalEvent); });
              layer.on('mouseout', () => { const cs = getCountryStyle(iso); layer.setStyle({ fillOpacity: cs.fillOpacity, weight: 0.5, color: '#444' }); hideCountryHoverCard(); });
              layer.on('click', () => { navigateTo('country', iso); map.closePopup(); hideCountryHoverCard(); });
            }
          }).addTo(grp);
        }
        // Also render GDELT volume spike markers
        renderSpikeMarkers();
        break;
      }
    }
  } catch (e) { if (e.name !== 'AbortError') console.warn('[WM]', key, e.message); }
  setLoading(key, false);
  updateCount(key);
}

// === GDELT SPIKE MARKERS ===
function renderSpikeMarkers() {
  spikeLayerGroup.clearLayers();
  const alerts = countryMapData?.alerts || [];
  alerts.forEach(a => {
    const iso = (a.country || '').toUpperCase();
    const pos = CC[iso]; if (!pos) return;
    const z = parseFloat(a.z_score) || 0;
    const sev = a.severity || 'high';
    const c = sev === 'critical' ? '#ec4899' : '#f97316';
    const r = Math.min(16, 8 + z * 0.15);
    // Pulsing ring
    L.circleMarker([pos.lat, pos.lon], { radius: r + 6, fillColor: c, color: c, weight: 1, fillOpacity: 0.06, className: 'hotspot-ring' }).addTo(spikeLayerGroup);
    const cm = L.circleMarker([pos.lat, pos.lon], { radius: r, fillColor: c, color: '#000', weight: 1.5, fillOpacity: 0.8 });
    cm.bindPopup(accentPopup(c, `<span class="tag tag-spike">NEWS SPIKE</span> <span class="tag tag-${sev}">${sev.toUpperCase()}</span><br><b>${isoToFlag(iso)} ${pos.name || iso}</b><br>Z-score: <b style="font-family:var(--mono)">${z.toFixed(1)}</b><br>${a.top_title ? `<i style="font-size:10px;color:var(--text2)">${escHtml(a.top_title)}</i>` : ''}`));
    spikeLayerGroup.addLayer(cm);
  });
}

// === COUNTRY HOVER CARD ===
const hoverCard = document.getElementById('country-hover-card');
let hoverCardTimeout = null;

function showCountryHoverCard(iso, name, score, mouseEvt) {
  clearTimeout(hoverCardTimeout);
  const act = activityData[iso];
  const articles = state.newsData.filter(a => (a.country_iso || '').toUpperCase() === iso);
  const topArticles = articles.slice(0, 4);
  const total = act ? parseInt(act.article_count) : articles.length;
  const pos = act ? parseInt(act.positive || 0) : articles.filter(a => a.sentiment_label === 'positive').length;
  const neg = act ? parseInt(act.negative || 0) : articles.filter(a => a.sentiment_label === 'negative').length;
  const neu = Math.max(0, total - pos - neg);
  const posW = total > 0 ? (pos / total * 100) : 0;
  const negW = total > 0 ? (neg / total * 100) : 0;
  const neuW = 100 - posW - negW;

  // Risk info
  const sc = score ? parseFloat(score.score) || 0 : 0;
  const riskColor = sc >= 7 ? '#ef4444' : sc >= 5 ? '#f97316' : sc >= 3 ? '#eab308' : sc > 0 ? '#22c55e' : '#555';
  const riskLabel = score?.level || (sc > 0 ? 'scored' : 'no data');

  // GDELT alert?
  const alert = countryMapData?.alerts?.find(a => (a.country||'').toUpperCase() === iso);

  let html = `<div class="chc-header"><span class="chc-flag">${isoToFlag(iso)}</span><span class="chc-name">${escHtml(name)}</span>`;
  if (sc > 0) html += `<span class="chc-risk" style="background:${riskColor}22;color:${riskColor}">${sc.toFixed(0)} ${riskLabel}</span>`;
  html += `<span class="chc-iso">${iso}</span></div>`;
  html += `<div class="chc-stats">
    <div class="chc-stat"><span class="chc-stat-val">${total}</span><span class="chc-stat-label">Articles</span></div>
    <div class="chc-stat"><span class="chc-stat-val" style="color:var(--pos)">${pos}</span><span class="chc-stat-label">Positive</span></div>
    <div class="chc-stat"><span class="chc-stat-val" style="color:var(--neg)">${neg}</span><span class="chc-stat-label">Negative</span></div>
    <div class="chc-stat"><span class="chc-stat-val">${act?.avg_score||'-'}</span><span class="chc-stat-label">Relevance</span></div>
  </div>`;
  html += `<div class="chc-sentiment-bar"><div style="width:${posW}%;background:var(--pos)"></div><div style="width:${neuW}%;background:var(--neu);opacity:0.3"></div><div style="width:${negW}%;background:var(--neg)"></div></div>`;
  // Sparkline (7-day trend)
  const tl = timelineData[iso];
  if (tl && tl.length > 0) html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="font-size:8px;color:var(--text3);text-transform:uppercase">7d trend</span>${makeSparkline(tl, 7)}</div>`;
  if (alert) html += `<div style="padding:4px 6px;margin-bottom:6px;border-radius:4px;background:rgba(236,72,153,0.12);font-size:9px;color:#f9a8d4"><b>NEWS SPIKE</b> z=${parseFloat(alert.z_score).toFixed(1)}</div>`;
  if (topArticles.length > 0) {
    html += '<ul class="chc-headlines">';
    topArticles.forEach(a => {
      const sentDot = a.sentiment_label === 'negative' ? '#ef4444' : a.sentiment_label === 'positive' ? '#22c55e' : '#64748b';
      html += `<li><span style="color:${sentDot};margin-right:4px">&#9679;</span>${escHtml(a.title)}</li>`;
    });
    html += '</ul>';
    if (total > 4) html += `<div class="chc-view-all">+ ${total - 4} more &middot; Click to explore</div>`;
  } else {
    html += `<div style="color:var(--text3);font-size:10px;padding:4px 0">${total > 0 ? 'Click to view ' + total + ' articles' : 'No recent articles'}</div>`;
  }
  hoverCard.innerHTML = html;
  moveCountryHoverCard(mouseEvt);
  hoverCard.classList.add('visible');
}

function moveCountryHoverCard(e) {
  const pad = 16; let x = e.clientX + pad, y = e.clientY + pad;
  const cw = hoverCard.offsetWidth || 300, ch = hoverCard.offsetHeight || 200;
  if (x + cw > window.innerWidth) x = e.clientX - cw - pad;
  if (y + ch > window.innerHeight) y = e.clientY - ch - pad;
  hoverCard.style.left = x + 'px'; hoverCard.style.top = y + 'px';
}
function hideCountryHoverCard() { clearTimeout(hoverCardTimeout); hoverCardTimeout = setTimeout(() => hoverCard.classList.remove('visible'), 150); }

// === DRILL-DOWN ===
function detectLevel(){const z=map.getZoom(),c=map.getCenter(),lat=c.lat,lon=c.lng;if(z<3)return{type:'world',value:null};if(!geoHierarchy)return{type:'world',value:null};if(z>=5){const co=findCountryAt(lat,lon);if(co)return{type:'country',value:co.iso,name:co.name}}if(z>=4){const sub=findSubregionAt(lat,lon);if(sub)return{type:'subregion',value:sub.name,continent:sub.continent}}const cont=findContinentAt(lat,lon);if(cont)return{type:'continent',value:cont.name};return{type:'world',value:null}}
function findContinentAt(lat,lon){if(!geoHierarchy)return null;let best=null,bd=Infinity;for(const c of geoHierarchy.continents){const[sw,ne]=c.bounds;if(lat>=sw[0]-10&&lat<=ne[0]+10&&lon>=sw[1]-10&&lon<=ne[1]+10){const d=(lat-c.center[0])**2+(lon-c.center[1])**2;if(d<bd){bd=d;best=c}}}return best}
function findSubregionAt(lat,lon){if(!geoHierarchy)return null;let best=null,bd=Infinity;for(const c of geoHierarchy.continents)for(const s of c.subregions){const[sw,ne]=s.bounds;if(lat>=sw[0]-5&&lat<=ne[0]+5&&lon>=sw[1]-5&&lon<=ne[1]+5){const d=(lat-s.center[0])**2+(lon-s.center[1])**2;if(d<bd){bd=d;best={...s,continent:c.name}}}}return best}
function findCountryAt(lat,lon){if(!geoHierarchy)return null;let best=null,bd=Infinity;for(const c of geoHierarchy.continents)for(const s of c.subregions)for(const co of s.countries){const d=(lat-co.lat)**2+(lon-co.lon)**2;if(d<bd){bd=d;best=co}}if(bd>130)return null;return best}
let prevZoomBucket = 0;
function onMapMove(){clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>{
  const nl=detectLevel();const nk=`${nl.type}:${nl.value}`;
  const zoomBucket = Math.floor(map.getZoom());
  const levelChanged = nk !== prevLevelKey;
  const zoomChanged = zoomBucket !== prevZoomBucket;
  prevZoomBucket = zoomBucket;
  if(levelChanged){
    prevLevelKey=nk;state.level=nl;updateBreadcrumb();updateDrillLevelStatus();
    if(nl.type==='country')showCountryDetail(nl.value,nl.name);else{hideCountryDetail();hideCountryHoverCard();document.getElementById('topic-legend').classList.remove('visible')}
    refreshNews();
  } else if(zoomChanged && state.level.type==='country' && state.newsData.length>0){
    // Re-render markers at new zoom scale without refetching
    renderNewsMarkers(state.newsData);
  }
},600)}
function updateDrillLevelStatus(){const el=document.getElementById('drill-level'),l=state.level;if(l.type==='world')el.textContent='World';else if(l.type==='continent')el.textContent=l.value;else if(l.type==='subregion')el.textContent=l.value.replace(/_/g,' ');else if(l.type==='country')el.textContent=`${isoToFlag(l.value)} ${l.name||l.value}`}

function updateBreadcrumb(){const bc=document.getElementById('breadcrumb'),l=state.level;let items=[{label:'World',action:()=>navigateTo('world')}];if(l.type==='continent'||l.type==='subregion'||l.type==='country'){const cn=l.type==='continent'?l.value:l.type==='subregion'?l.continent:findCountryContinent(l.value);if(cn)items.push({label:cn,action:()=>navigateTo('continent',cn)})}if(l.type==='subregion'||l.type==='country'){const sn=l.type==='subregion'?l.value:findCountrySubregion(l.value);if(sn)items.push({label:sn.replace(/_/g,' '),action:()=>navigateTo('subregion',sn)})}if(l.type==='country')items.push({label:`${isoToFlag(l.value)} ${l.name||l.value}`,active:true});if(items.length>0)items[items.length-1].active=true;let html='';items.forEach((it,i)=>{if(i>0)html+='<span class="breadcrumb-sep">&rsaquo;</span>';html+=`<button class="breadcrumb-item${it.active?' active':''}" data-idx="${i}">${it.label}</button>`});bc.innerHTML=html;bc.querySelectorAll('.breadcrumb-item').forEach((btn,i)=>{if(items[i].action)btn.addEventListener('click',items[i].action)})}
function findCountryContinent(iso){if(!geoHierarchy)return null;for(const c of geoHierarchy.continents)for(const s of c.subregions)for(const co of s.countries)if(co.iso===iso)return c.name;return null}
function findCountrySubregion(iso){if(!geoHierarchy)return null;for(const c of geoHierarchy.continents)for(const s of c.subregions)for(const co of s.countries)if(co.iso===iso)return s.name;return null}
function navigateTo(type,value){if(type==='world'){map.flyTo([20,15],2,{duration:1})}else if(type==='continent'){const cont=geoHierarchy.continents.find(c=>c.name===value);if(cont)map.flyToBounds([cont.bounds[0],cont.bounds[1]],{duration:1,padding:[20,20]})}else if(type==='subregion'){for(const c of geoHierarchy.continents){const sub=c.subregions.find(s=>s.name===value);if(sub){map.flyToBounds([sub.bounds[0],sub.bounds[1]],{duration:1,padding:[20,20]});break}}}else if(type==='country'){const co=CC[value];if(co){state.level={type:'country',value,name:co.name};prevLevelKey=`country:${value}`;updateBreadcrumb();updateDrillLevelStatus();showCountryDetail(value,co.name);refreshNews();map.flyTo([co.lat,co.lon],6,{duration:1})}}}

// === COUNTRY DETAIL VIEW ===
function showCountryDetail(iso, name) {
  state.countryDetail = iso;
  const container = document.getElementById('country-detail');
  const act = activityData[iso];
  const score = countryMapData?.scores?.find(s => (s.code||'').toUpperCase() === iso);
  const sent = countryMapData?.sentiment?.find(s => s.country_iso2 === iso);
  const gdelt = countryMapData?.gdelt?.filter(g => (g.country||'').toUpperCase() === iso);
  const alert = countryMapData?.alerts?.find(a => (a.country||'').toUpperCase() === iso);
  const focal = summaryData?.top_focal_points?.filter(f => (f.entity_id||'').toUpperCase() === iso);

  const total = act ? parseInt(act.article_count) : 0;
  const high = act ? parseInt(act.high_score || 0) : 0;
  const neg = act ? parseInt(act.negative || 0) : 0;
  const pos = act ? parseInt(act.positive || 0) : 0;
  const neu = Math.max(0, total - pos - neg);
  const posW = total > 0 ? (pos/total*100) : 0;
  const negW = total > 0 ? (neg/total*100) : 0;
  const neuW = 100 - posW - negW;
  const sc = score ? parseFloat(score.score) || 0 : 0;
  const riskColor = sc >= 7 ? '#ef4444' : sc >= 5 ? '#f97316' : sc >= 3 ? '#eab308' : sc > 0 ? '#22c55e' : '#555';

  const watched = isWatched('country', iso);
  let html = `<div class="cd-header">
    <button class="cd-back" id="cd-back">&larr;</button>
    <span class="cd-flag">${isoToFlag(iso)}</span>
    <div class="cd-info"><div class="cd-name">${escHtml(name || CC[iso]?.name || iso)}</div>
    <div class="cd-sub">${findCountrySubregion(iso)?.replace(/_/g,' ')||''} &middot; ${findCountryContinent(iso)||''}</div></div>
    <button class="watch-star ${watched?'active':''}" id="cd-watch-star" title="${watched?'Remove from watchlist':'Add to watchlist'}">${watched?'&#9733;':'&#9734;'}</button>
  </div>`;

  // Stats
  html += `<div class="cd-stats">
    <div class="cd-stat"><div class="cd-stat-val">${total}</div><div class="cd-stat-label">Articles</div></div>
    <div class="cd-stat"><div class="cd-stat-val" style="color:#f59e0b">${high}</div><div class="cd-stat-label">High Score</div></div>
    <div class="cd-stat"><div class="cd-stat-val" style="color:var(--neg)">${neg}</div><div class="cd-stat-label">Negative</div></div>
    <div class="cd-stat"><div class="cd-stat-val" style="color:${riskColor}">${sc>0?sc.toFixed(0):'-'}</div><div class="cd-stat-label">Risk Score</div></div>
  </div>`;

  // Sentiment bar
  html += `<div class="cd-sentiment-row">
    <div class="cd-sentiment-bar"><div style="width:${posW}%;background:var(--pos)"></div><div style="width:${neuW}%;background:var(--neu);opacity:0.3"></div><div style="width:${negW}%;background:var(--neg)"></div></div>
    <div class="cd-sentiment-legend"><span><span class="sdot" style="background:var(--pos)"></span>Pos ${pos}</span><span><span class="sdot" style="background:var(--neu)"></span>Neu ${neu}</span><span><span class="sdot" style="background:var(--neg)"></span>Neg ${neg}</span></div>
  </div>`;

  // 7-day timeline sparkline
  const tl = timelineData[iso];
  if (tl?.length) {
    const totalTl = tl.reduce((s,d) => s + d.articles, 0);
    const negTl = tl.reduce((s,d) => s + d.negative, 0);
    html += `<div style="padding:8px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
      <span style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3)">7d Trend</span>
      ${makeSparkline(tl, 7)}
      <span style="font-size:9px;color:var(--text3)">${totalTl} articles${negTl > 0 ? ' · <span style="color:var(--neg)">' + negTl + ' neg</span>' : ''}</span>
    </div>`;
  }

  // GDELT alert detail
  if (alert) {
    const zs = parseFloat(alert.z_score).toFixed(1);
    html += `<div style="padding:8px 16px;border-bottom:1px solid var(--border);background:rgba(236,72,153,0.06)">
      <span class="tag tag-spike">NEWS SPIKE</span> <span style="font-size:11px;font-weight:600;color:var(--text)">z-score: ${zs}</span>
      <span style="font-size:10px;color:var(--text3)"> · Volume: ${parseFloat(alert.current_volume).toFixed(2)}</span>
      ${alert.top_title ? '<div style="font-size:10px;color:var(--text2);margin-top:4px;line-height:1.4">' + escHtml(alert.top_title) + '</div>' : ''}
    </div>`;
  }

  // Risk breakdown
  if (score && sc > 0) {
    const comps = [
      { name: 'Unrest', val: score.component_unrest || 0, color: '#f97316' },
      { name: 'Conflict', val: score.component_conflict || 0, color: '#ef4444' },
      { name: 'Security', val: score.component_security || 0, color: '#eab308' },
      { name: 'Information', val: score.component_information || 0, color: '#3b82f6' },
    ];
    html += `<div class="cd-risk">
      <div class="cd-risk-score" style="color:${riskColor}">${sc.toFixed(0)}</div>
      <div class="cd-risk-components">`;
    comps.forEach(c => {
      html += `<div class="cd-risk-comp"><span style="width:70px">${c.name}</span><div class="cd-risk-comp-bar"><div class="cd-risk-comp-fill" style="width:${Math.min(100,c.val*2)}%;background:${c.color}"></div></div><span style="min-width:20px;text-align:right">${c.val}</span></div>`;
    });
    html += `<div style="font-size:9px;color:var(--text3);margin-top:4px">Trend: <b style="color:${score.trend==='worsening'?'#ef4444':score.trend==='improving'?'#22c55e':'var(--text2)'}">${score.trend||'stable'}</b> &middot; 24h: ${score.change_24h||'0'}</div></div></div>`;
  }

  // GDELT alert
  if (alert) {
    html += `<div style="padding:8px 16px;border-bottom:1px solid var(--border)"><span class="tag tag-spike">NEWS SPIKE</span> <span class="tag tag-critical">${alert.severity}</span><br><span style="font-size:10px;color:var(--text2)">Z-score: <b>${parseFloat(alert.z_score).toFixed(1)}</b> &middot; ${new Date(alert.alert_date).toLocaleDateString()}</span><br>${alert.top_title ? `<i style="font-size:10px;color:var(--text3)">${escHtml(alert.top_title)}</i>` : ''}</div>`;
  }

  // Focal point info
  if (focal?.length) {
    focal.forEach(f => {
      html += `<div style="padding:8px 16px;border-bottom:1px solid var(--border)"><span class="tag tag-focal">FOCAL</span> <span class="tag tag-critical">${f.urgency}</span> <b>${f.display_name}</b><br><span style="font-size:10px;color:var(--text3)">${f.news_mentions} mentions &middot; Score ${parseFloat(f.focal_score).toFixed(0)}</span>`;
      if (f.top_headlines?.length) {
        html += '<ul style="margin:4px 0 0 12px;padding:0;font-size:10px;color:var(--text2)">';
        f.top_headlines.slice(0, 3).forEach(h => { html += `<li style="margin:2px 0"><a href="${h.url}" target="_blank" style="color:var(--text2);text-decoration:none">${escHtml(h.title)}</a></li>`; });
        html += '</ul>';
      }
      // Add narrative + evidence from briefData
      const bfMatch = briefData?.focal_points?.find(bp => (bp.entity_id||'').toUpperCase() === (f.entity_id||'').toUpperCase());
      if(bfMatch?.narrative) html += `<div style="margin-top:6px;padding:8px;border-radius:6px;background:rgba(167,139,250,0.06);border-left:2px solid #a78bfa;font-size:10px;color:var(--text2);line-height:1.5">${escHtml(bfMatch.narrative)}</div>`;
      if(bfMatch?.correlation_evidence?.length) {
        html += '<div style="margin-top:4px;font-size:9px;color:var(--text3)">';
        bfMatch.correlation_evidence.forEach(e => { html += `<div style="padding:1px 0"><span style="color:#a78bfa;margin-right:4px">&#9656;</span>${escHtml(e)}</div>`; });
        html += '</div>';
      }
      html += '</div>';
    });
  }

  // Topic distribution from current news
  const topicCounts = {};
  state.newsData.filter(a => (a.country_iso||'').toUpperCase() === iso).forEach(a => {
    if (a.primary_topic) topicCounts[a.primary_topic] = (topicCounts[a.primary_topic] || 0) + 1;
  });
  const topicsSorted = Object.entries(topicCounts).sort((a,b) => b[1] - a[1]).slice(0, 8);
  if (topicsSorted.length > 0) {
    const maxCount = topicsSorted[0][1];
    const topicColors = { geopolitics:'#ef4444', conflict:'#dc2626', economy_finance:'#22c55e', technology:'#3b82f6', elections_governance:'#a855f7', climate_environment:'#84cc16', general_world_news:'#94a3b8', human_rights:'#f59e0b', military_defense:'#f43f5e', medicine_pharma:'#06b6d4' };
    html += '<div class="cd-topics"><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);margin-bottom:6px">Topic Distribution</div>';
    topicsSorted.forEach(([topic, count]) => {
      const pct = (count / maxCount * 100);
      const color = topicColors[topic] || '#8892a8';
      const label = topic.replace(/_/g, ' ');
      html += `<div class="cd-topic-bar"><span class="cd-topic-name">${label}</span><div class="cd-topic-fill-wrap"><div class="cd-topic-fill" style="width:${pct}%;background:${color}"></div></div><span class="cd-topic-count">${count}</span></div>`;
    });
    html += '</div>';
  }

  container.innerHTML = html;
  container.classList.add('active');

  document.getElementById('cd-back')?.addEventListener('click', () => { hideCountryDetail(); navigateTo('world'); });
  document.getElementById('cd-watch-star')?.addEventListener('click', () => { toggleWatch('country', iso); showCountryDetail(iso, name); });
}

function hideCountryDetail() {
  state.countryDetail = null;
  document.getElementById('country-detail').classList.remove('active');
  document.getElementById('country-detail').innerHTML = '';
  document.getElementById('topic-legend').classList.remove('visible');
}

// === INTEL BRIEF ===
async function renderIntelBrief() {
  if (!summaryData) return;
  const container = document.getElementById('intel-brief');
  const clusters = summaryData.top_multi_source_clusters || [];
  const focalPoints = summaryData.top_focal_points || [];
  const trending = summaryData.top_trending || [];
  const alerts = countryMapData?.alerts || [];

  let badgeCount = clusters.length + focalPoints.filter(f => f.urgency === 'critical' || f.urgency === 'high').length + alerts.length;
  document.getElementById('intel-badge').textContent = badgeCount;

  let html = '';

  // Breaking stories
  if (clusters.length > 0) {
    html += '<div class="ib-section"><div class="ib-section-title"><span class="ib-dot" style="background:#ef4444;box-shadow:0 0 4px #ef4444"></span> Breaking Stories</div><div class="ib-breaking">';
    clusters.slice(0, 5).forEach(c => {
      const title = (c.primary_title || '').replace(/^\[.*?\]\s*/, '').slice(0, 150);
      html += `<div class="ib-story"><div class="ib-story-title"><a href="${c.primary_link}" target="_blank">${escHtml(title)}</a></div><div class="ib-story-meta"><span class="ib-sources-badge">${c.source_count} sources</span><span>${c.primary_source || ''}</span><span>${getTimeAgo(c.last_seen)}</span></div></div>`;
    });
    html += '</div></div>';
  }

  // Focal points — sorted by urgency (critical > high > medium > low)
  if (focalPoints.length > 0) {
    const urgOrder = {critical:0, high:1, medium:2, low:3};
    const sortedFocal = [...focalPoints].sort((a,b) => (urgOrder[a.urgency]||3) - (urgOrder[b.urgency]||3));
    html += '<div class="ib-section"><div class="ib-section-title"><span class="ib-dot" style="background:#a78bfa"></span> Critical Focal Points</div>';
    sortedFocal.slice(0, 8).forEach(f => {
      const urgClass = f.urgency || 'low';
      const scoreColor = urgClass === 'critical' ? '#ef4444' : urgClass === 'high' ? '#f97316' : '#94a3b8';
      // Find enriched narrative from briefData
      const bf = briefData?.focal_points?.find(bp => (bp.entity_id||'').toUpperCase() === (f.entity_id||'').toUpperCase());
      const hasDetail = bf?.narrative || bf?.correlation_evidence?.length;
      html += `<div class="ib-focal" data-entity="${f.entity_id}"><span class="ib-focal-urgency ${urgClass}"></span><span class="ib-focal-name">${isoToFlag(f.entity_id)} ${f.display_name}</span><span class="ib-focal-mentions">${f.news_mentions}m</span><span class="ib-focal-score" style="background:${scoreColor}22;color:${scoreColor}">${parseFloat(f.focal_score).toFixed(0)}</span>${hasDetail?'<span style="font-size:8px;color:var(--text3);margin-left:4px">&#9662;</span>':''}</div>`;
      if(hasDetail){
        html += `<div class="ib-focal-detail" data-entity="${f.entity_id}" style="display:none;padding:4px 16px 8px 24px;font-size:10px;line-height:1.5;border-bottom:1px solid rgba(255,255,255,0.03)">`;
        if(bf.narrative) html += `<div style="color:var(--text2);margin-bottom:4px">${escHtml(bf.narrative)}</div>`;
        if(bf.correlation_evidence?.length) {
          html += '<div style="color:var(--text3);font-size:9px">';
          bf.correlation_evidence.forEach(e => { html += `<div style="padding:1px 0"><span style="color:#a78bfa;margin-right:4px">&#9656;</span>${escHtml(e)}</div>`; });
          html += '</div>';
        }
        html += '</div>';
      }
    });
    html += '</div>';
  }

  // GDELT alerts — sorted by z-score (highest first)
  if (alerts.length > 0) {
    const sortedAlerts = [...alerts].sort((a,b) => (parseFloat(b.z_score)||0) - (parseFloat(a.z_score)||0));
    html += '<div class="ib-section"><div class="ib-section-title"><span class="ib-dot" style="background:#ec4899"></span> Volume Spikes (GDELT)</div>';
    sortedAlerts.slice(0, 8).forEach(a => {
      const iso = (a.country || '').toUpperCase();
      html += `<div class="ib-alert" data-iso="${iso}"><span class="ib-alert-sev ${a.severity||'high'}">${a.severity||'high'}</span><span class="ib-alert-country">${isoToFlag(iso)} ${CC[iso]?.name||iso}</span><span class="ib-alert-z">z=${parseFloat(a.z_score).toFixed(1)}</span></div>`;
    });
    html += '</div>';
  }

  // Trending keywords
  if (trending.length > 0) {
    html += '<div class="ib-section"><div class="ib-section-title"><span class="ib-dot" style="background:#eab308"></span> Trending</div><div class="ib-trending-cloud">';
    trending.slice(0, 15).forEach(t => {
      const mult = parseFloat(t.multiplier) || 1;
      const cls = mult >= 7 ? 'hot' : mult >= 4 ? 'warm' : '';
      const headlines = (t.sample_headlines||[]).slice(0,3).map(h=>escHtml(String(h).slice(0,80))).join('&#10;');
      html += `<span class="ib-kw ${cls}" title="${headlines}">${escHtml(t.term)} <span style="font-size:8px;opacity:.6">x${mult.toFixed(1)}</span></span>`;
    });
    html += '</div></div>';
  }

  container.innerHTML = html;
  if (state.intelOpen) container.classList.add('open');

  // Update freshness badge
  const freshEl = document.getElementById('intel-fresh');
  if (freshEl) freshEl.innerHTML = freshnessBadge(dataFreshness.summary, 'Intel Brief');

  // Bind focal point clicks — toggle detail on single click, navigate on double
  container.querySelectorAll('.ib-focal').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.entity;
      const detail = container.querySelector(`.ib-focal-detail[data-entity="${id}"]`);
      if(detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
    el.addEventListener('dblclick', () => {
      const id = el.dataset.entity;
      if (id && CC[id]) navigateTo('country', id);
    });
  });
  container.querySelectorAll('.ib-alert').forEach(el => {
    el.addEventListener('click', () => {
      const iso = el.dataset.iso;
      if (iso && CC[iso]) navigateTo('country', iso);
    });
  });
}

// === NEWS PANEL ===
function showSkeletonNews(){const list=document.getElementById('news-list');let html='';for(let i=0;i<5;i++)html+='<div class="skeleton-card"><div class="skeleton-line w80"></div><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>';list.innerHTML=html}
function getAllTopicCount(){return document.querySelectorAll('.topic-pill').length}

async function refreshNews(){
  const l=state.level;const allCount=getAllTopicCount();
  const topics=(allCount>0&&state.topics.size>=allCount)?[]:[...state.topics];
  const titleEl=document.getElementById('news-title');
  if(l.type==='world')titleEl.textContent='Global News';
  else if(l.type==='continent')titleEl.textContent=`${l.value} News`;
  else if(l.type==='subregion')titleEl.textContent=`${l.value.replace(/_/g,' ')} News`;
  else if(l.type==='country')titleEl.textContent=`${isoToFlag(l.value)} ${l.name||l.value}`;
  showSkeletonNews();
  try{
    let res;
    // When user has a search term, use the FTS /search endpoint (ranked, faster, multilingual)
    if(newsSearchTerm && newsSearchTerm.length >= 2){
      const sp = new URLSearchParams({q: newsSearchTerm, limit: 80, hours: Math.max(newsHours, 168)});
      const r = await fetch(`${WM_API}/search?${sp}`, {credentials:'same-origin'});
      if(!r.ok) throw new Error(r.status);
      res = await r.json();
    } else {
      const topicStr=topics.length?topics.sort().join(','):'';
      const params=new URLSearchParams({level:l.type,limit:80,hours:newsHours});
      if(l.value)params.set('value',l.value);
      if(topicStr)params.set('topics',topicStr);
      const r=await fetch(`${NEWS_API}/filtered?${params}`,{credentials:'same-origin'});
      if(!r.ok)throw new Error(r.status);
      res=await r.json();
    }
    state.newsData=res.data||[];
    // If world level and no search, show continent overview instead of flat list
    if(l.type==='world'&&!newsSearchTerm&&state.newsView==='grouped'){
      renderContinentOverview(state.newsData);
    } else {
      renderNews(state.newsData);
    }
    renderNewsMarkers(state.newsData);
    const countries=new Set(state.newsData.map(a=>a.country_iso).filter(Boolean));
    const freshCount=state.newsData.filter(a=>Date.now()-new Date(a.published_at).getTime()<7200000).length;
    document.getElementById('news-meta').textContent=`${state.newsData.length} articles, ${countries.size} countries${freshCount>0?' \u00b7 '+freshCount+' new':''}`;
    if(state.countryDetail)showCountryDetail(state.countryDetail,CC[state.countryDetail]?.name);
  }catch(e){console.warn('[News]',e.message);document.getElementById('news-list').innerHTML='<div class="news-empty">Failed to load news.</div>'}
}

// === CONTINENT OVERVIEW (at world zoom) ===
function renderContinentOverview(articles){
  const list=document.getElementById('news-list');
  list.classList.remove('flat-view');
  if(!articles.length){list.innerHTML='<div class="news-empty">No articles found.</div>';return}
  // Group by continent
  const byContinent={};
  articles.forEach(a=>{
    const cont=a.continent||'Global';
    if(!byContinent[cont])byContinent[cont]={articles:[],topics:{}};
    byContinent[cont].articles.push(a);
    if(a.primary_topic)byContinent[cont].topics[a.primary_topic]=(byContinent[cont].topics[a.primary_topic]||0)+1;
  });
  const sorted=Object.entries(byContinent).sort((a,b)=>b[1].articles.length-a[1].articles.length);
  let html='<div class="continent-overview">';
  sorted.forEach(([cont,data])=>{
    const top=data.articles[0];
    const topTopics=Object.entries(data.topics).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const negCount=data.articles.filter(a=>a.sentiment_label==='negative').length;
    const negPct=data.articles.length>0?Math.round(negCount/data.articles.length*100):0;
    html+=`<div class="co-card" data-cont="${cont}">
      <div class="co-card-header">
        <span class="co-card-name">${cont.replace(/_/g,' ')}</span>
        <span class="co-card-count">${data.articles.length} articles${negPct>30?' \u00b7 <span style="color:var(--neg)">'+negPct+'% neg</span>':''}</span>
      </div>
      ${top?`<div class="co-card-top">${escHtml(top.title)}</div>`:''}
      <div class="co-card-topics">${topTopics.map(([t,c])=>`<span class="co-card-topic">${t} ${c}</span>`).join('')}</div>
    </div>`;
  });
  html+='</div>';
  list.innerHTML=html;
  // Click continent card to navigate
  list.querySelectorAll('.co-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const cont=card.dataset.cont;
      if(cont&&cont!=='Global')navigateTo('continent',cont);
    });
  });
}

function renderNews(articles){const sorted=sortArticles(articles);if(state.newsView==='grouped')renderNewsGrouped(sorted);else renderNewsFlat(sorted)}

function renderNewsGrouped(articles){
  const list=document.getElementById('news-list');list.classList.remove('flat-view');
  if(!articles.length){list.innerHTML='<div class="news-empty">No articles found. Try zooming out or enabling more topics.</div>';return}
  const groups={},noCountry=[];
  articles.forEach(a=>{const iso=(a.country_iso||'').toUpperCase();if(iso&&iso.length===2){if(!groups[iso])groups[iso]={name:a.country_name||CC[iso]?.name||iso,articles:[]};groups[iso].articles.push(a)}else noCountry.push(a)});
  const sorted=Object.entries(groups).sort((a,b)=>b[1].articles.length-a[1].articles.length);
  let html='';
  sorted.forEach(([iso,group])=>{
    const arts=group.articles,pos=arts.filter(a=>a.sentiment_label==='positive').length,neg=arts.filter(a=>a.sentiment_label==='negative').length,total=arts.length,neu=total-pos-neg;
    const posW=total>0?(pos/total*100):0,negW=total>0?(neg/total*100):0,neuW=100-posW-negW;
    html+=`<div class="news-country-group" data-iso="${iso}"><div class="news-country-header" data-iso="${iso}"><span class="ncg-chevron">&#9660;</span><span class="ncg-flag">${isoToFlag(iso)}</span><span class="ncg-name">${escHtml(group.name)}</span><div class="ncg-sentiment"><div class="bar-pos" style="width:${posW}%"></div><div class="bar-neu" style="width:${neuW}%"></div><div class="bar-neg" style="width:${negW}%"></div></div><span class="ncg-count">${total}</span></div><div class="news-country-articles">`;
    arts.forEach(a=>{html+=renderCardHTML(a)});
    html+='</div></div>';
  });
  if(noCountry.length>0){html+=`<div class="news-country-group"><div class="news-country-header"><span class="ncg-chevron">&#9660;</span><span class="ncg-flag">&#127760;</span><span class="ncg-name">Global</span><span class="ncg-count">${noCountry.length}</span></div><div class="news-country-articles">`;noCountry.forEach(a=>{html+=renderCardHTML(a)});html+='</div></div>'}
  list.innerHTML=html;bindNewsInteractions(list);
}

function renderNewsFlat(articles){const list=document.getElementById('news-list');list.classList.add('flat-view');if(!articles.length){list.innerHTML='<div class="news-empty">No articles found.</div>';return}list.innerHTML=articles.map(a=>renderCardHTML(a,true)).join('');bindNewsInteractions(list)}

function renderCardHTML(a,showCountry){
  const s=a.sentiment_label||'neutral',sc=s==='positive'?'pill-pos':s==='negative'?'pill-neg':'pill-neu',t=getTimeAgo(a.published_at);
  // Fresh badge for articles < 2 hours old
  const ageMs=Date.now()-new Date(a.published_at).getTime();
  const fresh=ageMs<7200000?'<span class="badge-fresh">new</span>':'';
  // Relevance score bar
  const rel=parseInt(a.relevance_score)||0;
  const relColor=rel>=10?'#22c55e':rel>=5?'#3b82f6':'#64748b';
  const relBar=rel>0?`<span class="score-bar"><span class="score-bar-track"><span class="score-bar-fill" style="width:${Math.min(100,rel*5)}%;background:${relColor}"></span></span><span class="score-bar-val">${rel}</span></span>`:'';
  return`<div class="news-card sentiment-${s}" data-iso="${a.country_iso||''}" data-article-id="${a.article_id||''}"><div class="news-card-title"><a href="${a.url}" target="_blank" rel="noopener">${escHtml(a.title)}</a>${fresh}</div><div class="news-card-meta"><span>${escHtml(a.source_name||'')}</span><span>${t}</span>${relBar}<span class="news-pill ${sc}">${s}</span>${a.primary_topic?`<span class="news-pill pill-topic">${a.primary_topic}</span>`:''}${showCountry&&a.country_name?`<span class="news-pill pill-country">${isoToFlag(a.country_iso||'')} ${a.country_name}</span>`:''}</div>${a.nlp_summary?`<div class="news-card-summary">${escHtml(a.nlp_summary)}</div>`:''}</div>`
}

// Map of article_id -> map marker for cross-referencing sidebar <-> map
let articleMarkerMap = {};

function highlightSidebarCard(articleId) {
  if (!articleId) return;
  // Remove previous highlights
  document.querySelectorAll('.news-card.highlighted').forEach(c => c.classList.remove('highlighted'));
  const card = document.querySelector(`.news-card[data-article-id="${articleId}"]`);
  if (card) {
    card.classList.add('highlighted');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function bindNewsInteractions(list){
  // Event delegation — one listener per event type on the list container
  list.addEventListener('click', e=>{
    if(e.target.tagName==='A') return;
    const header = e.target.closest('.news-country-header');
    if(header){ header.classList.toggle('collapsed'); return; }
    const card = e.target.closest('.news-card');
    if(card){
      const aid = card.dataset.articleId;
      // Open reader on single click — pan map but also show reader
      if(aid){
        if(articleMarkerMap[aid]){
          map.panTo(articleMarkerMap[aid].getLatLng(), {duration:0.3});
        }
        openArticleReader(aid);
        return;
      }
      const iso=(card.dataset.iso||'').toUpperCase();
      if(iso&&CC[iso])map.flyTo([CC[iso].lat,CC[iso].lon],8,{duration:1});
    }
  });
  list.addEventListener('dblclick', e=>{
    const header = e.target.closest('.news-country-header');
    if(header){const iso=header.dataset.iso;if(iso&&CC[iso])navigateTo('country',iso)}
  });
  list.addEventListener('mouseenter', e=>{
    const card = e.target.closest('.news-card');
    if(card){const aid=card.dataset.articleId;if(aid&&articleMarkerMap[aid]?.setStyle)articleMarkerMap[aid].setStyle({weight:4,color:'#c4b5fd'})}
  }, true);
  list.addEventListener('mouseleave', e=>{
    const card = e.target.closest('.news-card');
    if(card){const aid=card.dataset.articleId;if(aid&&articleMarkerMap[aid]?.setStyle){const a=state.newsData.find(x=>String(x.article_id)===aid);const sc=a?.sentiment_label==='negative'?'#ef4444':a?.sentiment_label==='positive'?'#22c55e':'#64748b';articleMarkerMap[aid].setStyle({weight:2,color:sc})}}
  }, true);
}

// Topic color palette
const TOPIC_COLORS = {
  geopolitics:'#ef4444', conflict:'#dc2626', military_defense:'#f43f5e',
  economy_finance:'#22c55e', supply_chain:'#10b981', real_estate:'#14b8a6',
  technology:'#3b82f6', science_research:'#6366f1', space_astronomy:'#818cf8',
  elections_governance:'#a855f7', human_rights:'#d946ef', legal_justice:'#c084fc',
  climate_environment:'#84cc16', disaster_natural:'#f97316', agriculture_farming:'#65a30d',
  medicine_pharma:'#06b6d4', cybersecurity:'#f59e0b', nuclear_proliferation:'#ef4444',
  crime_organized:'#dc2626', migration_refugees:'#fb923c', general_world_news:'#94a3b8',
  startups_venture:'#8b5cf6', maritime:'#0ea5e9', education_academia:'#a78bfa',
  indigenous_peoples:'#d97706', philosophy_ethics:'#78716c', biodiversity_wildlife:'#4ade80',
};
function topicColor(topic){ return TOPIC_COLORS[topic] || '#8892a8'; }

// Fibonacci spiral positioning
function spiralPos(i, centerLat, centerLon, scale) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const r = scale * Math.sqrt(i + 1);
  const theta = (i + 1) * golden;
  return [centerLat + r * Math.cos(theta), centerLon + r * Math.sin(theta)];
}

function renderNewsMarkers(articles) {
  newsLayerGroup.clearLayers();
  const legend = document.getElementById('topic-legend');
  const zoom = map ? map.getZoom() : 2;
  const isCountryZoom = state.level.type === 'country' && zoom >= 5;

  if (isCountryZoom) {
    // === COUNTRY ZOOM: Individual article markers ===
    renderArticleMarkers(articles);
  } else {
    // === WORLD/CONTINENT/SUBREGION: Aggregate per country ===
    legend.classList.remove('visible');
    renderAggregateMarkers(articles);
  }
}

function renderAggregateMarkers(articles) {
  const byCountry = {};
  articles.forEach(a => {
    const iso = (a.country_iso || '').toUpperCase();
    if (!iso || !CC[iso]) return;
    if (!byCountry[iso]) byCountry[iso] = [];
    byCountry[iso].push(a);
  });

  Object.entries(byCountry).forEach(([iso, arts]) => {
    const coords = CC[iso], count = arts.length;
    const negC = arts.filter(a => a.sentiment_label === 'negative').length;
    const posC = arts.filter(a => a.sentiment_label === 'positive').length;
    const borderColor = negC > posC ? '#ef4444' : posC > negC ? '#22c55e' : '#94a3b8';
    const radius = Math.min(16, 5 + Math.sqrt(count) * 2);

    // Topic breakdown for popup
    const topics = {};
    arts.forEach(a => { if (a.primary_topic) topics[a.primary_topic] = (topics[a.primary_topic] || 0) + 1; });
    const topicBars = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([t, c]) => `<span style="display:inline-block;padding:1px 5px;border-radius:3px;margin:1px;font-size:8px;background:${topicColor(t)}22;color:${topicColor(t)}">${t.replace(/_/g,' ')} ${c}</span>`).join('');

    const m = L.circleMarker([coords.lat, coords.lon], { radius, fillColor: borderColor, color: '#000', weight: 1.5, fillOpacity: 0.7 });
    const topTitles = arts.slice(0, 3).map(a => {
      const sc = a.sentiment_label === 'negative' ? '#ef4444' : a.sentiment_label === 'positive' ? '#22c55e' : '#64748b';
      return `<li style="margin:3px 0;font-size:10px"><span style="color:${sc}">&#9679;</span> ${escHtml(a.title?.slice(0, 80))}</li>`;
    }).join('');

    m.bindPopup(accentPopup(borderColor,
      `<b>${isoToFlag(iso)} ${coords.name}</b> <span style="color:var(--text3)">${count} articles</span><br>
      <div style="margin:4px 0">${topicBars}</div>
      <ul style="list-style:none;padding:0;margin:4px 0">${topTitles}</ul>
      ${count > 3 ? `<span style="color:#c4b5fd;font-size:10px;cursor:pointer">Click country to explore all ${count} &rarr;</span>` : ''}`
    ), { maxWidth: 340 });
    newsLayerGroup.addLayer(m);
  });
}

function renderArticleMarkers(articles) {
  articleMarkerMap = {}; // Reset cross-reference map
  const iso = (state.level.value || '').toUpperCase();
  const center = CC[iso];
  if (!center) return;

  // Sort by relevance (highest first)
  const sorted = [...articles].sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

  // Scale for spiral based on zoom
  const zoom = map.getZoom();
  const scale = zoom >= 8 ? 0.15 : zoom >= 7 ? 0.4 : zoom >= 6 ? 0.8 : 1.2;

  // Decide marker style based on count
  const useCards = sorted.length <= 25;

  // Topic legend
  const topicCounts = {};
  sorted.forEach(a => { if (a.primary_topic) topicCounts[a.primary_topic] = (topicCounts[a.primary_topic] || 0) + 1; });
  const legendEl = document.getElementById('topic-legend');
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  legendEl.innerHTML = `<div class="topic-legend-title">Topics in ${center.name}</div>` +
    topTopics.map(([t, c]) => `<div class="topic-legend-item"><span class="topic-legend-dot" style="background:${topicColor(t)}"></span><span>${t.replace(/_/g, ' ')}</span><span class="topic-legend-count">${c}</span></div>`).join('');
  legendEl.classList.add('visible');

  sorted.forEach((a, i) => {
    const [lat, lon] = spiralPos(i, center.lat, center.lon, scale);
    const tc = topicColor(a.primary_topic);
    const relScore = parseInt(a.relevance_score) || 0;
    const ageMs = Date.now() - new Date(a.published_at).getTime();
    const isFresh = ageMs < 7200000;
    const sentColor = a.sentiment_label === 'negative' ? '#ef4444' : a.sentiment_label === 'positive' ? '#22c55e' : '#64748b';

    if (useCards) {
      // Rich card markers
      const scoreW = Math.min(100, relScore * 5);
      const scoreColor = relScore >= 10 ? '#22c55e' : relScore >= 5 ? '#3b82f6' : '#64748b';
      const freshBadge = isFresh ? '<span class="am-fresh">NEW</span>' : '';
      const timeAgo = getTimeAgo(a.published_at);

      const html = `<div class="am-card">
        <span class="am-dot" style="background:${tc}"></span>
        <div class="am-body">
          <div class="am-title">${escHtml(a.title)}</div>
          <div class="am-meta">
            <span>${escHtml(a.source_name || '')}</span>
            <span>${timeAgo}</span>
            <span class="am-score"><span class="am-score-fill" style="width:${scoreW}%;background:${scoreColor}"></span></span>
            <span class="am-sent" style="background:${sentColor}"></span>
            ${freshBadge}
          </div>
        </div>
      </div>`;

      const marker = L.marker([lat, lon], {
        icon: L.divIcon({ className: 'article-marker', html, iconSize: [260, 50], iconAnchor: [130, 25] }),
        zIndexOffset: relScore * 10
      });

      // Rich popup on click
      marker.bindPopup(buildArticlePopup(a, tc), { maxWidth: 360, className: '' });
      // When popup opens from map, highlight sidebar card
      marker.on('popupopen', () => highlightSidebarCard(a.article_id));
      newsLayerGroup.addLayer(marker);
      if (a.article_id) articleMarkerMap[String(a.article_id)] = marker;

    } else {
      // Compact dot markers for many articles
      const r = Math.max(5, Math.min(10, 4 + relScore * 0.4));
      const opacity = isFresh ? 0.95 : 0.7;
      const m = L.circleMarker([lat, lon], {
        radius: r, fillColor: tc, color: sentColor,
        weight: 2, fillOpacity: opacity
      });
      m.bindTooltip(`<div style="max-width:200px;font-size:10px"><b>${escHtml(a.title?.slice(0, 80))}</b><br><span style="color:#888">${a.source_name || ''} &middot; ${getTimeAgo(a.published_at)}</span></div>`, {
        className: 'country-tooltip', direction: 'top'
      });
      m.bindPopup(buildArticlePopup(a, tc), { maxWidth: 360 });
      m.on('popupopen', () => highlightSidebarCard(a.article_id));
      newsLayerGroup.addLayer(m);
      if (a.article_id) articleMarkerMap[String(a.article_id)] = m;
    }
  });
}

function buildArticlePopup(a, tc) {
  const sent = a.sentiment_label || 'neutral';
  const sentColor = sent === 'negative' ? '#ef4444' : sent === 'positive' ? '#22c55e' : '#94a3b8';
  const relScore = parseInt(a.relevance_score) || 0;
  const scoreColor = relScore >= 10 ? '#22c55e' : relScore >= 5 ? '#3b82f6' : '#64748b';
  const scoreBar = `<div style="display:flex;align-items:center;gap:4px;margin:4px 0"><span style="font-size:9px;color:var(--text3)">Relevance</span><div style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.min(100,relScore*5)}%;background:${scoreColor};border-radius:2px"></div></div><span style="font-size:10px;color:${scoreColor};font-weight:600">${relScore}</span></div>`;

  let html = `<div class="popup-accent" style="background:${tc}"></div>`;
  html += `<div style="margin-bottom:6px"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:${tc}22;color:${tc}">${(a.primary_topic || '').replace(/_/g, ' ')}</span>`;
  html += ` <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:${sentColor}22;color:${sentColor}">${sent}</span></div>`;
  html += `<b style="font-size:12px;line-height:1.4;display:block;margin-bottom:4px">${escHtml(a.title)}</b>`;
  html += scoreBar;
  html += `<div style="font-size:10px;color:var(--text3);margin-bottom:6px">${escHtml(a.source_name || '')} &middot; ${getTimeAgo(a.published_at)} &middot; ${a.lang || ''}</div>`;
  if (a.nlp_summary) html += `<div style="font-size:10px;color:var(--text2);line-height:1.4;margin-bottom:8px;padding:6px;background:rgba(255,255,255,0.03);border-radius:4px;border-left:2px solid ${tc}">${escHtml(a.nlp_summary)}</div>`;
  html += `<a href="${a.url}" target="_blank" rel="noopener" style="display:inline-block;padding:5px 14px;border-radius:4px;background:rgba(167,139,250,0.15);color:#c4b5fd;text-decoration:none;font-size:10px;font-weight:600">Read full article &rarr;</a>`;

  return html;
}

function escHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function getTimeAgo(d){if(!d)return'';const s=Math.round((Date.now()-new Date(d).getTime())/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`}

// ═══════════════════════════════════════════════════════════
// FRESHNESS INDICATORS — visual badge showing when data was last updated
// ═══════════════════════════════════════════════════════════
// Color-coded by age: green (<5m), amber (5-30m), red (>30m)
function freshnessBadge(timestamp, label){
  if(!timestamp) return '';
  const t = new Date(timestamp);
  if(isNaN(t.getTime())) return '';
  const ageSec = (Date.now() - t.getTime()) / 1000;
  const cls = ageSec < 300 ? 'fresh' : ageSec < 1800 ? 'warm' : 'stale';
  return `<span class="freshness-badge ${cls}" data-ts="${t.toISOString()}" title="${label||'Last updated'} ${t.toLocaleString()}">&#9679; ${getTimeAgo(timestamp)}</span>`;
}

// Update all freshness badges on the page (called by setInterval)
function refreshFreshnessBadges(){
  document.querySelectorAll('.freshness-badge[data-ts]').forEach(el => {
    const ts = el.dataset.ts;
    const ageSec = (Date.now() - new Date(ts).getTime()) / 1000;
    const newCls = ageSec < 300 ? 'fresh' : ageSec < 1800 ? 'warm' : 'stale';
    el.classList.remove('fresh','warm','stale');
    el.classList.add(newCls);
    // Update text (preserve dot)
    const txt = getTimeAgo(ts);
    el.innerHTML = `&#9679; ${txt}`;
  });
}

// Error panel helper — renders inline error with retry button
function errorPanel(title, msg, retryFn){
  const id = 'err-'+Math.random().toString(36).slice(2,8);
  const html = `<div class="panel-error">
    <div class="panel-error-title">&#9888; ${escHtml(title)}</div>
    <div class="panel-error-msg">${escHtml(msg||'')}</div>
    <button class="panel-error-retry" id="${id}">&#8634; Retry</button>
  </div>`;
  setTimeout(()=>{
    const btn = document.getElementById(id);
    if(btn && typeof retryFn==='function') btn.addEventListener('click', retryFn);
  }, 50);
  return html;
}

// Online/offline detection with banner feedback
function showConnectionBanner(text, type){
  const b = document.getElementById('connection-banner');
  if(!b) return;
  b.textContent = text;
  b.className = 'connection-banner visible ' + (type||'');
  if(type === 'online') setTimeout(() => b.className = 'connection-banner', TIMING.ONLINE_BANNER_MS);
}
let wasOffline = false;
function setupConnectionMonitor(){
  window.addEventListener('offline', () => {
    wasOffline = true;
    showConnectionBanner('⚠ You are offline — data may be stale', 'offline');
  });
  window.addEventListener('online', () => {
    if(wasOffline){
      showConnectionBanner('✓ Back online — refreshing data...', 'online');
      // Trigger refresh
      if(typeof fetchActivity === 'function') {
        Promise.all([fetchActivity(),fetchSummary(),fetchBrief(),fetchMarkets(),fetchPulse()])
          .then(()=>{ if(typeof renderIntelBrief==='function') renderIntelBrief();
                      if(typeof renderNarrativeBrief==='function') renderNarrativeBrief();
                      if(typeof renderSituationReport==='function') renderSituationReport();
                      if(typeof renderMarketsKPIs==='function') renderMarketsKPIs(); });
      }
      wasOffline = false;
    }
  });
}

// Render error in specific panel if fetch failed and no prior data
function renderErrorStates(){
  // Intel brief error
  if(dataErrors.summary && !summaryData){
    const c = document.getElementById('intel-brief');
    if(c && !c.innerHTML.trim()){
      c.innerHTML = errorPanel('Intel data unavailable', dataErrors.summary, async()=>{
        await fetchSummary();
        renderIntelBrief();
        renderErrorStates();
      });
    }
  }
  // Narrative brief error
  if(dataErrors.brief && !briefData){
    const c = document.getElementById('narrative-brief');
    if(c && !c.innerHTML.trim()){
      c.innerHTML = errorPanel('Signals unavailable', dataErrors.brief, async()=>{
        await fetchBrief();
        renderNarrativeBrief();
        renderErrorStates();
      });
    }
  }
  // Markets error
  if(dataErrors.markets && !marketsData){
    const c = document.getElementById('markets-panel');
    if(c && !c.innerHTML.trim()){
      c.innerHTML = errorPanel('Markets data unavailable', dataErrors.markets, async()=>{
        await fetchMarkets();
        renderMarketsPanel();
        renderMarketsKPIs();
        renderErrorStates();
      });
    }
  }
}

// === FILTER PANEL ===
function buildFilterPanel(){if(!geoHierarchy?.topicGroups)return;const container=document.getElementById('filter-groups');const saved=getActiveFilters();let html='';geoHierarchy.topicGroups.forEach(g=>{html+=`<div class="filter-group"><div class="filter-group-header" data-group="${g.id}"><span class="chevron">&#9660;</span> ${g.name}</div><div class="filter-group-body">`;g.topics.forEach(t=>{const isA=saved?saved.includes(t):true;if(isA)state.topics.add(t);const cls=isA?' active':'';const label=t.split(' ').map(w=>w==='and'?'&':w.charAt(0).toUpperCase()+w.slice(1)).join(' ');html+=`<button class="topic-pill${cls}" data-topic="${t}">${label}</button>`});html+='</div></div>'});container.innerHTML=html;container.querySelectorAll('.filter-group-header').forEach(h=>{h.addEventListener('click',()=>h.classList.toggle('collapsed'))});container.querySelectorAll('.topic-pill').forEach(pill=>{pill.addEventListener('click',()=>{pill.classList.toggle('active');const t=pill.dataset.topic;if(pill.classList.contains('active'))state.topics.add(t);else state.topics.delete(t);saveActiveFilters();updateStatus();refreshNews();const l=getLayout();if(l.workspace!=='custom'){l.workspace='custom';saveLayout(l);document.querySelectorAll('.sd-ws').forEach(b=>b.classList.remove('active'))}})})}

// === REGIONS TAB ===
async function buildRegionsTab(){if(!geoHierarchy)return;activityData=await fetchActivity();const container=document.getElementById('regions-tree');let html='';geoHierarchy.continents.forEach(cont=>{let ct=0;cont.subregions.forEach(sub=>{sub.countries.forEach(co=>{const act=activityData[co.iso];if(act)ct+=parseInt(act.article_count)||0})});const bc=ct>=50?'hot':'';html+=`<div class="region-continent"><div class="region-continent-header" data-cont="${cont.name}"><span class="rc-chevron">&#9660;</span><span class="rc-name">${cont.name}</span><span class="rc-badge ${bc}">${ct}</span></div><div class="region-sub-list">`;cont.subregions.forEach(sub=>{html+=`<div class="region-sub-header">${sub.name.replace(/_/g,' ')}</div>`;[...sub.countries].sort((a,b)=>{const ca=activityData[a.iso]?.article_count||0,cb=activityData[b.iso]?.article_count||0;return cb-ca||a.name.localeCompare(b.name)}).forEach(co=>{const act=activityData[co.iso];const count=act?parseInt(act.article_count):0;const cc=count>=10?'hot-news':count>0?'has-news':'';const tlr=timelineData[co.iso];const spark=tlr?.length?makeSparkline(tlr,7):'';html+=`<button class="region-country-btn" data-iso="${co.iso}"><span class="rc-iso">${isoToFlag(co.iso)}</span><span class="rc-cname">${co.name}</span>${spark}<span class="rc-count ${cc}">${count||'-'}</span></button>`})});html+='</div></div>'});container.innerHTML=html;
  container.querySelectorAll('.region-continent-header').forEach(h=>{h.addEventListener('click',()=>h.classList.toggle('collapsed'));h.addEventListener('dblclick',()=>navigateTo('continent',h.dataset.cont))});
  container.querySelectorAll('.region-country-btn').forEach(btn=>{btn.addEventListener('click',()=>navigateTo('country',btn.dataset.iso))});
  // Search
  const allC=[];for(const c of geoHierarchy.continents)for(const s of c.subregions)for(const co of s.countries)allC.push({iso:co.iso,name:co.name});
  const si=document.getElementById('region-search-input'),sr=document.getElementById('region-search-results');
  si.addEventListener('input',()=>{const q=si.value.toLowerCase().trim();if(!q||q.length<2){sr.innerHTML='';return}const matches=allC.filter(c=>c.name.toLowerCase().includes(q)||c.iso.toLowerCase()===q).slice(0,12);sr.innerHTML=matches.map(c=>{const act=activityData[c.iso];const count=act?parseInt(act.article_count):0;return`<button class="region-country-btn" data-iso="${c.iso}" style="width:100%"><span class="rc-iso">${isoToFlag(c.iso)}</span><span class="rc-cname">${c.name}</span><span class="rc-count ${count>0?'has-news':''}">${count||'-'}</span></button>`}).join('');sr.querySelectorAll('.region-country-btn').forEach(btn=>{btn.addEventListener('click',()=>{navigateTo('country',btn.dataset.iso);si.value='';sr.innerHTML=''})})})
}

// ═══════════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════════
const CMDK = {
  commands: [], // Populated on open
  idx: 0,
  open: false,
};

function buildCmdkCommands(){
  const cmds = [];
  // Quick starts (only for empty query — shown at top)
  const home = getHomeCountry();
  const homeName = home && CC[home] ? CC[home].name : '';
  cmds.push({ group:'Quick Starts', icon:'&#10024;', label:home?`What's happening in ${homeName}?`:'Set home country (Settings)', hint:'', action:()=>{if(home && CC[home]) navigateTo('country',home); else { openSettings(); toast('info','Set home country','Open Settings → My Country'); } closeCmdk();} });
  cmds.push({ group:'Quick Starts', icon:'&#128736;', label:'Today in Technology', hint:'', action:()=>{ setWorkspace('young_tech'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#9888;', label:'Wars & Conflicts today', hint:'', action:()=>{ setWorkspace('war_watcher'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#128200;', label:'Markets right now', hint:'', action:()=>{ setWorkspace('trader'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#127757;', label:'Climate & disasters', hint:'', action:()=>{ setWorkspace('climate_activist'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#127891;', label:'Elections & politics', hint:'', action:()=>{ setWorkspace('politics'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#129658;', label:'Health & outbreaks', hint:'', action:()=>{ setWorkspace('health'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#128272;', label:'Cybersecurity briefing', hint:'', action:()=>{ setWorkspace('cyber_pro'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#128640;', label:'Space exploration', hint:'', action:()=>{ setWorkspace('space'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#127806;', label:'Food & agriculture', hint:'', action:()=>{ setWorkspace('agri'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#9889;', label:'Energy & oil', hint:'', action:()=>{ setWorkspace('energy'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#9875;', label:'Maritime & shipping', hint:'', action:()=>{ setWorkspace('maritime'); closeCmdk(); } });
  cmds.push({ group:'Quick Starts', icon:'&#127968;', label:'My country news', hint:home||'', action:()=>{ setWorkspace('my_country'); closeCmdk(); } });

  // Countries
  if(geoHierarchy){
    for(const c of geoHierarchy.continents)
      for(const s of c.subregions)
        for(const co of s.countries)
          cmds.push({ group:'Countries', icon:isoToFlag(co.iso), label:co.name, hint:co.iso, action:()=>{navigateTo('country',co.iso);closeCmdk()} });
  }
  // Workspaces
  Object.keys(WORKSPACES).forEach(ws=>{
    cmds.push({ group:'Workspaces', icon:'&#9881;', label:'Workspace: '+ws.charAt(0).toUpperCase()+ws.slice(1), hint:'PRESET', action:()=>{setWorkspace(ws);toast('success','Workspace applied',ws);closeCmdk()} });
  });
  // Map layers
  document.querySelectorAll('.layer-btn').forEach(btn=>{
    const name = btn.querySelector('.layer-name')?.textContent || btn.dataset.layer;
    const isActive = btn.classList.contains('active');
    cmds.push({ group:'Layers', icon:isActive?'&#9679;':'&#9675;', label:(isActive?'Hide ':'Show ')+name, hint:btn.dataset.layer, action:()=>{btn.click();closeCmdk()} });
  });
  // Topics
  if(geoHierarchy?.topicGroups){
    geoHierarchy.topicGroups.forEach(g=>{
      g.topics.forEach(t=>{
        const isActive = state.topics.has(t);
        cmds.push({ group:'Topics', icon:isActive?'&#9679;':'&#9675;', label:(isActive?'Hide ':'Show ')+t.replace(/_/g,' '), hint:g.name, action:()=>{
          const pill = document.querySelector(`.topic-pill[data-topic="${t}"]`);
          if(pill) pill.click();
          closeCmdk();
        }});
      });
    });
  }
  // Choropleth modes
  ['risk','density','sentiment'].forEach(m=>{
    cmds.push({ group:'Map Mode', icon:'&#128506;', label:'Map: '+m.charAt(0).toUpperCase()+m.slice(1), hint:choroplethMode===m?'ACTIVE':'', action:()=>{
      choroplethMode=m;
      document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
      const cb=document.querySelector('.layer-btn[data-layer="countries"]');
      if(cb?.classList.contains('active'))load('countries');
      renderChoroplethLegend();closeCmdk();
    }});
  });
  // Global actions
  cmds.push({ group:'Actions', icon:'&#9878;', label:'Compare countries (side-by-side)', hint:'C', action:()=>{openCompare();closeCmdk()} });
  cmds.push({ group:'Actions', icon:'&#9881;', label:'Open Settings', hint:',', action:()=>{openSettings();closeCmdk()} });
  cmds.push({ group:'Actions', icon:'&#9776;', label:'Toggle Sidebar', hint:'S', action:()=>{document.getElementById('sidebar').classList.toggle('collapsed');setTimeout(()=>map.invalidateSize(),350);closeCmdk()} });
  cmds.push({ group:'Actions', icon:'N', label:'Toggle News Panel', hint:'N', action:()=>{document.getElementById('news-toggle').click();closeCmdk()} });
  cmds.push({ group:'Actions', icon:'&#128269;', label:'Focus News Search', hint:'F', action:()=>{document.getElementById('news-search')?.focus();closeCmdk()} });
  cmds.push({ group:'Actions', icon:'&#127760;', label:'Go to World View', hint:'W', action:()=>{navigateTo('world');closeCmdk()} });
  cmds.push({ group:'Actions', icon:'&#x26F6;', label:'Toggle Fullscreen', hint:'', action:()=>{document.getElementById('fullscreen-btn').click();closeCmdk()} });
  // Tabs
  [['layers','Layers'],['filters','Topics'],['regions','Regions'],['markets','Markets']].forEach(([id,name],i)=>{
    cmds.push({ group:'Tabs', icon:String(i+1), label:'Open '+name+' tab', hint:''+(i+1), action:()=>{document.querySelector(`.tab-btn[data-tab="${id}"]`)?.click();closeCmdk()} });
  });
  return cmds;
}

function fuzzyMatch(q, s){
  q = q.toLowerCase(); s = s.toLowerCase();
  if(!q) return 1;
  if(s.includes(q)) return 100 - s.indexOf(q);
  let qi=0, score=0;
  for(let i=0; i<s.length && qi<q.length; i++){
    if(s[i]===q[qi]){ score++; qi++; }
  }
  return qi===q.length ? score/q.length : 0;
}

function renderCmdkResults(query){
  const results = document.getElementById('cmdk-results');
  if(!CMDK.commands.length) CMDK.commands = buildCmdkCommands();
  const matches = query ? CMDK.commands
    .map(c => ({...c, score: fuzzyMatch(query, c.label + ' ' + (c.hint||'') + ' ' + c.group)}))
    .filter(c => c.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 40)
    : CMDK.commands.slice(0, 60);

  if(!matches.length){
    results.innerHTML = '<div class="cmdk-empty">No matches</div>';
    return;
  }
  let html = '', lastGroup = '';
  matches.forEach((m,i)=>{
    if(m.group !== lastGroup){
      html += `<div class="cmdk-group-label">${m.group}</div>`;
      lastGroup = m.group;
    }
    html += `<div class="cmdk-item${i===CMDK.idx?' active':''}" data-idx="${i}">
      <span class="cmdk-item-icon">${m.icon||''}</span>
      <span class="cmdk-item-label">${escHtml(m.label)}</span>
      <span class="cmdk-item-kbd">${m.hint||''}</span>
    </div>`;
  });
  results.innerHTML = html;
  CMDK.matches = matches;
  // Bind click
  results.querySelectorAll('.cmdk-item').forEach(el=>{
    el.addEventListener('click',()=>{
      const idx = parseInt(el.dataset.idx);
      CMDK.matches[idx]?.action();
    });
    el.addEventListener('mouseenter',()=>{
      CMDK.idx = parseInt(el.dataset.idx);
      results.querySelectorAll('.cmdk-item').forEach(e=>e.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

function openCmdk(){
  CMDK.commands = buildCmdkCommands();
  CMDK.idx = 0;
  document.getElementById('cmdk-overlay').classList.add('open');
  document.getElementById('cmdk-input').value = '';
  document.getElementById('cmdk-input').focus();
  renderCmdkResults('');
  CMDK.open = true;
}
function closeCmdk(){
  document.getElementById('cmdk-overlay').classList.remove('open');
  CMDK.open = false;
}

// ═══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
function toast(type, title, msg, duration){
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  const icons = { info:'&#9432;', warn:'&#9888;', alert:'&#9940;', success:'&#10004;' };
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="toast-icon">${icons[type]||icons.info}</span>
    <div class="toast-body"><div class="toast-title">${escHtml(title)}</div><div class="toast-msg">${escHtml(msg||'')}</div></div>
    <button class="toast-close">&times;</button>`;
  container.appendChild(el);
  const remove = ()=>{ el.classList.add('leaving'); setTimeout(()=>el.remove(), 250); };
  el.querySelector('.toast-close').addEventListener('click', remove);
  setTimeout(remove, duration||TIMING.TOAST_DEFAULT_MS);
}

// ═══════════════════════════════════════════════════════════
// WATCHLIST
// ═══════════════════════════════════════════════════════════
const WATCH_KEY = 'wm_watchlist_v1';
function getWatchlist(){ try { return JSON.parse(localStorage.getItem(WATCH_KEY)||'{"countries":[],"topics":[],"symbols":[]}') } catch { return {countries:[],topics:[],symbols:[]} } }
function saveWatchlist(w){ localStorage.setItem(WATCH_KEY, JSON.stringify(w)); }
function isWatched(type, val){ const w=getWatchlist(); return (w[type+'s']||[]).includes(val); }
function toggleWatch(type, val){
  const w = getWatchlist();
  const key = type+'s';
  if(!w[key]) w[key]=[];
  const idx = w[key].indexOf(val);
  if(idx>=0){ w[key].splice(idx,1); toast('info','Unwatched',`Removed ${val} from watchlist`); }
  else { w[key].push(val); toast('success','Watched',`Added ${val} to watchlist`); }
  saveWatchlist(w);
  renderWatchlistPanel();
}

function renderWatchlistPanel(){
  const el = document.getElementById('watchlist-panel');
  if(!el) return;
  const w = getWatchlist();
  const total = (w.countries?.length||0) + (w.topics?.length||0) + (w.symbols?.length||0);
  if(total === 0){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  let html = '<div class="watchlist-header">&#9733; Watchlist (' + total + ')</div><div class="watchlist-items">';
  (w.countries||[]).forEach(iso=>{
    const name = CC[iso]?.name || iso;
    html += `<span class="watchlist-chip" data-watch-country="${iso}">${isoToFlag(iso)} ${escHtml(name)} <span class="watchlist-chip-x" data-watch-remove-country="${iso}">&times;</span></span>`;
  });
  (w.topics||[]).forEach(t=>{
    html += `<span class="watchlist-chip" data-watch-topic="${t}">#${escHtml(t.replace(/_/g,' '))} <span class="watchlist-chip-x" data-watch-remove-topic="${t}">&times;</span></span>`;
  });
  (w.symbols||[]).forEach(s=>{
    html += `<span class="watchlist-chip" data-watch-symbol="${s}">$${escHtml(s)} <span class="watchlist-chip-x" data-watch-remove-symbol="${s}">&times;</span></span>`;
  });
  html += '</div>';
  el.innerHTML = html;
  // Bind clicks
  el.querySelectorAll('[data-watch-country]').forEach(chip=>{
    chip.addEventListener('click',e=>{
      if(e.target.classList.contains('watchlist-chip-x'))return;
      navigateTo('country', chip.dataset.watchCountry);
    });
  });
  el.querySelectorAll('[data-watch-remove-country]').forEach(x=>x.addEventListener('click',e=>{e.stopPropagation();toggleWatch('country',x.dataset.watchRemoveCountry)}));
  el.querySelectorAll('[data-watch-remove-topic]').forEach(x=>x.addEventListener('click',e=>{e.stopPropagation();toggleWatch('topic',x.dataset.watchRemoveTopic)}));
  el.querySelectorAll('[data-watch-remove-symbol]').forEach(x=>x.addEventListener('click',e=>{e.stopPropagation();toggleWatch('symbol',x.dataset.watchRemoveSymbol)}));
}

// ═══════════════════════════════════════════════════════════
// GLOBAL SITUATION REPORT
// ═══════════════════════════════════════════════════════════
function renderSituationReport(){
  const el = document.getElementById('situation-report');
  if(!el) return;
  const critical = briefData?.focal_points?.filter(f => f.urgency === 'critical') || [];
  const convergence = briefData?.convergence_zones || [];
  const alerts = countryMapData?.alerts || [];
  const spikes = briefData?.topic_spikes || [];

  if(critical.length === 0 && convergence.length === 0 && alerts.length === 0){
    el.className = 'situation-report calm';
    el.innerHTML = `<div class="sr-label">Global Status <span class="sr-fresh">${freshnessBadge(dataFreshness.brief||dataFreshness.summary,'Situation')}</span></div>
      <div class="sr-headline">No critical situations detected</div>
      <div class="sr-subline">Monitoring ${countryMapData?.scores?.length||0} countries · ${briefData?.focal_points?.length||0} focal points tracked</div>`;
    return;
  }

  el.className = 'situation-report';
  const urgency = critical.length >= 4 ? 'ESCALATING' : critical.length >= 2 ? 'ACTIVE' : 'ELEVATED';
  const entities = critical.slice(0,6).map(f=>({id:f.entity_id,name:f.display_name,mentions:f.news_mentions}));
  const regions = convergence.map(z=>z.region);
  const topSpike = spikes[0];

  let headline;
  if(regions.length >= 2) headline = `Multi-region convergence: ${regions.join(' · ')}`;
  else if(critical.length >= 3) headline = `${critical.length} critical focal points active`;
  else if(alerts.length >= 3) headline = `${alerts.length} volume spikes detected across regions`;
  else if(critical.length) headline = `Critical focus: ${critical[0].display_name}`;
  else headline = `${alerts.length} active alerts`;

  const subparts = [];
  if(alerts.length) subparts.push(`${alerts.length} volume spike${alerts.length>1?'s':''}`);
  if(topSpike) subparts.push(`"${topSpike.topic.replace(/_/g,' ')}" ${parseInt(topSpike.velocity)}x velocity`);
  if(convergence.length) subparts.push(`${convergence.length} convergence zone${convergence.length>1?'s':''}`);

  let html = `<div class="sr-label">${urgency} · Situation Report <span class="sr-fresh">${freshnessBadge(dataFreshness.brief||dataFreshness.summary,'Situation')}</span></div>
    <div class="sr-headline">${escHtml(headline)}</div>
    <div class="sr-subline">${subparts.join(' · ')}</div>`;
  if(entities.length){
    html += '<div class="sr-entities">';
    entities.forEach(e=>{
      html += `<span class="sr-entity" data-iso="${e.id}">${isoToFlag(e.id)} ${escHtml(e.name)} <b>${e.mentions}m</b></span>`;
    });
    html += '</div>';
  }
  el.innerHTML = html;
  el.querySelectorAll('.sr-entity').forEach(en=>{
    en.addEventListener('click',()=>{ const iso=en.dataset.iso; if(iso&&CC[iso])navigateTo('country',iso) });
  });
}

// ═══════════════════════════════════════════════════════════
// ALERT RULES
// ═══════════════════════════════════════════════════════════
const ALERTS_KEY = 'wm_alert_rules_v1';
const FIRED_KEY = 'wm_alerts_fired_v1'; // dedup within session
function getAlertRules(){ try { return JSON.parse(localStorage.getItem(ALERTS_KEY)||'[]') } catch { return [] } }
function saveAlertRules(r){ localStorage.setItem(ALERTS_KEY, JSON.stringify(r)); }

function checkAlerts(){
  const rules = getAlertRules();
  if(!rules.length) return;
  const fired = JSON.parse(sessionStorage.getItem(FIRED_KEY)||'{}');
  rules.forEach(rule=>{
    let currentValue = null, label = '';
    if(rule.type === 'vix' && marketsData?.kpis?.vix){ currentValue = parseFloat(marketsData.kpis.vix.value); label='VIX'; }
    else if(rule.type === 'country_risk' && rule.target){
      const sc = countryMapData?.scores?.find(s => (s.code||'').toUpperCase() === rule.target);
      if(sc){ currentValue = parseFloat(sc.score); label = (CC[rule.target]?.name||rule.target)+' risk'; }
    }
    else if(rule.type === 'topic_velocity' && rule.target){
      const sp = briefData?.topic_spikes?.find(s => s.topic === rule.target);
      if(sp){ currentValue = parseFloat(sp.velocity); label = rule.target.replace(/_/g,' ')+' velocity'; }
    }
    else if(rule.type === 'focal_score' && rule.target){
      const fp = briefData?.focal_points?.find(f => (f.entity_id||'').toUpperCase() === rule.target);
      if(fp){ currentValue = parseFloat(fp.focal_score); label = (CC[rule.target]?.name||rule.target)+' focal score'; }
    }
    if(currentValue === null || isNaN(currentValue)) return;
    const threshold = parseFloat(rule.threshold);
    const trigger = rule.op === '>' ? currentValue > threshold : rule.op === '<' ? currentValue < threshold : false;
    if(trigger){
      const fireKey = `${rule.type}:${rule.target||''}:${rule.op}:${rule.threshold}`;
      if(!fired[fireKey]){
        fired[fireKey] = Date.now();
        sessionStorage.setItem(FIRED_KEY, JSON.stringify(fired));
        toast('alert', 'Alert: '+label, `${currentValue.toFixed(2)} ${rule.op} ${threshold}`, 10000);
      }
    } else {
      // Clear fired flag when condition no longer met (re-arm)
      const fireKey = `${rule.type}:${rule.target||''}:${rule.op}:${rule.threshold}`;
      if(fired[fireKey]){ delete fired[fireKey]; sessionStorage.setItem(FIRED_KEY, JSON.stringify(fired)); }
    }
  });
}

function renderAlertRulesUI(){
  const container = document.getElementById('sd-alerts-list');
  if(!container) return;
  const rules = getAlertRules();
  let html = '';
  rules.forEach((r,i)=>{
    const targetOpts = r.type==='country_risk' || r.type==='focal_score' ?
      `<input type="text" value="${r.target||''}" placeholder="ISO (US/CN...)" data-alert-field="target" data-alert-idx="${i}" style="width:80px">` :
      r.type==='topic_velocity' ?
      `<input type="text" value="${r.target||''}" placeholder="topic" data-alert-field="target" data-alert-idx="${i}" style="width:80px">` : '';
    html += `<div class="sd-alert-rule">
      <select data-alert-field="type" data-alert-idx="${i}">
        <option value="vix" ${r.type==='vix'?'selected':''}>VIX</option>
        <option value="country_risk" ${r.type==='country_risk'?'selected':''}>Country Risk</option>
        <option value="topic_velocity" ${r.type==='topic_velocity'?'selected':''}>Topic Velocity</option>
        <option value="focal_score" ${r.type==='focal_score'?'selected':''}>Focal Score</option>
      </select>
      ${targetOpts}
      <select data-alert-field="op" data-alert-idx="${i}">
        <option value=">" ${r.op==='>'?'selected':''}>&gt;</option>
        <option value="<" ${r.op==='<'?'selected':''}>&lt;</option>
      </select>
      <input type="number" value="${r.threshold||''}" step="0.1" data-alert-field="threshold" data-alert-idx="${i}">
      <button class="sd-alert-del" data-alert-del="${i}">&times;</button>
    </div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('[data-alert-field]').forEach(inp=>{
    inp.addEventListener('change',()=>{
      const idx = parseInt(inp.dataset.alertIdx);
      const field = inp.dataset.alertField;
      const rules = getAlertRules();
      if(rules[idx]){
        rules[idx][field] = field==='target' ? inp.value.toUpperCase().trim() : inp.value;
        saveAlertRules(rules);
        renderAlertRulesUI();
      }
    });
  });
  container.querySelectorAll('[data-alert-del]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const idx = parseInt(btn.dataset.alertDel);
      const rules = getAlertRules();
      rules.splice(idx,1);
      saveAlertRules(rules);
      renderAlertRulesUI();
    });
  });
}

// === INIT ===
async function init() {
  map = L.map('map', { center:[20,15], zoom:2, minZoom:2, maxZoom:16, zoomControl:true, preferCanvas:true, zoomSnap:0.25, zoomDelta:0.5, wheelPxPerZoomLevel:100, updateWhenZooming:false, updateWhenIdle:true });
  tiles[state.tile].addTo(map);
  newsLayerGroup.addTo(map);
  spikeLayerGroup.addTo(map);
  convergenceLayerGroup.addTo(map);
  map.on('mousemove', e => { document.getElementById('coords').textContent = `${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)}`; });
  map.on('moveend', onMapMove);
  Object.entries(LD).forEach(([k, d]) => { d.g = d.cluster ? mkCluster(d.c) : L.layerGroup(); });

  // Load all base data in parallel
  try {
    const [hierResp, actData, summ, cmpData, tlData, pulseRes, mkts, brief, sparks] = await Promise.all([
      fetch('/api/wm/geo-hierarchy', {credentials:'same-origin'}).then(r=>r.json()),
      fetchActivity(),
      fetchSummary(),
      fetchCountryMapData(),
      fetchTimeline(),
      fetchPulse(),
      fetchMarkets(),
      fetchBrief(),
      fetchSparklines()
    ]);
    geoHierarchy = hierResp; activityData = actData;
    for (const c of geoHierarchy.continents) for (const s of c.subregions) for (const co of s.countries) CC[co.iso] = { lat:co.lat, lon:co.lon, name:co.name };
    buildFilterPanel();
    buildRegionsTab();
    renderIntelBrief();
    renderNarrativeBrief();
    renderPulseStrip();
    renderMarketsKPIs();
    renderFearGreedGauge();
    renderMarketsTicker();
    renderMarketsPanel();
    renderPredictionOverlay();
    renderConvergenceZones();
    renderConnectionLines();
    // Feed count in status bar
    try { const ns = await getWm('/news/summary'); document.getElementById('feed-count').textContent = `${ns.feed_health?.active_feeds||'-'}/${ns.feed_health?.total_feeds||'-'}`; } catch {}
    document.getElementById('alerts-count').textContent = countryMapData?.alerts?.length || 0;
    renderChoroplethLegend();
    renderSituationReport();
    renderWatchlistPanel();
    checkAlerts();
  } catch (e) { console.error('Failed to load base data:', e); toast('alert', 'Connection issue', 'Some data failed to load. Check your connection.', 8000); }

  // Restore layers
  const al = getActiveLayers();
  document.querySelectorAll('.layer-btn').forEach(btn => { const ly=btn.dataset.layer; if(al.includes(ly)){btn.classList.add('active');LD[ly].g.addTo(map)}else btn.classList.remove('active') });

  // Layer toggles
  document.querySelectorAll('.layer-btn').forEach(btn => { btn.addEventListener('click', () => { const ly=btn.dataset.layer; btn.classList.toggle('active'); if(btn.classList.contains('active')){LD[ly].g.addTo(map);load(ly)}else{map.removeLayer(LD[ly].g);LD[ly].n=0;updateCount(ly)} saveActiveLayers(); if(ly==='countries')renderChoroplethLegend() }) });

  // Presets
  document.querySelectorAll('.preset-btn[data-preset]').forEach(btn=>{btn.addEventListener('click',()=>{const p=btn.dataset.preset,t={military:['mil-flights','mil-vessels','bases'],intel:['hotspots','events','countries','outages'],alloff:[]},set=new Set(t[p]||[]);document.querySelectorAll('.layer-btn').forEach(b=>{const ly=b.dataset.layer;if(p==='alloff'){b.classList.remove('active');if(map.hasLayer(LD[ly].g))map.removeLayer(LD[ly].g);LD[ly].n=0;updateCount(ly)}else if(set.has(ly)&&!b.classList.contains('active')){b.classList.add('active');LD[ly].g.addTo(map);load(ly)}});saveActiveLayers()})});

  // Filter presets
  document.querySelectorAll('.preset-btn[data-fpreset]').forEach(btn=>{btn.addEventListener('click',()=>{const p=btn.dataset.fpreset;document.querySelectorAll('.topic-pill').forEach(pill=>{const t=pill.dataset.topic;if(p==='all'){pill.classList.add('active');state.topics.add(t)}else if(p==='clear'){pill.classList.remove('active');state.topics.delete(t)}else if(p==='intel'){const it=new Set();if(geoHierarchy?.topicGroups)geoHierarchy.topicGroups.forEach(g=>{if(g.default)g.topics.forEach(t=>it.add(t))});if(it.has(t)){pill.classList.add('active');state.topics.add(t)}else{pill.classList.remove('active');state.topics.delete(t)}}});saveActiveFilters();updateStatus();refreshNews()})});

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));btn.classList.add('active');document.getElementById('tab-'+btn.dataset.tab).classList.add('active')})});

  // Tile switcher
  document.querySelectorAll('.tile-btn').forEach(btn=>{btn.addEventListener('click',()=>{const t=btn.dataset.tile;if(t===state.tile)return;map.removeLayer(tiles[state.tile]);tiles[t].addTo(map);state.tile=t;document.querySelectorAll('.tile-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active')})});

  // News view toggle
  document.querySelectorAll('.news-view-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.news-view-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.newsView=btn.dataset.view;refreshNews()})});

  // Search bar
  // News search with fuzzy suggestions dropdown
  const searchInput = document.getElementById('news-search');
  const suggestionsEl = document.getElementById('search-suggestions');
  let suggestTimer = null;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchDebounce);
    clearTimeout(suggestTimer);
    const val = e.target.value.trim();
    // Show suggestions as user types (short debounce)
    if(val.length >= 2){
      suggestTimer = setTimeout(async () => {
        try {
          const r = await fetch(`${WM_API}/search/suggest?q=${encodeURIComponent(val)}`, {credentials:'same-origin'});
          if(!r.ok) return;
          const j = await r.json();
          if(!j.data?.length){ suggestionsEl.classList.remove('open'); return; }
          suggestionsEl.innerHTML = j.data.slice(0,10).map((s,i) => {
            const icon = s.type === 'trending' ? '&#128293;' : '&#128240;';
            const countHtml = s.count ? ` <span class="sg-count">${s.count}</span>` : '';
            return `<div class="sg-item" data-value="${escHtml(s.value)}" data-idx="${i}">
              <span class="sg-icon">${icon}</span>
              <span class="sg-text">${escHtml(s.value)}</span>${countHtml}
            </div>`;
          }).join('');
          suggestionsEl.classList.add('open');
          suggestionsEl.querySelectorAll('.sg-item').forEach(it => {
            it.addEventListener('click', () => {
              searchInput.value = it.dataset.value;
              newsSearchTerm = it.dataset.value;
              suggestionsEl.classList.remove('open');
              refreshNews().then(()=>{const nl=document.getElementById('news-list');if(nl)nl.scrollTop=0});
            });
          });
        } catch {}
      }, 200);
    } else {
      suggestionsEl.classList.remove('open');
    }
    // Trigger actual search after longer debounce
    searchDebounce = setTimeout(() => {
      newsSearchTerm = val;
      refreshNews().then(() => { const nl=document.getElementById('news-list'); if(nl)nl.scrollTop=0 });
    }, 400);
  });
  // Close suggestions on blur (with delay to allow click)
  searchInput.addEventListener('blur', () => setTimeout(()=> suggestionsEl.classList.remove('open'), 150));
  searchInput.addEventListener('focus', () => {
    if(searchInput.value.trim().length >= 2 && suggestionsEl.innerHTML.trim())
      suggestionsEl.classList.add('open');
  });
  searchInput.addEventListener('keydown', e => {
    if(e.key === 'Escape') { suggestionsEl.classList.remove('open'); searchInput.blur(); }
    if(e.key === 'Enter') { suggestionsEl.classList.remove('open'); }
  });

  // Time range pills
  document.querySelectorAll('.time-pill').forEach(btn=>{btn.addEventListener('click',()=>{
    document.querySelectorAll('.time-pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    newsHours=parseInt(btn.dataset.hours);
    refreshNews();
  })});

  // Sort pills
  document.querySelectorAll('#sort-pills .time-pill').forEach(btn=>{btn.addEventListener('click',()=>{
    document.querySelectorAll('#sort-pills .time-pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');newsSort=btn.dataset.sort;
    if(state.newsData.length)renderNews(state.newsData);
  })});

  // Intel brief toggle
  document.getElementById('intel-toggle').addEventListener('click', () => {
    const el = document.getElementById('intel-toggle');
    const brief = document.getElementById('intel-brief');
    el.classList.toggle('collapsed');
    state.intelOpen = !el.classList.contains('collapsed');
    brief.classList.toggle('open', state.intelOpen);
  });
  // Start open
  document.getElementById('intel-brief').classList.add('open');

  // Narrative brief toggle (Signals & Analysis)
  document.getElementById('narrative-toggle').addEventListener('click', () => {
    const el = document.getElementById('narrative-toggle');
    const nb = document.getElementById('narrative-brief');
    el.classList.toggle('collapsed');
    nb.classList.toggle('open', !el.classList.contains('collapsed'));
  });
  document.getElementById('narrative-brief').classList.add('open');

  // Choropleth mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      choroplethMode = btn.dataset.mode;
      const countryBtn = document.querySelector('.layer-btn[data-layer="countries"]');
      if (countryBtn?.classList.contains('active')) load('countries');
      renderChoroplethLegend();
    });
  });
  document.getElementById('mode-risk').classList.add('active');

  // Sidebar + news toggles
  document.getElementById('sidebar-toggle').addEventListener('click',()=>{document.getElementById('sidebar').classList.toggle('collapsed');setTimeout(()=>map.invalidateSize(),350)});
  document.getElementById('menu-btn').addEventListener('click',()=>{document.getElementById('sidebar').classList.toggle('collapsed');setTimeout(()=>map.invalidateSize(),350)});
  document.getElementById('news-toggle').addEventListener('click',()=>{const p=document.getElementById('news-panel'),b=document.getElementById('news-toggle');p.classList.toggle('hidden');b.classList.toggle('active');state.newsPanelOpen=!p.classList.contains('hidden');document.getElementById('main-area').classList.toggle('news-panel-open',state.newsPanelOpen);setTimeout(()=>map.invalidateSize(),350)});
  document.getElementById('fullscreen-btn').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen()});
  document.getElementById('main-area').classList.add('news-panel-open');

  updateBreadcrumb(); updateDrillLevelStatus();
  const lp=[];document.querySelectorAll('.layer-btn.active').forEach(b=>lp.push(load(b.dataset.layer)));await Promise.allSettled(lp);updateStatus();
  refreshNews();

  // === SETTINGS DRAWER ===
  const sdOverlay = document.getElementById('settings-overlay');
  const sdDrawer = document.getElementById('settings-drawer');
  function openSettings(){ sdOverlay.classList.add('open'); sdDrawer.classList.add('open'); }
  function closeSettings(){ sdOverlay.classList.remove('open'); sdDrawer.classList.remove('open'); }
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  sdOverlay.addEventListener('click', closeSettings);
  // Workspace presets
  document.querySelectorAll('.sd-ws').forEach(btn=>{
    btn.addEventListener('click', ()=> setWorkspace(btn.dataset.ws));
  });
  // Density
  document.querySelectorAll('.sd-d').forEach(btn=>{
    btn.addEventListener('click', ()=> setDensity(btn.dataset.density));
  });
  // Section toggles
  document.querySelectorAll('.sd-toggle input[type="checkbox"]').forEach(cb=>{
    cb.addEventListener('change', ()=> setToggle(cb.dataset.toggle, cb.checked));
  });
  // Reset
  document.getElementById('sd-reset').addEventListener('click', ()=>{
    localStorage.removeItem(LAYOUT_KEY);
    applyLayout(DEFAULT_LAYOUT);
  });
  // Apply saved layout on init
  applyLayout(getLayout());
  applyA11y(getA11y());

  // === HOME COUNTRY ===
  let homeIso = getHomeCountry() || detectHomeCountry();
  if(homeIso){
    // Only set if actually exists in our data (wait for geoHierarchy to be ready)
    setTimeout(()=>{
      if(CC[homeIso]) setHomeCountry(homeIso);
    }, 1000);
  }
  document.getElementById('home-btn').addEventListener('click', ()=>{
    const h = getHomeCountry();
    if(h && CC[h]) navigateTo('country', h);
    else toast('info','No home country','Set one in Settings &rarr; My Country');
  });
  document.getElementById('sd-home-country').addEventListener('change', e=>{
    setHomeCountry(e.target.value);
    toast('success','Home country updated', e.target.value.toUpperCase());
  });

  // === ACCESSIBILITY ===
  document.querySelectorAll('.sd-fs').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const a = getA11y(); a.fontSize = parseInt(btn.dataset.fs); saveA11y(a); applyA11y(a);
    });
  });
  document.querySelectorAll('.sd-cb').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const a = getA11y(); a.colorblind = btn.dataset.cb; saveA11y(a); applyA11y(a);
    });
  });
  // Dyslexia font + calm mode toggles (special handling for a11y-related toggles)
  const origSetToggle = setToggle;
  document.querySelectorAll('.sd-toggle input[type="checkbox"]').forEach(cb=>{
    if(cb.dataset.toggle === 'dyslexia-font'){
      cb.addEventListener('change',()=>{ const a = getA11y(); a.dyslexiaFont = cb.checked; saveA11y(a); applyA11y(a); });
    } else if(cb.dataset.toggle === 'calm-mode'){
      cb.addEventListener('change',()=>{ const a = getA11y(); a.calmMode = cb.checked; saveA11y(a); applyA11y(a); });
    }
  });

  // === SHARE URL ===
  document.getElementById('sd-share-btn').addEventListener('click', ()=>{
    const url = buildShareUrl();
    navigator.clipboard.writeText(url).then(()=>{
      toast('success','Permalink copied', url.length > 80 ? url.slice(0,80)+'...' : url);
    }).catch(()=>{
      prompt('Copy this URL:', url);
    });
  });

  // === ONBOARDING ===
  document.getElementById('sd-show-onboard').addEventListener('click', ()=>{ closeSettings(); openOnboarding(); });
  document.getElementById('onboard-skip').addEventListener('click', closeOnboarding);
  document.getElementById('onboard-overlay').addEventListener('click', e=>{
    if(e.target.id === 'onboard-overlay') closeOnboarding();
  });

  // === COUNTRY COMPARISON ===
  document.getElementById('compare-close')?.addEventListener('click', closeCompare);
  document.getElementById('compare-overlay')?.addEventListener('click', e => {
    if(e.target.id === 'compare-overlay') closeCompare();
  });
  const cmpInput = document.getElementById('compare-input');
  const cmpResults = document.getElementById('compare-picker-results');
  let cmpTimer = null;
  cmpInput?.addEventListener('input', () => {
    clearTimeout(cmpTimer);
    cmpTimer = setTimeout(() => {
      const q = cmpInput.value.toLowerCase().trim();
      if(!q || q.length < 2){ cmpResults.innerHTML = ''; return; }
      // Search countries in CC
      const matches = Object.entries(CC)
        .filter(([iso, info]) => info.name.toLowerCase().includes(q) || iso.toLowerCase() === q)
        .slice(0, 10);
      cmpResults.innerHTML = matches.map(([iso, info]) => `<button class="compare-result" data-iso="${iso}">
        <span>${isoToFlag(iso)}</span>
        <span>${escHtml(info.name)}</span>
        <span class="compare-result-iso">${iso}</span>
      </button>`).join('');
      cmpResults.querySelectorAll('[data-iso]').forEach(b => b.addEventListener('click', () => {
        addCompareCountry(b.dataset.iso);
        cmpInput.value = '';
        cmpResults.innerHTML = '';
      }));
    }, 200);
  });

  // === ARTICLE READER ===
  document.getElementById('reader-close').addEventListener('click', closeReader);
  document.getElementById('reader-overlay').addEventListener('click', e=>{
    if(e.target.id === 'reader-overlay') closeReader();
  });

  // === COMMAND PALETTE ===
  document.getElementById('cmdk-overlay').addEventListener('click', e=>{
    if(e.target.id === 'cmdk-overlay') closeCmdk();
  });
  document.getElementById('cmdk-input').addEventListener('input', e=>{
    CMDK.idx = 0;
    renderCmdkResults(e.target.value);
  });

  // === ALERT RULES ===
  document.getElementById('sd-alert-add').addEventListener('click',()=>{
    const rules = getAlertRules();
    rules.push({ type:'vix', op:'>', threshold:25 });
    saveAlertRules(rules);
    renderAlertRulesUI();
  });
  renderAlertRulesUI();

  // === SITUATION REPORT + WATCHLIST initial render ===
  renderSituationReport();
  renderWatchlistPanel();

  // Check alerts on load and whenever data refreshes
  checkAlerts();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Command palette — Cmd+K / Ctrl+K / slash — works even in inputs
    if((e.key==='k' && (e.metaKey||e.ctrlKey)) || (e.key==='/' && e.target.tagName!=='INPUT' && e.target.tagName!=='TEXTAREA')){
      e.preventDefault();
      CMDK.open ? closeCmdk() : openCmdk();
      return;
    }
    // Command palette navigation
    if(CMDK.open){
      if(e.key==='Escape'){ e.preventDefault(); closeCmdk(); return; }
      if(e.key==='ArrowDown'){ e.preventDefault(); CMDK.idx = Math.min((CMDK.matches||[]).length-1, CMDK.idx+1); renderCmdkResults(document.getElementById('cmdk-input').value); document.querySelector('.cmdk-item.active')?.scrollIntoView({block:'nearest'}); return; }
      if(e.key==='ArrowUp'){ e.preventDefault(); CMDK.idx = Math.max(0, CMDK.idx-1); renderCmdkResults(document.getElementById('cmdk-input').value); document.querySelector('.cmdk-item.active')?.scrollIntoView({block:'nearest'}); return; }
      if(e.key==='Enter'){ e.preventDefault(); CMDK.matches?.[CMDK.idx]?.action(); return; }
      return; // Don't fall through to global shortcuts
    }
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    const key = e.key.toLowerCase();
    if(key==='s' && !e.ctrlKey && !e.metaKey){ // Toggle sidebar
      document.getElementById('sidebar').classList.toggle('collapsed');
      setTimeout(()=>map.invalidateSize(),350);
    } else if(key==='n' && !e.ctrlKey && !e.metaKey){ // Toggle news
      document.getElementById('news-toggle').click();
    } else if(key==='f' && !e.ctrlKey && !e.metaKey){ // Focus search
      e.preventDefault();
      document.getElementById('news-search').focus();
    } else if(key==='escape'){
      if(document.activeElement.tagName==='INPUT') document.activeElement.blur();
      else if(document.getElementById('reader-overlay').classList.contains('open')) closeReader();
      else if(state.countryDetail) hideCountryDetail();
    } else if(key==='c' && !e.ctrlKey && !e.metaKey){ // Compare countries
      openCompare();
    } else if(key==='w' && !e.ctrlKey){ // World view
      navigateTo('world');
    } else if(key==='1') { // Tab: Layers
      document.querySelector('.tab-btn[data-tab="layers"]')?.click();
    } else if(key==='2') { // Tab: Filters
      document.querySelector('.tab-btn[data-tab="filters"]')?.click();
    } else if(key==='3') { // Tab: Regions
      document.querySelector('.tab-btn[data-tab="regions"]')?.click();
    } else if(key==='4') { // Tab: Markets
      document.querySelector('.tab-btn[data-tab="markets"]')?.click();
    } else if(key===',' || key==='?') { // Open settings
      e.preventDefault();
      sdDrawer.classList.contains('open') ? closeSettings() : openSettings();
    }
  });

  // === APPLY URL STATE (permalink) ===
  const urlApplied = applyUrlState();

  // === FIRST-VISIT ONBOARDING ===
  if(!localStorage.getItem(ONBOARD_KEY) && !urlApplied){
    setTimeout(()=>openOnboarding(), 700);
  }

  // Add keyboard shortcut H for home
  document.addEventListener('keydown', e => {
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    if(CMDK.open) return;
    if(e.key.toLowerCase()==='h' && !e.ctrlKey && !e.metaKey){
      const h = getHomeCountry();
      if(h && CC[h]) navigateTo('country', h);
    }
  });

  // Auto-refresh
  setInterval(()=>{document.querySelectorAll('.layer-btn.active').forEach(b=>{const ly=b.dataset.layer;if(!LD[ly].static)load(ly)})}, TIMING.LAYER_REFRESH);
  setInterval(()=>refreshNews(), TIMING.NEWS_REFRESH);
  setInterval(async()=>{activityData=await fetchActivity();summaryData=await fetchSummary().catch(()=>summaryData);if(countryMapData)await fetchCountryMapData();await fetchTimeline();await fetchPulse();await fetchMarkets();await fetchBrief();await fetchSparklines();renderIntelBrief();renderNarrativeBrief();renderPulseStrip();renderMarketsKPIs();renderFearGreedGauge();renderMarketsTicker();renderMarketsPanel();renderPredictionOverlay();renderConvergenceZones();renderConnectionLines();buildRegionsTab();renderSituationReport();renderWatchlistPanel();checkAlerts();renderErrorStates()}, TIMING.FULL_REFRESH);

  // Freshness badges tick (updates "X min ago" text)
  setInterval(refreshFreshnessBadges, TIMING.FRESHNESS_TICK);
  // Connection monitor
  setupConnectionMonitor();
  // Initial error states
  renderErrorStates();
}

init().catch(e => console.error('Init failed:', e));
})();
