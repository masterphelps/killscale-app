import React from "react";
import { EditorHeader, EditorHeaderProps } from "./editor-header";

import { useEditorContext } from "../../contexts/editor-context";

import { VideoPlayer } from "./video-player";
import { TimelineSection } from "./timeline-section";
import { MobileNavBar } from "../shared/mobile-nav-bar";

export interface EditorProps extends EditorHeaderProps {
  /** Whether to hide the theme toggle dropdown */
  hideThemeToggle?: boolean | undefined;
  /** Default theme to use when theme toggle is hidden */
  defaultTheme?: string | undefined;
}

/**
 * Main Editor Component
 *
 * @component
 * @description
 * The core editor interface that orchestrates the video editing experience.
 * This component manages:
 * - Video playback and controls
 * - Timeline visualization and interaction
 * - Overlay management (selection, modification, deletion)
 * - Responsive behavior for desktop/mobile views
 *
 * The component uses the EditorContext to manage state and actions across
 * its child components. It implements a responsive design that shows a
 * mobile-specific message for smaller screens.
 *
 * Key features:
 * - Video player integration
 * - Timeline controls (play/pause, seeking)
 * - Overlay management (selection, modification)
 * - Frame-based navigation
 * - Mobile detection and fallback UI
 *
 * @example
 * ```tsx
 * <Editor availableThemes={[{id: 'purple', name: 'Purple'}]} />
 * ```
 */
export const Editor: React.FC<EditorProps> = ({
  availableThemes,
  selectedTheme,
  onThemeChange,
  showDefaultThemes,
  hideThemeToggle,
  defaultTheme,
}) => {
  /** State to track if the current viewport is mobile-sized */
  const [isMobile, setIsMobile] = React.useState(false);

  /**
   * Effect to handle mobile detection and window resize events
   * Uses 768px as the standard mobile breakpoint
   */
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  /**
   * Effect to prevent any scrolling and handle mobile viewport issues
   */
  React.useEffect(() => {
    // Function to handle viewport issues on mobile
    const handleResize = () => {
      // Set CSS custom property for viewport height to use instead of h-screen
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    // Initial call
    handleResize();

    // Handle orientation changes and resizes
    window.addEventListener("resize", handleResize);

    // Prevent any scrolling on body
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  /**
   * Destructure values and functions from the editor context
   * These provide core functionality for the editor's features
   */
  const {
    playerRef, // Reference to video player
    disableMobileLayout, // Configuration for mobile layout
    isInitialLoadComplete, // Loading state for autosave
  } = useEditorContext();

  /**
   * Show loading state until autosave check is complete
   */
   if (!isInitialLoadComplete) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-6">
        <div className="text-center ">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mx-auto mb-3"></div>
          <h3 className="text-lg font-extralight mb-2">Loading Editor</h3>
          <p className="text-sm font-extralight">
            Checking for saved work...
          </p>
        </div>
      </div>
    );
  }

  /**
   * Mobile fallback UI
   * Displays a message when accessed on mobile devices
   */
  if (isMobile && disableMobileLayout) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-6">
        <div className="text-center text-primary">
          <h2 className="text-xl font-extralight mb-3">React Video Editor</h2>
          <p className="text-sm text-secondary font-extralight mb-4">
            Currently, React Video Editor is designed as a full-screen desktop
            experience. We&apos;re actively working on making it
            mobile-friendly! 👀
          </p>
          <p className="text-sm text-secondary font-extralight">
            Want mobile support? Let us know by voting{" "}
            <a
              href="https://reactvideoeditor.featurebase.app/p/bulb-mobile-layout-version-2"
              className="text-primary font-medium hover:text-primary/80 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              here
            </a>
            !
          </p>
        </div>
      </div>
    );
  }

  /**
   * Main editor layout
   * Organized in a column layout with the following sections:
   * 1. Editor header (controls and options)
   * 2. Main content area (video player)
   * 3. Timeline controls
   * 4. Timeline visualization
   */
  return (
    <div
      className="flex flex-col overflow-hidden h-full"
    >
      <EditorHeader 
        availableThemes={availableThemes}
        selectedTheme={selectedTheme}
        onThemeChange={onThemeChange}
        showDefaultThemes={showDefaultThemes}
        hideThemeToggle={hideThemeToggle}
        defaultTheme={defaultTheme}
      />
      <div className="grow flex flex-col lg:flex-row overflow-hidden">
        <VideoPlayer playerRef={playerRef} />
      </div>

      <TimelineSection />

       {/* Mobile Navigation Bar
       * Only shows on mobile devices (md:hidden)
       * Improved scrollable design inspired by TimelineControls
       * Horizontal scrolling with fade indicators for better UX
       * Touch-friendly buttons with tooltips for content creation
       * Placed at the bottom of the timeline for easy access
       */}
      <MobileNavBar />
    </div>
  );
};
