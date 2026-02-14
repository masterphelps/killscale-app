import { useCallback, useRef } from 'react';
import { TimelineItem, TimelineTrack } from '../types';
import { TIMELINE_CONSTANTS, SNAPPING_CONFIG } from '../constants';
import useTimelineStore, { 
  DragInfoState, 
  DraggedItemSnapshot, 
  GhostInstanceData 
} from '../stores/use-timeline-store';

import { calculateMagneticInsertionPreview,  pushItemsDuringResize } from '../utils/gap-utils';

interface UseTimelineDragAndDropProps {
  totalDuration: number; // Total timeline duration in seconds
  tracks: TimelineTrack[];
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onItemResize?: (itemId: string, newStart: number, newEnd: number) => void;
  timelineRef: React.RefObject<HTMLDivElement>;
  onInsertTrackAt?: (index: number) => string;
  onInsertMultipleTracksAt?: (index: number, count: number) => string[];
  onCreateTracksWithItems?: (
    index: number, 
    trackItems: Array<{ trackId: string; items: Array<{ itemId: string; start: number; end: number }> }>
  ) => void;
  selectedItemIds?: string[];
}

const MIN_ITEM_DURATION = 0.1; // Minimum item duration in seconds
const DURATION_TOLERANCE = 0.05; // Tolerance for floating point precision in duration comparisons (50ms)

export const useTimelineDragAndDrop = ({
  totalDuration,
  tracks,
  onItemMove,
  onItemResize,
  timelineRef,
  onInsertTrackAt,
  onInsertMultipleTracksAt,
  onCreateTracksWithItems,
  selectedItemIds = [],
}: UseTimelineDragAndDropProps) => {
  const {
    setDraggedItem,
    setGhostElement,
    setFloatingGhost,
    setIsValidDrop,
    setDragInfo,
    getDragInfo,
    resetDragState,
    setIsDragging,
    setInsertionIndex,
    setMagneticPreview,
    setCurrentDragPosition,
  } = useTimelineStore();

  const lastUpdateTime = useRef<number>(0);

  // Enhanced snapping function that checks for both grid and edge snapping
  const snapToGridAndEdges = useCallback((
    value: number, 
    trackIndex: number, 
    excludeIds: string[] = []
  ) => {
    // First, get basic grid snap
    const gridSnapped = Math.round(value / SNAPPING_CONFIG.gridSize) * SNAPPING_CONFIG.gridSize;
    
    // Skip edge snapping for magnetic tracks or if no tracks available
    if (trackIndex < 0 || trackIndex >= tracks.length || tracks[trackIndex].magnetic) {
      return gridSnapped;
    }
    
    // Find all item edges in the target track and adjacent tracks for edge snapping
    const edgePositions: number[] = [];
    
    // Check current track and adjacent tracks for edge positions
    const tracksToCheck = [trackIndex];
    if (trackIndex > 0) tracksToCheck.push(trackIndex - 1);
    if (trackIndex < tracks.length - 1) tracksToCheck.push(trackIndex + 1);
    
    tracksToCheck.forEach(tIndex => {
      if (tIndex >= 0 && tIndex < tracks.length) {
        tracks[tIndex].items.forEach(item => {
          if (!excludeIds.includes(item.id)) {
            edgePositions.push(item.start); // Start edge
            edgePositions.push(item.end);   // End edge
          }
        });
      }
    });
    
    // Find the closest edge within snap tolerance
    let closestEdge: number | null = null;
    let minDistance = SNAPPING_CONFIG.edgeSnapTolerance;
    
    edgePositions.forEach(edge => {
      const distance = Math.abs(value - edge);
      if (distance < minDistance) {
        minDistance = distance;
        closestEdge = edge;
      }
    });
    
    // If we found a close edge and prioritize edge snapping, use it
    if (SNAPPING_CONFIG.prioritizeEdgeSnap && closestEdge !== null) {
      return closestEdge;
    }
    
    // Otherwise, check if grid snap or edge snap is closer to the original value
    if (closestEdge !== null) {
      const gridDistance = Math.abs(value - gridSnapped);
      const edgeDistance = Math.abs(value - closestEdge);
      
      return edgeDistance < gridDistance ? closestEdge : gridSnapped;
    }
    
    return gridSnapped;
  }, [tracks]);

  // Keep the original simple grid snap function for backward compatibility
  const snapToGrid = useCallback((value: number) => {
    return Math.round(value / SNAPPING_CONFIG.gridSize) * SNAPPING_CONFIG.gridSize;
  }, []);

  const validateDropPosition = useCallback(
    (
      targetStart: number,
      targetDuration: number,
      targetTrackIndex: number,
      excludeIds: string[] = [],
      action?: "move" | "resize-start" | "resize-end"
    ): { 
      isValid: boolean; 
      reason?: string; 
      magneticStart?: number;
      magneticPreview?: Array<{ id: string; start: number; end: number; duration: number }>;
    } => {
      const targetEnd = targetStart + targetDuration;

      if (targetStart < 0) {
        return { isValid: false, reason: "Cannot place item before timeline start" };
      }

      if (targetTrackIndex < 0 || targetTrackIndex >= tracks.length) {
        return { isValid: false, reason: "Invalid track" };
      }

      // Check source duration constraints for video/audio items during resize operations
      if (action === "resize-start" || action === "resize-end") {
        const dragInfo = getDragInfo();
        if (dragInfo && dragInfo.selectedItemsSnapshot.length > 0) {
          const primaryItem = dragInfo.selectedItemsSnapshot.find(item => item.id === dragInfo.id);
          if (primaryItem && (primaryItem.type === 'video' || primaryItem.type === 'audio') && primaryItem.mediaSrcDuration !== undefined) {
            let calculatedMediaStart = primaryItem.mediaStart || 0;
            
            // For resize-start operations, adjust mediaStart based on position change
            if (action === "resize-start") {
              const startTimeDelta = targetStart - primaryItem.originalStart;
              calculatedMediaStart = Math.max(0, calculatedMediaStart + startTimeDelta);
            }
            
            // Account for playback speed when calculating max duration
            const speed = primaryItem.speed || 1;
            const effectiveSourceDuration = primaryItem.mediaSrcDuration / speed;
            const maxAllowedDuration = effectiveSourceDuration - calculatedMediaStart;
            
            // Use tolerance-based comparison to handle floating point precision issues
            if (targetDuration > maxAllowedDuration + DURATION_TOLERANCE) {
              return { 
                isValid: false, 
                reason: `Cannot resize beyond source duration (${maxAllowedDuration.toFixed(1)}s available at ${speed}x speed)` 
              };
            }
          }
        }
      }

      const targetTrack = tracks[targetTrackIndex];
      
      // For magnetic tracks, check if multiple items are being dragged
      if (targetTrack.magnetic) {
        const dragInfo = getDragInfo();
        const isMultiDrag = dragInfo && dragInfo.selectedItemsSnapshot.length > 1;
        
        // Prevent multiple items from being dropped onto magnetic tracks
        if (isMultiDrag) {
          return { 
            isValid: false, 
            reason: "Cannot drop multiple items onto magnetic tracks" 
          };
        }
        
        // Single item drag on magnetic track - proceed with normal magnetic logic
        const availableItems = targetTrack.items.filter(item => !excludeIds.includes(item.id));
        const preview = calculateMagneticInsertionPreview(
          availableItems,
          targetDuration,
          targetStart
        );
        
        return { 
          isValid: true, 
          magneticStart: preview.insertionStart,
          magneticPreview: preview.previewItems
        };
      }
      
      // For non-magnetic tracks, handle differently based on action
      if (action === "resize-start" || action === "resize-end") {
        // For resize operations, calculate what's actually achievable and create a pushing preview
        const resizedItemId = excludeIds[0]; // The first excluded ID is the item being resized
        if (resizedItemId) {
          const result = pushItemsDuringResize(
            targetTrack.items,
            resizedItemId,
            targetStart,
            targetStart + targetDuration
          );
          
          // Use the actual achievable position for validation
          return {
            isValid: true,
            magneticStart: result.actualStart, // Return the constrained start position
            magneticPreview: result.items.map((item: TimelineItem) => ({
              id: item.id,
              start: item.start,
              end: item.end,
              duration: item.end - item.start
            }))
          };
        }
      } else {
        // For move operations, check for overlaps as before
        const overlappingItems = targetTrack.items.filter(
          (item) => 
            !excludeIds.includes(item.id) &&
            targetStart < item.end &&
            targetEnd > item.start
        );

        if (overlappingItems.length > 0) {
          return { isValid: false, reason: "Overlaps with existing item" };
        }
      }

      return { isValid: true };
    },
    [totalDuration, tracks, getDragInfo]
  );

  const calculateGhostPosition = useCallback(
    (
      startTime: number,
      duration: number,
      trackIndex: number
    ): GhostInstanceData => {
      const leftPercentage = (startTime / totalDuration) * 100;
      const widthPercentage = (duration / totalDuration) * 100;
      const topPercentage = trackIndex * (100 / tracks.length);

      return {
        id: 'ghost',
        left: Math.max(0, leftPercentage),
        width: Math.max(0.1, widthPercentage),
        top: topPercentage,
      };
    },
    [totalDuration, tracks.length]
  );

  const handleDragStart = useCallback(
    (
      item: TimelineItem,
      clientX: number,
      clientY: number,
      action: "move" | "resize-start" | "resize-end",
      selectedItemIds: string[] = [] // Add selectedItemIds parameter
    ) => {
      
      if (!timelineRef.current) return;

      const itemTrackIndex = tracks.findIndex(track => track.id === item.trackId);
      if (itemTrackIndex === -1) return;

      const itemDuration = item.end - item.start;

      // Create selected items snapshot for multi-drag support
      const selectedItemsSnapshot: DraggedItemSnapshot[] = [];
      
      // Get all items that should be dragged (either just the clicked item or all selected items)
      const itemsToDrag = selectedItemIds.includes(item.id) && selectedItemIds.length > 1 
        ? selectedItemIds 
        : [item.id];

      const allItems = tracks.flatMap(track => track.items);
      
      for (const itemId of itemsToDrag) {
        const draggedItem = allItems.find(i => i.id === itemId);
        if (draggedItem) {
          const draggedItemTrackIndex = tracks.findIndex(track => track.id === draggedItem.trackId);
          if (draggedItemTrackIndex !== -1) {
            selectedItemsSnapshot.push({
              id: draggedItem.id,
              originalStart: draggedItem.start,
              originalDuration: draggedItem.end - draggedItem.start,
              originalRow: draggedItemTrackIndex,
              type: draggedItem.type,
              label: draggedItem.label,
              data: draggedItem.data,
              mediaStart: draggedItem.mediaStart,
              mediaSrcDuration: draggedItem.mediaSrcDuration,
              speed: draggedItem.speed,
            });
          }
        }
      }

      // Find the primary (clicked) item snapshot
      const primarySnapshot = selectedItemsSnapshot.find(s => s.id === item.id);
      if (!primarySnapshot) return;

      const dragInfo: DragInfoState = {
        id: item.id,
        action,
        startX: clientX,
        startY: clientY,
        startPosition: item.start,
        startDuration: itemDuration,
        startRow: itemTrackIndex,
        isValidDrop: true,
        selectedItemsSnapshot,
      };

      setDragInfo(dragInfo);
      setDraggedItem(item);
      setIsDragging(true);

      // Create initial ghost elements for all dragged items at their original positions
      // The handleDrag function will immediately update them to follow the cursor
      const initialGhosts = selectedItemsSnapshot.map(snapshot => {
        const snapshotTrackIndex = snapshot.originalRow;
        return calculateGhostPosition(snapshot.originalStart, snapshot.originalDuration, snapshotTrackIndex);
      });
      
      setGhostElement(initialGhosts);
      setIsValidDrop(true);
      setInsertionIndex(null);
    },
    [timelineRef, tracks, setDragInfo, setDraggedItem, setIsDragging, setGhostElement, setIsValidDrop, calculateGhostPosition, setInsertionIndex]
  );

  const handleDrag = useCallback(
    (clientX: number, clientY: number) => {
      const dragInfo = getDragInfo();
      if (!dragInfo || !timelineRef.current) return;

      // Throttle updates for performance
      const now = performance.now();
      if (now - lastUpdateTime.current < 16) return; // ~60fps
      lastUpdateTime.current = now;

      const timelineRect = timelineRef.current.getBoundingClientRect();
      const deltaX = clientX - dragInfo.startX;
      const deltaY = clientY - dragInfo.startY;

      // Calculate time and track changes
      const deltaTime = (deltaX / timelineRect.width) * totalDuration;
      const trackHeight = TIMELINE_CONSTANTS.TRACK_HEIGHT;
      const rawDeltaTrack = deltaY / trackHeight;
      const deltaTrack = Math.round(rawDeltaTrack);

      let newStart: number;
      let newDuration: number;
      let newTrackIndex: number;

      // For multi-drag, exclude all selected items from collision detection
      const isMultiDrag = dragInfo.selectedItemsSnapshot.length > 1;
      const excludeIds = isMultiDrag 
        ? dragInfo.selectedItemsSnapshot.map(s => s.id)
        : [dragInfo.id];

      // Calculate constrained deltaTrack for multi-drag to prevent items from being squashed together
      let constrainedDeltaTrack = deltaTrack;
      if (isMultiDrag) {
        for (const snapshot of dragInfo.selectedItemsSnapshot) {
          const itemNewTrackIndex = snapshot.originalRow + deltaTrack;
          
          // Check bottom boundary constraint
          if (itemNewTrackIndex >= tracks.length) {
            const maxAllowedDelta = tracks.length - 1 - snapshot.originalRow;
            constrainedDeltaTrack = Math.min(constrainedDeltaTrack, maxAllowedDelta);
          }
          
          // Check top boundary constraint
          if (itemNewTrackIndex < 0) {
            const minAllowedDelta = -snapshot.originalRow;
            constrainedDeltaTrack = Math.max(constrainedDeltaTrack, minAllowedDelta);
          }
        }
      }

      // Calculate target track index using constrained delta for multi-drag
      const effectiveDeltaTrack = isMultiDrag ? constrainedDeltaTrack : deltaTrack;
      const targetTrackIndex = Math.max(0, Math.min(tracks.length - 1, dragInfo.startRow + effectiveDeltaTrack));

      switch (dragInfo.action) {
        case "move":
          newStart = snapToGridAndEdges(
            dragInfo.startPosition + deltaTime, 
            targetTrackIndex, 
            excludeIds
          );
          newDuration = dragInfo.startDuration;
          newTrackIndex = targetTrackIndex;
          break;

        case "resize-start":
          const rawNewStart = dragInfo.startPosition + deltaTime;
          const snappedNewStart = snapToGridAndEdges(rawNewStart, dragInfo.startRow, excludeIds);
          const originalEnd = dragInfo.startPosition + dragInfo.startDuration;
          newDuration = Math.max(MIN_ITEM_DURATION, originalEnd - snappedNewStart);
          newStart = originalEnd - newDuration; // Recalculate to maintain end position
          newTrackIndex = dragInfo.startRow; // Don't change track during resize
          
          // Apply source duration validation for video/audio items
          const primaryItem = dragInfo.selectedItemsSnapshot.find(item => item.id === dragInfo.id);
          if (primaryItem && (primaryItem.type === 'video' || primaryItem.type === 'audio') && primaryItem.mediaSrcDuration !== undefined) {
            const startTimeDelta = newStart - primaryItem.originalStart;
            const calculatedMediaStart = Math.max(0, (primaryItem.mediaStart || 0) + startTimeDelta);
            // Account for playback speed when calculating max duration
            const speed = primaryItem.speed || 1;
            const effectiveSourceDuration = primaryItem.mediaSrcDuration / speed;
            const maxAllowedDuration = effectiveSourceDuration - calculatedMediaStart;
            
            if (newDuration > maxAllowedDuration) {
              newDuration = Math.max(MIN_ITEM_DURATION, maxAllowedDuration);
              newStart = originalEnd - newDuration; // Recalculate start to maintain end position
            }
          }
          break;

        case "resize-end":
          newStart = dragInfo.startPosition;
          const rawNewDuration = dragInfo.startDuration + deltaTime;
          const snappedEndPosition = snapToGridAndEdges(
            dragInfo.startPosition + rawNewDuration, 
            dragInfo.startRow, 
            excludeIds
          );
          newDuration = Math.max(MIN_ITEM_DURATION, snappedEndPosition - newStart);
          newTrackIndex = dragInfo.startRow; // Don't change track during resize
          
          // Apply source duration validation for video/audio items
          const primaryItemEnd = dragInfo.selectedItemsSnapshot.find(item => item.id === dragInfo.id);
          if (primaryItemEnd && (primaryItemEnd.type === 'video' || primaryItemEnd.type === 'audio') && primaryItemEnd.mediaSrcDuration !== undefined) {
            const mediaStartOffset = primaryItemEnd.mediaStart || 0;
            // Account for playback speed when calculating max duration
            const speed = primaryItemEnd.speed || 1;
            const effectiveSourceDuration = primaryItemEnd.mediaSrcDuration / speed;
            const maxAllowedDuration = effectiveSourceDuration - mediaStartOffset;
            
            if (newDuration > maxAllowedDuration) {
              newDuration = Math.max(MIN_ITEM_DURATION, maxAllowedDuration);
            }
          }
          break;

        default:
          return;
      }

      // Ensure boundaries - only prevent going before timeline start (negative time)
      newStart = Math.max(0, newStart);
      
      // Allow extending timeline duration for all operations (move, resize-start, resize-end)
      // The timeline will automatically extend via useCompositionDuration when items go beyond current bounds
      // Only constraint: resize-start operations shouldn't make duration negative
      if (dragInfo.action === "resize-start" && newDuration < MIN_ITEM_DURATION) {
        newDuration = MIN_ITEM_DURATION;
        newStart = (dragInfo.startPosition + dragInfo.startDuration) - newDuration;
      }

      if (isMultiDrag && dragInfo.action !== "move") {
        // Multi-selection only supports move operations, not resize
        return;
      }

      // Validate drop position
      const validation = validateDropPosition(
        newStart,
        newDuration,
        newTrackIndex,
        excludeIds,
        dragInfo.action
      );

      // Handle preview and adjust position BEFORE setting state
      let finalStart = newStart;
      let finalDuration = newDuration;
      let magneticPreviewData = null;
      
      if (validation.magneticPreview) {
        const targetTrack = tracks[newTrackIndex];
        
        if (validation.magneticStart !== undefined) {
          if (targetTrack.magnetic) {
            // Magnetic track with insertion position
            finalStart = validation.magneticStart;
          } else if (dragInfo.action === "resize-start") {
            // Non-magnetic track with constrained resize-start position
            finalStart = validation.magneticStart;
            // Keep the same end position, adjust duration
            const originalEnd = dragInfo.startPosition + dragInfo.startDuration;
            finalDuration = originalEnd - finalStart;
          }
        }
        
        magneticPreviewData = {
          trackId: targetTrack.id,
          previewItems: validation.magneticPreview
        };
        
      }

      // Calculate positions for all items in multi-drag
      let allGhostElements: GhostInstanceData[] = [];
      let allItemsValid = validation.isValid;

      if (isMultiDrag) {
        // Calculate deltas from primary item's movement
        const primarySnapshot = dragInfo.selectedItemsSnapshot.find(s => s.id === dragInfo.id);
        if (!primarySnapshot) return;
        
        let deltaTime = finalStart - primarySnapshot.originalStart;

        // First pass: calculate constrained deltaTime to prevent boundary violations
        let constrainedDeltaTime = deltaTime;
        for (const snapshot of dragInfo.selectedItemsSnapshot) {
          if (snapshot.id !== dragInfo.id) {
            const itemNewStart = snapshot.originalStart + deltaTime;
            
            // Check left boundary constraint (prevent going before timeline start)
            if (itemNewStart < 0) {
              const leftConstraint = -snapshot.originalStart;
              constrainedDeltaTime = Math.max(constrainedDeltaTime, leftConstraint);
            }
            
            // Remove right boundary constraint to allow timeline extension
            // The timeline will automatically extend via useCompositionDuration when items go beyond current bounds
          }
        }

        // Use the constrained delta time for all items
        deltaTime = constrainedDeltaTime;

        // Use the pre-calculated constrained delta track for all items to maintain relative positioning
        const finalDeltaTrack = constrainedDeltaTrack;

        // Create ghost elements for all selected items
        for (const snapshot of dragInfo.selectedItemsSnapshot) {
          let itemNewStart: number;
          let itemNewDuration: number;
          let itemNewTrackIndex: number;

          if (snapshot.id === dragInfo.id) {
            // Primary item uses constrained values (allow extending beyond totalDuration)
            itemNewStart = Math.max(0, snapshot.originalStart + deltaTime);
            itemNewDuration = finalDuration;
            itemNewTrackIndex = Math.max(0, Math.min(tracks.length - 1, snapshot.originalRow + finalDeltaTrack));
          } else {
            // Other items maintain relative position to primary using constrained deltas (allow extending beyond totalDuration)
            itemNewStart = Math.max(0, snapshot.originalStart + deltaTime);
            itemNewDuration = snapshot.originalDuration;
            itemNewTrackIndex = Math.max(0, Math.min(tracks.length - 1, snapshot.originalRow + finalDeltaTrack));
          }

          // Create ghost for this item
          const itemGhost = calculateGhostPosition(itemNewStart, itemNewDuration, itemNewTrackIndex);
          allGhostElements.push(itemGhost);

          // Validate each item's position
          const itemValidation = validateDropPosition(
            itemNewStart,
            itemNewDuration,
            itemNewTrackIndex,
            excludeIds,
            dragInfo.action
          );
          
          if (!itemValidation.isValid) {
            allItemsValid = false;
          }
        }
      } else {
        // Single item drag
        const ghostElement = calculateGhostPosition(finalStart, finalDuration, newTrackIndex);
        allGhostElements = [ghostElement];
      }
      
      // Batch all state updates
      setMagneticPreview(magneticPreviewData);
      setGhostElement(allGhostElements);
      setIsValidDrop(allItemsValid);
      setDragInfo({
        ...dragInfo,
        currentStart: finalStart,
        currentDuration: newDuration,
      });
      
      // Update current drag position for guidelines
      setCurrentDragPosition({
        start: finalStart,
        end: finalStart + finalDuration,
        trackIndex: newTrackIndex,
      });

      // Compute proximity to the nearest row boundary using absolute pointer Y
      const contentRect = timelineRef.current.getBoundingClientRect();
      const contentScrollTop = (timelineRef.current as HTMLDivElement).scrollTop || 0;
      const yWithinContent = clientY - contentRect.top + contentScrollTop;
      // NOTE: Markers are now in a separate container, so yWithinContent is already relative to tracks
      const yWithinTracks = yWithinContent;
      const positionInRows = yWithinTracks / TIMELINE_CONSTANTS.TRACK_HEIGHT;
      const nearestBoundary = Math.round(positionInRows);
      const distanceToBoundary = Math.abs(positionInRows - nearestBoundary);
      const SHOW_THRESHOLD = 0.25; // Show indicator when within 25% of a boundary

      if (distanceToBoundary < SHOW_THRESHOLD && dragInfo.action === "move") {
        // Show floating ghost and insertion indicator when near a row boundary
        const ghostWidthPx = (newDuration / totalDuration) * timelineRect.width;
        const offsetX = 10;
        const offsetY = -10;

        setFloatingGhost({
          position: { x: clientX + offsetX, y: clientY + offsetY },
          width: Math.max(ghostWidthPx, 40),
          isValid: allItemsValid,
          itemData: {
            type: dragInfo.selectedItemsSnapshot[0]?.type,
            label: isMultiDrag 
              ? `${dragInfo.selectedItemsSnapshot.length} items`
              : dragInfo.selectedItemsSnapshot[0]?.label,
          },
        });
        setGhostElement(null); // Hide track-aligned ghost

        const insertionIdx = Math.max(0, Math.min(tracks.length, nearestBoundary));
        setInsertionIndex(insertionIdx);
      } else {
        setFloatingGhost(null);
        setInsertionIndex(null);
      }
    },
    [
      getDragInfo,
      timelineRef,
      totalDuration,
      tracks.length,
      snapToGrid,
      validateDropPosition,
      calculateGhostPosition,
      setGhostElement,
      setIsValidDrop,
      setFloatingGhost,
      setInsertionIndex,
      setDragInfo,
      setMagneticPreview,
      setCurrentDragPosition,
    ]
  );

  const handleDragEnd = useCallback(() => {
    const dragInfo = getDragInfo();
    if (!dragInfo) {
      return;
    }

    const state = useTimelineStore.getState();
    const ghostElements = state.ghostElement;
    const insertionIdx = state.insertionIndex;
    const isMultiDrag = dragInfo.selectedItemsSnapshot.length > 1;

    // Handle insertion of new track for multi-drag
    if ((!ghostElements || ghostElements.length === 0) && insertionIdx !== null) {
      if (isMultiDrag && onCreateTracksWithItems) {
        // For multi-drag, create tracks with items atomically to avoid auto-remove race condition
        const primarySnapshot = dragInfo.selectedItemsSnapshot.find(s => s.id === dragInfo.id);
        if (primarySnapshot) {
          const primaryFinalStart = snapToGrid(dragInfo.currentStart ?? dragInfo.startPosition);
          const deltaTime = primaryFinalStart - primarySnapshot.originalStart;
          
          // Group items by their original track to preserve track relationships
          const itemsByOriginalTrack = new Map<number, DraggedItemSnapshot[]>();
          for (const snapshot of dragInfo.selectedItemsSnapshot) {
            const trackItems = itemsByOriginalTrack.get(snapshot.originalRow) || [];
            trackItems.push(snapshot);
            itemsByOriginalTrack.set(snapshot.originalRow, trackItems);
          }
          
          // Prepare track items data for atomic creation
          const sortedTrackGroups = Array.from(itemsByOriginalTrack.entries()).sort(([a], [b]) => a - b);
          const trackItemsData = sortedTrackGroups.map(([originalTrackIndex, trackItems]) => {
            const trackId = `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${originalTrackIndex}`;
            const items = trackItems.map(snapshot => ({
              itemId: snapshot.id,
              start: Math.max(0, snapshot.originalStart + deltaTime),
              end: Math.max(0, snapshot.originalStart + deltaTime) + snapshot.originalDuration
            }));
            return { trackId, items };
          });
          
          // Create tracks with items atomically
          onCreateTracksWithItems(insertionIdx, trackItemsData);
        }
      } else if (onInsertTrackAt && onItemMove) {
        // Single item insertion
        const finalStart = snapToGrid(dragInfo.currentStart ?? dragInfo.startPosition);
        const finalDuration = snapToGrid(dragInfo.currentDuration ?? dragInfo.startDuration);
        const finalEnd = finalStart + finalDuration;
        const newTrackId = onInsertTrackAt(insertionIdx);
        onItemMove(dragInfo.id, finalStart, finalEnd, newTrackId);
      }
      
      resetDragState();
      return;
    }

    if (!ghostElements || ghostElements.length === 0 || !state.isValidDrop) {
      resetDragState();
      return;
    }


    if (isMultiDrag && dragInfo.action === "move" && onItemMove) {
      // Multi-drag move operation
      for (let i = 0; i < dragInfo.selectedItemsSnapshot.length; i++) {
        const snapshot = dragInfo.selectedItemsSnapshot[i];
        const ghostElement = ghostElements[i];
        
        if (ghostElement) {
          const finalStart = snapToGrid((ghostElement.left / 100) * totalDuration);
          const finalDuration = snapToGrid((ghostElement.width / 100) * totalDuration);
          const finalTrackIndex = Math.round(ghostElement.top * tracks.length / 100);
          const finalEnd = finalStart + finalDuration;
          const targetTrack = tracks[finalTrackIndex];
          
          if (targetTrack) {
            onItemMove(snapshot.id, finalStart, finalEnd, targetTrack.id);
          }
        }
      }
    } else if (!isMultiDrag) {
      // Single item operation
      const ghostElement = ghostElements[0];
      const finalStart = snapToGrid((ghostElement.left / 100) * totalDuration);
      const finalDuration = snapToGrid((ghostElement.width / 100) * totalDuration);
      const finalTrackIndex = Math.round(ghostElement.top * tracks.length / 100);
      const finalEnd = finalStart + finalDuration;

      // Apply the changes
      if (dragInfo.action === "move" && onItemMove) {
        const targetTrack = tracks[finalTrackIndex];
        if (targetTrack) {
          onItemMove(dragInfo.id, finalStart, finalEnd, targetTrack.id);
        }
      } else if (
        (dragInfo.action === "resize-start" || dragInfo.action === "resize-end") &&
        onItemResize
      ) {
        onItemResize(dragInfo.id, finalStart, finalEnd);
      }
    }

    resetDragState();
  }, [
    getDragInfo,
    resetDragState,
    snapToGrid,
    totalDuration,
    tracks,
    onItemMove,
    onItemResize,
    onInsertTrackAt,
    onInsertMultipleTracksAt,
    onCreateTracksWithItems,
  ]);

  // Wrapper for handleDragStart that includes selectedItemIds
  const wrappedHandleDragStart = useCallback(
    (
      item: TimelineItem,
      clientX: number,
      clientY: number,
      action: "move" | "resize-start" | "resize-end"
    ) => {
      handleDragStart(item, clientX, clientY, action, selectedItemIds);
    },
    [handleDragStart, selectedItemIds]
  );

  return {
    handleDragStart: wrappedHandleDragStart,
    handleDrag,
    handleDragEnd,
  };
}; 