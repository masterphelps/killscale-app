import { useState, useEffect, useCallback, useMemo } from 'react';

export type BuiltInTheme = 'light' | 'dark';
export type ExtendedThemeMode = BuiltInTheme | string; // Allow custom theme IDs

export interface CustomTheme {
  /** Unique identifier for the theme */
  id: string;
  /** Display name for the theme */
  name: string;
  /** Optional icon for the theme */
  icon?: React.ReactNode | undefined;
  /** CSS class or theme identifier to apply */
  className?: string | undefined;
  /** Color swatch for the theme */
  color?: string | undefined;
}

export interface UseExtendedThemeSwitcherProps {
  /** Array of available custom themes */
  customThemes?: CustomTheme[] | undefined;
  /** Whether to show default light/dark themes */
  showDefaultThemes?: boolean | undefined;
  /** Default theme to use */
  defaultTheme?: ExtendedThemeMode | undefined;
}

export interface UseExtendedThemeSwitcherReturn {
  /** Current selected theme */
  currentTheme: ExtendedThemeMode;
  /** Function to set theme */
  setTheme: (theme: ExtendedThemeMode) => void;
  /** Array of all available themes */
  availableThemes: CustomTheme[];
  /** Get theme display info */
  getThemeInfo: (themeId: string) => CustomTheme | undefined;
}

const defaultThemes: CustomTheme[] = [
  {
    id: 'light',
    name: 'Light',
    color: '#ffffff',
  },
  {
    id: 'dark',
    name: 'Dark',
    className: 'dark',
    color: '#1f2937',
  }
];

export const useExtendedThemeSwitcher = ({
  customThemes = [],
  showDefaultThemes = true,
  defaultTheme = 'dark'
}: UseExtendedThemeSwitcherProps = {}): UseExtendedThemeSwitcherReturn => {
  // Start with default theme to avoid hydration issues
  const [currentTheme, setCurrentTheme] = useState<ExtendedThemeMode>(defaultTheme);
  const [isLoaded, setIsLoaded] = useState(false);

  // Combine default and custom themes
  const availableThemes = useMemo(() => 
    showDefaultThemes 
      ? [...defaultThemes, ...customThemes]
      : customThemes,
    [showDefaultThemes, customThemes]
  );

  const applyTheme = useCallback((themeId: ExtendedThemeMode) => {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    
    // Remove all existing theme classes
    root.classList.remove('dark');
    customThemes.forEach(theme => {
      if (theme.className) {
        root.classList.remove(theme.className);
      }
    });

    // Set data attribute for the current theme
    root.setAttribute('data-theme', themeId);
    
    // Apply the appropriate class
    if (themeId === 'dark') {
      root.classList.add('dark');
    } else if (themeId === 'light') {
      // Light theme is default, no class needed
    } else {
      // Custom theme
      const customTheme = customThemes.find(t => t.id === themeId);
      if (customTheme?.className) {
        root.classList.add(customTheme.className);
      }
    }
  }, [customThemes]);

  const handleSetTheme = useCallback((newTheme: ExtendedThemeMode) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('rve-extended-theme', newTheme);
  }, [applyTheme]);

  const getThemeInfo = (themeId: string): CustomTheme | undefined => {
    return availableThemes.find(theme => theme.id === themeId);
  };

  // Load saved theme after mount to avoid hydration issues
  useEffect(() => {
    const savedTheme = localStorage.getItem('rve-extended-theme') as ExtendedThemeMode | null;
    
    if (savedTheme && availableThemes.some(t => t.id === savedTheme)) {
      setCurrentTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      // Apply default theme
      applyTheme(currentTheme);
    }
    
    setIsLoaded(true);
  }, [applyTheme, availableThemes, currentTheme]);

  // Apply theme when it changes (after initial load)
  useEffect(() => {
    if (isLoaded) {
      applyTheme(currentTheme);
    }
  }, [currentTheme, customThemes, isLoaded, applyTheme]);

  return {
    currentTheme,
    setTheme: handleSetTheme,
    availableThemes,
    getThemeInfo,
  };
}; 