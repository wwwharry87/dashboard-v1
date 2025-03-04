import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registra o Service Worker para o PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker registrado com sucesso:', registration);

        // Atualiza o Service Worker a cada 1 minuto
        setInterval(() => {
          registration.update();
        }, 60000);
      })
      .catch(error => {
        console.error('Falha ao registrar o Service Worker:', error);
      });
  });

  // Quando o novo service worker assumir o controle, recarrega a página
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
