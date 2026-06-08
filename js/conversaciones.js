// ══════════════════════════════════════════════
//  CRMW — conversaciones.js
//  Lista de chats, mensajes, paneles laterales
// ══════════════════════════════════════════════

'use strict';

// ── RENDER LISTA DE CONVERSACIONES ──
function renderConvList(filtro) {
  const lista = document.getElementById('conv-items-list');
  if (!lista) return;

  let convs = [...S.conversaciones];

  // Ordenar por último mensaje (más reciente primero)
  convs.sort((a,b) => (b.lastTs||0) - (a.lastTs||0));

  // Filtros rápidos
  if (filtro === 'noleidos') convs = convs.filter(c => (c.unread||0) > 0);
  if (filtro === 'favoritos') convs = convs.filter(c => c.favorito);

  lista.innerHTML = convs.length ? convs.map(c => buildConvItem(c)).join('') :
    `<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px;">Sin conversaciones</div>`;
}

function buildConvItem(c) {
  const active = S.convActiva?.phone === c.phone ? 'active' : '';
  const initials = obtenerIniciales(c.nombre || c.phone);
  const avClass = colorAvatar(c.phone);
  const badge = c.unread ? `<span class="conv-badge">${c.unread}</span>` : '';
  const lastMsg = (c.lastMsg || '').slice(0, 38) + ((c.lastMsg||'').length > 38 ? '...' : '');
  const hora = c.lastTs ? new Date(c.lastTs).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';

  return `
  <div class="conv-item ${active}" onclick="abrirConversacion('${c.phone}')">
    <div class="conv-avatar ${avClass}">${initials}</div>
    <div class="conv-info">
      <div class="conv-name">${escHtml(c.nombre || c.phone)}</div>
      <div class="conv-last">${escHtml(lastMsg)}</div>
    </div>
    <div class="conv-meta">
      <span class="conv-time">${hora}</span>
      ${badge}
    </div>
  </div>`;
}

function filtrarConversaciones(q) {
  const lista = document.getElementById('conv-items-list');
  if (!lista) return;
  const ql = q.toLowerCase();
  const convs = S.conversaciones.filter(c =>
    (c.nombre||'').toLowerCase().includes(ql) ||
    (c.phone||'').includes(ql) ||
    (c.lastMsg||'').toLowerCase().includes(ql)
  );
  lista.innerHTML = convs.map(buildConvItem).join('') ||
    `<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">Sin resultados</div>`;
}

function filtrarPor(tipo, btn) {
  document.querySelectorAll('.conv-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderConvList(tipo === 'todos' ? null : tipo);
}

// ── ABRIR CONVERSACIÓN ──
function abrirConversacion(phone) {
  const conv = S.conversaciones.find(c => c.phone === phone);
  if (!conv) return;

  S.convActiva = conv;

  // Marcar como leído
  conv.unread = 0;
  saveToFirebase('crmw_conversaciones', S.conversaciones);

  // Activar item en lista
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  event.currentTarget?.classList.add('active');

  // Mostrar chat activo
  document.getElementById('chat-placeholder').style.display = 'none';
  document.getElementById('chat-active').style.display = 'flex';
  document.getElementById('chat-active').style.flexDirection = 'column';
  document.getElementById('chat-active').style.flex = '1';

  // Header
  const initials = obtenerIniciales(conv.nombre || conv.phone);
  const avClass = colorAvatar(conv.phone);
  document.getElementById('chat-hdr-avatar').textContent = initials;
  document.getElementById('chat-hdr-avatar').className = `chat-header-avatar ${avClass}`;
  document.getElementById('chat-hdr-name').textContent = conv.nombre || conv.phone;

  // Tags en header
  renderTagsHeader(conv);

  // Cargar mensajes
  renderMensajes(phone);

  // Cargar panel de contacto
  cargarPanelContacto(conv);

  // Actualizar lista
  renderConvList();
}

function renderTagsHeader(conv) {
  const container = document.getElementById('chat-hdr-tags');
  if (!container) return;
  const tags = [];
  const busq = S.busquedas.find(b => b.phone === conv.phone && !b.terminada);
  if (busq?.tipo) {
    const cl = busq.tipo.includes('GAMER') ? 'tag-gamer' : busq.tipo.includes('PROF') ? 'tag-prof' : 'tag-gamer';
    tags.push(`<span class="tag ${cl}">${escHtml(busq.tipo)}</span>`);
  }
  // Etapa en embudo
  for (const [etapa, tarjetas] of Object.entries(S.embudo.tarjetas || {})) {
    if ((tarjetas||[]).includes(conv.phone) && etapa !== 'Conversaciones') {
      const cl = etapa === 'Cerrado' ? 'tag-cerr' : etapa === 'Cotizado' ? 'tag-cot' : 'tag-desc';
      tags.push(`<span class="tag ${cl}">${escHtml(etapa)}</span>`);
      break;
    }
  }
  container.innerHTML = tags.join('');
}

// ── RENDER MENSAJES ──
// ── ESTADO REENVÍO ──
let modoReenvio = false;
let msgsSeleccionados = new Set();

function renderMensajes(phone) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgs = S.mensajesCache[phone] || [];
  if (!msgs.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">Sin mensajes cargados</div>`;
    return;
  }

  let html = '';
  let lastDate = '';

  msgs.forEach(m => {
    const d = new Date(m.ts).toLocaleDateString('es-AR');
    if (d !== lastDate) {
      html += `<div class="msg-day">${d === new Date().toLocaleDateString('es-AR') ? 'Hoy' : d}</div>`;
      lastDate = d;
    }
    const hora = new Date(m.ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    const cls  = m.dir === 'out' ? 'out' : 'in';
    const selClass = modoReenvio && msgsSeleccionados.has(m.id) ? 'msg-selected' : '';

    // Botones de acción al hover
    const acciones = `
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="responderMsg('${m.id}')" title="Responder"><i class="ti ti-corner-up-left" style="font-size:12px;"></i></button>
        ${m.dir==='out' ? `<button class="msg-action-btn" onclick="editarMsg('${m.id}')" title="Editar"><i class="ti ti-pencil" style="font-size:12px;"></i></button>` : ''}
        <button class="msg-action-btn" onclick="activarReenvio('${m.id}')" title="Reenviar"><i class="ti ti-share" style="font-size:12px;"></i></button>
        <button class="msg-action-btn" onclick="copiarMsg('${m.id}')" title="Copiar"><i class="ti ti-copy" style="font-size:12px;"></i></button>
        <button class="msg-action-btn del" onclick="eliminarMsg('${m.id}')" title="Eliminar"><i class="ti ti-trash" style="font-size:12px;"></i></button>
      </div>`;

    let contenido = '';
    if (m.tipo === 'texto') {
      contenido = `${escHtml(m.editado ? m.texto + ' ✏️' : m.texto)}`;
    } else if (m.tipo === 'imagen') {
      contenido = `<img src="${m.url}" style="max-width:200px;border-radius:6px;display:block;margin-bottom:4px;" onerror="this.style.display='none'">`;
    } else if (m.tipo === 'audio') {
      contenido = `<audio controls src="${m.url}" style="max-width:220px;"></audio>`;
    } else if (m.tipo === 'documento') {
      contenido = `<div style="display:flex;align-items:center;gap:7px;"><i class="ti ti-file" style="font-size:20px;"></i><div><div style="font-size:12px;">${escHtml(m.nombre||'Archivo')}</div><div style="font-size:10px;opacity:0.7;">${m.mimetype||''}</div></div></div>`;
    }

    // Respuesta citada
    const citado = m.replyTo ? (() => {
      const orig = (S.mensajesCache[phone]||[]).find(x => x.id === m.replyTo);
      return orig ? `<div style="background:rgba(0,0,0,0.08);border-left:3px solid rgba(255,255,255,0.5);border-radius:4px;padding:4px 8px;margin-bottom:5px;font-size:11px;opacity:0.85;">${escHtml((orig.texto||'').slice(0,60))}</div>` : '';
    })() : '';

    const checkBox = modoReenvio ? `<input type="checkbox" class="msg-check" ${msgsSeleccionados.has(m.id)?'checked':''} onchange="toggleMsgSeleccion('${m.id}',this.checked)" style="margin-right:6px;accent-color:var(--accent);">` : '';

    html += `<div class="msg-row ${cls} ${selClass}" id="msg-${m.id}" style="${modoReenvio?'cursor:pointer;':''}" ${modoReenvio?`onclick="toggleMsgSeleccion('${m.id}',!msgsSeleccionados.has('${m.id}'))"`:''}>
      ${cls==='in' && modoReenvio ? checkBox : ''}
      ${cls==='out' ? acciones : ''}
      <div class="bubble ${cls}">${citado}${contenido}<div class="bubble-time">${hora}</div></div>
      ${cls==='in' ? acciones : ''}
      ${cls==='out' && modoReenvio ? checkBox : ''}
    </div>`;
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// ── ACCIONES SOBRE MENSAJES ──
function editarMsg(id) {
  const phone = S.convActiva?.phone;
  if (!phone) return;
  const msg = (S.mensajesCache[phone]||[]).find(m => m.id === id);
  if (!msg || msg.tipo !== 'texto') return;
  const nuevo = prompt('Editá el mensaje:', msg.texto);
  if (nuevo === null || nuevo === msg.texto) return;
  msg.texto  = nuevo;
  msg.editado = true;
  renderMensajes(phone);
  showToast('Mensaje editado');
}

function eliminarMsg(id) {
  const phone = S.convActiva?.phone;
  if (!phone) return;
  if (!confirm('¿Eliminar este mensaje?')) return;
  S.mensajesCache[phone] = (S.mensajesCache[phone]||[]).filter(m => m.id !== id);
  renderMensajes(phone);
  showToast('Mensaje eliminado');
}

function copiarMsg(id) {
  const phone = S.convActiva?.phone;
  const msg = (S.mensajesCache[phone]||[]).find(m => m.id === id);
  if (!msg) return;
  navigator.clipboard.writeText(msg.texto||'').then(() => showToast('Copiado al portapapeles'));
}

function responderMsg(id) {
  const phone = S.convActiva?.phone;
  const msg = (S.mensajesCache[phone]||[]).find(m => m.id === id);
  if (!msg) return;
  const input = document.getElementById('msg-input');
  if (input) {
    input.dataset.replyTo = id;
    input.placeholder = `↩ Respondiendo: "${(msg.texto||'[media]').slice(0,40)}"`;
    input.focus();
  }
}

// ── MODO REENVÍO ──
function activarReenvio(idInicial) {
  modoReenvio = true;
  msgsSeleccionados = new Set([idInicial]);
  renderMensajes(S.convActiva.phone);
  // Cambiar input bar
  const inputArea = document.getElementById('chat-input-area');
  if (inputArea) inputArea.innerHTML = `
    <div style="flex:1;font-size:13px;color:var(--text2);padding:8px 4px;">
      <i class="ti ti-share" style="color:var(--blue);margin-right:6px;"></i>
      <span id="reenvio-count">1</span> mensaje(s) seleccionado(s)
    </div>
    <button class="btn btn-blue btn-sm" onclick="abrirSelectorReenvio()"><i class="ti ti-send"></i> Reenviar</button>
    <button class="btn btn-secondary btn-sm" onclick="cancelarReenvio()"><i class="ti ti-x"></i> Cancelar</button>`;
}

function toggleMsgSeleccion(id, checked) {
  if (checked) msgsSeleccionados.add(id);
  else msgsSeleccionados.delete(id);
  const cnt = document.getElementById('reenvio-count');
  if (cnt) cnt.textContent = msgsSeleccionados.size;
  // Actualizar checkbox visual
  const row = document.getElementById('msg-' + id);
  if (row) {
    const cb = row.querySelector('.msg-check');
    if (cb) cb.checked = checked;
    row.classList.toggle('msg-selected', checked);
  }
}

function cancelarReenvio() {
  modoReenvio = false;
  msgsSeleccionados = new Set();
  renderMensajes(S.convActiva.phone);
  // Restaurar input bar
  const inputArea = document.getElementById('chat-input-area');
  if (inputArea) inputArea.innerHTML = `
    <button class="chat-input-btn" title="Adjuntar archivo" onclick="abrirAdjuntar()"><i class="ti ti-paperclip"></i></button>
    <button class="chat-input-btn" title="Emoticones" id="btn-emoji" onclick="toggleEmojiPanel()"><i class="ti ti-mood-smile"></i></button>
    <button class="chat-input-btn" title="Grabar audio" id="btn-audio" onclick="iniciarAudio()"><i class="ti ti-microphone"></i></button>
    <button class="chat-input-btn" title="Enviar carrusel" onclick="abrirCarrusel()"><i class="ti ti-layout-grid"></i></button>
    <textarea class="chat-input" id="msg-input" placeholder="Escribí un mensaje..." rows="1" onkeydown="handleMsgKeydown(event)" oninput="autoResizeInput(this)"></textarea>
    <button class="send-btn" onclick="enviarMensaje()"><i class="ti ti-send"></i></button>`;
}

function abrirSelectorReenvio() {
  const modal = document.getElementById('modal-selector-reenvio');
  if (!modal) return;
  renderListaContactosReenvio('');
  abrirModal('modal-selector-reenvio');
}

let contactosReenvioSeleccionados = new Set();

function renderListaContactosReenvio(filtro) {
  const lista = document.getElementById('reenvio-contactos-lista');
  if (!lista) return;
  const fl = filtro.toLowerCase();
  const convs = S.conversaciones.filter(c =>
    !filtro || (c.nombre||c.phone).toLowerCase().includes(fl)
  );

  // Contactos seleccionados primero
  const seleccionados = [...contactosReenvioSeleccionados];
  const noSel = convs.filter(c => !contactosReenvioSeleccionados.has(c.phone));

  lista.innerHTML = [
    ...convs.filter(c => contactosReenvioSeleccionados.has(c.phone)),
    ...noSel
  ].map(c => {
    const sel = contactosReenvioSeleccionados.has(c.phone);
    return `<div class="reenvio-contacto ${sel?'sel':''}" onclick="toggleContactoReenvio('${c.phone}')">
      <div class="conv-avatar ${colorAvatar(c.phone)}" style="width:32px;height:32px;font-size:11px;flex-shrink:0;">${obtenerIniciales(c.nombre||c.phone)}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(c.nombre||c.phone)}</div>
        <div style="font-size:11px;color:var(--text3);">${escHtml(c.phone)}</div>
      </div>
      ${sel ? '<i class="ti ti-check" style="color:var(--blue);font-size:16px;"></i>' : ''}
    </div>`;
  }).join('') || `<div style="text-align:center;padding:20px;color:var(--text3);">Sin resultados</div>`;
}

function toggleContactoReenvio(phone) {
  if (contactosReenvioSeleccionados.has(phone)) contactosReenvioSeleccionados.delete(phone);
  else contactosReenvioSeleccionados.add(phone);
  renderListaContactosReenvio(document.getElementById('reenvio-buscar')?.value||'');
  const cnt = document.getElementById('reenvio-dest-count');
  if (cnt) cnt.textContent = contactosReenvioSeleccionados.size + ' destinatario(s)';
}

async function confirmarReenvio() {
  if (!S.convActiva || !contactosReenvioSeleccionados.size || !msgsSeleccionados.size) return;
  const phone = S.convActiva.phone;
  const msgs  = (S.mensajesCache[phone]||[]).filter(m => msgsSeleccionados.has(m.id));

  for (const dest of contactosReenvioSeleccionados) {
    if (!S.mensajesCache[dest]) S.mensajesCache[dest] = [];
    // Enviar en orden secuencial con espera entre archivos pesados
    for (const msg of msgs) {
      const copia = { ...msg, id: generarId('MSG'), dir: 'out', ts: Date.now(), reenviado: true };
      S.mensajesCache[dest].push(copia);
      // Esperar más entre archivos pesados para respetar el orden
      const delay = (msg.tipo === 'texto') ? 100 : 800;
      await new Promise(r => setTimeout(r, delay));
      await enviarPorWhatsApp(dest, msg.tipo === 'texto' ? msg.texto : msg.url, msg.tipo === 'texto' ? 'text' : msg.tipo);
    }
  }

  cerrarModal('modal-selector-reenvio');
  cancelarReenvio();
  contactosReenvioSeleccionados = new Set();
  showToast(`Mensajes reenviados a ${contactosReenvioSeleccionados.size || 'los contactos seleccionados'}`);
}

// ── ENVIAR MENSAJE ──
function enviarMensaje() {
  if (!S.convActiva) return;
  const input = document.getElementById('msg-input');
  const texto = input.value.trim();
  if (!texto) return;

  const msg = {
    id:    generarId('MSG'),
    tipo:  'texto',
    texto: texto,
    dir:   'out',
    ts:    Date.now(),
    operador: S.usuario?.nombre || 'Sistema'
  };

  // Agregar al cache local inmediatamente
  if (!S.mensajesCache[S.convActiva.phone]) S.mensajesCache[S.convActiva.phone] = [];
  S.mensajesCache[S.convActiva.phone].push(msg);
  renderMensajes(S.convActiva.phone);

  // Actualizar conversación
  const conv = S.conversaciones.find(c => c.phone === S.convActiva.phone);
  if (conv) { conv.lastMsg = texto; conv.lastTs = Date.now(); }

  input.value = '';
  input.style.height = 'auto';

  // Enviar por WhatsApp Cloud API via Worker
  enviarPorWhatsApp(S.convActiva.phone, texto, 'text');

  saveToFirebase('crmw_conversaciones', S.conversaciones);
}

function handleMsgKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensaje();
  }
}

function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

// ── ENVIAR POR WHATSAPP API ──
async function enviarPorWhatsApp(phone, contenido, tipo, extra) {
  const token   = S.config.waToken;
  const phoneId = S.config.waPhoneId;
  if (!token || !phoneId) { console.warn('WhatsApp API no configurada'); return; }

  let body;
  if (tipo === 'text') {
    body = { messaging_product:'whatsapp', to: phone, type:'text', text:{ body: contenido } };
  } else if (tipo === 'template') {
    body = { messaging_product:'whatsapp', to: phone, type:'template', template: contenido };
  } else if (tipo === 'document') {
    body = { messaging_product:'whatsapp', to: phone, type:'document', document: contenido };
  }

  try {
    const r = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await r.json();
  } catch(e) {
    console.error('WhatsApp send error:', e);
    showToast('Error al enviar mensaje', 'error');
  }
}

// ── ADJUNTAR ARCHIVOS ──
function abrirAdjuntar() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.mp3,.ogg,.m4a,.opus';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    subirArchivo(file);
  };
  input.click();
}

async function subirArchivo(file) {
  if (!S.convActiva) return;
  showToast('Subiendo archivo...', 'warn');

  // Subir a Drive o Firebase Storage según config
  // Por ahora usa URL local para preview inmediato
  const url = URL.createObjectURL(file);
  const tipo = file.type.startsWith('image') ? 'imagen' :
               file.type.startsWith('audio') ? 'audio' :
               file.type.startsWith('video') ? 'video' : 'documento';

  const msg = {
    id:   generarId('MSG'),
    tipo: tipo,
    url:  url,
    nombre: file.name,
    mimetype: file.type,
    dir:  'out',
    ts:   Date.now(),
    operador: S.usuario?.nombre
  };

  if (!S.mensajesCache[S.convActiva.phone]) S.mensajesCache[S.convActiva.phone] = [];
  S.mensajesCache[S.convActiva.phone].push(msg);
  renderMensajes(S.convActiva.phone);

  showToast('Archivo enviado');
}

// ── GRABADOR DE AUDIO — flujo simplificado ──
let mediaRecorder = null;
let audioChunks   = [];
let audioBlob     = null;
let recTimer      = null;
let recSeconds    = 0;
let recPaused     = false;

function iniciarAudio() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    audioChunks = []; recSeconds = 0; recPaused = false;
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      audioBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
      // Mostrar directamente barra pausado con player
      const url = URL.createObjectURL(audioBlob);
      const player = document.getElementById('audio-paused-player');
      if (player) { player.src = url; player.load(); }
      document.getElementById('audio-recording-bar').classList.remove('active');
      document.getElementById('audio-paused-bar').classList.add('active');
    };
    mediaRecorder.start(100);
    document.getElementById('audio-recording-bar').classList.add('active');
    document.getElementById('audio-paused-bar').classList.remove('active');

    recTimer = setInterval(() => {
      if (!recPaused) {
        recSeconds++;
        const m = Math.floor(recSeconds/60), s = recSeconds%60;
        const el = document.getElementById('audio-rec-time');
        if (el) el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      }
    }, 1000);

    document.getElementById('btn-audio')?.classList.add('recording');
  }).catch(() => showToast('No se pudo acceder al micrófono', 'error'));
}

function pausarAudio() {
  // Al tocar pausa: detener grabación → mostrar player inmediatamente
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  clearInterval(recTimer);
  mediaRecorder.stop();
  document.getElementById('btn-audio')?.classList.remove('recording');
  // El onstop se encarga de mostrar audio-paused-bar
}

function enviarAudioPausado() {
  if (!audioBlob || !S.convActiva) return;
  const url = URL.createObjectURL(audioBlob);
  const msg = {
    id:   generarId('MSG'), tipo: 'audio', url,
    nombre: `audio_${Date.now()}.ogg`, dir: 'out',
    ts: Date.now(), operador: S.usuario?.nombre
  };
  if (!S.mensajesCache[S.convActiva.phone]) S.mensajesCache[S.convActiva.phone] = [];
  S.mensajesCache[S.convActiva.phone].push(msg);
  renderMensajes(S.convActiva.phone);
  cancelarAudio();
  showToast('Audio enviado');
}

function cancelarAudio() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(recTimer);
  audioChunks = []; audioBlob = null; recSeconds = 0;
  document.getElementById('audio-recording-bar').classList.remove('active');
  document.getElementById('audio-paused-bar').classList.remove('active');
  document.getElementById('btn-audio')?.classList.remove('recording');
  const player = document.getElementById('audio-paused-player');
  if (player) { player.pause(); player.src = ''; }
}

function toggleAudio() { iniciarAudio(); }
// confirmarEnvioAudio → alias
function confirmarEnvioAudio() { enviarAudioPausado(); }
function cancelarPreviewAudio() { cancelarAudio(); }
function detenerYPrevisualizar() { pausarAudio(); }

// ── BUSCAR EN CHAT ──
function buscarEnChat() {
  if (!S.convActiva) return;
  const q = prompt('Buscar en el chat:');
  if (!q) return;
  const msgs = S.mensajesCache[S.convActiva.phone] || [];
  const encontrados = msgs.filter(m => (m.texto||'').toLowerCase().includes(q.toLowerCase()));
  showToast(encontrados.length ? `${encontrados.length} resultado(s) encontrado(s)` : 'Sin resultados');
}

function abrirBuscarEnChat() { buscarEnChat(); }

// ── PANEL CONTACTO ──
function cargarPanelContacto(conv) {
  if (!conv) return;

  // Buscar cliente en Firebase por WhatsApp
  const phone = normalizarTelefono(conv.phone);
  const cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);

  // Avatar y nombre
  const nombre = conv.nombre || (cliente ? `${cliente.firstName} ${cliente.lastName}` : conv.phone);
  const initials = obtenerIniciales(nombre);
  const avClass = colorAvatar(conv.phone);

  document.getElementById('panel-avatar').textContent = initials;
  document.getElementById('panel-avatar').className = `contact-avatar-lg ${avClass}`;
  document.getElementById('panel-nombre').textContent = nombre;
  document.getElementById('panel-telefono').textContent = conv.phone;

  // Tags
  const tagsEl = document.getElementById('panel-tags');
  const busq = S.busquedas.find(b => b.phone === conv.phone && !b.terminada);
  tagsEl.innerHTML = busq?.tipo ? `<span class="tag tag-gamer">${escHtml(busq.tipo)}</span>` : '';

  // Cargar datos del cliente si existe
  if (cliente) {
    document.getElementById('c-nombre').value     = cliente.firstName || '';
    document.getElementById('c-apellido').value   = cliente.lastName  || '';
    document.getElementById('c-dni').value        = cliente.dni       || '';
    document.getElementById('c-domicilio').value  = cliente.domicilio || '';
    document.getElementById('c-localidad').value  = cliente.localidad || 'Córdoba';
    document.getElementById('c-provincia').value  = cliente.provincia || 'Córdoba';
    document.getElementById('c-cp').value         = cliente.cp        || '5000';
    document.getElementById('c-metaid').textContent = cliente.metaId  || '—';
    if (cliente.iva) document.getElementById('c-iva').value = cliente.iva;
  } else {
    // Precarga desde perfil WhatsApp
    document.getElementById('c-nombre').value = conv.nombre || '';
    document.getElementById('c-apellido').value = '';
    document.getElementById('c-localidad').value = 'Córdoba';
    document.getElementById('c-provincia').value = 'Córdoba';
    document.getElementById('c-cp').value = '5000';
    document.getElementById('c-metaid').textContent = conv.metaId || '—';
  }

  // Cargar búsqueda actual (borrador)
  cargarBusquedaActual(conv.phone);

  // Cargar comprobantes
  renderComprobantes(phone);

  // Cargar programados y recordatorios
  renderProgListPanel(conv.phone);
  renderRecordatoriosPanel(conv.phone);

  // Cargar archivos
  renderArchivosPanel(conv.phone);
}

// ── BÚSQUEDA ACTUAL ──
let busquedaAutoSaveTimer = null;

function cargarBusquedaActual(phone) {
  const busq = S.busquedas.find(b => b.phone === phone && !b.terminada);
  if (busq) {
    document.getElementById('b-palabras').value = busq.palabras || '';
    document.getElementById('b-tipo').value     = busq.tipo     || '';
    document.getElementById('b-rango').value    = busq.rango    || '';
    document.getElementById('b-prop1').value    = busq.prop1    || '';
    document.getElementById('b-prop2').value    = busq.prop2    || '';
    document.getElementById('b-prop3').value    = busq.prop3    || '';
    document.getElementById('busqueda-draft-badge').style.display = busq.guardada ? 'none' : 'inline';
  } else {
    // Limpiar campos
    ['b-palabras','b-tipo','b-rango','b-prop1','b-prop2','b-prop3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = el.tagName === 'SELECT' ? '' : '';
    });
    document.getElementById('busqueda-draft-badge').style.display = 'inline';
  }
}

function autosaveBusqueda() {
  if (!S.convActiva) return;
  clearTimeout(busquedaAutoSaveTimer);
  busquedaAutoSaveTimer = setTimeout(() => {
    const phone = S.convActiva.phone;
    let busq = S.busquedas.find(b => b.phone === phone && !b.terminada);
    if (!busq) {
      busq = { id: generarId('B'), phone, guardada: false };
      S.busquedas.push(busq);
    }
    busq.palabras = document.getElementById('b-palabras').value;
    busq.tipo     = document.getElementById('b-tipo').value;
    busq.rango    = document.getElementById('b-rango').value;
    busq.prop1    = document.getElementById('b-prop1').value;
    busq.prop2    = document.getElementById('b-prop2').value;
    busq.prop3    = document.getElementById('b-prop3').value;
    busq.updatedAt = Date.now();
    saveToFirebase('crmw_busquedas', S.busquedas);
  }, 1500);
}

function guardarNuevaBusqueda() {
  if (!S.convActiva) return;
  const phone = S.convActiva.phone;
  const nuevaBusq = {
    id:        generarId('B'),
    phone,
    operador:  S.usuario?.email,
    palabras:  document.getElementById('b-palabras').value,
    tipo:      document.getElementById('b-tipo').value,
    rango:     document.getElementById('b-rango').value,
    prop1:     document.getElementById('b-prop1').value,
    prop2:     document.getElementById('b-prop2').value,
    prop3:     document.getElementById('b-prop3').value,
    fecha:     fechaHoy(),
    createdAt: Date.now(),
    guardada:  true,
    terminada: false
  };
  S.busquedas.push(nuevaBusq);
  saveToFirebase('crmw_busquedas', S.busquedas);
  renderPendientes();
  renderTagsHeader(S.convActiva);

  // Mover al embudo → Descubierto automáticamente
  moverEnEmbudo(phone, 'Descubierto');

  document.getElementById('busqueda-draft-badge').style.display = 'none';
  showToast('Búsqueda guardada y agregada a Pendientes');
}

function actualizarBusqueda() {
  if (!S.convActiva) return;
  autosaveBusqueda();
  clearTimeout(busquedaAutoSaveTimer);
  const phone = S.convActiva.phone;
  let busq = S.busquedas.find(b => b.phone === phone && !b.terminada);
  if (!busq) { guardarNuevaBusqueda(); return; }
  busq.palabras  = document.getElementById('b-palabras').value;
  busq.tipo      = document.getElementById('b-tipo').value;
  busq.rango     = document.getElementById('b-rango').value;
  busq.prop1     = document.getElementById('b-prop1').value;
  busq.prop2     = document.getElementById('b-prop2').value;
  busq.prop3     = document.getElementById('b-prop3').value;
  busq.guardada  = true;
  busq.updatedAt = Date.now();
  saveToFirebase('crmw_busquedas', S.busquedas);
  renderPendientes();
  showToast('Búsqueda actualizada');
}

function finalizarBusqueda() {
  if (!S.convActiva) return;
  const phone = S.convActiva.phone;
  const busq = S.busquedas.find(b => b.phone === phone && !b.terminada);
  if (!busq) return;
  if (!confirm('¿Finalizar esta búsqueda?')) return;
  busq.terminada   = true;
  busq.fechaFin    = fechaHoy();
  busq.tsTerminada = Date.now();
  saveToFirebase('crmw_busquedas', S.busquedas);
  renderPendientes();
  renderTerminadas();
  cargarBusquedaActual(phone);
  showToast('Búsqueda finalizada');
}

function abrirHistorialBusqueda() {
  if (!S.convActiva) return;
  const phone = S.convActiva.phone;
  const historial = S.busquedas.filter(b => b.phone === phone && b.terminada);
  const lista = document.getElementById('hist-busqueda-list');

  if (!historial.length) {
    lista.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);">Sin búsquedas anteriores</div>`;
  } else {
    lista.innerHTML = historial.sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).map(b => `
      <div class="hist-item">
        <div class="hist-item-title">${escHtml(b.tipo||'Búsqueda')} — ${escHtml(b.rango||'')}</div>
        <div class="hist-item-date">${b.fecha||''}</div>
        <div class="hist-item-sub">${escHtml(b.palabras||'')} ${b.prop1 ? '· '+escHtml(b.prop1) : ''}</div>
        <div class="hist-item-actions">
          <button class="mini-btn primary" onclick="recuperarBusqueda('${b.id}');cerrarModal('modal-historial-busqueda')">Recuperar</button>
          <button class="mini-btn" onclick="cerrarModal('modal-historial-busqueda')">Cerrar</button>
        </div>
      </div>`).join('');
  }
  abrirModal('modal-historial-busqueda');
}

function recuperarBusqueda(id) {
  const busq = S.busquedas.find(b => b.id === id);
  if (!busq || !S.convActiva) return;
  busq.terminada = false;
  busq.guardada  = true;
  busq.updatedAt = Date.now();
  saveToFirebase('crmw_busquedas', S.busquedas);
  cargarBusquedaActual(S.convActiva.phone);
  renderPendientes();
  showToast('Búsqueda recuperada');
}

function filtrarHistorialBusqueda() {
  if (!S.convActiva) return;
  const desde = document.getElementById('hist-fecha-desde').value;
  const hasta = document.getElementById('hist-fecha-hasta').value;
  const phone = S.convActiva.phone;
  let hist = S.busquedas.filter(b => b.phone === phone && b.terminada);
  if (desde) hist = hist.filter(b => new Date(b.createdAt) >= new Date(desde));
  if (hasta) hist = hist.filter(b => new Date(b.createdAt) <= new Date(hasta + 'T23:59:59'));
  const lista = document.getElementById('hist-busqueda-list');
  lista.innerHTML = hist.length ? hist.map(b => `
    <div class="hist-item">
      <div class="hist-item-title">${escHtml(b.tipo||'Búsqueda')}</div>
      <div class="hist-item-date">${b.fecha}</div>
      <div class="hist-item-sub">${escHtml(b.palabras||'')}</div>
      <div class="hist-item-actions">
        <button class="mini-btn primary" onclick="recuperarBusqueda('${b.id}');cerrarModal('modal-historial-busqueda')">Recuperar</button>
      </div>
    </div>`).join('') :
    `<div style="text-align:center;padding:20px;color:var(--text3);">Sin resultados</div>`;
}

// ── CLIENTE ──
function obtenerDatosFormCliente() {
  const phone = normalizarTelefono(S.convActiva?.phone || '');
  return {
    id:        generarId('C'),
    whatsapp:  S.convActiva?.phone || '',
    firstName: document.getElementById('c-nombre').value.trim(),
    lastName:  document.getElementById('c-apellido').value.trim(),
    nombre:    `${document.getElementById('c-nombre').value.trim()} ${document.getElementById('c-apellido').value.trim()}`.trim(),
    dni:       document.getElementById('c-dni').value.trim(),
    domicilio: document.getElementById('c-domicilio').value.trim(),
    localidad: document.getElementById('c-localidad').value.trim(),
    provincia: document.getElementById('c-provincia').value.trim(),
    cp:        document.getElementById('c-cp').value.trim(),
    iva:       document.getElementById('c-iva').value,
    canal:     'WhatsApp'
  };
}

function guardarNuevoCliente() {
  const datos = obtenerDatosFormCliente();
  if (!datos.firstName) { showToast('Ingresá al menos el nombre', 'error'); return; }

  // Verificar si ya existe por teléfono o DNI
  const phone = normalizarTelefono(datos.whatsapp);
  const existe = S.clientes.find(c =>
    normalizarTelefono(c.whatsapp||'') === phone ||
    (datos.dni && c.dni === datos.dni)
  );
  if (existe) {
    if (!confirm('Ya existe un cliente con ese teléfono o DNI. ¿Crear ficha nueva de todas formas?')) return;
  }

  S.clientes.push(datos);
  saveToFirebase('clientes', S.clientes);
  showToast('Cliente guardado en la base de datos');
}

function actualizarCliente() {
  const datos = obtenerDatosFormCliente();
  const phone = normalizarTelefono(datos.whatsapp);

  let cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);
  if (cliente) {
    Object.assign(cliente, datos);
    saveToFirebase('clientes', S.clientes);
    showToast('Cliente actualizado');
  } else {
    if (datos.dni) {
      cliente = S.clientes.find(c => c.dni === datos.dni);
      if (cliente) {
        if (!confirm(`Se encontró un cliente con ese DNI (${cliente.nombre}). ¿Actualizar sus datos?`)) return;
        Object.assign(cliente, datos);
        saveToFirebase('clientes', S.clientes);
        showToast('Cliente actualizado');
        return;
      }
    }
    if (!confirm('No se encontró el cliente. ¿Guardar como nuevo?')) return;
    guardarNuevoCliente();
  }
}

// ── AGENDAR EN GOOGLE CONTACTS ──
function agendarContacto() {
  if (!S.convActiva) return;
  const nombre = prompt('Nombre para agendar:', S.convActiva.nombre || '');
  if (nombre === null) return;

  // Actualizar nombre en conversación
  const conv = S.conversaciones.find(c => c.phone === S.convActiva.phone);
  if (conv) conv.nombre = nombre;
  S.convActiva.nombre = nombre;

  // Guardar en Firebase (datos básicos del cliente)
  const datos = obtenerDatosFormCliente();
  datos.firstName = nombre.split(' ')[0] || nombre;
  datos.lastName  = nombre.split(' ').slice(1).join(' ') || '';
  datos.nombre    = nombre;

  const phone = normalizarTelefono(datos.whatsapp);
  let cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);
  if (!cliente) {
    S.clientes.push(datos);
  } else {
    cliente.nombre    = nombre;
    cliente.firstName = datos.firstName;
    cliente.lastName  = datos.lastName;
  }
  saveToFirebase('clientes', S.clientes);
  saveToFirebase('crmw_conversaciones', S.conversaciones);

  // Actualizar panel
  document.getElementById('panel-nombre').textContent = nombre;
  document.getElementById('chat-hdr-name').textContent = nombre;

  showToast('Contacto agendado y guardado en CRM');
}

// ── CREAR LEAD ──
function crearLead() {
  if (!S.convActiva) return;
  // Pre-llenar nombre si existe
  const conv = S.convActiva;
  document.getElementById('lead-nombre').value = conv.nombre || '';
  const busq = S.busquedas.find(b => b.phone === conv.phone && !b.terminada);
  document.getElementById('lead-importe').value = busq?.rango ? busq.rango.replace(/[^0-9]/g,'') : '';
  abrirModal('modal-crear-lead');
}

async function enviarEventoLead() {
  if (!S.convActiva) return;
  const nombre  = document.getElementById('lead-nombre').value;
  const importe = document.getElementById('lead-importe').value;

  const phone = normalizarTelefono(S.convActiva.phone);
  const cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);

  const ud = await buildUserData(cliente || { whatsapp: S.convActiva.phone, firstName: nombre.split(' ')[0] });
  const busq = S.busquedas.find(b => b.phone === S.convActiva.phone && !b.terminada);
  const cotiz = parseFloat(S.config.metaCotiz) || 1450;
  const valor = importe ? Math.round(parseFloat(importe) / cotiz) : 0;

  await enviarEventoMeta('Lead', {
    currency:  'USD',
    value:     valor,
    event_id:  busq?.id || generarId('LEAD'),
    content_name: busq?.tipo || 'Lead WhatsApp',
    content_category: 'PC',
    ctwa_clid: S.convActiva.ctwaClid || undefined
  }, ud);

  cerrarModal('modal-crear-lead');
  showToast('Evento Lead enviado a Meta CAPI');
}

// ── COMPROBANTES ──
function renderComprobantes(phone) {
  const container = document.getElementById('comp-list');
  if (!container) return;
  const comprobantes = S.eventos.filter(e => {
    const cliente = S.clientes.find(c => c.id === e.clienteId);
    return cliente && normalizarTelefono(cliente.whatsapp||'') === phone;
  });
  if (!comprobantes.length) {
    container.innerHTML = `<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px;">Sin comprobantes</div>`;
    return;
  }
  container.innerHTML = comprobantes.sort((a,b) => (b.timestamp||0)-(a.timestamp||0)).map(e => `
    <div class="comp-item" onclick="verComprobante('${e.id}')">
      <div class="comp-item-type ${e.tipo.toLowerCase()}">${e.tipo}</div>
      <div class="comp-item-name">${escHtml(e.nombre||'')}</div>
      <div class="comp-item-meta">${e.fecha} · ${e.id}</div>
    </div>`).join('');
}

function verComprobante(id) {
  window.open(`https://diegom472.github.io/casatecno-crm/?comprobante=${id}`, '_blank');
}

// ── NUEVA COMPRA / SERVICIO ──
function abrirNuevaCompra()   { abrirFormularioVenta('COMPRA');   }
function abrirNuevoServicio() { abrirFormularioVenta('SERVICIO'); }

function abrirFormularioVenta(tipo) {
  if (!S.convActiva) return;
  document.getElementById('modal-compra-title').textContent = tipo === 'COMPRA' ? 'Nueva Compra' : 'Nuevo Servicio';
  document.getElementById('modal-compra-body').innerHTML = buildFormularioVenta(tipo);
  abrirModal('modal-compra');
}

function buildFormularioVenta(tipo) {
  const id = generarId(tipo === 'COMPRA' ? 'NP' : 'NS');
  return `
  <div class="form-group full" style="margin-bottom:12px;">
    <label class="form-label">ID de consulta</label>
    <div style="display:flex;gap:7px;">
      <input class="form-input" id="venta-ctid" type="text" placeholder="CT-XXXXXX" style="flex:1;">
      <button class="btn btn-secondary btn-sm" onclick="buscarCTID()"><i class="ti ti-search"></i> Buscar</button>
    </div>
  </div>
  <div style="margin-bottom:10px;">
    <label class="form-label" style="display:block;margin-bottom:6px;">Ítems</label>
    <table class="items-table">
      <thead><tr><th style="width:45%">Descripción</th><th style="width:15%">Cant</th><th style="width:22%">Precio</th><th style="width:14%">Total</th><th></th></tr></thead>
      <tbody id="items-tbody">
        <tr>
          <td><input type="text" placeholder="RTX 4070..." id="item-desc-1" onchange="calcularTotalesVenta()"></td>
          <td><input type="number" value="1" min="1" id="item-cant-1" onchange="calcularTotalesVenta()" style="width:100%"></td>
          <td><input type="text" placeholder="0" id="item-precio-1" oninput="calcularTotalesVenta()" style="width:100%"></td>
          <td><span id="item-tot-1" style="font-size:12px;color:var(--text2);">$0</span></td>
          <td><button class="del-row-btn" onclick="this.closest('tr').remove();calcularTotalesVenta()">✕</button></td>
        </tr>
      </tbody>
    </table>
    <button class="btn btn-secondary btn-xs" onclick="agregarItemVenta()"><i class="ti ti-plus"></i> Agregar ítem</button>
  </div>
  <div class="pago-section">
    <div class="pago-row">
      <span class="pago-label">Total</span>
      <span class="total-display" id="venta-total">$0</span>
    </div>
    <div class="pago-row">
      <span class="pago-label">Abona</span>
      <input class="form-input" id="venta-abona" type="text" placeholder="0" style="width:140px;" oninput="calcularFaltaVenta()">
      <button class="btn btn-secondary btn-xs" onclick="setAbona(100)">100%</button>
      <button class="btn btn-secondary btn-xs" onclick="setAbona(50)">50%</button>
    </div>
    <div class="pago-row">
      <span class="pago-label">Falta</span>
      <span id="venta-falta" class="total-display" style="font-size:16px;">$0</span>
    </div>
    <div class="pago-row">
      <span class="pago-label">Medio</span>
      <select class="form-select" id="venta-medio" style="width:180px;">
        <option>Efectivo</option><option>Transferencia</option><option>Dólares</option>
        <option>Tarjeta</option><option>Crypto</option>
      </select>
    </div>
  </div>
  <div class="retira-section">
    <div class="retira-title">Datos de retira</div>
    <div class="retira-row">
      <div class="field-group"><label class="form-label">Nombre</label><input class="form-input" id="retira-nombre" type="text" placeholder="Nombre completo"></div>
      <div class="field-group"><label class="form-label">DNI</label><input class="form-input" id="retira-dni" type="text" placeholder="XX.XXX.XXX"></div>
    </div>
  </div>
  <div class="form-group" style="margin-top:12px;">
    <label class="form-label">FBC (Click ID Meta, opcional)</label>
    <input class="form-input" id="venta-fbc" type="text" placeholder="fb.1.1234567890.AbCdEfGh">
  </div>
  <div class="btn-row">
    <button class="btn btn-primary" onclick="guardarVenta('${tipo}','${id}')"><i class="ti ti-device-floppy"></i> Guardar ${tipo.toLowerCase()}</button>
    <button class="btn btn-success" onclick="guardarYEnviar('${tipo}','${id}')"><i class="ti ti-send"></i> Guardar y enviar al cliente</button>
    <button class="btn btn-secondary" onclick="cerrarModal('modal-compra')">Cancelar</button>
  </div>`;
}

let itemsCount = 1;

function agregarItemVenta() {
  itemsCount++;
  const tbody = document.getElementById('items-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Descripción..." id="item-desc-${itemsCount}" onchange="calcularTotalesVenta()"></td>
    <td><input type="number" value="1" min="1" id="item-cant-${itemsCount}" onchange="calcularTotalesVenta()" style="width:100%"></td>
    <td><input type="text" placeholder="0" id="item-precio-${itemsCount}" oninput="calcularTotalesVenta()" style="width:100%"></td>
    <td><span id="item-tot-${itemsCount}" style="font-size:12px;color:var(--text2);">$0</span></td>
    <td><button class="del-row-btn" onclick="this.closest('tr').remove();calcularTotalesVenta()">✕</button></td>`;
  tbody.appendChild(tr);
}

function calcularTotalesVenta() {
  let total = 0;
  document.querySelectorAll('#items-tbody tr').forEach((tr, i) => {
    const cant   = parseFloat(tr.querySelector('input[type="number"]')?.value||1)||1;
    const precio = parseFloat((tr.querySelector('input[placeholder="0"]')?.value||'').replace(/\D/g,''))||0;
    const tot    = cant * precio;
    total += tot;
    const totEl = tr.querySelector('[id^="item-tot"]');
    if (totEl) totEl.textContent = formatPeso(tot);
  });
  document.getElementById('venta-total').textContent = formatPeso(total);
  calcularFaltaVenta();
}

function calcularFaltaVenta() {
  const totalText = document.getElementById('venta-total')?.textContent || '$0';
  const total  = parseFloat(totalText.replace(/[^0-9]/g,''))||0;
  const abona  = parseFloat((document.getElementById('venta-abona')?.value||'').replace(/[^0-9]/g,''))||0;
  const falta  = total - abona;
  const faltaEl = document.getElementById('venta-falta');
  if (faltaEl) {
    faltaEl.textContent = formatPeso(falta);
    faltaEl.className = falta <= 0 ? 'total-display falta-ok' : 'total-display falta-pend';
  }
}

function setAbona(pct) {
  const totalText = document.getElementById('venta-total')?.textContent || '$0';
  const total = parseFloat(totalText.replace(/[^0-9]/g,''))||0;
  const abona = Math.round(total * pct / 100);
  const el = document.getElementById('venta-abona');
  if (el) { el.value = abona; calcularFaltaVenta(); }
}

async function guardarVenta(tipo, id) {
  if (!S.convActiva) return;
  const phone    = normalizarTelefono(S.convActiva.phone);
  const cliente  = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);
  if (!cliente) { showToast('Primero guardá los datos del cliente', 'error'); return; }

  const items = [];
  document.querySelectorAll('#items-tbody tr').forEach(tr => {
    const desc   = tr.querySelector('input[type="text"]')?.value||'';
    const cant   = parseFloat(tr.querySelector('input[type="number"]')?.value||1)||1;
    const precio = parseFloat((tr.querySelector('input[placeholder="0"]')?.value||'').replace(/[^0-9]/g,''))||0;
    if (desc) items.push({ desc, cant, precio, tot: cant*precio });
  });

  const total  = items.reduce((a,i)=>a+i.tot, 0);
  const abona  = parseFloat((document.getElementById('venta-abona')?.value||'').replace(/[^0-9]/g,''))||0;
  const ctid   = document.getElementById('venta-ctid')?.value||'';
  const fbc    = document.getElementById('venta-fbc')?.value||S.convActiva.fbc||'';

  const evento = {
    id,
    clienteId: cliente.id,
    tipo,
    nombre:    items[0]?.desc || tipo,
    fecha:     fechaHoy(),
    timestamp: timestampAhora(),
    esBorrador: false,
    data: {
      items,
      total,
      abona,
      medioPago:  document.getElementById('venta-medio')?.value||'Efectivo',
      pagosExtra: [],
      creadoPor:  S.usuario?.nombre||'',
      idConsulta: ctid,
      fbc,
      retiras: [{
        nombre: document.getElementById('retira-nombre')?.value||cliente.nombre||'',
        dni:    document.getElementById('retira-dni')?.value||cliente.dni||''
      }]
    }
  };

  S.eventos.push(evento);
  await saveToFirebase('eventos', S.eventos);

  // Mover a Cerrado en embudo
  if (tipo === 'COMPRA') moverEnEmbudo(S.convActiva.phone, 'Cerrado');

  // Disparar Purchase a Meta CAPI
  const cotiz = parseFloat(S.config.metaCotiz)||1450;
  const ud = await buildUserData(cliente);
  await enviarEventoMeta('Purchase', {
    currency:   'USD',
    value:      Math.round(total/cotiz),
    event_id:   ctid || id,
    content_name: evento.nombre,
    content_category: 'PC',
    fbc: fbc || undefined
  }, ud);

  // Refrescar panel
  renderComprobantes(phone);
  cerrarModal('modal-compra');
  showToast(`${tipo} guardada. Evento Purchase enviado a Meta.`);
}

async function guardarYEnviar(tipo, id) {
  await guardarVenta(tipo, id);
  if (!S.convActiva) return;
  const phone    = normalizarTelefono(S.convActiva.phone);
  const cliente  = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);
  const evento   = S.eventos.find(e => e.id === id);
  if (!evento) return;

  const plantilla = S.config.msgCompra || '';
  const falta = (evento.data.total||0) - (evento.data.abona||0);
  let msg = plantilla
    .replace('{{nombre}}', cliente?.firstName||'cliente')
    .replace('{{id}}',     id)
    .replace('{{total}}',  formatPeso(evento.data.total||0))
    .replace('{{abona}}',  formatPeso(evento.data.abona||0))
    .replace('{{falta}}',  formatPeso(falta));

  // Editable antes de enviar
  const editado = prompt('Revisá el mensaje antes de enviarlo:', msg);
  if (editado === null) return;
  await enviarPorWhatsApp(S.convActiva.phone, editado, 'text');
  showToast('Mensaje enviado al cliente');
}

// ── PEDIDO LISTO ──
async function marcarPedidoListo() {
  if (!S.convActiva) return;
  const phone   = normalizarTelefono(S.convActiva.phone);
  const cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);

  // Buscar último evento de compra
  const compras = S.eventos.filter(e => e.clienteId === cliente?.id && e.tipo === 'COMPRA');
  const ultima  = compras.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))[0];
  if (!ultima) { showToast('No hay compra registrada para este cliente', 'error'); return; }

  const id = generarId('PL');
  const evento = {
    id,
    clienteId: cliente.id,
    tipo:      'PEDIDO_LISTO',
    nombre:    `Pedido listo: ${ultima.nombre}`,
    fecha:     fechaHoy(),
    timestamp: timestampAhora(),
    data:      { idCompra: ultima.id, descripcion: ultima.nombre }
  };
  S.eventos.push(evento);
  await saveToFirebase('eventos', S.eventos);

  // Enviar mensaje al cliente
  const plantilla = S.config.msgListo || '';
  let msg = plantilla
    .replace('{{nombre}}',     cliente?.firstName||'cliente')
    .replace('{{id}}',         ultima.id)
    .replace('{{descripcion}}', ultima.nombre||'');

  const editado = prompt('Mensaje de pedido listo (editá si querés):', msg);
  if (editado !== null) {
    await enviarPorWhatsApp(S.convActiva.phone, editado, 'text');
  }

  renderComprobantes(phone);
  showToast('Pedido listo registrado y mensaje enviado');
}

// ── MENSAJES PROGRAMADOS PANEL ──
function renderProgListPanel(phone) {
  const container = document.getElementById('prog-list');
  if (!container) return;
  const progs = S.programados.filter(p => p.phone === phone && !p.enviado);
  if (!progs.length) {
    container.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text3);font-size:12px;">Sin mensajes programados</div>`;
    return;
  }
  container.innerHTML = progs.map(p => `
    <div class="prog-item" ondblclick="abrirEditarProg('${p.id}')">
      <div class="prog-item-title">${escHtml(p.titulo||'Sin título')}</div>
      <div class="prog-item-meta">${p.fecha||''} ${p.hora||''}</div>
      <div class="prog-item-sub">${escHtml(p.desc||'')}</div>
    </div>`).join('');
}

function abrirNuevoMsgProgramado() {
  if (!S.convActiva) { showToast('Seleccioná una conversación primero', 'error'); return; }
  document.getElementById('modal-prog-title').textContent = 'Programar nuevo mensaje';
  document.getElementById('prog-titulo').value = '';
  document.getElementById('prog-desc').value = '';
  document.getElementById('prog-date').value = '';
  document.getElementById('prog-time').value = '';
  document.getElementById('prog-msg-1').value = '';
  // Limpiar mensajes extra
  const container = document.getElementById('prog-mensajes-container');
  container.innerHTML = `<div class="form-group" style="margin-top:10px;">
    <label class="form-label">Mensaje 1</label>
    <textarea class="form-input" id="prog-msg-1" rows="3" placeholder="Texto del mensaje..."></textarea>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button class="btn btn-secondary btn-xs" onclick="usarTemplate(1)"><i class="ti ti-layout-grid"></i> Template</button>
      <button class="btn btn-secondary btn-xs" onclick="grabarAudio(1)"><i class="ti ti-microphone"></i> Audio</button>
    </div>
  </div>`;
  itemsCount = 1;
  abrirModal('modal-programado');
}

function agregarMensajeProg() {
  itemsCount++;
  const container = document.getElementById('prog-mensajes-container');
  const div = document.createElement('div');
  div.className = 'form-group';
  div.style.marginTop = '10px';
  div.innerHTML = `
    <label class="form-label">Mensaje ${itemsCount}</label>
    <textarea class="form-input" id="prog-msg-${itemsCount}" rows="3" placeholder="Texto del mensaje..."></textarea>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button class="btn btn-secondary btn-xs" onclick="usarTemplate(${itemsCount})"><i class="ti ti-layout-grid"></i> Template</button>
      <button class="btn btn-secondary btn-xs" onclick="grabarAudio(${itemsCount})"><i class="ti ti-microphone"></i> Audio</button>
    </div>`;
  container.appendChild(div);
}

function agendarMensaje() {
  if (!S.convActiva) return;
  const date   = document.getElementById('prog-date').value;
  const time   = document.getElementById('prog-time').value;
  const titulo = document.getElementById('prog-titulo').value;
  const desc   = document.getElementById('prog-desc').value;
  if (!date || !time || !titulo) { showToast('Completá fecha, hora y título', 'error'); return; }

  const dt = `${date}T${time}`;
  const msgs = [];
  for (let i = 1; i <= itemsCount; i++) {
    const el = document.getElementById(`prog-msg-${i}`);
    if (el?.value) msgs.push(el.value);
  }

  const prog = {
    id:       generarId('PROG'),
    phone:    S.convActiva.phone,
    operador: S.usuario?.email,
    titulo,
    desc,
    datetime: dt,
    fecha:    new Date(dt).toLocaleDateString('es-AR'),
    hora:     new Date(dt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
    mensajes: msgs,
    enviado:  false,
    createdAt: Date.now()
  };

  S.programados.push(prog);
  saveToFirebase('crmw_programados', S.programados);
  renderProgListPanel(S.convActiva.phone);
  cerrarModal('modal-programado');
  showToast('Mensaje programado para ' + prog.fecha + ' ' + prog.hora);
}

function actualizarMensajeProg() {
  showToast('Para actualizar, borrá y creá uno nuevo (próxima versión)', 'warn');
}

function usarTemplate(n) { showToast('Selección de template (próximamente en Predefinidos)', 'warn'); }
function grabarAudio(n)   { showToast('Grabación de audio para programados (próximamente)', 'warn'); }
function abrirCarrusel()  { showToast('Carrusel — configuralo en la pestaña Predefinidos', 'warn'); }

// ── RECORDATORIOS PANEL ──
function renderRecordatoriosPanel(phone) {
  const container = document.getElementById('recordatorios-list');
  if (!container) return;
  const recs = S.recordatorios.filter(r => r.phone === phone);
  if (!recs.length) {
    container.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text3);font-size:12px;">Sin recordatorios</div>`;
    return;
  }
  container.innerHTML = recs.map(r => `
    <div class="prog-item">
      <div class="prog-item-title">${escHtml(r.titulo)}</div>
      <div class="prog-item-meta">${r.fecha||''} — ${escHtml(r.operador||'')}</div>
      <div class="prog-item-sub">${escHtml(r.desc||'')}</div>
    </div>`).join('');
}

function abrirNuevoRecordatorio() {
  if (!S.convActiva) { showToast('Seleccioná una conversación primero', 'error'); return; }
  document.getElementById('rec-date').value = '';
  document.getElementById('rec-time').value = '';
  document.getElementById('rec-titulo').value = '';
  document.getElementById('rec-desc').value = '';
  abrirModal('modal-recordatorio');
}

function guardarRecordatorio() {
  if (!S.convActiva) return;
  const date   = document.getElementById('rec-date').value;
  const time   = document.getElementById('rec-time').value;
  const titulo = document.getElementById('rec-titulo').value;
  const desc   = document.getElementById('rec-desc').value;
  if (!date || !time || !titulo) { showToast('Completá fecha, hora y título', 'error'); return; }

  const dt = `${date}T${time}`;
  const rec = {
    id:       generarId('REC'),
    phone:    S.convActiva.phone,
    operador: S.usuario?.email,
    titulo,
    desc,
    datetime: dt,
    fecha:    new Date(dt).toLocaleDateString('es-AR'),
    hora:     time,
    mostrado: false,
    createdAt: Date.now()
  };
  S.recordatorios.push(rec);
  saveToFirebase('crmw_recordatorios', S.recordatorios);
  renderRecordatoriosPanel(S.convActiva.phone);
  cerrarModal('modal-recordatorio');
  showToast('Recordatorio agendado para ' + rec.fecha + ' ' + rec.hora);
}

// ── ARCHIVOS PANEL ──
function renderArchivosPanel(phone) {
  const container = document.getElementById('archivos-list');
  if (!container) return;
  const msgs = S.mensajesCache[phone] || [];
  const archivos = msgs.filter(m => ['imagen','audio','documento','video'].includes(m.tipo));
  if (!archivos.length) {
    container.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text3);font-size:12px;">Sin archivos adjuntos</div>`;
    return;
  }
  container.innerHTML = archivos.map(a => {
    const icon = a.tipo === 'imagen' ? 'ti-photo' : a.tipo === 'audio' ? 'ti-microphone' : a.tipo === 'video' ? 'ti-video' : 'ti-file';
    return `<div class="archivo-item" onclick="window.open('${a.url}','_blank')">
      <i class="ti ${icon} archivo-icon"></i>
      <div class="archivo-info">
        <div class="archivo-name">${escHtml(a.nombre||a.tipo)}</div>
        <div class="archivo-meta">${new Date(a.ts).toLocaleDateString('es-AR')} · ${a.dir === 'out' ? 'Enviado' : 'Recibido'}</div>
      </div>
    </div>`;
  }).join('');
}

// ── PENDIENTES ──
function renderPendientes() {
  const container = document.getElementById('pend-inner');
  if (!container || !S.usuario) return;

  const misEmail = S.usuario.email;
  const misBusquedas = S.busquedas.filter(b => b.operador === misEmail && !b.terminada);
  const misTareas    = S.tareas.filter(t => t.operador === misEmail && !t.realizada);

  let html = '';

  misBusquedas.forEach(b => {
    const conv = S.conversaciones.find(c => c.phone === b.phone);
    const nombre = conv?.nombre || b.phone;
    html += `<div class="nodal busqueda" draggable="true"
      data-id="${b.id}" data-tipo="busqueda"
      onclick="abrirDesdeNodal('${b.phone}')"
      oncontextmenu="event.preventDefault();finalizarDesdeNodal('busqueda','${b.id}')"
      ondragstart="dragNodal(event,this)"
      ondragend="dragEndNodal(this)"
      ondragover="dragOverNodal(event,this)"
      ondrop="dropNodal(event,this)">
      <div class="nodal-type">Búsqueda</div>
      <div class="nodal-name">${escHtml(nombre)}</div>
      ${b.tipo ? `<div class="nodal-sub">${escHtml(b.tipo)}</div>` : ''}
      ${b.prop1 ? `<div class="nodal-sub" style="font-size:10px;color:var(--nodal-busqueda-text);">${escHtml(b.prop1)}</div>` : ''}
      ${b.prop2 ? `<div class="nodal-sub" style="font-size:10px;color:var(--nodal-busqueda-text);">${escHtml(b.prop2)}</div>` : ''}
      ${b.prop3 ? `<div class="nodal-sub" style="font-size:10px;color:var(--nodal-busqueda-text);">${escHtml(b.prop3)}</div>` : ''}
      <div class="nodal-tags">
        ${b.rango ? `<span class="nodal-tag price">${escHtml(b.rango.slice(0,18))}</span>` : ''}
      </div>
    </div>`;
  });

  misTareas.forEach(t => {
    html += `<div class="nodal tarea" draggable="true"
      data-id="${t.id}" data-tipo="tarea"
      ondblclick="abrirDetalleTarea('${t.id}')"
      oncontextmenu="event.preventDefault();finalizarTareaDesdeNodal('${t.id}')"
      ondragstart="dragNodal(event,this)"
      ondragend="dragEndNodal(this)"
      ondragover="dragOverNodal(event,this)"
      ondrop="dropNodal(event,this)">
      <div class="nodal-type">Tarea</div>
      <div class="nodal-name">${escHtml(t.titulo)}</div>
      <div class="nodal-sub">${escHtml((t.detalles||'').slice(0,60))}</div>
      <div class="nodal-tags">
        <span class="nodal-tag date">${t.fecha||''}</span>
      </div>
    </div>`;
  });

  container.innerHTML = html ||
    `<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">Sin pendientes</div>`;
}

let dragSrcNodal = null;

function dragNodal(e, el) {
  dragSrcNodal = el;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', el.dataset.id);
  // NO cambiar opacidad — eso causaba el difuminado
  el.classList.add('dragging');
}

function dragEndNodal(el) {
  el.classList.remove('dragging');
  el.classList.remove('drag-over');
  document.querySelectorAll('.nodal').forEach(n => n.classList.remove('drag-over'));
}

function dragOverNodal(e, el) {
  e.preventDefault();
  if (dragSrcNodal && dragSrcNodal !== el) {
    document.querySelectorAll('.nodal').forEach(n => n.classList.remove('drag-over'));
    el.classList.add('drag-over');
  }
}

function dropNodal(e, el) {
  e.stopPropagation();
  e.preventDefault();
  document.querySelectorAll('.nodal').forEach(n => { n.classList.remove('drag-over'); n.classList.remove('dragging'); });
  if (dragSrcNodal && dragSrcNodal !== el) {
    const container = document.getElementById('pend-inner');
    const nodes = [...container.querySelectorAll('.nodal')];
    const srcIdx = nodes.indexOf(dragSrcNodal);
    const dstIdx = nodes.indexOf(el);
    if (srcIdx < dstIdx) el.after(dragSrcNodal);
    else el.before(dragSrcNodal);
  }
  dragSrcNodal = null;
}

function abrirDesdeNodal(phone) {
  switchTab('conversaciones');
  const conv = S.conversaciones.find(c => c.phone === phone);
  if (conv) abrirConversacion(phone);
}

function finalizarDesdeNodal(tipo, id) {
  if (!confirm('¿Finalizar este pendiente?')) return;
  if (tipo === 'busqueda') {
    const b = S.busquedas.find(x => x.id === id);
    if (b) { b.terminada = true; b.tsTerminada = Date.now(); b.fechaFin = fechaHoy(); }
    saveToFirebase('crmw_busquedas', S.busquedas);
  }
  renderPendientes();
  renderTerminadas();
  showToast('Finalizado');
}

function finalizarTareaDesdeNodal(id) {
  if (!confirm('¿Marcar como realizada?')) return;
  const t = S.tareas.find(x => x.id === id);
  if (t) { t.realizada = true; t.fechaFin = fechaHoy(); t.tsTerminada = Date.now(); }
  saveToFirebase('crmw_tareas', S.tareas);
  renderPendientes();
  renderTareas();
  showToast('Tarea finalizada');
}

function abrirPendientesAdmin() {
  // Llenar selector de operadores
  const sel = document.getElementById('pend-admin-operador');
  const operadores = [...new Set([
    ...S.busquedas.map(b => b.operador),
    ...S.tareas.map(t => t.operador)
  ].filter(Boolean))];

  sel.innerHTML = `<option value="">— Seleccionar operador —</option>` +
    operadores.filter(o => o !== S.usuario?.email).map(o =>
      `<option value="${escHtml(o)}">${escHtml(o)}</option>`
    ).join('');

  abrirModal('modal-pendientes-admin');
}

function cargarPendientesDeOperador(email) {
  const container = document.getElementById('pend-admin-list');
  if (!email) { container.innerHTML = ''; return; }

  const busquedas = S.busquedas.filter(b => b.operador === email && !b.terminada);
  const tareas    = S.tareas.filter(t => t.operador === email && !t.realizada);

  let html = '';
  busquedas.forEach(b => {
    const conv = S.conversaciones.find(c => c.phone === b.phone);
    html += `<div class="nodal busqueda" style="margin-bottom:7px;">
      <div class="nodal-type">Búsqueda</div>
      <div class="nodal-name">${escHtml(conv?.nombre||b.phone)}</div>
      <div class="nodal-sub">${escHtml(b.tipo||'')} — ${escHtml(b.rango||'')}</div>
    </div>`;
  });
  tareas.forEach(t => {
    html += `<div class="nodal tarea" style="margin-bottom:7px;">
      <div class="nodal-type">Tarea</div>
      <div class="nodal-name">${escHtml(t.titulo)}</div>
      <div class="nodal-sub">${escHtml((t.detalles||'').slice(0,50))}</div>
    </div>`;
  });

  container.innerHTML = html || `<div style="text-align:center;padding:20px;color:var(--text3);">Sin pendientes para este operador</div>`;
}

// ── BUSCAR CT-ID en JSONBin ──
async function buscarCTID() {
  const ctid = document.getElementById('venta-ctid')?.value;
  if (!ctid) { showToast('Ingresá un ID de consulta', 'error'); return; }
  showToast('Buscando...', 'warn');
  const datos = await buscarEnJsonBin(ctid);
  if (datos) {
    if (datos.fbc) document.getElementById('venta-fbc').value = datos.fbc;
    showToast('Datos técnicos del lead cargados');
  } else {
    showToast('No se encontró ese ID', 'error');
  }
}

// ── EMBUDO - mover conversación ──
function moverEnEmbudo(phone, etapa) {
  if (!S.embudo.tarjetas) S.embudo.tarjetas = {};
  // Remover de otras etapas
  Object.keys(S.embudo.tarjetas).forEach(e => {
    S.embudo.tarjetas[e] = (S.embudo.tarjetas[e]||[]).filter(p => p !== phone);
  });
  if (!S.embudo.tarjetas[etapa]) S.embudo.tarjetas[etapa] = [];
  if (!S.embudo.tarjetas[etapa].includes(phone)) S.embudo.tarjetas[etapa].push(phone);
  saveToFirebase('crmw_embudo', S.embudo);
}

// ── HTML ESCAPE ──
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── EMOTICONES ──
const EMOJIS = ['😀','😂','🤣','😊','😍','🥰','😎','🤩','😇','🙏','👍','👎','❤️','🔥','⚡','🎮','💻','🖥️','📦','✅','❌','⭐','💰','🎯','📞','💬','🚀','💪','🏆','🎁','📸','📄','🔧','⚙️','🛒','💳','📱','🖱️','⌨️','🎧','🖨️','📡','🔌','💡','🔋','📊','📈','📉','🗓️','⏰','📍','🏠','🏢','🚗','✈️','🌎','🌟','💫','✨','🎉','🎊','👋','🤝','👀','💭','❓','❗','➡️','⬅️','↩️','🔄'];

let emojisFiltrados = [...EMOJIS];

function toggleEmojiPanel() {
  const panel = document.getElementById('emoji-panel');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (isOpen) renderEmojiGrid(EMOJIS);
  // Cerrar al hacer click afuera
  if (isOpen) {
    setTimeout(() => {
      document.addEventListener('click', cerrarEmojiAlClickAfuera, { once: true });
    }, 100);
  }
}

function cerrarEmojiAlClickAfuera(e) {
  const panel = document.getElementById('emoji-panel');
  if (panel && !panel.contains(e.target)) panel.classList.remove('open');
}

function renderEmojiGrid(lista) {
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;
  grid.innerHTML = lista.map(e =>
    `<button class="emoji-btn" onclick="insertarEmoji('${e}')">${e}</button>`
  ).join('');
}

function filtrarEmojis(q) {
  renderEmojiGrid(q ? EMOJIS.filter(e => e.includes(q)) : EMOJIS);
}

function insertarEmoji(emoji) {
  const input = document.getElementById('msg-input');
  if (!input) return;
  const pos = input.selectionStart || input.value.length;
  input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
  input.focus();
  input.selectionStart = input.selectionEnd = pos + emoji.length;
  document.getElementById('emoji-panel')?.classList.remove('open');
}

// ── ETIQUETAS ──
const ETIQUETAS_DEFAULT = [
  { texto: 'GAMER ALTA',   color: 'var(--blue)',   bg: 'var(--blue-dim)' },
  { texto: 'PROFESIONAL',  color: 'var(--purple)', bg: 'var(--purple-dim)' },
  { texto: 'CALIENTE',     color: 'var(--accent)', bg: 'var(--accent-dim)' },
  { texto: 'EN PROCESO',   color: 'var(--amber)',  bg: 'var(--amber-dim)' },
  { texto: 'PAGÓ',         color: 'var(--green)',  bg: 'var(--green-dim)' },
  { texto: 'ESPERANDO',    color: 'var(--text2)',  bg: 'var(--bg4)' },
];

function abrirEtiquetarModal() {
  if (!S.convActiva) return;
  const panel = document.getElementById('etiquetas-panel');
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderEtiquetasPanel();
}

function renderEtiquetasPanel() {
  const container = document.getElementById('etiquetas-chips');
  if (!container) return;
  const etiquetas = S.config.etiquetas || ETIQUETAS_DEFAULT;
  const conv = S.convActiva;
  const activas = conv?.etiquetas || [];

  container.innerHTML = etiquetas.map((et, i) => {
    const sel = activas.includes(et.texto);
    return `<span class="etiqueta-chip ${sel ? 'selected' : ''}"
      style="background:${et.bg};color:${et.color};border-color:${sel ? et.color : 'transparent'}"
      onclick="toggleEtiqueta('${escHtml(et.texto)}')">
      ${escHtml(et.texto)}
      ${sel ? ' ✓' : ''}
    </span>`;
  }).join('');
}

function toggleEtiqueta(texto) {
  if (!S.convActiva) return;
  const conv = S.conversaciones.find(c => c.phone === S.convActiva.phone);
  if (!conv) return;
  if (!conv.etiquetas) conv.etiquetas = [];
  const idx = conv.etiquetas.indexOf(texto);
  if (idx >= 0) conv.etiquetas.splice(idx, 1);
  else conv.etiquetas.push(texto);
  saveToFirebase('crmw_conversaciones', S.conversaciones);
  renderEtiquetasPanel();
  renderTagsHeader(conv);
}

function agregarEtiqueta() {
  const input = document.getElementById('nueva-etiqueta-input');
  if (!input?.value.trim()) return;
  if (!S.config.etiquetas) S.config.etiquetas = [...ETIQUETAS_DEFAULT];
  S.config.etiquetas.push({ texto: input.value.trim().toUpperCase(), color: 'var(--text2)', bg: 'var(--bg4)' });
  input.value = '';
  saveLocal();
  renderEtiquetasPanel();
  showToast('Etiqueta agregada');
}
