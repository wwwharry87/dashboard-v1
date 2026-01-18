// src/components/SituacaoMatriculaChart.js
import React, { useMemo, useRef } from "react";
import { Doughnut, getElementAtEvent } from "react-chartjs-2";

const SituacaoMatriculaChart = ({ data, options, loading, onSelect, selected }) => {
  const chartRef = useRef(null);

  // ✅ Sempre no topo (hooks não podem ficar depois de return)
  const clickHint = useMemo(() => {
    if (!onSelect) return null;
    if (selected) return `Filtro: ${selected} (clique para remover)`;
    return "Clique em uma situação para filtrar";
  }, [onSelect, selected]);

  const canRender =
    !loading &&
    !!data &&
    Array.isArray(data?.labels) &&
    data.labels.length > 0 &&
    data?.datasets?.[0]?.data &&
    Array.isArray(data.datasets[0].data);

  const total = useMemo(() => {
    if (!canRender) return 0;
    return data.datasets[0].data.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [canRender, data]);

  // ✅ Opções “seguras” para não ficar gigante
  const mergedOptions = useMemo(() => {
    const base = {
      responsive: true,
      maintainAspectRatio: false, // ✅ controla pelo container
      cutout: "68%",
      radius: "95%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 14, boxHeight: 14, padding: 16 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.label || "";
              const value = Number(ctx.raw || 0);
              const pct = total ? (value / total) * 100 : 0;
              const vFmt = value.toLocaleString("pt-BR");
              const pFmt = pct.toFixed(1).replace(".", ",");
              return ` ${label}: ${vFmt} (${pFmt}%)`;
            },
          },
        },
      },
    };

    return {
      ...base,
      ...(options || {}),
      plugins: {
        ...base.plugins,
        ...(options?.plugins || {}),
        legend: { ...base.plugins.legend, ...(options?.plugins?.legend || {}) },
        tooltip: { ...base.plugins.tooltip, ...(options?.plugins?.tooltip || {}) },
      },
    };
  }, [options, total]);

  const handleClick = (event) => {
    if (!onSelect || !chartRef.current || !canRender) return;
    const elements = getElementAtEvent(chartRef.current, event);
    if (!elements?.length) return;
    const idx = elements[0].index;
    const label = data?.labels?.[idx];
    if (label) onSelect(String(label));
  };

  if (!canRender) {
    return (
      <div className="flex items-center justify-center w-full" style={{ height: 280 }}>
        <div className="text-center">
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto" />
              <p className="mt-2 text-gray-600">Carregando gráfico...</p>
            </>
          ) : (
            <p className="text-gray-500">Sem dados para exibir</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {clickHint && (
        <div className="mb-2 text-xs text-gray-500 flex items-center justify-between">
          <span>{clickHint}</span>
        </div>
      )}

      {/* ✅ altura fixa para não “estourar” o card */}
      <div className="relative" style={{ height: 300 }}>
        <Doughnut
          ref={chartRef}
          data={data}
          options={mergedOptions}
          onClick={handleClick}
        />

        {/* ✅ Total no centro (opcional mas muito Power BI) */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-xl font-semibold text-gray-800">
            {total.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SituacaoMatriculaChart;
