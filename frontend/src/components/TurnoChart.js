import React, { useMemo, useRef } from 'react';
import { Bar, getElementAtEvent } from 'react-chartjs-2';

const TurnoChart = ({ data, options, loading, onSelect, selected }) => {
  const chartRef = useRef(null);

  // ✅ Hooks sempre no topo
  const clickHint = useMemo(() => {
    if (!onSelect) return null;
    if (selected) return `Filtro: ${selected} (clique novamente para remover)`;
    return 'Clique em uma barra para filtrar';
  }, [onSelect, selected]);

  const mergedOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false, // ✅ controla altura
      ...options,
      plugins: {
        ...(options?.plugins || {}),
        legend: {
          display: false,
          ...(options?.plugins?.legend || {}),
        },
        tooltip: {
          ...(options?.plugins?.tooltip || {}),
        },
      },
      scales: {
        ...(options?.scales || {}),
        x: {
          ...(options?.scales?.x || {}),
          ticks: {
            ...(options?.scales?.x?.ticks || {}),
          },
        },
        y: {
          beginAtZero: true,
          ...(options?.scales?.y || {}),
        },
      },
    };
  }, [options]);

  const canRender = !loading && !!data && Array.isArray(data?.labels) && data.labels.length > 0;

  const handleClick = (event) => {
    if (!onSelect || !chartRef.current) return;
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

      <div style={{ height: 280 }}>
        <Bar
          ref={chartRef}
          data={data}
          options={mergedOptions}
          onClick={handleClick}
        />
      </div>
    </div>
  );
};

export default TurnoChart;
