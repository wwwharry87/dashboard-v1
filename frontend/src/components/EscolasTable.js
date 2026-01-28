// components/EscolasTable.js - VERSÃO SEM SCROLL HORIZONTAL
import React from "react";
import { FaSchool, FaUsers, FaDoorOpen, FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";
import { formatNumber } from '../utils/formatters';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getSchoolStatus(escola) {
  const vagas = Number(escola.vagas_disponiveis);
  if (Number.isFinite(vagas) && vagas < 0) return 'LOTADA';
  if (Number.isFinite(vagas) && vagas > 0) return 'VAGAS';
  return 'CHEIA';
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
      <div className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
        <span>Com vagas</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />
        <span>Cheia</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
        <span>Lotada</span>
      </div>
      <span className="text-gray-400">•</span>
      <span className="text-gray-500">A barra mostra a ocupação (matrículas ÷ capacidade)</span>
    </div>
  );
}

function OccupancyBar({ matriculas, capacidade, status }) {
  const m = Number(matriculas) || 0;
  const c = Number(capacidade) || 0;
  const pct = c > 0 ? (m * 100) / c : 0;
  const pctClamped = clamp(pct, 0, 100);

  const barColor =
    status === 'LOTADA' ? 'bg-red-500' : status === 'VAGAS' ? 'bg-green-500' : 'bg-yellow-500';

  return (
    <div className="mt-1" title={c > 0 ? `${pct.toFixed(1).replace('.', ',')}% ocupado` : 'Capacidade não informada'}>
      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-2 ${barColor}`} style={{ width: `${pctClamped}%` }} />
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">{c > 0 ? `${Math.round(pct)}%` : '—'}</div>
    </div>
  );
}

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
    <div className="w-full">
      {/* Legenda compacta */}
      <div className="hidden md:block px-2 py-2 bg-white border-b border-gray-200">
        <StatusLegend />
      </div>

      {/* Tabela para desktop */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left p-2 font-semibold text-gray-700 w-2/5 text-xs">
                <div className="flex items-center gap-1">
                  <FaSchool className="text-violet-500 text-xs" />
                  <span>Escola</span>
                </div>
              </th>
              
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
              const status = getSchoolStatus(escola);
              
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
                  
                  <td className="p-2 text-center text-xs">
                    <div className="font-bold text-green-600">
                      {formatNumber(escola.qtde_matriculas) || 0}
                    </div>
                  </td>
                  
                  <td className="p-2 text-center text-xs">
                    <div className="font-semibold text-gray-700">
                      {formatNumber(escola.capacidade_total) || 0}
                    </div>
                  </td>
                  
                  <td className="p-2 text-center text-xs">
                    <div className={`font-bold ${
                      isOverCapacity 
                        ? "text-red-600" 
                        : hasVacancies 
                          ? "text-green-600" 
                          : "text-yellow-600"
                    }`}>
                      {isOverCapacity ? (
                        <div className="flex flex-col items-center">
                          <span className="text-red-600 font-bold">+{formatNumber(Math.abs(escola.vagas_disponiveis))}</span>
                          <span className="text-[9px] text-red-500">acima</span>
                        </div>
                      ) : (
                        formatNumber(escola.vagas_disponiveis) || 0
                      )}
                    </div>

                    {/* Barra de ocupação (visual rápido) */}
                    <OccupancyBar
                      matriculas={escola.qtde_matriculas}
                      capacidade={escola.capacidade_total}
                      status={status}
                    />
                  </td>
                  
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
      </div>

      {/* Lista para mobile - SEM SCROLL HORIZONTAL */}
      <div className="md:hidden space-y-2 p-2">
        {escolas.map((escola, index) => {
          const isSelected = selectedSchool && selectedSchool.idescola === escola.idescola;
          const hasVacancies = escola.vagas_disponiveis > 0;
          const isOverCapacity = escola.vagas_disponiveis < 0;
          const ocupacaoPercent = escola.capacidade_total > 0 
            ? Math.round((escola.qtde_matriculas / escola.capacidade_total) * 100)
            : 0;
          const status = getSchoolStatus(escola);

          return (
            <div
              key={escola.idescola || index}
              className={`rounded-lg border-2 p-3 cursor-pointer transition-all duration-200 ${
                isSelected
                  ? "border-violet-500 bg-violet-50"
                  : isOverCapacity
                    ? "bg-red-50 border-red-300 hover:border-red-400 hover:bg-red-100"
                    : hasVacancies
                      ? "bg-green-50 border-green-300 hover:border-green-400 hover:bg-green-100"
                      : "bg-yellow-50 border-yellow-300 hover:border-yellow-400 hover:bg-yellow-100"
              }`}
              onClick={() => handleSchoolClick(escola)}
            >
              {/* Cabeçalho da escola */}
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 text-sm truncate" title={escola.escola}>
                    {escola.escola}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      escola.zona_escola === 'URBANA' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {escola.zona_escola || "N/I"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {escola.qtde_turmas || 0} turmas
                    </span>
                  </div>
                </div>
                
                {/* Status badge */}
                <div className="flex-shrink-0 ml-2">
                  {isOverCapacity ? (
                    <div className="flex items-center gap-1 bg-red-100 text-red-800 px-2 py-1 rounded-full">
                      <FaExclamationTriangle className="text-xs" />
                      <span className="text-xs font-semibold">Lotada</span>
                    </div>
                  ) : hasVacancies ? (
                    <div className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      <FaCheckCircle className="text-xs" />
                      <span className="text-xs font-semibold">Vagas</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                      <FaCheckCircle className="text-xs" />
                      <span className="text-xs font-semibold">Cheia</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Métricas em grid compacto */}
              <div className="grid grid-cols-3 gap-3 text-center">
                {/* Matrículas */}
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="flex flex-col items-center">
                    <FaUsers className="text-green-500 text-sm mb-1" />
                    <span className="text-xs text-gray-600">Matrículas</span>
                    <span className="font-bold text-green-600 text-sm">
                      {formatNumber(escola.qtde_matriculas) || 0}
                    </span>
                  </div>
                </div>

                {/* Capacidade */}
                <div className="bg-blue-50 rounded-lg p-2">
                  <div className="flex flex-col items-center">
                    <FaDoorOpen className="text-blue-500 text-sm mb-1" />
                    <span className="text-xs text-gray-600">Capacidade</span>
                    <span className="font-bold text-blue-600 text-sm">
                      {formatNumber(escola.capacidade_total) || 0}
                    </span>
                  </div>
                </div>

                {/* Vagas */}
                <div className={`rounded-lg p-2 ${
                  isOverCapacity 
                    ? "bg-red-50" 
                    : hasVacancies 
                      ? "bg-green-50" 
                      : "bg-yellow-50"
                }`}>
                  <div className="flex flex-col items-center">
                    <span className="text-xs text-gray-600">Vagas</span>
                    <span className={`font-bold text-sm ${
                      isOverCapacity 
                        ? "text-red-600" 
                        : hasVacancies 
                          ? "text-green-600" 
                          : "text-yellow-600"
                    }`}>
                      {isOverCapacity ? (
                        <div className="flex flex-col items-center">
                          <span>+{formatNumber(Math.abs(escola.vagas_disponiveis))}</span>
                          <span className="text-[9px] text-red-500">acima</span>
                        </div>
                      ) : (
                        formatNumber(escola.vagas_disponiveis) || 0
                      )}
                    </span>
                    <span className="text-[10px] text-gray-500 mt-1">
                      {ocupacaoPercent}% ocupado
                    </span>

                    {/* Barra de ocupação no mobile */}
                    <div className="w-full mt-2">
                      <OccupancyBar
                        matriculas={escola.qtde_matriculas}
                        capacidade={escola.capacidade_total}
                        status={status}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* A barra de ocupação já é mostrada dentro do bloco de Vagas (mais compacto). */}
            </div>
          );
        })}
      </div>
      
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