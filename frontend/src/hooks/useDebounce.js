import { useEffect, useState } from 'react';

/**
 * Hook para "debounce" de valores (ex.: campo de busca).
 *
 * @template T
 * @param {T} value Valor de entrada.
 * @param {number} [delayMs=300] Atraso em milissegundos.
 * @returns {T} Valor debounced.
 */
export function useDebounce(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
