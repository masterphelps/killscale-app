import React from "react";
import { TIMELINE_CONSTANTS } from "../constants";

interface GhostElementProps {
  left: number;
  width: number;
  top: number;
  isTransitioning?: boolean;
}

interface TimelineGhostElementProps {
  ghostElement: GhostElementProps;
  rowIndex: number;
  trackCount: number;
  isValidDrop?: boolean;
  isFloating?: boolean;
  floatingPosition?: { x: number; y: number };
  itemData?: {
    type?: string;
    label?: string;
  };
}

// Pre-calculate gradients to avoid recalculation on each render
const BLUE_GRADIENT =
  "repeating-linear-gradient(45deg, rgba(59, 130, 246, 0.8), rgba(59, 130, 246, 0.8) 10px, rgba(59, 130, 246, 0.7) 10px, rgba(59, 130, 246, 0.7) 20px)";
const RED_GRADIENT =
  "repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.8), rgba(239, 68, 68, 0.8) 10px, rgba(239, 68, 68, 0.7) 10px, rgba(239, 68, 68, 0.7) 20px)";

/**
 * Renders a ghost element on the timeline during drag-and-drop operations.
 * This component provides a visual cue for where an element will be placed if dropped.
 * It changes appearance based on whether the drop target is valid.
 *
 * Supports two modes:
 * 1. Row-aligned mode (original): Ghost snaps to specific rows
 * 2. Floating mode (new): Ghost follows mouse position exactly for smoother transitions
 */
export const TimelineGhostElement: React.FC<TimelineGhostElementProps> = ({
  ghostElement,
  rowIndex,
  trackCount,
  isValidDrop = true,
  isFloating = false,
  floatingPosition,
  itemData,
}) => {
  if (isFloating) {
    return (
      <div
        className="fixed border border-gray-600 rounded-[3px] pointer-events-none  z-[9999] flex items-center justify-center"
        style={{
          left: floatingPosition?.x || 0,
          top: floatingPosition?.y || 0,
          width: `100px`,
          height: `${TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT}px`,
          backgroundImage: BLUE_GRADIENT,
          willChange: "transform",
          transform: "translate(-50%, -50%)",
        }}
      >
        {itemData && (
          <div className="text-xs font-light text-white/90 text-center px-2 truncate">
          </div>
        )}
      </div>
    );
  }

  // Use the same calculation as ghost creation to avoid floating-point precision issues
  // Ghost creation: trackIndex * (100 / trackCount) = ghost.top
  // So: trackIndex = ghost.top * trackCount / 100
  if (Math.round(ghostElement.top * trackCount / 100) !== rowIndex) {
    return null;
  }

  return (
    <div
      className="absolute border border-black/30 top-1/2 transform -translate-y-1/2 rounded-[3px] pointer-events-none  border border-black/20"
      style={{
        left: `${ghostElement.left}%`,
        width: `${Math.max(ghostElement.width, 0.1)}%`,
        height: `${TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT}px`,
        zIndex: 50,
        backgroundImage: isValidDrop ? BLUE_GRADIENT : RED_GRADIENT,
        willChange: "transform",
      }}
    />
  );
}; 