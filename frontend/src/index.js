// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Leaflet (mapa gratuito com OpenStreetMap)
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import App from "./App";
import reportWebVitals from "./reportWebVitals";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

// Corrige ícones padrão no bundler (CRA/Webpack)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();

// Registra o Service Worker em produção (PWA)
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    // força o novo SW assumir e atualizar caches
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  },
  onSuccess: () => {
    // opcional: log
    // console.log("SW registrado com sucesso");
  }
});
