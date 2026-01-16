import React from 'react';

// Cache em memória (por aba). Para persistência, use IndexedDB/localStorage se necessário.
const CACHE = new Map();

/**
 * @typedef {{
 *  ttlMs?: number,
 *  enabled?: boolean,
 *  cacheKey?: string,
 *  headers?: Record<string,string>,
 *  method?: string,
 *  body?: any,
 *  parseJson?: boolean,
 *  fetcher?: (url:string, init:RequestInit)=>Promise<any>
 * }} UseFetchOptions
 */

/**
 * Hook de requisição com cache integrado.
 *
 * @param {string} url
 * @param {UseFetchOptions} [options]
 * @returns {{ data:any, error:any, loading:boolean, refetch: ()=>Promise<void>, clearCache: ()=>void }}
 */
export function useFetch(url, options = {}) {
  const {
    ttlMs = 30_000,
    enabled = true,
    cacheKey,
    headers,
    method = 'GET',
    body,
    parseJson = true,
    fetcher,
  } = options;

  const key = React.useMemo(() => {
    if (cacheKey) return cacheKey;
    // Uma assinatura simples (funciona bem para GETs). Para POST, prefira setar cacheKey manual.
    const bodySig = body ? JSON.stringify(body) : '';
    return `${method}::${url}::${bodySig}`;
  }, [cacheKey, method, url, body]);

  const [state, setState] = React.useState(() => {
    const hit = CACHE.get(key);
    if (hit && Date.now() - hit.ts < ttlMs) {
      return { data: hit.data, error: null, loading: false };
    }
    return { data: null, error: null, loading: Boolean(enabled) };
  });

  const clearCache = React.useCallback(() => {
    CACHE.delete(key);
  }, [key]);

  const doFetch = React.useCallback(async () => {
    if (!enabled || !url) return;

    // verifica cache
    const hit = CACHE.get(key);
    if (hit && Date.now() - hit.ts < ttlMs) {
      setState({ data: hit.data, error: null, loading: false });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    const controller = new AbortController();
    const init = {
      method,
      headers: {
        ...(parseJson ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {}),
      },
      signal: controller.signal,
      body: body && method !== 'GET' ? (parseJson ? JSON.stringify(body) : body) : undefined,
    };

    try {
      const data = fetcher
        ? await fetcher(url, init)
        : await defaultFetcher(url, init, parseJson);

      CACHE.set(key, { ts: Date.now(), data });
      setState({ data, error: null, loading: false });
    } catch (error) {
      // ignora abort
      if (error?.name === 'AbortError') return;
      setState({ data: null, error, loading: false });
    }

    return () => controller.abort();
  }, [enabled, url, key, ttlMs, method, headers, body, parseJson, fetcher]);

  React.useEffect(() => {
    doFetch();
  }, [doFetch]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    refetch: async () => {
      CACHE.delete(key);
      await doFetch();
    },
    clearCache,
  };
}

async function defaultFetcher(url, init, parseJson) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return parseJson ? await res.json() : await res.text();
}

export default useFetch;
