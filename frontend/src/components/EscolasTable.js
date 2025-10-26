// components/EscolasTable.js - VERSÃO OTIMIZADA
import React from "react";
import { FaSchool, FaUsers, FaDoorOpen, FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

// Função de formatação corrigida
const formatNumber = (num) => {
  if (num === null || num === undefined || num === "Erro" || isNaN(num)) {
    return "0";
  }
  const number = parseInt(num) || 0;
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const EscolasTable = ({ escolas, searchTerm, selectedSchool, handleSchoolClick, loading }) => {
  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex mb-4 space-x-4">
              <div className="h-4 bg-gray-200 rounded w-2/5"></div>
              <div className="h-4 bg-gray-200 rounded w-1/5"></div>
              <div className="h-4 bg-gray-200 rounded w-1/5"></div>
              <div className="h-4 bg-gray-200 rounded w-1/5"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-full">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {/* Escola - Mantido como coluna principal mas mais compacto */}
            <th className="text-left p-2 font-semibold text-gray-700 w-2/5 text-xs">
              <div className="flex items-center gap-1">
                <FaSchool className="text-violet-500 text-xs" />
                <span>Escola</span>
              </div>
            </th>
            
            {/* Informações compactas em colunas menores */}
            <th className="text-center p-2 font-semibold text-gray-700 w-1/6 text-xs">
              <div className="flex flex-col items-center gap-0">
                <FaUsers className="text-green-500 text-xs" />
                <span>Matrículas</span>
              </div>
            </th>
            
            <th className="text-center p-2 font-semibold text-gray-700 w-1/6 text-xs">
              <div className="flex flex-col items-center gap-0">
                <FaDoorOpen className="text-blue-500 text-xs" />
                <span>Capacidade</span>
              </div>
            </th>
            
            <th className="text-center p-2 font-semibold text-gray-700 w-1/6 text-xs">
              <div className="flex flex-col items-center gap-0">
                <span>Vagas</span>
              </div>
            </th>
            
            <th className="text-center p-2 font-semibold text-gray-700 w-1/6 text-xs">
              <div className="flex flex-col items-center gap-0">
                <span>Status</span>
              </div>
            </th>
          </tr>
        </thead>
        
        <tbody className="divide-y divide-gray-200">
          {escolas.map((escola, index) => {
            const isSelected = selectedSchool && selectedSchool.idescola === escola.idescola;
            const hasVacancies = escola.vagas_disponiveis > 0;
            const isOverCapacity = escola.vagas_disponiveis < 0;
            const isFull = escola.vagas_disponiveis === 0;
            
            return (
              <tr
                key={escola.idescola || index}
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-violet-100 border-l-4 border-l-violet-500"
                    : "hover:bg-gray-50"
                }`}
                onClick={() => handleSchoolClick(escola)}
              >
                {/* Coluna Escola - Mais compacta */}
                <td className="p-2 text-xs">
                  <div className="font-semibold text-gray-800 truncate" title={escola.escola}>
                    {escola.escola}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`text-[10px] px-1 py-0.5 rounded ${
                      escola.zona_escola === 'URBANA' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {escola.zona_escola || "N/I"}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {escola.qtde_turmas || 0} turmas
                    </span>
                  </div>
                </td>
                
                {/* Matrículas */}
                <td className="p-2 text-center text-xs">
                  <div className="font-bold text-green-600">
                    {formatNumber(escola.qtde_matriculas) || 0}
                  </div>
                </td>
                
                {/* Capacidade */}
                <td className="p-2 text-center text-xs">
                  <div className="font-semibold text-gray-700">
                    {formatNumber(escola.capacidade_total) || 0}
                  </div>
                </td>
                
                {/* Vagas */}
                <td className="p-2 text-center text-xs">
                  <div className={`font-bold ${
                    isOverCapacity 
                      ? "text-red-600" 
                      : hasVacancies 
                        ? "text-green-600" 
                        : "text-yellow-600"
                  }`}>
                    {formatNumber(escola.vagas_disponiveis) || 0}
                  </div>
                </td>
                
                {/* Status - Mais compacto */}
                <td className="p-2 text-center text-xs">
                  <div className="flex justify-center">
                    {isOverCapacity ? (
                      <div className="flex flex-col items-center" title="Lotada - acima da capacidade">
                        <FaExclamationTriangle className="text-red-500 text-xs" />
                        <span className="text-red-600 font-semibold text-[10px]">Lotada</span>
                      </div>
                    ) : hasVacancies ? (
                      <div className="flex flex-col items-center" title="Com vagas disponíveis">
                        <FaCheckCircle className="text-green-500 text-xs" />
                        <span className="text-green-600 font-semibold text-[10px]">Vagas</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center" title="Capacidade total">
                        <FaCheckCircle className="text-yellow-500 text-xs" />
                        <span className="text-yellow-600 font-semibold text-[10px]">Cheia</span>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {escolas.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          <FaSchool className="text-4xl text-gray-300 mx-auto mb-2" />
          <p className="text-sm">Nenhuma escola encontrada</p>
          {searchTerm && (
            <p className="text-xs text-gray-400 mt-1">Tente alterar o termo de busca</p>
          )}
        </div>
      )}
    </div>
  );
};

export default EscolasTable;