import React from "react";

/**
 * Props for the TimelineMarker component.
 */
interface TimelineMarkerProps {
  /** Current frame position */
  currentFrame: number;
  
  /** Total duration in frames */
  totalDurationInFrames: number;
  
  /** Zoom scale for calculating position */
  zoomScale?: number;
  
  /** FPS for high-precision time calculation */
  fps?: number;
  
  /** Total duration in seconds for high-precision positioning */
  totalDuration?: number;
}

/**
 * TimelineMarker component displays the current playback position as a vertical line.
 * Shows a red line with a triangle pointer at the top to indicate current frame.
 * 
 * PERFORMANCE OPTIMIZED: Uses CSS custom properties for positioning to match ghost marker exactly.
 * Position is controlled via --timeline-marker-position CSS custom property.
 * Falls back to calculated position if CSS variable is not set.
 */
export const TimelineMarker: React.FC<TimelineMarkerProps> = ({
  currentFrame,
  totalDurationInFrames,
  fps,
  totalDuration,
}) => {
  // Calculate fallback position for when CSS custom property isn't set
  // Use time-based calculation for higher precision if fps and totalDuration are available
  let fallbackPosition: number;
  
  if (fps && totalDuration && fps > 0 && totalDuration > 0) {
    // High-precision calculation: convert frame to time, then to percentage
    const currentTime = currentFrame / fps;
    fallbackPosition = (currentTime / totalDuration) * 100;
  } else {
    // Fallback to frame-based calculation
    fallbackPosition = totalDurationInFrames > 0 
      ? (currentFrame / totalDurationInFrames) * 100 
      : 0;
  }

  // Clamp position between 0 and 100
  const clampedPosition = Math.max(0, Math.min(100, fallbackPosition));

  return (
    <div
      className="absolute top-0 z-50"
      data-timeline-marker="playhead"
      style={{
        // Use CSS custom property if set (for exact positioning after clicks),
        // otherwise fall back to calculated position
        left: `var(--timeline-marker-position, ${clampedPosition}%)`,
        transform: "translateX(-50%)",
        height: "100%",
        width: "2px",
        pointerEvents: "none", // No interaction to prevent interference with resizing
      }}
    >
      {/* Main marker line */}
      <div
        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[2px] bg-red-500 shadow-lg"
        style={{
          height: "100%",
        }}
      />

      {/* Clean rectangular marker head */}
      <div
        className="absolute -top-[2px] left-1/2 transform -translate-x-1/2 w-2.5 h-5 bg-red-500 rounded-sm shadow-sm"
      />
    </div>
  );
}; 