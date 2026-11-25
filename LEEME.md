# Comité de Agua de La Florida

Sitio estático para que el comité vea cómo va la captación de la anualidad, por barrio,
quién debe, qué casos hay que aclarar, consulte el reglamento, y para que la tesorera
anote los gastos y la caja se calcule sola.

| Página | Qué tiene |
|---|---|
| `index.html` | Porcentaje de captación, cobrado, por cobrar, caja, barrios y mapa de tomas |
| `mapa.html` | Mapa con satélite (Leaflet + Esri/OSM), filtros por color, buscador, ficha por toma con «cómo llegar» y lista imprimible |
| `adeudos.html` | Deudores por persona y barrio (imprimible para las tiendas, art. 9) |
| `pendientes.html` | Tomas que «no existen», cortes pedidos, pagos incompletos, pagos sin toma, etc. |
| `reglamento.html` | Los 21 artículos con buscador y preguntas frecuentes |
| `tesoreria.html` | Con clave: caja (conteo y gastos) y padrón: cobrar (escribe recibo y monto en el padrón), toma nueva, corregir datos, dar de baja, bitácora |

## De dónde salen los datos
- `js/agua.js` interpreta el padrón (pestaña `Padrón_agua_2024`): detecta solas las parejas de
  columnas «recibo / año» (hoy 2025 y 2026). Una toma cuenta como pagada si tiene número de recibo
  y monto. Para agregar 2027 basta con poner en la hoja dos columnas nuevas: `recibo` y `2027`.
- En vivo: el Apps Script de `apps-script/` (ver `INSTALAR.md`), URL en `js/config.js`.
- Si el script no responde se usa `js/padron-copia.js` (copia del 25 nov 2026).

## Caja
Cuando la tesorera cuenta la caja (botón «Decir cuánto tengo»), el sitio parte de esa cantidad:
lo contado + anualidades que entren al padrón después + ingresos aparte anotados después − gastos anotados después.
Mientras no haya conteo: todas las cuotas del padrón + otros ingresos − gastos.

## Publicación
- GitHub Pages: rama `main`, carpeta raíz.
- Cloudflare Workers: https://agua-florida.eduardo-lusan.workers.dev/ (se despliega solo con cada push). Se conectó en
  Cloudflare → Workers & Pages → Create → Import a repository.

## Años nuevos
Cada año son dos columnas en el padrón: `recibo` y el año. El script las crea solo (acción `preparar_anio`, o
`prepararAnio2027()` en el editor) y también al cobrar un año que no existe. El sitio muestra el año del calendario;
los adeudos se cuentan desde `ADEUDO_DESDE` (2026) en `js/config.js`.

## Cambios al padrón desde el sitio
Todo queda en la pestaña **Cambios** (fecha, quién, qué) y los cobros también en **Pagos**. Las tomas nunca se borran:
se ponen como `Baja` en la columna Cuota y se pueden reactivar.
