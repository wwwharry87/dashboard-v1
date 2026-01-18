// src/components/SexoChart.js
import React, { useMemo, useRef } from 'react';
import { Doughnut, getElementAtEvent } from 'react-chartjs-2';

const SexoChart = ({ data, options, loading, onSelect, selected }) => {
  const chartRef = useRef(null);

  const total = useMemo(() => {
    const arr = data?.datasets?.[0]?.data;
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [data]);

  const clickHint = useMemo(() => {
    if (!onSelect) return null;
    if (selected) return `Filtro: ${selected} (clique para remover)`;
    return 'Clique em um setor para filtrar';
  }, [onSelect, selected]);

  const mergedData = useMemo(() => {
    if (!data) return data;
    const ds0 = data?.datasets?.[0] || {};
    return {
      ...data,
      datasets: [
        {
          ...ds0,
          // deixa o donut mais "PowerBI-like"
          borderWidth: ds0.borderWidth ?? 0,
          hoverOffset: ds0.hoverOffset ?? 6,
        },
      ],
    };
  }, [data]);

  const mergedOptions = useMemo(() => {
    const base = options || {};
    return {
      ...base,
      maintainAspectRatio: false,
      cutout: base.cutout ?? '70%',
      plugins: {
        ...(base.plugins || {}),
        legend: {
          ...(base.plugins?.legend || {}),
          position: base.plugins?.legend?.position ?? 'bottom',
          labels: {
            ...(base.plugins?.legend?.labels || {}),
            boxWidth: 14,
            boxHeight: 10,
          },
        },
        tooltip: {
          ...(base.plugins?.tooltip || {}),
          callbacks: {
            ...(base.plugins?.tooltip?.callbacks || {}),
            label: (ctx) => {
              const val = Number(ctx.parsed) || 0;
              const pct = total > 0 ? (val * 100.0) / total : 0;
              const label = ctx.label ? `${ctx.label}: ` : '';
              return `${label}${val.toLocaleString('pt-BR')} (${pct.toFixed(1).replace('.', ',')}%)`;
            },
          },
        },
      },
    };
  }, [options, total]);

  const centerTextPlugin = useMemo(() => {
    return {
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // título pequeno
        ctx.font = '600 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#6B7280'; // gray-500
        ctx.fillText('Total', cx, cy - 10);

        // valor
        ctx.font = '700 18px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#111827'; // gray-900
        ctx.fillText(total.toLocaleString('pt-BR'), cx, cy + 10);

        // filtro
        if (selected) {
          ctx.font = '600 11px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
          ctx.fillStyle = '#7C3AED'; // violet-600
          ctx.fillText(String(selected), cx, cy + 30);
        }

        ctx.restore();
      },
    };
  }, [total, selected]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
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
      <div className="h-[220px] sm:h-[230px]">
        <Doughnut
          ref={chartRef}
          data={mergedData}
          options={mergedOptions}
          plugins={[centerTextPlugin]}
          onClick={handleClick}
        />
      </div>
    </div>
  );
};

export default SexoChart;