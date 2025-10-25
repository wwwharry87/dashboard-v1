// src/components/SexoChart.js
import React from 'react';
import { Pie } from 'react-chartjs-2';

const SexoChart = ({ data, options, loading }) => {
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

  return <Pie data={data} options={options} />;
};

export default SexoChart;