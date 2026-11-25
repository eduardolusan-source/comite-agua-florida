// Comité de Agua de La Florida · lógica compartida
// Lee el padrón (en vivo desde el Apps Script o de la copia), lo interpreta
// toma por toma y arma los totales que usan todas las páginas.
(function () {
  'use strict';
  const C = window.AGUA_CONFIG;

  // ---------- utilidades ----------
  const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const limpia = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const titulo = (s) => limpia(s).toLowerCase().replace(/(^|[\s.(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const esNumero = (s) => /^\d+(\.\d+)?$/.test(limpia(s).replace(/[$,]/g, ''));
  const numero = (s) => parseFloat(limpia(s).replace(/[$,]/g, '')) || 0;
  const pesos = (n) => '$' + Math.round(n).toLocaleString('es-MX');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaLarga = (d) => d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();

  // Columnas del padrón (pestaña Padrón_agua_2024)
  const COL = { toma: 0, barrio: 1, x: 2, y: 3, fuente: 4, nombre: 5, apellido: 6, tipo: 7 };
  const NOTAS_DESDE = 8, NOTAS_HASTA = 22; // de la X en adelante hay listas de validación

  function columnasDeAnio(encabezado) {
    const anios = [];
    for (let i = 1; i < encabezado.length; i++) {
      const m = String(encabezado[i]).match(/(20\d\d)/);
      if (m && /recibo/i.test(encabezado[i - 1])) anios.push({ anio: +m[1], recibo: i - 1, monto: i });
    }
    return anios;
  }

  function nombreBarrio(s) {
    const t = titulo(s);
    if (!t) return 'Sin barrio';
    return t.replace(/\bA La\b/, 'a la').replace(/\bLos Migueles\b/i, 'Los Mígueles');
  }

  const vencido = (anio, hoy) => hoy > new Date(anio, C.VENCE_MES - 1, C.VENCE_DIA, 23, 59);

  // Año que se muestra: el pedido, o el del calendario si ya tiene columnas, o el último con columnas antes de hoy.
  function anioAMostrar(anios, hoy, pedido) {
    const lista = anios.map((a) => a.anio);
    if (pedido && lista.includes(+pedido)) return +pedido;
    const y = hoy.getFullYear();
    if (lista.includes(y)) return y;
    const antes = lista.filter((a) => a <= y);
    return antes.length ? antes[antes.length - 1] : (lista[0] || y);
  }

  // ---------- interpretación ----------
  // estados por toma: pagada, parcial, debe, aclarar, cortada, exenta, baja
  function interpretar(filas, hoy, pedido) {
    hoy = hoy || new Date();
    const enc = filas[0] || [];
    const anios = columnasDeAnio(enc);
    const actual = anioAMostrar(anios, hoy, pedido);
    const idx = anios.findIndex((a) => a.anio === actual);
    const previo = idx > 0 ? anios[idx - 1].anio : null;
    const vencio = vencido(actual, hoy);
    const colsAnio = new Set(anios.flatMap((a) => [a.recibo, a.monto]));
    const desde = C.ADEUDO_DESDE || actual;

    const tomas = [];
    const sueltos = []; // renglones con nombre pero sin número de toma
    const ingresos = {}; // por año
    anios.forEach((a) => (ingresos[a.anio] = 0));

    for (let i = 1; i < filas.length; i++) {
      const r = filas[i] || [];
      const g = (k) => limpia(r[k]);
      const nombre = titulo(g(COL.nombre) + ' ' + g(COL.apellido));
      if (!nombre) continue;
      const t = {
        fila: i + 1,
        toma: g(COL.toma),
        barrio: nombreBarrio(g(COL.barrio)),
        x: parseFloat(g(COL.x)),
        y: parseFloat(g(COL.y)),
        fuente: titulo(g(COL.fuente)) || '—',
        nombre: nombre,
        tipo: g(COL.tipo),
        pagos: {},
        notas: []
      };
      for (let k = NOTAS_DESDE; k <= NOTAS_HASTA && k < r.length; k++) {
        if (colsAnio.has(k)) continue;
        const v = g(k);
        if (v && !esNumero(v) && !/^pendiente$/i.test(v)) t.notas.push(v);
      }
      // las notas escritas en las columnas de un año (p. ej. «no existe esta toma») también cuentan
      anios.forEach((a) => [a.recibo, a.monto].forEach((k) => { const v = g(k); if (v && !esNumero(v)) t.notas.push(v); }));
      if (/^pendiente$/i.test(g(8))) t.marcaPendiente = true;
      if (t.tipo && !/^(anualidad|corte|comunidad|baja|instalaci[oó]n|potable)$/i.test(t.tipo)) t.notas.push(t.tipo);

      anios.forEach((a) => {
        const rec = g(a.recibo), mon = g(a.monto);
        const pagado = esNumero(rec) && esNumero(mon) && numero(mon) > 0;
        t.pagos[a.anio] = { recibo: rec, monto: pagado ? numero(mon) : 0, pagado };
        if (pagado) ingresos[a.anio] += numero(mon);
      });

      const notas = sinAcentos(t.notas.join(' | '));
      t.noExiste = /no existe/.test(notas);
      t.pideCorte = /corte/.test(notas);
      t.revisar = /revisar/.test(notas);
      t.comunidad = /comunidad/i.test(t.tipo);
      t.cortada = /^corte$/i.test(t.tipo);
      t.baja = /^baja$/i.test(t.tipo);

      if (!t.toma) { sueltos.push(t); continue; }

      const p = t.pagos[actual] || { pagado: false, monto: 0 };
      if (t.baja) t.estado = 'baja';
      else if (p.pagado) t.estado = p.monto < C.CUOTA ? 'parcial' : 'pagada';
      else if (t.comunidad) t.estado = 'exenta';
      else if (t.cortada) t.estado = 'cortada';
      else if (t.noExiste || t.pideCorte || t.revisar) t.estado = 'aclarar';
      else t.estado = 'debe';

      // Adeudo: cada año sin pagar desde ADEUDO_DESDE hasta el que se ve (no antes del primer pago de la toma).
      t.adeudos = [];
      if (!t.baja && !t.comunidad && !t.cortada && t.estado !== 'aclarar') {
        const primerPago = anios.find((a) => t.pagos[a.anio].pagado);
        const inicio = Math.max(desde, primerPago && primerPago.anio > desde ? primerPago.anio : desde);
        anios.filter((a) => a.anio >= inicio && a.anio <= actual && a.anio <= hoy.getFullYear() && !t.pagos[a.anio].pagado).forEach((a) => {
          t.adeudos.push({ anio: a.anio, cuota: C.CUOTA, recargo: vencido(a.anio, hoy) ? C.RECARGO : 0 });
        });
      }
      t.adeudo = t.adeudos.reduce((s, a) => s + a.cuota + a.recargo, 0);
      t.lat = t.y; t.lng = t.x;
      if (previo && !['exenta', 'cortada', 'baja'].includes(t.estado) && !t.pagos[previo].pagado && previo < desde) t.sinReciboPrevio = true;
      tomas.push(t);
    }

    // Totales
    const cuenta = (e) => tomas.filter((t) => t.estado === e).length;
    const tot = {
      pagada: cuenta('pagada'), parcial: cuenta('parcial'), debe: cuenta('debe'),
      aclarar: cuenta('aclarar'), cortada: cuenta('cortada'), exenta: cuenta('exenta'), baja: cuenta('baja')
    };
    tot.cobrables = tot.pagada + tot.parcial + tot.debe;
    tot.alCorriente = tot.pagada + tot.parcial;
    tot.pct = tot.cobrables ? Math.round((tot.alCorriente / tot.cobrables) * 100) : 0;
    tot.cobrado = tomas.concat(sueltos).reduce((s, t) => s + ((t.pagos[actual] || {}).monto || 0), 0);
    tot.porCobrar = tomas.reduce((s, t) => s + (t.adeudo || 0), 0);
    tot.conAdeudo = tomas.filter((t) => t.adeudo > 0).length;

    // Barrios (sin las bajas)
    const mapa = {};
    tomas.filter((t) => t.estado !== 'baja').forEach((t) => {
      const b = (mapa[t.barrio] = mapa[t.barrio] || { nombre: t.barrio, pagada: 0, parcial: 0, debe: 0, aclarar: 0, cortada: 0, exenta: 0, total: 0, xs: [], ys: [] });
      b[t.estado]++; b.total++;
      if (isFinite(t.x) && isFinite(t.y)) { b.xs.push(t.x); b.ys.push(t.y); }
    });
    const barrios = Object.values(mapa).map((b) => {
      b.cobrables = b.pagada + b.parcial + b.debe;
      b.pct = b.cobrables ? Math.round(((b.pagada + b.parcial) / b.cobrables) * 100) : 0;
      return b;
    }).sort((a, b) => b.total - a.total);

    // Deudores agrupados por persona
    const porPersona = {};
    tomas.filter((t) => t.adeudo > 0).forEach((t) => {
      const k = sinAcentos(t.nombre);
      const p = (porPersona[k] = porPersona[k] || { nombre: t.nombre, tomas: [], barrios: new Set(), adeudo: 0 });
      p.tomas.push(t); p.barrios.add(t.barrio); p.adeudo += t.adeudo;
    });
    const deudores = Object.values(porPersona).map((p) => ((p.barrios = [...p.barrios]), p))
      .sort((a, b) => b.adeudo - a.adeudo || a.nombre.localeCompare(b.nombre, 'es'));

    const listaBarrios = [...new Set(tomas.map((t) => t.barrio).filter((b) => b !== 'Sin barrio'))].sort((a, b) => a.localeCompare(b, 'es'));
    return { anios, actual, previo, vencio, tomas, sueltos, ingresos, tot, barrios, deudores, listaBarrios, desde };
  }

  // Lo que debe una toma en un año dado (para la tesorería)
  function cuantoDebe(t, anio, hoy) {
    hoy = hoy || new Date();
    const p = t.pagos[anio] || { monto: 0 };
    const yaPago = p.monto || 0;
    const cuota = Math.max(0, C.CUOTA - yaPago);
    return { cuota, recargo: cuota > 0 && vencido(anio, hoy) ? C.RECARGO : 0 };
  }

  // ---------- carga ----------
  async function pedir(params, ms) {
    const url = C.SCRIPT_URL + '?' + new URLSearchParams(params).toString();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 25000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function enviar(cuerpo) {
    // text/plain evita la consulta previa de CORS que Apps Script no contesta
    const r = await fetch(C.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    return r.json();
  }

  async function cargar(opc) {
    opc = opc || {};
    if (C.SCRIPT_URL) {
      try {
        const d = await pedir({ accion: 'datos', fresco: opc.fresco ? '1' : '' });
        if (d && d.ok && d.padron && d.padron.length > 1) {
          return { fuente: 'vivo', fecha: d.hora ? new Date(d.hora) : new Date(), padron: interpretar(d.padron, null, opc.anio), filas: d.padron, caja: d.caja || null, cambios: d.cambios || [] };
        }
      } catch (e) { console.warn('El padrón en vivo no respondió; uso la copia.', e); }
    }
    const copia = window.PADRON_COPIA;
    return { fuente: 'copia', fecha: new Date(copia.fecha + 'T12:00:00'), padron: interpretar(copia.filas, null, opc.anio), filas: copia.filas, caja: null };
  }

  // Cuentas de la caja.
  // Si la tesorera ya contó el dinero (un «Corte»), se parte de ahí:
  //   lo que contó + anualidades que entraron al padrón después + ingresos anotados después − gastos anotados después.
  // Si nunca ha contado: todas las cuotas del padrón + otros ingresos − gastos.
  function cuentasDeCaja(padron, caja) {
    caja = caja || {};
    const todos = caja.movimientos || [];
    const activos = todos.filter((m) => m.estatus !== 'Anulado');
    const cuotasAhora = padron.anios.reduce((s, a) => s + padron.ingresos[a.anio], 0);
    const cortes = activos.filter((m) => m.tipo === 'Corte').sort((a, b) => String(a.anotado).localeCompare(String(b.anotado)));
    const corte = cortes.length ? cortes[cortes.length - 1] : null;
    const cuenta = corte ? activos.filter((m) => m.tipo !== 'Corte' && String(m.anotado) > String(corte.anotado)) : activos;
    const otros = cuenta.filter((m) => m.tipo === 'Ingreso').reduce((s, m) => s + (+m.monto || 0), 0);
    const egresos = cuenta.filter((m) => m.tipo === 'Egreso').reduce((s, m) => s + (+m.monto || 0), 0);
    const porAnio = padron.anios.map((a) => ({ anio: a.anio, monto: padron.ingresos[a.anio] }));
    const cuotasNuevas = corte ? cuotasAhora - (+corte.cuotas || 0) : 0;
    const saldo = corte ? (+corte.monto || 0) + cuotasNuevas + otros - egresos : cuotasAhora + otros - egresos;
    const antesDelCorte = (m) => !!corte && m !== corte && String(m.anotado) <= String(corte.anotado);
    return { corte, cuotasAhora, cuotasNuevas, porAnio, otros, egresos, saldo, movimientos: todos, antesDelCorte };
  }

  // ---------- piezas de página ----------
  const GOTA = '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd3e0"/><stop offset="1" stop-color="#2a9bb0"/></linearGradient></defs><path d="M20 3C14 12 7 19 7 26a13 13 0 0 0 26 0c0-7-7-14-13-23z" fill="url(#gm)"/><path d="M11 27c3-2 6-2 9 0s6 2 9 0" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M14 20c1-3 3-6 5-8" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

  const PAGINAS = [
    ['index.html', 'Cómo vamos'],
    ['mapa.html', 'Mapa'],
    ['adeudos.html', 'Adeudos'],
    ['pendientes.html', 'Pendientes'],
    ['reglamento.html', 'Reglamento'],
    ['tesoreria.html', 'Tesorería']
  ];

  function pintarMarco(actual) {
    const barra = document.createElement('header');
    barra.className = 'barra';
    barra.innerHTML = '<div class="dentro"><a class="marca" href="index.html">' + GOTA +
      '<div><b>Comité de Agua</b><span>La Florida · Arroyo Seco</span></div></a>' +
      '<button class="hamb" aria-label="Abrir menú" aria-expanded="false">☰</button><nav class="menu">' +
      PAGINAS.map(([h, n]) => '<a href="' + h + '"' + (h === actual ? ' aria-current="page"' : '') + '>' + n + '</a>').join('') + '</nav></div>';
    document.body.prepend(barra);
    const b = barra.querySelector('.hamb'), m = barra.querySelector('.menu');
    b.addEventListener('click', () => { const a = m.classList.toggle('abierto'); b.setAttribute('aria-expanded', a); });

    const pie = document.createElement('footer');
    pie.innerHTML = '<div class="dentro"><div><b>Comité de Agua de La Florida</b><br>Arroyo Seco, Querétaro<br>' +
      '<span class="chico" style="color:#a9c9d3">Reglamento aprobado en asamblea el 20 de septiembre de 2025</span></div>' +
      '<div class="comite"><div><span>Presidente</span>Eduardo Luna Sánchez</div><div><span>Tesorera</span>Araceli Ledezma González</div>' +
      '<div><span>Técnico</span>Claudio Lugo Hernández</div></div></div>';
    document.body.append(pie);
  }

  const OLAS = '<svg class="olas" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0 40c120-22 240-22 360 0s240 22 360 0 240-22 360 0 240 22 360 0v40H0z" fill="#f7f4ec" opacity=".35"/>' +
    '<path d="M0 52c160-26 320-26 480 0s320 26 480 0 320-26 480 0v28H0z" fill="#f7f4ec"/></svg>';

  function avisoFuente(datos) {
    if (datos.fuente === 'vivo') return '<p class="aviso-fuente vivo"><i></i>Datos en vivo del padrón · ' + fechaLarga(datos.fecha) + '</p>';
    return '<p class="aviso-fuente"><i></i>Copia del padrón del ' + fechaLarga(datos.fecha) + (C.SCRIPT_URL ? ' (la hoja en vivo no respondió)' : '') + '</p>';
  }

  window.AGUA = { interpretar, cuantoDebe, vencido, cargar, cuentasDeCaja, pedir, enviar, pintarMarco, OLAS, GOTA, avisoFuente, pesos, esc, sinAcentos, fechaLarga, MESES, titulo };
})();
