import { useCallback, useRef } from 'react';
import { TimelineTrack } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';
import useTimelineStore from '../stores/use-timeline-store';

interface UseNewItemDragProps {
  timelineRef: React.RefObject<HTMLDivElement>;
  totalDuration: number; // Total timeline duration in seconds
  tracks: TimelineTrack[];
  onNewItemDrop?: (
    itemType: string,
    trackIndex: number,
    startTime: number,
    itemData?: {
      duration?: number;
      label?: string;
      data?: any;
    }
  ) => void;
}

// Global state for new item drag (similar to the icon-advanced-timeline implementation)
let currentNewItemDragType: string | null = null;
let currentNewItemDragData: any = null;

export const setCurrentNewItemDragType = (type: string | null) => {
  currentNewItemDragType = type;
};

export const getCurrentNewItemDragType = () => currentNewItemDragType;

export const setCurrentNewItemDragData = (data: any) => {
  currentNewItemDragData = data;
};

export const getCurrentNewItemDragData = () => currentNewItemDragData;

const checkForOverlap = (
  tracks: TimelineTrack[],
  trackIndex: number,
  startTime: number,
  duration: number
): boolean => {
  if (trackIndex < 0 || trackIndex >= tracks.length) return true;
  
  const track = tracks[trackIndex];
  const endTime = startTime + duration;
  
  return track.items.some(
    (item) => startTime < item.end && endTime > item.start
  );
};

export const useNewItemDrag = ({
  timelineRef,
  totalDuration,
  tracks,
  onNewItemDrop,
}: UseNewItemDragProps) => {
  const { setGhostElement, setNewItemDragState, setIsValidDrop } = useTimelineStore();

  // Track last position to avoid unnecessary updates
  const lastPositionRef = useRef<{
    trackIndex: number;
    left: number;
    isValid: boolean;
  } | null>(null);

  const handleNewItemDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault(); // Allow drop

      // Check if this is a new item drag
      if (
        !e.dataTransfer.types.includes("application/json") &&
        !e.dataTransfer.types.some((type) => type.includes("new-item"))
      ) {
        return;
      }

      if (!timelineRef.current) return;

      const timelineRect = timelineRef.current.getBoundingClientRect();
      const relativeX = e.clientX - timelineRect.left;
      const relativeY = e.clientY - timelineRect.top;

      // Calculate horizontal position
      const leftPercentage = Math.max(
        0,
        Math.min(100, (relativeX / timelineRect.width) * 100)
      );

      // Calculate track index
      const headerHeight = TIMELINE_CONSTANTS.MARKERS_HEIGHT;
      const adjustedY = Math.max(0, relativeY - headerHeight);
      const trackHeight = TIMELINE_CONSTANTS.TRACK_HEIGHT;
      const trackIndex = Math.max(
        0,
        Math.min(tracks.length - 1, Math.floor(adjustedY / trackHeight))
      );

      // Calculate width and duration based on item data
      let widthPercentage = 8; // Default width (8% of timeline)
      let duration = totalDuration * 0.08; // Default duration

      try {
        const globalDragData = getCurrentNewItemDragData();
        const dragDataString = e.dataTransfer.getData("application/json");
        let dragData = globalDragData;
        
        if (!dragData && dragDataString) {
          dragData = JSON.parse(dragDataString);
        }

        if (dragData?.duration) {
          duration = dragData.duration;
          widthPercentage = (duration / totalDuration) * 100;
          widthPercentage = Math.max(1, Math.min(50, widthPercentage)); // Reasonable bounds
        }
      } catch (error) {
        // Use default values
      }

      // Calculate start time for collision detection
      const startTime = (leftPercentage / 100) * totalDuration;

      // Check for collisions
      const hasOverlap = checkForOverlap(tracks, trackIndex, startTime, duration);
      const isValidDrop = !hasOverlap;

      // Only update if position or validity changed significantly (throttling)
      const currentPosition = {
        trackIndex,
        left: Math.round(leftPercentage),
        isValid: isValidDrop,
      };
      const lastPosition = lastPositionRef.current;

      if (
        lastPosition &&
        Math.abs(lastPosition.left - currentPosition.left) < 2 && // Less than 2% change
        lastPosition.trackIndex === currentPosition.trackIndex &&
        lastPosition.isValid === currentPosition.isValid
      ) {
        return; // Skip update
      }

      lastPositionRef.current = currentPosition;

      const topPercentage = trackIndex * (100 / tracks.length);

      // Update validity state in store (triggers ghost color change)
      setIsValidDrop(isValidDrop);

      // Update ghost element
      setGhostElement([
        {
          id: "new-item-ghost",
          left: leftPercentage,
          width: widthPercentage,
          top: topPercentage,
        },
      ]);

      // Update new item drag state
      setNewItemDragState({
        isDragging: true,
        itemType: getCurrentNewItemDragType(),
        ghostElement: {
          left: leftPercentage,
          width: widthPercentage,
          top: topPercentage,
        },
        itemData: {
          type: getCurrentNewItemDragType() || undefined,
          label: getCurrentNewItemDragType() || undefined,
          duration,
        },
      });
    },
    [
      timelineRef,
      totalDuration,
      tracks,
      setGhostElement,
      setNewItemDragState,
      setIsValidDrop,
    ]
  );

  const handleNewItemDragEnd = useCallback(() => {
    // Clear ghost and global state when drag ends
    setGhostElement(null);
    lastPositionRef.current = null;
    setCurrentNewItemDragType(null);
    setCurrentNewItemDragData(null);
    setIsValidDrop(true); // Reset to default valid state
    setNewItemDragState({
      isDragging: false,
      itemType: null,
      ghostElement: null,
    });
  }, [setGhostElement, setNewItemDragState, setIsValidDrop]);

  const handleNewItemDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Clear ghost if leaving timeline completely
      if (!timelineRef.current?.contains(e.relatedTarget as Node)) {
        setGhostElement(null);
        lastPositionRef.current = null;
      }
    },
    [timelineRef, setGhostElement]
  );

  const handleNewItemDrop = useCallback(
    (
      itemType: string,
      trackIndex: number,
      startTime: number,
      itemData?: {
        duration?: number;
        label?: string;
        data?: any;
      }
    ) => {
      // Before dropping, check one more time for collisions
      const duration = itemData?.duration || totalDuration * 0.08;

      const hasOverlap = checkForOverlap(tracks, trackIndex, startTime, duration);

      if (hasOverlap) {
        // Don't drop if there would be an overlap
        handleNewItemDragEnd();
        return;
      }

      // Call the provided drop handler
      if (onNewItemDrop) {
        onNewItemDrop(itemType, trackIndex, startTime, itemData);
      }

      // Clear state
      handleNewItemDragEnd();
    },
    [tracks, totalDuration, onNewItemDrop, handleNewItemDragEnd]
  );

  const clearNewItemDragState = useCallback(() => {
    setGhostElement(null);
    lastPositionRef.current = null;
    setCurrentNewItemDragType(null);
    setCurrentNewItemDragData(null);
    setIsValidDrop(true); // Reset to default valid state
    setNewItemDragState({
      isDragging: false,
      itemType: null,
      ghostElement: null,
    });
  }, [setGhostElement, setNewItemDragState, setIsValidDrop]);

  // Compute if we're currently dragging a new item
  const isDraggingNewItem = !!getCurrentNewItemDragType();

  // Get the current ghost element and isValidDrop from the timeline store reactively
  const { ghostElement, isValidDrop: storeIsValidDrop } = useTimelineStore();
  const currentGhostElement = ghostElement?.[0]; // Get the first ghost element

  // Use the store's isValidDrop for reactivity
  const newItemIsValidDrop = storeIsValidDrop;

  return {
    newItemDragState: {
      isDragging: isDraggingNewItem,
      itemType: getCurrentNewItemDragType(),
      ghostElement: currentGhostElement
        ? {
            left: currentGhostElement.left,
            width: currentGhostElement.width,
            top: currentGhostElement.top,
          }
        : null,
      itemData: {
        type: getCurrentNewItemDragType() || undefined,
        label: getCurrentNewItemDragType() || undefined,
      },
    },
    newItemIsValidDrop,
    handleNewItemDragOver,
    handleNewItemDragEnd,
    handleNewItemDragLeave,
    handleNewItemDrop,
    clearNewItemDragState,
  };
}; 