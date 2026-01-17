import React, { createContext, useContext, useMemo, useState } from 'react';

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }
}

const AppContext = createContext(null);

/**
 * AppProvider
 * - user: dados do usuario (quando disponivel)
 * - loading: loading global (opcional)
 * - notifications: toasts
 */
export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const removeToast = (id) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  };

  /**
   * Exibe toast.
   * @param {{ type?: 'success'|'error'|'info', title?: string, message: string, durationMs?: number }} payload
   */
  const notify = (payload) => {
    const toast = {
      id: uid(),
      type: payload.type || 'info',
      title: payload.title,
      message: payload.message,
      durationMs: payload.durationMs,
    };
    setToasts((curr) => [toast, ...curr].slice(0, 5));
    return toast.id;
  };

  const value = useMemo(
    () => ({
      user,
      setUser,
      loading,
      setLoading,
      toasts,
      notify,
      removeToast,
    }),
    [user, loading, toasts]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * Hook para acessar AppContext.
 */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de <AppProvider />');
  return ctx;
}
