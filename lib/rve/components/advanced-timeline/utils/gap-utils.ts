import { TimelineItem } from '../types';

const DURATION_TOLERANCE = 0.05; // Tolerance for floating point precision in duration comparisons (50ms)

/**
 * Finds gaps between timeline items in a single track.
 * @param trackItems - Array of TimelineItem objects in the current track.
 * @returns Array of gap objects, each containing start and end times in seconds.
 *
 * @example
 * // For a track with items: [2-3], [5-8], [10-12]
 * // Returns: [{start: 0, end: 2}, {start: 3, end: 5}, {start: 8, end: 10}]
 *
 * @description
 * This function identifies empty spaces (gaps) between timeline items in a track:
 * 1. Sorts items by start time.
 * 2. Identifies gaps at the start (from 0 to first item).
 * 3. Identifies gaps between items.
 * 4. Note: gaps at the end are not included as they extend to infinity.
 */
export const findGapsInTrack = (
  trackItems: TimelineItem[]
): { start: number; end: number }[] => {
  if (trackItems.length === 0) return [];

  // Sort items by start time
  const sortedItems = [...trackItems].sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];

  // Check for gap at the beginning (from 0 to first item)
  const firstItem = sortedItems[0];
  if (firstItem.start > 0) {
    gaps.push({ start: 0, end: firstItem.start });
  }

  // Find gaps between items
  for (let i = 0; i < sortedItems.length - 1; i++) {
    const currentItem = sortedItems[i];
    const nextItem = sortedItems[i + 1];

    // Gap exists when current item ends before next item starts
    if (currentItem.end < nextItem.start) {
      gaps.push({ start: currentItem.end, end: nextItem.start });
    }
  }

  return gaps;
};

/**
 * Closes all gaps in a track by shifting items to remove spaces between them.
 * This is used when a track becomes "magnetic" to automatically remove all gaps.
 * @param trackItems - Array of TimelineItem objects in the current track.
 * @returns Array of updated TimelineItem objects with gaps closed.
 */
export const closeGapsInTrack = (
  trackItems: TimelineItem[]
): TimelineItem[] => {
  if (trackItems.length === 0) return [];

  // Sort items by start time
  const sortedItems = [...trackItems].sort((a, b) => a.start - b.start);
  const updatedItems: TimelineItem[] = [];
  
  let currentPosition = 0;
  
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    const itemDuration = item.end - item.start;
    
    // Place item at current position (closing any gap)
    const updatedItem: TimelineItem = {
      ...item,
      start: currentPosition,
      end: currentPosition + itemDuration
    };
    
    updatedItems.push(updatedItem);
    
    // Move current position to end of this item
    currentPosition += itemDuration;
  }
  
  return updatedItems;
}; 

/**
 * Calculates where an item would be positioned if dropped on a magnetic track.
 * Returns the start position where the item would snap to (at the end of existing items).
 * @param trackItems - Array of existing TimelineItem objects in the track.
 * @param itemDuration - Duration of the item being dropped.
 * @returns The start position where the item would be placed in a magnetic track.
 */
export const calculateMagneticDropPosition = (
  trackItems: TimelineItem[]
): number => {
  if (trackItems.length === 0) return 0;

  // Sort items by start time and find the end of the last item
  const sortedItems = [...trackItems].sort((a, b) => a.start - b.start);
  const lastItem = sortedItems[sortedItems.length - 1];
  
  return lastItem.end; // Item would be placed right after the last item
}; 

/**
 * Calculates the insertion point and preview layout for a magnetic track.
 * Returns both where to insert and how all items would be repositioned.
 * @param trackItems - Array of existing TimelineItem objects in the track.
 * @param itemDuration - Duration of the item being dropped.
 * @param intendedStart - The position where the user is trying to drop the item.
 * @returns Object with insertion index and preview layout of all items.
 */
export const calculateMagneticInsertionPreview = (
  trackItems: TimelineItem[],
  itemDuration: number,
  intendedStart: number = 0
): {
  insertionIndex: number;
  insertionStart: number;
  previewItems: Array<{ id: string; start: number; end: number; duration: number }>;
} => {
  if (trackItems.length === 0) {
    return {
      insertionIndex: 0,
      insertionStart: 0,
      previewItems: []
    };
  }

  // Sort items by start time
  const sortedItems = [...trackItems].sort((a, b) => a.start - b.start);
  
  // First, calculate where each item would be in a closed-gap layout
  const magneticPositions: Array<{ item: TimelineItem; magneticStart: number; magneticEnd: number }> = [];
  let currentPos = 0;
  
  for (const item of sortedItems) {
    const duration = item.end - item.start;
    magneticPositions.push({
      item,
      magneticStart: currentPos,
      magneticEnd: currentPos + duration
    });
    currentPos += duration;
  }
  
  // Find the best insertion point based on intended drop position vs magnetic positions
  let insertionIndex = 0;
  
  for (let i = 0; i < magneticPositions.length; i++) {
    const { magneticStart, magneticEnd } = magneticPositions[i];
    
    // If intended position is before this item's magnetic middle point, insert before it
    const magneticMiddle = magneticStart + (magneticEnd - magneticStart) / 2;
    if (intendedStart < magneticMiddle) {
      insertionIndex = i;
      break;
    }
    insertionIndex = i + 1; // Insert after this item
  }
  
  // Calculate the preview layout with all items repositioned
  const previewItems: Array<{ id: string; start: number; end: number; duration: number }> = [];
  let currentPosition = 0;
  
  // Add items before insertion point
  for (let i = 0; i < insertionIndex; i++) {
    const { item } = magneticPositions[i];
    const duration = item.end - item.start;
    previewItems.push({
      id: item.id,
      start: currentPosition,
      end: currentPosition + duration,
      duration
    });
    currentPosition += duration;
  }
  
  // Record where the new item would be inserted
  const insertionStart = currentPosition;
  currentPosition += itemDuration; // Skip space for the new item
  
  // Add items after insertion point (shifted to make space)
  for (let i = insertionIndex; i < magneticPositions.length; i++) {
    const { item } = magneticPositions[i];
    const duration = item.end - item.start;
    previewItems.push({
      id: item.id,
      start: currentPosition,
      end: currentPosition + duration,
      duration
    });
    currentPosition += duration;
  }
  
  return {
    insertionIndex,
    insertionStart,
    previewItems
  };
}; 

/**
 * Handles pushing items when resizing in non-magnetic tracks.
 * When an item is resized right (resize-end), push overlapping items.
 * When an item is resized left (resize-start), stop at the boundary of other items.
 * @param trackItems - Array of TimelineItem objects in the current track.
 * @param resizedItemId - ID of the item being resized.
 * @param newStart - New start time of the resized item.
 * @param newEnd - New end time of the resized item.
 * @returns Object with updated items and the actual achievable start/end for the resized item.
 */
export const pushItemsDuringResize = (
  trackItems: TimelineItem[],
  resizedItemId: string,
  newStart: number,
  newEnd: number
): {
  items: TimelineItem[];
  actualStart: number;
  actualEnd: number;
} => {
  if (trackItems.length === 0) {
    return {
      items: [],
      actualStart: newStart,
      actualEnd: newEnd
    };
  }

  // Find the resized item
  const resizedItem = trackItems.find(item => item.id === resizedItemId);
  if (!resizedItem) {
    return {
      items: trackItems,
      actualStart: newStart,
      actualEnd: newEnd
    };
  }

  const originalStart = resizedItem.start;
  const originalEnd = resizedItem.end;
  
  // Determine if we're expanding left, right, or both
  const expandingLeft = newStart < originalStart;
  const expandingRight = newEnd > originalEnd;
  
  let actualStart = newStart;
  const actualEnd = newEnd;
  
  // For left expansion (resize-start), find the boundary and stop there
  if (expandingLeft) {
    // Find the rightmost end of any item that would block the left expansion
    const blockingItems = trackItems.filter(item => 
      item.id !== resizedItemId && 
      item.end > newStart && 
      item.end <= originalStart
    );
    
    if (blockingItems.length > 0) {
      // Stop at the end of the rightmost blocking item
      const rightmostEnd = Math.max(...blockingItems.map(item => item.end));
      actualStart = rightmostEnd;
    }
  }
  
  // Create a copy of all items with the resized item updated to actual position
  let validatedActualEnd = actualEnd;
  const updatedItems = trackItems.map(item => {
    if (item.id === resizedItemId) {
      const startTimeDelta = actualStart - originalStart;
      
      // Update mediaStart for video/audio items when resizing from the left
      let updatedMediaStart = item.mediaStart;
      if ((item.type === 'video' || item.type === 'audio') && item.mediaStart !== undefined) {
        // When resizing from the left (actualStart changed), adjust mediaStart
        if (startTimeDelta !== 0) {
          updatedMediaStart = Math.max(0, item.mediaStart + startTimeDelta);
        }
      }

      // Validate resize against source duration for video/audio items
      if ((item.type === 'video' || item.type === 'audio') && item.mediaSrcDuration !== undefined) {
        const proposedDuration = actualEnd - actualStart;
        const mediaStartOffset = updatedMediaStart || 0;
        // Account for playback speed when calculating max duration
        const speed = item.speed || 1;
        const effectiveSourceDuration = item.mediaSrcDuration / speed;
        const maxAllowedDuration = effectiveSourceDuration - mediaStartOffset;
        
        // If the proposed duration exceeds what's available in the source, clamp it
        // Use tolerance-based comparison to handle floating point precision issues
        if (proposedDuration > maxAllowedDuration + DURATION_TOLERANCE) {
          validatedActualEnd = actualStart + maxAllowedDuration;
        }
      }
      
      return { 
        ...item, 
        start: actualStart, 
        end: validatedActualEnd,
        mediaStart: updatedMediaStart,
      };
    }
    return { ...item };
  });

  // Handle expansion to the right (resize-end) - push items forward
  if (expandingRight) {
    // Sort items by start time for processing
    updatedItems.sort((a, b) => a.start - b.start);
    const resizedNewItem = updatedItems.find(item => item.id === resizedItemId)!;
    
    // Find and push all overlapping items to the right
    for (let i = 0; i < updatedItems.length; i++) {
      const currentItem = updatedItems[i];
      
      // Skip the resized item itself
      if (currentItem.id === resizedItemId) continue;
      
      // If this item overlaps with our resized item
      if (currentItem.start < resizedNewItem.end && currentItem.end > resizedNewItem.start) {
        const pushDistance = resizedNewItem.end - currentItem.start;
        const currentDuration = currentItem.end - currentItem.start;
        
        // Push this item to the right
        currentItem.start = currentItem.start + pushDistance;
        currentItem.end = currentItem.start + currentDuration;
        
        // Cascade push subsequent items
        for (let j = i + 1; j < updatedItems.length; j++) {
          const nextItem = updatedItems[j];
          if (nextItem.id === resizedItemId) continue;
          
          if (currentItem.end > nextItem.start) {
            const cascadePush = currentItem.end - nextItem.start;
            const nextDuration = nextItem.end - nextItem.start;
            
            nextItem.start = nextItem.start + cascadePush;
            nextItem.end = nextItem.start + nextDuration;
          } else {
            break;
          }
        }
      }
    }
  }

  return {
    items: updatedItems,
    actualStart,
    actualEnd: validatedActualEnd
  };
}; 

/**
 * Calculates a preview of how items would be positioned after a resize with pushing in non-magnetic tracks.
 * @param trackItems - Array of existing TimelineItem objects in the track.
 * @param resizedItemId - ID of the item being resized.
 * @param newStart - New start time of the resized item.
 * @param newEnd - New end time of the resized item.
 * @returns Array of preview items showing final positions.
 */
export const calculatePushingResizePreview = (
  trackItems: TimelineItem[],
  resizedItemId: string,
  newStart: number,
  newEnd: number
): Array<{ id: string; start: number; end: number; duration: number }> => {
  const result = pushItemsDuringResize(trackItems, resizedItemId, newStart, newEnd);
  return result.items.map(item => ({
    id: item.id,
    start: item.start,
    end: item.end,
    duration: item.end - item.start
  }));
};

/**
 * Checks if an item of given duration can fit at a specific position in a track without overlapping.
 * @param trackItems - Array of existing TimelineItem objects in the track.
 * @param startTime - Proposed start time for the new item.
 * @param duration - Duration of the new item.
 * @returns True if the item can fit without overlapping existing items.
 */
export const canFitAtPosition = (
  trackItems: TimelineItem[],
  startTime: number,
  duration: number
): boolean => {
  const endTime = startTime + duration;
  
  return !trackItems.some(item => 
    startTime < item.end && endTime > item.start
  );
};

/**
 * Finds the best position for a new item using intelligent placement strategies.
 * @param tracks - Array of all timeline tracks.
 * @param duration - Duration of the new item.
 * @param currentTime - Current playhead position (optional).
 * @param preferredTrackId - Preferred track ID (optional).
 * @param preferredStartTime - Preferred start time (optional).
 * @returns Object with trackId and startTime for optimal placement.
 */
export const findBestPositionForNewItem = (
  tracks: { id: string; items: TimelineItem[]; magnetic?: boolean }[],
  duration: number,
  currentTime?: number,
  preferredTrackId?: string,
  preferredStartTime?: number
): { trackId: string; startTime: number } => {
  
  // Strategy 1: If preferred track and time provided, try that first
  if (preferredTrackId && preferredStartTime !== undefined) {
    const track = tracks.find(t => t.id === preferredTrackId);
    if (track && canFitAtPosition(track.items, preferredStartTime, duration)) {
      return { trackId: preferredTrackId, startTime: preferredStartTime };
    }
  }
  
  // Strategy 2: Try to place at current playhead position if provided
  if (currentTime !== undefined) {
    for (const track of tracks) {
      if (canFitAtPosition(track.items, currentTime, duration)) {
        return { trackId: track.id, startTime: currentTime };
      }
    }
  }
  
  // Strategy 3: Find first available gap that fits
  for (const track of tracks) {
    const gaps = findGapsInTrack(track.items);
    for (const gap of gaps) {
      if (gap.end - gap.start >= duration) {
        return { trackId: track.id, startTime: gap.start };
      }
    }
  }
  
  // Strategy 4: Place at end of least populated track (or track with earliest end time)
  if (tracks.length === 0) {
    // No tracks available - this shouldn't happen in normal usage
    throw new Error('No tracks available for item placement');
  }
  
  const trackEndTimes = tracks.map(track => ({
    trackId: track.id,
    endTime: track.items.length > 0 
      ? Math.max(...track.items.map(item => item.end))
      : 0
  }));
  
  const leastPopulated = trackEndTimes.reduce((min, current) =>
    current.endTime < min.endTime ? current : min
  );
  
  return { trackId: leastPopulated.trackId, startTime: leastPopulated.endTime };
};

/**
 * Creates a new timeline item with intelligent positioning.
 * @param tracks - Array of all timeline tracks.
 * @param itemData - Partial item data with required type and optional positioning hints.
 * @param currentTime - Current playhead position (optional).
 * @returns Complete TimelineItem with intelligent positioning applied.
 */
export const createNewItemWithIntelligentPositioning = (
  tracks: { id: string; items: TimelineItem[]; magnetic?: boolean }[],
  itemData: {
    type: string;
    label?: string;
    duration?: number;
    color?: string;
    data?: any;
    preferredTrackId?: string;
    preferredStartTime?: number;
  },
  currentTime?: number
): Omit<TimelineItem, 'id'> & { trackId: string; start: number; end: number } => {
  
  // Default duration if not provided
  const duration = itemData.duration ?? 3;
  
  // Find the best position
  const { trackId, startTime } = findBestPositionForNewItem(
    tracks,
    duration,
    currentTime,
    itemData.preferredTrackId,
    itemData.preferredStartTime
  );
 
  
  return {
    trackId,
    start: startTime,
    end: startTime + duration,
    label: itemData.label ?? `New ${itemData.type}`,
    type: itemData.type,
    color: '#6b7280',
    data: itemData.data
  };
}; 