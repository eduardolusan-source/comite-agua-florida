// Guarda las páginas en el teléfono para que la tesorería abra aunque no haya internet.
// Siempre intenta primero la red (para tener lo más nuevo) y si no hay, usa lo guardado.
const CACHE = 'agua-florida-v2';
const BASE = ['./', 'index.html', 'tesoreria.html', 'mapa.html', 'adeudos.html', 'pendientes.html', 'reglamento.html', 'informe.html',
  'css/estilo.css', 'js/config.js', 'js/agua.js', 'js/padron-copia.js', 'assets/gota.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(BASE.map((u) => fetch(u).then((r) => guardar(c, u, r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cloudflare responde las páginas .html con una redirección; se guarda una copia limpia
async function guardar(c, clave, r) {
  if (!r || !r.ok) return;
  const limpia = r.redirected ? new Response(await r.clone().blob(), { status: 200, headers: r.headers }) : r.clone();
  await c.put(clave, limpia);
}
function claves(url) {
  const u = new URL(url), p = u.pathname.split('/').pop() || 'index.html';
  const base = p.endsWith('.html') || p.includes('.') ? p : p + '.html';
  return [u.pathname.endsWith('/') ? 'index.html' : base, p];
}

// Para que abra rápido aunque la señal sea mala:
// · css y js llevan versión (?v=…): si ya están guardados se usan directo; si cambia la versión se bajan.
// · las páginas se muestran de inmediato desde lo guardado y por detrás se trae la nueva para la próxima vez.
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const deRespaldo = async () => {
      for (const k of claves(req.url)) { const hit = await c.match(k, { ignoreSearch: true }); if (hit) return hit; }
      return new Response('Sin internet y esta página no está guardada en el teléfono.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    };
    const traer = async (ms, clave) => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
      try { const r = await fetch(req, { signal: ctl.signal }); if (r.ok) await guardar(c, clave, r.clone()); return r; } finally { clearTimeout(t); }
    };
    if (url.searchParams.has('v')) {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try { return await traer(15000, req.url); } catch (err) { return deRespaldo(); }
    }
    const [k] = claves(req.url);
    const hit = await c.match(k, { ignoreSearch: true });
    const nueva = traer(10000, k);
    if (hit) { e.waitUntil(nueva.catch(() => {})); return hit; }
    try { return await nueva; } catch (err) { return deRespaldo(); }
  })());
});
