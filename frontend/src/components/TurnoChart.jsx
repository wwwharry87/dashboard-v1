import React, { memo } from 'react';
import { Bar } from 'react-chartjs-2';

// Componente de gráfico de turno otimizado
const TurnoChart = ({ data, options, loading }) => {
  if (loading) {
    return (
      <div className="animate-pulse flex flex-col h-full">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="flex-1 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <Bar
      data={data}
      options={options}
    />
  );
};

export default memo(TurnoChart);
