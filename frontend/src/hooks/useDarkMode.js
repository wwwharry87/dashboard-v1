import React from 'react';

const STORAGE_KEY = 'theme';

/**
 * Hook para dark mode (Tailwind darkMode: 'class').
 *
 * - Persiste em localStorage
 * - Se não houver escolha, segue prefers-color-scheme
 *
 * @returns {{ isDark: boolean, setDark: (v:boolean)=>void, toggle: ()=>void }}
 */
export function useDarkMode() {
  const [isDark, setIsDark] = React.useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;

    // fallback: sistema
    return typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? true
      : false;
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem(STORAGE_KEY, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(STORAGE_KEY, 'light');
    }
  }, [isDark]);

  const setDark = React.useCallback((v) => setIsDark(Boolean(v)), []);
  const toggle = React.useCallback(() => setIsDark((v) => !v), []);

  return { isDark, setDark, toggle };
}

export default useDarkMode;
