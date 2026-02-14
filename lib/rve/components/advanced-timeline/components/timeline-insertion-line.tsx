import React from 'react';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineInsertionLineProps {
  insertionIndex: number | null;
  trackCount: number;
}

/**
 * Timeline insertion line component that shows where a new track would be inserted
 */
export const TimelineInsertionLine: React.FC<TimelineInsertionLineProps> = ({
  insertionIndex,
  trackCount,
}) => {
  if (insertionIndex === null) {
    return null;
  }

  return (
    <div
      className="absolute left-0 right-0 border-t-2 border-blue-500 pointer-events-none transition-[top] duration-75"
      style={
        insertionIndex === trackCount
          ? { bottom: 0, zIndex: 60 }
          : {
              // No MARKERS_HEIGHT offset needed - markers are now in a separate container
              top: `${insertionIndex * TIMELINE_CONSTANTS.TRACK_HEIGHT}px`,
              zIndex: 60,
            }
      }
    />
  );
};
