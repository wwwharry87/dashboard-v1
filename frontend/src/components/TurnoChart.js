// src/components/TurnoChart.js
import React, { useMemo, useRef } from 'react';
import { Bar, getElementAtEvent } from 'react-chartjs-2';

const TurnoChart = ({ data, options, loading, onSelect, selected }) => {
  const chartRef = useRef(null);

  const clickHint = useMemo(() => {
    if (!onSelect) return null;
    if (selected) return `Filtro: ${selected} (clique para remover)`;
    return 'Clique em uma barra para filtrar';
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
      <Bar ref={chartRef} data={data} options={options} onClick={handleClick} />
    </div>
  );
};

export default TurnoChart;