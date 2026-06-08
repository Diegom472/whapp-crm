// ══════════════════════════════════════════════
//  CRMW — app.js
//  Estado global, Firebase, login, navegación
// ══════════════════════════════════════════════

'use strict';

// ── ESTADO GLOBAL ──
const S = {
  // Usuario activo
  usuario: null,
  // Conversación activa
  convActiva: null,
  // Datos de Firebase compartidos con CRMH
  clientes: [],
  eventos: [],
  // Datos propios del CRMW
  conversaciones: [],   // historial de mensajes por número
  busquedas: [],        // búsquedas activas/terminadas
  tareas: [],           // tareas de todos los operadores
  programados: [],      // mensajes programados
  recordatorios: [],    // recordatorios
  embudo: {
    etapas: ['Conversaciones','Descubierto','Cotizado','Cerrado'],
    tarjetas: {}
  },
  // Config
  config: {
    waPhoneId: '',
    waWabaId: '',
    waToken: '',
    waVerify: '',
    waNumero: '',
    metaPixel: '1331124815328957',
    metaToken: '',
    metaCotiz: '1450',
    metaTest: '',
    jbKey: '$2a$10$rfn7AanHAIUoMsRjoB20M.Ii7edqk/w4eeklxhBZmFjMfh7.PMbZ.',
    firebaseApiKey: 'AIzaSyDMxyLNtPznVMAkg-fc9000XdoAqu8WS0U',
    firebaseProjectId: 'ct-usuarios-clientes',
    firebaseAppId: '1:538162661061:web:0f38ccb93feaf2cdb212ac',
    msgCompra: 'Hola {{nombre}}, tu pedido {{id}} está registrado. Abonaste ${{abona}}, saldo pendiente ${{falta}}. Ver comprobante: https://diegom472.github.io/casatecno-crm/?comprobante={{id}}',
    msgListo: 'Hola {{nombre}}, tu pedido {{id}} está listo para retirar. {{descripcion}}',
    driveCuentas: [],
    colores: {}
  },
  // Tema
  tema: 'light',
  // Modo edición activo
  modoEdicion: false,
  // Cache de mensajes por conversación (phoneNumber -> [])
  mensajesCache: {}
};

// ── FIREBASE ──
let db = null;
let unsubFirebase = null;

function initFirebase(cfg) {
  try {
    if (firebase.apps.length) {
      firebase.apps.forEach(a => a.delete());
    }
  } catch(e) {}
  try {
    firebase.initializeApp({
      apiKey:     cfg.firebaseApiKey,
      authDomain: cfg.firebaseProjectId + '.firebaseapp.com',
      projectId:  cfg.firebaseProjectId,
      appId:      cfg.firebaseAppId || ''
    });
    db = firebase.firestore();
    suscribirFirebase();
    return true;
  } catch(e) {
    console.error('Firebase init error:', e);
    return false;
  }
}

function suscribirFirebase() {
  if (unsubFirebase) unsubFirebase();
  if (!db) return;
  unsubFirebase = db.doc('casatecno/datos').onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    try {
      if (data.clientes) S.clientes = JSON.parse(data.clientes);
      if (data.eventos)  S.eventos  = JSON.parse(data.eventos);
      if (data.config) {
        const c = JSON.parse(data.config);
        if (c.usuarios) S.config.usuarios = c.usuarios;
      }
    } catch(e) {}
    // También cargar datos propios del CRMW
    if (data.crmw_conversaciones) {
      try { S.conversaciones = JSON.parse(data.crmw_conversaciones); } catch(e) {}
    }
    if (data.crmw_busquedas) {
      try { S.busquedas = JSON.parse(data.crmw_busquedas); } catch(e) {}
    }
    if (data.crmw_tareas) {
      try { S.tareas = JSON.parse(data.crmw_tareas); } catch(e) {}
    }
    if (data.crmw_programados) {
      try { S.programados = JSON.parse(data.crmw_programados); } catch(e) {}
    }
    if (data.crmw_recordatorios) {
      try { S.recordatorios = JSON.parse(data.crmw_recordatorios); } catch(e) {}
    }
    if (data.crmw_embudo) {
      try { S.embudo = JSON.parse(data.crmw_embudo); } catch(e) {}
    }
    // Refrescar UI si está montada
    if (S.usuario) {
      renderConvList();
      renderPendientes();
      if (document.getElementById('page-embudo').classList.contains('active')) renderEmbudo();
      if (document.getElementById('page-tareas').classList.contains('active')) renderTareas();
      if (document.getElementById('page-terminadas').classList.contains('active')) renderTerminadas();
      // Si hay conversación activa, refrescar panel derecho
      if (S.convActiva) {
        cargarPanelContacto(S.convActiva);
      }
    }
  }, err => console.error('Firestore error:', err));
}

async function saveToFirebase(campo, valor) {
  if (!db) return false;
  try {
    await db.doc('casatecno/datos').set(
      { [campo]: JSON.stringify(valor) },
      { merge: true }
    );
    return true;
  } catch(e) {
    console.error('Save error:', e);
    return false;
  }
}

// ── LOCAL STORAGE ──
function loadLocal() {
  try {
    const d = localStorage.getItem('crmw_v1');
    if (d) {
      const parsed = JSON.parse(d);
      if (parsed.config) Object.assign(S.config, parsed.config);
      if (parsed.tema)   S.tema = parsed.tema;
      if (parsed.usuario) S.usuario = parsed.usuario;
    }
  } catch(e) {}
}

function saveLocal() {
  try {
    localStorage.setItem('crmw_v1', JSON.stringify({
      config:  S.config,
      tema:    S.tema,
      usuario: S.usuario
    }));
  } catch(e) {}
}

// ── LOGIN ──
function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!user || !pass) {
    errEl.textContent = 'Completá usuario y contraseña';
    errEl.style.display = 'block';
    return;
  }

  // Buscar en la lista de usuarios de Firebase
  const usuarios = S.config.usuarios || [];
  const found = usuarios.find(u => (u.email === user || u.nombre === user) && u.pass === pass);

  // Fallback: usuario admin hardcoded para primera configuración
  const esAdmin = (user === 'admin' && pass === 'casatecno2024') ||
                  (found && (found.rol === 'admin' || found.rol === 'editor' || found.rol === 'viewer'));

  if (!esAdmin && !found) {
    errEl.textContent = 'Usuario o contraseña incorrectos';
    errEl.style.display = 'block';
    return;
  }

  S.usuario = found || { nombre: 'Admin', email: user, rol: 'admin', initials: 'AD' };
  saveLocal();
  mountApp();
}

function doLogout() {
  S.usuario = null;
  saveLocal();
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-page').style.display = 'flex';
}

// ── MONTAR APP ──
function mountApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('app').style.flexDirection = 'column';

  // Usuario en topbar
  const initials = S.usuario.initials || (S.usuario.nombre || '??').slice(0,2).toUpperCase();
  document.getElementById('user-avatar-initials').textContent = initials;
  document.getElementById('user-display-name').textContent = S.usuario.nombre || S.usuario.email;

  // Mostrar pestaña Admin+ si corresponde
  if (S.usuario.rol === 'admin' || S.usuario.rol === 'editor') {
    const tabs = document.querySelector('.nav-tabs');
    if (!document.querySelector('[data-tab="admin-plus"]')) {
      const btn = document.createElement('button');
      btn.className = 'nav-tab';
      btn.dataset.tab = 'admin-plus';
      btn.textContent = 'Pendientes+';
      btn.onclick = () => switchTab('admin-plus');
      tabs.appendChild(btn);
    }
  }

  applyTheme();
  switchTab('conversaciones');
  renderConvList();
  renderPendientes();
  verificarRecordatoriosPendientes();

  // Chequear recordatorios cada minuto
  setInterval(verificarRecordatoriosPendientes, 60000);
}

// ── NAVEGACIÓN ──
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const btn = document.querySelector(`[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  const page = document.getElementById(`page-${tab}`);
  if (page) page.classList.add('active');

  // Lazy render
  switch(tab) {
    case 'embudo':      renderEmbudo();     break;
    case 'tareas':      renderTareas();     break;
    case 'terminadas':  renderTerminadas(); break;
    case 'predefinidos':renderPredefinidos();break;
    case 'admin':       renderAdmin();      break;
  }
}

// ── TEMA ──
function applyTheme() {
  document.body.classList.toggle('dark', S.tema === 'dark');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = S.tema === 'dark' ? 'ti ti-moon' : 'ti ti-sun';
}

function toggleTheme() {
  S.tema = S.tema === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveLocal();
}

// ── COLORES DINÁMICOS ──
function actualizarColor(nombre, valor) {
  document.documentElement.style.setProperty(`--${nombre}`, valor);
  S.config.colores[nombre] = valor;
  saveLocal();
}

function resetearColores() {
  document.documentElement.removeAttribute('style');
  S.config.colores = {};
  saveLocal();
  showToast('Colores reseteados');
}

// ── MODO EDICIÓN ──
function activarModoEdicion() {
  S.modoEdicion = true;
  document.getElementById('edit-mode-bar').classList.add('active');

  document.querySelectorAll('.btn, .mini-btn, .bar-btn, .nav-tab, .contact-action').forEach(el => {
    if (el.dataset.editBound) return;
    el.dataset.editBound = '1';
    el.addEventListener('click', handleEditClick, true);
  });

  showToast('Modo edición — hacé click en cualquier botón para renombrarlo');
}

function handleEditClick(e) {
  if (!S.modoEdicion) return;
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  const textoActual = el.textContent.trim();
  const nuevoTexto = prompt('Nuevo texto para este botón:', textoActual);
  if (nuevoTexto === null) return;
  const icono = el.querySelector('i');
  if (icono) {
    el.innerHTML = icono.outerHTML + ' ' + nuevoTexto;
  } else {
    el.textContent = nuevoTexto;
  }
  if (!S.config.textos) S.config.textos = {};
  S.config.textos[textoActual] = nuevoTexto;
  saveLocal();
}

function terminarEdicion() {
  S.modoEdicion = false;
  document.getElementById('edit-mode-bar').classList.remove('active');
  document.querySelectorAll('[data-edit-bound]').forEach(el => {
    el.removeEventListener('click', handleEditClick, true);
    delete el.dataset.editBound;
  });
  saveLocal();
  showToast('Cambios guardados');
}

// ── MODALES ──
function abrirModal(id) {
  document.getElementById(id).classList.add('open');
}
function cerrarModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── TOAST ──
function showToast(msg, tipo) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── COLAPSABLES — solo uno abierto a la vez ──
const COLLAPSE_IDS = ['busqueda','cliente','compras','programados','recordatorios','archivos'];

function toggleCollapse(id) {
  const body  = document.getElementById('body-' + id);
  const arrow = document.getElementById('arrow-' + id);
  if (!body) return;
  const yaEstabaAbierto = body.classList.contains('open');

  // Cerrar todos
  COLLAPSE_IDS.forEach(cid => {
    const b = document.getElementById('body-' + cid);
    const a = document.getElementById('arrow-' + cid);
    if (b) b.classList.remove('open');
    if (a) a.classList.remove('open');
  });

  // Si no estaba abierto, abrirlo
  if (!yaEstabaAbierto) {
    body.classList.add('open');
    if (arrow) arrow.classList.add('open');
  }
}

function toggleAdminCard(id) {
  const body  = document.getElementById('body-admin-' + id);
  const arrow = document.getElementById('arrow-admin-' + id);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open', isOpen);
}

// ── PANEL COLAPSAR ──
function togglePanel(panel) {
  if (panel === 'info') {
    const el  = document.getElementById('right-info');
    const btn = document.getElementById('btn-toggle-info');
    const collapsed = el.classList.toggle('collapsed');
    btn.innerHTML = collapsed
      ? '<i class="ti ti-chevron-left"></i>'
      : '<i class="ti ti-chevron-right"></i>';
  } else if (panel === 'pend') {
    const el  = document.getElementById('pendientes-col');
    const btn = document.getElementById('btn-toggle-pend');
    const collapsed = el.classList.toggle('collapsed');
    btn.innerHTML = collapsed
      ? '<i class="ti ti-chevron-left"></i>'
      : '<i class="ti ti-chevron-right"></i>';
  }
}

// ── EYE BUTTON ──
function toggleEye(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁️'; }
}

// ── UTILIDADES ──
function generarId(prefix) {
  return prefix + Date.now() + Math.random().toString(36).slice(2,6).toUpperCase();
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

function horaAhora() {
  return new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
}

function timestampAhora() {
  return new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function formatPeso(n) {
  return '$' + Number(n).toLocaleString('es-AR');
}

function hashSHA256(str) {
  // Web Crypto API
  const enc = new TextEncoder();
  return crypto.subtle.digest('SHA-256', enc.encode(str.toLowerCase().trim()))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(''));
}

function normalizarTelefono(tel) {
  return tel.replace(/\D/g,'');
}

function obtenerIniciales(nombre) {
  if (!nombre) return '??';
  const parts = nombre.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nombre.slice(0,2).toUpperCase();
}

function colorAvatar(texto) {
  const colores = ['av-blue','av-green','av-amber','av-purple','av-red'];
  let sum = 0;
  for (let c of (texto||'')) sum += c.charCodeAt(0);
  return colores[sum % colores.length];
}

// ── META CAPI ──
async function enviarEventoMeta(eventName, eventData, userData) {
  const pixelId = S.config.metaPixel;
  const token   = S.config.metaToken;
  if (!pixelId || !token) { console.warn('Meta CAPI no configurado'); return; }

  const payload = {
    data: [{
      event_name:    eventName,
      event_time:    Math.floor(Date.now()/1000),
      action_source: 'other',
      event_id:      eventData.event_id || generarId('EV'),
      user_data:     userData || {},
      custom_data:   eventData
    }]
  };

  if (S.config.metaTest) payload.test_event_code = S.config.metaTest;

  try {
    const r = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await r.json();
    console.log('Meta CAPI response:', res);
    return res;
  } catch(e) {
    console.error('Meta CAPI error:', e);
  }
}

async function buildUserData(cliente) {
  const ud = {};
  if (cliente?.whatsapp) ud.ph = await hashSHA256(normalizarTelefono(cliente.whatsapp));
  if (cliente?.email)    ud.em = await hashSHA256(cliente.email);
  if (cliente?.firstName) ud.fn = await hashSHA256(cliente.firstName.toLowerCase());
  if (cliente?.lastName)  ud.ln = await hashSHA256(cliente.lastName.toLowerCase());
  if (cliente?.cp)        ud.zp = await hashSHA256(cliente.cp);
  if (cliente?.localidad) ud.ct = await hashSHA256(cliente.localidad.toLowerCase().replace(/\s/g,''));
  if (cliente?.provincia) ud.st = await hashSHA256(cliente.provincia.toLowerCase().replace(/\s/g,''));
  ud.country = await hashSHA256('ar');
  return ud;
}

// ── JSONBIN ──
async function buscarEnJsonBin(ctId) {
  const key = S.config.jbKey;
  if (!key || !ctId) return null;
  try {
    const r = await fetch(`https://api.jsonbin.io/v3/b?query={"record.id":"${ctId}"}`, {
      headers: { 'X-Master-Key': key }
    });
    const data = await r.json();
    if (data.length > 0) return data[0].record;
    return null;
  } catch(e) {
    console.error('JSONBin error:', e);
    return null;
  }
}

// ── VERIFICAR RECORDATORIOS ──
function verificarRecordatoriosPendientes() {
  if (!S.usuario) return;
  const ahora = Date.now();
  const mios = S.recordatorios.filter(r =>
    r.operador === S.usuario.email &&
    !r.mostrado &&
    new Date(r.datetime).getTime() <= ahora
  );
  if (mios.length === 0) return;

  // Marcar como mostrados
  mios.forEach(r => r.mostrado = true);
  saveToFirebase('crmw_recordatorios', S.recordatorios);

  // Mostrar popup
  mios.forEach(r => {
    const msg = `🔔 ${r.titulo}\n${r.desc || ''}`;
    setTimeout(() => {
      showToast(`🔔 Recordatorio: ${r.titulo}`, 'warn');
    }, 300);
  });
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  loadLocal();

  // Cargar config de colores guardados
  if (S.config.colores) {
    Object.entries(S.config.colores).forEach(([k,v]) => {
      document.documentElement.style.setProperty(`--${k}`, v);
    });
  }

  // Inicializar Firebase con config guardada
  if (S.config.firebaseApiKey && S.config.firebaseProjectId) {
    initFirebase(S.config);
  } else {
    // Usar config hardcoded si no hay guardada
    initFirebase({
      firebaseApiKey:   'AIzaSyDMxyLNtPznVMAkg-fc9000XdoAqu8WS0U',
      firebaseProjectId:'ct-usuarios-clientes',
      firebaseAppId:    '1:538162661061:web:0f38ccb93feaf2cdb212ac'
    });
  }

  // Enter en login
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('login-user').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-pass').focus();
  });

  // Si hay sesión guardada, montar directamente
  if (S.usuario) mountApp();

  // Datos de prueba si no hay conversaciones
  if (!S.conversaciones.length) {
    S.conversaciones = [
      {
        phone: '+5493516100001',
        nombre: 'Matías Romero',
        lastMsg: 'FPS principalmente, Valorant y CS2',
        lastTs: Date.now() - 1000 * 60 * 4,
        unread: 2,
        operador: 'Diego G.',
        ctwaClid: 'DEMO_CTWA_001'
      },
      {
        phone: '+5493516100002',
        nombre: 'Juan García',
        lastMsg: 'Perfecto, ya transfiero el 50%',
        lastTs: Date.now() - 1000 * 60 * 40,
        unread: 0,
        operador: 'Diego G.'
      },
      {
        phone: '+5493516100003',
        nombre: 'Carla López',
        lastMsg: '¿El Ryzen 7 tiene garantía oficial?',
        lastTs: Date.now() - 1000 * 60 * 120,
        unread: 1,
        operador: 'Diego G.'
      }
    ];
    S.mensajesCache['+5493516100001'] = [
      { id:'m1', tipo:'texto', texto:'Hola! Vi el anuncio de Instagram y quería consultar por una PC gamer 🎮', dir:'in', ts: Date.now()-1000*60*10 },
      { id:'m2', tipo:'texto', texto:'¡Hola Matías! Buenas tardes, soy Diego de Casa Tecno. Un placer atenderte. ¿Para qué juegos la necesitás principalmente?', dir:'out', ts: Date.now()-1000*60*9 },
      { id:'m3', tipo:'texto', texto:'Quería algo para Valorant, CS2 y de vez en cuando edición de video', dir:'in', ts: Date.now()-1000*60*8 },
      { id:'m4', tipo:'texto', texto:'Perfecto. ¿Tenés algún presupuesto en mente?', dir:'out', ts: Date.now()-1000*60*7 },
      { id:'m5', tipo:'texto', texto:'Hasta $1.500.000 aproximadamente. ¿Qué me recomendás?', dir:'in', ts: Date.now()-1000*60*6 },
      { id:'m6', tipo:'texto', texto:'Con ese presupuesto te armo una Ryzen 7 7700X + RTX 4060 Ti que te va a mover todo a Full HD con gráficos ultra 🔥', dir:'out', ts: Date.now()-1000*60*5 },
      { id:'m7', tipo:'texto', texto:'FPS principalmente, Valorant y CS2. También algo de edición de video', dir:'in', ts: Date.now()-1000*60*4 }
    ];
    S.mensajesCache['+5493516100002'] = [
      { id:'m8',  tipo:'texto', texto:'Buenas! Me interesa la RTX 4070 que vi en el feed', dir:'in', ts: Date.now()-1000*60*90 },
      { id:'m9',  tipo:'texto', texto:'¡Hola Juan! Sí la tenemos. ¿Querés que te arme un presupuesto completo con gabinete y todo?', dir:'out', ts: Date.now()-1000*60*85 },
      { id:'m10', tipo:'texto', texto:'Sí, con Ryzen 7 y 32GB RAM', dir:'in', ts: Date.now()-1000*60*80 },
      { id:'m11', tipo:'texto', texto:'Perfecto, ya te mando el detalle al WhatsApp', dir:'out', ts: Date.now()-1000*60*45 },
      { id:'m12', tipo:'texto', texto:'Perfecto, ya transfiero el 50%', dir:'in', ts: Date.now()-1000*60*40 }
    ];
    S.mensajesCache['+5493516100003'] = [
      { id:'m13', tipo:'texto', texto:'Hola buenas! Busco una PC para arquitectura y renders en Lumion', dir:'in', ts: Date.now()-1000*60*130 },
      { id:'m14', tipo:'texto', texto:'Hola Carla! Para renders en Lumion necesitás una GPU potente. ¿Cuál es tu presupuesto?', dir:'out', ts: Date.now()-1000*60*125 },
      { id:'m15', tipo:'texto', texto:'Entre $1.500.000 y $2.000.000', dir:'in', ts: Date.now()-1000*60*122 },
      { id:'m16', tipo:'texto', texto:'¿El Ryzen 7 tiene garantía oficial?', dir:'in', ts: Date.now()-1000*60*120 }
    ];
    // Búsqueda activa de Matías
    S.busquedas.push({
      id: 'B_DEMO_001',
      phone: '+5493516100001',
      operador: 'admin',
      palabras: 'FPS, Valorant, CS2, edición video',
      tipo: 'GAMER ALTA',
      rango: '$1.000.000–$1.500.000',
      prop1: 'R7 7700X + RTX 4060 Ti',
      prop2: 'R5 7600X + RTX 4060',
      prop3: '',
      fecha: fechaHoy(),
      createdAt: Date.now() - 1000*60*8,
      guardada: true,
      terminada: false
    });
  }

  applyTheme();
});
