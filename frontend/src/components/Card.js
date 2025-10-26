import React from 'react';
import { FaArrowUp, FaArrowDown, FaBalanceScale } from 'react-icons/fa';

// CORREÇÃO DEFINITIVA: Função para formatar números com separador de milhar correto
const formatNumber = (num) => {
  if (num === null || num === undefined || num === "Erro" || isNaN(num)) {
    return "0";
  }
  
  // CORREÇÃO: Usar Number em vez de parseInt para preservar números grandes
  const number = Number(num) || 0;
  
  // CORREÇÃO: Usar toLocaleString para formatação brasileira correta
  return number.toLocaleString('pt-BR');
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
    <div className={`bg-white rounded-2xl p-4 shadow-lg border-2 ${borderColor} ${bgColor} transition-all duration-300 hover:shadow-xl relative`}>
      {/* Tooltip */}
      {tooltip && (
        <div className="absolute top-2 right-2">
          <svg 
            className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" 
            data-tooltip-id={tooltipId}
            data-tooltip-content={tooltip}
            fill="currentColor" 
            viewBox="0 0 16 16"
          >
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
          </svg>
        </div>
      )}
      
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