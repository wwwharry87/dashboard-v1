import React, { useMemo } from 'react';

// Função auxiliar para ordenar opções de Sim/Não
const reorderYesNo = (options) => {
  if (!options) return [];
  const opts = options.map((o) => String(o));
  if (opts.length === 2) {
    const lower = opts.map((o) => o.toLowerCase());
    if (lower.includes("sim") && lower.includes("não")) {
      return opts.sort((a, b) => (a.toLowerCase() === "sim" ? -1 : 1));
    }
  }
  return opts;
};

// Função para preservar a ordem original de certos tipos de filtros
const preserveOriginalOrder = (name, options) => {
  if (!options) return [];
  
  // Preservar ordem original para filtros específicos
  if (name === "tipoMatricula" || name === "situacaoMatricula" || name === "etapaMatricula") {
    return options;
  }
  
  // Para outros filtros, aplicar ordenação padrão
  if (name === "transporteEscolar" || name === "deficiencia" || name === "multisserie") {
    return reorderYesNo(options);
  }
  
  // Ordenação alfabética para os demais filtros
  return [...options].sort();
};

const FilterSelect = ({ label, name, options, disabled = false, value, onChange }) => {
  // Usar useMemo para evitar recálculos desnecessários
  const orderedOptions = useMemo(() => 
    preserveOriginalOrder(name, options), 
    [name, options]
  );
  
  return (
    <label className="block mt-2">
      <span className="text-sm font-medium text-gray-700">{label}:</span>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-violet-500"
      >
        <option value="">Todos</option>
        {orderedOptions?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
};

export default React.memo(FilterSelect);
