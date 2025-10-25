// components/EscolasTable.js
import React from "react";
import { FaSchool, FaUsers, FaDoorOpen, FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

const EscolasTable = ({ escolas, searchTerm, selectedSchool, handleSchoolClick, loading }) => {
  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex mb-4 space-x-4">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/6"></div>
              <div className="h-4 bg-gray-200 rounded w-1/6"></div>
              <div className="h-4 bg-gray-200 rounded w-1/6"></div>
              <div className="h-4 bg-gray-200 rounded w-1/6"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="text-left p-3 font-semibold text-gray-700 min-w-[200px] text-xs md:text-sm">
              <div className="flex items-center gap-2">
                <FaSchool className="text-violet-500" />
                Escola
              </div>
            </th>
            <th className="text-left p-3 font-semibold text-gray-700 whitespace-nowrap text-xs md:text-sm hidden sm:table-cell">
              <div className="flex items-center gap-2">
                <FaDoorOpen className="text-blue-500" />
                Turmas
              </div>
            </th>
            <th className="text-left p-3 font-semibold text-gray-700 whitespace-nowrap text-xs md:text-sm">
              <div className="flex items-center gap-2">
                <FaUsers className="text-green-500" />
                Matrículas
              </div>
            </th>
            <th className="text-left p-3 font-semibold text-gray-700 whitespace-nowrap text-xs md:text-sm hidden md:table-cell">
              Capacidade
            </th>
            <th className="text-left p-3 font-semibold text-gray-700 whitespace-nowrap text-xs md:text-sm">
              Vagas
            </th>
            <th className="text-left p-3 font-semibold text-gray-700 whitespace-nowrap text-xs md:text-sm">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {escolas.map((escola, index) => {
            const isSelected = selectedSchool && selectedSchool.idescola === escola.idescola;
            const hasVacancies = escola.vagas_disponiveis > 0;
            const isOverCapacity = escola.vagas_disponiveis < 0;
            
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
                <td className="p-3 text-xs md:text-sm">
                  <div className="font-semibold text-gray-800 truncate max-w-[180px] md:max-w-none">
                    {escola.escola}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {escola.zona_escola || "NÃO INFORMADO"}
                  </div>
                </td>
                <td className="p-3 text-xs md:text-sm hidden sm:table-cell">
                  <div className="font-bold text-blue-600">
                    {escola.qtde_turmas || 0}
                  </div>
                </td>
                <td className="p-3 text-xs md:text-sm">
                  <div className="font-bold text-green-600">
                    {escola.qtde_matriculas?.toLocaleString('pt-BR') || 0}
                  </div>
                </td>
                <td className="p-3 text-xs md:text-sm hidden md:table-cell">
                  <div className="font-semibold text-gray-700">
                    {escola.capacidade_total?.toLocaleString('pt-BR') || 0}
                  </div>
                </td>
                <td className="p-3 text-xs md:text-sm">
                  <div className={`font-bold ${
                    isOverCapacity 
                      ? "text-red-600" 
                      : hasVacancies 
                        ? "text-green-600" 
                        : "text-yellow-600"
                  }`}>
                    {escola.vagas_disponiveis?.toLocaleString('pt-BR') || 0}
                  </div>
                </td>
                <td className="p-3 text-xs md:text-sm">
                  <div className="flex items-center gap-1">
                    {isOverCapacity ? (
                      <>
                        <FaExclamationTriangle className="text-red-500 text-xs" />
                        <span className="text-red-600 font-semibold">Lotada</span>
                      </>
                    ) : hasVacancies ? (
                      <>
                        <FaCheckCircle className="text-green-500 text-xs" />
                        <span className="text-green-600 font-semibold">Vagas</span>
                      </>
                    ) : (
                      <>
                        <FaCheckCircle className="text-yellow-500 text-xs" />
                        <span className="text-yellow-600 font-semibold">Cheia</span>
                      </>
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
          <p>Nenhuma escola encontrada</p>
          {searchTerm && (
            <p className="text-sm">Tente alterar o termo de busca</p>
          )}
        </div>
      )}
    </div>
  );
};

export default EscolasTable;