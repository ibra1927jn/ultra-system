/* Money Cockpit — P3 Finanzas v2
 * Single IIFE. Cookie auth (relies on requireAuth middleware).
 * Surfaces 30+ endpoints from /api/finances/*.
 */
(function(){
'use strict';

var CFG = {
  RUNWAY_INFINITE_DAYS: 999,
  BUDGET_WARN_PCT: 80, BUDGET_DANGER_PCT: 100,
  ES_FOREIGN_THRESHOLD_EUR: 50000, NZ_FIF_DEMINIMIS_NZD: 50000,
  RECURRING_LOOKBACK_DAYS: 365, RECURRING_MIN_SAMPLES: 3,
  RISK_FREE_RATE: 0.04,
  SPARK_W: 400, SPARK_H: 120, SPARK_PAD: 10,
  TX_FEED_DEFAULT_LIMIT: 50,
  CARRYOVER_MONTHS_BACK: 6,
  TOAST_MS: 3500,
};
var WORKSPACES = {
  default:        { panels:'all',                                                              range:90 },
  monthly_close:  { panels:['budget','recurring','tx-add','tx-feed','goals','by-category','alerts'],     range:30 },
  tax_es:         { panels:['tax','providers','investments','crypto','alerts'],                range:365, taxTab:'es' },
  tax_nz:         { panels:['tax','providers','investments','alerts'],                         range:365, taxTab:'nz' },
  crypto_quarter: { panels:['crypto','investments','nw-timeline','fx','alerts'],               range:90 },
  travel_burn:    { panels:['budget','fx','recurring','goals','tx-feed','by-account','alerts'], range:30 },
};
// Maps panel-id (data-panel attr) → loader function name. Keeps refreshAll workspace-aware.
var PANEL_LOADERS = {
  'nw-timeline':loadNW, 'by-account':loadKPIs, 'tx-feed':loadTxFeed, 'providers':loadProviders, 'fx':loadFX,
  'budget':loadBudget, 'recurring':loadRecurring, 'by-category':loadByCategory,
  'investments':loadInvestments, 'crypto':loadCrypto, 'goals':loadGoals,
  'alerts':loadAlerts,
};
var CATEGORY_HINTS = ['rent','groceries','transport','eating_out','subscriptions','utilities','travel','entertainment','health','salary','freelance','other'];

function $(id){return document.getElementById(id)}
function $$(sel,root){return Array.from((root||document).querySelectorAll(sel))}
// Pure formatters live in money-utils.js (window.MoneyUtils), shared with Node tests.
var U = window.MoneyUtils;
var esc = U.esc, fmt = U.fmt, fmtPct = U.fmtPct, dateOnly = U.dateOnly, thisMonth = U.thisMonth;

function api(path, opts){
  opts=opts||{};
  return fetch(path,{
    method: opts.method||'GET',
    headers: opts.body ? {'Content-Type':'application/json'} : {},
    credentials:'include',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(function(r){
    if(r.status===401){location.href='/login.html';return Promise.reject('auth');}
    return r.json().then(function(d){if(!r.ok || d.ok===false){throw new Error(d.error||('HTTP '+r.status));}return d;});
  });
}
function apiForm(path, formData){
  return fetch(path,{method:'POST', credentials:'include', body:formData})
    .then(function(r){return r.json().then(function(d){if(!r.ok||d.ok===false)throw new Error(d.error||'HTTP '+r.status);return d;});});
}
function toast(msg, kind){
  var t=$('toast'); t.textContent=msg; t.className='toast show '+(kind||'');
  clearTimeout(toast._t); toast._t=setTimeout(function(){t.className='toast '+(kind||'');}, CFG.TOAST_MS);
}

// Run async loader; render its result; on throw, write an empty/error state into elId.
function safeLoad(elId, fn){
  return Promise.resolve().then(fn).catch(function(e){
    var el = $(elId);
    if(el) el.innerHTML = '<div class="empty">Error: '+esc(e.message)+'</div>';
  });
}
function setTileBody(tileId, html){ $(tileId).querySelector('.tile-body').innerHTML = html; }
function setTileDetail(tileId, html){
  var d = $(tileId).querySelector('.tile-detail'); if(d) d.innerHTML = html;
}
// One-shot delegated click listener on a container, dispatched by data-attribute.
function delegate(containerId, attrName, handler){
  var el = $(containerId); if(!el || el._delegated) return;
  el._delegated = true;
  el.addEventListener('click', function(e){
    var t = e.target.closest('['+attrName+']'); if(!t || !el.contains(t)) return;
    handler(t.getAttribute(attrName), t, e);
  });
}

function openModal(title, html, onSubmit){
  $('modal-title').textContent=title;
  $('modal-body').innerHTML=html;
  $('modal').classList.remove('hidden');
  if(onSubmit){
    var form=$('modal-body').querySelector('form');
    if(form) form.addEventListener('submit', function(e){e.preventDefault(); onSubmit(new FormData(form));});
  }
}
function closeModal(){ $('modal').classList.add('hidden'); $('modal-body').innerHTML=''; }

var state = {
  month: thisMonth(),
  workspace: localStorage.getItem('money_ws') || 'default',
  nwRange: parseInt(localStorage.getItem('money_nw_range')||'90',10),
  taxTab: 'es',
  taxYear: new Date().getFullYear(),
  txFeedType: '',
  txFeedLimit: 50,
};

async function loadKPIs(){
  return safeLoad('runway-value', async function(){
    var r = await api('/api/finances/runway');
    var d = r.data;
    $('runway-value').textContent = (d.runway_days_90d>=CFG.RUNWAY_INFINITE_DAYS?'∞':d.runway_days_90d)+' d';
    $('runway-burn').textContent = fmt(d.burn_rate_90d)+' NZD/d burn';
    $('month-balance').textContent = fmt(d.remaining_nzd)+' NZD';
    $('month-flow').innerHTML = '<span class="up">+'+fmt(d.income_nzd)+'</span> / <span class="down">-'+fmt(d.expense_nzd)+'</span>';
    if(d.net_worth_snapshot) $('nw-value').textContent = fmt(d.net_worth_snapshot.total_nzd)+' NZD';
    var rows = d.by_account || [];
    var tbody = $('by-account-table').querySelector('tbody');
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan=6 class="empty">No movements this month</td></tr>'; return; }
    tbody.innerHTML = rows.map(function(a){
      var net = parseFloat(a.in_nzd) - parseFloat(a.out_nzd);
      return '<tr><td>'+esc(a.account)+'</td><td>'+esc(a.currency)+'</td>'+
        '<td>'+fmt(a.in_nzd)+'</td><td>'+fmt(a.out_nzd)+'</td>'+
        '<td class="'+(net>=0?'pos':'neg')+'">'+fmt(net)+'</td><td>'+a.txns+'</td></tr>';
    }).join('');
  });
}

async function loadAlerts(){
  try{
    var r = await api('/api/finances/alerts');
    var rows = r.data || [];
    var strip = $('alerts-strip');
    if(!rows.length){ strip.classList.add('hidden'); return; }
    strip.classList.remove('hidden');
    $('alerts-count').textContent = rows.length;
    $('alerts-list').innerHTML = rows.map(function(a){
      var pct = parseFloat(a.percent_used);
      return '<span class="alert-pill '+(pct>=CFG.BUDGET_DANGER_PCT?'danger':'')+'">'+esc(a.category)+': '+pct+'% ('+fmt(a.spent)+'/'+fmt(a.monthly_limit)+')</span>';
    }).join('');
  }catch(e){ /* alerts panel is soft-fail; no toast */ }
}

async function loadNW(){
  return safeLoad('nw-breakdown', async function(){
    var r = await api('/api/finances/nw-timeline?days='+state.nwRange);
    var rows = r.data || [];
    var svg = $('nw-spark');
    if(!rows.length){ svg.innerHTML=''; $('nw-breakdown').innerHTML='<div class="empty">No NW snapshots yet</div>'; return; }
    var W=CFG.SPARK_W, H=CFG.SPARK_H, P=CFG.SPARK_PAD;
    var vals = rows.map(function(x){return parseFloat(x.total_nzd);});
    var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals); if(max===min) max=min+1;
    var pts = vals.map(function(v,i){
      var x = P + (W-2*P) * (rows.length>1 ? i/(rows.length-1) : 0);
      var y = H-P - (H-2*P) * (v-min)/(max-min);
      return [x,y];
    });
    var path = pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ');
    var area = path + ' L'+pts[pts.length-1][0]+','+(H-P)+' L'+pts[0][0]+','+(H-P)+' Z';
    svg.innerHTML =
      '<defs><linearGradient id="spark-grad" x1="0" x2="0" y1="0" y2="1">'+
      '<stop offset="0" stop-color="#10b981" stop-opacity=".5"/>'+
      '<stop offset="1" stop-color="#10b981" stop-opacity="0"/>'+
      '</linearGradient></defs>'+
      '<path class="area" d="'+area+'" fill="url(#spark-grad)"/>'+
      '<path class="line" d="'+path+'"/>';
    if(r.trend){
      var t = r.trend, klass = t.delta_nzd>=0?'up':'down', sign = t.delta_nzd>=0?'+':'';
      $('nw-trend').className = 'kpi-meta '+klass;
      $('nw-trend').textContent = sign+fmt(t.delta_nzd)+' NZD ('+fmtPct(t.delta_pct)+') · '+t.period_days+'d';
    }
    var last = rows[rows.length-1];
    var bk = last && last.breakdown || {};
    $('nw-breakdown').innerHTML = Object.keys(bk).map(function(k){
      return '<span>'+esc(k)+': <b>'+fmt(bk[k])+'</b></span>';
    }).join('');
  });
}

async function loadBudget(){
  return safeLoad('budget-bars', async function(){
    $('budget-month').textContent = state.month;
    var r = await api('/api/finances/budget/carryover?month='+state.month+'&monthsBack='+CFG.CARRYOVER_MONTHS_BACK);
    var rows = r.data || [];
    if(!rows.length){ $('budget-bars').innerHTML='<div class="empty">No budgets set. Add one →</div>'; return; }
    rows.sort(function(a,b){return (b.current_spent/(b.effective_limit||1)) - (a.current_spent/(a.effective_limit||1));});
    var tpl = $('tpl-budget-bar');
    var frag = document.createDocumentFragment();
    rows.forEach(function(c){
      var node = tpl.content.cloneNode(true);
      var pct = c.effective_limit ? (c.current_spent / c.effective_limit * 100) : 0;
      var fill = node.querySelector('.bar-fill');
      fill.style.width = Math.min(100, pct)+'%';
      if(pct>=CFG.BUDGET_DANGER_PCT) fill.classList.add('danger'); else if(pct>=CFG.BUDGET_WARN_PCT) fill.classList.add('warn');
      node.querySelector('.bar-cat').textContent = c.category;
      node.querySelector('.bar-amt').textContent = fmt(c.current_spent)+' / '+fmt(c.effective_limit)+' NZD';
      node.querySelector('.bar-pct').textContent = pct.toFixed(0)+'% used';
      node.querySelector('.bar-carry').textContent = c.carryover_balance>0 ? '+'+fmt(c.carryover_balance)+' carry' : '';
      frag.appendChild(node);
    });
    $('budget-bars').innerHTML=''; $('budget-bars').appendChild(frag);
  });
}

async function loadRecurring(){
  return safeLoad('recurring-list', async function(){
    var r = await api('/api/finances/recurring');
    var rows = r.data || [];
    if(!rows.length){ $('recurring-list').innerHTML='<div class="empty">No recurring detected. Click <b>scan</b>.</div>'; return; }
    $('recurring-list').innerHTML = rows.map(function(x){
      var due = x.days_until;
      var dueClass = due==null?'':due<0?'overdue':due<=7?'soon':'';
      var dueText = due==null?'—':due<0?Math.abs(due)+'d overdue':due===0?'today':due+'d';
      return '<li>'+
        '<div><div class="rec-payee">'+esc(x.payee_normalized)+(x.confirmed?' <span class="rec-confirmed">✓</span>':'')+'</div>'+
        '<div class="rec-meta">'+esc(x.frequency)+' · '+x.sample_size+'× · conf '+(parseFloat(x.confidence)*100).toFixed(0)+'% · avg '+(parseFloat(x.avg_interval_days)||0).toFixed(1)+'d</div></div>'+
        '<div class="rec-amt">'+fmt(x.amount_avg,{dp:2})+' '+esc(x.currency)+'</div>'+
        '<div class="rec-due '+dueClass+'">'+dueText+'</div>'+
        '<button class="btn btn-mini" data-rec-id="'+x.id+'" data-confirmed="'+(!x.confirmed)+'">'+(x.confirmed?'unconf':'confirm')+'</button>'+
        '</li>';
    }).join('');
  });
}

async function loadTxFeed(){
  return safeLoad('tx-feed-list', async function(){
    var qs = 'limit='+state.txFeedLimit + (state.txFeedType?'&type='+state.txFeedType:'');
    var r = await api('/api/finances?'+qs);
    var rows = r.data || [];
    if(!rows.length){ $('tx-feed-list').innerHTML='<div class="empty">No transactions</div>'; return; }
    $('tx-feed-list').innerHTML = rows.map(function(t){
      var sign = t.type==='income'?'+':'-';
      var ccy = t.currency || 'NZD';
      return '<div class="tx-row">'+
        '<div class="tx-date">'+dateOnly(t.date)+'</div>'+
        '<div class="tx-info"><span class="tx-cat">'+esc(t.category)+'</span>'+
        '<span class="tx-desc">'+esc(t.description||t.account||'—')+'</span></div>'+
        '<div class="tx-amt '+t.type+'">'+sign+fmt(t.amount,{dp:2})+' '+esc(ccy)+'</div>'+
      '</div>';
    }).join('');
  });
}

async function loadByCategory(){
  return safeLoad('by-category-bars', async function(){
    var r = await api('/api/finances/summary?month='+state.month);
    var rows = (r.data && r.data.byCategory || []).filter(function(c){return c.type==='expense';});
    if(!rows.length){ $('by-category-bars').innerHTML='<div class="empty">No expenses</div>'; return; }
    var max = Math.max.apply(null, rows.map(function(c){return parseFloat(c.total)||0;})) || 1;
    $('by-category-bars').innerHTML = rows.map(function(c){
      var v = parseFloat(c.total)||0;
      return '<div class="cat-bar">'+
        '<div class="cat-bar-meta"><span class="cat-bar-cat">'+esc(c.category)+'</span><span class="cat-bar-amt">'+fmt(v)+' NZD ('+c.count+')</span></div>'+
        '<div class="cat-bar-track"><div class="cat-bar-fill" style="width:'+(v/max*100).toFixed(1)+'%"></div></div>'+
      '</div>';
    }).join('');
  });
}

async function loadInvestments(){
  return safeLoad('invest-total', async function(){
    var r = await api('/api/finances/investments');
    var positions = r.positions || [];
    var tbody = $('invest-table').querySelector('tbody');
    if(!positions.length){ tbody.innerHTML='<tr><td colspan=5 class="empty">No positions</td></tr>'; $('invest-total').textContent='—'; return; }
    var total = 0;
    tbody.innerHTML = positions.map(function(p){
      total += parseFloat(p.value_nzd)||0;
      var pnl = parseFloat(p.pnl_nzd)||0, pnlPct = parseFloat(p.pnl_pct)||0;
      var klass = pnl>=0?'pos':'neg';
      return '<tr data-symbol="'+esc(p.symbol)+'"><td><b>'+esc(p.symbol)+'</b><br><span style="color:var(--fg-mute);font-size:11px">'+esc(p.account||'')+'</span></td>'+
        '<td>'+fmt(p.quantity,{dp:p.quantity<10?2:0})+'</td>'+
        '<td>'+fmt(p.value_nzd)+'</td>'+
        '<td class="'+klass+'">'+(pnl>=0?'+':'')+fmt(pnl)+'<br><span style="font-size:11px">'+fmtPct(pnlPct)+'</span></td>'+
        '<td class="row-actions"><button data-perf="'+esc(p.symbol)+'" title="Performance">📈</button></td></tr>';
    }).join('');
    $('invest-total').textContent = fmt(total)+' NZD';
  });
}

async function showInvestmentDetail(symbol){
  var det = $('invest-detail');
  det.classList.remove('hidden');
  det.innerHTML = '<div class="loading">Loading '+esc(symbol)+'</div>';
  try{
    var [perf, twr] = await Promise.all([
      api('/api/finances/investments/performance?symbol='+encodeURIComponent(symbol)),
      api('/api/finances/investments/twr?symbol='+encodeURIComponent(symbol)+'&rf='+CFG.RISK_FREE_RATE),
    ]);
    var p = (perf.data && perf.data.periods) || {}, t = twr.data || {};
    var ranges = ['1d','1w','1m','3m','ytd','1y','max'];
    var perfHtml = ranges.map(function(k){
      var v = p[k]; if(v==null) return '';
      var pct = parseFloat(v.return_pct||0);
      return '<div class="perf-cell"><div class="label">'+k.toUpperCase()+'</div><div class="val '+(pct>=0?'pos':'neg')+'">'+fmtPct(pct)+'</div></div>';
    }).join('');
    det.innerHTML =
      '<h3>'+esc(symbol)+' performance · last close '+(perf.data && perf.data.last_close ? fmt(perf.data.last_close,{dp:2}) : '—')+'</h3>'+
      '<div class="perf-grid">'+(perfHtml||'<div class="empty">No history</div>')+'</div>'+
      (t.cumulative_return_pct!=null ? '<div style="margin-top:8px">Cumulative: <b>'+fmtPct(t.cumulative_return_pct)+'</b> · Annualized: <b>'+fmtPct(t.annualized_return_pct)+'</b> · Sharpe: <b>'+(t.sharpe_ratio!=null?t.sharpe_ratio.toFixed(2):'—')+'</b> · Vol: <b>'+(t.annualized_volatility_pct!=null?fmtPct(t.annualized_volatility_pct):'—')+'</b> · '+(t.samples||0)+' samples</div>' : '')+
      '<div style="margin-top:8px"><button class="btn btn-mini" data-invest-sync="'+esc(symbol)+'">Sync history</button> <button class="btn btn-mini" data-invest-close>Close</button></div>';
  }catch(e){ det.innerHTML='<div class="empty">Error: '+esc(e.message)+'</div>'; }
}

async function loadCrypto(){
  return safeLoad('crypto-total', async function(){
    var r = await api('/api/finances/crypto');
    var holdings = r.holdings || [];
    var tbody = $('crypto-table').querySelector('tbody');
    if(!holdings.length){ tbody.innerHTML='<tr><td colspan=5 class="empty">No holdings</td></tr>'; $('crypto-total').textContent='—'; return; }
    var total = 0;
    tbody.innerHTML = holdings.map(function(h){
      total += parseFloat(h.value_nzd)||0;
      return '<tr><td><b>'+esc(h.symbol)+'</b></td>'+
        '<td>'+fmt(h.amount,{dp:h.amount<1?4:2})+'</td>'+
        '<td>'+fmt(h.value_nzd)+'</td>'+
        '<td>'+esc(h.exchange||'—')+'</td>'+
        '<td class="row-actions"><button data-crypto-del="'+h.id+'" title="Delete">✕</button></td></tr>';
    }).join('');
    $('crypto-total').textContent = fmt(total)+' NZD';
  });
}

async function loadGoals(){
  return safeLoad('goals-list', async function(){
    var r = await api('/api/finances/savings-goals');
    var rows = r.data || [];
    if(!rows.length){ $('goals-list').innerHTML='<div class="empty">No goals. Click <b>+ goal</b>.</div>'; $('savings-pct').textContent='—'; return; }
    var totalTarget=0, totalCurrent=0;
    $('goals-list').innerHTML = rows.map(function(g){
      var pct = parseFloat(g.progress_pct)||0;
      totalTarget += parseFloat(g.target_amount); totalCurrent += parseFloat(g.current_amount);
      var dr = g.days_remaining;
      var drText = dr==null?'no deadline':dr<0?Math.abs(dr)+'d overdue':dr+'d left';
      return '<li data-goal-id="'+g.id+'">'+
        '<div class="goal-h"><span class="goal-name">'+esc(g.name)+
          ' <button class="goal-edit" data-goal-edit="'+g.id+'" title="Update progress">✎</button>'+
          ' <button class="goal-edit" data-goal-del="'+g.id+'" title="Delete">✕</button></span>'+
        '<span class="goal-amt">'+fmt(g.current_amount)+' / '+fmt(g.target_amount)+' '+esc(g.currency)+'</span></div>'+
        '<div class="goal-track"><div class="goal-fill" style="width:'+Math.min(100,pct)+'%"></div></div>'+
        '<div class="goal-foot"><span>'+pct.toFixed(0)+'%</span><span>'+drText+'</span></div>'+
        '</li>';
    }).join('');
    var avgPct = totalTarget>0 ? (totalCurrent/totalTarget*100) : 0;
    $('savings-pct').textContent = avgPct.toFixed(0)+'%';
    $('savings-meta').textContent = fmt(totalCurrent)+' / '+fmt(totalTarget)+' (mixed ccy)';
  });
}

async function loadProviders(){
  return safeLoad('providers-list', async function(){
    var r = await api('/api/finances/providers');
    $('providers-list').innerHTML = r.providers.map(function(p){
      var sync = '';
      if(p.id==='akahu' && p.configured) sync = '<button class="sync-btn" data-sync="akahu">sync</button>';
      if(p.id==='binance_ccxt' && p.configured) sync = '<button class="sync-btn" data-sync="binance">sync</button>';
      return '<li><div><span class="dot '+(p.configured?'on':'off')+'"></span>'+esc(p.name)+sync+
        '<div style="color:var(--fg-mute);font-size:11px;margin-left:16px">'+esc(p.scope)+'</div></div>'+
        '<a href="'+esc(p.docs)+'" target="_blank" rel="noopener" style="color:var(--accent-2);font-size:11px">docs ↗</a></li>';
    }).join('');
  });
}

async function loadFX(){
  return safeLoad('fx-list', async function(){
    var r = await api('/api/finances/fx');
    var rows = r.data || [];
    $('fx-list').innerHTML = rows.map(function(x){
      return '<li><span class="ccy">NZD→'+esc(x.quote)+'</span><span>'+parseFloat(x.rate).toFixed(4)+'</span></li>';
    }).join('') || '<li class="empty">No FX cached</li>';
  });
}

async function loadCsvProfiles(){
  try{
    var r = await api('/api/finances/import-csv/profiles');
    var profiles = r.data || {};
    var sel = $('csv-bank');
    var current = sel.value;
    sel.innerHTML = '<option value="auto">Auto-detect</option>' + Object.keys(profiles).map(function(id){
      return '<option value="'+esc(id)+'">'+esc(profiles[id].name||id)+'</option>';
    }).join('');
    if(current) sel.value = current;
  }catch(e){ /* keep static */ }
}

async function loadTaxES(){
  var year = state.taxYear;
  var qs = year ? '?year='+year : '';
  api('/api/finances/tax/residency-es'+qs).then(function(r){
    var d=r.data;
    setTileBody('tax-residency-es',
      '<div class="row"><span>Days in ES</span><strong>'+d.days_in_es+' / '+d.threshold_days+'</strong></div>'+
      '<div class="row"><span>Resident?</span><strong>'+(d.is_resident?'YES':'no')+'</strong></div>'+
      '<div class="row"><span>To threshold</span><strong>'+(d.days_to_residency==null?'—':d.days_to_residency+' d')+'</strong></div>');
  }).catch(function(e){setTileBody('tax-residency-es', 'Error: '+esc(e.message));});
  api('/api/finances/tax/modelo-100'+qs).then(function(r){
    var d=r.data||{}, s=d.sections||{};
    setTileBody('tax-modelo-100',
      '<div class="row"><span>Year</span><strong>'+(d.year||year||'—')+'</strong></div>'+
      '<div class="row"><span>Total IRPF base</span><strong>'+fmt(d.total_eur||0)+' EUR</strong></div>'+
      '<div class="row"><span>Trabajo</span><strong>'+fmt(s.rendimientos_trabajo||0)+'</strong></div>'+
      '<div class="row"><span>Actividades</span><strong>'+fmt(s.actividades_economicas||0)+'</strong></div>'+
      '<div class="row"><span>Capital mobiliario</span><strong>'+fmt(s.capital_mobiliario||0)+'</strong></div>'+
      '<div class="row"><span>Deadline</span><strong>'+esc(d.deadline||'—')+'</strong></div>');
    var b = d.breakdown || [];
    setTileDetail('tax-modelo-100', '<table><thead><tr><th>Cat</th><th>Section</th><th>EUR</th><th>Tx</th></tr></thead><tbody>'+
      b.map(function(x){return '<tr><td>'+esc(x.category)+'</td><td>'+esc((x.section||'').slice(0,12))+'</td><td>'+fmt(x.total_eur)+'</td><td>'+x.tx_count+'</td></tr>';}).join('')+
      '</tbody></table>');
  }).catch(function(e){setTileBody('tax-modelo-100', 'Error: '+esc(e.message));});
  api('/api/finances/tax/modelo-720'+qs).then(function(r){
    var d=r.data||{}, c1=d.categoria_1_cuentas_extranjero||{};
    setTileBody('tax-modelo-720',
      '<div class="row"><span>Year</span><strong>'+(d.year||year||'—')+'</strong></div>'+
      '<div class="row"><span>Cuentas extranjero</span><strong>'+fmt(c1.total_eur||0)+' EUR</strong></div>'+
      '<div class="row"><span>Items</span><strong>'+(c1.items?c1.items.length:0)+'</strong></div>'+
      '<div class="row"><span>Threshold</span><strong>'+fmt(d.threshold_eur||CFG.ES_FOREIGN_THRESHOLD_EUR)+' EUR</strong></div>'+
      '<div class="row"><span>Obligated?</span><strong>'+(d.obligated?'YES':'no')+'</strong></div>');
    var items = (c1.items||[]);
    setTileDetail('tax-modelo-720', '<table><thead><tr><th>Account</th><th>Bal NZD</th><th>Bal EUR</th><th>Tx</th></tr></thead><tbody>'+
      items.map(function(x){return '<tr><td>'+esc(x.account)+'</td><td>'+fmt(x.balance_nzd)+'</td><td>'+fmt(x.balance_eur)+'</td><td>'+x.tx_count+'</td></tr>';}).join('')+
      '</tbody></table>');
  }).catch(function(e){setTileBody('tax-modelo-720', 'Error: '+esc(e.message));});
  api('/api/finances/tax/modelo-721'+qs).then(function(r){
    var d=r.data||{};
    setTileBody('tax-modelo-721',
      '<div class="row"><span>Year</span><strong>'+(d.year||year||'—')+'</strong></div>'+
      '<div class="row"><span>Crypto value</span><strong>'+fmt(d.total_eur||0)+' EUR</strong></div>'+
      '<div class="row"><span>Holdings</span><strong>'+(d.items?d.items.length:0)+'</strong></div>'+
      '<div class="row"><span>Threshold</span><strong>'+fmt(d.threshold_eur||CFG.ES_FOREIGN_THRESHOLD_EUR)+' EUR</strong></div>'+
      '<div class="row"><span>Obligated?</span><strong>'+(d.obligated?'YES':'no')+'</strong></div>');
    var items = (d.items||[]);
    setTileDetail('tax-modelo-721', '<table><thead><tr><th>Symbol</th><th>Amt</th><th>Exchange</th><th>EUR</th></tr></thead><tbody>'+
      items.map(function(x){return '<tr><td>'+esc(x.symbol)+'</td><td>'+fmt(x.amount,{dp:4})+'</td><td>'+esc(x.exchange||'—')+'</td><td>'+fmt(x.value_eur)+'</td></tr>';}).join('')+
      '</tbody></table>');
  }).catch(function(e){setTileBody('tax-modelo-721', 'Error: '+esc(e.message));});
}

async function loadTaxNZ(){
  api('/api/finances/tax/fif-nz').then(function(r){
    var d=r.data||{};
    setTileBody('tax-fif-nz',
      '<div class="row"><span>Offshore positions</span><strong>'+(r.positions_used||0)+'</strong></div>'+
      '<div class="row"><span>Cost NZD</span><strong>'+fmt(d.total_cost_nzd||0)+'</strong></div>'+
      '<div class="row"><span>Market value</span><strong>'+fmt(d.total_market_value_nzd||0)+' NZD</strong></div>'+
      '<div class="row"><span>De minimis</span><strong>'+fmt(CFG.NZ_FIF_DEMINIMIS_NZD)+' NZD</strong></div>'+
      '<div class="row"><span>FIF applies</span><strong>'+(d.exempt?'no (exempt)':'YES')+'</strong></div>'+
      '<div class="row"><span>Method</span><strong>'+esc(d.method||'—')+'</strong></div>'+
      '<div class="row"><span>FIF income</span><strong>'+fmt(d.fif_income_nzd||0)+' NZD</strong></div>'+
      '<div class="row"><span>Tax payable</span><strong>'+fmt(d.tax_payable_nzd||0)+' NZD</strong></div>');
  }).catch(function(e){setTileBody('tax-fif-nz', 'Error: '+esc(e.message));});
}

function setupTax(){
  $$('.tab').forEach(function(t){
    t.addEventListener('click', function(){
      $$('.tab').forEach(function(x){x.classList.remove('active');});
      t.classList.add('active');
      state.taxTab = t.dataset.taxTab;
      $$('.tax-pane').forEach(function(p){
        p.classList.toggle('hidden', p.dataset.taxPane !== state.taxTab);
      });
      if(state.taxTab==='es') loadTaxES(); else loadTaxNZ();
    });
  });
  $$('.tile-toggle').forEach(function(b){
    b.addEventListener('click', function(){
      var det = b.closest('.tax-tile').querySelector('.tile-detail');
      if(det) det.classList.toggle('hidden');
    });
  });
  $('paye-go').addEventListener('click', function(){
    var gross = parseFloat($('paye-gross').value)||0;
    api('/api/finances/tax/paye-nz?gross='+gross).then(function(r){
      var d=r.data;
      $('paye-result').innerHTML =
        '<div class="row"><span>Tax payable</span><strong>'+fmt(d.tax_payable_nzd)+' NZD</strong></div>'+
        '<div class="row"><span>ACC levy</span><strong>'+fmt(d.acc_earner_levy_nzd)+' NZD</strong></div>'+
        '<div class="row"><span>Net</span><strong>'+fmt(d.net_nzd)+' NZD</strong></div>'+
        '<div class="row"><span>Effective</span><strong>'+d.effective_rate_pct+'% (marg '+d.marginal_rate_pct+'%)</strong></div>';
    }).catch(function(e){$('paye-result').textContent='Error: '+e.message;});
  });
  $('beckham-go').addEventListener('click', function(){
    var gross = parseFloat($('beckham-gross').value)||0;
    api('/api/finances/tax/beckham?gross='+gross).then(function(r){
      var d=r.data, b=d.beckham||{}, s=d.irpf_standard||{};
      var savePct = s.tax_eur ? (d.savings_with_beckham_eur/s.tax_eur*100) : 0;
      $('beckham-result').innerHTML =
        '<div class="row"><span>Beckham (24%)</span><strong>'+fmt(b.tax_eur)+' EUR</strong></div>'+
        '<div class="row"><span>IRPF standard</span><strong>'+fmt(s.tax_eur)+' EUR</strong></div>'+
        '<div class="row"><span>Saving</span><strong>'+fmt(d.savings_with_beckham_eur)+' EUR ('+savePct.toFixed(1)+'%)</strong></div>'+
        '<div class="row"><span>Verdict</span><strong>'+(d.beckham_better?'Beckham wins ✓':'IRPF wins')+'</strong></div>';
    }).catch(function(e){$('beckham-result').textContent='Error: '+e.message;});
  });
  $('tax-year').value = state.taxYear;
  $('tax-year').addEventListener('change', function(){
    state.taxYear = parseInt(this.value,10) || new Date().getFullYear();
    if(state.taxTab==='es') loadTaxES(); else loadTaxNZ();
  });
}

function prependTxRow(t){
  var list = $('tx-feed-list'); if(!list || !t) return;
  var sign = t.type==='income'?'+':'-';
  var html = '<div class="tx-row">'+
    '<div class="tx-date">'+dateOnly(t.date)+'</div>'+
    '<div class="tx-info"><span class="tx-cat">'+esc(t.category)+'</span>'+
    '<span class="tx-desc">'+esc(t.description||t.account||'—')+'</span></div>'+
    '<div class="tx-amt '+t.type+'">'+sign+fmt(t.amount,{dp:2})+' '+esc(t.currency||'NZD')+'</div></div>';
  list.insertAdjacentHTML('afterbegin', html);
}

function setupTxForm(){
  $('category-list').innerHTML = CATEGORY_HINTS.map(function(c){return '<option value="'+c+'">';}).join('');
  $('tx-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var fd = new FormData(ev.target);
    var body = {}; fd.forEach(function(v,k){if(v!=='') body[k]=v;});
    body.amount = parseFloat(body.amount);
    var msg = $('tx-form-msg'); msg.textContent='Saving…'; msg.className='form-msg';
    try{
      var r = await api('/api/finances',{method:'POST', body:body});
      msg.textContent='✓ Added (id '+(r.data.id)+')'+(r.firefly && r.firefly.ok?' + Firefly':'');
      msg.className='form-msg ok';
      ev.target.reset();
      prependTxRow(r.data);
      loadKPIs(); loadBudget(); loadByCategory(); loadAlerts();
    }catch(e){ msg.textContent='✗ '+e.message; msg.className='form-msg err'; }
  });
}

function setupCsv(){
  var dz = $('dz-csv'), file = $('csv-file');
  ;['dragenter','dragover'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault(); dz.classList.add('drag');});});
  ;['dragleave','drop'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault(); dz.classList.remove('drag');});});
  dz.addEventListener('drop', function(e){ if(e.dataTransfer.files[0]) file.files = e.dataTransfer.files; });
  $('csv-upload-btn').addEventListener('click', async function(){
    var f = file.files[0]; if(!f){toast('Pick a CSV file','err'); return;}
    var fd = new FormData(); fd.append('file', f); fd.append('bank', $('csv-bank').value);
    var msg = $('csv-result'); msg.textContent='Uploading…'; msg.className='form-msg';
    try{
      var r = await apiForm('/api/finances/import-csv', fd);
      msg.textContent='✓ '+(r.bank_name||r.bank)+' · '+r.inserted+' inserted, '+r.skipped_duplicates+' dupes, '+r.failed+' failed';
      msg.className='form-msg ok';
      loadKPIs(); loadBudget(); loadTxFeed(); loadByCategory(); loadAlerts();
    }catch(e){msg.textContent='✗ '+e.message; msg.className='form-msg err';}
  });
}

function setupReceipt(){
  $('receipt-upload-btn').addEventListener('click', async function(){
    var f = $('receipt-file').files[0]; if(!f){toast('Pick an image/PDF','err'); return;}
    var fd = new FormData(); fd.append('file', f);
    var msg = $('receipt-result'); msg.textContent='OCR processing (may take 10-20s)…'; msg.className='form-msg';
    try{
      var r = await apiForm('/api/finances/receipt', fd);
      var p = r.parsed, s = r.suggested_row;
      msg.innerHTML = '✓ <b>'+esc(p.merchant||'?')+'</b> — '+fmt(p.amount,{dp:2})+' '+esc(p.currency||'?')+' on '+esc(p.date||'?')+
        ' <button class="btn btn-mini" id="receipt-confirm">Add as expense</button>';
      msg.className='form-msg ok';
      $('receipt-confirm').addEventListener('click', async function(){
        try{
          await api('/api/finances',{method:'POST', body:{
            type:'expense', amount:s.amount||0, currency:s.currency||'NZD',
            category:'receipt', description:s.description||'OCR receipt', date:s.date,
          }});
          toast('Receipt added','ok'); loadKPIs(); loadBudget(); loadTxFeed();
        }catch(e){toast(e.message,'err');}
      });
    }catch(e){msg.textContent='✗ '+e.message; msg.className='form-msg err';}
  });
}

function setupBudgetAdd(){
  $('budget-add-btn').addEventListener('click', function(){
    openModal('Set budget category', '<form><label>Category</label><input name="category" required><label>Monthly limit (NZD)</label><input name="monthly_limit" type="number" step="1" min="1" required><div class="modal-actions"><button type="button" class="btn" onclick="document.getElementById(\'modal-close\').click()">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>',
      async function(fd){
        try{
          await api('/api/finances/budget',{method:'POST', body:{category:fd.get('category'), monthly_limit:parseFloat(fd.get('monthly_limit'))}});
          toast('Budget set','ok'); closeModal(); loadBudget(); loadAlerts();
        }catch(e){toast(e.message,'err');}
      });
  });
}

function setupGoalAdd(){
  $('goal-add-btn').addEventListener('click', function(){
    openModal('New savings goal', '<form><label>Name</label><input name="name" required><label>Target amount</label><input name="target_amount" type="number" step="1" min="1" required><label>Current saved</label><input name="current_amount" type="number" step="1" min="0" value="0"><label>Currency</label><select name="currency"><option>NZD</option><option>EUR</option><option>USD</option></select><label>Target date (optional)</label><input name="target_date" type="date"><div class="modal-actions"><button type="button" class="btn" onclick="document.getElementById(\'modal-close\').click()">Cancel</button><button type="submit" class="btn btn-primary">Add</button></div></form>',
      async function(fd){
        var body={}; fd.forEach(function(v,k){if(v!=='') body[k]=v;});
        body.target_amount = parseFloat(body.target_amount); body.current_amount = parseFloat(body.current_amount||0);
        try{ await api('/api/finances/savings-goals',{method:'POST', body:body}); toast('Goal added','ok'); closeModal(); loadGoals(); }
        catch(e){toast(e.message,'err');}
      });
  });
}

function setupInvestAdd(){
  $('invest-add-btn').addEventListener('click', function(){
    openModal('Add investment position', '<form><label>Symbol (e.g. AAPL.US, VWRD.UK)</label><input name="symbol" required><label>Quantity</label><input name="quantity" type="number" step="0.0001" min="0.0001" required><label>Avg cost per unit</label><input name="avg_cost" type="number" step="0.01" min="0"><label>Currency</label><select name="currency"><option>USD</option><option>EUR</option><option>GBP</option><option>NZD</option></select><label>Account (e.g. IBKR)</label><input name="account"><label>Opened date</label><input name="opened_at" type="date"><div class="modal-actions"><button type="button" class="btn" onclick="document.getElementById(\'modal-close\').click()">Cancel</button><button type="submit" class="btn btn-primary">Add</button></div></form>',
      async function(fd){
        var body={}; fd.forEach(function(v,k){if(v!=='') body[k]=v;});
        body.quantity = parseFloat(body.quantity); if(body.avg_cost) body.avg_cost = parseFloat(body.avg_cost);
        try{ await api('/api/finances/investments',{method:'POST', body:body}); toast('Position added','ok'); closeModal(); loadInvestments(); }
        catch(e){toast(e.message,'err');}
      });
  });
  $('invest-quote-btn').addEventListener('click', function(){
    var sym = prompt('Symbol to lookup (e.g. AAPL.US):'); if(!sym) return;
    api('/api/finances/investments/quote/'+encodeURIComponent(sym))
      .then(function(r){ var q=r.data||{}; toast(sym+': '+(q.close!=null?q.close:'?')+' '+(q.currency||'')+(q.date?' ('+dateOnly(q.date)+')':''), 'ok'); })
      .catch(function(e){toast(e.message,'err');});
  });
}

function setupCryptoAdd(){
  $('crypto-add-btn').addEventListener('click', function(){
    openModal('Add crypto holding', '<form><label>Symbol (e.g. BTC, ETH, USDC)</label><input name="symbol" required><label>Amount</label><input name="amount" type="number" step="0.00000001" min="0.00000001" required><label>Exchange / wallet</label><input name="exchange" required placeholder="e.g. Binance, Ledger cold"><label>Wallet address (optional)</label><input name="wallet_address"><label>Notes</label><input name="notes"><div class="modal-actions"><button type="button" class="btn" onclick="document.getElementById(\'modal-close\').click()">Cancel</button><button type="submit" class="btn btn-primary">Add</button></div></form>',
      async function(fd){
        var body={}; fd.forEach(function(v,k){if(v!=='') body[k]=v;});
        body.amount = parseFloat(body.amount);
        try{ await api('/api/finances/crypto',{method:'POST', body:body}); toast('Holding added','ok'); closeModal(); loadCrypto(); }
        catch(e){toast(e.message,'err');}
      });
  });
  $('crypto-sync-btn').addEventListener('click', async function(){
    try{ var r = await api('/api/finances/crypto/sync-binance',{method:'POST', body:{}}); toast('Binance: '+(r.imported||0)+' synced','ok'); loadCrypto(); }
    catch(e){toast(e.message,'err');}
  });
}

function setupRecurringDetect(){
  $('recurring-detect-btn').addEventListener('click', async function(){
    try{
      var r = await api('/api/finances/recurring/detect',{method:'POST', body:{lookback_days:CFG.RECURRING_LOOKBACK_DAYS, min_samples:CFG.RECURRING_MIN_SAMPLES}});
      toast('Detected '+(r.detected||0)+' recurring','ok'); loadRecurring();
    }catch(e){toast(e.message,'err');}
  });
}

function setupFxRefresh(){
  $('fx-refresh-btn').addEventListener('click', async function(){
    try{ await api('/api/finances/fx/refresh',{method:'POST'}); toast('FX refreshed','ok'); loadFX(); }
    catch(e){toast(e.message,'err');}
  });
}

function setupTxFeedControls(){
  $('tx-feed-type').addEventListener('change', function(){ state.txFeedType=this.value; loadTxFeed(); });
  $('tx-feed-limit').addEventListener('change', function(){ state.txFeedLimit=parseInt(this.value,10); loadTxFeed(); });
}

function applyWorkspace(){
  var ws = WORKSPACES[state.workspace] || WORKSPACES.default;
  if(ws.range){ state.nwRange = ws.range; $('nw-range').value = ws.range; }
  if(ws.taxTab){
    state.taxTab = ws.taxTab;
    $$('.tab').forEach(function(t){t.classList.toggle('active', t.dataset.taxTab===ws.taxTab);});
    $$('.tax-pane').forEach(function(p){p.classList.toggle('hidden', p.dataset.taxPane!==ws.taxTab);});
  }
  $$('.card[data-panel]').forEach(function(c){
    if(c.id==='alerts-strip') return; // alerts visibility decided by data
    var visible = ws.panels==='all' || ws.panels.indexOf(c.dataset.panel)>=0;
    c.style.display = visible ? '' : 'none';
  });
  $('workspace-select').value = state.workspace;
}

function setupControls(){
  $('month-picker').value = state.month;
  $('month-picker').addEventListener('change', function(){
    state.month = this.value || thisMonth();
    loadBudget(); loadKPIs(); loadByCategory(); loadAlerts();
  });
  $('workspace-select').addEventListener('change', function(){
    state.workspace = this.value;
    localStorage.setItem('money_ws', state.workspace);
    applyWorkspace();
    if(state.taxTab==='es') loadTaxES(); else loadTaxNZ();
  });
  $('nw-range').addEventListener('change', function(){
    state.nwRange = parseInt(this.value,10);
    localStorage.setItem('money_nw_range', state.nwRange); loadNW();
  });
  $('refresh-btn').addEventListener('click', refreshAll);
  $('modal-close').addEventListener('click', closeModal);
  $('modal').querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', function(e){
    if(e.target.matches('input,select,textarea')) return;
    if(e.key==='r'||e.key==='R') refreshAll();
    if(e.key==='Escape') closeModal();
  });
}

// One-shot delegated listeners for in-card actions. Attached once at init,
// fire by data-attribute regardless of how many times the inner HTML rebuilds.
function setupDelegation(){
  delegate('recurring-list', 'data-rec-id', function(id, btn){
    api('/api/finances/recurring/'+id+'/confirm',{method:'PATCH', body:{confirmed:btn.dataset.confirmed==='true'}})
      .then(loadRecurring).catch(function(e){toast(e.message,'err');});
  });
  delegate('invest-table', 'data-perf', function(symbol){ showInvestmentDetail(symbol); });
  delegate('invest-detail', 'data-invest-sync', function(symbol){
    api('/api/finances/investments/sync-history',{method:'POST', body:{symbol:symbol, days:CFG.RECURRING_LOOKBACK_DAYS}})
      .then(function(){ toast('Synced','ok'); showInvestmentDetail(symbol); })
      .catch(function(e){toast(e.message,'err');});
  });
  delegate('invest-detail', 'data-invest-close', function(){ $('invest-detail').classList.add('hidden'); });
  delegate('crypto-table', 'data-crypto-del', function(id){
    if(!confirm('Delete this crypto holding?')) return;
    api('/api/finances/crypto/'+id,{method:'DELETE'})
      .then(function(){ toast('Deleted','ok'); loadCrypto(); })
      .catch(function(e){toast(e.message,'err');});
  });
  delegate('goals-list', 'data-goal-edit', function(id){
    var v = prompt('New current amount:'); if(v===null) return;
    var n = parseFloat(v); if(isNaN(n)||n<0){ toast('Invalid','err'); return; }
    api('/api/finances/savings-goals/'+id,{method:'PATCH', body:{current_amount:n}})
      .then(loadGoals).catch(function(e){toast(e.message,'err');});
  });
  delegate('goals-list', 'data-goal-del', function(id){
    if(!confirm('Delete this goal?')) return;
    api('/api/finances/savings-goals/'+id,{method:'DELETE'})
      .then(loadGoals).catch(function(e){toast(e.message,'err');});
  });
  delegate('providers-list', 'data-sync', function(which, btn){
    var url = which==='akahu' ? '/api/finances/akahu/sync' : '/api/finances/crypto/sync-binance';
    btn.disabled=true; btn.textContent='…';
    api(url,{method:'POST', body:{}})
      .then(function(r){ toast(which+': '+(r.inserted||r.imported||0)+' new','ok'); refreshAll(); })
      .catch(function(e){toast(which+': '+e.message,'err');})
      .then(function(){ btn.disabled=false; btn.textContent='sync'; });
  });
}

// Skip loaders for panels hidden by current workspace — saves 4-8 fetches.
function refreshAll(){
  var ws = WORKSPACES[state.workspace] || WORKSPACES.default;
  var visible = ws.panels==='all' ? null : new Set(ws.panels);
  Object.keys(PANEL_LOADERS).forEach(function(panelId){
    if(!visible || visible.has(panelId)) PANEL_LOADERS[panelId]();
  });
  // Tax is full-width, separate loader path; skip when not in workspace
  if(!visible || visible.has('tax')){
    if(state.taxTab==='es') loadTaxES(); else loadTaxNZ();
  }
}

document.addEventListener('DOMContentLoaded', function(){
  setupControls();
  setupTax();
  setupTxForm();
  setupCsv();
  setupReceipt();
  setupBudgetAdd();
  setupGoalAdd();
  setupInvestAdd();
  setupCryptoAdd();
  setupRecurringDetect();
  setupFxRefresh();
  setupTxFeedControls();
  setupDelegation();
  loadCsvProfiles();
  applyWorkspace();
  refreshAll();
});

})();
