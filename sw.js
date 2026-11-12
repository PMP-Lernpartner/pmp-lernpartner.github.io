/* PMP-Lernpartner – Service Worker: App-Dateien offline verfügbar, online immer frisch. */
const CACHE = 'pmplp-v13';
const DATEIEN = ['./', 'index.html', 'app.css?v=11', 'config.js?v=3', 'app.js?v=11', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2',
  'fonts/inter-latin-700-normal.woff2', 'fonts/space-grotesk-latin-500-normal.woff2', 'fonts/space-grotesk-latin-600-normal.woff2',
  'fonts/space-grotesk-latin-700-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Fragenbank und Skript nie cachen
  e.respondWith(
    fetch(e.request).then((antwort) => {
      const kopie = antwort.clone();
      caches.open(CACHE).then((c) => c.put(e.request, kopie));
      return antwort;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
