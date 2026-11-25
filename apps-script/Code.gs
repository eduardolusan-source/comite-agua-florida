/**
 * Comité de Agua de La Florida · Apps Script ligado a la hoja «PADRÓN AGUA FLORIDA».
 *
 * - accion=datos (GET): devuelve el padrón tal cual y la caja (movimientos y ajustes).
 * - POST {accion:'entrar'|'registrar'|'anular'|'ajustes', clave, ...}: tesorería.
 *
 * La clave de la tesorera vive en la pestaña Config (renglón clave_tesorera),
 * no en este código. Instrucciones completas en INSTALAR.md.
 */

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
  const ss = SpreadsheetApp.getActive();
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
  const ss = SpreadsheetApp.getActive();
  return ss.getSheets().filter((h) => /^padr[oó]n/i.test(h.getName()))[0] || ss.getSheets()[0];
}

function config_() {
  const cfg = SpreadsheetApp.getActive().getSheetByName(HOJA_CONFIG);
  const o = {};
  if (!cfg) return o;
  cfg.getDataRange().getValues().slice(1).forEach((r) => { if (r[0]) o[String(r[0]).trim()] = r[1]; });
  return o;
}

function ponerConfig_(clave, valor) {
  const cfg = SpreadsheetApp.getActive().getSheetByName(HOJA_CONFIG);
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
  const caja = SpreadsheetApp.getActive().getSheetByName(HOJA_CAJA);
  if (!caja || caja.getLastRow() < 2) return [];
  return caja.getRange(2, 1, caja.getLastRow() - 1, ENCABEZADOS_CAJA.length).getValues()
    .filter((r) => r[0])
    .map((r) => ({
      folio: String(r[0]), fecha: fechaISO_(r[1]), tipo: String(r[2]), concepto: String(r[3]), monto: Number(r[4]) || 0,
      pagado_a: String(r[5]), nota: String(r[6]), registro: String(r[7]), estatus: String(r[9] || 'Registrado'),
      anotado: r[8] instanceof Date ? r[8].toISOString() : String(r[8] || ''), cuotas: Number(r[10]) || 0
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
    caja: { saldo_inicial: Number(cfg.saldo_inicial) || 0, contar_desde: Number(cfg.contar_desde) || 0, movimientos: movimientos_() }
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

  const caja = SpreadsheetApp.getActive().getSheetByName(HOJA_CAJA) || (instalar(), SpreadsheetApp.getActive().getSheetByName(HOJA_CAJA));
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
  const caja = SpreadsheetApp.getActive().getSheetByName(HOJA_CAJA) || (instalar(), SpreadsheetApp.getActive().getSheetByName(HOJA_CAJA));
  const n = movimientos_().filter((m) => m.folio.indexOf('C-') === 0)
    .reduce((mx, m) => Math.max(mx, parseInt(m.folio.slice(2), 10) || 0), 0) + 1;
  const folio = 'C-' + ('000' + n).slice(-4);
  const ahora = new Date();
  caja.appendRow([folio, ahora, 'Corte', 'Corte de caja', monto, '', limpiaTexto_(b.nota, 300), limpiaTexto_(b.registro, 60), ahora, 'Registrado', Number(b.cuotas) || 0]);
  return { ok: true, folio: folio };
}

function anular_(b) {
  const caja = SpreadsheetApp.getActive().getSheetByName(HOJA_CAJA);
  const folios = caja.getRange(1, 1, caja.getLastRow(), 1).getValues().map((r) => String(r[0]));
  const i = folios.indexOf(String(b.folio));
  if (i < 1) return { ok: false, error: 'no encontré ese folio' };
  caja.getRange(i + 1, 10).setValue('Anulado');
  const nota = caja.getRange(i + 1, 7);
  nota.setValue((nota.getValue() ? nota.getValue() + ' · ' : '') + 'quitado por ' + limpiaTexto_(b.registro, 60) + ' el ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  return { ok: true };
}
