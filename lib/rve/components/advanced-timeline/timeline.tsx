import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { TimelineHeader, TimelineTrackHandles, TimelineTrackGutter, TimelineHorizontalGutter, TimelineContent } from './components';
import { 
  useTimelineZoom, 
  useTimelineInteractions, 
  useTimelineTracks,
  useTimelineSettings,
  useTimelineComposition,
  useTimelineOperations,
  useTimelineHistory,
  useTimelineShortcuts,
  useMobileDetection
} from './hooks';
import { TimelineProps, TimelineRef } from './types';
import { clearTimelineMarkerPosition } from './utils';

/**
 * Timeline Component with Comprehensive Theming Support
 * 
 * This component now uses CSS custom properties for theming, providing:
 * - Consistent color usage across light, dark, and RVE themes
 * - Smooth transitions between theme changes
 * - Proper semantic color mapping for timeline elements
 * 
 * Theme Variables Used:
 * - --background: Main timeline container background
 * - --surface: Timeline content area background
 * - --surface-elevated: Track handles and header backgrounds
 * - --border: All border colors
 * - --timeline-row: Individual track row backgrounds
 * - --timeline-tick: Marker tick colors
 * - --timeline-item-selected-border: Selected timeline item borders
 * - --interactive-hover: Hover states for interactive elements
 * - --interactive-pressed: Active/pressed states
 * - --primary-50/300: Drop target highlighting
 * - --text-secondary: Marker labels
 * - --text-disabled: Disabled/overflow text
 */

// Re-export types for backward compatibility
export type { TimelineItem, TimelineTrack, TimelineProps } from './types';

export const Timeline = forwardRef<TimelineRef, TimelineProps>(({ 
  tracks: initialTracks, 
  totalDuration, 
  currentFrame = 0,
  fps = 30,
  onFrameChange,
  onItemMove,
  onItemResize,
  onItemSelect,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  onSelectedItemsChange,
  onTracksChange,
  onAddNewItem,
  onNewItemDrop,
  showZoomControls = false,
  isPlaying = false,
  onPlay,
  onPause,
  onSeekToStart,
  onSeekToEnd,
  showPlaybackControls = false,
  playbackRate = 1,
  setPlaybackRate,
  autoRemoveEmptyTracks = true,
  onAutoRemoveEmptyTracksChange,
  showTimelineGuidelines = true,
  showUndoRedoControls = false,
  hideItemsOnDrag = true,
  enableTrackDrag = true,
  enableMagneticTrack = true,
  enableTrackDelete = true,
  // Undo/Redo props from parent
  canUndo: parentCanUndo,
  canRedo: parentCanRedo,
  onUndo: parentOnUndo,
  onRedo: parentOnRedo,
  // Aspect ratio props
  aspectRatio,
  onAspectRatioChange,
  showAspectRatioControls = false,
  // Update present history ref
  updatePresentHistoryRef,
}, ref) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Detect mobile devices to adjust UX behavior
  const { isMobile } = useMobileDetection();
  
  // On mobile devices, don't hide items during drag to maintain better UX
  const effectiveHideItemsOnDrag = isMobile ? false : hideItemsOnDrag;
  
  // Initialize zoom hook first
  const { 
    zoomScale, 
    setZoomScale, 
    handleWheelZoom, 
    resetZoom,
    startSliderDrag,
    endSliderDrag,
  } = useTimelineZoom(
    timelineRef, 
    currentFrame, 
    fps, 
    totalDuration // Pass totalDuration instead of viewportDuration
  );

  // Initialize other hooks
  const {
    ghostMarkerPosition,
    isDragging,
    handleMouseMove,
    handleMouseLeave,
  } = useTimelineInteractions(timelineRef, zoomScale);
  
  const {
    isAutoRemoveEnabled,
    isSplittingEnabled,
    handleToggleAutoRemoveEmptyTracks,
    handleToggleSplitting,
  } = useTimelineSettings({ 
    autoRemoveEmptyTracks, 
    onAutoRemoveEmptyTracksChange 
  });
  
  const {
    tracks,
    setTracks,
    handleItemMove: internalItemMove,
    handleItemResize: internalItemResize,
    handleItemsDelete: internalItemsDelete,
    handleInsertTrackAt,
    handleInsertMultipleTracksAt,
    handleCreateTracksWithItems,
    handleTrackReorder,
    handleTrackDelete,
    handleToggleMagnetic,
    addNewItem,
  } = useTimelineTracks({ 
    initialTracks, 
    autoRemoveEmptyTracks: isAutoRemoveEnabled, 
    onTracksChange,
    selectedItemIds,
    onSelectedItemsChange
  });

  // Get composition data
  const { compositionDuration, viewportDuration, currentTime } = useTimelineComposition({
    tracks,
    totalDuration,
    currentFrame,
    fps,
    zoomScale,
  });

  // Timeline history for undo/redo
  const {
    undo: internalUndo,
    redo: internalRedo,
    canUndo: internalCanUndo,
    canRedo: internalCanRedo,
  } = useTimelineHistory(tracks, setTracks, onTracksChange, updatePresentHistoryRef);

  // Use parent undo/redo props if provided, otherwise use internal timeline history
  const undo = parentOnUndo || internalUndo;
  const redo = parentOnRedo || internalRedo;
  const canUndo = parentCanUndo !== undefined ? parentCanUndo : internalCanUndo;
  const canRedo = parentCanRedo !== undefined ? parentCanRedo : internalCanRedo;

  // Create handlePlayPause function for keyboard shortcuts
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause?.();
    } else {
      onPlay?.();
    }
  }, [isPlaying, onPlay, onPause]);

  // Setup keyboard shortcuts
  useTimelineShortcuts({
    handlePlayPause,
    undo,
    redo,
    canUndo,
    canRedo,
    zoomScale,
    setZoomScale,
  });
  
  const {
    handleExternalItemMove,
    handleExternalItemResize,
    handleExternalItemsDelete,
    handleExternalItemsDuplicate,
    handleExternalItemSplit,
    handleExternalAddNewItem,
  } = useTimelineOperations({
    onItemMove,
    onItemResize,
    onDeleteItems,
    onDuplicateItems,
    onSplitItems,
    onAddNewItem,
  });

  // Manage context menu state
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  
  const handleContextMenuOpenChange = useCallback((isOpen: boolean) => {
    setIsContextMenuOpen(isOpen);
  }, []);

  // Combined handlers that call both internal and external callbacks
  const handleCombinedItemMove = useCallback((itemId: string, newStart: number, newEnd: number, newTrackId: string) => {
    internalItemMove(itemId, newStart, newEnd, newTrackId);
    handleExternalItemMove(itemId, newStart, newEnd, newTrackId);
  }, [internalItemMove, handleExternalItemMove]);

  // Helper function to check if playhead is over the selected item
  const isPlayheadOverSelectedItem = useCallback(() => {
    if (selectedItemIds.length !== 1) return false;

    const selectedItemId = selectedItemIds[0];
    const currentTimeInSeconds = currentFrame / fps;
    
    // Find the selected item across all tracks
    for (const track of tracks) {
      const item = track.items.find(item => item.id === selectedItemId);
      if (item) {
        // Check if the current playhead is within the item's time range
        return currentTimeInSeconds >= item.start && currentTimeInSeconds <= item.end;
      }
    }
    return false;
  }, [selectedItemIds, currentFrame, fps, tracks]);

  // Handler for splitting selected item at current playhead position
  const handleSplitAtSelection = useCallback(() => {
    if (selectedItemIds.length !== 1) {
      console.warn('Split at selection requires exactly one selected item');
      return;
    }

    const selectedItemId = selectedItemIds[0];
    const currentTimeInSeconds = currentFrame / fps;
    
    // Find the selected item across all tracks
    let selectedItem = null;
    for (const track of tracks) {
      const item = track.items.find(item => item.id === selectedItemId);
      if (item) {
        selectedItem = item;
        break;
      }
    }

    if (!selectedItem) {
      console.warn('Selected item not found in tracks');
      return;
    }

    // Check if the current playhead is within the item's time range
    if (currentTimeInSeconds < selectedItem.start || currentTimeInSeconds > selectedItem.end) {
      console.warn('Current playhead is not within the selected item\'s time range');
      return;
    }

    // Check minimum segment duration (same as existing splitting logic)
    const minSegmentDuration = 0.016; // ~1 frame at 60fps
    const leftSegmentDuration = currentTimeInSeconds - selectedItem.start;
    const rightSegmentDuration = selectedItem.end - currentTimeInSeconds;

    if (leftSegmentDuration < minSegmentDuration || rightSegmentDuration < minSegmentDuration) {
      console.warn('Split rejected: segments would be too small', {
        leftSegment: leftSegmentDuration,
        rightSegment: rightSegmentDuration,
        minRequired: minSegmentDuration
      });
      return;
    }

    // Perform the split
    handleExternalItemSplit(selectedItemId, currentTimeInSeconds);
  }, [selectedItemIds, currentFrame, fps, tracks, handleExternalItemSplit]);

  const handleCombinedItemResize = useCallback((itemId: string, newStart: number, newEnd: number) => {
    internalItemResize(itemId, newStart, newEnd);
    handleExternalItemResize(itemId, newStart, newEnd);
  }, [internalItemResize, handleExternalItemResize]);

  const handleCombinedItemsDelete = useCallback((itemIds: string[]) => {
    internalItemsDelete(itemIds);
    handleExternalItemsDelete(itemIds);
  }, [internalItemsDelete, handleExternalItemsDelete]);

  const handleCombinedAddNewItem = useCallback((itemData: {
    type: string;
    label?: string;
    duration?: number;
    color?: string;
    data?: any;
    preferredTrackId?: string;
    preferredStartTime?: number;
  }) => {
    const createdItem = addNewItem(itemData, currentFrame, fps) as any;
    if (createdItem) {
      handleExternalAddNewItem({
        ...itemData,
        trackId: createdItem.trackId,
        start: createdItem.start,
        end: createdItem.end,
      });
    }
  }, [addNewItem, currentFrame, fps, handleExternalAddNewItem]);

  // Enhanced auto-remove handler that applies changes immediately
  const handleEnhancedToggleAutoRemoveEmptyTracks = useCallback((enabled: boolean) => {
    handleToggleAutoRemoveEmptyTracks(enabled);
    
    // If enabling auto-remove, immediately clean up empty tracks
    if (enabled && onTracksChange) {
      const filteredTracks = tracks.filter(track => track.items.length > 0);
      const updatedTracks = filteredTracks.length === 0 ? [tracks[0] || {
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: undefined,
        items: [],
      }] : filteredTracks;
      onTracksChange(updatedTracks);
    }
  }, [handleToggleAutoRemoveEmptyTracks, tracks, onTracksChange]);

  // Scroll methods for programmatic scrolling
  const scrollToTop = useCallback(() => {
    const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container');
    const handlesScrollContainer = document.querySelector('.track-handles-scroll');
    
    if (tracksScrollContainer) {
      tracksScrollContainer.scrollTop = 0;
    }
    if (handlesScrollContainer) {
      handlesScrollContainer.scrollTop = 0;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container');
    const handlesScrollContainer = document.querySelector('.track-handles-scroll');
    
    if (tracksScrollContainer) {
      tracksScrollContainer.scrollTop = tracksScrollContainer.scrollHeight;
    }
    if (handlesScrollContainer) {
      handlesScrollContainer.scrollTop = handlesScrollContainer.scrollHeight;
    }
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addNewItem: handleCombinedAddNewItem,
    scroll: {
      scrollToTop,
      scrollToBottom,
    },
  }), [handleCombinedAddNewItem, scrollToTop, scrollToBottom]);

  // Add wheel zoom event listener
  useEffect(() => {
    const element = timelineRef?.current;
    if (!element) return;

    element.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => element.removeEventListener("wheel", handleWheelZoom);
  }, [handleWheelZoom]);

  // Synchronize vertical scroll between track handles and tracks
  // Note: Gutter syncs independently with tracks in timeline-track-gutter.tsx
  useEffect(() => {
    const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container');
    const handlesScrollContainer = document.querySelector('.track-handles-scroll');
    
    if (!tracksScrollContainer || !handlesScrollContainer) return;

    const handleTracksScroll = () => {
      handlesScrollContainer.scrollTop = tracksScrollContainer.scrollTop;
    };

    const handleHandlesScroll = () => {
      tracksScrollContainer.scrollTop = handlesScrollContainer.scrollTop;
    };

    tracksScrollContainer.addEventListener('scroll', handleTracksScroll);
    handlesScrollContainer.addEventListener('scroll', handleHandlesScroll);

    return () => {
      tracksScrollContainer.removeEventListener('scroll', handleTracksScroll);
      handlesScrollContainer.removeEventListener('scroll', handleHandlesScroll);
    };
  }, [tracks]); // Re-sync when tracks change

  // Synchronize horizontal scroll between markers and tracks
  useEffect(() => {
    const markersScrollContainer = document.querySelector('.timeline-markers-wrapper');
    const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container');
    
    if (!markersScrollContainer || !tracksScrollContainer) return;

    let isMarkersScrolling = false;
    let isTracksScrolling = false;

    const handleMarkersScroll = () => {
      if (isTracksScrolling) {
        isTracksScrolling = false;
        return;
      }
      isMarkersScrolling = true;
      tracksScrollContainer.scrollLeft = markersScrollContainer.scrollLeft;
    };

    const handleTracksScroll = () => {
      if (isMarkersScrolling) {
        isMarkersScrolling = false;
        return;
      }
      isTracksScrolling = true;
      markersScrollContainer.scrollLeft = tracksScrollContainer.scrollLeft;
    };

    markersScrollContainer.addEventListener('scroll', handleMarkersScroll);
    tracksScrollContainer.addEventListener('scroll', handleTracksScroll);

    return () => {
      markersScrollContainer.removeEventListener('scroll', handleMarkersScroll);
      tracksScrollContainer.removeEventListener('scroll', handleTracksScroll);
    };
  }, [tracks]); // Re-sync when tracks change

  // Clear the CSS custom property for timeline marker position during playback
  // This allows the marker to move dynamically with currentFrame during playback
  useEffect(() => {
    if (isPlaying) {
      // The CSS variable is set on the timeline container by timeline-markers when clicking
      // We need to clear it during playback so the marker can move freely
      clearTimelineMarkerPosition();
    }
  }, [isPlaying, currentFrame]); // Also run when currentFrame changes during playback

  return (
    <div className="timeline-container bg-background flex flex-col h-full overflow-hidden">
      <TimelineHeader 
        totalDuration={compositionDuration}
        currentTime={currentTime}
        showZoomControls={showZoomControls}
        zoomScale={zoomScale}
        setZoomScale={setZoomScale}
        resetZoom={resetZoom}
        startSliderDrag={startSliderDrag}
        endSliderDrag={endSliderDrag}
        isPlaying={isPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onSeekToStart={onSeekToStart}
        onSeekToEnd={onSeekToEnd}
        showPlaybackControls={showPlaybackControls}
        playbackRate={playbackRate}
        setPlaybackRate={setPlaybackRate}
        autoRemoveEmptyTracks={isAutoRemoveEnabled}
        onToggleAutoRemoveEmptyTracks={handleEnhancedToggleAutoRemoveEmptyTracks}
        splittingEnabled={isSplittingEnabled}
        onToggleSplitting={handleToggleSplitting}
        onSplitAtSelection={handleSplitAtSelection}
        hasSelectedItem={selectedItemIds.length === 1 && isPlayheadOverSelectedItem()}
        selectedItemsCount={selectedItemIds.length}
        showSplitAtSelection={true}
        showUndoRedoControls={showUndoRedoControls}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        aspectRatio={aspectRatio}
        onAspectRatioChange={onAspectRatioChange}
        showAspectRatioControls={showAspectRatioControls}
      />
      
      {/* Tracks container - flex layout with scroll */}
      <div className="timeline-tracks-wrapper flex flex-1 overflow-hidden">
        <div className="hidden md:block overflow-hidden">
          <TimelineTrackHandles 
            tracks={tracks} 
            onTrackReorder={handleTrackReorder}
            onTrackDelete={handleTrackDelete}
            onToggleMagnetic={handleToggleMagnetic}
            enableTrackDrag={enableTrackDrag}
            enableMagneticTrack={enableMagneticTrack}
            enableTrackDelete={enableTrackDelete}
          />
        </div>
        
        <div className="timeline-content flex-1 relative bg-surface overflow-hidden">
          <TimelineContent
            tracks={tracks}
            totalDuration={compositionDuration}
            viewportDuration={viewportDuration}
            currentFrame={currentFrame}
            fps={fps}
            zoomScale={zoomScale}
            onFrameChange={onFrameChange}
            onItemSelect={onItemSelect}
            onDeleteItems={handleCombinedItemsDelete}
            onDuplicateItems={handleExternalItemsDuplicate}
            onSplitItems={handleExternalItemSplit}
            selectedItemIds={selectedItemIds}
            onSelectedItemsChange={onSelectedItemsChange}
            onItemMove={handleCombinedItemMove}
            onItemResize={handleCombinedItemResize}
            timelineRef={timelineRef}
            ghostMarkerPosition={ghostMarkerPosition}
            isDragging={isDragging}
            isContextMenuOpen={isContextMenuOpen}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onInsertTrackAt={handleInsertTrackAt}
            onInsertMultipleTracksAt={handleInsertMultipleTracksAt}
            onCreateTracksWithItems={handleCreateTracksWithItems}
            showTimelineGuidelines={showTimelineGuidelines}
            onContextMenuOpenChange={handleContextMenuOpenChange}
            splittingEnabled={isSplittingEnabled}
            hideItemsOnDrag={effectiveHideItemsOnDrag}
            onNewItemDrop={onNewItemDrop}
          />
        </div>
      </div>
    </div>
  );
});

Timeline.displayName = 'Timeline';

export default Timeline;