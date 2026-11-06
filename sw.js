/* PMP-Lernpartner – Service Worker: App-Dateien offline verfügbar, online immer frisch. */
const CACHE = 'pmplp-v6';
const DATEIEN = ['./', 'index.html', 'app.css?v=4', 'config.js?v=2', 'app.js?v=4', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

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
