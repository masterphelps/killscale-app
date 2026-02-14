import React from "react";
import { SidebarProvider as UISidebarProvider } from "../ui/sidebar";
import { EditorProvider } from "./editor-provider";
import { RendererProvider } from "../../contexts/renderer-context";
import { LocalMediaProvider } from "../../contexts/local-media-context";
import { SidebarProvider as EditorSidebarProvider } from "../../contexts/sidebar-context";
import { MediaAdaptorProvider } from "../../contexts/media-adaptor-context";
import { ThemeProvider } from "../../contexts/theme-context";
import { Overlay, AspectRatio } from "../../types";
import { VideoRenderer } from "../../types/renderer";
import { PlayerRef } from "@remotion/player";
import { OverlayAdaptors } from "../../types/overlay-adaptors";
import { CustomTheme } from "../../hooks/use-extended-theme-switcher";

export interface ReactVideoEditorProviderProps {
  children: React.ReactNode;
  projectId: string;
  defaultOverlays?: Overlay[];
  defaultAspectRatio?: AspectRatio;
  defaultBackgroundColor?: string;
  autoSaveInterval?: number;
  fps?: number;
  renderer: VideoRenderer;
  onSaving?: (saving: boolean) => void;
  onSaved?: (timestamp: number) => void;
  sidebarWidth?: string;
  sidebarIconWidth?: string;
  
  // Loading State
  isLoadingProject?: boolean; // Whether the project from URL is still loading
  
  // Player Configuration
  playerRef?: React.RefObject<PlayerRef>; // External playerRef for manual control
  
  // API Configuration
  baseUrl?: string;
  
  // NEW: Adaptor Configuration
  adaptors?: OverlayAdaptors;
  
  // Timeline Configuration
  initialRows?: number;
  maxRows?: number;
  
  // Zoom Configuration  
  zoomConstraints?: {
    min: number;
    max: number;
    step: number;
    default: number;
  };
  
  // Snapping Configuration
  snappingConfig?: {
    thresholdFrames: number;
    enableVerticalSnapping: boolean;
  };
  
  // Feature Flags
  disableMobileLayout?: boolean;
  disableVideoKeyframes?: boolean;
  enablePushOnDrag?: boolean;
  
  // Video Dimensions (if not using aspect ratio)
  videoWidth?: number;
  videoHeight?: number;
  
  // Theme Configuration
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

export const ReactVideoEditorProvider: React.FC<ReactVideoEditorProviderProps> = ({
  children,
  projectId,
  defaultOverlays = [],
  defaultAspectRatio,
  defaultBackgroundColor,
  autoSaveInterval = 10000,
  fps = 30,
  renderer,
  onSaving,
  onSaved,
  sidebarWidth = "16rem",
  sidebarIconWidth = "3rem",
  
  // Loading State
  isLoadingProject = false,
  
  // Player Configuration
  playerRef,
  
  // API Configuration
  baseUrl,
  
  // Adaptor Configuration
  adaptors,
  
  // Configuration props
  initialRows = 5,
  maxRows = 8,
  zoomConstraints = {
    min: 0.2,
    max: 10,
    step: 0.1,
    default: 1,
  },
  snappingConfig = {
    thresholdFrames: 1,
    enableVerticalSnapping: true,
  },
  disableMobileLayout = false,
  disableVideoKeyframes = false,
  enablePushOnDrag = false,
  videoWidth = 1280,
  videoHeight = 720,
  
  // Theme Configuration
  availableThemes = [],
  selectedTheme,
  onThemeChange,
  showDefaultThemes = true,

  hideThemeToggle = false,
  defaultTheme = 'dark',
}) => {
  return (
    <UISidebarProvider
      style={
        {
          "--sidebar-width": sidebarWidth,
          "--sidebar-width-icon": sidebarIconWidth,
        } as React.CSSProperties
      }
    >
      <RendererProvider config={{ renderer }}>
        <MediaAdaptorProvider adaptors={adaptors || {}}>
          <ThemeProvider config={{
            availableThemes,
            selectedTheme,
            onThemeChange,
            showDefaultThemes,
            hideThemeToggle,
            defaultTheme,
          }}>
            <EditorProvider
              projectId={projectId}
              defaultOverlays={defaultOverlays}
              defaultAspectRatio={defaultAspectRatio}
              defaultBackgroundColor={defaultBackgroundColor}
              autoSaveInterval={autoSaveInterval}
              fps={fps}
              isLoadingProject={isLoadingProject}
              {...(onSaving && { onSaving })}
              {...(onSaved && { onSaved })}
              {...(playerRef && { playerRef })}
              {...(baseUrl !== undefined && { baseUrl })}
              initialRows={initialRows}
              maxRows={maxRows}
              zoomConstraints={zoomConstraints}
              snappingConfig={snappingConfig}
              disableMobileLayout={disableMobileLayout}
              disableVideoKeyframes={disableVideoKeyframes}
              enablePushOnDrag={enablePushOnDrag}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
            >
                <LocalMediaProvider>
                      <EditorSidebarProvider>
                        {children}
                      </EditorSidebarProvider>
                </LocalMediaProvider>
            </EditorProvider>
          </ThemeProvider>
        </MediaAdaptorProvider>
      </RendererProvider>
    </UISidebarProvider>
  );
}; 