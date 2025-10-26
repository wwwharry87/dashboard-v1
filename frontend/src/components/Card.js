import React from 'react';
import { FaArrowUp, FaArrowDown, FaBalanceScale } from 'react-icons/fa';

// CORREÇÃO DEFINITIVA: Função para formatar números
const formatNumber = (num) => {
  if (num === null || num === undefined || num === "Erro" || isNaN(num)) {
    return "0";
  }
  
  // CORREÇÃO: Usar parseFloat para lidar com números decimais também
  const number = parseFloat(num) || 0;
  
  // CORREÇÃO: Usar Intl.NumberFormat para formatação confiável
  return new Intl.NumberFormat('pt-BR').format(number);
};

// CORREÇÃO: Função para formatar percentuais
const formatPercent = (value) => {
  if (value == null || value === "" || value === "Erro" || isNaN(value)) {
    return "0,00";
  }
  
  const number = parseFloat(value) || 0;
  return number.toFixed(2).replace('.', ',');
};

const Card = ({ 
  label, 
  value, 
  icon, 
  borderColor, 
  bgColor, 
  comparativo, 
  loading, 
  disableFormat = false,
  valueColor,
  isComparativo = false,
  additionalContent,
  tooltip,
  tooltipId
}) => {
  const getTrendIcon = () => {
    if (!comparativo) return null;
    
    const { arrow } = comparativo;
    if (arrow === "up") return <FaArrowUp className="text-green-500 text-sm" />;
    if (arrow === "down") return <FaArrowDown className="text-red-500 text-sm" />;
    return <FaBalanceScale className="text-gray-500 text-sm" />;
  };

  const getValueColorClass = () => {
    if (valueColor === "red") return "text-red-600";
    if (valueColor === "green") return "text-green-600";
    if (valueColor === "orange") return "text-orange-600";
    if (valueColor === "blue") return "text-blue-600";
    return "text-gray-800";
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-2 ${borderColor} ${bgColor} animate-pulse w-full`}>
        <div className="flex justify-between items-start mb-3">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-6 bg-gray-200 rounded w-6"></div>
        </div>
        <div className="h-8 bg-gray-200 rounded mb-3"></div>
        <div className="h-4 bg-gray-100 rounded w-3/4"></div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-2 ${borderColor} ${bgColor} transition-all duration-300 hover:shadow-xl w-full h-full flex flex-col`}>
      
      {/* Header do Card */}
      <div className="flex justify-between items-start mb-3 sm:mb-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm sm:text-base font-semibold text-gray-600 truncate">
            {label}
          </span>
          {tooltip && (
            <div className="flex-shrink-0" title={tooltip}>
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
        <div className="text-2xl sm:text-3xl opacity-80 flex-shrink-0 ml-2">
          {icon}
        </div>
      </div>
      
      {/* Valor Principal */}
      <div className={`text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 ${getValueColorClass()} truncate`}>
        {disableFormat ? value : formatNumber(value)}
      </div>
      
      {/* Conteúdo Comparativo */}
      <div className="flex-1">
        {comparativo && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 mb-2">
            {getTrendIcon()}
            <span className="truncate">
              {comparativo.missing > 0 ? '+' : ''}{formatNumber(comparativo.missing)} ({formatPercent(comparativo.percent)}%)
            </span>
          </div>
        )}
        
        {isComparativo && comparativo && (
          <div className="text-xs text-gray-500">
            vs. ano anterior
          </div>
        )}
        
        {/* Conteúdo Adicional - Compacto em mobile */}
        {additionalContent && (
          <div className="mt-3 sm:mt-4">
            {additionalContent}
          </div>
        )}
      </div>

      {/* Badge de Status para Valores Críticos (Mobile Only) */}
      {valueColor === "red" && (
        <div className="md:hidden mt-2">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <FaArrowUp className="mr-1" />
            Atenção
          </span>
        </div>
      )}
      
      {valueColor === "orange" && (
        <div className="md:hidden mt-2">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            <FaBalanceScale className="mr-1" />
            Moderado
          </span>
        </div>
      )}
    </div>
  );
};

export default Card;