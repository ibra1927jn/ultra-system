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
