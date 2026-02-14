import { useState } from "react";
import { ClipOverlay, Overlay } from "../types";
import { StandardVideo } from "../types/media-adaptors";
import { getSrcDuration } from "./use-src-duration";
import { useEditorContext } from "../contexts/editor-context";

/**
 * Hook for managing video replacement functionality
 * Handles smart duration logic when replacing video sources
 */
export const useVideoReplacement = () => {
  const [isReplaceMode, setIsReplaceMode] = useState(false);
  const { changeOverlay } = useEditorContext();

  /**
   * Calculate the new duration when replacing a video
   * Smart logic:
   * - NEVER increase the overlay's duration (to prevent overlapping other items)
   * - If the new video is shorter, reduce the overlay duration to match
   * - If the new video is longer, keep the original duration (video will be trimmed)
   */
  const calculateReplacementDuration = (
    oldOverlay: ClipOverlay,
    newDurationInFrames: number
  ): number => {
    const oldOverlayDuration = oldOverlay.durationInFrames;
    
    // Never increase duration - only keep same or reduce if new video is shorter
    // This prevents overlapping other items on the timeline
    return Math.min(oldOverlayDuration, newDurationInFrames);
  };

  /**
   * Replace a video overlay's source while preserving all other properties
   */
  const replaceVideo = async (
    currentOverlay: Overlay,
    newVideo: StandardVideo & { _source: string; _sourceDisplayName: string },
    getVideoUrl: (video: StandardVideo & { _source: string; _sourceDisplayName: string }) => string,
    onComplete: (updatedOverlay: ClipOverlay) => void
  ): Promise<void> => {
    const clipOverlay = currentOverlay as ClipOverlay;
    const videoUrl = getVideoUrl(newVideo);

    // Get actual video duration using media-parser
    let durationInFrames = 200; // fallback
    let mediaSrcDuration: number | undefined;
    
    try {
      const result = await getSrcDuration(videoUrl);
      durationInFrames = result.durationInFrames;
      mediaSrcDuration = result.durationInSeconds;
    } catch (error) {
      console.warn("Failed to get video duration, using fallback:", error);
    }

    // Calculate smart duration
    const newDuration = calculateReplacementDuration(clipOverlay, durationInFrames);

    // Create updated overlay with new video source
    // Reset videoStartTime to 0 so the new video starts from the beginning
    const updatedOverlay: ClipOverlay = {
      ...clipOverlay,
      content: newVideo.thumbnail,
      src: videoUrl,
      mediaSrcDuration,
      durationInFrames: newDuration,
      videoStartTime: 0, // Always reset to start of new video
    };

    // Update the overlay in editor context
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
    
    // Call completion callback
    onComplete(updatedOverlay);
    
    // Exit replace mode
    setIsReplaceMode(false);
  };

  /**
   * Initiate replace mode
   */
  const startReplaceMode = () => {
    setIsReplaceMode(true);
  };

  /**
   * Cancel replace mode
   */
  const cancelReplaceMode = () => {
    setIsReplaceMode(false);
  };

  return {
    isReplaceMode,
    startReplaceMode,
    cancelReplaceMode,
    replaceVideo,
  };
};

