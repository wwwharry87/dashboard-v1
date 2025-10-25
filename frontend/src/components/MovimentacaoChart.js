// components/MovimentacaoChart.js
import React from 'react';
import { Bar } from 'react-chartjs-2';

const MovimentacaoChart = ({ data, options, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Carregando movimentação...</p>
        </div>
      </div>
    );
  }

  if (!data || !data.labels || data.labels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <p>Nenhum dado de movimentação disponível</p>
          <p className="text-sm">Não há dados de entradas e saídas para o período selecionado</p>
        </div>
      </div>
    );
  }

  const chartOptions = {
    ...options,
    plugins: {
      ...options.plugins,
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('pt-BR').format(context.parsed.y);
            }
            return label;
          }
        }
      }
    }
  };

  return (
    <div className="w-full h-full">
      <Bar data={data} options={chartOptions} />
    </div>
  );
};

export default MovimentacaoChart;