/**
 * Theme Context
 *
 * Provides theme management with localStorage persistence
 * and system preference detection.
 */

import {
  createContext,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  type ParentComponent,
} from 'solid-js';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: () => Theme;
  setTheme: (theme: Theme) => void;
  isDark: () => boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>();

const STORAGE_KEY = 'stride-theme';

export const ThemeProvider: ParentComponent = (props) => {
  const [theme, setThemeSignal] = createSignal<Theme>('system');
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(false);

  // Check if dark mode is active
  const isDark = () => {
    if (theme() === 'system') {
      return systemPrefersDark();
    }
    return theme() === 'dark';
  };

  // Apply theme to document
  const applyTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Set theme and persist
  const setTheme = (newTheme: Theme) => {
    setThemeSignal(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);

    if (newTheme === 'system') {
      applyTheme(systemPrefersDark());
    } else {
      applyTheme(newTheme === 'dark');
    }
  };

  // Toggle between light and dark
  const toggleTheme = () => {
    const current = isDark();
    setTheme(current ? 'light' : 'dark');
  };

  onMount(() => {
    // Load saved preference
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      setThemeSignal(saved);
    }

    // Detect system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mediaQuery.matches);

    // Listen for system preference changes
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
      if (theme() === 'system') {
        applyTheme(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    // Apply initial theme
    applyTheme(isDark());

    // Cleanup using onCleanup (SolidJS pattern, not React's useEffect return)
    onCleanup(() => {
      mediaQuery.removeEventListener('change', handleChange);
    });
  });

  const value: ThemeContextValue = {
    theme,
    setTheme,
    isDark,
    toggleTheme,
  };

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
