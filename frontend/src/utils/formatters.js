/**
 * @fileoverview Funcoes de formatacao padronizadas do projeto.
 *
 * Objetivo:
 * - Evitar duplicacao de formatadores (performance + consistencia)
 * - Centralizar regras de formatacao (pt-BR)
 *
 * Observacao:
 * - As funcoes sao tolerantes a entradas invalidas (null/undefined/NaN/string)
 * - Nao lancam erro; retornam strings seguras para UI.
 */

/**
 * Converte qualquer entrada em um numero finito.
 *
 * @param {unknown} value Valor de entrada (numero, string, null, etc.).
 * @param {number} [fallback=0] Valor padrao quando nao for possivel converter.
 * @returns {number} Numero finito.
 */
function toFiniteNumber(value, fallback = 0) {
  try {
    if (value === null || value === undefined) return fallback;

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : fallback;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return fallback;

      // Tenta lidar com formatos comuns: "1.234" (pt) e "1,23".
      // Regra simples: remove pontos de milhar e troca virgula por ponto.
      const normalized = raw.replace(/\./g, '').replace(',', '.');
      const n = Number(normalized);
      return Number.isFinite(n) ? n : fallback;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

// Intl.NumberFormat e relativamente pesado para recriar. Mantemos uma instancia memoizada.
const numberFormatterPtBR = new Intl.NumberFormat('pt-BR');

/**
 * Formata numeros para pt-BR.
 *
 * @param {unknown} num
 * @returns {string} Ex.: "1.234" (pt-BR)
 */
export function formatNumber(num) {
  const n = toFiniteNumber(num, 0);
  try {
    return numberFormatterPtBR.format(n);
  } catch {
    return '0';
  }
}

/**
 * Formata um valor percentual com 2 casas decimais (pt-BR).
 *
 * @param {unknown} value
 * @returns {string} Ex.: "12,34" (sem o simbolo %)
 */
export function formatPercent(value) {
  const n = toFiniteNumber(value, 0);
  try {
    // Mantem duas casas decimais e troca ponto por virgula.
    return n.toFixed(2).replace('.', ',');
  } catch {
    return '0,00';
  }
}

/**
 * Formata CPF. Aceita string com ou sem pontuacao.
 *
 * @param {unknown} cpf
 * @returns {string} Ex.: "123.456.789-09". Se invalido, retorna somente digitos (ou "").
 */
export function formatCPF(cpf) {
  try {
    const digits = String(cpf ?? '')
      .replace(/\D/g, '')
      .slice(0, 11);

    if (digits.length !== 11) return digits;

    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } catch {
    return '';
  }
}

export default {
  formatNumber,
  formatPercent,
  formatCPF,
};
