// src/serviceWorkerRegistration.js
// Registro do Service Worker (public/service-worker.js)
//
// Objetivos:
// - Manter assets do PWA em cache mesmo após fechar/abrir o app
// - Atualizar automaticamente quando houver nova versão (skipWaiting + reload)

const SW_URL = `${process.env.PUBLIC_URL}/service-worker.js`;

function listenForWaitingServiceWorker(registration, callback) {
  if (!registration) return;

  // Se já existe um SW aguardando, já dispara
  if (registration.waiting) {
    callback(registration);
    return;
  }

  registration.addEventListener("updatefound", () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;

    installingWorker.addEventListener("statechange", () => {
      if (installingWorker.state === "installed") {
        // Há um SW novo pronto, mas só é update se já existia controller
        if (navigator.serviceWorker.controller) {
          callback(registration);
        }
      }
    });
  });
}

export function register() {
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL)
      .then((registration) => {
        let refreshing = false;

        // Quando o novo SW assumir o controle, recarrega 1x
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        // Se houver update, manda o SW pular espera
        listenForWaitingServiceWorker(registration, (reg) => {
          try {
            reg.waiting?.postMessage({ type: "SKIP_WAITING" });
          } catch (e) {
            // fallback: só recarrega (o SW novo pode entrar na próxima abertura)
            window.location.reload();
          }
        });
      })
      .catch((err) => {
        // Não é fatal
        console.warn("[SW] Falha ao registrar service worker:", err);
      });
  });
}

export function unregister() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch(() => {});
}
