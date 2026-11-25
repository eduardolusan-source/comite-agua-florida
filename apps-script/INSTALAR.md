# Conectar la tesorería (una sola vez, unos 10 minutos)

El sitio funciona desde ya con una copia del padrón. Para que la tesorera pueda
anotar gastos y para que el tablero lea el padrón **en vivo**, hay que publicar
este Apps Script dentro de la hoja **PADRÓN AGUA FLORIDA** (la del Drive del comité).

Hazlo con la cuenta dueña de la hoja (eduardo.lusan@uaq.edu.mx).

1. Abre la hoja PADRÓN AGUA FLORIDA → menú **Extensiones → Apps Script**.
2. Borra lo que haya en `Código.gs` y pega todo el contenido de `apps-script/Code.gs`. Guarda (Ctrl+S).
3. Arriba, en la lista de funciones, elige **instalar** y pulsa **Ejecutar**. Acepta los permisos
   (Google avisa que la app «no está verificada»: Configuración avanzada → Ir a … → Permitir).
   Aparecen dos pestañas nuevas en la hoja: **Caja** y **Config**.
4. En la pestaña **Config**, en el renglón `clave_tesorera`, escribe la clave en la columna B
   (la que acordamos para Chely). No importan mayúsculas ni minúsculas.
5. **Implementar → Nueva implementación** → tipo **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   Pulsa Implementar y copia la URL que termina en `/exec`.
6. Pega esa URL en `js/config.js`, en `SCRIPT_URL: ''`, haz commit y push. En unos minutos
   GitHub Pages y Cloudflare ya la usan.

## Si después cambias Code.gs
Pega el código nuevo, guarda y ve a **Implementar → Administrar implementaciones → lápiz →
Versión: Nueva versión → Implementar**. La URL `/exec` no cambia.

## Qué guarda
- **Caja**: un renglón por movimiento (folio G-0001 para gastos, I-0001 para ingresos aparte).
  «Quitar» en la página no borra: marca el renglón como *Anulado*.
- **Config**: clave de la tesorera, saldo inicial y desde qué año se suman las cuotas del padrón.
- El script **no modifica** la pestaña del padrón: solo la lee.
