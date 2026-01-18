import React, { useMemo, useRef } from 'react';
import { Doughnut, getElementAtEvent } from 'react-chartjs-2';

const SexoChart = ({ data, options, loading, onSelect, selected }) => {
  const chartRef = useRef(null);

  // ✅ Hooks sempre no topo (NUNCA depois de return)
  const clickHint = useMemo(() => {
    if (!onSelect) return null;
    if (selected) return `Filtro: ${selected} (clique novamente para remover)`;
    return 'Clique em um setor para filtrar';
  }, [onSelect, selected]);

  const mergedOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false, // ✅ permite controlar altura pelo container
      ...options,
      plugins: {
        ...(options?.plugins || {}),
        legend: {
          position: 'bottom',
          ...(options?.plugins?.legend || {}),
        },
        tooltip: {
          ...(options?.plugins?.tooltip || {}),
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

  // ✅ return condicional só depois dos hooks
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

      {/* ✅ altura fixa do gráfico (evita “gigante”) */}
      <div style={{ height: 280 }}>
        <Doughnut
          ref={chartRef}
          data={data}
          options={mergedOptions}
          onClick={handleClick}
        />
      </div>
    </div>
  );
};

export default SexoChart;
