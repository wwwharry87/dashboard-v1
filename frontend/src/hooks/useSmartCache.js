import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook para cache inteligente com sincronização e detecção de atualizações
 * 
 * Funcionalidades:
 * - Persiste dados em localStorage
 * - Detecta mudanças no servidor
 * - Notifica quando há atualizações disponíveis
 * - Sincroniza dados entre abas
 */
export function useSmartCache(key, options = {}) {
  const {
    ttlMs = 5 * 60 * 1000, // 5 minutos por padrão
    onUpdateAvailable = null,
    checkInterval = 30 * 1000, // Verifica a cada 30 segundos
  } = options;

  const [cachedData, setCachedData] = useState(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const checkIntervalRef = useRef(null);
  const lastCheckRef = useRef(0);

  // Recuperar dados do cache
  const getFromCache = useCallback(() => {
    try {
      const item = localStorage.getItem(`cache_${key}`);
      if (!item) return null;

      const cached = JSON.parse(item);
      const now = Date.now();

      // Verifica se o cache expirou
      if (cached.timestamp && now - cached.timestamp > ttlMs) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }

      return cached.data;
    } catch (error) {
      console.error(`Erro ao recuperar cache ${key}:`, error);
      return null;
    }
  }, [key, ttlMs]);

  // Salvar dados no cache
  const saveToCache = useCallback((data) => {
    try {
      const cacheItem = {
        data,
        timestamp: Date.now(),
        hash: hashData(data),
      };
      localStorage.setItem(`cache_${key}`, JSON.stringify(cacheItem));
      setCachedData(data);
      setHasUpdate(false);
      return true;
    } catch (error) {
      console.error(`Erro ao salvar cache ${key}:`, error);
      return false;
    }
  }, [key]);

  // Verificar se há atualizações
  const checkForUpdates = useCallback(async (fetchFn) => {
    const now = Date.now();
    
    // Evita verificações muito frequentes
    if (now - lastCheckRef.current < 5000) {
      return;
    }

    lastCheckRef.current = now;
    setIsChecking(true);

    try {
      const newData = await fetchFn();
      const cached = getFromCache();

      if (cached && hashData(newData) !== hashData(cached)) {
        setHasUpdate(true);
        if (onUpdateAvailable) {
          onUpdateAvailable(newData);
        }
      }
    } catch (error) {
      console.warn('Erro ao verificar atualizações:', error);
    } finally {
      setIsChecking(false);
    }
  }, [getFromCache, onUpdateAvailable]);

  // Limpar cache
  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(`cache_${key}`);
      setCachedData(null);
      setHasUpdate(false);
    } catch (error) {
      console.error(`Erro ao limpar cache ${key}:`, error);
    }
  }, [key]);

  // Sincronizar entre abas
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === `cache_${key}` && event.newValue) {
        try {
          const cached = JSON.parse(event.newValue);
          setCachedData(cached.data);
          setHasUpdate(false);
        } catch (error) {
          console.error('Erro ao sincronizar cache entre abas:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  // Inicializar com dados do cache
  useEffect(() => {
    const data = getFromCache();
    if (data) {
      setCachedData(data);
    }
  }, [getFromCache]);

  return {
    cachedData,
    hasUpdate,
    isChecking,
    saveToCache,
    getFromCache,
    clearCache,
    checkForUpdates,
  };
}

/**
 * Gera um hash simples dos dados para comparação
 */
function hashData(data) {
  try {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  } catch {
    return '';
  }
}

/**
 * Hook para gerenciar múltiplos caches com sincronização
 */
export function useSyncedCaches(keys = []) {
  const caches = {};

  keys.forEach((key) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    caches[key] = useSmartCache(key);
  });

  const clearAllCaches = useCallback(() => {
    Object.values(caches).forEach((cache) => cache.clearCache());
  }, [caches]);

  return {
    caches,
    clearAllCaches,
  };
}
