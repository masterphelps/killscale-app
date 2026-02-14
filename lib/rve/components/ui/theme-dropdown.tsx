import React from 'react';
import { Button } from './button';
import { Moon, Sun, Palette } from 'lucide-react';
import { useExtendedThemeSwitcher, CustomTheme } from '../../hooks/use-extended-theme-switcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface ThemeDropdownProps {
  /** Array of available custom themes to display in dropdown */
  availableThemes?: CustomTheme[] | undefined;
  /** Current selected theme */
  selectedTheme?: string | undefined;
  /** Callback when theme is changed */
  onThemeChange?: ((themeId: string) => void) | undefined;
  /** Whether to show the default light/dark themes */
  showDefaultThemes?: boolean | undefined;
  /** Custom CSS classes */
  className?: string | undefined;
  /** Button size */
  size?: 'sm' | 'default' | 'lg' | undefined;
}

export const ThemeDropdown: React.FC<ThemeDropdownProps> = ({
  availableThemes = [],
  selectedTheme,
  onThemeChange,
  showDefaultThemes = true,
  className,
  size = 'sm',
}) => {
  const { currentTheme, setTheme, availableThemes: allThemes, getThemeInfo } = useExtendedThemeSwitcher({
    customThemes: availableThemes,
    showDefaultThemes,
    defaultTheme: selectedTheme || 'dark'
  });

  // Use controlled theme if provided, otherwise use internal state
  const displayTheme = selectedTheme || currentTheme;
  const currentThemeInfo = getThemeInfo(displayTheme);

  const handleThemeChange = (themeId: string) => {
    // Update internal state
    setTheme(themeId);
    
    // Call external callback if provided
    if (onThemeChange) {
      onThemeChange(themeId);
    }
  };

  // Get color swatch for theme
  const getThemeDisplay = (theme: CustomTheme) => {
    if (theme.color) {
      return (
        <div 
          className="w-2.5 h-2.5 rounded-full border shrink-0 border border-foreground"
          style={{ backgroundColor: theme.color }}
        />
      );
    }
    
    // Fallback to icons if no color specified
    if (theme.icon) return theme.icon;
    
    // Default icons for built-in themes
    if (theme.id === 'light') return <Sun className="w-2.5 h-2.5" />;
    if (theme.id === 'dark') return <Moon className="w-2.5 h-2.5" />;
    
    // Default icon for custom themes
    return <Palette className="w-2.5 h-2.5" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={`sm:flex border h-7 p-3 text-xs items-center gap-1 text-foreground ${className || ''}`}
          title={`Current theme: ${currentThemeInfo?.name || displayTheme}`}
        >
          <span className="mr-1">
            {currentThemeInfo ? getThemeDisplay(currentThemeInfo) : <Palette className="w-2.5 h-2.5" />}
          </span>
          {currentThemeInfo?.name || displayTheme}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="min-w-[100px]"
      >
        {allThemes.map((themeOption) => (
          <DropdownMenuItem
            key={themeOption.id}
            onClick={() => handleThemeChange(themeOption.id)}
            className={`text-xs py-1.5 flex items-center gap-2 cursor-pointer ${
              displayTheme === themeOption.id
                ? "bg-accent text-accent-foreground font-extralight"
                : "font-extralight"
            }`}
          >
            {getThemeDisplay(themeOption)}
            <span>{themeOption.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}; 