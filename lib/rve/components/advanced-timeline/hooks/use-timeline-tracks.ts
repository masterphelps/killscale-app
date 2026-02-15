import { useState, useEffect, useCallback, useRef } from 'react';
import { TimelineTrack, TimelineItem } from '../types';
import { closeGapsInTrack, calculateMagneticInsertionPreview, pushItemsDuringResize, createNewItemWithIntelligentPositioning } from '../utils/gap-utils';
import { frameToTime } from '../utils';

const DURATION_TOLERANCE = 0.05; // Tolerance for floating point precision in duration comparisons (50ms)

/** Shallow-compare two track arrays by key item properties to avoid unnecessary state updates */
function tracksAreEqual(a: TimelineTrack[], b: TimelineTrack[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const at = a[i], bt = b[i];
    if (at.id !== bt.id || at.items.length !== bt.items.length) return false;
    for (let j = 0; j < at.items.length; j++) {
      const ai = at.items[j], bi = bt.items[j];
      if (ai.id !== bi.id || ai.start !== bi.start || ai.end !== bi.end || ai.trackId !== bi.trackId) return false;
    }
  }
  return true;
}

export interface UseTimelineTracksProps {
  initialTracks: TimelineTrack[];
  autoRemoveEmptyTracks: boolean;
  onTracksChange?: (tracks: TimelineTrack[]) => void;
  selectedItemIds?: string[]; // Currently selected item IDs
  onSelectedItemsChange?: (itemIds: string[]) => void; // Callback when selection changes
}

export interface UseTimelineTracksReturn {
  tracks: TimelineTrack[];
  setTracks: React.Dispatch<React.SetStateAction<TimelineTrack[]>>;
  removeEmptyTracks: (tracks: TimelineTrack[], shouldRemove?: boolean) => TimelineTrack[];
  handleItemMove: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  handleItemResize: (itemId: string, newStart: number, newEnd: number) => void;
  handleItemsDelete: (itemIds: string[]) => void;
  handleInsertTrackAt: (index: number) => string;
  handleInsertMultipleTracksAt: (index: number, count: number) => string[];
  handleCreateTracksWithItems: (
    index: number, 
    trackItems: Array<{ trackId: string; items: Array<{ itemId: string; start: number; end: number }> }>
  ) => void;
  handleTrackReorder: (fromIndex: number, toIndex: number) => void;
  handleTrackDelete: (trackId: string) => void;
  handleToggleMagnetic: (trackId: string) => void;
  addNewItem: (itemData: {
    type: string;
    label?: string;
    duration?: number;
    color?: string;
    data?: any;
    preferredTrackId?: string;
    preferredStartTime?: number;
  }, currentFrame: number, fps: number) => void;
}

export const useTimelineTracks = ({
  initialTracks,
  autoRemoveEmptyTracks,
  onTracksChange,
  selectedItemIds = [],
  onSelectedItemsChange
}: UseTimelineTracksProps): UseTimelineTracksReturn => {
  const [tracks, setTracks] = useState<TimelineTrack[]>(initialTracks);
  const [isAutoRemoveEnabled, setIsAutoRemoveEnabled] = useState<boolean>(autoRemoveEmptyTracks);
  const prevInitialTracksRef = useRef<TimelineTrack[]>(initialTracks);

  // Keep a stable ref to onTracksChange so we can call it from useEffect
  // without including it in dependency arrays of every handler
  const onTracksChangeRef = useRef(onTracksChange);
  onTracksChangeRef.current = onTracksChange;

  // Flag to distinguish internal track changes (user interactions) from
  // external prop-driven syncs. We only fire onTracksChange for internal changes.
  const isInternalChangeRef = useRef(false);

  // Fire onTracksChange via useEffect (outside render) to avoid
  // "Cannot update EditorProvider while rendering Timeline" warnings.
  const prevTracksRef = useRef<TimelineTrack[]>(tracks);
  useEffect(() => {
    if (isInternalChangeRef.current && !tracksAreEqual(tracks, prevTracksRef.current)) {
      onTracksChangeRef.current?.(tracks);
    }
    prevTracksRef.current = tracks;
    isInternalChangeRef.current = false;
  }, [tracks]);

  // Wrapper that marks the next setTracks as an internal (user-driven) change
  const setTracksInternal = useCallback((updater: React.SetStateAction<TimelineTrack[]>) => {
    isInternalChangeRef.current = true;
    setTracks(updater);
  }, []);

  // Update internal state when props change — but skip if tracks are semantically identical
  // to prevent cascading state updates (overlay→tracks→setTracks→history) that can exceed React's update depth
  useEffect(() => {
    if (!tracksAreEqual(initialTracks, prevInitialTracksRef.current)) {
      prevInitialTracksRef.current = initialTracks;
      setTracks(initialTracks);
    }
  }, [initialTracks]);

  useEffect(() => {
    setIsAutoRemoveEnabled(autoRemoveEmptyTracks);
  }, [autoRemoveEmptyTracks]);

  // Helper function to remove empty tracks
  const removeEmptyTracks = useCallback((tracks: TimelineTrack[], shouldRemove: boolean = isAutoRemoveEnabled): TimelineTrack[] => {
    if (!shouldRemove) return tracks;
    
    // Always keep at least one track, even if empty
    const filteredTracks = tracks.filter(track => track.items.length > 0);
    return filteredTracks.length === 0 ? [tracks[0] || {
      id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: undefined,
      items: [],
      magnetic: false,
      visible: true,
      muted: false,
    }] : filteredTracks;
  }, [isAutoRemoveEnabled]);

  // Add new item method with intelligent positioning
  const addNewItem = useCallback((itemData: {
    type: string;
    label?: string;
    duration?: number;
    color?: string;
    data?: any;
    preferredTrackId?: string;
    preferredStartTime?: number;
  }, currentFrame: number, fps: number) => {
    const currentTime = frameToTime(currentFrame, fps);
    
    try {
      // Create new item with intelligent positioning
      const newItemTemplate = createNewItemWithIntelligentPositioning(
        tracks,
        itemData,
        currentTime
      );
      
      // Generate unique ID
      const newId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      
      const newItem: TimelineItem = {
        ...newItemTemplate,
        id: newId,
      };
      
      setTracksInternal(prevTracks => {
        const newTracks = prevTracks.map(track => {
          if (track.id === newItem.trackId) {
            const updatedTrack = { ...track };

            if (track.magnetic) {
              // For magnetic tracks, use insertion logic
              const preview = calculateMagneticInsertionPreview(
                track.items,
                newItem.end - newItem.start,
                newItem.start
              );
              
              // Rebuild the track with magnetic layout
              const magneticItems = [];
              let currentPosition = 0;
              
              // Add items before insertion
              for (let i = 0; i < preview.insertionIndex; i++) {
                const previewItem = preview.previewItems[i];
                const originalItem = track.items.find(item => item.id === previewItem.id);
                if (originalItem) {
                  magneticItems.push({
                    ...originalItem,
                    start: currentPosition,
                    end: currentPosition + previewItem.duration
                  });
                  currentPosition += previewItem.duration;
                }
              }
              
              // Add the new item at the correct position
              const finalNewItem = {
                ...newItem,
                start: currentPosition,
                end: currentPosition + (newItem.end - newItem.start)
              };
              magneticItems.push(finalNewItem);
              currentPosition += (newItem.end - newItem.start);
              
              // Add items after insertion
              for (let i = preview.insertionIndex; i < preview.previewItems.length; i++) {
                const previewItem = preview.previewItems[i];
                const originalItem = track.items.find(item => item.id === previewItem.id);
                if (originalItem) {
                  magneticItems.push({
                    ...originalItem,
                    start: currentPosition,
                    end: currentPosition + previewItem.duration
                  });
                  currentPosition += previewItem.duration;
                }
              }
              
              updatedTrack.items = magneticItems;
            } else {
              // For non-magnetic tracks, just add the item
              updatedTrack.items = [...track.items, newItem].sort((a, b) => a.start - b.start);
            }
            
            return updatedTrack;
          }
          return track;
        });
        
        // Apply auto-remove empty tracks logic
        const updatedTracks = removeEmptyTracks(newTracks);
        
        // Call external callbacks
        return updatedTracks;
      });

    } catch (error) {
      console.error('Failed to add new item:', error);
    }
  }, [tracks, removeEmptyTracks]);

  // Internal handler for item moves - updates internal state
  const handleItemMove = useCallback((itemId: string, newStart: number, newEnd: number, newTrackId: string) => {
    setTracksInternal(prevTracks => {
      // Find the source track of the moved item for magnetic gap closing
      const sourceTrack = prevTracks.find(track => 
        track.items.some(item => item.id === itemId)
      );
      
      const newTracks = prevTracks.map(track => ({
        ...track,
        items: track.items.filter(item => item.id !== itemId)
      }));
      
      // Find the target track and add the moved item
      const targetTrackIndex = newTracks.findIndex(track => track.id === newTrackId);
      if (targetTrackIndex !== -1) {
        const movedItem = prevTracks
          .flatMap(track => track.items)
          .find(item => item.id === itemId);
        
        if (movedItem) {
          const updatedItem = {
            ...movedItem,
            start: newStart,
            end: newEnd,
            trackId: newTrackId
          };
          
          newTracks[targetTrackIndex].items.push(updatedItem);
          newTracks[targetTrackIndex].items.sort((a, b) => a.start - b.start);
          
          // If target track is magnetic, use the same insertion logic as preview
          const targetTrack = newTracks[targetTrackIndex];
          if (targetTrack.magnetic) {
            // Remove the newly added item temporarily to calculate insertion
            const itemsForInsertion = targetTrack.items.filter(item => item.id !== itemId);
            const itemDuration = updatedItem.end - updatedItem.start;
            
            // Use the same magnetic insertion logic as the preview
            const preview = calculateMagneticInsertionPreview(
              itemsForInsertion,
              itemDuration,
              newStart // Use the intended position
            );
            
            // Rebuild the track with the correct magnetic layout
            const magneticItems = [];
            let currentPosition = 0;
            
            // Add items before insertion
            for (let i = 0; i < preview.insertionIndex; i++) {
              const previewItem = preview.previewItems[i];
              const originalItem = itemsForInsertion.find(item => item.id === previewItem.id);
              if (originalItem) {
                magneticItems.push({
                  ...originalItem,
                  start: currentPosition,
                  end: currentPosition + previewItem.duration
                });
                currentPosition += previewItem.duration;
              }
            }
            
            // Add the moved item at the correct position
            magneticItems.push({
              ...updatedItem,
              start: currentPosition,
              end: currentPosition + itemDuration
            });
            currentPosition += itemDuration;
            
            // Add items after insertion
            for (let i = preview.insertionIndex; i < preview.previewItems.length; i++) {
              const previewItem = preview.previewItems[i];
              const originalItem = itemsForInsertion.find(item => item.id === previewItem.id);
              if (originalItem) {
                magneticItems.push({
                  ...originalItem,
                  start: currentPosition,
                  end: currentPosition + previewItem.duration
                });
                currentPosition += previewItem.duration;
              }
            }
            
            newTracks[targetTrackIndex].items = magneticItems;
          }
        }
      }
      
      // If source track is magnetic, close gaps left behind by the moved item
      if (sourceTrack && sourceTrack.magnetic) {
        const sourceTrackIndex = newTracks.findIndex(track => track.id === sourceTrack.id);
        if (sourceTrackIndex !== -1) {
          const closedGapItems = closeGapsInTrack(newTracks[sourceTrackIndex].items);
          newTracks[sourceTrackIndex].items = closedGapItems;
        }
      }
      
      // Apply auto-remove empty tracks logic
      const updatedTracks = removeEmptyTracks(newTracks);

      return updatedTracks;
    });
  }, [setTracksInternal, removeEmptyTracks]);

  // Internal handler for item resizes - updates internal state
  const handleItemResize = useCallback((itemId: string, newStart: number, newEnd: number) => {
    setTracksInternal(prevTracks => {
      // Handle track-specific resize behavior directly without intermediate state
      const newTracks = prevTracks.map(track => {
        // Check if this track contains the resized item
        const hasResizedItem = track.items.some(item => item.id === itemId);
        if (hasResizedItem) {
          if (track.magnetic) {
            // For magnetic tracks, apply the resize then close gaps
            const updatedItems = track.items.map(item => {
              if (item.id === itemId) {
                const originalStart = item.start;
                const startTimeDelta = newStart - originalStart;
                
                // Update mediaStart for video/audio items when resizing from the left
                let updatedMediaStart = item.mediaStart;
                if ((item.type === 'video' || item.type === 'audio') && item.mediaStart !== undefined) {
                  // When resizing from the left (newStart changed), adjust mediaStart
                  if (startTimeDelta !== 0) {
                    updatedMediaStart = Math.max(0, item.mediaStart + startTimeDelta);
                  }
                }

                // Validate resize against source duration for video/audio items
                if ((item.type === 'video' || item.type === 'audio') && item.mediaSrcDuration !== undefined) {
                  const proposedDuration = newEnd - newStart;
                  const mediaStartOffset = updatedMediaStart || 0;
                  // Account for playback speed when calculating max duration
                  const speed = item.speed || 1;
                  const effectiveSourceDuration = item.mediaSrcDuration / speed;
                  const maxAllowedDuration = effectiveSourceDuration - mediaStartOffset;
                  
                  // If the proposed duration exceeds what's available in the source, clamp it
                  // Use tolerance-based comparison to handle floating point precision issues
                  if (proposedDuration > maxAllowedDuration + DURATION_TOLERANCE) {
                    newEnd = newStart + maxAllowedDuration;
                  }
                }
                
                return {
                  ...item,
                  start: newStart,
                  end: newEnd,
                  mediaStart: updatedMediaStart,
                };
              }
              return item;
            });
            const closedGapItems = closeGapsInTrack(updatedItems);
            return { ...track, items: closedGapItems };
          } else {
            // For non-magnetic tracks, use pushItemsDuringResize (which includes source duration validation)
            const result = pushItemsDuringResize(track.items, itemId, newStart, newEnd);
            return { ...track, items: result.items };
          }
        }
        return track;
      });
      
      // Apply auto-remove empty tracks logic
      const updatedTracks = removeEmptyTracks(newTracks);

      return updatedTracks;
    });
  }, [setTracksInternal, removeEmptyTracks]);

  // Internal handler for item deletion - updates internal state
  const handleItemsDelete = useCallback((itemIds: string[]) => {
    setTracksInternal(prevTracks => {
      const newTracks = prevTracks.map(track => {
        const sourceTrack = track.items.some(item => itemIds.includes(item.id)) ? track : null;
        const updatedTrack = {
          ...track,
          items: track.items.filter(item => !itemIds.includes(item.id))
        };
        
        // If this track is magnetic and had deleted items, close gaps
        if (sourceTrack && track.magnetic) {
          const closedGapItems = closeGapsInTrack(updatedTrack.items);
          updatedTrack.items = closedGapItems;
        }
        
        return updatedTrack;
      });
      
      // Apply auto-remove empty tracks logic
      const updatedTracks = removeEmptyTracks(newTracks);

      return updatedTracks;
    });
  }, [setTracksInternal, removeEmptyTracks]);

  // Insert a new empty track at a given index and return its ID
  const handleInsertTrackAt = useCallback((index: number): string => {
    let newId = '';
    setTracksInternal(prev => {
      const newTrack: TimelineTrack = {
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: undefined,
        items: [],
        magnetic: false,
        visible: true,
        muted: false,
      };
      newId = newTrack.id;
      const next = [...prev];
      const clampedIndex = Math.max(0, Math.min(next.length, index));
      next.splice(clampedIndex, 0, newTrack);
      return next;
    });
    return newId;
  }, [setTracksInternal]);

  // Insert multiple new empty tracks starting at a given index and return their IDs
  const handleInsertMultipleTracksAt = useCallback((index: number, count: number): string[] => {
    const newIds: string[] = [];
    setTracksInternal(prev => {
      const next = [...prev];
      const clampedIndex = Math.max(0, Math.min(next.length, index));
      
      for (let i = 0; i < count; i++) {
        const newTrack: TimelineTrack = {
          id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
          name: undefined,
          items: [],
          magnetic: false,
          visible: true,
          muted: false,
        };
        newIds.push(newTrack.id);
        next.splice(clampedIndex + i, 0, newTrack);
      }
      
      return next;
    });
    return newIds;
  }, [setTracksInternal]);

  // Create multiple tracks with items atomically to avoid auto-remove race condition
  const handleCreateTracksWithItems = useCallback((
    index: number,
    trackItems: Array<{ trackId: string; items: Array<{ itemId: string; start: number; end: number }> }>
  ): void => {
    setTracksInternal(prev => {
      // First, remove all the items from their current tracks
      const next = prev.map(track => ({
        ...track,
        items: track.items.filter(item => 
          !trackItems.some(trackGroup => 
            trackGroup.items.some(itemInfo => itemInfo.itemId === item.id)
          )
        )
      }));

      const clampedIndex = Math.max(0, Math.min(next.length, index));
      
      // Create new tracks with their items atomically
      for (let i = 0; i < trackItems.length; i++) {
        const trackGroup = trackItems[i];
        const newTrack: TimelineTrack = {
          id: trackGroup.trackId,
          name: undefined,
          items: [],
          magnetic: false,
          visible: true,
          muted: false,
        };

        // Add items to the new track
        for (const itemInfo of trackGroup.items) {
          const originalItem = prev
            .flatMap(track => track.items)
            .find(item => item.id === itemInfo.itemId);
          
          if (originalItem) {
            newTrack.items.push({
              ...originalItem,
              start: itemInfo.start,
              end: itemInfo.end,
              trackId: trackGroup.trackId
            });
          }
        }

        // Sort items by start time
        newTrack.items.sort((a, b) => a.start - b.start);
        next.splice(clampedIndex + i, 0, newTrack);
      }
      
      // Apply auto-remove empty tracks logic only at the end
      const updatedTracks = removeEmptyTracks(next);
      return updatedTracks;
    });
  }, [setTracksInternal, removeEmptyTracks]);

  // Track reordering
  const handleTrackReorder = useCallback((fromIndex: number, toIndex: number) => {
    setTracksInternal(prev => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, [setTracksInternal]);

  // Helper method to clear selection for items in a deleted track
  const clearSelectionForDeletedTrack = useCallback((trackToDelete: TimelineTrack) => {
    if (!trackToDelete || selectedItemIds.length === 0 || !onSelectedItemsChange) {
      return;
    }

    const itemsInDeletedTrack = trackToDelete.items.map(item => item.id);
    const selectedItemsInDeletedTrack = selectedItemIds.filter(itemId => 
      itemsInDeletedTrack.includes(itemId)
    );
    
    // If any selected items are in the deleted track, clear them from selection
    if (selectedItemsInDeletedTrack.length > 0) {
      const remainingSelectedItems = selectedItemIds.filter(itemId => 
        !itemsInDeletedTrack.includes(itemId)
      );
      onSelectedItemsChange(remainingSelectedItems);
    }
  }, [selectedItemIds, onSelectedItemsChange]);

  // Track deletion
  const handleTrackDelete = useCallback((trackId: string) => {
    setTracksInternal(prev => {
      // Find the track being deleted to check if it contains selected items
      const trackToDelete = prev.find(t => t.id === trackId);
      
      // Clear selection for any items in the track being deleted
      if (trackToDelete) {
        clearSelectionForDeletedTrack(trackToDelete);
      }
      
      const newTracks = prev.filter(t => t.id !== trackId);
      
      // Apply auto-remove empty tracks logic (but always keep at least one track)
      const updatedTracks = newTracks.length === 0 ? [{
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: undefined,
        items: [],
        magnetic: false,
        visible: true,
        muted: false,
      }] : removeEmptyTracks(newTracks);
      
      return updatedTracks;
    });
  }, [setTracksInternal, removeEmptyTracks, clearSelectionForDeletedTrack]);

  // Toggle magnetic (magic) on a track
  const handleToggleMagnetic = useCallback((trackId: string) => {
    setTracksInternal(prev => {
      const next = prev.map(t => {
        if (t.id === trackId) {
          const updatedTrack = { ...t, magnetic: !t.magnetic };
          
          // If track is becoming magnetic, automatically close gaps
          if (updatedTrack.magnetic) {
            const closedGapItems = closeGapsInTrack(t.items);
            updatedTrack.items = closedGapItems;
          }
          
          return updatedTrack;
        }
        return t;
      });
      return next;
    });
  }, [setTracksInternal]);

  return {
    tracks,
    setTracks,
    removeEmptyTracks,
    handleItemMove,
    handleItemResize,
    handleItemsDelete,
    handleInsertTrackAt,
    handleInsertMultipleTracksAt,
    handleCreateTracksWithItems,
    handleTrackReorder,
    handleTrackDelete,
    handleToggleMagnetic,
    addNewItem,
  };
}; 