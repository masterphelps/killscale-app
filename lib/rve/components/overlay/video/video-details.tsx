/**
 * VideoDetails Component
 *
 * A component that provides a user interface for configuring video overlay settings, styles, and AI features.
 * It displays a video preview along with three tabbed panels for comprehensive video management.
 *
 * Features:
 * - Video preview display
 * - Settings panel for basic video configuration
 * - Style panel for visual customization
 * - AI panel for AI-powered video features
 *
 * @component
 */

import React from "react";
import { ClipOverlay } from "../../../types";
import { VideoStylePanel } from "./video-style-panel";
import { VideoSettingsPanel } from "./video-settings-panel";
import { VideoAIPanel } from "./video-ai-panel";
import { VideoPreview } from "./video-preview";
import { useOverlayOverlapCheck } from "../../../hooks/use-overlay-overlap-check";
import { useEditorContext } from "../../../contexts/editor-context";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Settings, PaintBucket, Sparkles } from "lucide-react";

interface VideoDetailsProps {
  /** The current state of the video overlay */
  localOverlay: ClipOverlay;
  /** Callback function to update the video overlay state */
  setLocalOverlay: (overlay: ClipOverlay) => void;
  /** Callback function to initiate video replacement */
  onChangeVideo?: () => void;
}

/**
 * VideoDetails component for managing video overlay configuration
 */
export const VideoDetails: React.FC<VideoDetailsProps> = ({
  localOverlay,
  setLocalOverlay,
  onChangeVideo,
}) => {
  const { checkAndAdjustOverlaps } = useOverlayOverlapCheck();
  const { overlays, setOverlays, changeOverlay } = useEditorContext();

  /**
   * Updates the style properties of the video overlay
   */
  const handleStyleChange = (updates: Partial<ClipOverlay["styles"]>) => {
    const updatedOverlay = {
      ...localOverlay,
      styles: {
        ...localOverlay.styles,
        ...updates,
      },
    };
    // Update local state immediately for responsive UI
    setLocalOverlay(updatedOverlay);

    // Update global state immediately (no debounce to prevent losing changes)
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  /**
   * Handles speed and duration changes for the video overlay
   */
  const handleSpeedChange = (speed: number, newDuration: number) => {
    const updatedOverlay = {
      ...localOverlay,
      speed,
      durationInFrames: newDuration,
    };

    // First update local state
    setLocalOverlay(updatedOverlay);

    // Then check for overlaps and update global state
    const { hasOverlap, adjustedOverlays } = checkAndAdjustOverlaps(
      updatedOverlay,
      overlays
    );

    // Create the final array of overlays to update
    const finalOverlays = overlays.map((overlay) => {
      if (overlay.id === updatedOverlay.id) {
        return updatedOverlay;
      }
      if (hasOverlap) {
        const adjustedOverlay = adjustedOverlays.find(
          (adj) => adj.id === overlay.id
        );
        return adjustedOverlay || overlay;
      }
      return overlay;
    });

    // Update global state in one operation
    setOverlays(finalOverlays);
  };

  /**
   * Handles position and size changes for the video overlay
   */
  const handlePositionChange = (updates: { 
    left?: number; 
    top?: number; 
    width?: number; 
    height?: number 
  }) => {
    const updatedOverlay = {
      ...localOverlay,
      ...updates,
    };
    
    // Update local state immediately for responsive UI
    setLocalOverlay(updatedOverlay);
    
    // Update global state immediately
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  return (
    <div className="space-y-2">
      {/* Preview */}
      <VideoPreview overlay={localOverlay} onChangeVideo={onChangeVideo} />

      {/* Settings Tabs */}
      <UnifiedTabs
        tabs={[
          {
            value: "settings",
            label: "Settings",
            icon: <Settings className="w-4 h-4" />,
            content: (
              <VideoSettingsPanel
                localOverlay={localOverlay}
                handleStyleChange={handleStyleChange}
                onSpeedChange={handleSpeedChange}
                onPositionChange={handlePositionChange}
              />
            ),
          },
          {
            value: "style",
            label: "Style",
            icon: <PaintBucket className="w-4 h-4" />,
            content: (
              <VideoStylePanel
                localOverlay={localOverlay}
                handleStyleChange={handleStyleChange}
              />
            ),
          },
          {
            value: "ai",
            label: "AI",
            icon: <Sparkles className="w-4 h-4" />,
            content: (
              <VideoAIPanel
                localOverlay={localOverlay}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

