import React, { useRef, useCallback } from 'react';
import { TimelineItem as TimelineItemType } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';

import {
  TimelineItemContent,
  TimelineItemResizeHandles,
  TimelineItemSplitLine,
  TimelineItemContextMenu,
  TimelineItemFadeOverlays,
} from './timeline-item/';
import { ContextMenu, ContextMenuTrigger } from '../../ui/context-menu';




interface TimelineItemProps {
  item: TimelineItemType;
  totalDuration: number;
  onSelect?: (itemId: string) => void;
  onSelectionChange?: (itemId: string, isMultiple: boolean) => void; // New prop for multi-selection
  onDragStart?: (
    item: TimelineItemType,
    clientX: number,
    clientY: number,
    action: "move" | "resize-start" | "resize-end",
    selectedItemIds?: string[] // Add selectedItemIds parameter
  ) => void;
  onDeleteItems?: (itemIds: string[]) => void; // Always takes array of item IDs
  onDuplicateItems?: (itemIds: string[]) => void; // Always takes array of item IDs
  onSplitItems?: (itemId: string, splitTime: number) => void; // Callback when item should be split
  selectedItemIds?: string[]; // Array of all selected item IDs
  zoomScale?: number;
  isDragging?: boolean;
  isSelected?: boolean; // Whether this item is currently selected
  onContextMenuOpenChange?: (isOpen: boolean) => void; // New prop for context menu state
  splittingEnabled?: boolean; // Whether splitting mode is enabled
  currentFrame?: number; // Current playhead frame position
  fps?: number; // Frames per second for time conversion
}

export const TimelineItem: React.FC<TimelineItemProps> = ({ 
  item, 
  totalDuration, 
  onSelect,
  onSelectionChange,
  onDragStart,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  isDragging = false,
  isSelected = false,
  onContextMenuOpenChange,
  splittingEnabled = false,
  currentFrame,
  fps = 30,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const duration = item.end - item.start;
  
  // State for splitting mode
  const [splitPosition, setSplitPosition] = React.useState<number | null>(null);
  const [isHovering, setIsHovering] = React.useState(false);

  // State for hover cursor management
  const [isHoveringItem, setIsHoveringItem] = React.useState(false);

  // State to track if video thumbnails are showing (for transparent background)
  const [isShowingVideoThumbnails, setIsShowingVideoThumbnails] = React.useState(false);

  // State to track context menu mouse position for splitting


  // Simplified touch state for immediate drag response
  const [touchStartPosition, setTouchStartPosition] = React.useState<{ x: number; y: number; time: number } | null>(null);

  // Throttle ref for split position updates
  const splitThrottleRef = useRef<number | null>(null);
  const lastSplitPositionRef = useRef<number | null>(null);

  // Use simple percentage calculation since the container already handles zoom scaling
  const leftPercentage = (item.start / totalDuration) * 100;
  const widthPercentage = (duration / totalDuration) * 100;

  // Callback to handle when video thumbnails display state changes
  const handleThumbnailDisplayChange = React.useCallback((isShowingThumbnails: boolean) => {
    setIsShowingVideoThumbnails(isShowingThumbnails);
  }, []);

  // Unified drag start logic for both mouse and touch
  const initiateDragStart = React.useCallback((
    clientX: number, 
    clientY: number, 
    isTouch: boolean = false
  ) => {
    // If splitting mode is enabled, don't handle dragging
    if (splittingEnabled) {
      return;
    }

    if (!onDragStart) {
      onSelect?.(item.id);
      return;
    }

    // Only select the item if it's not already selected (preserves multi-selection)
    // This allows dragging multiple selected items without losing the selection
    if (onSelectionChange && !isSelected) {
      onSelectionChange(item.id, false); // Single selection mode
    } else if (!onSelectionChange && !isSelected) {
      onSelect?.(item.id);
    }

    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeX = clientX - rect.left;
    const itemWidth = rect.width;

    // Determine drag action based on position
    let action: "move" | "resize-start" | "resize-end" = "move";
    
    const resizeHandleWidth = isTouch ? 20 : 12; // Larger touch targets for mobile
    
    // Only detect resize if handles are not visible (multi-selected items)
    const isMultiSelected = isSelected && selectedItemIds.length > 1;
    const handlesVisible = !splittingEnabled && !isMultiSelected && !!onDragStart;
    
    if (!handlesVisible) {
      if (relativeX <= resizeHandleWidth) {
        action = "resize-start";
      } else if (relativeX >= itemWidth - resizeHandleWidth) {
        action = "resize-end";
      }
    }

    onDragStart(item, clientX, clientY, action, selectedItemIds);
  }, [splittingEnabled, onDragStart, onSelect, onSelectionChange, isSelected, item, selectedItemIds]);

  // Simple mouse down handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle left mouse button for drag operations
    if (e.button !== 0) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();

    initiateDragStart(e.clientX, e.clientY, false);
  };

  // Smart touch handlers - immediate drag start but handle taps gracefully
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    if (!touch) return;

    // Record touch start for tap detection
    setTouchStartPosition({ 
      x: touch.clientX, 
      y: touch.clientY, 
      time: Date.now() 
    });

    // Add haptic feedback for better mobile UX
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    // Start drag immediately - the global touch move will handle ghost updates
    initiateDragStart(touch.clientX, touch.clientY, true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0];
    if (touch && touchStartPosition) {
      const deltaX = Math.abs(touch.clientX - touchStartPosition.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosition.y);
      const duration = Date.now() - touchStartPosition.time;
      
      // If it was a quick tap with minimal movement, treat as a click
      if (duration < 150 && deltaX < 5 && deltaY < 5) {
        handleClick(e as any);
      }
    }

    setTouchStartPosition(null);
  };

  // Enhanced click handler for selection with multi-selection support
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Only handle left clicks for selection changes
    if (e.button !== 0) {
      return;
    }
    
    // Handle splitting mode
    if (splittingEnabled && onSplitItems) {
      // Always use cursor position for more predictable splitting behavior
      const rect = itemRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const relativeX = e.clientX - rect.left;
      const itemWidth = rect.width;
      const clickPercentage = Math.max(0, Math.min(1, relativeX / itemWidth)); // Clamp between 0 and 1
      const itemDuration = item.end - item.start;
      const splitTime = item.start + (itemDuration * clickPercentage);
      
      // Reduce minimum segment duration to allow more precise splits
      const minSegmentDuration = 0.016; // ~1 frame at 60fps, much more permissive
      if (splitTime - item.start >= minSegmentDuration && item.end - splitTime >= minSegmentDuration) {
        onSplitItems(item.id, splitTime);
      } else {
        // Provide user feedback for why split was rejected
        console.warn('Split rejected: segments would be too small', {
          leftSegment: splitTime - item.start,
          rightSegment: item.end - splitTime,
          minRequired: minSegmentDuration
        });
      }
      
      return;
    }
    
    const isShiftPressed = e.shiftKey;
    const isCtrlPressed = e.ctrlKey || e.metaKey; // Support both Ctrl and Cmd (Mac)
    
    if (onSelectionChange && (isShiftPressed || isCtrlPressed)) {
      // Multi-selection mode
      onSelectionChange(item.id, true);
    } else {
      // Single selection mode (or fallback to old onSelect)
      if (onSelectionChange) {
        onSelectionChange(item.id, false);
      } else {
        onSelect?.(item.id);
      }
    }
  };

  // Handle context menu (right-click) separately
  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
  
    // Mouse position no longer needed since we split at playhead position
  
    // If this item is not already selected, select it ONLY if it's not part of a multi-selection
    // When right-clicking on an unselected item, we should only select it and clear others
    // When right-clicking on a selected item (especially in multi-selection), preserve selection
    if (!isSelected) {
      if (onSelectionChange) {
        onSelectionChange(item.id, false); // Single selection when right-clicking unselected item
      } else {
        onSelect?.(item.id);
      }
    } else {
      console.log('Right-clicked selected item, preserving current selection');
    }
  };

  const getCursorStyle = (): { className: string; style: React.CSSProperties } => {
    if (splittingEnabled) {
      return { 
        className: "cursor-col-resize", 
        style: { cursor: "col-resize" } 
      };
    }
    if (!onDragStart) {
      return { 
        className: "cursor-pointer", 
        style: { cursor: "pointer" } 
      };
    }
    
    // Use grabbing cursor when hovering for better feedback
    const cursor = isHoveringItem ? "grabbing" : "grab";
    return { 
      className: `cursor-grab hover:cursor-grabbing`, 
      style: { cursor } 
    };
  };

  const handleDelete = () => {    
    // If this item is part of a multi-selection, delete all selected items
    if (isSelected && selectedItemIds.length > 1) {
      onDeleteItems?.(selectedItemIds);
    } else {
      // Single item delete - still pass as array for consistency
      onDeleteItems?.([item.id]);
    }
  };

  const handleDuplicate = () => {
    // If this item is part of a multi-selection, duplicate all selected items
    if (isSelected && selectedItemIds.length > 1) {
      onDuplicateItems?.(selectedItemIds);
    } else {
      // Single item duplicate - still pass as array for consistency
      onDuplicateItems?.([item.id]);
    }
  };

  const handleSplit = () => {
    if (!onSplitItems || !currentFrame || !fps) return;
    
    // Use current playhead position instead of mouse cursor
    const currentTimeInSeconds = currentFrame / fps;
    
    // Check if the current playhead is within the item's time range
    if (currentTimeInSeconds < item.start || currentTimeInSeconds > item.end) {
      console.warn('Current playhead is not within the item\'s time range');
      return;
    }
    
    // Check minimum segment duration
    const minSegmentDuration = 0.016; // ~1 frame at 60fps
    const leftSegmentDuration = currentTimeInSeconds - item.start;
    const rightSegmentDuration = item.end - currentTimeInSeconds;
    
    if (leftSegmentDuration >= minSegmentDuration && rightSegmentDuration >= minSegmentDuration) {
      onSplitItems(item.id, currentTimeInSeconds);
    } else {
      console.warn('Split rejected: segments would be too small', {
        leftSegment: leftSegmentDuration,
        rightSegment: rightSegmentDuration,
        minRequired: minSegmentDuration
      });
    }
    
    // Mouse position no longer needed
  };

  // Enhanced mouse move handler for splitting mode (throttled)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!splittingEnabled || !itemRef.current) return;
    
    // Cancel previous throttled call
    if (splitThrottleRef.current) {
      cancelAnimationFrame(splitThrottleRef.current);
    }
    
    // Throttle using requestAnimationFrame for smooth updates
    splitThrottleRef.current = requestAnimationFrame(() => {
      if (!itemRef.current) return;
      
      const rect = itemRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
      
      // Only update if position has changed significantly (reduce unnecessary renders)
      if (lastSplitPositionRef.current === null || Math.abs(percentage - lastSplitPositionRef.current) > 0.5) {
        setSplitPosition(percentage);
        lastSplitPositionRef.current = percentage;
      }
    });
  }, [splittingEnabled]);

  // Handle resize handle mouse down events
  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>, position: 'left' | 'right') => {
    // Only handle left mouse button for resize operations
    if (e.button !== 0) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();

    if (!onDragStart) {
      return;
    }

    // Select the item if it's not already selected (preserves multi-selection)
    if (onSelectionChange && !isSelected) {
      onSelectionChange(item.id, false); // Single selection mode
    } else if (!onSelectionChange && !isSelected) {
      onSelect?.(item.id);
    }

    // Map resize handle position to drag action
    const action = position === 'left' ? 'resize-start' : 'resize-end';
    
    onDragStart(item, e.clientX, e.clientY, action, selectedItemIds);
  };

  // Handle resize handle touch start events
  const handleResizeTouchStart = (e: React.TouchEvent<HTMLDivElement>, position: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();

    if (!onDragStart) {
      return;
    }

    // Select the item if it's not already selected (preserves multi-selection)
    if (onSelectionChange && !isSelected) {
      onSelectionChange(item.id, false); // Single selection mode
    } else if (!onSelectionChange && !isSelected) {
      onSelect?.(item.id);
    }

    // Map resize handle position to drag action
    const action = position === 'left' ? 'resize-start' : 'resize-end';
    
    // Use the first touch point for coordinates
    const touch = e.touches[0];
    if (touch) {
      onDragStart(item, touch.clientX, touch.clientY, action, selectedItemIds);
    }
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
    setIsHoveringItem(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setIsHoveringItem(false);
    
    // Cancel any pending throttled updates
    if (splitThrottleRef.current) {
      cancelAnimationFrame(splitThrottleRef.current);
      splitThrottleRef.current = null;
    }
    
    setSplitPosition(null);
    lastSplitPositionRef.current = null;
  };

  // Determine context menu text based on selection
  const isMultiSelection = isSelected && selectedItemIds.length > 1;
  const deleteText = isMultiSelection ? `Delete ${selectedItemIds.length} items` : 'Delete';
  const duplicateText = isMultiSelection ? `Duplicate ${selectedItemIds.length} items` : 'Duplicate';
  
  // Show split option only for single items (not multi-selection) and when playhead is over the item
  const isPlayheadOverItem = currentFrame && fps ? 
    (currentFrame / fps >= item.start && currentFrame / fps <= item.end) : false;
  const showSplitOption = !isMultiSelection && !!onSplitItems && isPlayheadOverItem;

  // Extract fade values from item data (for audio/sound items)
  const fadeIn = item.data?.styles?.fadeIn ?? 0;
  const fadeOut = item.data?.styles?.fadeOut ?? 0;

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          ref={itemRef}
          className={`timeline-item group absolute top-1/2 transform -translate-y-1/2 rounded flex items-center justify-center text-xs font-light text-white shadow-sm hover:shadow-md transition-shadow select-none overflow-hidden touch-none ${getCursorStyle().className} ${isSelected ? 'border-2 dark:border-white border-black' : 'border border-white/20'}`}
          style={{
            left: `${leftPercentage}%`,
            width: `${widthPercentage}%`,
            height: `${TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT}px`,
            backgroundColor: isShowingVideoThumbnails ? 'transparent' : (item.color || '#3b82f6'),
            opacity: isDragging  ? 0.5 : 1,
            userSelect: 'none',
            ...getCursorStyle().style,
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <TimelineItemResizeHandles 
            onDragStart={!!onDragStart}
            splittingEnabled={splittingEnabled}
            isHovering={isHovering}
            isSelected={isSelected}
            isDragging={isDragging}
            isMultiSelected={isSelected && selectedItemIds.length > 1}
            onMouseDown={handleResizeMouseDown}
            onTouchStart={handleResizeTouchStart}
          />
          
          <TimelineItemContent 
            label={item.label}
            type={item.type}
            data={item.data}
            start={item.start}
            end={item.end}
            mediaStart={item.mediaStart}
            mediaEnd={item.mediaEnd}
            isHovering={isHovering} // Pass hover state to content
            itemId={item.id} // Pass item ID to check for resize operations
            onThumbnailDisplayChange={handleThumbnailDisplayChange} // Pass callback to detect thumbnail display
            currentFrame={currentFrame}
            fps={fps}
          />

          {/* Fade overlays for audio/sound items */}
          <TimelineItemFadeOverlays 
            fadeIn={fadeIn}
            fadeOut={fadeOut}
            duration={duration}
          />
          
          <TimelineItemSplitLine 
            splittingEnabled={splittingEnabled}
            isHovering={isHovering}
            splitPosition={splitPosition}
          />
        </div>
      </ContextMenuTrigger>
      
      <TimelineItemContextMenu 
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onSplit={handleSplit}
        onDuplicateItems={onDuplicateItems}
        onDeleteItems={onDeleteItems}
        onSplitItems={onSplitItems}
        duplicateText={duplicateText}
        deleteText={deleteText}
        showSplit={showSplitOption}
      />
    </ContextMenu>
  );
};