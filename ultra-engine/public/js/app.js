// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA SYSTEM — Dashboard JavaScript                     ║
// ║  Fetch API + render dinámico + interactividad            ║
// ╚══════════════════════════════════════════════════════════╝

const API = '';
const TYPE_EMOJI = {
  visa: '🛂', pasaporte: '📕', seguro: '🛡️',
  wof: '🚗', rego: '🚙', ird: '💰', otro: '📄', default: '📄',
};

// ═══════════════════════════════════════════════════════════
//  INIT — Cargar datos al inicio
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  setInterval(loadAll, 60000); // Auto-refresh cada 60s
});

async function loadAll() {
  await Promise.all([
    loadStatus(),
    loadDocuments(),
    loadNews(),
    loadJobs(),
    loadFinances(),
    loadOpportunities(),
    loadLogistics(),
    loadBio(),
    loadScheduler(),
  ]);
}

// ═══════════════════════════════════════════════════════════
//  STATUS
// ═══════════════════════════════════════════════════════════
async function loadStatus() {
  try {
    const res = await fetch(`${API}/api/status`);
    const { data } = await res.json();

    document.getElementById('docsTotal').textContent = data.documents.active;
    document.getElementById('docsUrgent').textContent = data.documents.urgent;
    document.getElementById('newsCount').textContent = data.news.articles;
    document.getElementById('jobsCount').textContent = data.jobs.listings;

    const uptime = formatUptime(data.system.uptime);
    document.getElementById('uptimeText').textContent = `Activo · ${uptime}`;
  } catch {
    document.getElementById('uptimeText').textContent = 'Sin conexión';
  }
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// ═══════════════════════════════════════════════════════════
//  DOCUMENTS (P4)
// ═══════════════════════════════════════════════════════════
async function loadDocuments() {
  try {
    const res = await fetch(`${API}/api/documents`);
    const { data } = await res.json();
    renderDocuments(data);
  } catch {
    document.getElementById('docsList').innerHTML = '<p class="empty-state">Error cargando documentos</p>';
  }
}

function renderDocuments(docs) {
  const container = document.getElementById('docsList');

  if (!docs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">📂</span>
        <p>No hay documentos registrados</p>
        <button class="btn btn--primary" onclick="openDocModal()" style="margin-top:12px">+ Añadir primer documento</button>
      </div>`;
    return;
  }

  container.innerHTML = docs.map(doc => {
    const emoji = TYPE_EMOJI[doc.document_type] || TYPE_EMOJI.default;
    const days = doc.days_remaining;
    const expDate = new Date(doc.expiry_date).toLocaleDateString('es-ES');
    let daysClass = 'days--ok';
    let badge = '<span class="badge badge--success">OK</span>';

    if (days < 0) {
      daysClass = 'days--expired';
      badge = '<span class="badge badge--danger">EXPIRADO</span>';
    } else if (days <= 7) {
      daysClass = 'days--danger';
      badge = '<span class="badge badge--danger">URGENTE</span>';
    } else if (days <= 30) {
      daysClass = 'days--warning';
      badge = '<span class="badge badge--warning">PRONTO</span>';
    }

    return `
      <div class="doc-row">
        <div class="doc-row__left">
          <span class="doc-row__emoji">${emoji}</span>
          <div>
            <div class="doc-row__name">${doc.document_name}</div>
            <div class="doc-row__type">${doc.document_type} · ${expDate} ${badge}</div>
          </div>
        </div>
        <div class="doc-row__right">
          <div class="doc-row__days">
            <span class="doc-row__days-value ${daysClass}">${days < 0 ? 'Exp.' : days}</span>
            <span class="doc-row__days-label">${days < 0 ? '' : 'días'}</span>
          </div>
          <div class="doc-row__actions">
            <button class="btn btn--danger btn--small" onclick="deleteDocument(${doc.id})">🗑️</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  NEWS (P1)
// ═══════════════════════════════════════════════════════════
async function loadNews() {
  try {
    const res = await fetch(`${API}/api/feeds/articles?limit=10`);
    const { data } = await res.json();
    renderNews(data);
  } catch {
    // Keep empty state
  }
}

function renderNews(articles) {
  const container = document.getElementById('newsList');
  if (!articles || !articles.length) return;

  container.innerHTML = articles.map(a => {
    const date = new Date(a.published_at).toLocaleDateString('es-ES');
    return `
      <div class="news-item">
        <div class="news-item__title">
          <a href="${a.url}" target="_blank" rel="noopener">${a.title}</a>
        </div>
        <div class="news-item__meta">${a.feed_name || ''} · ${date}</div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  JOBS (P2)
// ═══════════════════════════════════════════════════════════
async function loadJobs() {
  try {
    const res = await fetch(`${API}/api/jobs?limit=10`);
    const { data } = await res.json();
    renderJobs(data);
  } catch {
    // Keep empty state
  }
}

function renderJobs(listings) {
  const container = document.getElementById('jobsList');
  if (!listings || !listings.length) return;

  container.innerHTML = listings.map(j => {
    const date = new Date(j.found_at).toLocaleDateString('es-ES');
    return `
      <div class="job-item">
        <div class="job-item__title">
          <a href="${j.url}" target="_blank" rel="noopener">${j.title}</a>
        </div>
        <div class="job-item__meta">${j.source_name || ''} · ${j.region} · ${date}</div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  SCHEDULER
// ═══════════════════════════════════════════════════════════
async function loadScheduler() {
  try {
    const res = await fetch(`${API}/api/status`);
    const { data } = await res.json();
    renderScheduler(data.scheduler.jobs);
  } catch {
    // Silently fail
  }
}

function renderScheduler(jobs) {
  const container = document.getElementById('schedulerList');
  if (!jobs || !jobs.length) {
    container.innerHTML = '<p class="empty-state">Sin jobs configurados</p>';
    return;
  }

  container.innerHTML = jobs.map(j => `
    <div class="sched-item">
      <div>
        <div class="sched-item__name">${j.name}</div>
        <div class="sched-item__desc">${j.description}</div>
      </div>
      <span class="sched-item__cron">${j.schedule}</span>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════════
function openDocModal() { openModal('docModal'); }
function openUploadModal() { openModal('uploadModal'); }
function openFeedModal() { openModal('feedModal'); }
function openJobSourceModal() { openModal('jobSourceModal'); }
function openFinanceModal() {
  document.getElementById('finDate').value = new Date().toISOString().split('T')[0];
  openModal('financeModal');
}
function openOpportunityModal() { openModal('opportunityModal'); }
function openLogisticsModal() { openModal('logisticsModal'); }
function openBioModal() { openModal('bioModal'); }

function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
      m.classList.remove('active');
    });
    document.body.style.overflow = '';
  }
});

// ═══════════════════════════════════════════════════════════
//  FORM SUBMISSIONS
// ═══════════════════════════════════════════════════════════
async function submitDocument(e) {
  e.preventDefault();
  try {
    const body = {
      document_name: document.getElementById('docName').value,
      document_type: document.getElementById('docType').value,
      expiry_date: document.getElementById('docExpiry').value,
      alert_days: parseInt(document.getElementById('docAlertDays').value),
      notes: document.getElementById('docNotes').value || null,
    };

    const res = await fetch(`${API}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Error al guardar');

    toast('Documento añadido correctamente', 'success');
    closeModal('docModal');
    e.target.reset();
    await loadDocuments();
    await loadStatus();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function submitUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files.length) return;

  const btn = document.getElementById('uploadBtn');
  btn.textContent = '⏳ Procesando OCR...';
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const res = await fetch(`${API}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await res.json();
    if (!result.ok) throw new Error(result.error);

    // Show OCR result
    const ocrDiv = document.getElementById('ocrResult');
    const ocrText = document.getElementById('ocrText');
    ocrDiv.style.display = 'block';
    ocrText.textContent = result.ocr.text || 'No se pudo extraer texto';

    toast(`Archivo procesado (confianza: ${result.ocr.confidence}%)`, 'success');
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Subir y procesar';
    btn.disabled = false;
  }
}

async function submitFeed(e) {
  e.preventDefault();
  try {
    const body = {
      name: document.getElementById('feedName').value,
      url: document.getElementById('feedUrl').value,
      category: document.getElementById('feedCategory').value,
    };

    const res = await fetch(`${API}/api/feeds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Error al añadir feed');

    toast('Feed RSS añadido', 'success');
    closeModal('feedModal');
    e.target.reset();
    await loadNews();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function submitJobSource(e) {
  e.preventDefault();
  try {
    const body = {
      name: document.getElementById('jobSourceName').value,
      url: document.getElementById('jobSourceUrl').value,
      css_selector: document.getElementById('jobSourceSelector').value,
      region: document.getElementById('jobSourceRegion').value,
    };

    const res = await fetch(`${API}/api/jobs/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Error al añadir fuente');

    toast('Fuente de empleo añadida', 'success');
    closeModal('jobSourceModal');
    e.target.reset();
    await loadJobs();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  FINANCES (P3)
// ═══════════════════════════════════════════════════════════
async function loadFinances() {
  try {
    const [txRes, alertRes] = await Promise.all([
      fetch(`${API}/api/finances?limit=10`),
      fetch(`${API}/api/finances/alerts`),
    ]);
    const { data: transactions } = await txRes.json();
    const { data: alerts } = await alertRes.json();
    renderFinances(transactions, alerts);
  } catch {
    document.getElementById('financesList').innerHTML = '<p class="empty-state">Error cargando finanzas</p>';
  }
}

function renderFinances(transactions, alerts) {
  const container = document.getElementById('financesList');

  if ((!transactions || !transactions.length) && (!alerts || !alerts.length)) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">💰</span>
        <p>Añade transacciones para empezar</p>
      </div>`;
    return;
  }

  let html = '';

  if (alerts && alerts.length) {
    html += alerts.map(a => `
      <div class="item-row item-row--warning">
        <div class="item-row__left">
          <span class="item-row__icon">⚠️</span>
          <div>
            <div class="item-row__title">${a.category}</div>
            <div class="item-row__meta">Presupuesto al ${Math.round(a.percentage)}%</div>
          </div>
        </div>
        <div class="item-row__right">
          <span class="badge badge--warning">$${Number(a.spent).toFixed(0)} / $${Number(a.monthly_limit).toFixed(0)}</span>
        </div>
      </div>`).join('');
  }

  if (transactions && transactions.length) {
    html += transactions.map(tx => {
      const isIncome = tx.type === 'income';
      const sign = isIncome ? '+' : '-';
      const cls = isIncome ? 'amount--income' : 'amount--expense';
      const date = new Date(tx.date).toLocaleDateString('es-ES');
      return `
        <div class="item-row">
          <div class="item-row__left">
            <span class="item-row__icon">${isIncome ? '📈' : '📉'}</span>
            <div>
              <div class="item-row__title">${tx.description || tx.category}</div>
              <div class="item-row__meta">${tx.category} · ${date}</div>
            </div>
          </div>
          <div class="item-row__right">
            <span class="${cls}">${sign}$${Number(tx.amount).toFixed(2)}</span>
          </div>
        </div>`;
    }).join('');
  }

  container.innerHTML = html;
}

async function submitFinance(e) {
  e.preventDefault();
  try {
    const body = {
      type: document.getElementById('finType').value,
      amount: parseFloat(document.getElementById('finAmount').value),
      category: document.getElementById('finCategory').value,
      date: document.getElementById('finDate').value,
      description: document.getElementById('finDescription').value || null,
    };
    const res = await fetch(`${API}/api/finances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Error al guardar');
    toast('Transacción registrada', 'success');
    closeModal('financeModal');
    e.target.reset();
    await loadFinances();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  OPPORTUNITIES (P5)
// ═══════════════════════════════════════════════════════════
const OPP_STATUS_EMOJI = {
  new: '🆕', contacted: '📧', applied: '📝', won: '🏆', rejected: '❌',
};

async function loadOpportunities() {
  try {
    const res = await fetch(`${API}/api/opportunities?limit=10`);
    const { data } = await res.json();
    renderOpportunities(data);
  } catch {
    document.getElementById('opportunitiesList').innerHTML = '<p class="empty-state">Error cargando oportunidades</p>';
  }
}

function renderOpportunities(items) {
  const container = document.getElementById('opportunitiesList');

  if (!items || !items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🚀</span>
        <p>Añade oportunidades para empezar</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(opp => {
    const emoji = OPP_STATUS_EMOJI[opp.status] || '📋';
    const deadline = opp.deadline ? new Date(opp.deadline).toLocaleDateString('es-ES') : '';
    const deadlineBadge = opp.deadline ? `<span class="badge badge--ghost">${deadline}</span>` : '';
    return `
      <div class="item-row">
        <div class="item-row__left">
          <span class="item-row__icon">${emoji}</span>
          <div>
            <div class="item-row__title">${opp.url ? `<a href="${opp.url}" target="_blank" rel="noopener">${opp.title}</a>` : opp.title}</div>
            <div class="item-row__meta">${opp.category || ''} ${opp.source ? '· ' + opp.source : ''} · ${opp.status}</div>
          </div>
        </div>
        <div class="item-row__right">
          ${deadlineBadge}
        </div>
      </div>`;
  }).join('');
}

async function submitOpportunity(e) {
  e.preventDefault();
  try {
    const body = {
      title: document.getElementById('oppTitle').value,
      category: document.getElementById('oppCategory').value || null,
      status: document.getElementById('oppStatus').value,
      source: document.getElementById('oppSource').value || null,
      deadline: document.getElementById('oppDeadline').value || null,
      url: document.getElementById('oppUrl').value || null,
      notes: document.getElementById('oppNotes').value || null,
    };
    const res = await fetch(`${API}/api/opportunities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Error al guardar');
    toast('Oportunidad registrada', 'success');
    closeModal('opportunityModal');
    e.target.reset();
    await loadOpportunities();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  LOGISTICS (P6)
// ═══════════════════════════════════════════════════════════
const LOG_TYPE_EMOJI = {
  transport: '🚗', accommodation: '🏠', visa: '🛂', appointment: '📅',
};

async function loadLogistics() {
  try {
    const res = await fetch(`${API}/api/logistics/next48h`);
    const { data } = await res.json();
    renderLogistics(data);
  } catch {
    try {
      const res = await fetch(`${API}/api/logistics?limit=10`);
      const { data } = await res.json();
      renderLogistics(data);
    } catch {
      document.getElementById('logisticsList').innerHTML = '<p class="empty-state">Error cargando logística</p>';
    }
  }
}

function renderLogistics(items) {
  const container = document.getElementById('logisticsList');

  if (!items || !items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🗺️</span>
        <p>Añade items para empezar</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const emoji = LOG_TYPE_EMOJI[item.type] || '📋';
    const date = new Date(item.date).toLocaleDateString('es-ES');
    const urgency = item.urgency;
    let urgBadge = '';
    if (urgency === 'now') urgBadge = '<span class="badge badge--danger">AHORA</span>';
    else if (urgency === 'today') urgBadge = '<span class="badge badge--warning">HOY</span>';
    else if (urgency === 'tomorrow') urgBadge = '<span class="badge badge--ghost">MAÑANA</span>';

    return `
      <div class="item-row">
        <div class="item-row__left">
          <span class="item-row__icon">${emoji}</span>
          <div>
            <div class="item-row__title">${item.title}</div>
            <div class="item-row__meta">${item.type} ${item.location ? '· ' + item.location : ''} · ${date}</div>
          </div>
        </div>
        <div class="item-row__right">
          ${urgBadge}
        </div>
      </div>`;
  }).join('');
}

async function submitLogistics(e) {
  e.preventDefault();
  try {
    const body = {
      type: document.getElementById('logType').value,
      title: document.getElementById('logTitle').value,
      date: document.getElementById('logDate').value,
      location: document.getElementById('logLocation').value || null,
      notes: document.getElementById('logNotes').value || null,
    };
    const res = await fetch(`${API}/api/logistics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Error al guardar');
    toast('Item logístico añadido', 'success');
    closeModal('logisticsModal');
    e.target.reset();
    await loadLogistics();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  BIO-CHECK (P7)
// ═══════════════════════════════════════════════════════════
async function loadBio() {
  try {
    const [checksRes, trendsRes] = await Promise.all([
      fetch(`${API}/api/bio?limit=7`),
      fetch(`${API}/api/bio/trends`),
    ]);
    const { data: checks } = await checksRes.json();
    const { data: trends } = await trendsRes.json();
    renderBio(checks, trends);
  } catch {
    document.getElementById('bioList').innerHTML = '<p class="empty-state">Error cargando bio-checks</p>';
  }
}

function renderBio(checks, trends) {
  const container = document.getElementById('bioList');

  if (!checks || !checks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🫀</span>
        <p>Añade tu primer check diario para empezar</p>
      </div>`;
    return;
  }

  let html = '';

  if (trends && trends.length) {
    const latest = trends[0];
    html += `
      <div class="bio-summary">
        <div class="bio-summary__item">
          <span class="bio-summary__label">Sueño</span>
          <span class="bio-summary__value">${Number(latest.avg_sleep).toFixed(1)}h</span>
        </div>
        <div class="bio-summary__item">
          <span class="bio-summary__label">Energía</span>
          <span class="bio-summary__value">${Number(latest.avg_energy).toFixed(1)}</span>
        </div>
        <div class="bio-summary__item">
          <span class="bio-summary__label">Ánimo</span>
          <span class="bio-summary__value">${Number(latest.avg_mood).toFixed(1)}</span>
        </div>
        <div class="bio-summary__item">
          <span class="bio-summary__label">Ejercicio</span>
          <span class="bio-summary__value">${Number(latest.avg_exercise).toFixed(0)}m</span>
        </div>
      </div>`;
  }

  html += checks.map(c => {
    const date = new Date(c.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const moodEmoji = c.mood >= 7 ? '😊' : c.mood >= 4 ? '😐' : '😔';
    return `
      <div class="item-row">
        <div class="item-row__left">
          <span class="item-row__icon">${moodEmoji}</span>
          <div>
            <div class="item-row__title">${date}</div>
            <div class="item-row__meta">${c.notes || ''}</div>
          </div>
        </div>
        <div class="item-row__right bio-metrics">
          <span title="Sueño">😴 ${Number(c.sleep_hours).toFixed(1)}h</span>
          <span title="Energía">⚡ ${c.energy_level}</span>
          <span title="Ejercicio">🏃 ${c.exercise_minutes}m</span>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

async function submitBio(e) {
  e.preventDefault();
  try {
    const body = {
      sleep_hours: parseFloat(document.getElementById('bioSleep').value),
      energy_level: parseInt(document.getElementById('bioEnergy').value),
      mood: parseInt(document.getElementById('bioMood').value),
      exercise_minutes: parseInt(document.getElementById('bioExercise').value) || 0,
      notes: document.getElementById('bioNotes').value || null,
    };
    const res = await fetch(`${API}/api/bio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Error al guardar');
    toast('Bio-check registrado', 'success');
    closeModal('bioModal');
    e.target.reset();
    await loadBio();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  ACTIONS
// ═══════════════════════════════════════════════════════════
async function deleteDocument(id) {
  if (!confirm('¿Eliminar este documento?')) return;
  try {
    const res = await fetch(`${API}/api/documents/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    toast('Documento eliminado', 'success');
    await loadDocuments();
    await loadStatus();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
function toast(message, type = 'info') {
  const container = document.getElementById('toasts');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(60px)';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// ═══════════════════════════════════════════════════════════
//  FILE DROP ZONE
// ═══════════════════════════════════════════════════════════
const fileDrop = document.getElementById('fileDrop');
if (fileDrop) {
  fileDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDrop.classList.add('dragover');
  });
  fileDrop.addEventListener('dragleave', () => {
    fileDrop.classList.remove('dragover');
  });
  fileDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDrop.classList.remove('dragover');
    const fileInput = document.getElementById('fileInput');
    fileInput.files = e.dataTransfer.files;
    fileDrop.querySelector('.file-drop__text').textContent = `📎 ${e.dataTransfer.files[0].name}`;
  });

  document.getElementById('fileInput').addEventListener('change', function() {
    if (this.files.length) {
      fileDrop.querySelector('.file-drop__text').textContent = `📎 ${this.files[0].name}`;
    }
  });
}
