import React from 'react';
import Toast from './components/common/Toast';

const AppContext = React.createContext(null);

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @typedef {'success'|'error'|'info'} ToastType
 */

/**
 * Provider de contexto global.
 *
 * Responsabilidades:
 * - user (ex.: informações do usuário logado)
 * - loading (carregamento global opcional)
 * - notifications (toast)
 *
 * @example
 * // src/index.js
 * import { AppProvider } from './AppContext';
 *
 * <AppProvider>
 *   <App />
 * </AppProvider>
 */
export function AppProvider({ children }) {
  const [user, setUserState] = React.useState(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const timersRef = React.useRef(new Map());

  const setUser = React.useCallback((nextUser) => {
    setUserState(nextUser);
    try {
      if (nextUser) localStorage.setItem('user', JSON.stringify(nextUser));
      else localStorage.removeItem('user');
    } catch {
      // ignore
    }
  }, []);

  const dismissToast = React.useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  /**
   * Dispara um toast.
   * @param {{ type?: ToastType, title?: string, message: string, duration?: number }} payload
   */
  const notify = React.useCallback(
    (payload) => {
      const id = uid();
      const item = {
        id,
        type: payload?.type || 'info',
        title: payload?.title,
        message: payload?.message || '',
        duration: typeof payload?.duration === 'number' ? payload.duration : 3500,
      };

      setToasts((prev) => [item, ...prev].slice(0, 5)); // limita 5 na tela

      if (item.duration > 0) {
        const timeoutId = setTimeout(() => dismissToast(id), item.duration);
        timersRef.current.set(id, timeoutId);
      }

      return id;
    },
    [dismissToast]
  );

  const value = React.useMemo(
    () => ({
      user,
      setUser,
      loading,
      setLoading,
      notify,
      dismissToast,
    }),
    [user, setUser, loading, notify, dismissToast]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </AppContext.Provider>
  );
}

/**
 * Hook para consumir o AppContext.
 * @returns {{ user:any, setUser:(u:any)=>void, loading:boolean, setLoading:(v:boolean)=>void, notify:(p:any)=>string, dismissToast:(id:string)=>void }}
 */
export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp deve ser usado dentro de <AppProvider>.');
  }
  return ctx;
}

export default AppContext;
