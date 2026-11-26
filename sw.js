// Guarda las páginas en el teléfono para que la tesorería abra aunque no haya internet.
// Siempre intenta primero la red (para tener lo más nuevo) y si no hay, usa lo guardado.
const CACHE = 'agua-florida-v1';
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
      if (r.ok) { const [k] = claves(req.url); guardar(c, k, r.clone()); }
      return r;
    } catch (err) {
      for (const k of claves(req.url)) { const hit = await c.match(k, { ignoreSearch: true }); if (hit) return hit; }
      return new Response('Sin internet y esta página no está guardada en el teléfono.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
