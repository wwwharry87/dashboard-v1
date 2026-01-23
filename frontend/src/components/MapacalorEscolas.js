// src/components/MapacalorEscolas.js
// Melhorias UI/UX:
// - Legenda de cor e tamanho (gestor entende o mapa sem “adivinhar”)
// - Seletor de métrica (Ativos / Total)
// - Tooltip mais “Power BI”: mostra valores + % (quando possível)

import React, { useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

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

function safeNumFromText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function riskColor(v, max) {
  // Mantém o gradiente já usado (verde->amarelo->vermelho), mas com fallback.
  return colorForValue(v || 0, max || 0);
}

function hasAlert(p) {
  const desist = Number(p.desistentes ?? p.desistentes_total ?? p.desistente ?? 0) || 0;
  const evPct = safeNumFromText(p.evasao_pct ?? p.taxa_evasao ?? p.evasao) || 0;
  const cheias = Number(p.turmas_cheias ?? p.turmasCheias ?? p.turmas_lotadas ?? 0) || 0;
  return desist > 0 || evPct > 0 || cheias > 0;
}

function makePinIcon({ color, selected, badge, label }) {
  // DivIcon com HTML/SVG (usa classes Tailwind disponíveis no app)
  // - Pin com borda branca + sombra
  // - Ícone de escola no centro
  // - Badge opcional de alerta
  // - Halo/pulso quando selecionado
  const safeLabel = (label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <div class="relative" style="transform: translate(-50%, -100%);">
      ${selected ? '<span class="absolute -inset-3 rounded-full bg-violet-500/25 animate-ping"></span>' : ''}
      <div class="relative">
        <div class="w-9 h-9 rounded-full border-2 border-white shadow-lg" style="background:${color}; display:flex; align-items:center; justify-content:center;">
          <span style="font-size:16px; line-height:1; filter: drop-shadow(0 1px 0 rgba(255,255,255,0.55));">🏫</span>
        </div>
        <div class="mx-auto" style="width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent; border-top:14px solid ${color}; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.18));"></div>
        ${badge ? '<span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow">!</span>' : ''}
      </div>
      ${safeLabel ? `<div class="mt-1 px-2 py-0.5 rounded-full bg-white/90 border border-gray-200 shadow text-[10px] font-semibold text-gray-800 max-w-[180px] truncate">${safeLabel}</div>` : ''}
    </div>
  `;

  return L.divIcon({
    className: 'school-pin-icon',
    html,
    iconSize: [40, 56],
    iconAnchor: [20, 56],
    popupAnchor: [0, -56],
  });
}

function makeClusterIcon({ color, count }) {
  const html = `
    <div class="relative" style="transform: translate(-50%, -50%);">
      <div class="w-10 h-10 rounded-full border-2 border-white shadow-lg flex items-center justify-center" style="background:${color};">
        <span class="text-white text-sm font-black" style="text-shadow:0 1px 2px rgba(0,0,0,.35);">${count}</span>
      </div>
    </div>
  `;
  return L.divIcon({
    className: 'school-cluster-icon',
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function ZoomWatcher({ onZoom }) {
  useMapEvents({
    zoomend: (e) => {
      const z = e.target.getZoom?.();
      if (typeof z === 'number') onZoom(z);
    },
  });
  return null;
}

function ClusterMarker({ item, metricLabel }) {
  const map = useMap();
  return (
    <Marker
      position={[item.lat, item.lng]}
      icon={makeClusterIcon({ color: item.color, count: item.count })}
      eventHandlers={{
        click: () => {
          const nextZoom = Math.min((map.getZoom?.() ?? 12) + 2, 18);
          map.setView([item.lat, item.lng], nextZoom, { animate: true });
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        <div className="text-xs">
          <div className="font-semibold">{item.count} escolas</div>
          <div className="mt-1">
            <span className="text-gray-600">Pico ({metricLabel}):</span> <b>{fmt(item.maxV)}</b>
          </div>
          <div className="text-[11px] text-gray-500">Clique para aproximar</div>
        </div>
      </Tooltip>
    </Marker>
  );
}

export default function MapacalorEscolas({ escolas = [], loading = false, onSelectSchool }) {
  const [metric, setMetric] = useState('ativos'); // 'ativos' | 'total'
  const [selectedKey, setSelectedKey] = useState(null);
  const [zoom, setZoom] = useState(12);

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

  const onPick = useCallback(
    (p) => {
      const key = `${p.idcliente ?? ''}-${p.idescola ?? ''}`;
      setSelectedKey(key);
      if (onSelectSchool) onSelectSchool(p);
    },
    [onSelectSchool]
  );

  // Cluster “leve” (sem dependências): quando zoom está baixo, agrupa por grade.
  const renderItems = useMemo(() => {
    const z = zoom;
    const shouldCluster = z <= 11; // ajuste fino
    if (!shouldCluster) {
      return points.map((p) => ({ type: 'school', p }));
    }

    // Grade: quanto menor o zoom, maior a célula
    const cell = z <= 9 ? 0.08 : 0.05; // ~km scale
    const buckets = new Map();
    for (const p of points) {
      const gx = Math.round(p.latitude / cell);
      const gy = Math.round(p.longitude / cell);
      const k = `${gx}:${gy}`;
      const arr = buckets.get(k);
      if (arr) arr.push(p);
      else buckets.set(k, [p]);
    }

    const out = [];
    for (const [k, arr] of buckets.entries()) {
      if (arr.length === 1) {
        out.push({ type: 'school', p: arr[0] });
        continue;
      }
      // centro médio do cluster
      const lat = arr.reduce((s, p) => s + p.latitude, 0) / arr.length;
      const lng = arr.reduce((s, p) => s + p.longitude, 0) / arr.length;
      // “pior caso” de cor: usa o maior valor da métrica no grupo
      const maxV = arr.reduce((m, p) => Math.max(m, metricValueOf(p) || 0), 0);
      const color = riskColor(maxV, maxMetric);
      out.push({ type: 'cluster', key: k, lat, lng, color, count: arr.length, members: arr, maxV });
    }
    return out;
  }, [points, zoom, metric, maxMetric]);

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
        <div className="absolute z-[1000] bottom-3 right-3 bg-white/95 backdrop-blur rounded-2xl border border-gray-200 shadow-lg p-3 w-[240px] pointer-events-none">
          <div className="text-xs font-bold text-gray-800 mb-2">Legenda</div>
          <div className="space-y-1.5">
            <div className="text-[11px] text-gray-500 font-semibold">Cor = {metricLabel}</div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded" style={{ background: riskColor(0, maxMetric) }} />
              <span className="text-[11px] text-gray-700">Baixo</span>
              <span className="text-[11px] text-gray-400">•</span>
              <span className="text-[11px] text-gray-700">Alto</span>
              <span className="inline-block w-3 h-3 rounded" style={{ background: riskColor(maxMetric, maxMetric) }} />
            </div>
            <div className="pt-1 border-t border-gray-200" />
            <div className="text-[11px] text-gray-500 font-semibold">Pin = escola</div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-white shadow" style={{ background: riskColor(maxMetric * 0.2, maxMetric) }} />
              <span className="text-[11px] text-gray-700">Normal</span>
              <div className="w-6 h-6 rounded-full border-2 border-white shadow relative" style={{ background: riskColor(maxMetric * 0.8, maxMetric) }}>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-white" />
              </div>
              <span className="text-[11px] text-gray-700">Com alerta</span>
            </div>
            <div className="text-[11px] text-gray-500">Dica: afaste o zoom para agrupar (cluster)</div>
          </div>
        </div>

        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <ZoomWatcher onZoom={setZoom} />
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {renderItems.map((item) => {
            if (item.type === 'cluster') {
              return <ClusterMarker key={`cluster-${item.key}`} item={item} metricLabel={metricLabel} />;
            }

            const p = item.p;
            const v = metricValueOf(p);
            const color = riskColor(v || 0, maxMetric);
            const occ = pct(p.ativos, p.total);
            const key = `${p.idcliente ?? ''}-${p.idescola ?? ''}`;
            const selected = selectedKey === key;
            const badge = hasAlert(p);
            const label = p.nome || p.escola || p.nomeEscola || '';

            return (
              <Marker
                key={key}
                position={[p.latitude, p.longitude]}
                icon={makePinIcon({ color, selected, badge, label })}
                eventHandlers={{
                  click: () => onPick(p),
                }}
              >
                <Tooltip direction="top" offset={[0, -20]} opacity={1}>
                  <div className="text-xs">
                    <div className="font-semibold">{label || `Escola ${p.idescola}`}</div>
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
                    {p.municipio ? (
                      <div>
                        {p.municipio}
                        {p.uf ? `/${p.uf}` : ''}
                      </div>
                    ) : null}
                    {badge ? <div className="mt-1 text-[11px] text-red-700 font-semibold">⚠️ Atenção: há indicadores de risco</div> : null}
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
