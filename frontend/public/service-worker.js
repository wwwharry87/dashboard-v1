/**
 * Service Worker - Dashboard Matrículas (robusto)
 * - App Shell (SPA): navegação -> index.html
 * - Cache de ícones/manifest/favicons (network-first)
 * - API: network-first (sempre busca dados novos quando online; fallback offline)
 * - Limpeza por mensagens (logout / force update)
 */

// ⚠️ Bump de versão para forçar atualização do SW nos clientes
const CACHE_VERSION = "v4";

const STATIC_CACHE = `dashboard-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `dashboard-runtime-${CACHE_VERSION}`; // assets dinâmicos
const DATA_CACHE = `dashboard-data-${CACHE_VERSION}`;
const ICON_CACHE = `dashboard-icons-${CACHE_VERSION}`;

// ✅ Importante: NÃO usamos atualização programada/horária para dados.
// A API deve responder sempre com o banco atualizado quando estiver online.

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
    // ✅ Network-first SEM agendamento: sempre busca dados novos quando online.
    // Se estiver offline, usa o último cache apenas como fallback.
    event.respondWith(networkFirstApi(req));
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

// ===================== API: NETWORK-FIRST (sem horário) =====================

async function networkFirstApi(request) {
  const cache = await caches.open(DATA_CACHE);

  try {
    const res = await fetch(request);
    // guarda última resposta para fallback offline
    if (res && res.ok) {
      try {
        await cache.put(request, res.clone());
      } catch (e) {
        // ignore
      }
    }
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
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

    case "CLEAR_PWA_ASSETS_CACHE":
      Promise.all([caches.delete(STATIC_CACHE), caches.delete(RUNTIME_CACHE), caches.delete(ICON_CACHE)])
        .then(() => event.source?.postMessage({ type: "PWA_ASSETS_CLEARED", version: CACHE_VERSION }));
      break;

    default:
      break;
  }
});

console.log("[SW] Rodando:", CACHE_VERSION);
