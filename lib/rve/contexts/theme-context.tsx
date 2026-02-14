import React, { createContext, useContext, ReactNode } from "react";
import { CustomTheme } from "../hooks/use-extended-theme-switcher";

/**
 * Theme configuration interface
 */
export interface ThemeConfig {
  /** Array of available custom themes for the theme dropdown */
  availableThemes?: CustomTheme[] | undefined;
  /** Current selected theme */
  selectedTheme?: string | undefined;
  /** Callback when theme is changed */
  onThemeChange?: ((themeId: string) => void) | undefined;
  /** Whether to show the default light/dark themes */
  showDefaultThemes?: boolean | undefined;
  /** Whether to hide the theme toggle dropdown */
  hideThemeToggle?: boolean | undefined;
  /** Default theme to use when theme toggle is hidden */
  defaultTheme?: string | undefined;
}

/**
 * Context for providing theme configuration
 */
const ThemeContext = createContext<ThemeConfig | null>(null);

/**
 * Props for the ThemeProvider component
 */
export interface ThemeProviderProps {
  children: ReactNode;
  config: ThemeConfig;
}

/**
 * Provider component that makes theme configuration available to child components
 * 
 * @example
 * ```tsx
 * <ThemeProvider config={{
 *   availableThemes: [{id: 'purple', name: 'Purple', color: '#8b5cf6'}],
 *   hideThemeToggle: false,
 *   defaultTheme: 'dark'
 * }}>
 *   <EditorHeader />
 * </ThemeProvider>
 * ```
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  config,
}) => {
  return (
    <ThemeContext.Provider value={config}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to access the current theme configuration
 * 
 * @returns The current theme configuration or null if used outside of ThemeProvider
 */
export const useThemeConfig = (): ThemeConfig | null => {
  return useContext(ThemeContext);
}; 