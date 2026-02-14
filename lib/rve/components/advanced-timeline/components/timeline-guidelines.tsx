import React, { useMemo } from 'react';
import { TimelineTrack, TimelineItem } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineGuidelinesProps {
  tracks: TimelineTrack[];
  totalDuration: number;
  isDragging: boolean;
  draggedItemId?: string;
  currentDragPosition?: {
    start: number;
    end: number;
    trackIndex: number;
  } | null;
}

interface Guideline {
  position: number; // Time position in seconds
  type: 'start' | 'end';
  fromTrackIndex: number;
  itemId: string;
  color: string;
}

/**
 * Component that renders vertical alignment guidelines during drag operations
 * Shows when the dragged item's start or end aligns with other items' edges
 */
export const TimelineGuidelines: React.FC<TimelineGuidelinesProps> = ({
  tracks,
  totalDuration,
  isDragging,
  draggedItemId,
  currentDragPosition,
}) => {
  // Calculate alignment guidelines based on current drag position
  const guidelines = useMemo((): Guideline[] => {
    if (!isDragging || !currentDragPosition || !draggedItemId) {
      return [];
    }

    const guidelines: Guideline[] = [];
    const snapTolerance = 0.05; // Much tighter tolerance - only show when very close

    // Get all items from all tracks except the dragged item and items on the current track
    const allItems: Array<TimelineItem & { trackIndex: number }> = [];
    
    tracks.forEach((track, trackIndex) => {
      // Skip the track where the item is being dragged to avoid self-alignment
      if (trackIndex === currentDragPosition.trackIndex) return;
      
      track.items.forEach(item => {
        // Skip the dragged item itself
        if (item.id === draggedItemId) return;
        
        allItems.push({ ...item, trackIndex });
      });
    });

    // Only check the closest alignments - find the best match for start and end
    const alignmentPositions: number[] = [];

    allItems.forEach(item => {
      // Check if dragged item's start aligns with this item's start or end
      const startToStart = Math.abs(currentDragPosition.start - item.start);
      const startToEnd = Math.abs(currentDragPosition.start - item.end);
      
      if (startToStart <= snapTolerance) {
        alignmentPositions.push(item.start);
      }
      
      if (startToEnd <= snapTolerance) {
        alignmentPositions.push(item.end);
      }

      // Check if dragged item's end aligns with this item's start or end
      const endToStart = Math.abs(currentDragPosition.end - item.start);
      const endToEnd = Math.abs(currentDragPosition.end - item.end);
      
      if (endToStart <= snapTolerance) {
        alignmentPositions.push(item.start);
      }
      
      if (endToEnd <= snapTolerance) {
        alignmentPositions.push(item.end);
      }
    });

    // Remove duplicates and create guidelines
    const uniquePositions = Array.from(new Set(alignmentPositions));
    uniquePositions.forEach(position => {
      guidelines.push({
        position,
        type: 'start',
        fromTrackIndex: 0,
        itemId: `alignment-${position}`,
        color: '', // Will use CSS classes for theme-aware colors
      });
    });

    return guidelines;
  }, [tracks, isDragging, currentDragPosition, draggedItemId, totalDuration]);

  if (!isDragging || guidelines.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 55 }}>
      {guidelines.map((guideline, index) => {
        const leftPercentage = (guideline.position / totalDuration) * 100;
        
        return (
          <div
            key={`guideline-${guideline.position}-${index}`}
            className="absolute transition-opacity duration-150 border-l border-dashed border-gray-800 dark:border-white"
            style={{
              left: `${leftPercentage}%`,
              top: 0, // Start from top since markers are in a separate container
              bottom: 0,
              width: '1px',
              transform: 'translateX(-0.5px)', // Center the line
            }}
          />
        );
      })}
    </div>
  );
}; 