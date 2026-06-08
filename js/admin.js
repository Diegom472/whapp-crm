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

function abrirNuevaTarea() {
  document.getElementById('modal-tarea-title').textContent = 'Nueva tarea';
  document.getElementById('tarea-titulo').value = '';
  document.getElementById('tarea-detalles').value = '';
  document.getElementById('tarea-recordatorios-list').innerHTML = '';
  document.getElementById('modal-tarea').dataset.editId = '';
  abrirModal('modal-tarea');
}

function abrirDetalleTarea(id) {
  const t = S.tareas.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-tarea-title').textContent = t.realizada ? 'Tarea realizada' : 'Editar tarea';
  document.getElementById('tarea-titulo').value   = t.titulo   || '';
  document.getElementById('tarea-detalles').value = t.detalles || '';
  document.getElementById('modal-tarea').dataset.editId = id;

  // Recordatorios
  const recList = S.recordatorios.filter(r => r.tareaId === id);
  document.getElementById('tarea-recordatorios-list').innerHTML = recList.map(r => `
    <div style="background:var(--nodal-tarea-bg);border:1px solid var(--nodal-tarea-border);border-radius:var(--radius);padding:7px 10px;margin-bottom:5px;font-size:12px;">
      <strong>${escHtml(r.titulo)}</strong> — ${r.fecha||''}
    </div>`).join('');

  abrirModal('modal-tarea');
}

function guardarTarea() {
  if (!S.usuario) return;
  const titulo   = document.getElementById('tarea-titulo').value.trim();
  const detalles = document.getElementById('tarea-detalles').value.trim();
  if (!titulo) { showToast('Ingresá un título', 'error'); return; }

  const editId = document.getElementById('modal-tarea').dataset.editId;
  if (editId) {
    const t = S.tareas.find(x => x.id === editId);
    if (t) { t.titulo = titulo; t.detalles = detalles; }
  } else {
    S.tareas.push({
      id:        generarId('T'),
      titulo,
      detalles,
      operador:  S.usuario.email,
      fecha:     fechaHoy(),
      createdAt: Date.now(),
      realizada: false
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
}

function cargarConfigAdmin() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
  set('wa-phone-id', S.config.waPhoneId);
  set('wa-waba-id',  S.config.waWabaId);
  set('wa-token',    S.config.waToken);
  set('wa-verify',   S.config.waVerify);
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
}

function guardarConfigWA() {
  S.config.waPhoneId = document.getElementById('wa-phone-id').value;
  S.config.waWabaId  = document.getElementById('wa-waba-id').value;
  S.config.waToken   = document.getElementById('wa-token').value;
  S.config.waVerify  = document.getElementById('wa-verify').value;
  S.config.waNumero  = document.getElementById('wa-numero').value;
  saveLocal();
  document.getElementById('wa-status').textContent = '✓ Guardado';
  showToast('Configuración WhatsApp guardada');
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
  return `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);padding:16px;margin-bottom:10px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-family:var(--font-cond);font-weight:700;font-size:15px;">${escHtml(f.nombre||'Filtro sin nombre')}</div>
      <div style="display:flex;gap:5px;">
        <span style="font-size:10px;padding:2px 7px;border-radius:4px;${f.activo ? 'background:var(--green-dim);color:var(--green)' : 'background:var(--bg3);color:var(--text3)'}">${f.activo ? 'Activo' : 'Inactivo'}</span>
        <button class="btn btn-secondary btn-xs" onclick="editarFiltro(${i})"><i class="ti ti-edit"></i></button>
        <button class="btn btn-secondary btn-xs" onclick="eliminarFiltro(${i})"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text2);">
      <strong>Palabras clave:</strong> ${escHtml((f.palabrasClave||[]).join(', ') || '—')}<br>
      <strong>Campañas Meta:</strong> ${escHtml((f.campanas||[]).join(', ') || '—')}<br>
      <strong>Pasos:</strong> ${(f.pasos||[]).length} mensaje(s)
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

function editarFiltro(i) { showToast('Editor de pasos del filtro (próxima versión)', 'warn'); }
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
