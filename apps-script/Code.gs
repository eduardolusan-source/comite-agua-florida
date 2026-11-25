/**
 * Comité de Agua de La Florida · Apps Script ligado a la hoja «PADRÓN AGUA FLORIDA».
 *
 * - accion=datos (GET): devuelve el padrón tal cual y la caja (movimientos y ajustes).
 * - POST {accion:'entrar'|'registrar'|'anular'|'ajustes', clave, ...}: tesorería.
 *
 * La clave de la tesorera vive en la pestaña Config (renglón clave_tesorera),
 * no en este código. Instrucciones completas en INSTALAR.md.
 */

// Id de la hoja PADRÓN AGUA FLORIDA. Así el script funciona igual dentro de la hoja
// que como proyecto aparte (Google no deja publicar el script ligado desde otra cuenta).
const PADRON_ID = '18iwStedGeC4zhty_ubLTtdlrmNrzKSvkcP_2IUoKP9I';
function libro_() { return SpreadsheetApp.openById(PADRON_ID); }

const HOJA_CAJA = 'Caja';
const HOJA_CONFIG = 'Config';
const ENCABEZADOS_CAJA = ['Folio', 'Fecha', 'Tipo', 'Concepto', 'Monto', 'Pagado a / pagó', 'Nota', 'Anotó', 'Anotado el', 'Estatus', 'Cuotas del padrón al corte'];
const CONFIG_INICIAL = [
  ['clave_tesorera', 'ESCRIBE-AQUI-LA-CLAVE', 'Clave para entrar a tesoreria.html (no importan mayúsculas)'],
  ['saldo_inicial', 0, 'Dinero con el que empezó la caja antes de las cuotas del padrón'],
  ['contar_desde', 2025, 'Año desde el que se suman las cuotas del padrón a la caja']
];

// ---------- instalación ----------
function instalar() {
  const ss = libro_();
  let caja = ss.getSheetByName(HOJA_CAJA);
  if (!caja) {
    caja = ss.insertSheet(HOJA_CAJA);
    caja.getRange(1, 1, 1, ENCABEZADOS_CAJA.length).setValues([ENCABEZADOS_CAJA]).setFontWeight('bold').setBackground('#cfeaf0');
    caja.setFrozenRows(1);
    caja.getRange('B:B').setNumberFormat('yyyy-mm-dd');
    caja.getRange('E:E').setNumberFormat('$#,##0.00');
    caja.setColumnWidths(1, ENCABEZADOS_CAJA.length, 130);
    caja.setColumnWidth(4, 220);
  }
  let cfg = ss.getSheetByName(HOJA_CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(HOJA_CONFIG);
    cfg.getRange(1, 1, 1, 3).setValues([['clave', 'valor', 'para qué']]).setFontWeight('bold');
  }
  const ya = cfg.getRange(1, 1, Math.max(cfg.getLastRow(), 1), 1).getValues().map((r) => String(r[0]));
  CONFIG_INICIAL.forEach((fila) => { if (ya.indexOf(fila[0]) < 0) cfg.appendRow(fila); });
  cfg.getRange('B:B').setNumberFormat('@'); // que «2025» no se vuelva fecha ni número raro
  return 'Listo: pestañas Caja y Config. Escribe la clave de la tesorera en Config.';
}

// ---------- utilidades ----------
function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hojaPadron_() {
  const ss = libro_();
  return ss.getSheets().filter((h) => /^padr[oó]n/i.test(h.getName()))[0] || ss.getSheets()[0];
}

function config_() {
  const cfg = libro_().getSheetByName(HOJA_CONFIG);
  const o = {};
  if (!cfg) return o;
  cfg.getDataRange().getValues().slice(1).forEach((r) => { if (r[0]) o[String(r[0]).trim()] = r[1]; });
  return o;
}

function ponerConfig_(clave, valor) {
  const cfg = libro_().getSheetByName(HOJA_CONFIG);
  const vals = cfg.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === clave) { cfg.getRange(i + 1, 2).setValue(String(valor)); return; }
  }
  cfg.appendRow([clave, String(valor), '']);
}

function claveOk_(clave) {
  const real = String(config_().clave_tesorera || '').trim().toLowerCase();
  return real && real !== 'escribe-aqui-la-clave' && String(clave || '').trim().toLowerCase() === real;
}

function fechaISO_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

function movimientos_() {
  const caja = libro_().getSheetByName(HOJA_CAJA);
  if (!caja || caja.getLastRow() < 2) return [];
  return caja.getRange(2, 1, caja.getLastRow() - 1, ENCABEZADOS_CAJA.length).getValues()
    .filter((r) => r[0])
    .map((r) => ({
      folio: String(r[0]), fecha: fechaISO_(r[1]), tipo: String(r[2]), concepto: String(r[3]), monto: Number(r[4]) || 0,
      pagado_a: String(r[5]), nota: String(r[6]), registro: String(r[7]), estatus: String(r[9] || 'Registrado'),
      anotado: r[8] instanceof Date ? r[8].toISOString() : String(r[8] || ''), cuotas: Number(r[10]) || 0
    }));
}

function cambios_(n) {
  const h = libro_().getSheetByName('Cambios');
  if (!h || h.getLastRow() < 2) return [];
  const desde = Math.max(2, h.getLastRow() - n + 1);
  return h.getRange(desde, 1, h.getLastRow() - desde + 1, 5).getValues().reverse().map((r) => ({
    fecha: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), quien: String(r[1]), accion: String(r[2]), toma: String(r[3]), detalle: String(r[4])
  }));
}

function limpiaTexto_(s, max) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/^[=+\-@]/, "'$&").slice(0, max || 200).trim(); }

// ---------- web ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.accion === 'datos') return salida_(datos_(p.fresco === '1'));
    return salida_({ ok: true, hola: 'Comité de Agua de La Florida' });
  } catch (err) {
    return salida_({ ok: false, error: String(err.message || err) });
  }
}

function datos_(fresco) {
  const cache = CacheService.getScriptCache();
  if (!fresco) { const c = cache.get('datos'); if (c) return JSON.parse(c); }
  const cfg = config_();
  const padron = hojaPadron_().getDataRange().getDisplayValues();
  const res = {
    ok: true,
    hora: new Date().toISOString(),
    padron: padron,
    caja: { saldo_inicial: Number(cfg.saldo_inicial) || 0, contar_desde: Number(cfg.contar_desde) || 0, movimientos: movimientos_() },
    cambios: cambios_(40)
  };
  try { cache.put('datos', JSON.stringify(res), 120); } catch (err) { /* muy grande para la caché: no pasa nada */ }
  return res;
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (err) { return salida_({ ok: false, error: 'datos ilegibles' }); }
  if (!claveOk_(b.clave)) return salida_({ ok: false, error: 'clave' });
  if (b.accion === 'entrar') return salida_({ ok: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    CacheService.getScriptCache().remove('datos');
    if (b.accion === 'registrar') return salida_(registrar_(b));
    if (b.accion === 'anular') return salida_(anular_(b));
    if (b.accion === 'corte') return salida_(corte_(b));
    if (b.accion === 'cobrar') return salida_(cobrar_(b));
    if (b.accion === 'nueva_toma') return salida_(nuevaToma_(b));
    if (b.accion === 'estado_toma') return salida_(estadoToma_(b));
    if (b.accion === 'editar_toma') return salida_(editarToma_(b));
    if (b.accion === 'preparar_anio') return salida_(prepararAnio_(Number(b.anio)));
    if (b.accion === 'ajustes') {
      ponerConfig_('saldo_inicial', Number(b.saldo_inicial) || 0);
      if (b.contar_desde) ponerConfig_('contar_desde', Number(b.contar_desde));
      return salida_({ ok: true });
    }
    return salida_({ ok: false, error: 'acción desconocida' });
  } finally {
    lock.releaseLock();
  }
}

function registrar_(b) {
  const tipo = b.tipo === 'Ingreso' ? 'Ingreso' : 'Egreso';
  const monto = Math.round(Number(b.monto) * 100) / 100;
  if (!(monto > 0)) return { ok: false, error: 'falta el monto' };
  const concepto = limpiaTexto_(b.concepto, 120);
  if (!concepto) return { ok: false, error: 'falta decir qué fue' };
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const caja = libro_().getSheetByName(HOJA_CAJA) || (instalar(), libro_().getSheetByName(HOJA_CAJA));
  const prefijo = tipo === 'Egreso' ? 'G-' : 'I-';
  const n = movimientos_().filter((m) => m.folio.indexOf(prefijo) === 0)
    .reduce((mx, m) => Math.max(mx, parseInt(m.folio.slice(2), 10) || 0), 0) + 1;
  const folio = prefijo + ('000' + n).slice(-4);
  const p = fecha.split('-').map(Number);
  caja.appendRow([folio, new Date(p[0], p[1] - 1, p[2]), tipo, concepto, monto, limpiaTexto_(b.pagado_a, 80), limpiaTexto_(b.nota, 300), limpiaTexto_(b.registro, 60), new Date(), 'Registrado']);
  return { ok: true, folio: folio };
}

// Corte de caja: la tesorera dice cuánto dinero tiene. Se guarda junto con el total de
// cuotas que el padrón tenía en ese momento, para sumar después solo las anualidades nuevas.
function corte_(b) {
  const monto = Math.round(Number(b.monto) * 100) / 100;
  if (!(monto >= 0) || b.monto === '' || b.monto == null) return { ok: false, error: 'falta cuánto hay' };
  const caja = libro_().getSheetByName(HOJA_CAJA) || (instalar(), libro_().getSheetByName(HOJA_CAJA));
  const n = movimientos_().filter((m) => m.folio.indexOf('C-') === 0)
    .reduce((mx, m) => Math.max(mx, parseInt(m.folio.slice(2), 10) || 0), 0) + 1;
  const folio = 'C-' + ('000' + n).slice(-4);
  const ahora = new Date();
  caja.appendRow([folio, ahora, 'Corte', 'Corte de caja', monto, '', limpiaTexto_(b.nota, 300), limpiaTexto_(b.registro, 60), ahora, 'Registrado', Number(b.cuotas) || 0]);
  return { ok: true, folio: folio };
}

function anular_(b) {
  const caja = libro_().getSheetByName(HOJA_CAJA);
  const folios = caja.getRange(1, 1, caja.getLastRow(), 1).getValues().map((r) => String(r[0]));
  const i = folios.indexOf(String(b.folio));
  if (i < 1) return { ok: false, error: 'no encontré ese folio' };
  caja.getRange(i + 1, 10).setValue('Anulado');
  const nota = caja.getRange(i + 1, 7);
  nota.setValue((nota.getValue() ? nota.getValue() + ' · ' : '') + 'quitado por ' + limpiaTexto_(b.registro, 60) + ' el ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  return { ok: true };
}


// =====================================================================
// Padrón: cobrar, tomas nuevas, bajas y columnas de cada año
// El padrón guarda por año dos columnas: «recibo» y el año (monto pagado en ese año).
// =====================================================================

const COL_TOMA = 1, COL_BARRIO = 2, COL_X = 3, COL_Y = 4, COL_FUENTE = 5, COL_NOMBRE = 6, COL_APELLIDO = 7, COL_TIPO = 8;
const ESTADOS = ['Anualidad', 'Corte', 'Comunidad', 'Baja'];

function hoyTexto_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function columnasAnio_(sh) {
  const enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const out = {};
  for (let i = 1; i < enc.length; i++) {
    const m = String(enc[i]).match(/(20\d\d)/);
    if (m && /recibo/i.test(enc[i - 1])) out[m[1]] = { recibo: i, monto: i + 1 }; // 1-based
  }
  return out;
}

function filaDeToma_(sh, toma) {
  const col = sh.getRange(1, COL_TOMA, sh.getLastRow(), 1).getDisplayValues();
  for (let i = 1; i < col.length; i++) if (String(col[i][0]).trim() === String(toma).trim()) return i + 1;
  return 0;
}

function hojaOCrear_(nombre, encabezados) {
  const ss = libro_();
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold').setBackground('#cfeaf0');
    h.setFrozenRows(1);
  }
  return h;
}

function bitacora_(quien, accion, toma, detalle) {
  hojaOCrear_('Cambios', ['Fecha', 'Anotó', 'Acción', 'Toma', 'Detalle'])
    .appendRow([new Date(), limpiaTexto_(quien, 60), accion, String(toma || ''), limpiaTexto_(detalle, 400)]);
}

function prepararAnio_(anio) {
  if (!(anio >= 2020 && anio <= 2100)) return { ok: false, error: 'año inválido' };
  const sh = hojaPadron_();
  const cols = columnasAnio_(sh);
  if (cols[anio]) return { ok: true, ya: true };
  const anios = Object.keys(cols).map(Number).sort();
  const ultimo = anios.length ? cols[anios[anios.length - 1]].monto : COL_TIPO + 1;
  sh.insertColumnsAfter(ultimo, 2);
  sh.getRange(1, ultimo + 1, 1, 2).setValues([['recibo', String(anio)]]).setFontWeight('bold');
  bitacora_('sistema', 'Columnas del año', '', 'Se agregaron «recibo» y «' + anio + '» después de la columna ' + ultimo);
  return { ok: true, anio: anio };
}

function prepararAnio2027() { return prepararAnio_(2027); }

function cobrar_(b) {
  const sh = hojaPadron_();
  const fila = filaDeToma_(sh, b.toma);
  if (!fila) return { ok: false, error: 'no encontré la toma ' + b.toma };
  const anio = Number(b.anio);
  let cols = columnasAnio_(sh)[anio];
  if (!cols) { prepararAnio_(anio); cols = columnasAnio_(sh)[anio]; }
  if (!cols) return { ok: false, error: 'no hay columnas para ' + anio };
  const monto = Math.round(Number(b.monto) * 100) / 100;
  if (!(monto > 0)) return { ok: false, error: 'falta el monto' };
  const recibo = String(b.recibo || '').trim();
  if (!/^\d+$/.test(recibo)) return { ok: false, error: 'el número de recibo debe ser solo números' };
  const tipo = String(sh.getRange(fila, COL_TIPO).getDisplayValue()).trim();
  if (/^baja$/i.test(tipo)) return { ok: false, error: 'esa toma está dada de baja' };

  const celdaMonto = sh.getRange(fila, cols.monto), celdaRecibo = sh.getRange(fila, cols.recibo);
  const antes = String(celdaMonto.getDisplayValue()).replace(/[$,]/g, '').trim();
  const previo = /^\d+(\.\d+)?$/.test(antes) && /^\d+$/.test(String(celdaRecibo.getDisplayValue()).trim()) ? Number(antes) : 0;
  const notaVieja = [celdaRecibo.getDisplayValue(), celdaMonto.getDisplayValue()].filter((v) => v && !/^[\d.$,\s]+$/.test(v)).join(' · ');
  const total = previo + monto;
  celdaRecibo.setValue(recibo);
  celdaMonto.setValue(total);
  const conceptos = (b.conceptos || []).map(String);
  if (/^corte$/i.test(tipo) || conceptos.indexOf('Reconexión') >= 0) sh.getRange(fila, COL_TIPO).setValue('Anualidad');

  const nombre = (sh.getRange(fila, COL_NOMBRE).getDisplayValue() + ' ' + sh.getRange(fila, COL_APELLIDO).getDisplayValue()).trim();
  const pagos = hojaOCrear_('Pagos', ['# Toma', 'Año', 'Fecha', 'Tipo', '#Recibo', 'Monto', 'Anotó', 'Nota']);
  if (!pagos.getRange(1, 7).getDisplayValue()) pagos.getRange(1, 7, 1, 2).setValues([['Anotó', 'Nota']]);
  pagos.appendRow([String(b.toma), anio, hoyTexto_(), conceptos.join(' + ') || 'Anualidad', recibo, monto, limpiaTexto_(b.registro, 60), limpiaTexto_(b.nota, 200)]);
  bitacora_(b.registro, 'Cobro', b.toma, anio + ': ' + (conceptos.join(' + ') || 'Anualidad') + ' $' + monto + ' recibo ' + recibo +
    (previo ? ' (ya tenía $' + previo + ')' : '') + (notaVieja ? ' · nota que había: ' + notaVieja : ''));
  return { ok: true, toma: String(b.toma), nombre: nombre, anio: anio, monto: monto, total: total, recibo: recibo, fecha: hoyTexto_() };
}

function nuevaToma_(b) {
  const sh = hojaPadron_();
  const nombre = limpiaTexto_(b.nombre, 60), apellido = limpiaTexto_(b.apellido, 60);
  if (!nombre) return { ok: false, error: 'falta el nombre' };
  const recibo = String(b.recibo || '').trim();
  if (!/^\d+$/.test(recibo)) return { ok: false, error: 'el número de recibo debe ser solo números' };
  const monto = Math.round(Number(b.monto) * 100) / 100;
  if (!(monto > 0)) return { ok: false, error: 'falta el monto' };
  const anio = Number(b.anio);
  let cols = columnasAnio_(sh)[anio];
  if (!cols) { prepararAnio_(anio); cols = columnasAnio_(sh)[anio]; }
  const numeros = sh.getRange(2, COL_TOMA, Math.max(sh.getLastRow() - 1, 1), 1).getDisplayValues().map((r) => parseInt(r[0], 10)).filter((n) => n > 0);
  const toma = (numeros.length ? Math.max.apply(null, numeros) : 0) + 1;
  const fila = new Array(sh.getLastColumn()).fill('');
  fila[COL_TOMA - 1] = toma;
  fila[COL_BARRIO - 1] = limpiaTexto_(b.barrio, 40);
  if (isFinite(Number(b.lng)) && b.lng !== '' && b.lng != null) fila[COL_X - 1] = Number(b.lng);
  if (isFinite(Number(b.lat)) && b.lat !== '' && b.lat != null) fila[COL_Y - 1] = Number(b.lat);
  fila[COL_FUENTE - 1] = limpiaTexto_(b.fuente || 'Potable', 20);
  fila[COL_NOMBRE - 1] = nombre;
  fila[COL_APELLIDO - 1] = apellido;
  fila[COL_TIPO - 1] = 'Anualidad';
  fila[cols.recibo - 1] = recibo;
  fila[cols.monto - 1] = monto;
  // Se inserta justo después de la última toma numerada, antes de los renglones sueltos del final
  let ultimaFila = 1;
  const colA = sh.getRange(1, COL_TOMA, sh.getLastRow(), 1).getDisplayValues();
  for (let i = 1; i < colA.length; i++) if (parseInt(colA[i][0], 10) > 0) ultimaFila = i + 1;
  sh.insertRowAfter(ultimaFila);
  sh.getRange(ultimaFila + 1, 1, 1, fila.length).setValues([fila]);
  const pagos = hojaOCrear_('Pagos', ['# Toma', 'Año', 'Fecha', 'Tipo', '#Recibo', 'Monto', 'Anotó', 'Nota']);
  pagos.appendRow([String(toma), anio, hoyTexto_(), 'Toma nueva + Anualidad', recibo, monto, limpiaTexto_(b.registro, 60), limpiaTexto_(b.nota, 200)]);
  bitacora_(b.registro, 'Toma nueva', toma, nombre + ' ' + apellido + ' · ' + fila[COL_BARRIO - 1] + ' · $' + monto + ' recibo ' + recibo);
  return { ok: true, toma: String(toma), nombre: (nombre + ' ' + apellido).trim(), anio: anio, monto: monto, total: monto, recibo: recibo, fecha: hoyTexto_() };
}

function estadoToma_(b) {
  const nuevo = ESTADOS.filter((e) => e.toLowerCase() === String(b.nuevo || '').toLowerCase())[0];
  if (!nuevo) return { ok: false, error: 'estado desconocido' };
  const motivo = limpiaTexto_(b.motivo, 300);
  if (!motivo) return { ok: false, error: 'falta el motivo' };
  const sh = hojaPadron_();
  const fila = filaDeToma_(sh, b.toma);
  if (!fila) return { ok: false, error: 'no encontré la toma ' + b.toma };
  const celda = sh.getRange(fila, COL_TIPO);
  const antes = celda.getDisplayValue();
  celda.setValue(nuevo);
  bitacora_(b.registro, 'Estado', b.toma, (antes || '—') + ' → ' + nuevo + ' · ' + motivo);
  return { ok: true, toma: String(b.toma), antes: antes, ahora: nuevo };
}

// Corregir nombre, barrio, fuente o ubicación de una toma (solo los campos que vengan)
function editarToma_(b) {
  const sh = hojaPadron_();
  const fila = filaDeToma_(sh, b.toma);
  if (!fila) return { ok: false, error: 'no encontré la toma ' + b.toma };
  const campos = { nombre: COL_NOMBRE, apellido: COL_APELLIDO, barrio: COL_BARRIO, fuente: COL_FUENTE, lng: COL_X, lat: COL_Y };
  const cambios = [];
  Object.keys(campos).forEach((k) => {
    if (b[k] === undefined || b[k] === null) return;
    const celda = sh.getRange(fila, campos[k]);
    const antes = celda.getDisplayValue();
    let v = (k === 'lat' || k === 'lng') ? (b[k] === '' ? '' : Number(b[k])) : limpiaTexto_(b[k], 60);
    if ((k === 'lat' || k === 'lng') && v !== '' && !isFinite(v)) return;
    if (String(antes) === String(v)) return;
    celda.setValue(v);
    cambios.push(k + ': ' + (antes || '—') + ' → ' + (v === '' ? '—' : v));
  });
  if (cambios.length) bitacora_(b.registro, 'Corrección', b.toma, cambios.join(' · '));
  return { ok: true, toma: String(b.toma), cambios: cambios.length };
}
