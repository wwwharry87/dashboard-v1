// src/components/TurnoChart.js
import React, { useMemo, useRef } from "react";
import { Bar, getElementAtEvent } from "react-chartjs-2";

const TurnoChart = ({ data, options, loading, onSelect, selected }) => {
  const chartRef = useRef(null);

  const mergedData = useMemo(() => {
    if (!data) return data;
    const ds0 = data?.datasets?.[0] || {};
    return {
      ...data,
      datasets: [
        {
          ...ds0,
          maxBarThickness: ds0.maxBarThickness ?? 26,
          minBarLength: ds0.minBarLength ?? 10, // ✅ ajuda turnos pequenos
          borderRadius: ds0.borderRadius ?? 10,
        },
      ],
    };
  }, [data]);

  const mergedOptions = useMemo(() => {
    const base = options || {};

    return {
      ...base,
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: base.indexAxis ?? "y",
      layout: {
        ...(base.layout || {}),
        // ✅ mais espaço pra rótulo sem vazar
        padding: { ...(base.layout?.padding || {}), right: 42 },
      },
      scales: {
        ...(base.scales || {}),
        x: {
          ...(base.scales?.x || {}),
          ticks: {
            ...(base.scales?.x?.ticks || {}),
            callback: (value) => Number(value).toLocaleString("pt-BR"),
          },
          grid: { ...(base.scales?.x?.grid || {}), color: "rgba(107,114,128,0.12)" },
        },
        y: {
          ...(base.scales?.y || {}),
          grid: { ...(base.scales?.y?.grid || {}), display: false },
        },
      },
      plugins: {
        ...(base.plugins || {}),
        legend: { display: false, ...(base.plugins?.legend || {}) },

        // ✅ DESLIGA datalabels (evita duplicar)
        datalabels: {
          display: false,
        },

        tooltip: {
          ...(base.plugins?.tooltip || {}),
          callbacks: {
            ...(base.plugins?.tooltip?.callbacks || {}),
            label: (ctx) => {
              const v = Number(ctx.parsed?.x ?? ctx.parsed) || 0;
              return `${v.toLocaleString("pt-BR")} matrículas`;
            },
          },
        },
      },
    };
  }, [options]);

  // ✅ Plugin próprio (um rótulo por barra) com "anti-vazamento"
  const valueLabelsPlugin = useMemo(() => {
    return {
      id: "valueLabels",
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta?.data?.length) return;

        ctx.save();
        ctx.font = "600 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.fillStyle = "#111827";
        ctx.textBaseline = "middle";

        meta.data.forEach((bar, i) => {
          const raw = chart.data?.datasets?.[0]?.data?.[i];
          const v = Number(raw) || 0;
          const text = v.toLocaleString("pt-BR");

          const textWidth = ctx.measureText(text).width;
          const padding = 8;

          // posição padrão: depois da ponta da barra
          let x = bar.x + 10;
          const y = bar.y;

          // limite direito do chart (área interna)
          const rightLimit = chartArea.right - padding;

          // Se estiver estourando, escreve "por dentro" (no fim da barra)
          if (x + textWidth > rightLimit) {
            x = Math.max(chartArea.left + padding, bar.x - textWidth - 10);
          }

          ctx.fillText(text, x, y);
        });

        ctx.restore();
      },
    };
  }, []);

  const clickHint = useMemo(() => {
    if (!onSelect) return null;
    if (selected) return `Filtro: ${selected} (clique para remover)`;
    return "Clique em uma barra para filtrar";
  }, [onSelect, selected]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto" />
          <p className="mt-2 text-gray-600">Carregando gráfico...</p>
        </div>
      </div>
    );
  }

  const handleClick = (event) => {
    if (!onSelect || !chartRef.current) return;
    const elements = getElementAtEvent(chartRef.current, event);
    if (!elements?.length) return;
    const idx = elements[0].index;
    const label = data?.labels?.[idx];
    if (label) onSelect(String(label));
  };

  return (
    <div className="h-full w-full">
      {clickHint && (
        <div className="mb-2 text-xs text-gray-500 flex items-center justify-between">
          <span>{clickHint}</span>
        </div>
      )}

      {/* ✅ Altura controlada */}
      <div className="h-[240px] sm:h-[260px]">
        <Bar
          ref={chartRef}
          data={mergedData}
          options={mergedOptions}
          plugins={[valueLabelsPlugin]}
          onClick={handleClick}
        />
      </div>
    </div>
  );
};

export default TurnoChart;
