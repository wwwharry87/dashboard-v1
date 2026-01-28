import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook para cache inteligente com sincronização e detecção de atualizações
 * 
 * Funcionalidades:
 * - Persiste dados em localStorage
 * - Detecta mudanças no servidor
 * - Notifica quando há atualizações disponíveis
 * - Sincroniza dados entre abas
 * - Atualização programada às 08:10
 * - Mantém cache mesmo ao fechar app (PWA)
 * - Limpa cache apenas ao fazer logout/sair
 */

// Horário de atualização programada
const SCHEDULED_UPDATE_HOUR = 8;
const SCHEDULED_UPDATE_MINUTE = 10;

// TTL padrão de 24 horas
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

/**
 * Verifica se passou do horário de atualização programada (08:10)
 */
function shouldUpdateNow(lastUpdateTimestamp) {
  if (!lastUpdateTimestamp) return true;
  
  const now = new Date();
  const lastUpdate = new Date(lastUpdateTimestamp);
  
  // Criar data de hoje às 08:10
  const todayScheduled = new Date();
  todayScheduled.setHours(SCHEDULED_UPDATE_HOUR, SCHEDULED_UPDATE_MINUTE, 0, 0);
  
  // Se agora é depois das 08:10 E última atualização foi antes das 08:10 de hoje
  if (now >= todayScheduled && lastUpdate < todayScheduled) {
    return true;
  }
  
  return false;
}

/**
 * Retorna a próxima atualização programada
 */
function getNextScheduledUpdate() {
  const now = new Date();
  const next = new Date();
  next.setHours(SCHEDULED_UPDATE_HOUR, SCHEDULED_UPDATE_MINUTE, 0, 0);
  
  if (now >= next) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

/**
 * Formata data para exibição
 */
function formatDateTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function useSmartCache(key, options = {}) {
  const {
    ttlMs = DEFAULT_TTL, // 24 horas por padrão
    onUpdateAvailable = null,
    checkInterval = 5 * 60 * 1000, // Verifica a cada 5 minutos
    persistOnClose = true, // Manter cache ao fechar app
  } = options;

  const [cachedData, setCachedData] = useState(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [cacheInfo, setCacheInfo] = useState({
    lastUpdate: null,
    nextScheduledUpdate: getNextScheduledUpdate(),
    isValid: false
  });
  const checkIntervalRef = useRef(null);
  const lastCheckRef = useRef(0);

  // Recuperar dados do cache
  const getFromCache = useCallback(() => {
    try {
      const item = localStorage.getItem(`cache_${key}`);
      if (!item) return null;

      const cached = JSON.parse(item);
      const now = Date.now();

      // Verificar se passou do horário programado (08:10)
      if (shouldUpdateNow(cached.timestamp)) {
        console.log(`[SmartCache] Cache ${key} expirou - horário programado`);
        // Não remove o cache, mas marca como expirado para atualização
        setCacheInfo(prev => ({ ...prev, isValid: false }));
        return cached.data; // Retorna dados antigos para exibir enquanto atualiza
      }

      // Verifica se o cache expirou pelo TTL
      if (cached.timestamp && now - cached.timestamp > ttlMs) {
        console.log(`[SmartCache] Cache ${key} expirou por TTL`);
        setCacheInfo(prev => ({ ...prev, isValid: false }));
        return cached.data; // Retorna dados antigos para exibir enquanto atualiza
      }

      setCacheInfo({
        lastUpdate: cached.timestamp,
        nextScheduledUpdate: getNextScheduledUpdate(),
        isValid: true
      });

      return cached.data;
    } catch (error) {
      console.error(`[SmartCache] Erro ao recuperar cache ${key}:`, error);
      return null;
    }
  }, [key, ttlMs]);

  // Verificar se cache é válido (não expirado)
  const isCacheValid = useCallback(() => {
    try {
      const item = localStorage.getItem(`cache_${key}`);
      if (!item) return false;

      const cached = JSON.parse(item);
      
      // Verificar horário programado
      if (shouldUpdateNow(cached.timestamp)) {
        return false;
      }
      
      // Verificar TTL
      if (cached.timestamp && Date.now() - cached.timestamp > ttlMs) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }, [key, ttlMs]);

  // Salvar dados no cache
  const saveToCache = useCallback((data) => {
    try {
      const timestamp = Date.now();
      const cacheItem = {
        data,
        timestamp,
        hash: hashData(data),
        version: '1.0'
      };
      localStorage.setItem(`cache_${key}`, JSON.stringify(cacheItem));
      setCachedData(data);
      setHasUpdate(false);
      setCacheInfo({
        lastUpdate: timestamp,
        nextScheduledUpdate: getNextScheduledUpdate(),
        isValid: true
      });
      console.log(`[SmartCache] Cache ${key} salvo com sucesso`);
      return true;
    } catch (error) {
      console.error(`[SmartCache] Erro ao salvar cache ${key}:`, error);
      return false;
    }
  }, [key]);

  // Verificar se há atualizações
  const checkForUpdates = useCallback(async (fetchFn) => {
    const now = Date.now();
    
    // Evita verificações muito frequentes (mínimo 5 segundos)
    if (now - lastCheckRef.current < 5000) {
      return false;
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
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[SmartCache] Erro ao verificar atualizações:', error);
      return false;
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
      setCacheInfo({
        lastUpdate: null,
        nextScheduledUpdate: getNextScheduledUpdate(),
        isValid: false
      });
      console.log(`[SmartCache] Cache ${key} limpo`);
    } catch (error) {
      console.error(`[SmartCache] Erro ao limpar cache ${key}:`, error);
    }
  }, [key]);

  // Limpar todos os caches (para logout)
  const clearAllCaches = useCallback(() => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith('cache_') || k.startsWith('selectedFilters') || k.startsWith('cachedData')) {
          localStorage.removeItem(k);
        }
      });
      console.log('[SmartCache] Todos os caches limpos');
    } catch (error) {
      console.error('[SmartCache] Erro ao limpar todos os caches:', error);
    }
  }, []);

  // Sincronizar entre abas
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === `cache_${key}` && event.newValue) {
        try {
          const cached = JSON.parse(event.newValue);
          setCachedData(cached.data);
          setHasUpdate(false);
          setCacheInfo({
            lastUpdate: cached.timestamp,
            nextScheduledUpdate: getNextScheduledUpdate(),
            isValid: true
          });
        } catch (error) {
          console.error('[SmartCache] Erro ao sincronizar cache entre abas:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  // Escutar atualização programada do Service Worker
  useEffect(() => {
    const handleScheduledUpdate = () => {
      console.log('[SmartCache] Atualização programada do SW recebida');
      setCacheInfo(prev => ({ ...prev, isValid: false }));
      setHasUpdate(true);
    };

    window.addEventListener('sw-scheduled-update', handleScheduledUpdate);
    return () => window.removeEventListener('sw-scheduled-update', handleScheduledUpdate);
  }, []);

  // Inicializar com dados do cache
  useEffect(() => {
    const data = getFromCache();
    if (data) {
      setCachedData(data);
    }
  }, [getFromCache]);

  // Verificar periodicamente se chegou o horário programado
  useEffect(() => {
    const checkScheduledTime = () => {
      const item = localStorage.getItem(`cache_${key}`);
      if (item) {
        const cached = JSON.parse(item);
        if (shouldUpdateNow(cached.timestamp)) {
          console.log('[SmartCache] Horário programado atingido, sinalizando atualização');
          setCacheInfo(prev => ({ ...prev, isValid: false }));
          setHasUpdate(true);
          if (onUpdateAvailable) {
            onUpdateAvailable(null);
          }
        }
      }
    };

    // Verificar a cada minuto
    const interval = setInterval(checkScheduledTime, 60 * 1000);
    
    // Verificar imediatamente
    checkScheduledTime();

    return () => clearInterval(interval);
  }, [key, onUpdateAvailable]);

  return {
    cachedData,
    hasUpdate,
    isChecking,
    cacheInfo,
    saveToCache,
    getFromCache,
    isCacheValid,
    clearCache,
    clearAllCaches,
    checkForUpdates,
    formatDateTime,
    getNextScheduledUpdate,
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
