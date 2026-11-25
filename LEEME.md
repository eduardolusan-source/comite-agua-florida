# Comité de Agua de La Florida

Sitio estático para que el comité vea cómo va la captación de la anualidad, por barrio,
quién debe, qué casos hay que aclarar, consulte el reglamento, y para que la tesorera
anote los gastos y la caja se calcule sola.

| Página | Qué tiene |
|---|---|
| `index.html` | Porcentaje de captación, cobrado, por cobrar, caja, barrios y mapa de tomas |
| `adeudos.html` | Deudores por persona y barrio (imprimible para las tiendas, art. 9) |
| `pendientes.html` | Tomas que «no existen», cortes pedidos, pagos incompletos, pagos sin toma, etc. |
| `reglamento.html` | Los 21 artículos con buscador y preguntas frecuentes |
| `tesoreria.html` | Con clave: anotar gastos e ingresos aparte, ver la caja, ajustes |

## De dónde salen los datos
- `js/agua.js` interpreta el padrón (pestaña `Padrón_agua_2024`): detecta solas las parejas de
  columnas «recibo / año» (hoy 2025 y 2026). Una toma cuenta como pagada si tiene número de recibo
  y monto. Para agregar 2027 basta con poner en la hoja dos columnas nuevas: `recibo` y `2027`.
- En vivo: el Apps Script de `apps-script/` (ver `INSTALAR.md`), URL en `js/config.js`.
- Si el script no responde se usa `js/padron-copia.js` (copia del 25 nov 2026).

## Caja
saldo inicial + cuotas del padrón (desde el año elegido) + otros ingresos − gastos.
Los ajustes se cambian desde la tesorería.

## Publicación
- GitHub Pages: rama `main`, carpeta raíz.
- Cloudflare Workers: `wrangler.jsonc` (sitio estático). Conectar el repo en
  Cloudflare → Workers & Pages → Create → Import a repository.
