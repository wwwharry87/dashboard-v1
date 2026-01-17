import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Cache simples em memoria (por sessao).
 * key -> { ts, data }
 */
const cache = new Map();

/**
 * Gera uma chave de cache estavel.
 * @param {string} url
 * @param {RequestInit | undefined} options
 */
function cacheKey(url, options) {
  const method = (options?.method || 'GET').toUpperCase();
  // Nao colocamos headers no cacheKey para evitar vazamento e chaves enormes.
  const body = typeof options?.body === 'string' ? options.body : '';
  return `${method}::${url}::${body}`;
}

/**
 * Hook de fetch com:
 * - loading/error/data
 * - cache em memoria (staleTime)
 * - cancelamento via AbortController
 *
 * @template T
 * @param {string | null} url
 * @param {{
 *   options?: RequestInit,
 *   enabled?: boolean,
 *   staleTimeMs?: number,
 *   initialData?: T | null,
 *   transform?: (raw: any) => T
 * }} [config]
 */
export function useFetch(url, config = {}) {
  const {
    options,
    enabled = true,
    staleTimeMs = 30_000,
    initialData = null,
    transform,
  } = config;

  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(url && enabled));

  const abortRef = useRef(null);

  const key = useMemo(() => (url ? cacheKey(url, options) : null), [url, options]);

  const fetchNow = useCallback(async () => {
    if (!url || !enabled) return;

    // Cache hit
    if (key && cache.has(key)) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.ts < staleTimeMs) {
        setData(hit.data);
        setError(null);
        setLoading(false);
        return;
      }
    }

    // Cancela request anterior
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
      }

      const raw = await res.json().catch(() => null);
      const finalData = transform ? transform(raw) : raw;

      setData(finalData);
      if (key) cache.set(key, { ts: Date.now(), data: finalData });
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [url, enabled, key, options, staleTimeMs, transform]);

  useEffect(() => {
    fetchNow();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchNow]);

  const refetch = useCallback(() => {
    if (key) cache.delete(key);
    return fetchNow();
  }, [fetchNow, key]);

  return {
    data,
    error,
    loading,
    refetch,
    hasData: data !== null && data !== undefined,
  };
}

export function clearFetchCache() {
  cache.clear();
}
