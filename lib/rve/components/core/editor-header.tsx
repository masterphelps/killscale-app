import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";
import { ThemeDropdown } from "../ui/theme-dropdown";
import { CustomTheme } from "../../hooks/use-extended-theme-switcher";
import { useExtendedThemeSwitcher } from "../../hooks/use-extended-theme-switcher";
import { useThemeConfig } from "../../contexts/theme-context";

import RenderControls from "../rendering/render-controls";
import { SaveControls } from "./save-controls";
import { useEditorContext } from "../../contexts/editor-context";
import { useEffect } from "react";

export interface EditorHeaderProps {
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
 * EditorHeader component renders the top navigation bar of the editor interface.
 *
 * @component
 * @description
 * This component provides the main navigation and control elements at the top of the editor:
 * - A sidebar trigger button for showing/hiding the sidebar
 * - A visual separator
 * - A theme dropdown for switching themes (conditionally shown)
 * - Rendering controls for media export
 *
 * The header is sticky-positioned at the top of the viewport and includes
 * responsive styling for both light and dark themes.
 *
 * Theme configuration can be provided either through direct props or through the ThemeProvider context.
 * Direct props take precedence over context values.
 *
 * @example
 * ```tsx
 * // Using direct props
 * <EditorHeader 
 *   availableThemes={[{id: 'purple', name: 'Purple', className: 'theme-purple'}]}
 *   onThemeChange={(theme) => console.log('Theme changed:', theme)}
 *   hideThemeToggle={false}
 *   defaultTheme="dark"
 * />
 * 
 * // Using ThemeProvider context (no props needed)
 * <ThemeProvider config={{...}}>
 *   <EditorHeader />
 * </ThemeProvider>
 * ```
 *
 * @returns {JSX.Element} A header element containing navigation and control components
 */
export function EditorHeader({
  availableThemes,
  selectedTheme,
  onThemeChange,
  showDefaultThemes,
  hideThemeToggle,
  defaultTheme,
}: EditorHeaderProps = {}) {
  /**
   * Destructure required values from the editor context:
   * - renderMedia: Function to handle media rendering/export
   * - renderState: Current render state (separate from editor state)
   */
  const { renderMedia, renderState, saveProject } = useEditorContext();

  // Get theme configuration from context if available
  const themeConfig = useThemeConfig();

  // Use direct props if provided, otherwise fall back to context values
  const resolvedAvailableThemes = availableThemes ?? themeConfig?.availableThemes ?? [];
  const resolvedSelectedTheme = selectedTheme ?? themeConfig?.selectedTheme;
  const resolvedOnThemeChange = onThemeChange ?? themeConfig?.onThemeChange;
  const resolvedShowDefaultThemes = showDefaultThemes ?? themeConfig?.showDefaultThemes ?? true;
  const resolvedHideThemeToggle = hideThemeToggle ?? themeConfig?.hideThemeToggle ?? false;
  const resolvedDefaultTheme = defaultTheme ?? themeConfig?.defaultTheme ?? 'dark';

  // Use the theme switcher hook to apply default theme when toggle is hidden
  const { setTheme } = useExtendedThemeSwitcher({
    customThemes: resolvedAvailableThemes,
    showDefaultThemes: resolvedShowDefaultThemes,
    defaultTheme: resolvedDefaultTheme,
  });

  // Apply default theme when theme toggle is hidden (only on mount or when hideThemeToggle changes)
  useEffect(() => {
    if (resolvedHideThemeToggle && resolvedDefaultTheme) {
      setTheme(resolvedDefaultTheme);
    }
  }, [resolvedHideThemeToggle, resolvedDefaultTheme, setTheme]);

  return (
    <header
      className="sticky top-0 flex shrink-0 items-center gap-2.5 
      bg-background
      border-l
      p-2.5 px-4.5"
    >
      {/* Sidebar toggle button with theme-aware styling */}
      <SidebarTrigger className="hidden sm:block text-foreground" />

      {/* Vertical separator for visual organization */}
      <Separator
        orientation="vertical"
        className="hidden sm:block mr-2.5 h-5"
      />

      {/* Theme dropdown for switching between available themes - only show if not hidden */}
      {!resolvedHideThemeToggle && (
        <ThemeDropdown
          availableThemes={resolvedAvailableThemes}
          selectedTheme={resolvedSelectedTheme}
          onThemeChange={resolvedOnThemeChange}
          showDefaultThemes={resolvedShowDefaultThemes}
          size="default"
        />
      )}

      {/* Spacer to push rendering controls to the right */}
      <div className="grow" />

      {/* Save controls */}
      <SaveControls onSave={saveProject || (() => Promise.resolve())} />

      {/* Render controls */}
      <RenderControls
        handleRender={renderMedia}
        state={renderState}
      />
    </header>
  );
}
