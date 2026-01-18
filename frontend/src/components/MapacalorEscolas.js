// src/components/MapacalorEscolas.js
import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function colorForValue(v, max) {
  if (!max || max <= 0) return '#6366f1';
  const t = clamp(v / max, 0, 1);
  // gradient simples: verde -> amarelo -> vermelho
  const r = Math.round(34 + (220 - 34) * t);
  const g = Math.round(197 + (38 - 197) * t);
  const b = Math.round(94 + (38 - 94) * t);
  return `rgb(${r},${g},${b})`;
}

export default function MapacalorEscolas({ escolas = [], loading = false, onSelectSchool }) {
  const points = useMemo(() => {
    return (escolas || [])
      .filter((e) => Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude)))
      .map((e) => ({
        ...e,
        latitude: Number(e.latitude),
        longitude: Number(e.longitude),
        ativos: Number(e.ativos || 0),
        total: Number(e.total || 0),
      }));
  }, [escolas]);

  const maxAtivos = useMemo(() => {
    return points.reduce((m, p) => Math.max(m, p.ativos || 0), 0);
  }, [points]);

  const center = useMemo(() => {
    if (!points.length) return [-3.0, -52.0]; // fallback PA (ajuste automático quando tiver dados)
    const lat = points.reduce((s, p) => s + p.latitude, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.longitude, 0) / points.length;
    return [lat, lng];
  }, [points]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[520px] w-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="h-[520px] w-full flex items-center justify-center">
        <div className="text-center text-sm text-gray-600">
          <p className="font-semibold text-gray-800">Sem coordenadas para exibir no mapa.</p>
          <p className="mt-1">
            Preencha a tabela <span className="font-mono">escolas_geo</span> com latitude/longitude para cada escola.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span>
          Pontos: <span className="font-semibold text-gray-800">{points.length}</span>
        </span>
        <span className="text-gray-400">•</span>
        <span>
          Ativos (max): <span className="font-semibold text-gray-800">{maxAtivos.toLocaleString('pt-BR')}</span>
        </span>
        <span className="text-gray-400">•</span>
        <span className="text-gray-500">Clique em um ponto para filtrar por escola (se habilitado)</span>
      </div>

      <div className="h-[520px] w-full rounded-2xl overflow-hidden border border-gray-200">
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {points.map((p) => {
            const radius = clamp(6 + Math.sqrt(p.ativos || 0) / 2.2, 6, 24);
            const color = colorForValue(p.ativos || 0, maxAtivos);

            return (
              <CircleMarker
                key={`${p.idcliente}-${p.idescola}`}
                center={[p.latitude, p.longitude]}
                radius={radius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.45,
                  weight: 2,
                }}
                eventHandlers={{
                  click: () => {
                    if (onSelectSchool) onSelectSchool(p);
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  <div className="text-xs">
                    <div className="font-semibold">{p.nome || p.escola || `Escola ${p.idescola}`}</div>
                    <div>
                      Ativos: <b>{(p.ativos || 0).toLocaleString('pt-BR')}</b>
                      {Number.isFinite(p.total) ? (
                        <span>
                          {' '}
                          • Total: <b>{(p.total || 0).toLocaleString('pt-BR')}</b>
                        </span>
                      ) : null}
                    </div>
                    {p.bairro ? <div>Bairro: {p.bairro}</div> : null}
                    {p.municipio ? <div>{p.municipio}{p.uf ? `/${p.uf}` : ''}</div> : null}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
