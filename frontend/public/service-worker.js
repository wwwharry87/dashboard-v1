// IMPORTANTE:
// - Este SW é simples (não Workbox). Ele serve para manter os assets do PWA disponíveis
//   mesmo quando o usuário fecha/abre o app.
// - Para forçar atualização para quem já instalou, aumente a versão do CACHE_NAME.

const CACHE_NAME = 'dashboard-matriculas-cache-v16';

// Assets estáticos principais do PWA
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon-v2.ico',
  '/apple-touch-icon-v2.png',
  '/icon-192-v2.png',
  '/icon-256-v2.png',
  '/icon-512-v2.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Para requisições que contenham '/api/', sempre utiliza a rede sem fallback para cache.
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
  } else {
    event.respondWith(
      caches.match(event.request)
        .then((response) => response || fetch(event.request))
    );
  }
});

// Escuta a mensagem para pular a espera
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
