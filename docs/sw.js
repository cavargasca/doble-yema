// Service worker: deja la app disponible sin señal. Los datos viven en IndexedDB, no aquí.
const VERSION = 'dy-0.1.8';
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/app.js', 'js/api.js', 'js/calc.js', 'js/config.js', 'js/datos.js', 'js/store.js', 'js/ui.js',
  'js/pantallas/operario.js', 'js/pantallas/ventas.js', 'js/pantallas/gastos.js', 'js/pantallas/clientes.js', 'js/pantallas/resumen.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (para recibir versiones nuevas), pero con poca señal no se espera: tras 3 s se usa lo guardado.
const ESPERA_MS = 3000;
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const red = fetch(req, { cache: 'no-cache' }).then((r) => { // no-cache: siempre revalida con el servidor
    if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
    return r;
  });
  const guardado = () => caches.match(req).then((r) => r || caches.match('index.html'));
  const limite = new Promise((resolve) => setTimeout(() => resolve(null), ESPERA_MS));
  e.respondWith(
    Promise.race([red.catch(() => null), limite]).then((r) => r || guardado().then((g) => g || red)).catch(() => guardado())
  );
});
