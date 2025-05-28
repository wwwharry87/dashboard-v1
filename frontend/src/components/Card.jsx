import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { FaArrowUp, FaArrowDown } from 'react-icons/fa';

// Função para formatar números
const formatNumber = (num) =>
  num === null || num === undefined || num === "Erro"
    ? num
    : Number(num).toLocaleString("pt-BR");

// Função para obter cor do ícone baseado na borda
const getIconColorFromBorder = (borderClass) => {
  const mapping = {
    "border-blue-500": "#3B82F6",
    "border-green-500": "#10B981",
    "border-purple-500": "#8B5CF6",
    "border-yellow-500": "#FBBF24",
    "border-red-500": "#EF4444",
    "border-black": "#000000",
  };
  return mapping[borderClass] || "#000000";
};

// Componente de skeleton para o card
const CardSkeleton = ({ borderColor }) => (
  <motion.div
    initial={{ opacity: 0.7 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
    className={`
      shadow-xl rounded-2xl p-4 text-center border-l-8 ${borderColor}
      h-32 flex flex-col items-center justify-center
      bg-white/70 backdrop-blur-md ring-1 ring-gray-200
    `}
    style={{ boxShadow: "0 6px 28px 0 rgba(140, 82, 255, 0.13)" }}
  >
    <div className="w-8 h-8 rounded-full bg-gray-300 mb-2"></div>
    <div className="h-4 w-24 bg-gray-300 rounded mb-2"></div>
    <div className="h-6 w-16 bg-gray-300 rounded"></div>
  </motion.div>
);

// Componente Card otimizado
const Card = ({ 
  label, 
  value, 
  icon, 
  borderColor, 
  comparativo, 
  disableFormat, 
  valueColor = "", 
  loading = false,
  isComparativo = false
}) => {
  // Se for o cartão de comparativo e não tiver dados ou estiver carregando, mostrar skeleton
  if (isComparativo && (loading || !value || value === "N/A")) {
    return <CardSkeleton borderColor={borderColor} />;
  }

  // Para outros cartões, se estiver carregando, mostrar skeleton
  if (loading) {
    return <CardSkeleton borderColor={borderColor} />;
  }

  const iconWithColor = React.cloneElement(icon, { 
    style: { color: getIconColorFromBorder(borderColor) } 
  });

  const renderComparativo = () => {
    if (comparativo && comparativo.diff != null) {
      return (
        <div className="flex items-center justify-center mt-1">
          {comparativo.arrow === "up" ? (
            <FaArrowUp className="mr-1" style={{ color: "green" }} />
          ) : (
            <FaArrowDown className="mr-1" style={{ color: "red" }} />
          )}
          <span style={{ color: comparativo.arrow === "up" ? "green" : "red", fontSize: "0.8rem" }}>
            {comparativo.diff}%
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`
        shadow-xl rounded-2xl p-4 text-center border-l-8 ${borderColor}
        h-32 flex flex-col items-center justify-center
        bg-white/70 backdrop-blur-md ring-1 ring-gray-200
        hover:shadow-2xl transition-all cursor-pointer select-none
        ${isComparativo ? 'hover:bg-gray-50' : ''}
      `}
      style={{ boxShadow: "0 6px 28px 0 rgba(140, 82, 255, 0.13)" }}
    >
      <div className="text-3xl mb-1">{iconWithColor}</div>
      <h3 className="text-md font-semibold text-gray-600">{label}</h3>
      <span 
        className={`text-xl font-bold max-[430px]:text-sm ${isComparativo ? 'mt-1' : ''}`} 
        style={{ color: valueColor || (isComparativo ? '#4B5563' : '') }}
      >
        {disableFormat ? value : formatNumber(value)}
      </span>
      {renderComparativo()}
    </motion.div>
  );
};

export default memo(Card);
