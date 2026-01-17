import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'ui:theme';

/**
 * Hook de dark mode com persistencia em localStorage.
 * - Usa tailwind darkMode: 'class'
 * - Aplica a classe 'dark' no <html>
 *
 * @returns {{isDark: boolean, theme: 'dark'|'light', setTheme: (t: 'dark'|'light') => void, toggle: () => void}}
 */
export function useDarkMode() {
  const getInitial = () => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      // ignore
    }

    // Preferencia do SO
    try {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
      return prefersDark ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  };

  const [theme, setThemeState] = useState(getInitial);

  const setTheme = (t) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return useMemo(
    () => ({ isDark: theme === 'dark', theme, setTheme, toggle }),
    [theme]
  );
}
