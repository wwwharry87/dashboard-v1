/**
 * Service Worker Registration - Dashboard Matrículas
 * 
 * Funcionalidades:
 * - Registro automático do SW
 * - Escuta mensagens do SW (atualização programada, etc)
 * - Gerenciamento de cache
 * - Limpeza de cache ao fazer logout
 */

// Configuração
const SW_URL = '/service-worker.js';
const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

// Objeto para gerenciar o Service Worker
export const swManager = {
  registration: null,
  
  // Registrar o Service Worker
  async register() {
    if (!('serviceWorker' in navigator)) {
      console.log('[SWReg] Service Worker não suportado');
      return null;
    }
    
    try {
      const registration = await navigator.serviceWorker.register(SW_URL, {
        scope: '/'
      });
      
      this.registration = registration;
      console.log('[SWReg] Service Worker registrado com sucesso');
      
      // Configurar listeners
      this.setupListeners(registration);
      
      // Verificar atualizações
      this.checkForUpdates(registration);
      
      return registration;
    } catch (error) {
      console.error('[SWReg] Erro ao registrar Service Worker:', error);
      return null;
    }
  },
  
  // Configurar listeners
  setupListeners(registration) {
    // Listener para atualização do SW
    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      
      if (!installingWorker) return;
      
      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // Nova versão disponível
            console.log('[SWReg] Nova versão do Service Worker disponível');
            this.notifyUpdateAvailable();
          } else {
            // Primeira instalação
            console.log('[SWReg] Service Worker instalado pela primeira vez');
          }
        }
      };
    };
    
    // Listener para mensagens do SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
  },
  
  // Verificar atualizações periodicamente
  checkForUpdates(registration) {
    // Verificar a cada 1 hora
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000);
  },
  
  // Tratar mensagens do SW
  handleMessage(data) {
    const { type, payload } = data || {};
    
    switch (type) {
      case 'SCHEDULED_UPDATE':
        console.log('[SWReg] Atualização programada recebida');
        window.dispatchEvent(new CustomEvent('sw-scheduled-update', { detail: payload }));
        break;
        
      case 'CACHE_CLEARED':
        console.log('[SWReg] Cache limpo com sucesso');
        window.dispatchEvent(new CustomEvent('sw-cache-cleared'));
        break;
        
      case 'ALL_CACHE_CLEARED':
        console.log('[SWReg] Todo o cache limpo');
        window.dispatchEvent(new CustomEvent('sw-all-cache-cleared'));
        break;
        
      case 'UPDATE_FORCED':
        console.log('[SWReg] Atualização forçada');
        window.dispatchEvent(new CustomEvent('sw-update-forced'));
        break;
        
      case 'CACHE_INFO':
        window.dispatchEvent(new CustomEvent('sw-cache-info', { detail: payload }));
        break;
        
      default:
        console.log('[SWReg] Mensagem desconhecida:', type);
    }
  },
  
  // Notificar que há atualização disponível
  notifyUpdateAvailable() {
    window.dispatchEvent(new CustomEvent('sw-update-available'));
  },
  
  // Forçar atualização do SW
  skipWaiting() {
    if (this.registration?.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  },
  
  // Limpar cache de dados (mantém assets estáticos)
  clearDataCache() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_DATA_CACHE' });
    }
  },
  
  // Limpar todo o cache
  clearAllCache() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHE' });
    }
  },
  
  // Forçar atualização de dados
  forceDataUpdate() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'FORCE_UPDATE' });
    }
  },
  
  // Obter informações do cache
  getCacheInfo() {
    return new Promise((resolve) => {
      const handler = (event) => {
        window.removeEventListener('sw-cache-info', handler);
        resolve(event.detail);
      };
      
      window.addEventListener('sw-cache-info', handler);
      
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_INFO' });
      } else {
        resolve(null);
      }
      
      // Timeout
      setTimeout(() => {
        window.removeEventListener('sw-cache-info', handler);
        resolve(null);
      }, 3000);
    });
  },
  
  // Desregistrar o SW
  async unregister() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.unregister();
        console.log('[SWReg] Service Worker desregistrado');
        return true;
      } catch (error) {
        console.error('[SWReg] Erro ao desregistrar:', error);
        return false;
      }
    }
    return false;
  }
};

// Registrar automaticamente
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    swManager.register();
  });
}

// Exportar funções úteis
export const registerSW = () => swManager.register();
export const unregisterSW = () => swManager.unregister();
export const clearDataCache = () => swManager.clearDataCache();
export const clearAllCache = () => swManager.clearAllCache();
export const forceDataUpdate = () => swManager.forceDataUpdate();
export const getCacheInfo = () => swManager.getCacheInfo();

export default swManager;
  