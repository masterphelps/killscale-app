import React, { useState, useEffect, useRef } from "react";

import { DefaultSidebar } from "./shared/default-sidebar";
import { SidebarInset } from "./ui/sidebar";
import { Editor } from "./core/editor";
import { VideoPlayer } from "./core/video-player";
import { AutosaveStatus } from "./autosave/autosave-status";
import { OverlayType, type Overlay } from "../types";
import { CustomTheme } from "../hooks/use-extended-theme-switcher";
import { ReactVideoEditorProvider, ReactVideoEditorProviderProps } from "./providers/react-video-editor-provider";
import { PlayerRef } from "@remotion/player";
import { useEditorContext } from "../contexts/editor-context";
import type { OverlayConfig } from "@/remotion/types";

export interface SiblingClip {
  jobId: string;
  adIndex: number;
  conceptTitle: string;
  rawVideoUrl: string;
  durationSeconds: number;
  overlayConfig?: OverlayConfig;
}

export interface ReactVideoEditorProps extends Omit<ReactVideoEditorProviderProps, 'children'> {
  showSidebar?: boolean;
  showAutosaveStatus?: boolean;
  className?: string;
  customSidebar?: React.ReactNode;
  /** Custom logo element for the default sidebar header */
  sidebarLogo?: React.ReactNode;
  /** Footer text for the default sidebar (ignored if customSidebar is provided) */
  sidebarFooterText?: string;
  /** Array of overlay types to disable/hide from the sidebar (ignored if customSidebar is provided) */
  disabledPanels?: OverlayType[];
  /** Whether to show icon titles in the sidebar (ignored if customSidebar is provided) */
  showIconTitles?: boolean;
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
  /** Whether to render in player-only mode (no editor UI) */
  isPlayerOnly?: boolean;
  /** Whether the project from URL is still loading */
  isLoadingProject?: boolean;
  /** AI generation callback — if provided, AI panel is shown in sidebar */
  onAIGenerate?: (prompt: string) => Promise<void>;
  /** Whether AI generation is in progress */
  isAIGenerating?: boolean;
  /** Whether a transcript is available for AI generation */
  hasAITranscript?: boolean;
  /** Sibling concept videos from the same canvas */
  siblingClips?: SiblingClip[];
  /** Callback when user clicks "Add" on a sibling clip */
  onAppendSibling?: (sibling: SiblingClip) => void;
  /** Set of sibling jobIds already appended to the timeline */
  appendedSiblings?: Set<string>;
}

export const ReactVideoEditor: React.FC<ReactVideoEditorProps> = ({
  showSidebar = true,
  showAutosaveStatus = true,
  className,
  customSidebar,
  sidebarLogo,
  sidebarFooterText,
  disabledPanels,
  showIconTitles = true,
  availableThemes = [],
  selectedTheme,
  onThemeChange,
  showDefaultThemes = true,
  hideThemeToggle = false,
  defaultTheme = 'dark',
  onSaving,
  onSaved,
  isPlayerOnly = false,
  onAIGenerate,
  isAIGenerating,
  hasAITranscript,
  siblingClips,
  onAppendSibling,
  appendedSiblings,
  ...providerProps
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const playerRef = useRef<PlayerRef>(null);

  const handleSaving = (saving: boolean) => {
    setIsSaving(saving);
    onSaving?.(saving);
  };

  const handleSaved = (timestamp: number) => {
    setLastSaveTime(timestamp);
    onSaved?.(timestamp);
  };

  // Set up mobile viewport height handling for player-only mode
  useEffect(() => {
    if (!isPlayerOnly) return;
    
    const handleResize = () => {
      // Set CSS custom property for viewport height to use instead of h-screen
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    // Initial call
    handleResize();

    // Handle orientation changes and resizes
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", () => {
      setTimeout(handleResize, 100); // Small delay for mobile browsers
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [isPlayerOnly]);

  return (
    <ReactVideoEditorProvider
      {...providerProps}
      onSaving={handleSaving}
      onSaved={handleSaved}
      playerRef={playerRef}
    >
      {/* Bridge: listens for overlay injection from outside + emits changes out */}
      <OverlayBridge />

      {isPlayerOnly ? (
        // Player-only mode: Simple fullscreen video player
        <div
          className="w-full bg-black flex items-center justify-center"
          style={{
            height: "calc(var(--vh, 1vh) * 100)",
            maxHeight: "-webkit-fill-available" /* Safari fix */,
          }}
        >
          <VideoPlayer playerRef={playerRef} isPlayerOnly={true} />
        </div>
      ) : (
        // Editor mode: Full editor interface with sidebar
        <>
          {showSidebar && (customSidebar || <DefaultSidebar logo={sidebarLogo} footerText={sidebarFooterText || "RVE"} disabledPanels={disabledPanels || []} showIconTitles={showIconTitles} onAIGenerate={onAIGenerate} isAIGenerating={isAIGenerating} hasAITranscript={hasAITranscript} siblingClips={siblingClips} onAppendSibling={onAppendSibling} appendedSiblings={appendedSiblings} />)}
          <SidebarInset className={className}>
            <Editor 
              availableThemes={availableThemes}
              selectedTheme={selectedTheme}
              onThemeChange={onThemeChange}
              showDefaultThemes={showDefaultThemes}
              hideThemeToggle={hideThemeToggle}
              defaultTheme={defaultTheme}
            />
          </SidebarInset>

          {showAutosaveStatus && (
            <AutosaveStatus
              isSaving={isSaving}
              lastSaveTime={lastSaveTime}
            />
          )}
        </>
      )}
    </ReactVideoEditorProvider>
  );
};

/**
 * Bridge component that lives INSIDE the RVE provider tree.
 * 1. Listens for 'ks-inject-overlays' events to set overlays from outside (AI generation, version loading)
 * 2. Emits 'ks-overlay-changed' events when overlays change so external Save button can read them
 */
function OverlayBridge() {
  const { overlays, setOverlays } = useEditorContext();
  const prevOverlaysRef = useRef<Overlay[]>(overlays);
  const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInjectingRef = useRef(false);

  // Listen for injection events from outside
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ overlays: Overlay[] }>;
      if (customEvent.detail?.overlays) {
        // Flag to prevent re-emitting what we just injected
        isInjectingRef.current = true;
        setOverlays(customEvent.detail.overlays);
        // Reset flag after React processes the state update
        requestAnimationFrame(() => { isInjectingRef.current = false; });
      }
    };

    window.addEventListener('ks-inject-overlays', handler);
    return () => window.removeEventListener('ks-inject-overlays', handler);
  }, [setOverlays]);

  // Emit changes when overlays change (for external Save button + sibling append)
  // Debounced to prevent cascading state update loops during rapid editing
  useEffect(() => {
    if (overlays !== prevOverlaysRef.current) {
      prevOverlaysRef.current = overlays;

      // Skip emission for injections — the caller already knows the overlays
      if (isInjectingRef.current) return;

      // Emit raw overlays synchronously (only updates refs, no state changes)
      const rawEvent = new CustomEvent('ks-overlays-raw', { detail: { overlays } });
      window.dispatchEvent(rawEvent);

      // Debounce the config conversion + emission to avoid rapid-fire cascades
      if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
      emitTimerRef.current = setTimeout(() => {
        import('@/lib/rve-bridge').then(({ rveOverlaysToOverlayConfig }) => {
          const config = rveOverlaysToOverlayConfig(overlays);
          const event = new CustomEvent('ks-overlay-changed', { detail: { overlayConfig: config } });
          window.dispatchEvent(event);
        });
      }, 50);
    }
  }, [overlays]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
    };
  }, []);

  return null;
}