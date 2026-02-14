import { useMemo } from "react";
import { Overlay } from "../types";

export const useCompositionDuration = (overlays: Overlay[], fps: number = 30) => {
  // Calculate the total duration in frames based on overlays
  const durationInFrames = useMemo(() => {
    if (!overlays.length) return fps * 1; // Default minimum duration (1 second)

    const maxEndFrame = overlays.reduce((maxEnd, overlay) => {
      const endFrame = overlay.from + overlay.durationInFrames;
      return Math.max(maxEnd, endFrame);
    }, 0);

    // Just use the exact frame count or minimum duration
    return Math.max(maxEndFrame, fps * 1);
  }, [overlays, fps]);

  // Utility functions for duration conversions
  const getDurationInSeconds = () => durationInFrames / fps;
  const getDurationInFrames = () => durationInFrames;

  return {
    durationInFrames,
    durationInSeconds: durationInFrames / fps,
    getDurationInSeconds,
    getDurationInFrames,
    fps,
  };
};
