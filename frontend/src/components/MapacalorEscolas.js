// src/components/MapaCalorEscolas.js
import React from 'react';

const MapaCalorEscolas = ({ escolas, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 bg-gray-50 rounded-lg flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🗺️</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Mapa de Calor</h3>
          <p className="text-gray-600 max-w-md">
            Visualização geográfica das escolas em {escolas.length} localidades.
            Funcionalidade em desenvolvimento.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="font-bold text-blue-700">{escolas.length}</div>
              <div className="text-blue-600">Escolas</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="font-bold text-green-700">
                {escolas.reduce((acc, escola) => acc + (escola.qtde_matriculas || 0), 0).toLocaleString()}
              </div>
              <div className="text-green-600">Matrículas</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MapaCalorEscolas;