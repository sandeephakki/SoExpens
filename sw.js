/* SoExpens service worker. Network-first for same-origin files (always fresh when online,
   offline from cache otherwise). Bump CACHE_VERSION on every deploy. */
const CACHE_VERSION = 'soexpens-v1.4.1'; // keep equal to core/version.js
const SCOPE = self.registration.scope; // works on user.github.io/repo/ and on a custom domain

const SHELL = [
  '', 'index.html', 'manifest.json', 'css/app.css',
  'core/app.js', 'core/dom.js', 'core/i18n.js', 'core/dialog.js', 'core/theme.js', 'core/update.js', 'core/version.js',
  'ui/dashboard.js', 'ui/months.js', 'ui/special.js', 'ui/settings.js', 'ui/export-view.js', 'ui/report-canvas.js',
  'bal/service.js', 'bal/month-calc.js', 'bal/month-rules.js', 'bal/validate.js', 'bal/report-model.js',
  'dal/store.js', 'dal/migrate.js', 'dal/backup.js',
  'i18n/en.json', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png',
].map((p) => SCOPE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).catch((e) => console.warn('[sw] precache failed', e)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  // 'no-cache' = always check the server, so a fresh deploy shows up even though GitHub Pages caches files for ~10 minutes
  const fresh = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' });
  event.respondWith(
    fetch(fresh).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match(SCOPE + 'index.html'))),
  );
});
