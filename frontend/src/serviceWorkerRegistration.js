if (navigator.serviceWorker) {
    navigator.serviceWorker.register('./public/service-worker.js')
      .then(registration => {
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // Nova atualização disponível
                window.location.reload(); // ou mostre um aviso para o usuário recarregar
              }
            }
          };
        };
      });
  }
  