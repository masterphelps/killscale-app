import { useState, useCallback, useEffect, useRef } from 'react';
import { TimelineTrack } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';

interface UseMarqueeSelectionProps {
  timelineRef: React.RefObject<HTMLDivElement>;
  tracks: TimelineTrack[];
  totalDuration: number;
  selectedItemIds: string[];
  onSelectedItemsChange: (itemIds: string[]) => void;
  isDragging?: boolean;
  isContextMenuOpen?: boolean;
}

export const useMarqueeSelection = ({
  timelineRef,
  tracks,
  totalDuration,
  selectedItemIds,
  onSelectedItemsChange,
  isDragging = false,
  isContextMenuOpen = false,
}: UseMarqueeSelectionProps) => {
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStartPoint, setMarqueeStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [marqueeEndPoint, setMarqueeEndPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Throttle marquee mouse move updates to improve performance
  const marqueeThrottleRef = useRef<number | null>(null);

  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
    
      // Only allow left mouse button and prevent marquee during drag or context menu
      if (e.button !== 0 || isDragging || isContextMenuOpen) {
        
        return;
      }

      // Check if we clicked on an empty area (not on an item or timeline markers)
      const target = e.target as HTMLElement;
      if (target.closest('.timeline-item') || 
          target.closest('.timeline-markers-container') ||
          target.closest('[data-timeline-marker]')) {
        return; // Don't start marquee if clicking on an item or timeline markers
      }

      if (timelineRef?.current) {
        e.preventDefault();
        e.stopPropagation();

        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsMarqueeSelecting(true);
        setMarqueeStartPoint({ x, y });
        setMarqueeEndPoint({ x, y });

        // Clear current selection unless Shift is held
        if (!e.shiftKey) {
          onSelectedItemsChange([]);
        } else {
          console.log('Marquee selection preserving current selection (Shift key held)');
        }
      }
    },
    [isDragging, isContextMenuOpen, timelineRef, onSelectedItemsChange]
  );

  const handleMarqueeMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        isMarqueeSelecting &&
        timelineRef?.current &&
        marqueeStartPoint &&
        !isContextMenuOpen
      ) {
        // Cancel previous throttled call
        if (marqueeThrottleRef.current) {
          cancelAnimationFrame(marqueeThrottleRef.current);
        }
        
        // Throttle using requestAnimationFrame for smooth updates
        marqueeThrottleRef.current = requestAnimationFrame(() => {
          const rect = timelineRef.current?.getBoundingClientRect();
          if (!rect) return;
          
          const currentMarqueeEndPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
          setMarqueeEndPoint(currentMarqueeEndPoint);

          // Calculate marquee rectangle
          const marqueeRect = {
            x1: Math.min(marqueeStartPoint.x, currentMarqueeEndPoint.x),
            y1: Math.min(marqueeStartPoint.y, currentMarqueeEndPoint.y),
            x2: Math.max(marqueeStartPoint.x, currentMarqueeEndPoint.x),
            y2: Math.max(marqueeStartPoint.y, currentMarqueeEndPoint.y),
          };

          // Find items within marquee selection
          const newlySelectedIds = new Set<string>();
          const containerRect = timelineRef.current?.getBoundingClientRect();
          if (!containerRect) return;
          
          const containerWidth = containerRect.width;

          tracks.forEach((track, trackIndex) => {
            track.items.forEach((item) => {
              // Calculate item position
              const itemLeftPx = (item.start / totalDuration) * containerWidth;
              const itemRightPx = (item.end / totalDuration) * containerWidth;
              // NOTE: Markers are now in separate container, so Y position is relative to tracks only (no MARKERS_HEIGHT offset)
              const itemTopPx = trackIndex * TIMELINE_CONSTANTS.TRACK_HEIGHT;
              const itemBottomPx = itemTopPx + TIMELINE_CONSTANTS.TRACK_HEIGHT;

              // Check if item overlaps with marquee
              const xOverlaps = marqueeRect.x1 < itemRightPx && marqueeRect.x2 > itemLeftPx;
              const yOverlaps = marqueeRect.y1 < itemBottomPx && marqueeRect.y2 > itemTopPx;

              if (xOverlaps && yOverlaps) {
                newlySelectedIds.add(item.id);
              }
            });
          });

          // Update selection if it changed
          const currentSelectedIds = new Set(selectedItemIds);
          if (
            newlySelectedIds.size !== currentSelectedIds.size ||
            !Array.from(newlySelectedIds).every((id) => currentSelectedIds.has(id))
          ) {
            onSelectedItemsChange(Array.from(newlySelectedIds));
          }
        });
      }
    },
    [
      isMarqueeSelecting,
      timelineRef,
      marqueeStartPoint,
      isContextMenuOpen,
      tracks,
      totalDuration,
      selectedItemIds,
      onSelectedItemsChange,
    ]
  );

  const handleMarqueeMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isMarqueeSelecting) {
        e.stopPropagation();
        
        // Cancel any pending throttled updates
        if (marqueeThrottleRef.current) {
          cancelAnimationFrame(marqueeThrottleRef.current);
          marqueeThrottleRef.current = null;
        }
        
        setIsMarqueeSelecting(false);
        setMarqueeStartPoint(null);
        setMarqueeEndPoint(null);
        return true; // Indicate that marquee handled this event
      }
      return false; // Indicate that marquee did not handle this event
    },
    [isMarqueeSelecting]
  );

  // Reset marquee state when context menu opens or dragging starts
  useEffect(() => {
    if ((isContextMenuOpen || isDragging) && isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStartPoint(null);
      setMarqueeEndPoint(null);
    }
  }, [isContextMenuOpen, isDragging, isMarqueeSelecting]);

  return {
    isMarqueeSelecting,
    marqueeStartPoint,
    marqueeEndPoint,
    handleTimelineMouseDown,
    handleMarqueeMouseMove,
    handleMarqueeMouseUp,
  };
}; 