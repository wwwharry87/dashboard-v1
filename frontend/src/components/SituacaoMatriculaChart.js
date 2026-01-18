// src/components/SituacaoMatriculaChart.js
import React, { useMemo, useRef } from 'react';
import { Doughnut, getElementAtEvent } from 'react-chartjs-2';

const SituacaoMatriculaChart = ({ data, options, loading, onSelect, selected }) => {
  const chartRef = useRef(null);

  const mergedOptions = useMemo(() => {
    const base = options || {};
    return {
      ...base,
      maintainAspectRatio: false,
      // deixa o doughnut "contido" no card (evita ficar gigante)
      radius: base.radius ?? '90%',
      cutout: base.cutout ?? '68%',
      plugins: {
        ...(base.plugins || {}),
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 10,
            ...(base.plugins?.legend?.labels || {}),
          },
          ...(base.plugins?.legend || {}),
        },
        tooltip: {
          ...(base.plugins?.tooltip || {}),
          callbacks: {
            ...(base.plugins?.tooltip?.callbacks || {}),
            label: (ctx) => {
              const label = ctx.label ? `${ctx.label}: ` : '';
              const v = Number(ctx.parsed) || 0;
              return `${label}${v.toLocaleString('pt-BR')}`;
            },
          },
        },
      },
    };
  }, [options]);

  const clickHint = useMemo(() => {
    if (!onSelect) return null;
    if (selected) return `Filtro: ${selected} (clique para remover)`;
    return 'Clique em uma situação para filtrar';
  }, [onSelect, selected]);
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
      {/* altura fixa para não estourar o card */}
      <div className="h-[220px] sm:h-[240px]">
        <Doughnut ref={chartRef} data={data} options={mergedOptions} onClick={handleClick} />
      </div>
    </div>
  );
};

export default SituacaoMatriculaChart;