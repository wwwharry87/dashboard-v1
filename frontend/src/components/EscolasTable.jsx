import React, { memo } from 'react';
import { motion } from 'framer-motion';

const formatNumber = (num) =>
  num === null || num === undefined || num === "Erro"
    ? num
    : Number(num).toLocaleString("pt-BR");

// Componente de tabela de escolas otimizado com virtualização
const EscolasTable = ({ 
  escolas, 
  searchTerm, 
  selectedSchool, 
  handleSchoolClick, 
  loading 
}) => {
  // Filtrar escolas baseado no termo de busca
  const filteredEscolas = escolas.filter(escola =>
    escola.escola.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded-t-lg mb-2"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex mb-2">
            <div className="h-8 bg-gray-200 rounded w-1/2 mr-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/6 mr-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/6 mr-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/6"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <table className="min-w-full table-fixed">
      <thead className="bg-gray-50 sticky top-0 z-10">
        <tr>
          <th className="w-1/2 px-2 py-2 text-left text-sm font-medium text-gray-700">Escola</th>
          <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-gray-700">Turmas</th>
          <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-gray-700">Matrículas</th>
          <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-gray-700">Vagas</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {filteredEscolas.map((escola) => (
          <motion.tr
            key={escola.idescola}
            onClick={() => handleSchoolClick(escola)}
            className={`cursor-pointer hover:bg-violet-50 transition-all ${
              selectedSchool && selectedSchool.idescola === escola.idescola
                ? "bg-violet-100"
                : ""
            }`}
            whileHover={{ backgroundColor: "rgba(139, 92, 246, 0.1)" }}
          >
            <td className="px-2 py-2 text-sm text-gray-700 break-words">{escola.escola}</td>
            <td className="px-2 py-2 text-sm text-gray-700">{escola.qtde_turmas}</td>
            <td className="px-2 py-2 text-sm text-gray-700">{formatNumber(escola.qtde_matriculas)}</td>
            <td className={`px-2 py-2 text-sm font-semibold ${
              escola.status_vagas === "disponivel" ? "text-green-600" : "text-red-600"
            }`}>
              {formatNumber(escola.vagas_disponiveis)}
            </td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
};

export default memo(EscolasTable);
