/**
 * Utilitários de formatação (pt-BR) para reutilizar no dashboard.
 *
 * - Robusto: retorna fallback em dados inválidos.
 * - Centraliza formatNumber/formatPercent para evitar duplicação.
 */

/**
 * Converte valores comuns (number/string pt-BR) em número finito.
 *
 * Aceita strings como:
 * - "1234" / "1234.56"
 * - "1.234,56" (pt-BR)
 * - "R$ 1.234,56"
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toFiniteNumber(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  if (typeof value === 'string') {
    let s = value.trim();
    if (!s) return null;

    // Normaliza espaços e remove símbolo monetário comum
    s = s.replace(/\u00A0/g, ' ');
    s = s.replace(/R\$/g, '');
    s = s.replace(/\s/g, '');

    // Se vier no padrão pt-BR ("1.234,56") converte para "1234.56"
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else if (s.includes(',') && !s.includes('.')) {
      // Ex.: "12,5" => "12.5"
      s = s.replace(/,/g, '.');
    }

    // Mantém só caracteres relevantes para Number()
    s = s.replace(/[^0-9.-]/g, '');

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

const formatterCache = new Map();

/**
 * Retorna (e memoiza) um Intl.NumberFormat.
 * @param {number|undefined} minFD
 * @param {number|undefined} maxFD
 */
function getFormatter(minFD, maxFD) {
  const key = `${minFD ?? ''}|${maxFD ?? ''}`;
  if (formatterCache.has(key)) return formatterCache.get(key);

  let fmt;
  try {
    fmt = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: minFD,
      maximumFractionDigits: maxFD,
    });
  } catch {
    fmt = new Intl.NumberFormat('pt-BR');
  }

  formatterCache.set(key, fmt);
  return fmt;
}

/**
 * Formata número para pt-BR.
 *
 * @example
 * formatNumber(1234) // "1.234"
 * formatNumber(1234.5, { maximumFractionDigits: 2 }) // "1.234,5"
 *
 * @param {unknown} num
 * @param {{ minimumFractionDigits?: number, maximumFractionDigits?: number, fallback?: string }} [options]
 * @returns {string}
 */
export function formatNumber(num, options = {}) {
  const n = toFiniteNumber(num);
  if (n === null) return options.fallback ?? '—';

  const fmt = getFormatter(options.minimumFractionDigits, options.maximumFractionDigits);
  try {
    return fmt.format(n);
  } catch {
    return String(n);
  }
}

/**
 * Formata percentual com 2 casas decimais.
 *
 * Heurística de entrada:
 * - Se |value| <= 1, considera "razão" (0.45 => 45%).
 * - Se |value| > 1, considera valor já em porcentagem (45 => 45%).
 *
 * @example
 * formatPercent(0.1234) // "12,34%"
 * formatPercent(12.3456) // "12,35%"
 *
 * @param {unknown} value
 * @param {{ fallback?: string }} [options]
 * @returns {string}
 */
export function formatPercent(value, options = {}) {
  const n = toFiniteNumber(value);
  if (n === null) return options.fallback ?? '—';

  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  const fmt = getFormatter(2, 2);
  return `${fmt.format(pct)}%`;
}

/**
 * Formata CPF (###.###.###-##).
 *
 * @example
 * formatCPF('12345678901') // "123.456.789-01"
 *
 * @param {unknown} cpf
 * @param {{ fallback?: string }} [options]
 * @returns {string}
 */
export function formatCPF(cpf, options = {}) {
  const digits = cpf === null || cpf === undefined ? '' : String(cpf).replace(/\D/g, '');
  if (digits.length !== 11) return options.fallback ?? (digits || '—');

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default { formatNumber, formatPercent, formatCPF };
