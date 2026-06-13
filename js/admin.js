// ══════════════════════════════════════════════
//  CRMW — embudo.js · tareas.js · terminadas.js
//         admin.js · predefinidos.js
//  (Módulos combinados en un solo archivo)
// ══════════════════════════════════════════════

'use strict';

// ════════════════════════════════
//  EMBUDO (KANBAN)
// ════════════════════════════════

function renderEmbudo() {
  const board = document.getElementById('embudo-board');
  if (!board) return;

  const etapas = S.embudo.etapas || ['Conversaciones','Descubierto','Cotizado','Cerrado'];
  board.innerHTML = etapas.map(etapa => buildKanbanCol(etapa)).join('');

  // Drag & drop
  board.querySelectorAll('.kanban-col-body').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.style.background = 'var(--accent-dim)'; });
    col.addEventListener('dragleave', () => { col.style.background = ''; });
    col.addEventListener('drop', e => {
      e.preventDefault(); col.style.background = '';
      const phone = e.dataTransfer.getData('phone');
      const etapa = col.dataset.etapa;
      if (phone && etapa) { moverEnEmbudo(phone, etapa); renderEmbudo(); }
    });
  });
}

function buildKanbanCol(etapa) {
  const tarjetas = (S.embudo.tarjetas?.[etapa] || []);
  const count = tarjetas.length;
  const cardsHtml = tarjetas.map(phone => buildKanbanCard(phone, etapa)).join('');

  return `
  <div class="kanban-col">
    <div class="kanban-col-header">
      <span class="kanban-col-title">${escHtml(etapa)}</span>
      <div style="display:flex;gap:5px;align-items:center;">
        <span class="kanban-col-count">${count}</span>
        ${etapa !== 'Conversaciones' ? `
        <button onclick="moverColumna('${etapa}',-1)" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px;" title="Mover izquierda"><i class="ti ti-chevron-left"></i></button>
        <button onclick="moverColumna('${etapa}',1)"  style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px;" title="Mover derecha"><i class="ti ti-chevron-right"></i></button>
        <button onclick="eliminarEtapa('${etapa}')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px;" title="Eliminar etapa"><i class="ti ti-trash"></i></button>` : ''}
      </div>
    </div>
    <div class="kanban-col-body" data-etapa="${escHtml(etapa)}">${cardsHtml ||
      `<div style="text-align:center;padding:20px;color:var(--text3);font-size:11px;">Arrastrá conversaciones aquí</div>`
    }</div>
  </div>`;
}

function buildKanbanCard(phone, etapa) {
  const conv   = S.conversaciones.find(c => c.phone === phone);
  const busq   = S.busquedas.find(b => b.phone === phone && !b.terminada);
  const nombre = conv?.nombre || phone;
  const hora   = conv?.lastTs ? new Date(conv.lastTs).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';

  return `<div class="kanban-card" draggable="true"
    ondragstart="event.dataTransfer.setData('phone','${phone}')"
    ondblclick="irAConversacion('${phone}')">
    <div class="kanban-card-name">${escHtml(nombre)}</div>
    ${busq ? `<div class="kanban-card-meta">${escHtml(busq.tipo||'')} ${busq.rango ? '· '+escHtml(busq.rango) : ''}</div>` : ''}
    <div class="kanban-card-tags">
      ${busq?.tipo ? `<span class="tag tag-gamer" style="font-size:9px;">${escHtml(busq.tipo)}</span>` : ''}
    </div>
    ${conv?.lastTs ? `<div class="kanban-card-date">${hora}</div>` : ''}
    ${conv?.operador ? `<div class="kanban-card-op">Op: ${escHtml(conv.operador)}</div>` : ''}
  </div>`;
}

function irAConversacion(phone) {
  switchTab('conversaciones');
  setTimeout(() => abrirConversacion(phone), 100);
}

function agregarEtapa() {
  const nombre = prompt('Nombre de la nueva etapa:');
  if (!nombre?.trim()) return;
  if (!S.embudo.etapas.includes(nombre.trim())) {
    S.embudo.etapas.push(nombre.trim());
    saveToFirebase('crmw_embudo', S.embudo);
    renderEmbudo();
  }
}

function moverColumna(etapa, dir) {
  const idx = S.embudo.etapas.indexOf(etapa);
  if (idx === -1) return;
  const newIdx = idx + dir;
  if (newIdx < 1 || newIdx >= S.embudo.etapas.length) return;
  S.embudo.etapas.splice(idx, 1);
  S.embudo.etapas.splice(newIdx, 0, etapa);
  saveToFirebase('crmw_embudo', S.embudo);
  renderEmbudo();
}

function eliminarEtapa(etapa) {
  if (!confirm(`¿Eliminar la etapa "${etapa}"? Las conversaciones volverán a Conversaciones.`)) return;
  const tarjetas = S.embudo.tarjetas?.[etapa] || [];
  tarjetas.forEach(phone => {
    if (!S.embudo.tarjetas['Conversaciones']) S.embudo.tarjetas['Conversaciones'] = [];
    if (!S.embudo.tarjetas['Conversaciones'].includes(phone))
      S.embudo.tarjetas['Conversaciones'].push(phone);
  });
  delete S.embudo.tarjetas[etapa];
  S.embudo.etapas = S.embudo.etapas.filter(e => e !== etapa);
  saveToFirebase('crmw_embudo', S.embudo);
  renderEmbudo();
}


// ════════════════════════════════
//  TAREAS
// ════════════════════════════════

function renderTareas() {
  renderTareasPendientes();
  renderTareasRealizadas();
}

function renderTareasPendientes() {
  const container = document.getElementById('tareas-pendientes-list');
  if (!container || !S.usuario) return;
  const mias = S.tareas.filter(t => t.operador === S.usuario.email && !t.realizada);

  if (!mias.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">Sin tareas pendientes</div>`;
    return;
  }

  container.innerHTML = mias.map(t => `
    <div class="tarea-item" draggable="true"
      ondragstart="event.dataTransfer.setData('tareaId','${t.id}')"
      ondblclick="abrirDetalleTarea('${t.id}')">
      <div style="flex:1;">
        <div class="tarea-title">${escHtml(t.titulo)}</div>
        <div class="tarea-detail">${escHtml((t.detalles||'').slice(0,60))}</div>
      </div>
      <span class="tarea-date">${t.fecha||''}</span>
      <div class="tarea-actions">
        <button class="tarea-move-btn" onclick="finalizarTarea('${t.id}')" title="Finalizar tarea"><i class="ti ti-check"></i></button>
      </div>
    </div>`).join('');

  // Drop zone para realizar
  const realizadas = document.getElementById('tareas-realizadas-list');
  if (realizadas) {
    realizadas.addEventListener('dragover', e => { e.preventDefault(); realizadas.style.outline = '2px dashed var(--green)'; });
    realizadas.addEventListener('dragleave', () => { realizadas.style.outline = ''; });
    realizadas.addEventListener('drop', e => {
      e.preventDefault(); realizadas.style.outline = '';
      const id = e.dataTransfer.getData('tareaId');
      if (id) finalizarTarea(id);
    });
  }
}

function renderTareasRealizadas(desde, hasta) {
  const container = document.getElementById('tareas-realizadas-list');
  if (!container || !S.usuario) return;
  let realizadas = S.tareas.filter(t => t.operador === S.usuario.email && t.realizada);
  if (desde) realizadas = realizadas.filter(t => new Date(t.tsTerminada||0) >= new Date(desde));
  if (hasta) realizadas = realizadas.filter(t => new Date(t.tsTerminada||0) <= new Date(hasta+'T23:59:59'));
  realizadas.sort((a,b) => (b.tsTerminada||0)-(a.tsTerminada||0));

  if (!realizadas.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">Sin tareas realizadas</div>`;
    return;
  }
  container.innerHTML = realizadas.map(t => `
    <div class="tarea-item" style="opacity:0.65;" ondblclick="abrirDetalleTarea('${t.id}')">
      <div style="flex:1;">
        <div class="tarea-title" style="text-decoration:line-through;">${escHtml(t.titulo)}</div>
        <div class="tarea-detail">${escHtml((t.detalles||'').slice(0,60))}</div>
      </div>
      <span class="tarea-date">${t.fechaFin||''}</span>
      <button class="mini-btn" onclick="recuperarTarea('${t.id}')">Recuperar</button>
    </div>`).join('');
}

function filtrarTareasRealizadas() {
  const desde = document.getElementById('tareas-fecha-desde')?.value;
  const hasta = document.getElementById('tareas-fecha-hasta')?.value;
  renderTareasRealizadas(desde, hasta);
}

// Paleta de colores para nodales de tareas
const COLORES_NODAL = [
  { nombre: 'Amarillo', bg: '#fef3cd', border: '#f0c020', text: '#7a5c00' },
  { nombre: 'Celeste',  bg: '#d4e9f7', border: '#2d7dd2', text: '#0d4a7a' },
  { nombre: 'Verde',    bg: '#d4f0e0', border: '#1d9e75', text: '#0a5c40' },
  { nombre: 'Rosa',     bg: '#fcdce6', border: '#ff5a8a', text: '#8a2050' },
  { nombre: 'Lila',     bg: '#e8ddf7', border: '#b07ce8', text: '#5c3a8a' },
  { nombre: 'Naranja',  bg: '#fde0cd', border: '#e8884f', text: '#8a4a20' },
  { nombre: 'Gris',     bg: '#e8e8e8', border: '#999', text: '#555' },
];
let tareaColorSel = 0;

function renderTareaColorPicker(selIdx) {
  tareaColorSel = selIdx || 0;
  const cont = document.getElementById('tarea-color-picker');
  if (!cont) return;
  cont.innerHTML = COLORES_NODAL.map((c, i) => `
    <span onclick="seleccionarColorTarea(${i})" title="${c.nombre}"
      style="width:30px;height:30px;border-radius:8px;background:${c.bg};border:3px solid ${i===tareaColorSel?c.border:'transparent'};cursor:pointer;display:inline-block;box-shadow:inset 0 0 0 1px ${c.border};"></span>
  `).join('');
}

function seleccionarColorTarea(i) {
  tareaColorSel = i;
  renderTareaColorPicker(i);
}

function abrirNuevaTarea() {
  document.getElementById('modal-tarea-title').textContent = 'Nueva tarea';
  document.getElementById('tarea-titulo').value = '';
  document.getElementById('tarea-detalles').value = '';
  document.getElementById('tarea-recordatorios-list').innerHTML = '';
  document.getElementById('modal-tarea').dataset.editId = '';
  const btnFin = document.getElementById('btn-finalizar-tarea');
  const btnCrear = document.querySelector('#modal-tarea .btn-primary');
  if (btnFin) btnFin.style.display = 'none';
  if (btnCrear) btnCrear.style.display = 'inline-flex';
  renderTareaColorPicker(0);
  abrirModal('modal-tarea');
}

function abrirDetalleTarea(id) {
  const t = S.tareas.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-tarea-title').textContent = t.realizada ? 'Tarea realizada' : 'Editar tarea';
  document.getElementById('tarea-titulo').value   = t.titulo   || '';
  document.getElementById('tarea-detalles').value = t.detalles || '';
  document.getElementById('modal-tarea').dataset.editId = id;
  renderTareaColorPicker(t.colorIdx || 0);

  const btnFin = document.getElementById('btn-finalizar-tarea');
  const btnCrear = document.querySelector('#modal-tarea .btn-primary');
  if (btnFin) btnFin.style.display = t.realizada ? 'none' : 'inline-flex';
  if (btnCrear) btnCrear.style.display = 'none';

  const recList = S.recordatorios.filter(r => r.tareaId === id);
  document.getElementById('tarea-recordatorios-list').innerHTML = recList.map(r => `
    <div style="background:var(--nodal-tarea-bg);border:1px solid var(--nodal-tarea-border);border-radius:var(--radius);padding:7px 10px;margin-bottom:5px;font-size:12px;">
      <strong>${escHtml(r.titulo)}</strong> — ${r.fecha||''}
    </div>`).join('');

  abrirModal('modal-tarea');
}

function finalizarTareaDesdeModal() {
  const id = document.getElementById('modal-tarea').dataset.editId;
  if (!id) return;
  cerrarModal('modal-tarea');
  finalizarTarea(id);
}

function guardarTarea() {
  if (!S.usuario) return;
  const titulo   = document.getElementById('tarea-titulo').value.trim();
  const detalles = document.getElementById('tarea-detalles').value.trim();
  if (!titulo) { showToast('Ingresá un título', 'error'); return; }

  const editId = document.getElementById('modal-tarea').dataset.editId;
  if (editId) {
    const t = S.tareas.find(x => x.id === editId);
    if (t) { t.titulo = titulo; t.detalles = detalles; t.colorIdx = tareaColorSel; }
  } else {
    S.tareas.push({
      id:           generarId('T'),
      titulo,
      detalles,
      colorIdx:     tareaColorSel,
      operador:     S.usuario.email,
      fecha:        fechaHoy(),
      horaCreacion: horaAhora(),
      createdAt:    Date.now(),
      realizada:    false
    });
  }

  saveToFirebase('crmw_tareas', S.tareas);
  renderTareas();
  renderPendientes();
  cerrarModal('modal-tarea');
  showToast('Tarea guardada');
}

function actualizarTarea() { guardarTarea(); }

function finalizarTarea(id) {
  const t = S.tareas.find(x => x.id === id);
  if (!t) return;
  t.realizada   = true;
  t.fechaFin    = fechaHoy();
  t.tsTerminada = Date.now();
  // Finalizar recordatorios
  S.recordatorios.filter(r => r.tareaId === id).forEach(r => r.mostrado = true);
  saveToFirebase('crmw_tareas', S.tareas);
  saveToFirebase('crmw_recordatorios', S.recordatorios);
  renderTareas();
  renderPendientes();
  renderTerminadas();
  showToast('Tarea realizada');
}

function recuperarTarea(id) {
  const t = S.tareas.find(x => x.id === id);
  if (!t) return;
  t.realizada   = false;
  t.fechaFin    = undefined;
  t.tsTerminada = undefined;
  saveToFirebase('crmw_tareas', S.tareas);
  renderTareas();
  renderPendientes();
  showToast('Tarea recuperada');
}

function agregarRecordatorioTarea() {
  const dt    = prompt('Fecha y hora (YYYY-MM-DDTHH:MM):');
  const titulo = prompt('Título del recordatorio:');
  if (!dt || !titulo) return;
  showToast('Recordatorio agregado a la tarea (se guardará al crear la tarea)');
}


// ════════════════════════════════
//  TERMINADAS
// ════════════════════════════════

function renderTerminadas() {
  const tbody = document.getElementById('term-tbody');
  if (!tbody || !S.usuario) return;

  const busquedas = S.busquedas.filter(b => b.terminada);
  const tareas    = S.tareas.filter(t => t.realizada);

  const todos = [
    ...busquedas.map(b => ({ ...b, _tipo: 'busqueda' })),
    ...tareas.map(t => ({ ...t, _tipo: 'tarea' }))
  ].sort((a,b) => (b.tsTerminada||0)-(a.tsTerminada||0));

  if (!todos.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text3);">Sin elementos terminados</td></tr>`;
    return;
  }

  tbody.innerHTML = todos.map(item => {
    const tipo = item._tipo;
    const tipoBadge = tipo === 'busqueda' ?
      `<span style="background:var(--nodal-busqueda-bg);color:var(--nodal-busqueda-text);padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;">Búsqueda</span>` :
      `<span style="background:var(--nodal-tarea-bg);color:var(--nodal-tarea-text);padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;">Tarea</span>`;

    const nombre = tipo === 'busqueda' ?
      (S.conversaciones.find(c => c.phone === item.phone)?.nombre || item.phone) :
      item.titulo;
    const detalle = tipo === 'busqueda' ? `${item.tipo||''} ${item.rango||''}` : (item.detalles||'').slice(0,40);

    return `<tr ondblclick="${tipo === 'busqueda' ? `irAConversacion('${item.phone}')` : `abrirDetalleTarea('${item.id}')`}">
      <td>${tipoBadge}</td>
      <td style="font-weight:600;">${escHtml(nombre)}</td>
      <td style="color:var(--text2);">${escHtml(detalle)}</td>
      <td style="color:var(--text3);">${escHtml(item.operador||'')}</td>
      <td style="font-family:var(--font-mono);font-size:11px;">${item.fechaFin||item.fecha||''}</td>
      <td>
        <button class="btn btn-secondary btn-xs" onclick="${tipo === 'busqueda' ? `recuperarBusqueda('${item.id}')` : `recuperarTarea('${item.id}')`}">
          <i class="ti ti-refresh"></i> Recuperar
        </button>
      </td>
    </tr>`;
  }).join('');
}

function filtrarTerminadas() {
  const tipo  = document.getElementById('term-tipo-filter')?.value;
  const desde = document.getElementById('term-fecha-desde')?.value;
  const hasta = document.getElementById('term-fecha-hasta')?.value;
  const tbody = document.getElementById('term-tbody');
  if (!tbody) return;

  let busquedas = S.busquedas.filter(b => b.terminada);
  let tareas    = S.tareas.filter(t => t.realizada);

  if (tipo === 'busqueda') tareas    = [];
  if (tipo === 'tarea')    busquedas = [];

  const todos = [...busquedas.map(b => ({ ...b, _tipo: 'busqueda' })), ...tareas.map(t => ({ ...t, _tipo: 'tarea' }))]
    .filter(item => {
      if (desde && new Date(item.tsTerminada||0) < new Date(desde)) return false;
      if (hasta && new Date(item.tsTerminada||0) > new Date(hasta+'T23:59:59')) return false;
      return true;
    });

  renderTerminadas();
}


// ════════════════════════════════
//  ADMIN
// ════════════════════════════════

function renderAdmin() {
  renderDriveCuentas();
  renderUsuariosList();
  cargarConfigAdmin();
  if (typeof cargarConfigHora === 'function') cargarConfigHora();
}

function cargarConfigAdmin() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
  set('wa-worker-url', S.config.workerUrl);
  set('wa-phone-id', S.config.waPhoneId);
  set('wa-waba-id',  S.config.waWabaId);
  set('wa-numero',   S.config.waNumero);
  set('meta-pixel',  S.config.metaPixel);
  set('meta-token',  S.config.metaToken);
  set('meta-cotiz',  S.config.metaCotiz);
  set('meta-test',   S.config.metaTest);
  set('jb-key',      S.config.jbKey);
  set('fb-apikey',   S.config.firebaseApiKey);
  set('fb-projectid',S.config.firebaseProjectId);
  set('fb-appid',    S.config.firebaseAppId);
  set('msg-compra',  S.config.msgCompra);
  set('msg-listo',   S.config.msgListo);
  // Google
  const g = S.config.google || {};
  set('google-client-id',     g.clientId);
  set('google-client-secret', g.clientSecret);
  set('google-refresh-token', g.refreshToken);
  const autoEl = document.getElementById('google-auto-agendar');
  if (autoEl) autoEl.value = g.autoAgendar || '1';
  actualizarEstadoGoogle();
}

function guardarConfigGoogle() {
  S.config.google = {
    clientId:     document.getElementById('google-client-id').value.trim(),
    clientSecret: document.getElementById('google-client-secret').value.trim(),
    refreshToken: document.getElementById('google-refresh-token').value.trim(),
    autoAgendar:  document.getElementById('google-auto-agendar').value
  };
  saveLocal();
  actualizarEstadoGoogle();
  showToast('Configuración Google guardada');
}

function actualizarEstadoGoogle() {
  const el = document.getElementById('google-status');
  if (!el) return;
  const g = S.config.google;
  if (g?.clientId && g?.clientSecret && g?.refreshToken) {
    el.innerHTML = '<span style="color:var(--green);">✓ Configurado</span> — los contactos se agendarán automáticamente';
  } else {
    el.innerHTML = '<span style="color:var(--text3);">Sin configurar</span>';
  }
}

async function testGoogleContacts() {
  const statusEl = document.getElementById('google-status');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--amber);">Probando conexión...</span>';
  guardarConfigGoogle();
  const token = await getGoogleAccessToken();
  if (token) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--green);">✓ Conexión exitosa</span> — Token válido';
    showToast('Google Contacts conectado correctamente');
  } else {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent);">✗ Error de conexión</span> — Verificá las credenciales';
    showToast('Error: verificá Client ID, Secret y Refresh Token', 'error');
  }
}

function guardarConfigWA() {
  S.config.workerUrl = document.getElementById('wa-worker-url').value.trim().replace(/\/$/, '');
  S.config.waPhoneId = document.getElementById('wa-phone-id').value;
  S.config.waWabaId  = document.getElementById('wa-waba-id').value;
  S.config.waNumero  = document.getElementById('wa-numero').value;
  saveLocal();
  document.getElementById('wa-status').textContent = '✓ Guardado';
  showToast('Configuración WhatsApp guardada');
}

async function testWorker() {
  const url = document.getElementById('wa-worker-url').value.trim().replace(/\/$/, '');
  if (!url) { showToast('Cargá primero la URL del Worker', 'error'); return; }
  const status = document.getElementById('wa-status');
  status.textContent = 'Probando...';
  try {
    const r = await fetch(url + '/');
    const txt = await r.text();
    if (txt.includes('CRMW Worker activo') || r.ok) {
      status.textContent = '✓ Worker conectado';
      status.style.color = 'var(--green)';
      showToast('Worker respondiendo correctamente');
    } else {
      status.textContent = '✗ Respuesta inesperada';
      status.style.color = 'var(--accent)';
    }
  } catch(e) {
    status.textContent = '✗ No responde';
    status.style.color = 'var(--accent)';
    showToast('No se pudo conectar con el Worker', 'error');
  }
}

function testWebhook() { showToast('Verificá el webhook desde la consola de Meta Developers', 'warn'); }

function guardarConfigFirebase() {
  S.config.firebaseApiKey    = document.getElementById('fb-apikey').value;
  S.config.firebaseProjectId = document.getElementById('fb-projectid').value;
  S.config.firebaseAppId     = document.getElementById('fb-appid').value;
  saveLocal();
  initFirebase(S.config);
  document.getElementById('fb-status').textContent = '✓ Reconectado';
  showToast('Firebase reconectado');
}

function guardarConfigMeta() {
  S.config.metaPixel = document.getElementById('meta-pixel').value;
  S.config.metaToken = document.getElementById('meta-token').value;
  S.config.metaCotiz = document.getElementById('meta-cotiz').value;
  S.config.metaTest  = document.getElementById('meta-test').value;
  saveLocal();
  document.getElementById('meta-status').textContent = '✓ Guardado';
  showToast('Configuración Meta guardada');
}

function guardarConfigJsonbin() {
  S.config.jbKey = document.getElementById('jb-key').value;
  saveLocal();
  showToast('JSONBin configurado');
}

function guardarMensajesAuto() {
  S.config.msgCompra = document.getElementById('msg-compra').value;
  S.config.msgListo  = document.getElementById('msg-listo').value;
  saveLocal();
  showToast('Mensajes automáticos guardados');
}

// Google Drive
function renderDriveCuentas() {
  const container = document.getElementById('drive-cuentas-list');
  if (!container) return;
  const cuentas = S.config.driveCuentas || [];
  if (!cuentas.length) {
    container.innerHTML = `<div style="color:var(--text3);font-size:12px;margin-bottom:8px;">Sin cuentas de Drive conectadas</div>`;
    return;
  }
  container.innerHTML = cuentas.map((c, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:9px 12px;margin-bottom:6px;">
      <div>
        <div style="font-size:13px;font-weight:600;"><i class="ti ti-brand-google-drive" style="color:var(--blue);margin-right:5px;"></i>${escHtml(c.email)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">${c.usado||'0 GB'} / 15 GB usados · ${c.activa ? '<span style="color:var(--green)">Activa</span>' : 'En espera'}</div>
      </div>
      <button class="btn btn-secondary btn-xs" onclick="eliminarCuentaDrive(${i})"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}

function agregarCuentaDrive() {
  const email = document.getElementById('drive-nueva-cuenta').value.trim();
  if (!email || !email.includes('@')) { showToast('Ingresá un email válido', 'error'); return; }
  if (!S.config.driveCuentas) S.config.driveCuentas = [];
  if (S.config.driveCuentas.find(c => c.email === email)) { showToast('Esa cuenta ya está agregada', 'error'); return; }
  S.config.driveCuentas.push({ email, activa: S.config.driveCuentas.length === 0, usado: '0 GB', agregadaAt: Date.now() });
  document.getElementById('drive-nueva-cuenta').value = '';
  saveLocal();
  renderDriveCuentas();
  showToast(`Drive ${email} agregado. Necesitarás configurar los permisos OAuth.`);
}

function eliminarCuentaDrive(idx) {
  if (!confirm('¿Eliminar esta cuenta de Drive?')) return;
  S.config.driveCuentas.splice(idx, 1);
  saveLocal();
  renderDriveCuentas();
}

// Usuarios
function renderUsuariosList() {
  const container = document.getElementById('usuarios-list');
  if (!container) return;
  const usuarios = S.config.usuarios || [];
  if (!usuarios.length) {
    container.innerHTML = `<div style="color:var(--text3);font-size:12px;margin-bottom:8px;">Sin usuarios configurados. Agregá el primero.</div>`;
    return;
  }
  const rolClases = { admin: 'role-admin', editor: 'role-editor', viewer: 'role-viewer' };
  container.innerHTML = usuarios.map((u, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:9px 12px;margin-bottom:7px;">
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-weight:600;font-size:13px;">${escHtml(u.nombre||u.email)}</span>
        <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">${escHtml(u.email)}</span>
      </div>
      <div style="display:flex;gap:7px;align-items:center;">
        <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;text-transform:uppercase;"
          class="${rolClases[u.rol]||'role-viewer'}">${u.rol}</span>
        <button class="btn btn-secondary btn-xs" onclick="eliminarUsuario(${i})"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('');
}

function abrirNuevoUsuario() {
  const nombre = prompt('Nombre del usuario:'); if (!nombre) return;
  const email  = prompt('Email / usuario:');    if (!email)  return;
  const pass   = prompt('Contraseña:');         if (!pass)   return;
  const rol    = prompt('Rol (admin / editor / viewer):', 'viewer') || 'viewer';
  if (!S.config.usuarios) S.config.usuarios = [];
  S.config.usuarios.push({ nombre, email, pass, rol, initials: obtenerIniciales(nombre), createdAt: Date.now() });
  saveLocal();
  saveToFirebase('config', { usuarios: S.config.usuarios });
  renderUsuariosList();
  showToast('Usuario agregado');
}

function eliminarUsuario(idx) {
  if (!confirm('¿Eliminar este usuario?')) return;
  S.config.usuarios.splice(idx, 1);
  saveLocal();
  saveToFirebase('config', { usuarios: S.config.usuarios });
  renderUsuariosList();
}


// ════════════════════════════════
//  PREDEFINIDOS
// ════════════════════════════════

function renderPredefinidos() {
  inicializarFiltroDefault();
  switchPred('filtros', document.querySelector('[data-pred="filtros"]'));
}

function switchPred(tipo, btn) {
  document.querySelectorAll('.pred-menu-item').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const content = document.getElementById('pred-content');
  if (!content) return;

  if (tipo === 'filtros') {
    content.innerHTML = buildFiltrosUI();
  } else if (tipo === 'carruseles') {
    content.innerHTML = buildCarruselesUI();
  }
}

function buildFiltrosUI() {
  const filtros = S.config.filtros || [];
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <h2 style="font-family:var(--font-cond);font-weight:900;font-size:20px;text-transform:uppercase;">Filtros automáticos</h2>
    <button class="btn btn-primary btn-sm" onclick="crearNuevoFiltro()"><i class="ti ti-plus"></i> Nuevo filtro</button>
  </div>
  <div class="notice">Los filtros se activan cuando un cliente escribe palabras clave específicas o viene de ciertos anuncios de Meta. El cliente NO puede escribir fuera del flujo hasta completarlo.</div>
  <div id="filtros-list" style="margin-top:14px;">
    ${filtros.length ? filtros.map((f, i) => buildFiltroCard(f, i)).join('') :
      `<div style="text-align:center;padding:40px;color:var(--text3);">
        <i class="ti ti-filter" style="font-size:36px;display:block;margin-bottom:10px;"></i>
        Sin filtros configurados. Creá uno nuevo.
      </div>`}
  </div>`;
}

function buildFiltroCard(f, i) {
  const pasoCount = f.ramas ? Object.keys(f.ramas).length : (f.pasos||[]).length;
  return `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);padding:16px;margin-bottom:10px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-family:var(--font-cond);font-weight:700;font-size:15px;">${escHtml(f.nombre||'Filtro sin nombre')}</div>
      <div style="display:flex;gap:5px;">
        <span style="font-size:10px;padding:2px 7px;border-radius:4px;${f.activo ? 'background:var(--green-dim);color:var(--green)' : 'background:var(--bg3);color:var(--text3)'}">${f.activo ? 'Activo' : 'Inactivo'}</span>
        <button class="btn btn-secondary btn-xs" onclick="toggleFiltroActivo(${i})">${f.activo ? 'Desactivar' : 'Activar'}</button>
        <button class="btn btn-blue btn-xs" onclick="abrirEditorFiltro(${i})"><i class="ti ti-edit"></i> Editar</button>
        <button class="btn btn-secondary btn-xs" onclick="eliminarFiltro(${i})"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text2);line-height:1.7;">
      <strong>Palabras clave:</strong> ${escHtml((f.palabrasClave||[]).join(', ') || '—')}<br>
      <strong>Bloquea hasta completar:</strong> ${f.bloquearHastaCompletar ? 'Sí' : 'No'}<br>
      <strong>Pasos / ramas:</strong> ${pasoCount}
      ${f.ramas ? `<br><strong>Flujo:</strong> Inicio → Gamer / Profesional / Otras → Periféricos → Cuándo → Componentes → Cierre` : ''}
    </div>
    ${f.ramas ? `<div style="margin-top:10px;background:var(--bg3);border-radius:var(--radius);padding:10px;font-size:11px;color:var(--text3);">
      💡 Este filtro replica el flujo de <strong>filtro.pages.dev</strong>. Se activa automáticamente con las palabras clave.
    </div>` : ''}
    <!-- Reglas de causalidad -->
    <div style="margin-top:12px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text2);margin-bottom:7px;">Reglas Si → Entonces</div>
      <div id="reglas-list-${i}">
        ${(f.reglas||[]).map((r,ri) => `
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;margin-bottom:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:10px;font-weight:700;color:var(--text3);">SI</span>
            <span style="background:var(--accent-dim);color:var(--accent);padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(r.trigger)}</span>
            <span style="font-size:10px;font-weight:700;color:var(--text3);">→</span>
            <span style="background:var(--green-dim);color:var(--green);padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(r.accion)}: ${escHtml((r.respuesta||'').slice(0,30))}</span>
            <button class="btn btn-secondary btn-xs" onclick="eliminarRegla(${i},${ri})" style="margin-left:auto;"><i class="ti ti-x"></i></button>
          </div>`).join('')}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="abrirNuevaRegla(${i})" style="margin-top:5px;"><i class="ti ti-plus"></i> Agregar regla Si→Entonces</button>
    </div>
  </div>`;
}

function crearNuevoFiltro() {
  const nombre = prompt('Nombre del filtro:'); if (!nombre) return;
  const palabras = prompt('Palabras clave que lo activan (separadas por coma):') || '';
  const campanas = prompt('IDs de campañas Meta que lo activan (separadas por coma):') || '';
  if (!S.config.filtros) S.config.filtros = [];
  S.config.filtros.push({
    id: generarId('F'),
    nombre,
    palabrasClave: palabras.split(',').map(p => p.trim()).filter(Boolean),
    campanas: campanas.split(',').map(c => c.trim()).filter(Boolean),
    activo: true,
    pasos: [
      { msj: '¡Hola! Para ayudarte mejor, ¿qué tipo de equipo estás buscando?', esperar: true },
      { msj: '¿Cuál es tu presupuesto aproximado?', esperar: true },
      { msj: '¿Para qué lo vas a usar principalmente (gaming, diseño, oficina)?', esperar: true }
    ]
  });
  saveLocal();
  renderPredefinidos();
  showToast('Filtro creado. Editalo para personalizar los pasos.');
}

function inicializarFiltroDefault() {
  if (!S.config.filtros) S.config.filtros = [];
  if (S.config.filtros.find(f => f.id === 'F_CASATECNO_DEFAULT')) return;

  S.config.filtros.unshift({
    id: 'F_CASATECNO_DEFAULT',
    nombre: 'Asesoramiento Casa Tecno — Filtro principal',
    palabrasClave: ['hola','precio','pc','computadora','presupuesto','gamer','notebook','consulta','queria','buenas','info','cuanto'],
    campanas: [],
    activo: true,
    bloquearHastaCompletar: true,
    waNumero: '543516842809',
    pixelId: '1331124815328957',
    leadValues: {
      'Gama Entrada USD 500-600': 550,
      'Gama Media USD 700-1.000': 850,
      'Gama Alta USD 1.200-2.300': 1750,
      'Gama Tope USD 2.500-4.000': 3250,
      'Gama Premium USD 4.300-10.000': 7150,
      'Arquitectura Básica USD 600-1.000': 800,
      'Arquitectura Media USD 1.200-2.000': 1600,
      'Arquitectura Avanzada USD 3.000-8.000': 5500,
      'Edición Liviana USD 600-1.000': 800,
      'Edición Intermedia USD 1.100-2.000': 1550,
      'Edición Avanzada USD 3.300-8.000': 5650,
      'Programación Inicial-Intermedia USD 600-900': 750,
      'Programación Experta USD 1.000-1.700': 1350,
      'Diseño Base USD 600-1.000': 800,
      'Diseño Intermedio USD 1.100-2.000': 1550,
      'Diseño Avanzado USD 2.200-4.000': 3100,
      'Animación Base USD 900-1.500': 1200,
      'Animación Intermedia USD 1.600-2.000': 1800,
      'Animación Avanzada USD 2.500-3.500': 3000,
      'Animación Experta USD 4.000-8.000': 6000,
      'Hogar / Familia': 400, 'Estudio / Tareas': 350, 'Oficina básica': 450
    },
    noCalifica: ['Gama Entrada USD 500-600','Solo estoy viendo','PC Otras'],
    ramas: {
      inicio: {
        msj: '¡Hola! 👋 Bienvenido/a a *Casa Tecno*. Para asesorarte mejor necesito hacerte unas preguntas.\n\n¿Qué tipo de PC buscás?\n\n1️⃣ PC Gamer\n2️⃣ PC Profesional\n3️⃣ PC Otras (hogar, estudio, oficina)',
        opciones: [
          { valor: '1', texto: 'PC Gamer', siguente: 'gamer_rango' },
          { valor: '2', texto: 'PC Profesional', siguente: 'prof_area' },
          { valor: '3', texto: 'PC Otras', siguente: 'otras_uso' }
        ]
      },
      gamer_rango: {
        msj: '🎮 *Gamer* — ¿Qué rango de potencia buscás?\n\n1️⃣ Gama Entrada · U$D 500-600 · Juegos livianos\n2️⃣ Gama Media · U$D 700-1.000 · AAA Medios\n3️⃣ Gama Alta · U$D 1.200-2.300 · AAA Altos\n4️⃣ Gama Tope · U$D 2.500-4.000 · AAA Máximos\n5️⃣ Gama Premium · U$D 4.300-10.000 · Ultra',
        opciones: [
          { valor: '1', texto: 'Gama Entrada USD 500-600', siguente: 'comun_perifericos' },
          { valor: '2', texto: 'Gama Media USD 700-1.000', siguente: 'comun_perifericos' },
          { valor: '3', texto: 'Gama Alta USD 1.200-2.300', siguente: 'comun_perifericos' },
          { valor: '4', texto: 'Gama Tope USD 2.500-4.000', siguente: 'comun_perifericos' },
          { valor: '5', texto: 'Gama Premium USD 4.300-10.000', siguente: 'comun_perifericos' }
        ]
      },
      prof_area: {
        msj: '💼 *Profesional* — ¿Cuál es tu área de trabajo?\n\n1️⃣ Arquitectura\n2️⃣ Programación\n3️⃣ Edición de Video\n4️⃣ Diseño Gráfico\n5️⃣ Animación y Videojuegos\n6️⃣ Otras',
        opciones: [
          { valor: '1', texto: 'Arquitectura', siguente: 'prof_arquitectura' },
          { valor: '2', texto: 'Programación', siguente: 'prof_programacion' },
          { valor: '3', texto: 'Edición de Video', siguente: 'prof_video' },
          { valor: '4', texto: 'Diseño Gráfico', siguente: 'prof_diseno' },
          { valor: '5', texto: 'Animación y Videojuegos', siguente: 'prof_animacion' },
          { valor: '6', texto: 'Otras', siguente: 'comun_perifericos' }
        ]
      },
      prof_arquitectura: {
        msj: '🏛️ *Arquitectura* — ¿Qué nivel de trabajo?\n\n1️⃣ Básica · U$D 600-1.000 · AutoCAD, SketchUp\n2️⃣ Media · U$D 1.200-2.000 · Lumion, D5 Render\n3️⃣ Avanzada · U$D 3.000-8.000 · Unreal Engine',
        opciones: [
          { valor: '1', texto: 'Arquitectura Básica USD 600-1.000', siguente: 'comun_perifericos' },
          { valor: '2', texto: 'Arquitectura Media USD 1.200-2.000', siguente: 'comun_perifericos' },
          { valor: '3', texto: 'Arquitectura Avanzada USD 3.000-8.000', siguente: 'comun_perifericos' }
        ]
      },
      prof_programacion: {
        msj: '💻 *Programación* — ¿Qué nivel?\n\n1️⃣ Inicial/Intermedia · U$D 600-900\n2️⃣ Experto · U$D 1.000-1.700\n3️⃣ Programación + Gaming',
        opciones: [
          { valor: '1', texto: 'Programación Inicial-Intermedia USD 600-900', siguente: 'comun_perifericos' },
          { valor: '2', texto: 'Programación Experta USD 1.000-1.700', siguente: 'comun_perifericos' },
          { valor: '3', texto: 'Programación + Juegos', siguente: 'gamer_rango' }
        ]
      },
      prof_video: {
        msj: '🎬 *Edición de Video* — ¿Qué categoría?\n\n1️⃣ Liviano FHD · U$D 600-1.000\n2️⃣ Intermedio FHD+4K · U$D 1.100-2.000\n3️⃣ Avanzado 4K+8K · U$D 3.300-8.000',
        opciones: [
          { valor: '1', texto: 'Edición Liviana USD 600-1.000', siguente: 'comun_perifericos' },
          { valor: '2', texto: 'Edición Intermedia USD 1.100-2.000', siguente: 'comun_perifericos' },
          { valor: '3', texto: 'Edición Avanzada USD 3.300-8.000', siguente: 'comun_perifericos' }
        ]
      },
      prof_diseno: {
        msj: '🎨 *Diseño Gráfico* — ¿Qué tipo de diseños?\n\n1️⃣ Base · U$D 600-1.000 · Illustrator, Photoshop\n2️⃣ Intermedio · U$D 1.100-2.000 · 3D y animaciones\n3️⃣ Avanzado · U$D 2.200-4.000 · Videojuegos',
        opciones: [
          { valor: '1', texto: 'Diseño Base USD 600-1.000', siguente: 'comun_perifericos' },
          { valor: '2', texto: 'Diseño Intermedio USD 1.100-2.000', siguente: 'comun_perifericos' },
          { valor: '3', texto: 'Diseño Avanzado USD 2.200-4.000', siguente: 'comun_perifericos' }
        ]
      },
      prof_animacion: {
        msj: '🎭 *Animación y Videojuegos* — ¿Qué potencia?\n\n1️⃣ Base · U$D 900-1.500\n2️⃣ Intermedio · U$D 1.600-2.000\n3️⃣ Avanzado · U$D 2.500-3.500\n4️⃣ Experto · U$D 4.000-8.000',
        opciones: [
          { valor: '1', texto: 'Animación Base USD 900-1.500', siguente: 'comun_perifericos' },
          { valor: '2', texto: 'Animación Intermedia USD 1.600-2.000', siguente: 'comun_perifericos' },
          { valor: '3', texto: 'Animación Avanzada USD 2.500-3.500', siguente: 'comun_perifericos' },
          { valor: '4', texto: 'Animación Experta USD 4.000-8.000', siguente: 'comun_perifericos' }
        ]
      },
      otras_uso: {
        msj: '🏠 *PC Otras* — ¿Para qué la usarías?\n\n1️⃣ Hogar / Familia · Streaming, redes\n2️⃣ Estudio / Tareas · Para estudiantes\n3️⃣ Oficina básica · Word, Excel, Zoom',
        opciones: [
          { valor: '1', texto: 'Hogar / Familia', siguente: 'comun_perifericos' },
          { valor: '2', texto: 'Estudio / Tareas', siguente: 'comun_perifericos' },
          { valor: '3', texto: 'Oficina básica', siguente: 'comun_perifericos' }
        ]
      },
      comun_perifericos: {
        msj: '🖥️ ¿Necesitás monitor, teclado, mouse o auriculares?\n\n1️⃣ Sí, Monitor y Periféricos completos\n2️⃣ Solo Monitor\n3️⃣ No, ya tengo todo',
        opciones: [
          { valor: '1', texto: 'Monitor y Periféricos', siguente: 'comun_cuando' },
          { valor: '2', texto: 'Solo Monitor', siguente: 'comun_cuando' },
          { valor: '3', texto: 'No necesito monitor ni periféricos', siguente: 'comun_cuando' }
        ]
      },
      comun_cuando: {
        msj: '⏰ ¿Cuándo pensás hacer tu compra?\n\n1️⃣ Próximas 24 a 48hs ⚡\n2️⃣ En 7 a 14 días\n3️⃣ En los próximos 30 días\n4️⃣ Solo estoy viendo 👀',
        opciones: [
          { valor: '1', texto: 'Próximas 24 a 48hs', siguente: 'comun_componentes' },
          { valor: '2', texto: '7 a 14 días', siguente: 'comun_componentes' },
          { valor: '3', texto: 'Próximos 30 días', siguente: 'comun_componentes' },
          { valor: '4', texto: 'Solo estoy viendo', siguente: 'comun_componentes' }
        ]
      },
      comun_componentes: {
        msj: '🔧 ¿Tenés algún componente en mente? (Podés escribir libremente o decir "ninguno")',
        opciones: [], libre: true, siguente: 'comun_comentarios'
      },
      comun_comentarios: {
        msj: '💬 ¿Querés comentarnos algo más para tu nueva PC? (Cualquier detalle o "listo")',
        opciones: [], libre: true, siguente: 'fin'
      },
      fin: {
        msj: '¡Perfecto! 🎯 Ya tengo toda la información. En breve un asesor de *Casa Tecno* te responde con las mejores opciones para vos. ¡Gracias por tu paciencia! ⚡',
        opciones: [], fin: true
      }
    }
  });
  saveLocal();
}

function toggleFiltroActivo(i) {
  S.config.filtros[i].activo = !S.config.filtros[i].activo;
  saveLocal();
  renderPredefinidos();
}
function editarFiltro(i) { abrirEditorFiltro(i); }

function abrirEditorFiltro(i) {
  const f = S.config.filtros[i];
  if (!f) return;
  const modal = document.getElementById('modal-editor-filtro');
  if (!modal) return;
  document.getElementById('ef-idx').value = i;
  document.getElementById('ef-nombre').value = f.nombre || '';
  document.getElementById('ef-palabras').value = (f.palabrasClave||[]).join(', ');
  document.getElementById('ef-campanas').value = (f.campanas||[]).join(', ');
  document.getElementById('ef-bloquear').checked = f.bloquearHastaCompletar !== false;
  renderPasosEditor(f);
  abrirModal('modal-editor-filtro');
}

function renderPasosEditor(f) {
  const container = document.getElementById('ef-pasos-list');
  if (!container) return;
  const pasos = f.pasos || [];
  container.innerHTML = pasos.map((p, pi) => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
        <span style="font-size:11px;font-weight:700;color:var(--text2);">PASO ${pi+1}</span>
        <div style="display:flex;gap:4px;">
          <select class="form-select" id="ef-paso-tipo-${pi}" style="font-size:11px;padding:3px 7px;width:auto;"
            onchange="cambiarTipoPaso(${pi},this.value)">
            <option value="texto" ${p.tipo==='texto'||!p.tipo?'selected':''}>Texto</option>
            <option value="botones" ${p.tipo==='botones'?'selected':''}>Menú de botones</option>
            <option value="imagen" ${p.tipo==='imagen'?'selected':''}>Imagen</option>
            <option value="video" ${p.tipo==='video'?'selected':''}>Video</option>
          </select>
          <button class="btn btn-secondary btn-xs" onclick="eliminarPasoEditor(${pi})"><i class="ti ti-trash"></i></button>
        </div>
      </div>
      <textarea class="form-input" id="ef-paso-msg-${pi}" rows="2" placeholder="Mensaje..."
        style="font-size:12px;">${escHtml(p.msj||p.mensaje||'')}</textarea>
      ${p.tipo === 'botones' ? renderBotonesEditor(p.botones||[], pi) : ''}
      <div style="display:flex;gap:8px;margin-top:6px;align-items:center;">
        <label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:4px;">
          <input type="checkbox" id="ef-paso-esperar-${pi}" ${p.esperar!==false?'checked':''}>
          Esperar respuesta
        </label>
      </div>
    </div>`).join('') + `
    <button class="btn btn-secondary btn-sm" onclick="agregarPasoEditor()">
      <i class="ti ti-plus"></i> Agregar paso
    </button>`;
}

function renderBotonesEditor(botones, pi) {
  return `<div id="ef-botones-${pi}" style="margin-top:7px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:5px;">Botones (máx. 3 para WhatsApp)</div>
    ${botones.map((b, bi) => `
      <div style="display:flex;gap:5px;margin-bottom:5px;align-items:center;">
        <input class="form-input" value="${escHtml(b.texto||'')}" placeholder="Texto del botón"
          id="ef-btn-texto-${pi}-${bi}" style="flex:1;font-size:11px;">
        <select class="form-select" id="ef-btn-accion-${pi}-${bi}" style="font-size:11px;padding:4px;width:110px;"
          onchange="mostrarCampoAccion(${pi},${bi},this.value)">
          <option value="respuesta" ${b.accion==='respuesta'?'selected':''}>Respuesta texto</option>
          <option value="url" ${b.accion==='url'?'selected':''}>Abrir URL</option>
          <option value="imagen" ${b.accion==='imagen'?'selected':''}>Enviar imagen</option>
          <option value="menu" ${b.accion==='menu'?'selected':''}>Ir a paso</option>
        </select>
        <input class="form-input" value="${escHtml(b.valor||'')}" placeholder="URL / Texto / Paso N"
          id="ef-btn-valor-${pi}-${bi}" style="flex:1.5;font-size:11px;">
        <button class="btn btn-secondary btn-xs" onclick="eliminarBotonEditor(${pi},${bi})"><i class="ti ti-x"></i></button>
      </div>`).join('')}
    <button class="btn btn-secondary btn-xs" onclick="agregarBotonEditor(${pi})" ${botones.length>=3?'disabled':''}>
      <i class="ti ti-plus"></i> Botón
    </button>
  </div>`;
}

function cambiarTipoPaso(pi, tipo) {
  const i = parseInt(document.getElementById('ef-idx').value);
  if (!S.config.filtros[i]) return;
  if (!S.config.filtros[i].pasos) S.config.filtros[i].pasos = [];
  if (S.config.filtros[i].pasos[pi]) {
    S.config.filtros[i].pasos[pi].tipo = tipo;
    if (tipo === 'botones' && !S.config.filtros[i].pasos[pi].botones) {
      S.config.filtros[i].pasos[pi].botones = [];
    }
  }
  renderPasosEditor(S.config.filtros[i]);
}

function agregarPasoEditor() {
  const i = parseInt(document.getElementById('ef-idx').value);
  if (!S.config.filtros[i].pasos) S.config.filtros[i].pasos = [];
  S.config.filtros[i].pasos.push({ tipo: 'texto', msj: '', esperar: true });
  renderPasosEditor(S.config.filtros[i]);
}

function eliminarPasoEditor(pi) {
  const i = parseInt(document.getElementById('ef-idx').value);
  S.config.filtros[i].pasos.splice(pi, 1);
  renderPasosEditor(S.config.filtros[i]);
}

function agregarBotonEditor(pi) {
  const i = parseInt(document.getElementById('ef-idx').value);
  if (!S.config.filtros[i].pasos[pi].botones) S.config.filtros[i].pasos[pi].botones = [];
  S.config.filtros[i].pasos[pi].botones.push({ texto: '', accion: 'respuesta', valor: '' });
  renderPasosEditor(S.config.filtros[i]);
}

function eliminarBotonEditor(pi, bi) {
  const i = parseInt(document.getElementById('ef-idx').value);
  S.config.filtros[i].pasos[pi].botones.splice(bi, 1);
  renderPasosEditor(S.config.filtros[i]);
}

function mostrarCampoAccion(pi, bi, accion) { /* ya visible en el input */ }

function guardarEditorFiltro() {
  const i = parseInt(document.getElementById('ef-idx').value);
  const f = S.config.filtros[i];
  if (!f) return;
  f.nombre = document.getElementById('ef-nombre').value;
  f.palabrasClave = document.getElementById('ef-palabras').value.split(',').map(p=>p.trim()).filter(Boolean);
  f.campanas = document.getElementById('ef-campanas').value.split(',').map(c=>c.trim()).filter(Boolean);
  f.bloquearHastaCompletar = document.getElementById('ef-bloquear').checked;

  // Leer pasos del DOM
  const pasos = f.pasos || [];
  pasos.forEach((p, pi) => {
    const msgEl = document.getElementById(`ef-paso-msg-${pi}`);
    const espEl = document.getElementById(`ef-paso-esperar-${pi}`);
    if (msgEl) p.msj = msgEl.value;
    if (espEl) p.esperar = espEl.checked;
    if (p.tipo === 'botones' && p.botones) {
      p.botones.forEach((b, bi) => {
        const textoEl = document.getElementById(`ef-btn-texto-${pi}-${bi}`);
        const accionEl = document.getElementById(`ef-btn-accion-${pi}-${bi}`);
        const valorEl = document.getElementById(`ef-btn-valor-${pi}-${bi}`);
        if (textoEl) b.texto = textoEl.value;
        if (accionEl) b.accion = accionEl.value;
        if (valorEl) b.valor = valorEl.value;
      });
    }
  });

  saveLocal();
  cerrarModal('modal-editor-filtro');
  renderPredefinidos();
  showToast('Filtro guardado');
}

// ── REGLAS SI → ENTONCES ──
function abrirNuevaRegla(filtroIdx) {
  const trigger  = prompt('Si el cliente escribe (palabra o frase):');
  if (!trigger) return;
  const acciones = ['texto', 'menu_botones', 'imagen', 'url'];
  const accion   = prompt('Acción:\n1. Respuesta de texto\n2. Menú de botones\n3. Enviar imagen\n4. Abrir URL\n\nEscribí el número:');
  const accionMap = { '1':'texto', '2':'menu_botones', '3':'imagen', '4':'url' };
  const accionVal = accionMap[accion] || 'texto';
  const respuesta = prompt(`Contenido de la respuesta (${accionVal}):`);
  if (!respuesta) return;
  if (!S.config.filtros[filtroIdx].reglas) S.config.filtros[filtroIdx].reglas = [];
  S.config.filtros[filtroIdx].reglas.push({ trigger, accion: accionVal, respuesta });
  saveLocal();
  renderPredefinidos();
}

function eliminarRegla(filtroIdx, reglaIdx) {
  S.config.filtros[filtroIdx].reglas.splice(reglaIdx, 1);
  saveLocal();
  renderPredefinidos();
}

function eliminarFiltro(i) {
  if (!confirm('¿Eliminar este filtro?')) return;
  S.config.filtros.splice(i, 1);
  saveLocal();
  renderPredefinidos();
}

function buildCarruselesUI() {
  const carruseles = S.config.carruseles || [];
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <h2 style="font-family:var(--font-cond);font-weight:900;font-size:20px;text-transform:uppercase;">Carruseles</h2>
    <button class="btn btn-primary btn-sm" onclick="crearNuevoCarrusel()"><i class="ti ti-plus"></i> Nuevo carrusel</button>
  </div>
  <div class="notice">Los carruseles se validan una sola vez con Meta. Luego podés cambiar el contenido (imágenes, texto) para cada conversación sin volver a validar.</div>
  <div id="carruseles-list" style="margin-top:14px;">
    ${carruseles.length ? carruseles.map((c, i) => `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);padding:16px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-family:var(--font-cond);font-weight:700;font-size:15px;">${escHtml(c.nombre)}</div>
          <div style="display:flex;gap:5px;">
            <span style="font-size:10px;padding:2px 7px;border-radius:4px;${c.validado ? 'background:var(--green-dim);color:var(--green)' : 'background:var(--amber-dim);color:var(--amber)'}">${c.validado ? 'Validado' : 'Pendiente validación'}</span>
            <button class="btn btn-secondary btn-xs" onclick="eliminarCarrusel(${i})"><i class="ti ti-trash"></i></button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text2);">${c.slots||3} slots · Template ID: ${escHtml(c.templateId||'(sin ID)')}</div>
      </div>`) .join('') :
      `<div style="text-align:center;padding:40px;color:var(--text3);">
        <i class="ti ti-layout-grid" style="font-size:36px;display:block;margin-bottom:10px;"></i>
        Sin carruseles. Creá uno y validalo con Meta una vez.
      </div>`}
  </div>`;
}

function crearNuevoCarrusel() {
  const nombre = prompt('Nombre del carrusel:'); if (!nombre) return;
  const slots  = parseInt(prompt('Cantidad de slots (3-10):', '3'))||3;
  if (!S.config.carruseles) S.config.carruseles = [];
  S.config.carruseles.push({
    id: generarId('CAR'),
    nombre,
    slots: Math.min(Math.max(slots, 2), 10),
    validado:   false,
    templateId: '',
    items: Array(slots).fill(null).map((_,i) => ({
      imagen: '',
      titulo: `Opción ${i+1}`,
      texto:  '',
      boton1: { texto: 'Ver más', tipo: 'url', url: '' }
    }))
  });
  saveLocal();
  switchPred('carruseles', document.querySelector('[data-pred="carruseles"]'));
  showToast('Carrusel creado. Configurá las imágenes y textos, luego validalo con Meta.');
}

function eliminarCarrusel(i) {
  if (!confirm('¿Eliminar este carrusel?')) return;
  S.config.carruseles.splice(i, 1);
  saveLocal();
  switchPred('carruseles', document.querySelector('[data-pred="carruseles"]'));
}
