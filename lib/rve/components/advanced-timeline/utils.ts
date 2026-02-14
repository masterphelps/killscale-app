// Timeline utility functions

// Re-export gap utilities
export { findGapsInTrack } from './utils/gap-utils';

/**
 * Calculate viewport duration based on zoom scale and content duration
 * When zooming out (zoomScale < 1), expand the viewport to show more time
 * When zooming in (zoomScale > 1), keep the viewport at content duration
 */
export const calculateViewportDuration = (contentDuration: number, zoomScale: number): number => {
  if (zoomScale >= 1) {
    return contentDuration;
  }
  // When zoomed out, expand viewport proportionally with no arbitrary cap
  const expansionFactor = 1 / Math.max(zoomScale, 0.0001);
  return contentDuration * expansionFactor;
};

/**
 * Convert frame number to time in seconds with high precision
 */
export const frameToTime = (frame: number, fps: number): number => {
  // Use higher precision calculation and round to nearest millisecond
  const timeInSeconds = frame / fps;
  return Math.round(timeInSeconds * 1000) / 1000;
};

/**
 * Convert time in seconds to frame number with proper rounding
 */
export const timeToFrame = (timeInSeconds: number, fps: number): number => {
  // Round to nearest millisecond first to avoid precision issues
  const preciseTime = Math.round(timeInSeconds * 1000) / 1000;
  return Math.round(preciseTime * fps);
};

/**
 * Calculate mouse position as percentage within timeline bounds
 */
export const calculateMousePosition = (
  clientX: number, 
  timelineRect: DOMRect
): number => {
  const position = ((clientX - timelineRect.left) / timelineRect.width) * 100;
  return Math.max(0, Math.min(100, position));
};

/**
 * Calculate timeline content styles for zooming
 */
export const getTimelineContentStyles = (zoomScale: number) => ({
  width: `${Math.max(100, 100 * zoomScale)}%`,
  minWidth: "100%",
  willChange: "width, transform" as const,
  transform: `translateZ(0)`,
});

/**
 * Clear the CSS custom property for timeline marker position
 * This allows the marker to move dynamically when seeking
 */
export const clearTimelineMarkerPosition = (): void => {
  const markersContainer = document.querySelector('.timeline-markers-container') as HTMLElement;
  if (markersContainer) {
    const rootContainer = markersContainer.closest('.flex.flex-col.h-full') as HTMLElement;
    if (rootContainer) {
      rootContainer.style.removeProperty('--timeline-marker-position');
    }
  }
}; 