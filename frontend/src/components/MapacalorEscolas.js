// src/components/MapacalorEscolas.js
// Melhorias UI/UX:
// - Legenda de cor e tamanho (gestor entende o mapa sem “adivinhar”)
// - Seletor de métrica (Ativos / Total)
// - Tooltip mais “Power BI”: mostra valores + % (quando possível)

import React, { useMemo, useState } from 'react';
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

function fmt(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR');
}

function pct(a, b) {
  const A = Number(a) || 0;
  const B = Number(b) || 0;
  if (!B) return null;
  return (A * 100) / B;
}

function LegendSwatch({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-3 h-3 rounded" style={{ background: color }} />
      <span className="text-[11px] text-gray-700">{label}</span>
    </div>
  );
}

function LegendSizeRow({ size, label }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block rounded-full border border-gray-300/70 bg-gray-100"
        style={{ width: size, height: size }}
      />
      <span className="text-[11px] text-gray-700">{label}</span>
    </div>
  );
}

export default function MapacalorEscolas({ escolas = [], loading = false, onSelectSchool }) {
  const [metric, setMetric] = useState('ativos'); // 'ativos' | 'total'

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

  const metricLabel = metric === 'total' ? 'Total de matrículas' : 'Ativos';
  const metricValueOf = (p) => (metric === 'total' ? (p.total || 0) : (p.ativos || 0));

  const maxMetric = useMemo(() => {
    return points.reduce((m, p) => Math.max(m, metricValueOf(p) || 0), 0);
  }, [points, metric]);

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
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-600 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Pontos: <span className="font-semibold text-gray-800">{points.length}</span>
          </span>
          <span className="text-gray-400">•</span>
          <span>
            {metricLabel} (max): <span className="font-semibold text-gray-800">{fmt(maxMetric)}</span>
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">Clique em um ponto para filtrar por escola</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 font-semibold">Métrica:</span>
          <div className="flex items-center bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setMetric('ativos')}
              className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                metric === 'ativos' ? 'bg-violet-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
              title="Colorir e dimensionar pelos ativos"
            >
              Ativos
            </button>
            <button
              type="button"
              onClick={() => setMetric('total')}
              className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                metric === 'total' ? 'bg-violet-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
              title="Colorir e dimensionar pelo total"
            >
              Total
            </button>
          </div>
        </div>
      </div>

      <div className="h-[520px] w-full rounded-2xl overflow-hidden border border-gray-200 relative">
        {/* Legenda (overlay) */}
        <div className="absolute z-[1000] bottom-3 right-3 bg-white/95 backdrop-blur rounded-2xl border border-gray-200 shadow-lg p-3 w-[220px] pointer-events-none">
          <div className="text-xs font-bold text-gray-800 mb-2">Legenda</div>
          <div className="space-y-1.5">
            <div className="text-[11px] text-gray-500 font-semibold">Cor = {metricLabel}</div>
            <LegendSwatch color={colorForValue(0, maxMetric)} label={`Baixo (${fmt(0)})`} />
            <LegendSwatch color={colorForValue(maxMetric * 0.5, maxMetric)} label={`Médio (~${fmt(Math.round(maxMetric * 0.5))})`} />
            <LegendSwatch color={colorForValue(maxMetric, maxMetric)} label={`Alto (${fmt(maxMetric)})`} />
            <div className="pt-1 border-t border-gray-200" />
            <div className="text-[11px] text-gray-500 font-semibold">Tamanho = {metricLabel}</div>
            <LegendSizeRow size={10} label="Menor" />
            <LegendSizeRow size={16} label="Médio" />
            <LegendSizeRow size={22} label="Maior" />
          </div>
        </div>

        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {points.map((p) => {
            const v = metricValueOf(p);
            const radius = clamp(6 + Math.sqrt(v || 0) / 2.2, 6, 24);
            const color = colorForValue(v || 0, maxMetric);
            const occ = pct(p.ativos, p.total);

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
                    <div className="mt-1">
                      <span className="text-gray-600">Ativos:</span> <b>{fmt(p.ativos || 0)}</b>
                      <span className="text-gray-400"> • </span>
                      <span className="text-gray-600">Total:</span> <b>{fmt(p.total || 0)}</b>
                      {typeof occ === 'number' ? (
                        <>
                          <span className="text-gray-400"> • </span>
                          <span className="text-gray-600">% Ativos:</span>{' '}
                          <b>{occ.toFixed(1).replace('.', ',')}%</b>
                        </>
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
