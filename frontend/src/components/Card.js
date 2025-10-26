import React from 'react';
import { FaArrowUp, FaArrowDown, FaBalanceScale } from 'react-icons/fa';

// CORREÇÃO DEFINITIVA: Função para formatar números
const formatNumber = (num) => {
  if (num === null || num === undefined || num === "Erro" || isNaN(num)) {
    return "0";
  }
  
  const number = parseFloat(num) || 0;
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
    if (arrow === "up") return <FaArrowUp className="text-green-500 text-[10px]" />;
    if (arrow === "down") return <FaArrowDown className="text-red-500 text-[10px]" />;
    return <FaBalanceScale className="text-gray-500 text-[10px]" />;
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
      <div className={`bg-white rounded-xl p-3 shadow-md border ${borderColor} ${bgColor} animate-pulse w-full h-full min-h-[90px]`}>
        <div className="flex justify-between items-start mb-1">
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          <div className="h-4 bg-gray-200 rounded w-4"></div>
        </div>
        <div className="h-5 bg-gray-200 rounded mb-1"></div>
        <div className="h-2 bg-gray-100 rounded w-1/2"></div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl p-3 shadow-md border ${borderColor} ${bgColor} transition-all duration-200 hover:shadow-lg w-full h-full flex flex-col min-h-[90px]`}>
      
      {/* Header do Card - Ultra Compacto */}
      <div className="flex justify-between items-start mb-1">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs font-semibold text-gray-600 truncate leading-tight">
            {label}
          </span>
        </div>
        <div className="text-base opacity-80 flex-shrink-0 ml-1">
          {icon}
        </div>
      </div>
      
      {/* Valor Principal - Compacto */}
      <div className={`text-base font-bold mb-1 ${getValueColorClass()} truncate leading-tight`}>
        {disableFormat ? value : formatNumber(value)}
      </div>
      
      {/* Conteúdo Comparativo - Compacto */}
      <div className="flex-1">
        {comparativo && (
          <div className="flex items-center gap-1 text-[10px] text-gray-600 mb-0.5">
            {getTrendIcon()}
            <span className="truncate leading-tight">
              {comparativo.missing > 0 ? '+' : ''}{formatNumber(comparativo.missing)}
            </span>
          </div>
        )}
        
        {isComparativo && comparativo && (
          <div className="text-[9px] text-gray-500 leading-tight">
            vs. anterior
          </div>
        )}
        
        {/* Conteúdo Adicional - Ultra Compacto */}
        {additionalContent && (
          <div className="mt-1">
            {additionalContent}
          </div>
        )}
      </div>

      {/* Badge de Status para Valores Críticos - Mais Compacto */}
      {valueColor === "red" && (
        <div className="mt-0.5">
          <span className="inline-flex items-center px-1 py-0.5 rounded-full text-[9px] font-medium bg-red-100 text-red-800">
            <FaArrowUp className="mr-0.5" />
            Crítico
          </span>
        </div>
      )}
      
      {valueColor === "orange" && (
        <div className="mt-0.5">
          <span className="inline-flex items-center px-1 py-0.5 rounded-full text-[9px] font-medium bg-orange-100 text-orange-800">
            <FaBalanceScale className="mr-0.5" />
            Moderado
          </span>
        </div>
      )}
    </div>
  );
};

export default Card;