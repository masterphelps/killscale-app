import React from "react";
import { CaptionOverlay } from "../../../types";
import { useCaptionTimeline } from "../../../hooks/use-caption-timeline";
import { CaptionTimelineContainer } from "./caption-timeline-container";

/**
 * Props for the CaptionTimeline component
 * @interface CaptionTimelineProps
 * @property {CaptionOverlay} localOverlay - The current caption overlay being edited
 * @property {Function} setLocalOverlay - Function to update the caption overlay
 * @property {number} currentMs - Current playback position in milliseconds
 */
interface CaptionTimelineProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
  currentMs: number;
}

/**
 * CaptionTimeline Component
 *
 * @component
 * @description
 * Provides an interface for editing and managing caption timing and content.
 * Features include:
 * - Auto-scrolling to active caption
 * - Real-time caption text editing
 * - Inline start and end time editing with validation
 * - Visual feedback for active/upcoming/past captions
 * - Automatic word timing distribution
 * - Overlap detection and timing validation
 *
 * The component handles both the visual representation and editing
 * functionality for caption sequences with comprehensive timing controls.
 *
 * @example
 * ```tsx
 * <CaptionTimeline
 *   localOverlay={captionOverlay}
 *   setLocalOverlay={handleOverlayUpdate}
 *   currentMs={1000}
 * />
 * ```
 */
export const CaptionTimeline: React.FC<CaptionTimelineProps> = ({
  localOverlay,
  setLocalOverlay,
  currentMs,
}) => {
  const {
    containerRef,
    activeCaptionRef,
    timingErrors,
    getInputValue,
    handleInputChange,
    handleCaptionTextChange,
    handleTimingChange,
  } = useCaptionTimeline({
    localOverlay,
    setLocalOverlay,
    currentMs,
  });

  return (
    <CaptionTimelineContainer
      localOverlay={localOverlay}
      currentMs={currentMs}
      containerRef={containerRef}
      activeCaptionRef={activeCaptionRef}
      timingErrors={timingErrors}
      getInputValue={getInputValue}
      onInputChange={handleInputChange}
      onTimingChange={handleTimingChange}
      onTextChange={handleCaptionTextChange}
    />
  );
};
