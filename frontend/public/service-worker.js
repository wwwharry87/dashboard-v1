/**
 * Service Worker - Dashboard Matrículas (robusto)
 * - App Shell (SPA): navegação -> index.html
 * - Cache de ícones/manifest/favicons (network-first)
 * - Cache de API com TTL 24h + refresh diário 08:10
 * - Limpeza por mensagens (logout / force update)
 */

const CACHE_VERSION = "v2";

const STATIC_CACHE = `dashboard-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `dashboard-runtime-${CACHE_VERSION}`; // assets dinâmicos
const DATA_CACHE = `dashboard-data-${CACHE_VERSION}`;
const ICON_CACHE = `dashboard-icons-${CACHE_VERSION}`;

// Atualização programada (08:10)
const SCHEDULED_UPDATE_HOUR = 8;
const SCHEDULED_UPDATE_MINUTE = 10;

// TTL do cache da API (24h)
const DATA_CACHE_TTL = 24 * 60 * 60 * 1000;

const APP_SHELL_URL = "/index.html";

// Cache “best effort” (não quebra install se algum asset falhar)
async function cacheAddAllSafe(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const req = new Request(url, { cache: "reload" });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res);
      } catch (e) {
        // ignora falha pra não quebrar install
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);

      // ✅ cache mínimo e seguro (não inclua "/" aqui pra não dar mismatch)
      await cacheAddAllSafe(staticCache, [
        APP_SHELL_URL,
        "/manifest.json?v=" + CACHE_VERSION
      ]);

      const iconCache = await caches.open(ICON_CACHE);
      await cacheAddAllSafe(iconCache, [
        "/favicon.ico?v=" + CACHE_VERSION,
        "/icons/icon-192x192.png?v=" + CACHE_VERSION,
        "/icons/icon-256x256.png?v=" + CACHE_VERSION,
        "/icons/icon-512x512.png?v=" + CACHE_VERSION,
        "/icons/icon-180x180.png?v=" + CACHE_VERSION, // iOS
        "/icons/icon-167x167.png?v=" + CACHE_VERSION,
        "/icons/icon-152x152.png?v=" + CACHE_VERSION,
        "/icons/icon-120x120.png?v=" + CACHE_VERSION
      ]);

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (
            name.startsWith("dashboard-") &&
            ![STATIC_CACHE, RUNTIME_CACHE, DATA_CACHE, ICON_CACHE].includes(name)
          ) {
            return caches.delete(name);
          }
        })
      );

      scheduleUpdate();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // só trata GET
  if (req.method !== "GET") return;

  // ✅ API cache (ajuste aqui o padrão /api/ se necessário)
  if (url.pathname.includes("/api/")) {
    event.respondWith(handleApiRequest(req));
    return;
  }

  // ✅ Ícones / manifest / favicon (network-first)
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith("favicon.ico") ||
    url.pathname.endsWith("manifest.json") ||
    url.pathname.includes("apple-touch-icon") ||
    url.pathname.match(/logo\d+\.png/)
  ) {
    event.respondWith(handleIconLike(req));
    return;
  }

  // ✅ Navegação (SPA): sempre servir index.html
  // Isso evita 404 ao abrir rota direto (ex.: /dashboard)
  if (req.mode === "navigate") {
    event.respondWith(appShellStrategy(req));
    return;
  }

  // ✅ Demais assets: cache-first runtime
  event.respondWith(cacheFirstRuntime(req));
});

async function appShellStrategy(request) {
  // cache-first do app shell, com fallback de rede
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(APP_SHELL_URL);
  if (cached) return cached;

  try {
    const res = await fetch(new Request(APP_SHELL_URL, { cache: "reload" }));
    if (res.ok) cache.put(APP_SHELL_URL, res.clone());
    return res;
  } catch (e) {
    return new Response("Offline", { status: 503 });
  }
}

async function cacheFirstRuntime(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return cached || new Response("", { status: 504 });
  }
}

async function handleIconLike(request) {
  // network-first (pra atualizar rápido)
  const cache = await caches.open(ICON_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || new Response("", { status: 404 });
  }
}

// ===================== API CACHE (TTL + 08:10) =====================

async function handleApiRequest(request) {
  const cacheKey = request.url; // GET apenas
  const cache = await caches.open(DATA_CACHE);

  // Se deu horário 08:10 e ainda não atualizou hoje, força rede
  if (shouldUpdateNow()) {
    return fetchAndCacheApi(request, cache, cacheKey);
  }

  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const cachedData = await cached.clone().json();
      const ts = cachedData && cachedData._cacheTimestamp;

      if (ts && Date.now() - ts < DATA_CACHE_TTL) {
        const { _cacheTimestamp, ...data } = cachedData;
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      // se algo falhar, cai pra rede
    }
  }

  return fetchAndCacheApi(request, cache, cacheKey);
}

async function fetchAndCacheApi(request, cache, cacheKey) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const data = await res.clone().json();
      const cachedData = { ...data, _cacheTimestamp: Date.now() };
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(cachedData), {
          headers: { "Content-Type": "application/json" }
        })
      );
    }
    return res;
  } catch (e) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedData = await cached.clone().json();
      const { _cacheTimestamp, ...data } = cachedData || {};
      return new Response(JSON.stringify(data || {}), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
}

function shouldUpdateNow() {
  const now = new Date();
  const lastUpdate = parseInt(self._lastScheduledUpdate || "0", 10);

  const today810 = new Date();
  today810.setHours(SCHEDULED_UPDATE_HOUR, SCHEDULED_UPDATE_MINUTE, 0, 0);

  if (now >= today810 && lastUpdate < today810.getTime()) {
    self._lastScheduledUpdate = Date.now().toString();
    return true;
  }
  return false;
}

function scheduleUpdate() {
  setInterval(() => {
    if (shouldUpdateNow()) {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SCHEDULED_UPDATE", timestamp: Date.now() });
        });
      });
    }
  }, 5 * 60 * 1000);
}

// ===================== MESSAGES =====================

self.addEventListener("message", (event) => {
  const { type } = event.data || {};

  switch (type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "CLEAR_DATA_CACHE":
      caches.delete(DATA_CACHE).then(() => {
        event.source?.postMessage({ type: "CACHE_CLEARED" });
      });
      break;

    case "CLEAR_ALL_CACHE":
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(() => event.source?.postMessage({ type: "ALL_CACHE_CLEARED" }));
      break;

    case "FORCE_UPDATE":
      self._lastScheduledUpdate = "0";
      event.source?.postMessage({ type: "UPDATE_FORCED" });
      break;

    case "CLEAR_PWA_ASSETS_CACHE":
      Promise.all([caches.delete(STATIC_CACHE), caches.delete(RUNTIME_CACHE), caches.delete(ICON_CACHE)])
        .then(() => event.source?.postMessage({ type: "PWA_ASSETS_CLEARED", version: CACHE_VERSION }));
      break;

    default:
      break;
  }
});

console.log("[SW] Rodando:", CACHE_VERSION);
