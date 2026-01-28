/**
 * Service Worker - Dashboard Matrículas
 * Versão: v0.1.17
 * 
 * Funcionalidades:
 * - Cache de assets estáticos
 * - Cache de dados da API com TTL de 24h
 * - Atualização programada às 08:10
 * - Limpeza de cache ao sair/deslogar
 * - Atualização automática de ícones PWA
 */

const CACHE_VERSION = 'v17';
const STATIC_CACHE_NAME = `dashboard-static-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `dashboard-data-${CACHE_VERSION}`;
const ICON_CACHE_NAME = `dashboard-icons-${CACHE_VERSION}`;

// Assets estáticos para cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo256.png',
  '/logo512.png',
];

// Horário de atualização programada (08:10)
const SCHEDULED_UPDATE_HOUR = 8;
const SCHEDULED_UPDATE_MINUTE = 10;

// Tempo de vida do cache de dados (24 horas em ms)
const DATA_CACHE_TTL = 24 * 60 * 60 * 1000;

// ==========================================
// INSTALAÇÃO
// ==========================================
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando service worker...');
  
  event.waitUntil(
    Promise.all([
      // Cache de assets estáticos
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('[SW] Cacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache de ícones (força atualização)
      caches.open(ICON_CACHE_NAME).then((cache) => {
        console.log('[SW] Cacheando ícones');
        return cache.addAll([
          '/logo192.png?v=' + CACHE_VERSION,
          '/logo256.png?v=' + CACHE_VERSION,
          '/logo512.png?v=' + CACHE_VERSION,
        ]);
      })
    ]).then(() => {
      console.log('[SW] Instalação completa, skipWaiting');
      return self.skipWaiting();
    })
  );
});

// ==========================================
// ATIVAÇÃO
// ==========================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Remove caches antigos
          if (
            cacheName.startsWith('dashboard-') &&
            cacheName !== STATIC_CACHE_NAME &&
            cacheName !== DATA_CACHE_NAME &&
            cacheName !== ICON_CACHE_NAME
          ) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Ativação completa, claim clients');
      // Iniciar timer de verificação programada
      scheduleUpdate();
      return self.clients.claim();
    })
  );
});

// ==========================================
// FETCH - Interceptação de requisições
// ==========================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Requisições de API
  if (url.pathname.includes('/api/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Requisições de ícones (força atualização com versão)
  if (url.pathname.match(/logo\d+\.png/)) {
    event.respondWith(handleIconRequest(event.request));
    return;
  }
  
  // Assets estáticos - cache first
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cachear novos assets
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
    })
  );
});

// ==========================================
// HANDLER: Requisições de API
// ==========================================
async function handleApiRequest(request) {
  const cacheKey = request.url + '_' + (request.method || 'GET');
  
  // Verificar se deve atualizar (passou das 08:10)
  if (shouldUpdateNow()) {
    console.log('[SW] Horário de atualização programada, buscando dados frescos');
    return fetchAndCacheApi(request, cacheKey);
  }
  
  // Tentar cache primeiro
  try {
    const cache = await caches.open(DATA_CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      const cachedData = await cachedResponse.clone().json();
      const cacheTime = cachedData._cacheTimestamp;
      
      // Verificar se cache ainda é válido (24h)
      if (cacheTime && (Date.now() - cacheTime) < DATA_CACHE_TTL) {
        console.log('[SW] Usando dados em cache para:', request.url);
        // Retornar dados sem o timestamp interno
        const { _cacheTimestamp, ...data } = cachedData;
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Cache expirado ou não existe, buscar da rede
    return fetchAndCacheApi(request, cacheKey);
  } catch (error) {
    console.warn('[SW] Erro ao verificar cache:', error);
    return fetchAndCacheApi(request, cacheKey);
  }
}

// ==========================================
// HANDLER: Requisições de Ícones
// ==========================================
async function handleIconRequest(request) {
  try {
    // Sempre tenta buscar da rede primeiro para ícones
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(ICON_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    // Fallback para cache
    const cachedResponse = await caches.match(request);
    return cachedResponse || networkResponse;
  } catch (error) {
    // Se offline, usar cache
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Ícone não disponível', { status: 404 });
  }
}

// ==========================================
// HELPER: Buscar e cachear dados da API
// ==========================================
async function fetchAndCacheApi(request, cacheKey) {
  try {
    // Clone request se for POST
    let fetchRequest = request;
    if (request.method === 'POST') {
      fetchRequest = request.clone();
    }
    
    const response = await fetch(fetchRequest);
    
    if (response && response.status === 200) {
      const data = await response.clone().json();
      
      // Adicionar timestamp ao cache
      const cachedData = {
        ...data,
        _cacheTimestamp: Date.now()
      };
      
      const cache = await caches.open(DATA_CACHE_NAME);
      await cache.put(cacheKey, new Response(JSON.stringify(cachedData), {
        headers: { 'Content-Type': 'application/json' }
      }));
      
      console.log('[SW] Dados cacheados para:', request.url);
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Erro ao buscar da rede:', error);
    
    // Tentar cache como fallback
    const cache = await caches.open(DATA_CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      console.log('[SW] Usando cache como fallback');
      const cachedData = await cachedResponse.clone().json();
      const { _cacheTimestamp, ...data } = cachedData;
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    throw error;
  }
}

// ==========================================
// HELPER: Verificar se deve atualizar (08:10)
// ==========================================
function shouldUpdateNow() {
  const now = new Date();
  const lastUpdate = parseInt(self._lastScheduledUpdate || '0', 10);
  const today810 = new Date();
  today810.setHours(SCHEDULED_UPDATE_HOUR, SCHEDULED_UPDATE_MINUTE, 0, 0);
  
  // Se passou das 08:10 de hoje e última atualização foi antes
  if (now >= today810 && lastUpdate < today810.getTime()) {
    self._lastScheduledUpdate = Date.now().toString();
    return true;
  }
  
  return false;
}

// ==========================================
// HELPER: Agendar verificação de atualização
// ==========================================
function scheduleUpdate() {
  // Verificar a cada 5 minutos
  setInterval(() => {
    if (shouldUpdateNow()) {
      console.log('[SW] Executando atualização programada');
      // Notificar clientes para recarregar dados
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SCHEDULED_UPDATE',
            timestamp: Date.now()
          });
        });
      });
    }
  }, 5 * 60 * 1000); // 5 minutos
}

// ==========================================
// MENSAGENS
// ==========================================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      console.log('[SW] Recebido SKIP_WAITING');
      self.skipWaiting();
      break;
      
    case 'CLEAR_DATA_CACHE':
      console.log('[SW] Limpando cache de dados');
      caches.delete(DATA_CACHE_NAME).then(() => {
        event.source.postMessage({ type: 'CACHE_CLEARED' });
      });
      break;
      
    case 'CLEAR_ALL_CACHE':
      console.log('[SW] Limpando todo o cache');
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      }).then(() => {
        event.source.postMessage({ type: 'ALL_CACHE_CLEARED' });
      });
      break;
      
    case 'FORCE_UPDATE':
      console.log('[SW] Forçando atualização de dados');
      self._lastScheduledUpdate = '0'; // Reset para forçar atualização
      event.source.postMessage({ type: 'UPDATE_FORCED' });
      break;
      
    case 'GET_CACHE_INFO':
      getCacheInfo().then((info) => {
        event.source.postMessage({ type: 'CACHE_INFO', payload: info });
      });
      break;
      
    default:
      console.log('[SW] Mensagem desconhecida:', type);
  }
});

// ==========================================
// HELPER: Obter informações do cache
// ==========================================
async function getCacheInfo() {
  const info = {
    version: CACHE_VERSION,
    staticCache: false,
    dataCache: false,
    iconCache: false,
    lastUpdate: self._lastScheduledUpdate || null,
    nextScheduledUpdate: getNextScheduledUpdate()
  };
  
  const names = await caches.keys();
  info.staticCache = names.includes(STATIC_CACHE_NAME);
  info.dataCache = names.includes(DATA_CACHE_NAME);
  info.iconCache = names.includes(ICON_CACHE_NAME);
  
  return info;
}

// ==========================================
// HELPER: Próxima atualização programada
// ==========================================
function getNextScheduledUpdate() {
  const now = new Date();
  const next = new Date();
  next.setHours(SCHEDULED_UPDATE_HOUR, SCHEDULED_UPDATE_MINUTE, 0, 0);
  
  if (now >= next) {
    next.setDate(next.getDate() + 1);
  }
  
  return next.toISOString();
}

// ==========================================
// PUSH NOTIFICATIONS (preparado para futuro)
// ==========================================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Dashboard Matrículas', {
      body: data.body || 'Novos dados disponíveis',
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'dashboard-update',
      data: data.url || '/'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});

console.log('[SW] Service Worker carregado - versão:', CACHE_VERSION);
