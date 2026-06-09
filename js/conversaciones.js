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

  // Auto-agendar si es la primera vez que se abre y Google está configurado
  if (!conv.agendado && S.config.google?.refreshToken && S.config.google?.autoAgendar !== '0') {
    conv.agendado = true;
    autoAgendarNuevaConsulta(conv); // async, no bloquea UI
  }

  // Activar item en lista
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');

  // Mostrar chat activo
  document.getElementById('chat-placeholder').style.display = 'none';
  document.getElementById('chat-active').style.display = 'flex';
  document.getElementById('chat-active').style.flexDirection = 'column';
  document.getElementById('chat-active').style.flex = '1';

  // Header
  const initials = obtenerIniciales(conv.nombre || conv.phone);
  const avClass  = colorAvatar(conv.phone);
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

  // Scroll al mensaje más reciente (doble rAF para asegurar render completo)
  const cont = document.getElementById('chat-messages');
  if (cont) {
    requestAnimationFrame(() => requestAnimationFrame(() => { cont.scrollTop = cont.scrollHeight; }));
  }
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
      contenido = `<img src="${m.url}" style="max-width:220px;border-radius:6px;display:block;margin-bottom:4px;cursor:pointer;" onclick="event.stopPropagation();abrirImagenVisor('${m.url}','${(m.nombre||'imagen').replace(/'/g,'')}')" onerror="this.style.display='none'">`;
      if (m.caption) contenido += `<div style="margin-top:2px;">${escHtml(m.caption)}</div>`;
    } else if (m.tipo === 'video') {
      contenido = `<video src="${m.url}" controls style="max-width:220px;border-radius:6px;display:block;margin-bottom:4px;"></video>`;
      if (m.caption) contenido += `<div style="margin-top:2px;">${escHtml(m.caption)}</div>`;
    } else if (m.tipo === 'audio') {
      contenido = `<audio controls src="${m.url}" style="max-width:220px;"></audio>`;
    } else if (m.tipo === 'documento') {
      contenido = `<div style="display:flex;align-items:center;gap:7px;cursor:pointer;" onclick="event.stopPropagation();window.open('${m.url}','_blank')"><i class="ti ti-file" style="font-size:20px;"></i><div><div style="font-size:12px;">${escHtml(m.nombre||'Archivo')}</div><div style="font-size:10px;opacity:0.7;">${m.mimetype||''}</div></div></div>`;
      if (m.caption) contenido += `<div style="margin-top:4px;">${escHtml(m.caption)}</div>`;
    }

    // Respuesta citada — estilo WhatsApp (autor + texto), clickeable para saltar
    const citado = m.replyTo ? (() => {
      const orig = (S.mensajesCache[phone]||[]).find(x => x.id === m.replyTo);
      if (!orig) return '';
      const autor = orig.dir === 'out' ? 'Tú' : (S.convActiva?.nombre || 'Contacto');
      let resumen = orig.texto || (orig.tipo === 'imagen' ? '📷 Foto' : orig.tipo === 'audio' ? '🎤 Audio' : orig.tipo === 'video' ? '🎬 Video' : '📎 Archivo');
      const borderColor = cls === 'out' ? 'rgba(255,255,255,0.6)' : 'var(--accent)';
      const bgQuote = cls === 'out' ? 'rgba(255,255,255,0.15)' : 'var(--bg3)';
      return `<div onclick="event.stopPropagation();saltarAMensaje('${m.replyTo}')" style="cursor:pointer;background:${bgQuote};border-left:3px solid ${borderColor};border-radius:5px;padding:5px 9px;margin-bottom:5px;font-size:11px;">
        <div style="font-weight:700;color:${cls==='out'?'#fff':'var(--accent)'};margin-bottom:1px;">${escHtml(autor)}</div>
        <div style="opacity:0.85;">${escHtml(resumen.slice(0,70))}</div>
      </div>`;
    })() : '';

    const checkBox = modoReenvio ? `<input type="checkbox" class="msg-check" ${msgsSeleccionados.has(m.id)?'checked':''} onclick="event.stopPropagation();toggleMsgSeleccion('${m.id}',this.checked)" style="accent-color:var(--accent);width:18px;height:18px;flex-shrink:0;">` : '';

    if (modoReenvio) {
      // En modo reenvío: checkbox + burbuja en fila, sin acciones hover
      html += `<div class="msg-row ${cls} ${selClass}" id="msg-${m.id}" style="cursor:pointer;flex-direction:row;align-items:center;gap:8px;${cls==='out'?'justify-content:flex-end;':''}" onclick="toggleMsgSeleccion('${m.id}',!msgsSeleccionados.has('${m.id}'))">
        ${cls==='in' ? checkBox : ''}
        <div class="bubble ${cls}">${citado}${contenido}<div class="bubble-time">${hora}</div></div>
        ${cls==='out' ? checkBox : ''}
      </div>`;
    } else {
      // Modo normal: burbuja + acciones debajo
      html += `<div class="msg-row ${cls} ${selClass}" id="msg-${m.id}">
        <div class="bubble ${cls}">${citado}${contenido}<div class="bubble-time">${hora}</div></div>
        ${acciones}
      </div>`;
    }
  });

  container.innerHTML = html;
  // Forzar scroll al fondo (último mensaje siempre visible)
  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}

// ── VISOR DE IMÁGENES ──
function abrirImagenVisor(url, nombre) {
  let visor = document.getElementById('image-visor');
  if (!visor) {
    visor = document.createElement('div');
    visor.id = 'image-visor';
    visor.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;';
    visor.onclick = (e) => { if (e.target === visor) cerrarImagenVisor(); };
    document.body.appendChild(visor);
  }
  visor.innerHTML = `
    <img src="${url}" style="max-width:90vw;max-height:80vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.5);">
    <div style="display:flex;gap:10px;">
      <a href="${url}" download="${nombre||'imagen'}" class="btn btn-primary"><i class="ti ti-download"></i> Descargar</a>
      <button class="btn btn-secondary" onclick="window.open('${url}','_blank')"><i class="ti ti-external-link"></i> Abrir en pestaña</button>
      <button class="btn btn-secondary" onclick="cerrarImagenVisor()"><i class="ti ti-x"></i> Cerrar</button>
    </div>`;
  visor.style.display = 'flex';
}

function cerrarImagenVisor() {
  const visor = document.getElementById('image-visor');
  if (visor) visor.style.display = 'none';
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

// Saltar a un mensaje y resaltarlo brevemente
function saltarAMensaje(id) {
  const row = document.getElementById('msg-' + id);
  if (!row) { showToast('El mensaje no está visible en este chat', 'warn'); return; }
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Resaltado breve
  const bubble = row.querySelector('.bubble');
  if (bubble) {
    bubble.classList.add('msg-highlight');
    setTimeout(() => bubble.classList.remove('msg-highlight'), 1600);
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
  if (!S.convActiva) { showToast('No hay conversación activa', 'error'); return; }
  if (!contactosReenvioSeleccionados.size) { showToast('Seleccioná al menos un destinatario', 'error'); return; }
  if (!msgsSeleccionados.size) { showToast('No hay mensajes seleccionados', 'error'); return; }

  const phone = S.convActiva.phone;
  // Filtrar y ORDENAR por timestamp para respetar el orden original de la conversación
  const msgs = (S.mensajesCache[phone]||[])
    .filter(m => msgsSeleccionados.has(m.id))
    .sort((a,b) => (a.ts||0) - (b.ts||0));

  const destinos = [...contactosReenvioSeleccionados];
  const totalDestinos = destinos.length;

  showToast(`Reenviando ${msgs.length} mensaje(s) a ${totalDestinos} contacto(s)...`, 'warn');

  for (const dest of destinos) {
    if (!S.mensajesCache[dest]) S.mensajesCache[dest] = [];
    // Enviar SECUENCIALMENTE respetando el orden
    let baseTs = Date.now();
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      // ts incremental para mantener orden visual aunque lleguen rápido
      const copia = { ...msg, id: generarId('MSG'), dir: 'out', ts: baseTs + i * 1000, reenviado: true };
      S.mensajesCache[dest].push(copia);

      // Actualizar última conversación
      const convDest = S.conversaciones.find(c => c.phone === dest);
      if (convDest) {
        convDest.lastMsg = msg.tipo === 'texto' ? msg.texto : `[${msg.tipo}]`;
        convDest.lastTs = copia.ts;
      }

      // Enviar por WhatsApp respetando orden: esperar más en archivos pesados
      const delay = (msg.tipo === 'texto') ? 150 : 900;
      await enviarPorWhatsApp(dest, msg.tipo === 'texto' ? msg.texto : msg.url, msg.tipo === 'texto' ? 'text' : msg.tipo);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  saveToFirebase('crmw_conversaciones', S.conversaciones);
  cerrarModal('modal-selector-reenvio');
  cancelarReenvio();
  contactosReenvioSeleccionados = new Set();
  renderConvList();
  showToast(`✓ Reenviado a ${totalDestinos} contacto(s)`);
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
  // Si está respondiendo a un mensaje
  if (input.dataset.replyTo) {
    msg.replyTo = input.dataset.replyTo;
    delete input.dataset.replyTo;
  }

  if (!S.mensajesCache[S.convActiva.phone]) S.mensajesCache[S.convActiva.phone] = [];
  S.mensajesCache[S.convActiva.phone].push(msg);
  renderMensajes(S.convActiva.phone);

  const conv = S.conversaciones.find(c => c.phone === S.convActiva.phone);
  if (conv) { conv.lastMsg = texto; conv.lastTs = Date.now(); }

  input.value = '';
  input.style.height = 'auto';
  input.placeholder = 'Escribí un mensaje...';

  enviarPorWhatsApp(S.convActiva.phone, texto, 'text');
  saveToFirebase('crmw_conversaciones', S.conversaciones);
  renderConvList();
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
// ── ADJUNTAR ARCHIVOS con visor de composición ──
let colaAdjuntos = [];   // archivos en cola de envío
let adjuntoActivo = 0;   // índice del archivo que se está editando

function abrirAdjuntar() {
  if (!S.convActiva) { showToast('Seleccioná una conversación primero', 'error'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.mp3,.ogg,.m4a,.opus';
  input.multiple = true;  // permite seleccionar varios
  input.onchange = e => {
    const files = [...e.target.files];
    if (!files.length) return;
    files.forEach(f => {
      colaAdjuntos.push({
        file: f,
        url: URL.createObjectURL(f),
        tipo: f.type.startsWith('image') ? 'imagen' :
              f.type.startsWith('audio') ? 'audio' :
              f.type.startsWith('video') ? 'video' : 'documento',
        nombre: f.name,
        mimetype: f.type,
        caption: ''
      });
    });
    adjuntoActivo = 0;
    abrirVisorComposicion();
  };
  input.click();
}

function abrirVisorComposicion() {
  let visor = document.getElementById('adjunto-composer');
  if (!visor) {
    visor = document.createElement('div');
    visor.id = 'adjunto-composer';
    visor.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;';
    document.body.appendChild(visor);
  }
  renderVisorComposicion();
  visor.style.display = 'flex';
}

function renderVisorComposicion() {
  const visor = document.getElementById('adjunto-composer');
  if (!visor || !colaAdjuntos.length) { cerrarVisorComposicion(); return; }
  const a = colaAdjuntos[adjuntoActivo];

  let previewHTML = '';
  if (a.tipo === 'imagen') {
    previewHTML = `<img src="${a.url}" style="max-width:70vw;max-height:50vh;border-radius:8px;object-fit:contain;">`;
  } else if (a.tipo === 'video') {
    previewHTML = `<video src="${a.url}" controls style="max-width:70vw;max-height:50vh;border-radius:8px;"></video>`;
  } else {
    previewHTML = `<div style="background:var(--bg2);border-radius:12px;padding:40px 60px;text-align:center;color:var(--text);">
      <i class="ti ti-file" style="font-size:60px;color:var(--accent);"></i>
      <div style="margin-top:12px;font-size:14px;font-weight:600;">${escHtml(a.nombre)}</div>
    </div>`;
  }

  // Miniaturas de la cola
  const thumbs = colaAdjuntos.map((item, i) => {
    const thumb = item.tipo === 'imagen'
      ? `<img src="${item.url}" style="width:54px;height:54px;object-fit:cover;border-radius:8px;">`
      : `<div style="width:54px;height:54px;border-radius:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center;"><i class="ti ti-file" style="font-size:24px;color:var(--text2);"></i></div>`;
    return `<div onclick="cambiarAdjuntoActivo(${i})" style="position:relative;cursor:pointer;border:2px solid ${i===adjuntoActivo?'var(--accent)':'transparent'};border-radius:10px;padding:2px;">
      ${thumb}
      <button onclick="event.stopPropagation();quitarAdjunto(${i})" style="position:absolute;top:-6px;right:-6px;background:var(--accent);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1;">✕</button>
    </div>`;
  }).join('');

  visor.innerHTML = `
    <div style="position:absolute;top:16px;right:20px;">
      <button onclick="cerrarVisorComposicion()" style="background:none;border:none;color:#fff;font-size:28px;cursor:pointer;">✕</button>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;">${previewHTML}</div>
    <div style="width:100%;max-width:600px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;gap:8px;align-items:center;background:var(--bg2);border-radius:24px;padding:6px 8px 6px 16px;">
        <input id="adjunto-caption" type="text" value="${escHtml(a.caption||'')}"
          oninput="guardarCaptionActivo(this.value)"
          placeholder="Añadí un texto..."
          style="flex:1;background:none;border:none;outline:none;font-size:14px;color:var(--text);font-family:var(--font);">
        <button onclick="enviarTodaLaCola()" class="send-btn" style="flex-shrink:0;"><i class="ti ti-send"></i></button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;">
        ${thumbs}
        <button onclick="agregarMasAdjuntos()" style="width:54px;height:54px;border-radius:10px;border:2px dashed var(--border2);background:var(--bg3);color:var(--text2);font-size:24px;cursor:pointer;">+</button>
      </div>
    </div>`;
}

function cambiarAdjuntoActivo(i) { adjuntoActivo = i; renderVisorComposicion(); }
function guardarCaptionActivo(val) { if (colaAdjuntos[adjuntoActivo]) colaAdjuntos[adjuntoActivo].caption = val; }
function quitarAdjunto(i) {
  colaAdjuntos.splice(i, 1);
  if (adjuntoActivo >= colaAdjuntos.length) adjuntoActivo = Math.max(0, colaAdjuntos.length-1);
  renderVisorComposicion();
}
function agregarMasAdjuntos() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx'; input.multiple = true;
  input.onchange = e => {
    [...e.target.files].forEach(f => {
      colaAdjuntos.push({
        file: f, url: URL.createObjectURL(f),
        tipo: f.type.startsWith('image') ? 'imagen' : f.type.startsWith('video') ? 'video' : 'documento',
        nombre: f.name, mimetype: f.type, caption: ''
      });
    });
    renderVisorComposicion();
  };
  input.click();
}
function cerrarVisorComposicion() {
  const visor = document.getElementById('adjunto-composer');
  if (visor) visor.style.display = 'none';
  colaAdjuntos = []; adjuntoActivo = 0;
}

async function enviarTodaLaCola() {
  if (!S.convActiva || !colaAdjuntos.length) return;
  const phone = S.convActiva.phone;
  if (!S.mensajesCache[phone]) S.mensajesCache[phone] = [];

  let baseTs = Date.now();
  for (let i = 0; i < colaAdjuntos.length; i++) {
    const a = colaAdjuntos[i];
    // Mensaje del archivo
    S.mensajesCache[phone].push({
      id: generarId('MSG'), tipo: a.tipo, url: a.url,
      nombre: a.nombre, mimetype: a.mimetype,
      caption: a.caption || '',
      dir: 'out', ts: baseTs + i*1000, operador: S.usuario?.nombre
    });
    await enviarPorWhatsApp(phone, a.url, a.tipo);
    // Si tiene caption, mandarlo como texto adjunto
    await new Promise(r => setTimeout(r, 400));
  }

  const conv = S.conversaciones.find(c => c.phone === phone);
  if (conv) { conv.lastMsg = `[${colaAdjuntos.length} archivo(s)]`; conv.lastTs = Date.now(); }

  renderMensajes(phone);
  renderConvList();
  cerrarVisorComposicion();
  showToast('Archivos enviados');
}

async function subirArchivo(file) {
  // Compatibilidad: un solo archivo va directo a la cola/visor
  if (!S.convActiva) return;
  colaAdjuntos = [{
    file, url: URL.createObjectURL(file),
    tipo: file.type.startsWith('image') ? 'imagen' :
          file.type.startsWith('audio') ? 'audio' :
          file.type.startsWith('video') ? 'video' : 'documento',
    nombre: file.name, mimetype: file.type, caption: ''
  }];
  adjuntoActivo = 0;
  abrirVisorComposicion();
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
    ['b-palabras','b-tipo','b-rango','b-prop1','b-prop2','b-prop3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('busqueda-draft-badge').style.display = 'inline';
  }
}

// El autosave ya NO crea búsquedas. Solo guarda un borrador local en la conversación.
// La búsqueda "real" (nodal en Pendientes) se crea solo con "Guardar Nueva".
function autosaveBusqueda() {
  if (!S.convActiva) return;
  clearTimeout(busquedaAutoSaveTimer);
  busquedaAutoSaveTimer = setTimeout(() => {
    const phone = S.convActiva.phone;
    // Si ya existe una búsqueda guardada para esta conversación, actualizarla en vivo
    const busq = S.busquedas.find(b => b.phone === phone && !b.terminada && b.guardada);
    if (busq) {
      busq.palabras  = document.getElementById('b-palabras').value;
      busq.tipo      = document.getElementById('b-tipo').value;
      busq.rango     = document.getElementById('b-rango').value;
      busq.prop1     = document.getElementById('b-prop1').value;
      busq.prop2     = document.getElementById('b-prop2').value;
      busq.prop3     = document.getElementById('b-prop3').value;
      busq.updatedAt = Date.now();
      saveToFirebase('crmw_busquedas', S.busquedas);
      renderPendientes();
    } else {
      // Guardar como borrador en la conversación (no crea nodal todavía)
      const conv = S.conversaciones.find(c => c.phone === phone);
      if (conv) {
        conv.borradorBusqueda = {
          palabras: document.getElementById('b-palabras').value,
          tipo:     document.getElementById('b-tipo').value,
          rango:    document.getElementById('b-rango').value,
          prop1:    document.getElementById('b-prop1').value,
          prop2:    document.getElementById('b-prop2').value,
          prop3:    document.getElementById('b-prop3').value
        };
      }
    }
  }, 1200);
}

function guardarNuevaBusqueda() {
  if (!S.convActiva) return;
  clearTimeout(busquedaAutoSaveTimer);
  const phone = S.convActiva.phone;

  // Si ya hay una búsqueda activa guardada, NO duplicar: actualizar esa
  const existente = S.busquedas.find(b => b.phone === phone && !b.terminada && b.guardada);
  if (existente) {
    actualizarBusqueda();
    return;
  }

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
  moverEnEmbudo(phone, 'Descubierto');
  document.getElementById('busqueda-draft-badge').style.display = 'none';
  showToast('Búsqueda guardada y agregada a Pendientes');
}

function actualizarBusqueda() {
  if (!S.convActiva) return;
  clearTimeout(busquedaAutoSaveTimer);

  const phone = S.convActiva.phone;
  let busq = S.busquedas.find(b => b.phone === phone && !b.terminada);

  // Si no existe ninguna, crear una nueva (primera vez)
  if (!busq) { guardarNuevaBusqueda(); return; }

  busq.palabras  = document.getElementById('b-palabras').value;
  busq.tipo      = document.getElementById('b-tipo').value;
  busq.rango     = document.getElementById('b-rango').value;
  busq.prop1     = document.getElementById('b-prop1').value;
  busq.prop2     = document.getElementById('b-prop2').value;
  busq.prop3     = document.getElementById('b-prop3').value;
  busq.guardada  = true;
  busq.updatedAt = Date.now();
  if (S.usuario?.email && busq.operador !== S.usuario.email) {
    busq.operador = S.usuario.email;
  }

  saveToFirebase('crmw_busquedas', S.busquedas);
  renderPendientes();
  renderTagsHeader(S.convActiva);
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
async function agendarContacto() {
  if (!S.convActiva) return;
  const nombre = prompt('Nombre para agendar:', S.convActiva.nombre || '');
  if (nombre === null) return;

  const conv = S.conversaciones.find(c => c.phone === S.convActiva.phone);

  // Generar ID de consulta si no tiene
  if (!conv?.idConsulta) {
    const id = generarIdConsulta();
    if (conv) conv.idConsulta = id;
    S.convActiva.idConsulta = id;
  }

  // Actualizar nombre
  const nombreFinal = nombre.trim();
  if (conv) conv.nombre = nombreFinal;
  S.convActiva.nombre = nombreFinal;

  // Guardar en Firebase
  const datos = obtenerDatosFormCliente();
  datos.firstName = nombreFinal.split(' ')[0] || nombreFinal;
  datos.lastName  = nombreFinal.split(' ').slice(1).join(' ') || '';
  datos.nombre    = nombreFinal;

  const phone = normalizarTelefono(datos.whatsapp);
  let cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);
  if (!cliente) {
    S.clientes.push(datos);
  } else {
    cliente.nombre    = nombreFinal;
    cliente.firstName = datos.firstName;
    cliente.lastName  = datos.lastName;
  }
  saveToFirebase('clientes', S.clientes);
  saveToFirebase('crmw_conversaciones', S.conversaciones);

  // Actualizar panel visual
  document.getElementById('panel-nombre').textContent = nombreFinal;
  document.getElementById('chat-hdr-name').textContent = nombreFinal;

  // Sincronizar con Google Contacts
  if (S.config.google?.refreshToken) {
    showToast('Agendando en Google Contacts...', 'warn');
    await sincronizarConGoogleContacts(conv || S.convActiva, false);
  } else {
    showToast('Contacto guardado en CRM');
  }
}

// ── EDITAR CONTACTO ──
function editarContactoGoogle() {
  if (!S.convActiva) return;
  const phone   = normalizarTelefono(S.convActiva.phone);
  const cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);
  const conv    = S.conversaciones.find(c => c.phone === S.convActiva.phone);
  const idConsulta = conv?.idConsulta || S.convActiva.idConsulta || '—';

  // Mostrar ID en el modal
  const idEl = document.getElementById('edit-contacto-id-display');
  if (idEl) idEl.textContent = `ID de consulta: ${idConsulta}  ·  Tel: ${S.convActiva.phone}`;

  // Pre-llenar formulario
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
  set('edit-c-nombre',    cliente?.firstName || S.convActiva.nombre?.split(' ')[0] || '');
  set('edit-c-apellido',  cliente?.lastName  || S.convActiva.nombre?.split(' ').slice(1).join(' ') || '');
  set('edit-c-dni',       cliente?.dni       || '');
  set('edit-c-email',     cliente?.email     || '');
  set('edit-c-domicilio', cliente?.domicilio || '');
  set('edit-c-localidad', cliente?.localidad || 'Córdoba');
  set('edit-c-provincia', cliente?.provincia || 'Córdoba');
  set('edit-c-cp',        cliente?.cp        || '5000');
  if (cliente?.iva) document.getElementById('edit-c-iva').value = cliente.iva;

  abrirModal('modal-editar-contacto');
}

async function guardarEdicionContacto() {
  if (!S.convActiva) return;
  const phone    = normalizarTelefono(S.convActiva.phone);
  const nombreN  = document.getElementById('edit-c-nombre').value.trim();
  const apellidoN= document.getElementById('edit-c-apellido').value.trim();
  const nombreCompleto = [nombreN, apellidoN].filter(Boolean).join(' ');

  // Actualizar nombre en conversación
  const conv = S.conversaciones.find(c => c.phone === S.convActiva.phone);
  if (conv && nombreCompleto) {
    conv.nombre = nombreCompleto;
    S.convActiva.nombre = nombreCompleto;
  }

  // Actualizar o crear cliente en Firebase
  let cliente = S.clientes.find(c => normalizarTelefono(c.whatsapp||'') === phone);
  const datosNuevos = {
    firstName: nombreN,
    lastName:  apellidoN,
    nombre:    nombreCompleto,
    dni:       document.getElementById('edit-c-dni').value,
    email:     document.getElementById('edit-c-email').value,
    domicilio: document.getElementById('edit-c-domicilio').value,
    localidad: document.getElementById('edit-c-localidad').value,
    provincia: document.getElementById('edit-c-provincia').value,
    cp:        document.getElementById('edit-c-cp').value,
    iva:       document.getElementById('edit-c-iva').value,
    whatsapp:  S.convActiva.phone,
    canal:     'WhatsApp'
  };

  if (cliente) {
    Object.assign(cliente, datosNuevos);
  } else {
    datosNuevos.id = generarId('C');
    S.clientes.push(datosNuevos);
  }

  await saveToFirebase('clientes', S.clientes);
  await saveToFirebase('crmw_conversaciones', S.conversaciones);

  // Actualizar panel visual
  if (nombreCompleto) {
    document.getElementById('panel-nombre').textContent = nombreCompleto;
    document.getElementById('chat-hdr-name').textContent = nombreCompleto;
    // Actualizar campos del formulario lateral
    document.getElementById('c-nombre').value  = nombreN;
    document.getElementById('c-apellido').value = apellidoN;
  }

  // Sincronizar con Google si está configurado y el checkbox está marcado
  const syncGoogle = document.getElementById('edit-sync-google')?.checked;
  if (syncGoogle && S.config.google?.refreshToken) {
    showToast('Sincronizando con Google Contacts...', 'warn');
    await sincronizarConGoogleContacts(conv || S.convActiva, true); // forzar actualización
  } else {
    showToast('Contacto actualizado en CRM');
  }

  cerrarModal('modal-editar-contacto');
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
  container.innerHTML = progs.map(p => {
    const textoMsg = (p.mensajes && p.mensajes.length) ? p.mensajes[0] : (p.desc||'');
    return `
    <div class="prog-item" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" ondblclick="abrirEditarProg('${p.id}')" title="Doble click para editar">
      <div style="border-right:1px solid var(--border);padding-right:8px;">
        <div class="prog-item-title">${escHtml(p.titulo||'Sin título')}</div>
        <div class="prog-item-meta">${p.fecha||''} ${p.hora||''}</div>
      </div>
      <div>
        <div class="prog-item-sub" style="white-space:normal;">${escHtml((textoMsg||'').slice(0,100))}</div>
      </div>
    </div>`;
  }).join('');
}

function abrirNuevoMsgProgramado() {
  if (!S.convActiva) { showToast('Seleccioná una conversación primero', 'error'); return; }
  document.getElementById('modal-programado').dataset.editId = '';
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

function abrirEditarProg(id) {
  const p = S.programados.find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-prog-title').textContent = 'Editar mensaje programado';
  document.getElementById('modal-programado').dataset.editId = id;
  document.getElementById('prog-titulo').value = p.titulo || '';
  document.getElementById('prog-desc').value   = p.desc || '';
  // Separar fecha y hora desde datetime
  if (p.datetime) {
    const [fecha, hora] = p.datetime.split('T');
    document.getElementById('prog-date').value = fecha || '';
    document.getElementById('prog-time').value = (hora||'').slice(0,5);
  }
  // Reconstruir mensajes
  const container = document.getElementById('prog-mensajes-container');
  const msgs = p.mensajes && p.mensajes.length ? p.mensajes : [''];
  container.innerHTML = msgs.map((m, i) => `
    <div class="form-group" style="margin-top:10px;">
      <label class="form-label">Mensaje ${i+1}</label>
      <textarea class="form-input" id="prog-msg-${i+1}" rows="3" placeholder="Texto del mensaje...">${escHtml(m)}</textarea>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-secondary btn-xs" onclick="usarTemplate(${i+1})"><i class="ti ti-layout-grid"></i> Template</button>
        <button class="btn btn-secondary btn-xs" onclick="grabarAudio(${i+1})"><i class="ti ti-microphone"></i> Audio</button>
      </div>
    </div>`).join('');
  itemsCount = msgs.length;
  abrirModal('modal-programado');
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

  const editId = document.getElementById('modal-programado').dataset.editId;
  if (editId) {
    // Editar existente
    const p = S.programados.find(x => x.id === editId);
    if (p) {
      p.titulo = titulo; p.desc = desc; p.datetime = dt;
      p.fecha = new Date(dt).toLocaleDateString('es-AR');
      p.hora  = new Date(dt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
      p.mensajes = msgs;
    }
    document.getElementById('modal-programado').dataset.editId = '';
  } else {
    // Crear nuevo
    S.programados.push({
      id:        generarId('PROG'),
      phone:     S.convActiva.phone,
      operador:  S.usuario?.email,
      titulo, desc, datetime: dt,
      fecha:     new Date(dt).toLocaleDateString('es-AR'),
      hora:      new Date(dt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
      mensajes:  msgs,
      enviado:   false,
      createdAt: Date.now()
    });
  }

  saveToFirebase('crmw_programados', S.programados);
  renderProgListPanel(S.convActiva.phone);
  cerrarModal('modal-programado');
  showToast('Mensaje programado para ' + new Date(dt).toLocaleDateString('es-AR') + ' ' + time);
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
  const recs = S.recordatorios.filter(r => r.phone === phone && !r.mostrado);
  if (!recs.length) {
    container.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text3);font-size:12px;">Sin recordatorios</div>`;
    return;
  }
  container.innerHTML = recs.map(r => `
    <div class="prog-item" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" ondblclick="abrirEditarRecordatorio('${r.id}')" title="Doble click para editar">
      <div style="border-right:1px solid var(--border);padding-right:8px;">
        <div class="prog-item-title">${escHtml(r.titulo)}</div>
        <div class="prog-item-meta">${r.fecha||''} ${r.hora||''}</div>
      </div>
      <div>
        <div class="prog-item-sub" style="white-space:normal;">${escHtml((r.desc||'').slice(0,100))}</div>
      </div>
    </div>`).join('');
}

function abrirEditarRecordatorio(id) {
  const r = S.recordatorios.find(x => x.id === id);
  if (!r) return;
  document.getElementById('modal-recordatorio').dataset.editId = id;
  if (r.datetime) {
    const [fecha, hora] = r.datetime.split('T');
    document.getElementById('rec-date').value = fecha || '';
    document.getElementById('rec-time').value = (hora||'').slice(0,5);
  }
  document.getElementById('rec-titulo').value = r.titulo || '';
  document.getElementById('rec-desc').value   = r.desc || '';
  abrirModal('modal-recordatorio');
}

function abrirNuevoRecordatorio() {
  if (!S.convActiva) { showToast('Seleccioná una conversación primero', 'error'); return; }
  document.getElementById('modal-recordatorio').dataset.editId = '';
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
  const editId = document.getElementById('modal-recordatorio').dataset.editId;

  if (editId) {
    const r = S.recordatorios.find(x => x.id === editId);
    if (r) {
      r.titulo = titulo; r.desc = desc; r.datetime = dt;
      r.fecha = new Date(dt).toLocaleDateString('es-AR'); r.hora = time;
      r.mostrado = false;
    }
    document.getElementById('modal-recordatorio').dataset.editId = '';
  } else {
    S.recordatorios.push({
      id:       generarId('REC'),
      phone:    S.convActiva.phone,
      operador: S.usuario?.email,
      titulo, desc, datetime: dt,
      fecha:    new Date(dt).toLocaleDateString('es-AR'),
      hora:     time,
      mostrado: false,
      createdAt: Date.now()
    });
  }
  saveToFirebase('crmw_recordatorios', S.recordatorios);
  renderRecordatoriosPanel(S.convActiva.phone);
  cerrarModal('modal-recordatorio');
  showToast('Recordatorio agendado para ' + new Date(dt).toLocaleDateString('es-AR') + ' ' + time);
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

  const misEmail    = S.usuario.email;
  const misBusquedas = S.busquedas.filter(b => b.operador === misEmail && !b.terminada);
  const misTareas    = S.tareas.filter(t => t.operador === misEmail && !t.realizada);

  let html = '';

  // ── NODAL BÚSQUEDA ──
  // Izq: nombre | tipo | rango     Der: Propuesta 1 | Propuesta 2 | Propuesta 3
  misBusquedas.forEach(b => {
    const conv   = S.conversaciones.find(c => c.phone === b.phone);
    const nombre = conv?.nombre || b.phone;

    // Propuestas conservan su posición: 1 arriba, 2 medio, 3 abajo
    // Si solo está la 2, va al medio; si solo la 3, va abajo
    const tieneAlguna = b.prop1 || b.prop2 || b.prop3;
    const slot = (txt) => txt
      ? `<div class="nodal-prop">${escHtml(txt)}</div>`
      : `<div class="nodal-prop" style="visibility:hidden;">·</div>`;
    const propHTML = tieneAlguna
      ? `${slot(b.prop1)}${slot(b.prop2)}${slot(b.prop3)}`
      : '<div class="nodal-prop" style="color:var(--text3);font-style:italic;">Sin propuestas</div>';

    html += `<div class="nodal busqueda" draggable="true"
      data-id="${b.id}" data-tipo="busqueda"
      onclick="abrirDesdeNodal('${b.phone}')"
      oncontextmenu="event.preventDefault();finalizarDesdeNodal('busqueda','${b.id}')"
      ondragstart="dragNodal(event,this)"
      ondragend="dragEndNodal(this)"
      ondragover="dragOverNodal(event,this)"
      ondrop="dropNodal(event,this)">
      <div class="nodal-left">
        <div class="nodal-name">${escHtml(nombre)}</div>
        ${b.tipo  ? `<div class="nodal-cat">${escHtml(b.tipo)}</div>` : ''}
        ${b.rango ? `<div class="nodal-rango">${escHtml(b.rango)}</div>` : ''}
      </div>
      <div class="nodal-right">
        ${propHTML}
      </div>
    </div>`;
  });

  // ── NODAL TAREA ──
  // Izq: título | fecha+hora creación     Der: descripción
  misTareas.forEach(t => {
    const fechaCreacion = t.fecha || fechaHoy();
    const horaCreacion  = t.horaCreacion || '';

    html += `<div class="nodal tarea" draggable="true"
      data-id="${t.id}" data-tipo="tarea"
      ondblclick="abrirDetalleTarea('${t.id}')"
      oncontextmenu="event.preventDefault();finalizarTareaDesdeNodal('${t.id}')"
      ondragstart="dragNodal(event,this)"
      ondragend="dragEndNodal(this)"
      ondragover="dragOverNodal(event,this)"
      ondrop="dropNodal(event,this)">
      <div class="nodal-left">
        <div class="nodal-name">${escHtml(t.titulo)}</div>
        <div class="nodal-date">${fechaCreacion}${horaCreacion ? ' · '+horaCreacion : ''}</div>
      </div>
      <div class="nodal-right">
        <div class="nodal-prop">${escHtml((t.detalles||'Sin descripción').slice(0,80))}</div>
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
