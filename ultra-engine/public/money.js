/* Money Cockpit — P3 Finanzas
 * Single IIFE. Cookie auth (relies on requireAuth middleware).
 * Endpoints: /api/finances/* (43+ endpoints in routes/finances.js)
 */
(function(){
'use strict';

// ─── Config ────────────────────────────────────────────
var WORKSPACES = {
  default:        { panels:'all',                                            range:90 },
  monthly_close:  { panels:['budget','recurring','tx-add','goals'],          range:30 },
  tax_es:         { panels:['tax','providers','investments','crypto'],       range:365, taxTab:'es' },
  tax_nz:         { panels:['tax','providers','investments'],                range:365, taxTab:'nz' },
  crypto_quarter: { panels:['crypto','investments','nw-timeline','fx'],      range:90 },
  travel_burn:    { panels:['budget','fx','recurring','goals'],              range:30 },
};
var CATEGORY_HINTS = ['rent','groceries','transport','eating_out','subscriptions','utilities','travel','entertainment','health','other'];

// ─── Utils ─────────────────────────────────────────────
function $(id){return document.getElementById(id)}
function $$(sel,root){return Array.from((root||document).querySelectorAll(sel))}
function fmt(n,opts){opts=opts||{};if(n==null||isNaN(n))return '—';var v=Number(n);return (opts.sign&&v>=0?'+':'')+v.toLocaleString('en-NZ',{maximumFractionDigits:opts.dp==null?0:opts.dp,minimumFractionDigits:opts.dp==null?0:opts.dp})}
function fmtMoney(n,ccy){if(n==null||isNaN(n))return '—';return fmt(n,{dp:0})+' '+(ccy||'NZD')}
function fmtPct(n){if(n==null||isNaN(n))return '—';return (n>=0?'+':'')+Number(n).toFixed(1)+'%'}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function thisMonth(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function debounce(fn,ms){var t;return function(){clearTimeout(t);var a=arguments,c=this;t=setTimeout(function(){fn.apply(c,a)},ms)}}

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
  clearTimeout(toast._t); toast._t=setTimeout(function(){t.className='toast '+(kind||'');},3500);
}

// ─── State ─────────────────────────────────────────────
var state = {
  month: thisMonth(),
  workspace: localStorage.getItem('money_ws') || 'default',
  nwRange: parseInt(localStorage.getItem('money_nw_range')||'90',10),
  taxTab: 'es',
  taxYear: new Date().getFullYear(),
};

// ═══════════════════════════════════════════════════════
// PANELS
// ═══════════════════════════════════════════════════════

// ─── KPI strip ─────────────────────────────────────────
async function loadKPIs(){
  try{
    var r = await api('/api/finances/runway');
    var d = r.data;
    $('runway-value').textContent = (d.runway_days_90d>=999?'∞':d.runway_days_90d)+' d';
    $('runway-burn').textContent = fmtMoney(d.burn_rate_90d,'NZD/d') + ' burn';
    $('month-balance').textContent = fmtMoney(d.remaining_nzd);
    $('month-flow').innerHTML = '<span class="up">+'+fmt(d.income_nzd)+'</span> / <span class="down">-'+fmt(d.expense_nzd)+'</span>';
    if(d.net_worth_snapshot){
      $('nw-value').textContent = fmtMoney(d.net_worth_snapshot.total_nzd);
    }
  }catch(e){ $('runway-value').textContent='—'; toast('Runway: '+e.message,'err'); }
}

// ─── NW timeline (sparkline) ───────────────────────────
async function loadNW(){
  try{
    var r = await api('/api/finances/nw-timeline?days='+state.nwRange);
    var rows = r.data || [];
    var svg = $('nw-spark');
    if(!rows.length){ svg.innerHTML=''; $('nw-breakdown').innerHTML='<div class="empty">No NW snapshots yet</div>'; return; }
    var W=400, H=120, P=10;
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
      '<stop offset="0" stop-color="var(--accent)" stop-opacity=".5"/>'+
      '<stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>'+
      '</linearGradient></defs>'+
      '<path class="area" d="'+area+'"/>'+
      '<path class="line" d="'+path+'"/>';
    // Trend
    if(r.trend){
      var t = r.trend, klass = t.delta_nzd>=0?'up':'down', sign = t.delta_nzd>=0?'+':'';
      $('nw-trend').className = 'kpi-meta '+klass;
      $('nw-trend').textContent = sign+fmt(t.delta_nzd)+' NZD ('+fmtPct(t.delta_pct)+') · '+t.period_days+'d';
    }
    // Latest breakdown
    var last = rows[rows.length-1];
    var bk = last && last.breakdown || {};
    $('nw-breakdown').innerHTML = Object.keys(bk).map(function(k){
      return '<span>'+esc(k)+': <b>'+fmt(bk[k])+'</b></span>';
    }).join('');
  }catch(e){ toast('NW: '+e.message,'err'); }
}

// ─── Budget envelope ───────────────────────────────────
async function loadBudget(){
  try{
    $('budget-month').textContent = state.month;
    var r = await api('/api/finances/budget/carryover?month='+state.month+'&monthsBack=6');
    var rows = r.data || [];
    if(!rows.length){ $('budget-bars').innerHTML='<div class="empty">No budgets set. Add one →</div>'; return; }
    rows.sort(function(a,b){return (b.current_spent/b.monthly_limit) - (a.current_spent/a.monthly_limit);});
    var tpl = $('tpl-budget-bar');
    var frag = document.createDocumentFragment();
    rows.forEach(function(c){
      var node = tpl.content.cloneNode(true);
      var pct = c.effective_limit ? (c.current_spent / c.effective_limit * 100) : 0;
      var fill = node.querySelector('.bar-fill');
      fill.style.width = Math.min(100, pct)+'%';
      if(pct>=100) fill.classList.add('danger'); else if(pct>=80) fill.classList.add('warn');
      node.querySelector('.bar-cat').textContent = c.category;
      node.querySelector('.bar-amt').textContent = fmt(c.current_spent)+' / '+fmt(c.effective_limit)+' NZD';
      node.querySelector('.bar-pct').textContent = pct.toFixed(0)+'% used';
      node.querySelector('.bar-carry').textContent = c.carryover_balance>0 ? '+'+fmt(c.carryover_balance)+' carry' : '';
      frag.appendChild(node);
    });
    $('budget-bars').innerHTML=''; $('budget-bars').appendChild(frag);
  }catch(e){ $('budget-bars').innerHTML='<div class="empty">Error: '+esc(e.message)+'</div>'; }
}

// ─── Recurring ──────────────────────────────────────────
async function loadRecurring(){
  try{
    var r = await api('/api/finances/recurring');
    var rows = r.data || [];
    if(!rows.length){ $('recurring-list').innerHTML='<div class="empty">No recurring detected. Click <b>scan</b>.</div>'; return; }
    $('recurring-list').innerHTML = rows.map(function(x){
      var due = x.days_until;
      var dueClass = due==null?'':due<0?'overdue':due<=7?'soon':'';
      var dueText = due==null?'—':due<0?Math.abs(due)+'d overdue':due===0?'today':due+'d';
      return '<li>'+
        '<div><div class="rec-payee">'+esc(x.payee_normalized)+(x.confirmed?' <span class="rec-confirmed">✓</span>':'')+'</div>'+
        '<div class="rec-meta">'+esc(x.frequency)+' · '+x.sample_size+'× · conf '+(parseFloat(x.confidence)*100).toFixed(0)+'%</div></div>'+
        '<div class="rec-amt">'+fmt(x.amount_avg,{dp:2})+' '+esc(x.currency)+'</div>'+
        '<div class="rec-due '+dueClass+'">'+dueText+'</div>'+
        '<button class="btn btn-mini" data-rec-id="'+x.id+'" data-confirmed="'+(!x.confirmed)+'">'+(x.confirmed?'unconfirm':'confirm')+'</button>'+
        '</li>';
    }).join('');
    $$('#recurring-list button[data-rec-id]').forEach(function(b){
      b.addEventListener('click', function(){
        var id = b.dataset.recId, conf = b.dataset.confirmed==='true';
        api('/api/finances/recurring/'+id+'/confirm',{method:'PATCH', body:{confirmed:conf}})
          .then(function(){loadRecurring();})
          .catch(function(e){toast(e.message,'err');});
      });
    });
  }catch(e){ $('recurring-list').innerHTML='<div class="empty">Error: '+esc(e.message)+'</div>'; }
}

// ─── Investments ────────────────────────────────────────
async function loadInvestments(){
  try{
    var r = await api('/api/finances/investments');
    var positions = r.positions || [];
    var tbody = $('invest-table').querySelector('tbody');
    if(!positions.length){ tbody.innerHTML='<tr><td colspan=4 class="empty">No positions</td></tr>'; $('invest-total').textContent='—'; return; }
    var total = 0;
    tbody.innerHTML = positions.map(function(p){
      total += parseFloat(p.value_nzd)||0;
      var pnl = parseFloat(p.pnl_nzd)||0, pnlPct = parseFloat(p.pnl_pct)||0;
      var klass = pnl>=0?'pos':'neg';
      return '<tr><td><b>'+esc(p.symbol)+'</b><br><span style="color:var(--fg-mute);font-size:11px">'+esc(p.account||'')+'</span></td>'+
        '<td>'+fmt(p.quantity,{dp:p.quantity<10?2:0})+'</td>'+
        '<td>'+fmt(p.value_nzd)+'</td>'+
        '<td class="'+klass+'">'+(pnl>=0?'+':'')+fmt(pnl)+'<br><span style="font-size:11px">'+fmtPct(pnlPct)+'</span></td></tr>';
    }).join('');
    $('invest-total').textContent = fmt(total)+' NZD';
  }catch(e){ $('invest-total').textContent='err'; toast('Investments: '+e.message,'err'); }
}

// ─── Crypto ─────────────────────────────────────────────
async function loadCrypto(){
  try{
    var r = await api('/api/finances/crypto');
    var holdings = r.holdings || [];
    var tbody = $('crypto-table').querySelector('tbody');
    if(!holdings.length){ tbody.innerHTML='<tr><td colspan=4 class="empty">No holdings</td></tr>'; $('crypto-total').textContent='—'; return; }
    var total = 0;
    tbody.innerHTML = holdings.map(function(h){
      total += parseFloat(h.value_nzd)||0;
      return '<tr><td><b>'+esc(h.symbol)+'</b></td>'+
        '<td>'+fmt(h.amount,{dp:h.amount<1?4:2})+'</td>'+
        '<td>'+fmt(h.value_nzd)+'</td>'+
        '<td>'+esc(h.exchange||'—')+'</td></tr>';
    }).join('');
    $('crypto-total').textContent = fmt(total)+' NZD';
  }catch(e){ $('crypto-total').textContent='err'; }
}

// ─── Savings goals ──────────────────────────────────────
async function loadGoals(){
  try{
    var r = await api('/api/finances/savings-goals');
    var rows = r.data || [];
    if(!rows.length){ $('goals-list').innerHTML='<div class="empty">No goals. Click <b>+ goal</b>.</div>'; $('savings-pct').textContent='—'; return; }
    var totalTarget=0, totalCurrent=0;
    $('goals-list').innerHTML = rows.map(function(g){
      var pct = parseFloat(g.progress_pct)||0;
      totalTarget += parseFloat(g.target_amount); totalCurrent += parseFloat(g.current_amount);
      var dr = g.days_remaining;
      var drText = dr==null?'no deadline':dr<0?Math.abs(dr)+'d overdue':dr+'d left';
      return '<li>'+
        '<div class="goal-h"><span class="goal-name">'+esc(g.name)+'</span>'+
        '<span class="goal-amt">'+fmt(g.current_amount)+' / '+fmt(g.target_amount)+' '+esc(g.currency)+'</span></div>'+
        '<div class="goal-track"><div class="goal-fill" style="width:'+Math.min(100,pct)+'%"></div></div>'+
        '<div class="goal-foot"><span>'+pct.toFixed(0)+'%</span><span>'+drText+'</span></div>'+
        '</li>';
    }).join('');
    var avgPct = totalTarget>0 ? (totalCurrent/totalTarget*100) : 0;
    $('savings-pct').textContent = avgPct.toFixed(0)+'%';
    $('savings-meta').textContent = fmt(totalCurrent)+' / '+fmt(totalTarget)+' (mixed ccy)';
  }catch(e){ $('goals-list').innerHTML='<div class="empty">Error: '+esc(e.message)+'</div>'; }
}

// ─── Providers ──────────────────────────────────────────
async function loadProviders(){
  try{
    var r = await api('/api/finances/providers');
    $('providers-list').innerHTML = r.providers.map(function(p){
      return '<li><div><span class="dot '+(p.configured?'on':'off')+'"></span>'+esc(p.name)+
        '<div style="color:var(--fg-mute);font-size:11px;margin-left:16px">'+esc(p.scope)+'</div></div>'+
        '<a href="'+esc(p.docs)+'" target="_blank" rel="noopener" style="color:var(--accent-2);font-size:11px">docs ↗</a></li>';
    }).join('');
  }catch(e){ $('providers-list').innerHTML='<li class="empty">Error</li>'; }
}

// ─── FX ─────────────────────────────────────────────────
async function loadFX(){
  try{
    var r = await api('/api/finances/fx');
    var rows = r.data || [];
    $('fx-list').innerHTML = rows.map(function(x){
      return '<li><span class="ccy">NZD→'+esc(x.quote)+'</span><span>'+parseFloat(x.rate).toFixed(4)+'</span></li>';
    }).join('') || '<li class="empty">No FX cached</li>';
  }catch(e){ $('fx-list').innerHTML='<li class="empty">Error</li>'; }
}

// ─── Tax cockpit ────────────────────────────────────────
async function loadTaxES(){
  var year = state.taxYear;
  var qs = year ? '?year='+year : '';
  // Residency
  api('/api/finances/tax/residency-es'+qs).then(function(r){
    var d=r.data;
    $('tax-residency-es').querySelector('.tile-body').innerHTML =
      '<div class="row"><span>Days in ES</span><strong>'+d.days_in_es+' / '+d.threshold_days+'</strong></div>'+
      '<div class="row"><span>Resident?</span><strong>'+(d.is_resident?'YES':'no')+'</strong></div>'+
      '<div class="row"><span>To threshold</span><strong>'+(d.days_to_residency==null?'—':d.days_to_residency+' d')+'</strong></div>';
  }).catch(function(e){$('tax-residency-es').querySelector('.tile-body').textContent='Error: '+e.message;});
  // Modelo 100 (IRPF) — sections + total_eur
  api('/api/finances/tax/modelo-100'+qs).then(function(r){
    var d=r.data||{}, s=d.sections||{};
    $('tax-modelo-100').querySelector('.tile-body').innerHTML =
      '<div class="row"><span>Year</span><strong>'+(d.year||year||'—')+'</strong></div>'+
      '<div class="row"><span>Total IRPF base</span><strong>'+fmt(d.total_eur||0)+' EUR</strong></div>'+
      '<div class="row"><span>Trabajo</span><strong>'+fmt(s.rendimientos_trabajo||0)+'</strong></div>'+
      '<div class="row"><span>Actividades econ.</span><strong>'+fmt(s.actividades_economicas||0)+'</strong></div>'+
      '<div class="row"><span>Deadline</span><strong>'+esc(d.deadline||'—')+'</strong></div>';
  }).catch(function(e){$('tax-modelo-100').querySelector('.tile-body').textContent='Error: '+e.message;});
  // Modelo 720 (cuentas extranjero)
  api('/api/finances/tax/modelo-720'+qs).then(function(r){
    var d=r.data||{}, c1=d.categoria_1_cuentas_extranjero||{};
    $('tax-modelo-720').querySelector('.tile-body').innerHTML =
      '<div class="row"><span>Year</span><strong>'+(d.year||year||'—')+'</strong></div>'+
      '<div class="row"><span>Cuentas extranjero</span><strong>'+fmt(c1.total_eur||0)+' EUR</strong></div>'+
      '<div class="row"><span>Items</span><strong>'+(c1.items?c1.items.length:0)+'</strong></div>'+
      '<div class="row"><span>Threshold</span><strong>'+fmt(d.threshold_eur||50000)+' EUR</strong></div>'+
      '<div class="row"><span>Obligated?</span><strong>'+(d.obligated?'YES':'no')+'</strong></div>';
  }).catch(function(e){$('tax-modelo-720').querySelector('.tile-body').textContent='Error: '+e.message;});
  // Modelo 721 (crypto)
  api('/api/finances/tax/modelo-721'+qs).then(function(r){
    var d=r.data||{};
    $('tax-modelo-721').querySelector('.tile-body').innerHTML =
      '<div class="row"><span>Year</span><strong>'+(d.year||year||'—')+'</strong></div>'+
      '<div class="row"><span>Crypto value</span><strong>'+fmt(d.total_eur||0)+' EUR</strong></div>'+
      '<div class="row"><span>Holdings</span><strong>'+(d.items?d.items.length:0)+'</strong></div>'+
      '<div class="row"><span>Threshold</span><strong>'+fmt(d.threshold_eur||50000)+' EUR</strong></div>'+
      '<div class="row"><span>Obligated?</span><strong>'+(d.obligated?'YES':'no')+'</strong></div>';
  }).catch(function(e){$('tax-modelo-721').querySelector('.tile-body').textContent='Error: '+e.message;});
}

async function loadTaxNZ(){
  // FIF
  api('/api/finances/tax/fif-nz').then(function(r){
    var d=r.data||{}, info=$('tax-fif-nz').querySelector('.tile-body');
    info.innerHTML =
      '<div class="row"><span>Offshore positions</span><strong>'+(r.positions_used||0)+'</strong></div>'+
      '<div class="row"><span>Cost NZD</span><strong>'+fmt(d.total_cost_nzd||0)+'</strong></div>'+
      '<div class="row"><span>Market value</span><strong>'+fmt(d.total_market_value_nzd||0)+' NZD</strong></div>'+
      '<div class="row"><span>De minimis</span><strong>50,000 NZD</strong></div>'+
      '<div class="row"><span>FIF applies</span><strong>'+(d.exempt?'no (exempt)':'YES')+'</strong></div>'+
      '<div class="row"><span>Method</span><strong>'+esc(d.method||'—')+'</strong></div>'+
      '<div class="row"><span>FIF income</span><strong>'+fmt(d.fif_income_nzd||0)+' NZD</strong></div>'+
      '<div class="row"><span>Tax payable</span><strong>'+fmt(d.tax_payable_nzd||0)+' NZD</strong></div>';
  }).catch(function(e){$('tax-fif-nz').querySelector('.tile-body').textContent='Error: '+e.message;});
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

// ─── Quick add transaction ──────────────────────────────
function setupTxForm(){
  $('category-list').innerHTML = CATEGORY_HINTS.map(function(c){return '<option value="'+c+'">';}).join('');
  $('tx-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var fd = new FormData(ev.target);
    var body = {};
    fd.forEach(function(v,k){if(v!=='') body[k]=v;});
    body.amount = parseFloat(body.amount);
    var msg = $('tx-form-msg');
    msg.textContent='Saving…'; msg.className='form-msg';
    try{
      var r = await api('/api/finances',{method:'POST', body:body});
      msg.textContent='✓ Added (id '+(r.data.id)+')'+(r.firefly && r.firefly.ok?' + Firefly':'');
      msg.className='form-msg ok';
      ev.target.reset();
      // Refresh dependent panels
      loadKPIs(); loadBudget(); loadRecurring();
    }catch(e){
      msg.textContent='✗ '+e.message; msg.className='form-msg err';
    }
  });
}

// ─── CSV import ────────────────────────────────────────
function setupCsv(){
  var dz = $('dz-csv'), file = $('csv-file');
  ;['dragenter','dragover'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault(); dz.classList.add('drag');});});
  ;['dragleave','drop'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault(); dz.classList.remove('drag');});});
  dz.addEventListener('drop', function(e){
    if(e.dataTransfer.files[0]) file.files = e.dataTransfer.files;
  });
  $('csv-upload-btn').addEventListener('click', async function(){
    var f = file.files[0]; if(!f){toast('Pick a CSV file','err'); return;}
    var fd = new FormData(); fd.append('file', f); fd.append('bank', $('csv-bank').value);
    var msg = $('csv-result'); msg.textContent='Uploading…'; msg.className='form-msg';
    try{
      var r = await apiForm('/api/finances/import-csv', fd);
      msg.textContent='✓ '+r.bank_name+' · '+r.inserted+' inserted, '+r.skipped_duplicates+' dupes, '+r.failed+' failed';
      msg.className='form-msg ok';
      loadKPIs(); loadBudget();
    }catch(e){msg.textContent='✗ '+e.message; msg.className='form-msg err';}
  });
}

// ─── Receipt OCR ───────────────────────────────────────
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
          toast('Receipt added','ok'); loadKPIs(); loadBudget();
        }catch(e){toast(e.message,'err');}
      });
    }catch(e){msg.textContent='✗ '+e.message; msg.className='form-msg err';}
  });
}

// ─── Budget add (prompt) ────────────────────────────────
function setupBudgetAdd(){
  $('budget-add-btn').addEventListener('click', async function(){
    var cat = prompt('Category (e.g. groceries):'); if(!cat) return;
    var lim = parseFloat(prompt('Monthly limit NZD:')); if(!lim||lim<=0) return;
    try{
      await api('/api/finances/budget',{method:'POST', body:{category:cat, monthly_limit:lim}});
      toast('Budget set','ok'); loadBudget();
    }catch(e){toast(e.message,'err');}
  });
}

// ─── Goal add ───────────────────────────────────────────
function setupGoalAdd(){
  $('goal-add-btn').addEventListener('click', async function(){
    var name = prompt('Goal name:'); if(!name) return;
    var target = parseFloat(prompt('Target amount:')); if(!target||target<=0) return;
    var current = parseFloat(prompt('Current saved (optional, default 0):')||'0');
    var ccy = prompt('Currency (default NZD):','NZD')||'NZD';
    var date = prompt('Target date YYYY-MM-DD (optional):');
    try{
      await api('/api/finances/savings-goals',{method:'POST', body:{name:name, target_amount:target, current_amount:current, currency:ccy, target_date:date||null}});
      toast('Goal added','ok'); loadGoals();
    }catch(e){toast(e.message,'err');}
  });
}

// ─── Recurring detect ───────────────────────────────────
function setupRecurringDetect(){
  $('recurring-detect-btn').addEventListener('click', async function(){
    try{
      var r = await api('/api/finances/recurring/detect',{method:'POST', body:{lookback_days:365, min_samples:3}});
      toast('Detected '+(r.detected||0)+' recurring','ok');
      loadRecurring();
    }catch(e){toast(e.message,'err');}
  });
}

// ─── FX refresh ─────────────────────────────────────────
function setupFxRefresh(){
  $('fx-refresh-btn').addEventListener('click', async function(){
    try{ await api('/api/finances/fx/refresh',{method:'POST'}); toast('FX refreshed','ok'); loadFX(); }
    catch(e){toast(e.message,'err');}
  });
}

// ─── Workspace + month controls ─────────────────────────
function applyWorkspace(){
  var ws = WORKSPACES[state.workspace] || WORKSPACES.default;
  if(ws.range){ state.nwRange = ws.range; $('nw-range').value = ws.range; }
  if(ws.taxTab){
    state.taxTab = ws.taxTab;
    $$('.tab').forEach(function(t){t.classList.toggle('active', t.dataset.taxTab===ws.taxTab);});
    $$('.tax-pane').forEach(function(p){p.classList.toggle('hidden', p.dataset.taxPane!==ws.taxTab);});
  }
  // Panel visibility (default = all)
  $$('.card[data-panel]').forEach(function(c){
    var visible = ws.panels==='all' || ws.panels.indexOf(c.dataset.panel)>=0;
    c.style.display = visible ? '' : 'none';
  });
  $('workspace-select').value = state.workspace;
}

function setupControls(){
  $('month-picker').value = state.month;
  $('month-picker').addEventListener('change', function(){
    state.month = this.value || thisMonth();
    loadBudget(); loadKPIs();
  });
  $('workspace-select').addEventListener('change', function(){
    state.workspace = this.value;
    localStorage.setItem('money_ws', state.workspace);
    applyWorkspace();
    if(state.taxTab==='es') loadTaxES(); else loadTaxNZ();
  });
  $('nw-range').addEventListener('change', function(){
    state.nwRange = parseInt(this.value,10);
    localStorage.setItem('money_nw_range', state.nwRange);
    loadNW();
  });
  $('refresh-btn').addEventListener('click', refreshAll);
  document.addEventListener('keydown', function(e){
    if(e.target.matches('input,select,textarea')) return;
    if(e.key==='r'||e.key==='R') refreshAll();
  });
}

function refreshAll(){
  loadKPIs(); loadNW(); loadBudget(); loadRecurring(); loadInvestments();
  loadCrypto(); loadGoals(); loadProviders(); loadFX();
  if(state.taxTab==='es') loadTaxES(); else loadTaxNZ();
}

// ─── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  setupControls();
  setupTax();
  setupTxForm();
  setupCsv();
  setupReceipt();
  setupBudgetAdd();
  setupGoalAdd();
  setupRecurringDetect();
  setupFxRefresh();
  applyWorkspace();
  refreshAll();
});

})();
