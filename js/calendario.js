// ============================================
//  CALENDARIO — CRMW Casa Tecno
//  Vistas: Año / Mes / Semana
//  Eventos propios (crmw_eventos), por operador
// ============================================

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEM = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

const CAL_COLORES = [
  { nombre:'Rojo',    val:'#e83a2f' },
  { nombre:'Naranja', val:'#e8884f' },
  { nombre:'Amarillo',val:'#f0c020' },
  { nombre:'Verde',   val:'#1d9e75' },
  { nombre:'Celeste', val:'#2d7dd2' },
  { nombre:'Lila',    val:'#b07ce8' },
  { nombre:'Rosa',    val:'#ff5a8a' },
  { nombre:'Gris',    val:'#888888' },
];

let calVista = 'anio';
let calAnio  = new Date().getFullYear();
let calMesActual = new Date().getMonth();
let calSemanaRef = new Date();
let calSemanaSeleccionada = null;  // {anio, mes, dia} o null
let calDiaSeleccionado = null;     // fecha ISO o null
let calDiaPanelColapsado = false;
let evColorSel = 4;

// Colores personalizados de meses (header y borde), por año
function getCalColoresMes() {
  if (!S.config.calColoresMes) S.config.calColoresMes = {};
  return S.config.calColoresMes;
}

// Preferencias de calendario (zoom, cuadrícula)
function getCalPrefs() {
  if (!S.config.calPrefs) S.config.calPrefs = { zoom: 100, cuadricula: false };
  return S.config.calPrefs;
}
function calSetZoom(val) {
  getCalPrefs().zoom = parseInt(val);
  saveLocal();
  aplicarZoomCal();
}
function aplicarZoomCal() {
  const z = getCalPrefs().zoom / 100;
  const grid = document.querySelector('.cal-anio-grid');
  if (grid) {
    let cols = 4;
    if (z <= 0.85) cols = 5;
    else if (z <= 1.15) cols = 4;
    else if (z <= 1.35) cols = 3;
    else cols = 2;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.fontSize = z + 'em';
  }
}
function calToggleCuadricula(on) {
  getCalPrefs().cuadricula = on;
  saveLocal();
  const cont = document.getElementById('cal-contenido');
  if (cont) cont.classList.toggle('cal-cuadricula', on);
}

// ── EVENTOS (datos) ──
function getEventos() {
  if (!S.eventos) S.eventos = [];
  return S.eventos.filter(e => e.operador === S.usuario?.email);
}

function eventosDelDia(fechaISO) {
  return getEventos().filter(e => e.fecha === fechaISO && !e.finalizado);
}

// ── NAVEGACIÓN / VISTAS ──
function renderCalendario() {
  const sel = document.getElementById('cal-anio-select');
  if (sel && !sel.dataset.lleno) {
    const actual = new Date().getFullYear();
    let opts = '';
    for (let y = actual - 3; y <= actual + 5; y++) opts += `<option value="${y}">${y}</option>`;
    sel.innerHTML = opts;
    sel.dataset.lleno = '1';
  }
  if (sel) sel.value = calAnio;

  const prefs = getCalPrefs();
  const zoomEl = document.getElementById('cal-zoom');
  const cuadEl = document.getElementById('cal-cuadricula');
  if (zoomEl) zoomEl.value = prefs.zoom;
  if (cuadEl) cuadEl.checked = prefs.cuadricula;

  const ctrl = document.getElementById('cal-anio-controles');
  if (ctrl) ctrl.style.display = (calVista === 'anio') ? 'flex' : 'none';

  const cont = document.getElementById('cal-contenido');
  if (cont) cont.classList.toggle('cal-cuadricula', prefs.cuadricula);

  if (calVista === 'anio') renderVistaAnio();
  else if (calVista === 'mes') renderVistaMes();
  else if (calVista === 'semana') renderVistaSemana();
}

function calSetVista(v) {
  calVista = v;
  document.querySelectorAll('.cal-vista-btn').forEach(b => b.classList.toggle('active', b.dataset.vista === v));
  renderCalendario();
}

function calNavegar(dir) {
  if (calVista === 'anio') calAnio += dir;
  else if (calVista === 'mes') {
    calMesActual += dir;
    if (calMesActual > 11) { calMesActual = 0; calAnio++; }
    if (calMesActual < 0) { calMesActual = 11; calAnio--; }
  } else if (calVista === 'semana') {
    calSemanaRef.setDate(calSemanaRef.getDate() + dir * 7);
  }
  renderCalendario();
}

function calCambiarAnio(y) {
  calAnio = parseInt(y);
  renderCalendario();
}

// ── UTILIDADES DE FECHA (semana empieza lunes) ──
function primerDiaSemana(anio, mes) {
  // getDay: 0=Dom..6=Sab. Queremos 0=Lun..6=Dom
  let d = new Date(anio, mes, 1).getDay();
  return (d === 0) ? 6 : d - 1;
}
function diasEnMes(anio, mes) { return new Date(anio, mes + 1, 0).getDate(); }
function numeroSemanaISO(fecha) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return week;
}
function fechaISO(anio, mes, dia) {
  return `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
function hoyISO() {
  const n = new Date();
  return fechaISO(n.getFullYear(), n.getMonth(), n.getDate());
}

// ── VISTA AÑO ──
function renderVistaAnio() {
  document.getElementById('cal-titulo').textContent = calAnio;
  const cont = document.getElementById('cal-contenido');
  const coloresMes = getCalColoresMes();

  let html = '<div class="cal-anio-wrap"><div class="cal-anio-main"><div class="cal-anio-grid">';
  for (let mes = 0; mes < 12; mes++) {
    const colorKey = `${calAnio}-${mes}`;
    const cfg = coloresMes[colorKey] || {};
    const borderStyle = cfg.borde ? `border-color:${cfg.borde};` : '';
    const headerStyle = cfg.header ? `background:${cfg.header};color:#fff;` : '';
    const selClass = (calMesActual === mes) ? 'sel-mes' : '';

    html += `<div class="cal-mes-box ${selClass}" style="${borderStyle}"
      onclick="seleccionarMes(${mes})"
      oncontextmenu="event.preventDefault();calMenuColor(event,'borde',${mes})"
      ondblclick="ampliarMes(${mes})">
      <div class="cal-mes-header" style="${headerStyle}"
        oncontextmenu="event.preventDefault();event.stopPropagation();calMenuColor(event,'header',${mes})"
        ondblclick="event.stopPropagation();ampliarMes(${mes})">${MESES[mes]}</div>
      ${tablaMes(calAnio, mes, true)}
    </div>`;
  }
  html += '</div></div>';

  // Panel día lateral
  html += `<div class="cal-dia-panel ${calDiaPanelColapsado?'colapsado':''}" id="cal-dia-panel">
    ${renderPanelDia()}
  </div>`;
  html += '</div>';

  cont.innerHTML = html;
  aplicarZoomCal();
}

function renderPanelDia() {
  if (!calDiaSeleccionado) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span style="font-family:var(--font-cond);font-weight:700;font-size:14px;color:var(--text2);">Día</span>
        <button onclick="toggleDiaPanel()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;" title="Colapsar">»</button>
      </div>
      <div style="text-align:center;padding:30px 10px;color:var(--text3);font-size:12px;">Tocá un día del calendario para ver sus actividades</div>`;
  }
  const [a,m,d] = calDiaSeleccionado.split('-');
  const evs = eventosDelDia(calDiaSeleccionado);
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-family:var(--font-cond);font-weight:800;font-size:16px;">${d}/${m}/${a}</span>
      <button onclick="toggleDiaPanel()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;" title="Colapsar">»</button>
    </div>
    <button class="btn btn-primary btn-sm" style="width:100%;margin-bottom:10px;" onclick="abrirEventoNuevo('${calDiaSeleccionado}')"><i class="ti ti-plus"></i> Agendar actividad</button>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${evs.length ? evs.map(e => `
        <div ondblclick="abrirEventoEditar('${e.id}')" style="background:${e.color}1a;border-left:3px solid ${e.color};border-radius:6px;padding:8px 10px;cursor:pointer;" title="Doble click para editar">
          <div style="font-weight:700;font-size:13px;">${e.hora?`<span style="color:${e.color};">${e.hora}</span> `:''}${escHtml(e.titulo||'(sin título)')}</div>
          ${e.desc?`<div style="font-size:11px;color:var(--text2);margin-top:2px;">${escHtml(e.desc)}</div>`:''}
        </div>`).join('')
      : '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">Sin actividades este día</div>'}
    </div>`;
}

function toggleDiaPanel() {
  calDiaPanelColapsado = !calDiaPanelColapsado;
  const panel = document.getElementById('cal-dia-panel');
  if (panel) panel.classList.toggle('colapsado', calDiaPanelColapsado);
}

// Seleccionar mes (click simple) → se usará al entrar a vista Mes
function seleccionarMes(mes) {
  calMesActual = mes;
  calSemanaSeleccionada = null;
  document.querySelectorAll('.cal-mes-box').forEach((box,i) => box.classList.toggle('sel-mes', i === mes));
}

// Seleccionar día (click simple) → muestra en panel lateral
function seleccionarDia(iso, mes) {
  calDiaSeleccionado = iso;
  calMesActual = mes;
  if (calDiaPanelColapsado) calDiaPanelColapsado = false;
  // Refrescar solo el panel y marcar el día
  const panel = document.getElementById('cal-dia-panel');
  if (panel) { panel.classList.remove('colapsado'); panel.innerHTML = renderPanelDia(); }
  document.querySelectorAll('.cal-mes-tabla td.dia-sel').forEach(td => td.classList.remove('dia-sel'));
  const td = document.querySelector(`[data-iso="${iso}"]`);
  if (td) td.classList.add('dia-sel');
}

// Seleccionar semana (click simple) → guarda la semana y su mes
function seleccionarSemana(anio, mes, dia) {
  calSemanaSeleccionada = { anio, mes, dia };
  calMesActual = mes;
  calSemanaRef = new Date(anio, mes, dia);
  document.querySelectorAll('.cal-mes-tabla td.sel-sem').forEach(td => td.classList.remove('sel-sem'));
  // marcar visualmente
  if (event && event.currentTarget) event.currentTarget.classList.add('sel-sem');
  // resaltar también el mes
  document.querySelectorAll('.cal-mes-box').forEach((box,i) => box.classList.toggle('sel-mes', i === mes));
}

// Genera la tabla de un mes
function tablaMes(anio, mes, compacta) {
  const primero = primerDiaSemana(anio, mes);
  const dias = diasEnMes(anio, mes);
  let html = '<table class="cal-mes-tabla"><thead><tr><th>Sem</th>';
  DIAS_SEM.forEach(d => html += `<th>${d}</th>`);
  html += '</tr></thead><tbody>';

  let dia = 1;
  for (let fila = 0; fila < 6 && dia <= dias; fila++) {
    const refDia = (fila === 0) ? 1 : dia;
    const diaSem = Math.min(refDia, dias);
    const numSem = numeroSemanaISO(new Date(anio, mes, diaSem));
    const semSel = calSemanaSeleccionada && calSemanaSeleccionada.anio===anio && calSemanaSeleccionada.mes===mes &&
                   numeroSemanaISO(new Date(anio,mes,calSemanaSeleccionada.dia))===numSem;
    html += `<tr><td class="sem ${semSel?'sel-sem':''}"
      onclick="event.stopPropagation();seleccionarSemana(${anio},${mes},${diaSem})"
      ondblclick="event.stopPropagation();abrirSemanaDesde(${anio},${mes},${diaSem})"
      title="Click: seleccionar · Doble click: ver semana">${numSem}</td>`;
    for (let col = 0; col < 7; col++) {
      if ((fila === 0 && col < primero) || dia > dias) {
        html += '<td class="vacio"></td>';
      } else {
        const iso = fechaISO(anio, mes, dia);
        const evs = eventosDelDia(iso);
        const esHoy = iso === hoyISO();
        const esSel = iso === calDiaSeleccionado;
        let style = '';
        if (evs.length) style = `background:${evs[0].color};color:#fff;`;
        html += `<td class="dia ${esHoy?'hoy':''} ${esSel?'dia-sel':''} ${evs.length?'con-evento':''}" data-iso="${iso}" style="${style}"
          onclick="event.stopPropagation();seleccionarDia('${iso}',${mes})"
          ondblclick="event.stopPropagation();abrirEventoNuevo('${iso}')"
          title="${evs.map(e=>e.titulo||'(sin título)').join(', ')}">${dia}</td>`;
        dia++;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ── AMPLIAR MES (modal) ──
function ampliarMes(mes) {
  calMesActual = mes;
  document.getElementById('modal-mes-titulo').textContent = `${MESES[mes]} ${calAnio}`;
  document.getElementById('mes-ampliado-contenido').innerHTML = mesGrande(calAnio, mes);
  abrirModal('modal-mes-ampliado');
}

function mesGrande(anio, mes) {
  const primero = primerDiaSemana(anio, mes);
  const dias = diasEnMes(anio, mes);
  let html = '<table class="cal-mes-grande"><thead><tr><th style="width:36px;">Sem</th>';
  DIAS_SEM.forEach(d => html += `<th>${d}</th>`);
  html += '</tr></thead><tbody>';

  // Helper para abrir la fila con su número de semana
  let diaParaSemana = 1;
  const abrirFila = (primerDiaDeFila) => {
    const numSem = numeroSemanaISO(new Date(anio, mes, Math.min(primerDiaDeFila, dias)));
    return `<tr><td class="cal-sem-col" onclick="seleccionarSemana(${anio},${mes},${Math.min(primerDiaDeFila,dias)})" ondblclick="abrirSemanaDesde(${anio},${mes},${Math.min(primerDiaDeFila,dias)})" style="background:rgba(128,128,128,0.12);font-size:11px;color:var(--text3);font-weight:700;text-align:center;cursor:pointer;vertical-align:middle;">${numSem}</td>`;
  };

  html += abrirFila(1);
  for (let i = 0; i < primero; i++) html += '<td class="vacio"></td>';
  let col = primero;
  for (let dia = 1; dia <= dias; dia++) {
    if (col === 7) { html += '</tr>' + abrirFila(dia); col = 0; }
    const iso = fechaISO(anio, mes, dia);
    const evs = eventosDelDia(iso);
    const esHoy = iso === hoyISO();
    html += `<td ondblclick="abrirEventoNuevo('${iso}')" style="${esHoy?'background:var(--accent-dim);':''}">
      <div class="cal-dia-num">${dia}</div>
      ${evs.map(e => `<div class="cal-evento-chip" style="background:${e.color};" onclick="event.stopPropagation();abrirEventoEditar('${e.id}')">${e.hora?e.hora+' ':''}${escHtml(e.titulo||'(sin título)')}</div>`).join('')}
    </td>`;
    col++;
  }
  while (col < 7) { html += '<td class="vacio"></td>'; col++; }
  html += '</tr></tbody></table>';
  return html;
}

// ── VISTA MES (pantalla completa) ──
function renderVistaMes() {
  document.getElementById('cal-titulo').textContent = `${MESES[calMesActual]} ${calAnio}`;
  document.getElementById('cal-contenido').innerHTML = mesGrande(calAnio, calMesActual);
}

// ── VISTA SEMANA ──
function abrirSemanaDesde(anio, mes, dia) {
  calSemanaSeleccionada = { anio, mes, dia };
  calMesActual = mes;
  calSemanaRef = new Date(anio, mes, dia);
  calSetVista('semana');
}

function abrirSemanaModal(anio, mes, dia) {
  calSemanaRef = new Date(anio, mes, dia);
  document.getElementById('modal-semana-titulo').textContent = 'Semana';
  document.getElementById('semana-contenido').innerHTML = tablaSemana();
  abrirModal('modal-semana');
}

function lunesDeSemana(fecha) {
  const d = new Date(fecha);
  const day = (d.getDay() + 6) % 7; // 0=Lun
  d.setDate(d.getDate() - day);
  return d;
}

function tablaSemana() {
  const lunes = lunesDeSemana(calSemanaRef);
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(d);
  }

  let html = '<table class="cal-semana-tabla"><thead><tr><th></th>';
  dias.forEach((d,i) => {
    const iso = fechaISO(d.getFullYear(), d.getMonth(), d.getDate());
    const esHoy = iso === hoyISO();
    html += `<th style="${esHoy?'background:var(--accent-dim);':''}">${DIAS_SEM[i]}<br>${d.getDate()}/${d.getMonth()+1}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Horas de 7 a 22
  for (let h = 7; h <= 22; h++) {
    html += `<tr><td class="cal-semana-hora">${String(h).padStart(2,'0')}:00</td>`;
    dias.forEach(d => {
      const iso = fechaISO(d.getFullYear(), d.getMonth(), d.getDate());
      const evsHora = eventosDelDia(iso).filter(e => {
        if (!e.hora) return h === 9; // sin hora → mostrar a las 9
        return parseInt(e.hora.split(':')[0]) === h;
      });
      html += `<td class="cal-semana-celda" ondblclick="abrirEventoNuevo('${iso}','${String(h).padStart(2,'0')}:00')">
        ${evsHora.map(e => `<div class="cal-evento-chip" style="background:${e.color};" onclick="event.stopPropagation();abrirEventoEditar('${e.id}')">${escHtml(e.titulo||'(sin título)')}</div>`).join('')}
      </td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderVistaSemana() {
  const cont = document.getElementById('cal-contenido');
  // Si no se seleccionó ninguna semana, no mostrar nada
  if (!calSemanaSeleccionada) {
    document.getElementById('cal-titulo').textContent = 'Semana';
    cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text3);">
      <i class="ti ti-calendar-week" style="font-size:48px;opacity:0.3;"></i>
      <div style="margin-top:12px;font-size:14px;">Seleccioná una semana en la vista Año</div>
      <div style="font-size:12px;margin-top:4px;">Tocá el número de semana (columna izquierda de cada mes)</div>
    </div>`;
    return;
  }
  const lunes = lunesDeSemana(calSemanaRef);
  const dom = new Date(lunes); dom.setDate(lunes.getDate()+6);
  document.getElementById('cal-titulo').textContent =
    `${lunes.getDate()}/${lunes.getMonth()+1} - ${dom.getDate()}/${dom.getMonth()+1}`;
  cont.innerHTML = tablaSemana();
}

// ── MENÚ DE COLOR (click derecho en mes/header) ──
function calMenuColor(event, tipo, mes) {
  document.getElementById('cal-color-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'cal-color-menu';
  menu.style.cssText = `position:fixed;top:${event.clientY}px;left:${event.clientX}px;background:var(--bg2);border:1px solid var(--border2);border-radius:10px;box-shadow:var(--shadow2);z-index:9999;padding:10px;`;
  menu.innerHTML = `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Color del ${tipo === 'header' ? 'encabezado' : 'recuadro'}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;max-width:180px;">
      ${CAL_COLORES.map(c => `<span onclick="aplicarColorMes('${tipo}',${mes},'${c.val}')" title="${c.nombre}" style="width:24px;height:24px;border-radius:6px;background:${c.val};cursor:pointer;border:2px solid var(--border);"></span>`).join('')}
      <span onclick="aplicarColorMes('${tipo}',${mes},'')" title="Quitar" style="width:24px;height:24px;border-radius:6px;background:var(--bg3);cursor:pointer;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;">✕</span>
    </div>`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once:true }), 50);
}

function aplicarColorMes(tipo, mes, color) {
  const coloresMes = getCalColoresMes();
  const key = `${calAnio}-${mes}`;
  if (!coloresMes[key]) coloresMes[key] = {};
  if (color) coloresMes[key][tipo] = color;
  else delete coloresMes[key][tipo];
  saveLocal();
  document.getElementById('cal-color-menu')?.remove();
  renderCalendario();
}

// ── EVENTOS: crear / editar ──
function renderEvColorPicker(sel) {
  evColorSel = sel != null ? sel : 4;
  const cont = document.getElementById('ev-color-picker');
  if (!cont) return;
  cont.innerHTML = CAL_COLORES.map((c,i) => `
    <span onclick="selEvColor(${i})" title="${c.nombre}" style="width:30px;height:30px;border-radius:8px;background:${c.val};cursor:pointer;border:3px solid ${i===evColorSel?'var(--text)':'transparent'};"></span>
  `).join('');
}
function selEvColor(i) { evColorSel = i; renderEvColorPicker(i); }

function abrirEventoNuevo(fechaISO, hora) {
  document.getElementById('modal-evento-title').textContent = 'Agendar actividad';
  document.getElementById('ev-edit-id').value = '';
  document.getElementById('ev-fecha').value = fechaISO;
  document.getElementById('ev-titulo').value = '';
  document.getElementById('ev-hora').value = hora || '';
  document.getElementById('ev-desc').value = '';
  document.getElementById('ev-btn-finalizar').style.display = 'none';
  const [a,m,d] = fechaISO.split('-');
  document.getElementById('ev-fecha-display').textContent = `${d}/${m}/${a}`;
  renderEvColorPicker(4);
  abrirModal('modal-evento');
}

function abrirEventoEditar(id) {
  const ev = (S.eventos||[]).find(e => e.id === id);
  if (!ev) return;
  document.getElementById('modal-evento-title').textContent = 'Editar actividad';
  document.getElementById('ev-edit-id').value = id;
  document.getElementById('ev-fecha').value = ev.fecha;
  document.getElementById('ev-titulo').value = ev.titulo || '';
  document.getElementById('ev-hora').value = ev.hora || '';
  document.getElementById('ev-desc').value = ev.desc || '';
  document.getElementById('ev-btn-finalizar').style.display = 'inline-flex';
  const [a,m,d] = ev.fecha.split('-');
  document.getElementById('ev-fecha-display').textContent = `${d}/${m}/${a}`;
  const idx = CAL_COLORES.findIndex(c => c.val === ev.color);
  renderEvColorPicker(idx >= 0 ? idx : 4);
  abrirModal('modal-evento');
}

function guardarEvento() {
  const id     = document.getElementById('ev-edit-id').value;
  const fecha  = document.getElementById('ev-fecha').value;
  const titulo = document.getElementById('ev-titulo').value.trim();
  const hora   = document.getElementById('ev-hora').value;
  const desc   = document.getElementById('ev-desc').value.trim();
  const color  = CAL_COLORES[evColorSel].val;

  if (!S.eventos) S.eventos = [];

  if (id) {
    const ev = S.eventos.find(e => e.id === id);
    if (ev) { ev.titulo = titulo; ev.hora = hora; ev.desc = desc; ev.color = color; }
  } else {
    S.eventos.push({
      id: generarId('EV'),
      operador: S.usuario?.email,
      fecha, titulo, hora, desc, color,
      finalizado: false,
      createdAt: Date.now()
    });
  }
  saveToFirebase('crmw_eventos', S.eventos);
  cerrarModal('modal-evento');
  renderCalendario();
  // Refrescar modales abiertos
  if (document.getElementById('modal-mes-ampliado').classList.contains('open')) {
    document.getElementById('mes-ampliado-contenido').innerHTML = mesGrande(calAnio, calMesActual);
  }
  if (document.getElementById('modal-semana').classList.contains('open')) {
    document.getElementById('semana-contenido').innerHTML = tablaSemana();
  }
  if (typeof renderPendientes === 'function') renderPendientes();
  showToast('Actividad agendada');
}

function finalizarEvento() {
  const id = document.getElementById('ev-edit-id').value;
  if (!id) return;
  const ev = S.eventos.find(e => e.id === id);
  if (ev) { ev.finalizado = true; ev.tsFinalizado = Date.now(); }
  saveToFirebase('crmw_eventos', S.eventos);
  cerrarModal('modal-evento');
  renderCalendario();
  if (typeof renderPendientes === 'function') renderPendientes();
  showToast('Actividad finalizada');
}

// ── EVENTOS PENDIENTES (para el panel de Pendientes) ──
// Devuelve eventos no finalizados de hoy o anteriores (se arrastran)
function eventosPendientesHoy() {
  const hoy = hoyISO();
  return getEventos().filter(e => !e.finalizado && e.fecha <= hoy);
}
