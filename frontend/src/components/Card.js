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
  additionalContent
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
    return "text-gray-800";
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-2xl p-4 shadow-lg border-2 ${borderColor} ${bgColor} animate-pulse`}>
        <div className="flex justify-between items-start mb-2">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-6 bg-gray-200 rounded w-6"></div>
        </div>
        <div className="h-8 bg-gray-200 rounded mb-2"></div>
        <div className="h-4 bg-gray-100 rounded w-3/4"></div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-lg border-2 ${borderColor} ${bgColor} transition-all duration-300 hover:shadow-xl`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-sm font-semibold text-gray-600">{label}</span>
        <div className="text-2xl opacity-80">
          {icon}
        </div>
      </div>
      
      <div className={`text-2xl font-bold mb-1 ${getValueColorClass()}`}>
        {disableFormat ? value : formatNumber(value)}
      </div>
      
      {comparativo && (
        <div className="flex items-center gap-1 text-xs text-gray-600">
          {getTrendIcon()}
          <span>
            {comparativo.missing > 0 ? '+' : ''}{formatNumber(comparativo.missing)} ({formatPercent(comparativo.percent)}%)
          </span>
        </div>
      )}
      
      {isComparativo && comparativo && (
        <div className="text-xs text-gray-500 mt-1">
          vs. ano anterior
        </div>
      )}
      
      {additionalContent}
    </div>
  );
};

export default Card;