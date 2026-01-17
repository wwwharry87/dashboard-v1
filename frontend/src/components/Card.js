import React from 'react';
import { FaArrowUp, FaArrowDown, FaBalanceScale } from 'react-icons/fa';
import { formatNumber } from '../utils/formatters';

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
    if (arrow === "up") return <FaArrowUp className="text-green-500 text-xs" />;
    if (arrow === "down") return <FaArrowDown className="text-red-500 text-xs" />;
    return <FaBalanceScale className="text-gray-500 text-xs" />;
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
      <div className={`bg-white rounded-xl p-3 shadow-md border ${borderColor} ${bgColor} animate-pulse w-full h-full min-h-[100px]`}>
        <div className="flex justify-between items-start mb-2">
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          <div className="h-5 bg-gray-200 rounded w-5"></div>
        </div>
        <div className="h-6 bg-gray-200 rounded mb-2"></div>
        <div className="h-3 bg-gray-100 rounded w-1/2"></div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl p-3 shadow-md border ${borderColor} ${bgColor} transition-all duration-200 hover:shadow-lg w-full h-full flex flex-col min-h-[100px]`}>
      
      {/* Header do Card - Compacto */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs font-semibold text-gray-600 truncate leading-tight">
            {label}
          </span>
        </div>
        <div className="text-lg opacity-80 flex-shrink-0 ml-1">
          {icon}
        </div>
      </div>
      
      {/* Valor Principal - Compacto */}
      <div className={`text-lg font-bold mb-1 ${getValueColorClass()} truncate leading-tight`}>
        {disableFormat ? value : formatNumber(value)}
      </div>
      
      {/* Conteúdo Comparativo - Compacto */}
      <div className="flex-1">
        {comparativo && (
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
            {getTrendIcon()}
            <span className="truncate leading-tight">
              {comparativo.missing > 0 ? '+' : ''}{formatNumber(comparativo.missing)}
            </span>
          </div>
        )}
        
        {isComparativo && comparativo && (
          <div className="text-[10px] text-gray-500 leading-tight">
            vs. anterior
          </div>
        )}
        
        {/* Conteúdo Adicional - Ultra Compacto */}
        {additionalContent && (
          <div className="mt-2">
            {additionalContent}
          </div>
        )}
      </div>

      {/* Badge de Status para Valores Críticos */}
      {valueColor === "red" && (
        <div className="mt-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
            <FaArrowUp className="mr-0.5" />
            Crítico
          </span>
        </div>
      )}
      
      {valueColor === "orange" && (
        <div className="mt-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800">
            <FaBalanceScale className="mr-0.5" />
            Moderado
          </span>
        </div>
      )}
    </div>
  );
};

export default Card;