import React, { useCallback, useEffect } from 'react';
import { TimelineMarkers, TimelineTrack, TimelineGhostMarker, TimelineMarker, TimelineGuidelines } from './';
import { TimelineGhostElement } from './timeline-ghost-element';
import { TimelineMarqueeSelection } from './timeline-marquee-selection';
import { TimelineInsertionLine } from './timeline-insertion-line';
import { TimelineContentProps } from '../types';
import { getTimelineContentStyles } from '../utils';
import { useTimelineDragAndDrop } from '../hooks/use-timeline-drag-and-drop';
import { useNewItemDrag } from '../hooks/use-new-item-drag';
import { useMarqueeSelection } from '../hooks/use-marquee-selection';
import useTimelineStore from '../stores/use-timeline-store';
import { createPortal } from 'react-dom';
import { TIMELINE_CONSTANTS } from '../constants';

/**
 * Timeline content area component that contains all the zoomable timeline elements
 * Separated from main Timeline component for better organization
 */
export const TimelineContent: React.FC<TimelineContentProps> = ({
  tracks,
  viewportDuration,
  currentFrame,
  fps,
  zoomScale,
  onFrameChange,
  onItemSelect,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  onSelectedItemsChange,
  onItemMove,
  onItemResize,
  onNewItemDrop,
  timelineRef,
  ghostMarkerPosition,
  isContextMenuOpen,
  onMouseMove,
  onMouseLeave,
  onInsertTrackAt,
  onInsertMultipleTracksAt,
  onCreateTracksWithItems,
  showTimelineGuidelines = true,
  onContextMenuOpenChange,
  splittingEnabled = false,
  hideItemsOnDrag = false,
}) => {
  const currentTime = currentFrame / fps;

  // Get state from timeline store
  const {
    draggedItem,
    ghostElement,
    floatingGhost,
    isValidDrop,
    isDragging: isDraggingStore,
    isPlayheadDragging,
    setTimelineRef,
    setIsPlayheadDragging,
    insertionIndex,
    setInsertionIndex,
    currentDragPosition,
  } = useTimelineStore();

  // Use store's isDragging state instead of prop
  const isDragging = isDraggingStore || !!draggedItem;

  // Set the timeline ref in the store
  useEffect(() => {
    if (timelineRef) {
      setTimelineRef(timelineRef);
    }
  }, [timelineRef, setTimelineRef]);

  // Initialize drag and drop functionality
  const { handleDragStart, handleDrag, handleDragEnd } = useTimelineDragAndDrop({
    totalDuration: viewportDuration,
    tracks,
    onItemMove,
    onItemResize,
    timelineRef,
    onInsertTrackAt,
    onInsertMultipleTracksAt,
    onCreateTracksWithItems,
    selectedItemIds,
  });

  // Initialize new item drag functionality
  const {
    handleNewItemDragOver,
    handleNewItemDragEnd,
    handleNewItemDragLeave,
    handleNewItemDrop,
    clearNewItemDragState,
  } = useNewItemDrag({
    timelineRef,
    totalDuration: viewportDuration,
    tracks,
    onNewItemDrop,
  });

  // Initialize marquee selection
  const {
    isMarqueeSelecting,
    marqueeStartPoint,
    marqueeEndPoint,
    handleTimelineMouseDown: marqueeHandleTimelineMouseDown,
    handleMarqueeMouseMove,
    handleMarqueeMouseUp,
  } = useMarqueeSelection({
    timelineRef,
    tracks,
    totalDuration: viewportDuration,
    selectedItemIds,
    onSelectedItemsChange: onSelectedItemsChange || (() => {}),
    isDragging,
    isContextMenuOpen,
  });

  // Global mouse handlers for outside timeline drag detection
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Only handle left mouse button drag events
      if (e.button !== 0 && e.buttons !== 1) return;
      
      // Check if mouse is outside timeline bounds
      const timelineRect = timelineRef?.current?.getBoundingClientRect();
      if (!timelineRect) return;

      const isOutsideTimeline = (
        e.clientX < timelineRect.left ||
        e.clientX > timelineRect.right ||
        e.clientY < timelineRect.top ||
        e.clientY > timelineRect.bottom
      );

      if (isOutsideTimeline) {
        // Still call handleDrag to maintain drag state, but with clamped coordinates
        const clampedX = Math.max(timelineRect.left, Math.min(timelineRect.right, e.clientX));
        const clampedY = Math.max(timelineRect.top, Math.min(timelineRect.bottom, e.clientY));
        handleDrag(clampedX, clampedY);
      } else {
        // Normal drag handling when inside timeline
        handleDrag(e.clientX, e.clientY);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Only handle left mouse button releases
      if (e.button !== 0) return;
      
      // Auto-trigger drag end when mouse is released anywhere
      handleDragEnd();
    };

    // Touch event handlers for global touch drag operations
    const handleGlobalTouchMove = (e: TouchEvent) => {
      // Prevent default scrolling during drag operations
      e.preventDefault();
      
      const touch = e.touches[0];
      if (!touch) return;
      
      // Check if touch is outside timeline bounds
      const timelineRect = timelineRef?.current?.getBoundingClientRect();
      if (!timelineRect) return;

      const isOutsideTimeline = (
        touch.clientX < timelineRect.left ||
        touch.clientX > timelineRect.right ||
        touch.clientY < timelineRect.top ||
        touch.clientY > timelineRect.bottom
      );

      if (isOutsideTimeline) {
        // Still call handleDrag to maintain drag state, but with clamped coordinates
        const clampedX = Math.max(timelineRect.left, Math.min(timelineRect.right, touch.clientX));
        const clampedY = Math.max(timelineRect.top, Math.min(timelineRect.bottom, touch.clientY));
        handleDrag(clampedX, clampedY);
      } else {
        // Normal drag handling when inside timeline
        handleDrag(touch.clientX, touch.clientY);
      }
    };

    const handleGlobalTouchEnd = () => {
      // Auto-trigger drag end when touch is released anywhere
      handleDragEnd();
    };

    // Prevent right-click from interfering with drag state
    const handleGlobalContextMenu = () => {
      // Don't prevent default here - let the context menu show
      // Just ensure we don't interfere with the drag state
    };

    // Add global listeners for both mouse and touch
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd);
    document.addEventListener('contextmenu', handleGlobalContextMenu);

    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
      document.removeEventListener('contextmenu', handleGlobalContextMenu);
    };
  }, [isDragging, handleDrag, handleDragEnd, timelineRef]);

  // Enhanced mouse move handler that combines original behavior with drag handling
  const enhancedMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Call original mouse move handler
      onMouseMove?.(e);
      
      // Handle marquee selection (drag handling is now done globally)
      handleMarqueeMouseMove(e);
    },
    [onMouseMove, handleMarqueeMouseMove]
  );

  // Enhanced touch move handler for timeline interactions
  const enhancedTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Only handle marquee selection if we're not currently dragging items
      if (!isDragging) {
        // Convert touch event to mouse-like event for marquee selection
        const touch = e.touches[0];
        if (touch) {
          const syntheticMouseEvent = {
            ...e,
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0,
            buttons: 1,
            movementX: 0,
            movementY: 0,
            pageX: touch.pageX,
            pageY: touch.pageY,
            screenX: touch.screenX,
            screenY: touch.screenY,
            offsetX: 0,
            offsetY: 0,
          } as unknown as React.MouseEvent<HTMLDivElement>;
          
          handleMarqueeMouseMove(syntheticMouseEvent);
        }
      }
    },
    [isDragging, handleMarqueeMouseMove]
  );

  // Enhanced mouse up handler
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Handle marquee selection first
      const marqueeHandled = handleMarqueeMouseUp(e);
      console.log('marqueeHandled', marqueeHandled);
      // Drag end is now handled globally, so we don't need to handle it here
    },
    [handleMarqueeMouseUp]
  );

  // Enhanced touch end handler
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Convert touch event to mouse-like event for marquee selection
      if (!isDragging && e.changedTouches[0]) {
        const touch = e.changedTouches[0];
        const syntheticMouseEvent = {
          ...e,
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0,
          buttons: 1,
          movementX: 0,
          movementY: 0,
          pageX: touch.pageX,
          pageY: touch.pageY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          offsetX: 0,
          offsetY: 0,
        } as unknown as React.MouseEvent<HTMLDivElement>;
        
        handleMarqueeMouseUp(syntheticMouseEvent);
      }
    },
    [isDragging, handleMarqueeMouseUp]
  );

  // Enhanced mouse down handler for marquee selection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      marqueeHandleTimelineMouseDown(e);
    },
    [marqueeHandleTimelineMouseDown]
  );

  // Enhanced touch start handler for marquee selection
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Prevent default to avoid scrolling during interactions
      e.preventDefault();
      
      // Convert touch event to mouse-like event for marquee selection
      const touch = e.touches[0];
      if (touch) {
        const syntheticMouseEvent = {
          ...e,
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0,
          buttons: 1,
          movementX: 0,
          movementY: 0,
          pageX: touch.pageX,
          pageY: touch.pageY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          offsetX: 0,
          offsetY: 0,
        } as unknown as React.MouseEvent<HTMLDivElement>;
        
        marqueeHandleTimelineMouseDown(syntheticMouseEvent);
      }
    },
    [marqueeHandleTimelineMouseDown]
  );

  // Synchronize horizontal scroll position to markers overlay
  useEffect(() => {
    const markersWrapper = document.querySelector('.timeline-markers-wrapper');
    const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container');
    const markersOverlay = document.querySelector('.timeline-markers-overlay-content');
    
    if (!markersWrapper || !tracksScrollContainer || !markersOverlay) return;

    const syncScroll = () => {
      const scrollLeft = (markersWrapper as HTMLElement).scrollLeft || (tracksScrollContainer as HTMLElement).scrollLeft;
      (markersOverlay as HTMLElement).style.transform = `translateX(-${scrollLeft}px)`;
    };

    // Initial sync
    syncScroll();

    // Listen to scroll events from both containers
    markersWrapper.addEventListener('scroll', syncScroll);
    tracksScrollContainer.addEventListener('scroll', syncScroll);

    return () => {
      markersWrapper.removeEventListener('scroll', syncScroll);
      tracksScrollContainer.removeEventListener('scroll', syncScroll);
    };
  }, []);

  // Timeline-level drop handler for new items
  const handleTimelineDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      // Check if this is a new item drag
      try {
        const dragDataString = e.dataTransfer.getData("application/json");
        if (dragDataString) {
          const dragData = JSON.parse(dragDataString);

          if (dragData.isNewItem || dragData.type) {
            // Calculate drop position
            const timelineRect = timelineRef?.current?.getBoundingClientRect();
            if (timelineRect) {
              const relativeX = e.clientX - timelineRect.left;
              const relativeY = e.clientY - timelineRect.top;
              
              const leftPercentage = Math.max(
                0,
                Math.min(100, (relativeX / timelineRect.width) * 100)
              );
              const dropTime = (leftPercentage / 100) * viewportDuration;

              // Calculate track index
              // NOTE: Markers are now in a separate container, so relativeY is already relative to tracks
              const adjustedY = Math.max(0, relativeY);
              const trackHeight = TIMELINE_CONSTANTS.TRACK_HEIGHT;
              const targetTrackIndex = Math.max(
                0,
                Math.min(tracks.length - 1, Math.floor(adjustedY / trackHeight))
              );

              // If between tracks, insertionIndex will be set. Prefer inserting a new track
              if (insertionIndex !== null && onInsertTrackAt) {
                onInsertTrackAt(insertionIndex);
                // Drop onto the new track
                handleNewItemDrop(
                  dragData.type || 'clip',
                  insertionIndex,
                  dropTime,
                  dragData
                );
                setInsertionIndex(null);
                clearNewItemDragState();
                return;
              }

              handleNewItemDrop(
                dragData.type || 'clip',
                targetTrackIndex,
                dropTime,
                dragData
              );
            }
          }
        }
      } catch (error) {
        console.warn("Failed to parse drag data:", error);
      }

      // Clear drag state
      clearNewItemDragState();
      setInsertionIndex(null);
    },
    [clearNewItemDragState, tracks.length, viewportDuration, handleNewItemDrop, timelineRef, insertionIndex, onInsertTrackAt, setInsertionIndex]
  );

  return (
    <div 
      className="flex flex-col h-full overflow-hidden relative"
      style={{
        // Initialize CSS custom properties for ghost marker and timeline marker at root level so overlay can access them
        '--ghost-marker-position': '0%',
        '--ghost-marker-visible': '0',
        '--timeline-marker-position': undefined, // Will be set by clicks, otherwise use calculated position
      } as React.CSSProperties}
    >
      {/* Fixed Markers at the top - horizontal scroll only */}
      <div className="timeline-markers-wrapper overflow-x-auto overflow-y-hidden scrollbar-hide flex-shrink-0">
        <div 
          className="timeline-markers-content"
          style={{
            ...getTimelineContentStyles(zoomScale),
          }}
          onMouseMove={enhancedMouseMove}
          onMouseLeave={onMouseLeave}
        >
          <TimelineMarkers
            totalDuration={viewportDuration}
            onTimeClick={(timeInSeconds: number) => {
              const frame = Math.round(timeInSeconds * fps);
              onFrameChange?.(frame);
            }}
            onDragStateChange={setIsPlayheadDragging}
            zoomScale={zoomScale}
          />
        </div>
      </div>

      {/* Scrollable tracks area - both horizontal and vertical scroll */}
      <div 
        className="timeline-tracks-scroll-container flex-1 scrollbar-hide " 
        style={{ 
          overflowY: 'auto', 
          overflowX: 'auto', 
        }}
      >
        <div 
          ref={timelineRef}
          className="timeline-zoomable-content relative"
          style={{
            ...getTimelineContentStyles(zoomScale),
            minHeight: 'fit-content',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={enhancedMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={onMouseLeave}
          onDragOver={handleNewItemDragOver}
          onDragEnd={handleNewItemDragEnd}
          onDragLeave={handleNewItemDragLeave}
          onDrop={handleTimelineDrop}
          onTouchStart={handleTouchStart}
          onTouchMove={enhancedTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="timeline-tracks-container">
            {tracks.map((track, index) => {
            // Find all ghost elements that belong to this track
            const trackGhostElements = ghostElement?.filter(ghost => {
              // Use the same calculation as ghost creation to avoid floating-point precision issues
              // Ghost creation: trackIndex * (100 / tracks.length) = ghost.top
              // So: trackIndex = ghost.top / (100 / tracks.length) = ghost.top * tracks.length / 100
              const calculatedIndex = Math.round(ghost.top * tracks.length / 100);
              
              return calculatedIndex === index;
            }) || [];

            return (
              <TimelineTrack
                key={track.id}
                track={track}
                trackIndex={index}
                trackCount={tracks.length}
                totalDuration={viewportDuration}
                onItemSelect={onItemSelect}
                onDeleteItems={onDeleteItems}
                onDuplicateItems={onDuplicateItems}
                onSplitItems={onSplitItems}
                selectedItemIds={selectedItemIds}
                onSelectedItemsChange={onSelectedItemsChange}
                onItemMove={onItemMove}
                onDragStart={handleDragStart}
                zoomScale={zoomScale}
                isDragging={isDragging}
                draggedItemId={draggedItem?.id}
                ghostElements={trackGhostElements}
                isValidDrop={isValidDrop}
                onContextMenuOpenChange={onContextMenuOpenChange}
                splittingEnabled={splittingEnabled}
                hideItemsOnDrag={hideItemsOnDrag}
                currentFrame={currentFrame}
                fps={fps}
              />
            );
          })}
          </div>

          {/* Timeline Guidelines */}
          {showTimelineGuidelines && (
            <TimelineGuidelines
              tracks={tracks}
              totalDuration={viewportDuration}
              isDragging={isDragging}
              draggedItemId={draggedItem?.id}
              currentDragPosition={currentDragPosition}
            />
          )}

          {/* Insertion indicator (between tracks) */}
          <TimelineInsertionLine
            insertionIndex={insertionIndex}
            trackCount={tracks.length}
          />
          
          {/* Marquee Selection */}
          <TimelineMarqueeSelection
            isMarqueeSelecting={isMarqueeSelecting}
            marqueeStartPoint={marqueeStartPoint}
            marqueeEndPoint={marqueeEndPoint}
          />
        </div>
      </div>
      
      {/* Markers overlay - spans both markers and tracks sections */}
      <div 
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 45 }}
      >
        {/* Wrapper to handle horizontal scrolling alignment - matches zoomable content width */}
        <div 
          className="timeline-markers-overlay-content h-full relative"
          style={{
            ...getTimelineContentStyles(zoomScale),
          }}
        >
          {/* Current Frame Marker - spans full height */}
          <TimelineMarker
            currentFrame={currentFrame}
            totalDurationInFrames={Math.ceil(viewportDuration * fps)}
            zoomScale={zoomScale}
            fps={fps}
            totalDuration={viewportDuration}
          />
          
          {/* Ghost Marker - spans full height */}
          <TimelineGhostMarker
            position={ghostMarkerPosition}
            isDragging={isDragging || isPlayheadDragging}
            isContextMenuOpen={isContextMenuOpen}
            isScrubbing={false}
            isSplittingEnabled={splittingEnabled}
            totalDuration={viewportDuration}
            currentTime={currentTime}
            zoomScale={zoomScale}
          />
        </div>
      </div>
      
      {/* Floating Ghost Element - rendered outside container to avoid clipping */}
      {floatingGhost && createPortal(
        <TimelineGhostElement
          ghostElement={{
            left: 0, // Not used in floating mode
            width: floatingGhost.width,
            top: 0, // Not used in floating mode
          }}
          rowIndex={0} // Not used in floating mode
          trackCount={tracks.length}
          isValidDrop={floatingGhost.isValid}
          isFloating={true}
          floatingPosition={floatingGhost.position}
          itemData={floatingGhost.itemData}
        />,
        document.body
      )}
    </div>
  );
}; 